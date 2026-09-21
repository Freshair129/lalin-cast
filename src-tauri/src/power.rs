//! keep-display-awake: reserves (or releases) a Windows power/display
//! request via `SetThreadExecutionState` while `keepDisplayAwake` is on
//! *and* a video is actually playing. See the Wave 8 plan's contract 2.
//!
//! `SetThreadExecutionState`'s effect belongs to the calling thread and is
//! dropped the instant that thread ends — so this module owns exactly one
//! long-lived worker thread, spawned once and never replaced, and every
//! caller only ever talks to it through an `mpsc::Sender<u32>` message. No
//! other code in this crate is allowed to call the API directly (this file
//! is the only place it is imported), which is also what keeps the block
//! below marked with a `// SAFETY:` comment to the single occurrence the
//! wave 8 plan caps it at.
//!
//! The module compiles as a complete no-op on non-Windows targets: the pure
//! flag calculation below is cross-platform (and cross-platform tested),
//! but [`PowerState`] neither spawns a thread nor links against
//! `windows-sys` off Windows.

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
use std::sync::mpsc::{self, Sender};
#[cfg(windows)]
use std::thread;

use tauri::{AppHandle, Manager};

#[cfg(windows)]
use windows_sys::Win32::System::Power::SetThreadExecutionState;

/// Keeps the current power request alive without adding a new one — the
/// "release" value. Passing this alone effectively hands the display/system
/// requirement back to the OS's own idle timers.
pub const ES_CONTINUOUS: u32 = 0x8000_0000;
/// Combined with [`ES_CONTINUOUS`]: forces the display on.
pub const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
/// Combined with [`ES_CONTINUOUS`]: forces the system out of idle sleep.
pub const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

/// Pure decision for what to pass to `SetThreadExecutionState`, per the
/// wave 8 contract: a display+system reservation only while both
/// `keepDisplayAwake` is on (`enabled`) and a video is actually playing
/// (`playing`); bare [`ES_CONTINUOUS`] — which releases any earlier
/// reservation — for every other combination. Never calls the real API
/// itself, so every one of the four combinations is exercised by a plain
/// unit test below without touching Windows or a thread.
pub fn execution_state_flags(enabled: bool, playing: bool) -> u32 {
    if enabled && playing {
        ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    }
}

/// The one place `SetThreadExecutionState` is called from. Kept as a
/// free function (rather than inlined at each call site) so the block
/// below appears exactly once in this file regardless of how many places
/// end up needing to call it.
#[cfg(windows)]
fn call_set_thread_execution_state(flags: u32) {
    // SAFETY: `flags` is always one of the constant bitmask combinations
    // built by `execution_state_flags` above (or the bare `ES_CONTINUOUS`
    // release value passed directly by this module) — never a pointer, a
    // length, or any other value influenced by page/network input.
    // `SetThreadExecutionState` takes that single `EXECUTION_STATE` value,
    // has no memory-safety precondition, and only records the *calling*
    // thread's power-request state with the OS, returning its previous
    // state (intentionally discarded here — nothing in this module needs
    // it).
    unsafe {
        SetThreadExecutionState(flags);
    }
}

/// Managed keep-display-awake state: an `mpsc::Sender<u32>` to the single
/// long-lived worker thread that owns every `SetThreadExecutionState` call,
/// plus the last known "is a video playing" bit (so a `keepDisplayAwake`
/// toggle in the settings window — which has no playback state of its own —
/// can recompute the right flags without needing `lib.rs` to plumb the
/// current media state through separately).
#[cfg(windows)]
pub struct PowerState {
    sender: Sender<u32>,
    playing: AtomicBool,
}

#[cfg(windows)]
impl Default for PowerState {
    fn default() -> Self {
        let (sender, receiver) = mpsc::channel::<u32>();
        let spawned = thread::Builder::new()
            .name("lalin-cast-power".to_owned())
            .spawn(move || {
                // Every message this thread ever receives is one already
                // decided by `execution_state_flags`/`release` — just apply
                // it, for as long as the channel (i.e. this `PowerState`)
                // is alive.
                for flags in receiver {
                    call_set_thread_execution_state(flags);
                }
                // The channel closed — every `Sender` (this struct's own,
                // cloned nowhere else) was dropped, meaning `PowerState`
                // itself is going away. `SetThreadExecutionState`'s effect
                // dies with the thread that made it, but only implicitly,
                // on process/thread teardown; call it explicitly one more
                // time with the bare release value first, so a reservation
                // is never left dangling on whatever the OS does with a
                // thread that simply stops.
                call_set_thread_execution_state(ES_CONTINUOUS);
            });
        if let Err(error) = spawned {
            // Exempt from the Wave 9 eprintln->log sweep: this runs inside
            // `PowerState`'s `Default` impl, called as
            // `app.manage(power::PowerState::default())` in `lib.rs`'s
            // `setup` hook — the trait signature (`fn default() -> Self`)
            // carries no `AppHandle` to log through, and there is no
            // `AppHandle` reachable here to obtain one from.
            eprintln!("Lalin Cast: could not start the power worker thread: {error}");
        }
        Self {
            sender,
            playing: AtomicBool::new(false),
        }
    }
}

#[cfg(windows)]
impl PowerState {
    fn send(&self, flags: u32) {
        // Best-effort: if the worker thread failed to spawn (see
        // `Default` above) or has already exited, there is nothing this
        // call can do about it — the OS's own idle timers apply, exactly
        // as if `keepDisplayAwake` were off.
        let _ = self.sender.send(flags);
    }
}

/// No-op stand-in on every non-Windows target: same shape, no thread, no
/// channel, no `windows-sys` dependency at all.
#[cfg(not(windows))]
#[derive(Default)]
pub struct PowerState {
    playing: AtomicBool,
}

#[cfg(not(windows))]
impl PowerState {
    fn send(&self, _flags: u32) {}
}

/// Recomputes and (re)applies the power reservation for the current
/// `(enabled, playing)` combination, remembering `playing` on [`PowerState`]
/// so a later [`apply_enabled`] call — which has no playback state of its
/// own — can recompute correctly. Called from `apply_media_event` (Wave 8
/// wiring point 1) with the live `keepDisplayAwake` setting and the
/// just-validated media state.
pub fn apply_playing(app: &AppHandle, enabled: bool, playing: bool) {
    let Some(state) = app.try_state::<PowerState>() else {
        return;
    };
    state.playing.store(playing, Ordering::SeqCst);
    state.send(execution_state_flags(enabled, playing));
}

/// Recomputes and (re)applies the power reservation for a `keepDisplayAwake`
/// change, using the last `playing` state [`apply_playing`] recorded (so
/// turning the setting off while a video is playing releases immediately,
/// per the wave 8 contract, and turning it back on while still playing
/// reserves immediately). Called from `settings::set_one` (Wave 8 wiring
/// point 2).
pub fn apply_enabled(app: &AppHandle, enabled: bool) {
    let Some(state) = app.try_state::<PowerState>() else {
        return;
    };
    let playing = state.playing.load(Ordering::SeqCst);
    state.send(execution_state_flags(enabled, playing));
}

/// Unconditionally releases any reservation this app may hold, ignoring
/// both `enabled` and `playing` — used from `RunEvent::Exit` (Wave 8 wiring
/// point 3) so the app never exits while still holding the display/system
/// awake.
pub fn release(app: &AppHandle) {
    let Some(state) = app.try_state::<PowerState>() else {
        return;
    };
    state.send(ES_CONTINUOUS);
}

#[cfg(test)]
mod tests {
    use super::{execution_state_flags, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED};

    #[test]
    fn enabled_and_playing_requests_display_and_system() {
        assert_eq!(
            execution_state_flags(true, true),
            ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
        );
    }

    #[test]
    fn enabled_but_not_playing_is_bare_continuous() {
        assert_eq!(execution_state_flags(true, false), ES_CONTINUOUS);
    }

    #[test]
    fn disabled_but_playing_is_bare_continuous() {
        // `keepDisplayAwake` off must never reserve, even while playing.
        assert_eq!(execution_state_flags(false, true), ES_CONTINUOUS);
    }

    #[test]
    fn disabled_and_not_playing_is_bare_continuous() {
        assert_eq!(execution_state_flags(false, false), ES_CONTINUOUS);
    }

    #[test]
    fn bare_continuous_never_carries_the_display_or_system_bits() {
        // Pinning `ES_CONTINUOUS`'s own value guards against a future edit
        // accidentally folding the display/system bits into the "off"
        // constant itself.
        assert_eq!(ES_CONTINUOUS & ES_DISPLAY_REQUIRED, 0);
        assert_eq!(ES_CONTINUOUS & ES_SYSTEM_REQUIRED, 0);
    }
}
