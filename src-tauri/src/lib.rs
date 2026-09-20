mod autostart;
mod diagnostics;
mod dial;
mod i18n;
mod launch;
mod lifecycle;
mod network;
mod settings;
mod setup;
mod sleep;
mod status;
mod surface;
mod tray;
mod updater;
mod window_bounds;
mod window_mode;

use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::{Emitter, Listener, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

pub(crate) const MEDIA_LABEL: &str = "media";
const MEDIA_TITLE: &str = "Lalin Cast";
/// Minimum inner size of the media window (logical pixels). Shared with
/// `window_mode` so mini-player can relax and later restore it.
pub(crate) const MEDIA_MIN_WIDTH: f64 = 720.0;
pub(crate) const MEDIA_MIN_HEIGHT: f64 = 405.0;
const WINDOW_TITLE_SEPARATOR: &str = " — ";
const WINDOW_TITLE_MAX_CHARS: usize = 120;
const LEANBACK_URL: &str = "https://www.youtube.com/tv";
const USER_AGENT: &str = concat!(
    "Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; LalinCast/",
    env!("CARGO_PKG_VERSION")
);
const INJECTED_SCRIPT: &str = include_str!("../injected.js");
/// Browser arguments used for the `media` window when `hardwareDecoding` is
/// `false`, applied once at window build time (a change to the setting only
/// takes effect after the app restarts — see `hardware_decoding_restart_required`).
///
/// Reading tauri 2.11.5's doc comment on `WebviewWindowBuilder::additional_browser_args`
/// (`webview/webview_window.rs`) confirms this call **replaces** wry's
/// default argument string rather than appending to it. wry 0.55.1's
/// `WebViewAttributes::default()` (`src/lib.rs:843`) defaults `autoplay:
/// true`, and its `webview2::mod::new` (`src/webview2/mod.rs:294-320`)
/// appends `--autoplay-policy=no-user-gesture-required` to the default
/// browser-arg string whenever `attributes.autoplay` is true — in addition
/// to `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`.
/// Lalin Cast never calls `.autoplay(false)` (grep confirms it — see
/// above), so that autoplay flag is part of the default string every
/// earlier wave has shipped. The constant below therefore repeats wry's
/// full default — both switches — and appends
/// `--disable-accelerated-video-decode`, rather than passing the new flag
/// alone and silently losing the "no WebView2 mini menu / no SmartScreen
/// prompt / autoplay without a user gesture" behavior every other build
/// gets for free.
const HARDWARE_DECODING_DISABLED_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --disable-accelerated-video-decode";

/// Rust → page: `{ lang, controllerEnabled, pauseOnBlur, codecFilter, touchOverlay }`,
/// emitted to the `media` window whenever one of those settings changes from
/// the settings window. Never carries `deepLink` — that only ever travels
/// once, in the `__LALIN_PREFS__` init script or on [`DEEPLINK_EVENT`].
const PREFS_EVENT: &str = "lalin-cast-prefs";
/// Rust → page: `{ url }`, emitted to the `media` window when a running
/// instance receives a launch URL via the single-instance callback.
const DEEPLINK_EVENT: &str = "lalin-cast-deeplink";
/// Page → Rust: `{ action: "toggle-fullscreen" | "open-settings" | "toggle-mini" }`,
/// emitted by `injected.js` for Ctrl+O / F11 / controller R3 / Ctrl+Shift+M.
/// Validated against a three-action whitelist and rate-limited (see
/// [`register_shell_listener`]).
const SHELL_EVENT: &str = "lalin-cast-shell";
const SHELL_RATE_LIMIT: Duration = Duration::from_millis(500);

/// Page → Rust: `{ state: "playing" | "paused" | "idle", title: string }`,
/// emitted by `injected.js` from `navigator.mediaSession?.metadata?.title`
/// whenever any `<video>` fires `play`/`pause`/`ended`/`emptied` (Wave 5
/// now-playing contract). Validated (whitelisted `state`, control
/// characters stripped, ≤120 characters) and rate-limited like
/// [`SHELL_EVENT`], via [`register_media_listener`].
const MEDIA_EVENT: &str = "lalin-cast-media";
const MEDIA_RATE_LIMIT: Duration = Duration::from_millis(250);
const MEDIA_TITLE_MAX_CHARS: usize = 120;

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
    codec_filter: String,
    touch_overlay: bool,
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
    codec_filter: String,
    touch_overlay: bool,
}

/// Emits the current `lang`/`controllerEnabled`/`pauseOnBlur`/`codecFilter`/
/// `touchOverlay` to the `media` window on [`PREFS_EVENT`]. Called from
/// `settings::settings_set` after any of those settings changes.
pub(crate) fn emit_prefs(app: &tauri::AppHandle) {
    let lang = i18n::load(app);
    let payload = PrefsEventPayload {
        lang: lang.store_value(),
        controller_enabled: read_bool_setting_or(app, "controllerEnabled", true),
        pause_on_blur: read_bool_setting_or(app, "pauseOnBlur", false),
        codec_filter: read_string_setting_or(app, "codecFilter", "off"),
        touch_overlay: read_bool_setting_or(app, "touchOverlay", true),
    };
    let _ = app.emit_to(MEDIA_LABEL, PREFS_EVENT, &payload);
}

/// [`DEEPLINK_EVENT`] payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeepLinkEventPayload {
    url: String,
}

/// Managed once, at `build_media_window` time, with whatever
/// `hardwareDecoding` value that build actually used for
/// `additional_browser_args`. `settings::hardware_decoding_restart_required`
/// compares this against the live store value: they can only diverge after
/// the user flips the toggle in Settings, since nothing else ever writes
/// `hardwareDecoding`, and — unlike `fullscreen`/`keepOnTop` — there is no
/// live window API to change a webview's browser args after it was built.
pub(crate) struct HardwareDecodingUsed(pub(crate) AtomicBool);

/// Whether the settings window should tell the user that a
/// `hardwareDecoding` change needs an app restart to take effect: `true`
/// when the live store value no longer matches what the `media` window was
/// actually built with. Before the media window exists at all — the very
/// brief window between the `setup` hook starting and `build_media_window`
/// returning — the built-with value is assumed to be `true` (the store
/// default), so this returns `false` unless the store already says `false`.
pub(crate) fn hardware_decoding_restart_required(app: &tauri::AppHandle) -> bool {
    let used = app
        .try_state::<HardwareDecodingUsed>()
        .map(|state| state.0.load(AtomicOrdering::Relaxed))
        .unwrap_or(true);
    let current = read_bool_setting_or(app, "hardwareDecoding", true);
    used != current
}

/// One `lalin-cast-shell` action, per the three-action whitelist in the
/// contract (`toggle-mini` added in wave 4). Anything else in the payload's
/// `action` field is discarded by [`parse_shell_action`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShellAction {
    ToggleFullscreen,
    OpenSettings,
    ToggleMini,
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
        "toggle-mini" => Some(ShellAction::ToggleMini),
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
/// payload against the three-action whitelist, applies the 500 ms rate
/// limiter, and dispatches. `toggle-fullscreen` toggles the `media` window
/// and persists the new value (mirrors the media menu's own
/// `toggle-fullscreen` item); `open-settings` opens the settings window;
/// `toggle-mini` toggles mini-player mode.
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
                        if next {
                            window_mode::leave_mini_if_active(&app_handle);
                        }
                        let _ = window.set_fullscreen(next);
                        write_bool_setting(&app_handle, "fullscreen", next);
                    }
                }
            }
            ShellAction::OpenSettings => settings::open_settings_window(&app_handle),
            ShellAction::ToggleMini => window_mode::toggle_mini(&app_handle),
        }
    });
}

/// One `lalin-cast-media` state value, per the three-value whitelist.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaPlaybackState {
    Playing,
    Paused,
    Idle,
}

#[derive(Deserialize)]
struct RawMediaEventPayload {
    state: String,
    title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MediaEvent {
    state: MediaPlaybackState,
    title: String,
}

/// Validates a raw `lalin-cast-media` JSON payload: `state` must be one of
/// the three whitelisted values; `title` has control characters stripped
/// and is truncated to [`MEDIA_TITLE_MAX_CHARS`] characters (the page caps
/// at 200, so a longer title is kept, never dropped). An unknown state or
/// malformed JSON returns `None`, mirroring
/// `surface::validate_surface_event`/[`parse_shell_action`].
fn validate_media_event(payload: &str) -> Option<MediaEvent> {
    let raw: RawMediaEventPayload = serde_json::from_str(payload).ok()?;
    let state = match raw.state.as_str() {
        "playing" => MediaPlaybackState::Playing,
        "paused" => MediaPlaybackState::Paused,
        "idle" => MediaPlaybackState::Idle,
        _ => return None,
    };
    let title: String = raw
        .title
        .chars()
        .filter(|ch| !ch.is_control())
        .take(MEDIA_TITLE_MAX_CHARS)
        .collect();
    Some(MediaEvent { state, title })
}

/// 250 ms rate limiter for [`MEDIA_EVENT`], shaped exactly like
/// [`ShellRateLimiter`] (reusing `surface::rate_limit_allows`).
struct MediaRateLimiter {
    last: Mutex<Option<Instant>>,
}

impl MediaRateLimiter {
    fn new() -> Self {
        Self {
            last: Mutex::new(None),
        }
    }

    fn allow(&self) -> bool {
        let now = Instant::now();
        match self.last.lock() {
            Ok(mut guard) => {
                if surface::rate_limit_allows(*guard, now, MEDIA_RATE_LIMIT) {
                    *guard = Some(now);
                    true
                } else {
                    false
                }
            }
            Err(_) => true,
        }
    }
}

/// Managed: the two title sources the window title / tray "now playing"
/// line are resolved from (see [`resolve_title_source`]). `media` is set by
/// [`apply_media_event`] to `Some(title)` only while `state != idle` and
/// `title` is non-empty — anything else (idle, or an empty title) clears it
/// back to `None` — so the field itself already encodes "is there a
/// currently-relevant media title", with no separate playback-state field
/// needed. `document` is set by the media window's `on_document_title_changed`
/// hook, unconditionally.
#[derive(Default)]
struct MediaTitleInner {
    media: Option<String>,
    document: Option<String>,
}

#[derive(Default)]
pub(crate) struct MediaTitleState(Mutex<MediaTitleInner>);

/// Pure priority resolution for the window title / tray "now playing" line:
/// the media title wins whenever one is stored, otherwise the last known
/// document title, otherwise an empty string (which `window_title` then
/// turns into the bare app name).
fn resolve_title_source<'a>(media: Option<&'a str>, document: Option<&'a str>) -> &'a str {
    media.or(document).unwrap_or("")
}

/// Applies one validated [`MediaEvent`]: updates [`MediaTitleState`]'s
/// `media` field, recomputes and sets the `media` window's title, and
/// pushes the media title (never the document title) to the tray tooltip's
/// "now playing" line — but only while actually `playing` (never
/// `paused`/`idle`), per the contract.
fn apply_media_event(app: &tauri::AppHandle, event: MediaEvent) {
    let Some(state) = app.try_state::<MediaTitleState>() else {
        return;
    };
    let media_value = if event.state != MediaPlaybackState::Idle && !event.title.trim().is_empty() {
        Some(event.title)
    } else {
        None
    };
    let (source, media_title) = {
        let Ok(mut guard) = state.0.lock() else {
            return;
        };
        guard.media = media_value;
        (
            resolve_title_source(guard.media.as_deref(), guard.document.as_deref()).to_owned(),
            guard.media.clone(),
        )
    };
    if let Some(window) = app.get_webview_window(MEDIA_LABEL) {
        let _ = window.set_title(&window_title(&source));
    }
    // The tray line is the media title only: with no media title, there is
    // nothing "now playing" worth showing, even though the window title
    // still falls back to the document title above.
    let now_playing = if event.state == MediaPlaybackState::Playing {
        media_title
    } else {
        None
    };
    tray::set_now_playing(app, now_playing.as_deref());
}

/// Registers the app-wide listener for [`MEDIA_EVENT`]: validates the
/// payload, applies the 250 ms rate limiter, and — if both pass — applies
/// it via [`apply_media_event`].
fn register_media_listener(app: &tauri::AppHandle) {
    let limiter = MediaRateLimiter::new();
    let app_handle = app.clone();
    app.listen(MEDIA_EVENT, move |event| {
        let Some(parsed) = validate_media_event(event.payload()) else {
            return;
        };
        if !limiter.allow() {
            return;
        }
        apply_media_event(&app_handle, parsed);
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
    // Wave 4 store keys: codecFilter off (no override of the page's own
    // codec negotiation), hardwareDecoding on, touchOverlay on (matches
    // controllerEnabled's "should work out of the box" default).
    if store.get("codecFilter").is_none() {
        store.set("codecFilter", "off");
    }
    if store.get("hardwareDecoding").is_none() {
        store.set("hardwareDecoding", true);
    }
    if store.get("touchOverlay").is_none() {
        store.set("touchOverlay", true);
    }
    // sleepTimerMinutes never survives a restart: a fresh process starts
    // with no live timer thread (see sleep.rs's SleepState, managed fresh
    // on every launch), so a nonzero value left over from a previous run
    // would otherwise show the settings window as "timer set" with no
    // countdown actually running. Unconditionally reset it to 0 — the
    // store-keys contract's own "0 = cancel" — on every startup, not just
    // when the key is missing.
    store.set("sleepTimerMinutes", 0);
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

/// Reads a string setting, falling back to `default` (as an owned `String`)
/// when the key is missing, the value is not a string, or the store itself
/// is unavailable. Used for `codecFilter` (`"off"`/`"h264"`) — `language`
/// and `dialFriendlyName` keep their own dedicated loaders (`i18n::load`,
/// `dial::load_friendly_name`) since both carry extra fallback/sanitizing
/// logic this generic helper does not need to duplicate.
pub(crate) fn read_string_setting_or(app: &tauri::AppHandle, key: &str, default: &str) -> String {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| {
            store
                .get(key)
                .and_then(|value| value.as_str().map(str::to_owned))
        })
        .unwrap_or_else(|| default.to_owned())
}

/// Reads a non-negative integer setting, falling back to `default` when the
/// key is missing, the value is not a non-negative integer that fits a
/// `u32`, or the store itself is unavailable. Used for `sleepTimerMinutes`.
pub(crate) fn read_u32_setting_or(app: &tauri::AppHandle, key: &str, default: u32) -> u32 {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| store.get(key).and_then(|value| value.as_u64()))
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(default)
}

pub(crate) fn write_u32_setting(app: &tauri::AppHandle, key: &str, value: u32) {
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
    let mini_player_item =
        MenuItemBuilder::with_id("mini-player", i18n::t(lang, i18n::Key::MiniPlayer)).build(app)?;
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
            &mini_player_item,
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
        codec_filter: read_string_setting_or(app, "codecFilter", "off"),
        touch_overlay: read_bool_setting_or(app, "touchOverlay", true),
        deep_link: launch.deep_link.as_ref().map(launch::DeepLink::canonical),
    }
    .init_script();

    // Captured once, here, so `settings::hardware_decoding_restart_required`
    // can tell whether the live `hardwareDecoding` setting has since
    // diverged from whatever this window was actually built with — the
    // webview's browser args cannot be changed after the window exists.
    let hardware_decoding = read_bool_setting_or(app, "hardwareDecoding", true);
    app.manage(HardwareDecodingUsed(AtomicBool::new(hardware_decoding)));

    let mut window_builder = WebviewWindowBuilder::new(app, MEDIA_LABEL, WebviewUrl::External(url))
        .title(MEDIA_TITLE)
        .inner_size(1200.0, 675.0)
        .min_inner_size(MEDIA_MIN_WIDTH, MEDIA_MIN_HEIGHT)
        .resizable(true)
        // Fullscreen is deliberately NOT applied here — see the
        // `set_fullscreen` call after `window_bounds` restore below, which
        // must run first so leaving fullscreen later returns to the
        // restored geometry rather than whatever this builder's default
        // `inner_size` happened to be.
        .always_on_top(keep_on_top)
        .menu(menu)
        .on_menu_event(|window, event| match event.id().as_ref() {
            "toggle-fullscreen" => {
                if let Ok(current) = window.is_fullscreen() {
                    let next = !current;
                    if next {
                        window_mode::leave_mini_if_active(window.app_handle());
                    }
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
            "mini-player" => window_mode::toggle_mini(window.app_handle()),
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
            // Stores `title` as the "document" source and resolves the
            // combined media/document title through the same priority rule
            // `apply_media_event` uses (media wins while set) — see
            // `MediaTitleState`'s doc comment.
            let app = window.app_handle();
            let source = match app.try_state::<MediaTitleState>() {
                Some(state) => match state.0.lock() {
                    Ok(mut guard) => {
                        guard.document = Some(title);
                        resolve_title_source(guard.media.as_deref(), guard.document.as_deref())
                            .to_owned()
                    }
                    Err(_) => title,
                },
                None => title,
            };
            let _ = window.set_title(&window_title(&source));
        });

    // `additional_browser_args` is Windows-only (unsupported on
    // macOS/Linux/Android/iOS per its own doc comment) and — see
    // `HARDWARE_DECODING_DISABLED_BROWSER_ARGS` — replaces wry's default
    // args outright, so it is only ever applied when hardware decoding is
    // actually being disabled; the `true` (default) case leaves wry's own
    // default args exactly as every earlier wave already shipped them.
    #[cfg(windows)]
    if !hardware_decoding {
        window_builder =
            window_builder.additional_browser_args(HARDWARE_DECODING_DISABLED_BROWSER_ARGS);
    }

    let window = window_builder.build()?;

    // Restore a saved `windowBounds` (position + size) *before* applying
    // fullscreen, so that leaving fullscreen later returns to the restored
    // geometry rather than the builder's default `inner_size` — see
    // `window_bounds`'s module doc comment and the Wave 5 contract.
    if let Some(bounds) = window_bounds::saved_bounds_for_restore(&window, app) {
        let _ = window.set_position(tauri::PhysicalPosition::new(bounds.x, bounds.y));
        let _ = window.set_size(tauri::PhysicalSize::new(bounds.width, bounds.height));
    }
    let _ = window.set_fullscreen(fullscreen);

    // Closing the media window means quitting Lalin Cast even while a helper
    // window (update/setup/status) is still open; Tauri would otherwise keep
    // the process alive with only the tray icon and that helper window.
    let exit_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            exit_app.exit(0);
        }
    });

    // Separate `on_window_event` registration (window event listeners
    // accumulate rather than replace one another — see
    // `tauri_runtime_wry`'s `AddEventListener`) for `windowBounds` saving:
    // immediately on `CloseRequested`, debounced 1 s on `Moved`/`Resized`.
    let bounds_app = app.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { .. } => {
            window_bounds::save_now(&bounds_app);
        }
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            window_bounds::schedule_debounced_save(&bounds_app);
        }
        _ => {}
    });

    window.show()?;
    // `build_media_window` only ever runs for the very first launch (a
    // second instance is handled entirely by the single-instance callback
    // below), so the fallback here matches the "starting" write's fallback
    // in `run()`'s setup hook — the same launch, the same request id.
    let request_id = launch
        .request_id
        .clone()
        .unwrap_or_else(|| "startup".to_owned());
    lifecycle::write_ready(app, request_id, std::process::id());
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

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second launch's args carry the same shape as our own
            // `std::env::args()` (program name at index 0 — see
            // `launch::parse_cli`'s doc comment), so the same parser applies
            // unchanged.
            let launch = launch::parse_cli(&args);

            // `--lifecycle close` forwarded from a second instance: stop,
            // never focus/deep-link, per the Wave 5 transition table.
            if let Some(lifecycle::NextState::Stopped) =
                launch.lifecycle.map(lifecycle::next_state_for)
            {
                let request_id = launch
                    .request_id
                    .clone()
                    .unwrap_or_else(|| "cli".to_owned());
                lifecycle::write_stopped(app, request_id, 0);
                app.exit(0);
                return;
            }

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

            // `--lifecycle launch|focus` forwarded from a second instance:
            // report `ready` with the forwarded request id once the focus
            // (and any deep link) above has been applied.
            if let Some(lifecycle::NextState::Ready) =
                launch.lifecycle.map(lifecycle::next_state_for)
            {
                let request_id = launch.request_id.unwrap_or_else(|| "cli".to_owned());
                lifecycle::write_ready(app, request_id, std::process::id());
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let handle = app.handle().clone();
            // Managed before anything below can possibly exit early, so
            // `RunEvent::Exit`'s `StoppedMarker` check and every
            // `try_state` lookup in this closure can rely on it being
            // present regardless of which branch runs.
            app.manage(lifecycle::StoppedMarker::default());
            app.manage(lifecycle::LifecycleSummaryState::default());

            // First-launch `--lifecycle close`: write `stopped` and return
            // before any window/tray/DIAL is built, per the Wave 5
            // transition table. (A second instance's `close` is handled
            // entirely by the single-instance callback above; by the time
            // this `setup` hook runs at all, this process is guaranteed to
            // be the only instance.)
            if let Some(lifecycle::NextState::Stopped) =
                launch_options.lifecycle.map(lifecycle::next_state_for)
            {
                let request_id = launch_options
                    .request_id
                    .clone()
                    .unwrap_or_else(|| "cli".to_owned());
                lifecycle::write_stopped(&handle, request_id, 0);
                handle.exit(0);
                return Ok(());
            }

            let starting_request_id = launch_options
                .request_id
                .clone()
                .unwrap_or_else(|| "startup".to_owned());
            lifecycle::write_starting(&handle, starting_request_id);

            seed_settings(app.handle());
            // Managed early (before the tray/media window exist) so every
            // later call site — menu/tray handlers, `lalin-cast-shell`,
            // `settings_set` — can rely on both being present via
            // `app.state()`/`app.try_state()` regardless of call order.
            app.manage(sleep::SleepState::default());
            app.manage(window_mode::MiniPlayerState::default());
            app.manage(window_bounds::BoundsSaveState::default());
            app.manage(status::AutoRetryState::default());
            app.manage(MediaTitleState::default());
            app.manage(tray::NowPlayingState::default());
            // Best-effort: re-add the Run key if the store says it should
            // be there (idempotent — always writes the current exe path).
            // Never blocks or fails startup; a failure here only means the
            // registry value stays whatever it already was.
            if read_bool_setting_or(app.handle(), "startWithWindows", false) {
                if let Err(error) = autostart::set_enabled(true) {
                    eprintln!("Lalin Cast: could not reconcile Windows startup: {error}");
                }
            }
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
            register_media_listener(app.handle());
            status::schedule_startup_probe(app.handle());
            if let Err(error) = build_media_window(app.handle(), &launch_options) {
                let request_id = launch_options
                    .request_id
                    .clone()
                    .unwrap_or_else(|| "startup".to_owned());
                // A fixed message — never the raw error text, which could
                // embed a filesystem path. `code` is what a driver keys off;
                // the details still go to stderr as before.
                eprintln!("Lalin Cast: could not build the media window: {error}");
                lifecycle::write_failed(
                    &handle,
                    request_id,
                    "media-window",
                    "the media window could not be created",
                );
                return Err(error);
            }
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
            settings::settings_check_updates,
            diagnostics::settings_diagnostics
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lalin Cast");

    // `.build(ctx)?.run(...)` (rather than the previous `.run(ctx)`) so
    // `RunEvent::Exit` — fired for every exit path (window close, tray
    // quit, menu quit, a second instance's forwarded `close`) — can write
    // the final `stopped` state exactly once.
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let already_stopped = app_handle
                .try_state::<lifecycle::StoppedMarker>()
                .map(|marker| marker.is_stopped())
                .unwrap_or(false);
            if !already_stopped {
                lifecycle::write_stopped(app_handle, "cli".to_owned(), 0);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        parse_shell_action, resolve_title_source, validate_media_event, window_title,
        MediaPlaybackState, ShellAction,
    };

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
    fn shell_action_whitelist_accepts_only_the_three_documented_actions() {
        assert_eq!(
            parse_shell_action(r#"{"action":"toggle-fullscreen"}"#),
            Some(ShellAction::ToggleFullscreen)
        );
        assert_eq!(
            parse_shell_action(r#"{"action":"open-settings"}"#),
            Some(ShellAction::OpenSettings)
        );
        assert_eq!(
            parse_shell_action(r#"{"action":"toggle-mini"}"#),
            Some(ShellAction::ToggleMini)
        );
    }

    #[test]
    fn shell_action_rejects_unknown_actions_and_malformed_payloads() {
        assert_eq!(parse_shell_action(r#"{"action":"quit"}"#), None);
        assert_eq!(parse_shell_action(r#"{"action":""}"#), None);
        assert_eq!(parse_shell_action("not json"), None);
        assert_eq!(parse_shell_action(""), None);
        assert_eq!(parse_shell_action(r#"{"other":"x"}"#), None);
        // A near-miss of a real action must never fuzzy-match.
        assert_eq!(parse_shell_action(r#"{"action":"toggle-mini "}"#), None);
    }

    // -- lalin-cast-media (Wave 5 now-playing) --

    #[test]
    fn validate_media_event_accepts_every_whitelisted_state() {
        for (raw, expected) in [
            ("playing", MediaPlaybackState::Playing),
            ("paused", MediaPlaybackState::Paused),
            ("idle", MediaPlaybackState::Idle),
        ] {
            let payload = format!(r#"{{"state":"{raw}","title":"Some Video"}}"#);
            let event = validate_media_event(&payload).expect("should validate");
            assert_eq!(event.state, expected);
            assert_eq!(event.title, "Some Video");
        }
    }

    #[test]
    fn validate_media_event_rejects_an_unknown_state_or_malformed_payload() {
        assert_eq!(
            validate_media_event(r#"{"state":"buffering","title":"x"}"#),
            None
        );
        assert_eq!(validate_media_event("not json"), None);
        assert_eq!(validate_media_event(""), None);
        assert_eq!(validate_media_event(r#"{"title":"x"}"#), None);
    }

    #[test]
    fn validate_media_event_strips_control_characters_from_the_title() {
        let payload = "{\"state\":\"playing\",\"title\":\"Some\\tVideo\\r\\n\"}";
        let event = validate_media_event(payload).expect("should validate");
        assert_eq!(event.title, "SomeVideo");
    }

    #[test]
    fn validate_media_event_truncates_a_title_longer_than_120_characters() {
        // The page caps at 200; a 121–200 character title must be kept
        // (truncated), never dropped — and truncation counts characters,
        // never bytes, so a Thai title is not split mid-character.
        let long_title = "ก".repeat(200);
        let payload = format!(r#"{{"state":"playing","title":"{long_title}"}}"#);
        let event = validate_media_event(&payload).expect("a long title is kept, not dropped");
        assert_eq!(event.title.chars().count(), 120);

        let max_title = "a".repeat(120);
        let payload = format!(r#"{{"state":"playing","title":"{max_title}"}}"#);
        assert_eq!(
            validate_media_event(&payload).map(|event| event.title),
            Some(max_title)
        );
    }

    #[test]
    fn resolve_title_source_prefers_media_over_document() {
        assert_eq!(
            resolve_title_source(Some("Now Playing"), Some("Document Title")),
            "Now Playing"
        );
    }

    #[test]
    fn resolve_title_source_falls_back_to_document_then_empty() {
        assert_eq!(
            resolve_title_source(None, Some("Document Title")),
            "Document Title"
        );
        assert_eq!(resolve_title_source(None, None), "");
    }
}
