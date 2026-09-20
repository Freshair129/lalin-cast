"use strict";

/*
 * Node-only self-test for fallback/setup.js. No test framework, no
 * external dependencies beyond Node's built-in `assert`. Run with:
 *
 *   node fallback/setup.test.js
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

const assert = require("assert");
const { init } = require("./setup.js");

// ---------------------------------------------------------------------------
// Minimal stub DOM
// ---------------------------------------------------------------------------

function makeElement(id) {
  const listeners = {};
  const attrs = {};
  return {
    id,
    textContent: "",
    hidden: false,
    disabled: false,
    checked: false,
    addEventListener(type, handler) {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    dispatch(type, evt) {
      (listeners[type] || []).forEach((handler) => handler(evt || {}));
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
  };
}

function createStubDom() {
  const elements = {};
  const ids = [
    "main-content",
    "page-title",
    "intro-text",
    "network-heading",
    "network-status",
    "network-detail",
    "network-steps",
    "win11-title",
    "win11-step-1",
    "win11-step-2",
    "win11-step-3",
    "win11-step-4",
    "win10-title",
    "win10-step-1",
    "win10-step-2",
    "win10-step-3",
    "win10-step-4",
    "open-network-settings-btn",
    "dial-heading",
    "dial-status",
    "action-error",
    "refresh-btn",
    "dont-show-again",
    "dont-show-again-label",
    "continue-btn",
    "state-no-tauri",
    "no-tauri-title",
    "no-tauri-body",
  ];
  ids.forEach((id) => {
    elements[id] = makeElement(id);
  });
  // Match the `hidden` attribute setup.html ships with statically, so the
  // stub starts from the same visibility as a freshly loaded real page.
  ["network-detail", "network-steps", "action-error", "state-no-tauri"].forEach((id) => {
    elements[id].hidden = true;
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
  const invokeCalls = [];
  const stub = {
    core: {
      invoke(cmd, args) {
        invokeCalls.push({ cmd, args });
        const handler = overrides && overrides[cmd];
        if (typeof handler === "function") return handler(args);
        return Promise.resolve();
      },
    },
    window: {
      getCurrentWindow: () => ({ close: () => {} }),
    },
  };
  return { tauri: stub, invokeCalls };
}

function baseSetupData(overrides) {
  return Object.assign(
    {
      lang: "en",
      firstRun: true,
      network: { category: "Public", interface: "Wi-Fi" },
      dial: { state: "ready", host: "192.168.1.100", port: 51234, message: null },
    },
    overrides,
  );
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
  test("renders network + DIAL status and shows Windows steps when Public", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    assert.ok(elements["page-title"].textContent.length > 0);
    assert.ok(elements["network-status"].textContent.includes("Public"));
    assert.strictEqual(elements["network-status"].getAttribute("data-level"), "warn");
    assert.strictEqual(elements["network-steps"].hidden, false);
    assert.ok(elements["win11-step-1"].textContent.length > 0);
    assert.ok(elements["win10-step-1"].textContent.length > 0);
    assert.ok(elements["dial-status"].textContent.includes("192.168.1.100:51234"));
    assert.strictEqual(elements["state-no-tauri"].hidden, true);
  }),
);

pending.push(
  test("Private network hides the Windows steps and shows a green status", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = {
      __LALIN_SETUP__: baseSetupData({ network: { category: "Private", interface: "Ethernet" } }),
      __TAURI__: tauri,
    };
    init(doc, win);
    assert.strictEqual(elements["network-steps"].hidden, true);
    assert.strictEqual(elements["network-status"].getAttribute("data-level"), "good");
    assert.ok(elements["network-detail"].textContent.includes("Ethernet"));
    assert.strictEqual(elements["network-detail"].hidden, false);
  }),
);

pending.push(
  test("DomainAuthenticated and Unknown categories render without steps or a crash", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win1 = {
      __LALIN_SETUP__: baseSetupData({ network: { category: "DomainAuthenticated", interface: null } }),
      __TAURI__: tauri,
    };
    init(doc, win1);
    assert.strictEqual(elements["network-steps"].hidden, true);
    assert.strictEqual(elements["network-status"].getAttribute("data-level"), "info");
    assert.strictEqual(elements["network-detail"].hidden, true);

    const { doc: doc2, elements: el2 } = createStubDom();
    const win2 = {
      __LALIN_SETUP__: baseSetupData({ network: { category: "Unknown", interface: null } }),
      __TAURI__: tauri,
    };
    init(doc2, win2);
    assert.strictEqual(el2["network-steps"].hidden, true);
    assert.strictEqual(el2["network-status"].getAttribute("data-level"), "unknown");
  }),
);

pending.push(
  test("an unrecognized network category falls back to the Unknown label", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = {
      __LALIN_SETUP__: baseSetupData({ network: { category: "SomethingNew", interface: null } }),
      __TAURI__: tauri,
    };
    init(doc, win);
    assert.strictEqual(elements["network-status"].getAttribute("data-level"), "unknown");
  }),
);

["starting", "degraded", "disabled"].forEach((dialState) => {
  pending.push(
    test(`DIAL state '${dialState}' renders a non-empty status line`, () => {
      const { doc, elements } = createStubDom();
      const { tauri } = makeTauriStub();
      const win = {
        __LALIN_SETUP__: baseSetupData({ dial: { state: dialState, host: null, port: null, message: "reason" } }),
        __TAURI__: tauri,
      };
      init(doc, win);
      assert.ok(elements["dial-status"].textContent.length > 0);
      if (dialState !== "starting") {
        assert.ok(elements["dial-status"].textContent.includes("reason"));
      }
    }),
  );
});

pending.push(
  test("refresh button calls setup_refresh and re-renders with the new network/dial", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      setup_refresh: () =>
        Promise.resolve({
          network: { category: "Private", interface: "Wi-Fi" },
          dial: { state: "ready", host: "10.0.0.5", port: 9999, message: null },
        }),
    });
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["refresh-btn"].dispatch("click");
    await nextTick();
    assert.deepStrictEqual(
      invokeCalls.map((c) => c.cmd),
      ["setup_refresh"],
    );
    assert.strictEqual(elements["network-steps"].hidden, true);
    assert.ok(elements["dial-status"].textContent.includes("10.0.0.5:9999"));
    assert.strictEqual(elements["refresh-btn"].disabled, false);
  }),
);

pending.push(
  test("refresh failure shows an error and re-enables the button", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ setup_refresh: () => Promise.reject(new Error("timed out")) });
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["refresh-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["action-error"].hidden, false);
    assert.ok(elements["action-error"].textContent.includes("timed out"));
    assert.strictEqual(elements["refresh-btn"].disabled, false);
  }),
);

pending.push(
  test("open-network-settings button invokes setup_open_network_settings with no args", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["open-network-settings-btn"].dispatch("click");
    assert.strictEqual(invokeCalls.length, 1);
    assert.strictEqual(invokeCalls[0].cmd, "setup_open_network_settings");
    assert.strictEqual(invokeCalls[0].args, undefined);
  }),
);

pending.push(
  test("open-network-settings failure shows an error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      setup_open_network_settings: () => Promise.reject(new Error("no handler")),
    });
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["open-network-settings-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["action-error"].hidden, false);
    assert.ok(elements["action-error"].textContent.includes("no handler"));
  }),
);

pending.push(
  test("continue button invokes setup_complete with the checkbox value", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["dont-show-again"].checked = true;
    elements["continue-btn"].dispatch("click");
    assert.strictEqual(invokeCalls.length, 1);
    assert.strictEqual(invokeCalls[0].cmd, "setup_complete");
    assert.deepStrictEqual(invokeCalls[0].args, { dontShowAgain: true });
  }),
);

pending.push(
  test("Escape triggers the same setup_complete flow as Continue, using the checkbox value", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["dont-show-again"].checked = false;
    doc.dispatch("keydown", { key: "Escape" });
    assert.strictEqual(invokeCalls.length, 1);
    assert.strictEqual(invokeCalls[0].cmd, "setup_complete");
    assert.deepStrictEqual(invokeCalls[0].args, { dontShowAgain: false });
  }),
);

pending.push(
  test("setup_complete is not re-invoked while a previous call is still pending", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ setup_complete: () => new Promise(() => {}) });
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["continue-btn"].dispatch("click");
    doc.dispatch("keydown", { key: "Escape" });
    elements["continue-btn"].dispatch("click");
    assert.strictEqual(invokeCalls.length, 1);
    assert.strictEqual(elements["continue-btn"].disabled, true);
  }),
);

pending.push(
  test("setup_complete failure re-enables Continue and shows an error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ setup_complete: () => Promise.reject(new Error("busy")) });
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    elements["continue-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["continue-btn"].disabled, false);
    assert.strictEqual(elements["action-error"].hidden, false);
    assert.ok(elements["action-error"].textContent.includes("busy"));
  }),
);

pending.push(
  test("missing Tauri API shows the fallback state and hides the main content", () => {
    const { doc, elements } = createStubDom();
    const win = { __LALIN_SETUP__: baseSetupData() };
    init(doc, win);
    assert.strictEqual(elements["state-no-tauri"].hidden, false);
    assert.strictEqual(elements["main-content"].hidden, true);
    assert.ok(elements["no-tauri-body"].textContent.length > 0);
  }),
);

pending.push(
  test("returning (non-firstRun) visit uses the returning intro copy", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETUP__: baseSetupData({ firstRun: false }), __TAURI__: tauri };
    init(doc, win);
    assert.ok(elements["intro-text"].textContent.length > 0);
  }),
);

pending.push(
  test("repeated init() calls do not double-bind the refresh listener", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = { __LALIN_SETUP__: baseSetupData(), __TAURI__: tauri };
    init(doc, win);
    init(doc, win);
    elements["refresh-btn"].dispatch("click");
    assert.strictEqual(invokeCalls.filter((c) => c.cmd === "setup_refresh").length, 1);
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
