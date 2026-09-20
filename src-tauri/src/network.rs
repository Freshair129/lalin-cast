//! Windows network-profile detection (read-only). The #1 cause of "my phone
//! can't find Lalin Cast" in the H0 RCA was the LAN adapter sitting on the
//! Windows "Public" network profile, which blocks the inbound DIAL/mDNS
//! traffic phones use for discovery. The setup wizard surfaces the current
//! profile so the user can fix it themselves; Lalin Cast never changes the
//! profile or firewall rules itself.
//!
//! The result is never persisted to the settings store and the interface
//! name is never logged (see PRIVACY.md).

#[cfg(windows)]
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::sync::mpsc;
#[cfg(windows)]
use std::thread;
#[cfg(windows)]
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[cfg(windows)]
const POWERSHELL_TIMEOUT: Duration = Duration::from_secs(5);
/// Fixed, argument-free PowerShell invocation: no input from the page or
/// any other caller ever reaches this command line.
#[cfg(windows)]
const POWERSHELL_COMMAND: &str = "Get-NetConnectionProfile | Select-Object InterfaceAlias,NetworkCategory,IPv4Connectivity | ConvertTo-Json -Compress";

/// Serializes with no rename (plain Rust identifiers: `"Private"`,
/// `"Public"`, `"DomainAuthenticated"`, `"Unknown"`) to match the
/// `NetworkProfile.category` contract exactly, which intentionally mirrors
/// the raw Windows `NetworkCategory` names rather than using camelCase.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum NetworkCategory {
    Private,
    Public,
    DomainAuthenticated,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfile {
    pub category: NetworkCategory,
    pub interface: Option<String>,
}

/// Shape of one element of `Get-NetConnectionProfile | ConvertTo-Json`'s
/// output. Every field is optional: PowerShell can omit a property or emit
/// `null`, and a missing/invalid value should degrade to `Unknown`/`None`
/// rather than fail the whole parse.
#[derive(Deserialize)]
struct RawProfile {
    #[serde(rename = "InterfaceAlias")]
    interface_alias: Option<String>,
    #[serde(rename = "NetworkCategory")]
    network_category: Option<String>,
    #[serde(rename = "IPv4Connectivity")]
    ipv4_connectivity: Option<String>,
}

fn unknown_profile() -> NetworkProfile {
    NetworkProfile {
        category: NetworkCategory::Unknown,
        interface: None,
    }
}

fn category_from_str(value: Option<&str>) -> NetworkCategory {
    match value {
        Some(v) if v.eq_ignore_ascii_case("Private") => NetworkCategory::Private,
        Some(v) if v.eq_ignore_ascii_case("Public") => NetworkCategory::Public,
        Some(v) if v.eq_ignore_ascii_case("DomainAuthenticated") => {
            NetworkCategory::DomainAuthenticated
        }
        _ => NetworkCategory::Unknown,
    }
}

/// Pure parser for `Get-NetConnectionProfile | ConvertTo-Json -Compress`'s
/// stdout. PowerShell's `ConvertTo-Json` emits a single JSON object when
/// there is exactly one connection profile and a JSON array otherwise, so
/// both shapes are accepted. Prefers the first profile whose
/// `IPv4Connectivity` is `"Internet"`; falls back to the first profile in
/// the list when none qualifies. Empty input, malformed JSON, or an empty
/// array all resolve to [`NetworkCategory::Unknown`] with no interface name.
pub fn parse_network_profiles(json: &str) -> NetworkProfile {
    let trimmed = json.trim();
    if trimmed.is_empty() {
        return unknown_profile();
    }

    let profiles: Vec<RawProfile> = if trimmed.starts_with('[') {
        match serde_json::from_str(trimmed) {
            Ok(profiles) => profiles,
            Err(_) => return unknown_profile(),
        }
    } else {
        match serde_json::from_str::<RawProfile>(trimmed) {
            Ok(profile) => vec![profile],
            Err(_) => return unknown_profile(),
        }
    };

    let chosen = profiles
        .iter()
        .find(|profile| {
            profile
                .ipv4_connectivity
                .as_deref()
                .is_some_and(|value| value.eq_ignore_ascii_case("internet"))
        })
        .or_else(|| profiles.first());

    match chosen {
        Some(profile) => NetworkProfile {
            category: category_from_str(profile.network_category.as_deref()),
            interface: profile
                .interface_alias
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned),
        },
        None => unknown_profile(),
    }
}

/// Runs the fixed `Get-NetConnectionProfile` PowerShell one-liner on a
/// separate thread with a 5-second bound (via `recv_timeout`, not a process
/// kill — see the Wave 2 plan's T1 spec item 4) and parses its output.
/// Any failure (spawn failure, timeout, non-zero exit, invalid UTF-8,
/// unparsable JSON) resolves to `Unknown`/`None`, never an error the caller
/// has to handle separately.
#[cfg(windows)]
pub fn detect_network_profile() -> NetworkProfile {
    let (tx, rx) = mpsc::channel();
    let spawned = thread::Builder::new()
        .name("lalin-cast-network-profile".to_owned())
        .spawn(move || {
            let output = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    POWERSHELL_COMMAND,
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .output();
            let _ = tx.send(output);
        });
    if spawned.is_err() {
        return unknown_profile();
    }

    match rx.recv_timeout(POWERSHELL_TIMEOUT) {
        Ok(Ok(output)) if output.status.success() => {
            parse_network_profiles(&String::from_utf8_lossy(&output.stdout))
        }
        _ => unknown_profile(),
    }
}

#[cfg(not(windows))]
pub fn detect_network_profile() -> NetworkProfile {
    unknown_profile()
}

#[cfg(test)]
mod tests {
    use super::{parse_network_profiles, NetworkCategory};

    #[test]
    fn parses_a_single_object_with_internet_connectivity() {
        let json = r#"{"InterfaceAlias":"Wi-Fi","NetworkCategory":"Private","IPv4Connectivity":"Internet"}"#;
        let profile = parse_network_profiles(json);
        assert_eq!(profile.category, NetworkCategory::Private);
        assert_eq!(profile.interface.as_deref(), Some("Wi-Fi"));
    }

    #[test]
    fn parses_an_array_and_prefers_the_profile_with_internet_connectivity() {
        let json = r#"[
            {"InterfaceAlias":"Ethernet","NetworkCategory":"Public","IPv4Connectivity":"LocalNetwork"},
            {"InterfaceAlias":"Wi-Fi","NetworkCategory":"Private","IPv4Connectivity":"Internet"}
        ]"#;
        let profile = parse_network_profiles(json);
        assert_eq!(profile.category, NetworkCategory::Private);
        assert_eq!(profile.interface.as_deref(), Some("Wi-Fi"));
    }

    #[test]
    fn falls_back_to_the_first_profile_when_none_has_internet_connectivity() {
        let json = r#"[
            {"InterfaceAlias":"Ethernet","NetworkCategory":"Public","IPv4Connectivity":"LocalNetwork"},
            {"InterfaceAlias":"Wi-Fi","NetworkCategory":"DomainAuthenticated","IPv4Connectivity":"Disconnected"}
        ]"#;
        let profile = parse_network_profiles(json);
        assert_eq!(profile.category, NetworkCategory::Public);
        assert_eq!(profile.interface.as_deref(), Some("Ethernet"));
    }

    #[test]
    fn empty_input_and_empty_array_resolve_to_unknown() {
        assert_eq!(
            parse_network_profiles("").category,
            NetworkCategory::Unknown
        );
        assert_eq!(
            parse_network_profiles("   ").category,
            NetworkCategory::Unknown
        );
        let profile = parse_network_profiles("[]");
        assert_eq!(profile.category, NetworkCategory::Unknown);
        assert_eq!(profile.interface, None);
    }

    #[test]
    fn malformed_json_resolves_to_unknown_instead_of_panicking() {
        let profile = parse_network_profiles("{not json");
        assert_eq!(profile.category, NetworkCategory::Unknown);
        assert_eq!(profile.interface, None);

        let profile = parse_network_profiles("[{\"InterfaceAlias\":");
        assert_eq!(profile.category, NetworkCategory::Unknown);
    }

    #[test]
    fn unrecognized_category_string_resolves_to_unknown_category() {
        let json = r#"{"InterfaceAlias":"Wi-Fi","NetworkCategory":"SomethingNew","IPv4Connectivity":"Internet"}"#;
        let profile = parse_network_profiles(json);
        assert_eq!(profile.category, NetworkCategory::Unknown);
        assert_eq!(profile.interface.as_deref(), Some("Wi-Fi"));
    }

    #[test]
    fn missing_fields_degrade_gracefully_instead_of_failing_to_parse() {
        let json = r#"{"NetworkCategory":"Private"}"#;
        let profile = parse_network_profiles(json);
        assert_eq!(profile.category, NetworkCategory::Private);
        assert_eq!(profile.interface, None);

        let profile = parse_network_profiles("{}");
        assert_eq!(profile.category, NetworkCategory::Unknown);
        assert_eq!(profile.interface, None);
    }

    #[test]
    fn blank_interface_alias_is_treated_as_absent() {
        let json =
            r#"{"InterfaceAlias":"   ","NetworkCategory":"Private","IPv4Connectivity":"Internet"}"#;
        let profile = parse_network_profiles(json);
        assert_eq!(profile.interface, None);
    }

    #[test]
    fn network_profile_serializes_category_as_the_documented_capitalized_strings() {
        // window.__LALIN_SETUP__.network.category is documented as
        // "Private" | "Public" | "DomainAuthenticated" | "Unknown" — the
        // raw Windows NetworkCategory spelling, not camelCase.
        for (category, expected) in [
            (NetworkCategory::Private, "\"Private\""),
            (NetworkCategory::Public, "\"Public\""),
            (
                NetworkCategory::DomainAuthenticated,
                "\"DomainAuthenticated\"",
            ),
            (NetworkCategory::Unknown, "\"Unknown\""),
        ] {
            let profile = super::NetworkProfile {
                category,
                interface: None,
            };
            let json = serde_json::to_string(&profile).expect("profile should serialize");
            assert!(json.contains(&format!("\"category\":{expected}")));
            assert!(json.contains("\"interface\":null"));
        }
    }
}
