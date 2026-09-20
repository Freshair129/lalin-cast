"use strict";

/*
 * Lalin Cast — first-run setup wizard window logic.
 *
 * Contract (set by the Rust host before this page loads, via an
 * `initialization_script` on the `setup` window):
 *
 *   window.__LALIN_SETUP__ = {
 *     lang: "th" | "en",
 *     firstRun: boolean,
 *     network: {
 *       category: "Private" | "Public" | "DomainAuthenticated" | "Unknown",
 *       interface: string | null,
 *     },
 *     dial: {
 *       state: "starting" | "ready" | "degraded" | "disabled",
 *       host: string | null,
 *       port: number | null,
 *       message: string | null,
 *     },
 *   };
 *
 * Commands (the host rejects these unless window.label() === "setup"):
 *   setup_refresh()                      -> { network, dial }
 *   setup_open_network_settings()        -> void
 *   setup_complete(dontShowAgain: bool)  -> void (closes this window)
 *
 * No inline <script>, no inline event handlers (on*=), no external
 * resources. This file is a plain classic script (no import/export) so it
 * can be loaded as-is in the browser; it exports its testable surface via
 * `module.exports` when loaded under CommonJS (see fallback/setup.test.js).
 */

// ---------------------------------------------------------------------------
// i18n strings
// ---------------------------------------------------------------------------

const STRINGS = {
  th: {
    pageTitle: "เครือข่ายและ DIAL",
    introFirstRun: "ยินดีต้อนรับสู่ Lalin Cast — ตรวจสอบเครือข่ายและสถานะ DIAL ก่อนเริ่มใช้งาน",
    introReturning: "ตรวจสอบเครือข่ายและสถานะ DIAL ของ Lalin Cast",
    network: {
      heading: "เครือข่าย",
      interfaceLabel: "อินเทอร์เฟซ: ",
      status: {
        Private: "เครือข่ายเป็นแบบ Private — พร้อมใช้งาน",
        Public: "เครือข่ายเป็นแบบ Public — การค้นหาอุปกรณ์อาจใช้งานไม่ได้",
        DomainAuthenticated: "เครือข่ายถูกจัดการโดยองค์กร (Domain) — นโยบายองค์กรอาจบล็อกการค้นพบอุปกรณ์",
        Unknown: "ตรวจสอบสถานะเครือข่ายไม่ได้",
      },
      win11Title: "Windows 11: เปลี่ยนเป็น Private",
      win11Steps: [
        "เปิด Settings (กด Win + I)",
        "เลือก Network & internet",
        "คลิกเครือข่ายที่เชื่อมต่ออยู่ (Wi-Fi หรือ Ethernet) แล้วเปิด Properties",
        "เปลี่ยน Network profile type เป็น Private",
      ],
      win10Title: "Windows 10: เปลี่ยนเป็น Private",
      win10Steps: [
        "เปิด Settings (กด Win + I) แล้วไปที่ Network & Internet",
        "คลิก Status แล้วเลือก Properties ของเครือข่ายที่เชื่อมต่ออยู่",
        "เลื่อนไปที่หัวข้อ Network profile",
        "เลือก Private",
      ],
      openSettingsBtn: "เปิดการตั้งค่าเครือข่าย",
      openSettingsErrorPrefix: "เปิดการตั้งค่าไม่สำเร็จ: ",
    },
    dial: {
      heading: "สถานะ DIAL",
      starting: "กำลังเริ่มต้น…",
      ready: "พร้อมใช้งาน",
      degraded: "ขัดข้องชั่วคราว กำลังลองใหม่",
      disabled: "ปิดใช้งาน (ล้มเหลวถาวร)",
      unknown: "ไม่ทราบสถานะ",
    },
    refresh: "ตรวจอีกครั้ง",
    refreshErrorPrefix: "รีเฟรชไม่สำเร็จ: ",
    closeErrorPrefix: "ปิดหน้าต่างไม่สำเร็จ: ",
    dontShowAgain: "ไม่ต้องแสดงอีก",
    continue: "ปิด",
    unknownError: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    noTauri: {
      title: "ใช้งานหน้านี้ไม่ได้",
      body: "ไม่พบสภาพแวดล้อม Lalin Cast (Tauri) หน้าต่างนี้ต้องเปิดจากแอป Lalin Cast เท่านั้น",
    },
  },
  en: {
    pageTitle: "Network & DIAL",
    introFirstRun: "Welcome to Lalin Cast — check your network and DIAL status before you start.",
    introReturning: "Check Lalin Cast's network and DIAL status.",
    network: {
      heading: "Network",
      interfaceLabel: "Interface: ",
      status: {
        Private: "Network is set to Private — ready to use",
        Public: "Network is set to Public — device discovery may not work",
        DomainAuthenticated: "This network is managed by your organization (Domain) — policy may block device discovery",
        Unknown: "Could not determine the network status",
      },
      win11Title: "Windows 11: switch to Private",
      win11Steps: [
        "Open Settings (press Win + I)",
        "Select Network & internet",
        "Click the connected network (Wi-Fi or Ethernet), then open Properties",
        "Change Network profile type to Private",
      ],
      win10Title: "Windows 10: switch to Private",
      win10Steps: [
        "Open Settings (press Win + I), then go to Network & Internet",
        "Click Status, then select Properties for the connected network",
        "Scroll to the Network profile section",
        "Choose Private",
      ],
      openSettingsBtn: "Open network settings",
      openSettingsErrorPrefix: "Could not open settings: ",
    },
    dial: {
      heading: "DIAL status",
      starting: "Starting…",
      ready: "Ready",
      degraded: "Temporarily degraded, retrying",
      disabled: "Disabled (failed permanently)",
      unknown: "Unknown status",
    },
    refresh: "Check again",
    refreshErrorPrefix: "Refresh failed: ",
    closeErrorPrefix: "Failed to close: ",
    dontShowAgain: "Don't show again",
    continue: "Continue",
    unknownError: "Unknown error",
    noTauri: {
      title: "This page can't be used",
      body: "The Lalin Cast (Tauri) environment was not found. This window must be opened from the Lalin Cast app.",
    },
  },
};

const NETWORK_CATEGORIES = ["Private", "Public", "DomainAuthenticated", "Unknown"];

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
  // Only `core.invoke` is used directly by this page — `setup_complete`
  // closes the window on the Rust side (see the contract above) — but we
  // still require the `window` API to be present as a signal that this is
  // a genuine Tauri webview and not some other host.
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
  if (!win.__lalinSetupState__) {
    win.__lalinSetupState__ = { completing: false, wired: false };
  }
  return win.__lalinSetupState__;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function networkLevel(category) {
  if (category === "Private") return "good";
  if (category === "Public") return "warn";
  if (category === "DomainAuthenticated") return "info";
  return "unknown";
}

function renderNetwork(doc, strings, network) {
  const n = network || {};
  const category = NETWORK_CATEGORIES.includes(n.category) ? n.category : "Unknown";

  setText(doc, "network-status", strings.network.status[category]);
  setAttr(doc, "network-status", "data-level", networkLevel(category));

  if (n.interface) {
    setText(doc, "network-detail", strings.network.interfaceLabel + n.interface);
    setHidden(doc, "network-detail", false);
  } else {
    setText(doc, "network-detail", "");
    setHidden(doc, "network-detail", true);
  }

  setHidden(doc, "network-steps", category !== "Public");
}

function dialStateLabel(strings, dial) {
  const d = dial || {};
  switch (d.state) {
    case "starting":
      return strings.dial.starting;
    case "ready": {
      const hostPort = d.host && d.port ? ` (${d.host}:${d.port})` : "";
      return strings.dial.ready + hostPort;
    }
    case "degraded":
      return strings.dial.degraded + (d.message ? `: ${d.message}` : "");
    case "disabled":
      return strings.dial.disabled + (d.message ? `: ${d.message}` : "");
    default:
      return strings.dial.unknown;
  }
}

function renderDial(doc, strings, dial) {
  setText(doc, "dial-status", dialStateLabel(strings, dial));
}

function renderStaticLabels(doc, strings, data) {
  setText(doc, "page-title", strings.pageTitle);
  setText(doc, "intro-text", data.firstRun ? strings.introFirstRun : strings.introReturning);
  setText(doc, "network-heading", strings.network.heading);
  setText(doc, "win11-title", strings.network.win11Title);
  setText(doc, "win10-title", strings.network.win10Title);
  strings.network.win11Steps.forEach((text, i) => setText(doc, `win11-step-${i + 1}`, text));
  strings.network.win10Steps.forEach((text, i) => setText(doc, `win10-step-${i + 1}`, text));
  setText(doc, "open-network-settings-btn", strings.network.openSettingsBtn);
  setText(doc, "dial-heading", strings.dial.heading);
  setText(doc, "refresh-btn", strings.refresh);
  setText(doc, "dont-show-again-label", strings.dontShowAgain);
  setText(doc, "continue-btn", strings.continue);
}

function render(doc, strings, data) {
  renderStaticLabels(doc, strings, data);
  renderNetwork(doc, strings, data.network);
  renderDial(doc, strings, data.dial);
}

function renderNoTauri(doc, strings) {
  const main = byId(doc, "main-content");
  if (main) main.hidden = true;
  setHidden(doc, "state-no-tauri", false);
  setText(doc, "no-tauri-title", strings.noTauri.title);
  setText(doc, "no-tauri-body", strings.noTauri.body);
}

function showActionError(doc, message) {
  setText(doc, "action-error", message || "");
  setHidden(doc, "action-error", !message);
}

// ---------------------------------------------------------------------------
// Command wiring — each wired once; each reads the latest lang/data at
// click time so behaviour stays correct even if the page re-renders.
// ---------------------------------------------------------------------------

function wireRefresh(doc, win) {
  const btn = byId(doc, "refresh-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_SETUP__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    showActionError(doc, "");

    win.__TAURI__.core
      .invoke("setup_refresh")
      .then((result) => {
        const r = result || {};
        data.network = r.network;
        data.dial = r.dial;
        win.__LALIN_SETUP__ = data;
        renderNetwork(doc, strings, data.network);
        renderDial(doc, strings, data.dial);
      })
      .catch((err) => {
        showActionError(doc, strings.refreshErrorPrefix + stringifyError(err, strings));
      })
      .then(() => {
        btn.disabled = false;
      });
  });
}

function wireOpenNetworkSettings(doc, win) {
  const btn = byId(doc, "open-network-settings-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const data = win.__LALIN_SETUP__ || {};
    const strings = STRINGS[langOf(data)];

    btn.disabled = true;
    showActionError(doc, "");

    win.__TAURI__.core
      .invoke("setup_open_network_settings")
      .catch((err) => {
        showActionError(doc, strings.network.openSettingsErrorPrefix + stringifyError(err, strings));
      })
      .then(() => {
        btn.disabled = false;
      });
  });
}

function completeSetup(doc, win) {
  const state = getState(win);
  if (state.completing) return;

  const data = win.__LALIN_SETUP__ || {};
  const strings = STRINGS[langOf(data)];
  const checkbox = byId(doc, "dont-show-again");
  const dontShowAgain = !!(checkbox && checkbox.checked);

  state.completing = true;
  const continueBtn = byId(doc, "continue-btn");
  if (continueBtn) continueBtn.disabled = true;
  showActionError(doc, "");

  win.__TAURI__.core.invoke("setup_complete", { dontShowAgain }).catch((err) => {
    state.completing = false;
    if (continueBtn) continueBtn.disabled = false;
    showActionError(doc, strings.closeErrorPrefix + stringifyError(err, strings));
  });
}

function wireContinueAndEscape(doc, win) {
  const btn = byId(doc, "continue-btn");
  if (btn) btn.addEventListener("click", () => completeSetup(doc, win));
  doc.addEventListener("keydown", (event) => {
    if (!event || event.key !== "Escape") return;
    completeSetup(doc, win);
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function init(doc, win) {
  const data = (win && win.__LALIN_SETUP__) || {};
  const strings = STRINGS[langOf(data)];

  if (doc.documentElement) doc.documentElement.lang = langOf(data);

  if (!hasTauriApi(win)) {
    renderNoTauri(doc, strings);
    return;
  }

  const state = getState(win);
  if (!state.wired) {
    state.wired = true;
    wireRefresh(doc, win);
    wireOpenNetworkSettings(doc, win);
    wireContinueAndEscape(doc, win);
  }

  render(doc, strings, data);
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
