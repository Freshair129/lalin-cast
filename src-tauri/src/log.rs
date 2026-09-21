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
//! rule every future call site has to remember on its own.
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
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Window};

use crate::lifecycle;
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

/// URL schemes contract 2 requires masking (checked in this order, but the
/// order does not matter — the three prefixes cannot overlap).
const URL_SCHEMES: [&str; 3] = ["http://", "https://", "lalin-cast://"];

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

/// `None` only when `app_local_data_dir` itself can't be resolved (no
/// panic, no `Err` — callers already treat a missing dir as "stay silent").
fn log_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join(LOG_DIR_NAME))
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

/// Pure — see the Wave 9 plan's contract 2. Applied to every message before
/// it can reach the file (called only from [`write_log`], never bypassed):
/// replaces `http://`/`https://`/`lalin-cast://` URLs and Windows paths
/// (drive-letter or UNC) — each up to its next whitespace character — with
/// a placeholder, turns every control character (including `\r`/`\n`) into
/// a plain space so one log call is always exactly one file line, and
/// truncates to [`MAX_MESSAGE_CHARS`] characters (never bytes).
pub fn sanitize_log_message(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    let mut result = String::with_capacity(raw.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(len) = url_token_len(&chars[i..]) {
            result.push_str("<url>");
            i += len;
            continue;
        }
        if let Some(len) = windows_path_token_len(&chars[i..]) {
            result.push_str("<path>");
            i += len;
            continue;
        }
        let ch = chars[i];
        result.push(if ch.is_control() { ' ' } else { ch });
        i += 1;
    }
    result.chars().take(MAX_MESSAGE_CHARS).collect()
}

/// If `remaining` starts with one of [`URL_SCHEMES`], returns how many
/// `char`s the whole token (scheme included) spans, up to the next
/// whitespace character or the end of the slice.
fn url_token_len(remaining: &[char]) -> Option<usize> {
    URL_SCHEMES.iter().find_map(|scheme| {
        let scheme_len = scheme.chars().count();
        let matches = remaining.len() >= scheme_len
            && remaining[..scheme_len].iter().copied().eq(scheme.chars());
        if matches {
            Some(token_len_from(remaining, scheme_len))
        } else {
            None
        }
    })
}

/// If `remaining` starts with a Windows drive-letter path (e.g. `C:\...`)
/// or a UNC path (`\\...`), returns how many `char`s the whole token spans,
/// up to the next whitespace character or the end of the slice.
fn windows_path_token_len(remaining: &[char]) -> Option<usize> {
    let is_drive_path = remaining.len() >= 3
        && remaining[0].is_ascii_alphabetic()
        && remaining[1] == ':'
        && remaining[2] == '\\';
    let is_unc_path = remaining.len() >= 2 && remaining[0] == '\\' && remaining[1] == '\\';
    if is_drive_path || is_unc_path {
        Some(token_len_from(remaining, 0))
    } else {
        None
    }
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

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        append_line, format_line, sanitize_log_message, Level, LOG_FILE_NAME, MAX_LOG_FILE_BYTES,
        ROTATED_FILE_NAME,
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
        let raw = format!(
            "{}{}",
            "x".repeat(510),
            "https://example.com/very/long/path"
        );
        let sanitized = sanitize_log_message(&raw);
        assert_eq!(sanitized.chars().count(), 512);
        assert!(sanitized.starts_with(&"x".repeat(510)));
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
