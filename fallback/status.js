"use strict";

/*
 * Lalin Cast — offline / blocked-surface status window logic.
 *
 * Contract (set by the Rust host before this page loads, via an
 * `initialization_script` on the `status` window):
 *
 *   window.__LALIN_STATUS__ = {
 *     lang: "th" | "en",
 *     state: "offline" | "blockedSurface",
 *     message?: string,
 *     url?: string,
 *   };
 *
 * Commands (the host rejects these unless window.label() === "status"):
 *   status_retry() -> { ok: boolean, message?: string }
 *     On ok === true the host reloads the `media` window and closes this
 *     one; nothing further is required here. On ok === false, the optional
 *     `message` (already localized by the host) is shown to the user.
 *   status_quit() -> void   -- app.exit(0)
 *
 * Retry/Quit are unchanged from wave 2: the user can always press Retry
 * directly. Wave 5 (docs/plans/W5_DESKTOP_PLAN.md, "Status window (ขยาย)")
 * adds a *host-driven* auto-retry indicator on top of that, for the
 * `offline` state only (never `blockedSurface`, which has no retry loop on
 * the Rust side either): the host emits
 *
 *   lalin-cast-status-retry -> { attempt: number, nextInSeconds: number|null,
 *                                 phase: "waiting" | "probing" | "stopped" }
 *
 * via `win.__TAURI__.event.listen`, which this page subscribes to only when
 * that API exists (an older/stub host without `event.listen` must never
 * crash this page — the indicator line just never appears). `#auto-retry-line`
 * renders a local 1-second countdown for `waiting` (via `win.setInterval`,
 * cleared on every new event and once `stopped` arrives), and static text
 * for `probing`/`stopped`. The host still ultimately reloads `media` and
 * closes this window itself once a probe succeeds — this page never probes
 * the network on its own.
 *
 * No inline <script>, no inline event handlers (on*=), no external
 * resources. This file is a plain classic script (no import/export) so it
 * can be loaded as-is in the browser; it exports its testable surface via
 * `module.exports` when loaded under CommonJS (see fallback/status.test.js).
 */

// ---------------------------------------------------------------------------
// i18n strings
// ---------------------------------------------------------------------------

const STRINGS = {
  th: {
    offline: {
      title: "ไม่มีการเชื่อมต่ออินเทอร์เน็ต",
      body: "Lalin Cast เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่อีกครั้ง",
    },
    blockedSurface: {
      title: "YouTube ไม่ได้แสดงหน้าทีวี",
      body: "YouTube ไม่ได้แสดงหน้าทีวี — ลองโหลดใหม่ หรืออัปเดต Lalin Cast",
    },
    unknownState: "ได้รับสถานะที่ไม่รู้จัก",
    retry: "โหลดใหม่",
    retrying: "กำลังโหลดใหม่…",
    quit: "ออก",
    quitting: "กำลังออก…",
    retryFailedPrefix: "ยังเชื่อมต่อไม่สำเร็จ",
    retryErrorPrefix: "โหลดใหม่ไม่สำเร็จ: ",
    quitErrorPrefix: "ออกจากแอปไม่สำเร็จ: ",
    unknownError: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    noTauri: {
      title: "ใช้งานหน้านี้ไม่ได้",
      body: "ไม่พบสภาพแวดล้อม Lalin Cast (Tauri) หน้าต่างนี้ต้องเปิดจากแอป Lalin Cast เท่านั้น",
    },
  },
  en: {
    offline: {
      title: "No internet connection",
      body: "Lalin Cast can't reach the internet. Check your network, then try again.",
    },
    blockedSurface: {
      title: "YouTube isn't showing the TV surface",
      body: "YouTube isn't showing the TV surface — try reloading, or update Lalin Cast.",
    },
    unknownState: "Received an unknown status.",
    retry: "Reload",
    retrying: "Reloading…",
    quit: "Quit",
    quitting: "Quitting…",
    retryFailedPrefix: "Still not connected",
    retryErrorPrefix: "Reload failed: ",
    quitErrorPrefix: "Could not quit: ",
    unknownError: "Unknown error",
    noTauri: {
      title: "This page can't be used",
      body: "The Lalin Cast (Tauri) environment was not found. This window must be opened from the Lalin Cast app.",
    },
  },
};

// Bilingual, fixed-vocabulary text for the auto-retry indicator, shown
// regardless of the window's active UI language — wording pinned by the
// "Status window (ขยาย)" contract in docs/plans/W5_DESKTOP_PLAN.md.
const AUTO_RETRY_PROBING_TEXT = "กำลังลองใหม่… / Retrying…";
const AUTO_RETRY_STOPPED_TEXT = "หยุดลองใหม่อัตโนมัติแล้ว — กดโหลดใหม่ / Auto-retry stopped — press Retry";

function autoRetryWaitingText(nextInSeconds, attempt) {
  return (
    `จะลองใหม่อัตโนมัติใน ${nextInSeconds} วินาที (ครั้งที่ ${attempt}) / ` +
    `Retrying automatically in ${nextInSeconds} s (attempt ${attempt})`
  );
}

// ---------------------------------------------------------------------------
// DOM helpers (operate on a `doc` param so tests can pass a stub)
// ---------------------------------------------------------------------------

function byId(doc, id) {
  return doc.getElementById(id);
}

function setText(doc, id, text) {
  const el = byId(doc, id);
  if (el) el.textContent = text == null ? "" : String(text);
}

function setHidden(doc, id, hidden) {
  const el = byId(doc, id);
  if (el) el.hidden = !!hidden;
}

function stringifyError(err, strings) {
  if (!err) return strings.unknownError;
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string" && err.message) return err.message;
  try {
    return JSON.stringify(err) || strings.unknownError;
  } catch (_e) {
    return strings.unknownError;
  }
}

function langOf(data) {
  return data && data.lang === "th" ? "th" : "en";
}

function hasTauriApi(win) {
  return !!(win && win.__TAURI__ && win.__TAURI__.core && typeof win.__TAURI__.core.invoke === "function");
}

// ---------------------------------------------------------------------------
// Per-window mutable state
// ---------------------------------------------------------------------------

function getState(win) {
  if (!win.__lalinStatusState__) {
    win.__lalinStatusState__ = {
      wired: false,
      // attempt/remaining track the locally-ticking countdown for phase
      // "waiting"; timerId is the win.setInterval handle, cleared on every
      // new event and once "stopped" arrives.
      autoRetry: { timerId: null, remaining: 0, attempt: 0 },
    };
  }
  return win.__lalinStatusState__;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function stateStrings(strings, state) {
  if (state === "offline") return strings.offline;
  if (state === "blockedSurface") return strings.blockedSurface;
  return null;
}

function render(doc, strings, data) {
  const s = stateStrings(strings, data.state);
  setText(doc, "page-title", s ? s.title : strings.unknownState);
  setText(doc, "status-message", data.message || (s ? s.body : strings.unknownState));
  setText(doc, "retry-btn", strings.retry);
  setText(doc, "quit-btn", strings.quit);
  setHidden(doc, "retry-result", true);
  setText(doc, "retry-result", "");
  setHidden(doc, "retry-error", true);
  setText(doc, "retry-error", "");
  // The auto-retry line only ever appears once a `lalin-cast-status-retry`
  // event arrives (see wireAutoRetry below); blockedSurface never wires that
  // listener at all, so it stays hidden for that state by construction.
  setHidden(doc, "auto-retry-line", true);
  setText(doc, "auto-retry-line", "");
}

function renderNoTauri(doc, strings) {
  const main = byId(doc, "main-content");
  if (main) main.hidden = true;
  setHidden(doc, "state-no-tauri", false);
  setText(doc, "no-tauri-title", strings.noTauri.title);
  setText(doc, "no-tauri-body", strings.noTauri.body);
}

// ---------------------------------------------------------------------------
// Command wiring — each wired once; each reads the latest lang/data at
// click time.
// ---------------------------------------------------------------------------

function wireRetry(doc, win) {
  const btn = byId(doc, "retry-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_STATUS__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    btn.textContent = strings.retrying;
    setHidden(doc, "retry-result", true);
    setText(doc, "retry-result", "");
    setHidden(doc, "retry-error", true);
    setText(doc, "retry-error", "");

    win.__TAURI__.core
      .invoke("status_retry")
      .then((result) => {
        const r = result || {};
        if (r.ok) return; // Host reloads `media` and closes this window.
        const message = r.message ? `${strings.retryFailedPrefix}: ${r.message}` : strings.retryFailedPrefix;
        setText(doc, "retry-result", message);
        setHidden(doc, "retry-result", false);
      })
      .catch((err) => {
        setText(doc, "retry-error", strings.retryErrorPrefix + stringifyError(err, strings));
        setHidden(doc, "retry-error", false);
      })
      .then(() => {
        btn.disabled = false;
        btn.textContent = strings.retry;
      });
  });
}

function wireQuit(doc, win) {
  const btn = byId(doc, "quit-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_STATUS__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    btn.textContent = strings.quitting;

    win.__TAURI__.core.invoke("status_quit").catch((err) => {
      btn.disabled = false;
      btn.textContent = strings.quit;
      setText(doc, "retry-error", strings.quitErrorPrefix + stringifyError(err, strings));
      setHidden(doc, "retry-error", false);
    });
  });
}

// ---------------------------------------------------------------------------
// Auto-retry indicator (#auto-retry-line) — see the doc comment at the top
// of this file for the event contract. Wired only for state === "offline"
// and only when `win.__TAURI__.event.listen` exists; never throws when it
// doesn't, so an older/stub host degrades to simply not showing the line.
// ---------------------------------------------------------------------------

function coerceSeconds(value) {
  return typeof value === "number" && isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function clearAutoRetryTimer(win, retryState) {
  if (retryState.timerId != null && typeof win.clearInterval === "function") {
    win.clearInterval(retryState.timerId);
  }
  retryState.timerId = null;
}

function renderAutoRetryWaiting(doc, retryState) {
  setText(doc, "auto-retry-line", autoRetryWaitingText(retryState.remaining, retryState.attempt));
}

function onAutoRetryEvent(doc, win, retryState, payload) {
  // Always clear any running countdown first: "cleared on every new event
  // and on stopped" applies uniformly, whichever phase comes in.
  clearAutoRetryTimer(win, retryState);

  const phase = payload && payload.phase;
  const attempt = payload && typeof payload.attempt === "number" ? payload.attempt : 0;

  if (phase === "waiting") {
    retryState.attempt = attempt;
    retryState.remaining = coerceSeconds(payload.nextInSeconds);
    setHidden(doc, "auto-retry-line", false);
    renderAutoRetryWaiting(doc, retryState);
    if (typeof win.setInterval === "function") {
      retryState.timerId = win.setInterval(() => {
        retryState.remaining = Math.max(0, retryState.remaining - 1);
        renderAutoRetryWaiting(doc, retryState);
        if (retryState.remaining <= 0) clearAutoRetryTimer(win, retryState);
      }, 1000);
    }
    return;
  }

  if (phase === "probing") {
    setHidden(doc, "auto-retry-line", false);
    setText(doc, "auto-retry-line", AUTO_RETRY_PROBING_TEXT);
    return;
  }

  if (phase === "stopped") {
    setHidden(doc, "auto-retry-line", false);
    setText(doc, "auto-retry-line", AUTO_RETRY_STOPPED_TEXT);
  }
  // Any other/unknown phase: the timer is already cleared above and the
  // line is left as it was — nothing further to do without guessing intent.
}

function wireAutoRetry(doc, win) {
  const data = win.__LALIN_STATUS__ || {};
  if (data.state !== "offline") return; // never for blockedSurface (no retry loop on the host side either)

  const hasEventApi = !!(win.__TAURI__ && win.__TAURI__.event && typeof win.__TAURI__.event.listen === "function");
  if (!hasEventApi) return;

  const state = getState(win);
  try {
    const subscribed = win.__TAURI__.event.listen("lalin-cast-status-retry", (event) => {
      onAutoRetryEvent(doc, win, state.autoRetry, event && event.payload);
    });
    // Tauri v2's listen() returns a Promise; a rejection (for example a
    // capability permission missing at runtime) must be swallowed the same
    // way a synchronous throw is below — the line simply never appears.
    if (subscribed && typeof subscribed.catch === "function") subscribed.catch(() => {});
  } catch (_e) {
    // Never crash without the event API's guarantees — the line simply
    // never appears.
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function init(doc, win) {
  const data = (win && win.__LALIN_STATUS__) || {};
  const strings = STRINGS[langOf(data)];

  if (doc.documentElement) doc.documentElement.lang = langOf(data);

  if (!hasTauriApi(win)) {
    renderNoTauri(doc, strings);
    return;
  }

  render(doc, strings, data);

  const state = getState(win);
  if (!state.wired) {
    state.wired = true;
    wireRetry(doc, win);
    wireQuit(doc, win);
    wireAutoRetry(doc, win);
  }
}

function boot() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(document, window));
  } else {
    init(document, window);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { init, hasTauriApi, coerceSeconds, autoRetryWaitingText };
}

boot();
