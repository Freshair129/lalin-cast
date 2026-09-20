"use strict";

/*
 * Node-only self-test for fallback/settings.js. No test framework, no
 * external dependencies beyond Node's built-in `assert`. Run with:
 *
 *   node fallback/settings.test.js
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

const assert = require("assert");
const { init } = require("./settings.js");

// ---------------------------------------------------------------------------
// Minimal stub DOM
// ---------------------------------------------------------------------------

function makeElement(id) {
  const listeners = {};
  const attrs = {};
  const el = {
    id: id || null,
    textContent: "",
    hidden: false,
    disabled: false,
    checked: false,
    value: "",
    children: [],
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
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      return child;
    },
  };
  Object.defineProperty(el, "firstChild", {
    get() {
      return el.children.length ? el.children[0] : null;
    },
  });
  return el;
}

function createStubDom() {
  const elements = {};
  const ids = [
    "main-content",
    "page-title",
    "settings-error",
    "general-heading",
    "language-legend",
    "language-th",
    "language-th-label",
    "language-en",
    "language-en-label",
    "fullscreen-toggle",
    "fullscreen-label",
    "keep-on-top-toggle",
    "keep-on-top-label",
    "tv-heading",
    "dial-name-label",
    "dial-name-input",
    "dial-status",
    "open-setup-btn",
    "controls-heading",
    "controller-toggle",
    "controller-label",
    "pause-on-blur-toggle",
    "pause-on-blur-label",
    "controls-table-caption",
    "controls-col-action",
    "controls-col-keyboard",
    "controls-col-controller",
    "controls-table-body",
    "updates-heading",
    "check-updates-btn",
    "check-updates-result",
    "version-line",
    "unofficial-text",
    "legal-files-text",
    "state-no-tauri",
    "no-tauri-title",
    "no-tauri-body",
  ];
  ids.forEach((id) => {
    elements[id] = makeElement(id);
  });
  // Match the `hidden` attribute settings.html ships with statically, so the
  // stub starts from the same visibility as a freshly loaded real page.
  ["settings-error", "check-updates-result", "state-no-tauri"].forEach((id) => {
    elements[id].hidden = true;
  });
  // Match the static `value` attributes on the two radios.
  elements["language-th"].value = "th";
  elements["language-en"].value = "en";

  const docListeners = {};
  const doc = {
    documentElement: { lang: "" },
    getElementById: (id) => elements[id] || null,
    createElement: () => makeElement(null),
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
  const closeCalls = { count: 0 };
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
      getCurrentWindow: () => ({
        close: () => {
          closeCalls.count += 1;
        },
      }),
    },
  };
  return { tauri: stub, invokeCalls, closeCalls };
}

function baseSettings(overrides) {
  return Object.assign(
    {
      language: "en",
      dialFriendlyName: "Lalin Cast",
      fullscreen: false,
      keepOnTop: false,
      pauseOnBlur: false,
      controllerEnabled: true,
      setupCompleted: true,
    },
    overrides,
  );
}

function baseSettingsData(overrides) {
  return Object.assign(
    {
      lang: "en",
      version: "0.3.0",
      settings: baseSettings(),
      dial: { state: "ready", host: "192.168.1.50", port: 51234, message: null },
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
  test("renders every group from the initial snapshot, including the bilingual controls table", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    assert.ok(elements["page-title"].textContent.length > 0);

    // General
    assert.strictEqual(elements["language-en"].checked, true);
    assert.strictEqual(elements["language-th"].checked, false);
    assert.strictEqual(elements["fullscreen-toggle"].checked, false);
    assert.strictEqual(elements["keep-on-top-toggle"].checked, false);

    // TV and phone
    assert.strictEqual(elements["dial-name-input"].value, "Lalin Cast");
    assert.ok(elements["dial-status"].textContent.includes("192.168.1.50:51234"));
    assert.strictEqual(elements["dial-status"].getAttribute("data-level"), "good");
    assert.ok(elements["open-setup-btn"].textContent.length > 0);

    // Controls
    assert.strictEqual(elements["controller-toggle"].checked, true);
    assert.strictEqual(elements["pause-on-blur-toggle"].checked, false);
    assert.strictEqual(elements["controls-table-body"].children.length, 10);
    const firstRow = elements["controls-table-body"].children[0];
    assert.strictEqual(firstRow.children.length, 3);
    assert.ok(firstRow.children[0].textContent.includes("Open settings"));
    assert.ok(firstRow.children[0].textContent.includes("เปิดการตั้งค่า"));

    // Updates and about
    assert.ok(elements["version-line"].textContent.includes("0.3.0"));
    assert.ok(elements["unofficial-text"].textContent.length > 0);
    assert.ok(elements["legal-files-text"].textContent.includes("PRIVACY.md"));
    assert.ok(elements["legal-files-text"].textContent.includes("TERMS.md"));
    assert.ok(elements["legal-files-text"].textContent.includes("THIRD_PARTY_NOTICES.md"));

    assert.strictEqual(elements["state-no-tauri"].hidden, true);
    assert.strictEqual(elements["settings-error"].hidden, true);
  }),
);

pending.push(
  test("Thai lang renders Thai static labels and sets documentElement.lang", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData({ lang: "th" }), __TAURI__: tauri };
    init(doc, win);
    assert.strictEqual(doc.documentElement.lang, "th");
    assert.ok(elements["page-title"].textContent.includes("การตั้งค่า"));
  }),
);

pending.push(
  test("selecting the Thai language radio calls settings_set('language','th') and re-renders", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: (args) =>
        Promise.resolve({
          settings: baseSettings({ language: args.value }),
          dial: baseSettingsData().dial,
        }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["language-th"].checked = true;
    elements["language-en"].checked = false;
    elements["language-th"].dispatch("change");
    await nextTick();

    assert.deepStrictEqual(
      invokeCalls.map((c) => c.cmd),
      ["settings_set"],
    );
    assert.deepStrictEqual(invokeCalls[0].args, { key: "language", value: "th" });
    assert.strictEqual(elements["language-th"].checked, true);
    assert.strictEqual(elements["language-en"].checked, false);
  }),
);

pending.push(
  test("an unchecked radio's change event is a no-op", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    elements["language-th"].checked = false;
    elements["language-th"].dispatch("change");
    assert.strictEqual(invokeCalls.length, 0);
  }),
);

const BOOLEAN_CONTROLS = [
  { id: "fullscreen-toggle", key: "fullscreen" },
  { id: "keep-on-top-toggle", key: "keepOnTop" },
  { id: "controller-toggle", key: "controllerEnabled" },
  { id: "pause-on-blur-toggle", key: "pauseOnBlur" },
];

BOOLEAN_CONTROLS.forEach(({ id, key }) => {
  pending.push(
    test(`toggling #${id} calls settings_set('${key}', <bool>) and applies the returned snapshot`, async () => {
      const { doc, elements } = createStubDom();
      const { tauri, invokeCalls } = makeTauriStub({
        settings_set: (args) =>
          Promise.resolve({
            settings: baseSettings({ [key]: args.value }),
            dial: baseSettingsData().dial,
          }),
      });
      const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
      init(doc, win);

      elements[id].checked = true;
      elements[id].dispatch("change");
      await nextTick();

      assert.deepStrictEqual(invokeCalls[0].args, { key, value: true });
      assert.strictEqual(elements[id].checked, true);
      assert.strictEqual(elements["settings-error"].hidden, true);
    }),
  );
});

pending.push(
  test("a settings_set rejection reverts the toggled control and shows an inline error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ settings_set: () => Promise.reject(new Error("store locked")) });
    const win = { __LALIN_SETTINGS__: baseSettingsData({ settings: baseSettings({ controllerEnabled: true }) }), __TAURI__: tauri };
    init(doc, win);

    // Simulate the user turning the control off (browsers flip `checked`
    // before the `change` listener runs).
    elements["controller-toggle"].checked = false;
    elements["controller-toggle"].dispatch("change");
    await nextTick();

    assert.strictEqual(elements["controller-toggle"].checked, true, "reverted to the last known-good value");
    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("store locked"));
  }),
);

pending.push(
  test("a successful settings_set re-renders every control from the returned snapshot, including DIAL status", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_set: () =>
        Promise.resolve({
          settings: {
            language: "en",
            dialFriendlyName: "Living Room TV",
            fullscreen: true,
            keepOnTop: true,
            pauseOnBlur: true,
            controllerEnabled: false,
            setupCompleted: true,
          },
          dial: { state: "degraded", host: null, port: null, message: "rebind" },
        }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["keep-on-top-toggle"].checked = true;
    elements["keep-on-top-toggle"].dispatch("change");
    await nextTick();

    assert.strictEqual(elements["fullscreen-toggle"].checked, true);
    assert.strictEqual(elements["keep-on-top-toggle"].checked, true);
    assert.strictEqual(elements["pause-on-blur-toggle"].checked, true);
    assert.strictEqual(elements["controller-toggle"].checked, false);
    assert.strictEqual(elements["dial-name-input"].value, "Living Room TV");
    assert.ok(elements["dial-status"].textContent.includes("rebind"));
    assert.strictEqual(elements["dial-status"].getAttribute("data-level"), "warn");
  }),
);

pending.push(
  test("editing the DIAL name field commits on change", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: (args) =>
        Promise.resolve({
          settings: baseSettings({ dialFriendlyName: args.value }),
          dial: baseSettingsData().dial,
        }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["dial-name-input"].value = "Bedroom TV";
    elements["dial-name-input"].dispatch("change");
    await nextTick();

    assert.deepStrictEqual(invokeCalls[0].args, { key: "dialFriendlyName", value: "Bedroom TV" });
    assert.strictEqual(elements["dial-name-input"].value, "Bedroom TV");
  }),
);

pending.push(
  test("pressing Enter in the DIAL name field commits immediately", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: (args) =>
        Promise.resolve({
          settings: baseSettings({ dialFriendlyName: args.value }),
          dial: baseSettingsData().dial,
        }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["dial-name-input"].value = "Office TV";
    elements["dial-name-input"].dispatch("keydown", { key: "Enter" });
    await nextTick();

    assert.deepStrictEqual(invokeCalls[0].args, { key: "dialFriendlyName", value: "Office TV" });

    // A non-Enter key must not trigger a second commit.
    elements["dial-name-input"].dispatch("keydown", { key: "a" });
    assert.strictEqual(invokeCalls.length, 1);
  }),
);

pending.push(
  test("Open setup button invokes settings_open_setup with no args", () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    elements["open-setup-btn"].dispatch("click");
    assert.strictEqual(invokeCalls.length, 1);
    assert.strictEqual(invokeCalls[0].cmd, "settings_open_setup");
    assert.strictEqual(invokeCalls[0].args, undefined);
  }),
);

pending.push(
  test("Open setup failure shows an inline error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ settings_open_setup: () => Promise.reject(new Error("busy")) });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    elements["open-setup-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("busy"));
    assert.strictEqual(elements["open-setup-btn"].disabled, false);
  }),
);

pending.push(
  test("Check updates button invokes settings_check_updates and shows a started message", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({ settings_check_updates: () => Promise.resolve() });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    elements["check-updates-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(invokeCalls[0].cmd, "settings_check_updates");
    assert.strictEqual(elements["check-updates-result"].hidden, false);
    assert.ok(elements["check-updates-result"].textContent.length > 0);
    assert.strictEqual(elements["check-updates-btn"].disabled, false);
  }),
);

pending.push(
  test("Check updates failure shows an inline error instead of the started message", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ settings_check_updates: () => Promise.reject(new Error("offline")) });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    elements["check-updates-btn"].dispatch("click");
    await nextTick();
    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("offline"));
    assert.strictEqual(elements["check-updates-result"].hidden, true);
  }),
);

["starting", "degraded", "disabled"].forEach((dialState) => {
  pending.push(
    test(`DIAL state '${dialState}' renders a non-empty status line`, () => {
      const { doc, elements } = createStubDom();
      const { tauri } = makeTauriStub();
      const win = {
        __LALIN_SETTINGS__: baseSettingsData({ dial: { state: dialState, host: null, port: null, message: "reason" } }),
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
  test("missing Tauri API shows the fallback state and hides the main content", () => {
    const { doc, elements } = createStubDom();
    const win = { __LALIN_SETTINGS__: baseSettingsData() };
    init(doc, win);
    assert.strictEqual(elements["state-no-tauri"].hidden, false);
    assert.strictEqual(elements["main-content"].hidden, true);
    assert.ok(elements["no-tauri-body"].textContent.length > 0);
  }),
);

pending.push(
  test("Escape closes the window", () => {
    const { doc } = createStubDom();
    const { tauri, closeCalls } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    doc.dispatch("keydown", { key: "Escape" });
    assert.strictEqual(closeCalls.count, 1);
  }),
);

pending.push(
  test("a non-Escape key is ignored", () => {
    const { doc } = createStubDom();
    const { tauri, closeCalls } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    doc.dispatch("keydown", { key: "a" });
    assert.strictEqual(closeCalls.count, 0);
  }),
);

pending.push(
  test("repeated init() calls do not double-bind listeners", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: () => Promise.resolve({ settings: baseSettings(), dial: baseSettingsData().dial }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);
    init(doc, win);

    elements["fullscreen-toggle"].checked = true;
    elements["fullscreen-toggle"].dispatch("change");
    await nextTick();

    assert.strictEqual(invokeCalls.filter((c) => c.cmd === "settings_set").length, 1);
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
