//! Sleep timer: pauses playback and shows an on-page OSD after a chosen
//! number of minutes. See the Wave 4 plan's sleep timer contract for the
//! `sleepTimerMinutes` store key, the `lalin-cast-sleep` event payload, and
//! the settings window's countdown (`sleepRemainingSeconds`).
//!
//! The managed [`SleepState`] holds at most one active [`Deadline`], stamped
//! with a monotonically increasing generation number. `schedule` always
//! bumps the generation — even to cancel (`minutes == 0`) — so a tick thread
//! spawned by an earlier call always notices it has been superseded (its own
//! captured generation no longer matches what is stored) and exits on its
//! very next 1-second wakeup, without needing to be told to stop directly.
//! That decision (`tick_outcome`) and the schedule/cancel bookkeeping
//! (`SleepState::advance`) are both plain, clock-parameterized functions, so
//! the tests below exercise every generation/cancel edge case without
//! spawning a thread or sleeping for real.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::MEDIA_LABEL;

/// Rust → page: `{ minutes }`, emitted to the `media` window when the timer
/// reaches its deadline. `injected.js` pauses every `<video>` and shows its
/// own OSD in response — see the Wave 4 plan.
const SLEEP_EVENT: &str = "lalin-cast-sleep";
const STORE_KEY_SLEEP_MINUTES: &str = "sleepTimerMinutes";
const TICK_INTERVAL: Duration = Duration::from_secs(1);

/// The only valid `sleepTimerMinutes` values: `0` cancels, any other member
/// starts/restarts the timer for that many minutes.
pub const ALLOWED_MINUTES: [u32; 6] = [0, 15, 30, 60, 90, 120];

/// Pure whitelist + type check for one `sleepTimerMinutes` value out of a
/// `settings_set` payload. Mirrors the other `apply_setting` checks in
/// `settings.rs` (reused there, not duplicated).
pub fn validate_sleep_minutes(value: &Value) -> Option<u32> {
    let raw = value.as_u64()?;
    let minutes = u32::try_from(raw).ok()?;
    ALLOWED_MINUTES.contains(&minutes).then_some(minutes)
}

/// A scheduled deadline: which generation created it, when it fires, and
/// (for the `lalin-cast-sleep` payload) how many minutes it was originally
/// set for.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Deadline {
    generation: u64,
    ends_at: Instant,
    minutes: u32,
}

/// Pure transition for `SleepState::advance`: `minutes == 0` cancels
/// (`None`); any other value (already validated by
/// [`validate_sleep_minutes`] before this is called) computes a fresh
/// deadline stamped with `generation`, `minutes` from now.
fn next_deadline(generation: u64, minutes: u32, now: Instant) -> Option<Deadline> {
    if minutes == 0 {
        None
    } else {
        Some(Deadline {
            generation,
            ends_at: now + Duration::from_secs(u64::from(minutes) * 60),
            minutes,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TickOutcome {
    /// A newer generation superseded this thread (rescheduled or
    /// cancelled) — exit without touching the state or emitting anything.
    Stale,
    /// Still this thread's generation, deadline not reached yet.
    Wait,
    /// Still this thread's generation, and `now` has reached `ends_at`.
    Fire,
}

/// Pure decision for one tick thread wakeup: compares its own captured
/// generation against whatever [`SleepState`] currently holds. Kept clock-
/// and state-parameterized (no I/O) so every case — a fresh cancel, an
/// intervening reschedule, "not due yet", "exactly due", "overdue" — is
/// unit-tested without a real thread or a real clock.
fn tick_outcome(current: &Option<Deadline>, my_generation: u64, now: Instant) -> TickOutcome {
    match current {
        None => TickOutcome::Stale,
        Some(deadline) if deadline.generation != my_generation => TickOutcome::Stale,
        Some(deadline) if now >= deadline.ends_at => TickOutcome::Fire,
        Some(_) => TickOutcome::Wait,
    }
}

/// Managed sleep-timer state: a generation counter plus at most one active
/// deadline. `Default` gives generation `0` and no deadline — exactly the
/// "no timer running" state a fresh app launch starts in (a stored
/// `sleepTimerMinutes` left over from a previous run never resumes a timer
/// on its own; see `lib.rs::seed_settings`).
#[derive(Default)]
pub struct SleepState {
    generation: AtomicU64,
    deadline: Mutex<Option<Deadline>>,
}

impl SleepState {
    /// Bumps the generation counter and stores the resulting deadline
    /// (`None` for a cancel, `Some` for a schedule), returning the new
    /// generation number. The only clock dependency is the `now` the
    /// caller supplies, and the only I/O is the mutex lock — no store, no
    /// thread, no event — so tests exercise the generation/cancel semantics
    /// directly.
    fn advance(&self, minutes: u32, now: Instant) -> u64 {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let deadline = next_deadline(generation, minutes, now);
        if let Ok(mut guard) = self.deadline.lock() {
            *guard = deadline;
        }
        generation
    }
}

/// Seconds remaining until the active deadline, or `None` if no timer is
/// running. Used by `settings.rs` for the snapshot's `sleepRemainingSeconds`
/// field. Takes the deadline's `ends_at` (an `Instant` set by `schedule`) as
/// given — nothing here needs a mockable clock, since the tests inject the
/// `Deadline` itself rather than going through `schedule`.
pub fn remaining_seconds(state: &SleepState) -> Option<u64> {
    let guard = state.deadline.lock().ok()?;
    let deadline = guard.as_ref()?;
    let now = Instant::now();
    if now >= deadline.ends_at {
        Some(0)
    } else {
        Some(deadline.ends_at.duration_since(now).as_secs())
    }
}

/// Convenience for call sites that only have an `AppHandle` (no `State<'_,
/// SleepState>` extraction available), such as `settings::open_settings_window`.
/// `None` both when no timer is running and when `SleepState` is not managed
/// yet (mirrors `dial::read_status`'s tolerance).
pub fn read_remaining_seconds(app: &AppHandle) -> Option<u64> {
    app.try_state::<SleepState>()
        .and_then(|state| remaining_seconds(&state))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SleepEventPayload {
    minutes: u32,
}

/// Emits [`SLEEP_EVENT`] to the `media` window and writes `sleepTimerMinutes`
/// back to `0` — the "timer expired" half of the contract table. Called only
/// from the tick thread's own `Fire` branch, so it always runs on the
/// generation that actually owned the deadline.
fn fire(app: &AppHandle, minutes: u32) {
    let payload = SleepEventPayload { minutes };
    let _ = app.emit_to(MEDIA_LABEL, SLEEP_EVENT, &payload);
    crate::write_u32_setting(app, STORE_KEY_SLEEP_MINUTES, 0);
}

/// One 1-second wakeup for the tick thread: locks [`SleepState`], asks
/// [`tick_outcome`] what to do, and — only on `Fire` — clears the deadline
/// under the same lock (so a `schedule`/cancel racing in right after the
/// check can never be clobbered by a stale thread's cleanup).
fn tick(state: &SleepState, my_generation: u64, now: Instant) -> TickOutcome {
    let mut guard = match state.deadline.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let outcome = tick_outcome(&guard, my_generation, now);
    if outcome == TickOutcome::Fire {
        *guard = None;
    }
    outcome
}

/// Spawns the 1-second tick thread for one generation. The thread owns no
/// state of its own beyond `generation`/`minutes` — every wakeup re-reads
/// [`SleepState`] through the managed `AppHandle`, so it always sees the
/// latest schedule/cancel, and exits on its own (no join handle kept, no
/// external "please stop" signal needed) as soon as [`tick`] reports
/// anything other than `Wait`.
fn spawn_tick_thread(app: AppHandle, generation: u64, minutes: u32) {
    let spawned = thread::Builder::new()
        .name("lalin-cast-sleep-timer".to_owned())
        .spawn(move || loop {
            thread::sleep(TICK_INTERVAL);
            let state = app.state::<SleepState>();
            match tick(&state, generation, Instant::now()) {
                TickOutcome::Stale => return,
                TickOutcome::Wait => continue,
                TickOutcome::Fire => {
                    fire(&app, minutes);
                    return;
                }
            }
        });
    if let Err(error) = spawned {
        eprintln!("Lalin Cast: could not start the sleep timer thread: {error}");
    }
}

/// Schedules (or cancels, for `minutes == 0`) the sleep timer: bumps the
/// generation, persists `sleepTimerMinutes`, and — for a non-zero value —
/// spawns a fresh tick thread. Called from `settings::settings_set` after
/// [`validate_sleep_minutes`] has already accepted the value. `SleepState`
/// must be managed before this is called (done once, at startup, in
/// `lib.rs::run`).
pub fn schedule(app: &AppHandle, minutes: u32) {
    let state = app.state::<SleepState>();
    let generation = state.advance(minutes, Instant::now());
    crate::write_u32_setting(app, STORE_KEY_SLEEP_MINUTES, minutes);
    if minutes != 0 {
        spawn_tick_thread(app.clone(), generation, minutes);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        next_deadline, tick_outcome, validate_sleep_minutes, Deadline, SleepState, TickOutcome,
        ALLOWED_MINUTES,
    };
    use serde_json::json;
    use std::time::{Duration, Instant};

    #[test]
    fn validate_sleep_minutes_accepts_every_allowed_value() {
        for minutes in ALLOWED_MINUTES {
            assert_eq!(
                validate_sleep_minutes(&json!(minutes)),
                Some(minutes),
                "{minutes} should be accepted"
            );
        }
    }

    #[test]
    fn validate_sleep_minutes_rejects_values_outside_the_set() {
        assert_eq!(validate_sleep_minutes(&json!(45)), None);
        assert_eq!(validate_sleep_minutes(&json!(1)), None);
        assert_eq!(validate_sleep_minutes(&json!(121)), None);
        assert_eq!(validate_sleep_minutes(&json!(-15)), None);
    }

    #[test]
    fn validate_sleep_minutes_rejects_the_wrong_type() {
        assert_eq!(validate_sleep_minutes(&json!("15")), None);
        assert_eq!(validate_sleep_minutes(&json!(15.5)), None);
        assert_eq!(validate_sleep_minutes(&json!(true)), None);
        assert_eq!(validate_sleep_minutes(&json!(null)), None);
    }

    #[test]
    fn next_deadline_is_none_for_a_cancel() {
        let now = Instant::now();
        assert_eq!(next_deadline(7, 0, now), None);
    }

    #[test]
    fn next_deadline_computes_minutes_from_now_and_stamps_the_generation() {
        let now = Instant::now();
        let deadline = next_deadline(3, 15, now).expect("15 minutes should schedule");
        assert_eq!(deadline.generation, 3);
        assert_eq!(deadline.minutes, 15);
        assert_eq!(deadline.ends_at, now + Duration::from_secs(15 * 60));
    }

    #[test]
    fn tick_outcome_is_stale_when_no_deadline_is_stored() {
        let now = Instant::now();
        assert_eq!(tick_outcome(&None, 1, now), TickOutcome::Stale);
    }

    #[test]
    fn tick_outcome_is_stale_when_a_newer_generation_superseded_it() {
        let now = Instant::now();
        let current = Some(Deadline {
            generation: 2,
            ends_at: now + Duration::from_secs(60),
            minutes: 15,
        });
        // Generation 1's thread checking in after generation 2 rescheduled
        // (or cancelled and rescheduled) must see itself as stale, even
        // though a deadline exists and even though it has not "expired".
        assert_eq!(tick_outcome(&current, 1, now), TickOutcome::Stale);
    }

    #[test]
    fn tick_outcome_waits_before_the_deadline_and_fires_at_or_after_it() {
        let now = Instant::now();
        let ends_at = now + Duration::from_secs(5);
        let current = Some(Deadline {
            generation: 1,
            ends_at,
            minutes: 15,
        });
        assert_eq!(tick_outcome(&current, 1, now), TickOutcome::Wait);
        assert_eq!(
            tick_outcome(&current, 1, ends_at - Duration::from_millis(1)),
            TickOutcome::Wait
        );
        assert_eq!(tick_outcome(&current, 1, ends_at), TickOutcome::Fire);
        assert_eq!(
            tick_outcome(&current, 1, ends_at + Duration::from_secs(1)),
            TickOutcome::Fire
        );
    }

    #[test]
    fn advance_bumps_the_generation_on_every_call_including_cancels() {
        let state = SleepState::default();
        let now = Instant::now();

        let g1 = state.advance(15, now);
        assert_eq!(g1, 1);
        {
            let guard = state.deadline.lock().unwrap();
            let deadline = guard.as_ref().expect("15 minutes should schedule");
            assert_eq!(deadline.generation, 1);
            assert_eq!(deadline.minutes, 15);
        }

        // Rescheduling to a different duration bumps the generation again
        // and replaces the stored deadline outright.
        let g2 = state.advance(60, now);
        assert_eq!(g2, 2);
        {
            let guard = state.deadline.lock().unwrap();
            let deadline = guard.as_ref().expect("60 minutes should schedule");
            assert_eq!(deadline.generation, 2);
            assert_eq!(deadline.minutes, 60);
        }

        // Cancelling still bumps the generation (so a tick thread from
        // generation 2 notices it is stale) and clears the deadline.
        let g3 = state.advance(0, now);
        assert_eq!(g3, 3);
        {
            let guard = state.deadline.lock().unwrap();
            assert!(guard.is_none());
        }
    }

    #[test]
    fn advance_from_an_already_cancelled_state_still_moves_the_generation_forward() {
        let state = SleepState::default();
        let now = Instant::now();
        assert_eq!(state.advance(0, now), 1);
        // A generation lost when the deadline went back to `None` must not
        // make the counter repeat — the very next schedule keeps counting
        // up from the shared atomic, not from whatever the (now absent)
        // `Deadline` last recorded.
        assert_eq!(state.advance(30, now), 2);
    }

    #[test]
    fn remaining_seconds_is_none_when_no_timer_is_running() {
        let state = SleepState::default();
        assert_eq!(super::remaining_seconds(&state), None);
    }

    #[test]
    fn remaining_seconds_reports_the_injected_deadline() {
        let state = SleepState::default();
        {
            let mut guard = state.deadline.lock().unwrap();
            *guard = Some(Deadline {
                generation: 1,
                ends_at: Instant::now() + Duration::from_secs(42),
                minutes: 15,
            });
        }
        let remaining = super::remaining_seconds(&state).expect("a deadline is set");
        // Allow a little slack for the time this test itself takes to run.
        assert!(
            (40..=42).contains(&remaining),
            "expected ~42s remaining, got {remaining}"
        );
    }

    #[test]
    fn remaining_seconds_is_zero_once_the_deadline_has_passed() {
        let state = SleepState::default();
        {
            let mut guard = state.deadline.lock().unwrap();
            *guard = Some(Deadline {
                generation: 1,
                ends_at: Instant::now() - Duration::from_secs(5),
                minutes: 15,
            });
        }
        assert_eq!(super::remaining_seconds(&state), Some(0));
    }
}
