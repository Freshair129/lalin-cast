//! Native update flow. Lalin Cast checks GitHub Releases directly from Rust
//! (startup, 8s after the media window shows, and on demand from the menu)
//! and shows the result in a dedicated `update` window instead of an
//! in-page overlay. See `window.__LALIN_UPDATE__` contract below, mirrored
//! by `fallback/update.html`/`update.js` (owned by the update-page stream).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
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
/// Custom DOM event `update.js` listens for after an `eval`-based refresh
/// (see `open_update_window`).
const UPDATE_REFRESH_DOM_EVENT: &str = "lalin-update";

/// Re-entrancy guard around a whole check: only one `run_check` runs at a
/// time. A manual check that arrives while another is already in flight
/// does not start a second network round-trip — it just focuses the
/// `update` window if one is open.
struct CheckGuard(AtomicBool);

impl CheckGuard {
    const fn new() -> Self {
        Self(AtomicBool::new(false))
    }

    /// Attempts to take the guard. `Some(token)` means it was free and is
    /// now held until the token drops (also on panic); `None` means another
    /// check already holds it.
    fn try_acquire(&self) -> Option<CheckGuardToken<'_>> {
        if self.0.swap(true, Ordering::SeqCst) {
            None
        } else {
            Some(CheckGuardToken(self))
        }
    }
}

/// RAII handle returned by [`CheckGuard::try_acquire`]; releases on drop.
struct CheckGuardToken<'a>(&'a CheckGuard);

impl Drop for CheckGuardToken<'_> {
    fn drop(&mut self) {
        self.0 .0.store(false, Ordering::SeqCst);
    }
}

static UPDATE_CHECK_GUARD: CheckGuard = CheckGuard::new();
/// Last JSON payload sent to the `update` window, used to decide whether an
/// already-open window needs an `eval`-based refresh (see
/// `open_update_window`). `None` once no window has been opened yet.
static LAST_UPDATE_STATE_JSON: Mutex<Option<String>> = Mutex::new(None);

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

/// Pure field mapping extracted from [`to_update_info`] so it is
/// unit-testable without constructing a real `tauri_plugin_updater::Update`
/// (its `extract_path`/`context` fields are private to that crate, so no
/// test in this codebase can build one directly).
fn map_update_info(
    version: String,
    body: Option<String>,
    pub_date: Option<String>,
) -> CastUpdateInfo {
    CastUpdateInfo {
        version,
        notes: body,
        pub_date,
    }
}

fn to_update_info(update: &tauri_plugin_updater::Update) -> CastUpdateInfo {
    map_update_info(
        update.version.clone(),
        update.body.clone(),
        update.date.map(|value| value.to_string()),
    )
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

/// Opens the single `update` window with the given payload. If one is
/// already open: when the new state differs from what it currently shows,
/// pushes the new state in with `window.eval` and dispatches the
/// `lalin-update` DOM event so `update.js` re-renders in place; either way,
/// the window is shown and focused (matching the prior "single instance,
/// just focus" behavior when the state has not changed).
fn open_update_window(app: &AppHandle, lang: Lang, payload: UpdatePayload) {
    let json = serde_json::to_string(&payload).unwrap_or_else(|_| "null".to_owned());

    if let Some(window) = app.get_webview_window(UPDATE_LABEL) {
        let changed = {
            let mut last = LAST_UPDATE_STATE_JSON
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            let changed = last.as_deref() != Some(json.as_str());
            *last = Some(json.clone());
            changed
        };
        if changed {
            let script = format!(
                "window.__LALIN_UPDATE__ = {json}; window.dispatchEvent(new CustomEvent('{UPDATE_REFRESH_DOM_EVENT}'));"
            );
            let _ = window.eval(&script);
        }
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    {
        let mut last = LAST_UPDATE_STATE_JSON
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        *last = Some(json.clone());
    }

    let title = i18n::t(lang, i18n::Key::UpdateWindowTitle);
    let init_script = format!("window.__LALIN_UPDATE__ = {json};");
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

/// Focuses the `update` window if one is open; used when a manual check
/// arrives while another check is already in flight (the re-entrancy
/// guard in [`run_check`]).
fn focus_update_window_if_open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(UPDATE_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Runs an update check and shows the `update` window per the contract:
/// - an available update always opens the window (startup or manual);
/// - "up to date" / an error only opens the window for a manual check
///   (the startup check stays silent so it never interrupts playback);
/// - a manual check that arrives while another check is already running
///   does not start a second one — it just focuses the `update` window if
///   one is open (see [`CheckGuard`]).
pub async fn run_check(app: &AppHandle, manual: bool) {
    let Some(_token) = UPDATE_CHECK_GUARD.try_acquire() else {
        if manual {
            focus_update_window_if_open(app);
        }
        return;
    };

    run_check_locked(app, manual).await;
}

async fn run_check_locked(app: &AppHandle, manual: bool) {
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

#[cfg(test)]
mod tests {
    use super::{map_update_info, CheckGuard};

    #[test]
    fn check_guard_blocks_reacquisition_until_released() {
        // A fresh, local guard (not the module-level static) so this test
        // never interferes with any other test's use of the guard.
        let guard = CheckGuard::new();
        let token = guard.try_acquire().expect("first acquire should succeed");
        assert!(
            guard.try_acquire().is_none(),
            "second acquire should fail while the first is held"
        );
        drop(token);
        assert!(
            guard.try_acquire().is_some(),
            "acquire should succeed again after the token drops"
        );
    }

    #[test]
    fn maps_a_full_update_info_straight_through() {
        let info = map_update_info(
            "1.2.3".to_owned(),
            Some("Fixed a bug".to_owned()),
            Some("2026-09-21".to_owned()),
        );
        assert_eq!(info.version, "1.2.3");
        assert_eq!(info.notes.as_deref(), Some("Fixed a bug"));
        assert_eq!(info.pub_date.as_deref(), Some("2026-09-21"));
    }

    #[test]
    fn maps_a_none_body_and_none_date_without_panicking() {
        let info = map_update_info("2.0.0".to_owned(), None, None);
        assert_eq!(info.version, "2.0.0");
        assert_eq!(info.notes, None);
        assert_eq!(info.pub_date, None);
    }

    #[test]
    fn preserves_an_empty_string_body_rather_than_treating_it_as_none() {
        let info = map_update_info("2.0.1".to_owned(), Some(String::new()), None);
        assert_eq!(info.notes, Some(String::new()));
    }
}
