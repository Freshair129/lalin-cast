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
  //     codecFilter: "off" | "h264",
  //     touchOverlay: boolean,
  //     sleepAtEndOfVideo: boolean, // wave 6 — see docs/plans/W6_POLISH_PLAN.md
  //     hideShorts: boolean,      // wave 8 — see docs/plans/W8_BOUNDARY_PLAN.md, "ซ่อน Shorts / guide tabs"
  //     hideGuideTabs: boolean,   // wave 8 — see docs/plans/W8_BOUNDARY_PLAN.md, "ซ่อน Shorts / guide tabs"
  //   };
  //
  // Rust -> page events this file listens for:
  //   "lalin-cast-prefs"    payload { lang, controllerEnabled, pauseOnBlur, codecFilter, touchOverlay, sleepAtEndOfVideo, hideShorts, hideGuideTabs }
  //   "lalin-cast-deeplink" payload { url }
  //   "lalin-cast-sleep"    payload { minutes } (wave 4 — see docs/plans/W4_PLAYBACK_PLAN.md)
  //   "lalin-cast-remote"   payload { action: "toggle-play" } (wave 6 — see docs/plans/W6_POLISH_PLAN.md,
  //     "Remote (Rust -> หน้า YouTube)". Sent from the tray/window play-pause item; whitelisted to
  //     exactly this one action, rate-limited 250 ms on this side.)
  //
  // page -> Rust events this file emits:
  //   "lalin-cast-shell" payload { action: "open-settings" | "toggle-fullscreen" | "toggle-mini" }
  //   "lalin-cast-media" payload { state: "playing" | "paused" | "idle", title: string } (wave 5 —
  //     see docs/plans/W5_DESKTOP_PLAN.md, "Now-playing"). The wave 5 "toggle-help" keybind is
  //     handled entirely on the page (see "Help overlay", below) and emits nothing to Rust.
  //
  // This file is a single `include_str!`-ed script, organized into
  // delimited sections. Most of it ports small modules from VacuumTube
  // (MIT-licensed, see LALIN_PROVENANCE.md and reference/vacuumtube/); each
  // ported section opens with a comment naming its upstream path(s). The
  // DIAL bridge / device-id sync / surface-detection section predates wave 3
  // and keeps its existing behavior unchanged aside from wiring the deep
  // link value described below. The playback-speed, help-overlay, and
  // now-playing sections (wave 5) are Lalin Cast originals — no VacuumTube
  // module offers any of the three, so each opens with its own note saying
  // so instead of a provenance path.
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
    deepLink: null,
    // Wave 4 additions (docs/plans/W4_PLAYBACK_PLAN.md, "ค่าคงที่และ contract"):
    codecFilter: "off",
    touchOverlay: true,
    // Wave 6 addition (docs/plans/W6_POLISH_PLAN.md, "Sleep at end of video"):
    sleepAtEndOfVideo: false,
    // Wave 8 additions (docs/plans/W8_BOUNDARY_PLAN.md, "ซ่อน Shorts / guide
    // tabs") — both opt-in and off by default. See the "Hide" section below
    // for what these actually drive (a CSS attribute toggle only).
    hideShorts: false,
    hideGuideTabs: false
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
      deepLink: typeof raw.deepLink === "string" && raw.deepLink.length > 0 ? raw.deepLink : DEFAULT_PREFS.deepLink,
      codecFilter: raw.codecFilter === "h264" ? "h264" : DEFAULT_PREFS.codecFilter,
      touchOverlay: raw.touchOverlay === false ? false : DEFAULT_PREFS.touchOverlay,
      sleepAtEndOfVideo: raw.sleepAtEndOfVideo === true ? true : DEFAULT_PREFS.sleepAtEndOfVideo,
      hideShorts: raw.hideShorts === true ? true : DEFAULT_PREFS.hideShorts,
      hideGuideTabs: raw.hideGuideTabs === true ? true : DEFAULT_PREFS.hideGuideTabs
    };
  };

  // Merges a `lalin-cast-prefs` payload ({ lang, controllerEnabled,
  // pauseOnBlur, codecFilter, touchOverlay, sleepAtEndOfVideo, hideShorts,
  // hideGuideTabs }, no `deepLink` field — that only ever arrives once, via
  // __LALIN_PREFS__ or a `lalin-cast-deeplink` event) onto the previous
  // prefs, ignoring unknown/malformed fields. Note that a later
  // `codecFilter` change is only ever *stored* here — per contract it takes
  // effect on the next page load, since installCodecFilter() (below) only
  // ever runs once, synchronously, from boot(). `hideShorts`/`hideGuideTabs`
  // are the opposite: applied immediately (see the "Hide" section below).
  const applyPrefsUpdate = (prev, payload) => {
    const base = prev && typeof prev === "object" ? prev : DEFAULT_PREFS;
    const next = {
      lang: base.lang,
      controllerEnabled: base.controllerEnabled,
      pauseOnBlur: base.pauseOnBlur,
      deepLink: base.deepLink,
      codecFilter: base.codecFilter,
      touchOverlay: base.touchOverlay,
      sleepAtEndOfVideo: base.sleepAtEndOfVideo,
      hideShorts: base.hideShorts,
      hideGuideTabs: base.hideGuideTabs
    };
    if (payload && typeof payload === "object") {
      if (payload.lang === "en" || payload.lang === "th") next.lang = payload.lang;
      if (typeof payload.controllerEnabled === "boolean") next.controllerEnabled = payload.controllerEnabled;
      if (typeof payload.pauseOnBlur === "boolean") next.pauseOnBlur = payload.pauseOnBlur;
      if (payload.codecFilter === "h264" || payload.codecFilter === "off") next.codecFilter = payload.codecFilter;
      if (typeof payload.touchOverlay === "boolean") next.touchOverlay = payload.touchOverlay;
      if (typeof payload.sleepAtEndOfVideo === "boolean") next.sleepAtEndOfVideo = payload.sleepAtEndOfVideo;
      if (typeof payload.hideShorts === "boolean") next.hideShorts = payload.hideShorts;
      if (typeof payload.hideGuideTabs === "boolean") next.hideGuideTabs = payload.hideGuideTabs;
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
  // Codec filter
  //
  // Provenance: reference/vacuumtube/src/preload/modules/h264ify.js (itself
  // adapted from https://github.com/erkserkserks/h264ify, MIT) — adapted for
  // Lalin Cast. Wraps `HTMLMediaElement.prototype.canPlayType` and
  // `window.MediaSource.isTypeSupported` so YouTube's own adaptive player
  // never selects a VP8/VP9/AV1 stream, falling back to H.264 — useful on
  // iGPUs/HTPCs with no hardware decoder for the newer codecs. Two
  // differences from upstream: upstream exposes four independent toggles
  // (webm/vp8/vp9/av1, each a bare `type.includes(...)` substring check);
  // Lalin Cast's contract (docs/plans/W4_PLAYBACK_PLAN.md) collapses this to
  // the single `codecFilter` pref ("off"|"h264"), which blocks vp8/vp9/av01
  // together (matching upstream's own default config, which ships all three
  // enabled) and leaves plain "webm" alone; instead of upstream's webm
  // toggle, the pattern also matches the four-part `vp08`/`vp09` codec ids
  // YouTube uses for VP8/VP9 in both WebM and MP4 containers. And the two wrapped functions return
  // spec-correct "unsupported" values (`false` for `isTypeSupported`, which
  // is defined to return a boolean; `""` for `canPlayType`, one of its three
  // defined return values) instead of upstream's blanket `''` for both.
  // -------------------------------------------------------------------------

  // Covers both the short tokens and the four-part forms YouTube hands
  // MediaSource (`vp09.00.10.08`, `vp08...`), which upstream only caught via
  // its separate webm-container toggle.
  const CODEC_BLOCK_PATTERN = /(vp08|vp09|vp8|vp9|av01)/i;

  // Pure: does `filter` allow this MediaSource/canPlayType `type` string?
  // "off" (or any value other than the documented "h264") allows everything.
  const codecAllowed = (type, filter) => {
    if (filter !== "h264") return true;
    return !CODEC_BLOCK_PATTERN.test(typeof type === "string" ? type : "");
  };

  // Installs the two overrides on `win` when `filter === "h264"`; installs
  // nothing at all (leaves both APIs completely untouched) for any other
  // value, per contract. Called once, synchronously, from boot() — before
  // any page script gets a chance to run its own codec capability probing,
  // since this whole file is registered as the media window's
  // `initialization_script` (see the file-level comment at the top).
  const installCodecFilter = (win, filter) => {
    if (filter !== "h264") return;
    if (!win || typeof win !== "object") return;

    const mediaSource = win.MediaSource;
    if (mediaSource && typeof mediaSource.isTypeSupported === "function") {
      const original = mediaSource.isTypeSupported.bind(mediaSource);
      mediaSource.isTypeSupported = (type) => (codecAllowed(type, filter) ? original(type) : false);
    }

    const proto = win.HTMLMediaElement && win.HTMLMediaElement.prototype;
    if (proto && typeof proto.canPlayType === "function") {
      const original = proto.canPlayType;
      proto.canPlayType = function overriddenCanPlayType(type) {
        return codecAllowed(type, filter) ? original.call(this, type) : "";
      };
    }
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
    // 3 (Y) was intentionally unmapped upstream (fell back to GAMEPAD_FALLBACK_KEYCODE).
    // Wave 6 (docs/plans/W6_POLISH_PLAN.md, "Controller"): special-cased in
    // resolveGamepadEvent() below, like R3, to dispatch the "toggle-help"
    // action instead of a keyCode.
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
  const GAMEPAD_HELP_BUTTON = 3; // Y (wave 6 — toggle-help while controllerEnabled)
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
  // { type, code, keyCode } or, for R3/Y, an { type, action } — mirroring
  // controller-support.js's `simulateKeyDown`/`simulateKeyUp`, which special-
  // cases 'vt-settings' and does nothing at all on its keyup. Wave 6 adds Y
  // (GAMEPAD_HELP_BUTTON) alongside R3, the same way: action-only, keyup a
  // no-op.
  const resolveGamepadEvent = (rawEvent) => {
    if (rawEvent.code === GAMEPAD_SETTINGS_BUTTON) {
      return rawEvent.type === "down" ? { type: "down", action: "open-settings" } : null;
    }
    if (rawEvent.code === GAMEPAD_HELP_BUTTON) {
      return rawEvent.type === "down" ? { type: "down", action: "toggle-help" } : null;
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
    // Wave 6 — Y button (docs/plans/W6_POLISH_PLAN.md, "Controller").
    const onToggleHelp = (options && options.onToggleHelp) || (() => {});

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
        if (resolved.type === "down") {
          if (resolved.action === "open-settings") onOpenSettings();
          else if (resolved.action === "toggle-help") onToggleHelp();
        }
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
  // pref (unlike the controller and volume sections). `input.code` (the
  // physical key, e.g. "Period") is optional — wave 5's speed/help bindings
  // below check it before falling back to `input.key` (the produced
  // character), so they still work on keyboard layouts where Shift+Period/
  // Comma/Slash does not produce ">"/"<"/"?" — see docs/plans/W5_DESKTOP_PLAN.md,
  // "Playback speed" / "Help overlay".
  const keybindFor = (input, prefs) => {
    void prefs;
    if (!input || typeof input !== "object") return null;

    if (input.type === "mousedown") {
      return input.button === 2 ? "back" : null;
    }

    if (input.type !== "keydown") return null;

    const key = typeof input.key === "string" ? input.key : "";
    const code = typeof input.code === "string" ? input.code : "";
    const lower = key.toLowerCase();
    const ctrl = Boolean(input.ctrlKey);
    const shift = Boolean(input.shiftKey);
    const meta = Boolean(input.metaKey);

    // Ctrl+Shift+C (keybinds.js) takes priority over the plain "C" captions
    // toggle below, since its modifiers are a strict superset of that one's.
    if (ctrl && shift && lower === "c") return "copy-url";

    // Ctrl+Shift+M (Lalin Cast wave 4 addition, not ported from VacuumTube —
    // see docs/plans/W4_PLAYBACK_PLAN.md). createKeybindHandler's dispatch
    // for this action calls e.stopImmediatePropagation(), matching the
    // toggle-fullscreen case below, so this never also reaches the volume
    // section's plain-"M" mute binding registered after it on the same
    // document/capture phase.
    if (ctrl && shift && lower === "m") return "toggle-mini";

    // Ctrl+O (settings/index.js lines 409-411).
    if (ctrl && lower === "o") return "open-settings";

    // F11 (no-f11.js) — upstream checks no modifiers at all.
    if (key === "F11") return "toggle-fullscreen";

    // Shift+Enter (keybinds.js long-press emulation).
    if (shift && key === "Enter") return "longpress-enter";

    // "C", matching upstream's exact guard (ctrl/shift/meta excluded; Alt is
    // not checked upstream either).
    if (!ctrl && !shift && !meta && lower === "c") return "toggle-captions";

    // Playback speed (Lalin Cast wave 5 addition, not ported from
    // VacuumTube — see docs/plans/W5_DESKTOP_PLAN.md, "Playback speed"; no
    // upstream module offers a speed control at all). No Ctrl/Meta, matching
    // the documented "(ไม่มี modifier อื่น)" for the sibling toggle-help
    // binding below.
    if (!ctrl && !meta && shift && (code === "Period" || key === ">")) return "speed-up";
    if (!ctrl && !meta && shift && (code === "Comma" || key === "<")) return "speed-down";

    // Help overlay (Lalin Cast wave 5 addition, same doc — no upstream
    // module). "?" is produced by Shift+Slash on a US layout; F1 toggles it
    // too, but only completely bare (no Ctrl/Shift/Meta at all).
    if (!ctrl && !meta && shift && (code === "Slash" || key === "?")) return "toggle-help";
    if (!ctrl && !shift && !meta && key === "F1") return "toggle-help";

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
    const onToggleMini = (callbacks && callbacks.onToggleMini) || (() => {});
    // Wave 5 additions — see docs/plans/W5_DESKTOP_PLAN.md.
    const onSpeedUp = (callbacks && callbacks.onSpeedUp) || (() => {});
    const onSpeedDown = (callbacks && callbacks.onSpeedDown) || (() => {});
    const onToggleHelp = (callbacks && callbacks.onToggleHelp) || (() => {});
    const longPress = createLongPressEnterPatch(doc, win);

    const handler = (e) => {
      const action = keybindFor({
        type: "keydown",
        key: e.key,
        code: e.code,
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
        case "toggle-mini":
          e.preventDefault();
          e.stopImmediatePropagation();
          onToggleMini();
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
        case "speed-up":
          e.preventDefault();
          e.stopImmediatePropagation();
          onSpeedUp();
          break;
        case "speed-down":
          e.preventDefault();
          e.stopImmediatePropagation();
          onSpeedDown();
          break;
        case "toggle-help":
          e.preventDefault();
          e.stopImmediatePropagation();
          onToggleHelp();
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
  // Hide (Shorts shelf / guide tab) — Lalin Cast original, NOT a port.
  //
  // Provenance / why this is not ported: upstream VacuumTube has two
  // modules that implement this same feature —
  // reference/vacuumtube/src/preload/modules/hide-shorts.js and
  // .../guide-tabs.js. Both register a response modifier via
  // `xhrModifiers.addResponseModifier`, i.e. both intercept and rewrite the
  // JSON body of `/youtubei/v1/browse` (hide-shorts.js: filters the "Shorts"
  // shelf out of `sectionListRenderer.contents` before the page ever parses
  // it) and `/youtubei/v1/guide` (guide-tabs.js: filters entries out of
  // `guideSectionRenderer.items` keyed on each entry's icon type). That is
  // exactly the same class of mechanism as the ad-filtering approach this
  // wave's founder decision rules out for Lalin Cast (see
  // docs/plans/W8_BOUNDARY_PLAN.md, "เส้นที่ห้ามข้ามใน wave นี้"): both read
  // and rewrite YouTube's own network response before the page sees it.
  // Lalin Cast does not do that here, or anywhere. This section shares no
  // code and no approach with either upstream file — it never wraps or
  // reads any browser network API, never reads or edits a YouTube network
  // response, and never removes a node from YouTube's DOM. It only reads
  // the DOM YouTube has *already rendered*, tags matching elements with our
  // own classes, and hides them with our own <style> element scoped to our
  // own `documentElement` data attributes — the same "our overlay, our
  // stylesheet" shape as the volume/touch/help/speed OSDs above, not a
  // network hook.
  //
  // Because the underlying feature is the same (a user-facing Shorts
  // shelf/tab toggle) the two icon-type/tag-name strings below happen to
  // overlap with values upstream's response filters also key on — that is
  // coincidence of the shared subject matter (YouTube's own naming), not
  // shared code: this file never reads those strings from a network
  // response, only from already-rendered DOM attributes.
  // -------------------------------------------------------------------------

  const HIDE_STYLE_ID = "lalin-cast-hide-style";
  const HIDE_SHORTS_CLASS = "lalin-cast-hidden-shorts";
  const HIDE_GUIDE_TAB_CLASS = "lalin-cast-hidden-guide-tab";
  const HIDE_SHORTS_DATASET_KEY = "lalinHideShorts";
  const HIDE_GUIDE_TABS_DATASET_KEY = "lalinHideGuideTabs";

  // Scoped to our own documentElement data attributes only — toggling is
  // ever only setting or deleting `documentElement.dataset.lalinHideShorts`
  // / `lalinHideGuideTabs` (see applyHidePrefsToDocument below), so this
  // rule set never needs to change at runtime and applies instantly with no
  // reload.
  const HIDE_STYLE_CSS = `
html[data-lalin-hide-shorts="true"] .${HIDE_SHORTS_CLASS} { display: none !important; }
html[data-lalin-hide-guide-tabs="true"] .${HIDE_GUIDE_TAB_CLASS} { display: none !important; }
`;

  // Observed-behaviour DOM signals (Leanback/TV YouTube) used to *identify*
  // candidate elements — this is NOT a documented contract from Google and
  // can change without notice, which is exactly why matching only ever adds
  // a class (never removes a node) and a scan that matches nothing is
  // silent rather than throwing. Deliberately non-text: no rule here reads
  // `textContent`/`aria-label`/any string that changes with UI language.
  //   - SHORTS_SHELF_TAG / SHORTS_SHELF_OVERLAY_SELECTOR: YouTube's internal
  //     codename for Shorts is "reel" (the web and mobile clients' Shorts
  //     shelf tags are literally `ytd-reel-shelf-renderer` /
  //     `ytm-reel-shelf-renderer`); the Leanback shelf renderer and a
  //     Shorts-specific thumbnail overlay attribute follow the same
  //     naming/attribute-reflection convention.
  //   - GUIDE_ENTRY_TAG / ICON_TYPE_ATTR / SHORTS_ICON_TYPE: a Leanback
  //     guide (side-nav) entry reflects its icon enum as a non-text
  //     `icon-type` attribute; `YOUTUBE_SHORTS_FILL_24` is the same enum
  //     name upstream's guide-tabs.js keys its (unused-by-us) `map` on.
  //   - HOME_ICON_TYPE: the Home entry's icon enum, named directly in
  //     guide-tabs.js's own commented-out map entry
  //     (`'WHAT_TO_WATCH': 'home'`) — used only as a defensive exclusion, on
  //     top of the fact that it can never equal SHORTS_ICON_TYPE.
  const HIDE_MATCH_SIGNALS = Object.freeze({
    SHORTS_SHELF_TAG: "YTLR-REEL-SHELF-RENDERER",
    SHORTS_SHELF_OVERLAY_SELECTOR: '[overlay-style="SHORTS"]',
    GUIDE_ENTRY_TAG: "YTLR-GUIDE-ENTRY-RENDERER",
    ICON_TYPE_ATTR: "icon-type",
    ICON_TYPE_SELECTOR: "[icon-type]",
    SHORTS_ICON_TYPE: "YOUTUBE_SHORTS_FILL_24",
    HOME_ICON_TYPE: "WHAT_TO_WATCH"
  });

  // CSS selectors used to gather scan candidates — kept next to the signals
  // above but separate, since a selector may need to be broader than the
  // exact positive-match tag (e.g. a generic shelf tag, filtered afterwards
  // by the pure matcher) without widening what actually counts as a match.
  const HIDE_SHELF_CANDIDATE_SELECTOR = "ytlr-reel-shelf-renderer, ytlr-shelf-renderer";
  const HIDE_GUIDE_CANDIDATE_SELECTOR = "ytlr-guide-entry-renderer";

  // Reads a candidate's icon-type: its own `icon-type` attribute, or — a
  // guide entry's icon is sometimes a nested element — the first descendant
  // carrying that attribute. Pure; never throws on a malformed element.
  const readIconType = (el) => {
    if (!el) return null;
    try {
      if (typeof el.getAttribute === "function") {
        const own = el.getAttribute(HIDE_MATCH_SIGNALS.ICON_TYPE_ATTR);
        if (typeof own === "string" && own.length > 0) return own;
      }
      if (typeof el.querySelector === "function") {
        const nested = el.querySelector(HIDE_MATCH_SIGNALS.ICON_TYPE_SELECTOR);
        if (nested && typeof nested.getAttribute === "function") {
          const value = nested.getAttribute(HIDE_MATCH_SIGNALS.ICON_TYPE_ATTR);
          if (typeof value === "string" && value.length > 0) return value;
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  // Pure: is `el` (an element-like object — only `tagName`/`getAttribute`/
  // `querySelector` are read, so a plain stub works with no real DOM) the
  // Shorts shelf on the Leanback home page? Never reads text content.
  const isShortsShelf = (el) => {
    if (!el || typeof el.tagName !== "string") return false;
    const tag = el.tagName.toUpperCase();
    if (tag === HIDE_MATCH_SIGNALS.SHORTS_SHELF_TAG) return true;
    if (typeof el.querySelector !== "function") return false;
    try {
      return Boolean(el.querySelector(HIDE_MATCH_SIGNALS.SHORTS_SHELF_OVERLAY_SELECTOR));
    } catch {
      return false;
    }
  };

  // Pure: is `el` a Shorts entry in the Leanback guide (side-nav)? Never
  // reads text content. Explicitly refuses to match the Home entry even
  // though its icon type could never equal SHORTS_ICON_TYPE in practice —
  // this is the belt to isFocusProtected's suspenders in scanAndHide below,
  // keeping the "never hide Home" rule visible and independently testable
  // right at the matcher.
  const isShortsGuideTab = (el) => {
    const iconType = readIconType(el);
    if (!iconType) return false;
    if (iconType === HIDE_MATCH_SIGNALS.HOME_ICON_TYPE) return false;
    return iconType === HIDE_MATCH_SIGNALS.SHORTS_ICON_TYPE;
  };

  // Injects the one shared <style> element, once, the same idempotent
  // get-then-create pattern as ensureStyle() in the Volume section above.
  const ensureHideStyle = (doc) => {
    if (!doc || typeof doc.getElementById !== "function") return;
    if (doc.getElementById(HIDE_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = HIDE_STYLE_CSS;
    const parent = doc.head || doc.documentElement;
    if (parent && typeof parent.appendChild === "function") parent.appendChild(style);
  };

  // The only thing toggling the prefs ever does: set or delete our two
  // documentElement data attributes. No re-scan needed — matching elements
  // are tagged with our classes independently of whether hiding is
  // currently on (see scanAndHide below), so flipping the attribute takes
  // effect the instant the CSS rule above re-evaluates, no reload.
  const applyHidePrefsToDocument = (doc, prefs) => {
    const root = doc && doc.documentElement;
    if (!root || !root.dataset) return;
    if (prefs && prefs.hideShorts) root.dataset[HIDE_SHORTS_DATASET_KEY] = "true";
    else delete root.dataset[HIDE_SHORTS_DATASET_KEY];
    if (prefs && prefs.hideGuideTabs) root.dataset[HIDE_GUIDE_TABS_DATASET_KEY] = "true";
    else delete root.dataset[HIDE_GUIDE_TABS_DATASET_KEY];
  };

  // One scan pass: gathers shelf/guide-entry candidates, tags the ones the
  // pure matchers accept with our own class — classList.add only, never a
  // node removal, never markup injection into an existing node, never
  // touching a node YouTube owns beyond adding one class of our own to it.
  // Skips anything that is
  // `document.activeElement` or an ancestor of it, so focus never gets
  // silently hidden out from under the user. Never throws on a malformed
  // `doc` and never logs; a pass over a page with no matching elements at
  // all is a plain no-op.
  const scanAndHide = (doc) => {
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    const active = doc.activeElement || null;
    const isFocusProtected = (el) => {
      let node = active;
      while (node) {
        if (node === el) return true;
        node = node.parentElement || null;
      }
      return false;
    };
    const tagIfMatch = (el, matches, className) => {
      if (!el || !matches(el) || isFocusProtected(el)) return;
      if (el.classList && typeof el.classList.add === "function") el.classList.add(className);
    };

    const shelves = doc.querySelectorAll(HIDE_SHELF_CANDIDATE_SELECTOR) || [];
    Array.prototype.forEach.call(shelves, (el) => tagIfMatch(el, isShortsShelf, HIDE_SHORTS_CLASS));

    const guideEntries = doc.querySelectorAll(HIDE_GUIDE_CANDIDATE_SELECTOR) || [];
    Array.prototype.forEach.call(guideEntries, (el) => tagIfMatch(el, isShortsGuideTab, HIDE_GUIDE_TAB_CLASS));
  };

  // Wires the always-on MutationObserver, coalesced through
  // requestAnimationFrame so at most one scan runs per animation frame no
  // matter how many DOM mutations land in between (the same "batch bursts
  // of mutation records into one pass" shape as initMark()'s observer
  // above, just explicitly coalesced rather than relying on a naturally
  // cheap callback). Runs an initial pass immediately for content already
  // on the page before boot() ever attaches this observer. A thrown
  // exception from a scan is swallowed here, never logged — matches the
  // "silent when nothing matches" contract even for the unexpected case of
  // a malformed DOM.
  const createHideObserver = (doc, win) => {
    ensureHideStyle(doc);
    let scheduled = false;
    const runScan = () => {
      scheduled = false;
      try {
        scanAndHide(doc);
      } catch {
        // Silent per contract — never throw, never log.
      }
    };
    const requestScan = () => {
      if (scheduled) return;
      scheduled = true;
      const raf = win && typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame : null;
      if (raf) raf.call(win, runScan);
      else runScan();
    };

    const ObserverCtor = (win && win.MutationObserver) ||
      (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    if (ObserverCtor && doc && typeof doc.querySelectorAll === "function") {
      const observer = new ObserverCtor(requestScan);
      if (typeof observer.observe === "function") {
        observer.observe(doc, { childList: true, subtree: true });
      }
    }

    requestScan();
    return { requestScan };
  };

  // -------------------------------------------------------------------------
  // Touch overlay
  //
  // Provenance: reference/vacuumtube/src/preload/modules/touch-support.js —
  // adapted for Lalin Cast. Upstream's directional/select/back circular
  // buttons, its `simulateKeyDown`/`simulateKeyUp` dispatch (the same
  // `document.dispatchEvent(new Event(...))` + manual `.keyCode` technique
  // this file's `dispatchSyntheticKey()` — defined in the Controller section
  // above — already implements for the controller and mouse sections; reused
  // here rather than duplicated), and its "only create once a touch has
  // actually happened" gating are all ported. Differences: upstream's
  // `config.touch_overlay` toggle becomes the `touchOverlay` pref from
  // `window.__LALIN_PREFS__` / `lalin-cast-prefs`; upstream's idle-timeout
  // auto-hide (hide 3s after the last touch, regardless of the config
  // toggle) is not ported — Lalin Cast's overlay instead simply tracks the
  // pref directly, so it stays visible for as long as `touchOverlay` is on
  // and hides/shows immediately when that pref changes via
  // `lalin-cast-prefs`, rather than on an idle timer; and a `playPause`
  // button is added (upstream only offers back/select/directions), since
  // Lalin Cast's touch overlay is meant to fully replace a physical remote
  // on handheld devices. It dispatches keyCode 179 (`VK_MEDIA_PLAY_PAUSE`,
  // the standard hardware media-key code — the same code a TV remote's own
  // dedicated play/pause button sends), since no polled gamepad button is
  // documented upstream as a dedicated play/pause key for the Controller
  // section above to already have a keyCode for. Upstream's native-scrollbar
  // feature-switch override (`enableTouchSupport` pushed onto
  // `configOverrides.tectonicConfigOverrides`) is not ported — it patches an
  // internal Leanback config object this file has no access to, and is out
  // of scope per docs/plans/W4_PLAYBACK_PLAN.md.
  // -------------------------------------------------------------------------

  const TOUCH_OVERLAY_ID = "lalin-cast-touch-overlay";
  const TOUCH_STYLE_ID = "lalin-cast-touch-style";
  const TOUCH_BUTTON_CLASS = "lalin-cast-touch-button";

  // Button id -> keyCode dispatched via dispatchSyntheticKey(). back/ok/the
  // four directions match touch-support.js's touchKeyCodeMap and this file's
  // own GAMEPAD_KEY_CODE_MAP (27/13/38/40/37/39) exactly; playPause (179) is
  // this port's own addition — see the provenance note above.
  const TOUCH_KEY_CODE_MAP = Object.freeze({
    back: 27,
    ok: 13,
    up: 38,
    down: 40,
    left: 37,
    right: 39,
    playPause: 179
  });

  const TOUCH_OVERLAY_CSS = `
#${TOUCH_OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
}
.${TOUCH_BUTTON_CLASS} {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
}
.${TOUCH_BUTTON_CLASS}-up { left: 76px; bottom: 168px; }
.${TOUCH_BUTTON_CLASS}-down { left: 76px; bottom: 32px; }
.${TOUCH_BUTTON_CLASS}-left { left: 8px; bottom: 100px; }
.${TOUCH_BUTTON_CLASS}-right { left: 144px; bottom: 100px; }
.${TOUCH_BUTTON_CLASS}-ok { left: 76px; bottom: 100px; }
.${TOUCH_BUTTON_CLASS}-back { right: 88px; bottom: 32px; }
.${TOUCH_BUTTON_CLASS}-playPause { right: 8px; bottom: 32px; width: 72px; height: 72px; }
`;

  // Pure: the button spec the overlay renders from — id/label/keyCode for
  // back, ok, the four directions, and playPause. No DOM. `lang` follows the
  // same "th"|"en" convention as the rest of this file's prefs.
  const touchButtons = (lang) => {
    const en = lang === "en";
    return [
      { id: "up", label: en ? "Up" : "ขึ้น", keyCode: TOUCH_KEY_CODE_MAP.up },
      { id: "down", label: en ? "Down" : "ลง", keyCode: TOUCH_KEY_CODE_MAP.down },
      { id: "left", label: en ? "Left" : "ซ้าย", keyCode: TOUCH_KEY_CODE_MAP.left },
      { id: "right", label: en ? "Right" : "ขวา", keyCode: TOUCH_KEY_CODE_MAP.right },
      { id: "ok", label: en ? "OK" : "ตกลง", keyCode: TOUCH_KEY_CODE_MAP.ok },
      { id: "back", label: en ? "Back" : "ย้อนกลับ", keyCode: TOUCH_KEY_CODE_MAP.back },
      { id: "playPause", label: en ? "Play/Pause" : "เล่น/หยุด", keyCode: TOUCH_KEY_CODE_MAP.playPause }
    ];
  };

  // Lazily builds (on the first touchstart) and shows/hides the on-screen
  // button overlay. Takes `doc`/`win` as explicit parameters, matching this
  // file's established convention (see e.g. createVolumeControl above), so
  // it can be exercised from injected.test.js against the stub DOM.
  const createTouchOverlay = (doc, win, options) => {
    const opts = options || {};
    const getLang = opts.getLang || (() => "th");

    let enabled = Boolean(opts.initialEnabled);
    let touched = false;
    let elements = null;

    const ensureStyle = () => {
      if (doc.getElementById(TOUCH_STYLE_ID)) return;
      const style = doc.createElement("style");
      style.id = TOUCH_STYLE_ID;
      style.textContent = TOUCH_OVERLAY_CSS;
      const parent = doc.head || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(style);
    };

    const build = () => {
      if (elements) return elements;
      ensureStyle();

      const overlay = doc.createElement("div");
      overlay.id = TOUCH_OVERLAY_ID;

      const buttons = {};
      touchButtons(getLang()).forEach((spec) => {
        const button = doc.createElement("div");
        button.id = `lalin-cast-touch-${spec.id}`;
        button.className = `${TOUCH_BUTTON_CLASS} ${TOUCH_BUTTON_CLASS}-${spec.id}`;
        button.textContent = spec.label;
        if (typeof button.addEventListener === "function") {
          button.addEventListener("touchstart", (e) => {
            if (e && typeof e.preventDefault === "function") e.preventDefault();
            dispatchSyntheticKey(doc, "keydown", spec.keyCode);
          });
          button.addEventListener("touchend", (e) => {
            if (e && typeof e.preventDefault === "function") e.preventDefault();
            dispatchSyntheticKey(doc, "keyup", spec.keyCode);
          });
        }
        overlay.appendChild(button);
        buttons[spec.id] = button;
      });

      const parent = doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(overlay);

      elements = { overlay, buttons };
      return elements;
    };

    const render = () => {
      if (!touched || !enabled) {
        if (elements && elements.overlay.style) elements.overlay.style.display = "none";
        return;
      }
      const els = build();
      if (els.overlay.style) els.overlay.style.display = "";
    };

    return {
      handleTouchStart() {
        if (touched) return;
        touched = true;
        render();
      },
      setEnabled(value) {
        enabled = Boolean(value);
        render();
      },
      isVisible() {
        return Boolean(touched && enabled && elements);
      },
      getButton(id) {
        return elements ? elements.buttons[id] || null : null;
      }
    };
  };

  // -------------------------------------------------------------------------
  // Sleep timer OSD (Lalin Cast addition — no VacuumTube module ports this;
  // VacuumTube has no sleep timer)
  //
  // Listens for the Rust sleep timer's "lalin-cast-sleep" event (see
  // src-tauri/src/sleep.rs and docs/plans/W4_PLAYBACK_PLAN.md): pauses every
  // <video> on the page and shows a bilingual OSD of our own for 6 seconds.
  // -------------------------------------------------------------------------

  const SLEEP_OSD_ID = "lalin-cast-sleep-osd";
  const SLEEP_OSD_TEXT = "หมดเวลาตั้งนอน — หยุดเล่นแล้ว / Sleep timer: playback paused";
  const SLEEP_OSD_VISIBLE_MS = 6000;

  const pauseAllVideos = (doc) => {
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    const videos = doc.querySelectorAll("video");
    Array.prototype.forEach.call(videos, (video) => {
      if (video && typeof video.pause === "function") video.pause();
    });
  };

  const createSleepOsd = (doc, win) => {
    let element = null;
    let hideTimer = null;

    const ensureElement = () => {
      if (element) return element;
      // Reuse an already-injected #lalin-cast-sleep-osd if one exists (e.g. a
      // second createSleepOsd() instance created against the same doc) so we
      // never inject a duplicate DOM id into the page. See docs/plans/
      // W6_POLISH_PLAN.md, "Sleep at end of video (U2)".
      const existing = typeof doc.getElementById === "function" ? doc.getElementById(SLEEP_OSD_ID) : null;
      if (existing) {
        element = existing;
        return element;
      }
      const el = doc.createElement("div");
      el.id = SLEEP_OSD_ID;
      el.textContent = SLEEP_OSD_TEXT;
      if (el.style) {
        Object.assign(el.style, {
          position: "fixed",
          top: "12%",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "16px 28px",
          borderRadius: "0.75rem",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          textAlign: "center",
          zIndex: "2147483647"
        });
      }
      const parent = doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(el);
      element = el;
      return element;
    };

    return {
      // `text` defaults to the sleep-timer wording; wave 6's sleep-at-end
      // section (below) reuses this same OSD element/timer with its own
      // bilingual text instead of duplicating the show/hide machinery.
      show(text) {
        pauseAllVideos(doc);
        const el = ensureElement();
        el.textContent = typeof text === "string" && text.length > 0 ? text : SLEEP_OSD_TEXT;
        if (el.style) el.style.display = "";
        if (hideTimer !== null && typeof win.clearTimeout === "function") {
          win.clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (win && typeof win.setTimeout === "function") {
          hideTimer = win.setTimeout(() => {
            if (el.style) el.style.display = "none";
            hideTimer = null;
          }, SLEEP_OSD_VISIBLE_MS);
        }
      }
    };
  };

  // Wired from initPrefsAndDeepLink (Boot section, below) once the Tauri
  // bridge is ready, mirroring initDeepLinkListener's (win, tauri) shape.
  const initSleepListener = async (doc, win, tauri, osd) => {
    if (!tauri?.event?.listen) return;
    // `osd` lets boot() hand in the one createSleepOsd() instance shared with
    // createSleepAtEndHandler below, so both features drive the same
    // #lalin-cast-sleep-osd element instead of each creating their own; falls
    // back to a fresh instance when called standalone (e.g. existing tests).
    const sharedOsd = osd || createSleepOsd(doc, win);
    await tauri.event.listen("lalin-cast-sleep", () => sharedOsd.show());
  };

  // -------------------------------------------------------------------------
  // Remote (Lalin Cast original — wave 6, docs/plans/W6_POLISH_PLAN.md,
  // "Remote (Rust -> หน้า YouTube)")
  //
  // Listens for the tray/window play-pause item's "lalin-cast-remote" event
  // (wired by initPrefsAndDeepLink below, via the same bridge-wait pattern
  // initDeepLinkListener/initSleepListener already use). Whitelisted to
  // exactly { action: "toggle-play" } — anything else is dropped silently —
  // and rate-limited to one accepted call per 250 ms on this side, since the
  // event can in principle fire faster than a human ever double-clicks tray
  // icons. Never touches YouTube's DOM beyond <video> elements, per contract.
  // -------------------------------------------------------------------------

  const REMOTE_RATE_LIMIT_MS = 250;

  // Pure: whether an incoming lalin-cast-remote payload should be acted on
  // right now. `lastAcceptedAt` is the timestamp of the previous accepted
  // call (null if none yet); `now` is the current timestamp. Rejects
  // anything but the exact whitelisted shape, and any call within
  // REMOTE_RATE_LIMIT_MS of the last accepted one.
  const remoteActionAllowed = (payload, lastAcceptedAt, now) => {
    if (!payload || typeof payload !== "object" || payload.action !== "toggle-play") return false;
    if (typeof lastAcceptedAt === "number" && typeof now === "number" && now - lastAcceptedAt < REMOTE_RATE_LIMIT_MS) {
      return false;
    }
    return true;
  };

  // Toggle-play semantics: if any <video> is currently playing
  // (!paused && !ended), pause every <video>; otherwise play() the first
  // paused <video> found, swallowing a promise rejection (autoplay policy,
  // no active video, etc.) so it never surfaces as an unhandled rejection.
  const toggleRemotePlayback = (doc) => {
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    const videos = Array.prototype.slice.call(doc.querySelectorAll("video"));
    const anyPlaying = videos.some((video) => video && !video.paused && !video.ended);
    if (anyPlaying) {
      videos.forEach((video) => {
        if (video && typeof video.pause === "function") video.pause();
      });
      return;
    }
    const target = videos.find((video) => video && video.paused);
    if (target && typeof target.play === "function") {
      const result = target.play();
      if (result && typeof result.catch === "function") result.catch(() => {});
    }
  };

  // Wires the rate limiter + whitelist + toggle above into one payload
  // handler. `now` is overridable (this file's established testability
  // convention) so injected.test.js can drive the 250 ms window without a
  // real sleep.
  const createRemoteHandler = (doc, win, options) => {
    void win; // kept for parity with this file's other create*Handler factories
    const opts = options || {};
    const now = opts.now || (() => Date.now());
    let lastAcceptedAt = null;

    const handler = (payload) => {
      const t = now();
      if (!remoteActionAllowed(payload, lastAcceptedAt, t)) return;
      lastAcceptedAt = t;
      toggleRemotePlayback(doc);
    };

    return { handler };
  };

  // Wired from initPrefsAndDeepLink (Boot section, below), mirroring
  // initSleepListener's (doc, win, tauri) shape.
  const initRemoteListener = async (doc, win, tauri) => {
    if (!tauri?.event?.listen) return;
    const remote = createRemoteHandler(doc, win);
    await tauri.event.listen("lalin-cast-remote", (event) => {
      remote.handler(event?.payload || event);
    });
  };

  // -------------------------------------------------------------------------
  // Sleep at end of video (Lalin Cast original — wave 6,
  // docs/plans/W6_POLISH_PLAN.md, "Sleep at end of video (U2)")
  //
  // While `prefs.sleepAtEndOfVideo` is true (default false; updated from
  // `lalin-cast-prefs` like every other pref above): a capture-phase `ended`
  // on any <video> arms an 8 s window. The first `play`/`playing` from any
  // video inside that window — YouTube's Leanback autoplay-next — is paused
  // immediately and the wave 4 `#lalin-cast-sleep-osd` element (reused via
  // createSleepOsd's `show(text)`, above) shows the bilingual end-of-video
  // text below for 6 s, then the window disarms. No play within 8 s ->
  // silent disarm. `sleepAtEndDecision()` is the pure state machine;
  // `createSleepAtEndHandler()` wires it to real doc events + a setTimeout
  // for the 8 s expiry, so the window can never stay armed forever.
  // -------------------------------------------------------------------------

  const SLEEP_AT_END_WINDOW_MS = 8000;
  const SLEEP_AT_END_OSD_TEXT =
    "จบวิดีโอแล้ว — หยุดเล่นตามที่ตั้งไว้ / End of video: playback paused as requested";

  // Pure: decides what a sleep-at-end event should do to `state`
  // ({ armed, deadline } — `deadline` unused by the decision itself, kept
  // only so a caller can compute its own expiry; pass any object shape here,
  // it is never inspected beyond `.armed`). `eventType` is one of "ended",
  // "play"/"playing", or "expire" (fired by the caller's own 8 s timer, not
  // a real DOM event). `now` is accepted for the same testability
  // convention as the rest of this file's `now`-taking helpers, and is
  // echoed into the returned state's `deadline` on "arm" so a caller can
  // sanity-check timing without keeping its own copy.
  //   "ended"          -> always (re)arms, regardless of prior state.
  //   "play"/"playing" while armed  -> "pause-and-show", disarms.
  //   "play"/"playing" while disarmed -> "none", state unchanged.
  //   "expire" while armed   -> "disarm".
  //   "expire" while disarmed, or any other eventType -> "none", unchanged.
  const sleepAtEndDecision = (state, eventType, now) => {
    const base = state && typeof state === "object" ? state : { armed: false, deadline: null };
    if (eventType === "ended") {
      return { action: "arm", state: { armed: true, deadline: (typeof now === "number" ? now : 0) + SLEEP_AT_END_WINDOW_MS } };
    }
    if (eventType === "play" || eventType === "playing") {
      if (base.armed) return { action: "pause-and-show", state: { armed: false, deadline: null } };
      return { action: "none", state: base };
    }
    if (eventType === "expire") {
      if (base.armed) return { action: "disarm", state: { armed: false, deadline: null } };
      return { action: "none", state: base };
    }
    return { action: "none", state: base };
  };

  // Wires sleepAtEndDecision() to real capture-phase doc events, an OSD
  // (createSleepOsd's instance, reused so both features share one element
  // and one 6 s auto-hide timer), and a setTimeout standing in for the 8 s
  // expiry. `getPref` gates the "ended" branch only — per contract, Rust
  // never resets `sleepAtEndOfVideo` itself, so the page is the only place
  // this pref is read to decide whether to arm at all.
  const createSleepAtEndHandler = (doc, win, options) => {
    const opts = options || {};
    const getPref = opts.getPref || (() => false);
    const osd = opts.osd || createSleepOsd(doc, win);
    const now = opts.now || (() => (win && typeof win.Date !== "undefined" ? win.Date.now() : Date.now()));

    let state = { armed: false, deadline: null };
    let expireTimer = null;

    const clearExpireTimer = () => {
      if (expireTimer !== null && win && typeof win.clearTimeout === "function") {
        win.clearTimeout(expireTimer);
      }
      expireTimer = null;
    };

    const apply = (eventType) => {
      const result = sleepAtEndDecision(state, eventType, now());
      state = result.state;
      if (result.action === "arm") {
        clearExpireTimer();
        if (win && typeof win.setTimeout === "function") {
          expireTimer = win.setTimeout(() => {
            expireTimer = null;
            apply("expire");
          }, SLEEP_AT_END_WINDOW_MS);
        }
      } else if (result.action === "pause-and-show") {
        clearExpireTimer();
        osd.show(SLEEP_AT_END_OSD_TEXT);
      } else if (result.action === "disarm") {
        clearExpireTimer();
      }
      return result;
    };

    const onEnded = () => {
      if (getPref() !== true) return;
      apply("ended");
    };
    const onPlayish = () => {
      // Re-checked at fire time too: turning the pref off during the armed
      // window must not pause the very next play the user asked for.
      if (getPref() !== true) return;
      apply("play");
    };

    doc.addEventListener("ended", onEnded, true);
    doc.addEventListener("play", onPlayish, true);
    doc.addEventListener("playing", onPlayish, true);

    return {
      onEnded,
      onPlayish,
      getState: () => state
    };
  };

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
  // Playback speed (Lalin Cast addition — no VacuumTube module ports this;
  // VacuumTube has no playback-speed control)
  //
  // `desiredRate` is a session-only value (never persisted, no pref): the
  // speed-up/speed-down keybinds step it through the fixed `SPEED_RATES`
  // table via the pure `nextRate()` below and apply it to every <video> on
  // the page. Because setting `video.playbackRate` itself fires a
  // `ratechange` event, `applying` (below) distinguishes a change we just
  // caused (ignored — otherwise we'd immediately "adopt" our own write back
  // as if it were external) from a `ratechange` we did not cause — e.g. the
  // user picking a speed from YouTube's own player menu — which this
  // section always adopts as the new `desiredRate` rather than fighting it,
  // the same "adopt, don't fight" pattern the Volume section above already
  // uses for a level changed elsewhere (a phone remote via DIAL, YouTube's
  // own UI).
  // -------------------------------------------------------------------------

  const SPEED_RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const SPEED_OSD_ID = "lalin-cast-speed-osd";
  const SPEED_STYLE_ID = "lalin-cast-speed-style";
  const SPEED_OSD_VISIBLE_MS = 1500;

  const SPEED_OSD_CSS = `
#${SPEED_OSD_ID} {
  position: fixed;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 24px;
  border-radius: 0.75rem;
  background-color: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: 22px;
  font-weight: 600;
  z-index: 2147483647;
  display: none;
}
`;

  // Index of the SPEED_RATES entry closest to `value`. Ties (equidistant
  // from two entries) keep the lower/earlier one, since the comparison
  // below only replaces the current best on a strictly smaller difference.
  const nearestRateIndex = (value) => {
    let bestIndex = 0;
    let bestDiff = Math.abs(SPEED_RATES[0] - value);
    for (let i = 1; i < SPEED_RATES.length; i += 1) {
      const diff = Math.abs(SPEED_RATES[i] - value);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  // Pure: the next rate one step `"up"`/`"down"` from `current`. When
  // `current` is already one of SPEED_RATES, this steps to the adjacent
  // entry, clamping at the first/last entry (an "up" at 2 or a "down" at 0.5
  // both return unchanged). When `current` is NOT one of SPEED_RATES (an
  // adopted external rate the table doesn't contain, e.g. 1.6), this instead
  // snaps to the nearest table entry and does not also step — the next
  // press then continues stepping from that normalized value. `direction`
  // other than `"down"` (i.e. anything including `"up"`) steps up, matching
  // this file's established `mapGamepadState`-style "the meaningful branch
  // is named, everything else falls through" convention.
  const nextRate = (current, direction) => {
    const value = typeof current === "number" && Number.isFinite(current) ? current : 1;
    const index = SPEED_RATES.indexOf(value);
    if (index === -1) return SPEED_RATES[nearestRateIndex(value)];
    const nextIndex = direction === "down" ? index - 1 : index + 1;
    return SPEED_RATES[Math.max(0, Math.min(SPEED_RATES.length - 1, nextIndex))];
  };

  // "1×" / "1.5×" — Number#toString() already drops trailing zeros for every
  // entry in SPEED_RATES, so no extra formatting is needed.
  const formatRate = (rate) => `${rate}×`;

  const createSpeedOsd = (doc, win) => {
    let element = null;
    let hideTimer = null;

    const ensureStyle = () => {
      if (doc.getElementById(SPEED_STYLE_ID)) return;
      const style = doc.createElement("style");
      style.id = SPEED_STYLE_ID;
      style.textContent = SPEED_OSD_CSS;
      const parent = doc.head || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(style);
    };

    const ensureElement = () => {
      if (element) return element;
      ensureStyle();
      const el = doc.createElement("div");
      el.id = SPEED_OSD_ID;
      if (el.style) el.style.display = "none";
      const parent = doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(el);
      element = el;
      return element;
    };

    return {
      show(rate) {
        const el = ensureElement();
        el.textContent = formatRate(rate);
        if (el.style) el.style.display = "";
        if (hideTimer !== null && typeof win.clearTimeout === "function") {
          win.clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (win && typeof win.setTimeout === "function") {
          hideTimer = win.setTimeout(() => {
            if (el.style) el.style.display = "none";
            hideTimer = null;
          }, SPEED_OSD_VISIBLE_MS);
        }
      }
    };
  };

  // Wires desiredRate application/adoption to `doc` and returns the
  // increase()/decrease() entry points the speed-up/speed-down keybinds
  // call. `getVideos`/`osd` are overridable (matching this file's established
  // `doc`/`win`-parameter convention) so injected.test.js can exercise this
  // against stub videos without a real DOM.
  const createSpeedControl = (doc, win, options) => {
    const opts = options || {};
    const getVideos = opts.getVideos || (() => {
      if (typeof doc.querySelectorAll !== "function") return [];
      return Array.prototype.slice.call(doc.querySelectorAll("video"));
    });
    const osd = opts.osd || createSpeedOsd(doc, win);

    let desiredRate = 1;
    // True only for the duration of our own applyToVideo() write below —
    // lets onRateChange tell a ratechange fired *synchronously* by our own
    // write apart from one we did not cause. A real HTMLMediaElement fires
    // ratechange as a queued task instead, by which time this flag is
    // already clear again; that (asynchronous) echo is caught by the
    // rate === desiredRate check in onRateChange, so both timings are
    // covered.
    let applying = false;

    const applyToVideo = (video) => {
      if (!video) return;
      applying = true;
      try {
        video.playbackRate = desiredRate;
      } finally {
        applying = false;
      }
    };

    const applyToAll = () => {
      (getVideos() || []).forEach(applyToVideo);
    };

    // Adopts a ratechange we did not cause (YouTube's own speed menu) as the
    // new desiredRate. Not adopted, deliberately:
    //   - a rate that already equals desiredRate — the queued echo of our
    //     own applyToVideo() write (see `applying` above), or a no-op;
    //   - a ratechange while the element has no media yet (readyState 0):
    //     the HTML media load algorithm resets playbackRate to the default
    //     and fires ratechange BEFORE loadedmetadata whenever YouTube moves
    //     on to the next video, and adopting that reset would defeat the
    //     re-apply in onLoadedMetadata below.
    const onRateChange = (e) => {
      if (applying) return;
      const video = e && e.target;
      const rate = video ? Number(video.playbackRate) : NaN;
      if (!Number.isFinite(rate)) return;
      if (rate === desiredRate) return;
      if (Number(video.readyState) === 0) return;
      desiredRate = rate;
    };

    // Only re-applies desiredRate to a freshly loaded <video> when it is not
    // the platform default (1) — matches the documented "เฉพาะเมื่อ
    // desiredRate !== 1" so a session that never touched speed never writes
    // playbackRate at all.
    const onLoadedMetadata = (e) => {
      if (desiredRate === 1) return;
      applyToVideo(e && e.target);
    };

    doc.addEventListener("ratechange", onRateChange, true);
    doc.addEventListener("loadedmetadata", onLoadedMetadata, true);

    const setDesired = (rate) => {
      desiredRate = rate;
      applyToAll();
      osd.show(rate);
    };

    return {
      increase() { setDesired(nextRate(desiredRate, "up")); },
      decrease() { setDesired(nextRate(desiredRate, "down")); },
      getDesiredRate() { return desiredRate; }
    };
  };

  // -------------------------------------------------------------------------
  // Help overlay (Lalin Cast addition — no VacuumTube module ports this;
  // VacuumTube has no help overlay)
  //
  // A single bilingual keyboard+controller cheat sheet, built lazily (on
  // first toggle) from the pure `helpRows()` below — no `innerHTML` anywhere,
  // every row is `createElement`/`textContent`. Toggled by the `toggle-help`
  // keybind (handled by createKeybindHandler, above, like every other
  // keybind action); closing itself (Escape, a second `?`/F1, a backdrop
  // click) is handled by this section's own capture-phase keydown listener
  // plus a click listener on the overlay's own backdrop element, since none
  // of those are `keybindFor` actions.
  // -------------------------------------------------------------------------

  const HELP_OVERLAY_ID = "lalin-cast-help";
  const HELP_STYLE_ID = "lalin-cast-help-style";
  const HELP_PANEL_CLASS = "lalin-cast-help-panel";
  const HELP_TITLE_CLASS = "lalin-cast-help-title";
  const HELP_ROW_CLASS = "lalin-cast-help-row";
  const HELP_ACTION_CLASS = "lalin-cast-help-action";
  const HELP_KEY_CLASS = "lalin-cast-help-key";
  const HELP_CONTROLLER_CLASS = "lalin-cast-help-controller";

  const HELP_STYLE_CSS = `
#${HELP_OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: none;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.7);
  font-family: system-ui, sans-serif;
  color: #fff;
}
.${HELP_PANEL_CLASS} {
  background-color: rgba(20, 20, 20, 0.95);
  border-radius: 1rem;
  padding: 24px 32px;
  max-width: 640px;
  max-height: 80vh;
  overflow-y: auto;
}
.${HELP_TITLE_CLASS} { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
.${HELP_ROW_CLASS} {
  display: flex;
  gap: 20px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 16px;
}
.${HELP_ACTION_CLASS} { flex: 1 1 40%; }
.${HELP_KEY_CLASS} { flex: 1 1 30%; opacity: 0.85; }
.${HELP_CONTROLLER_CLASS} { flex: 1 1 30%; opacity: 0.85; }
`;

  const HELP_TITLE_TEXT = Object.freeze({
    th: "ปุ่มลัดคีย์บอร์ดและคอนโทรลเลอร์",
    en: "Keyboard & controller shortcuts"
  });

  // Pure: the rows the help overlay renders, in the order the keyboard
  // shortcuts table appears in README.md — one row per binding documented
  // there (Ctrl+O, F11, Ctrl+Shift+M, Shift+Enter, right-click, +/-, M, C,
  // Ctrl+Shift+C) plus the two wave 5 additions (speed, this overlay
  // itself), each with its controller equivalent from README.md's
  // "Controller mapping" table where one exists ("—" otherwise). `th`/`en`
  // always return the same number of rows with no empty cell — no DOM, safe
  // to call from injected.test.js directly.
  const HELP_ROWS_TH = Object.freeze([
    { action: "เปิดการตั้งค่า", keyboard: "Ctrl+O", controller: "R3" },
    { action: "สลับเต็มจอ", keyboard: "F11", controller: "—" },
    { action: "สลับหน้าต่างเล็ก (mini-player)", keyboard: "Ctrl+Shift+M", controller: "—" },
    { action: "กด Enter ค้าง", keyboard: "Shift+Enter", controller: "—" },
    { action: "ย้อนกลับ", keyboard: "คลิกขวา", controller: "B / ○ (Circle)" },
    { action: "เพิ่ม/ลดเสียง", keyboard: "+ / -", controller: "Menu/Start · View/Back" },
    { action: "ปิดเสียง", keyboard: "M", controller: "L3" },
    { action: "เปิด-ปิดคำบรรยาย", keyboard: "C", controller: "—" },
    { action: "คัดลอกลิงก์วิดีโอ/เพลย์ลิสต์", keyboard: "Ctrl+Shift+C", controller: "—" },
    { action: "ปรับความเร็วเล่น ช้าลง/เร็วขึ้น", keyboard: "Shift+, / Shift+.", controller: "—" },
    { action: "เปิด/ปิดผังคีย์นี้", keyboard: "? / F1", controller: "Y" }
  ]);

  const HELP_ROWS_EN = Object.freeze([
    { action: "Open settings", keyboard: "Ctrl+O", controller: "R3" },
    { action: "Toggle fullscreen", keyboard: "F11", controller: "—" },
    { action: "Toggle mini-player", keyboard: "Ctrl+Shift+M", controller: "—" },
    { action: "Long-press Enter", keyboard: "Shift+Enter", controller: "—" },
    { action: "Back", keyboard: "Right-click", controller: "B / ○ (Circle)" },
    { action: "Volume up / down", keyboard: "+ / -", controller: "Menu/Start · View/Back" },
    { action: "Mute", keyboard: "M", controller: "L3" },
    { action: "Toggle captions", keyboard: "C", controller: "—" },
    { action: "Copy video/playlist link", keyboard: "Ctrl+Shift+C", controller: "—" },
    { action: "Playback speed slower/faster", keyboard: "Shift+, / Shift+.", controller: "—" },
    { action: "Toggle this help", keyboard: "? / F1", controller: "Y" }
  ]);

  const helpRows = (lang) => (lang === "en" ? HELP_ROWS_EN : HELP_ROWS_TH).slice();

  const isEscapeKey = (e) => Boolean(e) && (e.key === "Escape" || e.keyCode === 27);

  // Arrow keys + Enter, matched by both `.key` (a real keyboard event) and
  // `.keyCode` (the synthetic events the controller/mouse sections above
  // dispatch for D-pad/left-stick navigation and the A button), so a
  // gamepad cannot navigate the page underneath the overlay either.
  const HELP_NAV_KEYS = Object.freeze({ ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true, Enter: true });
  const HELP_NAV_KEYCODES = Object.freeze({ 37: true, 38: true, 39: true, 40: true, 13: true });

  const isHelpNavKey = (e) => {
    if (!e) return false;
    if (typeof e.key === "string" && HELP_NAV_KEYS[e.key]) return true;
    return typeof e.keyCode === "number" && Boolean(HELP_NAV_KEYCODES[e.keyCode]);
  };

  // Builds (lazily, on first toggle) and shows/hides the overlay. `getLang`
  // follows this file's established "th"|"en" convention (see e.g.
  // touchButtons() above).
  const createHelpOverlay = (doc, win, options) => {
    const opts = options || {};
    const getLang = opts.getLang || (() => "th");

    let helpOpen = false;
    let elements = null;

    const ensureStyle = () => {
      if (doc.getElementById(HELP_STYLE_ID)) return;
      const style = doc.createElement("style");
      style.id = HELP_STYLE_ID;
      style.textContent = HELP_STYLE_CSS;
      const parent = doc.head || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(style);
    };

    const build = () => {
      if (elements) return elements;
      ensureStyle();

      const overlay = doc.createElement("div");
      overlay.id = HELP_OVERLAY_ID;
      if (typeof overlay.setAttribute === "function") {
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
      }
      if (overlay.style) overlay.style.display = "none";

      const panel = doc.createElement("div");
      panel.className = HELP_PANEL_CLASS;

      const title = doc.createElement("div");
      title.className = HELP_TITLE_CLASS;
      const lang = getLang() === "en" ? "en" : "th";
      title.textContent = HELP_TITLE_TEXT[lang];
      panel.appendChild(title);

      helpRows(lang).forEach((row) => {
        const line = doc.createElement("div");
        line.className = HELP_ROW_CLASS;

        const action = doc.createElement("span");
        action.className = HELP_ACTION_CLASS;
        action.textContent = row.action;

        const keyboard = doc.createElement("span");
        keyboard.className = HELP_KEY_CLASS;
        keyboard.textContent = row.keyboard;

        const controller = doc.createElement("span");
        controller.className = HELP_CONTROLLER_CLASS;
        controller.textContent = row.controller;

        line.appendChild(action);
        line.appendChild(keyboard);
        line.appendChild(controller);
        panel.appendChild(line);
      });

      overlay.appendChild(panel);

      if (typeof overlay.addEventListener === "function") {
        overlay.addEventListener("click", (e) => {
          // Backdrop click: only when the click landed on the overlay
          // itself, not a descendant of it (i.e. inside the panel) — the
          // same "e.target === the element the listener is on" technique
          // as any standard modal backdrop.
          if (e && e.target === overlay) setOpen(false);
        });
      }

      const parent = doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === "function") parent.appendChild(overlay);

      elements = { overlay, panel };
      return elements;
    };

    const render = () => {
      if (!elements) return;
      if (elements.overlay.style) elements.overlay.style.display = helpOpen ? "flex" : "none";
    };

    const setOpen = (value) => {
      helpOpen = Boolean(value);
      build();
      render();
    };

    const onKeyDown = (e) => {
      if (!helpOpen) return;
      if (isEscapeKey(e)) {
        // stopImmediatePropagation (not just preventDefault) so YouTube's
        // own Escape handling — page navigation — never runs; the same
        // technique no-f11's F11 handling and toggle-mini/toggle-fullscreen
        // above already use. This also closes the overlay when the
        // controller's B button fires its synthetic Escape (see the
        // Controller section above), since that dispatch also sets
        // `.keyCode = 27`.
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        if (typeof e.preventDefault === "function") e.preventDefault();
        setOpen(false);
        return;
      }
      if (isHelpNavKey(e)) {
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        if (typeof e.preventDefault === "function") e.preventDefault();
      }
      // Every other key passes through untouched while open.
    };

    doc.addEventListener("keydown", onKeyDown, true);

    return {
      toggle() { setOpen(!helpOpen); },
      open() { setOpen(true); },
      close() { setOpen(false); },
      isOpen() { return helpOpen; }
    };
  };

  // -------------------------------------------------------------------------
  // Now-playing (Lalin Cast addition — no VacuumTube module ports this;
  // VacuumTube has no now-playing title. Rust side: MediaTitleState /
  // window_title() — see docs/plans/W5_DESKTOP_PLAN.md, "Now-playing")
  //
  // Capture-phase play/pause/ended/emptied listeners on `doc`, catching
  // every <video> on the page including ones created after this file ran
  // (capturing happens on the way down to the target regardless of whether
  // the event itself bubbles, and "play"/"pause"/"ended"/"emptied" do not).
  // Title always comes from the standard `navigator.mediaSession` API —
  // never YouTube's own DOM, per contract — trimmed and length-capped the
  // same way initSurfaceDetection() above already caps `document.title`.
  // -------------------------------------------------------------------------

  const MEDIA_TITLE_MAX_LENGTH = 200;

  // Pure: which lalin-cast-media `state` a given media event type maps to,
  // or null for anything else.
  const mediaStateFor = (type) => {
    if (type === "play") return "playing";
    if (type === "pause") return "paused";
    if (type === "ended" || type === "emptied") return "idle";
    return null;
  };

  // Reads navigator.mediaSession.metadata.title, trimmed and capped at 200
  // characters, or "" when absent/malformed/unreadable. Never touches the
  // DOM.
  const readMediaTitle = (win) => {
    try {
      const nav = win && win.navigator;
      const raw = nav && nav.mediaSession && nav.mediaSession.metadata && nav.mediaSession.metadata.title;
      return typeof raw === "string" ? raw.trim().slice(0, MEDIA_TITLE_MAX_LENGTH) : "";
    } catch {
      return "";
    }
  };

  // Wires the four listeners and returns the raw handler (mainly so
  // injected.test.js can call it directly without needing a real event to
  // propagate through `doc`). `emit` defaults to the Tauri bridge, matching
  // emitShell() below, but is overridable — this file's established
  // testability convention (see e.g. createSpeedControl's `osd` option
  // above) — so tests can capture payloads instead of needing a live bridge.
  const createMediaSignal = (doc, win, options) => {
    const opts = options || {};
    const emit = opts.emit || ((state, title) => {
      const tauri = bridge();
      if (!tauri?.event?.emit) return Promise.resolve();
      return tauri.event.emit("lalin-cast-media", { state, title }).catch(() => {});
    });

    const send = (state) => emit(state, readMediaTitle(win));

    // The one pending 2 s re-read (below), so a later event can cancel it.
    let pendingReread = null;
    const cancelReread = () => {
      if (pendingReread !== null && win && typeof win.clearTimeout === "function") {
        win.clearTimeout(pendingReread);
      }
      pendingReread = null;
    };

    const handler = (e) => {
      const state = mediaStateFor(e && e.type);
      if (!state) return;
      // Any newer event supersedes a pending re-read, so a pause/ended/
      // emptied within 2 s of play never gets a trailing "playing" sent
      // after it (which would leave the tray's now-playing line stale).
      cancelReread();
      send(state);
      // One delayed re-read 2s after "play": navigator.mediaSession's
      // metadata is frequently only populated a short moment after playback
      // actually starts, so the immediate send() above can still carry the
      // previous (or empty) title.
      if (state === "playing" && win && typeof win.setTimeout === "function") {
        pendingReread = win.setTimeout(() => {
          pendingReread = null;
          send("playing");
        }, 2000);
      }
    };

    ["play", "pause", "ended", "emptied"].forEach((type) => doc.addEventListener(type, handler, true));

    return { handler };
  };

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  const SHELL_ACTIONS = Object.freeze({
    OPEN_SETTINGS: "open-settings",
    TOGGLE_FULLSCREEN: "toggle-fullscreen",
    TOGGLE_MINI: "toggle-mini"
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

  const initPrefsAndDeepLink = async (doc, win, state, sleepOsd) => {
    const tauri = await waitForBridge();
    if (!tauri?.event?.listen) return;

    await tauri.event.listen("lalin-cast-prefs", (event) => {
      const next = applyPrefsUpdate(state.prefs, event?.payload || event);
      state.prefs = next;
      if (state.onPrefsChange) state.onPrefsChange(next);
    });

    await initDeepLinkListener(win, tauri);
    await initSleepListener(doc, win, tauri, sleepOsd);
    await initRemoteListener(doc, win, tauri);
  };

  const boot = () => {
    const prefs = readPrefs(window.__LALIN_PREFS__);
    // Same validator as the lalin-cast-deeplink path; the Rust side already
    // validated, this just keeps both entry points symmetric.
    initialDeepLink = prefs.deepLink && deepLinkToHash(prefs.deepLink) ? prefs.deepLink : null;

    // Wave 4: must run before any page script gets a chance to probe codec
    // support (see the "Codec filter" section above). readPrefs() above
    // already resolved the documented default, so this runs unconditionally
    // and synchronously here regardless of whether __LALIN_PREFS__ was even
    // present.
    installCodecFilter(window, prefs.codecFilter);

    initMark();
    installBridge();
    initSurfaceDetection();

    const state = { prefs };

    // Wave 5 additions — see docs/plans/W5_DESKTOP_PLAN.md. Built before the
    // gamepad controller and createKeybindHandler below so both sets of
    // callbacks can close over them (wave 6 adds the gamepad Y button to the
    // same helpOverlay.toggle() the keybind handler already calls).
    const speedControl = createSpeedControl(document, window);
    const helpOverlay = createHelpOverlay(document, window, { getLang: () => state.prefs.lang });

    const gamepadController = createGamepadController(document, window, {
      getEnabled: () => state.prefs.controllerEnabled,
      onOpenSettings: () => emitShell(SHELL_ACTIONS.OPEN_SETTINGS),
      // Wave 6 (docs/plans/W6_POLISH_PLAN.md, "Controller"): Y button.
      // Gated on controllerEnabled implicitly — gamepadController never
      // polls at all while the pref is off (see state.onPrefsChange below).
      onToggleHelp: () => helpOverlay.toggle()
    });
    if (state.prefs.controllerEnabled) gamepadController.start();

    createKeybindHandler(document, window, {
      onOpenSettings: () => emitShell(SHELL_ACTIONS.OPEN_SETTINGS),
      onToggleFullscreen: () => emitShell(SHELL_ACTIONS.TOGGLE_FULLSCREEN),
      onToggleMini: () => emitShell(SHELL_ACTIONS.TOGGLE_MINI),
      onSpeedUp: () => speedControl.increase(),
      onSpeedDown: () => speedControl.decrease(),
      onToggleHelp: () => helpOverlay.toggle()
    });

    createMouseHandler(document, window);
    createPauseOnBlurHandler(document, window, () => state.prefs);
    createMediaSignal(document, window);
    // Wave 6 — see docs/plans/W6_POLISH_PLAN.md, "Sleep at end of video".
    // One createSleepOsd() instance shared with initSleepListener (wired via
    // initPrefsAndDeepLink below) so the wave 4 sleep-timer OSD and the
    // sleep-at-end OSD are genuinely the same #lalin-cast-sleep-osd element
    // and hide timer, not two independently-timed copies.
    const sleepOsd = createSleepOsd(document, window);
    createSleepAtEndHandler(document, window, { getPref: () => state.prefs.sleepAtEndOfVideo, osd: sleepOsd });

    const volumeControl = createVolumeControl(document, { win: window });
    createVolumeKeydownHandler(document, window, volumeControl);
    startVolumeSync(window, volumeControl);

    const touchOverlay = createTouchOverlay(document, window, {
      getLang: () => state.prefs.lang,
      initialEnabled: state.prefs.touchOverlay
    });
    window.addEventListener("touchstart", () => touchOverlay.handleTouchStart(), { passive: true });

    // Wave 8 — see docs/plans/W8_BOUNDARY_PLAN.md, "ซ่อน Shorts / guide
    // tabs". The observer runs regardless of the current pref values (it
    // only ever tags matching elements with our classes); the prefs merely
    // control whether the CSS rule that hides a tagged element is active.
    createHideObserver(document, window);
    applyHidePrefsToDocument(document, state.prefs);

    state.onPrefsChange = (next) => {
      if (next.controllerEnabled) gamepadController.start();
      else gamepadController.stop();
      touchOverlay.setEnabled(next.touchOverlay);
      applyHidePrefsToDocument(document, next);
    };

    initPrefsAndDeepLink(document, window, state, sleepOsd);
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
      GAMEPAD_HELP_BUTTON,
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
      createPauseOnBlurHandler,
      codecAllowed,
      installCodecFilter,
      TOUCH_KEY_CODE_MAP,
      touchButtons,
      createTouchOverlay,
      SLEEP_OSD_ID,
      SLEEP_OSD_TEXT,
      SLEEP_OSD_VISIBLE_MS,
      pauseAllVideos,
      createSleepOsd,
      initSleepListener,
      // Wave 5 — see docs/plans/W5_DESKTOP_PLAN.md.
      SPEED_RATES,
      SPEED_OSD_ID,
      SPEED_OSD_VISIBLE_MS,
      nextRate,
      formatRate,
      createSpeedOsd,
      createSpeedControl,
      HELP_OVERLAY_ID,
      helpRows,
      isEscapeKey,
      isHelpNavKey,
      createHelpOverlay,
      MEDIA_TITLE_MAX_LENGTH,
      mediaStateFor,
      readMediaTitle,
      createMediaSignal,
      // Wave 6 — see docs/plans/W6_POLISH_PLAN.md.
      REMOTE_RATE_LIMIT_MS,
      remoteActionAllowed,
      toggleRemotePlayback,
      createRemoteHandler,
      initRemoteListener,
      SLEEP_AT_END_WINDOW_MS,
      SLEEP_AT_END_OSD_TEXT,
      sleepAtEndDecision,
      createSleepAtEndHandler,
      // Wave 8 — see docs/plans/W8_BOUNDARY_PLAN.md, "ซ่อน Shorts / guide tabs".
      HIDE_STYLE_ID,
      HIDE_SHORTS_CLASS,
      HIDE_GUIDE_TAB_CLASS,
      HIDE_SHELF_CANDIDATE_SELECTOR,
      HIDE_GUIDE_CANDIDATE_SELECTOR,
      HIDE_MATCH_SIGNALS,
      isShortsShelf,
      isShortsGuideTab,
      ensureHideStyle,
      applyHidePrefsToDocument,
      scanAndHide,
      createHideObserver
    };
  }

  if (typeof window !== "undefined") {
    boot();
  }
})();
