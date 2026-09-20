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
    "auto-retry-line",
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
  ["auto-retry-line", "retry-result", "retry-error", "state-no-tauri"].forEach((id) => {
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

function makeFakeTimers() {
  const timers = [];
  let nextId = 1;
  return {
    setInterval(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearInterval(id) {
      const idx = timers.findIndex((t) => t.id === id);
      if (idx !== -1) timers.splice(idx, 1);
    },
    timers,
  };
}

// A minimal stand-in for `window.__TAURI__.event`: `listen` records the
// handler per event name (Tauri's real API resolves to an unlisten
// function, which nothing here needs), and `emit` invokes every recorded
// handler with `{ payload }`, exactly like a real Tauri event delivery.
function makeEventApi() {
  const listeners = {};
  return {
    listen(name, handler) {
      (listeners[name] = listeners[name] || []).push(handler);
      return Promise.resolve(() => {});
    },
    emit(name, payload) {
      (listeners[name] || []).forEach((handler) => handler({ payload }));
    },
    listenerCount(name) {
      return (listeners[name] || []).length;
    },
  };
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

// ---------------------------------------------------------------------------
// Auto-retry indicator (#auto-retry-line): subscribes to
// `lalin-cast-status-retry` via win.__TAURI__.event.listen only for state
// "offline", renders every phase, ticks a local countdown for "waiting"
// with win.setInterval (cleared on every new event / on "stopped"), never
// appears for blockedSurface, and never crashes without the event API.
// ---------------------------------------------------------------------------

pending.push(
  test("offline state with the event API subscribes to lalin-cast-status-retry exactly once", () => {
    const { doc } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);
    init(doc, win); // repeated init() must not double-subscribe
    assert.strictEqual(eventApi.listenerCount("lalin-cast-status-retry"), 1);
  }),
);

pending.push(
  test("phase 'waiting' shows the bilingual countdown text with attempt and seconds", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);

    eventApi.emit("lalin-cast-status-retry", { attempt: 2, nextInSeconds: 5, phase: "waiting" });

    assert.strictEqual(elements["auto-retry-line"].hidden, false);
    assert.ok(elements["auto-retry-line"].textContent.includes("Retrying automatically in 5 s (attempt 2)"));
    assert.ok(elements["auto-retry-line"].textContent.includes("จะลองใหม่อัตโนมัติใน 5 วินาที (ครั้งที่ 2)"));
  }),
);

pending.push(
  test("phase 'probing' shows the bilingual retrying text", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);

    eventApi.emit("lalin-cast-status-retry", { attempt: 3, nextInSeconds: null, phase: "probing" });

    assert.strictEqual(elements["auto-retry-line"].hidden, false);
    assert.ok(elements["auto-retry-line"].textContent.includes("Retrying…"));
    assert.ok(elements["auto-retry-line"].textContent.includes("กำลังลองใหม่…"));
  }),
);

pending.push(
  test("phase 'stopped' shows the bilingual stopped text", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    init(doc, win);

    eventApi.emit("lalin-cast-status-retry", { attempt: 5, nextInSeconds: null, phase: "stopped" });

    assert.strictEqual(elements["auto-retry-line"].hidden, false);
    assert.ok(elements["auto-retry-line"].textContent.includes("Auto-retry stopped — press Retry"));
    assert.ok(elements["auto-retry-line"].textContent.includes("หยุดลองใหม่อัตโนมัติแล้ว"));
  }),
);

pending.push(
  test("the 'waiting' countdown ticks down once per second via win.setInterval and stops at zero", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const fake = makeFakeTimers();
    const win = {
      __LALIN_STATUS__: { lang: "en", state: "offline" },
      __TAURI__: tauri,
      setInterval: fake.setInterval,
      clearInterval: fake.clearInterval,
    };
    init(doc, win);

    eventApi.emit("lalin-cast-status-retry", { attempt: 1, nextInSeconds: 2, phase: "waiting" });
    assert.ok(elements["auto-retry-line"].textContent.includes("in 2 s"));
    assert.strictEqual(fake.timers.length, 1);
    assert.strictEqual(fake.timers[0].ms, 1000);

    fake.timers[0].fn();
    assert.ok(elements["auto-retry-line"].textContent.includes("in 1 s"));
    assert.strictEqual(fake.timers.length, 1, "still ticking");

    fake.timers[0].fn();
    assert.ok(elements["auto-retry-line"].textContent.includes("in 0 s"));
    assert.strictEqual(fake.timers.length, 0, "cleared itself once it reaches zero");
  }),
);

pending.push(
  test("a new event clears any running countdown timer before starting the next one", () => {
    const { doc } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const fake = makeFakeTimers();
    const win = {
      __LALIN_STATUS__: { lang: "en", state: "offline" },
      __TAURI__: tauri,
      setInterval: fake.setInterval,
      clearInterval: fake.clearInterval,
    };
    init(doc, win);

    eventApi.emit("lalin-cast-status-retry", { attempt: 1, nextInSeconds: 30, phase: "waiting" });
    const firstTimerId = fake.timers[0].id;
    assert.strictEqual(fake.timers.length, 1);

    eventApi.emit("lalin-cast-status-retry", { attempt: 2, nextInSeconds: 10, phase: "waiting" });
    assert.strictEqual(fake.timers.length, 1, "old timer cleared, exactly one new timer running");
    assert.notStrictEqual(fake.timers[0].id, firstTimerId);

    eventApi.emit("lalin-cast-status-retry", { attempt: 2, nextInSeconds: null, phase: "stopped" });
    assert.strictEqual(fake.timers.length, 0, "stopped clears the timer and starts no new one");
  }),
);

pending.push(
  test("blockedSurface never subscribes to the retry event and the line stays hidden", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const eventApi = makeEventApi();
    tauri.event = eventApi;
    const win = { __LALIN_STATUS__: { lang: "en", state: "blockedSurface" }, __TAURI__: tauri };
    init(doc, win);

    assert.strictEqual(eventApi.listenerCount("lalin-cast-status-retry"), 0);
    assert.strictEqual(elements["auto-retry-line"].hidden, true);
  }),
);

pending.push(
  test("offline state without an event API does not crash and never shows the line", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub(); // no `.event` at all
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    assert.doesNotThrow(() => init(doc, win));
    assert.strictEqual(elements["auto-retry-line"].hidden, true);
  }),
);

pending.push(
  test("offline state whose event.listen returns a rejected promise leaves no unhandled rejection", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    tauri.event = { listen: () => Promise.reject(new Error("no permission")) };
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    let unhandled = null;
    const onUnhandled = (reason) => {
      unhandled = reason;
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      assert.doesNotThrow(() => init(doc, win));
      await nextTick();
      await nextTick();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    assert.strictEqual(unhandled, null, "the rejected listen() promise must be handled");
    assert.strictEqual(elements["auto-retry-line"].hidden, true);
  }),
);

pending.push(
  test("offline state whose event.listen throws synchronously does not crash", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    tauri.event = {
      listen: () => {
        throw new Error("no permission");
      },
    };
    const win = { __LALIN_STATUS__: { lang: "en", state: "offline" }, __TAURI__: tauri };
    assert.doesNotThrow(() => init(doc, win));
    assert.strictEqual(elements["auto-retry-line"].hidden, true);
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
