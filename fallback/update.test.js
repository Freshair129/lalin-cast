"use strict";

/*
 * Node-only self-test for fallback/update.js. No test framework, no
 * external dependencies beyond Node's built-in `assert`. Run with:
 *
 *   node fallback/update.test.js
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

const assert = require("assert");
const { init } = require("./update.js");

// Must match strings.en.error.defaultBody in update.js.
const STRINGS_EN_ERROR_BODY = "Could not check for updates right now. Please try again later.";

// ---------------------------------------------------------------------------
// Minimal stub DOM
// ---------------------------------------------------------------------------

function makeElement(id) {
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
}

function createStubDom() {
  const elements = {};
  const ids = [
    "app-title",
    "state-available",
    "available-title",
    "available-version",
    "available-notes",
    "install-error",
    "portable-install-notice",
    "install-btn",
    "later-btn",
    "state-uptodate",
    "uptodate-title",
    "uptodate-body",
    "close-btn-uptodate",
    "state-error",
    "error-title",
    "error-body",
    "error-detail",
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

// A stub `window` that supports the `lalin-update` CustomEvent contract
// (addEventListener/dispatchEvent-by-type) on top of the update payload.
function makeWindowStub(initialData, tauri) {
  const listeners = {};
  return {
    __LALIN_UPDATE__: initialData,
    __TAURI__: tauri,
    addEventListener(type, handler) {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    dispatch(type, evt) {
      (listeners[type] || []).forEach((handler) => handler(evt || {}));
    },
  };
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const results = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ name, ok: true });
      console.log(`ok - ${name}`);
    })
    .catch((err) => {
      results.push({ name, ok: false, err });
      console.log(`not ok - ${name} -- ${err && err.message ? err.message : err}`);
    });
}

const pending = [];

pending.push(
  test("available state shows only the available section and fills in version/notes", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub(
      { lang: "en", state: "available", version: "0.2.0", notes: "Bug fixes", pubDate: "2026-09-18" },
      tauri,
    );
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
  test("install click invokes cast_update_install and disables install + later while installing", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ invokeResult: new Promise(() => {}) });
    const win = makeWindowStub({ lang: "th", state: "available", version: "0.2.0" }, tauri);
    init(doc, win);
    elements["install-btn"].dispatch("click");
    assert.deepStrictEqual(invokeCalls, ["cast_update_install"]);
    assert.strictEqual(elements["install-btn"].disabled, true);
    assert.strictEqual(elements["later-btn"].disabled, true);
  }),
);

pending.push(
  test("install failure re-enables install + later and shows the error message", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ invokeResult: Promise.reject(new Error("network down")) });
    const win = makeWindowStub({ lang: "en", state: "available" }, tauri);
    init(doc, win);
    elements["install-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["install-btn"].disabled, false);
    assert.strictEqual(elements["later-btn"].disabled, false);
    assert.strictEqual(elements["install-error"].hidden, false);
    assert.ok(elements["install-error"].textContent.includes("network down"));
  }),
);

pending.push(
  test("Escape and Later are ignored while an install is in flight", () => {
    const { doc, elements } = createStubDom();
    const { tauri, closeCalls } = makeTauriStub({ invokeResult: new Promise(() => {}) });
    const win = makeWindowStub({ lang: "en", state: "available" }, tauri);
    init(doc, win);
    elements["install-btn"].dispatch("click");
    elements["later-btn"].dispatch("click");
    doc.dispatch("keydown", { key: "Escape" });
    assert.strictEqual(closeCalls.count, 0);
  }),
);

pending.push(
  test("upToDate state shows only that section", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "upToDate" }, tauri);
    init(doc, win);
    assert.strictEqual(elements["state-uptodate"].hidden, false);
    assert.strictEqual(elements["state-available"].hidden, true);
    assert.strictEqual(elements["state-error"].hidden, true);
    assert.ok(elements["uptodate-body"].textContent.length > 0);
  }),
);

pending.push(
  test("error state shows only that section, translated body, raw error as detail", () => {
    // Regression (H2/M5): the raw message used to replace the translated body,
    // so users only ever saw English technical text like
    // "Could not fetch a valid release JSON from the remote".
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "error", message: "boom" }, tauri);
    init(doc, win);
    assert.strictEqual(elements["state-error"].hidden, false);
    assert.strictEqual(elements["state-available"].hidden, true);
    assert.strictEqual(elements["state-uptodate"].hidden, true);
    assert.strictEqual(elements["error-body"].textContent, STRINGS_EN_ERROR_BODY);
    assert.strictEqual(elements["error-detail"].textContent, "boom");
    assert.strictEqual(elements["error-detail"].hidden, false);
  }),
);

pending.push(
  test("error state in Thai shows the Thai body, not the English library text", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub(
      { lang: "th", state: "error", message: "Could not fetch a valid release JSON from the remote" },
      tauri,
    );
    init(doc, win);
    assert.ok(
      /[฀-๿]/.test(elements["error-body"].textContent),
      "the body is Thai text, not the library's English message",
    );
    assert.ok(!elements["error-body"].textContent.includes("release JSON"));
    assert.ok(elements["error-detail"].textContent.includes("release JSON"));
  }),
);

pending.push(
  test("error state with no message hides the detail line entirely", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "error" }, tauri);
    init(doc, win);
    assert.strictEqual(elements["error-body"].textContent, STRINGS_EN_ERROR_BODY);
    assert.strictEqual(elements["error-detail"].hidden, true);
    assert.strictEqual(elements["error-detail"].textContent, "");
  }),
);

pending.push(
  test("error state with a blank message hides the detail line", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "error", message: "   " }, tauri);
    init(doc, win);
    assert.strictEqual(elements["error-detail"].hidden, true);
  }),
);

pending.push(
  test("unknown state falls back to the error section with the unknown-state message", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "something-unexpected" }, tauri);
    init(doc, win);
    assert.strictEqual(elements["state-error"].hidden, false);
    assert.ok(elements["error-body"].textContent.length > 0);
    // The unknown-state text is already translated, so it is the body and
    // there is no raw error to show underneath.
    assert.strictEqual(elements["error-detail"].hidden, true);
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
  test("Later button and Escape both close the window when not installing", () => {
    const { doc, elements } = createStubDom();
    const { tauri, closeCalls } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "upToDate" }, tauri);
    init(doc, win);
    elements["close-btn-uptodate"].dispatch("click");
    doc.dispatch("keydown", { key: "Escape" });
    assert.strictEqual(closeCalls.count, 2);
  }),
);

pending.push(
  test("lalin-update event re-renders the page with the new state", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "available", version: "0.2.0" }, tauri);
    init(doc, win);
    assert.strictEqual(elements["state-available"].hidden, false);

    win.__LALIN_UPDATE__ = { lang: "en", state: "upToDate" };
    win.dispatch("lalin-update");

    assert.strictEqual(elements["state-uptodate"].hidden, false);
    assert.strictEqual(elements["state-available"].hidden, true);
  }),
);

pending.push(
  test("lalin-update event is ignored while an install is in flight", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ invokeResult: new Promise(() => {}) });
    const win = makeWindowStub({ lang: "en", state: "available", version: "0.2.0" }, tauri);
    init(doc, win);
    elements["install-btn"].dispatch("click");
    assert.strictEqual(elements["install-btn"].disabled, true);

    win.__LALIN_UPDATE__ = { lang: "en", state: "upToDate" };
    win.dispatch("lalin-update");

    // Still showing the in-progress available/installing UI, not upToDate.
    assert.strictEqual(elements["state-available"].hidden, false);
    assert.strictEqual(elements["state-uptodate"].hidden, true);
    assert.strictEqual(elements["install-btn"].disabled, true);
  }),
);

pending.push(
  test("install button click handler is not double-bound across repeated init() calls", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ invokeResult: new Promise(() => {}) });
    const win = makeWindowStub({ lang: "en", state: "available" }, tauri);
    init(doc, win);
    init(doc, win); // same win: must not re-wire listeners
    elements["install-btn"].dispatch("click");
    assert.deepStrictEqual(invokeCalls, ["cast_update_install"]);
  }),
);

// ---------------------------------------------------------------------------
// Wave 11: portable mode disables the install button (contract 5).
// ---------------------------------------------------------------------------

pending.push(
  test("portable: true disables the install button and shows the portable instruction", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "available", version: "0.2.0", portable: true }, tauri);
    init(doc, win);

    assert.strictEqual(elements["install-btn"].disabled, true);
    assert.strictEqual(elements["portable-install-notice"].hidden, false);
    assert.ok(elements["portable-install-notice"].textContent.length > 0);
  }),
);

pending.push(
  test("portable: false leaves the install button and instruction exactly as before", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "available", version: "0.2.0", portable: false }, tauri);
    init(doc, win);

    assert.strictEqual(elements["install-btn"].disabled, false);
    assert.strictEqual(elements["portable-install-notice"].hidden, true);
  }),
);

pending.push(
  test("a missing portable field (older payload shape) is treated as false", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "available", version: "0.2.0" }, tauri);
    init(doc, win);

    assert.strictEqual(elements["install-btn"].disabled, false);
    assert.strictEqual(elements["portable-install-notice"].hidden, true);
  }),
);

pending.push(
  test("clicking install while portable never invokes cast_update_install, even if disabled was bypassed", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = makeWindowStub({ lang: "en", state: "available", version: "0.2.0", portable: true }, tauri);
    init(doc, win);

    elements["install-btn"].disabled = false; // simulate a bypass; the handler must still refuse
    elements["install-btn"].dispatch("click");

    assert.deepStrictEqual(invokeCalls, []);
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
