mod dial;
mod i18n;
mod launch;
mod network;
mod settings;
mod setup;
mod status;
mod surface;
mod tray;
mod updater;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::{Emitter, Listener, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

pub(crate) const MEDIA_LABEL: &str = "media";
const MEDIA_TITLE: &str = "Lalin Cast";
const WINDOW_TITLE_SEPARATOR: &str = " — ";
const WINDOW_TITLE_MAX_CHARS: usize = 120;
const LEANBACK_URL: &str = "https://www.youtube.com/tv";
const USER_AGENT: &str = concat!(
    "Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; LalinCast/",
    env!("CARGO_PKG_VERSION")
);
const INJECTED_SCRIPT: &str = include_str!("../injected.js");

/// Rust → page: `{ lang, controllerEnabled, pauseOnBlur }`, emitted to the
/// `media` window whenever one of those settings changes from the settings
/// window. Never carries `deepLink` — that only ever travels once, in the
/// `__LALIN_PREFS__` init script or on [`DEEPLINK_EVENT`].
const PREFS_EVENT: &str = "lalin-cast-prefs";
/// Rust → page: `{ url }`, emitted to the `media` window when a running
/// instance receives a launch URL via the single-instance callback.
const DEEPLINK_EVENT: &str = "lalin-cast-deeplink";
/// Page → Rust: `{ action: "toggle-fullscreen" | "open-settings" }`, emitted
/// by `injected.js` for Ctrl+O / F11 / controller R3. Validated against a
/// two-action whitelist and rate-limited (see [`register_shell_listener`]).
const SHELL_EVENT: &str = "lalin-cast-shell";
const SHELL_RATE_LIMIT: Duration = Duration::from_millis(500);

/// Builds the "Lalin Cast — {document title}" window title, capped at
/// [`WINDOW_TITLE_MAX_CHARS`] characters (counted, not bytes, so a capped
/// Thai title never splits a multi-byte character). An empty/whitespace-only
/// document title falls back to the bare app name.
fn window_title(document_title: &str) -> String {
    let trimmed = document_title.trim();
    if trimmed.is_empty() {
        return MEDIA_TITLE.to_owned();
    }
    let full = format!("{MEDIA_TITLE}{WINDOW_TITLE_SEPARATOR}{trimmed}");
    if full.chars().count() <= WINDOW_TITLE_MAX_CHARS {
        full
    } else {
        full.chars().take(WINDOW_TITLE_MAX_CHARS).collect()
    }
}

/// `window.__LALIN_PREFS__` init-script payload — the only place `deepLink`
/// travels as part of prefs (a running instance instead gets it via
/// [`DEEPLINK_EVENT`]). Field names match the contract's camelCase exactly;
/// `serde_json::to_string` both orders and JSON-escapes every value, so the
/// generated script is always syntactically safe to embed.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrefsPayload {
    lang: &'static str,
    controller_enabled: bool,
    pause_on_blur: bool,
    deep_link: Option<String>,
}

impl PrefsPayload {
    fn init_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "null".to_owned());
        format!("window.__LALIN_PREFS__ = {json};")
    }
}

/// [`PREFS_EVENT`] payload: prefs without `deepLink` (that only ever travels
/// once, at window creation or via [`DEEPLINK_EVENT`]).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrefsEventPayload {
    lang: &'static str,
    controller_enabled: bool,
    pause_on_blur: bool,
}

/// Emits the current `lang`/`controllerEnabled`/`pauseOnBlur` to the `media`
/// window on [`PREFS_EVENT`]. Called from `settings::settings_set` after any
/// of those three settings changes.
pub(crate) fn emit_prefs(app: &tauri::AppHandle) {
    let lang = i18n::load(app);
    let payload = PrefsEventPayload {
        lang: lang.store_value(),
        controller_enabled: read_bool_setting_or(app, "controllerEnabled", true),
        pause_on_blur: read_bool_setting_or(app, "pauseOnBlur", false),
    };
    let _ = app.emit_to(MEDIA_LABEL, PREFS_EVENT, &payload);
}

/// [`DEEPLINK_EVENT`] payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeepLinkEventPayload {
    url: String,
}

/// One `lalin-cast-shell` action, per the two-action whitelist in the
/// contract. Anything else in the payload's `action` field is discarded by
/// [`parse_shell_action`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShellAction {
    ToggleFullscreen,
    OpenSettings,
}

#[derive(Deserialize)]
struct ShellEventPayload {
    action: String,
}

/// Validates a raw `lalin-cast-shell` JSON payload against the whitelist.
/// Any violation (an unrecognized action, malformed JSON) returns `None`
/// rather than a partially-trusted value — mirrors `surface::validate_surface_event`.
fn parse_shell_action(payload: &str) -> Option<ShellAction> {
    let raw: ShellEventPayload = serde_json::from_str(payload).ok()?;
    match raw.action.as_str() {
        "toggle-fullscreen" => Some(ShellAction::ToggleFullscreen),
        "open-settings" => Some(ShellAction::OpenSettings),
        _ => None,
    }
}

/// 500 ms rate limiter for [`SHELL_EVENT`], shaped like
/// `surface::SurfaceRateLimiter` but reusing its pure decision function
/// (`surface::rate_limit_allows`) rather than duplicating that logic.
struct ShellRateLimiter {
    last: Mutex<Option<Instant>>,
}

impl ShellRateLimiter {
    fn new() -> Self {
        Self {
            last: Mutex::new(None),
        }
    }

    fn allow(&self) -> bool {
        let now = Instant::now();
        match self.last.lock() {
            Ok(mut guard) => {
                if surface::rate_limit_allows(*guard, now, SHELL_RATE_LIMIT) {
                    *guard = Some(now);
                    true
                } else {
                    false
                }
            }
            // Poisoned: degrade to "always allow" rather than permanently
            // blocking every future shell action.
            Err(_) => true,
        }
    }
}

/// Registers the app-wide listener for [`SHELL_EVENT`]: validates the
/// payload against the two-action whitelist, applies the 500 ms rate
/// limiter, and dispatches. `toggle-fullscreen` toggles the `media` window
/// and persists the new value (mirrors the media menu's own
/// `toggle-fullscreen` item); `open-settings` opens the settings window.
fn register_shell_listener(app: &tauri::AppHandle) {
    let limiter = ShellRateLimiter::new();
    let app_handle = app.clone();
    app.listen(SHELL_EVENT, move |event| {
        let Some(action) = parse_shell_action(event.payload()) else {
            return;
        };
        if !limiter.allow() {
            return;
        }
        match action {
            ShellAction::ToggleFullscreen => {
                if let Some(window) = app_handle.get_webview_window(MEDIA_LABEL) {
                    if let Ok(current) = window.is_fullscreen() {
                        let next = !current;
                        let _ = window.set_fullscreen(next);
                        write_bool_setting(&app_handle, "fullscreen", next);
                    }
                }
            }
            ShellAction::OpenSettings => settings::open_settings_window(&app_handle),
        }
    });
}

pub(crate) fn focus_media(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MEDIA_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn seed_settings(app: &tauri::AppHandle) {
    let Ok(store) = app.store("media-settings.json") else {
        eprintln!("Lalin Cast: settings store unavailable; using defaults for this run");
        return;
    };

    if store.get("fullscreen").is_none() {
        store.set("fullscreen", false);
    }
    if store.get("keepOnTop").is_none() {
        store.set("keepOnTop", false);
    }
    // Wave 3 store keys: controllerEnabled defaults to on (gamepad support
    // should work out of the box), pauseOnBlur defaults to off (matches the
    // pre-wave-3 behavior of never pausing).
    if store.get("controllerEnabled").is_none() {
        store.set("controllerEnabled", true);
    }
    if store.get("pauseOnBlur").is_none() {
        store.set("pauseOnBlur", false);
    }
    // adFilterMode was seeded by earlier builds but never implemented; drop the
    // stale key so upgraded installs do not keep a setting that does nothing.
    if store.get("adFilterMode").is_some() {
        store.delete("adFilterMode");
    }

    if let Err(error) = store.save() {
        eprintln!("Lalin Cast: settings store could not be saved: {error}");
    }
}

/// Reads a boolean setting, falling back to `default` when the key is
/// missing, the value is not a bool, or the store itself is unavailable.
pub(crate) fn read_bool_setting_or(app: &tauri::AppHandle, key: &str, default: bool) -> bool {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| store.get(key).and_then(|value| value.as_bool()))
        .unwrap_or(default)
}

fn read_bool_setting(app: &tauri::AppHandle, key: &str) -> bool {
    read_bool_setting_or(app, key, false)
}

pub(crate) fn write_bool_setting(app: &tauri::AppHandle, key: &str, value: bool) {
    if let Ok(store) = app.store("media-settings.json") {
        store.set(key, value);
        let _ = store.save();
    }
}

pub(crate) fn write_string_setting(app: &tauri::AppHandle, key: &str, value: &str) {
    if let Ok(store) = app.store("media-settings.json") {
        store.set(key, value);
        let _ = store.save();
    }
}

/// Builds the media window's menu, localized to `lang`. Reused both at
/// window creation and when the language toggle rebuilds the menu in place.
pub(crate) fn build_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    lang: i18n::Lang,
) -> tauri::Result<Menu<R>> {
    let fullscreen_item = MenuItemBuilder::with_id(
        "toggle-fullscreen",
        i18n::t(lang, i18n::Key::ToggleFullscreen),
    )
    .build(app)?;
    let keep_on_top_item =
        MenuItemBuilder::with_id("toggle-on-top", i18n::t(lang, i18n::Key::ToggleOnTop))
            .build(app)?;
    let reload_item =
        MenuItemBuilder::with_id("reload", i18n::t(lang, i18n::Key::Reload)).build(app)?;
    let update_item =
        MenuItemBuilder::with_id("check-updates", i18n::t(lang, i18n::Key::CheckUpdates))
            .build(app)?;
    let network_setup_item =
        MenuItemBuilder::with_id("network-setup", i18n::t(lang, i18n::Key::NetworkSetup))
            .build(app)?;
    let settings_item =
        MenuItemBuilder::with_id("settings", i18n::t(lang, i18n::Key::OpenSettings)).build(app)?;
    let language_item =
        MenuItemBuilder::with_id("toggle-language", i18n::t(lang, i18n::Key::ToggleLanguage))
            .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", i18n::t(lang, i18n::Key::Quit)).build(app)?;

    MenuBuilder::new(app)
        .items(&[
            &fullscreen_item,
            &keep_on_top_item,
            &reload_item,
            &update_item,
            &network_setup_item,
            &settings_item,
            &language_item,
            &quit_item,
        ])
        .build()
}

fn build_media_window(
    app: &tauri::AppHandle,
    launch: &launch::LaunchOptions,
) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window(MEDIA_LABEL).is_some() {
        focus_media(app);
        return Ok(());
    }

    let url = tauri::Url::parse(LEANBACK_URL).expect("LEANBACK_URL must be valid");
    // `--fullscreen` forces fullscreen for this run only (never persisted):
    // OR-ing it with the stored setting achieves "force" without writing it
    // back, so the next plain launch reverts to whatever was saved.
    let fullscreen = launch.fullscreen || read_bool_setting(app, "fullscreen");
    let keep_on_top = read_bool_setting(app, "keepOnTop");
    let lang = i18n::load(app);
    let menu = build_menu(app, lang)?;
    let prefs_script = PrefsPayload {
        lang: lang.store_value(),
        controller_enabled: read_bool_setting_or(app, "controllerEnabled", true),
        pause_on_blur: read_bool_setting_or(app, "pauseOnBlur", false),
        deep_link: launch.deep_link.as_ref().map(launch::DeepLink::canonical),
    }
    .init_script();

    let window = WebviewWindowBuilder::new(app, MEDIA_LABEL, WebviewUrl::External(url))
        .title(MEDIA_TITLE)
        .inner_size(1200.0, 675.0)
        .min_inner_size(720.0, 405.0)
        .resizable(true)
        .fullscreen(fullscreen)
        .always_on_top(keep_on_top)
        .menu(menu)
        .on_menu_event(|window, event| match event.id().as_ref() {
            "toggle-fullscreen" => {
                if let Ok(current) = window.is_fullscreen() {
                    let next = !current;
                    let _ = window.set_fullscreen(next);
                    write_bool_setting(window.app_handle(), "fullscreen", next);
                }
            }
            "toggle-on-top" => {
                if let Ok(current) = window.is_always_on_top() {
                    let next = !current;
                    let _ = window.set_always_on_top(next);
                    write_bool_setting(window.app_handle(), "keepOnTop", next);
                }
            }
            "reload" => {
                if let Some(webview) = window.app_handle().get_webview_window(MEDIA_LABEL) {
                    let _ = webview.reload();
                }
            }
            "check-updates" => {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    updater::run_check(&app_handle, true).await;
                });
            }
            "network-setup" => setup::open_setup_window(window.app_handle()),
            "settings" => settings::open_settings_window(window.app_handle()),
            "toggle-language" => {
                let app_handle = window.app_handle().clone();
                let next = i18n::load(&app_handle).other();
                i18n::save(&app_handle, next);
                match build_menu(&app_handle, next) {
                    Ok(menu) => {
                        let _ = window.set_menu(menu);
                    }
                    Err(error) => {
                        eprintln!("Lalin Cast: could not rebuild the menu: {error}");
                    }
                }
                tray::rebuild_menu(&app_handle, next);
            }
            "quit" => window.app_handle().exit(0),
            _ => {}
        })
        .user_agent(USER_AGENT)
        // Registered before INJECTED_SCRIPT (init scripts run in the order
        // they were added — see tauri::webview::WebviewBuilder), so
        // `window.__LALIN_PREFS__` already exists by the time injected.js's
        // IIFE runs and reads it.
        .initialization_script(&prefs_script)
        .initialization_script(INJECTED_SCRIPT)
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&window_title(&title));
        })
        .build()?;

    // Closing the media window means quitting Lalin Cast even while a helper
    // window (update/setup/status) is still open; Tauri would otherwise keep
    // the process alive with only the tray icon and that helper window.
    let exit_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            exit_app.exit(0);
        }
    });

    window.show()?;
    updater::schedule_startup_check(app);
    setup::schedule_auto_open(app);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Parsed and checked before the Tauri builder is constructed at all, so
    // `--version` never spawns a window, the tray, or DIAL.
    let raw_args: Vec<String> = std::env::args().collect();
    let launch_options = launch::parse_cli(&raw_args);
    if launch_options.version {
        // Release builds carry `windows_subsystem = "windows"` (no console),
        // so attach to the parent terminal first; without this the line is
        // silently discarded. Failing to attach (no parent console) is
        // harmless.
        #[cfg(windows)]
        // SAFETY: `AttachConsole` takes a plain process id constant and has
        // no memory-safety preconditions; its return value only reports
        // whether a console was attached.
        unsafe {
            use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
            let _ = AttachConsole(ATTACH_PARENT_PROCESS);
        }
        println!("lalin-cast {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second launch's args carry the same shape as our own
            // `std::env::args()` (program name at index 0 — see
            // `launch::parse_cli`'s doc comment), so the same parser applies
            // unchanged.
            let launch = launch::parse_cli(&args);
            focus_media(app);
            if launch.fullscreen {
                if let Some(media) = app.get_webview_window(MEDIA_LABEL) {
                    let _ = media.set_fullscreen(true);
                }
            }
            if let Some(deep_link) = launch.deep_link {
                let payload = DeepLinkEventPayload {
                    url: deep_link.canonical(),
                };
                let _ = app.emit_to(MEDIA_LABEL, DEEPLINK_EVENT, &payload);
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            seed_settings(app.handle());
            // Built before `dial::start` so the tray's dial-status listener
            // is already registered when the very first
            // `lalin-cast-dial-status` event fires.
            if let Err(error) = tray::build(app.handle()) {
                eprintln!("Lalin Cast: could not build the tray icon: {error}");
            }
            match dial::start(app.handle()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(error) => {
                    eprintln!("Lalin Cast: DIAL is unavailable: {error}");
                    app.manage(dial::disabled_state(app.handle(), error));
                }
            }
            surface::register_surface_listener(app.handle());
            register_shell_listener(app.handle());
            status::schedule_startup_probe(app.handle());
            build_media_window(app.handle(), &launch_options)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dial::dial_respond,
            dial::dial_set_device_id,
            updater::cast_update_install,
            setup::setup_refresh,
            setup::setup_open_network_settings,
            setup::setup_complete,
            status::status_retry,
            status::status_quit,
            settings::settings_get,
            settings::settings_set,
            settings::settings_open_setup,
            settings::settings_check_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lalin Cast");
}

#[cfg(test)]
mod tests {
    use super::{parse_shell_action, window_title, ShellAction};

    #[test]
    fn falls_back_to_bare_app_name_for_empty_or_whitespace_title() {
        assert_eq!(window_title(""), "Lalin Cast");
        assert_eq!(window_title("   "), "Lalin Cast");
    }

    #[test]
    fn prefixes_a_non_empty_document_title() {
        assert_eq!(
            window_title("Some Video - YouTube"),
            "Lalin Cast — Some Video - YouTube"
        );
    }

    #[test]
    fn caps_the_combined_title_at_120_characters_without_splitting_utf8() {
        let long_title = "ก".repeat(200);
        let title = window_title(&long_title);
        assert_eq!(title.chars().count(), 120);
        assert!(title.starts_with("Lalin Cast — "));
    }

    #[test]
    fn user_agent_and_app_agent_carry_the_current_cargo_version_and_no_vacuumtube() {
        let version = env!("CARGO_PKG_VERSION");
        assert!(super::USER_AGENT.contains(&format!("LalinCast/{version}")));
        assert!(!super::USER_AGENT.to_lowercase().contains("vacuumtube"));
    }

    #[test]
    fn shell_action_whitelist_accepts_only_the_two_documented_actions() {
        assert_eq!(
            parse_shell_action(r#"{"action":"toggle-fullscreen"}"#),
            Some(ShellAction::ToggleFullscreen)
        );
        assert_eq!(
            parse_shell_action(r#"{"action":"open-settings"}"#),
            Some(ShellAction::OpenSettings)
        );
    }

    #[test]
    fn shell_action_rejects_unknown_actions_and_malformed_payloads() {
        assert_eq!(parse_shell_action(r#"{"action":"quit"}"#), None);
        assert_eq!(parse_shell_action(r#"{"action":""}"#), None);
        assert_eq!(parse_shell_action("not json"), None);
        assert_eq!(parse_shell_action(""), None);
        assert_eq!(parse_shell_action(r#"{"other":"x"}"#), None);
    }
}
