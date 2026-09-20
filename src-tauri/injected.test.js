"use strict";

/*
 * Node-only self-test for src-tauri/injected.js. No test framework, no
 * external dependencies beyond Node's built-ins (`assert`, the global
 * `Event`/`EventTarget`). Run with:
 *
 *   node src-tauri/injected.test.js
 *
 * Exits 0 when every check passes, 1 otherwise.
 *
 * injected.js only touches `window`/`document` when `typeof window !==
 * "undefined"` (see its boot() gate at the bottom of the file), so simply
 * `require()`-ing it here — Node has no `window` global — exercises the
 * "IIFE is a no-op" path and gives us the pure helpers plus the DOM-wiring
 * factories via `module.exports`. Those factories take `doc`/`win` as
 * explicit parameters (the same convention fallback/settings.js already
 * uses in this repo), so they can be exercised here against small stub
 * objects instead of a real WebView.
 */

const assert = require("assert");
const m = require("./injected.js");

// ---------------------------------------------------------------------------
// Minimal stub DOM
//
// `doc`/`win` are real `EventTarget` instances (Node has this built in),
// which gives spec-correct addEventListener/dispatchEvent/
// removeEventListener/stopImmediatePropagation semantics for free — exactly
// what injected.js's `document.dispatchEvent(new Event(...))` dispatch
// technique needs — with everything else injected.js reads (createElement,
// getElementById, querySelector(All), navigator, location, timers, …)
// bolted on as plain properties.
// ---------------------------------------------------------------------------

function makeElement() {
  // A real EventTarget (Node has this built in) so production code's
  // `element.addEventListener(...)` calls — used by the wave 4 touch
  // overlay's buttons — work against this stub exactly like a real DOM
  // element, on top of the same plain property bag every other section of
  // injected.js already relies on (id, className, textContent, style,
  // children, classList, appendChild).
  const classSet = new Set();
  const el = new EventTarget();
  Object.assign(el, {
    id: "",
    className: "",
    textContent: "",
    style: {},
    children: [],
    classList: {
      add(c) { classSet.add(c); },
      remove(c) { classSet.delete(c); },
      contains(c) { return classSet.has(c); },
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
  });
  return el;
}

function makeContainer(registry) {
  const el = makeElement();
  el.appendChild = (child) => {
    el.children.push(child);
    if (child && child.id) registry[child.id] = child;
    return child;
  };
  return el;
}

function createStubDoc(options) {
  const opts = options || {};
  const registry = {};
  const doc = new EventTarget();
  doc.documentElement = makeElement();
  doc.head = makeContainer(registry);
  doc.body = makeContainer(registry);
  (opts.bodyClasses || []).forEach((c) => doc.body.classList.add(c));
  doc.createElement = () => makeElement();
  doc.getElementById = (id) => registry[id] || null;
  doc.querySelector = (selector) => {
    const table = opts.querySelectorResults || {};
    return Object.prototype.hasOwnProperty.call(table, selector) ? table[selector] : null;
  };
  doc.querySelectorAll = (selector) => {
    const table = opts.querySelectorAllResults || {};
    return Object.prototype.hasOwnProperty.call(table, selector) ? table[selector] : [];
  };
  return doc;
}

function createStubWin(options) {
  const opts = options || {};
  const win = new EventTarget();
  win.navigator = opts.navigator || {};
  win.location = opts.location || { href: "", assign() {} };
  if (Object.prototype.hasOwnProperty.call(opts, "yt")) win.yt = opts.yt;
  win.__rafCalls = [];
  win.requestAnimationFrame = (cb) => {
    win.__rafCalls.push(cb);
    return win.__rafCalls.length;
  };
  win.cancelAnimationFrame = () => {};
  // Schedules for real (nothing currently-passing relies on NOT waiting),
  // but also records { cb, ms, id } so a test can invoke `cb()` itself
  // instead of waiting out a multi-second real delay — used by the sleep
  // OSD's 6s auto-hide test, below.
  win.__timeoutCalls = [];
  win.setTimeout = (cb, ms, ...rest) => {
    const id = setTimeout(cb, ms, ...rest);
    win.__timeoutCalls.push({ cb, ms, id });
    return id;
  };
  win.clearTimeout = (...args) => clearTimeout(...args);
  win.setInterval = (...args) => setInterval(...args);
  win.clearInterval = (...args) => clearInterval(...args);
  return win;
}

function keyEvent(fields) {
  const e = new Event("keydown");
  Object.assign(e, fields);
  return e;
}

function gamepad(buttonFlags, axes) {
  return {
    buttons: (buttonFlags || []).map((pressed) => ({ pressed: Boolean(pressed) })),
    axes: axes || [],
  };
}

function nextTick(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms || 0));
}

// ---------------------------------------------------------------------------
// Test runner (same shape as fallback/settings.test.js)
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

// ---------------------------------------------------------------------------
// module shape
// ---------------------------------------------------------------------------

pending.push(
  test("codecAllowed blocks YouTube's four-part vp09/vp08 codec ids and keeps H.264/AAC", () => {
    assert.strictEqual(m.codecAllowed('video/webm; codecs="vp09.00.10.08"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/mp4; codecs="vp09.00.51.08.01.01.01.01.00"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/webm; codecs="vp08.00.10.08"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/mp4; codecs="av01.0.08M.08"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/mp4; codecs="avc1.640028"', "h264"), true);
    assert.strictEqual(m.codecAllowed('audio/mp4; codecs="mp4a.40.2"', "h264"), true);
    assert.strictEqual(m.codecAllowed('video/webm; codecs="vp09.00.10.08"', "off"), true);
  }),
);

pending.push(
  test("requiring injected.js with no `window` global is a no-op beyond exporting the pure helpers", () => {
    assert.strictEqual(typeof window, "undefined");
    ["mapGamepadState", "keybindFor", "deepLinkToHash", "clampVolume", "codecAllowed", "touchButtons"].forEach((name) => {
      assert.strictEqual(typeof m[name], "function", `${name} should be exported`);
    });
  }),
);

// ---------------------------------------------------------------------------
// mapGamepadState
// ---------------------------------------------------------------------------

pending.push(
  test("mapGamepadState: a button press emits one down event, holding it emits nothing more, releasing emits up", () => {
    const down = m.mapGamepadState(undefined, gamepad([true]));
    assert.deepStrictEqual(down.events, [{ type: "down", code: 0, keyCode: 13 }]);

    const held = m.mapGamepadState(down.state, gamepad([true]));
    assert.deepStrictEqual(held.events, []);

    const released = m.mapGamepadState(held.state, gamepad([false]));
    assert.deepStrictEqual(released.events, [{ type: "up", code: 0, keyCode: 13 }]);
  }),
);

pending.push(
  test("mapGamepadState: two buttons pressed in the same poll both emit", () => {
    const buttons = new Array(13).fill(false);
    buttons[0] = true; // A -> Enter (13)
    buttons[12] = true; // D-pad up -> Up arrow (38)
    const result = m.mapGamepadState(undefined, gamepad(buttons));
    assert.deepStrictEqual(result.events, [
      { type: "down", code: 0, keyCode: 13 },
      { type: "down", code: 12, keyCode: 38 },
    ]);
  }),
);

pending.push(
  test("mapGamepadState: an axis value inside the 0.5 deadzone emits nothing, crossing it emits down/up", () => {
    const inside = m.mapGamepadState(undefined, gamepad([], [0.3]));
    assert.deepStrictEqual(inside.events, []);

    const crossed = m.mapGamepadState(inside.state, gamepad([], [0.6]));
    assert.deepStrictEqual(crossed.events, [{ type: "down", code: 1013, keyCode: 39 }]);

    const released = m.mapGamepadState(crossed.state, gamepad([], [0.1]));
    assert.deepStrictEqual(released.events, [{ type: "up", code: 1013, keyCode: 39 }]);
  }),
);

pending.push(
  test("mapGamepadState: the right stick's Cobalt direction codes (1015-1018) also resolve to arrow keys", () => {
    // axis index 3 = right stick X; positive -> code 1017 -> keyCode 39 (Right)
    const right = m.mapGamepadState(undefined, gamepad([], [0, 0, 0, 0.7]));
    assert.deepStrictEqual(right.events, [{ type: "down", code: 1017, keyCode: 39 }]);
  }),
);

pending.push(
  test("mapGamepadState: R3 (button 11) resolves to the open-settings action, not a keyCode, and its keyup is silent", () => {
    const buttons = new Array(12).fill(false);
    buttons[11] = true;
    const down = m.mapGamepadState(undefined, gamepad(buttons));
    assert.deepStrictEqual(down.events, [{ type: "down", action: "open-settings" }]);

    const up = m.mapGamepadState(down.state, gamepad(new Array(12).fill(false)));
    assert.deepStrictEqual(up.events, []);
  }),
);

pending.push(
  test("mapGamepadState: an unmapped button index falls back to the F24 keyCode (135)", () => {
    const buttons = new Array(4).fill(false);
    buttons[3] = true; // Y is intentionally absent from GAMEPAD_KEY_CODE_MAP
    const result = m.mapGamepadState(undefined, gamepad(buttons));
    assert.deepStrictEqual(result.events, [{ type: "down", code: 3, keyCode: m.GAMEPAD_FALLBACK_KEYCODE }]);
  }),
);

pending.push(
  test("GAMEPAD_KEY_CODE_MAP matches VacuumTube's controller-support.js map verbatim", () => {
    assert.deepStrictEqual(
      { 0: m.GAMEPAD_KEY_CODE_MAP[0], 1: m.GAMEPAD_KEY_CODE_MAP[1], 2: m.GAMEPAD_KEY_CODE_MAP[2] },
      { 0: 13, 1: 27, 2: 170 },
    );
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[4], 115);
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[5], 116);
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[6], 113);
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[7], 114);
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[8], 189);
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[9], 187);
    assert.strictEqual(m.GAMEPAD_KEY_CODE_MAP[10], 77);
    assert.deepStrictEqual(
      [12, 13, 14, 15].map((i) => m.GAMEPAD_KEY_CODE_MAP[i]),
      [38, 40, 37, 39],
    );
    assert.deepStrictEqual(
      [1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018].map((i) => m.GAMEPAD_KEY_CODE_MAP[i]),
      [37, 38, 39, 40, 37, 38, 39, 40],
    );
    assert.strictEqual(m.GAMEPAD_SETTINGS_BUTTON, 11);
    assert.strictEqual(m.GAMEPAD_FALLBACK_KEYCODE, 135);
  }),
);

// ---------------------------------------------------------------------------
// keybindFor — every binding, plus modifiers that should NOT match
// ---------------------------------------------------------------------------

pending.push(
  test("keybindFor: Ctrl+O opens settings", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "o", ctrlKey: true }), "open-settings");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "O", ctrlKey: true }), "open-settings");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "o", ctrlKey: false }), null, "plain O must not match");
  }),
);

pending.push(
  test("keybindFor: F11 toggles fullscreen", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "F11" }), "toggle-fullscreen");
  }),
);

pending.push(
  test("keybindFor: Shift+Enter is the long-press binding, plain Enter is not", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "Enter", shiftKey: true }), "longpress-enter");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "Enter", shiftKey: false }), null);
  }),
);

pending.push(
  test("keybindFor: Ctrl+Shift+C copies the URL and takes priority over the plain captions toggle", () => {
    assert.strictEqual(
      m.keybindFor({ type: "keydown", key: "c", ctrlKey: true, shiftKey: true }),
      "copy-url",
    );
    assert.strictEqual(
      m.keybindFor({ type: "keydown", key: "C", ctrlKey: true, shiftKey: true }),
      "copy-url",
    );
  }),
);

pending.push(
  test("keybindFor: Ctrl+Shift+M toggles the mini-player, but not Ctrl+M or Shift+M alone", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "m", ctrlKey: true, shiftKey: true }), "toggle-mini");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "M", ctrlKey: true, shiftKey: true }), "toggle-mini");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "m", ctrlKey: true, shiftKey: false }), null);
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "m", ctrlKey: false, shiftKey: true }), null);
  }),
);

pending.push(
  test("keybindFor: plain C toggles captions, but not with Ctrl/Shift/Meta held", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "c" }), "toggle-captions");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "c", ctrlKey: true }), null);
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "c", shiftKey: true }), null);
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "c", metaKey: true }), null);
  }),
);

pending.push(
  test("keybindFor: right mouse button is the back binding, other buttons are not", () => {
    assert.strictEqual(m.keybindFor({ type: "mousedown", button: 2 }), "back");
    assert.strictEqual(m.keybindFor({ type: "mousedown", button: 0 }), null);
    assert.strictEqual(m.keybindFor({ type: "mousedown", button: 1 }), null);
  }),
);

pending.push(
  test("keybindFor: an unrelated key/event yields null", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "a" }), null);
    assert.strictEqual(m.keybindFor(null), null);
    assert.strictEqual(m.keybindFor({ type: "mouseup", button: 2 }), null);
  }),
);

pending.push(
  test("volumeActionFor: +/-/M match both real keys and synthetic numeric keyCodes, with no modifier gating", () => {
    assert.strictEqual(m.volumeActionFor({ type: "keydown", key: "+" }), "volume-up");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", key: "=" }), "volume-up");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", keyCode: 187 }), "volume-up");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", key: "-" }), "volume-down");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", keyCode: 189 }), "volume-down");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", key: "m" }), "mute");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", key: "M" }), "mute");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", keyCode: 77 }), "mute");
    assert.strictEqual(m.volumeActionFor({ type: "keydown", key: "a" }), null);
    assert.strictEqual(m.volumeActionFor({ type: "keyup", key: "+" }), null);
  }),
);

// ---------------------------------------------------------------------------
// deepLinkToHash — video / playlist / reject everything else
// ---------------------------------------------------------------------------

pending.push(
  test("deepLinkToHash: a canonical video URL becomes a Leanback watch hash route", () => {
    assert.strictEqual(
      m.deepLinkToHash("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      "#/watch?v=dQw4w9WgXcQ",
    );
  }),
);

pending.push(
  test("deepLinkToHash: a canonical playlist URL becomes a Leanback playlist hash route", () => {
    assert.strictEqual(
      m.deepLinkToHash("https://www.youtube.com/playlist?list=PL1234567890abcdef"),
      "#/playlist?list=PL1234567890abcdef",
    );
  }),
);

pending.push(
  test("deepLinkToHash: rejects non-canonical hosts, schemes, paths, and malformed ids", () => {
    const rejected = [
      null,
      undefined,
      "",
      "not a url",
      "javascript:alert(1)",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ", // wrong scheme
      "https://youtube.com/watch?v=dQw4w9WgXcQ", // missing www
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ", // wrong host for the hash form
      "https://www.youtube.com/watch?v=short", // id too short
      "https://www.youtube.com/watch", // no id
      "https://www.youtube.com/", // unrelated path
      "https://evil.example.com/watch?v=dQw4w9WgXcQ",
    ];
    rejected.forEach((url) => {
      assert.strictEqual(m.deepLinkToHash(url), null, `expected null for ${JSON.stringify(url)}`);
    });
  }),
);

// ---------------------------------------------------------------------------
// buildShareUrl (Ctrl+Shift+C) — query-stripped watch/playlist URL
// ---------------------------------------------------------------------------

pending.push(
  test("buildShareUrl: strips everything but v/list, reading them from the Leanback hash route", () => {
    assert.strictEqual(
      m.buildShareUrl("https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ&list=PLabc&t=42&index=3"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc",
    );
  }),
);

pending.push(
  test("buildShareUrl: also reads v/list from a plain query string", () => {
    assert.strictEqual(
      m.buildShareUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&index=2"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  }),
);

pending.push(
  test("buildShareUrl: playlist-only and no-id/list cases", () => {
    assert.strictEqual(
      m.buildShareUrl("https://www.youtube.com/tv#/playlist?list=PLabc"),
      "https://www.youtube.com/playlist?list=PLabc",
    );
    assert.strictEqual(m.buildShareUrl("https://www.youtube.com/tv#/browse"), null);
    assert.strictEqual(m.buildShareUrl(""), null);
    assert.strictEqual(m.buildShareUrl(null), null);
  }),
);

// ---------------------------------------------------------------------------
// clampVolume
// ---------------------------------------------------------------------------

pending.push(
  test("clampVolume: clamps to [0, 100] and rounds, non-numeric becomes 0", () => {
    assert.strictEqual(m.clampVolume(150), 100);
    assert.strictEqual(m.clampVolume(-10), 0);
    assert.strictEqual(m.clampVolume(42.6), 43);
    assert.strictEqual(m.clampVolume("nope"), 0);
    assert.strictEqual(m.clampVolume(undefined), 0);
  }),
);

// ---------------------------------------------------------------------------
// codecAllowed / installCodecFilter
// ---------------------------------------------------------------------------

function makeCodecStubWin() {
  const mediaSource = {
    isTypeSupported(type) { return typeof type === "string" && type.indexOf("mp4") !== -1; },
  };
  const proto = {
    canPlayType(type) { return typeof type === "string" && type.indexOf("mp4") !== -1 ? "probably" : ""; },
  };
  return { MediaSource: mediaSource, HTMLMediaElement: { prototype: proto } };
}

pending.push(
  test("codecAllowed: \"off\" allows everything; \"h264\" blocks vp8/vp9/av01 case-insensitively and allows the rest", () => {
    assert.strictEqual(m.codecAllowed('video/webm; codecs="vp9"', "off"), true);
    assert.strictEqual(m.codecAllowed('video/webm; codecs="vp9"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/webm; codecs="VP8"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/mp4; codecs="av01.0.05M.08"', "h264"), false);
    assert.strictEqual(m.codecAllowed('video/mp4; codecs="avc1.640028"', "h264"), true);
    assert.strictEqual(m.codecAllowed('video/webm; codecs="opus"', "h264"), true, "plain webm without vp8/vp9 is not blocked");
    assert.strictEqual(m.codecAllowed("", "h264"), true);
    assert.strictEqual(m.codecAllowed(undefined, "h264"), true);
  }),
);

pending.push(
  test("installCodecFilter: \"off\" installs nothing — MediaSource.isTypeSupported and canPlayType are left untouched", () => {
    const win = makeCodecStubWin();
    const originalIsSupported = win.MediaSource.isTypeSupported;
    const originalCanPlay = win.HTMLMediaElement.prototype.canPlayType;

    m.installCodecFilter(win, "off");

    assert.strictEqual(win.MediaSource.isTypeSupported, originalIsSupported);
    assert.strictEqual(win.HTMLMediaElement.prototype.canPlayType, originalCanPlay);
  }),
);

pending.push(
  test("installCodecFilter: \"h264\" wraps both APIs to reject vp8/vp9/av01 and defer to the original for everything else", () => {
    const win = makeCodecStubWin();
    m.installCodecFilter(win, "h264");

    assert.strictEqual(win.MediaSource.isTypeSupported('video/webm; codecs="vp9"'), false);
    assert.strictEqual(win.MediaSource.isTypeSupported('video/mp4; codecs="avc1.640028"'), true);

    assert.strictEqual(win.HTMLMediaElement.prototype.canPlayType('video/webm; codecs="vp8"'), "");
    assert.strictEqual(win.HTMLMediaElement.prototype.canPlayType('video/mp4; codecs="avc1.640028"'), "probably");
  }),
);

// ---------------------------------------------------------------------------
// readPrefs / applyPrefsUpdate — documented defaults
// ---------------------------------------------------------------------------

pending.push(
  test("readPrefs: documented defaults when window.__LALIN_PREFS__ is missing", () => {
    assert.deepStrictEqual(m.readPrefs(undefined), {
      lang: "th",
      controllerEnabled: true,
      pauseOnBlur: false,
      deepLink: null,
      codecFilter: "off",
      touchOverlay: true,
    });
    assert.deepStrictEqual(m.readPrefs(null), m.readPrefs(undefined));
  }),
);

pending.push(
  test("readPrefs: respects explicit values from a well-formed prefs object", () => {
    assert.deepStrictEqual(
      m.readPrefs({
        lang: "en",
        controllerEnabled: false,
        pauseOnBlur: true,
        deepLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        codecFilter: "h264",
        touchOverlay: false,
      }),
      {
        lang: "en",
        controllerEnabled: false,
        pauseOnBlur: true,
        deepLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        codecFilter: "h264",
        touchOverlay: false,
      },
    );
  }),
);

pending.push(
  test("readPrefs: an unrecognized codecFilter value falls back to the documented \"off\" default", () => {
    assert.strictEqual(m.readPrefs({ codecFilter: "vp9-only" }).codecFilter, "off");
    assert.strictEqual(m.readPrefs({ codecFilter: "off" }).codecFilter, "off");
  }),
);

pending.push(
  test("applyPrefsUpdate: merges a lalin-cast-prefs payload, ignoring unknown/malformed fields and never touching deepLink", () => {
    const prev = {
      lang: "th",
      controllerEnabled: true,
      pauseOnBlur: false,
      deepLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      codecFilter: "off",
      touchOverlay: true,
    };
    const next = m.applyPrefsUpdate(prev, {
      lang: "en",
      controllerEnabled: false,
      pauseOnBlur: true,
      deepLink: "ignored",
      codecFilter: "h264",
      touchOverlay: false,
    });
    assert.deepStrictEqual(next, {
      lang: "en",
      controllerEnabled: false,
      pauseOnBlur: true,
      deepLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      codecFilter: "h264",
      touchOverlay: false,
    });

    const unchanged = m.applyPrefsUpdate(prev, { controllerEnabled: "not-a-boolean", lang: "fr", codecFilter: "vp9-only", touchOverlay: "nope" });
    assert.deepStrictEqual(unchanged, prev);
  }),
);

// ---------------------------------------------------------------------------
// Gamepad controller wiring: does not poll when off; prefs updates start/stop it
// ---------------------------------------------------------------------------

pending.push(
  test("createGamepadController: start() does nothing while disabled; enabling then starts it", () => {
    const doc = createStubDoc();
    const win = createStubWin({ navigator: { getGamepads: () => [] } });
    const controller = m.createGamepadController(doc, win, { getEnabled: () => false });

    controller.start();
    assert.strictEqual(win.__rafCalls.length, 0, "must not call requestAnimationFrame while disabled");
    assert.strictEqual(controller.isPolling(), false);
  }),
);

pending.push(
  test("createGamepadController: start() polls once per call while enabled; stop() cancels", () => {
    const doc = createStubDoc();
    const win = createStubWin({ navigator: { getGamepads: () => [] } });
    const controller = m.createGamepadController(doc, win, { getEnabled: () => true });

    controller.start();
    assert.strictEqual(win.__rafCalls.length, 1);
    assert.strictEqual(controller.isPolling(), true);

    controller.start(); // idempotent
    assert.strictEqual(win.__rafCalls.length, 1);

    controller.stop();
    assert.strictEqual(controller.isPolling(), false);
  }),
);

pending.push(
  test("a lalin-cast-prefs update starts/stops the gamepad poller (mirrors boot()'s wiring)", () => {
    const doc = createStubDoc();
    const win = createStubWin({ navigator: { getGamepads: () => [] } });

    let prefs = m.readPrefs({ controllerEnabled: false });
    const controller = m.createGamepadController(doc, win, { getEnabled: () => prefs.controllerEnabled });
    const onPrefsChange = (next) => {
      if (next.controllerEnabled) controller.start();
      else controller.stop();
    };

    if (prefs.controllerEnabled) controller.start();
    assert.strictEqual(controller.isPolling(), false, "starts disabled per the incoming prefs");

    prefs = m.applyPrefsUpdate(prefs, { controllerEnabled: true });
    onPrefsChange(prefs);
    assert.strictEqual(controller.isPolling(), true, "enabling the pref starts polling");

    prefs = m.applyPrefsUpdate(prefs, { controllerEnabled: false });
    onPrefsChange(prefs);
    assert.strictEqual(controller.isPolling(), false, "disabling the pref stops polling");
  }),
);

pending.push(
  test("createGamepadController: dispatches keydown/keyup through doc.dispatchEvent and R3 opens settings", () => {
    const doc = createStubDoc();
    const seen = [];
    doc.addEventListener("keydown", (e) => seen.push(["down", e.keyCode]));
    doc.addEventListener("keyup", (e) => seen.push(["up", e.keyCode]));

    let opened = 0;
    let gp = gamepad([true, false]); // button 0 (A) pressed
    const win = createStubWin({ navigator: { getGamepads: () => [gp] } });
    const controller = m.createGamepadController(doc, win, {
      getEnabled: () => true,
      onOpenSettings: () => { opened += 1; },
    });

    controller.start();
    win.__rafCalls.shift()(); // run the first poll frame
    assert.deepStrictEqual(seen, [["down", 13]]);

    gp = gamepad([false, false]);
    win.__rafCalls.shift()(); // release
    assert.deepStrictEqual(seen, [["down", 13], ["up", 13]]);

    gp = gamepad([false, false, false, false, false, false, false, false, false, false, false, true]);
    win.__rafCalls.shift()(); // R3 down
    assert.strictEqual(opened, 1);
  }),
);

// ---------------------------------------------------------------------------
// Keybind handler wiring: Ctrl+O / F11 dispatch shell actions; captions gate
// ---------------------------------------------------------------------------

pending.push(
  test("createKeybindHandler: Ctrl+O emits open-settings and blocks the event", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    let opened = 0;
    m.createKeybindHandler(doc, win, { onOpenSettings: () => { opened += 1; } });

    const e = keyEvent({ key: "o", ctrlKey: true });
    let defaultPrevented = false;
    const originalPreventDefault = e.preventDefault.bind(e);
    e.preventDefault = () => { defaultPrevented = true; originalPreventDefault(); };
    doc.dispatchEvent(e);

    assert.strictEqual(opened, 1);
    assert.strictEqual(defaultPrevented, true);
  }),
);

pending.push(
  test("createKeybindHandler: F11 emits toggle-fullscreen", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    let toggled = 0;
    m.createKeybindHandler(doc, win, { onToggleFullscreen: () => { toggled += 1; } });

    doc.dispatchEvent(keyEvent({ key: "F11" }));
    assert.strictEqual(toggled, 1);
  }),
);

pending.push(
  test("createKeybindHandler: Ctrl+Shift+M emits toggle-mini and suppresses the volume handler's plain-M mute registered after it", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    let toggled = 0;
    m.createKeybindHandler(doc, win, { onToggleMini: () => { toggled += 1; } });

    // Registered after createKeybindHandler, on the same doc/capture phase —
    // exactly boot()'s real ordering — so this proves stopImmediatePropagation
    // in the "toggle-mini" case actually reaches this handler.
    const volumeControl = m.createVolumeControl(doc, { win, initialVolume: 50 });
    m.createVolumeKeydownHandler(doc, win, volumeControl);

    doc.dispatchEvent(keyEvent({ key: "M", ctrlKey: true, shiftKey: true }));
    assert.strictEqual(toggled, 1);
    assert.strictEqual(volumeControl.isMuted(), false, "toggle-mini must stop the event before the volume handler's mute fires");
  }),
);

pending.push(
  test("createKeybindHandler: C only dispatches a synthetic captions keyCode while on a watch/shorts page", () => {
    const doc = createStubDoc({ bodyClasses: [] });
    const win = createStubWin();
    const seen = [];
    doc.addEventListener("keydown", (e) => { if (e.keyCode === 67) seen.push(e.keyCode); });
    m.createKeybindHandler(doc, win, {});

    doc.dispatchEvent(keyEvent({ key: "c" }));
    assert.strictEqual(seen.length, 0, "not watching yet, so no dispatch");

    doc.body.classList.add("WEB_PAGE_TYPE_WATCH");
    doc.dispatchEvent(keyEvent({ key: "c" }));
    assert.strictEqual(seen.length, 1);
  }),
);

pending.push(
  test("createKeybindHandler: an unrelated keydown is left completely alone", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    let calls = 0;
    m.createKeybindHandler(doc, win, {
      onOpenSettings: () => { calls += 1; },
      onToggleFullscreen: () => { calls += 1; },
    });
    doc.dispatchEvent(keyEvent({ key: "a" }));
    assert.strictEqual(calls, 0);
  }),
);

// ---------------------------------------------------------------------------
// Clipboard: only ever written from the qualifying keydown
// ---------------------------------------------------------------------------

pending.push(
  test("Ctrl+Shift+C writes the query-stripped URL to the clipboard only from that exact keypress", () => {
    const doc = createStubDoc();
    const writes = [];
    const win = createStubWin({
      navigator: { clipboard: { writeText: (text) => { writes.push(text); return Promise.resolve(); } } },
      location: { href: "https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ&list=PLabc&t=42" },
    });

    m.createKeybindHandler(doc, win, {});
    assert.strictEqual(writes.length, 0, "wiring alone must never touch the clipboard");

    doc.dispatchEvent(keyEvent({ key: "c" })); // plain C: captions, not copy
    assert.strictEqual(writes.length, 0);

    doc.dispatchEvent(keyEvent({ key: "o", ctrlKey: true })); // an unrelated binding
    assert.strictEqual(writes.length, 0);

    doc.dispatchEvent(keyEvent({ key: "c", ctrlKey: true, shiftKey: true }));
    assert.deepStrictEqual(writes, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc"]);
  }),
);

pending.push(
  test("copy-url is silently skipped when there is nothing shareable on the current URL", () => {
    const doc = createStubDoc();
    const writes = [];
    const win = createStubWin({
      navigator: { clipboard: { writeText: (text) => { writes.push(text); return Promise.resolve(); } } },
      location: { href: "https://www.youtube.com/tv#/browse" },
    });
    m.createKeybindHandler(doc, win, {});
    doc.dispatchEvent(keyEvent({ key: "c", ctrlKey: true, shiftKey: true }));
    assert.strictEqual(writes.length, 0);
  }),
);

// ---------------------------------------------------------------------------
// Mouse: right-click dispatches the back (Escape) synthetic key
// ---------------------------------------------------------------------------

pending.push(
  test("createMouseHandler: a right mousedown dispatches a synthetic Escape keydown immediately", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const seen = [];
    doc.addEventListener("keydown", (e) => seen.push(e.keyCode));
    m.createMouseHandler(doc, win);

    const left = new Event("mousedown");
    left.button = 0;
    win.dispatchEvent(left);
    assert.strictEqual(seen.length, 0, "left click must not dispatch back");

    const right = new Event("mousedown");
    right.button = 2;
    win.dispatchEvent(right);
    assert.deepStrictEqual(seen, [27]);
  }),
);

// ---------------------------------------------------------------------------
// Pause on blur: pauses <video> elements only when the pref is enabled
// ---------------------------------------------------------------------------

pending.push(
  test("shouldPauseOnBlur mirrors the pauseOnBlur pref exactly", () => {
    assert.strictEqual(m.shouldPauseOnBlur({ pauseOnBlur: true }), true);
    assert.strictEqual(m.shouldPauseOnBlur({ pauseOnBlur: false }), false);
    assert.strictEqual(m.shouldPauseOnBlur({}), false);
    assert.strictEqual(m.shouldPauseOnBlur(null), false);
  }),
);

pending.push(
  test("createPauseOnBlurHandler: a window blur pauses every <video> only when pauseOnBlur is enabled", () => {
    const videoA = { paused: false, pause() { this.paused = true; } };
    const videoB = { paused: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA, videoB] } });
    const win = createStubWin();

    let prefs = { pauseOnBlur: false };
    m.createPauseOnBlurHandler(doc, win, () => prefs);

    win.dispatchEvent(new Event("blur"));
    assert.strictEqual(videoA.paused, false);
    assert.strictEqual(videoB.paused, false);

    prefs = { pauseOnBlur: true };
    win.dispatchEvent(new Event("blur"));
    assert.strictEqual(videoA.paused, true);
    assert.strictEqual(videoB.paused, true);
  }),
);

pending.push(
  test("createPauseOnBlurHandler: blocks visibilitychange from reaching listeners registered after it", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    m.createPauseOnBlurHandler(doc, win, () => ({ pauseOnBlur: false }));

    let laterSaw = false;
    doc.addEventListener("visibilitychange", () => { laterSaw = true; });
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.strictEqual(laterSaw, false, "a listener registered after the handler must not see the event");
  }),
);

// ---------------------------------------------------------------------------
// Volume control: its own OSD/style elements, never YouTube's DOM; gated by isWatchingVideo
// ---------------------------------------------------------------------------

pending.push(
  test("isWatchingVideo: true on a focused short or a /watch?v= baseURI, false otherwise", () => {
    const watchingShort = createStubDoc({ querySelectorResults: { "ytlr-shorts-page.zylon-focus": {} } });
    assert.strictEqual(m.isWatchingVideo(watchingShort, createStubWin()), true);

    const watchingVideo = createStubDoc();
    const win = createStubWin({ yt: { player: { utils: { videoElement_: { baseURI: "https://www.youtube.com/tv#/watch?v=abc" } } } } });
    assert.strictEqual(m.isWatchingVideo(watchingVideo, win), true);

    const browsing = createStubDoc();
    assert.strictEqual(m.isWatchingVideo(browsing, createStubWin()), false);
  }),
);

pending.push(
  test("volume +/-/M build #lalin-cast-volume-osd and <style id=lalin-cast-volume-style>, and call player.setVolume, only while watching", () => {
    const player = { volume: null, setVolume(v) { this.volume = v; } };
    const doc = createStubDoc({ querySelectorAllResults: { ".html5-video-player": [player] } });
    const win = createStubWin({ yt: { player: { utils: { videoElement_: { baseURI: "https://www.youtube.com/tv#/watch?v=abc" } } } } });

    const volumeControl = m.createVolumeControl(doc, { win, initialVolume: 100 });
    m.createVolumeKeydownHandler(doc, win, volumeControl);

    doc.dispatchEvent(keyEvent({ key: "-" }));
    assert.strictEqual(player.volume, 95);
    assert.strictEqual(volumeControl.getVolume(), 95);

    const osd = doc.getElementById("lalin-cast-volume-osd");
    assert.ok(osd, "creates its own OSD element");
    const style = doc.getElementById("lalin-cast-volume-style");
    assert.ok(style, "creates its own style element");
    assert.ok(style.textContent.indexOf("lalin-cast-volume-osd") !== -1);

    doc.dispatchEvent(keyEvent({ key: "m" }));
    assert.strictEqual(player.volume, 0);
    assert.strictEqual(volumeControl.isMuted(), true);
  }),
);

pending.push(
  test("volume keys are ignored (no player call, no state change) when not watching a video", () => {
    const player = { volume: null, setVolume(v) { this.volume = v; } };
    const doc = createStubDoc({ querySelectorAllResults: { ".html5-video-player": [player] } });
    const win = createStubWin(); // no win.yt, no shorts focus

    const volumeControl = m.createVolumeControl(doc, { win, initialVolume: 50 });
    m.createVolumeKeydownHandler(doc, win, volumeControl);

    doc.dispatchEvent(keyEvent({ key: "+" }));
    assert.strictEqual(player.volume, null);
    assert.strictEqual(volumeControl.getVolume(), 50);
  }),
);

pending.push(
  test("volume module also reacts to a synthetic numeric-only keyCode (the controller section's Select/Start/L3 dispatch)", () => {
    const player = { volume: null, setVolume(v) { this.volume = v; } };
    const doc = createStubDoc({ querySelectorAllResults: { ".html5-video-player": [player] } });
    const win = createStubWin({ yt: { player: { utils: { videoElement_: { baseURI: "https://www.youtube.com/tv#/watch?v=abc" } } } } });

    const volumeControl = m.createVolumeControl(doc, { win, initialVolume: 50 });
    m.createVolumeKeydownHandler(doc, win, volumeControl);

    const synthetic = new Event("keydown");
    synthetic.keyCode = 187; // Start button -> volume up, no .key set
    doc.dispatchEvent(synthetic);
    assert.strictEqual(player.volume, 55);
  }),
);

// ---------------------------------------------------------------------------
// Touch overlay: its own #lalin-cast-touch-overlay/style, gated by
// touchstart + the touchOverlay pref; buttons dispatch the shared synthetic
// key technique
// ---------------------------------------------------------------------------

pending.push(
  test("touchButtons: back/ok/four directions/playPause, each with a numeric keyCode and TH/EN labels", () => {
    const th = m.touchButtons("th");
    assert.deepStrictEqual(th.map((b) => b.id).slice().sort(), ["back", "down", "left", "ok", "playPause", "right", "up"]);
    th.forEach((b) => {
      assert.strictEqual(typeof b.keyCode, "number");
      assert.strictEqual(typeof b.label, "string");
      assert.ok(b.label.length > 0);
    });
    assert.strictEqual(th.find((b) => b.id === "back").keyCode, 27);
    assert.strictEqual(th.find((b) => b.id === "ok").keyCode, 13);
    assert.deepStrictEqual(
      ["up", "down", "left", "right"].map((id) => th.find((b) => b.id === id).keyCode),
      [38, 40, 37, 39],
    );

    const en = m.touchButtons("en");
    assert.notStrictEqual(th.find((b) => b.id === "ok").label, en.find((b) => b.id === "ok").label, "TH/EN labels differ");
  }),
);

pending.push(
  test("createTouchOverlay: never creates the overlay while disabled, even after a touchstart", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createTouchOverlay(doc, win, { getLang: () => "th", initialEnabled: false });

    overlay.handleTouchStart();
    assert.strictEqual(doc.getElementById("lalin-cast-touch-overlay"), null);
    assert.strictEqual(overlay.isVisible(), false);
  }),
);

pending.push(
  test("createTouchOverlay: creates its own overlay + style only after the first touchstart while enabled", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createTouchOverlay(doc, win, { getLang: () => "th", initialEnabled: true });

    assert.strictEqual(doc.getElementById("lalin-cast-touch-overlay"), null, "not created before any touch");

    overlay.handleTouchStart();
    assert.ok(doc.getElementById("lalin-cast-touch-overlay"), "created on first touchstart");
    assert.ok(doc.getElementById("lalin-cast-touch-style"), "creates its own style element");
    assert.strictEqual(overlay.isVisible(), true);

    const buttonCountAfterFirstTouch = doc.getElementById("lalin-cast-touch-overlay").children.length;
    overlay.handleTouchStart(); // idempotent: a second touchstart must not rebuild/duplicate the overlay
    assert.strictEqual(doc.getElementById("lalin-cast-touch-overlay").children.length, buttonCountAfterFirstTouch);
  }),
);

pending.push(
  test("createTouchOverlay: hides on setEnabled(false) and reappears on setEnabled(true), mirroring a lalin-cast-prefs update", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createTouchOverlay(doc, win, { getLang: () => "th", initialEnabled: true });
    overlay.handleTouchStart();

    const el = doc.getElementById("lalin-cast-touch-overlay");
    assert.notStrictEqual(el.style.display, "none");

    overlay.setEnabled(false);
    assert.strictEqual(el.style.display, "none");
    assert.strictEqual(overlay.isVisible(), false);

    overlay.setEnabled(true);
    assert.notStrictEqual(el.style.display, "none");
    assert.strictEqual(overlay.isVisible(), true);
  }),
);

pending.push(
  test("createTouchOverlay: a pref that is off at the first touch can still show the overlay once turned on later", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createTouchOverlay(doc, win, { getLang: () => "th", initialEnabled: false });

    overlay.handleTouchStart();
    assert.strictEqual(doc.getElementById("lalin-cast-touch-overlay"), null);

    overlay.setEnabled(true);
    assert.ok(doc.getElementById("lalin-cast-touch-overlay"), "the already-registered touch is honored once the pref turns on");
  }),
);

pending.push(
  test("createTouchOverlay buttons dispatch the same synthetic keydown/keyup technique as the controller section", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const seen = [];
    doc.addEventListener("keydown", (e) => seen.push(["down", e.keyCode]));
    doc.addEventListener("keyup", (e) => seen.push(["up", e.keyCode]));

    const overlay = m.createTouchOverlay(doc, win, { getLang: () => "th", initialEnabled: true });
    overlay.handleTouchStart();

    const back = overlay.getButton("back");
    assert.ok(back, "back button exists");
    back.dispatchEvent(new Event("touchstart"));
    assert.deepStrictEqual(seen, [["down", 27]]);
    back.dispatchEvent(new Event("touchend"));
    assert.deepStrictEqual(seen, [["down", 27], ["up", 27]]);

    seen.length = 0;
    const playPause = overlay.getButton("playPause");
    playPause.dispatchEvent(new Event("touchstart"));
    assert.deepStrictEqual(seen, [["down", 179]]);
    playPause.dispatchEvent(new Event("touchend"));
    assert.deepStrictEqual(seen, [["down", 179], ["up", 179]]);

    seen.length = 0;
    const ok = overlay.getButton("ok");
    ok.dispatchEvent(new Event("touchstart"));
    assert.deepStrictEqual(seen, [["down", 13]]);

    seen.length = 0;
    const up = overlay.getButton("up");
    up.dispatchEvent(new Event("touchstart"));
    assert.deepStrictEqual(seen, [["down", 38]]);
  }),
);

// ---------------------------------------------------------------------------
// Sleep timer OSD: lalin-cast-sleep pauses every <video> and shows our own
// bilingual #lalin-cast-sleep-osd for 6s
// ---------------------------------------------------------------------------

pending.push(
  test("createSleepOsd.show(): pauses every <video> and creates #lalin-cast-sleep-osd with the documented bilingual text", () => {
    const videoA = { paused: false, pause() { this.paused = true; } };
    const videoB = { paused: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA, videoB] } });
    const win = createStubWin();

    const osd = m.createSleepOsd(doc, win);
    osd.show();

    assert.strictEqual(videoA.paused, true);
    assert.strictEqual(videoB.paused, true);

    const el = doc.getElementById("lalin-cast-sleep-osd");
    assert.ok(el, "creates its own OSD element");
    assert.strictEqual(el.textContent, "หมดเวลาตั้งนอน — หยุดเล่นแล้ว / Sleep timer: playback paused");
    assert.notStrictEqual(el.style.display, "none");
  }),
);

pending.push(
  test("createSleepOsd.show(): hides itself after the documented 6s, and a second show() re-displays it", () => {
    const doc = createStubDoc({ querySelectorAllResults: { video: [] } });
    const win = createStubWin();
    const osd = m.createSleepOsd(doc, win);

    osd.show();
    const el = doc.getElementById("lalin-cast-sleep-osd");
    assert.notStrictEqual(el.style.display, "none");

    const scheduled = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    assert.strictEqual(scheduled.ms, m.SLEEP_OSD_VISIBLE_MS);
    win.clearTimeout(scheduled.id); // don't let the real 6s timer also fire
    scheduled.cb();
    assert.strictEqual(el.style.display, "none");

    osd.show();
    assert.notStrictEqual(el.style.display, "none");
    win.clearTimeout(win.__timeoutCalls[win.__timeoutCalls.length - 1].id);
  }),
);

pending.push(
  test("initSleepListener: a lalin-cast-sleep event from Rust pauses videos and shows the OSD", () => {
    const videoA = { paused: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();

    const listeners = [];
    const tauri = { event: { listen: (name, cb) => { listeners.push([name, cb]); return Promise.resolve(); } } };

    return m.initSleepListener(doc, win, tauri).then(() => {
      assert.strictEqual(listeners.length, 1);
      assert.strictEqual(listeners[0][0], "lalin-cast-sleep");

      listeners[0][1]({ payload: { minutes: 30 } });
      assert.strictEqual(videoA.paused, true);
      const el = doc.getElementById("lalin-cast-sleep-osd");
      assert.ok(el);
      win.clearTimeout(win.__timeoutCalls[win.__timeoutCalls.length - 1].id);
    });
  }),
);

pending.push(
  test("initSleepListener: does nothing when the bridge has no event.listen", () => {
    const doc = createStubDoc({ querySelectorAllResults: { video: [] } });
    const win = createStubWin();
    return m.initSleepListener(doc, win, {}).then(() => {
      assert.strictEqual(doc.getElementById("lalin-cast-sleep-osd"), null);
    });
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
