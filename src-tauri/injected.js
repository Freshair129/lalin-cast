(() => {
  // =========================================================================
  // Lalin Cast — media window injected script.
  //
  // Loaded into the YouTube TV (Leanback) surface after the Rust host's
  // `initialization_script` has already set `window.__LALIN_PREFS__` (see
  // docs/plans/W3_CONTROLS_PLAN.md, "Prefs ที่ Rust ส่งให้หน้า YouTube"):
  //
  //   window.__LALIN_PREFS__ = {
  //     lang: "th" | "en",
  //     controllerEnabled: boolean,
  //     pauseOnBlur: boolean,
  //     deepLink: string | null,
  //   };
  //
  // Rust -> page events this file listens for:
  //   "lalin-cast-prefs"    payload { lang, controllerEnabled, pauseOnBlur }
  //   "lalin-cast-deeplink" payload { url }
  //
  // page -> Rust events this file emits:
  //   "lalin-cast-shell" payload { action: "open-settings" | "toggle-fullscreen" }
  //
  // This file is a single `include_str!`-ed script, organized into
  // delimited sections. Most of it ports small modules from VacuumTube
  // (MIT-licensed, see LALIN_PROVENANCE.md and reference/vacuumtube/); each
  // ported section opens with a comment naming its upstream path(s). The
  // DIAL bridge / device-id sync / surface-detection section predates wave 3
  // and keeps its existing behavior unchanged aside from wiring the deep
  // link value described below.
  //
  // Pure helpers are exported via `module.exports` (guarded by `typeof
  // module`) so `src-tauri/injected.test.js` can `require()` this file from
  // plain Node. The bottom of the file only touches `window`/`document`
  // when `typeof window !== "undefined"`, so requiring it from Node (no
  // `window` global) is a no-op beyond defining those exports.
  // =========================================================================

  // -------------------------------------------------------------------------
  // Prefs (Lalin Cast addition — not ported from VacuumTube)
  // -------------------------------------------------------------------------

  const DEFAULT_PREFS = Object.freeze({
    lang: "th",
    controllerEnabled: true,
    pauseOnBlur: false,
    deepLink: null
  });

  // Reads window.__LALIN_PREFS__ with the documented defaults, tolerating a
  // missing/malformed object entirely (e.g. a dev/test context that never
  // ran the Rust `initialization_script`).
  const readPrefs = (source) => {
    const raw = source && typeof source === "object" ? source : {};
    return {
      lang: raw.lang === "en" ? "en" : DEFAULT_PREFS.lang,
      controllerEnabled: raw.controllerEnabled === false ? false : DEFAULT_PREFS.controllerEnabled,
      pauseOnBlur: raw.pauseOnBlur === true ? true : DEFAULT_PREFS.pauseOnBlur,
      deepLink: typeof raw.deepLink === "string" && raw.deepLink.length > 0 ? raw.deepLink : DEFAULT_PREFS.deepLink
    };
  };

  // Merges a `lalin-cast-prefs` payload ({ lang, controllerEnabled,
  // pauseOnBlur }, no `deepLink` field — that only ever arrives once, via
  // __LALIN_PREFS__ or a `lalin-cast-deeplink` event) onto the previous
  // prefs, ignoring unknown/malformed fields.
  const applyPrefsUpdate = (prev, payload) => {
    const base = prev && typeof prev === "object" ? prev : DEFAULT_PREFS;
    const next = {
      lang: base.lang,
      controllerEnabled: base.controllerEnabled,
      pauseOnBlur: base.pauseOnBlur,
      deepLink: base.deepLink
    };
    if (payload && typeof payload === "object") {
      if (payload.lang === "en" || payload.lang === "th") next.lang = payload.lang;
      if (typeof payload.controllerEnabled === "boolean") next.controllerEnabled = payload.controllerEnabled;
      if (typeof payload.pauseOnBlur === "boolean") next.pauseOnBlur = payload.pauseOnBlur;
    }
    return next;
  };

  // -------------------------------------------------------------------------
  // DIAL bridge (wave 1–2, unchanged)
  //
  // Provenance: this bridge's H5VCC DIAL surface is ported from VacuumTube
  // (see LALIN_PROVENANCE.md). Keep it intentionally narrow: it does not
  // expose shell, filesystem, process, or arbitrary network commands to the
  // remote YouTube page, and it carries no release-check surface of its own
  // (that lives entirely on the Rust side and the native window it opens).
  //
  // Wave 3 change (the only change in this section): `runtime.initialDeepLink`
  // is now `initialDeepLink` (a variable set from `window.__LALIN_PREFS__.deepLink`
  // by boot(), below, before this function ever runs) instead of a hardcoded
  // `null`. This mirrors reference/vacuumtube/src/preload/modules/h5vcc/index.js
  // lines 50–56, which resolves the deep link and includes it in the same
  // object literal that becomes `window.h5vcc` — i.e. the value is correct
  // from the instant the page can see `window.h5vcc` at all, since nothing
  // can read a partially-constructed object literal. Everything else here is
  // unchanged.
  // -------------------------------------------------------------------------

  const mark = () => {
    if (document.documentElement) {
      document.documentElement.dataset.lalinCast = "true";
    }
  };

  const normalizePath = (path) => {
    const value = String(path || "");
    return value.replace(/\/+$/, "") || "/";
  };

  const bridge = () => window.__TAURI__;
  const invoke = (command, args) => {
    const tauri = bridge();
    if (!tauri?.core?.invoke) return Promise.reject(new Error("Lalin Cast bridge unavailable"));
    return tauri.core.invoke(command, args);
  };

  // Set by boot() from window.__LALIN_PREFS__.deepLink before installBridge()
  // runs. See the wave 3 note above.
  let initialDeepLink = null;

  class DialServer {
    constructor(appName) {
      this.appName = String(appName || "");
      this.basePath = `/apps/${this.appName}`;
      this.handlers = new Map();
      DialServer.instances.add(this);
    }

    fullPath(path) {
      return normalizePath(`${this.basePath}${path || ""}`);
    }

    register(method, path, callback) {
      if (typeof callback !== "function") return;
      this.handlers.set(`${method} ${this.fullPath(path)}`, callback);
    }

    onGet(path, callback) { this.register("GET", path, callback); }
    onPost(path, callback) { this.register("POST", path, callback); }
    onDelete(path, callback) { this.register("DELETE", path, callback); }
  }

  DialServer.instances = new Set();

  const dispatchDialRequest = async (event) => {
    const request = event?.payload || event;
    if (!request?.requestId) return;
    let callback;
    for (const server of DialServer.instances) {
      callback = server.handlers.get(`${request.method} ${normalizePath(request.path)}`);
      if (callback) break;
    }

    const headers = [];
    const response = {
      responseCode: 200,
      mimeType: null,
      body: null,
      addHeader: (key, value) => headers.push([String(key), String(value)])
    };

    if (!callback) {
      await invoke("dial_respond", {
        requestId: request.requestId,
        status: 404,
        headers: [],
        body: null
      }).catch(() => {});
      return;
    }

    try {
      const accepted = await callback({
        host: request.host,
        path: normalizePath(request.path),
        body: request.body || ""
      }, response);
      if (!accepted) {
        await invoke("dial_respond", {
          requestId: request.requestId,
          status: 400,
          headers: [],
          body: null
        }).catch(() => {});
        return;
      }
      if (response.mimeType) headers.push(["Content-Type", String(response.mimeType)]);
      await invoke("dial_respond", {
        requestId: request.requestId,
        status: Number(response.responseCode) || 200,
        headers,
        body: response.body == null ? null : String(response.body)
      });
    } catch {
      await invoke("dial_respond", {
        requestId: request.requestId,
        status: 500,
        headers: [],
        body: null
      }).catch(() => {});
    }
  };

  const maxResolution = () => {
    const resolutions = [
      [256, 144], [426, 240], [640, 360], [854, 480], [1280, 720],
      [1920, 1080], [2560, 1440], [3840, 2160], [7680, 4320]
    ];
    const width = Math.max(window.screen.width, window.screen.height);
    const height = Math.min(window.screen.width, window.screen.height);
    const match = resolutions.find(([x, y]) => width <= x && height <= y);
    return match ? `${match[0]}x${match[1]}` : `${window.screen.width}x${window.screen.height}`;
  };

  const syncLeanbackDeviceId = async () => {
    let lastDeviceId = null;
    const sync = async () => {
      try {
        const raw = localStorage.getItem("yt.leanback.default::mdx-device-id");
        const deviceId = JSON.parse(raw || "null")?.data;
        if (
          typeof deviceId === "string" &&
          deviceId.length > 0 &&
          deviceId.length <= 128 &&
          deviceId !== lastDeviceId
        ) {
          await invoke("dial_set_device_id", { deviceId });
          lastDeviceId = deviceId;
        }
      } catch {
        // Leanback may initialize localStorage after the document script.
      }
    };

    await sync();
    window.setInterval(sync, 2000);
  };

  const installBridge = async () => {
    const started = Date.now();
    while (!bridge()?.event?.listen && Date.now() - started < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const tauri = bridge();
    if (!tauri?.event?.listen) return;

    await tauri.event.listen("lalin-cast-dial-request", dispatchDialRequest);
    window.h5vcc = {
      dial: { DialServer },
      runtime: { initialDeepLink },
      system: { getVideoContainerSizeOverride: maxResolution }
    };
    syncLeanbackDeviceId();
  };

  // Surface detection: tells the shell when YouTube redirected away from
  // the TV app, or when the Leanback UI never rendered, so it can show the
  // native "status" window. See docs/plans/W2_LIVING_ROOM_PLAN.md. Emits at
  // most once per page load, and strips the query string/fragment from the
  // URL before sending (never a URL with a query string, per the no-PII
  // logging rule this bridge is held to).
  const initSurfaceDetection = () => {
    let emitted = false;

    const stripQueryAndHash = (href) => {
      try {
        const url = new URL(href);
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return String(href || "").split(/[?#]/)[0];
      }
    };

    const isYouTubeHost = (hostname) => {
      const host = String(hostname || "").toLowerCase();
      return host === "youtube.com" || host.endsWith(".youtube.com");
    };

    const hasLeanbackDom = () =>
      Boolean(document.querySelector('ytlr-app, [class*="ytlr-"], #app'));

    const checkSurface = () => {
      if (emitted) return;

      const hostname = window.location.hostname || "";
      const pathname = window.location.pathname || "";

      let kind = null;
      if (isYouTubeHost(hostname) && !pathname.startsWith("/tv")) {
        kind = "redirected";
      } else if (!hasLeanbackDom()) {
        kind = "blockedSurface";
      }
      if (!kind) return;

      const tauri = bridge();
      if (!tauri?.event?.emit) return;

      emitted = true;
      tauri.event
        .emit("lalin-cast-surface", {
          kind,
          url: stripQueryAndHash(window.location.href),
          title: String(document.title || "").slice(0, 200)
        })
        .catch(() => {});
    };

    window.addEventListener("load", checkSurface);
    window.setTimeout(checkSurface, 12000);
  };

  const initMark = () => {
    mark();
    new MutationObserver(mark).observe(document, { childList: true, subtree: true });
  };

  // -------------------------------------------------------------------------
  // Deep link
  //
  // Provenance: reference/vacuumtube/src/preload/modules/h5vcc/index.js
  // (lines 50–56) — adapted for Lalin Cast. Upstream resolves the deep link
  // via `ipcRenderer.invoke('get-deeplink')`; Lalin Cast has no Electron main
  // process, so it reads the canonical URL Rust's `parse_launch_url` already
  // produced and validated, from `window.__LALIN_PREFS__.deepLink` (used
  // once, above, to seed `window.h5vcc.runtime.initialDeepLink`). The
  // `lalin-cast-deeplink` event (an *already-running* instance being handed
  // a second URL by the single-instance callback) has no upstream
  // equivalent — Electron's `get-deeplink` IPC channel only covers the
  // first-launch case — so it is Lalin Cast's own addition: it converts the
  // canonical URL to the Leanback hash route and navigates to it.
  // -------------------------------------------------------------------------

  const YOUTUBE_CANONICAL_HOST = "www.youtube.com";
  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

  // Converts a canonical deep link URL (as produced by Rust's
  // `parse_launch_url`) into the Leanback hash route it corresponds to, e.g.
  // "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -> "#/watch?v=dQw4w9WgXcQ".
  // Returns null for anything that is not exactly one of the two canonical
  // forms — this function re-validates independently of the Rust side
  // rather than trusting the string it is handed.
  const deepLinkToHash = (url) => {
    if (typeof url !== "string" || url.length === 0) return null;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname.toLowerCase() !== YOUTUBE_CANONICAL_HOST) return null;

    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      if (!id || !VIDEO_ID_PATTERN.test(id)) return null;
      return `#/watch?v=${id}`;
    }
    if (parsed.pathname === "/playlist") {
      const list = parsed.searchParams.get("list");
      if (!list || !PLAYLIST_ID_PATTERN.test(list)) return null;
      return `#/playlist?list=${list}`;
    }
    return null;
  };

  const initDeepLinkListener = async (win, tauri) => {
    if (!tauri?.event?.listen) return;
    await tauri.event.listen("lalin-cast-deeplink", (event) => {
      const payload = event?.payload || event;
      const hash = deepLinkToHash(payload?.url);
      if (hash) win.location.assign(hash);
    });
  };

  // -------------------------------------------------------------------------
  // Controller (gamepad)
  //
  // Provenance: reference/vacuumtube/src/preload/util/controller.js and
  // reference/vacuumtube/src/preload/modules/controller-support.js —
  // adapted for Lalin Cast. The polling loop, axis deadzone (0.5), button
  // repeat timing (500 ms delay, then every 100 ms — a single shared timer,
  // matching upstream's single `buttonRepeatTimeout`), Steam Input gamepad
  // preference, keyCode table (including the Cobalt-specific direction
  // codes 1011–1018) and the `document.dispatchEvent(new Event(...))` +
  // manual `.keyCode` assignment dispatch technique are all ported as-is.
  //
  // Two adaptations:
  //   - Focus gating: upstream uses Electron's `ipcRenderer` "focus"/"blur"
  //     IPC messages; Lalin Cast has no Electron main process, so this uses
  //     the window's own "focus"/"blur" events instead.
  //   - Right stick (axis codes 1015–1018): upstream's own axis handler has
  //     a variable-name slip (`keyCode = ...` instead of `code = ...` on the
  //     right-stick branches — see util/controller.js lines 100–111), which
  //     leaves the right stick permanently inert even though its codes are
  //     documented in that file's header comment and reserved in the
  //     `controller-support.js` map's index space. This port fixes that slip
  //     so the right stick mirrors the left stick's arrow-key mapping,
  //     matching the intent documented in both upstream files.
  //   - `config.controller_support` (upstream's persisted toggle) becomes
  //     the `controllerEnabled` pref from `window.__LALIN_PREFS__` /
  //     `lalin-cast-prefs`.
  //   - The R3 button (index 11, upstream's commented-out `'vt-settings'`
  //     entry, which opened VacuumTube's own in-page settings overlay) emits
  //     `lalin-cast-shell` `{ action: "open-settings" }` instead, for the
  //     Rust shell to open Lalin Cast's native settings window.
  // -------------------------------------------------------------------------

  // Button index -> browser keyCode dispatched via the synthetic-event
  // technique below. Ported verbatim from controller-support.js's
  // `gamepadKeyCodeMap`, plus the axis codes from controller.js's header
  // comment (1011–1018; see the right-stick note above).
  const GAMEPAD_KEY_CODE_MAP = Object.freeze({
    0: 13,   // A -> Enter
    1: 27,   // B -> Escape
    2: 170,  // X -> asterisk (search)
    // 3 (Y) is intentionally unmapped upstream; falls back to GAMEPAD_FALLBACK_KEYCODE.
    4: 115,  // Left bumper -> F4 (back)
    5: 116,  // Right bumper -> F5 (forward)
    6: 113,  // Left trigger -> F2 (seek backwards)
    7: 114,  // Right trigger -> F3 (seek forwards)
    8: 189,  // Select -> "-" (volume down; caught by the volume section below)
    9: 187,  // Start -> "=" (volume up; caught by the volume section below)
    10: 77,  // L3 -> "m" (mute; caught by the volume section below)
    // 11 (R3) is special-cased in resolveGamepadEvent() below: it opens
    // settings instead of dispatching a keyCode.
    12: 38,  // D-pad up -> Up arrow
    13: 40,  // D-pad down -> Down arrow
    14: 37,  // D-pad left -> Left arrow
    15: 39,  // D-pad right -> Right arrow

    1011: 37, // Left stick left -> Left arrow
    1012: 38, // Left stick up -> Up arrow
    1013: 39, // Left stick right -> Right arrow
    1014: 40, // Left stick down -> Down arrow

    1015: 37, // Right stick left -> Left arrow
    1016: 38, // Right stick up -> Up arrow
    1017: 39, // Right stick right -> Right arrow
    1018: 40  // Right stick down -> Down arrow
  });

  // F24: unused by YouTube, but still picked up and surfaces the TV menu,
  // like every other unmapped button upstream.
  const GAMEPAD_FALLBACK_KEYCODE = 135;
  const GAMEPAD_SETTINGS_BUTTON = 11; // R3
  const GAMEPAD_AXIS_DEADZONE = 0.5;
  const GAMEPAD_REPEAT_DELAY_MS = 500;
  const GAMEPAD_REPEAT_INTERVAL_MS = 100;
  const STEAM_GAMEPAD_ID_SUFFIX = "(STANDARD GAMEPAD Vendor: 28de Product: 11ff)";

  // Axis index -> { positive, negative } direction code. Left stick is axes
  // 0/1, right stick is axes 3/4 (axis 2 is intentionally skipped, matching
  // upstream — most gamepads report a trigger there instead of a stick).
  const GAMEPAD_AXIS_CODES = Object.freeze({
    0: { positive: 1013, negative: 1011 },
    1: { positive: 1014, negative: 1012 },
    3: { positive: 1017, negative: 1015 },
    4: { positive: 1018, negative: 1016 }
  });

  // Diffs one gamepad's raw button/axis state against the previous poll and
  // returns the resolved key/action events plus the next state to pass back
  // in on the following poll. Pure: takes no DOM, does no dispatching.
  const mapGamepadState = (prevState, gamepad) => {
    const prevButtons = (prevState && prevState.buttons) || {};
    const prevAxes = (prevState && prevState.axes) || {};
    const buttons = Object.assign({}, prevButtons);
    const axes = Object.assign({}, prevAxes);
    const rawEvents = [];

    const buttonList = gamepad && Array.isArray(gamepad.buttons) ? gamepad.buttons : [];
    for (let index = 0; index < buttonList.length; index += 1) {
      const button = buttonList[index];
      const pressed = Boolean(button && button.pressed);
      const wasPressed = Boolean(buttons[index]);
      if (pressed && !wasPressed) {
        buttons[index] = true;
        rawEvents.push({ type: "down", code: index });
      } else if (!pressed && wasPressed) {
        buttons[index] = false;
        rawEvents.push({ type: "up", code: index });
      }
    }

    const axisList = gamepad && Array.isArray(gamepad.axes) ? gamepad.axes : [];
    Object.keys(GAMEPAD_AXIS_CODES).forEach((axisKey) => {
      const axisIndex = Number(axisKey);
      const mapping = GAMEPAD_AXIS_CODES[axisIndex];
      const value = typeof axisList[axisIndex] === "number" ? axisList[axisIndex] : 0;

      let code = null;
      if (value > GAMEPAD_AXIS_DEADZONE) code = mapping.positive;
      else if (value < -GAMEPAD_AXIS_DEADZONE) code = mapping.negative;

      const wasCode = axes[axisIndex] || null;
      if (code !== wasCode) {
        if (wasCode) rawEvents.push({ type: "up", code: wasCode });
        if (code) rawEvents.push({ type: "down", code });
        axes[axisIndex] = code;
      }
    });

    const events = rawEvents.map(resolveGamepadEvent).filter((event) => event !== null);
    return { events, state: { buttons, axes } };
  };

  // Resolves one raw code transition into either a dispatchable
  // { type, code, keyCode } or, for R3, an { type, action } — mirroring
  // controller-support.js's `simulateKeyDown`/`simulateKeyUp`, which special-
  // cases 'vt-settings' and does nothing at all on its keyup.
  const resolveGamepadEvent = (rawEvent) => {
    if (rawEvent.code === GAMEPAD_SETTINGS_BUTTON) {
      return rawEvent.type === "down" ? { type: "down", action: "open-settings" } : null;
    }
    const keyCode = Object.prototype.hasOwnProperty.call(GAMEPAD_KEY_CODE_MAP, rawEvent.code)
      ? GAMEPAD_KEY_CODE_MAP[rawEvent.code]
      : GAMEPAD_FALLBACK_KEYCODE;
    return { type: rawEvent.type, code: rawEvent.code, keyCode };
  };

  // The shared synthetic-dispatch technique: a plain `Event` (not
  // `KeyboardEvent`, whose `.keyCode` is read-only in modern browsers) with
  // `.keyCode` assigned directly. Used by both the controller and the mouse
  // "back" binding below, matching upstream (which duplicated this same
  // technique in both controller-support.js and mouse.js).
  const dispatchSyntheticKey = (doc, type, keyCode) => {
    const event = new Event(type);
    event.keyCode = keyCode;
    doc.dispatchEvent(event);
  };

  // Wires the requestAnimationFrame poll loop. `getEnabled()` gates whether
  // start() will begin polling at all; callers are expected to call stop()
  // themselves once `controllerEnabled` flips off (see initPrefsAndDeepLink
  // below) rather than have the loop poll its own gate every frame.
  const createGamepadController = (doc, win, options) => {
    const getEnabled = (options && options.getEnabled) || (() => true);
    const onOpenSettings = (options && options.onOpenSettings) || (() => {});

    let focused = true;
    win.addEventListener("focus", () => { focused = true; });
    win.addEventListener("blur", () => { focused = false; });

    const padStates = {};
    let frameHandle = null;
    let repeatTimer = null;

    const stopRepeat = () => {
      if (repeatTimer !== null) {
        win.clearTimeout(repeatTimer);
        win.clearInterval(repeatTimer);
        repeatTimer = null;
      }
    };

    const dispatch = (resolved) => {
      if (!focused) return;
      if (resolved.action) {
        if (resolved.type === "down") onOpenSettings();
        return;
      }
      dispatchSyntheticKey(doc, resolved.type === "down" ? "keydown" : "keyup", resolved.keyCode);
      stopRepeat();
      if (resolved.type === "down") {
        repeatTimer = win.setTimeout(() => {
          repeatTimer = win.setInterval(() => {
            dispatchSyntheticKey(doc, "keydown", resolved.keyCode);
          }, GAMEPAD_REPEAT_INTERVAL_MS);
        }, GAMEPAD_REPEAT_DELAY_MS);
      }
    };

    const listConnectedGamepads = () => {
      const nav = win.navigator;
      const raw = nav && typeof nav.getGamepads === "function" ? nav.getGamepads() : [];
      const list = Array.prototype.filter.call(raw, (pad) => Boolean(pad));
      const steamPad = list.find((pad) => typeof pad.id === "string" && pad.id.endsWith(STEAM_GAMEPAD_ID_SUFFIX));
      if (steamPad) return [steamPad];
      return list.filter((pad) => pad.connected !== false);
    };

    const poll = () => {
      const gamepads = listConnectedGamepads();
      const seen = {};
      gamepads.forEach((pad) => {
        seen[pad.index] = true;
        const result = mapGamepadState(padStates[pad.index], pad);
        padStates[pad.index] = result.state;
        result.events.forEach(dispatch);
      });
      Object.keys(padStates).forEach((index) => {
        if (!seen[index]) delete padStates[index];
      });
      frameHandle = win.requestAnimationFrame(poll);
    };

    return {
      start() {
        if (frameHandle !== null) return;
        if (!getEnabled()) return;
        frameHandle = win.requestAnimationFrame(poll);
      },
      stop() {
        if (frameHandle !== null && typeof win.cancelAnimationFrame === "function") {
          win.cancelAnimationFrame(frameHandle);
        }
        frameHandle = null;
        stopRepeat();
      },
      isPolling() {
        return frameHandle !== null;
      }
    };
  };

  // -------------------------------------------------------------------------
  // Keybinds
  //
  // Provenance (all adapted for Lalin Cast):
  //   - reference/vacuumtube/src/preload/modules/settings/index.js
  //     (lines 409–411): the global Ctrl+O hotkey. Upstream calls
  //     `toggleSettingsOverlay()`; Lalin Cast has no in-page settings
  //     overlay, so it emits `lalin-cast-shell` `{ action: "open-settings" }`
  //     instead — the same action the controller's R3 button emits.
  //   - reference/vacuumtube/src/preload/modules/keybinds.js: the Shift+Enter
  //     long-press emulation (same `setTimeout` patch + regex heuristic,
  //     ported as-is — it has no Electron dependency), the Ctrl+Shift+C
  //     copy-URL binding (upstream builds the URL from internal YouTube
  //     player/command state via `resolveCommandModifiers`; Lalin Cast stays
  //     within the "key events only" ToS-safe boundary described in
  //     docs/plans/W3_CONTROLS_PLAN.md and instead strips everything but
  //     `v`/`list` from the current location, see buildShareUrl() below),
  //     and the "C" captions toggle (upstream calls into
  //     `resolveCommandModifiers`; Lalin Cast dispatches a synthetic keyCode
  //     67 keydown/keyup via the same technique used by the controller and
  //     mouse sections, instead of patching YouTube's internal command
  //     resolver).
  //   - reference/vacuumtube/src/preload/modules/mouse.js: the right-click
  //     "back" binding (dispatches a synthetic Escape keydown, then its
  //     keyup 50 ms later, exactly as upstream). The same file's cursor
  //     auto-hide and scroll-wheel blocking are not ported in wave 3 (out of
  //     scope).
  //   - reference/vacuumtube/src/preload/modules/no-f11.js: upstream only
  //     swallows the F11 keydown (`e.stopImmediatePropagation()`) so YouTube
  //     never sees it. Lalin Cast additionally emits `lalin-cast-shell`
  //     `{ action: "toggle-fullscreen" }` and calls `e.preventDefault()`, so
  //     F11 drives the native window's fullscreen state instead of only
  //     being suppressed.
  //
  // A single delegating keydown listener (capture phase, matching most of
  // the upstream listeners above) replaces the several separate per-binding
  // listeners upstream registers; `keybindFor()` is the pure classifier
  // every binding above (plus the mouse "back" binding) resolves through.
  // -------------------------------------------------------------------------

  // Classifies one input (a real keydown/mousedown, normalized to a plain
  // object) into a named action, or null. `prefs` is accepted for parity
  // with the documented signature; no binding here is currently gated by a
  // pref (unlike the controller and volume sections).
  const keybindFor = (input, prefs) => {
    void prefs;
    if (!input || typeof input !== "object") return null;

    if (input.type === "mousedown") {
      return input.button === 2 ? "back" : null;
    }

    if (input.type !== "keydown") return null;

    const key = typeof input.key === "string" ? input.key : "";
    const lower = key.toLowerCase();
    const ctrl = Boolean(input.ctrlKey);
    const shift = Boolean(input.shiftKey);
    const meta = Boolean(input.metaKey);

    // Ctrl+Shift+C (keybinds.js) takes priority over the plain "C" captions
    // toggle below, since its modifiers are a strict superset of that one's.
    if (ctrl && shift && lower === "c") return "copy-url";

    // Ctrl+O (settings/index.js lines 409-411).
    if (ctrl && lower === "o") return "open-settings";

    // F11 (no-f11.js) — upstream checks no modifiers at all.
    if (key === "F11") return "toggle-fullscreen";

    // Shift+Enter (keybinds.js long-press emulation).
    if (shift && key === "Enter") return "longpress-enter";

    // "C", matching upstream's exact guard (ctrl/shift/meta excluded; Alt is
    // not checked upstream either).
    if (!ctrl && !shift && !meta && lower === "c") return "toggle-captions";

    return null;
  };

  // Ported as-is from keybinds.js: a very targeted `setTimeout` patch that
  // only zeroes the delay of a callback shaped like YouTube's internal
  // "long-press" timer (`function(){x.x(x,x)}` once minified), and only
  // while Shift and Enter are both currently held. No Electron dependency,
  // so this needs no adaptation beyond taking `doc`/`win` as parameters
  // instead of closing over the globals directly.
  const LONGPRESS_CALLBACK_SHAPE = /^function\(\)\{[^.]+\.[^(]+\([^,]+,[^)]+\)\}$/;

  const createLongPressEnterPatch = (doc, win) => {
    let shiftHeld = false;
    let enterHeld = false;
    let shiftEnterHeld = false;

    const onKeyDown = (e) => {
      if (e.key === "Shift") shiftHeld = true;
      if (e.key === "Enter") enterHeld = true;
      shiftEnterHeld = shiftHeld && enterHeld;
    };
    const onKeyUp = (e) => {
      if (e.key === "Shift") shiftHeld = false;
      if (e.key === "Enter") enterHeld = false;
      shiftEnterHeld = shiftHeld && enterHeld;
    };

    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("keyup", onKeyUp, true);

    const originalSetTimeout = win.setTimeout.bind(win);
    win.setTimeout = (callback, delay, ...rest) => {
      let effectiveDelay = delay;
      if (
        shiftEnterHeld &&
        typeof callback === "function" &&
        LONGPRESS_CALLBACK_SHAPE.test(callback.toString())
      ) {
        effectiveDelay = 0;
      }
      return originalSetTimeout(() => callback(...rest), effectiveDelay);
    };

    return {
      isActive() { return shiftEnterHeld; },
      destroy() {
        doc.removeEventListener("keydown", onKeyDown, true);
        doc.removeEventListener("keyup", onKeyUp, true);
        win.setTimeout = originalSetTimeout;
      }
    };
  };

  // Strips everything but `v`/`list` from a URL for the Ctrl+Shift+C
  // clipboard binding, rebuilding a canonical watch/playlist link. Params
  // can live in the real query string, or (on the Leanback hash route,
  // e.g. "#/watch?v=xxx&list=yyy") inside the fragment; both are checked,
  // hash taking priority since that is where they live while watching.
  const buildShareUrl = (href) => {
    if (typeof href !== "string" || href.length === 0) return null;
    let parsed;
    try {
      parsed = new URL(href);
    } catch {
      return null;
    }

    let hashParams = null;
    const hash = parsed.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex !== -1) {
      try {
        hashParams = new URLSearchParams(hash.slice(qIndex + 1));
      } catch {
        hashParams = null;
      }
    }

    const pick = (name) => (hashParams && hashParams.get(name)) || parsed.searchParams.get(name);

    const id = pick("v");
    const list = pick("list");

    if (id && VIDEO_ID_PATTERN.test(id)) {
      return list && PLAYLIST_ID_PATTERN.test(list)
        ? `https://${YOUTUBE_CANONICAL_HOST}/watch?v=${id}&list=${list}`
        : `https://${YOUTUBE_CANONICAL_HOST}/watch?v=${id}`;
    }
    if (list && PLAYLIST_ID_PATTERN.test(list)) {
      return `https://${YOUTUBE_CANONICAL_HOST}/playlist?list=${list}`;
    }
    return null;
  };

  // Writes to the clipboard. Only ever called from the keydown handler
  // below, in direct response to the qualifying keypress — never on load,
  // on a timer, or from any other code path.
  const copyShareUrlFromKeypress = (win) => {
    const url = buildShareUrl(win.location ? win.location.href : "");
    if (!url) return;
    const clipboard = win.navigator && win.navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    clipboard.writeText(url).catch(() => {});
  };

  const createMouseHandler = (doc, win) => {
    const handler = (e) => {
      const action = keybindFor({ type: "mousedown", button: e.button });
      if (action !== "back") return;
      dispatchSyntheticKey(doc, "keydown", 27);
      win.setTimeout(() => dispatchSyntheticKey(doc, "keyup", 27), 50);
    };
    win.addEventListener("mousedown", handler);
    return handler;
  };

  const createKeybindHandler = (doc, win, callbacks) => {
    const onOpenSettings = (callbacks && callbacks.onOpenSettings) || (() => {});
    const onToggleFullscreen = (callbacks && callbacks.onToggleFullscreen) || (() => {});
    const longPress = createLongPressEnterPatch(doc, win);

    const handler = (e) => {
      const action = keybindFor({
        type: "keydown",
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey
      });
      if (!action) return;

      switch (action) {
        case "open-settings":
          e.preventDefault();
          e.stopPropagation();
          onOpenSettings();
          break;
        case "toggle-fullscreen":
          e.preventDefault();
          e.stopImmediatePropagation();
          onToggleFullscreen();
          break;
        case "copy-url":
          copyShareUrlFromKeypress(win);
          break;
        case "toggle-captions": {
          const body = doc.body;
          const watching = Boolean(
            body && body.classList &&
            (body.classList.contains("WEB_PAGE_TYPE_WATCH") || body.classList.contains("WEB_PAGE_TYPE_SHORTS"))
          );
          if (!watching) return;
          e.stopImmediatePropagation();
          e.stopPropagation();
          dispatchSyntheticKey(doc, "keydown", 67);
          dispatchSyntheticKey(doc, "keyup", 67);
          break;
        }
        case "longpress-enter":
          // No discrete dispatch here — the continuous Shift/Enter hold
          // state is tracked independently by `longPress`, above.
          break;
        default:
          break;
      }
    };

    doc.addEventListener("keydown", handler, true);
    return { handler, longPress };
  };

  // -------------------------------------------------------------------------
  // Volume
  //
  // Provenance: reference/vacuumtube/src/preload/modules/volume-control/index.js
  // and .../style.css — adapted for Lalin Cast. The +/-/M keydown matching
  // (including matching a synthetic numeric `.keyCode` with no `.key`, which
  // is how the controller section's Select/Start/L3 buttons above end up
  // driving volume — the same cross-module reuse upstream relies on), the 5%
  // step, the "only while watching" gate, and the periodic re-apply to newly
  // created player elements (every 100 ms) are all ported as-is. Two
  // changes: the CSS is inlined into the injected `<style>` element instead
  // of read from disk (`fs.readFileSync` is unavailable in a WebView), and
  // every id/class is renamed so the on-screen indicator is entirely our own
  // element (`#lalin-cast-volume-osd`, `<style id="lalin-cast-volume-style">`)
  // — it is never YouTube's own volume indicator DOM.
  // -------------------------------------------------------------------------

  const VOLUME_OSD_ID = "lalin-cast-volume-osd";
  const VOLUME_STYLE_ID = "lalin-cast-volume-style";
  const VOLUME_ICON_CLASS = "lalin-cast-volume-icon";
  const VOLUME_TRACK_CLASS = "lalin-cast-volume-track";
  const VOLUME_BAR_CLASS = "lalin-cast-volume-bar";
  const VOLUME_TEXT_CLASS = "lalin-cast-volume-text";
  const VOLUME_VISIBLE_CLASS = "is-visible";
  const VOLUME_STEP = 5;
  const VOLUME_HIDE_DELAY_MS = 1500;
  const VOLUME_SYNC_INTERVAL_MS = 100;

  const VOLUME_OSD_CSS = `
#${VOLUME_OSD_ID} {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  border-radius: 1.5rem;
  background-color: rgba(0, 0, 0, 0.6);
  color: #fff;
  z-index: 2147483647;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease-in-out;
  font-family: system-ui, sans-serif;
}
#${VOLUME_OSD_ID}.${VOLUME_VISIBLE_CLASS} { opacity: 1; }
.${VOLUME_ICON_CLASS} { width: 20px; height: 20px; flex: 0 0 auto; }
.${VOLUME_TRACK_CLASS} { width: 180px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.3); overflow: hidden; }
.${VOLUME_BAR_CLASS} { height: 100%; background: #fff; border-radius: 3px; transition: width 0.1s linear; }
.${VOLUME_TEXT_CLASS} { min-width: 44px; text-align: right; font-size: 16px; font-weight: 600; }
`;

  const clampVolume = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(100, Math.max(0, Math.round(num)));
  };

  // Matches a keydown to a volume action. Deliberately checks `.key` first
  // and falls back to `.keyCode`, exactly like upstream's
  // `const key = e.key || e.keyCode`, so it also matches the synthetic
  // (`.key`-less) events the controller section dispatches for the
  // Select/Start/L3 buttons. No modifier gating, matching upstream.
  const volumeActionFor = (input) => {
    if (!input || input.type !== "keydown") return null;
    const token = (typeof input.key === "string" && input.key.length > 0) ? input.key : input.keyCode;
    if (token === "+" || token === "=" || token === 187) return "volume-up";
    if (token === "-" || token === 189) return "volume-down";
    if (token === "m" || token === "M" || token === 77) return "mute";
    return null;
  };

  // Only intercepts volume keys while actually watching a video/short —
  // matches upstream's `isWatching()` gate (reading, never writing, YouTube's
  // own `window.yt` player state and shorts-page focus class).
  const isWatchingVideo = (doc, win) => {
    try {
      const shortsFocused = typeof doc.querySelector === "function" && doc.querySelector("ytlr-shorts-page.zylon-focus");
      if (shortsFocused) return true;
      const baseUri = win && win.yt && win.yt.player && win.yt.player.utils &&
        win.yt.player.utils.videoElement_ && win.yt.player.utils.videoElement_.baseURI;
      return typeof baseUri === "string" && baseUri.indexOf("/watch?v=") !== -1;
    } catch {
      return false;
    }
  };

  const createVolumeControl = (doc, options) => {
    const opts = options || {};
    const getPlayers = opts.getPlayers || (() => {
      if (typeof doc.querySelectorAll !== "function") return [];
      return Array.prototype.slice.call(doc.querySelectorAll(".html5-video-player"));
    });
    const timerWin = opts.win || (typeof window !== "undefined" ? window : null);

    let volume = clampVolume(typeof opts.initialVolume === "number" ? opts.initialVolume : 100);
    let muted = false;
    let hideTimer = null;
    let elements = null;

    const ensureStyle = () => {
      if (doc.getElementById(VOLUME_STYLE_ID)) return;
      const style = doc.createElement("style");
      style.id = VOLUME_STYLE_ID;
      style.textContent = VOLUME_OSD_CSS;
      const parent = doc.head || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(style);
    };

    const ensureOsd = () => {
      if (elements) return elements;
      const existing = doc.getElementById(VOLUME_OSD_ID);
      if (existing && existing.parentNode && typeof existing.parentNode.removeChild === "function") {
        // Re-initialisation: rebuild rather than adopt an element whose
        // inner parts we cannot reach.
        existing.parentNode.removeChild(existing);
      }

      const osd = doc.createElement("div");
      osd.id = VOLUME_OSD_ID;

      const icon = doc.createElement("div");
      icon.className = VOLUME_ICON_CLASS;

      const track = doc.createElement("div");
      track.className = VOLUME_TRACK_CLASS;

      const bar = doc.createElement("div");
      bar.className = VOLUME_BAR_CLASS;
      track.appendChild(bar);

      const text = doc.createElement("span");
      text.className = VOLUME_TEXT_CLASS;

      osd.appendChild(icon);
      osd.appendChild(track);
      osd.appendChild(text);

      const parent = doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(osd);

      elements = { osd, icon, bar, text };
      return elements;
    };

    const show = () => {
      ensureStyle();
      const els = ensureOsd();
      const shown = muted ? 0 : volume;
      if (els.bar) els.bar.style.width = `${shown}%`;
      if (els.text) els.text.textContent = `${shown}%`;
      if (els.icon) {
        const level = muted || volume === 0 ? "is-muted" : volume <= 50 ? "is-low" : "is-high";
        els.icon.className = `${VOLUME_ICON_CLASS} ${level}`;
      }
      if (els.osd.classList) els.osd.classList.add(VOLUME_VISIBLE_CLASS);

      if (timerWin) {
        if (hideTimer !== null) timerWin.clearTimeout(hideTimer);
        hideTimer = timerWin.setTimeout(() => {
          if (els.osd.classList) els.osd.classList.remove(VOLUME_VISIBLE_CLASS);
        }, VOLUME_HIDE_DELAY_MS);
      }
    };

    // Players we have already pushed our level to. The periodic sync only
    // initialises new players and otherwise ADOPTS a level changed elsewhere
    // (phone remote via DIAL, the player's own UI) instead of overriding it
    // every tick — Lalin Cast is itself a DIAL receiver.
    const initializedPlayers = typeof WeakSet === "function" ? new WeakSet() : null;
    const applyToPlayers = (force) => {
      const players = getPlayers() || [];
      players.forEach((player) => {
        if (!player || typeof player.setVolume !== "function") return;
        const seen = initializedPlayers ? initializedPlayers.has(player) : false;
        if (force || !seen) {
          player.setVolume(muted ? 0 : volume);
          if (initializedPlayers) initializedPlayers.add(player);
        } else if (!muted && typeof player.getVolume === "function") {
          const external = Number(player.getVolume());
          if (Number.isFinite(external) && external !== volume) volume = clampVolume(external);
        }
      });
    };

    return {
      increase() { volume = clampVolume(volume + VOLUME_STEP); muted = false; show(); applyToPlayers(true); },
      decrease() { volume = clampVolume(volume - VOLUME_STEP); muted = false; show(); applyToPlayers(true); },
      toggleMute() { muted = !muted; show(); applyToPlayers(true); },
      sync() { applyToPlayers(false); },
      getVolume() { return volume; },
      isMuted() { return muted; }
    };
  };

  const createVolumeKeydownHandler = (doc, win, volumeControl) => {
    const handler = (e) => {
      const action = volumeActionFor({ type: "keydown", key: e.key, keyCode: e.keyCode });
      if (!action) return;
      if (!isWatchingVideo(doc, win)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (action === "volume-up") volumeControl.increase();
      else if (action === "volume-down") volumeControl.decrease();
      else volumeControl.toggleMute();
    };
    doc.addEventListener("keydown", handler, true);
    return handler;
  };

  const startVolumeSync = (win, volumeControl) => win.setInterval(() => volumeControl.sync(), VOLUME_SYNC_INTERVAL_MS);

  // -------------------------------------------------------------------------
  // Pause on blur
  //
  // Provenance: reference/vacuumtube/src/preload/modules/pause-on-blur.js —
  // adapted for Lalin Cast. The `visibilitychange`/`webkitvisibilitychange`
  // suppression (so YouTube never runs its own default pause-on-hide
  // behavior) is ported as-is. Two changes: upstream's trigger,
  // `ipcRenderer.on('blur', ...)`, becomes a direct window `blur` listener
  // (no Electron main process here), and upstream's pause action —
  // `resolveCommandModifiers.resolveCommand({ playerControlAction: ... })`
  // — becomes a direct `video.pause()` call on every `<video>` element, to
  // stay within the "key events only" ToS-safe boundary this port is held
  // to rather than reach into YouTube's internal command resolver. The
  // `config.pause_on_blur` gate becomes the `pauseOnBlur` pref from
  // `window.__LALIN_PREFS__` / `lalin-cast-prefs`.
  // -------------------------------------------------------------------------

  const shouldPauseOnBlur = (prefs) => Boolean(prefs && prefs.pauseOnBlur === true);

  const createPauseOnBlurHandler = (doc, win, getPrefs) => {
    const blockVisibility = (e) => {
      if (e && typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    };

    const pauseVideos = () => {
      if (!shouldPauseOnBlur(getPrefs())) return;
      if (typeof doc.querySelectorAll !== "function") return;
      const videos = doc.querySelectorAll("video");
      Array.prototype.forEach.call(videos, (video) => {
        if (video && typeof video.pause === "function") video.pause();
      });
    };

    doc.addEventListener("visibilitychange", blockVisibility);
    doc.addEventListener("webkitvisibilitychange", blockVisibility);
    win.addEventListener("blur", pauseVideos);

    return { pauseVideos };
  };

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  const SHELL_ACTIONS = Object.freeze({
    OPEN_SETTINGS: "open-settings",
    TOGGLE_FULLSCREEN: "toggle-fullscreen"
  });

  const emitShell = (action) => {
    const tauri = bridge();
    if (!tauri?.event?.emit) return Promise.resolve();
    return tauri.event.emit("lalin-cast-shell", { action }).catch(() => {});
  };

  // Waits (up to `timeoutMs`) for window.__TAURI__.event.listen to appear,
  // the same wait shape installBridge() above uses, kept as an independent
  // copy so that section's own diff stays untouched.
  const waitForBridge = async (timeoutMs) => {
    const limit = typeof timeoutMs === "number" ? timeoutMs : 10000;
    const started = Date.now();
    while (!bridge()?.event?.listen && Date.now() - started < limit) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return bridge();
  };

  const initPrefsAndDeepLink = async (win, state) => {
    const tauri = await waitForBridge();
    if (!tauri?.event?.listen) return;

    await tauri.event.listen("lalin-cast-prefs", (event) => {
      const next = applyPrefsUpdate(state.prefs, event?.payload || event);
      state.prefs = next;
      if (state.onPrefsChange) state.onPrefsChange(next);
    });

    await initDeepLinkListener(win, tauri);
  };

  const boot = () => {
    const prefs = readPrefs(window.__LALIN_PREFS__);
    // Same validator as the lalin-cast-deeplink path; the Rust side already
    // validated, this just keeps both entry points symmetric.
    initialDeepLink = prefs.deepLink && deepLinkToHash(prefs.deepLink) ? prefs.deepLink : null;

    initMark();
    installBridge();
    initSurfaceDetection();

    const state = { prefs };

    const gamepadController = createGamepadController(document, window, {
      getEnabled: () => state.prefs.controllerEnabled,
      onOpenSettings: () => emitShell(SHELL_ACTIONS.OPEN_SETTINGS)
    });
    if (state.prefs.controllerEnabled) gamepadController.start();

    createKeybindHandler(document, window, {
      onOpenSettings: () => emitShell(SHELL_ACTIONS.OPEN_SETTINGS),
      onToggleFullscreen: () => emitShell(SHELL_ACTIONS.TOGGLE_FULLSCREEN)
    });

    createMouseHandler(document, window);
    createPauseOnBlurHandler(document, window, () => state.prefs);

    const volumeControl = createVolumeControl(document, { win: window });
    createVolumeKeydownHandler(document, window, volumeControl);
    startVolumeSync(window, volumeControl);

    state.onPrefsChange = (next) => {
      if (next.controllerEnabled) gamepadController.start();
      else gamepadController.stop();
    };

    initPrefsAndDeepLink(window, state);
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DEFAULT_PREFS,
      readPrefs,
      applyPrefsUpdate,
      deepLinkToHash,
      buildShareUrl,
      clampVolume,
      volumeActionFor,
      isWatchingVideo,
      keybindFor,
      shouldPauseOnBlur,
      mapGamepadState,
      resolveGamepadEvent,
      GAMEPAD_KEY_CODE_MAP,
      GAMEPAD_FALLBACK_KEYCODE,
      GAMEPAD_SETTINGS_BUTTON,
      GAMEPAD_AXIS_CODES,
      GAMEPAD_AXIS_DEADZONE,
      SHELL_ACTIONS,
      dispatchSyntheticKey,
      createGamepadController,
      createLongPressEnterPatch,
      createMouseHandler,
      createKeybindHandler,
      createVolumeControl,
      createVolumeKeydownHandler,
      createPauseOnBlurHandler
    };
  }

  if (typeof window !== "undefined") {
    boot();
  }
})();
