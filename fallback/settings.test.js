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
const { init, formatRemaining } = require("./settings.js");

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
    "start-with-windows-toggle",
    "start-with-windows-label",
    "start-with-windows-note",
    "tv-heading",
    "dial-name-label",
    "dial-name-input",
    "dial-status",
    "open-setup-btn",
    "playback-heading",
    "sleep-timer-label",
    "sleep-timer-select",
    "sleep-timer-remaining",
    "codec-filter-label",
    "codec-filter-select",
    "codec-filter-note",
    "hardware-decoding-toggle",
    "hardware-decoding-label",
    "hardware-decoding-note",
    "display-heading",
    "fullscreen-toggle",
    "fullscreen-label",
    "keep-on-top-toggle",
    "keep-on-top-label",
    "mini-player-toggle",
    "mini-player-label",
    "controls-heading",
    "controller-toggle",
    "controller-label",
    "pause-on-blur-toggle",
    "pause-on-blur-label",
    "touch-overlay-toggle",
    "touch-overlay-label",
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
    "copy-diagnostics-btn",
    "diagnostics-output",
    "diagnostics-result",
    "diagnostics-note",
    "state-no-tauri",
    "no-tauri-title",
    "no-tauri-body",
  ];
  ids.forEach((id) => {
    elements[id] = makeElement(id);
  });
  // Match the `hidden` attribute settings.html ships with statically, so the
  // stub starts from the same visibility as a freshly loaded real page.
  [
    "settings-error",
    "check-updates-result",
    "state-no-tauri",
    "sleep-timer-remaining",
    "diagnostics-output",
    "diagnostics-result",
  ].forEach((id) => {
    elements[id].hidden = true;
  });
  // Match the static `value` attributes on the two radios.
  elements["language-th"].value = "th";
  elements["language-en"].value = "en";

  const docListeners = {};
  const doc = {
    documentElement: { lang: "" },
    activeElement: null,
    hidden: false,
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
      sleepTimerMinutes: 0,
      codecFilter: "off",
      hardwareDecoding: true,
      touchOverlay: true,
      miniPlayer: false,
      startWithWindows: false,
    },
    overrides,
  );
}

function baseSettingsData(overrides) {
  return Object.assign(
    {
      lang: "en",
      version: "0.4.0",
      settings: baseSettings(),
      dial: { state: "ready", host: "192.168.1.50", port: 51234, message: null },
      sleepRemainingSeconds: null,
      hardwareDecodingRestartRequired: false,
    },
    overrides,
  );
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeWinWithTimers(data, tauri, fake) {
  return {
    __LALIN_SETTINGS__: data,
    __TAURI__: tauri,
    setInterval: fake.setInterval,
    clearInterval: fake.clearInterval,
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
  test("renders every group from the initial snapshot, including the bilingual controls table", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    assert.ok(elements["page-title"].textContent.length > 0);

    // General
    assert.strictEqual(elements["language-en"].checked, true);
    assert.strictEqual(elements["language-th"].checked, false);
    assert.strictEqual(elements["start-with-windows-toggle"].checked, false);
    assert.ok(elements["start-with-windows-label"].textContent.length > 0);
    assert.ok(elements["start-with-windows-note"].textContent.includes("Windows"));

    // TV and phone
    assert.strictEqual(elements["dial-name-input"].value, "Lalin Cast");
    assert.ok(elements["dial-status"].textContent.includes("192.168.1.50:51234"));
    assert.strictEqual(elements["dial-status"].getAttribute("data-level"), "good");
    assert.ok(elements["open-setup-btn"].textContent.length > 0);

    // Playback
    assert.strictEqual(elements["sleep-timer-select"].children.length, 6);
    assert.strictEqual(elements["sleep-timer-select"].value, "0");
    assert.strictEqual(elements["sleep-timer-remaining"].hidden, true, "no countdown while no timer is running");
    assert.strictEqual(elements["codec-filter-select"].children.length, 2);
    assert.strictEqual(elements["codec-filter-select"].value, "off");
    assert.ok(elements["codec-filter-note"].textContent.length > 0);
    assert.strictEqual(elements["hardware-decoding-toggle"].checked, true);
    assert.strictEqual(elements["hardware-decoding-note"].getAttribute("data-level"), "info");

    // Display
    assert.strictEqual(elements["fullscreen-toggle"].checked, false);
    assert.strictEqual(elements["keep-on-top-toggle"].checked, false);
    assert.strictEqual(elements["mini-player-toggle"].checked, false);

    // Controls
    assert.strictEqual(elements["controller-toggle"].checked, true);
    assert.strictEqual(elements["pause-on-blur-toggle"].checked, false);
    assert.strictEqual(elements["touch-overlay-toggle"].checked, true);
    assert.strictEqual(elements["controls-table-body"].children.length, 13);
    const firstRow = elements["controls-table-body"].children[0];
    assert.strictEqual(firstRow.children.length, 3);
    assert.ok(firstRow.children[0].textContent.includes("Open settings"));
    assert.ok(firstRow.children[0].textContent.includes("เปิดการตั้งค่า"));

    // The two wave-5 rows: playback speed and the help overlay, both
    // bilingual with an empty ("—") controller column.
    const speedRow = elements["controls-table-body"].children[11];
    assert.ok(speedRow.children[0].textContent.includes("Playback speed"));
    assert.ok(speedRow.children[0].textContent.includes("ความเร็วเล่น"));
    assert.strictEqual(speedRow.children[1].textContent, "Shift+, / Shift+.");
    assert.strictEqual(speedRow.children[2].textContent, "—");

    const helpRow = elements["controls-table-body"].children[12];
    assert.ok(helpRow.children[0].textContent.includes("help overlay"));
    assert.ok(helpRow.children[0].textContent.includes("ผังคีย์ลัด"));
    assert.strictEqual(helpRow.children[1].textContent, "? / F1");
    assert.strictEqual(helpRow.children[2].textContent, "—");

    // Updates and about
    assert.ok(elements["version-line"].textContent.includes("0.4.0"));
    assert.ok(elements["unofficial-text"].textContent.length > 0);
    assert.ok(elements["legal-files-text"].textContent.includes("PRIVACY.md"));
    assert.ok(elements["legal-files-text"].textContent.includes("TERMS.md"));
    assert.ok(elements["legal-files-text"].textContent.includes("THIRD_PARTY_NOTICES.md"));
    assert.ok(elements["copy-diagnostics-btn"].textContent.length > 0);
    assert.ok(elements["diagnostics-note"].textContent.length > 0);
    assert.strictEqual(elements["diagnostics-output"].hidden, true, "diagnostics textarea starts hidden");
    assert.strictEqual(elements["diagnostics-result"].hidden, true);

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
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
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
  { id: "mini-player-toggle", key: "miniPlayer" },
  { id: "controller-toggle", key: "controllerEnabled" },
  { id: "pause-on-blur-toggle", key: "pauseOnBlur" },
  { id: "touch-overlay-toggle", key: "touchOverlay" },
  { id: "hardware-decoding-toggle", key: "hardwareDecoding" },
  { id: "start-with-windows-toggle", key: "startWithWindows" },
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
            sleepRemainingSeconds: null,
            hardwareDecodingRestartRequired: false,
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
  test("selecting a sleep timer duration calls settings_set('sleepTimerMinutes', <int>) and shows the countdown", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: (args) =>
        Promise.resolve({
          settings: baseSettings({ sleepTimerMinutes: args.value }),
          dial: baseSettingsData().dial,
          sleepRemainingSeconds: 1800,
          hardwareDecodingRestartRequired: false,
        }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["sleep-timer-select"].value = "30";
    elements["sleep-timer-select"].dispatch("change");
    await nextTick();

    assert.deepStrictEqual(invokeCalls[0].args, { key: "sleepTimerMinutes", value: 30 });
    assert.strictEqual(elements["sleep-timer-select"].value, "30");
    assert.strictEqual(elements["sleep-timer-remaining"].hidden, false);
    assert.ok(elements["sleep-timer-remaining"].textContent.includes("30:00"));
  }),
);

pending.push(
  test("selecting the codec filter calls settings_set('codecFilter', <string>) and applies the note", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: (args) =>
        Promise.resolve({
          settings: baseSettings({ codecFilter: args.value }),
          dial: baseSettingsData().dial,
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
        }),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["codec-filter-select"].value = "h264";
    elements["codec-filter-select"].dispatch("change");
    await nextTick();

    assert.deepStrictEqual(invokeCalls[0].args, { key: "codecFilter", value: "h264" });
    assert.strictEqual(elements["codec-filter-select"].value, "h264");
    assert.ok(elements["codec-filter-note"].textContent.length > 0);
  }),
);

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
  test("a settings_set rejection for startWithWindows reverts the toggle and shows an inline error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({ settings_set: () => Promise.reject(new Error("registry write failed")) });
    const win = {
      __LALIN_SETTINGS__: baseSettingsData({ settings: baseSettings({ startWithWindows: false }) }),
      __TAURI__: tauri,
    };
    init(doc, win);

    // Simulate the user turning the control on (browsers flip `checked`
    // before the `change` listener runs).
    elements["start-with-windows-toggle"].checked = true;
    elements["start-with-windows-toggle"].dispatch("change");
    await nextTick();

    assert.strictEqual(elements["start-with-windows-toggle"].checked, false, "reverted to the last known-good value");
    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("registry write failed"));
  }),
);

pending.push(
  test("a settings_set rejection for an out-of-set sleep timer value reverts the select and shows an inline error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_set: () => Promise.reject(new Error("value not in allowed set")),
    });
    const win = {
      __LALIN_SETTINGS__: baseSettingsData({ settings: baseSettings({ sleepTimerMinutes: 15 }), sleepRemainingSeconds: 900 }),
      __TAURI__: tauri,
    };
    init(doc, win);

    elements["sleep-timer-select"].value = "60";
    elements["sleep-timer-select"].dispatch("change");
    await nextTick();

    assert.strictEqual(elements["sleep-timer-select"].value, "15", "reverted to the last known-good value");
    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("not in allowed set"));
  }),
);

pending.push(
  test("a settings_set rejection for an out-of-set codec filter value reverts the select and shows an inline error", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_set: () => Promise.reject(new Error("unknown codec filter")),
    });
    const win = {
      __LALIN_SETTINGS__: baseSettingsData({ settings: baseSettings({ codecFilter: "off" }) }),
      __TAURI__: tauri,
    };
    init(doc, win);

    elements["codec-filter-select"].value = "h264";
    elements["codec-filter-select"].dispatch("change");
    await nextTick();

    assert.strictEqual(elements["codec-filter-select"].value, "off", "reverted to the last known-good value");
    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("unknown codec filter"));
  }),
);

pending.push(
  test("a successful settings_set re-renders every control from the returned snapshot, including DIAL status and playback fields", async () => {
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
            sleepTimerMinutes: 60,
            codecFilter: "h264",
            hardwareDecoding: false,
            touchOverlay: false,
            miniPlayer: true,
          },
          dial: { state: "degraded", host: null, port: null, message: "rebind" },
          sleepRemainingSeconds: 3599,
          hardwareDecodingRestartRequired: true,
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
    assert.strictEqual(elements["mini-player-toggle"].checked, true);
    assert.strictEqual(elements["touch-overlay-toggle"].checked, false);
    assert.strictEqual(elements["hardware-decoding-toggle"].checked, false);
    assert.strictEqual(elements["hardware-decoding-note"].getAttribute("data-level"), "warn");
    assert.strictEqual(elements["sleep-timer-select"].value, "60");
    assert.strictEqual(elements["codec-filter-select"].value, "h264");
    assert.strictEqual(elements["sleep-timer-remaining"].hidden, false);
    assert.ok(elements["sleep-timer-remaining"].textContent.includes("59:59"));
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
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
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
  test("pressing Enter in the DIAL name field commits immediately (no double-commit)", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_set: (args) =>
        Promise.resolve({
          settings: baseSettings({ dialFriendlyName: args.value }),
          dial: baseSettingsData().dial,
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
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

// ---------------------------------------------------------------------------
// Diagnostics snapshot (#copy-diagnostics-btn): fills the readonly textarea,
// then best-effort copies to the clipboard.
// ---------------------------------------------------------------------------

pending.push(
  test("Copy diagnostics fills the textarea and reports success when the clipboard copy succeeds", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_diagnostics: () => Promise.resolve("Lalin Cast diagnostics\nversion: 0.4.0\n"),
    });
    const clipboardCalls = [];
    const win = {
      __LALIN_SETTINGS__: baseSettingsData(),
      __TAURI__: tauri,
      navigator: {
        clipboard: {
          writeText: (text) => {
            clipboardCalls.push(text);
            return Promise.resolve();
          },
        },
      },
    };
    init(doc, win);

    elements["copy-diagnostics-btn"].dispatch("click");
    await nextTick();
    await nextTick();

    assert.strictEqual(invokeCalls[0].cmd, "settings_diagnostics");
    assert.strictEqual(elements["diagnostics-output"].hidden, false);
    assert.ok(elements["diagnostics-output"].value.includes("version: 0.4.0"));
    assert.deepStrictEqual(clipboardCalls, ["Lalin Cast diagnostics\nversion: 0.4.0\n"]);
    assert.strictEqual(elements["diagnostics-result"].hidden, false);
    assert.ok(elements["diagnostics-result"].textContent.includes("Copied"));
    assert.ok(elements["diagnostics-result"].textContent.includes("คัดลอกแล้ว"));
    assert.strictEqual(elements["copy-diagnostics-btn"].disabled, false);
    assert.strictEqual(elements["settings-error"].hidden, true);
  }),
);

pending.push(
  test("Copy diagnostics shows the manual-copy fallback text when the clipboard write is rejected", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_diagnostics: () => Promise.resolve("Lalin Cast diagnostics\n"),
    });
    const win = {
      __LALIN_SETTINGS__: baseSettingsData(),
      __TAURI__: tauri,
      navigator: {
        clipboard: {
          writeText: () => Promise.reject(new Error("denied")),
        },
      },
    };
    init(doc, win);

    elements["copy-diagnostics-btn"].dispatch("click");
    await nextTick();
    await nextTick();

    assert.strictEqual(elements["diagnostics-output"].hidden, false, "textarea is still shown on a clipboard failure");
    assert.strictEqual(elements["diagnostics-output"].value, "Lalin Cast diagnostics\n");
    assert.strictEqual(elements["diagnostics-result"].hidden, false);
    assert.ok(elements["diagnostics-result"].textContent.includes("Select the text and copy it"));
    assert.ok(elements["diagnostics-result"].textContent.includes("เลือกข้อความแล้วคัดลอกเอง"));
  }),
);

pending.push(
  test("Copy diagnostics falls back to the manual-copy text when no Clipboard API is present", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_diagnostics: () => Promise.resolve("Lalin Cast diagnostics\n"),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri }; // no `navigator` at all
    init(doc, win);

    elements["copy-diagnostics-btn"].dispatch("click");
    await nextTick();
    await nextTick();

    assert.strictEqual(elements["diagnostics-output"].hidden, false);
    assert.strictEqual(elements["diagnostics-result"].hidden, false);
    assert.ok(elements["diagnostics-result"].textContent.includes("Select the text and copy it"));
  }),
);

pending.push(
  test("Copy diagnostics failure shows an inline error and leaves the textarea hidden", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_diagnostics: () => Promise.reject(new Error("dial state unavailable")),
    });
    const win = { __LALIN_SETTINGS__: baseSettingsData(), __TAURI__: tauri };
    init(doc, win);

    elements["copy-diagnostics-btn"].dispatch("click");
    await nextTick();

    assert.strictEqual(elements["settings-error"].hidden, false);
    assert.ok(elements["settings-error"].textContent.includes("dial state unavailable"));
    assert.strictEqual(elements["diagnostics-output"].hidden, true, "textarea stays hidden when the invoke rejects");
    assert.strictEqual(elements["diagnostics-result"].hidden, true);
    assert.strictEqual(elements["copy-diagnostics-btn"].disabled, false);
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
  test("formatRemaining formats seconds as mm:ss and returns null for anything invalid", () => {
    assert.strictEqual(formatRemaining(0), "00:00");
    assert.strictEqual(formatRemaining(5), "00:05");
    assert.strictEqual(formatRemaining(65), "01:05");
    assert.strictEqual(formatRemaining(3599), "59:59");
    assert.strictEqual(formatRemaining(3661), "61:01");
    assert.strictEqual(formatRemaining(null), null);
    assert.strictEqual(formatRemaining(undefined), null);
    assert.strictEqual(formatRemaining(-1), null);
    assert.strictEqual(formatRemaining("30"), null);
    assert.strictEqual(formatRemaining(NaN), null);
  }),
);

pending.push(
  test("renders a visible sleep-timer countdown when sleepRemainingSeconds is a number", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = {
      __LALIN_SETTINGS__: baseSettingsData({ settings: baseSettings({ sleepTimerMinutes: 15 }), sleepRemainingSeconds: 125 }),
      __TAURI__: tauri,
    };
    init(doc, win);
    assert.strictEqual(elements["sleep-timer-remaining"].hidden, false);
    assert.ok(elements["sleep-timer-remaining"].textContent.includes("02:05"));
  }),
);

pending.push(
  test("hides the sleep-timer countdown when sleepRemainingSeconds is null", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData({ sleepRemainingSeconds: null }), __TAURI__: tauri };
    init(doc, win);
    assert.strictEqual(elements["sleep-timer-remaining"].hidden, true);
  }),
);

pending.push(
  test("shows the hardware-decoding note as a warning when hardwareDecodingRestartRequired is true", () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub();
    const win = { __LALIN_SETTINGS__: baseSettingsData({ hardwareDecodingRestartRequired: true }), __TAURI__: tauri };
    init(doc, win);
    assert.strictEqual(elements["hardware-decoding-note"].getAttribute("data-level"), "warn");
    assert.ok(elements["hardware-decoding-note"].textContent.length > 0);
  }),
);

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
      settings_set: () =>
        Promise.resolve({
          settings: baseSettings(),
          dial: baseSettingsData().dial,
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
        }),
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

// ---------------------------------------------------------------------------
// Background refresh loop (settings_get every 5s, paused while document.hidden,
// never overwriting a focused input).
// ---------------------------------------------------------------------------

pending.push(
  test("starts exactly one 5s settings_get refresh timer, even across repeated init() calls", () => {
    const { doc } = createStubDom();
    const { tauri } = makeTauriStub({ settings_get: () => Promise.resolve(baseSettingsData()) });
    const fake = makeFakeTimers();
    const win = makeWinWithTimers(baseSettingsData(), tauri, fake);
    init(doc, win);
    init(doc, win);

    assert.strictEqual(fake.timers.length, 1);
    assert.strictEqual(fake.timers[0].ms, 5000);
  }),
);

pending.push(
  test("the refresh timer calls settings_get and repaints DIAL status, countdown and mini state", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_get: () =>
        Promise.resolve({
          settings: baseSettings({ miniPlayer: true, sleepTimerMinutes: 15 }),
          dial: { state: "degraded", host: null, port: null, message: "rebind" },
          sleepRemainingSeconds: 42,
          hardwareDecodingRestartRequired: false,
        }),
    });
    const fake = makeFakeTimers();
    const win = makeWinWithTimers(baseSettingsData(), tauri, fake);
    init(doc, win);

    fake.timers[0].fn();
    await nextTick();

    assert.ok(invokeCalls.some((c) => c.cmd === "settings_get"));
    assert.ok(elements["dial-status"].textContent.includes("rebind"));
    assert.strictEqual(elements["dial-status"].getAttribute("data-level"), "warn");
    assert.strictEqual(elements["mini-player-toggle"].checked, true);
    assert.strictEqual(elements["sleep-timer-remaining"].hidden, false);
    assert.ok(elements["sleep-timer-remaining"].textContent.includes("00:42"));
  }),
);

pending.push(
  test("the refresh timer skips settings_get while document.hidden and resumes once visible", async () => {
    const { doc, elements } = createStubDom();
    const { tauri, invokeCalls } = makeTauriStub({
      settings_get: () =>
        Promise.resolve({
          settings: baseSettings({ dialFriendlyName: "Polled Name" }),
          dial: baseSettingsData().dial,
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
        }),
    });
    const fake = makeFakeTimers();
    const win = makeWinWithTimers(baseSettingsData(), tauri, fake);
    init(doc, win);

    doc.hidden = true;
    fake.timers[0].fn();
    await nextTick();
    assert.strictEqual(invokeCalls.filter((c) => c.cmd === "settings_get").length, 0, "no poll while hidden");
    assert.strictEqual(elements["dial-name-input"].value, "Lalin Cast", "unchanged while hidden");

    doc.hidden = false;
    fake.timers[0].fn();
    await nextTick();
    assert.strictEqual(invokeCalls.filter((c) => c.cmd === "settings_get").length, 1, "polls once visible again");
    assert.strictEqual(elements["dial-name-input"].value, "Polled Name");
  }),
);

pending.push(
  test("the refresh timer never overwrites the DIAL name field while it has focus", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_get: () =>
        Promise.resolve({
          settings: baseSettings({ dialFriendlyName: "Server Name" }),
          dial: baseSettingsData().dial,
          sleepRemainingSeconds: null,
          hardwareDecodingRestartRequired: false,
        }),
    });
    const fake = makeFakeTimers();
    const win = makeWinWithTimers(baseSettingsData({ settings: baseSettings({ dialFriendlyName: "Old Name" }) }), tauri, fake);
    init(doc, win);

    elements["dial-name-input"].value = "Typing a new name...";
    doc.activeElement = elements["dial-name-input"];

    fake.timers[0].fn();
    await nextTick();
    assert.strictEqual(elements["dial-name-input"].value, "Typing a new name...", "not overwritten while focused");

    doc.activeElement = null;
    fake.timers[0].fn();
    await nextTick();
    assert.strictEqual(elements["dial-name-input"].value, "Server Name", "applied once focus is elsewhere");
  }),
);

pending.push(
  test("the refresh timer never touches the diagnostics textarea, even while it is focused with pending text", async () => {
    const { doc, elements } = createStubDom();
    const { tauri } = makeTauriStub({
      settings_get: () => Promise.resolve(baseSettingsData({ settings: baseSettings({ startWithWindows: true }) })),
    });
    const fake = makeFakeTimers();
    const win = makeWinWithTimers(baseSettingsData(), tauri, fake);
    init(doc, win);

    elements["diagnostics-output"].value = "unsaved diagnostics text";
    elements["diagnostics-output"].hidden = false;
    doc.activeElement = elements["diagnostics-output"];

    fake.timers[0].fn();
    await nextTick();

    assert.strictEqual(elements["diagnostics-output"].value, "unsaved diagnostics text", "refresh loop never writes this field");
    assert.strictEqual(elements["diagnostics-output"].hidden, false, "refresh loop never hides this field either");
    // Sanity: the poll itself did run and did repaint an unrelated control.
    assert.strictEqual(elements["start-with-windows-toggle"].checked, true);
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
