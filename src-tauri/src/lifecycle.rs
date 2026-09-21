//! Studio launcher lifecycle: the `--lifecycle launch|focus|close
//! --request-id <id>` CLI contract (parsed in `launch.rs`) and the
//! `<app_local_data_dir>/lifecycle.json` state file a driving process polls
//! to learn what Lalin Cast actually did. See the Wave 5 plan's lifecycle
//! contract and `docs/architecture/CAST_LAUNCHER_IPC.md` (owned by the docs
//! stream) for the full transition table; `lib.rs` wires every transition in
//! that table into the running app.
//!
//! The file is written atomically (`lifecycle.json.tmp` then `rename`) so a
//! driver process polling the file never observes a torn/partial write.
//! Nothing here ever writes a URL, deep link, or unvalidated request id —
//! `requestId` is always either a token [`crate::launch::validate_request_id`]
//! already accepted, or one of the two fixed fallbacks (`"startup"` for the
//! very first process launch, `"cli"` everywhere else a request id was
//! absent or invalid).

use std::fs;
use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::launch::LifecycleCommand;
use crate::log;

const LIFECYCLE_FILE_NAME: &str = "lifecycle.json";
const LIFECYCLE_TMP_FILE_NAME: &str = "lifecycle.json.tmp";

/// What a `--lifecycle` command (forwarded from a second instance, or
/// carried by the very first launch) should transition the state file
/// toward. Kept separate from [`LifecycleCommand`] itself (which is a raw
/// CLI value) so the mapping — the only part of the contract that decides
/// "close means stopped, launch/focus mean ready" — is one small pure
/// function with its own tests, reused by both `lib.rs`'s first-launch
/// check and its single-instance callback.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NextState {
    Ready,
    Stopped,
}

/// Pure mapping from a parsed `--lifecycle` command to the state transition
/// it asks for. `launch`/`focus` both mean "the app should end up ready
/// (and focused)"; `close` means "the app should stop". See the Wave 5
/// plan's transition table.
pub fn next_state_for(cmd: LifecycleCommand) -> NextState {
    match cmd {
        LifecycleCommand::Launch | LifecycleCommand::Focus => NextState::Ready,
        LifecycleCommand::Close => NextState::Stopped,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum LifecycleKind {
    Starting,
    Ready,
    Stopped,
    Failed,
}

/// The exact `lifecycle.json` schema: `type` plus `requestId` are always
/// present, `version`/`updatedAt` are always present, and every other field
/// is included only for the state it actually applies to (`skip_serializing_if`
/// omits the rest — see the Wave 5 plan's schema table and this module's
/// tests).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleState {
    #[serde(rename = "type")]
    kind: LifecycleKind,
    request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    version: &'static str,
    updated_at: u64,
}

impl LifecycleState {
    fn base(kind: LifecycleKind, request_id: String, now: u64) -> Self {
        Self {
            kind,
            request_id,
            pid: None,
            exit_code: None,
            code: None,
            message: None,
            version: env!("CARGO_PKG_VERSION"),
            updated_at: now,
        }
    }

    pub fn starting(request_id: String, now: u64) -> Self {
        Self::base(LifecycleKind::Starting, request_id, now)
    }

    pub fn ready(request_id: String, pid: u32, now: u64) -> Self {
        let mut state = Self::base(LifecycleKind::Ready, request_id, now);
        state.pid = Some(pid);
        state
    }

    pub fn stopped(request_id: String, exit_code: i32, now: u64) -> Self {
        let mut state = Self::base(LifecycleKind::Stopped, request_id, now);
        state.exit_code = Some(exit_code);
        state
    }

    pub fn failed(
        request_id: String,
        code: impl Into<String>,
        message: impl Into<String>,
        now: u64,
    ) -> Self {
        let mut state = Self::base(LifecycleKind::Failed, request_id, now);
        state.code = Some(code.into());
        state.message = Some(message.into());
        state
    }

    /// Short human summary used by `diagnostics.rs`'s `lifecycle:` line —
    /// e.g. `"ready (pid 1234)"`. Never includes `requestId` (an opaque
    /// Studio token, not meant for a human-facing diagnostics dump).
    fn summarize(&self) -> String {
        match self.kind {
            LifecycleKind::Starting => "starting".to_owned(),
            LifecycleKind::Ready => format!("ready (pid {})", self.pid.unwrap_or_default()),
            LifecycleKind::Stopped => {
                format!("stopped (exit {})", self.exit_code.unwrap_or_default())
            }
            LifecycleKind::Failed => {
                format!("failed ({})", self.code.as_deref().unwrap_or("unknown"))
            }
        }
    }
}

/// `pub(crate)` so `diagnostics.rs` can stamp its `generatedAt` field with
/// the same clock this module uses for `updatedAt`, without either module
/// depending on `std::time` plumbing the other doesn't already have.
pub(crate) fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Writes `state` to `<dir>/lifecycle.json` atomically: serialize, write to
/// `<dir>/lifecycle.json.tmp`, then `rename` over the final path (`rename`
/// on both Windows and POSIX replaces an existing destination file
/// atomically from a reader's point of view — a driver polling the file
/// never observes a torn write). Creates `dir` if it does not exist yet.
pub fn write_state_atomic(dir: &Path, state: &LifecycleState) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let tmp_path = dir.join(LIFECYCLE_TMP_FILE_NAME);
    let final_path = dir.join(LIFECYCLE_FILE_NAME);
    let json = serde_json::to_vec(state)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(&tmp_path, &json)?;
    fs::rename(&tmp_path, &final_path)?;
    Ok(())
}

/// Managed marker: `true` once a `stopped` state has already been written
/// for this run — whether from a `--lifecycle close` request (first launch
/// or forwarded from a second instance) or from `RunEvent::Exit` itself —
/// so the generic `RunEvent::Exit` handler in `lib.rs` never overwrites a
/// `stopped` state that already carries a specific request id/exit code
/// with a second, redundant one.
#[derive(Default)]
pub struct StoppedMarker(AtomicBool);

impl StoppedMarker {
    fn mark(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_stopped(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Managed: the last lifecycle summary written, read by
/// `diagnostics.rs`'s `settings_diagnostics` command. Starts at `"starting"`
/// — the state every run is in before its first write — so a diagnostics
/// snapshot pulled in the brief window before that first write still shows
/// something sensible rather than an empty string.
pub struct LifecycleSummaryState(Mutex<String>);

impl Default for LifecycleSummaryState {
    fn default() -> Self {
        Self(Mutex::new("starting".to_owned()))
    }
}

/// Writes `state` to `lifecycle.json` (best-effort — a failure is logged,
/// never panics or blocks startup), updates the managed summary for
/// diagnostics, and — for a `stopped` state — marks [`StoppedMarker`] so
/// `RunEvent::Exit` does not write a second one.
fn write(app: &AppHandle, state: &LifecycleState) {
    if let Some(summary) = app.try_state::<LifecycleSummaryState>() {
        if let Ok(mut guard) = summary.0.lock() {
            *guard = state.summarize();
        }
    }
    if state.kind == LifecycleKind::Stopped {
        if let Some(marker) = app.try_state::<StoppedMarker>() {
            marker.mark();
        }
    }
    match app.path().app_local_data_dir() {
        Ok(dir) => {
            if let Err(error) = write_state_atomic(&dir, state) {
                log::warn(
                    app,
                    "lifecycle",
                    &format!("Lalin Cast: could not write lifecycle.json: {error}"),
                );
            }
        }
        Err(error) => {
            log::warn(
                app,
                "lifecycle",
                &format!(
                    "Lalin Cast: could not resolve the app local data dir for lifecycle.json: {error}"
                ),
            );
        }
    }
}

pub fn write_starting(app: &AppHandle, request_id: String) {
    write(app, &LifecycleState::starting(request_id, now_unix()));
}

pub fn write_ready(app: &AppHandle, request_id: String, pid: u32) {
    write(app, &LifecycleState::ready(request_id, pid, now_unix()));
}

pub fn write_stopped(app: &AppHandle, request_id: String, exit_code: i32) {
    write(
        app,
        &LifecycleState::stopped(request_id, exit_code, now_unix()),
    );
}

pub fn write_failed(
    app: &AppHandle,
    request_id: String,
    code: impl Into<String>,
    message: impl Into<String>,
) {
    write(
        app,
        &LifecycleState::failed(request_id, code, message, now_unix()),
    );
}

/// Reads the current lifecycle summary for `diagnostics.rs`. Falls back to
/// `"starting"` when [`LifecycleSummaryState`] is not managed yet (mirrors
/// `dial::read_status`'s tolerance).
pub fn current_summary(app: &AppHandle) -> String {
    app.try_state::<LifecycleSummaryState>()
        .and_then(|state| state.0.lock().ok().map(|guard| guard.clone()))
        .unwrap_or_else(|| "starting".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{next_state_for, write_state_atomic, LifecycleKind, LifecycleState, NextState};
    use crate::launch::LifecycleCommand;
    use std::fs;

    #[test]
    fn next_state_for_maps_launch_and_focus_to_ready_and_close_to_stopped() {
        assert_eq!(next_state_for(LifecycleCommand::Launch), NextState::Ready);
        assert_eq!(next_state_for(LifecycleCommand::Focus), NextState::Ready);
        assert_eq!(next_state_for(LifecycleCommand::Close), NextState::Stopped);
    }

    fn value(state: &LifecycleState) -> serde_json::Value {
        serde_json::to_value(state).expect("state should serialize")
    }

    #[test]
    fn starting_serializes_with_only_the_shared_fields() {
        let state = LifecycleState::starting("cli".to_owned(), 1_700_000_000);
        let json = value(&state);
        assert_eq!(json["type"], "starting");
        assert_eq!(json["requestId"], "cli");
        assert_eq!(json["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(json["updatedAt"], 1_700_000_000);
        assert!(json.get("pid").is_none());
        assert!(json.get("exitCode").is_none());
        assert!(json.get("code").is_none());
        assert!(json.get("message").is_none());
    }

    #[test]
    fn ready_serializes_with_pid_only() {
        let state = LifecycleState::ready("studio-1".to_owned(), 4242, 1_700_000_001);
        let json = value(&state);
        assert_eq!(json["type"], "ready");
        assert_eq!(json["pid"], 4242);
        assert!(json.get("exitCode").is_none());
        assert!(json.get("code").is_none());
        assert!(json.get("message").is_none());
    }

    #[test]
    fn stopped_serializes_with_exit_code_only() {
        let state = LifecycleState::stopped("cli".to_owned(), 0, 1_700_000_002);
        let json = value(&state);
        assert_eq!(json["type"], "stopped");
        assert_eq!(json["exitCode"], 0);
        assert!(json.get("pid").is_none());
        assert!(json.get("code").is_none());
        assert!(json.get("message").is_none());
    }

    #[test]
    fn failed_serializes_with_code_and_message_only() {
        let state = LifecycleState::failed(
            "cli".to_owned(),
            "media-window",
            "window build failed",
            1_700_000_003,
        );
        let json = value(&state);
        assert_eq!(json["type"], "failed");
        assert_eq!(json["code"], "media-window");
        assert_eq!(json["message"], "window build failed");
        assert!(json.get("pid").is_none());
        assert!(json.get("exitCode").is_none());
    }

    #[test]
    fn summarize_matches_each_kind() {
        assert_eq!(
            LifecycleState::starting("cli".to_owned(), 0).summarize(),
            "starting"
        );
        assert_eq!(
            LifecycleState::ready("cli".to_owned(), 99, 0).summarize(),
            "ready (pid 99)"
        );
        assert_eq!(
            LifecycleState::stopped("cli".to_owned(), 1, 0).summarize(),
            "stopped (exit 1)"
        );
        assert_eq!(
            LifecycleState::failed("cli".to_owned(), "media-window", "x", 0).summarize(),
            "failed (media-window)"
        );
    }

    #[test]
    fn kind_equality_holds_for_the_stopped_marker_check() {
        let stopped = LifecycleState::stopped("cli".to_owned(), 0, 0);
        assert_eq!(stopped.kind, LifecycleKind::Stopped);
        let ready = LifecycleState::ready("cli".to_owned(), 1, 0);
        assert_ne!(ready.kind, LifecycleKind::Stopped);
    }

    #[test]
    fn write_state_atomic_writes_and_reads_back_from_a_temp_dir() {
        let dir = std::env::temp_dir().join(format!(
            "lalin-cast-lifecycle-test-{}-{}",
            std::process::id(),
            1
        ));
        let _ = fs::remove_dir_all(&dir);

        let state = LifecycleState::ready("studio-9".to_owned(), 777, 1_700_000_100);
        write_state_atomic(&dir, &state).expect("atomic write should succeed");

        let contents = fs::read_to_string(dir.join("lifecycle.json")).expect("file should exist");
        assert!(!dir.join("lifecycle.json.tmp").exists());
        let parsed: serde_json::Value =
            serde_json::from_str(&contents).expect("written file should be valid JSON");
        assert_eq!(parsed["type"], "ready");
        assert_eq!(parsed["requestId"], "studio-9");
        assert_eq!(parsed["pid"], 777);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_state_atomic_overwrites_a_previous_state() {
        let dir = std::env::temp_dir().join(format!(
            "lalin-cast-lifecycle-test-{}-{}",
            std::process::id(),
            2
        ));
        let _ = fs::remove_dir_all(&dir);

        write_state_atomic(&dir, &LifecycleState::starting("cli".to_owned(), 1))
            .expect("first write should succeed");
        write_state_atomic(&dir, &LifecycleState::stopped("cli".to_owned(), 0, 2))
            .expect("second write should succeed");

        let contents = fs::read_to_string(dir.join("lifecycle.json")).expect("file should exist");
        let parsed: serde_json::Value =
            serde_json::from_str(&contents).expect("written file should be valid JSON");
        assert_eq!(parsed["type"], "stopped");

        let _ = fs::remove_dir_all(&dir);
    }
}
