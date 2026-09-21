# Lalin Cast

Lalin Cast is a standalone Rust + Tauri v2 Windows app that loads the real
YouTube Leanback surface at `https://www.youtube.com/tv` in a remote WebView.
The pinned VacuumTube fork is retained under `reference/vacuumtube` as the
behavior reference and fallback.

## Disclaimer

**ภาษาไทย:** Lalin Cast เป็นโปรเจกต์อิสระของบุคคลที่สาม ไม่ได้เกี่ยวข้อง ไม่ได้รับการรับรอง และ
ไม่ได้เป็นส่วนหนึ่งของ YouTube หรือ Google ผู้ใช้ยังต้องผูกพันตามข้อกำหนดการให้บริการของ YouTube เอง
อ่านรายละเอียดที่ [`PRIVACY.md`](PRIVACY.md), [`TERMS.md`](TERMS.md) และ
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — สัญญาอนุญาตของซอร์สโค้ด Lalin Cast เอง (แยกจาก
ไลบรารี third-party) ยังไม่ได้เลือก รอผู้ก่อตั้งอนุมัติ ดูตัวเลือกที่
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md)

**English:** Lalin Cast is an independent, third-party project with no affiliation to, endorsement
from, or sponsorship by YouTube or Google. Using it remains subject to YouTube's own Terms of
Service. See [`PRIVACY.md`](PRIVACY.md), [`TERMS.md`](TERMS.md), and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for details. Lalin Cast's own source-code
license (separate from its third-party dependencies) has not been chosen yet and is pending
founder approval; see the options in
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md).

## Positioning: no ad filtering

**ภาษาไทย:** Lalin Cast **ไม่มีและจะไม่มี** ตัวกรองโฆษณาในทุกรูปแบบ ไม่ว่าจะเป็นการดัก/แก้ไขทราฟฟิก
ของ YouTube, การข้ามโฆษณาอัตโนมัติ หรือกลไกอื่นใดที่ทำหน้าที่กรองโฆษณา นี่คือการตัดสินใจถาวรของผู้ก่อตั้ง
ไม่ใช่ "ยังไม่ได้ทำ" — เหตุผลและเส้นแบ่งที่ใช้ตัดสินอยู่ที่
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md)
ผู้ใช้ที่สมัคร YouTube Premium ใช้งาน Lalin Cast ได้ตามปกติทุกประการ ไม่มีสิ่งใดในแอปนี้เปลี่ยนแปลงหรือ
รบกวนสิทธิ์ที่ Premium ให้ไว้อยู่แล้ว

**English:** Lalin Cast **has no ad filtering and none is planned** — not network-level, not
autoplay-skip, not any other mechanism that removes or bypasses ads. This is a permanent founder
decision, not a "not yet"; see the reasoning and the boundary that governs it in
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md).
YouTube Premium subscribers are entirely unaffected — nothing in this app changes or interferes with
what Premium already gives them.

Current scope:

- native Tauri window and lifecycle;
- Lalin Cast's own Leanback-compatible User-Agent (`LalinCast/<version>` identity token built from
  the app's own version, no longer VacuumTube-derived);
- single-instance focus;
- fullscreen, keep-on-top, reload, quit, play/pause, and Thai/English language toggle native menu
  actions;
- signed GitHub Releases updater with a native in-app update window (checked on startup and
  on demand from the menu) that always requires user confirmation before installing and
  restarting;
- best-effort shell-setting persistence through the Tauri Store plugin;
- supervised Rust DIAL SSDP discovery on the LAN plus a bounded HTTP device
  descriptor bound to the local LAN IP address (not every network interface), which rebinds
  after listener/IP failure;
- a user-settable DIAL friendly name (`dialFriendlyName`, defaults to `Lalin Cast`);
- narrow `window.h5vcc` DIAL route bridge for the embedded YouTube WebView;
- continuous Leanback device-id sync with best-effort persistence;
- a system tray icon (`Lalin Cast · DIAL: <state>`, plus host:port once ready) with menu actions to
  show the window, play/pause the current video, open network/DIAL setup, check for updates, and
  quit;
- a first-run setup wizard window that reads the Windows network category (Private/Public/Domain,
  read locally through PowerShell only) and the live DIAL status, explains how to switch a Public
  profile to Private when needed, and can be reopened anytime from the tray or the media window's
  menu;
- a status window shown when the app starts without a working internet connection, or when the
  embedded YouTube page reports it isn't displaying the expected TV surface, with a manual retry
  and quit action, plus automatic retry when the cause is no connection — see
  [Desktop integration](#desktop-integration);
- surface detection reported by the embedded YouTube page itself (redirected away from the TV
  surface, or the expected Leanback markup missing) that triggers the status window above;
- game-controller input (standard browser Gamepad API — standard-mapping controllers such as
  Xbox and DualSense) mapped to Leanback key events, plus extra keyboard shortcuts, ported from
  the pinned VacuumTube reference; real-controller behavior is human gate H8 and not yet
  evidenced — see [Controller and keyboard](#controller-and-keyboard);
- an optional pause-on-blur setting that pauses playback when the media window loses focus;
- a sleep timer that pauses every video on the page and shows an on-screen message once its
  countdown reaches zero, set from the settings window to 15/30/60/90/120 minutes or off — see
  [Playback](#playback) (real timer-firing behavior is human gate H10);
- a codec filter that, once set to H.264-only, tells the embedded YouTube page — through the
  standard `MediaSource`/`HTMLMediaElement.canPlayType` Web APIs only — that it does not support
  VP8/VP9/AV1, taking effect after the next page reload — see [Playback](#playback) (visible effect
  in "stats for nerds" is human gate H11);
- a hardware-decoding toggle for the media window, applied through a WebView2 startup flag and
  taking effect after restarting the app — see [Playback](#playback) (human gate H11);
- a mini-player mode — an undecorated, always-on-top window pinned to a screen corner — reachable
  from the media menu, the tray icon, `Ctrl+Shift+M`, or the settings window; session-only and not
  persisted across restarts — see [Playback](#playback) (multi-monitor behavior is human gate H10);
- a touch-control overlay, ported from the pinned VacuumTube reference, that appears after the
  first detected screen touch — see [Playback](#playback) (real handheld/touchscreen behavior is
  human gate H10);
- a native settings window (language, DIAL name, fullscreen, keep-on-top, controller toggle,
  pause-on-blur, sleep timer, codec filter, hardware decoding, touch overlay, mini-player, reopen
  the setup wizard, check for updates) reachable from the media window's menu, the tray icon,
  `Ctrl+O`, or the controller's R3 button — see [Settings](#settings) (live-apply behavior on a
  real machine is human gate H9);
- command-line startup flags and a YouTube URL/playlist deep link, including forwarding a link to
  an already-running instance instead of opening a second window — see
  [Command line](#command-line) (deep-link behavior on the real Leanback surface is human gate H7);
- a Studio launcher lifecycle: `--lifecycle launch|focus|close --request-id <id>` command-line
  flags plus an atomically-written `lifecycle.json` state file that a companion launcher (such as
  Lalin Studio) can poll — see [Command line](#command-line) and
  [`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md) (a real
  Studio-side driver and launch/focus/close evidence is human gate H13);
- window-position memory for the media window (position and size only, written by Rust itself and
  never through the settings page) restored the next time the app starts, skipped while
  fullscreen, mini-player, maximized, or minimized — see
  [Desktop integration](#desktop-integration) (multi-monitor/DPI behavior is human gate H14);
- an optional "start with Windows" setting that adds or removes Lalin Cast from this Windows
  account's own startup (registry Run key) — see [Desktop integration](#desktop-integration)
  (human gate H14);
- automatic offline retry when the app starts without a working connection, backing off from 5
  seconds up to 30 seconds and stopping after 10 minutes, shown as a live countdown on the status
  window — see [Desktop integration](#desktop-integration) (human gate H15);
- a diagnostics snapshot in the settings window that can be copied to the clipboard on request
  (version, OS/WebView2, DIAL status and LAN IP, current settings — never a device id, URL, or TV
  code) — see [Settings](#settings);
- a rotating local log file (at `%LOCALAPPDATA%\ai.lalin.cast\logs\`, capped at roughly 1 MiB
  across two files) with a button in the settings window to open its folder, useful to attach when
  reporting a problem — every line is run through a sanitiser that masks URLs and Windows paths
  before anything is written, within the limits [`PRIVACY.md`](PRIVACY.md) sets out — see
  [Support](#support);
- a now-playing window title and tray-tooltip line, read locally from the standard Media Session
  API on the embedded YouTube page — see [Desktop integration](#desktop-integration) (human gate
  H16);
- playback-speed keys (`Shift+,` / `Shift+.`) with an on-screen indicator, session-only and not
  persisted — see [Controller and keyboard](#controller-and-keyboard) (human gate H16);
- a bilingual keyboard/controller help overlay (`?` / `F1`) — see
  [Controller and keyboard](#controller-and-keyboard) (human gate H16);
- a "keep display awake" setting (on by default) that only tells Windows the machine is in use while
  a video is actually playing, so the display and the machine don't sleep mid-playback — see
  [Playback](#playback) (human gate H25);
- opt-in hiding of the Shorts shelf on the home page and of the Shorts tab in the side navigation
  (both off by default), done entirely with Lalin Cast's own CSS on the already-rendered page — see
  [YouTube page](#youtube-page) and [Positioning: no ad filtering](#positioning-no-ad-filtering)
  (human gate H24).

Windows x64 is the primary, fully-supported release target. The tagged release workflow also
produces an ARM64 (`aarch64-pc-windows-msvc`) build as an **experimental**, `continue-on-error` job
(and CI runs a non-blocking `cargo check` for that target); it is not held to the same acceptance
gates as x64 yet and may lag behind it (human gate H12). A winget package
submission is prepared — see [`packaging/winget/README.md`](packaging/winget/README.md) — but has
not been submitted to `microsoft/winget-pkgs` yet.

If the local settings store is unavailable, the shell uses safe defaults and
still opens; the failure is not allowed to block the media window.

Inherited local evidence: the debug runtime binds the DIAL SSDP port, returns
the device descriptor with an `Application-URL` header and passes the Rust
unit tests (DIAL, HTTP parser, identity and i18n). Same-Wi-Fi iPhone TV-code connection is user-confirmed for the previous
debug runtime. Standalone packaging, signed updater artifacts, network-drop
recovery, controller parity and account acceptance remain separate gates until
rerun in this repository. Ad filtering, SponsorBlock, DeArrow, and Return YouTube Dislike are not
implemented and never will be — see
[Positioning: no ad filtering](#positioning-no-ad-filtering) and
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md).

Static check:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

For a local Windows bundle, use the Tauri CLI from the repository root:

```powershell
cargo tauri build --debug --no-bundle --ci
```

The GUI/WebView2 smoke test and clean install/update smoke are separate Windows
runtime gates. Do not remove the VacuumTube reference until Tauri parity passes.

## Controller and keyboard

**ภาษาไทย:** Lalin Cast รองรับเกมคอนโทรลเลอร์ผ่าน Gamepad API มาตรฐานของเบราว์เซอร์ (ออกแบบมาให้ใช้กับ
คอนโทรลเลอร์ผังปุ่มมาตรฐานอย่าง Xbox และ DualSense) และคีย์ลัดคีย์บอร์ดเพิ่มเติม พอร์ตมาจาก VacuumTube —
ดูที่มาแต่ละโมดูลที่ [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md) พฤติกรรมจริงบนอุปกรณ์ยังไม่มีหลักฐานยืนยัน
(human gate H8 — ดู [`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md)) เปิด/ปิด
คอนโทรลเลอร์ได้จากหน้าต่างการตั้งค่า (ตัวเลือก "ตัวควบคุม")

**English:** Lalin Cast supports game controllers through the browser's standard Gamepad API,
targeting Xbox and DualSense controllers; real-device behavior is human gate H8 and not yet
evidenced (see [`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md)), plus
extra keyboard shortcuts, ported from VacuumTube — see
[`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md) for the per-module source. The controller can be
turned on or off from the settings window (the "Controller" toggle).

### Controller mapping / ผังปุ่มคอนโทรลเลอร์

| Xbox | DualSense | Action / การทำงาน |
|---|---|---|
| A | ✕ (Cross) | Enter / เลือก |
| B | ○ (Circle) | Back / ย้อนกลับ |
| X | □ (Square) | Search / ค้นหา |
| LB | L1 | Back (page) / ถอยหน้า |
| RB | R1 | Forward (page) / ไปหน้าถัดไป |
| LT | L2 | Seek backward / ถอยหลังวิดีโอ |
| RT | R2 | Seek forward / เดินหน้าวิดีโอ |
| View / Back | Share | Volume down / ลดเสียง |
| Menu / Start | Options | Volume up / เพิ่มเสียง |
| L3 (left-stick click) | L3 | Mute / ปิดเสียง |
| R3 (right-stick click) | R3 | Open settings / เปิดหน้าต่างการตั้งค่า |
| Y | △ (Triangle) | Toggle the keyboard/controller help overlay (only when the controller is enabled) / เปิด-ปิดผังคีย์บอร์ด/คอนโทรลเลอร์ (เฉพาะเมื่อเปิดใช้คอนโทรลเลอร์) |
| D-pad / left stick | D-pad / left stick | Navigate — arrow keys / เลื่อนทิศทาง |
| Right stick | Right stick | Navigate — arrow keys (Lalin Cast addition; upstream declared but never emitted these codes) / เลื่อนทิศทาง |

### Keyboard shortcuts / คีย์ลัดคีย์บอร์ด

| Key / ปุ่ม | Action / การทำงาน |
|---|---|
| `Ctrl+O` | Open settings / เปิดหน้าต่างการตั้งค่า |
| `F11` | Toggle fullscreen / สลับเต็มจอ |
| `Shift+Enter` (held) | Long-press Enter / กด Enter ค้าง |
| Right-click | Back / ย้อนกลับ |
| `+` / `-` | Volume up / down, with an on-screen indicator — เพิ่ม/ลดเสียงพร้อมแถบแสดงผลบนจอ |
| `M` | Mute / ปิดเสียง |
| `C` | Toggle captions / เปิด-ปิดคำบรรยาย |
| `Ctrl+Shift+C` | Copy the current video/playlist URL to the clipboard, query stripped except `v`/`list` — คัดลอกลิงก์ปัจจุบันโดยตัด query ทิ้งยกเว้น `v`/`list` |
| `Ctrl+Shift+M` | Toggle mini-player / สลับโหมดหน้าต่างเล็ก — see [Playback](#playback) |
| `Shift+,` / `Shift+.` | Decrease / increase playback speed, with an on-screen indicator — ลด/เพิ่มความเร็วเล่น พร้อมแถบแสดงผลบนจอ (session-only, not persisted — ไม่ถูกบันทึกข้ามการเปิดแอปใหม่) |
| `?` / `F1` | Toggle the keyboard/controller help overlay — เปิด-ปิดผังคีย์บอร์ด/คอนโทรลเลอร์สองภาษาบนหน้าจอ |

## Playback

**ภาษาไทย:** Lalin Cast มีตัวเลือกการเล่นเพิ่มเติมเจ็ดอย่าง ตั้งค่าได้จากหน้าต่างการตั้งค่า (ดู
[Settings](#settings)) ทั้งหมดทำงานในเครื่องล้วน ๆ ไม่มีการส่งข้อมูลใดออกนอกเครื่องเพิ่มเติม (ดู
[`PRIVACY.md`](PRIVACY.md))

**English:** Lalin Cast has seven additional playback options, all set from the settings window (see
[Settings](#settings)) and all entirely local — none of them send anything off the device (see
[`PRIVACY.md`](PRIVACY.md)).

### Sleep timer / ตัวจับเวลาปิดเล่นอัตโนมัติ

**ภาษาไทย:** ตั้งเวลาปิดเล่นอัตโนมัติได้ที่ 15, 30, 60, 90 หรือ 120 นาที (หรือ "ปิด" เพื่อยกเลิก) จาก
หน้าต่างการตั้งค่า ซึ่งจะแสดงเวลาที่เหลือแบบนับถอยหลังด้วย เมื่อเวลาหมด Lalin Cast จะหยุดเล่นวิดีโอทุกตัว
ในหน้าทันทีและแสดงข้อความ "หมดเวลาตั้งนอน — หยุดเล่นแล้ว" บนหน้าจอเป็นเวลา 6 วินาที แล้วรีเซ็ตค่ากลับเป็น
"ปิด" ให้เอง เปลี่ยนหรือยกเลิกตัวจับเวลาระหว่างทางได้ทุกเมื่อจากหน้าต่างการตั้งค่า

**English:** Set a sleep timer to 15, 30, 60, 90, or 120 minutes (or "off" to cancel it) from the
settings window, which also shows a live countdown. When it fires, Lalin Cast pauses every video on
the page immediately and shows an on-screen message ("Sleep timer: playback paused") for 6 seconds,
then resets the setting back to "off" on its own. The timer can be changed or cancelled at any time
from the settings window.

### Sleep at end of video / หยุดเล่นเมื่อจบวิดีโอ

**ภาษาไทย:** เปิดตัวเลือก "หยุดเล่นเมื่อจบวิดีโอ" (`sleepAtEndOfVideo`, ค่าเริ่มต้นปิด) จากหน้าต่างการ
ตั้งค่า เมื่อวิดีโอที่กำลังเล่นอยู่จบลง Lalin Cast จะรอ 8 วินาที — ถ้า YouTube เริ่มเล่นวิดีโอถัดไปเอง
(autoplay-next) ภายในช่วงนี้ Lalin Cast จะหยุดเล่นทันทีและแสดงข้อความ "จบวิดีโอแล้ว — หยุดเล่นตามที่ตั้งไว้"
บนหน้าจอเป็นเวลา 6 วินาที (กันแค่ครั้งเดียวต่อวิดีโอที่จบ ไม่ใช่การปิด autoplay-next ของ YouTube อย่าง
ถาวร) ถ้าไม่มีวิดีโอถัดไปเริ่มเล่นภายใน 8 วินาที Lalin Cast จะเลิกรอเฉย ๆ โดยไม่ทำอะไรเพิ่ม ต่างจากตัวจับ
เวลาปิดเล่นด้านบน ค่านี้ **ไม่ถูกรีเซ็ตกลับเป็นปิดเอง** — ยังเปิดอยู่จนกว่าผู้ใช้จะปิดเองจากหน้าต่างการ
ตั้งค่า

**English:** Turn on "sleep at end of video" (`sleepAtEndOfVideo`, off by default) from the settings
window. When the currently playing video ends, Lalin Cast arms an 8-second window — if YouTube starts
autoplaying the next video during that time, Lalin Cast immediately pauses it and shows an on-screen
message ("End of video: playback paused as requested") for 6 seconds (this guards against exactly one
autoplay-next per ended video; it does not permanently disable YouTube's autoplay-next feature). If no
next video starts within 8 seconds, Lalin Cast simply stops waiting and does nothing further. Unlike
the sleep timer above, this setting is **not reset back to off automatically** — it stays on until you
turn it off yourself from the settings window.

### Codec filter / ตัวกรอง codec

**ภาษาไทย:** ตัวกรอง codec (ค่าเริ่มต้น "ปิด") บังคับให้หน้า YouTube ใช้เฉพาะ H.264 โดยทำผ่าน Web API
มาตรฐานสองตัวคือ `MediaSource.isTypeSupported` และ `HTMLMediaElement.canPlayType` (ดูรายละเอียดที่
[`PRIVACY.md`](PRIVACY.md)) เป็นประโยชน์กับเครื่องที่มี GPU/iGPU รุ่นเก่าที่ถอดรหัส VP9/AV1 ด้วยฮาร์ดแวร์
ไม่ได้ดีนัก **มีผลหลังโหลดหน้าใหม่เท่านั้น** — วิดีโอที่กำลังเล่นอยู่จะไม่เปลี่ยนพฤติกรรมทันที ต้องโหลด
หน้าใหม่หรือเปิดวิดีโอใหม่ก่อน

**English:** The codec filter (default "off") restricts the YouTube page to H.264 by overriding two
standard Web APIs, `MediaSource.isTypeSupported` and `HTMLMediaElement.canPlayType` (see
[`PRIVACY.md`](PRIVACY.md) for details) — useful on machines with an older GPU/iGPU that doesn't
handle hardware-accelerated VP9/AV1 well. **It only takes effect after the page is reloaded** —
whatever is already playing keeps playing until you reload or open a new video.

### Hardware decoding / การถอดรหัสวิดีโอด้วยฮาร์ดแวร์

**ภาษาไทย:** เปิด/ปิดการถอดรหัสวิดีโอด้วยฮาร์ดแวร์ (GPU) ของหน้าต่างสื่อได้จากหน้าต่างการตั้งค่า
(ค่าเริ่มต้นเปิด) ปิดไว้เพื่อบังคับถอดรหัสด้วยซอฟต์แวร์แทน ซึ่งอาจช่วยได้บนบางเครื่องที่การถอดรหัสด้วย
ฮาร์ดแวร์ทำให้ภาพกระตุกหรือเสีย **มีผลหลังเปิดแอปใหม่เท่านั้น** — หน้าต่างการตั้งค่าจะเตือนด้วยสีเมื่อค่าที่
ตั้งไว้ยังไม่ตรงกับค่าที่ใช้งานอยู่จริง

**English:** Turn hardware-accelerated video decoding for the media window on or off from the
settings window (on by default). Turning it off forces software decoding instead, which can help on
machines where hardware decoding causes stutter or corruption. **It only takes effect after
restarting the app** — the settings window shows a warning color when the saved value doesn't match
what's currently running.

### Keep display awake / กันจอดับขณะเล่น

**ภาษาไทย:** ตัวเลือก "กันจอดับขณะเล่น" (`keepDisplayAwake`, ค่าเริ่มต้นเปิด) บอก Windows ว่าเครื่อง
กำลังถูกใช้งานอยู่ **เฉพาะขณะที่กำลังเล่นวิดีโอจริงเท่านั้น** เพื่อไม่ให้จอดับหรือเครื่องหลับกลางคัน เมื่อ
หยุดเล่นหรือปิดตัวเลือกนี้ จอ/เครื่องจะกลับไปดับ/หลับตามการตั้งค่า Windows ปกติทันที ไม่มีการส่งข้อมูลใด
ออกนอกเครื่อง — ดู [`PRIVACY.md`](PRIVACY.md)

**English:** "Keep display awake" (`keepDisplayAwake`, on by default) tells Windows the machine is in
use **only while a video is actually playing**, so the display and the machine don't sleep
mid-playback. As soon as playback stops or you turn this setting off, the display/machine go back to
sleeping normally on Windows' own schedule. Nothing is sent off the device — see
[`PRIVACY.md`](PRIVACY.md).

### Mini-player / โหมดหน้าต่างเล็ก

**ภาษาไทย:** กด `Ctrl+Shift+M`, เลือก "mini-player" จากเมนูหน้าต่างสื่อ, ไอคอนถาด ("tray-mini"), หรือ
สลับจากหน้าต่างการตั้งค่า เพื่อย่อ Lalin Cast ให้เป็นหน้าต่างเล็กไม่มีกรอบ ลอยอยู่บนสุดที่มุมล่างขวาของจอ
ปัจจุบัน กดซ้ำเพื่อคืนขนาด/ตำแหน่ง/กรอบหน้าต่างเดิม การเข้าโหมดนี้จะออกจากโหมดเต็มจอก่อนโดยอัตโนมัติถ้า
กำลังเต็มจออยู่ สถานะนี้อยู่แค่ในเซสชันปัจจุบันเท่านั้น ไม่ถูกบันทึกข้ามการเปิดแอปใหม่

**English:** Press `Ctrl+Shift+M`, choose "mini-player" from the media window's menu, the tray icon
("tray-mini"), or toggle it from the settings window, to shrink Lalin Cast into a small,
undecorated, always-on-top window pinned to the current screen's bottom-right corner. Toggle it
again to restore the previous window size, position, and frame. Entering mini-player automatically
exits fullscreen first if it was active. This state is session-only and is not remembered across
app restarts.

### Touch overlay / ปุ่มควบคุมบนหน้าจอสัมผัส

**ภาษาไทย:** เมื่อเปิดตัวเลือก "touch overlay" (ค่าเริ่มต้นเปิด) และแอปตรวจพบการแตะหน้าจอครั้งแรก จะมีปุ่ม
ควบคุมของ Lalin Cast เองปรากฏขึ้นบนหน้าจอ (ทิศทาง, ตกลง, ย้อนกลับ, เล่น/หยุด) พอร์ตมาจาก VacuumTube — ดู
[`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md) มีประโยชน์บนอุปกรณ์พกพา (ROG Ally, Legion Go ฯลฯ) ดู
[`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md) ปิดตัวเลือกนี้ได้จากหน้าต่างการ
ตั้งค่าเมื่อไรก็ได้

**English:** When "touch overlay" is on (the default) and the app detects the first screen touch,
Lalin Cast's own on-screen control buttons appear (direction, select, back, play/pause), ported from
VacuumTube — see [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md). Useful on handhelds (ROG Ally, Legion
Go, and similar) — see [`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md). Can
be turned off at any time from the settings window.

## YouTube page

**ภาษาไทย:** สองตัวเลือกนี้อยู่ในกลุ่มการตั้งค่าแยกต่างหาก "หน้า YouTube" (ดู [Settings](#settings))
ทั้งสองปิดเป็นค่าเริ่มต้น (opt-in) และทำงานด้วยวิธีเดียวกัน: **อ่าน DOM ของหน้า YouTube ที่ render เสร็จ
แล้วเท่านั้น แล้วซ่อนด้วย CSS ของ Lalin Cast เอง** ไม่มีการอ่าน แก้ไข หรือดักข้อมูล/ทราฟฟิกของ YouTube
แต่อย่างใด — ดูเหตุผลและเส้นแบ่งที่ใช้ตัดสินฟีเจอร์ลักษณะนี้ที่
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md)
**เพราะเป็นการซ่อนด้วย CSS ของเราเองเท่านั้น การซ่อนนี้อาจหยุดทำงานได้ทุกเมื่อที่ YouTube เปลี่ยน
โครงสร้างหน้าเว็บ** — ไม่ใช่สัญญาที่รับประกันตลอดไป

- **ซ่อนชั้น Shorts บนหน้าแรก** (`hideShorts`, ค่าเริ่มต้นปิด)
- **ซ่อนแท็บ Shorts ในแถบนำทางด้านข้าง** (`hideGuideTabs`, ค่าเริ่มต้นปิด) — แท็บ Home จะไม่ถูกซ่อนไม่ว่า
  กรณีใด เพราะการปิดแท็บ Home ทำให้หน้าเว็บพัง (ดู [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md))

ทั้งสองมีผลทันทีโดยไม่ต้องโหลดหน้าใหม่

**English:** These two options live in their own settings group, "YouTube page" (see
[Settings](#settings)). Both are off by default (opt-in) and work the same way: **reading only the
already-rendered DOM of the YouTube page, then hiding it with Lalin Cast's own CSS.** Nothing about
YouTube's network traffic or data is read, modified, or intercepted — see the reasoning and the
boundary that governs features like this in
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md).
**Because this is our own CSS and nothing more, it may stop working any time YouTube changes its page
structure** — it isn't a guarantee.

- **Hide the Shorts shelf on the home page** (`hideShorts`, off by default)
- **Hide the Shorts tab in the side navigation** (`hideGuideTabs`, off by default) — the Home tab is
  never hidden under any circumstance, because disabling it breaks the page (see
  [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md))

Both take effect immediately, with no page reload needed.

## Command line

**ภาษาไทย:** `lalin-cast.exe` รับพารามิเตอร์บรรทัดคำสั่งได้ดังนี้:

- `--fullscreen` — เปิดแอปแบบเต็มจอสำหรับการรันครั้งนี้เท่านั้น ไม่ถูกบันทึกเป็นค่าถาวร
- `--version` — พิมพ์เลขรุ่นของแอป (`lalin-cast <version>`) แล้วออกทันทีโดยไม่เปิดหน้าต่างใด ๆ
- URL ของ YouTube ที่ระบุเป็นพารามิเตอร์สุดท้ายที่แอปแยกวิเคราะห์ได้ (เช่น
  `https://www.youtube.com/watch?v=<id>`, `https://youtu.be/<id>`, หรือลิงก์ playlist) — เปิด
  วิดีโอ/เพลย์ลิสต์นั้นทันที พารามิเตอร์อื่นที่แอปไม่รู้จักจะถูกข้ามไปเฉย ๆ ไม่ทำให้แอปพัง ถ้า Lalin
  Cast กำลังรันอยู่แล้ว การเปิดอินสแตนซ์ใหม่พร้อม URL จะส่งลิงก์ไปยังหน้าต่างที่เปิดอยู่แทนการเปิด
  หน้าต่างซ้อนใหม่
- `--lifecycle launch|focus|close` — ใช้โดยตัวเปิดแอปภายนอก (เช่น Lalin Studio) เพื่อสั่งเปิดแอป
  (`launch`), นำหน้าต่างที่เปิดอยู่มาไว้ด้านหน้า (`focus`), หรือสั่งปิดแอป (`close`); ค่าอื่นที่ไม่รู้จัก
  จะถูกข้ามไปเหมือนไม่มี flag นี้เลย
- `--request-id <id>` — ตัวระบุคำขอที่ตัวเปิดแอปกำหนดเอง (`[A-Za-z0-9_.-]{1,64}`) ใช้จับคู่ผลลัพธ์ใน
  ไฟล์ `lifecycle.json` (ดูด้านล่าง); ถ้าไม่ระบุหรือรูปแบบไม่ถูกต้อง จะใช้ค่า `"cli"` แทน (สำหรับคำสั่งที่ส่งต่อ
  ไปยังอินสแตนซ์ที่เปิดอยู่) หรือ `"startup"` (สำหรับการเปิดโปรเซสครั้งแรกโดยไม่มี flag นี้)

Lalin Cast ยังรับลิงก์ `lalin-cast://` ได้อีกทางหนึ่ง เทียบเท่ากับ URL ของ YouTube ด้านบนทุกประการ (ผ่านตัว
ตรวจสอบเดียวกัน แล้วแปลงเป็น URL ของ YouTube ก่อนใช้งานเสมอ — ดู [`PRIVACY.md`](PRIVACY.md)):

- `lalin-cast://watch?v=<รหัสวิดีโอ 11 ตัวอักษร>` — เปิดวิดีโอนั้นทันที
- `lalin-cast://playlist?list=<รหัสเพลย์ลิสต์>` — เปิดเพลย์ลิสต์นั้นทันที

รูปแบบอื่นทั้งหมด (host อื่นนอกจาก `watch`/`playlist`, ไม่มีพารามิเตอร์ที่ต้องมี, หรือ `lalin-cast:watch?v=…`
แบบไม่มี `//`) จะถูกละเว้นเหมือน URL ที่แยกวิเคราะห์ไม่ได้ **scheme นี้ไม่ถูกจดทะเบียนกับ Windows โดย
อัตโนมัติ** — ต้องเปิดตัวเลือก "ให้ลิงก์ `lalin-cast://` เปิดด้วย Lalin Cast" จากหน้าต่างการตั้งค่าเองก่อน
(ดู [Settings](#settings)) เป็นการตั้งค่าแบบ opt-in ที่เขียนเฉพาะ `HKCU\Software\Classes\lalin-cast` ของ
บัญชี Windows ปัจจุบันเท่านั้น ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ และไม่แตะ registry ของบัญชีอื่นหรือระดับเครื่อง

ทุกครั้งที่ทำงาน Lalin Cast จะเขียนสถานะปัจจุบันของตัวเองลงไฟล์ `lifecycle.json` (ที่
`%LOCALAPPDATA%\ai.lalin.cast\lifecycle.json`) แบบ atomic เสมอ — เป็นกลไกที่ตัวเปิดแอปภายนอกอย่าง
Lalin Studio ใช้ตรวจสอบว่าแอปเปิดสำเร็จ (`ready`), ปิดแล้ว (`stopped`), หรือล้มเหลว (`failed`) ดู
สัญญา (contract) ฉบับเต็มที่ [`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md)
(พฤติกรรมจริงกับ driver script ของ Studio ยังเป็น human gate H13)

**English:** `lalin-cast.exe` accepts the following command-line arguments:

- `--fullscreen` — starts this run in fullscreen; not persisted as a setting
- `--version` — prints the app's version (`lalin-cast <version>`) and exits immediately without
  opening any window
- a YouTube URL as the last argument the app can parse (e.g.
  `https://www.youtube.com/watch?v=<id>`, `https://youtu.be/<id>`, or a playlist link) — opens
  that video/playlist immediately. Any other, unrecognized argument is silently ignored rather than
  causing a crash. If Lalin Cast is already running, launching a new instance with a URL forwards
  that link to the existing window instead of opening a second one.
- `--lifecycle launch|focus|close` — used by an external launcher (such as Lalin Studio) to ask
  Lalin Cast to start (`launch`), bring the running window to the front (`focus`), or quit
  (`close`). Any other value is ignored, the same as if the flag weren't there.
- `--request-id <id>` — a request identifier the launcher chooses itself
  (`[A-Za-z0-9_.-]{1,64}`), used to match the result in `lifecycle.json` (see below); if omitted or
  malformed, `"cli"` is used instead (for a command forwarded to the running instance) or
  `"startup"` (for a first process launch without the flag).

Lalin Cast also accepts a `lalin-cast://` link as a second way in, fully equivalent to the YouTube
URL above (same validation, then always converted to a YouTube URL before use — see
[`PRIVACY.md`](PRIVACY.md)):

- `lalin-cast://watch?v=<11-character video id>` — opens that video immediately
- `lalin-cast://playlist?list=<playlist id>` — opens that playlist immediately

Every other form (a host other than `watch`/`playlist`, a missing required parameter, or
`lalin-cast:watch?v=…` without `//`) is ignored, the same as an unparseable URL. **This scheme is not
registered with Windows automatically** — you must turn on "Let `lalin-cast://` links open in Lalin
Cast" from the settings window first (see [Settings](#settings)). It's an opt-in setting that writes
only to `HKCU\Software\Classes\lalin-cast` in the current Windows account — no administrator rights
needed, and it never touches another account's registry or the machine-wide hive.

Every time it runs, Lalin Cast always writes its current lifecycle state to `lifecycle.json`
(at `%LOCALAPPDATA%\ai.lalin.cast\lifecycle.json`) atomically — this is how an external launcher
such as Lalin Studio can tell that the app is ready, has stopped, or has failed. See the full
contract at [`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md)
(real behavior with a Studio-side driver script is still human gate H13).

ตัวอย่าง Steam launch options (non-Steam game) / example Steam launch options (non-Steam game):

```
--fullscreen "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

ตัวอย่างการเรียกแบบ Studio launcher lifecycle / example Studio-launcher lifecycle call:

```
"C:\Path\To\lalin-cast.exe" --lifecycle launch --request-id studio-42 "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

ตัวอย่างลิงก์ `lalin-cast://` (ต้องเปิดตัวเลือกในหน้าต่างการตั้งค่าก่อน) / example `lalin-cast://` link
(the settings-window toggle must be on first):

```
lalin-cast://watch?v=dQw4w9WgXcQ
```

ดูคู่มือฉบับเต็มสำหรับ Steam Big Picture และอุปกรณ์พกพา (ROG Ally, Legion Go) ที่
[`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md) — see
[`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md) for the full Steam Big
Picture and handheld (ROG Ally, Legion Go) guide.

## Desktop integration

**ภาษาไทย:** นอกจากลิงก์บรรทัดคำสั่งด้านบน Lalin Cast ยังมีการผสานรวมกับเดสก์ท็อป Windows เพิ่มเติม
สี่อย่าง ทั้งหมดทำงานในเครื่องล้วน ๆ (ดู [`PRIVACY.md`](PRIVACY.md))

**English:** Beyond the command-line link above, Lalin Cast has four additional pieces of desktop
integration, all entirely local (see [`PRIVACY.md`](PRIVACY.md)).

### Window position / ตำแหน่งและขนาดหน้าต่าง

**ภาษาไทย:** Lalin Cast จดจำตำแหน่งและขนาดของหน้าต่างสื่อ (media) ไว้เอง (เขียนโดย Rust เท่านั้น —
ไม่มีทางที่หน้าใดจะเขียนค่านี้ผ่านหน้าต่างการตั้งค่าได้) ทุกครั้งที่ย้ายหรือปรับขนาดหน้าต่าง (หน่วงเวลา
1 วินาทีก่อนบันทึก) และตอนปิดแอป แล้วนำค่านั้นกลับมาใช้ตอนเปิดแอปครั้งถัดไป **ก่อน** แสดงหน้าต่าง ไม่
บันทึกขณะอยู่ในโหมดเต็มจอ, mini-player, maximized หรือ minimized ถ้าตำแหน่งที่บันทึกไว้อยู่นอกจอทั้งหมด
หรือเล็กผิดปกติ (ต่ำกว่า 320×180 พิกเซล) แอปจะไม่ใช้ค่านั้น (ไม่ย้าย/ขยับหน้าต่างให้ผิดที่ให้เอง) —
พฤติกรรมบนหลายจอ/ความละเอียดต่างกัน (DPI) ยังเป็น human gate H14

**English:** Lalin Cast remembers the media window's position and size on its own (written by Rust
only — no page can ever write this value through the settings window) whenever the window is moved
or resized (debounced 1 second) and when the app closes, then restores it the next time the app
starts, **before** the window is shown. It is not saved while in fullscreen, mini-player mode,
maximized, or minimized. If the saved position would land entirely off every screen, or is
abnormally small (under 320×180 pixels), the app ignores it instead of forcing the window somewhere
wrong — multi-monitor and mixed-DPI behavior is still human gate H14.

### Start with Windows / เริ่มพร้อม Windows

**ภาษาไทย:** เปิดตัวเลือก "เริ่มพร้อม Windows" จากหน้าต่างการตั้งค่า (ดู [Settings](#settings)) เพื่อ
เพิ่ม Lalin Cast เข้ารายการเริ่มต้นของบัญชี Windows นี้ (เขียนค่าใน registry Run key ของผู้ใช้เองผ่าน
`reg.exe` เท่านั้น — ไม่มีการใช้ PowerShell หรือ unsafe code) ปิดตัวเลือกนี้เพื่อลบออก มีผลตั้งแต่การ
เข้าสู่ระบบ (sign-in) ครั้งถัดไป ขณะที่ตัวเลือกนี้เปิดอยู่ ทุกครั้งที่แอปเริ่มทำงาน แอปจะเขียนค่าใน registry ซ้ำ
(เพื่อให้ path ของ .exe ที่บันทึกไว้ถูกต้องเสมอหลังอัปเดตแอป) — พฤติกรรมจริงหลัง sign-in ยังเป็น human
gate H14

**English:** Turn on "start with Windows" from the settings window (see [Settings](#settings)) to
add Lalin Cast to this Windows account's own startup list (written to the user's registry Run key
through `reg.exe` only — no PowerShell, no unsafe code). Turn it off to remove it. It takes effect
starting with the next sign-in. While the option is on, every app start re-applies the value
against the registry (so the saved `.exe` path stays correct after an app update) — real behavior
after sign-in is still human gate H14.

### Offline auto-retry / ลองใหม่อัตโนมัติเมื่อออฟไลน์

**ภาษาไทย:** ถ้าเปิดแอปขึ้นมาแล้วไม่มีการเชื่อมต่ออินเทอร์เน็ต (หน้าต่างสถานะแสดง "ออฟไลน์") Lalin Cast
จะลองเชื่อมต่อใหม่ให้เองเป็นระยะ เริ่มที่ 5 วินาที แล้วเพิ่มเป็น 10, 20 และ 30 วินาทีตามลำดับ (คงที่ 30
วินาทีหลังจากนั้น) พร้อมนับถอยหลังบนหน้าต่างสถานะ จนกว่าจะเชื่อมต่อสำเร็จหรือครบ 10 นาที (หลังจากนั้น
ต้องกดปุ่ม "โหลดใหม่" เอง) ไม่ทำงานเมื่อหน้าต่างสถานะแสดงขึ้นเพราะเหตุอื่น (เช่นหน้าทีวีถูกบล็อก) —
พฤติกรรมจริงบนเครื่อง HTPC ที่บูตก่อนต่อ Wi-Fi ยังเป็น human gate H15

**English:** If the app starts with no internet connection (the status window shows "offline"),
Lalin Cast retries on its own on a schedule — starting at 5 seconds, then stepping up to 10, 20,
and 30 seconds (staying at 30 seconds after that) — with a live countdown shown on the status
window, until it succeeds or 10 minutes pass (after which you need to press "Retry" yourself). This
does not run when the status window is shown for another reason, such as a blocked TV surface —
real behavior on an HTPC that boots before Wi-Fi connects is still human gate H15.

### Now-playing title / ชื่อวิดีโอที่กำลังเล่น

**ภาษาไทย:** ชื่อวิดีโอที่กำลังเล่นอยู่ (อ่านจาก Media Session API มาตรฐานของเบราว์เซอร์ในหน้า YouTube
เท่านั้น ไม่อ่าน DOM โดยตรง) จะปรากฏเป็นชื่อหน้าต่างของ Lalin Cast (`Lalin Cast — <ชื่อวิดีโอ>`) และเป็น
อีกหนึ่งบรรทัด (`▶ <ชื่อวิดีโอ>`) ใน tooltip ของไอคอนถาดเฉพาะขณะกำลังเล่นอยู่เท่านั้น อ่านและแสดงผลใน
เครื่องล้วน ๆ ไม่มีการส่งออกไปที่ใด — พฤติกรรมจริงบน Leanback ยังเป็น human gate H16

**English:** The title of the video currently playing (read only from the browser's standard Media
Session API on the YouTube page, never from the DOM directly) appears as Lalin Cast's window title
(`Lalin Cast — <video title>`) and as an extra line (`▶ <video title>`) in the tray icon's tooltip
while something is actually playing. Both are read and shown entirely on the device — nothing is
sent anywhere — real behavior on the Leanback surface is still human gate H16.

## Settings

**ภาษาไทย:** หน้าต่างการตั้งค่าเปิดได้จากเมนูของหน้าต่างหลัก (`settings`), ไอคอนถาด (tray), `Ctrl+O`,
หรือปุ่ม R3 ของคอนโทรลเลอร์ ตั้งค่าได้:

- **การเล่น / Playback** — ตัวจับเวลาปิดเล่นอัตโนมัติ (`sleepTimerMinutes`, พร้อมเวลาที่เหลือแบบนับถอยหลัง),
  หยุดเล่นเมื่อจบวิดีโอ (`sleepAtEndOfVideo`, ดู [Playback](#playback)), ตัวกรอง codec (`codecFilter`,
  พร้อมหมายเหตุ "มีผลหลังโหลดใหม่"), การถอดรหัสวิดีโอด้วยฮาร์ดแวร์
  (`hardwareDecoding`, พร้อมหมายเหตุ "มีผลหลังเปิดแอปใหม่" ที่ขึ้นสีเตือนเมื่อค่ายังไม่ตรงกับค่าที่ใช้งานอยู่
  จริง) และกันจอดับขณะเล่น (`keepDisplayAwake`, ค่าเริ่มต้นเปิด, กันเฉพาะตอนกำลังเล่นวิดีโอจริง) — ดู
  [Playback](#playback)
- **หน้า YouTube / YouTube page** — ซ่อนชั้น Shorts บนหน้าแรก (`hideShorts`, ค่าเริ่มต้นปิด) และซ่อนแท็บ
  Shorts ในแถบนำทาง (`hideGuideTabs`, ค่าเริ่มต้นปิด) ทั้งสองเป็น opt-in ทำด้วย CSS ของ Lalin Cast เองบน
  DOM ที่ render เสร็จแล้วเท่านั้น ไม่แก้ข้อมูลหรือการทำงานของ YouTube และอาจหยุดทำงานเมื่อ YouTube
  เปลี่ยนหน้าเว็บ — ดู [YouTube page](#youtube-page)
- **ทั่วไป / General** — ภาษา, เริ่มพร้อม Windows (`startWithWindows`), มาตราส่วน UI
  (`uiScale`, 100/125/150/175/200% — ปรับ zoom ของหน้าต่างสื่อผ่าน API ของ WebView2 เอง **มีผลทันที**
  ทั้งตอนเลือกและตอนเปิดแอปครั้งถัดไป เหมาะกับการดูจากที่นั่งไกลบนทีวี 4K) และปุ่ม profile สามปุ่ม
  (ห้องนั่งเล่น / อุปกรณ์พกพา / เดสก์ท็อป — ดูรายละเอียดด้านล่าง)
- **หน้าจอ / Display** — เต็มจอ (fullscreen), อยู่ด้านบนเสมอ (keep on top) และโหมดหน้าต่างเล็ก
  (mini-player, ไม่ persist — สลับได้ด้วย `Ctrl+Shift+M` เช่นกัน)
- **การควบคุม** — เปิด/ปิดคอนโทรลเลอร์ (`controllerEnabled`, ค่าเริ่มต้นเปิด), หยุดวิดีโอเมื่อหน้าต่างเสีย
  โฟกัส (`pauseOnBlur`, ค่าเริ่มต้นปิด), ปุ่มควบคุมบนหน้าจอสัมผัส (`touchOverlay`, ค่าเริ่มต้นเปิด)
- **เดสก์ท็อป** — เริ่มพร้อม Windows (`startWithWindows`, ค่าเริ่มต้นปิด — มีผลตั้งแต่การเข้าสู่ระบบครั้ง
  ถัดไป) ดู [Desktop integration](#desktop-integration), และให้ลิงก์ `lalin-cast://` เปิดด้วย Lalin Cast
  (`deepLinkScheme`, ค่าเริ่มต้นปิด — opt-in, เขียนเฉพาะ registry ของบัญชี Windows นี้เท่านั้นที่
  `HKCU\Software\Classes\lalin-cast` ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ — ดู [Command line](#command-line) และ
  [`PRIVACY.md`](PRIVACY.md)) พร้อมข้อความเตือนถ้าเปิดตัวเลือกไว้แต่ยังไม่ได้จดทะเบียนจริงในเครื่อง
- **โปรไฟล์การตั้งค่า / Settings profiles** — ปุ่ม "ห้องนั่งเล่น" (living room), "อุปกรณ์พกพา" (handheld)
  และ "เดสก์ท็อป" (desktop) ตั้งค่าหลายอย่างพร้อมกันในคลิกเดียว ดังตาราง (คีย์ที่ไม่อยู่ในตารางนี้ เช่น
  ภาษา, ชื่อ DIAL, เริ่มพร้อม Windows จะไม่ถูกแตะเลย):

  | โปรไฟล์ | เต็มจอ | อยู่บนสุดเสมอ | คอนโทรลเลอร์ | ปุ่มสัมผัส | หยุดเมื่อเสียโฟกัส | ตัวกรอง codec | มาตราส่วน UI |
  |---|---|---|---|---|---|---|---|
  | ห้องนั่งเล่น (`livingRoom`) | เปิด | ปิด | เปิด | ปิด | ปิด | ปิด | 150% |
  | อุปกรณ์พกพา (`handheld`) | เปิด | ปิด | เปิด | เปิด | ปิด | H.264 เท่านั้น | 125% |
  | เดสก์ท็อป (`desktop`) | ปิด | ปิด | เปิด | ปิด | เปิด | ปิด | 100% |

- **รีเซ็ตค่าเริ่มต้น / Reset to defaults** — ปุ่มในกลุ่ม "อัปเดตและเกี่ยวกับ" แบบกดสองจังหวะ (กดครั้งแรก
  จะขึ้นข้อความให้กดซ้ำอีกครั้งภายใน 5 วินาทีเพื่อยืนยัน มิฉะนั้นจะยกเลิกไปเอง) คืนค่าเกือบทุกการตั้งค่า
  กลับเป็นค่าเริ่มต้นของแอป (เต็มจอ, อยู่บนสุดเสมอ, หยุดเมื่อเสียโฟกัส, คอนโทรลเลอร์, ตัวจับเวลาปิดเล่น,
  ตัวกรอง codec, การถอดรหัสด้วยฮาร์ดแวร์, ปุ่มสัมผัส, มาตราส่วน UI, หยุดเล่นเมื่อจบวิดีโอ, mini-player และ
  ตำแหน่ง/ขนาดหน้าต่างที่จำไว้) **แต่ไม่ลบ** ภาษา, ชื่อ/รหัสอุปกรณ์ DIAL (`dialFriendlyName`,
  `dialDeviceId`), สถานะว่าผ่านตัวช่วยติดตั้งแล้ว (`setupCompleted`) หรือรายการเริ่มพร้อม Windows
  (`startWithWindows`) หรือการจดทะเบียน `lalin-cast://` (`deepLinkScheme`) — ค่าทั้งหกนี้ยังคงเดิมหลังกดรีเซ็ต
- ภาษา (ไทย/English)
- ชื่อที่แสดงผ่าน DIAL (`dialFriendlyName`) — มีผลทันที มองเห็นได้จากมือถือที่ค้นหาอุปกรณ์
- ปุ่มเปิดตัวช่วยติดตั้งเครือข่าย/DIAL อีกครั้ง
- ปุ่มตรวจสอบการอัปเดต และเลขรุ่นปัจจุบันของแอป
- ปุ่ม "คัดลอกคำสั่งเปิดสำหรับ Steam" ในกลุ่ม "อัปเดตและเกี่ยวกับ" — สร้างคำสั่งบรรทัดเดียว
  (`"<path เต็มของ .exe>" --fullscreen`) แล้วคัดลอกไปยังคลิปบอร์ดของเครื่องเมื่อกดปุ่มเท่านั้น (ถ้าคัดลอก
  อัตโนมัติไม่สำเร็จ ข้อความจะแสดงในกล่องข้อความให้เลือกคัดลอกเอง) ใช้วางลงช่อง Launch Options ของ Steam
  ได้ทันที — ดู [`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md)
- ปุ่ม "คัดลอกข้อมูลวินิจฉัย" ในกลุ่ม "อัปเดตและเกี่ยวกับ" — สร้างข้อความสรุปสถานะแอป (เวอร์ชัน,
  OS/WebView2, สถานะ DIAL พร้อม IP:พอร์ตบน LAN, ค่าตั้งปัจจุบัน — **ไม่มี** device id, URL หรือรหัส
  ทีวี) แล้วคัดลอกไปยังคลิปบอร์ดของเครื่องเมื่อกดปุ่มเท่านั้น (ถ้าคัดลอกอัตโนมัติไม่สำเร็จ ข้อความจะแสดง
  ในกล่องข้อความให้เลือกคัดลอกเอง) ใช้แนบกับรายงานปัญหา — ดู [`PRIVACY.md`](PRIVACY.md)
- ปุ่ม "เปิดโฟลเดอร์ log" ในกลุ่ม "อัปเดตและเกี่ยวกับ" — เปิด Windows Explorer ที่โฟลเดอร์เก็บไฟล์ log
  ในเครื่อง (`%LOCALAPPDATA%\ai.lalin.cast\logs\`) ทันทีที่กด ดู [Support](#support)

การเปลี่ยนแต่ละค่ามีผลทันทีและบันทึกอัตโนมัติ ไม่ต้องกดปุ่มบันทึกแยก (ยกเว้น mini-player ซึ่งเป็นสถานะของ
เซสชันปัจจุบัน ไม่ persist)

**English:** The settings window opens from the media window's menu (`settings`), the tray icon,
`Ctrl+O`, or the controller's R3 button. It lets you change:

- **Playback** — the sleep timer (`sleepTimerMinutes`, with a live countdown), sleep at end of
  video (`sleepAtEndOfVideo`, see [Playback](#playback)), the codec filter
  (`codecFilter`, noted "effective after reload"), hardware decoding (`hardwareDecoding`, noted
  "effective after restarting the app" and shown in a warning color when the saved value doesn't
  match what's currently running), and keep the display awake while playing
  (`keepDisplayAwake`, on by default, active only while a video is actually playing) — see
  [Playback](#playback)
- **YouTube page** — hide the Shorts shelf on the home page (`hideShorts`, off by default) and hide
  the Shorts tab in the guide navigation (`hideGuideTabs`, off by default); both are opt-in and done
  with Lalin Cast's own CSS on the already-rendered DOM, never touching YouTube's data or behavior,
  and may stop working when YouTube changes its page — see [YouTube page](#youtube-page)
- **General** — language, start with Windows (`startWithWindows`), UI scale (`uiScale`,
  100/125/150/175/200% — zooms the media window through WebView2's own API. **Applies immediately**,
  both when you pick it and again the next time the app starts; useful for reading text from across
  the room on a 4K TV) and the three profile buttons (living room / handheld / desktop — see below)
- **Display** — fullscreen, keep-on-top, and mini-player (not persisted — can also be toggled with
  `Ctrl+Shift+M`)
- **Controls** — the controller toggle (`controllerEnabled`, on by default), pause-on-blur
  (`pauseOnBlur`, off by default), and the touch overlay (`touchOverlay`, on by default)
- **Desktop** — start with Windows (`startWithWindows`, off by default — takes effect starting
  with the next sign-in), see [Desktop integration](#desktop-integration), and letting
  `lalin-cast://` links open in Lalin Cast (`deepLinkScheme`, off by default — opt-in, writes only to
  this Windows account's own registry at `HKCU\Software\Classes\lalin-cast`, no administrator rights
  needed — see [Command line](#command-line) and [`PRIVACY.md`](PRIVACY.md)), with a warning shown if
  the toggle is on but the machine's registry doesn't actually have it registered
- **Settings profiles** — "living room", "handheld", and "desktop" buttons set several values at
  once in a single click, as shown below (any key not in this table — language, DIAL name, start
  with Windows — is left untouched):

  | Profile | Fullscreen | Keep on top | Controller | Touch overlay | Pause on blur | Codec filter | UI scale |
  |---|---|---|---|---|---|---|---|
  | Living room (`livingRoom`) | on | off | on | off | off | off | 150% |
  | Handheld (`handheld`) | on | off | on | on | off | H.264 only | 125% |
  | Desktop (`desktop`) | off | off | on | off | on | off | 100% |

- **Reset to defaults** — a two-step button in the Updates & About group (the first press shows a
  message asking you to press again within 5 seconds to confirm; otherwise it cancels itself).
  Resets almost every setting back to the app's own defaults (fullscreen, keep-on-top, pause-on-blur,
  controller, sleep timer, codec filter, hardware decoding, touch overlay, UI scale, sleep at end of
  video, mini-player, and the remembered window position/size) **but does not remove** the language,
  the DIAL name/id (`dialFriendlyName`, `dialDeviceId`), the setup-wizard-completed flag
  (`setupCompleted`), the "start with Windows" entry (`startWithWindows`), or the `lalin-cast://`
  scheme registration (`deepLinkScheme`) — those six stay exactly as they were after a reset.
- language (Thai/English)
- the name shown over DIAL (`dialFriendlyName`) — applies immediately, visible right away to
  phones discovering the device
- a button to reopen the network/DIAL setup wizard
- a button to check for updates, and the app's current version
- a "copy launch command for Steam" button in the Updates & About group — builds a single-line
  command (`"<full path to the .exe>" --fullscreen`) and copies it to the device's clipboard only
  when the button is pressed (if the automatic copy fails, the text is shown in a box so you can
  select and copy it yourself); paste it straight into Steam's Launch Options field — see
  [`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md)
- a "copy diagnostics" button in the Updates & About group — builds a text summary of the app's
  state (version, OS/WebView2, DIAL status with its LAN IP:port, current settings — **never** a
  device id, URL, or TV code) and copies it to the device's clipboard only when the button is
  pressed (if the automatic copy fails, the text is shown in a box so you can select and copy it
  yourself); handy to attach to a bug report — see [`PRIVACY.md`](PRIVACY.md)
- an "open log folder" button in the Updates & About group — opens Windows Explorer at the folder
  holding the local log file (`%LOCALAPPDATA%\ai.lalin.cast\logs\`) as soon as it's pressed — see
  [Support](#support)

Every change applies immediately and saves automatically; there is no separate save button (except
mini-player, which is current-session state and is not persisted).

## Updating

The app checks the signed manifest at:

`https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`

The public updater key is committed in `src-tauri/tauri.conf.json`. The private
key must remain outside the repository and is supplied to GitHub Actions through
`LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY` and its optional password secret. The app
never installs an update without user confirmation.

## Development

**ภาษาไทย:** นอกจาก `cargo check`/`cargo fmt`/`cargo tauri build` ด้านบน CI (`ci.yml`) ยังมีงาน `smoke`
(รันบน `windows-latest`, เป็น check ที่บังคับผ่าน (blocking) ตั้งแต่ wave 8 หลังเขียวติดกันสองรอบใน
PR #9 และ #10 — H20) ที่ build เวอร์ชัน debug ของ
`lalin-cast.exe` แล้วรันจริงด้วย `--version` และ `--lifecycle close --request-id ci-smoke` เพื่อตรวจสอบ
ว่าไฟล์ `lifecycle.json` (ดู [`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md))
ถูกเขียนถูกต้อง — เป็นหลักฐานอัตโนมัติสำหรับ human gate H13 ทุกครั้งที่ push สคริปต์
[`scripts/lifecycle-driver.ps1`](scripts/lifecycle-driver.ps1) (ตัวอ่านไฟล์วงจรชีวิตอย่างเดียว ไม่มีการเขียนไฟล์ใด ๆ)
ใช้ทดสอบ launcher lifecycle นี้ด้วยตัวเองบนเครื่องนักพัฒนา — ดูวิธีใช้ที่ `scripts/README.md`

wave 10 เพิ่ม workflow แยกต่างหากอีกตัว
[`.github/workflows/release-dryrun.yml`](.github/workflows/release-dryrun.yml) ที่ซ้อมขั้นตอน build
ตัวติดตั้งด้วย `tauri-apps/tauri-action` **SHA เดียวกันและ `projectPath` เดียวกัน** กับที่
`release.yml` ใช้จริง (แต่ไม่สร้างหรืออัปโหลด GitHub Release ใด ๆ และไม่ต้องใช้ secret สำหรับเซ็นชื่อ) จะ
รันเองเมื่อไฟล์ที่มีผลต่อการ bundle เปลี่ยน (`tauri.conf.json`, `Cargo.toml`/`Cargo.lock`, ไอคอน, และตัว
workflow เอง) หรือสั่งรันเองผ่าน `workflow_dispatch` ก็ได้ ผลลัพธ์คือไฟล์ติดตั้ง `*-setup.exe`
**ที่ไม่ได้ลงนาม (unsigned)** อัปโหลดเป็น CI artifact ชื่อ `lalin-cast-dryrun-installer` เก็บไว้ 7 วัน
สำหรับทดสอบติดตั้งบนเครื่องสะอาดก่อน tag จริง (ดู
[`docs/plans/W10_RELEASE_REHEARSAL_PLAN.md`](docs/plans/W10_RELEASE_REHEARSAL_PLAN.md))

**English:** Beyond the `cargo check`/`cargo fmt`/`cargo tauri build` commands above, CI (`ci.yml`)
also runs a `smoke` job (on `windows-latest`, a blocking required check since wave 8, after two
stable green runs in PR #9 and #10 — H20)
that builds a debug `lalin-cast.exe` and actually runs it with `--version` and
`--lifecycle close --request-id ci-smoke`, checking that `lifecycle.json` (see
[`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md)) is written
correctly — automated evidence toward human gate H13 on every push. The
[`scripts/lifecycle-driver.ps1`](scripts/lifecycle-driver.ps1) script (a read-only lifecycle-file poller that
never writes anything) exercises the same launcher lifecycle locally on a developer machine — see
`scripts/README.md` for usage.

Wave 10 added a separate workflow,
[`.github/workflows/release-dryrun.yml`](.github/workflows/release-dryrun.yml), that rehearses the
installer build using **the same `tauri-apps/tauri-action` pin (same SHA) and the same
`projectPath`** that `release.yml` uses for a real release, but never creates or uploads a GitHub
Release and needs no signing secret. It runs whenever a file that affects the bundle changes
(`tauri.conf.json`, `Cargo.toml`/`Cargo.lock`, the icons, or the workflow file itself), or on
demand via `workflow_dispatch`. The result is an **unsigned** `*-setup.exe` installer uploaded as a
CI artifact named `lalin-cast-dryrun-installer`, kept for 7 days, meant for a clean-machine install
test before a real tag (see
[`docs/plans/W10_RELEASE_REHEARSAL_PLAN.md`](docs/plans/W10_RELEASE_REHEARSAL_PLAN.md)).

## Support

**ภาษาไทย:** รายงานปัญหาความปลอดภัยแบบส่วนตัวตามขั้นตอนใน [`SECURITY.md`](SECURITY.md) ดูประวัติการ
เปลี่ยนแปลงของแอปที่ [`CHANGELOG.md`](CHANGELOG.md) แจ้งบั๊กหรือขอฟีเจอร์ใหม่ผ่าน GitHub Issues โดยใช้
เทมเพลตที่เตรียมไว้ ([bug report](.github/ISSUE_TEMPLATE/bug_report.yml),
[feature request](.github/ISSUE_TEMPLATE/feature_request.yml)) — **ห้ามวางรหัสจับคู่ทีวี (TV pairing
code) หรือข้อมูลบัญชีลงในรายงาน** ข้อความวินิจฉัยที่คัดลอกจากหน้าต่างการตั้งค่า (ดู [Settings](#settings))
ไม่มีข้อมูลเหล่านี้อยู่แล้ว แต่ก็ควรตรวจทานก่อนวางเสมอ

**ไฟล์ log ในเครื่อง:** Lalin Cast เก็บไฟล์ log ไว้ในเครื่องที่
`%LOCALAPPDATA%\ai.lalin.cast\logs\lalin-cast.log` หมุนเวียนเมื่อไฟล์ปัจจุบันเกินประมาณ 512 KiB (เก็บไว้
สูงสุดสองไฟล์ เพดานรวมประมาณ 1 MiB) กดปุ่ม "เปิดโฟลเดอร์ log" ในหน้าต่างการตั้งค่า (กลุ่ม "อัปเดตและ
เกี่ยวกับ" — ดู [Settings](#settings)) เพื่อเปิดโฟลเดอร์นี้โดยตรง เวลารายงานปัญหา ควรแนบไฟล์
`lalin-cast.log` (และ `lalin-cast.log.1` ถ้ามี) มาด้วย นอกเหนือจากข้อความวินิจฉัยที่คัดลอกได้ด้านบน —
ดูรายละเอียดว่าไฟล์นี้เก็บและไม่เก็บอะไรที่ [`PRIVACY.md`](PRIVACY.md)

**English:** Report a security issue privately following the steps in [`SECURITY.md`](SECURITY.md).
See the app's change history in [`CHANGELOG.md`](CHANGELOG.md). File a bug or feature request
through GitHub Issues using the prepared templates
([bug report](.github/ISSUE_TEMPLATE/bug_report.yml),
[feature request](.github/ISSUE_TEMPLATE/feature_request.yml)) — **never paste a TV pairing code
or account information into a report.** The diagnostics text copied from the settings window (see
[Settings](#settings)) doesn't contain any of that, but it's still worth a quick look before you
paste it.

**Local log file:** Lalin Cast keeps a local log file at
`%LOCALAPPDATA%\ai.lalin.cast\logs\lalin-cast.log`, rotating once the current file passes roughly
512 KiB (keeping at most two files, so the total stays around 1 MiB). Press the "open log folder"
button in the settings window (Updates & About group — see [Settings](#settings)) to open that
folder directly. When reporting a problem, attach `lalin-cast.log` (and `lalin-cast.log.1` if
present) along with the diagnostics text described above — see [`PRIVACY.md`](PRIVACY.md) for
exactly what this file does and does not contain.

## Provenance

See [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md),
[`docs/architecture/ADR-001-CAST-TAURI-PORT.md`](docs/architecture/ADR-001-CAST-TAURI-PORT.md),
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md)
(the client-side modification boundary and why upstream's `hide-shorts.js`/`guide-tabs.js` were not
ported), and [`docs/architecture/LALIN_CAST_UPDATER_SPEC.md`](docs/architecture/LALIN_CAST_UPDATER_SPEC.md).
