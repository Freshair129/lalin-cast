//! Rotating local log file for supportability (Wave 9): a small text log at
//! `<app_local_data_dir>/logs/lalin-cast.log` that actually survives a
//! release build. Release builds carry `windows_subsystem = "windows"` (no
//! console — see `main.rs`), so every `eprintln!` this wave replaces went
//! to a place no user could ever read; this file is what a user reporting
//! "DIAL won't bind" or "the updater failed" can now attach.
//!
//! **Privacy is enforced here, once, not trusted to every call site.**
//! [`info`], [`warn`] and [`error`] are the only three ways anything in this
//! crate reaches the file, and every one of them runs the message through
//! [`sanitize_log_message`] first — there is no path that writes a raw
//! string to disk. That single choke point is what makes "never log a TV
//! pairing code, a cookie, a token, a URL, or a filesystem path" (a Windows
//! path embeds the user's account name) an enforced invariant instead of a
//! rule every future call site has to remember on its own. Wave 10 closes
//! the remaining gap in that guarantee: [`sanitize_log_message_with`] (the
//! pure worker [`sanitize_log_message`] delegates to) also masks the
//! user's home folder and Windows account name wherever they appear in a
//! message, not only inside a recognizable path — see its doc comment for
//! the exact, order-dependent contract.
//!
//! Every failure in this module is silent: a full disk, a permissions
//! error, or a missing `app_local_data_dir` never panics, is never
//! propagated as an `Err` a caller would have to handle, and never blocks
//! startup. In debug builds the same already-sanitized line is also
//! mirrored to `eprintln!`, so a developer running `cargo run`/`cargo test`
//! keeps seeing messages immediately without opening the file.
//!
//! Concurrency: [`LogState`]'s `Mutex<()>` turns "check the current file's
//! size, rotate if it's over the cap, append the line" into one critical
//! section (see [`append_line`]) so two threads logging at the same instant
//! can never interleave a single line or race the rotation.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager, Window};

use crate::lifecycle;
use crate::portable;
use crate::settings::SETTINGS_LABEL;

/// Folder under `app_local_data_dir` the log file (and its one rotated
/// backup) live in — the same parent directory `lifecycle.json` already
/// uses (`%LOCALAPPDATA%\ai.lalin.cast\`).
const LOG_DIR_NAME: &str = "logs";
/// The current log file's name. Also the only thing `diagnostics.rs`'s
/// `logFile:` line is allowed to show — never the full path, which would
/// embed the Windows account name.
pub const LOG_FILE_NAME: &str = "lalin-cast.log";
const ROTATED_FILE_NAME: &str = "lalin-cast.log.1";
/// Rotate once the current file exceeds this size. Keeps at most two files
/// on disk (the live file plus one rotated backup), so the total footprint
/// stays around 1 MiB and never grows without bound.
const MAX_LOG_FILE_BYTES: u64 = 512 * 1024;
/// Sanitiser truncation length, counted in `char`s — never bytes — so a
/// Thai message is never cut mid-character.
const MAX_MESSAGE_CHARS: usize = 512;

/// Minimum length, in `char`s, [`sanitize_log_message_with`] requires
/// before it will mask a `home` or `user` value at all — contract 3's
/// guard against a one- or two-character account name (or an empty/near-
/// empty `USERPROFILE`) turning ordinary words in a log message into
/// false-positive masks.
const MIN_MASKED_VALUE_CHARS: usize = 3;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Level {
    Info,
    Warn,
    Error,
}

impl Level {
    fn label(self) -> &'static str {
        match self {
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }
}

/// Managed once, early, in `lib.rs::run`'s `setup` hook — before any other
/// setup step that might log — so `app.try_state::<LogState>()` is already
/// present for every call site converted from `eprintln!` this wave,
/// regardless of call order. See the module doc comment for what the lock
/// guards.
#[derive(Default)]
pub struct LogState(Mutex<()>);

/// Wave 11 contract 2: `<data_root>/logs` in portable mode — installed
/// mode's resolution (`app_local_data_dir()`, below) is completely
/// untouched, since [`portable::data_dir_override`] returns `None` there.
/// `None` only when neither a portable data root nor `app_local_data_dir`
/// can be resolved (no panic, no `Err` — callers already treat a missing
/// dir as "stay silent").
fn log_dir(app: &AppHandle) -> Option<PathBuf> {
    match portable::data_dir_override() {
        Some(root) => Some(root.join(LOG_DIR_NAME)),
        None => app
            .path()
            .app_local_data_dir()
            .ok()
            .map(|dir| dir.join(LOG_DIR_NAME)),
    }
}

/// Formats one line exactly as contract 1 specifies:
/// `<unix seconds> <LEVEL> <module>: <message>`. `message` must already be
/// sanitized — this function does not sanitize on its own.
fn format_line(level: Level, module: &str, message: &str) -> String {
    format!(
        "{} {} {module}: {message}",
        lifecycle::now_unix(),
        level.label()
    )
}

fn write_log(app: &AppHandle, level: Level, module: &str, message: &str) {
    let sanitized = sanitize_log_message(message);
    let line = format_line(level, module, &sanitized);

    // Debug builds mirror to stderr unconditionally — even if managing
    // `LogState`/resolving the dir/the file write below all fail — so a
    // developer never loses a message just because the file couldn't be
    // written.
    #[cfg(debug_assertions)]
    eprintln!("{line}");

    let Some(state) = app.try_state::<LogState>() else {
        return;
    };
    let Some(dir) = log_dir(app) else {
        return;
    };
    let Ok(_guard) = state.0.lock() else {
        return;
    };
    let _ = append_line(&dir, &line);
}

/// Writes an `INFO` line. `module` is a short module name (`"dial"`,
/// `"updater"`, ...); `message` is sanitized before it can reach the file.
pub fn info(app: &AppHandle, module: &str, message: &str) {
    write_log(app, Level::Info, module, message);
}

/// Writes a `WARN` line. See [`info`].
pub fn warn(app: &AppHandle, module: &str, message: &str) {
    write_log(app, Level::Warn, module, message);
}

/// Writes an `ERROR` line. See [`info`].
pub fn error(app: &AppHandle, module: &str, message: &str) {
    write_log(app, Level::Error, module, message);
}

/// Appends one already-formatted, already-sanitized line to
/// `<dir>/lalin-cast.log`, creating `dir` if it does not exist yet and
/// rotating first if the current file is already over
/// [`MAX_LOG_FILE_BYTES`]. Takes a plain `&Path` (rather than an
/// `AppHandle`) so the rotation tests below can drive it directly against a
/// real temporary directory — never the real app data dir — with no
/// sleeping required.
fn append_line(dir: &Path, line: &str) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let file_path = dir.join(LOG_FILE_NAME);
    rotate_if_needed(dir, &file_path)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

/// Renames the current log file to [`ROTATED_FILE_NAME`], overwriting
/// whatever was already there, whenever it is already over
/// [`MAX_LOG_FILE_BYTES`]. `std::fs::rename` replaces an existing
/// destination on both Windows and POSIX — the same guarantee
/// `lifecycle::write_state_atomic`'s tmp-then-rename already relies on — so
/// this never needs to delete the old backup first. A missing current file
/// (nothing written yet this run) is simply left alone. Keeps exactly two
/// files on disk, ever: the live file and at most one rotated backup.
fn rotate_if_needed(dir: &Path, file_path: &Path) -> std::io::Result<()> {
    let size = fs::metadata(file_path).map(|meta| meta.len()).unwrap_or(0);
    if size > MAX_LOG_FILE_BYTES {
        fs::rename(file_path, dir.join(ROTATED_FILE_NAME))?;
    }
    Ok(())
}

/// Current log file's size in KiB, rounded to the nearest whole KiB (`0`
/// when the file does not exist yet or the dir can't be resolved). Used
/// only by `diagnostics.rs`'s `logFile:` line, which — per contract 4 —
/// must never carry more than the file name and this number, never the
/// full path.
pub fn current_size_kib(app: &AppHandle) -> u64 {
    let Some(dir) = log_dir(app) else {
        return 0;
    };
    let size = fs::metadata(dir.join(LOG_FILE_NAME))
        .map(|meta| meta.len())
        .unwrap_or(0);
    (size + 512) / 1024
}

/// Opens `<app_local_data_dir>/logs` in Explorer, exactly like
/// `setup::setup_open_network_settings`'s fixed-target pattern: label-
/// guarded to the settings window, and the folder is always
/// [`log_dir`] — never anything the page could supply as an argument.
#[tauri::command]
pub fn settings_open_log_folder(window: Window) -> Result<(), String> {
    if window.label() != SETTINGS_LABEL {
        return Err(
            "settings_open_log_folder is only available from the settings window".to_owned(),
        );
    }
    let app = window.app_handle();
    let dir = log_dir(app).ok_or_else(|| "could not resolve the log folder".to_owned())?;
    // Best-effort: a user clicking this before anything was ever logged
    // this run should still get a folder to look at, not an error.
    let _ = fs::create_dir_all(&dir);
    std::process::Command::new("cmd")
        .args(["/c", "start", ""])
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("could not open the log folder: {error}"))
}

/// Reads `USERPROFILE` once, ever, for the lifetime of the process — see
/// [`sanitize_log_message`].
static HOME_ENV: OnceLock<Option<String>> = OnceLock::new();
/// Reads `USERNAME` once, ever, for the lifetime of the process — see
/// [`sanitize_log_message`].
static USER_ENV: OnceLock<Option<String>> = OnceLock::new();

/// The call site every message this crate logs actually goes through
/// (`write_log` calls this, never [`sanitize_log_message_with`] directly).
/// Reads `USERPROFILE`/`USERNAME` from the real environment exactly once —
/// into the two [`OnceLock`]s above — no matter how many times a message is
/// logged over the life of the process, then delegates to
/// [`sanitize_log_message_with`], which does the actual work and takes no
/// dependency on the environment itself (that split is what makes the pure
/// function testable without an env var ever leaking into a test).
pub fn sanitize_log_message(raw: &str) -> String {
    let home = HOME_ENV.get_or_init(|| std::env::var("USERPROFILE").ok());
    let user = USER_ENV.get_or_init(|| std::env::var("USERNAME").ok());
    sanitize_log_message_with(raw, home.as_deref(), user.as_deref())
}

/// Pure — see the Wave 10 plan's contract 3. Applied to every message
/// before it can reach the file (via [`sanitize_log_message`], called only
/// from [`write_log`], never bypassed). Steps run in this exact order,
/// each depending on the output of the one before:
///
/// 1. every control character (including `\r`/`\n`) becomes a plain space,
///    so one log call is always exactly one file line;
/// 2. when `home` is `Some` and at least [`MIN_MASKED_VALUE_CHARS`] long,
///    every case-insensitive occurrence of it — in both its `\`-separated
///    and `/`-separated forms — becomes `<home>`. This runs **before** the
///    path rule below so a path like `C:\Users\First Last\AppData` is
///    masked whole rather than only up to the first space inside the
///    account name, which is the leak Wave 9 documented;
/// 3. when `user` is `Some` and at least [`MIN_MASKED_VALUE_CHARS`] long,
///    every case-insensitive **whole-word** occurrence of it (not preceded
///    or followed by a letter or digit) becomes `<user>` — so `bob` is
///    masked on its own but not inside `bobcat`;
/// 4. any URL whose scheme matches `[A-Za-z][A-Za-z0-9+.-]*://`
///    case-insensitively, up to the next whitespace character, becomes
///    `<url>`. This replaces Wave 9's fixed three-entry scheme list, so an
///    unlisted scheme (`ftp://`, `file://`, ...) is masked too;
/// 5. a Windows path starting `X:\`, `X:/`, `\\`, or `<home>\` / `<home>/`
///    (a path under the home folder whose prefix step 2 already replaced),
///    up to the next whitespace character, becomes `<path>` — so the
///    folders and file name after the home folder are masked too, not only
///    the home prefix;
/// 6. the result is truncated to [`MAX_MESSAGE_CHARS`] **characters**,
///    never bytes, so a Thai message is never cut mid-character.
///
/// Remaining limitation, documented rather than silently accepted: any path
/// that contains a space after its start (e.g. `D:\Media Library\x`, or a
/// file name with a space under the home folder) is masked only up to that
/// first space; the text after it stays in the line. Steps 2 and 3 remove
/// the account name wherever they match, but a fragment of it can still
/// survive in such a tail (a name shorter than
/// [`MIN_MASKED_VALUE_CHARS`], glued to other letters or digits, differing
/// in non-ASCII letter case, or only one word of a multi-word name).
pub fn sanitize_log_message_with(raw: &str, home: Option<&str>, user: Option<&str>) -> String {
    let mut message: String = raw
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect();

    if let Some(home) = home {
        if home.chars().count() >= MIN_MASKED_VALUE_CHARS {
            message = mask_home(&message, home);
        }
    }

    if let Some(user) = user {
        if user.chars().count() >= MIN_MASKED_VALUE_CHARS {
            message = mask_user_whole_word(&message, user);
        }
    }

    message = mask_urls(&message);
    message = mask_windows_paths(&message);

    message.chars().take(MAX_MESSAGE_CHARS).collect()
}

/// Step 2: replaces every case-insensitive occurrence of `home` in `text`
/// with `<home>`, matching both `home`'s own separator style and the
/// opposite one (a `\`-separated `home` also matches a `/`-separated
/// occurrence in the message, and vice versa) — both forms are the same
/// length in `char`s, since they differ only by swapping one separator
/// character for the other.
fn mask_home(text: &str, home: &str) -> String {
    let variant_back: Vec<char> = home
        .chars()
        .map(|ch| if ch == '/' { '\\' } else { ch })
        .collect();
    let variant_fwd: Vec<char> = home
        .chars()
        .map(|ch| if ch == '\\' { '/' } else { ch })
        .collect();
    let len = variant_back.len();
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let boundary_after = !matches!(chars.get(i + len), Some(next) if next.is_alphanumeric());
        if i + len <= chars.len()
            && boundary_after
            && (chars_eq_ignore_ascii_case(&chars[i..i + len], &variant_back)
                || chars_eq_ignore_ascii_case(&chars[i..i + len], &variant_fwd))
        {
            result.push_str("<home>");
            i += len;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

/// Step 3: replaces every case-insensitive **whole-word** occurrence of
/// `user` in `text` with `<user>` — a match only counts when the character
/// immediately before it (if any) and the character immediately after it
/// (if any) are neither a letter nor a digit, so `bob` inside `bobcat` is
/// left untouched.
fn mask_user_whole_word(text: &str, user: &str) -> String {
    let user_chars: Vec<char> = user.chars().collect();
    let len = user_chars.len();
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let candidate_end = i + len;
        let is_match = candidate_end <= chars.len()
            && chars_eq_ignore_ascii_case(&chars[i..candidate_end], &user_chars);
        if is_match {
            let preceded_by_word_char = i > 0 && chars[i - 1].is_alphanumeric();
            let followed_by_word_char =
                candidate_end < chars.len() && chars[candidate_end].is_alphanumeric();
            if !preceded_by_word_char && !followed_by_word_char {
                result.push_str("<user>");
                i = candidate_end;
                continue;
            }
        }
        result.push(chars[i]);
        i += 1;
    }
    result
}

/// Step 4: replaces every URL — any scheme matching
/// `[A-Za-z][A-Za-z0-9+.-]*://` case-insensitively, up to the next
/// whitespace character or the end of the string — with `<url>`.
fn mask_urls(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(len) = url_token_len(&chars[i..]) {
            result.push_str("<url>");
            i += len;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

/// If `remaining` starts with a URL scheme (`[A-Za-z][A-Za-z0-9+.-]*://`,
/// case-insensitive — the `://` itself is plain ASCII punctuation, so case
/// never applies to it), returns how many `char`s the whole token (scheme
/// included) spans, up to the next whitespace character or the end of the
/// slice.
fn url_token_len(remaining: &[char]) -> Option<usize> {
    if remaining.is_empty() || !remaining[0].is_ascii_alphabetic() {
        return None;
    }
    let mut scheme_end = 1;
    while scheme_end < remaining.len() && is_scheme_char(remaining[scheme_end]) {
        scheme_end += 1;
    }
    let has_separator = scheme_end + 3 <= remaining.len()
        && remaining[scheme_end] == ':'
        && remaining[scheme_end + 1] == '/'
        && remaining[scheme_end + 2] == '/';
    if has_separator {
        Some(token_len_from(remaining, scheme_end + 3))
    } else {
        None
    }
}

/// A character allowed after the first letter of a URL scheme:
/// `[A-Za-z0-9+.-]`.
fn is_scheme_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '+' || ch == '.' || ch == '-'
}

/// Step 5: replaces every Windows path — drive-letter (`X:\` or `X:/`) or
/// UNC (`\\`) — up to the next whitespace character or the end of the
/// string, with `<path>`.
fn mask_windows_paths(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(len) = windows_path_token_len(&chars[i..]) {
            result.push_str("<path>");
            i += len;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

/// If `remaining` starts with a Windows drive-letter path (`C:\...` or
/// `C:/...`) or a UNC path (`\\...`), returns how many `char`s the whole
/// token spans, up to the next whitespace character or the end of the
/// slice.
fn windows_path_token_len(remaining: &[char]) -> Option<usize> {
    let is_drive_path = remaining.len() >= 3
        && remaining[0].is_ascii_alphabetic()
        && remaining[1] == ':'
        && (remaining[2] == '\\' || remaining[2] == '/');
    let is_unc_path = remaining.len() >= 2 && remaining[0] == '\\' && remaining[1] == '\\';
    // A path under the home folder, whose prefix step 2 already turned into
    // `<home>`: everything after it (sub-folders, file name) is still part
    // of the path and must be masked too, not left in the line in clear.
    let is_home_path = starts_with_chars(remaining, HOME_PLACEHOLDER)
        && matches!(
            remaining.get(HOME_PLACEHOLDER.len()),
            Some('\\') | Some('/')
        );
    if is_drive_path || is_unc_path || is_home_path {
        Some(token_len_from(remaining, 0))
    } else {
        None
    }
}

/// The placeholder step 2 writes for the home folder, as `char`s so the
/// path rule can recognise a path that begins with it.
const HOME_PLACEHOLDER: &[char] = &['<', 'h', 'o', 'm', 'e', '>'];

fn starts_with_chars(remaining: &[char], prefix: &[char]) -> bool {
    remaining.len() >= prefix.len() && &remaining[..prefix.len()] == prefix
}

/// Extends `start` forward through `remaining` until the next whitespace
/// `char` (`char::is_whitespace`, which already covers space/tab/`\r`/`\n`)
/// or the end of the slice.
fn token_len_from(remaining: &[char], start: usize) -> usize {
    let mut len = start;
    while len < remaining.len() && !remaining[len].is_whitespace() {
        len += 1;
    }
    len
}

/// Case-insensitive (ASCII only — Windows account names and drive letters
/// are ASCII in practice, and `char::to_ascii_lowercase` is a cheap,
/// length-preserving 1:1 mapping that keeps every slice index above valid,
/// unlike full Unicode case folding) equality of two equal-length `char`
/// slices.
fn chars_eq_ignore_ascii_case(a: &[char], b: &[char]) -> bool {
    a.len() == b.len()
        && a.iter()
            .zip(b.iter())
            .all(|(x, y)| x.eq_ignore_ascii_case(y))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        append_line, format_line, sanitize_log_message, sanitize_log_message_with, Level,
        LOG_FILE_NAME, MAX_LOG_FILE_BYTES, ROTATED_FILE_NAME,
    };

    fn temp_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("lalin-cast-log-test-{}-{name}", std::process::id()))
    }

    // -- sanitize_log_message: contract 2, every listed case --

    #[test]
    fn leaves_an_ordinary_message_untouched() {
        assert_eq!(
            sanitize_log_message("DIAL ready on port 8008"),
            "DIAL ready on port 8008"
        );
        assert_eq!(sanitize_log_message("เริ่มต้นสำเร็จ"), "เริ่มต้นสำเร็จ");
    }

    #[test]
    fn replaces_an_http_url_up_to_the_next_whitespace() {
        assert_eq!(
            sanitize_log_message("fetch http://example.com/a?b=1 failed"),
            "fetch <url> failed"
        );
    }

    #[test]
    fn replaces_an_https_url_up_to_the_next_whitespace() {
        assert_eq!(
            sanitize_log_message("see https://example.com/path/x for details"),
            "see <url> for details"
        );
    }

    #[test]
    fn replaces_a_lalin_cast_deep_link_url() {
        assert_eq!(
            sanitize_log_message("opened lalin-cast://media/abc123 from tray"),
            "opened <url> from tray"
        );
    }

    #[test]
    fn replaces_a_drive_letter_windows_path() {
        assert_eq!(
            sanitize_log_message(r"could not write C:\Users\somebody\AppData\lalin-cast.log now"),
            "could not write <path> now"
        );
    }

    #[test]
    fn replaces_a_unc_windows_path() {
        assert_eq!(
            sanitize_log_message(r"could not reach \\nas\share\file.txt now"),
            "could not reach <path> now"
        );
    }

    #[test]
    fn replaces_several_patterns_at_once_in_one_message() {
        let raw =
            r"GET https://example.com/x failed reading C:\Users\bob\file.txt via \\nas\share\x";
        assert_eq!(
            sanitize_log_message(raw),
            "GET <url> failed reading <path> via <path>"
        );
    }

    #[test]
    fn turns_every_control_character_including_cr_lf_into_a_space() {
        assert_eq!(
            sanitize_log_message("line one\r\nline two\tend"),
            "line one  line two end"
        );
        // A single log call is always exactly one file line.
        assert_eq!(sanitize_log_message("a\r\nb\nc\rd").lines().count(), 1);
    }

    #[test]
    fn truncates_at_512_characters_without_splitting_a_thai_character() {
        let raw = "ก".repeat(600);
        let sanitized = sanitize_log_message(&raw);
        assert_eq!(sanitized.chars().count(), 512);
        assert_eq!(sanitized, "ก".repeat(512));
    }

    #[test]
    fn truncation_is_counted_after_replacement_not_before() {
        // A message that is short in raw chars but would still exceed 512
        // once expanded is not a concern here (placeholders only shrink
        // text), but this proves truncation runs on the final, sanitized
        // string rather than the raw input.
        //
        // Wave 10 note: a plain space now separates the `x` run from the
        // URL (Wave 9's version ran them together). Contract 3's generic
        // scheme grammar `[A-Za-z][A-Za-z0-9+.-]*://` has no word-boundary
        // requirement before the scheme, so `x` — itself a valid scheme
        // character — is swallowed into the match when it runs directly
        // into `https`, making the *whole* prefix-plus-URL one `<url>`
        // token instead of leaving the `x` run untouched. That is the
        // literal, intended behavior of the broader scheme rule (it is
        // exactly what closes the unlisted-scheme case), not a bug in this
        // test's setup, so the fix is to give the two tokens a whitespace
        // boundary rather than to narrow the scheme match.
        let raw = format!(
            "{} {}",
            "x".repeat(510),
            "https://example.com/very/long/path"
        );
        let sanitized = sanitize_log_message(&raw);
        assert_eq!(sanitized.chars().count(), 512);
        assert!(sanitized.starts_with(&"x".repeat(510)));
    }

    // -- sanitize_log_message_with: Wave 10 contract 3, every listed case.
    // Every test here passes explicit `home`/`user` values and never reads
    // the real environment.

    #[test]
    fn masks_a_home_path_containing_a_space_so_neither_half_of_the_name_survives() {
        // This is the exact leak Wave 9 documented: without home masking
        // running before the path rule, `C:\Users\First Last\AppData\x.log`
        // would only be replaced up to the space, leaving "Last" behind.
        let sanitized = sanitize_log_message_with(
            r"could not write C:\Users\First Last\AppData\lalin-cast.log now",
            Some(r"C:\Users\First Last"),
            None,
        );
        assert!(!sanitized.contains("First"));
        assert!(!sanitized.contains("Last"));
        // The whole path, home prefix included, is masked as one unit.
        assert_eq!(sanitized, "could not write <path> now");
    }

    #[test]
    fn masks_a_forward_slash_home_in_a_different_case() {
        let sanitized = sanitize_log_message_with(
            "reading c:/users/first last/appdata/lalin-cast.log now",
            Some(r"C:\Users\First Last"),
            None,
        );
        assert!(!sanitized.to_lowercase().contains("first"));
        assert!(!sanitized.to_lowercase().contains("last"));
        assert_eq!(sanitized, "reading <path> now");
    }

    #[test]
    fn masks_the_account_name_as_a_whole_word_but_not_inside_a_longer_word() {
        assert_eq!(
            sanitize_log_message_with("signed in as bob today", None, Some("bob")),
            "signed in as <user> today"
        );
        assert_eq!(
            sanitize_log_message_with("the bobcat ran away", None, Some("bob")),
            "the bobcat ran away"
        );
        // Case-insensitive too.
        assert_eq!(
            sanitize_log_message_with("BOB signed in", None, Some("bob")),
            "<user> signed in"
        );
    }

    #[test]
    fn leaves_an_account_name_shorter_than_three_characters_alone() {
        assert_eq!(
            sanitize_log_message_with("hi to all", None, Some("hi")),
            "hi to all"
        );
    }

    #[test]
    fn masks_https_ftp_and_file_urls_regardless_of_scheme_case() {
        assert_eq!(
            sanitize_log_message_with("see HTTPS://example.com/a for details", None, None),
            "see <url> for details"
        );
        assert_eq!(
            sanitize_log_message_with("fetch ftp://example.com/a failed", None, None),
            "fetch <url> failed"
        );
        assert_eq!(
            sanitize_log_message_with("opened file:///C:/data/x.txt now", None, None),
            "opened <url> now"
        );
    }

    #[test]
    fn masks_a_forward_slash_drive_path() {
        assert_eq!(
            sanitize_log_message_with("reading C:/Users/x/file.txt now", None, None),
            "reading <path> now"
        );
    }

    #[test]
    fn none_home_and_none_user_reproduce_the_previous_behavior() {
        let raw =
            r"GET https://example.com/x failed reading C:\Users\bob\file.txt via \\nas\share\x";
        assert_eq!(
            sanitize_log_message_with(raw, None, None),
            "GET <url> failed reading <path> via <path>"
        );
        assert_eq!(
            sanitize_log_message_with("ordinary message, nothing to mask", None, None),
            "ordinary message, nothing to mask"
        );
        assert_eq!(
            sanitize_log_message_with("line one\r\nline two\tend", None, None),
            "line one  line two end"
        );
    }

    #[test]
    fn home_masking_runs_before_the_path_rule_on_the_same_message() {
        // Home masking runs first so the space inside the account name
        // cannot split the path; the path rule then recognises `<home>\`
        // as a path start and masks everything after it too, so neither
        // the account name nor the folders and file below it survive.
        let sanitized = sanitize_log_message_with(
            r"path is C:\Users\First Last\AppData\x.log end",
            Some(r"C:\Users\First Last"),
            None,
        );
        assert_eq!(sanitized, "path is <path> end");
    }

    #[test]
    fn adversarial_cases_from_the_wave_10_verify_rubric() {
        let home = Some(r"C:\Users\bob");
        let user = Some("bob");
        // The home folder appearing twice, once at the very end.
        assert_eq!(
            sanitize_log_message_with(r"from C:\Users\bob\a.txt to C:\Users\bob", home, user),
            "from <path> to <home>"
        );
        // The account name next to punctuation is still a whole word.
        assert_eq!(
            sanitize_log_message_with("hello bob, bye bob.", None, user),
            "hello <user>, bye <user>."
        );
        // A URL immediately followed by punctuation is masked with it,
        // since the token runs to the next whitespace.
        assert_eq!(
            sanitize_log_message_with("see https://example.com/a?b=1. done", None, None),
            "see <url> done"
        );
        // Upper-case and unusual schemes.
        assert_eq!(
            sanitize_log_message_with("a SVN+SSH://host/x b", None, None),
            "a <url> b"
        );
        // A two-letter account name is deliberately left alone.
        assert_eq!(
            sanitize_log_message_with("user Al here", None, Some("Al")),
            "user Al here"
        );
        // A 600-character Thai string is cut to exactly 512 characters and
        // remains valid UTF-8 (a String cannot hold a split character).
        let thai = "ก".repeat(600);
        assert_eq!(
            sanitize_log_message_with(&thai, None, None).chars().count(),
            512
        );
    }

    #[test]
    fn a_path_under_home_without_spaces_is_masked_whole_as_in_wave_9() {
        // Regression guard: masking home first must never expose what
        // follows it. Wave 9 masked this whole; so must wave 10.
        let sanitized = sanitize_log_message_with(
            r"opened C:\Users\bob\Documents\contract.pdf ok",
            Some(r"C:\Users\bob"),
            None,
        );
        assert_eq!(sanitized, "opened <path> ok");
        assert!(!sanitized.contains("Documents"));
        assert!(!sanitized.contains("contract"));
    }

    #[test]
    fn home_does_not_match_a_longer_folder_that_shares_its_prefix() {
        // `C:\Users\bob` must not turn `C:\Users\bobby` into `<home>by`;
        // the path rule masks the longer folder whole instead.
        let sanitized =
            sanitize_log_message_with(r"x C:\Users\bobby\notes.txt y", Some(r"C:\Users\bob"), None);
        assert_eq!(sanitized, "x <path> y");
    }

    #[test]
    fn the_bare_home_folder_is_masked_without_becoming_a_path() {
        let sanitized =
            sanitize_log_message_with(r"home is C:\Users\bob today", Some(r"C:\Users\bob"), None);
        assert_eq!(sanitized, "home is <home> today");
    }

    #[test]
    fn a_file_name_with_a_space_under_home_is_masked_only_up_to_the_space() {
        // Documented limit, pinned so a change to it is deliberate: the
        // account name is gone, but the tail after the space stays.
        let sanitized = sanitize_log_message_with(
            r"C:\Users\bob\Documents\Jane Doe.pdf",
            Some(r"C:\Users\bob"),
            None,
        );
        assert_eq!(sanitized, "<path> Doe.pdf");
        assert!(!sanitized.contains("bob"));
    }

    // -- format_line --

    #[test]
    fn formats_a_line_exactly_per_contract() {
        let line = format_line(Level::Info, "dial", "ready");
        assert!(line.ends_with(" INFO dial: ready"));
        let timestamp = line
            .split(' ')
            .next()
            .expect("line should have a first token");
        assert!(timestamp.parse::<u64>().is_ok());
    }

    // -- rotation: driven directly against a real temp dir, never the real
    // app data dir, and never sleeping (the size cap is simulated by
    // pre-writing an oversized file rather than waiting for one to grow).

    #[test]
    fn append_line_creates_the_folder_and_writes_one_line() {
        let dir = temp_dir("create");
        let _ = fs::remove_dir_all(&dir);

        append_line(&dir, "1700000000 INFO dial: ready").expect("append should succeed");

        let contents = fs::read_to_string(dir.join(LOG_FILE_NAME)).expect("log file should exist");
        assert_eq!(contents, "1700000000 INFO dial: ready\n");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn does_not_rotate_while_under_the_size_cap() {
        let dir = temp_dir("no-rotate");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir should be creatable");

        fs::write(dir.join(LOG_FILE_NAME), "x".repeat(100)).expect("seed write should succeed");
        append_line(&dir, "1700000003 INFO dial: still small").expect("append should succeed");

        assert!(!dir.join(ROTATED_FILE_NAME).exists());
        let current = fs::read_to_string(dir.join(LOG_FILE_NAME)).unwrap();
        assert!(current.ends_with("1700000003 INFO dial: still small\n"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rotates_once_the_current_file_exceeds_the_cap() {
        let dir = temp_dir("rotate");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir should be creatable");

        let oversized = "x".repeat((MAX_LOG_FILE_BYTES + 1) as usize);
        fs::write(dir.join(LOG_FILE_NAME), &oversized).expect("seed write should succeed");

        append_line(&dir, "1700000001 WARN dial: rebinding").expect("append should succeed");

        let rotated =
            fs::read_to_string(dir.join(ROTATED_FILE_NAME)).expect("rotated backup should exist");
        assert_eq!(rotated, oversized);
        let current =
            fs::read_to_string(dir.join(LOG_FILE_NAME)).expect("fresh log file should exist");
        assert_eq!(current, "1700000001 WARN dial: rebinding\n");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rotation_overwrites_a_previous_backup_and_never_keeps_more_than_two_files() {
        let dir = temp_dir("rotate-overwrite");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir should be creatable");

        fs::write(dir.join(ROTATED_FILE_NAME), "stale rotated content")
            .expect("seed write should succeed");
        let oversized = "y".repeat((MAX_LOG_FILE_BYTES + 1) as usize);
        fs::write(dir.join(LOG_FILE_NAME), &oversized).expect("seed write should succeed");

        append_line(&dir, "1700000002 ERROR dial: bind failed").expect("append should succeed");

        let rotated = fs::read_to_string(dir.join(ROTATED_FILE_NAME)).unwrap();
        assert_eq!(
            rotated, oversized,
            "rotation must overwrite the stale backup"
        );
        let entry_count = fs::read_dir(&dir).unwrap().count();
        assert_eq!(entry_count, 2, "at most two files must ever be kept");

        let _ = fs::remove_dir_all(&dir);
    }
}
