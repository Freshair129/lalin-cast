use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use socket2::{Domain, Protocol, Socket, Type};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

const MEDIA_LABEL: &str = "media";
const DIAL_EVENT: &str = "lalin-cast-dial-request";
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
const FRIENDLY_NAME_STORE_KEY: &str = "dialFriendlyName";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialInfo {
    pub host: String,
    pub port: u16,
    pub base: String,
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
    info: Arc<Mutex<Option<DialInfo>>>,
    device_id: Arc<Mutex<String>>,
    responses: ResponseStore,
    stop: Arc<AtomicBool>,
}

struct HttpRequest {
    method: String,
    path: String,
    body: String,
}

pub fn disabled_state() -> DialState {
    DialState {
        info: Arc::new(Mutex::new(None)),
        device_id: Arc::new(Mutex::new(String::new())),
        responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
        stop: Arc::new(AtomicBool::new(true)),
    }
}

pub fn start(app: &AppHandle) -> Result<DialState, String> {
    let device_id = Arc::new(Mutex::new(load_or_create_device_id(app)));
    let friendly_name = load_friendly_name(app);
    let info = Arc::new(Mutex::new(None));
    let responses = Arc::new((Mutex::new(HashMap::new()), Condvar::new()));
    let stop = Arc::new(AtomicBool::new(false));

    let supervisor = SupervisorState {
        app: app.clone(),
        info: info.clone(),
        device_id: device_id.clone(),
        friendly_name,
        responses: responses.clone(),
        stop: stop.clone(),
    };
    thread::Builder::new()
        .name("lalin-dial-supervisor".to_owned())
        .spawn(move || run_supervisor(supervisor))
        .map_err(|error| format!("DIAL supervisor thread failed: {error}"))?;

    Ok(DialState {
        info,
        device_id,
        responses,
        stop,
    })
}

impl Drop for DialState {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

struct SupervisorState {
    app: AppHandle,
    info: Arc<Mutex<Option<DialInfo>>>,
    device_id: Arc<Mutex<String>>,
    friendly_name: String,
    responses: ResponseStore,
    stop: Arc<AtomicBool>,
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
pub fn dial_get_info(state: State<'_, DialState>) -> Option<DialInfo> {
    state.info.lock().ok()?.clone()
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

            if address_changed(&active_host, current_ip) {
                eprintln!("Lalin Cast: DIAL LAN address changed; rebinding listeners");
                stop_generation(generation.take());
                clear_info(&runtime.info);
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
                    clear_info(&runtime.info);
                    thread::sleep(REBIND_DELAY);
                }
                Ok(_) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            continue;
        }

        let Some(local_ip) = local_ipv4().ok() else {
            clear_info(&runtime.info);
            thread::sleep(REBIND_DELAY);
            continue;
        };

        generation_id = generation_id.wrapping_add(1);
        match start_generation(&runtime, failure_tx.clone(), local_ip, generation_id) {
            Ok(active) => {
                set_info(&runtime.info, Some(active.info.clone()));
                eprintln!(
                    "Lalin Cast: DIAL ready at {} (UDP {SSDP_PORT})",
                    active.info.base
                );
                generation = Some(active);
            }
            Err(error) => {
                clear_info(&runtime.info);
                eprintln!("Lalin Cast: DIAL bind failed; retrying: {error}");
                thread::sleep(REBIND_DELAY);
            }
        }
    }

    stop_generation(generation);
    clear_info(&runtime.info);
}

fn start_generation(
    runtime: &SupervisorState,
    failure_tx: Sender<ListenerFailure>,
    local_ip: Ipv4Addr,
    generation_id: u64,
) -> Result<Generation, String> {
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
        friendly_name: runtime.friendly_name.clone(),
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
        friendly_name: runtime.friendly_name.clone(),
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

fn set_info(info: &Arc<Mutex<Option<DialInfo>>>, value: Option<DialInfo>) {
    if let Ok(mut current) = info.lock() {
        *current = value;
    }
}

fn clear_info(info: &Arc<Mutex<Option<DialInfo>>>) {
    set_info(info, None);
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

fn is_dial_search(message: &[u8]) -> bool {
    let text = String::from_utf8_lossy(message);
    let mut lines = text.lines();
    let first_line = lines.next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    if parts.next() != Some("M-SEARCH") || parts.next() != Some("*") {
        return false;
    }

    lines.any(|line| {
        let Some((key, value)) = line.split_once(':') else {
            return false;
        };
        key.eq_ignore_ascii_case("ST")
            && (value.trim().eq_ignore_ascii_case("ssdp:all")
                || value
                    .trim()
                    .eq_ignore_ascii_case("urn:dial-multiscreen-org:service:dial:1"))
    })
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
/// hostname.
fn sanitize_friendly_name(raw: &str) -> String {
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

fn load_friendly_name(app: &AppHandle) -> String {
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
        device_description, http_bind_addr, is_dial_search, read_http_request,
        sanitize_friendly_name, ssdp_response, DialInfo, HttpReadError, Route, RuntimeState,
        DEFAULT_FRIENDLY_NAME, MAX_BODY_BYTES, MAX_HEADER_BYTES,
    };
    use std::collections::HashMap;
    use std::io::Write;
    use std::net::{Ipv4Addr, TcpListener, TcpStream};
    use std::sync::atomic::AtomicBool;
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
        let search = b"M-SEARCH * HTTP/1.1\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n";
        let all = b"M-SEARCH * HTTP/1.1\r\nST: ssdp:all\r\n\r\n";
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
    fn reads_a_well_formed_request_with_a_body() {
        let payload: &'static [u8] =
            b"POST /apps/YouTube HTTP/1.1\r\nHost: 192.168.1.5\r\nContent-Length: 5\r\n\r\nhello";
        let request = read_request_over_tcp(payload).expect("well-formed request should parse");
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/apps/YouTube");
        assert_eq!(request.body, "hello");
    }
}
