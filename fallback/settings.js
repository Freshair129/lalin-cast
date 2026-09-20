"use strict";

/*
 * Lalin Cast — native settings window logic.
 *
 * Contract (set by the Rust host before this page loads, via an
 * `initialization_script` on the `settings` window):
 *
 *   window.__LALIN_SETTINGS__ = {
 *     lang: "th" | "en",
 *     version: string,
 *     settings: {
 *       language: "th" | "en",
 *       dialFriendlyName: string,
 *       fullscreen: boolean,
 *       keepOnTop: boolean,
 *       pauseOnBlur: boolean,
 *       controllerEnabled: boolean,
 *       setupCompleted: boolean,
 *     },
 *     dial: {
 *       state: "starting" | "ready" | "degraded" | "disabled",
 *       host: string | null,
 *       port: number | null,
 *       message: string | null,
 *     },
 *   };
 *
 * Commands (the host rejects these unless window.label() === "settings"):
 *   settings_get()                                -> SettingsSnapshot (= { settings, dial })
 *   settings_set(key: string, value: JsonValue)    -> SettingsSnapshot
 *     Whitelisted keys only ("language", "dialFriendlyName", "fullscreen",
 *     "keepOnTop", "pauseOnBlur", "controllerEnabled", "setupCompleted");
 *     an unknown key or wrong value type rejects. On success the returned
 *     snapshot is the new source of truth for every control on this page;
 *     on failure nothing changed server-side, so controls are re-rendered
 *     from the last known-good `settings`/`dial` already held in memory.
 *   settings_open_setup()                          -> void (opens the `setup` window)
 *   settings_check_updates()                       -> void (result appears in the `update` window)
 *
 * Every control on this page calls `settings_set` the moment its value
 * changes (no separate "Save" button) and re-renders itself from whatever
 * snapshot comes back, per the "Settings window" contract in
 * docs/plans/W3_CONTROLS_PLAN.md.
 *
 * No inline <script>, no inline event handlers (on*=), no external
 * resources. This file is a plain classic script (no import/export) so it
 * can be loaded as-is in the browser; it exports its testable surface via
 * `module.exports` when loaded under CommonJS (see fallback/settings.test.js).
 */

// ---------------------------------------------------------------------------
// i18n strings
// ---------------------------------------------------------------------------

const STRINGS = {
  th: {
    pageTitle: "การตั้งค่า Lalin Cast",
    general: {
      heading: "ทั่วไป",
      languageLegend: "ภาษา",
      languageTh: "ไทย",
      languageEn: "English",
      fullscreen: "เต็มจอ",
      keepOnTop: "อยู่บนสุดเสมอ",
    },
    tv: {
      heading: "ทีวีและมือถือ",
      dialNameLabel: "ชื่ออุปกรณ์ที่แสดงบนทีวี/มือถือ",
      openSetupBtn: "เปิดตัวช่วยตั้งค่าเครือข่าย",
      dial: {
        starting: "กำลังเริ่มต้น…",
        ready: "พร้อมใช้งาน",
        degraded: "ขัดข้องชั่วคราว กำลังลองใหม่",
        disabled: "ปิดใช้งาน (ล้มเหลวถาวร)",
        unknown: "ไม่ทราบสถานะ",
      },
    },
    controls: {
      heading: "การควบคุม",
      controllerLabel: "เปิดใช้งานจอยเกม (Gamepad)",
      pauseOnBlurLabel: "หยุดวิดีโอเมื่อหน้าต่างเสียโฟกัส",
    },
    updates: {
      heading: "อัปเดตและเกี่ยวกับ",
      checkUpdatesBtn: "ตรวจสอบอัปเดต",
      checkUpdatesStarted: "เริ่มตรวจสอบอัปเดตแล้ว ผลลัพธ์จะแสดงในหน้าต่างอัปเดต",
      versionLabel: "เวอร์ชัน ",
      unofficialText:
        "Lalin Cast เป็นซอฟต์แวร์อิสระที่ไม่เป็นทางการ ไม่ได้เป็นส่วนหนึ่งของ ไม่ได้รับการรับรอง และไม่มีความเกี่ยวข้องกับ Google, YouTube หรือเจ้าของแพลตฟอร์มใด ๆ",
      legalFilesText: "เอกสาร: PRIVACY.md · TERMS.md · THIRD_PARTY_NOTICES.md",
    },
    settingsErrorPrefix: "บันทึกการตั้งค่าไม่สำเร็จ: ",
    openSetupErrorPrefix: "เปิดตัวช่วยตั้งค่าไม่สำเร็จ: ",
    checkUpdatesErrorPrefix: "ตรวจสอบอัปเดตไม่สำเร็จ: ",
    unknownError: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    noTauri: {
      title: "ใช้งานหน้านี้ไม่ได้",
      body: "ไม่พบสภาพแวดล้อม Lalin Cast (Tauri) หน้าต่างนี้ต้องเปิดจากแอป Lalin Cast เท่านั้น",
    },
  },
  en: {
    pageTitle: "Lalin Cast Settings",
    general: {
      heading: "General",
      languageLegend: "Language",
      languageTh: "ไทย",
      languageEn: "English",
      fullscreen: "Fullscreen",
      keepOnTop: "Keep on top",
    },
    tv: {
      heading: "TV and phone",
      dialNameLabel: "Device name shown on TV/phone",
      openSetupBtn: "Open network setup",
      dial: {
        starting: "Starting…",
        ready: "Ready",
        degraded: "Temporarily degraded, retrying",
        disabled: "Disabled (failed permanently)",
        unknown: "Unknown status",
      },
    },
    controls: {
      heading: "Controls",
      controllerLabel: "Enable controller (gamepad)",
      pauseOnBlurLabel: "Pause video when the window loses focus",
    },
    updates: {
      heading: "Updates and about",
      checkUpdatesBtn: "Check for updates",
      checkUpdatesStarted: "Update check started — the result will appear in the Update window.",
      versionLabel: "Version ",
      unofficialText:
        "Lalin Cast is unofficial, independent software. It is not affiliated with, endorsed by, or associated with Google, YouTube, or any platform owner.",
      legalFilesText: "Documents: PRIVACY.md · TERMS.md · THIRD_PARTY_NOTICES.md",
    },
    settingsErrorPrefix: "Could not save settings: ",
    openSetupErrorPrefix: "Could not open network setup: ",
    checkUpdatesErrorPrefix: "Could not check for updates: ",
    unknownError: "Unknown error",
    noTauri: {
      title: "This page can't be used",
      body: "The Lalin Cast (Tauri) environment was not found. This window must be opened from the Lalin Cast app.",
    },
  },
};

// The controller/keyboard cheat-sheet is shown bilingually (Thai/English
// together, per the U3 spec) regardless of the window's active UI language,
// since it is a quick-reference table rather than page chrome. Content is
// derived from the "Controller และ keyboard" contract in
// docs/plans/W3_CONTROLS_PLAN.md; controller entries beyond the one the
// contract names explicitly (R3 -> open settings) use generic wording
// ("confirm/back button") rather than brand-specific button names (Xbox vs.
// DualSense differ), since the exact mapping is owned by the U2 stream.
const CONTROLS_TABLE = {
  caption: "สรุปปุ่มควบคุม / Controls at a glance",
  columns: ["การทำงาน / Action", "คีย์บอร์ด / Keyboard", "จอย / Controller"],
  rows: [
    ["เปิดการตั้งค่า / Open settings", "Ctrl+O", "R3 (กดแท่งขวา) / R3 (right-stick click)"],
    ["สลับเต็มจอ / Toggle fullscreen", "F11", "—"],
    ["กดปุ่มยืนยันค้าง / Long-press confirm", "Shift+Enter", "กดปุ่มยืนยันค้าง / Hold confirm button"],
    ["ย้อนกลับ / Back", "คลิกขวา / Right-click", "ปุ่มย้อนกลับ / Back button"],
    ["ปรับระดับเสียง / Volume", "+ / −", "—"],
    ["ปิดเสียง / Mute", "M", "—"],
    ["คำบรรยาย / Captions", "C", "—"],
    ["คัดลอกลิงก์วิดีโอ / Copy video link", "Ctrl+Shift+C", "—"],
    ["นำทาง / Navigate", "ลูกศร / Arrow keys", "ปุ่มทิศทาง/แท่งซ้าย / D-pad or left stick"],
    ["ยืนยัน/เลือก / Confirm/select", "Enter", "ปุ่มยืนยัน / Confirm button"],
  ],
};

const SETTINGS_KEYS = {
  fullscreen: "fullscreen",
  keepOnTop: "keepOnTop",
  controllerEnabled: "controllerEnabled",
  pauseOnBlur: "pauseOnBlur",
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

function setAttr(doc, id, name, value) {
  const el = byId(doc, id);
  if (el && typeof el.setAttribute === "function") el.setAttribute(name, value);
}

function setChecked(doc, id, checked) {
  const el = byId(doc, id);
  if (el) el.checked = !!checked;
}

function setValue(doc, id, value) {
  const el = byId(doc, id);
  if (el) el.value = value == null ? "" : String(value);
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
  return !!(
    win &&
    win.__TAURI__ &&
    win.__TAURI__.core &&
    typeof win.__TAURI__.core.invoke === "function" &&
    win.__TAURI__.window &&
    typeof win.__TAURI__.window.getCurrentWindow === "function"
  );
}

// ---------------------------------------------------------------------------
// Per-window mutable state (kept on the `win` object itself, never on the
// module, so each window — and each test's stub window — is independent).
// ---------------------------------------------------------------------------

function getState(win) {
  if (!win.__lalinSettingsState__) {
    win.__lalinSettingsState__ = { wired: false };
  }
  return win.__lalinSettingsState__;
}

// ---------------------------------------------------------------------------
// Error display — one shared inline region for every command on this page.
// ---------------------------------------------------------------------------

function showError(doc, message) {
  setText(doc, "settings-error", message || "");
  setHidden(doc, "settings-error", !message);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function buildControlsTableBody(doc) {
  const tbody = byId(doc, "controls-table-body");
  if (!tbody || typeof doc.createElement !== "function") return;
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  CONTROLS_TABLE.rows.forEach((cells) => {
    const tr = doc.createElement("tr");
    cells.forEach((cellText) => {
      const td = doc.createElement("td");
      td.textContent = cellText;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Static chrome: headings, button/field labels, and the cheat-sheet table.
// Independent of `settings`/`dial`, so it only needs to run once per load
// (the window's `lang` does not change without reopening it), but is cheap
// enough to be safe to call again.
function renderStaticLabels(doc, strings, data) {
  setText(doc, "page-title", strings.pageTitle);

  setText(doc, "general-heading", strings.general.heading);
  setText(doc, "language-legend", strings.general.languageLegend);
  setText(doc, "language-th-label", strings.general.languageTh);
  setText(doc, "language-en-label", strings.general.languageEn);
  setText(doc, "fullscreen-label", strings.general.fullscreen);
  setText(doc, "keep-on-top-label", strings.general.keepOnTop);

  setText(doc, "tv-heading", strings.tv.heading);
  setText(doc, "dial-name-label", strings.tv.dialNameLabel);
  setText(doc, "open-setup-btn", strings.tv.openSetupBtn);

  setText(doc, "controls-heading", strings.controls.heading);
  setText(doc, "controller-label", strings.controls.controllerLabel);
  setText(doc, "pause-on-blur-label", strings.controls.pauseOnBlurLabel);
  setText(doc, "controls-table-caption", CONTROLS_TABLE.caption);
  setText(doc, "controls-col-action", CONTROLS_TABLE.columns[0]);
  setText(doc, "controls-col-keyboard", CONTROLS_TABLE.columns[1]);
  setText(doc, "controls-col-controller", CONTROLS_TABLE.columns[2]);
  buildControlsTableBody(doc);

  setText(doc, "updates-heading", strings.updates.heading);
  setText(doc, "check-updates-btn", strings.updates.checkUpdatesBtn);
  setText(doc, "version-line", strings.updates.versionLabel + ((data && data.version) || ""));
  setText(doc, "unofficial-text", strings.updates.unofficialText);
  setText(doc, "legal-files-text", strings.updates.legalFilesText);
}

function dialStateLabel(strings, dial) {
  const d = dial || {};
  switch (d.state) {
    case "starting":
      return strings.tv.dial.starting;
    case "ready": {
      const hostPort = d.host && d.port ? ` (${d.host}:${d.port})` : "";
      return strings.tv.dial.ready + hostPort;
    }
    case "degraded":
      return strings.tv.dial.degraded + (d.message ? `: ${d.message}` : "");
    case "disabled":
      return strings.tv.dial.disabled + (d.message ? `: ${d.message}` : "");
    default:
      return strings.tv.dial.unknown;
  }
}

function dialLevel(state) {
  if (state === "ready") return "good";
  if (state === "degraded" || state === "disabled") return "warn";
  if (state === "starting") return "info";
  return "unknown";
}

function renderDial(doc, strings, dial) {
  setAttr(doc, "dial-status", "data-level", dialLevel(dial && dial.state));
  setText(doc, "dial-status", dialStateLabel(strings, dial));
}

// Control state: rebuilt from `data.settings`/`data.dial` — called on init
// and again every time a `settings_set` call resolves or rejects, so it is
// always the single source of truth painted onto the controls (on
// rejection, `data` still holds the last known-good values, so this
// naturally reverts any control the user had just toggled).
function renderDynamic(doc, strings, data) {
  const settings = (data && data.settings) || {};
  setChecked(doc, "language-th", settings.language === "th");
  setChecked(doc, "language-en", settings.language !== "th");
  setChecked(doc, "fullscreen-toggle", !!settings.fullscreen);
  setChecked(doc, "keep-on-top-toggle", !!settings.keepOnTop);
  setChecked(doc, "controller-toggle", !!settings.controllerEnabled);
  setChecked(doc, "pause-on-blur-toggle", !!settings.pauseOnBlur);
  setValue(doc, "dial-name-input", settings.dialFriendlyName || "");
  renderDial(doc, strings, data && data.dial);
}

function renderNoTauri(doc, strings) {
  const main = byId(doc, "main-content");
  if (main) main.hidden = true;
  setHidden(doc, "state-no-tauri", false);
  setText(doc, "no-tauri-title", strings.noTauri.title);
  setText(doc, "no-tauri-body", strings.noTauri.body);
}

// ---------------------------------------------------------------------------
// settings_set wiring — shared by every toggle/radio/field on this page.
// ---------------------------------------------------------------------------

function afterSettingsSet(doc, win, invokePromise) {
  const data = win.__LALIN_SETTINGS__ || {};
  const strings = STRINGS[langOf(data)];
  showError(doc, "");

  return invokePromise
    .then((snapshot) => {
      const s = snapshot || {};
      if (s.settings) data.settings = s.settings;
      if (s.dial) data.dial = s.dial;
      // A language change is reflected in the snapshot; adopt it so the page
      // relabels itself immediately instead of waiting to be reopened.
      if (s.settings && (s.settings.language === "th" || s.settings.language === "en")) {
        data.lang = s.settings.language;
      }
      win.__LALIN_SETTINGS__ = data;
      const nextStrings = STRINGS[langOf(data)];
      if (nextStrings !== strings) renderStaticLabels(doc, nextStrings, data);
      renderDynamic(doc, nextStrings, data);
    })
    .catch((err) => {
      // `data` was not mutated above, so re-rendering it now repaints every
      // control back to its last known-good state.
      renderDynamic(doc, strings, data);
      showError(doc, strings.settingsErrorPrefix + stringifyError(err, strings));
    });
}

function wireLanguageRadios(doc, win) {
  ["language-th", "language-en"].forEach((id) => {
    const radio = byId(doc, id);
    if (!radio) return;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      afterSettingsSet(doc, win, win.__TAURI__.core.invoke("settings_set", { key: "language", value: radio.value }));
    });
  });
}

function wireBooleanToggle(doc, win, elementId, key) {
  const el = byId(doc, elementId);
  if (!el) return;
  el.addEventListener("change", () => {
    afterSettingsSet(doc, win, win.__TAURI__.core.invoke("settings_set", { key, value: !!el.checked }));
  });
}

function commitDialName(doc, win) {
  const input = byId(doc, "dial-name-input");
  if (!input) return;
  // Enter fires both our keydown handler and the browser's native change
  // event; skip when the value already matches the last accepted snapshot so
  // one keypress cannot trigger two settings_set calls (and two DIAL rebinds).
  const data = win.__LALIN_SETTINGS__ || {};
  const committed = data.settings ? data.settings.dialFriendlyName : undefined;
  if (typeof committed === "string" && String(input.value).trim() === committed.trim()) return;
  afterSettingsSet(
    doc,
    win,
    win.__TAURI__.core.invoke("settings_set", { key: "dialFriendlyName", value: input.value }),
  );
}

function wireDialName(doc, win) {
  const input = byId(doc, "dial-name-input");
  if (!input) return;
  input.addEventListener("change", () => commitDialName(doc, win));
  input.addEventListener("keydown", (event) => {
    if (!event || event.key !== "Enter") return;
    commitDialName(doc, win);
  });
}

function wireOpenSetup(doc, win) {
  const btn = byId(doc, "open-setup-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_SETTINGS__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    showError(doc, "");

    win.__TAURI__.core
      .invoke("settings_open_setup")
      .catch((err) => {
        showError(doc, strings.openSetupErrorPrefix + stringifyError(err, strings));
      })
      .then(() => {
        btn.disabled = false;
      });
  });
}

function wireCheckUpdates(doc, win) {
  const btn = byId(doc, "check-updates-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_SETTINGS__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    setHidden(doc, "check-updates-result", true);
    setText(doc, "check-updates-result", "");
    showError(doc, "");

    win.__TAURI__.core
      .invoke("settings_check_updates")
      .then(() => {
        setText(doc, "check-updates-result", strings.updates.checkUpdatesStarted);
        setHidden(doc, "check-updates-result", false);
      })
      .catch((err) => {
        showError(doc, strings.checkUpdatesErrorPrefix + stringifyError(err, strings));
      })
      .then(() => {
        btn.disabled = false;
      });
  });
}

// ---------------------------------------------------------------------------
// Escape closes the window directly (no dedicated command — same pattern as
// fallback/update.js's Later/close buttons).
// ---------------------------------------------------------------------------

function closeWindow(win) {
  try {
    win.__TAURI__.window.getCurrentWindow().close();
  } catch (_e) {
    // Nothing else we can do without the Tauri window API.
  }
}

function wireEscape(doc, win) {
  doc.addEventListener("keydown", (event) => {
    if (!event || event.key !== "Escape") return;
    closeWindow(win);
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function init(doc, win) {
  const data = (win && win.__LALIN_SETTINGS__) || {};
  const strings = STRINGS[langOf(data)];

  if (doc.documentElement) doc.documentElement.lang = langOf(data);

  if (!hasTauriApi(win)) {
    renderNoTauri(doc, strings);
    return;
  }

  const state = getState(win);
  if (!state.wired) {
    state.wired = true;
    wireLanguageRadios(doc, win);
    wireBooleanToggle(doc, win, "fullscreen-toggle", SETTINGS_KEYS.fullscreen);
    wireBooleanToggle(doc, win, "keep-on-top-toggle", SETTINGS_KEYS.keepOnTop);
    wireBooleanToggle(doc, win, "controller-toggle", SETTINGS_KEYS.controllerEnabled);
    wireBooleanToggle(doc, win, "pause-on-blur-toggle", SETTINGS_KEYS.pauseOnBlur);
    wireDialName(doc, win);
    wireOpenSetup(doc, win);
    wireCheckUpdates(doc, win);
    wireEscape(doc, win);
  }

  renderStaticLabels(doc, strings, data);
  renderDynamic(doc, strings, data);
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
