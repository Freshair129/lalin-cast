//! Native "settings" window: the one place a user can change everything
//! Lalin Cast remembers between runs (language, DIAL device name,
//! fullscreen/keep-on-top, controller/pause-on-blur, sleep timer, codec
//! filter, hardware decoding, touch overlay, mini-player, and jumping to
//! the setup wizard or a manual update check). See the Wave 3 plan's
//! Settings window contract (extended by Wave 4) for
//! `window.__LALIN_SETTINGS__` and the commands below, mirrored by
//! `fallback/settings.html`/`settings.js` (owned by the pages stream).

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};

use crate::dial::{self, DialStatus};
use crate::i18n::{self, Key};
use crate::{autostart, diagnostics, setup, sleep, tray, updater, window_mode};

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
const KEY_SLEEP_TIMER_MINUTES: &str = "sleepTimerMinutes";
const KEY_CODEC_FILTER: &str = "codecFilter";
const KEY_HARDWARE_DECODING: &str = "hardwareDecoding";
const KEY_TOUCH_OVERLAY: &str = "touchOverlay";
const KEY_MINI_PLAYER: &str = "miniPlayer";
const KEY_START_WITH_WINDOWS: &str = "startWithWindows";

/// The full set of user-editable settings, mirrored 1:1 onto individual
/// `media-settings.json` store keys (unchanged keys from waves 1–3, plus
/// the five new wave 4 keys — `miniPlayer` is the one exception: it is
/// session-only and is never read from or written to the store, only to/from
/// `window_mode::MiniPlayerState`; see [`load_settings`] and
/// `settings_set`'s `KEY_MINI_PLAYER` side effect). Field names serialize to
/// exactly the `settings` object shape in the
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
    sleep_timer_minutes: u32,
    codec_filter: String,
    hardware_decoding: bool,
    touch_overlay: bool,
    mini_player: bool,
    start_with_windows: bool,
}

/// Return type of `settings_get`/`settings_set` and the `settings`+`dial`+…
/// portion of the `__LALIN_SETTINGS__` init payload. `sleep_remaining_seconds`
/// and `hardware_decoding_restart_required` live at this top level (not
/// nested under `settings`) per the Wave 4 contract, since neither is a
/// plain store-backed setting: the first is derived from the running sleep
/// timer's deadline, the second from comparing the live `hardwareDecoding`
/// value against whatever the `media` window was actually built with.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    settings: Settings,
    dial: DialStatus,
    sleep_remaining_seconds: Option<u64>,
    hardware_decoding_restart_required: bool,
}

/// Builds a full [`SettingsSnapshot`] for `app`. Takes the DIAL status and
/// sleep-timer remaining-seconds as parameters (rather than reading them
/// itself) so command handlers can supply the `State<'_, _>`-backed
/// `dial::current_status`/`sleep::remaining_seconds` while non-command call
/// sites (`open_settings_window`, which only has an `AppHandle`) can supply
/// the `AppHandle`-tolerant `dial::read_status`/`sleep::read_remaining_seconds`
/// instead — mirrors the existing `dial::current_status`/`dial::read_status`
/// split.
fn build_snapshot(
    app: &AppHandle,
    dial: DialStatus,
    sleep_remaining_seconds: Option<u64>,
) -> SettingsSnapshot {
    SettingsSnapshot {
        settings: load_settings(app),
        dial,
        sleep_remaining_seconds,
        hardware_decoding_restart_required: crate::hardware_decoding_restart_required(app),
    }
}

/// Full `window.__LALIN_SETTINGS__` init-script payload: the snapshot above
/// (flattened, so the wire shape is still the flat
/// `{ lang, version, settings, dial, sleepRemainingSeconds, hardwareDecodingRestartRequired }`
/// object the contract describes) plus the fields only the settings page's
/// initial render needs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInitPayload {
    lang: &'static str,
    version: &'static str,
    #[serde(flatten)]
    snapshot: SettingsSnapshot,
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
        sleep_timer_minutes: crate::read_u32_setting_or(app, KEY_SLEEP_TIMER_MINUTES, 0),
        codec_filter: crate::read_string_setting_or(app, KEY_CODEC_FILTER, "off"),
        hardware_decoding: crate::read_bool_setting_or(app, KEY_HARDWARE_DECODING, true),
        touch_overlay: crate::read_bool_setting_or(app, KEY_TOUCH_OVERLAY, true),
        // Session-only: read live from window_mode's managed state, never
        // from the store (see the struct doc comment above).
        mini_player: window_mode::is_mini(app),
        start_with_windows: crate::read_bool_setting_or(app, KEY_START_WITH_WINDOWS, false),
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
        KEY_SLEEP_TIMER_MINUTES => {
            next.sleep_timer_minutes = sleep::validate_sleep_minutes(value).ok_or_else(|| {
                "sleepTimerMinutes must be one of 0, 15, 30, 60, 90, 120".to_owned()
            })?;
        }
        KEY_CODEC_FILTER => {
            let filter = value
                .as_str()
                .ok_or_else(|| "codecFilter must be a string".to_owned())?;
            if filter != "off" && filter != "h264" {
                return Err("codecFilter must be \"off\" or \"h264\"".to_owned());
            }
            next.codec_filter = filter.to_owned();
        }
        KEY_HARDWARE_DECODING => {
            next.hardware_decoding = value
                .as_bool()
                .ok_or_else(|| "hardwareDecoding must be a boolean".to_owned())?;
        }
        KEY_TOUCH_OVERLAY => {
            next.touch_overlay = value
                .as_bool()
                .ok_or_else(|| "touchOverlay must be a boolean".to_owned())?;
        }
        KEY_MINI_PLAYER => {
            next.mini_player = value
                .as_bool()
                .ok_or_else(|| "miniPlayer must be a boolean".to_owned())?;
        }
        KEY_START_WITH_WINDOWS => {
            next.start_with_windows = value
                .as_bool()
                .ok_or_else(|| "startWithWindows must be a boolean".to_owned())?;
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
        snapshot: build_snapshot(
            app,
            dial::read_status(app),
            sleep::read_remaining_seconds(app),
        ),
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
    sleep_state: State<'_, sleep::SleepState>,
) -> Result<SettingsSnapshot, String> {
    if window.label() != SETTINGS_LABEL {
        return Err("settings_get is only available from the settings window".to_owned());
    }
    Ok(build_snapshot(
        window.app_handle(),
        dial::current_status(&dial_state),
        sleep::remaining_seconds(&sleep_state),
    ))
}

/// Validates and applies one settings change end to end: whitelist/type
/// check via [`apply_setting`], persist exactly the changed key, then run
/// that key's side effect per the contract table (`language` rebuilds the
/// media menu and tray and re-emits prefs; `dialFriendlyName` asks the DIAL
/// supervisor to rebind; `fullscreen`/`keepOnTop` apply to the media window
/// immediately; `pauseOnBlur`/`controllerEnabled`/`touchOverlay` re-emit
/// prefs; `setupCompleted`/`codecFilter`/`hardwareDecoding` are save-only
/// (`codecFilter` additionally re-emits prefs — it only takes effect after
/// the page reloads, but the page still needs the new value to apply on its
/// next load); `sleepTimerMinutes` hands off to `sleep::schedule`;
/// `miniPlayer` toggles mini-player mode when it differs from the current
/// state and is never itself persisted).
#[tauri::command]
pub fn settings_set(
    key: String,
    value: Value,
    window: Window,
    dial_state: State<'_, dial::DialState>,
    sleep_state: State<'_, sleep::SleepState>,
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
            if next.fullscreen {
                window_mode::leave_mini_if_active(app);
            }
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
        KEY_SLEEP_TIMER_MINUTES => {
            // `sleep::schedule` itself persists `sleepTimerMinutes` (both
            // for a schedule and a cancel) and — for a non-zero value —
            // starts the tick thread; nothing else to save here.
            sleep::schedule(app, next.sleep_timer_minutes);
        }
        KEY_CODEC_FILTER => {
            crate::write_string_setting(app, KEY_CODEC_FILTER, &next.codec_filter);
            // The page cannot apply a codec filter change without a reload
            // (per the contract), but it still needs the new value ready
            // for whenever that reload happens.
            crate::emit_prefs(app);
        }
        KEY_HARDWARE_DECODING => {
            // Save-only: `additional_browser_args` is fixed at window-build
            // time, so this cannot take effect until the app restarts (see
            // `hardware_decoding_restart_required`, reflected in the
            // snapshot returned below).
            crate::write_bool_setting(app, KEY_HARDWARE_DECODING, next.hardware_decoding);
        }
        KEY_TOUCH_OVERLAY => {
            crate::write_bool_setting(app, KEY_TOUCH_OVERLAY, next.touch_overlay);
            crate::emit_prefs(app);
        }
        // Never persisted (session-only); only acts when the requested
        // value actually differs from the live state, so a redundant
        // `settings_set("miniPlayer", true)` while already mini is a
        // no-op rather than toggling back off.
        KEY_MINI_PLAYER if window_mode::is_mini(app) != next.mini_player => {
            window_mode::toggle_mini(app);
        }
        KEY_MINI_PLAYER => {}
        // Persist only on success: a `reg.exe` failure must surface as an
        // `Err` from this command (so the page shows an inline error) and
        // must never leave the store claiming a state that was not
        // actually reached in the registry.
        KEY_START_WITH_WINDOWS => {
            autostart::set_enabled(next.start_with_windows)
                .map_err(|error| format!("could not update Windows startup: {error}"))?;
            crate::write_bool_setting(app, KEY_START_WITH_WINDOWS, next.start_with_windows);
        }
        _ => {
            // `apply_setting` already rejected every key outside the whitelist;
            // never panic in a handler reachable from page-supplied input.
        }
    }

    // Re-read from the store/live state rather than trusting `next`
    // directly: every side effect above that persists a value writes
    // exactly what `next` already holds, but `miniPlayer` deliberately
    // never persists (its truth lives only in `window_mode::MiniPlayerState`,
    // and a `toggle_mini` call above can no-op if the media window happens
    // to be gone), so the response should always reflect what is actually
    // true now, not merely what was requested.
    Ok(build_snapshot(
        app,
        dial::current_status(&dial_state),
        sleep::remaining_seconds(&sleep_state),
    ))
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

/// Builds `diagnostics.rs`'s eleven-key settings snapshot for the
/// `settings_diagnostics` command. Lives here (rather than in
/// `diagnostics.rs`) so [`Settings`]'s fields never need to become `pub`
/// just to be read by another module — this is the one place already
/// allowed to see them.
pub(crate) fn diagnostics_settings(app: &AppHandle) -> diagnostics::DiagnosticsSettings {
    let settings = load_settings(app);
    diagnostics::DiagnosticsSettings {
        fullscreen: settings.fullscreen,
        keep_on_top: settings.keep_on_top,
        pause_on_blur: settings.pause_on_blur,
        controller_enabled: settings.controller_enabled,
        sleep_timer_minutes: settings.sleep_timer_minutes,
        codec_filter: settings.codec_filter,
        hardware_decoding: settings.hardware_decoding,
        hardware_decoding_restart_required: crate::hardware_decoding_restart_required(app),
        touch_overlay: settings.touch_overlay,
        start_with_windows: settings.start_with_windows,
        mini_player: settings.mini_player,
    }
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
            sleep_timer_minutes: 0,
            codec_filter: "off".to_owned(),
            hardware_decoding: true,
            touch_overlay: true,
            mini_player: false,
            start_with_windows: false,
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
    fn rejects_window_bounds_which_is_rust_only_and_never_page_writable() {
        // `windowBounds` is never a `Settings` field — it is written only by
        // `window_bounds.rs` straight to the store — so `apply_setting`
        // rejects it exactly like any other unrecognized key.
        assert!(apply_setting(
            "windowBounds",
            &json!({"x": 0, "y": 0, "width": 1200, "height": 675}),
            &base()
        )
        .is_err());
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
        assert!(apply_setting("sleepTimerMinutes", &json!("15"), &base()).is_err());
        assert!(apply_setting("codecFilter", &json!(123), &base()).is_err());
        assert!(apply_setting("hardwareDecoding", &json!("yes"), &base()).is_err());
        assert!(apply_setting("touchOverlay", &json!("yes"), &base()).is_err());
        assert!(apply_setting("miniPlayer", &json!("yes"), &base()).is_err());
        assert!(apply_setting("startWithWindows", &json!("yes"), &base()).is_err());
        assert!(apply_setting("startWithWindows", &json!(null), &base()).is_err());
    }

    #[test]
    fn rejects_a_sleep_timer_minutes_value_outside_the_set() {
        assert!(apply_setting("sleepTimerMinutes", &json!(45), &base()).is_err());
        assert!(apply_setting("sleepTimerMinutes", &json!(-15), &base()).is_err());
        assert!(apply_setting("sleepTimerMinutes", &json!(15.5), &base()).is_err());
        for minutes in [0, 15, 30, 60, 90, 120] {
            let ok = apply_setting("sleepTimerMinutes", &json!(minutes), &base())
                .unwrap_or_else(|_| panic!("{minutes} should be accepted"));
            assert_eq!(ok.sleep_timer_minutes, minutes);
        }
    }

    #[test]
    fn rejects_a_codec_filter_outside_off_or_h264() {
        assert!(apply_setting("codecFilter", &json!("vp9"), &base()).is_err());
        assert!(apply_setting("codecFilter", &json!("H264"), &base()).is_err());
        assert!(apply_setting("codecFilter", &json!(""), &base()).is_err());
        let ok = apply_setting("codecFilter", &json!("h264"), &base()).expect("h264 accepted");
        assert_eq!(ok.codec_filter, "h264");
        let ok = apply_setting("codecFilter", &json!("off"), &base()).expect("off accepted");
        assert_eq!(ok.codec_filter, "off");
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

        let next = apply_setting("hardwareDecoding", &json!(false), &current).expect("valid bool");
        assert!(!next.hardware_decoding);
        assert_eq!(next.touch_overlay, current.touch_overlay);
        assert_eq!(next.mini_player, current.mini_player);
        assert_eq!(next.sleep_timer_minutes, current.sleep_timer_minutes);
        assert_eq!(next.codec_filter, current.codec_filter);

        let next = apply_setting("touchOverlay", &json!(false), &current).expect("valid bool");
        assert!(!next.touch_overlay);

        let next = apply_setting("miniPlayer", &json!(true), &current).expect("valid bool");
        assert!(next.mini_player);

        let next = apply_setting("startWithWindows", &json!(true), &current).expect("valid bool");
        assert!(next.start_with_windows);
        assert_eq!(next.mini_player, current.mini_player);
    }
}
