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
