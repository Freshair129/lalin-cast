# Lalin Cast provenance

| Field | Value |
|---|---|
| Product | Lalin Cast |
| Feature reference | VacuumTube |
| Upstream | https://github.com/shy1132/VacuumTube |
| Baseline | v1.8.2 / 4dd3ee4 |
| License | MIT for the retained upstream reference; retain `reference/vacuumtube/LICENSE` in distributions that copy upstream code |
| Port scope | Rust + Tauri v2 native shell and WebView boundary |
| Leanback surface | `https://www.youtube.com/tv` |
| User-Agent | `Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; LalinCast/<version>` — `<version>` is `env!("CARGO_PKG_VERSION")` at build time (H0 identity token; no longer VacuumTube-derived) |

The standalone Cast runtime does not copy VacuumTube DOM modules. Each future
module must record its source path, local adaptation, runtime assumptions and
WebView2 evidence before it is enabled. No custom YouTube-specific ad bypass or
credential relay is part of this product.

The current Tauri source was exported from the Lalin AI repository at commit
`58af113`, which includes supervised DIAL listener recovery and device-id
persistence. The export must retain the source-to-reference relationship and
must not include updater private keys or user state.

## H0 identity change (2026-09-20)

As part of H0 release readiness, the User-Agent above, the DIAL `APP_AGENT` /
SSDP `SERVER` string (`Windows/10 UPnP/1.0 LalinCast/<version>`), and the DIAL
`manufacturer`/`modelName` fields (`Lalin` / `Lalin Cast`) were changed from
the previously VacuumTube-derived/compatibility strings to Lalin Cast's own
identity tokens (see `docs/plans/H0_RELEASE_READINESS_PLAN.md` constants
table). The `dialFriendlyName` store key still defaults to `Lalin Cast` and is
user-settable; it is not derived from the User-Agent change.

This is a documentation-only record of the identity change. Runtime regression
against the real YouTube Leanback surface and iPhone/DIAL pairing with the new
identity tokens is **NOT_RUN** — it is tracked as human gate H3 in the H0 plan
and must be evidenced before this change is treated as production-ready.

## Wave 3 controller/keyboard/deep-link port (2026-09-20)

Wave 3 (`docs/plans/W3_CONTROLS_PLAN.md`) ports the controller, keyboard-extras, volume-OSD,
pause-on-blur and deep-link modules below into `src-tauri/injected.js`, one section per module,
each carrying its own provenance comment. This is a documentation-only record of the port
contract; runtime evidence for controller/keyboard behavior and the deep-link hash route on the
real Leanback surface is tracked as human gates H7 and H8 in that plan and is **NOT_RUN** until
recorded there.

| Upstream path (`reference/vacuumtube/src/preload/`) | `injected.js` section | Adaptation |
|---|---|---|
| `util/controller.js` | `controller` | Gamepad polling loop (`requestAnimationFrame`, standard + custom axis codes 1011–1018) ported with the upstream right-stick variable slip fixed; the IPC `focus`/`blur` gate is replaced with a direct `document.hidden`/window-blur check since Lalin Cast has no Electron `ipcRenderer` |
| `modules/controller-support.js` | `controller` | Gamepad-button-to-Leanback-keyCode map ported verbatim (left-stick codes 1011–1014); the right-stick codes 1015–1018 declared in `util/controller.js` are wired up in Lalin Cast even though upstream never emits them (a `keyCode`/`code` variable slip upstream); the upstream `config.controller_support` gate becomes the `controllerEnabled` pref from `window.__LALIN_PREFS__`/`lalin-cast-prefs`; the R3 ("open settings") binding no longer calls a VacuumTube settings overlay — it emits the `lalin-cast-shell` event with `{ action: "open-settings" }` for the Rust shell to handle |
| `modules/keybinds.js` | `keybinds` | `Shift+Enter` long-press, `Ctrl+Shift+C` copy-URL and `C` captions-toggle handlers ported; the upstream `localeProvider`/`resolveCommandModifiers` helpers are replaced with Lalin Cast's own i18n and DOM-event plumbing |
| `modules/settings/index.js` (lines 409–411) | `keybinds` | Upstream's global `Ctrl+O` hotkey (`document.addEventListener('keydown', ...)` calling `toggleSettingsOverlay()`) toggles VacuumTube's in-page settings overlay; Lalin Cast ports the same keydown gate but, instead of an in-page overlay, emits the `lalin-cast-shell` event with `{ action: "open-settings" }` so the Rust shell opens the native settings window — the same action R3 emits |
| `modules/mouse.js` | `keybinds` | Right-click-to-back handler ported; the cursor-auto-hide and scroll-block behavior from the same file is not ported in wave 3 (out of scope) |
| `modules/no-f11.js` | `keybinds` | Upstream only swallows the `F11` keydown so YouTube never sees it; Lalin Cast additionally turns that keypress into the `lalin-cast-shell` `toggle-fullscreen` action so `F11` drives the native window's fullscreen state instead of only being suppressed |
| `modules/volume-control/index.js`, `modules/volume-control/style.css` | `volume` | `+`/`-`/`M` keydown handling and the on-screen volume indicator ported; DOM ids are renamed (`lalin-cast-volume-osd`, `<style id="lalin-cast-volume-style">`) so the overlay never collides with a YouTube page element; the CSS file's rules are inlined into that injected `<style>` element instead of being read from disk (`fs.readFileSync`, unavailable in a WebView) |
| `modules/pause-on-blur.js` | `pauseOnBlur` | `visibilitychange`/`webkitvisibilitychange` suppression and the pause-on-blur `resolveCommandModifiers` call are ported; the upstream `ipcRenderer.on('blur', ...)` trigger is replaced with a direct window `blur`/`document.hidden` listener, and the upstream `config.pause_on_blur` gate becomes the `pauseOnBlur` pref from `window.__LALIN_PREFS__`/`lalin-cast-prefs` |
| `modules/h5vcc/index.js` (lines 50–56) | `deeplink` | Same mechanism as upstream: `window.h5vcc.runtime.initialDeepLink` is set once, before the rest of the `window.h5vcc` object is constructed, so it is available to the Leanback boot sequence. Upstream reads it from `ipcRenderer.invoke('get-deeplink')`; Lalin Cast reads it from `window.__LALIN_PREFS__.deepLink`, a canonical URL already produced and validated by Rust's `parse_launch_url`. A running instance additionally listens for the `lalin-cast-deeplink` event (not present upstream, since Electron's upstream IPC channel has no equivalent) and converts it to a Leanback hash route |

## Wave 4 codec filter / touch overlay port (2026-09-20)

Wave 4 (`docs/plans/W4_PLAYBACK_PLAN.md`) ports the two modules below into `src-tauri/injected.js`, one
section each, carrying its own provenance comment. This is a documentation-only record of the port
contract; runtime evidence for the codec filter's effect on real playback ("stats for nerds") and the
touch overlay on a real touchscreen/handheld is tracked as human gates H10 and H11 in that plan and is
**NOT_RUN** until recorded there.

| Upstream path (`reference/vacuumtube/src/preload/`) | `injected.js` section | Adaptation |
|---|---|---|
| `modules/h264ify.js` | `codecFilter` | Upstream itself is adapted from [erkserkserks/h264ify](https://github.com/erkserkserks/h264ify) (MIT); it overrides `HTMLMediaElement.prototype.canPlayType` (assigned through a detached `<video>` element's `__proto__`) and `window.MediaSource.isTypeSupported` behind four independent config flags (`h264ify_disable_webm`/`_vp8`/`_vp9`/`_av1`). Lalin Cast collapses these into a single `codecFilter` pref (`"off"` \| `"h264"`) gating only the `vp8`, `vp9` and `av01` substrings — matching the `codecAllowed(type, filter)` pure function and its tests — and does not add a separate generic `webm` check (containers using `vp8`/`vp9` are already denied by their own substring match); the upstream `configManager`/`require('../config')` read is replaced with `window.__LALIN_PREFS__.codecFilter` and the `lalin-cast-prefs` event, and the override runs only when `codecFilter === "h264"` instead of a persistent Electron config flag |
| `modules/touch-support.js` | `touchOverlay` | Upstream creates two clusters of circular buttons (`bottomLeft`: left/right/up/down; `bottomRight`: back/select) that dispatch synthetic `keydown`/`keyup` events with a raw `keyCode` (`document.dispatchEvent(new Event(...))` plus a manual `.keyCode` assignment), auto-hides them 3 seconds after the last touch, and separately overrides Tectonic's `enableTouchSupport` feature switch for native scrollbars plus a `Space`-key scroll-prevention listener. Lalin Cast ports only the on-screen button overlay concept as `#lalin-cast-touch-overlay` (+ `<style id="lalin-cast-touch-style">`), shown after the first `touchstart` while the `touchOverlay` pref (`window.__LALIN_PREFS__`/`lalin-cast-prefs`) is on, using the same synthetic-key-dispatch helper as the `controller`/`keybinds` sections instead of duplicating upstream's own `simulateKeyDown`/`simulateKeyUp`; a pure `touchButtons(lang) -> spec[]` function replaces the hardcoded six-button set with a localized (Th/En) list that also adds a play-pause button not present upstream; the Tectonic `enableTouchSupport` feature-switch override and the `Space`-key scroll-prevention listener are Cobalt/Tectonic-specific and are not ported, since Lalin Cast's WebView2 surface has no equivalent native-scrollbar behavior to fix |

## Wave 5 desktop integration — Lalin-original, not ported (2026-09-20)

Wave 5 (`docs/plans/W5_DESKTOP_PLAN.md`) adds six pieces of desktop integration. None of them are
ported from VacuumTube or any other upstream project — they have no upstream source path to record,
unlike every table above. They are Lalin Cast's own design, written directly against Tauri v2's
window/process APIs and the browser's standard Media Session API:

- **Playback speed** (`injected.js` `speed` section, `Shift+,`/`Shift+.`, the `nextRate` pure
  function and its on-screen indicator) — VacuumTube has no equivalent speed control or OSD.
- **Help overlay** (`injected.js` `help` section, `?`/`F1`, the `helpRows(lang)` pure function) —
  VacuumTube has an in-page settings overlay (see the wave 3 `modules/settings/index.js` row above,
  which Lalin Cast deliberately does *not* port as an overlay, routing `Ctrl+O` to the native
  settings window instead), but no bilingual keyboard/controller reference overlay.
- **Now-playing title** (`injected.js` `media` section reading `navigator.mediaSession.metadata`,
  Rust `MediaTitleState`, the window-title and tray-tooltip update) — a direct use of the standard
  Media Session Web API, not a VacuumTube feature.
- **Studio launcher lifecycle** (Rust `launch.rs`/`lifecycle.rs`, the `--lifecycle`/`--request-id`
  CLI flags, the `lifecycle.json` state file) — implements the Lalin-specific
  `MediaLifecycleCommand`/`MediaLifecycleState` contract from `docs/architecture/CAST_PLATFORM_PLAN.md`;
  see `docs/architecture/CAST_LAUNCHER_IPC.md` for the full spec.
- **Start with Windows** (Rust `autostart.rs`, the `reg.exe` Run-key writer) — a plain Windows
  registry integration with no VacuumTube (Electron) counterpart in this port.
- **Window-position memory** (Rust `window_bounds.rs`, the `restore_target` pure function) — a
  Tauri-native window-geometry feature with no upstream equivalent.

This is a documentation-only record of the port boundary. Runtime evidence for each of these is
tracked as human gates H13–H16 in `docs/plans/W5_DESKTOP_PLAN.md` and is **NOT_RUN** until recorded
there.

## Wave 6 living-room polish — Lalin-original, not ported (2026-09-21)

Wave 6 (`docs/plans/W6_POLISH_PLAN.md`) adds seven more pieces of living-room polish and QA
automation. Like wave 5, none of them are ported from VacuumTube or any other upstream project —
they have no upstream source path to record:

- **UI scale** (Rust `settings.rs` `uiScale` key, `WebviewWindow::set_zoom`) — a plain Tauri v2/
  WebView2 zoom call with no VacuumTube counterpart (VacuumTube targets a fixed living-room display,
  not a user-adjustable zoom level).
- **Settings profiles** (Rust `settings.rs` `profile_settings`/`settings_apply_profile`, the
  `livingRoom`/`handheld`/`desktop` presets) — a Lalin Cast–specific convenience over its own
  existing per-key settings whitelist.
- **Reset to defaults** (Rust `settings.rs` `reset_plan`/`settings_reset_defaults`) — likewise
  Lalin-original, built on the same per-key whitelist.
- **Sleep at end of video** (`injected.js` `sleepAtEnd` section, the `sleepAtEndOfVideo` pref) —
  SmartTube-parity behavior (not VacuumTube), reusing the wave 4 sleep-timer OSD element.
- **Tray/menu play-pause** (Rust tray item `tray-play-pause`, menu item `play-pause`, the
  `lalin-cast-remote` event, `injected.js`'s `remote` section) — a plain use of the standard
  `HTMLMediaElement.play()`/`pause()` API, with no VacuumTube remote-control equivalent.
- **Controller Y button → help overlay** (`injected.js` `controller` section, wiring gamepad index 3
  to the existing wave 5 `toggle-help` action) — VacuumTube's own `util/controller.js` declares this
  button's keyCode range but never assigns it to an action (the same kind of unused-mapping gap wave
  3 already noted for the right analog stick); Lalin Cast is the first to bind it, to a Lalin-original
  feature (the help overlay), not to anything upstream did or intended.
- **CI smoke job, `scripts/lifecycle-driver.ps1` and CHANGELOG-sourced release notes** (`.github/
  workflows/ci.yml` `smoke` job, `.github/workflows/release.yml`) — repository/QA automation with no
  application-code counterpart in VacuumTube at all.

This is a documentation-only record of the port boundary. Runtime evidence for the user-facing
pieces above is tracked as human gates H18–H21 in `docs/plans/W6_POLISH_PLAN.md` and is **NOT_RUN**
until recorded there; the CI smoke job was gated by H20 (`continue-on-error` removed only
after two stable runs).

## Wave 7 deep link and DIAL hardening — new dependency (2026-09-21)

Wave 7 (`docs/plans/W7_DEEPLINK_PLAN.md`) adds one new third-party dependency, `tauri-plugin-deep-link`
(resolved version `2.4.10`, license `MIT OR Apache-2.0`), the single crate exception the founder
approved for this wave only — every other new crate remains forbidden. Its scope in Lalin Cast is
narrow and entirely local: registering, unregistering, and checking whether the `lalin-cast` URL
scheme is present under `HKCU\Software\Classes\lalin-cast` for the current Windows account (the
`deepLinkScheme` setting — see `PRIVACY.md`). Lalin Cast does not use the plugin's CLI-argument or
`on_open_url` delivery path; a `lalin-cast://` URL still reaches the app the same way the existing,
already-ported wave 3 command-line deep link does (see the wave 3 row above), through Rust's own
`parse_cli`/`parse_launch_url` and the single-instance callback. See `THIRD_PARTY_NOTICES.md` for the
crate's transitive dependency licenses and `docs/architecture/ADR-001-CAST-TAURI-PORT.md` for the
security rules governing its use.

The `lalin-cast://` URL scheme itself and the stricter SSDP `MAN` header validation
(`man_header_is_discover`, an intentional DIAL discovery behavior change) are Lalin Cast's own
design, extending existing Rust modules (`launch.rs`, `dial.rs`) rather than porting anything from
VacuumTube or another upstream project. This is a documentation-only record of the dependency and
port boundary. Runtime evidence is tracked as human gates H22–H23 in
`docs/plans/W7_DEEPLINK_PLAN.md` and is **NOT_RUN** until recorded there.

## Wave 8 client-side boundary — `hide-shorts.js`/`guide-tabs.js` reviewed, deliberately not ported (2026-09-21)

Wave 8 (`docs/plans/W8_BOUNDARY_PLAN.md`) adds opt-in hiding of the Shorts shelf on the home page and
of the Shorts tab in the side navigation. Two upstream modules cover the same ground —
`reference/vacuumtube/src/preload/modules/hide-shorts.js` and
`reference/vacuumtube/src/preload/modules/guide-tabs.js` — and both were reviewed as part of this
wave's design work. **Neither is ported.**

**Why:** both upstream modules work by registering a response modifier
(`xhrModifiers.addResponseModifier`) that intercepts and rewrites the JSON body of
`/youtubei/v1/browse` (`hide-shorts.js`, filtering out any `shelfRenderer` whose header text is
literally `"Shorts"`) and `/youtubei/v1/guide` (`guide-tabs.js`, filtering the guide's
`guideSectionRenderer.items` by icon type). This is network-response interception — the same class of
mechanism as ad filtering — and the founder's escalation ก decision
(`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`) rules out any interception of
YouTube's network traffic or data, for any purpose, permanently. Porting either file as-is, even to
reach a target as innocuous as hiding a navigation tab, would put Lalin Cast on the wrong side of
that boundary.

Two details from the upstream source were still carried forward as design input rather than code:

- `hide-shorts.js` matches the Shorts shelf by the literal string `"Shorts"` in the shelf header's
  text run — this only works for English-language YouTube accounts. Lalin Cast's own matcher
  (`isShortsShelf`/`isShortsGuideTab` in `injected.js`) deliberately avoids any text/locale-dependent
  match, using only attributes and tag shapes that do not change with the account's language.
  `guide-tabs.js`'s own `map` (from Leanback icon type, e.g. `YOUTUBE_SHORTS_FILL_24`, to a tab name)
  is exactly this kind of non-text signal, and is the one piece of upstream data actually reused as a
  reference for what a Shorts-tab icon type looks like.
- `guide-tabs.js`'s own inline comment — `//disabling this breaks stuff because it tries to default
  to the home tab` — is the documented reason Lalin Cast's `hideGuideTabs` option never hides the
  Home tab, no matter what. This is the one piece of upstream *behavior* (not code) that is
  deliberately preserved.

Lalin Cast's own implementation instead reads only the already-rendered DOM (a `MutationObserver`,
coalesced per animation frame), tags matching elements with its own class, and hides them with its
own stylesheet scoped by a `data-lalin-hide-*` attribute — the same class of mechanism as the touch
overlay (wave 4) and help overlay (wave 5) before it, both of which also read/build DOM on the
already-rendered page rather than touching network traffic. This is original design work, not a
port, and has no upstream source path to record in the tables above.

`keepDisplayAwake` (`src/power.rs`, `SetThreadExecutionState`) is likewise Lalin Cast's own design,
with no VacuumTube (Electron) counterpart in this port — Electron's power-save-blocker API and
Windows' `SetThreadExecutionState` are unrelated mechanisms with no shared source to port from.

This is a documentation-only record of the review and port boundary. Runtime evidence for the hiding
feature (real Leanback selector match and focus-safety) and for keep-display-awake (display staying
on while playing, sleeping normally once stopped) is tracked as human gates H24–H25 in
`docs/plans/W8_BOUNDARY_PLAN.md` and is **NOT_RUN** until recorded there.
