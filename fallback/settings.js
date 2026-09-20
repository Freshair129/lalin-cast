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
 *       sleepTimerMinutes: 0 | 15 | 30 | 60 | 90 | 120,
 *       codecFilter: "off" | "h264",
 *       hardwareDecoding: boolean,
 *       touchOverlay: boolean,
 *       miniPlayer: boolean,
 *       startWithWindows: boolean,
 *     },
 *     dial: {
 *       state: "starting" | "ready" | "degraded" | "disabled",
 *       host: string | null,
 *       port: number | null,
 *       message: string | null,
 *     },
 *     sleepRemainingSeconds: number | null,
 *     hardwareDecodingRestartRequired: boolean,
 *   };
 *
 * Commands (the host rejects these unless window.label() === "settings"):
 *   settings_get()                                -> SettingsSnapshot (= { settings, dial, sleepRemainingSeconds, hardwareDecodingRestartRequired })
 *   settings_set(key: string, value: JsonValue)    -> SettingsSnapshot
 *     Whitelisted keys only ("language", "dialFriendlyName", "fullscreen",
 *     "keepOnTop", "pauseOnBlur", "controllerEnabled", "setupCompleted",
 *     "sleepTimerMinutes", "codecFilter", "hardwareDecoding", "touchOverlay",
 *     "miniPlayer", "startWithWindows"); an unknown key, a wrong value type,
 *     or a value outside the allowed set (e.g. a sleep timer minute count
 *     that is not one of {0, 15, 30, 60, 90, 120}) rejects. On success the
 *     returned snapshot is the new source of truth for every control on this
 *     page; on failure nothing changed server-side, so controls are
 *     re-rendered from the last known-good `settings`/`dial`/
 *     `sleepRemainingSeconds`/`hardwareDecodingRestartRequired` already held
 *     in memory.
 *   settings_open_setup()                          -> void (opens the `setup` window)
 *   settings_check_updates()                       -> void (result appears in the `update` window)
 *   settings_diagnostics()                         -> string (plain-text diagnostics snapshot;
 *     contains no device id, URL, deep link, TV code, cookie or token)
 *
 * Every control on this page calls `settings_set` the moment its value
 * changes (no separate "Save" button) and re-renders itself from whatever
 * snapshot comes back, per the "Settings window" contract in
 * docs/plans/W3_CONTROLS_PLAN.md, extended by docs/plans/W4_PLAYBACK_PLAN.md
 * and docs/plans/W5_DESKTOP_PLAN.md.
 *
 * While this window is open and the page is visible (`!document.hidden`),
 * a 5-second refresh loop calls `settings_get` on its own and repaints the
 * DIAL status line, the sleep-timer countdown and the mini-player toggle so
 * they stay live even when those values change from elsewhere (tray menu,
 * media-window keybind, the sleep timer itself expiring). The DIAL name
 * field is never overwritten by this loop while it has keyboard focus, so
 * it cannot clobber what the user is in the middle of typing.
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
      startWithWindowsLabel: "เริ่ม Lalin Cast อัตโนมัติเมื่อเข้าสู่ระบบ Windows",
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
    playback: {
      heading: "การเล่น",
      sleepTimerLabel: "ตั้งเวลาปิดอัตโนมัติ",
      sleepTimerRemainingPrefix: "เหลือเวลา ",
      codecFilterLabel: "ตัวกรองรูปแบบวิดีโอ (Codec)",
      codecFilterNote: "หมายเหตุ: มีผลหลังโหลดหน้าใหม่",
      hardwareDecodingLabel: "ถอดรหัสวิดีโอด้วยฮาร์ดแวร์",
      hardwareDecodingNote: "หมายเหตุ: มีผลหลังเปิดแอปใหม่",
    },
    display: {
      heading: "หน้าจอ",
      fullscreen: "เต็มจอ",
      keepOnTop: "อยู่บนสุดเสมอ",
      miniPlayerLabel: "โหมดมินิเพลเยอร์",
    },
    controls: {
      heading: "การควบคุม",
      controllerLabel: "เปิดใช้งานจอยเกม (Gamepad)",
      pauseOnBlurLabel: "หยุดวิดีโอเมื่อหน้าต่างเสียโฟกัส",
      touchOverlayLabel: "แสดงปุ่มสัมผัสบนหน้าจอ",
    },
    updates: {
      heading: "อัปเดตและเกี่ยวกับ",
      checkUpdatesBtn: "ตรวจสอบอัปเดต",
      checkUpdatesStarted: "เริ่มตรวจสอบอัปเดตแล้ว ผลลัพธ์จะแสดงในหน้าต่างอัปเดต",
      versionLabel: "เวอร์ชัน ",
      unofficialText:
        "Lalin Cast เป็นซอฟต์แวร์อิสระที่ไม่เป็นทางการ ไม่ได้เป็นส่วนหนึ่งของ ไม่ได้รับการรับรอง และไม่มีความเกี่ยวข้องกับ Google, YouTube หรือเจ้าของแพลตฟอร์มใด ๆ",
      legalFilesText: "เอกสาร: PRIVACY.md · TERMS.md · THIRD_PARTY_NOTICES.md",
      copyDiagnosticsBtn: "คัดลอกข้อมูลวินิจฉัย",
      diagnosticsNote:
        "ข้อความวินิจฉัยมีเวอร์ชันแอป ระบบปฏิบัติการและ WebView2 สถานะ DIAL และ IP ในเครือข่ายภายใน (LAN) และค่าตั้งต่าง ๆ — ไม่มีข้อมูลบัญชีหรือรหัสทีวี",
      diagnosticsOutputLabel: "ข้อความวินิจฉัย",
    },
    settingsErrorPrefix: "บันทึกการตั้งค่าไม่สำเร็จ: ",
    openSetupErrorPrefix: "เปิดตัวช่วยตั้งค่าไม่สำเร็จ: ",
    checkUpdatesErrorPrefix: "ตรวจสอบอัปเดตไม่สำเร็จ: ",
    diagnosticsErrorPrefix: "ดึงข้อมูลวินิจฉัยไม่สำเร็จ: ",
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
      startWithWindowsLabel: "Start Lalin Cast automatically when Windows starts",
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
    playback: {
      heading: "Playback",
      sleepTimerLabel: "Sleep timer",
      sleepTimerRemainingPrefix: "Remaining ",
      codecFilterLabel: "Video codec filter",
      codecFilterNote: "Note: applies after the next reload",
      hardwareDecodingLabel: "Hardware video decoding",
      hardwareDecodingNote: "Note: applies after restarting the app",
    },
    display: {
      heading: "Display",
      fullscreen: "Fullscreen",
      keepOnTop: "Keep on top",
      miniPlayerLabel: "Mini-player mode",
    },
    controls: {
      heading: "Controls",
      controllerLabel: "Enable controller (gamepad)",
      pauseOnBlurLabel: "Pause video when the window loses focus",
      touchOverlayLabel: "Show on-screen touch controls",
    },
    updates: {
      heading: "Updates and about",
      checkUpdatesBtn: "Check for updates",
      checkUpdatesStarted: "Update check started — the result will appear in the Update window.",
      versionLabel: "Version ",
      unofficialText:
        "Lalin Cast is unofficial, independent software. It is not affiliated with, endorsed by, or associated with Google, YouTube, or any platform owner.",
      legalFilesText: "Documents: PRIVACY.md · TERMS.md · THIRD_PARTY_NOTICES.md",
      copyDiagnosticsBtn: "Copy diagnostics",
      diagnosticsNote:
        "The diagnostics text includes the app version, OS and WebView2, DIAL status and your LAN IP address, and your settings — it does not include any account information or TV code.",
      diagnosticsOutputLabel: "Diagnostics text",
    },
    settingsErrorPrefix: "Could not save settings: ",
    openSetupErrorPrefix: "Could not open network setup: ",
    checkUpdatesErrorPrefix: "Could not check for updates: ",
    diagnosticsErrorPrefix: "Could not get diagnostics: ",
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
    ["สลับมินิเพลเยอร์ / Toggle mini-player", "Ctrl+Shift+M", "—"],
    ["กดปุ่มยืนยันค้าง / Long-press confirm", "Shift+Enter", "กดปุ่มยืนยันค้าง / Hold confirm button"],
    ["ย้อนกลับ / Back", "คลิกขวา / Right-click", "ปุ่มย้อนกลับ / Back button"],
    ["ปรับระดับเสียง / Volume", "+ / −", "—"],
    ["ปิดเสียง / Mute", "M", "—"],
    ["คำบรรยาย / Captions", "C", "—"],
    ["คัดลอกลิงก์วิดีโอ / Copy video link", "Ctrl+Shift+C", "—"],
    ["นำทาง / Navigate", "ลูกศร / Arrow keys", "ปุ่มทิศทาง/แท่งซ้าย / D-pad or left stick"],
    ["ยืนยัน/เลือก / Confirm/select", "Enter", "ปุ่มยืนยัน / Confirm button"],
    ["ความเร็วเล่น ช้าลง/เร็วขึ้น / Playback speed down/up", "Shift+, / Shift+.", "—"],
    ["แสดงผังคีย์ลัด / Show help overlay", "? / F1", "—"],
  ],
};

// Bilingual, fixed-vocabulary strings shown regardless of the window's
// active UI language, same rationale as CONTROLS_TABLE above. Wording is
// pinned by the "Settings window (ขยาย)" contract in
// docs/plans/W5_DESKTOP_PLAN.md.
const START_WITH_WINDOWS_NOTE =
  "เพิ่ม Lalin Cast ในรายการเริ่มต้นของ Windows (registry Run key ของบัญชีนี้) มีผลตั้งแต่การเข้าสู่ระบบครั้งถัดไป / Adds Lalin Cast to this account's Windows startup (registry Run key); takes effect at the next sign-in";
const DIAGNOSTICS_COPIED_TEXT = "คัดลอกแล้ว / Copied";
const DIAGNOSTICS_MANUAL_COPY_TEXT = "เลือกข้อความแล้วคัดลอกเอง / Select the text and copy it";

// Sleep timer and codec filter option labels are shown bilingually, same
// rationale as CONTROLS_TABLE above: they are short, fixed-vocabulary
// choices rather than page chrome, so they do not need to be rebuilt when
// the window's language changes.
const SLEEP_TIMER_OPTIONS = [
  { value: 0, label: "ปิด / Off" },
  { value: 15, label: "15 นาที / 15 min" },
  { value: 30, label: "30 นาที / 30 min" },
  { value: 60, label: "60 นาที / 60 min" },
  { value: 90, label: "90 นาที / 90 min" },
  { value: 120, label: "120 นาที / 120 min" },
];

const CODEC_FILTER_OPTIONS = [
  { value: "off", label: "ไม่กรอง / Off" },
  { value: "h264", label: "จำกัดเฉพาะ H.264 / H.264 only" },
];

const SETTINGS_KEYS = {
  fullscreen: "fullscreen",
  keepOnTop: "keepOnTop",
  controllerEnabled: "controllerEnabled",
  pauseOnBlur: "pauseOnBlur",
  sleepTimerMinutes: "sleepTimerMinutes",
  codecFilter: "codecFilter",
  hardwareDecoding: "hardwareDecoding",
  touchOverlay: "touchOverlay",
  miniPlayer: "miniPlayer",
  startWithWindows: "startWithWindows",
};

const REFRESH_INTERVAL_MS = 5000;

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
    win.__lalinSettingsState__ = { wired: false, refreshTimerId: null };
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
// Snapshot merging — shared by the settings_set response handler and the
// background settings_get refresh loop. Only overwrites the top-level
// fields that are actually present on `snapshot`, since `sleepRemainingSeconds`
// (nullable) and `hardwareDecodingRestartRequired` (can legitimately be
// `false`) cannot be distinguished from "absent" with a truthy check.
// ---------------------------------------------------------------------------

function mergeSnapshot(data, snapshot) {
  const s = snapshot || {};
  if (s.settings) data.settings = s.settings;
  if (s.dial) data.dial = s.dial;
  if (Object.prototype.hasOwnProperty.call(s, "sleepRemainingSeconds")) {
    data.sleepRemainingSeconds = s.sleepRemainingSeconds;
  }
  if (Object.prototype.hasOwnProperty.call(s, "hardwareDecodingRestartRequired")) {
    data.hardwareDecodingRestartRequired = s.hardwareDecodingRestartRequired;
  }
  return data;
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

function buildSelectOptions(doc, selectId, options) {
  const select = byId(doc, selectId);
  if (!select || typeof doc.createElement !== "function") return;
  while (select.firstChild) select.removeChild(select.firstChild);
  options.forEach((opt) => {
    const optionEl = doc.createElement("option");
    optionEl.value = String(opt.value);
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
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
  setText(doc, "start-with-windows-label", strings.general.startWithWindowsLabel);
  setText(doc, "start-with-windows-note", START_WITH_WINDOWS_NOTE);

  setText(doc, "tv-heading", strings.tv.heading);
  setText(doc, "dial-name-label", strings.tv.dialNameLabel);
  setText(doc, "open-setup-btn", strings.tv.openSetupBtn);

  setText(doc, "playback-heading", strings.playback.heading);
  setText(doc, "sleep-timer-label", strings.playback.sleepTimerLabel);
  setText(doc, "codec-filter-label", strings.playback.codecFilterLabel);
  setText(doc, "codec-filter-note", strings.playback.codecFilterNote);
  setText(doc, "hardware-decoding-label", strings.playback.hardwareDecodingLabel);
  buildSelectOptions(doc, "sleep-timer-select", SLEEP_TIMER_OPTIONS);
  buildSelectOptions(doc, "codec-filter-select", CODEC_FILTER_OPTIONS);

  setText(doc, "display-heading", strings.display.heading);
  setText(doc, "fullscreen-label", strings.display.fullscreen);
  setText(doc, "keep-on-top-label", strings.display.keepOnTop);
  setText(doc, "mini-player-label", strings.display.miniPlayerLabel);

  setText(doc, "controls-heading", strings.controls.heading);
  setText(doc, "controller-label", strings.controls.controllerLabel);
  setText(doc, "pause-on-blur-label", strings.controls.pauseOnBlurLabel);
  setText(doc, "touch-overlay-label", strings.controls.touchOverlayLabel);
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
  setText(doc, "copy-diagnostics-btn", strings.updates.copyDiagnosticsBtn);
  setText(doc, "diagnostics-note", strings.updates.diagnosticsNote);
  setAttr(doc, "diagnostics-output", "aria-label", strings.updates.diagnosticsOutputLabel);
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

// mm:ss for the sleep-timer countdown. Returns null (nothing to show) for
// anything that isn't a finite, non-negative number, which covers both
// `sleepRemainingSeconds: null` (no timer running) and a missing/malformed
// value from a stub snapshot.
function formatRemaining(seconds) {
  if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

function renderCountdown(doc, strings, remainingSeconds) {
  const formatted = formatRemaining(remainingSeconds);
  if (formatted == null) {
    setHidden(doc, "sleep-timer-remaining", true);
    setText(doc, "sleep-timer-remaining", "");
    return;
  }
  setHidden(doc, "sleep-timer-remaining", false);
  setText(doc, "sleep-timer-remaining", strings.playback.sleepTimerRemainingPrefix + formatted);
}

function renderHardwareDecodingNote(doc, strings, restartRequired) {
  setText(doc, "hardware-decoding-note", strings.playback.hardwareDecodingNote);
  setAttr(doc, "hardware-decoding-note", "data-level", restartRequired ? "warn" : "info");
}

// The DIAL name field is never overwritten while the user has it focused —
// both for a normal settings_set response (they may already be editing the
// next name) and, more importantly, for the background refresh loop, which
// must not clobber an in-progress edit just because a poll happened to land
// mid-keystroke.
function renderDialNameInput(doc, value) {
  const input = byId(doc, "dial-name-input");
  if (!input) return;
  if (doc.activeElement === input) return;
  setValue(doc, "dial-name-input", value);
}

// Control state: rebuilt from `data.settings`/`data.dial`/
// `data.sleepRemainingSeconds`/`data.hardwareDecodingRestartRequired` —
// called on init, again every time a `settings_set` call resolves or
// rejects (on rejection `data` still holds the last known-good values, so
// this naturally reverts any control the user had just toggled), and again
// on every tick of the 5-second background refresh loop.
function renderDynamic(doc, strings, data) {
  const settings = (data && data.settings) || {};
  setChecked(doc, "language-th", settings.language === "th");
  setChecked(doc, "language-en", settings.language !== "th");
  setChecked(doc, "start-with-windows-toggle", !!settings.startWithWindows);
  renderDialNameInput(doc, settings.dialFriendlyName || "");
  renderDial(doc, strings, data && data.dial);

  setValue(doc, "sleep-timer-select", settings.sleepTimerMinutes != null ? settings.sleepTimerMinutes : 0);
  renderCountdown(doc, strings, data && data.sleepRemainingSeconds);
  setValue(doc, "codec-filter-select", settings.codecFilter || "off");
  setChecked(doc, "hardware-decoding-toggle", !!settings.hardwareDecoding);
  renderHardwareDecodingNote(doc, strings, !!(data && data.hardwareDecodingRestartRequired));

  setChecked(doc, "fullscreen-toggle", !!settings.fullscreen);
  setChecked(doc, "keep-on-top-toggle", !!settings.keepOnTop);
  setChecked(doc, "mini-player-toggle", !!settings.miniPlayer);

  setChecked(doc, "controller-toggle", !!settings.controllerEnabled);
  setChecked(doc, "pause-on-blur-toggle", !!settings.pauseOnBlur);
  setChecked(doc, "touch-overlay-toggle", !!settings.touchOverlay);
}

function renderNoTauri(doc, strings) {
  const main = byId(doc, "main-content");
  if (main) main.hidden = true;
  setHidden(doc, "state-no-tauri", false);
  setText(doc, "no-tauri-title", strings.noTauri.title);
  setText(doc, "no-tauri-body", strings.noTauri.body);
}

// ---------------------------------------------------------------------------
// settings_set wiring — shared by every toggle/radio/select/field on this
// page.
// ---------------------------------------------------------------------------

function afterSettingsSet(doc, win, invokePromise) {
  const data = win.__LALIN_SETTINGS__ || {};
  const strings = STRINGS[langOf(data)];
  showError(doc, "");

  return invokePromise
    .then((snapshot) => {
      mergeSnapshot(data, snapshot);
      // A language change is reflected in the snapshot; adopt it so the page
      // relabels itself immediately instead of waiting to be reopened.
      if (data.settings && (data.settings.language === "th" || data.settings.language === "en")) {
        data.lang = data.settings.language;
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

// `transform` converts the select's (always-string) `.value` into the JSON
// value `settings_set` expects, e.g. parsing "15" into the number 15 for
// `sleepTimerMinutes`. Omit it for string-valued selects like `codecFilter`.
function wireSelectControl(doc, win, elementId, key, transform) {
  const el = byId(doc, elementId);
  if (!el) return;
  el.addEventListener("change", () => {
    const raw = el.value;
    const value = typeof transform === "function" ? transform(raw) : raw;
    afterSettingsSet(doc, win, win.__TAURI__.core.invoke("settings_set", { key, value }));
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
// Diagnostics snapshot — settings_diagnostics fills the readonly textarea
// (hidden until it has text), then a best-effort clipboard copy reports
// success/manual-copy in #diagnostics-result. Never overwritten by the
// background refresh loop below: refreshTick()/renderDynamic() do not touch
// `diagnostics-output`, `diagnostics-result` or their `hidden`/`value`
// state, so a poll landing mid-copy cannot clobber this button's output.
// ---------------------------------------------------------------------------

// Resolves `true` when the text was copied to the clipboard, `false` when
// the Clipboard API is unavailable or the copy was rejected (e.g. no user
// gesture, permission denied) — either way the caller falls back to the
// manual-copy message, never throwing.
function copyDiagnosticsToClipboard(win, text) {
  const nav = win && win.navigator;
  if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== "function") {
    return Promise.resolve(false);
  }
  return nav.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

function wireCopyDiagnostics(doc, win) {
  const btn = byId(doc, "copy-diagnostics-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_SETTINGS__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    setHidden(doc, "diagnostics-result", true);
    setText(doc, "diagnostics-result", "");
    showError(doc, "");

    win.__TAURI__.core
      .invoke("settings_diagnostics")
      .then((text) => {
        const value = text == null ? "" : String(text);
        setValue(doc, "diagnostics-output", value);
        setHidden(doc, "diagnostics-output", value.length === 0);

        return copyDiagnosticsToClipboard(win, value).then((copied) => {
          setText(doc, "diagnostics-result", copied ? DIAGNOSTICS_COPIED_TEXT : DIAGNOSTICS_MANUAL_COPY_TEXT);
          setHidden(doc, "diagnostics-result", false);
        });
      })
      .catch((err) => {
        showError(doc, strings.diagnosticsErrorPrefix + stringifyError(err, strings));
      })
      .then(() => {
        btn.disabled = false;
      });
  });
}

// ---------------------------------------------------------------------------
// Background refresh loop — settings_get every 5s while the window is open
// and the page is visible, so the DIAL status, sleep-timer countdown and
// mini-player toggle stay live without the user touching anything. A
// transient failure here is silent (no inline error): explicit control
// actions still surface their own errors via afterSettingsSet, and a single
// missed poll self-heals on the next tick.
// ---------------------------------------------------------------------------

function refreshTick(doc, win) {
  if (!win || !hasTauriApi(win)) return;
  if (doc.hidden) return;

  win.__TAURI__.core
    .invoke("settings_get")
    .then((snapshot) => {
      const data = win.__LALIN_SETTINGS__ || {};
      mergeSnapshot(data, snapshot);
      win.__LALIN_SETTINGS__ = data;
      renderDynamic(doc, STRINGS[langOf(data)], data);
    })
    .catch(() => {
      // Silent by design — see comment above.
    });
}

function startRefreshLoop(doc, win) {
  const state = getState(win);
  if (state.refreshTimerId != null) return;
  if (typeof win.setInterval !== "function") return;
  state.refreshTimerId = win.setInterval(() => refreshTick(doc, win), REFRESH_INTERVAL_MS);
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
    wireBooleanToggle(doc, win, "mini-player-toggle", SETTINGS_KEYS.miniPlayer);
    wireBooleanToggle(doc, win, "controller-toggle", SETTINGS_KEYS.controllerEnabled);
    wireBooleanToggle(doc, win, "pause-on-blur-toggle", SETTINGS_KEYS.pauseOnBlur);
    wireBooleanToggle(doc, win, "touch-overlay-toggle", SETTINGS_KEYS.touchOverlay);
    wireBooleanToggle(doc, win, "hardware-decoding-toggle", SETTINGS_KEYS.hardwareDecoding);
    wireBooleanToggle(doc, win, "start-with-windows-toggle", SETTINGS_KEYS.startWithWindows);
    wireSelectControl(doc, win, "sleep-timer-select", SETTINGS_KEYS.sleepTimerMinutes, (raw) => parseInt(raw, 10));
    wireSelectControl(doc, win, "codec-filter-select", SETTINGS_KEYS.codecFilter);
    wireDialName(doc, win);
    wireOpenSetup(doc, win);
    wireCheckUpdates(doc, win);
    wireCopyDiagnostics(doc, win);
    wireEscape(doc, win);
  }

  startRefreshLoop(doc, win);

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
  module.exports = { init, hasTauriApi, formatRemaining };
}

boot();
