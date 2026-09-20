//! "status" window: shown when the startup connectivity probe fails
//! (offline) or when `injected.js` reports that YouTube redirected away
//! from the TV app or the Leanback UI never rendered (`blockedSurface`,
//! via `surface.rs`). See `window.__LALIN_STATUS__` in the Wave 2 plan.

use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window};

use crate::i18n::{self, Key};
use crate::surface;

pub const STATUS_LABEL: &str = "status";
const STATUS_WINDOW_WIDTH: f64 = 520.0;
const STATUS_WINDOW_HEIGHT: f64 = 380.0;
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

pub const STATE_OFFLINE: &str = "offline";
pub const STATE_BLOCKED_SURFACE: &str = "blockedSurface";

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
pub fn open_status_window(
    app: &AppHandle,
    state: &'static str,
    message: Option<String>,
    url: Option<String>,
) {
    if let Some(window) = app.get_webview_window(STATUS_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
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

    if let Err(error) = result {
        eprintln!("Lalin Cast: could not open the status window: {error}");
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
/// the page to display (the `status` window stays open either way — there
/// is no auto-retry loop, per the contract).
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
