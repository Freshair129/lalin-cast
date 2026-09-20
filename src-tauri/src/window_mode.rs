//! Mini-player mode: shrinks the `media` window to a small, undecorated,
//! always-on-top window in the bottom-right corner of its current monitor —
//! the "keep the video visible while doing something else" mode the Wave 4
//! plan adds. Reachable from the media menu's `mini-player` item, the
//! tray's `tray-mini` item, `lalin-cast-shell`'s `toggle-mini` action
//! (`Ctrl+Shift+M`, forwarded from `injected.js`), and
//! `settings_set("miniPlayer", bool)` — all four funnel through
//! [`toggle_mini`].

use std::sync::Mutex;

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize};

use crate::{MEDIA_LABEL, MEDIA_MIN_HEIGHT, MEDIA_MIN_WIDTH};

/// Fixed mini-player size, in logical pixels (scaled by the target
/// monitor's DPI at toggle time via `LogicalSize`/`mini_position`).
const MINI_WIDTH: f64 = 400.0;
const MINI_HEIGHT: f64 = 225.0;
/// Gap kept from the monitor's right/bottom edge, in physical pixels —
/// matches the units `Monitor::size()`/`Monitor::position()` already use,
/// so no extra DPI conversion is needed for the margin itself.
const MARGIN_PX: i32 = 24;

/// Geometry captured when entering mini-player mode and restored when
/// leaving it. `decorations` is saved too because entering mini always
/// turns decorations off, regardless of whatever the window had before.
#[derive(Clone, Copy, Debug, PartialEq)]
struct SavedGeometry {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    decorations: bool,
}

/// Managed mini-player state: `Some` while the `media` window is shrunk
/// into mini-player mode (holding the geometry to restore), `None`
/// otherwise. Per-session only — deliberately never written to the
/// settings store (see the Wave 4 plan's `miniPlayer` contract entry).
#[derive(Default)]
pub struct MiniPlayerState {
    saved: Mutex<Option<SavedGeometry>>,
}

impl MiniPlayerState {
    /// Whether the `media` window is currently in mini-player mode.
    pub fn is_active(&self) -> bool {
        self.saved
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }
}

/// Convenience for call sites that only have an `AppHandle` (no `State<'_,
/// MiniPlayerState>` extraction available), such as `settings::load_settings`.
/// `false` both when not in mini-player mode and when `MiniPlayerState` is
/// not managed yet (mirrors `dial::read_status`'s tolerance).
pub fn is_mini(app: &AppHandle) -> bool {
    app.try_state::<MiniPlayerState>()
        .map(|state| state.is_active())
        .unwrap_or(false)
}

/// Pure bottom-right placement for the mini-player window: `window_size`
/// (logical pixels, the fixed [`MINI_WIDTH`]×[`MINI_HEIGHT`]) is scaled by
/// `scale_factor` to physical pixels and placed `MARGIN_PX` physical pixels
/// in from the given monitor's right and bottom edges. Clamped so the
/// window's origin never lands left of or above the monitor's own origin —
/// a monitor smaller than the mini-player window plus its margins still
/// gets a position on-screen rather than a negative/off-monitor one.
///
/// Pure and monitor-injectable on purpose: every case (primary monitor at
/// the origin, a second monitor offset to the side, a non-100% DPI scale
/// factor, a monitor too small for the margins) is exercised by the tests
/// below without touching a real display.
pub(crate) fn mini_position(
    monitor_size: PhysicalSize<u32>,
    monitor_position: PhysicalPosition<i32>,
    scale_factor: f64,
    window_size_logical: (f64, f64),
) -> PhysicalPosition<i32> {
    let window_width = (window_size_logical.0 * scale_factor).round() as i32;
    let window_height = (window_size_logical.1 * scale_factor).round() as i32;

    let monitor_left = monitor_position.x;
    let monitor_top = monitor_position.y;
    let monitor_right = monitor_left + monitor_size.width as i32;
    let monitor_bottom = monitor_top + monitor_size.height as i32;

    let x = (monitor_right - window_width - MARGIN_PX).max(monitor_left);
    let y = (monitor_bottom - window_height - MARGIN_PX).max(monitor_top);

    PhysicalPosition { x, y }
}

/// Toggles mini-player mode for the `media` window. Entering: exits
/// fullscreen first (so the OS restores the normal windowed geometry before
/// it is captured — fullscreen and mini-player are mutually exclusive, and
/// the persisted `fullscreen` setting is never touched either way), saves
/// the resulting geometry, then turns decorations off, pins the window on
/// top, and resizes/repositions it to the current monitor's bottom-right
/// corner. Leaving: restores the saved geometry and decorations, and sets
/// always-on-top back to whatever the persisted `keepOnTop` setting is
/// (never to whatever it happened to be while in mini-player mode, since
/// that was always forced on).
/// Leaves mini-player mode if it is active (used before entering
/// fullscreen so a saved mini geometry is never restored on top of a
/// fullscreen window). Returns whether a leave happened.
pub fn leave_mini_if_active(app: &AppHandle) -> bool {
    if is_mini(app) {
        toggle_mini(app);
        true
    } else {
        false
    }
}

pub fn toggle_mini(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MEDIA_LABEL) else {
        return;
    };
    let Some(state) = app.try_state::<MiniPlayerState>() else {
        return;
    };
    let Ok(mut guard) = state.saved.lock() else {
        return;
    };

    if let Some(saved) = guard.take() {
        // Release the state lock before the window calls below, which
        // round-trip through the event loop.
        drop(guard);
        // Put the normal minimum back before restoring the saved inner size
        // (the enter branch relaxed it so the 400x225 mini size was reachable).
        let _ = window.set_min_size(Some(LogicalSize::new(MEDIA_MIN_WIDTH, MEDIA_MIN_HEIGHT)));
        let _ = window.set_decorations(saved.decorations);
        // `saved.size` is an INNER size (captured with `inner_size()`), which
        // is the basis `set_size` restores; pairing outer with inner would
        // grow the window by the decoration deltas on every cycle.
        let _ = window.set_size(saved.size);
        let _ = window.set_position(saved.position);
        let keep_on_top = crate::read_bool_setting_or(app, "keepOnTop", false);
        let _ = window.set_always_on_top(keep_on_top);
        return;
    }

    let _ = window.set_fullscreen(false);
    let decorations = window.is_decorated().unwrap_or(true);
    // Outer position pairs with `set_position` (an outer-position setter);
    // inner size pairs with `set_size` (an inner-size setter).
    let position = window.outer_position().unwrap_or_default();
    let size = window.inner_size().unwrap_or_default();
    *guard = Some(SavedGeometry {
        position,
        size,
        decorations,
    });
    drop(guard);

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let _ = window.set_decorations(false);
    let _ = window.set_always_on_top(true);
    // The media window carries a 720x405 minimum; relax it first or the
    // window manager clamps the mini size back up to that minimum.
    let _ = window.set_min_size(Some(LogicalSize::new(MINI_WIDTH, MINI_HEIGHT)));
    let _ = window.set_size(LogicalSize::new(MINI_WIDTH, MINI_HEIGHT));

    if let Some(monitor) = monitor {
        let target = mini_position(
            *monitor.size(),
            *monitor.position(),
            monitor.scale_factor(),
            (MINI_WIDTH, MINI_HEIGHT),
        );
        let _ = window.set_position(target);
    }
    // No monitor info available at all: still shrunk/undecorated/pinned,
    // just left wherever it already was rather than guessing a position.
}

#[cfg(test)]
mod tests {
    use super::{mini_position, MiniPlayerState, SavedGeometry};
    use tauri::{PhysicalPosition, PhysicalSize};

    #[test]
    fn places_the_window_at_the_bottom_right_of_a_monitor_at_the_origin() {
        let position = mini_position(
            PhysicalSize::new(1920, 1080),
            PhysicalPosition::new(0, 0),
            1.0,
            (400.0, 225.0),
        );
        assert_eq!(
            position,
            PhysicalPosition::new(1920 - 400 - 24, 1080 - 225 - 24)
        );
    }

    #[test]
    fn scales_the_window_size_by_the_monitor_scale_factor_before_placing_it() {
        // 125% scaling: 400x225 logical -> 500x281.25 physical (rounds to
        // 281), so the margin math must use the scaled size, not the raw
        // logical one.
        let position = mini_position(
            PhysicalSize::new(1920, 1080),
            PhysicalPosition::new(0, 0),
            1.25,
            (400.0, 225.0),
        );
        assert_eq!(
            position,
            PhysicalPosition::new(1920 - 500 - 24, 1080 - 281 - 24)
        );
    }

    #[test]
    fn accounts_for_a_second_monitor_offset_from_the_origin() {
        // A monitor to the right of the primary one, e.g. primary is
        // 1920x1080 at (0,0) and this is a 1280x720 monitor at (1920,0).
        let position = mini_position(
            PhysicalSize::new(1280, 720),
            PhysicalPosition::new(1920, 0),
            1.0,
            (400.0, 225.0),
        );
        assert_eq!(
            position,
            PhysicalPosition::new(1920 + 1280 - 400 - 24, 720 - 225 - 24)
        );
    }

    #[test]
    fn clamps_to_the_monitors_own_origin_when_it_is_smaller_than_the_window_plus_margin() {
        let position = mini_position(
            PhysicalSize::new(300, 150),
            PhysicalPosition::new(0, 0),
            1.0,
            (400.0, 225.0),
        );
        assert_eq!(position, PhysicalPosition::new(0, 0));

        // Same, but the monitor itself is offset — the clamp floor must be
        // the monitor's own origin, not the global (0, 0).
        let position = mini_position(
            PhysicalSize::new(300, 150),
            PhysicalPosition::new(1920, 100),
            1.0,
            (400.0, 225.0),
        );
        assert_eq!(position, PhysicalPosition::new(1920, 100));
    }

    #[test]
    fn mini_player_state_defaults_to_inactive() {
        let state = MiniPlayerState::default();
        assert!(!state.is_active());
    }

    #[test]
    fn mini_player_state_reports_active_once_a_geometry_is_saved() {
        let state = MiniPlayerState::default();
        {
            let mut guard = state.saved.lock().unwrap();
            *guard = Some(SavedGeometry {
                position: PhysicalPosition::new(100, 100),
                size: PhysicalSize::new(1200, 675),
                decorations: true,
            });
        }
        assert!(state.is_active());

        {
            let mut guard = state.saved.lock().unwrap();
            *guard = None;
        }
        assert!(!state.is_active());
    }
}
