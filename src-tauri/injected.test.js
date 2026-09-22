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
  // overlay's buttons and the wave 5 help overlay's backdrop click — work
  // against this stub exactly like a real DOM element, on top of the same
  // plain property bag every other section of injected.js already relies on
  // (id, className, textContent, style, children, classList, appendChild,
  // setAttribute/getAttribute — the last pair added for wave 5's
  // role="dialog"/aria-modal help overlay).
  const classSet = new Set();
  const attributes = {};
  const el = new EventTarget();
  Object.assign(el, {
    id: "",
    className: "",
    textContent: "",
    style: {},
    children: [],
    // wave 8: plain object standing in for the real DOMStringMap, good
    // enough for applyHidePrefsToDocument's set-or-delete usage below.
    dataset: {},
    // wave 8: tag/parent/querySelector for the hide-section matchers and
    // scanAndHide's activeElement-ancestor walk. `tagName` defaults empty
    // (a test sets it explicitly); `querySelector` defaults to "no nested
    // match" and a test overrides it per case.
    tagName: "",
    parentElement: null,
    querySelector() { return null; },
    classList: {
      add(c) { classSet.add(c); },
      remove(c) { classSet.delete(c); },
      contains(c) { return classSet.has(c); },
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  });
  return el;
}

// Builds a keydown/ratechange/loadedmetadata-style Event whose `.target`
// reports `target` when read, even though the event is dispatched directly
// on `doc` (this file's established convention — see e.g. `keyEvent()`
// above) rather than on `target` itself. `Event.prototype.target` is a
// getter with no setter (assigning `.target` directly throws in strict
// mode), but it IS configurable, so `defineProperty` can shadow it with an
// own property; Node's dispatchEvent does not touch that own property, so
// listeners invoked during dispatch see it. Used by the wave 5 speed
// section (ratechange/loadedmetadata need to know which <video> changed).
function eventWithTarget(type, target, fields) {
  const e = new Event(type);
  Object.defineProperty(e, "target", { value: target, configurable: true });
  Object.assign(e, fields || {});
  return e;
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
  // wave 8: scanAndHide's focus-protection walk reads doc.activeElement.
  doc.activeElement = Object.prototype.hasOwnProperty.call(opts, "activeElement") ? opts.activeElement : null;
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
    const buttons = new Array(17).fill(false);
    buttons[16] = true; // outside GAMEPAD_KEY_CODE_MAP and not R3/Y
    const result = m.mapGamepadState(undefined, gamepad(buttons));
    assert.deepStrictEqual(result.events, [{ type: "down", code: 16, keyCode: m.GAMEPAD_FALLBACK_KEYCODE }]);
  }),
);

pending.push(
  test("mapGamepadState: Y (button 3, wave 6) resolves to the toggle-help action, not a keyCode, and its keyup is silent", () => {
    const buttons = new Array(4).fill(false);
    buttons[3] = true;
    const down = m.mapGamepadState(undefined, gamepad(buttons));
    assert.deepStrictEqual(down.events, [{ type: "down", action: "toggle-help" }]);

    const up = m.mapGamepadState(down.state, gamepad(new Array(4).fill(false)));
    assert.deepStrictEqual(up.events, []);
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
    assert.strictEqual(m.GAMEPAD_HELP_BUTTON, 3);
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
      sleepAtEndOfVideo: false,
      hideShorts: false,
      hideGuideTabs: false,
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
        sleepAtEndOfVideo: true,
        hideShorts: true,
        hideGuideTabs: true,
      }),
      {
        lang: "en",
        controllerEnabled: false,
        pauseOnBlur: true,
        deepLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        codecFilter: "h264",
        touchOverlay: false,
        sleepAtEndOfVideo: true,
        hideShorts: true,
        hideGuideTabs: true,
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
      sleepAtEndOfVideo: false,
      hideShorts: false,
      hideGuideTabs: false,
    };
    const next = m.applyPrefsUpdate(prev, {
      lang: "en",
      controllerEnabled: false,
      pauseOnBlur: true,
      deepLink: "ignored",
      codecFilter: "h264",
      touchOverlay: false,
      sleepAtEndOfVideo: true,
      hideShorts: true,
      hideGuideTabs: true,
    });
    assert.deepStrictEqual(next, {
      lang: "en",
      controllerEnabled: false,
      pauseOnBlur: true,
      deepLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      codecFilter: "h264",
      touchOverlay: false,
      sleepAtEndOfVideo: true,
      hideShorts: true,
      hideGuideTabs: true,
    });

    const unchanged = m.applyPrefsUpdate(prev, {
      controllerEnabled: "not-a-boolean",
      lang: "fr",
      codecFilter: "vp9-only",
      touchOverlay: "nope",
      sleepAtEndOfVideo: "nope",
      hideShorts: "nope",
      hideGuideTabs: "nope",
    });
    assert.deepStrictEqual(unchanged, prev);
  }),
);

pending.push(
  test("readPrefs/applyPrefsUpdate: sleepAtEndOfVideo defaults false and only a strict boolean true is accepted", () => {
    assert.strictEqual(m.readPrefs(undefined).sleepAtEndOfVideo, false);
    assert.strictEqual(m.readPrefs({ sleepAtEndOfVideo: "true" }).sleepAtEndOfVideo, false, "non-boolean is ignored");
    assert.strictEqual(m.readPrefs({ sleepAtEndOfVideo: true }).sleepAtEndOfVideo, true);

    const prev = m.readPrefs(undefined);
    assert.strictEqual(m.applyPrefsUpdate(prev, { sleepAtEndOfVideo: true }).sleepAtEndOfVideo, true);
    assert.strictEqual(m.applyPrefsUpdate(prev, { sleepAtEndOfVideo: "true" }).sleepAtEndOfVideo, false, "non-boolean payload is ignored");
    const armed = m.applyPrefsUpdate(prev, { sleepAtEndOfVideo: true });
    assert.strictEqual(m.applyPrefsUpdate(armed, {}).sleepAtEndOfVideo, true, "an update with no field keeps the previous value");
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

pending.push(
  test("createGamepadController: Y (button 3, wave 6) toggles help, and only while the controller is actually polling", () => {
    const doc = createStubDoc();
    let gp = gamepad([false, false, false, true]); // Y pressed
    const win = createStubWin({ navigator: { getGamepads: () => [gp] } });
    let helped = 0;
    const controller = m.createGamepadController(doc, win, {
      getEnabled: () => true,
      onToggleHelp: () => { helped += 1; },
    });

    controller.start();
    win.__rafCalls.shift()(); // Y down
    assert.strictEqual(helped, 1);

    gp = gamepad([false, false, false, false]);
    win.__rafCalls.shift()(); // Y up -> silent
    assert.strictEqual(helped, 1);

    controller.stop();

    // Disabled controller (e.g. controllerEnabled=false in prefs): boot()
    // never even calls start(), so no poll frame is ever scheduled and Y can
    // never reach onToggleHelp — the same implicit gate R3/open-settings
    // already relies on.
    const disabledWin = createStubWin({ navigator: { getGamepads: () => [gamepad([false, false, false, true])] } });
    const disabledController = m.createGamepadController(doc, disabledWin, {
      getEnabled: () => false,
      onToggleHelp: () => { helped += 1; },
    });
    disabledController.start();
    assert.strictEqual(disabledWin.__rafCalls.length, 0);
    assert.strictEqual(helped, 1, "still 1 — disabled controller never polls at all");
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

// ---------------------------------------------------------------------------
// Wave 6 — Remote: remoteActionAllowed, toggleRemotePlayback, createRemoteHandler,
// initRemoteListener (docs/plans/W6_POLISH_PLAN.md, "Remote"). Lalin Cast
// original — no VacuumTube module offers a remote play/pause bridge.
// ---------------------------------------------------------------------------

pending.push(
  test("remoteActionAllowed: whitelists exactly {action: \"toggle-play\"} and rejects everything else", () => {
    assert.strictEqual(m.remoteActionAllowed({ action: "toggle-play" }, null, 0), true);
    assert.strictEqual(m.remoteActionAllowed({ action: "toggle-play", extra: 1 }, null, 0), true, "extra fields are fine");
    assert.strictEqual(m.remoteActionAllowed({ action: "close-app" }, null, 0), false);
    assert.strictEqual(m.remoteActionAllowed({ action: "TOGGLE-PLAY" }, null, 0), false, "case-sensitive");
    assert.strictEqual(m.remoteActionAllowed(null, null, 0), false);
    assert.strictEqual(m.remoteActionAllowed(undefined, null, 0), false);
    assert.strictEqual(m.remoteActionAllowed("toggle-play", null, 0), false, "must be an object, not the bare string");
    assert.strictEqual(m.remoteActionAllowed({}, null, 0), false);
  }),
);

pending.push(
  test(`remoteActionAllowed: rate-limits to one accepted call per ${"250"}ms`, () => {
    assert.strictEqual(m.remoteActionAllowed({ action: "toggle-play" }, 1000, 1249), false, "249ms later is still inside the window");
    assert.strictEqual(m.remoteActionAllowed({ action: "toggle-play" }, 1000, 1250), true, "exactly 250ms later is allowed");
    assert.strictEqual(m.remoteActionAllowed({ action: "toggle-play" }, 1000, 2000), true);
    assert.strictEqual(m.remoteActionAllowed({ action: "toggle-play" }, null, 0), true, "no prior call at all is always allowed");
  }),
);

pending.push(
  test("toggleRemotePlayback: pauses every <video> when any one is playing", () => {
    const videoA = { paused: false, ended: false, pause() { this.paused = true; } };
    const videoB = { paused: true, ended: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA, videoB] } });
    m.toggleRemotePlayback(doc);
    assert.strictEqual(videoA.paused, true);
    assert.strictEqual(videoB.paused, true);
  }),
);

pending.push(
  test("toggleRemotePlayback: an ended video does not count as \"playing\" — a paused/ended pair still plays the paused one", () => {
    const ended = { paused: false, ended: true, pause() {} };
    let played = false;
    const paused = { paused: true, ended: false, play() { played = true; return Promise.resolve(); } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [ended, paused] } });
    m.toggleRemotePlayback(doc);
    assert.strictEqual(played, true);
  }),
);

pending.push(
  test("toggleRemotePlayback: no video playing -> play()s the first paused video and swallows a rejected promise", () => {
    let played = 0;
    const videoA = { paused: true, ended: false, play() { played += 1; return Promise.reject(new Error("nope")); } };
    const videoB = { paused: true, ended: false, play() { played += 1; return Promise.resolve(); } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA, videoB] } });
    m.toggleRemotePlayback(doc);
    assert.strictEqual(played, 1, "only the first paused video is played");
    return new Promise((resolve) => setTimeout(resolve, 0)); // let the swallowed rejection settle
  }),
);

pending.push(
  test("toggleRemotePlayback: no <video> at all is a silent no-op", () => {
    const doc = createStubDoc({ querySelectorAllResults: { video: [] } });
    assert.doesNotThrow(() => m.toggleRemotePlayback(doc));
  }),
);

pending.push(
  test("createRemoteHandler: toggle-play in both directions (pause when playing, play when paused)", () => {
    const videoA = { paused: false, ended: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();
    let t = 0;
    const remote = m.createRemoteHandler(doc, win, { now: () => t });

    remote.handler({ action: "toggle-play" });
    assert.strictEqual(videoA.paused, true, "playing -> paused");

    t = 1000; // well past the 250ms rate limit
    let played = false;
    videoA.play = () => { played = true; videoA.paused = false; return Promise.resolve(); };
    remote.handler({ action: "toggle-play" });
    assert.strictEqual(played, true, "paused -> played");
  }),
);

pending.push(
  test("createRemoteHandler: an unknown action does nothing", () => {
    const videoA = { paused: false, ended: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();
    const remote = m.createRemoteHandler(doc, win, { now: () => 0 });

    remote.handler({ action: "close-app" });
    assert.strictEqual(videoA.paused, false);
    remote.handler(null);
    assert.strictEqual(videoA.paused, false);
  }),
);

pending.push(
  test("createRemoteHandler: a second call within 250ms is rate-limited away", () => {
    let toggles = 0;
    const doc = createStubDoc({
      querySelectorAllResults: {
        video: [{ paused: false, ended: false, pause() { toggles += 1; } }],
      },
    });
    const win = createStubWin();
    let t = 0;
    const remote = m.createRemoteHandler(doc, win, { now: () => t });

    remote.handler({ action: "toggle-play" });
    assert.strictEqual(toggles, 1);

    t = 100; // inside the 250ms window
    remote.handler({ action: "toggle-play" });
    assert.strictEqual(toggles, 1, "rate-limited — must not pause a second time");

    t = 250; // exactly at the boundary — allowed
    remote.handler({ action: "toggle-play" });
    assert.strictEqual(toggles, 2);
  }),
);

pending.push(
  test("initRemoteListener: listens for lalin-cast-remote and drives toggleRemotePlayback via the bridge-wait pattern", () => {
    const videoA = { paused: false, ended: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();

    const listeners = [];
    const tauri = { event: { listen: (name, cb) => { listeners.push([name, cb]); return Promise.resolve(); } } };

    return m.initRemoteListener(doc, win, tauri).then(() => {
      assert.strictEqual(listeners.length, 1);
      assert.strictEqual(listeners[0][0], "lalin-cast-remote");

      listeners[0][1]({ payload: { action: "toggle-play" } });
      assert.strictEqual(videoA.paused, true);
    });
  }),
);

pending.push(
  test("initRemoteListener: does nothing when the bridge has no event.listen", () => {
    const doc = createStubDoc({ querySelectorAllResults: { video: [] } });
    const win = createStubWin();
    // No throw and no listener registration — the bridge-wait pattern's early return.
    return m.initRemoteListener(doc, win, {}).then((result) => {
      assert.strictEqual(result, undefined);
    });
  }),
);

// ---------------------------------------------------------------------------
// Wave 6 — Sleep at end of video: sleepAtEndDecision, createSleepAtEndHandler
// (docs/plans/W6_POLISH_PLAN.md, "Sleep at end of video (U2)"). Lalin Cast
// original — no VacuumTube module offers this.
// ---------------------------------------------------------------------------

pending.push(
  test("sleepAtEndDecision: \"ended\" always (re)arms, regardless of prior state", () => {
    const fromIdle = m.sleepAtEndDecision({ armed: false, deadline: null }, "ended", 1000);
    assert.strictEqual(fromIdle.action, "arm");
    assert.strictEqual(fromIdle.state.armed, true);
    assert.strictEqual(fromIdle.state.deadline, 1000 + m.SLEEP_AT_END_WINDOW_MS);

    const fromArmed = m.sleepAtEndDecision({ armed: true, deadline: 500 }, "ended", 2000);
    assert.strictEqual(fromArmed.action, "arm");
    assert.strictEqual(fromArmed.state.deadline, 2000 + m.SLEEP_AT_END_WINDOW_MS, "re-arming resets the deadline");
  }),
);

pending.push(
  test("sleepAtEndDecision: play/playing while armed pauses-and-shows, then disarms", () => {
    ["play", "playing"].forEach((eventType) => {
      const armed = { armed: true, deadline: 9000 };
      const result = m.sleepAtEndDecision(armed, eventType, 4000);
      assert.strictEqual(result.action, "pause-and-show");
      assert.strictEqual(result.state.armed, false);
    });
  }),
);

pending.push(
  test("sleepAtEndDecision: play/playing while NOT armed does nothing", () => {
    const idle = { armed: false, deadline: null };
    const result = m.sleepAtEndDecision(idle, "play", 4000);
    assert.strictEqual(result.action, "none");
    assert.strictEqual(result.state, idle);
  }),
);

pending.push(
  test("sleepAtEndDecision: \"expire\" while armed disarms silently; while not armed is a no-op", () => {
    const armed = { armed: true, deadline: 9000 };
    const expired = m.sleepAtEndDecision(armed, "expire", 9001);
    assert.strictEqual(expired.action, "disarm");
    assert.strictEqual(expired.state.armed, false);

    const idle = { armed: false, deadline: null };
    const noop = m.sleepAtEndDecision(idle, "expire", 9001);
    assert.strictEqual(noop.action, "none");
    assert.strictEqual(noop.state, idle);
  }),
);

pending.push(
  test("createSleepAtEndHandler: pref off -> an \"ended\" event never arms (no autoplay-next gets paused)", () => {
    const doc = createStubDoc({ querySelectorAllResults: { video: [] } });
    const win = createStubWin();
    const handler = m.createSleepAtEndHandler(doc, win, { getPref: () => false });

    doc.dispatchEvent(new Event("ended"));
    assert.strictEqual(handler.getState().armed, false);

    doc.dispatchEvent(new Event("playing"));
    assert.strictEqual(handler.getState().armed, false, "never armed, so play/playing is a no-op too");
  }),
);

pending.push(
  test("createSleepAtEndHandler: pref on -> autoplay-next (a play within the window) is paused with the OSD shown", () => {
    const videoA = { paused: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();
    const handler = m.createSleepAtEndHandler(doc, win, { getPref: () => true });

    doc.dispatchEvent(new Event("ended"));
    assert.strictEqual(handler.getState().armed, true);

    doc.dispatchEvent(new Event("playing")); // YouTube's autoplay-next
    assert.strictEqual(videoA.paused, true, "the newly-playing video is paused");
    assert.strictEqual(handler.getState().armed, false, "disarmed after pausing");

    const el = doc.getElementById(m.SLEEP_OSD_ID);
    assert.ok(el, "reuses the wave 4 #lalin-cast-sleep-osd element");
    assert.strictEqual(el.textContent, m.SLEEP_AT_END_OSD_TEXT);
    assert.notStrictEqual(el.style.display, "none");

    win.clearTimeout(win.__timeoutCalls[win.__timeoutCalls.length - 1].id);
  }),
);

pending.push(
  test("createSleepAtEndHandler: shares the wave 4 OSD instance with initSleepListener — exactly one #lalin-cast-sleep-osd element ever exists", () => {
    // Repro for the U2 repair round finding: boot() must hoist a single
    // createSleepOsd() instance and hand it to BOTH initSleepListener (wired
    // from initPrefsAndDeepLink) and createSleepAtEndHandler via the `osd`
    // option, so a wave-4 sleep-timer show() and a sleep-at-end
    // pause-and-show() drive the same DOM node instead of each creating
    // their own #lalin-cast-sleep-osd and appending a duplicate id.
    const videoA = { paused: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();

    const sharedOsd = m.createSleepOsd(doc, win);

    // 1) A wave 4 lalin-cast-sleep event, wired the same way boot() wires it
    // (initSleepListener given the shared osd instance).
    const listeners = [];
    const tauri = { event: { listen: (name, cb) => { listeners.push([name, cb]); return Promise.resolve(); } } };
    return m.initSleepListener(doc, win, tauri, sharedOsd).then(() => {
      listeners[0][1]({ payload: { minutes: 30 } });
      win.clearTimeout(win.__timeoutCalls[win.__timeoutCalls.length - 1].id);

      // 2) A sleep-at-end pause-and-show against the SAME doc, using the
      // same shared osd instance (as boot() now does).
      const handler = m.createSleepAtEndHandler(doc, win, { getPref: () => true, osd: sharedOsd });
      doc.dispatchEvent(new Event("ended"));
      doc.dispatchEvent(new Event("playing"));
      win.clearTimeout(win.__timeoutCalls[win.__timeoutCalls.length - 1].id);

      const matches = doc.body.children.filter((c) => c && c.id === m.SLEEP_OSD_ID);
      assert.strictEqual(matches.length, 1, "exactly one #lalin-cast-sleep-osd element was appended, not two");
      assert.strictEqual(matches[0].textContent, m.SLEEP_AT_END_OSD_TEXT, "the shared element shows the latest text");
    });
  }),
);

pending.push(
  test("createSleepAtEndHandler: no play within the 8s window silently disarms — never stays armed forever", () => {
    const doc = createStubDoc({ querySelectorAllResults: { video: [] } });
    const win = createStubWin();
    const handler = m.createSleepAtEndHandler(doc, win, { getPref: () => true });

    doc.dispatchEvent(new Event("ended"));
    assert.strictEqual(handler.getState().armed, true);

    const scheduled = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    assert.strictEqual(scheduled.ms, m.SLEEP_AT_END_WINDOW_MS);
    win.clearTimeout(scheduled.id); // don't let the real 8s timer also fire
    scheduled.cb(); // simulate the 8s expiry

    assert.strictEqual(handler.getState().armed, false);
    assert.strictEqual(doc.getElementById(m.SLEEP_OSD_ID), null, "silent — no OSD shown on a plain expiry");
  }),
);

pending.push(
  test("createSleepAtEndHandler: a play arriving after expiry does nothing (the window already closed)", () => {
    const videoA = { paused: false, pause() { this.paused = true; } };
    const doc = createStubDoc({ querySelectorAllResults: { video: [videoA] } });
    const win = createStubWin();
    const handler = m.createSleepAtEndHandler(doc, win, { getPref: () => true });

    doc.dispatchEvent(new Event("ended"));
    const scheduled = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    win.clearTimeout(scheduled.id);
    scheduled.cb(); // expire first
    assert.strictEqual(handler.getState().armed, false);

    doc.dispatchEvent(new Event("play"));
    assert.strictEqual(videoA.paused, false, "past the window, a play is left alone");
  }),
);

// ---------------------------------------------------------------------------
// Wave 5 — Playback speed: nextRate, formatRate, createSpeedOsd, createSpeedControl
// (docs/plans/W5_DESKTOP_PLAN.md, "Playback speed"). Lalin Cast original —
// no VacuumTube module offers a speed control.
// ---------------------------------------------------------------------------

// Simulates a real HTMLMediaElement, where setting `.playbackRate`
// synchronously fires its own "ratechange" (optionally clamped to a
// different value than requested, e.g. a video that refuses to exceed 1x) —
// used to prove createSpeedControl's internal "applying" flag actually
// suppresses processing its own write, not just that the numbers happen to
// end up the same either way.
function makeSyncRatechangeVideo(doc, clamp) {
  let rate = 1;
  const video = {};
  Object.defineProperty(video, "playbackRate", {
    get() { return rate; },
    set(v) {
      rate = typeof clamp === "function" ? clamp(v) : v;
      doc.dispatchEvent(eventWithTarget("ratechange", video));
    },
  });
  return video;
}

pending.push(
  test("nextRate: steps through SPEED_RATES and clamps at both ends", () => {
    assert.strictEqual(m.nextRate(1, "up"), 1.25);
    assert.strictEqual(m.nextRate(1, "down"), 0.75);
    assert.strictEqual(m.nextRate(1.5, "up"), 1.75);
    assert.strictEqual(m.nextRate(1.5, "down"), 1.25);
    assert.strictEqual(m.nextRate(2, "up"), 2, "clamped at the top entry");
    assert.strictEqual(m.nextRate(0.5, "down"), 0.5, "clamped at the bottom entry");
    assert.strictEqual(m.nextRate(0.5, "up"), 0.75);
    assert.strictEqual(m.nextRate(2, "down"), 1.75);
  }),
);

pending.push(
  test("nextRate: snaps an off-table value to the nearest entry instead of stepping, direction ignored; exact ties favor the lower entry", () => {
    assert.strictEqual(m.nextRate(1.6, "up"), 1.5, "1.6 is nearer 1.5 than 1.75");
    assert.strictEqual(m.nextRate(1.6, "down"), 1.5, "off-table snapping ignores direction");
    assert.strictEqual(m.nextRate(1.125, "up"), 1, "exact tie between 1 and 1.25 keeps the lower entry");
    assert.strictEqual(m.nextRate(3, "up"), 2, "snaps to the nearest entry even far outside the table");
    assert.strictEqual(m.nextRate(0.1, "down"), 0.5);
  }),
);

pending.push(
  test("nextRate: a non-finite/missing current falls back to the documented 1x default", () => {
    assert.strictEqual(m.nextRate(undefined, "up"), 1.25);
    assert.strictEqual(m.nextRate(NaN, "down"), 0.75);
    assert.strictEqual(m.nextRate(null, "up"), 1.25);
  }),
);

pending.push(
  test("formatRate: renders the documented \"N×\" text for every table entry", () => {
    assert.strictEqual(m.formatRate(1), "1×");
    assert.strictEqual(m.formatRate(1.5), "1.5×");
    assert.strictEqual(m.formatRate(0.75), "0.75×");
    assert.strictEqual(m.formatRate(1.25), "1.25×");
    assert.strictEqual(m.formatRate(1.75), "1.75×");
    assert.strictEqual(m.formatRate(2), "2×");
    assert.strictEqual(m.formatRate(0.5), "0.5×");
  }),
);

pending.push(
  test("createSpeedOsd.show(rate): creates #lalin-cast-speed-osd + its own style, shows \"N×\", and auto-hides after 1.5s", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const osd = m.createSpeedOsd(doc, win);

    osd.show(1.5);
    const el = doc.getElementById(m.SPEED_OSD_ID);
    assert.ok(el, "creates its own OSD element");
    assert.strictEqual(el.textContent, "1.5×");
    assert.notStrictEqual(el.style.display, "none");
    const style = doc.getElementById("lalin-cast-speed-style");
    assert.ok(style, "creates its own style element");

    const scheduled = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    assert.strictEqual(scheduled.ms, m.SPEED_OSD_VISIBLE_MS);
    win.clearTimeout(scheduled.id);
    scheduled.cb();
    assert.strictEqual(el.style.display, "none");

    osd.show(1);
    assert.strictEqual(el.textContent, "1×");
    assert.notStrictEqual(el.style.display, "none");
    win.clearTimeout(win.__timeoutCalls[win.__timeoutCalls.length - 1].id);
  }),
);

pending.push(
  test("createSpeedControl: increase()/decrease() apply desiredRate to every video and report it back via getDesiredRate()", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const videoA = {};
    const videoB = {};
    const control = m.createSpeedControl(doc, win, { getVideos: () => [videoA, videoB] });

    control.increase();
    assert.strictEqual(control.getDesiredRate(), 1.25);
    assert.strictEqual(videoA.playbackRate, 1.25);
    assert.strictEqual(videoB.playbackRate, 1.25);

    control.decrease();
    control.decrease();
    assert.strictEqual(control.getDesiredRate(), 0.75);
    assert.strictEqual(videoA.playbackRate, 0.75);
  }),
);

pending.push(
  test("createSpeedControl: increase()/decrease() call the OSD with the new rate", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const shown = [];
    const control = m.createSpeedControl(doc, win, { getVideos: () => [], osd: { show: (rate) => shown.push(rate) } });

    control.increase();
    control.increase();
    control.decrease();

    assert.deepStrictEqual(shown, [1.25, 1.5, 1.25]);
  }),
);

pending.push(
  test("createSpeedControl: loadedmetadata re-applies desiredRate to the newly loaded video only once it is not the 1x default", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const control = m.createSpeedControl(doc, win, { getVideos: () => [] });

    const untouched = {};
    doc.dispatchEvent(eventWithTarget("loadedmetadata", untouched));
    assert.strictEqual(untouched.playbackRate, undefined, "desiredRate is still 1x; nothing should be written");

    control.increase();
    const fresh = {};
    doc.dispatchEvent(eventWithTarget("loadedmetadata", fresh));
    assert.strictEqual(fresh.playbackRate, 1.25);
  }),
);

pending.push(
  test("createSpeedControl: a ratechange we did NOT cause (YouTube's own speed menu) is adopted as the new desiredRate", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const control = m.createSpeedControl(doc, win, { getVideos: () => [] });

    doc.dispatchEvent(eventWithTarget("ratechange", { playbackRate: 1.75 }));
    assert.strictEqual(control.getDesiredRate(), 1.75);
  }),
);

pending.push(
  test("createSpeedControl: adopting an off-table external rate, then increase() snaps to the nearest table entry (does not fight it)", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const video = {};
    const control = m.createSpeedControl(doc, win, { getVideos: () => [video] });

    doc.dispatchEvent(eventWithTarget("ratechange", { playbackRate: 1.6 }));
    assert.strictEqual(control.getDesiredRate(), 1.6);

    control.increase();
    assert.strictEqual(control.getDesiredRate(), 1.5, "1.6 is off-table; increase() snaps to the nearest entry first");
    assert.strictEqual(video.playbackRate, 1.5);
  }),
);

pending.push(
  test("createSpeedControl: a ratechange fired synchronously by our own write is ignored, even when the video clamps to a different value", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const compliant = makeSyncRatechangeVideo(doc);
    const clamped = makeSyncRatechangeVideo(doc, (v) => Math.min(v, 1)); // a video that refuses to exceed 1x
    const control = m.createSpeedControl(doc, win, { getVideos: () => [compliant, clamped] });

    control.increase(); // desiredRate 1 -> 1.25

    assert.strictEqual(
      control.getDesiredRate(),
      1.25,
      "our own write's ratechange — even the clamped video's, reporting back a different rate — must not overwrite desiredRate",
    );
    assert.strictEqual(compliant.playbackRate, 1.25);
    assert.strictEqual(clamped.playbackRate, 1, "the clamped video itself still only reaches 1x");
  }),
);

pending.push(
  test("createSpeedControl: the load-algorithm ratechange (readyState 0) is not adopted, so the next loadedmetadata still re-applies desiredRate", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const video = { playbackRate: 1, readyState: 0 };
    const control = m.createSpeedControl(doc, win, { getVideos: () => [video] });

    control.increase(); // desiredRate 1 -> 1.25, applied to `video`
    assert.strictEqual(video.playbackRate, 1.25);

    // YouTube moves on to the next video: the media load algorithm resets
    // the rate to the default and fires ratechange while readyState is 0.
    video.playbackRate = 1;
    doc.dispatchEvent(eventWithTarget("ratechange", video));
    assert.strictEqual(control.getDesiredRate(), 1.25, "a load-time reset must not be adopted");

    video.readyState = 1;
    doc.dispatchEvent(eventWithTarget("loadedmetadata", video));
    assert.strictEqual(video.playbackRate, 1.25, "loadedmetadata re-applies the session rate");
  }),
);

pending.push(
  test("createSpeedControl: an asynchronous echo of our own write (rate already equal to desiredRate) is not treated as external", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const video = { playbackRate: 1, readyState: 4 };
    const control = m.createSpeedControl(doc, win, { getVideos: () => [video] });

    control.increase(); // 1.25
    control.increase(); // 1.5
    // The browser delivers the ratechange for our own write later, as a
    // queued task — long after the `applying` flag is clear.
    doc.dispatchEvent(eventWithTarget("ratechange", video));
    assert.strictEqual(control.getDesiredRate(), 1.5);

    // A genuinely external change (YouTube's own menu) is still adopted.
    video.playbackRate = 0.75;
    doc.dispatchEvent(eventWithTarget("ratechange", video));
    assert.strictEqual(control.getDesiredRate(), 0.75);
  }),
);

// ---------------------------------------------------------------------------
// Wave 5 — keybindFor: speed-up/speed-down/toggle-help, via both `code` and `key`
// ---------------------------------------------------------------------------

pending.push(
  test("keybindFor: Shift+Period (code or '>' key) is speed-up; Ctrl/no-Shift must not match", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Period", shiftKey: true }), "speed-up");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: ">", shiftKey: true }), "speed-up");
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Period", shiftKey: true, ctrlKey: true }), null);
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Period", shiftKey: false }), null, "plain Period must not match");
  }),
);

pending.push(
  test("keybindFor: Shift+Comma (code or '<' key) is speed-down; Meta must not match", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Comma", shiftKey: true }), "speed-down");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "<", shiftKey: true }), "speed-down");
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Comma", shiftKey: true, metaKey: true }), null);
  }),
);

pending.push(
  test("keybindFor: Shift+Slash (code or '?' key) or bare F1 toggles help; F1 with any modifier must not match", () => {
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Slash", shiftKey: true }), "toggle-help");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "?", shiftKey: true }), "toggle-help");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "F1" }), "toggle-help");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "F1", ctrlKey: true }), null);
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "F1", shiftKey: true }), null, "F1 must be completely bare");
    assert.strictEqual(m.keybindFor({ type: "keydown", key: "F1", metaKey: true }), null);
    assert.strictEqual(m.keybindFor({ type: "keydown", code: "Slash", shiftKey: true, ctrlKey: true }), null);
  }),
);

pending.push(
  test("createKeybindHandler: Shift+./,/'?' drive speed-up/speed-down/toggle-help and stop the event before a later listener", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    let up = 0;
    let down = 0;
    let help = 0;
    m.createKeybindHandler(doc, win, {
      onSpeedUp: () => { up += 1; },
      onSpeedDown: () => { down += 1; },
      onToggleHelp: () => { help += 1; },
    });

    let laterSaw = 0;
    doc.addEventListener("keydown", () => { laterSaw += 1; }, true);

    doc.dispatchEvent(keyEvent({ key: ">", shiftKey: true }));
    doc.dispatchEvent(keyEvent({ key: "<", shiftKey: true }));
    doc.dispatchEvent(keyEvent({ key: "?", shiftKey: true }));
    doc.dispatchEvent(keyEvent({ key: "F1" }));

    assert.strictEqual(up, 1);
    assert.strictEqual(down, 1);
    assert.strictEqual(help, 2, "both ? and F1 toggle help");
    assert.strictEqual(laterSaw, 0, "stopImmediatePropagation must block a later capture listener for all four");
  }),
);

// ---------------------------------------------------------------------------
// Wave 5 — Help overlay: helpRows, createHelpOverlay
// (docs/plans/W5_DESKTOP_PLAN.md, "Help overlay"). Lalin Cast original.
// ---------------------------------------------------------------------------

pending.push(
  test("helpRows: th and en return the same number of rows, and no cell (action/keyboard/controller) is empty", () => {
    const th = m.helpRows("th");
    const en = m.helpRows("en");
    assert.strictEqual(th.length, en.length);
    assert.ok(th.length >= 10, "covers every binding the contract lists");
    [...th, ...en].forEach((row) => {
      ["action", "keyboard", "controller"].forEach((field) => {
        assert.strictEqual(typeof row[field], "string");
        assert.ok(row[field].length > 0, `${field} must not be empty`);
      });
    });
  }),
);

pending.push(
  test("helpRows: covers every keyboard shortcut documented in README.md", () => {
    const keyboardCells = m.helpRows("en").map((r) => r.keyboard);
    [
      "Ctrl+O", "F11", "Ctrl+Shift+M", "Shift+Enter", "Right-click",
      "+ / -", "M", "C", "Ctrl+Shift+C", "Shift+, / Shift+.", "? / F1",
    ].forEach((expected) => {
      assert.ok(keyboardCells.includes(expected), `missing a row for ${expected}`);
    });
  }),
);

pending.push(
  test("helpRows: the help row's own controller column is \"Y\" in both languages (wave 6)", () => {
    const th = m.helpRows("th").find((r) => r.keyboard === "? / F1");
    const en = m.helpRows("en").find((r) => r.keyboard === "? / F1");
    assert.ok(th && en, "the help row must exist in both languages");
    assert.strictEqual(th.controller, "Y");
    assert.strictEqual(en.controller, "Y");
  }),
);

pending.push(
  test("createHelpOverlay: toggle() builds #lalin-cast-help lazily with role=dialog/aria-modal=true and one row per helpRows() entry", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createHelpOverlay(doc, win, { getLang: () => "en" });

    assert.strictEqual(doc.getElementById(m.HELP_OVERLAY_ID), null, "not built until the first toggle");

    overlay.toggle();
    assert.strictEqual(overlay.isOpen(), true);

    const el = doc.getElementById(m.HELP_OVERLAY_ID);
    assert.ok(el, "built lazily on first toggle");
    assert.strictEqual(el.getAttribute("role"), "dialog");
    assert.strictEqual(el.getAttribute("aria-modal"), "true");
    assert.notStrictEqual(el.style.display, "none");

    const style = doc.getElementById("lalin-cast-help-style");
    assert.ok(style, "creates its own style element");

    overlay.toggle();
    assert.strictEqual(overlay.isOpen(), false);
    assert.strictEqual(el.style.display, "none");
  }),
);

pending.push(
  test("createHelpOverlay: Escape (real key, or the controller's synthetic keyCode 27) closes it and stops the event", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createHelpOverlay(doc, win, { getLang: () => "th" });
    overlay.toggle();

    let laterSaw = 0;
    doc.addEventListener("keydown", () => { laterSaw += 1; }, true);

    doc.dispatchEvent(keyEvent({ key: "Escape" }));
    assert.strictEqual(overlay.isOpen(), false);
    assert.strictEqual(laterSaw, 0, "stopImmediatePropagation must block a later listener");

    overlay.toggle(); // reopen
    const synthetic = new Event("keydown");
    synthetic.keyCode = 27; // controller B button / right-click "back" dispatch — no .key set
    doc.dispatchEvent(synthetic);
    assert.strictEqual(overlay.isOpen(), false);
  }),
);

pending.push(
  test("createHelpOverlay: while open, Arrow/Enter keydowns (real key or synthetic keyCode) are stopped; everything else passes through", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createHelpOverlay(doc, win, { getLang: () => "th" });
    overlay.toggle();

    const laterSaw = [];
    doc.addEventListener("keydown", (e) => { laterSaw.push(e.key || e.keyCode); }, true);

    doc.dispatchEvent(keyEvent({ key: "ArrowUp" }));
    doc.dispatchEvent(keyEvent({ key: "ArrowDown" }));
    doc.dispatchEvent(keyEvent({ key: "ArrowLeft" }));
    doc.dispatchEvent(keyEvent({ key: "ArrowRight" }));
    doc.dispatchEvent(keyEvent({ key: "Enter" }));
    const syntheticUp = new Event("keydown");
    syntheticUp.keyCode = 38; // the gamepad D-pad's synthetic dispatch — no .key set
    doc.dispatchEvent(syntheticUp);
    assert.deepStrictEqual(laterSaw, [], "all six navigation keydowns must be stopped before reaching a later listener");

    doc.dispatchEvent(keyEvent({ key: "a" }));
    assert.deepStrictEqual(laterSaw, ["a"], "an unrelated key must still pass through while open");
    assert.strictEqual(overlay.isOpen(), true, "none of the navigation keys close the overlay");
  }),
);

pending.push(
  test("createHelpOverlay: Escape/Arrow keydowns do nothing while the overlay is closed", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createHelpOverlay(doc, win, { getLang: () => "th" });

    let laterSaw = 0;
    doc.addEventListener("keydown", () => { laterSaw += 1; }, true);
    doc.dispatchEvent(keyEvent({ key: "Escape" }));
    doc.dispatchEvent(keyEvent({ key: "ArrowUp" }));

    assert.strictEqual(laterSaw, 2, "neither keydown is intercepted while the overlay is closed");
    assert.strictEqual(overlay.isOpen(), false);
  }),
);

pending.push(
  test("createHelpOverlay: a click on the backdrop closes it; a click that bubbled from inside the panel does not", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createHelpOverlay(doc, win, { getLang: () => "th" });
    overlay.toggle();
    const el = doc.getElementById(m.HELP_OVERLAY_ID);

    el.dispatchEvent(eventWithTarget("click", { id: "some-row-span" }));
    assert.strictEqual(overlay.isOpen(), true, "a click that bubbled up from inside the panel must not close it");

    el.dispatchEvent(new Event("click")); // no override -> target is el itself, i.e. the backdrop
    assert.strictEqual(overlay.isOpen(), false);
  }),
);

pending.push(
  test("integration: the toggle-help keybind (via createKeybindHandler) opens then closes the help overlay", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const overlay = m.createHelpOverlay(doc, win, { getLang: () => "en" });
    m.createKeybindHandler(doc, win, { onToggleHelp: () => overlay.toggle() });

    doc.dispatchEvent(keyEvent({ key: "?", shiftKey: true }));
    assert.strictEqual(overlay.isOpen(), true);

    doc.dispatchEvent(keyEvent({ key: "?", shiftKey: true }));
    assert.strictEqual(overlay.isOpen(), false);
  }),
);

// ---------------------------------------------------------------------------
// Wave 5 — Now-playing: mediaStateFor, readMediaTitle, createMediaSignal
// (docs/plans/W5_DESKTOP_PLAN.md, "Now-playing"). Lalin Cast original.
// ---------------------------------------------------------------------------

pending.push(
  test("mediaStateFor: play/pause/ended/emptied map to playing/paused/idle/idle; anything else is null", () => {
    assert.strictEqual(m.mediaStateFor("play"), "playing");
    assert.strictEqual(m.mediaStateFor("pause"), "paused");
    assert.strictEqual(m.mediaStateFor("ended"), "idle");
    assert.strictEqual(m.mediaStateFor("emptied"), "idle");
    assert.strictEqual(m.mediaStateFor("timeupdate"), null);
    assert.strictEqual(m.mediaStateFor(undefined), null);
  }),
);

pending.push(
  test("readMediaTitle: reads navigator.mediaSession.metadata.title, trimmed and capped at 200 chars; \"\" when absent/malformed", () => {
    assert.strictEqual(m.readMediaTitle({ navigator: {} }), "");
    assert.strictEqual(m.readMediaTitle({ navigator: { mediaSession: {} } }), "");
    assert.strictEqual(m.readMediaTitle({ navigator: { mediaSession: { metadata: {} } } }), "");
    assert.strictEqual(m.readMediaTitle({ navigator: { mediaSession: { metadata: { title: 42 } } } }), "", "non-string title is ignored");
    assert.strictEqual(
      m.readMediaTitle({ navigator: { mediaSession: { metadata: { title: "  Hello there  " } } } }),
      "Hello there",
    );
    const long = "x".repeat(250);
    assert.strictEqual(
      m.readMediaTitle({ navigator: { mediaSession: { metadata: { title: long } } } }),
      "x".repeat(200),
    );
    assert.strictEqual(m.readMediaTitle(null), "");
    assert.strictEqual(m.readMediaTitle(undefined), "");
  }),
);

pending.push(
  test("createMediaSignal: play/pause/ended/emptied on doc (capture) emit the documented lalin-cast-media payload, title from mediaSession only", () => {
    const doc = createStubDoc();
    doc.title = "Should never be read — see the contract's \"never read from YouTube's DOM\"";
    const win = createStubWin({ navigator: { mediaSession: { metadata: { title: "My Video" } } } });
    const emitted = [];
    m.createMediaSignal(doc, win, { emit: (state, title) => { emitted.push({ state, title }); } });

    doc.dispatchEvent(new Event("play"));
    doc.dispatchEvent(new Event("pause"));
    doc.dispatchEvent(new Event("ended"));
    doc.dispatchEvent(new Event("emptied"));

    assert.deepStrictEqual(emitted.map((e) => e.state), ["playing", "paused", "idle", "idle"]);
    emitted.forEach((e) => assert.strictEqual(e.title, "My Video"));
  }),
);

pending.push(
  test("createMediaSignal: title is \"\" with no mediaSession at all", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const emitted = [];
    m.createMediaSignal(doc, win, { emit: (state, title) => { emitted.push({ state, title }); } });

    doc.dispatchEvent(new Event("play"));
    assert.strictEqual(emitted[0].title, "");
  }),
);

pending.push(
  test("createMediaSignal: a delayed re-read fires exactly 2s after play, picking up a title that only just became available", () => {
    const doc = createStubDoc();
    const mediaSession = { metadata: { title: "" } };
    const win = createStubWin({ navigator: { mediaSession } });
    const emitted = [];
    m.createMediaSignal(doc, win, { emit: (state, title) => { emitted.push({ state, title }); } });

    doc.dispatchEvent(new Event("play"));
    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].title, "");

    const scheduled = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    assert.strictEqual(scheduled.ms, 2000);
    mediaSession.metadata.title = "Now Available";
    win.clearTimeout(scheduled.id);
    scheduled.cb();

    assert.strictEqual(emitted.length, 2);
    assert.strictEqual(emitted[1].state, "playing");
    assert.strictEqual(emitted[1].title, "Now Available");
  }),
);

pending.push(
  test("createMediaSignal: a pause/ended/emptied within 2s of play cancels the pending re-read (no trailing \"playing\")", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const cleared = [];
    win.clearTimeout = (id) => {
      cleared.push(id);
      clearTimeout(id);
    };
    const emitted = [];
    m.createMediaSignal(doc, win, { emit: (state, title) => { emitted.push({ state, title }); } });

    doc.dispatchEvent(new Event("play"));
    const scheduled = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    assert.strictEqual(scheduled.ms, 2000);

    doc.dispatchEvent(new Event("pause"));
    assert.ok(cleared.includes(scheduled.id), "pause must cancel the pending re-read");
    assert.deepStrictEqual(emitted.map((e) => e.state), ["playing", "paused"]);

    // A second play schedules a fresh re-read; the first one stays cancelled.
    doc.dispatchEvent(new Event("play"));
    const again = win.__timeoutCalls[win.__timeoutCalls.length - 1];
    assert.notStrictEqual(again.id, scheduled.id);
    win.clearTimeout(again.id);
  }),
);

pending.push(
  test("createMediaSignal: pause/ended/emptied do NOT schedule a delayed re-read", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    m.createMediaSignal(doc, win, { emit: () => {} });
    const before = win.__timeoutCalls.length;

    doc.dispatchEvent(new Event("pause"));
    doc.dispatchEvent(new Event("ended"));
    doc.dispatchEvent(new Event("emptied"));

    assert.strictEqual(win.__timeoutCalls.length, before);
  }),
);

// ---------------------------------------------------------------------------
// Wave 8 — Hide (Shorts shelf / guide tab). See docs/plans/W8_BOUNDARY_PLAN.md,
// "ซ่อน Shorts / guide tabs". Pure matchers first (element-like stubs, no
// DOM), then scanAndHide's focus/Home exclusions and silent-no-match, then
// applyHidePrefsToDocument's dataset toggling.
// ---------------------------------------------------------------------------

pending.push(
  test("isShortsShelf: matches the Leanback Shorts shelf tag, and a shelf whose thumbnail overlay reports overlay-style=SHORTS", () => {
    const byTag = makeElement();
    byTag.tagName = "ytlr-reel-shelf-renderer";
    assert.strictEqual(m.isShortsShelf(byTag), true);

    const byOverlay = makeElement();
    byOverlay.tagName = "ytlr-shelf-renderer";
    byOverlay.querySelector = (selector) =>
      (selector === m.HIDE_MATCH_SIGNALS.SHORTS_SHELF_OVERLAY_SELECTOR ? makeElement() : null);
    assert.strictEqual(m.isShortsShelf(byOverlay), true);
  }),
);

pending.push(
  test("isShortsShelf: does not match an unrelated shelf with no Shorts overlay, or a malformed element", () => {
    const other = makeElement();
    other.tagName = "ytlr-shelf-renderer";
    assert.strictEqual(m.isShortsShelf(other), false);
    assert.strictEqual(m.isShortsShelf(null), false);
    assert.strictEqual(m.isShortsShelf({}), false);
  }),
);

pending.push(
  test("isShortsGuideTab: matches a guide entry whose own or nested icon-type is YOUTUBE_SHORTS_FILL_24", () => {
    const ownAttr = makeElement();
    ownAttr.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.SHORTS_ICON_TYPE);
    assert.strictEqual(m.isShortsGuideTab(ownAttr), true);

    const nestedIcon = makeElement();
    nestedIcon.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.SHORTS_ICON_TYPE);
    const wrapper = makeElement();
    wrapper.querySelector = (selector) => (selector === m.HIDE_MATCH_SIGNALS.ICON_TYPE_SELECTOR ? nestedIcon : null);
    assert.strictEqual(m.isShortsGuideTab(wrapper), true);
  }),
);

pending.push(
  test("isShortsGuideTab: does not match a different icon type, an entry with no icon-type, or a malformed element", () => {
    const otherIcon = makeElement();
    otherIcon.setAttribute("icon-type", "SUBSCRIPTIONS");
    assert.strictEqual(m.isShortsGuideTab(otherIcon), false);

    const noIcon = makeElement();
    assert.strictEqual(m.isShortsGuideTab(noIcon), false);
    assert.strictEqual(m.isShortsGuideTab(null), false);
    assert.strictEqual(m.isShortsGuideTab(undefined), false);
  }),
);

pending.push(
  test("isShortsGuideTab: never matches the Home entry (icon-type WHAT_TO_WATCH), even standing alone from scanAndHide's own guard", () => {
    const home = makeElement();
    home.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.HOME_ICON_TYPE);
    assert.strictEqual(m.isShortsGuideTab(home), false);
  }),
);

pending.push(
  test("scanAndHide: tags a matching shelf and a matching guide entry with our own classes, and leaves non-matches untouched", () => {
    const shortsShelf = makeElement();
    shortsShelf.tagName = "ytlr-reel-shelf-renderer";
    const otherShelf = makeElement();
    otherShelf.tagName = "ytlr-shelf-renderer";

    const shortsTab = makeElement();
    shortsTab.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.SHORTS_ICON_TYPE);
    const homeTab = makeElement();
    homeTab.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.HOME_ICON_TYPE);

    const doc = createStubDoc({
      querySelectorAllResults: {
        [m.HIDE_SHELF_CANDIDATE_SELECTOR]: [shortsShelf, otherShelf],
        [m.HIDE_GUIDE_CANDIDATE_SELECTOR]: [shortsTab, homeTab],
      },
    });

    m.scanAndHide(doc);

    assert.strictEqual(shortsShelf.classList.contains(m.HIDE_SHORTS_CLASS), true);
    assert.strictEqual(otherShelf.classList.contains(m.HIDE_SHORTS_CLASS), false);
    assert.strictEqual(shortsTab.classList.contains(m.HIDE_GUIDE_TAB_CLASS), true);
    assert.strictEqual(homeTab.classList.contains(m.HIDE_GUIDE_TAB_CLASS), false);
  }),
);

pending.push(
  test("scanAndHide: never tags an element that is an ancestor of document.activeElement", () => {
    const focusedButton = makeElement();
    const shortsShelf = makeElement();
    shortsShelf.tagName = "ytlr-reel-shelf-renderer";
    focusedButton.parentElement = shortsShelf; // focus lives inside the shelf

    const doc = createStubDoc({
      activeElement: focusedButton,
      querySelectorAllResults: { [m.HIDE_SHELF_CANDIDATE_SELECTOR]: [shortsShelf] },
    });

    m.scanAndHide(doc);

    assert.strictEqual(shortsShelf.classList.contains(m.HIDE_SHORTS_CLASS), false, "shelf is an ancestor of focus");
  }),
);

pending.push(
  test("scanAndHide: never tags an element that is itself document.activeElement", () => {
    const shortsTab = makeElement();
    shortsTab.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.SHORTS_ICON_TYPE);

    const doc = createStubDoc({
      activeElement: shortsTab,
      querySelectorAllResults: { [m.HIDE_GUIDE_CANDIDATE_SELECTOR]: [shortsTab] },
    });

    m.scanAndHide(doc);

    assert.strictEqual(shortsTab.classList.contains(m.HIDE_GUIDE_TAB_CLASS), false, "entry itself is focused");
  }),
);

pending.push(
  test("scanAndHide: never tags the Home guide tab even if it were somehow the only guide-entry candidate", () => {
    const homeTab = makeElement();
    homeTab.setAttribute("icon-type", m.HIDE_MATCH_SIGNALS.HOME_ICON_TYPE);
    const doc = createStubDoc({
      querySelectorAllResults: { [m.HIDE_GUIDE_CANDIDATE_SELECTOR]: [homeTab] },
    });
    m.scanAndHide(doc);
    assert.strictEqual(homeTab.classList.contains(m.HIDE_GUIDE_TAB_CLASS), false);
  }),
);

pending.push(
  test("scanAndHide: a pass with no matching candidates is completely silent (no throw, nothing tagged)", () => {
    const plainShelf = makeElement();
    plainShelf.tagName = "ytlr-shelf-renderer";
    const plainTab = makeElement();
    plainTab.setAttribute("icon-type", "SUBSCRIPTIONS");
    const doc = createStubDoc({
      querySelectorAllResults: {
        [m.HIDE_SHELF_CANDIDATE_SELECTOR]: [plainShelf],
        [m.HIDE_GUIDE_CANDIDATE_SELECTOR]: [plainTab],
      },
    });

    assert.doesNotThrow(() => m.scanAndHide(doc));
    assert.strictEqual(plainShelf.classList.contains(m.HIDE_SHORTS_CLASS), false);
    assert.strictEqual(plainTab.classList.contains(m.HIDE_GUIDE_TAB_CLASS), false);

    // An empty document (no candidates registered at all) must also be a
    // silent no-op rather than throwing on a missing selector table.
    assert.doesNotThrow(() => m.scanAndHide(createStubDoc()));
    assert.doesNotThrow(() => m.scanAndHide(null));
  }),
);

pending.push(
  test("applyHidePrefsToDocument: toggles documentElement.dataset.lalinHideShorts/lalinHideGuideTabs both ways", () => {
    const doc = createStubDoc();
    const root = doc.documentElement;

    m.applyHidePrefsToDocument(doc, { hideShorts: true, hideGuideTabs: false });
    assert.strictEqual(root.dataset.lalinHideShorts, "true");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(root.dataset, "lalinHideGuideTabs"), false);

    m.applyHidePrefsToDocument(doc, { hideShorts: false, hideGuideTabs: true });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(root.dataset, "lalinHideShorts"), false);
    assert.strictEqual(root.dataset.lalinHideGuideTabs, "true");

    m.applyHidePrefsToDocument(doc, { hideShorts: false, hideGuideTabs: false });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(root.dataset, "lalinHideShorts"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(root.dataset, "lalinHideGuideTabs"), false);
  }),
);

pending.push(
  test("ensureHideStyle: injects <style id=lalin-cast-hide-style> exactly once", () => {
    const doc = createStubDoc();
    m.ensureHideStyle(doc);
    m.ensureHideStyle(doc);
    const styleEls = doc.head.children.filter((c) => c.id === m.HIDE_STYLE_ID);
    assert.strictEqual(styleEls.length, 1);
    assert.ok(styleEls[0].textContent.includes(m.HIDE_SHORTS_CLASS));
    assert.ok(styleEls[0].textContent.includes(m.HIDE_GUIDE_TAB_CLASS));
  }),
);

pending.push(
  test("surfaceVerdict: a normal /tv page is never blocked before the final phase", () => {
    // Regression: `load` fires ~130 ms in, before Leanback renders ytlr-app.
    // Checking the UI then showed a false "isn't showing the TV surface".
    const base = { isYouTube: true, pathname: "/tv", hasLeanbackDom: false };
    assert.strictEqual(m.surfaceVerdict({ ...base, phase: "early" }), null);
    assert.strictEqual(m.surfaceVerdict({ ...base, phase: "final" }), "blockedSurface");
    assert.strictEqual(m.surfaceVerdict({ ...base, hasLeanbackDom: true, phase: "final" }), null);
  }),
);

pending.push(
  test("surfaceVerdict: a redirect away from /tv is reported at any phase", () => {
    for (const phase of ["early", "final"]) {
      assert.strictEqual(
        m.surfaceVerdict({ isYouTube: true, pathname: "/", hasLeanbackDom: true, phase }),
        "redirected"
      );
    }
    assert.strictEqual(
      m.surfaceVerdict({ isYouTube: false, pathname: "/", hasLeanbackDom: true, phase: "early" }),
      null
    );
  }),
);

pending.push(
  test("surface timers: the final check waits well past the early one", () => {
    assert.ok(m.SURFACE_FINAL_CHECK_MS > m.SURFACE_EARLY_CHECK_MS);
    assert.ok(m.SURFACE_FINAL_CHECK_MS >= 30000);
  }),
);

function mouseEvent(type, fields) {
  const e = new Event(type);
  Object.assign(e, fields || {});
  return e;
}

pending.push(
  test("createMiniBar: stays hidden until mini-player mode is on", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const bar = m.createMiniBar(doc, win, {});
    win.dispatchEvent(mouseEvent("mousemove"));
    assert.strictEqual(bar.isShown(), false);
    assert.strictEqual(doc.getElementById(m.MINI_BAR_ID), null, "nothing is built while inactive");
    bar.setActive(false);
  }),
);

pending.push(
  test("createMiniBar: shows on activation and on mouse movement, hides when mini ends", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const bar = m.createMiniBar(doc, win, { getLang: () => "en" });
    bar.setActive(true);
    assert.strictEqual(bar.isShown(), true);
    const el = doc.getElementById(m.MINI_BAR_ID);
    assert.ok(el, "bar element is attached to the body");
    assert.strictEqual(el.children[1].textContent, m.miniBarLabel("en"));
    assert.ok(win.__timeoutCalls.some((c) => c.ms === m.MINI_BAR_HIDE_MS), "auto-hide is scheduled");
    bar.setActive(false);
    assert.strictEqual(bar.isShown(), false);
    win.dispatchEvent(mouseEvent("mousemove"));
    assert.strictEqual(bar.isShown(), false, "mouse movement does nothing once mini ends");
  }),
);

pending.push(
  test("createMiniBar: the button restores normal size and the handle starts a drag", () => {
    const doc = createStubDoc();
    const win = createStubWin();
    const calls = [];
    const bar = m.createMiniBar(doc, win, {
      onRestore: () => calls.push("restore"),
      onDragStart: () => calls.push("drag")
    });
    bar.setActive(true);
    const el = doc.getElementById(m.MINI_BAR_ID);
    const [handle, button] = el.children;
    button.dispatchEvent(mouseEvent("click"));
    handle.dispatchEvent(mouseEvent("mousedown", { button: 0 }));
    handle.dispatchEvent(mouseEvent("mousedown", { button: 2 }));
    assert.deepStrictEqual(calls, ["restore", "drag"], "right-button mousedown does not drag");
    bar.setActive(false);
  }),
);

pending.push(
  test("miniBarLabel: Thai by default, English when the language is en", () => {
    assert.ok(m.miniBarLabel("th").includes("ขนาดปกติ"));
    assert.ok(m.miniBarLabel(undefined).includes("ขนาดปกติ"));
    assert.ok(m.miniBarLabel("en").includes("Normal size"));
  }),
);

pending.push(
  test("SHELL_ACTIONS: start-drag is whitelisted alongside the existing actions", () => {
    assert.strictEqual(m.SHELL_ACTIONS.START_DRAG, "start-drag");
    assert.strictEqual(m.SHELL_ACTIONS.TOGGLE_MINI, "toggle-mini");
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
