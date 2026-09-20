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
 * There is no auto-retry loop by design: the user always presses Retry.
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
    win.__lalinStatusState__ = { wired: false };
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
  module.exports = { init, hasTauriApi };
}

boot();
