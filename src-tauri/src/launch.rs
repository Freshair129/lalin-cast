//! Pure command-line and launch-URL parsing for Lalin Cast.
//!
//! `parse_cli` reads `--fullscreen`, `--version`, and the last argument that
//! parses as a valid launch URL out of a raw argument list (Steam launch
//! options, a Studio launcher invocation, a shortcut, or the args
//! `tauri_plugin_single_instance` forwards from a second instance).
//! `parse_launch_url` turns one raw string into a validated, canonical
//! [`DeepLink`] or rejects it outright. Both are pure functions with no I/O,
//! so every branch is covered by the unit tests below; `lib.rs` is the only
//! caller and only wires the results into the running app (the
//! `--version` early-exit, `__LALIN_PREFS__.deepLink`, the single-instance
//! forwarding, and the transient `--fullscreen` override).

use tauri::Url;

/// Exact-match host whitelist for `https://<host>/watch?v=<id>` — never a
/// suffix match, so `evil.youtube.com.example` or `notyoutube.com` never
/// qualify.
const VIDEO_HOSTS: &[&str] = &["www.youtube.com", "youtube.com", "m.youtube.com"];
/// `https://youtu.be/<id>` short-link host.
const SHORT_HOST: &str = "youtu.be";
/// `https://www.youtube.com/playlist?list=<list>` is only accepted on the
/// canonical `www` host, unlike the video form (matches the contract table).
const PLAYLIST_HOST: &str = "www.youtube.com";
const VIDEO_ID_LEN: usize = 11;
const PLAYLIST_ID_MAX_LEN: usize = 64;
const FULLSCREEN_FLAG: &str = "--fullscreen";
const VERSION_FLAG: &str = "--version";

/// A validated deep link into the Leanback YouTube app. Only ever
/// constructed by [`parse_launch_url`], so every instance already satisfied
/// the id/list character-class and length checks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeepLink {
    Video(String),
    Playlist(String),
}

impl DeepLink {
    /// The canonical URL for this deep link — `https://www.youtube.com/watch?v=<id>`
    /// for a video, `https://www.youtube.com/playlist?list=<list>` for a
    /// playlist. This is the only form ever embedded into
    /// `__LALIN_PREFS__.deepLink` or emitted on `lalin-cast-deeplink`; the
    /// raw string a caller supplied (which may have carried a different host
    /// or extra query parameters) is never reused past parsing.
    pub fn canonical(&self) -> String {
        match self {
            DeepLink::Video(id) => format!("https://www.youtube.com/watch?v={id}"),
            DeepLink::Playlist(list) => format!("https://www.youtube.com/playlist?list={list}"),
        }
    }
}

/// Result of [`parse_cli`]: what a single Lalin Cast process launch (or a
/// single-instance-forwarded relaunch) asked for.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LaunchOptions {
    /// `--fullscreen`: force fullscreen for this run only (never persisted).
    pub fullscreen: bool,
    /// `--version`: print the version and exit before the Tauri builder
    /// runs. Checked by `lib.rs::run()`.
    pub version: bool,
    pub deep_link: Option<DeepLink>,
}

fn is_valid_video_id(value: &str) -> bool {
    value.chars().count() == VIDEO_ID_LEN
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn is_valid_playlist_id(value: &str) -> bool {
    let len = value.chars().count();
    (1..=PLAYLIST_ID_MAX_LEN).contains(&len)
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

/// Parses and validates one raw launch URL into a canonical [`DeepLink`].
/// Accepts only `https://www.youtube.com/watch?v=<id>`,
/// `https://youtube.com/watch?v=<id>`, `https://m.youtube.com/watch?v=<id>`,
/// `https://youtu.be/<id>`, and `https://www.youtube.com/playlist?list=<list>`
/// (`id` = `[A-Za-z0-9_-]{11}`, `list` = `[A-Za-z0-9_-]{1,64}`). Rejects any
/// other scheme (`http://`, `javascript:`, ...), any host outside the exact
/// whitelist (no suffix matching), and any id/list that fails the character
/// class or length check. Every other query parameter on an otherwise-valid
/// URL is silently dropped — the canonical form never carries it.
pub fn parse_launch_url(raw: &str) -> Option<DeepLink> {
    let url = Url::parse(raw).ok()?;
    if url.scheme() != "https" {
        return None;
    }
    let host = url.host_str()?;

    if host == SHORT_HOST {
        let id = url.path().strip_prefix('/')?;
        return is_valid_video_id(id).then(|| DeepLink::Video(id.to_owned()));
    }

    if VIDEO_HOSTS.contains(&host) && url.path() == "/watch" {
        let id = url
            .query_pairs()
            .find(|(key, _)| key == "v")
            .map(|(_, value)| value.into_owned())?;
        return is_valid_video_id(&id).then_some(DeepLink::Video(id));
    }

    if host == PLAYLIST_HOST && url.path() == "/playlist" {
        let list = url
            .query_pairs()
            .find(|(key, _)| key == "list")
            .map(|(_, value)| value.into_owned())?;
        return is_valid_playlist_id(&list).then_some(DeepLink::Playlist(list));
    }

    None
}

/// Parses a raw argument list — including the program name at index 0, the
/// same shape `std::env::args()` and `tauri_plugin_single_instance`'s
/// forwarded args both have — into [`LaunchOptions`]. The last argument that
/// parses as a valid launch URL via [`parse_launch_url`] wins; any other
/// argument (an unrecognized flag, a non-matching string) is silently
/// ignored rather than causing a parse error or a panic.
pub fn parse_cli<S: AsRef<str>>(args: &[S]) -> LaunchOptions {
    let mut options = LaunchOptions::default();
    for arg in args.iter().skip(1) {
        let arg = arg.as_ref();
        if arg == FULLSCREEN_FLAG {
            options.fullscreen = true;
        } else if arg == VERSION_FLAG {
            options.version = true;
        } else if let Some(deep_link) = parse_launch_url(arg) {
            options.deep_link = Some(deep_link);
        }
    }
    options
}

#[cfg(test)]
mod tests {
    use super::{parse_cli, parse_launch_url, DeepLink, LaunchOptions};

    #[test]
    fn accepts_every_whitelisted_video_host() {
        for host in ["www.youtube.com", "youtube.com", "m.youtube.com"] {
            let url = format!("https://{host}/watch?v=dQw4w9WgXcQ");
            assert_eq!(
                parse_launch_url(&url),
                Some(DeepLink::Video("dQw4w9WgXcQ".to_owned())),
                "host {host} should be accepted"
            );
        }
    }

    #[test]
    fn accepts_the_short_link_host() {
        assert_eq!(
            parse_launch_url("https://youtu.be/dQw4w9WgXcQ"),
            Some(DeepLink::Video("dQw4w9WgXcQ".to_owned()))
        );
    }

    #[test]
    fn accepts_a_playlist_on_the_canonical_www_host_only() {
        assert_eq!(
            parse_launch_url("https://www.youtube.com/playlist?list=PL12345"),
            Some(DeepLink::Playlist("PL12345".to_owned()))
        );
        // The bare and mobile hosts are whitelisted for /watch, not
        // /playlist — the contract lists only www.youtube.com for playlists.
        assert_eq!(
            parse_launch_url("https://youtube.com/playlist?list=PL12345"),
            None
        );
        assert_eq!(
            parse_launch_url("https://m.youtube.com/playlist?list=PL12345"),
            None
        );
    }

    #[test]
    fn canonical_form_matches_the_contract_and_drops_other_query_parameters() {
        let video = parse_launch_url(
            "https://www.youtube.com/watch?list=ignored&v=dQw4w9WgXcQ&t=42&feature=share",
        )
        .expect("should parse despite extra query parameters");
        assert_eq!(
            video.canonical(),
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        );

        let playlist =
            parse_launch_url("https://www.youtube.com/playlist?index=3&list=PL12345&foo=bar")
                .expect("should parse despite extra query parameters");
        assert_eq!(
            playlist.canonical(),
            "https://www.youtube.com/playlist?list=PL12345"
        );
    }

    #[test]
    fn rejects_a_non_https_scheme() {
        assert_eq!(
            parse_launch_url("http://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            None
        );
        assert_eq!(parse_launch_url("javascript:alert(1)//dQw4w9WgXcQ11"), None);
    }

    #[test]
    fn rejects_a_host_outside_the_exact_whitelist() {
        // A suffix/lookalike host must never match: only an exact host
        // string is accepted, never "ends_with(...)".
        assert_eq!(
            parse_launch_url("https://evil.youtube.com.example/watch?v=dQw4w9WgXcQ"),
            None
        );
        assert_eq!(
            parse_launch_url("https://notyoutube.com/watch?v=dQw4w9WgXcQ"),
            None
        );
        assert_eq!(
            parse_launch_url("https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ"),
            None
        );
    }

    #[test]
    fn rejects_a_video_id_with_the_wrong_length_or_characters() {
        assert_eq!(
            parse_launch_url("https://www.youtube.com/watch?v=short"),
            None
        );
        assert_eq!(
            parse_launch_url("https://www.youtube.com/watch?v=wayTooLongForAnId"),
            None
        );
        assert_eq!(
            parse_launch_url("https://www.youtube.com/watch?v=dQw4w9Wg$cQ"),
            None
        );
        assert_eq!(parse_launch_url("https://youtu.be/not/an/id"), None);
        assert_eq!(parse_launch_url("https://youtu.be//dQw4w9WgXcQ"), None);
    }

    #[test]
    fn rejects_a_watch_url_with_no_v_parameter_and_a_playlist_url_with_no_list_parameter() {
        assert_eq!(parse_launch_url("https://www.youtube.com/watch?t=42"), None);
        assert_eq!(
            parse_launch_url("https://www.youtube.com/playlist?index=3"),
            None
        );
    }

    #[test]
    fn rejects_malformed_urls_and_wrong_paths_without_panicking() {
        assert_eq!(parse_launch_url(""), None);
        assert_eq!(parse_launch_url("not a url"), None);
        assert_eq!(parse_launch_url("https://www.youtube.com/"), None);
        assert_eq!(
            parse_launch_url("https://www.youtube.com/results?search_query=x"),
            None
        );
    }

    #[test]
    fn parse_cli_defaults_to_no_flags_and_no_deep_link() {
        let args: Vec<String> = vec!["lalin-cast.exe".to_owned()];
        assert_eq!(parse_cli(&args), LaunchOptions::default());
    }

    #[test]
    fn parse_cli_recognizes_fullscreen_and_version_flags() {
        let args: Vec<String> = vec!["lalin-cast.exe".to_owned(), "--fullscreen".to_owned()];
        let options = parse_cli(&args);
        assert!(options.fullscreen);
        assert!(!options.version);

        let args: Vec<String> = vec!["lalin-cast.exe".to_owned(), "--version".to_owned()];
        let options = parse_cli(&args);
        assert!(options.version);
        assert!(!options.fullscreen);
    }

    #[test]
    fn parse_cli_skips_the_program_name_at_index_zero() {
        // A bare program name that happens to look like a flag or URL must
        // never be parsed as one — only args[1..] are candidates.
        let args: Vec<String> = vec!["--version".to_owned()];
        assert_eq!(parse_cli(&args), LaunchOptions::default());
    }

    #[test]
    fn parse_cli_picks_the_last_url_that_parses_and_ignores_unknown_arguments() {
        let args: Vec<String> = vec![
            "lalin-cast.exe".to_owned(),
            "--fullscreen".to_owned(),
            "--some-unknown-flag".to_owned(),
            "https://www.youtube.com/watch?v=aaaaaaaaaaa".to_owned(),
            "not a url either".to_owned(),
            "https://www.youtube.com/watch?v=bbbbbbbbbbb".to_owned(),
        ];
        let options = parse_cli(&args);
        assert!(options.fullscreen);
        assert_eq!(
            options.deep_link,
            Some(DeepLink::Video("bbbbbbbbbbb".to_owned()))
        );
    }

    #[test]
    fn parse_cli_never_panics_on_an_empty_argument_list() {
        let args: Vec<String> = Vec::new();
        assert_eq!(parse_cli(&args), LaunchOptions::default());
    }
}
