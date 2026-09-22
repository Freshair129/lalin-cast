"use strict";

/*
 * Lalin Cast — native update window logic.
 *
 * Contract (set by the Rust host before this page loads, via an
 * `initialization_script` on the `update` window):
 *
 *   window.__LALIN_UPDATE__ = {
 *     lang: "th" | "en",
 *     state: "available" | "upToDate" | "error",
 *     version?: string,
 *     notes?: string,
 *     pubDate?: string,
 *     message?: string,
 *     portable: boolean,
 *   };
 *
 * `portable` (wave 11, contract 4/5 in docs/plans/W11_PORTABLE_PLAN.md) is
 * true when the app is running in portable mode. The NSIS in-place updater
 * installs into its own install folder, not beside the exe, so it must never run in
 * that mode: while `state === "available"` and `portable` is true, the
 * install button is disabled and a short instruction to download the new
 * zip (and move the `lalin-cast-data` folder into it) is shown instead — no
 * new external link, no URL opened. A missing `portable` field (e.g. an
 * older test fixture) is treated the same as `false`.
 *
 * When the window is already open and the host re-checks (or the state
 * otherwise changes), the host does:
 *
 *   window.eval("window.__LALIN_UPDATE__ = <json>; " +
 *     "window.dispatchEvent(new CustomEvent('lalin-update'));")
 *
 * and this page listens for `lalin-update` on `window` to re-render without
 * a full page reload.
 *
 * No inline <script>, no inline event handlers (on*=), no external
 * resources. This file is a plain classic script (no import/export) so it
 * can be loaded as-is in the browser; it exports its testable surface via
 * `module.exports` when loaded under CommonJS (see fallback/update.test.js).
 */

// ---------------------------------------------------------------------------
// i18n strings
// ---------------------------------------------------------------------------

const STRINGS = {
  th: {
    appTitle: "อัปเดต Lalin Cast",
    available: {
      title: "มีอัปเดตใหม่สำหรับ Lalin Cast",
      versionLabel: "เวอร์ชัน",
      install: "ติดตั้งและเปิดใหม่",
      installing: "กำลังติดตั้ง…",
      retry: "ลองอีกครั้ง",
      later: "ไว้ภายหลัง",
      installErrorPrefix: "ติดตั้งไม่สำเร็จ: ",
      unknownError: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    },
    upToDate: {
      title: "คุณใช้เวอร์ชันล่าสุดอยู่แล้ว",
      body: "ไม่มีอัปเดตใหม่ในขณะนี้",
      close: "ปิด",
    },
    error: {
      title: "ตรวจสอบอัปเดตไม่สำเร็จ",
      defaultBody: "ไม่สามารถตรวจสอบอัปเดตได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
      unknownState: "ได้รับสถานะที่ไม่รู้จักจากการตรวจสอบอัปเดต",
      close: "ปิด",
    },
    noTauri: {
      title: "ใช้งานหน้านี้ไม่ได้",
      body: "ไม่พบสภาพแวดล้อม Lalin Cast (Tauri) หน้าต่างนี้ต้องเปิดจากแอป Lalin Cast เท่านั้น",
    },
  },
  en: {
    appTitle: "Lalin Cast Update",
    available: {
      title: "An update is available for Lalin Cast",
      versionLabel: "Version",
      install: "Install and restart",
      installing: "Installing…",
      retry: "Retry",
      later: "Later",
      installErrorPrefix: "Install failed: ",
      unknownError: "Unknown error",
    },
    upToDate: {
      title: "You're already up to date",
      body: "No update is available right now.",
      close: "Close",
    },
    error: {
      title: "Update check failed",
      defaultBody: "Could not check for updates right now. Please try again later.",
      unknownState: "Received an unknown status from the update check.",
      close: "Close",
    },
    noTauri: {
      title: "This page can't be used",
      body: "The Lalin Cast (Tauri) environment was not found. This window must be opened from the Lalin Cast app.",
    },
  },
};

const STATE_SECTION_IDS = ["state-available", "state-uptodate", "state-error", "state-no-tauri"];

// Fixed-vocabulary, bilingual (Thai first, English after) — same rationale
// as fallback/settings.js's PORTABLE_* constants: short, pinned wording
// shown regardless of the window's active UI language. Per contract 5, no
// new external link and no URL opening; this only tells the person what to
// do by hand.
const PORTABLE_INSTALL_NOTICE_TEXT =
  "โหมดพกพา — ดาวน์โหลด zip เวอร์ชันใหม่แล้วย้ายโฟลเดอร์ lalin-cast-data เข้าไปด้วย ไม่มีการติดตั้งอัตโนมัติในโหมดพกพา / " +
  "Portable mode — download the new zip and move the lalin-cast-data folder into it. There is no automatic install in portable mode.";

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

function showOnly(doc, idToShow) {
  STATE_SECTION_IDS.forEach((id) => setHidden(doc, id, id !== idToShow));
}

function stringifyError(err, strings) {
  if (!err) return strings.available.unknownError;
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string" && err.message) return err.message;
  try {
    const asJson = JSON.stringify(err);
    return asJson || strings.available.unknownError;
  } catch (_e) {
    return strings.available.unknownError;
  }
}

function langOf(data) {
  return data && data.lang === "th" ? "th" : "en";
}

// ---------------------------------------------------------------------------
// Per-window mutable state (kept on the `win` object itself, never on the
// module, so each window — and each test's stub window — is independent).
// ---------------------------------------------------------------------------

function getState(win) {
  if (!win.__lalinUpdateState__) {
    win.__lalinUpdateState__ = { installInFlight: false, wired: false };
  }
  return win.__lalinUpdateState__;
}

// ---------------------------------------------------------------------------
// Close / Escape wiring — shared across every state. Both are ignored while
// an install is in flight so a stray Escape or Later click can't abandon an
// in-progress install.
// ---------------------------------------------------------------------------

function closeWindow(win) {
  try {
    win.__TAURI__.window.getCurrentWindow().close();
  } catch (_e) {
    // Nothing else we can do without the Tauri window API.
  }
}

function wireCloseAndEscape(doc, win) {
  const closeButtonIds = ["later-btn", "close-btn-uptodate", "close-btn-error"];
  closeButtonIds.forEach((id) => {
    const el = byId(doc, id);
    if (el) {
      el.addEventListener("click", () => {
        if (getState(win).installInFlight) return;
        closeWindow(win);
      });
    }
  });
  doc.addEventListener("keydown", (event) => {
    if (!event || event.key !== "Escape") return;
    if (getState(win).installInFlight) return;
    closeWindow(win);
  });
}

// ---------------------------------------------------------------------------
// Install button — wired once; reads the latest lang/state at click time so
// it stays correct across re-renders triggered by `lalin-update`.
// ---------------------------------------------------------------------------

function wireInstallButton(doc, win) {
  const installBtn = byId(doc, "install-btn");
  if (!installBtn) return;

  installBtn.addEventListener("click", () => {
    const state = getState(win);
    if (state.installInFlight) return;

    const data = win.__LALIN_UPDATE__ || {};
    // Defense in depth: the Rust host already refuses cast_update_install in
    // portable mode (contract 3), and the button is disabled in that state
    // (renderAvailable above); this guard just makes sure a stray click
    // (e.g. bypassing `disabled` in a test) can never fire the invoke.
    if (data.portable) return;
    const strings = STRINGS[langOf(data)];

    state.installInFlight = true;
    installBtn.disabled = true;
    installBtn.textContent = strings.available.installing;
    const laterBtn = byId(doc, "later-btn");
    if (laterBtn) laterBtn.disabled = true;
    setHidden(doc, "install-error", true);
    setText(doc, "install-error", "");

    win.__TAURI__.core.invoke("cast_update_install").catch((err) => {
      state.installInFlight = false;
      installBtn.disabled = false;
      installBtn.textContent = strings.available.retry;
      if (laterBtn) laterBtn.disabled = false;
      setText(doc, "install-error", strings.available.installErrorPrefix + stringifyError(err, strings));
      setHidden(doc, "install-error", false);
    });
  });
}

// ---------------------------------------------------------------------------
// Per-state rendering — pure UI updates only; no listener registration here
// so calling render() again (from `lalin-update`) never double-binds.
// ---------------------------------------------------------------------------

function renderAvailable(doc, win, strings, data) {
  const state = getState(win);
  const portable = !!data.portable;
  showOnly(doc, "state-available");
  setText(doc, "available-title", strings.available.title);

  const versionLabel = data.version ? `${strings.available.versionLabel} ${data.version}` : "";
  const pubDateSuffix = data.pubDate ? ` (${data.pubDate})` : "";
  setText(doc, "available-version", versionLabel + pubDateSuffix);

  setHidden(doc, "available-notes", !data.notes);
  setText(doc, "available-notes", data.notes || "");

  setHidden(doc, "install-error", true);
  setText(doc, "install-error", "");

  // Contract 5: in portable mode, hide/disable the install button (the NSIS
  // updater installs into its own install folder, not beside the exe) and show a
  // short instruction to download the zip by hand instead.
  setHidden(doc, "portable-install-notice", !portable);
  setText(doc, "portable-install-notice", portable ? PORTABLE_INSTALL_NOTICE_TEXT : "");

  const installBtn = byId(doc, "install-btn");
  if (installBtn) {
    installBtn.disabled = portable || state.installInFlight;
    installBtn.textContent = state.installInFlight ? strings.available.installing : strings.available.install;
  }
  const laterBtn = byId(doc, "later-btn");
  if (laterBtn) laterBtn.disabled = state.installInFlight;
  setText(doc, "later-btn", strings.available.later);
}

function renderUpToDate(doc, strings, data) {
  showOnly(doc, "state-uptodate");
  setText(doc, "uptodate-title", strings.upToDate.title);
  setText(doc, "uptodate-body", data.message || strings.upToDate.body);
  setText(doc, "close-btn-uptodate", strings.upToDate.close);
}

function renderError(doc, strings, data) {
  showOnly(doc, "state-error");
  setText(doc, "error-title", strings.error.title);
  // The translated message is always the one the reader sees. The raw error
  // from the update library is English-only technical text ("Could not fetch a
  // valid release JSON from the remote"), so it goes underneath as a quiet
  // detail line that helps when someone sends a screenshot — it must never
  // replace the translated body, which is what this used to do.
  setText(doc, "error-body", data.body || strings.error.defaultBody);
  const detail = typeof data.message === "string" ? data.message.trim() : "";
  setText(doc, "error-detail", detail);
  setHidden(doc, "error-detail", detail === "");
  setText(doc, "close-btn-error", strings.error.close);
}

function renderNoTauri(doc, strings) {
  showOnly(doc, "state-no-tauri");
  setText(doc, "no-tauri-title", strings.noTauri.title);
  setText(doc, "no-tauri-body", strings.noTauri.body);
}

function render(doc, win, strings, data) {
  switch (data.state) {
    case "available":
      renderAvailable(doc, win, strings, data);
      break;
    case "upToDate":
      renderUpToDate(doc, strings, data);
      break;
    case "error":
      renderError(doc, strings, data);
      break;
    default:
      // Already translated, so it belongs in the body, not the detail line.
      renderError(doc, strings, { body: strings.error.unknownState });
      break;
  }
}

// ---------------------------------------------------------------------------
// `lalin-update` — re-render without reload when the host pushes a new
// state into an already-open window. Ignored while an install is in flight
// so the host re-checking mid-install can't yank the "installing…" UI out
// from under the user.
// ---------------------------------------------------------------------------

function wireLalinUpdateListener(doc, win) {
  win.addEventListener("lalin-update", () => {
    if (getState(win).installInFlight) return;
    const data = win.__LALIN_UPDATE__ || {};
    const strings = STRINGS[langOf(data)];
    if (doc.documentElement) doc.documentElement.lang = langOf(data);
    setText(doc, "app-title", strings.appTitle);
    render(doc, win, strings, data);
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function hasTauriApi(win) {
  return !!(
    win &&
    win.__TAURI__ &&
    win.__TAURI__.core &&
    typeof win.__TAURI__.core.invoke === "function" &&
    win.__TAURI__.window &&
    typeof win.__TAURI__.window.getCurrentWindow === "function"
  );
}

function init(doc, win) {
  const data = (win && win.__LALIN_UPDATE__) || {};
  const strings = STRINGS[langOf(data)];

  if (doc.documentElement) doc.documentElement.lang = langOf(data);
  setText(doc, "app-title", strings.appTitle);

  if (!hasTauriApi(win)) {
    renderNoTauri(doc, strings);
    return;
  }

  const state = getState(win);
  if (!state.wired) {
    state.wired = true;
    wireCloseAndEscape(doc, win);
    wireInstallButton(doc, win);
    wireLalinUpdateListener(doc, win);
  }

  render(doc, win, strings, data);
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
