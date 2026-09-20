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
 *   };
 *
 * No inline <script>, no inline event handlers (on*=), no external
 * resources. This file is a plain classic script (no import/export) so it
 * can be loaded as-is in the browser and required as-is under plain Node
 * for the self-test below.
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

// ---------------------------------------------------------------------------
// DOM helpers (operate on a `doc` param so the self-test can pass a stub)
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

// ---------------------------------------------------------------------------
// Close / Escape wiring — shared across every state
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
    if (el) el.addEventListener("click", () => closeWindow(win));
  });
  doc.addEventListener("keydown", (event) => {
    if (event && event.key === "Escape") closeWindow(win);
  });
}

// ---------------------------------------------------------------------------
// Per-state rendering
// ---------------------------------------------------------------------------

function renderAvailable(doc, win, strings, data) {
  showOnly(doc, "state-available");
  setText(doc, "available-title", strings.available.title);

  const versionLabel = data.version ? `${strings.available.versionLabel} ${data.version}` : "";
  const pubDateSuffix = data.pubDate ? ` (${data.pubDate})` : "";
  setText(doc, "available-version", versionLabel + pubDateSuffix);

  setHidden(doc, "available-notes", !data.notes);
  setText(doc, "available-notes", data.notes || "");

  setHidden(doc, "install-error", true);
  setText(doc, "install-error", "");

  const installBtn = byId(doc, "install-btn");
  if (installBtn) {
    installBtn.disabled = false;
    installBtn.textContent = strings.available.install;
    installBtn.addEventListener("click", () => {
      installBtn.disabled = true;
      installBtn.textContent = strings.available.installing;
      setHidden(doc, "install-error", true);
      setText(doc, "install-error", "");

      win.__TAURI__.core.invoke("cast_update_install").catch((err) => {
        installBtn.disabled = false;
        installBtn.textContent = strings.available.retry;
        setText(doc, "install-error", strings.available.installErrorPrefix + stringifyError(err, strings));
        setHidden(doc, "install-error", false);
      });
    });
  }

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
  setText(doc, "error-body", data.message || strings.error.defaultBody);
  setText(doc, "close-btn-error", strings.error.close);
}

function renderNoTauri(doc, strings) {
  showOnly(doc, "state-no-tauri");
  setText(doc, "no-tauri-title", strings.noTauri.title);
  setText(doc, "no-tauri-body", strings.noTauri.body);
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
  const lang = data.lang === "th" ? "th" : "en";
  const strings = STRINGS[lang];

  if (doc.documentElement) doc.documentElement.lang = lang;
  setText(doc, "app-title", strings.appTitle);

  if (!hasTauriApi(win)) {
    renderNoTauri(doc, strings);
    return;
  }

  wireCloseAndEscape(doc, win);

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
      renderError(doc, strings, { message: strings.error.unknownState });
      break;
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

// ---------------------------------------------------------------------------
// Self-test — only runs when globalThis.__LALIN_TEST__ is truthy. Exercises
// all three contract states (plus the no-Tauri fallback) against a minimal
// hand-rolled DOM stub, with no external test framework or dependency.
//
// Run with:
//   node -e "globalThis.__LALIN_TEST__=true;require('./update.js')"
// ---------------------------------------------------------------------------

function createStubDom() {
  const elements = {};

  const makeElement = (id) => {
    const listeners = {};
    return {
      id,
      textContent: "",
      hidden: false,
      disabled: false,
      addEventListener(type, handler) {
        (listeners[type] = listeners[type] || []).push(handler);
      },
      dispatch(type, evt) {
        (listeners[type] || []).forEach((handler) => handler(evt || {}));
      },
    };
  };

  const ids = [
    "app-title",
    "state-available",
    "available-title",
    "available-version",
    "available-notes",
    "install-error",
    "install-btn",
    "later-btn",
    "state-uptodate",
    "uptodate-title",
    "uptodate-body",
    "close-btn-uptodate",
    "state-error",
    "error-title",
    "error-body",
    "close-btn-error",
    "state-no-tauri",
    "no-tauri-title",
    "no-tauri-body",
  ];
  ids.forEach((id) => {
    elements[id] = makeElement(id);
  });

  const docListeners = {};
  const doc = {
    documentElement: { lang: "" },
    getElementById: (id) => elements[id] || null,
    addEventListener(type, handler) {
      (docListeners[type] = docListeners[type] || []).push(handler);
    },
    dispatch(type, evt) {
      (docListeners[type] || []).forEach((handler) => handler(evt || {}));
    },
  };

  return { doc, elements };
}

function makeTauriStub(overrides) {
  const closeCalls = { count: 0 };
  const invokeCalls = [];
  const stub = {
    core: {
      invoke(cmd) {
        invokeCalls.push(cmd);
        return (overrides && overrides.invokeResult) || Promise.resolve();
      },
    },
    window: {
      getCurrentWindow: () => ({
        close: () => {
          closeCalls.count += 1;
        },
      }),
    },
  };
  return { tauri: stub, closeCalls, invokeCalls };
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function runSelfTest() {
  // Only ever reached when globalThis.__LALIN_TEST__ is set, i.e. under a
  // plain Node CommonJS run — never in the browser bundle path.
  const assert = require("assert");

  const results = [];

  function test(name, fn) {
    const run = Promise.resolve()
      .then(fn)
      .then(() => {
        results.push({ name, ok: true });
        console.log(`ok - ${name}`);
      })
      .catch((err) => {
        results.push({ name, ok: false, err });
        console.log(`not ok - ${name} -- ${err && err.message ? err.message : err}`);
      });
    return run;
  }

  const pending = [];

  pending.push(
    test("available state shows only the available section and fills in version/notes", () => {
      const { doc, elements } = createStubDom();
      const { tauri } = makeTauriStub();
      const win = {
        __LALIN_UPDATE__: {
          lang: "en",
          state: "available",
          version: "0.2.0",
          notes: "Bug fixes",
          pubDate: "2026-09-18",
        },
        __TAURI__: tauri,
      };
      init(doc, win);
      assert.strictEqual(elements["state-available"].hidden, false);
      assert.strictEqual(elements["state-uptodate"].hidden, true);
      assert.strictEqual(elements["state-error"].hidden, true);
      assert.strictEqual(elements["state-no-tauri"].hidden, true);
      assert.ok(elements["install-btn"].textContent.length > 0);
      assert.ok(elements["available-version"].textContent.includes("0.2.0"));
      assert.strictEqual(elements["available-notes"].hidden, false);
    }),
  );

  pending.push(
    test("install click invokes cast_update_install and disables the button while installing", () => {
      const { doc, elements } = createStubDom();
      const { tauri, invokeCalls } = makeTauriStub({ invokeResult: new Promise(() => {}) });
      const win = {
        __LALIN_UPDATE__: { lang: "th", state: "available", version: "0.2.0" },
        __TAURI__: tauri,
      };
      init(doc, win);
      elements["install-btn"].dispatch("click");
      assert.deepStrictEqual(invokeCalls, ["cast_update_install"]);
      assert.strictEqual(elements["install-btn"].disabled, true);
    }),
  );

  pending.push(
    test("install failure re-enables the button and shows the error message", async () => {
      const { doc, elements } = createStubDom();
      const { tauri } = makeTauriStub({ invokeResult: Promise.reject(new Error("network down")) });
      const win = {
        __LALIN_UPDATE__: { lang: "en", state: "available" },
        __TAURI__: tauri,
      };
      init(doc, win);
      elements["install-btn"].dispatch("click");
      await nextTick();
      assert.strictEqual(elements["install-btn"].disabled, false);
      assert.strictEqual(elements["install-error"].hidden, false);
      assert.ok(elements["install-error"].textContent.includes("network down"));
    }),
  );

  pending.push(
    test("upToDate state shows only that section", () => {
      const { doc, elements } = createStubDom();
      const { tauri } = makeTauriStub();
      const win = {
        __LALIN_UPDATE__: { lang: "en", state: "upToDate" },
        __TAURI__: tauri,
      };
      init(doc, win);
      assert.strictEqual(elements["state-uptodate"].hidden, false);
      assert.strictEqual(elements["state-available"].hidden, true);
      assert.strictEqual(elements["state-error"].hidden, true);
      assert.ok(elements["uptodate-body"].textContent.length > 0);
    }),
  );

  pending.push(
    test("error state shows only that section with the provided message", () => {
      const { doc, elements } = createStubDom();
      const { tauri } = makeTauriStub();
      const win = {
        __LALIN_UPDATE__: { lang: "en", state: "error", message: "boom" },
        __TAURI__: tauri,
      };
      init(doc, win);
      assert.strictEqual(elements["state-error"].hidden, false);
      assert.strictEqual(elements["state-available"].hidden, true);
      assert.strictEqual(elements["state-uptodate"].hidden, true);
      assert.strictEqual(elements["error-body"].textContent, "boom");
    }),
  );

  pending.push(
    test("missing Tauri API shows the fallback state and no other section", () => {
      const { doc, elements } = createStubDom();
      const win = { __LALIN_UPDATE__: { lang: "en", state: "available" } };
      init(doc, win);
      assert.strictEqual(elements["state-no-tauri"].hidden, false);
      assert.strictEqual(elements["state-available"].hidden, true);
      assert.ok(elements["no-tauri-body"].textContent.length > 0);
    }),
  );

  pending.push(
    test("Later button and Escape both close the window", () => {
      const { doc, elements } = createStubDom();
      const { tauri, closeCalls } = makeTauriStub();
      const win = {
        __LALIN_UPDATE__: { lang: "en", state: "upToDate" },
        __TAURI__: tauri,
      };
      init(doc, win);
      elements["close-btn-uptodate"].dispatch("click");
      doc.dispatch("keydown", { key: "Escape" });
      assert.strictEqual(closeCalls.count, 2);
    }),
  );

  Promise.all(pending).then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`${results.length - failed.length}/${results.length} self-tests passed`);
    if (failed.length > 0) {
      console.error(`FAILED: ${failed.map((r) => r.name).join(", ")}`);
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  });
}

if (typeof globalThis !== "undefined" && globalThis.__LALIN_TEST__) {
  runSelfTest();
} else {
  boot();
}
