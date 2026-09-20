//! First-run "setup" window: shows the detected Windows network profile and
//! the current DIAL status, since a Public network profile is the #1 cause
//! of "my phone can't find the TV" (see the H0 RCA). Auto-opens once, 2
//! seconds after the `media` window is shown, unless the user already
//! dismissed it for good (`setupCompleted` in the settings store).

use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window};
use tauri_plugin_store::StoreExt;

use crate::dial::{self, DialStatus};
use crate::i18n::{self, Key};
use crate::network::{self, NetworkProfile};

pub const SETUP_LABEL: &str = "setup";
const SETUP_WINDOW_WIDTH: f64 = 560.0;
const SETUP_WINDOW_HEIGHT: f64 = 560.0;
const AUTO_OPEN_DELAY: Duration = Duration::from_secs(2);
const SETUP_COMPLETED_KEY: &str = "setupCompleted";
/// Fixed target; never built from page/argument input.
const NETWORK_SETTINGS_URI: &str = "ms-settings:network-status";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupPayload {
    lang: &'static str,
    first_run: bool,
    network: NetworkProfile,
    dial: DialStatus,
}

impl SetupPayload {
    fn init_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "null".to_owned());
        format!("window.__LALIN_SETUP__ = {json};")
    }
}

fn is_setup_completed(app: &AppHandle) -> bool {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| {
            store
                .get(SETUP_COMPLETED_KEY)
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false)
}

fn set_setup_completed(app: &AppHandle, value: bool) {
    if let Ok(store) = app.store("media-settings.json") {
        store.set(SETUP_COMPLETED_KEY, value);
        let _ = store.save();
    }
}

/// Opens the single `setup` window, or focuses it if one is already open.
/// Callable any time (tray "tray-setup", media menu "network-setup", and
/// the first-run auto-open timer all funnel through this).
pub fn open_setup_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETUP_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let lang = i18n::load(app);
    let payload = SetupPayload {
        lang: lang.store_value(),
        first_run: !is_setup_completed(app),
        network: network::detect_network_profile(),
        dial: dial::read_status(app),
    };
    let title = i18n::t(lang, Key::SetupWindowTitle);
    let init_script = payload.init_script();
    let result = WebviewWindowBuilder::new(app, SETUP_LABEL, WebviewUrl::App("setup.html".into()))
        .title(title)
        .inner_size(SETUP_WINDOW_WIDTH, SETUP_WINDOW_HEIGHT)
        .resizable(false)
        .initialization_script(&init_script)
        .build();

    if let Err(error) = result {
        eprintln!("Lalin Cast: could not open the setup window: {error}");
    }
}

/// Schedules the first-run auto-open, 2 seconds after the `media` window is
/// shown, unless `setupCompleted` is already `true`. Re-checks the flag
/// right before opening in case the user completed setup (or it was set)
/// during that 2-second window.
pub fn schedule_auto_open(app: &AppHandle) {
    if is_setup_completed(app) {
        return;
    }
    let app = app.clone();
    let spawned = thread::Builder::new()
        .name("lalin-cast-setup-auto-open".to_owned())
        .spawn(move || {
            thread::sleep(AUTO_OPEN_DELAY);
            if !is_setup_completed(&app) {
                open_setup_window(&app);
            }
        });
    if let Err(error) = spawned {
        eprintln!("Lalin Cast: could not schedule the setup auto-open: {error}");
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupRefreshResult {
    network: NetworkProfile,
    dial: DialStatus,
}

#[tauri::command]
pub fn setup_refresh(window: Window) -> Result<SetupRefreshResult, String> {
    if window.label() != SETUP_LABEL {
        return Err("setup_refresh is only available from the setup window".to_owned());
    }
    Ok(SetupRefreshResult {
        network: network::detect_network_profile(),
        dial: dial::read_status(window.app_handle()),
    })
}

/// Opens the OS network settings page. Takes no argument from the page —
/// the target is the fixed [`NETWORK_SETTINGS_URI`] constant.
#[tauri::command]
pub fn setup_open_network_settings(window: Window) -> Result<(), String> {
    if window.label() != SETUP_LABEL {
        return Err(
            "setup_open_network_settings is only available from the setup window".to_owned(),
        );
    }
    std::process::Command::new("cmd")
        .args(["/c", "start", "", NETWORK_SETTINGS_URI])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("could not open network settings: {error}"))
}

#[tauri::command]
pub fn setup_complete(dont_show_again: bool, window: Window) -> Result<(), String> {
    if window.label() != SETUP_LABEL {
        return Err("setup_complete is only available from the setup window".to_owned());
    }
    if dont_show_again {
        set_setup_completed(window.app_handle(), true);
    }
    window
        .close()
        .map_err(|error| format!("could not close the setup window: {error}"))
}
