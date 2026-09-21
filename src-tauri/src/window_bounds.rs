//! Remembers the `media` window's position/size across app launches
//! (`windowBounds` in `media-settings.json`, Rust-only — `settings::apply_setting`
//! never accepts it from the page). See the Wave 5 plan's window-bounds
//! contract.
//!
//! [`restore_target`] is the only decision that matters and is kept pure
//! (no window/monitor I/O) so every edge case — off-screen, a tiny sliver
//! of overlap, a degenerate saved size — is unit-tested directly. Saving is
//! debounced 1 second on `Moved`/`Resized` (via a generation counter, the
//! same pattern `sleep.rs`'s tick thread and `dial.rs`'s supervisor reload
//! flag both use) and happens immediately on `CloseRequested`; it is
//! skipped outright while fullscreen, mini-player, maximized, or minimized,
//! since none of those describe a "normal" windowed geometry worth
//! restoring next launch.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;

use crate::log;
use crate::portable;
use crate::window_mode;
use crate::MEDIA_LABEL;

pub const STORE_KEY: &str = "windowBounds";
const DEBOUNCE: Duration = Duration::from_secs(1);
const MIN_WIDTH: u32 = 320;
const MIN_HEIGHT: u32 = 180;
/// Minimum overlap, in either dimension, between the saved rectangle and a
/// monitor for the saved bounds to still count as "on screen" — see
/// [`restore_target`].
const MIN_OVERLAP_PX: i64 = 64;

/// The `windowBounds` store value: physical pixels of the `media` window's
/// `outer_position` + `inner_size` (matches the pairing `window_mode.rs`'s
/// `SavedGeometry` already uses for the same reason — `set_position` is an
/// outer-position setter, `set_size` an inner-size setter).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A monitor's physical-pixel rectangle, decoupled from `tauri::monitor::Monitor`
/// so [`restore_target`] stays pure/unit-testable without a real display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonitorRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Overlap, in pixels, between two 1-D spans `[a_start, a_start+a_len)` and
/// `[b_start, b_start+b_len)`. Never negative (floors at 0 for spans that do
/// not intersect at all). Uses `i64` throughout so a saved coordinate far
/// off-screen can never overflow the arithmetic.
fn overlap_1d(a_start: i32, a_len: u32, b_start: i32, b_len: u32) -> i64 {
    let a_end = i64::from(a_start) + i64::from(a_len);
    let b_end = i64::from(b_start) + i64::from(b_len);
    (a_end.min(b_end) - i64::from(a_start).max(i64::from(b_start))).max(0)
}

/// Pure decision: whether `saved` is worth restoring given the currently
/// connected `monitors`. Returns `Some(saved)` unchanged only when both
/// hold — `saved` is never resized or moved to "fit":
///
/// - `saved.width >= 320 && saved.height >= 180` (not a degenerate size a
///   bad write or a stale format could have produced), and
/// - `saved` overlaps at least one monitor by at least 64×64 physical
///   pixels (so a window saved on a display that is no longer connected, or
///   nudged just off every current display, is never restored fully or
///   mostly off-screen).
///
/// Otherwise `None` — the caller keeps whatever default geometry the window
/// builder already applied rather than guessing a substitute position.
pub fn restore_target(saved: Bounds, monitors: &[MonitorRect]) -> Option<Bounds> {
    if saved.width < MIN_WIDTH || saved.height < MIN_HEIGHT {
        return None;
    }
    let overlaps_any = monitors.iter().any(|monitor| {
        let overlap_w = overlap_1d(saved.x, saved.width, monitor.x, monitor.width);
        let overlap_h = overlap_1d(saved.y, saved.height, monitor.y, monitor.height);
        overlap_w >= MIN_OVERLAP_PX && overlap_h >= MIN_OVERLAP_PX
    });
    overlaps_any.then_some(saved)
}

fn read_saved_bounds(app: &AppHandle) -> Option<Bounds> {
    let store = app.store(portable::settings_store_path()).ok()?;
    let value = store.get(STORE_KEY)?;
    serde_json::from_value(value).ok()
}

fn write_saved_bounds(app: &AppHandle, bounds: Bounds) {
    let Ok(store) = app.store(portable::settings_store_path()) else {
        return;
    };
    if let Ok(value) = serde_json::to_value(bounds) {
        store.set(STORE_KEY, value);
        let _ = store.save();
    }
}

/// Combines the saved `windowBounds` (if any) with the `media` window's
/// currently available monitors into a restore target, per
/// [`restore_target`]. Called once, right after `build_media_window` builds
/// the window and before it is shown.
pub fn saved_bounds_for_restore(window: &WebviewWindow, app: &AppHandle) -> Option<Bounds> {
    let saved = read_saved_bounds(app)?;
    let monitors = window.available_monitors().ok()?;
    let monitor_rects: Vec<MonitorRect> = monitors
        .iter()
        .map(|monitor| MonitorRect {
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
        })
        .collect();
    restore_target(saved, &monitor_rects)
}

/// Managed: the state behind the 1-second debounce on `Moved`/`Resized`.
/// Every such event bumps `generation`; at most one debounce thread is
/// alive at a time (`pending`), and it keeps napping for another second as
/// long as the generation moved during its last nap — so a continuous drag
/// or resize costs one thread, not one thread per event.
#[derive(Default)]
pub struct BoundsSaveState {
    generation: AtomicU64,
    pending: AtomicBool,
}

/// Whether the `media` window's current geometry should be treated as
/// "normal windowed" and therefore worth saving: not fullscreen, not
/// mini-player, not maximized, not minimized. Re-checked at actual save
/// time (not just at the moment the triggering event fired), since a
/// debounced save can land after the window changed mode again during the
/// 1-second wait.
fn eligible_to_save(window: &WebviewWindow, app: &AppHandle) -> bool {
    !window.is_fullscreen().unwrap_or(false)
        && !window_mode::is_mini(app)
        && !window.is_maximized().unwrap_or(false)
        && !window.is_minimized().unwrap_or(false)
}

/// Saves the `media` window's current `outer_position`/`inner_size` to the
/// `windowBounds` store key, unless [`eligible_to_save`] says this is not a
/// "normal windowed" geometry right now. Called immediately on
/// `CloseRequested` and (after the debounce delay) from the `Moved`/`Resized`
/// path below.
pub fn save_now(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MEDIA_LABEL) else {
        return;
    };
    if !eligible_to_save(&window, app) {
        return;
    }
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    write_saved_bounds(
        app,
        Bounds {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
    );
}

/// Schedules a debounced save 1 second after the *last* `Moved`/`Resized`
/// event: bumps [`BoundsSaveState`]'s generation and, unless a debounce
/// thread is already waiting, spawns one. That thread sleeps 1 second and
/// goes back to sleep for another second whenever the generation moved
/// during its nap, so it saves exactly once, after the window has been
/// quiet for a full second. A no-op if `BoundsSaveState` is not managed yet.
pub fn schedule_debounced_save(app: &AppHandle) {
    let Some(state) = app.try_state::<BoundsSaveState>() else {
        return;
    };
    state.generation.fetch_add(1, Ordering::SeqCst);
    if state.pending.swap(true, Ordering::SeqCst) {
        // A debounce thread is already waiting; the generation bump above
        // is all it takes to make it extend its wait.
        return;
    }
    let thread_app = app.clone();
    let spawned = thread::Builder::new()
        .name("lalin-cast-window-bounds-debounce".to_owned())
        .spawn(move || loop {
            let Some(state) = thread_app.try_state::<BoundsSaveState>() else {
                return;
            };
            let observed = state.generation.load(Ordering::SeqCst);
            thread::sleep(DEBOUNCE);
            let Some(state) = thread_app.try_state::<BoundsSaveState>() else {
                return;
            };
            if state.generation.load(Ordering::SeqCst) != observed {
                // The window kept moving/resizing during the nap: wait
                // another full second from now.
                continue;
            }
            state.pending.store(false, Ordering::SeqCst);
            // An event that landed between the generation check and the
            // `pending` reset above saw `pending == true` and did not spawn
            // a thread of its own, so re-take ownership and keep waiting.
            if state.generation.load(Ordering::SeqCst) != observed
                && !state.pending.swap(true, Ordering::SeqCst)
            {
                continue;
            }
            save_now(&thread_app);
            return;
        });
    if let Err(error) = spawned {
        // Let the next event try again rather than leaving `pending` stuck.
        state.pending.store(false, Ordering::SeqCst);
        log::warn(
            app,
            "window_bounds",
            &format!("Lalin Cast: could not schedule a window-bounds save: {error}"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{restore_target, Bounds, MonitorRect};

    fn primary() -> MonitorRect {
        MonitorRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }
    }

    #[test]
    fn restores_bounds_fully_inside_a_monitor() {
        let saved = Bounds {
            x: 100,
            y: 100,
            width: 1200,
            height: 675,
        };
        assert_eq!(restore_target(saved, &[primary()]), Some(saved));
    }

    #[test]
    fn rejects_bounds_entirely_off_every_monitor() {
        let saved = Bounds {
            x: 5000,
            y: 5000,
            width: 1200,
            height: 675,
        };
        assert_eq!(restore_target(saved, &[primary()]), None);
    }

    #[test]
    fn restores_bounds_with_at_least_a_64x64_overlap_on_one_monitor() {
        // Mostly off the left/top edge, but the bottom-right 64x64 corner
        // of the saved rectangle still lands on the monitor.
        let saved = Bounds {
            x: -1136,
            y: -611,
            width: 1200,
            height: 675,
        };
        assert_eq!(restore_target(saved, &[primary()]), Some(saved));
    }

    #[test]
    fn rejects_bounds_with_less_than_64x64_overlap() {
        let saved = Bounds {
            x: -1137,
            y: -611,
            width: 1200,
            height: 675,
        };
        assert_eq!(restore_target(saved, &[primary()]), None);
    }

    #[test]
    fn rejects_a_saved_width_or_height_below_the_minimum() {
        let too_narrow = Bounds {
            x: 0,
            y: 0,
            width: 319,
            height: 400,
        };
        assert_eq!(restore_target(too_narrow, &[primary()]), None);

        let too_short = Bounds {
            x: 0,
            y: 0,
            width: 400,
            height: 179,
        };
        assert_eq!(restore_target(too_short, &[primary()]), None);

        let exactly_minimum = Bounds {
            x: 0,
            y: 0,
            width: 320,
            height: 180,
        };
        assert_eq!(
            restore_target(exactly_minimum, &[primary()]),
            Some(exactly_minimum)
        );
    }

    #[test]
    fn checks_every_connected_monitor_not_just_the_first() {
        let second = MonitorRect {
            x: 1920,
            y: 0,
            width: 1280,
            height: 720,
        };
        let saved = Bounds {
            x: 2000,
            y: 50,
            width: 800,
            height: 450,
        };
        assert_eq!(restore_target(saved, &[primary(), second]), Some(saved));
    }

    #[test]
    fn no_monitors_at_all_never_restores() {
        let saved = Bounds {
            x: 0,
            y: 0,
            width: 1200,
            height: 675,
        };
        assert_eq!(restore_target(saved, &[]), None);
    }

    #[test]
    fn bounds_round_trip_through_json_with_plain_field_names() {
        let bounds = Bounds {
            x: -10,
            y: 20,
            width: 1200,
            height: 675,
        };
        let json = serde_json::to_string(&bounds).expect("bounds should serialize");
        assert_eq!(json, r#"{"x":-10,"y":20,"width":1200,"height":675}"#);
        let parsed: Bounds = serde_json::from_str(&json).expect("bounds should deserialize");
        assert_eq!(parsed, bounds);
    }
}
