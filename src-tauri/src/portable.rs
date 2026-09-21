//! Wave 11 portable mode: when a marker file named [`MARKER_FILE_NAME`] sits
//! next to the running executable, every piece of data Lalin Cast itself
//! writes (the settings store, logs, `lifecycle.json`, the WebView2
//! profile) moves into a [`DATA_DIR_NAME`] folder beside the exe instead of
//! `%APPDATA%`/`%LOCALAPPDATA%\ai.lalin.cast`. See the Wave 11 plan's
//! contracts 1-4.
//!
//! **The single rule every other module in this crate must honor:
//! installed mode must not change by even one path.** Every helper below
//! that has an "installed" branch returns exactly what the call site did
//! before this module existed (a relative `PathBuf`, `None`, the builder
//! untouched) — the portable branch is strictly additive.
//!
//! The exe directory comes from `std::env::current_exe()` only — never the
//! working directory, an argument, or an environment variable (contract 1).
//! The decision is made exactly once per process, in [`init`], and cached
//! in a [`OnceLock`]; every other function in this module reads that cached
//! value rather than touching the filesystem again.
//!
//! # Evidence for contract 2's absolute-path claim
//!
//! `app.store(<path>)` (Wave 1-10 call sites) and `WebviewWindowBuilder`'s
//! `data_directory` are the two APIs this module must override in portable
//! mode. For the store, `tauri-plugin-store-2.4.5` (the version locked in
//! `Cargo.lock`, verified under `~/.cargo/registry/src/index.crates.io-*/
//! tauri-plugin-store-2.4.5/src/store.rs:26-30`):
//!
//! ```text
//! pub fn resolve_store_path<R: Runtime>(
//!     app: &AppHandle<R>,
//!     path: impl AsRef<Path>,
//! ) -> crate::Result<PathBuf> {
//!     Ok(dunce::simplified(&app.path().resolve(path, BaseDirectory::AppData)?).to_path_buf())
//! }
//! ```
//!
//! `app.path().resolve(path, BaseDirectory::AppData)` is `tauri` 2.11.5's
//! `PathResolver::resolve`, which calls its private `resolve_path` helper
//! (`tauri-2.11.5/src/path/mod.rs:312-367`). That helper starts from the
//! `AppData` base directory and, at line 363, does exactly
//! `base_dir_path.push(path)` — a plain `std::path::PathBuf::push`. Per the
//! standard library's own documented behavior, "if `path` is absolute, it
//! replaces the current path" — so passing an absolute `PathBuf` (what
//! [`settings_store_path`] returns in portable mode) makes the `AppData`
//! base irrelevant: `resolve` returns the absolute path unchanged. That is
//! the mechanism this module relies on to keep the store entirely off
//! `%APPDATA%` in portable mode without needing a different plugin API.
//!
//! For the WebView2 profile, `tauri-2.11.5/src/webview/webview_window.rs:1024`
//! (`WebviewWindowBuilder::data_directory(mut self, data_directory: PathBuf)
//! -> Self`) takes and returns an owned `Self`, so it chains directly into
//! the existing builder call sites via [`apply_data_dir`].

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager, Runtime, WebviewWindowBuilder};

use crate::log;

/// The marker file's name. Its content is never read — only its presence in
/// the exe's own directory matters.
pub const MARKER_FILE_NAME: &str = "lalin-cast.portable";
/// The data root's folder name, created beside the exe.
pub const DATA_DIR_NAME: &str = "lalin-cast-data";
/// Sub-folder of the data root the WebView2 profile is pointed at.
const WEBVIEW2_DIR_NAME: &str = "WebView2";
/// The settings store's file name — same literal every `app.store(...)`
/// call site used before this module existed; only the directory it
/// resolves against changes between modes.
const SETTINGS_STORE_FILE_NAME: &str = "media-settings.json";
/// Name of the throwaway file [`is_writable_dir`] creates and deletes to
/// prove a directory is actually writable, not merely creatable.
const WRITE_PROBE_FILE_NAME: &str = ".lalin-cast-write-probe";

/// The decided mode for this process — see the module doc comment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    Installed,
    Portable { data_root: PathBuf },
}

/// `create_dir_all`, then create-and-delete one probe file inside it — the
/// "writable" test contract 1 specifies, rather than trusting a bare
/// `create_dir_all` success (which windows can report even for some
/// read-only mounts).
fn is_writable_dir(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(WRITE_PROBE_FILE_NAME);
    if fs::write(&probe, []).is_err() {
        return false;
    }
    let _ = fs::remove_file(&probe);
    true
}

/// Pure detection — contract 1. `exe_dir` is the directory holding the
/// executable (the caller must resolve it from `std::env::current_exe()`
/// only; this function never touches the environment itself, which is what
/// makes it testable against a plain temp directory). No marker file in
/// `exe_dir` → [`Mode::Installed`]. A marker present and a writable
/// `<exe_dir>/lalin-cast-data` → [`Mode::Portable`] with that data root. A
/// marker present but the data root cannot be created/written (e.g. it
/// already exists as a plain file, or the exe sits somewhere read-only like
/// `Program Files`) → [`Mode::Installed`] — better to run installed than to
/// fail to start at all on a machine whose user does not even know a
/// marker file is there.
pub fn detect(exe_dir: &Path) -> Mode {
    if !exe_dir.join(MARKER_FILE_NAME).is_file() {
        return Mode::Installed;
    }
    let data_root = exe_dir.join(DATA_DIR_NAME);
    if is_writable_dir(&data_root) {
        Mode::Portable { data_root }
    } else {
        Mode::Installed
    }
}

static MODE: OnceLock<Mode> = OnceLock::new();
/// Fallback value for every reader that runs before [`init`] has ever been
/// called — in practice only this crate's own unit tests (`lib.rs::run`
/// always calls `init` first, before any other module in this crate can
/// possibly run). Defaulting to installed rather than panicking keeps every
/// existing test in `settings.rs`/`updater.rs`/etc. that calls
/// `is_portable()` transitively deterministic without needing a real
/// `AppHandle` or filesystem probe.
const UNINITIALIZED_DEFAULT: Mode = Mode::Installed;

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(Path::to_path_buf)
}

/// Decides the mode once for the whole process and caches it. Must be
/// called exactly once, early in `lib.rs::run`'s `setup` hook — after
/// `log::LogState` is managed (so the warning below has somewhere to go)
/// and before anything else in this crate can possibly read
/// [`mode`]/[`is_portable`]. A second call is a harmless no-op (`OnceLock`
/// semantics): the mode already decided on the first call is kept.
///
/// Logs one warning, through the existing sanitizing log module, exactly
/// when a marker was present but the data root could not be made writable
/// — contract 1's documented fallback case — so a user who did not expect
/// installed-mode behavior has something in the log file to go on. The
/// message never includes the data root path itself (nothing here needs
/// to — the sanitizer would mask it anyway, but this avoids depending on
/// that for a message this module controls completely).
pub fn init(app: &AppHandle) -> &'static Mode {
    // The fallback warning below is written from inside `get_or_init`.
    // That is safe only because `MODE.get()` still returns `None` while the
    // closure runs, so `log::warn` resolves the installed log folder (the
    // mode being decided *is* installed) instead of re-entering this cell.
    MODE.get_or_init(|| {
        let Some(dir) = exe_dir() else {
            return Mode::Installed;
        };
        let marker_present = dir.join(MARKER_FILE_NAME).is_file();
        let resolved = detect(&dir);
        if marker_present && matches!(resolved, Mode::Installed) {
            log::warn(
                app,
                "portable",
                "Lalin Cast: a portable marker was found next to the executable, but the data \
                 folder there could not be created or written; continuing in installed mode",
            );
        }
        resolved
    })
}

/// The decided mode, or [`Mode::Installed`] if [`init`] has not run yet in
/// this process (see [`UNINITIALIZED_DEFAULT`]'s doc comment).
pub fn mode() -> &'static Mode {
    MODE.get().unwrap_or(&UNINITIALIZED_DEFAULT)
}

pub fn is_portable() -> bool {
    matches!(mode(), Mode::Portable { .. })
}

fn data_root() -> Option<&'static Path> {
    match mode() {
        Mode::Portable { data_root } => Some(data_root.as_path()),
        Mode::Installed => None,
    }
}

/// Contract 2, settings store row: every `app.store(...)` call site in this
/// crate must pass this instead of the `"media-settings.json"` literal.
/// Installed mode returns exactly the old relative literal — unchanged
/// behavior, byte for byte. Portable mode returns an absolute path under
/// the data root, which the module doc comment above proves `tauri-plugin-store`
/// uses as-is (the `AppData` base it would otherwise resolve against is
/// discarded once the path is absolute).
pub fn settings_store_path() -> PathBuf {
    match data_root() {
        Some(root) => root.join(SETTINGS_STORE_FILE_NAME),
        None => PathBuf::from(SETTINGS_STORE_FILE_NAME),
    }
}

/// Contract 2, log/lifecycle rows: `Some(<data_root>)` in portable mode,
/// `None` in installed mode — `log.rs`/`lifecycle.rs` each fall back to
/// their existing `app_local_data_dir()` call only on `None`, so installed
/// mode's resolution path is completely untouched by this module.
pub fn data_dir_override() -> Option<PathBuf> {
    data_root().map(Path::to_path_buf)
}

/// Contract 2, WebView2 row: applies `.data_directory(<data_root>/WebView2)`
/// to a `WebviewWindowBuilder` in portable mode only; the builder is
/// returned exactly as given in installed mode, so every window keeps
/// wry/WebView2's own default profile location unchanged. Every one of the
/// crate's five `WebviewWindowBuilder::new(...)` call sites (media,
/// settings, setup, status, update) must wrap its builder in this — see
/// this module's `every_webview_window_builder_new_is_wrapped_by_apply_data_dir`
/// source-scan test.
pub fn apply_data_dir<'a, R, M>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M>
where
    R: Runtime,
    M: Manager<R>,
{
    match data_root() {
        Some(root) => builder.data_directory(root.join(WEBVIEW2_DIR_NAME)),
        None => builder,
    }
}

/// Contract 3: whether `lib.rs::run`'s startup reconcile of
/// `startWithWindows`/`deepLinkScheme` should run at all. Pure — takes the
/// live portable flag and the stored setting value as plain booleans, so
/// both call sites in `lib.rs` and this function's own tests exercise the
/// exact same decision without needing an `AppHandle`. Portable mode must
/// never touch the registry, not even the idempotent "it should already be
/// on, make sure it is" case this reconcile performs for installed mode.
pub fn should_reconcile_registry(is_portable: bool, stored_value: bool) -> bool {
    stored_value && !is_portable
}

/// Contract 3: whether turning a registry-backed toggle
/// (`startWithWindows`/`deepLinkScheme`) *on* is allowed. Turning either
/// *off* is always accepted; in portable mode `settings::set_one` then only
/// updates the store and skips the registry entirely, since an existing
/// entry may belong to an installed copy. Pure and parameterized on
/// `is_portable`, so `settings.rs`'s `apply_setting` and this function's
/// own tests both exercise the exact same rule without needing an
/// `AppHandle`.
pub fn reject_registry_write_in_portable_mode(
    is_portable: bool,
    turning_on: bool,
) -> Result<(), &'static str> {
    if is_portable && turning_on {
        Err("not available in portable mode")
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        detect, reject_registry_write_in_portable_mode, should_reconcile_registry, Mode,
        DATA_DIR_NAME, MARKER_FILE_NAME,
    };
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "lalin-cast-portable-test-{}-{name}",
            std::process::id()
        ))
    }

    // -- detect: contract 1's three documented cases --

    #[test]
    fn no_marker_is_installed() {
        let dir = temp_dir("no-marker");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir should be creatable");

        assert_eq!(detect(&dir), Mode::Installed);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn marker_and_writable_data_root_is_portable_with_the_correct_root() {
        let dir = temp_dir("writable");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir should be creatable");
        fs::write(dir.join(MARKER_FILE_NAME), []).expect("marker should be writable");

        let mode = detect(&dir);
        assert_eq!(
            mode,
            Mode::Portable {
                data_root: dir.join(DATA_DIR_NAME)
            }
        );
        // is_writable_dir actually created the data root as a side effect —
        // prove it is a real, writable directory, not just a computed path.
        assert!(dir.join(DATA_DIR_NAME).is_dir());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn marker_present_but_data_root_path_is_a_file_falls_back_to_installed() {
        let dir = temp_dir("blocked-by-file");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir should be creatable");
        fs::write(dir.join(MARKER_FILE_NAME), []).expect("marker should be writable");
        // The data root's own name already exists as a plain file, so
        // create_dir_all must fail.
        fs::write(dir.join(DATA_DIR_NAME), b"not a directory")
            .expect("seed file should be writable");

        assert_eq!(detect(&dir), Mode::Installed);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_marker_that_is_itself_a_directory_is_not_a_marker() {
        // `is_file()` (not `exists()`) is the check — a directory that
        // happens to share the marker's name must not switch the app into
        // portable mode.
        let dir = temp_dir("marker-is-dir");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(MARKER_FILE_NAME)).expect("temp dir should be creatable");

        assert_eq!(detect(&dir), Mode::Installed);

        let _ = fs::remove_dir_all(&dir);
    }

    // -- reject_registry_write_in_portable_mode: contract 3 --

    #[test]
    fn rejects_turning_a_registry_toggle_on_in_portable_mode() {
        assert_eq!(
            reject_registry_write_in_portable_mode(true, true),
            Err("not available in portable mode")
        );
    }

    #[test]
    fn allows_turning_a_registry_toggle_off_in_portable_mode() {
        assert_eq!(reject_registry_write_in_portable_mode(true, false), Ok(()));
    }

    #[test]
    fn installed_mode_allows_either_direction() {
        assert_eq!(reject_registry_write_in_portable_mode(false, true), Ok(()));
        assert_eq!(reject_registry_write_in_portable_mode(false, false), Ok(()));
    }

    // -- should_reconcile_registry: contract 3 --

    #[test]
    fn reconciles_only_when_installed_and_the_stored_value_is_true() {
        assert!(should_reconcile_registry(false, true));
        assert!(!should_reconcile_registry(false, false));
        assert!(!should_reconcile_registry(true, true));
        assert!(!should_reconcile_registry(true, false));
    }

    // -- source-scan tests: contract 2's acceptance criteria --

    #[test]
    fn no_store_literal_remains_outside_portable_rs() {
        let sources: &[(&str, &str)] = &[
            ("dial.rs", include_str!("dial.rs")),
            ("i18n.rs", include_str!("i18n.rs")),
            ("lib.rs", include_str!("lib.rs")),
            ("settings.rs", include_str!("settings.rs")),
            ("setup.rs", include_str!("setup.rs")),
            ("window_bounds.rs", include_str!("window_bounds.rs")),
        ];
        for (name, source) in sources {
            assert!(
                !source.contains("store(\"media-settings.json\")"),
                "{name} must call app.store(portable::settings_store_path()), not the literal \
                 \"media-settings.json\" path"
            );
        }
    }

    #[test]
    fn every_webview_window_builder_new_is_wrapped_by_apply_data_dir() {
        let sources: &[(&str, &str)] = &[
            ("lib.rs", include_str!("lib.rs")),
            ("settings.rs", include_str!("settings.rs")),
            ("setup.rs", include_str!("setup.rs")),
            ("status.rs", include_str!("status.rs")),
            ("updater.rs", include_str!("updater.rs")),
        ];
        const NEEDLE: &str = "WebviewWindowBuilder::new(";
        let mut total_call_sites = 0;
        for (name, source) in sources {
            let mut search_from = 0;
            while let Some(relative_pos) = source[search_from..].find(NEEDLE) {
                let absolute_pos = search_from + relative_pos;
                let preceding = source[..absolute_pos].trim_end();
                assert!(
                    preceding.ends_with("apply_data_dir("),
                    "{name}: a {NEEDLE} call at byte offset {absolute_pos} is not wrapped by \
                     portable::apply_data_dir(...)"
                );
                total_call_sites += 1;
                search_from = absolute_pos + NEEDLE.len();
            }
        }
        assert_eq!(
            total_call_sites, 5,
            "expected exactly 5 WebviewWindowBuilder::new( call sites (media, settings, setup, \
             status, update) across src/"
        );
    }
}
