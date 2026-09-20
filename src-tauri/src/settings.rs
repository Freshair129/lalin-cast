//! Native "settings" window: the one place a user can change everything
//! Lalin Cast remembers between runs (language, DIAL device name,
//! fullscreen/keep-on-top, controller/pause-on-blur, and jumping to the
//! setup wizard or a manual update check). See the Wave 3 plan's Settings
//! window contract for `window.__LALIN_SETTINGS__` and the four commands
//! below, mirrored by `fallback/settings.html`/`settings.js` (owned by the
//! pages stream).

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};

use crate::dial::{self, DialStatus};
use crate::i18n::{self, Key};
use crate::{setup, tray, updater};

pub const SETTINGS_LABEL: &str = "settings";
const SETTINGS_WINDOW_WIDTH: f64 = 560.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 640.0;

const KEY_LANGUAGE: &str = "language";
const KEY_DIAL_FRIENDLY_NAME: &str = "dialFriendlyName";
const KEY_FULLSCREEN: &str = "fullscreen";
const KEY_KEEP_ON_TOP: &str = "keepOnTop";
const KEY_PAUSE_ON_BLUR: &str = "pauseOnBlur";
const KEY_CONTROLLER_ENABLED: &str = "controllerEnabled";
const KEY_SETUP_COMPLETED: &str = "setupCompleted";

/// The full set of user-editable settings, mirrored 1:1 onto individual
/// `media-settings.json` store keys (unchanged keys from waves 1–2, plus
/// the two new wave 3 keys `controllerEnabled`/`pauseOnBlur`). Field names
/// serialize to exactly the `settings` object shape in the
/// `__LALIN_SETTINGS__`/`SettingsSnapshot` contract.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    language: String,
    dial_friendly_name: String,
    fullscreen: bool,
    keep_on_top: bool,
    pause_on_blur: bool,
    controller_enabled: bool,
    setup_completed: bool,
}

/// Return type of `settings_get`/`settings_set` and the `settings`+`dial`
/// portion of the `__LALIN_SETTINGS__` init payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    settings: Settings,
    dial: DialStatus,
}

/// Full `window.__LALIN_SETTINGS__` init-script payload: the snapshot above
/// plus the fields only the settings page's initial render needs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInitPayload {
    lang: &'static str,
    version: &'static str,
    settings: Settings,
    dial: DialStatus,
}

impl SettingsInitPayload {
    fn init_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "null".to_owned());
        format!("window.__LALIN_SETTINGS__ = {json};")
    }
}

fn load_settings(app: &AppHandle) -> Settings {
    Settings {
        language: i18n::load(app).store_value().to_owned(),
        dial_friendly_name: dial::load_friendly_name(app),
        fullscreen: crate::read_bool_setting_or(app, KEY_FULLSCREEN, false),
        keep_on_top: crate::read_bool_setting_or(app, KEY_KEEP_ON_TOP, false),
        pause_on_blur: crate::read_bool_setting_or(app, KEY_PAUSE_ON_BLUR, false),
        controller_enabled: crate::read_bool_setting_or(app, KEY_CONTROLLER_ENABLED, true),
        setup_completed: crate::read_bool_setting_or(app, KEY_SETUP_COMPLETED, false),
    }
}

/// Pure whitelist + type check for one `settings_set(key, value)` call:
/// returns `current` with exactly the named field replaced, or an `Err` for
/// any key outside the whitelist or any value of the wrong type. Never
/// touches the store or a window — `settings_set` applies the persistence
/// and side effects listed in the contract table only after this succeeds,
/// so nothing the page sends can write an arbitrary key straight into the
/// store.
pub fn apply_setting(key: &str, value: &Value, current: &Settings) -> Result<Settings, String> {
    let mut next = current.clone();
    match key {
        KEY_LANGUAGE => {
            let lang = value
                .as_str()
                .ok_or_else(|| "language must be a string".to_owned())?;
            if lang != "th" && lang != "en" {
                return Err("language must be \"th\" or \"en\"".to_owned());
            }
            next.language = lang.to_owned();
        }
        KEY_DIAL_FRIENDLY_NAME => {
            let raw = value
                .as_str()
                .ok_or_else(|| "dialFriendlyName must be a string".to_owned())?;
            next.dial_friendly_name = dial::sanitize_friendly_name(raw);
        }
        KEY_FULLSCREEN => {
            next.fullscreen = value
                .as_bool()
                .ok_or_else(|| "fullscreen must be a boolean".to_owned())?;
        }
        KEY_KEEP_ON_TOP => {
            next.keep_on_top = value
                .as_bool()
                .ok_or_else(|| "keepOnTop must be a boolean".to_owned())?;
        }
        KEY_PAUSE_ON_BLUR => {
            next.pause_on_blur = value
                .as_bool()
                .ok_or_else(|| "pauseOnBlur must be a boolean".to_owned())?;
        }
        KEY_CONTROLLER_ENABLED => {
            next.controller_enabled = value
                .as_bool()
                .ok_or_else(|| "controllerEnabled must be a boolean".to_owned())?;
        }
        KEY_SETUP_COMPLETED => {
            next.setup_completed = value
                .as_bool()
                .ok_or_else(|| "setupCompleted must be a boolean".to_owned())?;
        }
        _ => return Err(format!("unknown settings key: {key}")),
    }
    Ok(next)
}

/// Opens the single `settings` window, or focuses it if one is already
/// open. Callable any time: the media menu `settings` item, the tray
/// `tray-settings` item, and `lalin-cast-shell`'s `open-settings` action
/// (Ctrl+O / controller R3, forwarded from `injected.js`) all funnel
/// through this.
pub fn open_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let lang = i18n::load(app);
    let payload = SettingsInitPayload {
        lang: lang.store_value(),
        version: env!("CARGO_PKG_VERSION"),
        settings: load_settings(app),
        dial: dial::read_status(app),
    };
    let title = i18n::t(lang, Key::SettingsWindowTitle);
    let init_script = payload.init_script();
    let result =
        WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
            .title(title)
            .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
            .resizable(false)
            .initialization_script(&init_script)
            .build();

    if let Err(error) = result {
        eprintln!("Lalin Cast: could not open the settings window: {error}");
    }
}

#[tauri::command]
pub fn settings_get(
    window: Window,
    dial_state: State<'_, dial::DialState>,
) -> Result<SettingsSnapshot, String> {
    if window.label() != SETTINGS_LABEL {
        return Err("settings_get is only available from the settings window".to_owned());
    }
    Ok(SettingsSnapshot {
        settings: load_settings(window.app_handle()),
        dial: dial::current_status(&dial_state),
    })
}

/// Validates and applies one settings change end to end: whitelist/type
/// check via [`apply_setting`], persist exactly the changed key, then run
/// that key's side effect per the contract table (`language` rebuilds the
/// media menu and tray and re-emits prefs; `dialFriendlyName` asks the DIAL
/// supervisor to rebind; `fullscreen`/`keepOnTop` apply to the media window
/// immediately; `pauseOnBlur`/`controllerEnabled` re-emit prefs;
/// `setupCompleted` is save-only).
#[tauri::command]
pub fn settings_set(
    key: String,
    value: Value,
    window: Window,
    dial_state: State<'_, dial::DialState>,
) -> Result<SettingsSnapshot, String> {
    if window.label() != SETTINGS_LABEL {
        return Err("settings_set is only available from the settings window".to_owned());
    }
    let app = window.app_handle();
    let current = load_settings(app);
    let next = apply_setting(&key, &value, &current)?;

    match key.as_str() {
        KEY_LANGUAGE => {
            let lang = i18n::Lang::from_store_value(&next.language).unwrap_or(i18n::Lang::En);
            i18n::save(app, lang);
            if let Some(media) = app.get_webview_window(crate::MEDIA_LABEL) {
                if let Ok(menu) = crate::build_menu(app, lang) {
                    let _ = media.set_menu(menu);
                }
            }
            tray::rebuild_menu(app, lang);
            crate::emit_prefs(app);
        }
        KEY_DIAL_FRIENDLY_NAME => {
            crate::write_string_setting(
                app,
                dial::FRIENDLY_NAME_STORE_KEY,
                &next.dial_friendly_name,
            );
            dial::request_reload(&dial_state);
        }
        KEY_FULLSCREEN => {
            crate::write_bool_setting(app, KEY_FULLSCREEN, next.fullscreen);
            if let Some(media) = app.get_webview_window(crate::MEDIA_LABEL) {
                let _ = media.set_fullscreen(next.fullscreen);
            }
        }
        KEY_KEEP_ON_TOP => {
            crate::write_bool_setting(app, KEY_KEEP_ON_TOP, next.keep_on_top);
            if let Some(media) = app.get_webview_window(crate::MEDIA_LABEL) {
                let _ = media.set_always_on_top(next.keep_on_top);
            }
        }
        KEY_PAUSE_ON_BLUR => {
            crate::write_bool_setting(app, KEY_PAUSE_ON_BLUR, next.pause_on_blur);
            crate::emit_prefs(app);
        }
        KEY_CONTROLLER_ENABLED => {
            crate::write_bool_setting(app, KEY_CONTROLLER_ENABLED, next.controller_enabled);
            crate::emit_prefs(app);
        }
        KEY_SETUP_COMPLETED => {
            crate::write_bool_setting(app, KEY_SETUP_COMPLETED, next.setup_completed);
        }
        _ => {
            // `apply_setting` already rejected every key outside the whitelist;
            // never panic in a handler reachable from page-supplied input.
        }
    }

    Ok(SettingsSnapshot {
        settings: next,
        dial: dial::current_status(&dial_state),
    })
}

#[tauri::command]
pub fn settings_open_setup(window: Window) -> Result<(), String> {
    if window.label() != SETTINGS_LABEL {
        return Err("settings_open_setup is only available from the settings window".to_owned());
    }
    // Per the contract, reopening the wizard from Settings is always
    // `firstRun=false` — never the auto-detected value `open_setup_window`
    // would otherwise use.
    setup::open_setup_window_explicit(window.app_handle(), false);
    Ok(())
}

#[tauri::command]
pub async fn settings_check_updates(window: Window) -> Result<(), String> {
    if window.label() != SETTINGS_LABEL {
        return Err("settings_check_updates is only available from the settings window".to_owned());
    }
    let app = window.app_handle().clone();
    updater::run_check(&app, true).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{apply_setting, Settings};
    use serde_json::json;

    fn base() -> Settings {
        Settings {
            language: "th".to_owned(),
            dial_friendly_name: "Lalin Cast".to_owned(),
            fullscreen: false,
            keep_on_top: false,
            pause_on_blur: false,
            controller_enabled: true,
            setup_completed: false,
        }
    }

    #[test]
    fn rejects_a_key_outside_the_whitelist() {
        let result = apply_setting("notARealKey", &json!(true), &base());
        assert!(result.is_err());
        // Also rejects a key that merely resembles a real one.
        assert!(apply_setting("Language", &json!("en"), &base()).is_err());
        assert!(apply_setting("__proto__", &json!("x"), &base()).is_err());
    }

    #[test]
    fn rejects_the_wrong_value_type_for_every_key() {
        assert!(apply_setting("language", &json!(123), &base()).is_err());
        assert!(apply_setting("dialFriendlyName", &json!(123), &base()).is_err());
        assert!(apply_setting("fullscreen", &json!("yes"), &base()).is_err());
        assert!(apply_setting("keepOnTop", &json!("yes"), &base()).is_err());
        assert!(apply_setting("pauseOnBlur", &json!("yes"), &base()).is_err());
        assert!(apply_setting("controllerEnabled", &json!("yes"), &base()).is_err());
        assert!(apply_setting("setupCompleted", &json!("yes"), &base()).is_err());
        assert!(apply_setting("fullscreen", &json!(null), &base()).is_err());
    }

    #[test]
    fn rejects_a_language_outside_th_or_en() {
        assert!(apply_setting("language", &json!("fr"), &base()).is_err());
        assert!(apply_setting("language", &json!("EN"), &base()).is_err());
        assert!(apply_setting("language", &json!(""), &base()).is_err());
        let ok = apply_setting("language", &json!("en"), &base()).expect("en should be accepted");
        assert_eq!(ok.language, "en");
        let ok = apply_setting("language", &json!("th"), &base()).expect("th should be accepted");
        assert_eq!(ok.language, "th");
    }

    #[test]
    fn sanitizes_the_friendly_name_through_the_dial_sanitizer() {
        let ok = apply_setting("dialFriendlyName", &json!("  Bad<Name>\r\n  "), &base())
            .expect("should sanitize rather than reject");
        assert_eq!(ok.dial_friendly_name, "BadName");

        // Empty-after-sanitizing falls back to the DIAL default, matching
        // `dial::sanitize_friendly_name` exactly (same function, reused).
        let ok = apply_setting("dialFriendlyName", &json!("<>\r\n"), &base())
            .expect("should sanitize rather than reject");
        assert_eq!(ok.dial_friendly_name, "Lalin Cast");
    }

    #[test]
    fn applies_each_boolean_key_and_leaves_the_rest_of_settings_untouched() {
        let current = base();

        let next = apply_setting("fullscreen", &json!(true), &current).expect("valid bool");
        assert!(next.fullscreen);
        assert_eq!(next.keep_on_top, current.keep_on_top);
        assert_eq!(next.pause_on_blur, current.pause_on_blur);
        assert_eq!(next.controller_enabled, current.controller_enabled);
        assert_eq!(next.setup_completed, current.setup_completed);
        assert_eq!(next.language, current.language);
        assert_eq!(next.dial_friendly_name, current.dial_friendly_name);

        let next = apply_setting("keepOnTop", &json!(true), &current).expect("valid bool");
        assert!(next.keep_on_top);

        let next = apply_setting("pauseOnBlur", &json!(true), &current).expect("valid bool");
        assert!(next.pause_on_blur);

        let next = apply_setting("controllerEnabled", &json!(false), &current).expect("valid bool");
        assert!(!next.controller_enabled);

        let next = apply_setting("setupCompleted", &json!(true), &current).expect("valid bool");
        assert!(next.setup_completed);
    }
}
