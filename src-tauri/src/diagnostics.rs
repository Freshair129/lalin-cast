//! Diagnostics snapshot for the settings window's "copy diagnostics" button:
//! a plain English `key: value` text block the user copies and pastes into
//! a bug report themselves (nothing is ever sent anywhere from here). See
//! the Wave 5 plan's diagnostics contract — in particular, everything the
//! contract says must never appear: `dialDeviceId`, any URL, a deep link, a
//! TV code, a cookie/token, or a username/hostname. [`DiagnosticsInput`]'s
//! own field set already makes most of that structurally impossible (there
//! is simply no field to carry a device id, a URL, or a hostname); this
//! module's test exercises the rest.

use tauri::{Manager, State, Window};

use crate::dial::{self, DialStateKind, DialStatus};
use crate::i18n;
use crate::network::{self, NetworkCategory, NetworkProfile};
use crate::{lifecycle, settings};

/// `tauri`'s own crate version, as pinned in `Cargo.lock`. There is no
/// build-time way to read a dependency's version without adding a crate
/// (forbidden for this wave), so this is a plain constant — update it
/// alongside a `tauri` version bump.
const TAURI_VERSION: &str = "2.11.5";

/// The twelve `settings:` keys shown on the diagnostics line, in the exact
/// order the contract's example shows them. Built by `settings::diagnostics_settings`
/// (which has access to `settings::Settings`'s private fields) so this
/// module never needs to know that struct's internals.
pub struct DiagnosticsSettings {
    pub fullscreen: bool,
    pub keep_on_top: bool,
    pub pause_on_blur: bool,
    pub controller_enabled: bool,
    pub sleep_timer_minutes: u32,
    pub codec_filter: String,
    pub hardware_decoding: bool,
    pub hardware_decoding_restart_required: bool,
    pub touch_overlay: bool,
    pub start_with_windows: bool,
    pub mini_player: bool,
    pub deep_link_scheme: bool,
    pub deep_link_scheme_registered: bool,
    /// Wave 8: whether the display/system is kept awake while a video is
    /// actually playing (see `power.rs`). `hideShorts`/`hideGuideTabs` are
    /// deliberately not on this line — the contract only asks for
    /// `keepDisplayAwake`.
    pub keep_display_awake: bool,
}

/// Everything [`format_diagnostics`] needs, gathered by `settings_diagnostics`
/// before formatting. Borrowed rather than owned so the command handler
/// never has to clone data it already holds just to hand it to the
/// formatter.
pub struct DiagnosticsInput<'a> {
    pub version: &'a str,
    pub tauri_version: &'a str,
    /// `None` renders as `unknown` (`tauri::webview_version()` failed).
    pub webview2: Option<&'a str>,
    pub os: &'a str,
    pub arch: &'a str,
    pub language: &'a str,
    pub dial: &'a DialStatus,
    pub network: &'a NetworkProfile,
    pub settings: &'a DiagnosticsSettings,
    pub dial_friendly_name: &'a str,
    /// Pre-formatted by `lifecycle::current_summary` (e.g. `"ready (pid 1234)"`).
    pub lifecycle: &'a str,
    pub generated_at: u64,
}

fn format_dial(status: &DialStatus) -> String {
    match status.state {
        DialStateKind::Starting => "starting".to_owned(),
        DialStateKind::Ready => match (status.host.as_deref(), status.port) {
            (Some(host), Some(port)) => format!("ready ({host}:{port})"),
            _ => "ready".to_owned(),
        },
        DialStateKind::Degraded => match status.message.as_deref() {
            Some(reason) => format!("degraded ({reason})"),
            None => "degraded".to_owned(),
        },
        DialStateKind::Disabled => match status.message.as_deref() {
            Some(reason) => format!("disabled ({reason})"),
            None => "disabled".to_owned(),
        },
    }
}

fn format_network(network: &NetworkProfile) -> String {
    let category = match network.category {
        NetworkCategory::Private => "private",
        NetworkCategory::Public => "public",
        NetworkCategory::DomainAuthenticated => "domain",
        NetworkCategory::Unknown => "unknown",
    };
    let interface = network.interface.as_deref().unwrap_or("-");
    format!("{category} ({interface})")
}

fn format_settings_line(settings: &DiagnosticsSettings) -> String {
    format!(
        "settings: fullscreen={} keepOnTop={} pauseOnBlur={} controllerEnabled={} \
         sleepTimerMinutes={} codecFilter={} hardwareDecoding={} \
         hardwareDecodingRestartRequired={} touchOverlay={} startWithWindows={} miniPlayer={} \
         deepLinkScheme={} deepLinkSchemeRegistered={} keepDisplayAwake={}",
        settings.fullscreen,
        settings.keep_on_top,
        settings.pause_on_blur,
        settings.controller_enabled,
        settings.sleep_timer_minutes,
        settings.codec_filter,
        settings.hardware_decoding,
        settings.hardware_decoding_restart_required,
        settings.touch_overlay,
        settings.start_with_windows,
        settings.mini_player,
        settings.deep_link_scheme,
        settings.deep_link_scheme_registered,
        settings.keep_display_awake,
    )
}

/// Renders the full diagnostics text block, one `key: value` line per row
/// (the `settings:` row packs its twelve keys onto one line — see
/// [`format_settings_line`]), in English throughout (no i18n — the contract
/// is explicit that this text is meant to be pasted into an English-language
/// bug report as-is).
pub fn format_diagnostics(input: &DiagnosticsInput) -> String {
    let lines = [
        "Lalin Cast diagnostics".to_owned(),
        format!("version: {}", input.version),
        format!("tauri: {}", input.tauri_version),
        format!("webview2: {}", input.webview2.unwrap_or("unknown")),
        format!("os: {} / arch: {}", input.os, input.arch),
        format!("language: {}", input.language),
        format!("dial: {}", format_dial(input.dial)),
        format!("network: {}", format_network(input.network)),
        format_settings_line(input.settings),
        format!("dialFriendlyName: {}", input.dial_friendly_name),
        format!("lifecycle: {}", input.lifecycle),
        format!("generatedAt: {}", input.generated_at),
    ];
    lines.join("\n")
}

/// Returns the diagnostics text for the settings window's "copy diagnostics"
/// button. Label-guarded like every other settings command; gathers a fresh
/// network probe and the live DIAL status rather than caching either.
#[tauri::command]
pub fn settings_diagnostics(
    window: Window,
    dial_state: State<'_, dial::DialState>,
) -> Result<String, String> {
    if window.label() != settings::SETTINGS_LABEL {
        return Err("settings_diagnostics is only available from the settings window".to_owned());
    }
    let app = window.app_handle();
    let lang = i18n::load(app);
    let network = network::detect_network_profile();
    let dial_status = dial::current_status(&dial_state);
    let webview2 = tauri::webview_version().ok();
    let diagnostics_settings = settings::diagnostics_settings(app);
    let friendly_name = dial::load_friendly_name(app);
    let lifecycle_summary = lifecycle::current_summary(app);

    let input = DiagnosticsInput {
        version: env!("CARGO_PKG_VERSION"),
        tauri_version: TAURI_VERSION,
        webview2: webview2.as_deref(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        language: lang.store_value(),
        dial: &dial_status,
        network: &network,
        settings: &diagnostics_settings,
        dial_friendly_name: &friendly_name,
        lifecycle: &lifecycle_summary,
        generated_at: lifecycle::now_unix(),
    };
    Ok(format_diagnostics(&input))
}

#[cfg(test)]
mod tests {

    /// `TAURI_VERSION` is a hand-maintained constant (no build-time way to
    /// read a dependency's version without adding a crate), so pin it to
    /// `Cargo.lock`: a `tauri` bump that forgets this constant fails here.
    #[test]
    fn tauri_version_constant_matches_cargo_lock() {
        let lock = include_str!("../Cargo.lock");
        let mut lines = lock.lines();
        let mut found = None;
        while let Some(line) = lines.next() {
            if line.trim() == "name = \"tauri\"" {
                found = lines.next().and_then(|next| {
                    next.trim()
                        .strip_prefix("version = \"")
                        .and_then(|rest| rest.strip_suffix('"'))
                        .map(str::to_owned)
                });
                break;
            }
        }
        assert_eq!(found.as_deref(), Some(super::TAURI_VERSION));
    }
    use super::{format_diagnostics, DiagnosticsInput, DiagnosticsSettings};
    use crate::dial::{DialStateKind, DialStatus};
    use crate::network::{NetworkCategory, NetworkProfile};

    fn settings() -> DiagnosticsSettings {
        DiagnosticsSettings {
            fullscreen: false,
            keep_on_top: false,
            pause_on_blur: false,
            controller_enabled: true,
            sleep_timer_minutes: 0,
            codec_filter: "off".to_owned(),
            hardware_decoding: true,
            hardware_decoding_restart_required: false,
            touch_overlay: true,
            start_with_windows: false,
            mini_player: false,
            deep_link_scheme: false,
            deep_link_scheme_registered: false,
            keep_display_awake: true,
        }
    }

    fn ready_dial() -> DialStatus {
        DialStatus {
            state: DialStateKind::Ready,
            host: Some("192.168.1.10".to_owned()),
            port: Some(8008),
            message: None,
        }
    }

    fn private_network() -> NetworkProfile {
        NetworkProfile {
            category: NetworkCategory::Private,
            interface: Some("Wi-Fi".to_owned()),
        }
    }

    #[test]
    fn renders_every_documented_line_in_order() {
        let dial = ready_dial();
        let network = private_network();
        let settings = settings();
        let input = DiagnosticsInput {
            version: "0.1.0",
            tauri_version: "2.11.5",
            webview2: Some("109.0.1518.78"),
            os: "windows",
            arch: "x86_64",
            language: "th",
            dial: &dial,
            network: &network,
            settings: &settings,
            dial_friendly_name: "Lalin Cast",
            lifecycle: "ready (pid 1234)",
            generated_at: 1_758_380_400,
        };
        let output = format_diagnostics(&input);
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines[0], "Lalin Cast diagnostics");
        assert_eq!(lines[1], "version: 0.1.0");
        assert_eq!(lines[2], "tauri: 2.11.5");
        assert_eq!(lines[3], "webview2: 109.0.1518.78");
        assert_eq!(lines[4], "os: windows / arch: x86_64");
        assert_eq!(lines[5], "language: th");
        assert_eq!(lines[6], "dial: ready (192.168.1.10:8008)");
        assert_eq!(lines[7], "network: private (Wi-Fi)");
        assert!(lines[8].starts_with("settings: fullscreen=false"));
        assert!(lines[8].contains("miniPlayer=false"));
        assert!(lines[8].contains("deepLinkScheme=false"));
        assert!(lines[8].contains("deepLinkSchemeRegistered=false"));
        assert!(lines[8].contains("keepDisplayAwake=true"));
        assert_eq!(lines[9], "dialFriendlyName: Lalin Cast");
        assert_eq!(lines[10], "lifecycle: ready (pid 1234)");
        assert_eq!(lines[11], "generatedAt: 1758380400");
    }

    #[test]
    fn webview2_falls_back_to_unknown_when_absent() {
        let dial = ready_dial();
        let network = private_network();
        let settings = settings();
        let input = DiagnosticsInput {
            version: "0.1.0",
            tauri_version: "2.11.5",
            webview2: None,
            os: "windows",
            arch: "x86_64",
            language: "en",
            dial: &dial,
            network: &network,
            settings: &settings,
            dial_friendly_name: "Lalin Cast",
            lifecycle: "starting",
            generated_at: 0,
        };
        assert!(format_diagnostics(&input).contains("webview2: unknown"));
    }

    fn base_input<'a>(
        dial: &'a DialStatus,
        network: &'a NetworkProfile,
        settings: &'a DiagnosticsSettings,
    ) -> DiagnosticsInput<'a> {
        DiagnosticsInput {
            version: "0.1.0",
            tauri_version: "2.11.5",
            webview2: None,
            os: "windows",
            arch: "x86_64",
            language: "en",
            dial,
            network,
            settings,
            dial_friendly_name: "Lalin Cast",
            lifecycle: "starting",
            generated_at: 0,
        }
    }

    #[test]
    fn dial_line_covers_every_state() {
        let network = private_network();
        let settings = settings();

        let starting = DialStatus {
            state: DialStateKind::Starting,
            host: None,
            port: None,
            message: None,
        };
        assert!(
            format_diagnostics(&base_input(&starting, &network, &settings))
                .contains("dial: starting")
        );

        let degraded = DialStatus {
            state: DialStateKind::Degraded,
            host: None,
            port: None,
            message: Some("bind failed; retrying".to_owned()),
        };
        assert!(
            format_diagnostics(&base_input(&degraded, &network, &settings))
                .contains("dial: degraded (bind failed; retrying)")
        );

        let disabled = DialStatus {
            state: DialStateKind::Disabled,
            host: None,
            port: None,
            message: Some("DIAL supervisor thread failed".to_owned()),
        };
        assert!(
            format_diagnostics(&base_input(&disabled, &network, &settings))
                .contains("dial: disabled (DIAL supervisor thread failed)")
        );
    }

    #[test]
    fn output_never_contains_a_device_id_or_a_url() {
        // DiagnosticsInput/DiagnosticsSettings structurally have no
        // dialDeviceId or URL field at all — this proves the realistic
        // rendered text (including the DIAL host:port and every settings
        // value) never happens to contain a scheme-prefixed URL or the
        // literal string "dialDeviceId" either.
        let dial = ready_dial();
        let network = private_network();
        let settings = settings();
        let input = DiagnosticsInput {
            version: "0.1.0",
            tauri_version: "2.11.5",
            webview2: Some("109.0.1518.78"),
            os: "windows",
            arch: "x86_64",
            language: "th",
            dial: &dial,
            network: &network,
            settings: &settings,
            dial_friendly_name: "Living Room Lalin Cast",
            lifecycle: "ready (pid 4242)",
            generated_at: 1_758_380_400,
        };
        let output = format_diagnostics(&input).to_lowercase();
        assert!(!output.contains("dialdeviceid"));
        assert!(!output.contains("http://"));
        assert!(!output.contains("https://"));
        assert!(!output.contains("lalin-cast://"));
    }
}
