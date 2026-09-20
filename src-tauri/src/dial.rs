use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use socket2::{Domain, Protocol, Socket, Type};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

const MEDIA_LABEL: &str = "media";
const DIAL_EVENT: &str = "lalin-cast-dial-request";
/// App-wide event carrying [`DialStatus`], emitted on every state
/// transition (including the first one, from [`start`]). Consumed by
/// `tray.rs` (tooltip) and read on demand via [`current_status`] /
/// [`read_status`] by the setup/status windows.
pub const DIAL_STATUS_EVENT: &str = "lalin-cast-dial-status";
const SSDP_ADDRESS: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 102_400;
const RESPONSE_WAIT: Duration = Duration::from_secs(5);
const SUPERVISOR_POLL: Duration = Duration::from_secs(1);
const REBIND_DELAY: Duration = Duration::from_secs(2);
/// Shared by the SSDP `SERVER` header and (informally) the DIAL `APP_AGENT`
/// identity; see the H0 constants table.
const APP_AGENT: &str = concat!("Windows/10 UPnP/1.0 LalinCast/", env!("CARGO_PKG_VERSION"));
const MANUFACTURER: &str = "Lalin";
const MODEL_NAME: &str = "Lalin Cast";
const DEFAULT_FRIENDLY_NAME: &str = "Lalin Cast";
const FRIENDLY_NAME_MAX_CHARS: usize = 64;
/// Also used by `settings.rs` to persist a validated `dialFriendlyName`
/// under the same store key this module reads on every rebind.
pub(crate) const FRIENDLY_NAME_STORE_KEY: &str = "dialFriendlyName";

/// Not exposed to any window: earlier builds had a `dial_get_info` command
/// returning this, but nothing in the shipped UI ever called it and the
/// command carried no permission check, so wave 3 removed it. Kept as a
/// plain internal struct — the supervisor and its tests still need it.
#[derive(Clone)]
struct DialInfo {
    host: String,
    port: u16,
    base: String,
}

/// One state in the DIAL status machine. `starting` = a bind/rebind is in
/// progress, `ready` = both the SSDP and HTTP listeners are up, `degraded` =
/// a listener died and the supervisor is retrying, `disabled` = [`start`]
/// itself failed permanently (the supervisor thread could not be spawned).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DialStateKind {
    Starting,
    Ready,
    Degraded,
    Disabled,
}

/// Payload of [`DIAL_STATUS_EVENT`] and the return type of
/// [`current_status`]/[`read_status`]. `message` is always human-readable
/// and never carries a hostname, interface name, or other PII (see
/// PRIVACY.md).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialStatus {
    pub state: DialStateKind,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub message: Option<String>,
}

fn starting_status(message: Option<String>) -> DialStatus {
    DialStatus {
        state: DialStateKind::Starting,
        host: None,
        port: None,
        message,
    }
}

fn ready_status(info: &DialInfo) -> DialStatus {
    DialStatus {
        state: DialStateKind::Ready,
        host: Some(info.host.clone()),
        port: Some(info.port),
        message: None,
    }
}

fn degraded_status(message: String) -> DialStatus {
    DialStatus {
        state: DialStateKind::Degraded,
        host: None,
        port: None,
        message: Some(message),
    }
}

fn disabled_status(message: String) -> DialStatus {
    DialStatus {
        state: DialStateKind::Disabled,
        host: None,
        port: None,
        message: Some(message),
    }
}

/// Pure decision used by [`emit_status`]: whether `new` differs from
/// `current` and should therefore replace it and be (re-)emitted. Kept
/// separate from the emitting side (which needs a live `AppHandle`) so the
/// no-op-on-repeat behavior is unit-testable without a Tauri app.
fn status_changed(current: &DialStatus, new: &DialStatus) -> bool {
    current != new
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DialRequest {
    request_id: String,
    method: String,
    path: String,
    body: String,
    host: String,
}

struct PendingResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

type ResponseStore = Arc<(Mutex<HashMap<String, PendingResponse>>, Condvar)>;

pub struct DialState {
    device_id: Arc<Mutex<String>>,
    responses: ResponseStore,
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<DialStatus>>,
    /// Set by [`request_reload`] and consumed by the supervisor loop (see
    /// [`run_supervisor`]): tearing the current generation down and binding
    /// a fresh one re-reads `dialFriendlyName` from the settings store, so
    /// this is how a rename in Settings reaches the LAN without a restart.
    reload: Arc<AtomicBool>,
}

/// Reads the current [`DialStatus`] out of a managed [`DialState`]. Used by
/// the `setup`/`status` commands (via [`read_status`], which additionally
/// tolerates `DialState` not being managed yet).
pub fn current_status(state: &DialState) -> DialStatus {
    state
        .status
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_else(|_| disabled_status("DIAL status is unavailable".to_owned()))
}

/// Convenience for callers that only have an `AppHandle` (no `State<'_,
/// DialState>` extraction available), such as the setup window's auto-open
/// timer. Falls back to a `starting` status if `DialState` is not managed
/// yet, which can only happen for the brief window between `run()`'s
/// `setup` hook starting and `dial::start` returning.
pub fn read_status(app: &AppHandle) -> DialStatus {
    match app.try_state::<DialState>() {
        Some(state) => current_status(&state),
        None => starting_status(None),
    }
}

struct HttpRequest {
    method: String,
    path: String,
    body: String,
}

/// Built when [`start`] itself fails (the supervisor thread could not be
/// spawned): DIAL is permanently off for this run. Emits the `disabled`
/// transition so the tray/setup window reflect it immediately.
pub fn disabled_state(app: &AppHandle, reason: impl Into<String>) -> DialState {
    let status = disabled_status(reason.into());
    let _ = app.emit(DIAL_STATUS_EVENT, &status);
    DialState {
        device_id: Arc::new(Mutex::new(String::new())),
        responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
        stop: Arc::new(AtomicBool::new(true)),
        status: Arc::new(Mutex::new(status)),
        reload: Arc::new(AtomicBool::new(false)),
    }
}

pub fn start(app: &AppHandle) -> Result<DialState, String> {
    let device_id = Arc::new(Mutex::new(load_or_create_device_id(app)));
    let responses = Arc::new((Mutex::new(HashMap::new()), Condvar::new()));
    let stop = Arc::new(AtomicBool::new(false));
    // Emitted here (not only once the supervisor's loop starts binding) so
    // the very first `lalin-cast-dial-status` event fires as soon as
    // `start()` is called, per the contract.
    let initial_status = starting_status(None);
    let status = Arc::new(Mutex::new(initial_status.clone()));
    let _ = app.emit(DIAL_STATUS_EVENT, &initial_status);
    let reload = Arc::new(AtomicBool::new(false));

    let supervisor = SupervisorState {
        app: app.clone(),
        device_id: device_id.clone(),
        responses: responses.clone(),
        stop: stop.clone(),
        status: status.clone(),
        reload: reload.clone(),
    };
    thread::Builder::new()
        .name("lalin-dial-supervisor".to_owned())
        .spawn(move || run_supervisor(supervisor))
        .map_err(|error| format!("DIAL supervisor thread failed: {error}"))?;

    Ok(DialState {
        device_id,
        responses,
        stop,
        status,
        reload,
    })
}

/// Signals the DIAL supervisor to tear down the current listener generation
/// and bind a fresh one on its next poll tick (within [`SUPERVISOR_POLL`]),
/// so a `dialFriendlyName` change saved to the settings store is advertised
/// on the LAN without an app restart. Called from `settings::settings_set`
/// after the new name is persisted. A no-op if DIAL never started (no
/// supervisor loop is running to observe the flag) — safe to call
/// regardless of the current [`DialStateKind`].
pub fn request_reload(state: &DialState) {
    state.reload.store(true, Ordering::Relaxed);
}

impl Drop for DialState {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

struct SupervisorState {
    app: AppHandle,
    device_id: Arc<Mutex<String>>,
    responses: ResponseStore,
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<DialStatus>>,
    reload: Arc<AtomicBool>,
}

/// Updates the stored [`DialStatus`] and emits [`DIAL_STATUS_EVENT`], but
/// only when the new status actually differs from the current one (see
/// [`status_changed`]) — so a supervisor loop iteration that does not
/// change state never spams a duplicate event.
fn emit_status(app: &AppHandle, status_lock: &Arc<Mutex<DialStatus>>, new_status: DialStatus) {
    let should_emit = match status_lock.lock() {
        Ok(mut guard) => {
            let changed = status_changed(&guard, &new_status);
            if changed {
                *guard = new_status.clone();
            }
            changed
        }
        // Poisoned: still emit so the UI is not left showing a stale state
        // forever, but do not try to update the (now-unreliable) guard.
        Err(_) => true,
    };
    if should_emit {
        let _ = app.emit(DIAL_STATUS_EVENT, &new_status);
    }
}

#[derive(Clone, Copy)]
enum ListenerKind {
    Http,
    Ssdp,
}

struct ListenerFailure {
    generation: u64,
    kind: ListenerKind,
    message: String,
}

struct Generation {
    id: u64,
    info: DialInfo,
    stop: Arc<AtomicBool>,
    http: JoinHandle<()>,
    ssdp: JoinHandle<()>,
}

#[derive(Clone)]
struct RuntimeState {
    info: DialInfo,
    device_id: Arc<Mutex<String>>,
    friendly_name: String,
    responses: ResponseStore,
    stop: Arc<AtomicBool>,
    failure_tx: Sender<ListenerFailure>,
    generation_id: u64,
}

#[tauri::command]
pub fn dial_respond(
    request_id: String,
    status: u16,
    headers: Vec<(String, String)>,
    body: Option<String>,
    state: State<'_, DialState>,
) -> Result<(), String> {
    if !(100..=599).contains(&status) {
        return Err("DIAL response status is invalid".to_owned());
    }
    if request_id.len() > 128 {
        return Err("DIAL request id is too long".to_owned());
    }
    if headers.len() > 32 {
        return Err("DIAL response has too many headers".to_owned());
    }
    for (key, value) in &headers {
        if key.is_empty()
            || key.len() > 128
            || value.len() > 4096
            || key.contains(['\r', '\n'])
            || value.contains(['\r', '\n'])
        {
            return Err("DIAL response header is invalid".to_owned());
        }
    }

    let body = body.unwrap_or_default().into_bytes();
    if body.len() > MAX_BODY_BYTES {
        return Err("DIAL response body is too large".to_owned());
    }

    let (responses, wake) = &*state.responses;
    let mut pending = responses
        .lock()
        .map_err(|_| "DIAL response store is unavailable".to_owned())?;
    if !pending.contains_key(&request_id) {
        return Err("DIAL request has expired".to_owned());
    }
    pending.insert(
        request_id,
        PendingResponse {
            status,
            headers,
            body,
        },
    );
    wake.notify_all();
    Ok(())
}

#[tauri::command]
pub fn dial_set_device_id(
    device_id: String,
    app: AppHandle,
    state: State<'_, DialState>,
) -> Result<(), String> {
    if device_id.is_empty() || device_id.len() > 128 || device_id.contains(['\r', '\n', '<', '>']) {
        return Err("DIAL device id is invalid".to_owned());
    }
    let mut current = state
        .device_id
        .lock()
        .map_err(|_| "DIAL device identity is unavailable".to_owned())?;
    if *current != device_id {
        *current = device_id.clone();
        persist_device_id(&app, &device_id);
    }
    Ok(())
}

fn run_supervisor(runtime: SupervisorState) {
    let (failure_tx, failure_rx): (Sender<ListenerFailure>, Receiver<ListenerFailure>) =
        mpsc::channel();
    let mut generation: Option<Generation> = None;
    let mut generation_id = 0_u64;

    while !runtime.stop.load(Ordering::Relaxed) {
        if generation.is_some() {
            let active_id = generation
                .as_ref()
                .map(|active| active.id)
                .unwrap_or_default();
            let active_host = generation
                .as_ref()
                .map(|active| active.info.host.clone())
                .unwrap_or_default();
            let current_ip = local_ipv4().ok();

            if runtime.reload.swap(false, Ordering::Relaxed) {
                eprintln!("Lalin Cast: DIAL reload requested; rebinding listeners");
                stop_generation(generation.take());
                emit_status(
                    &runtime.app,
                    &runtime.status,
                    starting_status(Some("settings changed; rebinding".to_owned())),
                );
                continue;
            }

            if address_changed(&active_host, current_ip) {
                eprintln!("Lalin Cast: DIAL LAN address changed; rebinding listeners");
                stop_generation(generation.take());
                emit_status(
                    &runtime.app,
                    &runtime.status,
                    starting_status(Some("LAN address changed; rebinding".to_owned())),
                );
                continue;
            }

            match failure_rx.recv_timeout(SUPERVISOR_POLL) {
                Ok(failure) if failure.generation == active_id => {
                    let listener = match failure.kind {
                        ListenerKind::Http => "HTTP",
                        ListenerKind::Ssdp => "SSDP",
                    };
                    eprintln!(
                        "Lalin Cast: DIAL {listener} listener stopped; rebinding: {}",
                        failure.message
                    );
                    stop_generation(generation.take());
                    emit_status(
                        &runtime.app,
                        &runtime.status,
                        degraded_status(format!("{listener} listener stopped; retrying")),
                    );
                    thread::sleep(REBIND_DELAY);
                }
                Ok(_) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            continue;
        }

        let Some(local_ip) = local_ipv4().ok() else {
            emit_status(
                &runtime.app,
                &runtime.status,
                degraded_status("no LAN address available; retrying".to_owned()),
            );
            thread::sleep(REBIND_DELAY);
            continue;
        };

        emit_status(&runtime.app, &runtime.status, starting_status(None));
        generation_id = generation_id.wrapping_add(1);
        // A bind reads the settings store from scratch (see
        // `start_generation`'s `load_friendly_name` call), so any reload
        // requested before this point is satisfied by it. Clearing the flag
        // here rather than after the bind keeps a request that lands during
        // the bind window pending for the next loop iteration instead of
        // silently dropping it.
        runtime.reload.store(false, Ordering::Relaxed);
        match start_generation(&runtime, failure_tx.clone(), local_ip, generation_id) {
            Ok(active) => {
                eprintln!(
                    "Lalin Cast: DIAL ready at {} (UDP {SSDP_PORT})",
                    active.info.base
                );
                emit_status(&runtime.app, &runtime.status, ready_status(&active.info));
                generation = Some(active);
            }
            Err(error) => {
                eprintln!("Lalin Cast: DIAL bind failed; retrying: {error}");
                emit_status(
                    &runtime.app,
                    &runtime.status,
                    degraded_status("bind failed; retrying".to_owned()),
                );
                thread::sleep(REBIND_DELAY);
            }
        }
    }

    stop_generation(generation);
}

fn start_generation(
    runtime: &SupervisorState,
    failure_tx: Sender<ListenerFailure>,
    local_ip: Ipv4Addr,
    generation_id: u64,
) -> Result<Generation, String> {
    // Re-read the friendly name from the settings store on every generation
    // (every bind/rebind), not once at `dial::start()`, so a rename in the
    // store takes effect on the next rebind without an app restart.
    let friendly_name = load_friendly_name(&runtime.app);
    let http_listener = TcpListener::bind(http_bind_addr(local_ip))
        .map_err(|error| format!("HTTP bind failed: {error}"))?;
    http_listener
        .set_nonblocking(true)
        .map_err(|error| format!("HTTP nonblocking setup failed: {error}"))?;
    let port = http_listener
        .local_addr()
        .map_err(|error| format!("HTTP address lookup failed: {error}"))?
        .port();

    let ssdp_socket = bind_ssdp_socket(local_ip)
        .map_err(|error| format!("SSDP bind failed on UDP {SSDP_PORT}: {error}"))?;
    ssdp_socket
        .set_read_timeout(Some(Duration::from_millis(500)))
        .map_err(|error| format!("SSDP timeout setup failed: {error}"))?;
    ssdp_socket
        .set_multicast_ttl_v4(2)
        .map_err(|error| format!("SSDP multicast setup failed: {error}"))?;
    ssdp_socket
        .join_multicast_v4(&SSDP_ADDRESS, &local_ip)
        .map_err(|error| format!("SSDP multicast membership failed: {error}"))?;

    let info = DialInfo {
        host: local_ip.to_string(),
        port,
        base: format!("http://{local_ip}:{port}"),
    };
    let stop = Arc::new(AtomicBool::new(false));
    let http_state = RuntimeState {
        info: info.clone(),
        device_id: runtime.device_id.clone(),
        friendly_name: friendly_name.clone(),
        responses: runtime.responses.clone(),
        stop: stop.clone(),
        failure_tx: failure_tx.clone(),
        generation_id,
    };
    let http_app = runtime.app.clone();
    let http = thread::Builder::new()
        .name("lalin-dial-http".to_owned())
        .spawn(move || run_http(http_listener, http_app, http_state))
        .map_err(|error| format!("HTTP thread failed: {error}"))?;

    let ssdp_state = RuntimeState {
        info: info.clone(),
        device_id: runtime.device_id.clone(),
        friendly_name,
        responses: runtime.responses.clone(),
        stop: stop.clone(),
        failure_tx,
        generation_id,
    };
    let ssdp = match thread::Builder::new()
        .name("lalin-dial-ssdp".to_owned())
        .spawn(move || run_ssdp(ssdp_socket, ssdp_state))
    {
        Ok(thread) => thread,
        Err(error) => {
            stop.store(true, Ordering::Relaxed);
            let _ = http.join();
            return Err(format!("SSDP thread failed: {error}"));
        }
    };

    Ok(Generation {
        id: generation_id,
        info,
        stop,
        http,
        ssdp,
    })
}

fn stop_generation(generation: Option<Generation>) {
    let Some(generation) = generation else {
        return;
    };
    generation.stop.store(true, Ordering::Relaxed);
    let _ = generation.http.join();
    let _ = generation.ssdp.join();
}

fn address_changed(advertised_host: &str, current_ip: Option<Ipv4Addr>) -> bool {
    current_ip.map(|ip| ip.to_string()).as_deref() != Some(advertised_host)
}

/// The HTTP listener binds directly to the advertised LAN address (port 0,
/// OS-assigned) rather than `0.0.0.0`, so `URLBase`/`LOCATION`/
/// `Application-URL` always describe an address the listener actually owns.
fn http_bind_addr(local_ip: Ipv4Addr) -> (Ipv4Addr, u16) {
    (local_ip, 0)
}

#[derive(Debug, PartialEq, Eq)]
enum Route {
    DeviceDescription,
    AppsProxy,
    NotFound,
}

/// Pure routing decision, kept separate from `handle_http` so it can be unit
/// tested without a live socket or `AppHandle`. Also rejects any path
/// containing `..` before whitelisting `/apps` prefixes, so a request like
/// `/apps/../x` can never ride along as if it were a real DIAL app path.
fn route(method: &str, path: &str) -> Route {
    if path.contains("..") {
        return Route::NotFound;
    }
    if method == "GET" && path == "/" {
        Route::DeviceDescription
    } else if path == "/apps" || path.starts_with("/apps/") {
        // Deliberately not filtered by method here: the DIAL app-lifecycle
        // methods (GET/POST/DELETE) are dispatched to the JS `DialServer`
        // registrations, which already 404 an unmatched method+path via
        // `dial_respond`. Recorded, not enforced at this layer (unchanged
        // from the pre-H0 behavior).
        Route::AppsProxy
    } else {
        Route::NotFound
    }
}

fn run_http(listener: TcpListener, app: AppHandle, state: RuntimeState) {
    while !state.stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let app = app.clone();
                let state = state.clone();
                let _ = thread::Builder::new()
                    .name("lalin-dial-http-request".to_owned())
                    .spawn(move || handle_http(&mut stream, &app, &state));
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                eprintln!("Lalin Cast: DIAL HTTP accept failed: {error}");
                let _ = state.failure_tx.send(ListenerFailure {
                    generation: state.generation_id,
                    kind: ListenerKind::Http,
                    message: error.to_string(),
                });
                break;
            }
        }
    }
}

fn handle_http(stream: &mut TcpStream, app: &AppHandle, state: &RuntimeState) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request = match read_http_request(stream) {
        Ok(request) => request,
        Err(HttpReadError::TooLarge) => {
            write_empty_response(stream, 413);
            return;
        }
        Err(HttpReadError::Invalid) => {
            write_empty_response(stream, 400);
            return;
        }
    };

    match route(&request.method, &request.path) {
        Route::DeviceDescription => {
            let body = device_description(state);
            let application_url = format!("{}/apps", state.info.base);
            let headers = vec![
                (
                    "Content-Type".to_owned(),
                    "text/xml; charset=\"utf-8\"".to_owned(),
                ),
                ("Application-URL".to_owned(), application_url),
            ];
            write_response(stream, 200, &headers, body.as_bytes());
        }
        Route::AppsProxy => {
            let request_id = Uuid::new_v4().to_string();
            let dial_request = DialRequest {
                request_id: request_id.clone(),
                method: request.method,
                path: request.path,
                body: request.body,
                host: format!("{}:{}", state.info.host, state.info.port),
            };
            if app.emit_to(MEDIA_LABEL, DIAL_EVENT, &dial_request).is_err() {
                write_empty_response(stream, 503);
                return;
            }

            match wait_for_response(&state.responses, &request_id) {
                Some(response) => {
                    write_response(stream, response.status, &response.headers, &response.body)
                }
                None => write_empty_response(stream, 504),
            }
        }
        Route::NotFound => write_empty_response(stream, 404),
    }
}

fn run_ssdp(socket: UdpSocket, state: RuntimeState) {
    let mut buffer = [0_u8; 16 * 1024];
    while !state.stop.load(Ordering::Relaxed) {
        match socket.recv_from(&mut buffer) {
            Ok((size, source)) => {
                if is_dial_search(&buffer[..size]) {
                    let response = ssdp_response(&state);
                    let _ = socket.send_to(response.as_bytes(), source);
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) => {}
            Err(error) => {
                eprintln!("Lalin Cast: DIAL SSDP receive failed: {error}");
                let _ = state.failure_tx.send(ListenerFailure {
                    generation: state.generation_id,
                    kind: ListenerKind::Ssdp,
                    message: error.to_string(),
                });
                break;
            }
        }
    }
}

/// Pure check for one SSDP `MAN` header value (already split off the
/// `MAN:` key): trims surrounding whitespace, strips one optional pair of
/// surrounding double quotes, and compares case-insensitively to
/// `ssdp:discover`. UPnP requires the quoted form (`MAN: "ssdp:discover"`),
/// but a number of real DIAL clients send it unquoted — both are accepted
/// since the goal of this check is dropping datagrams that are not a real
/// M-SEARCH, not enforcing the UPnP spec to the letter. A single unbalanced
/// quote, or any trailing text after a matched closing quote, is rejected.
fn man_header_is_discover(value: &str) -> bool {
    let trimmed = value.trim();
    let unquoted = if let Some(rest) = trimmed.strip_prefix('"') {
        match rest.strip_suffix('"') {
            Some(inner) => inner,
            None => return false,
        }
    } else {
        trimmed
    };
    unquoted.eq_ignore_ascii_case("ssdp:discover")
}

fn is_dial_search(message: &[u8]) -> bool {
    let text = String::from_utf8_lossy(message);
    let mut lines = text.lines();
    let first_line = lines.next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    if parts.next() != Some("M-SEARCH") || parts.next() != Some("*") {
        return false;
    }

    let mut has_valid_st = false;
    let mut has_valid_man = false;
    for line in lines {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.eq_ignore_ascii_case("ST") {
            let value = value.trim();
            if value.eq_ignore_ascii_case("ssdp:all")
                || value.eq_ignore_ascii_case("urn:dial-multiscreen-org:service:dial:1")
            {
                has_valid_st = true;
            }
        } else if key.eq_ignore_ascii_case("MAN") && man_header_is_discover(value) {
            has_valid_man = true;
        }
    }
    has_valid_st && has_valid_man
}

fn ssdp_response(state: &RuntimeState) -> String {
    let device_id = state
        .device_id
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    format!(
        "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nDATE: {}\r\nEXT:\r\nLOCATION: {}/\r\nSERVER: {APP_AGENT}\r\nST: urn:dial-multiscreen-org:service:dial:1\r\nUSN: uuid:{}::urn:dial-multiscreen-org:service:dial:1\r\n\r\n",
        httpdate::fmt_http_date(std::time::SystemTime::now()),
        state.info.base,
        device_id
    )
}

fn device_description(state: &RuntimeState) -> String {
    let device_id = state
        .device_id
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    format!(
        "<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion><URLBase>{}</URLBase><device><deviceType>urn:dial-multiscreen-org:device:dial:1</deviceType><friendlyName>{}</friendlyName><manufacturer>{MANUFACTURER}</manufacturer><modelName>{MODEL_NAME}</modelName><UDN>uuid:{}</UDN></device></root>",
        xml_escape(&state.info.base),
        xml_escape(&state.friendly_name),
        xml_escape(&device_id)
    )
}

/// Sanitizes a raw `dialFriendlyName` store value for use in the DIAL device
/// description: strips CR/LF/`<`/`>`, trims, caps at
/// [`FRIENDLY_NAME_MAX_CHARS`] characters, and falls back to
/// [`DEFAULT_FRIENDLY_NAME`] when nothing usable is left. Never appends a
/// hostname. `pub(crate)` so `settings.rs`'s `apply_setting` can reuse this
/// exact sanitizer for the `dialFriendlyName` settings key, per the
/// contract ("friendly name ผ่าน sanitizer เดิม").
pub(crate) fn sanitize_friendly_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|ch| !matches!(ch, '\r' | '\n' | '<' | '>'))
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return DEFAULT_FRIENDLY_NAME.to_owned();
    }
    if trimmed.chars().count() > FRIENDLY_NAME_MAX_CHARS {
        trimmed.chars().take(FRIENDLY_NAME_MAX_CHARS).collect()
    } else {
        trimmed.to_owned()
    }
}

/// `pub(crate)` so `settings.rs` can read the current, already-sanitized
/// friendly name into a `SettingsSnapshot` without duplicating this lookup.
pub(crate) fn load_friendly_name(app: &AppHandle) -> String {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| {
            store
                .get(FRIENDLY_NAME_STORE_KEY)
                .and_then(|value| value.as_str().map(sanitize_friendly_name))
        })
        .unwrap_or_else(|| DEFAULT_FRIENDLY_NAME.to_owned())
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, HttpReadError> {
    let mut buffer = Vec::with_capacity(4096);
    let header_end = loop {
        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .map_err(|_| HttpReadError::Invalid)?;
        if read == 0 {
            return Err(HttpReadError::Invalid);
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_HEADER_BYTES + MAX_BODY_BYTES {
            return Err(HttpReadError::TooLarge);
        }
        if let Some(end) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break end + 4;
        }
        if buffer.len() > MAX_HEADER_BYTES {
            return Err(HttpReadError::TooLarge);
        }
    };

    let header_text =
        std::str::from_utf8(&buffer[..header_end]).map_err(|_| HttpReadError::Invalid)?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().ok_or(HttpReadError::Invalid)?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or(HttpReadError::Invalid)?
        .to_owned();
    let target = request_parts
        .next()
        .ok_or(HttpReadError::Invalid)?
        .to_owned();
    let version = request_parts.next().ok_or(HttpReadError::Invalid)?;
    if !version.starts_with("HTTP/") || method.len() > 16 || target.len() > MAX_HEADER_BYTES {
        return Err(HttpReadError::Invalid);
    }

    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        .map(|(_, value)| {
            value
                .trim()
                .parse::<usize>()
                .map_err(|_| HttpReadError::Invalid)
        })
        .transpose()?
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err(HttpReadError::TooLarge);
    }
    while buffer.len() < header_end + content_length {
        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .map_err(|_| HttpReadError::Invalid)?;
        if read == 0 {
            return Err(HttpReadError::Invalid);
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    let body_bytes = &buffer[header_end..header_end + content_length];
    let body = String::from_utf8(body_bytes.to_vec()).map_err(|_| HttpReadError::Invalid)?;
    let path = target.split('?').next().unwrap_or(&target).to_owned();
    Ok(HttpRequest { method, path, body })
}

#[derive(Debug)]
enum HttpReadError {
    Invalid,
    TooLarge,
}

fn wait_for_response(store: &ResponseStore, request_id: &str) -> Option<PendingResponse> {
    let (responses, wake) = &**store;
    let deadline = Instant::now() + RESPONSE_WAIT;
    let mut responses = responses.lock().ok()?;
    loop {
        if let Some(response) = responses.remove(request_id) {
            return Some(response);
        }
        let remaining = deadline.checked_duration_since(Instant::now())?;
        let (next, result) = wake.wait_timeout(responses, remaining).ok()?;
        responses = next;
        if result.timed_out() {
            responses.remove(request_id);
            return None;
        }
    }
}

fn write_empty_response(stream: &mut TcpStream, status: u16) {
    write_response(stream, status, &[], b"");
}

fn write_response(stream: &mut TcpStream, status: u16, headers: &[(String, String)], body: &[u8]) {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Response",
    };
    let mut response = format!(
        "HTTP/1.1 {status} {reason}\r\nServer: Lalin Cast\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (key, value) in headers {
        response.push_str(key);
        response.push_str(": ");
        response.push_str(value);
        response.push_str("\r\n");
    }
    response.push_str("\r\n");
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
}

fn local_ipv4() -> io::Result<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
    socket.connect((Ipv4Addr::new(224, 0, 0, 0), 80))?;
    match socket.local_addr()?.ip() {
        IpAddr::V4(address) => Ok(address),
        IpAddr::V6(_) => Err(io::Error::new(
            io::ErrorKind::AddrNotAvailable,
            "IPv4 unavailable",
        )),
    }
}

fn bind_ssdp_socket(local_ip: Ipv4Addr) -> io::Result<UdpSocket> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    socket.set_reuse_address(true)?;
    socket.bind(&std::net::SocketAddr::from((local_ip, SSDP_PORT)).into())?;
    Ok(socket.into())
}

fn load_or_create_device_id(app: &AppHandle) -> String {
    if let Ok(store) = app.store("media-settings.json") {
        if let Some(value) = store
            .get("dialDeviceId")
            .and_then(|value| value.as_str().map(str::to_owned))
        {
            if value.len() <= 128 && !value.contains(['\r', '\n', '<', '>']) {
                return value;
            }
        }
        let id = Uuid::new_v4().to_string();
        store.set("dialDeviceId", id.as_str());
        let _ = store.save();
        return id;
    }

    Uuid::new_v4().to_string()
}

fn persist_device_id(app: &AppHandle, device_id: &str) {
    let Ok(store) = app.store("media-settings.json") else {
        return;
    };
    store.set("dialDeviceId", device_id);
    if let Err(error) = store.save() {
        eprintln!("Lalin Cast: DIAL device id could not be saved: {error}");
    }
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::{
        current_status, degraded_status, device_description, disabled_status, http_bind_addr,
        is_dial_search, man_header_is_discover, read_http_request, ready_status, request_reload,
        sanitize_friendly_name, ssdp_response, starting_status, status_changed, DialInfo,
        DialState, DialStateKind, HttpReadError, Route, RuntimeState, DEFAULT_FRIENDLY_NAME,
        MAX_BODY_BYTES, MAX_HEADER_BYTES,
    };
    use std::collections::HashMap;
    use std::io::Write;
    use std::net::{Ipv4Addr, TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::sync::{Arc, Condvar, Mutex};
    use std::thread;

    fn state() -> RuntimeState {
        RuntimeState {
            info: DialInfo {
                host: "192.168.1.5".to_owned(),
                port: 43210,
                base: "http://192.168.1.5:43210".to_owned(),
            },
            device_id: Arc::new(Mutex::new("device-123".to_owned())),
            friendly_name: "Living Room Lalin Cast".to_owned(),
            responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
            stop: Arc::new(AtomicBool::new(false)),
            failure_tx: mpsc::channel().0,
            generation_id: 1,
        }
    }

    /// Sends `payload` to a real loopback `TcpListener` and runs
    /// `read_http_request` against the accepted server-side stream, so the
    /// large-request and malformed-request behavior is exercised the same
    /// way a real DIAL client would trigger it.
    fn read_request_over_tcp(payload: &'static [u8]) -> Result<super::HttpRequest, HttpReadError> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test listener");
        let addr = listener.local_addr().expect("test listener local addr");

        let client = thread::spawn(move || {
            let mut stream = TcpStream::connect(addr).expect("connect test client");
            let _ = stream.write_all(payload);
            // Dropping the stream here closes the connection, which is what
            // lets the "incomplete request" case observe EOF instead of
            // hanging until the read timeout.
        });

        let (mut server_stream, _) = listener.accept().expect("accept test connection");
        server_stream
            .set_read_timeout(Some(std::time::Duration::from_millis(500)))
            .expect("set test read timeout");
        let result = read_http_request(&mut server_stream);
        let _ = client.join();
        result
    }

    #[test]
    fn accepts_dial_m_search_and_rejects_other_ssdp_messages() {
        let search = b"M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\"\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n";
        let all = b"M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\"\r\nST: ssdp:all\r\n\r\n";
        let notify = b"NOTIFY * HTTP/1.1\r\nNT: ssdp:all\r\n\r\n";
        assert!(is_dial_search(search));
        assert!(is_dial_search(all));
        assert!(!is_dial_search(notify));
    }

    #[test]
    fn rejects_empty_or_non_matching_ssdp_messages() {
        assert!(!is_dial_search(b""));
        assert!(!is_dial_search(
            b"M-SEARCH * HTTP/1.1\r\nST: upnp:rootdevice\r\n\r\n"
        ));
        assert!(!is_dial_search(
            b"NOTIFY * HTTP/1.1\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n"
        ));
    }

    #[test]
    fn emits_dial_descriptor_and_ssdp_identity() {
        let state = state();
        let descriptor = device_description(&state);
        let response = ssdp_response(&state);
        assert!(descriptor.contains("urn:dial-multiscreen-org:device:dial:1"));
        assert!(descriptor.contains("<URLBase>http://192.168.1.5:43210</URLBase>"));
        assert!(descriptor.contains("<friendlyName>Living Room Lalin Cast</friendlyName>"));
        assert!(descriptor.contains("<manufacturer>Lalin</manufacturer>"));
        assert!(descriptor.contains("<modelName>Lalin Cast</modelName>"));
        assert!(!descriptor.to_lowercase().contains("vacuumtube"));
        assert!(!descriptor.contains("Application-URL"));
        assert!(response.contains("LOCATION: http://192.168.1.5:43210/"));
        assert!(response.contains("USN: uuid:device-123::urn:dial-multiscreen-org:service:dial:1"));
        assert!(!response.to_lowercase().contains("vacuumtube"));
    }

    #[test]
    fn identity_strings_carry_the_current_cargo_version_and_no_vacuumtube() {
        let version = env!("CARGO_PKG_VERSION");
        assert_eq!(
            super::APP_AGENT,
            format!("Windows/10 UPnP/1.0 LalinCast/{version}")
        );
        assert!(!super::APP_AGENT.to_lowercase().contains("vacuumtube"));
    }

    #[test]
    fn application_url_is_built_from_the_lan_base() {
        let state = state();
        let application_url = format!("{}/apps", state.info.base);
        assert_eq!(application_url, "http://192.168.1.5:43210/apps");
    }

    #[test]
    fn http_listener_binds_to_the_advertised_lan_address_not_unspecified() {
        let local_ip: Ipv4Addr = "192.168.1.5".parse().unwrap();
        assert_eq!(http_bind_addr(local_ip), (local_ip, 0));
        assert_ne!(http_bind_addr(local_ip).0, Ipv4Addr::UNSPECIFIED);
    }

    #[test]
    fn detects_lan_address_loss_or_change_for_rebind() {
        assert!(!super::address_changed(
            "192.168.1.5",
            Some("192.168.1.5".parse().unwrap())
        ));
        assert!(super::address_changed(
            "192.168.1.5",
            Some("192.168.1.6".parse().unwrap())
        ));
        assert!(super::address_changed("192.168.1.5", None));
    }

    #[test]
    fn sanitizes_friendly_name_trims_strips_forbidden_chars_and_caps_length() {
        assert_eq!(sanitize_friendly_name("  My TV  "), "My TV");
        assert_eq!(sanitize_friendly_name("Bad<Name>\r\n"), "BadName");
        assert_eq!(sanitize_friendly_name(""), DEFAULT_FRIENDLY_NAME);
        assert_eq!(sanitize_friendly_name("   "), DEFAULT_FRIENDLY_NAME);
        assert_eq!(sanitize_friendly_name("<>\r\n"), DEFAULT_FRIENDLY_NAME);

        let long = "x".repeat(100);
        let sanitized = sanitize_friendly_name(&long);
        assert_eq!(sanitized.chars().count(), 64);
        assert_eq!(sanitized, "x".repeat(64));
    }

    #[test]
    fn sanitized_friendly_name_never_contains_a_hostname_suffix() {
        // The pre-H0 descriptor appended "on {hostname}"; the sanitizer
        // must never add anything beyond what was already in the value.
        assert_eq!(sanitize_friendly_name("Lalin Cast"), "Lalin Cast");
        assert_eq!(DEFAULT_FRIENDLY_NAME, "Lalin Cast");
    }

    #[test]
    fn rejects_paths_outside_the_dial_whitelist() {
        assert_eq!(super::route("GET", "/foo"), Route::NotFound);
        assert_eq!(super::route("GET", "/apps/../x"), Route::NotFound);
        assert_eq!(super::route("GET", "/../secret"), Route::NotFound);
    }

    #[test]
    fn routes_the_whitelisted_dial_paths() {
        assert_eq!(super::route("GET", "/"), Route::DeviceDescription);
        assert_eq!(super::route("GET", "/apps"), Route::AppsProxy);
        assert_eq!(super::route("POST", "/apps/YouTube"), Route::AppsProxy);
        assert_eq!(
            super::route("DELETE", "/apps/YouTube/run"),
            Route::AppsProxy
        );
    }

    #[test]
    fn records_method_handling_for_known_paths() {
        // Non-GET on "/" is not a device-description request, so it 404s.
        assert_eq!(super::route("POST", "/"), Route::NotFound);
        // Methods outside GET/POST/DELETE are not filtered at this layer
        // for "/apps/*": they are forwarded to the JS DialServer, which
        // 404s an unmatched method+path itself. Recorded here as the
        // existing (unchanged) behavior, not a requirement of this layer.
        assert_eq!(super::route("PATCH", "/apps/YouTube"), Route::AppsProxy);
        assert_eq!(super::route("PUT", "/apps"), Route::AppsProxy);
    }

    #[test]
    fn rejects_a_header_larger_than_the_configured_limit() {
        let payload: &'static [u8] =
            Box::leak(vec![b'A'; MAX_HEADER_BYTES + 4096].into_boxed_slice());
        let result = read_request_over_tcp(payload);
        assert!(matches!(result, Err(HttpReadError::TooLarge)));
    }

    #[test]
    fn rejects_a_content_length_larger_than_the_configured_body_limit() {
        let payload = format!(
            "POST /apps HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        );
        let payload: &'static [u8] = Box::leak(payload.into_bytes().into_boxed_slice());
        let result = read_request_over_tcp(payload);
        assert!(matches!(result, Err(HttpReadError::TooLarge)));
    }

    #[test]
    fn rejects_an_incomplete_request_that_closes_before_the_header_ends() {
        let payload: &'static [u8] = b"GET /apps HTTP/1.1\r\nHost: 192.168.1.5";
        let result = read_request_over_tcp(payload);
        assert!(matches!(result, Err(HttpReadError::Invalid)));
    }

    #[test]
    fn header_size_check_is_strictly_greater_than_the_limit_not_greater_or_equal() {
        // Exactly at the limit, with no terminator and the client closing
        // the connection: still under the `> MAX_HEADER_BYTES` check, so
        // this hits EOF (`Invalid`) rather than `TooLarge`.
        let at_limit: &'static [u8] = Box::leak(vec![b'A'; MAX_HEADER_BYTES].into_boxed_slice());
        assert!(matches!(
            read_request_over_tcp(at_limit),
            Err(HttpReadError::Invalid)
        ));

        // One byte over the limit tips the same check into `TooLarge`.
        let over_limit: &'static [u8] =
            Box::leak(vec![b'A'; MAX_HEADER_BYTES + 1].into_boxed_slice());
        assert!(matches!(
            read_request_over_tcp(over_limit),
            Err(HttpReadError::TooLarge)
        ));
    }

    #[test]
    fn rejects_a_header_that_never_reaches_the_blank_line_terminator_and_times_out() {
        // Unlike `rejects_an_incomplete_request_that_closes_before_the_header_ends`
        // (an early close), this keeps the connection open with a single
        // CRLF and no blank-line terminator, so the server's read timeout
        // — not EOF — is what ends the read. The server's read timeout is
        // set to an already-elapsed duration (1ms) so the blocking read on
        // its side costs ~1ms instead of really waiting; the client thread
        // never sleeps, it just blocks on a channel until the server's read
        // has returned, so no real wait happens on either side.
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test listener");
        let addr = listener.local_addr().expect("test listener local addr");
        let (done_tx, done_rx) = mpsc::channel::<()>();
        let client = thread::spawn(move || {
            let mut stream = TcpStream::connect(addr).expect("connect test client");
            let _ = stream.write_all(b"GET /apps HTTP/1.1\r\nHost: 192.168.1.5\r\n");
            // Park here (no sleep) until the server's read has returned,
            // then drop the connection.
            let _ = done_rx.recv();
        });
        let (mut server_stream, _) = listener.accept().expect("accept test connection");
        server_stream
            .set_read_timeout(Some(std::time::Duration::from_millis(1)))
            .expect("set test read timeout");
        let result = read_http_request(&mut server_stream);
        let _ = done_tx.send(());
        let _ = client.join();
        assert!(matches!(result, Err(HttpReadError::Invalid)));
    }

    #[test]
    fn rejects_a_header_containing_invalid_utf8_bytes() {
        let mut payload = b"GET /apps HTTP/1.1\r\nX-Bad: ".to_vec();
        payload.extend_from_slice(&[0xFF, 0xFE]);
        payload.extend_from_slice(b"\r\n\r\n");
        let payload: &'static [u8] = Box::leak(payload.into_boxed_slice());
        let result = read_request_over_tcp(payload);
        assert!(matches!(result, Err(HttpReadError::Invalid)));
    }

    #[test]
    fn accepts_a_lowercase_http_method_without_case_folding() {
        let payload: &'static [u8] = b"get /apps HTTP/1.1\r\nHost: 192.168.1.5\r\n\r\n";
        let request = read_request_over_tcp(payload).expect("lowercase method should still parse");
        assert_eq!(request.method, "get");
    }

    #[test]
    fn rejects_a_request_target_long_enough_to_exceed_the_header_size_limit() {
        let long_path = format!("/{}", "a".repeat(MAX_HEADER_BYTES));
        let payload = format!("GET {long_path} HTTP/1.1\r\nHost: x\r\n\r\n");
        let payload: &'static [u8] = Box::leak(payload.into_bytes().into_boxed_slice());
        let result = read_request_over_tcp(payload);
        // The request-line target check (`target.len() > MAX_HEADER_BYTES`)
        // is what actually rejects this — the header as a whole still fits
        // under the combined header+body size check by the time the
        // terminating blank line arrives, so this is `Invalid`, not
        // `TooLarge`.
        assert!(matches!(result, Err(HttpReadError::Invalid)));
    }

    #[test]
    fn rejects_m_search_missing_the_st_header() {
        let missing_st = b"M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\n\r\n";
        assert!(!is_dial_search(missing_st));
    }

    #[test]
    fn rejects_m_search_even_with_a_valid_st_when_the_man_header_is_wrong() {
        // Wave 7 tightened `is_dial_search` to require a valid `MAN` header
        // in addition to the request line and `ST` — this is a deliberate
        // behavior change from the wave 6 characterization test this
        // replaces (`accepts_m_search_even_with_an_incorrect_man_header`).
        let wrong_man = b"M-SEARCH * HTTP/1.1\r\nMAN: wrong-value\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n";
        assert!(!is_dial_search(wrong_man));
    }

    #[test]
    fn rejects_m_search_with_no_man_header_at_all() {
        let no_man = b"M-SEARCH * HTTP/1.1\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n";
        assert!(!is_dial_search(no_man));
    }

    #[test]
    fn accepts_m_search_with_a_quoted_man_header() {
        let quoted = b"M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\"\r\nST: ssdp:all\r\n\r\n";
        assert!(is_dial_search(quoted));
    }

    #[test]
    fn accepts_m_search_with_an_unquoted_man_header() {
        let unquoted = b"M-SEARCH * HTTP/1.1\r\nMAN: ssdp:discover\r\nST: ssdp:all\r\n\r\n";
        assert!(is_dial_search(unquoted));
    }

    #[test]
    fn accepts_m_search_with_an_upper_case_man_header() {
        let upper = b"M-SEARCH * HTTP/1.1\r\nMAN: \"SSDP:DISCOVER\"\r\nST: ssdp:all\r\n\r\n";
        assert!(is_dial_search(upper));
    }

    #[test]
    fn rejects_m_search_with_trailing_junk_after_the_closing_quote() {
        let trailing =
            b"M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\" extra\r\nST: ssdp:all\r\n\r\n";
        assert!(!is_dial_search(trailing));
    }

    #[test]
    fn rejects_m_search_with_a_single_unbalanced_quote() {
        let unbalanced = b"M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\r\nST: ssdp:all\r\n\r\n";
        assert!(!is_dial_search(unbalanced));
    }

    #[test]
    fn man_header_is_discover_matches_the_documented_cases() {
        assert!(man_header_is_discover("\"ssdp:discover\""));
        assert!(man_header_is_discover("ssdp:discover"));
        assert!(man_header_is_discover("  \"SSDP:DISCOVER\"  "));
        assert!(man_header_is_discover(" ssdp:discover "));
        assert!(!man_header_is_discover("\"ssdp:discover\" extra"));
        assert!(!man_header_is_discover("\"ssdp:discover"));
        assert!(!man_header_is_discover("ssdp:discover\""));
        assert!(!man_header_is_discover("wrong-value"));
        assert!(!man_header_is_discover(""));
    }

    #[test]
    fn rejects_a_packet_with_only_whitespace_or_blank_lines() {
        assert!(!is_dial_search(b"\r\n\r\n"));
        assert!(!is_dial_search(b"   "));
    }

    #[test]
    fn accepts_an_oversized_m_search_packet_with_padding_after_a_valid_st() {
        let padding = format!("X-Pad: {}\r\n", "a".repeat(8000));
        let packet = format!(
            "M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\"\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n{padding}\r\n"
        );
        assert!(is_dial_search(packet.as_bytes()));
    }

    #[test]
    fn reads_a_well_formed_request_with_a_body() {
        let payload: &'static [u8] =
            b"POST /apps/YouTube HTTP/1.1\r\nHost: 192.168.1.5\r\nContent-Length: 5\r\n\r\nhello";
        let request = read_request_over_tcp(payload).expect("well-formed request should parse");
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/apps/YouTube");
        assert_eq!(request.body, "hello");
    }

    // -- DialStatus transitions (pure constructors + the emit-dedupe decision) --

    #[test]
    fn starting_status_carries_no_host_or_port() {
        let status = starting_status(Some("rebinding".to_owned()));
        assert_eq!(status.state, DialStateKind::Starting);
        assert_eq!(status.host, None);
        assert_eq!(status.port, None);
        assert_eq!(status.message.as_deref(), Some("rebinding"));
    }

    #[test]
    fn ready_status_carries_the_generations_host_and_port() {
        let info = DialInfo {
            host: "192.168.1.5".to_owned(),
            port: 43210,
            base: "http://192.168.1.5:43210".to_owned(),
        };
        let status = ready_status(&info);
        assert_eq!(status.state, DialStateKind::Ready);
        assert_eq!(status.host.as_deref(), Some("192.168.1.5"));
        assert_eq!(status.port, Some(43210));
        assert_eq!(status.message, None);
    }

    #[test]
    fn degraded_and_disabled_status_carry_a_message_and_no_host_or_port() {
        let degraded = degraded_status("listener stopped; retrying".to_owned());
        assert_eq!(degraded.state, DialStateKind::Degraded);
        assert_eq!(degraded.host, None);
        assert_eq!(degraded.port, None);
        assert_eq!(
            degraded.message.as_deref(),
            Some("listener stopped; retrying")
        );

        let disabled = disabled_status("DIAL supervisor thread failed".to_owned());
        assert_eq!(disabled.state, DialStateKind::Disabled);
        assert_eq!(disabled.host, None);
        assert_eq!(disabled.port, None);
        assert_eq!(
            disabled.message.as_deref(),
            Some("DIAL supervisor thread failed")
        );
    }

    #[test]
    fn status_changed_is_false_only_for_an_identical_status() {
        let a = starting_status(None);
        let b = starting_status(None);
        assert!(!status_changed(&a, &b));

        let c = starting_status(Some("rebinding".to_owned()));
        assert!(status_changed(&a, &c));

        let info = DialInfo {
            host: "192.168.1.5".to_owned(),
            port: 1,
            base: "http://192.168.1.5:1".to_owned(),
        };
        let ready = ready_status(&info);
        assert!(status_changed(&a, &ready));
        assert!(!status_changed(&ready, &ready.clone()));
    }

    #[test]
    fn current_status_reads_whatever_is_stored_in_dial_state() {
        let info = DialInfo {
            host: "192.168.1.5".to_owned(),
            port: 43210,
            base: "http://192.168.1.5:43210".to_owned(),
        };
        let dial_state = DialState {
            device_id: Arc::new(Mutex::new(String::new())),
            responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
            stop: Arc::new(AtomicBool::new(true)),
            status: Arc::new(Mutex::new(ready_status(&info))),
            reload: Arc::new(AtomicBool::new(false)),
        };

        let status = current_status(&dial_state);
        assert_eq!(status.state, DialStateKind::Ready);
        assert_eq!(status.host.as_deref(), Some("192.168.1.5"));
        assert_eq!(status.port, Some(43210));
    }

    #[test]
    fn request_reload_sets_the_flag_the_supervisor_loop_consumes() {
        // Built directly (not via `start()`) so this test never spawns the
        // real supervisor thread; it only checks the pure state/flag
        // contract `request_reload` relies on, matching how
        // `run_supervisor`'s loop consumes it with `swap(false, ..)`.
        let dial_state = DialState {
            device_id: Arc::new(Mutex::new(String::new())),
            responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
            stop: Arc::new(AtomicBool::new(true)),
            status: Arc::new(Mutex::new(starting_status(None))),
            reload: Arc::new(AtomicBool::new(false)),
        };

        assert!(!dial_state.reload.load(Ordering::Relaxed));
        request_reload(&dial_state);
        assert!(dial_state.reload.load(Ordering::Relaxed));

        // Mirrors the supervisor's own `swap(false, ..)` consumption: the
        // flag reads true exactly once, then clears itself.
        assert!(dial_state.reload.swap(false, Ordering::Relaxed));
        assert!(!dial_state.reload.load(Ordering::Relaxed));
    }

    #[test]
    fn dial_status_serializes_to_the_documented_camel_case_json_contract() {
        let info = DialInfo {
            host: "192.168.1.5".to_owned(),
            port: 43210,
            base: "http://192.168.1.5:43210".to_owned(),
        };
        let json = serde_json::to_string(&ready_status(&info)).expect("status should serialize");
        assert!(json.contains("\"state\":\"ready\""));
        assert!(json.contains("\"host\":\"192.168.1.5\""));
        assert!(json.contains("\"port\":43210"));

        let degraded_json = serde_json::to_string(&degraded_status("bind failed".to_owned()))
            .expect("status should serialize");
        assert!(degraded_json.contains("\"state\":\"degraded\""));
        assert!(degraded_json.contains("\"host\":null"));
    }

    #[test]
    fn device_description_reflects_whatever_friendly_name_a_generation_was_built_with() {
        // `start_generation` calls `load_friendly_name(&runtime.app)` fresh
        // on every call (not once at `dial::start()`), so each generation's
        // `RuntimeState` carries whatever value is currently in the
        // settings store at bind/rebind time. This checks the render side
        // of that contract: two `RuntimeState`s built with different
        // friendly names produce different device descriptions, i.e.
        // nothing caches a stale name at this layer.
        let mut first = state();
        first.friendly_name = "Living Room Lalin Cast".to_owned();
        let mut second = state();
        second.friendly_name = "Bedroom Lalin Cast".to_owned();

        assert!(device_description(&first)
            .contains("<friendlyName>Living Room Lalin Cast</friendlyName>"));
        assert!(
            device_description(&second).contains("<friendlyName>Bedroom Lalin Cast</friendlyName>")
        );
    }
}
