"use strict";

/*
 * Node-only self-test for fallback/status.js. No test framework, no
 * external dependencies beyond Node's built-in `assert`. Run with:
 *
 *   node fallback/status.test.js
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

const assert = require("assert");
const { init } = require("./status.js");

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
    "main-content",
    "page-title",
    "status-message",
    "retry-result",
    "retry-error",
    "retry-btn",
    "quit-btn",
    "state-no-tauri",
    "no-tauri-title",
    "no-tauri-body",
  ];
  ids.forEach((id) => {
    elements[id] = makeElement(id);
  });
  // Match the `hidden` attribute status.html ships with statically.
  ["retry-result", "retry-error", "state-no-tauri"].forEach((id) => {
    elements[id].hidden = true;
  });

  const doc = {
    documentElement: { lang: "" },
    getElementById: (id) => elements[id] || null,
    addEventListener() {},
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
  };
  return { tauri: stub, invokeCalls };
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
  test("offline state renders a title and body with Retry/Quit buttons", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    assert.ok(elements["page-title"].textContent.length > 0);
    assert.ok(elements["status-message"].textContent.length > 0);
    assert.ok(elements["retry-btn"].textContent.length > 0);
    assert.ok(elements["quit-btn"].textContent.length > 0);
    assert.strictEqual(elements["state-no-tauri"].hidden, true);
  }),
);

pending.push(
  test("blockedSurface state renders a distinct title/body", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_STATUS__: { lang: "en", state: "blockedSurface" }, __TAURI__: tauri };
    init(doc, win);
    assert.ok(elements["page-title"].textContent.toLowerCase().includes("youtube"));
  }),
);

pending.push(
  test("a host-provided message overrides the bundled default body", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = {
      __LALIN_STATUS__: { lang: "th", state: "blockedSurface", message: "ข้อความจาก Rust" },
      __TAURI__: tauri,
    };
    init(doc, win);
    assert.strictEqual(elements["status-message"].textContent, "ข้อความจาก Rust");
  }),
);

pending.push(
  test("an unrecognized state falls back to the unknown-state copy without crashing", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_STATUS__: { lang: "en", state: "somethingElse" }, __TAURI__: tauri };
    init(doc, win);
    assert.ok(elements["page-title"].textContent.length > 0);
    assert.ok(elements["status-message"].textContent.length > 0);
  }),
);

pending.push(
  test("Retry click invokes status_retry and clears the button state on ok:true", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ status_retry: () => Promise.resolve({ ok: true }) });
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    elements["retry-btn"].dispatch("click");
    assert.strictEqual(elements["retry-btn"].disabled, true);
    await nextTick();
    assert.deepStrictEqual(
      invokeCalls.map((c) => c.cmd),
      ["status_retry"],
    );
    assert.strictEqual(elements["retry-btn"].disabled, false);
    assert.strictEqual(elements["retry-result"].hidden, true);
    assert.strictEqual(elements["retry-error"].hidden, true);
  }),
);

pending.push(
  test("Retry click with ok:false shows the returned message and re-enables the button", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      status_retry: () => Promise.resolve({ ok: false, message: "ยังออฟไลน์" }),
    });
    const win = { __LALIN_STATUS__: { lang: "th", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    elements["retry-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["retry-btn"].disabled, false);
    assert.strictEqual(elements["retry-result"].hidden, false);
    assert.ok(elements["retry-result"].textContent.includes("ยังออฟไลน์"));
  }),
);

pending.push(
  test("Retry click rejection shows an error and re-enables the button", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ status_retry: () => Promise.reject(new Error("ipc down")) });
    const win = { __LALIN_STATUS__: { lang: "en", state: "blockedSurface" }, __TAURI__: tauri };
    init(doc, win);
    elements["retry-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["retry-btn"].disabled, false);
    assert.strictEqual(elements["retry-error"].hidden, false);
    assert.ok(elements["retry-error"].textContent.includes("ipc down"));
  }),
);

pending.push(
  test("Quit click invokes status_quit and disables the button while pending", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ status_quit: () => new Promise(() => {}) });
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    elements["quit-btn"].dispatch("click");
    assert.deepStrictEqual(
      invokeCalls.map((c) => c.cmd),
      ["status_quit"],
    );
    assert.strictEqual(elements["quit-btn"].disabled, true);
  }),
);

pending.push(
  test("Quit click rejection re-enables the button and shows an error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ status_quit: () => Promise.reject(new Error("exit blocked")) });
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    elements["quit-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["quit-btn"].disabled, false);
    assert.strictEqual(elements["retry-error"].hidden, false);
    assert.ok(elements["retry-error"].textContent.includes("exit blocked"));
  }),
);

pending.push(
  test("missing Tauri API shows the fallback state and hides the main content", () => {
    const { doc, elements } = createStubDom();
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" } };
    init(doc, win);
    assert.strictEqual(elements["state-no-tauri"].hidden, false);
    assert.strictEqual(elements["main-content"].hidden, true);
    assert.ok(elements["no-tauri-body"].textContent.length > 0);
  }),
);

pending.push(
  test("repeated init() calls do not double-bind the retry listener", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ status_retry: () => new Promise(() => {}) });
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    init(doc, win);
    elements["retry-btn"].dispatch("click");
    assert.strictEqual(invokeCalls.filter((c) => c.cmd === "status_retry").length, 1);
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
