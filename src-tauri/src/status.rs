//! "status" window: shown when the startup connectivity probe fails
//! (offline) or when `injected.js` reports that YouTube redirected away
//! from the TV app or the Leanback UI never rendered (`blockedSurface`,
//! via `surface.rs`). See `window.__LALIN_STATUS__` in the Wave 2 plan.
//!
//! Wave 5 adds offline auto-retry: while the window is open in the
//! `offline` state (never `blockedSurface`), a background thread retries
//! the connectivity probe on a backoff schedule ([`retry_delay`]) up to a
//! ceiling ([`should_stop`]), telling the page each phase via
//! [`RETRY_EVENT`]. [`AutoRetryState`]'s generation counter — bumped on the
//! status window's `Destroyed` event, on a fresh (re-)open, and on a
//! successful probe — is how a superseded thread notices and exits on its
//! own, the same pattern `sleep.rs`'s tick thread and `dial.rs`'s
//! supervisor reload flag both use.

use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Window};

use crate::i18n::{self, Key};
use crate::surface;

pub const STATUS_LABEL: &str = "status";
const STATUS_WINDOW_WIDTH: f64 = 520.0;
const STATUS_WINDOW_HEIGHT: f64 = 380.0;
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

pub const STATE_OFFLINE: &str = "offline";
pub const STATE_BLOCKED_SURFACE: &str = "blockedSurface";

/// Rust → `status` window: `{ attempt, nextInSeconds, phase }`. See
/// [`spawn_auto_retry`].
const RETRY_EVENT: &str = "lalin-cast-status-retry";
/// Auto-retry never keeps going past this much wall-clock time since the
/// window opened in the `offline` state, regardless of `attempt`.
const RETRY_MAX_ELAPSED_SECS: u32 = 600;
/// Auto-retry never attempts more than this many retries, regardless of
/// elapsed time.
const RETRY_MAX_ATTEMPTS: u32 = 22;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusPayload {
    lang: &'static str,
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
}

impl StatusPayload {
    fn init_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "null".to_owned());
        format!("window.__LALIN_STATUS__ = {json};")
    }
}

/// Opens the single `status` window with the given state, or focuses it if
/// one is already open (an already-open window keeps whatever state it was
/// opened with, matching the `update` window's single-instance behavior).
/// Starts (or restarts) offline auto-retry whenever `state` is
/// [`STATE_OFFLINE`] — never for [`STATE_BLOCKED_SURFACE`] — including on
/// the focus-only branch, so a fresh offline probe request always owns the
/// latest [`AutoRetryState`] generation.
pub fn open_status_window(
    app: &AppHandle,
    state: &'static str,
    message: Option<String>,
    url: Option<String>,
) {
    if let Some(window) = app.get_webview_window(STATUS_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        if state == STATE_OFFLINE {
            spawn_auto_retry(app);
        }
        return;
    }

    let lang = i18n::load(app);
    let payload = StatusPayload {
        lang: lang.store_value(),
        state,
        message,
        url,
    };
    let title = i18n::t(lang, Key::StatusWindowTitle);
    let init_script = payload.init_script();
    let result =
        WebviewWindowBuilder::new(app, STATUS_LABEL, WebviewUrl::App("status.html".into()))
            .title(title)
            .inner_size(STATUS_WINDOW_WIDTH, STATUS_WINDOW_HEIGHT)
            .resizable(false)
            .initialization_script(&init_script)
            .build();

    match result {
        Ok(window) => {
            let generation_app = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    if let Some(retry_state) = generation_app.try_state::<AutoRetryState>() {
                        retry_state.bump();
                    }
                }
            });
            if state == STATE_OFFLINE {
                spawn_auto_retry(app);
            }
        }
        Err(error) => {
            eprintln!("Lalin Cast: could not open the status window: {error}");
        }
    }
}

/// Runs the startup connectivity probe (TCP `www.youtube.com:443`, 4s
/// timeout) on a separate thread, in parallel with building the `media`
/// window — the media window is always created regardless of the probe's
/// outcome. Opens the `status` window in the `offline` state only if the
/// probe fails.
pub fn schedule_startup_probe(app: &AppHandle) {
    let app = app.clone();
    let spawned = thread::Builder::new()
        .name("lalin-cast-status-probe".to_owned())
        .spawn(move || {
            if let Err(error) = surface::probe_connectivity(PROBE_TIMEOUT) {
                eprintln!("Lalin Cast: startup connectivity probe failed: {error}");
                let lang = i18n::load(&app);
                let message = i18n::t(lang, Key::StatusOfflineMessage).to_owned();
                open_status_window(&app, STATE_OFFLINE, Some(message), None);
            }
        });
    if let Err(error) = spawned {
        eprintln!("Lalin Cast: could not schedule the startup connectivity probe: {error}");
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusRetryResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Re-probes connectivity. On success, reloads the `media` window and
/// closes the `status` window; on failure, returns the failure message for
/// the page to display (the `status` window stays open either way; the
/// Wave 5 offline auto-retry loop below keeps running independently until
/// the window closes or a probe succeeds).
#[tauri::command]
pub fn status_retry(window: Window) -> Result<StatusRetryResult, String> {
    if window.label() != STATUS_LABEL {
        return Err("status_retry is only available from the status window".to_owned());
    }

    match surface::probe_connectivity(PROBE_TIMEOUT) {
        Ok(()) => {
            let app = window.app_handle();
            if let Some(media) = app.get_webview_window(crate::MEDIA_LABEL) {
                let _ = media.reload();
            }
            let _ = window.close();
            Ok(StatusRetryResult {
                ok: true,
                message: None,
            })
        }
        Err(error) => Ok(StatusRetryResult {
            ok: false,
            message: Some(error),
        }),
    }
}

#[tauri::command]
pub fn status_quit(window: Window) -> Result<(), String> {
    if window.label() != STATUS_LABEL {
        return Err("status_quit is only available from the status window".to_owned());
    }
    window.app_handle().exit(0);
    Ok(())
}

// -- Offline auto-retry (Wave 5) --

/// Backoff delay, in seconds, before retry attempt `attempt` (1-indexed):
/// `5, 10, 20, 30, 30, …`. `attempt == 0` never happens in practice (the
/// retry loop starts at 1) and returns `None` rather than a made-up value.
pub fn retry_delay(attempt: u32) -> Option<u32> {
    match attempt {
        0 => None,
        1 => Some(5),
        2 => Some(10),
        3 => Some(20),
        _ => Some(30),
    }
}

/// Pure ceiling check: auto-retry stops once `elapsed_secs` has reached 10
/// minutes since the status window opened offline, or once `attempt` has
/// gone past 22 — whichever comes first.
pub fn should_stop(attempt: u32, elapsed_secs: u32) -> bool {
    elapsed_secs >= RETRY_MAX_ELAPSED_SECS || attempt > RETRY_MAX_ATTEMPTS
}

/// Managed: the generation counter behind offline auto-retry. Bumped when
/// the status window is destroyed, when a fresh offline retry loop is
/// (re-)started, and when a probe succeeds — any of which means every
/// currently-running retry thread should stop on its next wakeup, per the
/// contract ("generation++ ทำให้ thread เก่าออกเอง").
#[derive(Default)]
pub struct AutoRetryState {
    generation: AtomicU64,
}

impl AutoRetryState {
    fn bump(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn current(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }
}

fn still_current(app: &AppHandle, generation: u64) -> bool {
    app.try_state::<AutoRetryState>()
        .map(|state| state.current() == generation)
        .unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RetryEventPayload {
    attempt: u32,
    next_in_seconds: Option<u32>,
    phase: &'static str,
}

fn emit_retry(app: &AppHandle, attempt: u32, next_in_seconds: Option<u32>, phase: &'static str) {
    let payload = RetryEventPayload {
        attempt,
        next_in_seconds,
        phase,
    };
    let _ = app.emit_to(STATUS_LABEL, RETRY_EVENT, &payload);
}

/// Starts a fresh offline auto-retry loop, superseding any previously
/// running one (via the generation bump). A no-op if [`AutoRetryState`] is
/// not managed yet.
fn spawn_auto_retry(app: &AppHandle) {
    let Some(state) = app.try_state::<AutoRetryState>() else {
        return;
    };
    let generation = state.bump();
    let app = app.clone();
    let spawned = thread::Builder::new()
        .name("lalin-cast-status-auto-retry".to_owned())
        .spawn(move || run_auto_retry(app, generation));
    if let Err(error) = spawned {
        eprintln!("Lalin Cast: could not start offline auto-retry: {error}");
    }
}

fn run_auto_retry(app: AppHandle, generation: u64) {
    let started = Instant::now();
    let mut attempt: u32 = 0;

    loop {
        attempt += 1;
        let elapsed = u32::try_from(started.elapsed().as_secs()).unwrap_or(u32::MAX);
        if should_stop(attempt, elapsed) {
            emit_retry(&app, attempt, None, "stopped");
            return;
        }
        let Some(delay) = retry_delay(attempt) else {
            emit_retry(&app, attempt, None, "stopped");
            return;
        };

        emit_retry(&app, attempt, Some(delay), "waiting");
        thread::sleep(Duration::from_secs(u64::from(delay)));
        if !still_current(&app, generation) {
            return;
        }

        emit_retry(&app, attempt, None, "probing");
        match surface::probe_connectivity(PROBE_TIMEOUT) {
            Ok(()) => {
                if !still_current(&app, generation) {
                    return;
                }
                if let Some(state) = app.try_state::<AutoRetryState>() {
                    state.bump();
                }
                if let Some(media) = app.get_webview_window(crate::MEDIA_LABEL) {
                    let _ = media.reload();
                }
                if let Some(status_window) = app.get_webview_window(STATUS_LABEL) {
                    let _ = status_window.close();
                }
                return;
            }
            Err(_) => {
                if !still_current(&app, generation) {
                    return;
                }
                // Loop again: the next iteration bumps `attempt` and emits
                // its own "waiting" phase.
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{retry_delay, should_stop};

    #[test]
    fn retry_delay_follows_the_documented_backoff_schedule() {
        assert_eq!(retry_delay(1), Some(5));
        assert_eq!(retry_delay(2), Some(10));
        assert_eq!(retry_delay(3), Some(20));
        assert_eq!(retry_delay(4), Some(30));
        assert_eq!(retry_delay(5), Some(30));
        assert_eq!(retry_delay(22), Some(30));
    }

    #[test]
    fn retry_delay_of_attempt_zero_is_none() {
        assert_eq!(retry_delay(0), None);
    }

    #[test]
    fn should_stop_is_false_before_either_ceiling() {
        assert!(!should_stop(1, 0));
        assert!(!should_stop(22, 599));
    }

    #[test]
    fn should_stop_is_true_at_or_past_the_elapsed_ceiling() {
        assert!(should_stop(1, 600));
        assert!(should_stop(1, 601));
    }

    #[test]
    fn should_stop_is_true_past_the_attempt_ceiling() {
        assert!(should_stop(23, 0));
        assert!(!should_stop(22, 0));
    }
}
