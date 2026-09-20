//! Remote-page connectivity/surface reporting: the offline startup probe and
//! the `lalin-cast-surface` bridge that `injected.js` uses to tell the shell
//! "YouTube redirected away from the TV app" or "the Leanback UI never
//! rendered". Both funnel into the `status` window (see `status.rs`).

use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Listener};

use crate::i18n::{self, Key};
use crate::status;

/// Event emitted from the `media` window's JS side (via
/// `window.__TAURI__.event.emit`, granted only `core:event:allow-emit` on
/// the remote `youtube.com` capability — see `capabilities/default.json`).
pub const SURFACE_EVENT: &str = "lalin-cast-surface";
const RATE_LIMIT: Duration = Duration::from_secs(30);
const MAX_URL_CHARS: usize = 512;
const MAX_TITLE_CHARS: usize = 200;
/// Fixed probe target; never taken from a caller/page argument.
const PROBE_HOST: &str = "www.youtube.com:443";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SurfaceKind {
    Redirected,
    BlockedSurface,
}

/// `kind` and `title` are validated but not currently read outside tests:
/// both surface kinds map to the same `blockedSurface` status-window state
/// (see [`register_surface_listener`]), and `title` is not part of the
/// `__LALIN_STATUS__` contract. Kept on the struct (rather than discarded
/// during validation) so a future differentiation does not need to touch
/// the validator.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SurfaceEvent {
    pub kind: SurfaceKind,
    pub url: String,
    pub title: String,
}

/// Untyped mirror of the event payload injected.js sends, used only to
/// validate/whitelist before building a [`SurfaceEvent`]. `kind` is a plain
/// `String` here (rather than a typed enum) specifically so a value outside
/// the whitelist fails validation with a clear reason instead of a generic
/// deserialize error.
#[derive(Deserialize)]
struct RawSurfaceEvent {
    kind: String,
    url: String,
    title: String,
}

/// Validates a raw `lalin-cast-surface` JSON payload against the Wave 2
/// contract: `kind` must be `"redirected"` or `"blockedSurface"`, `url`
/// must be at most 512 characters and start with `https://`, and `title`
/// must be at most 200 characters. Any violation (including malformed
/// JSON) returns `None` rather than a partially-trusted value.
pub fn validate_surface_event(payload: &str) -> Option<SurfaceEvent> {
    let raw: RawSurfaceEvent = serde_json::from_str(payload).ok()?;

    let kind = match raw.kind.as_str() {
        "redirected" => SurfaceKind::Redirected,
        "blockedSurface" => SurfaceKind::BlockedSurface,
        _ => return None,
    };

    if raw.url.chars().count() > MAX_URL_CHARS || !raw.url.starts_with("https://") {
        return None;
    }
    if raw.title.chars().count() > MAX_TITLE_CHARS {
        return None;
    }

    Some(SurfaceEvent {
        kind,
        url: raw.url,
        title: raw.title,
    })
}

/// Pure decision for the 30-second rate limiter: `true` when enough time
/// has passed since `last` (or there was no previous event) to allow
/// another surface-event-triggered status window. Kept separate from
/// [`SurfaceRateLimiter`] (which needs a real clock/mutex) so it is
/// unit-testable without sleeping.
fn rate_limit_allows(last: Option<Instant>, now: Instant, limit: Duration) -> bool {
    match last {
        None => true,
        Some(last) => now.saturating_duration_since(last) >= limit,
    }
}

struct SurfaceRateLimiter {
    last: Mutex<Option<Instant>>,
}

impl SurfaceRateLimiter {
    fn new() -> Self {
        Self {
            last: Mutex::new(None),
        }
    }

    /// Returns `true` (and records `now`) at most once per [`RATE_LIMIT`]
    /// window; a poisoned lock degrades to "always allow" rather than
    /// permanently blocking every future surface event.
    fn allow(&self) -> bool {
        let now = Instant::now();
        match self.last.lock() {
            Ok(mut guard) => {
                if rate_limit_allows(*guard, now, RATE_LIMIT) {
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

/// Core of [`probe_connectivity`], parameterized over the target address so
/// it can be exercised against a local `TcpListener` and a closed port in
/// tests without reaching the real network.
fn probe_host(host: &str, timeout: Duration) -> Result<(), String> {
    let addr = host
        .to_socket_addrs()
        .map_err(|error| format!("could not resolve probe host: {error}"))?
        .next()
        .ok_or_else(|| "probe host resolved to no addresses".to_owned())?;
    TcpStream::connect_timeout(&addr, timeout)
        .map(|_| ())
        .map_err(|error| format!("connectivity probe failed: {error}"))
}

/// TCP-connects to `www.youtube.com:443` with the given timeout. Used both
/// for the startup offline probe and for `status_retry`. Never touches the
/// filesystem or the settings store, and the failure message never
/// includes the resolved IP address.
pub fn probe_connectivity(timeout: Duration) -> Result<(), String> {
    probe_host(PROBE_HOST, timeout)
}

/// Registers the app-wide listener for [`SURFACE_EVENT`]: validates the
/// payload, applies the 30-second rate limiter, and — if both pass — opens
/// the `status` window in the `blockedSurface` state. Both `"redirected"`
/// and `"blockedSurface"` kinds map to that same UI state; there is no
/// separate `"redirected"` window state in the `__LALIN_STATUS__` contract.
pub fn register_surface_listener(app: &AppHandle) {
    let limiter = SurfaceRateLimiter::new();
    let app_handle = app.clone();
    app.listen(SURFACE_EVENT, move |event| {
        let Some(validated) = validate_surface_event(event.payload()) else {
            return;
        };
        if !limiter.allow() {
            return;
        }

        let lang = i18n::load(&app_handle);
        let message = i18n::t(lang, Key::StatusBlockedSurfaceMessage).to_owned();
        status::open_status_window(
            &app_handle,
            status::STATE_BLOCKED_SURFACE,
            Some(message),
            Some(validated.url),
        );
    });
}

#[cfg(test)]
mod tests {
    use super::{probe_host, rate_limit_allows, validate_surface_event, SurfaceKind, RATE_LIMIT};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    #[test]
    fn accepts_a_well_formed_redirected_event() {
        let payload = r#"{"kind":"redirected","url":"https://www.youtube.com/","title":"YouTube"}"#;
        let event = validate_surface_event(payload).expect("should validate");
        assert_eq!(event.kind, SurfaceKind::Redirected);
        assert_eq!(event.url, "https://www.youtube.com/");
        assert_eq!(event.title, "YouTube");
    }

    #[test]
    fn accepts_a_well_formed_blocked_surface_event() {
        let payload =
            r#"{"kind":"blockedSurface","url":"https://www.youtube.com/tv","title":"TV"}"#;
        let event = validate_surface_event(payload).expect("should validate");
        assert_eq!(event.kind, SurfaceKind::BlockedSurface);
    }

    #[test]
    fn rejects_a_kind_outside_the_whitelist() {
        let payload = r#"{"kind":"navigated","url":"https://www.youtube.com/","title":"x"}"#;
        assert!(validate_surface_event(payload).is_none());
    }

    #[test]
    fn rejects_a_url_that_is_not_https() {
        let payload = r#"{"kind":"redirected","url":"http://www.youtube.com/","title":"x"}"#;
        assert!(validate_surface_event(payload).is_none());
    }

    #[test]
    fn rejects_a_url_longer_than_512_characters() {
        let long_path = "a".repeat(600);
        let payload = format!(
            r#"{{"kind":"redirected","url":"https://www.youtube.com/{long_path}","title":"x"}}"#
        );
        assert!(validate_surface_event(&payload).is_none());
    }

    #[test]
    fn rejects_a_title_longer_than_200_characters() {
        let long_title = "a".repeat(201);
        let payload = format!(
            r#"{{"kind":"redirected","url":"https://www.youtube.com/","title":"{long_title}"}}"#
        );
        assert!(validate_surface_event(&payload).is_none());
    }

    #[test]
    fn rejects_malformed_json() {
        assert!(validate_surface_event("{not json").is_none());
        assert!(validate_surface_event("").is_none());
    }

    #[test]
    fn rate_limiter_allows_the_first_event_and_blocks_a_second_within_the_window() {
        let now = Instant::now();
        assert!(rate_limit_allows(None, now, RATE_LIMIT));
        assert!(!rate_limit_allows(Some(now), now, RATE_LIMIT));

        let just_under = now
            .checked_sub(RATE_LIMIT - Duration::from_secs(1))
            .unwrap();
        assert!(!rate_limit_allows(Some(just_under), now, RATE_LIMIT));

        let past_window = now
            .checked_sub(RATE_LIMIT + Duration::from_secs(1))
            .unwrap();
        assert!(rate_limit_allows(Some(past_window), now, RATE_LIMIT));
    }

    #[test]
    fn probe_succeeds_against_a_local_listener() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test listener");
        let addr = listener.local_addr().expect("test listener local addr");
        let result = probe_host(&addr.to_string(), Duration::from_secs(2));
        assert!(result.is_ok(), "expected Ok, got {result:?}");
    }

    #[test]
    fn probe_fails_against_a_closed_port() {
        // Bind an ephemeral port, immediately drop the listener so nothing
        // is listening on it, then probe that now-closed port.
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test listener");
        let addr = listener.local_addr().expect("test listener local addr");
        drop(listener);

        let result = probe_host(&addr.to_string(), Duration::from_millis(500));
        assert!(result.is_err());
    }
}
