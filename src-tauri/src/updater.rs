//! Native update flow. Lalin Cast checks GitHub Releases directly from Rust
//! (startup, 8s after the media window shows, and on demand from the menu)
//! and shows the result in a dedicated `update` window instead of an
//! in-page overlay. See `window.__LALIN_UPDATE__` contract below, mirrored
//! by `fallback/update.html`/`update.js` (owned by the update-page stream).

use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window};
use tauri_plugin_updater::UpdaterExt;

use crate::i18n::{self, Lang};

const UPDATE_LABEL: &str = "update";
const UPDATE_WINDOW_WIDTH: f64 = 480.0;
const UPDATE_WINDOW_HEIGHT: f64 = 340.0;
const STARTUP_CHECK_DELAY: Duration = Duration::from_secs(8);

const STATE_AVAILABLE: &str = "available";
const STATE_UP_TO_DATE: &str = "upToDate";
const STATE_ERROR: &str = "error";

struct CastUpdateInfo {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
}

/// Payload injected as `window.__LALIN_UPDATE__` into the `update` window.
/// Field names/casing are the contract shared with `fallback/update.js`;
/// `serde_json::to_string` both orders and JSON-escapes every value, so the
/// generated `initialization_script` is always syntactically safe to embed.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePayload {
    lang: &'static str,
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl UpdatePayload {
    fn init_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "null".to_owned());
        format!("window.__LALIN_UPDATE__ = {json};")
    }
}

fn to_update_info(update: &tauri_plugin_updater::Update) -> CastUpdateInfo {
    CastUpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone(),
        pub_date: update.date.map(|value| value.to_string()),
    }
}

async fn check_update(app: &AppHandle) -> Result<Option<CastUpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|error| format!("updater is unavailable: {error}"))?
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))?;
    Ok(update.as_ref().map(to_update_info))
}

/// Opens the single `update` window with the given payload, or just focuses
/// it if one is already open (per the "single instance" contract; the
/// already-open window keeps whatever state it was opened with).
fn open_update_window(app: &AppHandle, lang: Lang, payload: UpdatePayload) {
    if let Some(window) = app.get_webview_window(UPDATE_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let title = i18n::t(lang, i18n::Key::UpdateWindowTitle);
    let init_script = payload.init_script();
    let result =
        WebviewWindowBuilder::new(app, UPDATE_LABEL, WebviewUrl::App("update.html".into()))
            .title(title)
            .inner_size(UPDATE_WINDOW_WIDTH, UPDATE_WINDOW_HEIGHT)
            .resizable(false)
            .initialization_script(&init_script)
            .build();

    if let Err(error) = result {
        eprintln!("Lalin Cast: could not open the update window: {error}");
    }
}

/// Runs an update check and shows the `update` window per the contract:
/// - an available update always opens the window (startup or manual);
/// - "up to date" / an error only opens the window for a manual check
///   (the startup check stays silent so it never interrupts playback).
pub async fn run_check(app: &AppHandle, manual: bool) {
    let lang = i18n::load(app);
    let lang_code = lang.store_value();

    match check_update(app).await {
        Ok(Some(info)) => {
            open_update_window(
                app,
                lang,
                UpdatePayload {
                    lang: lang_code,
                    state: STATE_AVAILABLE,
                    version: Some(info.version),
                    notes: info.notes,
                    pub_date: info.pub_date,
                    message: None,
                },
            );
        }
        Ok(None) if manual => {
            open_update_window(
                app,
                lang,
                UpdatePayload {
                    lang: lang_code,
                    state: STATE_UP_TO_DATE,
                    version: None,
                    notes: None,
                    pub_date: None,
                    message: None,
                },
            );
        }
        Ok(None) => {}
        Err(error) if manual => {
            open_update_window(
                app,
                lang,
                UpdatePayload {
                    lang: lang_code,
                    state: STATE_ERROR,
                    version: None,
                    notes: None,
                    pub_date: None,
                    message: Some(error),
                },
            );
        }
        Err(error) => {
            eprintln!("Lalin Cast: startup update check failed: {error}");
        }
    }
}

/// Schedules the silent startup update check 8 seconds after the media
/// window is shown. Runs on a plain OS thread (not the async runtime) so
/// the sleep never occupies a Tokio worker; the check itself then runs to
/// completion on Tauri's async runtime via `block_on`.
pub fn schedule_startup_check(app: &AppHandle) {
    let app = app.clone();
    let spawned = thread::Builder::new()
        .name("lalin-cast-update-startup".to_owned())
        .spawn(move || {
            thread::sleep(STARTUP_CHECK_DELAY);
            tauri::async_runtime::block_on(run_check(&app, false));
        });
    if let Err(error) = spawned {
        eprintln!("Lalin Cast: could not schedule the startup update check: {error}");
    }
}

/// Installs the pending update and restarts the app. Only callable from the
/// `update` window itself: `injected.js`/the media window never gets this
/// permission (see `capabilities/update.json` vs `capabilities/default.json`),
/// but this check is the actual security boundary.
#[tauri::command]
pub async fn cast_update_install(window: Window) -> Result<(), String> {
    if window.label() != UPDATE_LABEL {
        return Err("cast_update_install is only available from the update window".to_owned());
    }

    let app = window.app_handle().clone();
    let Some(update) = app
        .updater()
        .map_err(|error| format!("updater is unavailable: {error}"))?
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))?
    else {
        return Err("no pending update: the release is no longer available".to_owned());
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("update install failed: {error}"))?;
    app.restart();
}
