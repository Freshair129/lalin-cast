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

Current scope:

- native Tauri window and lifecycle;
- Lalin Cast's own Leanback-compatible User-Agent (`LalinCast/<version>` identity token built from
  the app's own version, no longer VacuumTube-derived);
- single-instance focus;
- fullscreen, keep-on-top, reload, quit, and Thai/English language toggle native menu actions;
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
  show the window, open network/DIAL setup, check for updates, and quit;
- a first-run setup wizard window that reads the Windows network category (Private/Public/Domain,
  read locally through PowerShell only) and the live DIAL status, explains how to switch a Public
  profile to Private when needed, and can be reopened anytime from the tray or the media window's
  menu;
- a status window shown when the app starts without a working internet connection, or when the
  embedded YouTube page reports it isn't displaying the expected TV surface, with a manual retry
  and quit action (no automatic retry loop);
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
  [Command line](#command-line) (deep-link behavior on the real Leanback surface is human gate H7).

Windows x64 is the primary, fully-supported release target. the tagged release workflow also produces an experimental ARM64 build (and CI runs a non-blocking `cargo check` for that target); it
(`aarch64-pc-windows-msvc`) build as an **experimental**, `continue-on-error` job that is not held
to the same acceptance gates as x64 yet and may lag behind it (human gate H12). A winget package
submission is prepared — see [`packaging/winget/README.md`](packaging/winget/README.md) — but has
not been submitted to `microsoft/winget-pkgs` yet.

If the local settings store is unavailable, the shell uses safe defaults and
still opens; the failure is not allowed to block the media window.

Inherited local evidence: the debug runtime binds the DIAL SSDP port, returns
the device descriptor with an `Application-URL` header and passes the Rust
unit tests (DIAL, HTTP parser, identity and i18n). Same-Wi-Fi iPhone TV-code connection is user-confirmed for the previous
debug runtime. Standalone packaging, signed updater artifacts, network-drop
recovery, controller parity and account acceptance remain separate gates until
rerun in this repository. Ad filtering and SponsorBlock are not implemented; they
wait on the decisions recorded in `docs/plans/H0_RELEASE_READINESS_PLAN.md`.

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

## Playback

**ภาษาไทย:** Lalin Cast มีตัวเลือกการเล่นเพิ่มเติมห้าอย่าง ตั้งค่าได้จากหน้าต่างการตั้งค่า (ดู
[Settings](#settings)) ทั้งหมดทำงานในเครื่องล้วน ๆ ไม่มีการส่งข้อมูลใดออกนอกเครื่องเพิ่มเติม (ดู
[`PRIVACY.md`](PRIVACY.md))

**English:** Lalin Cast has five additional playback options, all set from the settings window (see
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

## Command line

**ภาษาไทย:** `lalin-cast.exe` รับพารามิเตอร์บรรทัดคำสั่งได้ดังนี้:

- `--fullscreen` — เปิดแอปแบบเต็มจอสำหรับการรันครั้งนี้เท่านั้น ไม่ถูกบันทึกเป็นค่าถาวร
- `--version` — พิมพ์เลขรุ่นของแอป (`lalin-cast <version>`) แล้วออกทันทีโดยไม่เปิดหน้าต่างใด ๆ
- URL ของ YouTube ที่ระบุเป็นพารามิเตอร์สุดท้ายที่แอปแยกวิเคราะห์ได้ (เช่น
  `https://www.youtube.com/watch?v=<id>`, `https://youtu.be/<id>`, หรือลิงก์ playlist) — เปิด
  วิดีโอ/เพลย์ลิสต์นั้นทันที พารามิเตอร์อื่นที่แอปไม่รู้จักจะถูกข้ามไปเฉย ๆ ไม่ทำให้แอปพัง ถ้า Lalin
  Cast กำลังรันอยู่แล้ว การเปิดอินสแตนซ์ใหม่พร้อม URL จะส่งลิงก์ไปยังหน้าต่างที่เปิดอยู่แทนการเปิด
  หน้าต่างซ้อนใหม่

**English:** `lalin-cast.exe` accepts the following command-line arguments:

- `--fullscreen` — starts this run in fullscreen; not persisted as a setting
- `--version` — prints the app's version (`lalin-cast <version>`) and exits immediately without
  opening any window
- a YouTube URL as the last argument the app can parse (e.g.
  `https://www.youtube.com/watch?v=<id>`, `https://youtu.be/<id>`, or a playlist link) — opens
  that video/playlist immediately. Any other, unrecognized argument is silently ignored rather than
  causing a crash. If Lalin Cast is already running, launching a new instance with a URL forwards
  that link to the existing window instead of opening a second one.

ตัวอย่าง Steam launch options (non-Steam game) / example Steam launch options (non-Steam game):

```
"C:\Path\To\lalin-cast.exe" --fullscreen "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

ดูคู่มือฉบับเต็มสำหรับ Steam Big Picture และอุปกรณ์พกพา (ROG Ally, Legion Go) ที่
[`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md) — see
[`docs/guides/STEAM_AND_HANDHELD.md`](docs/guides/STEAM_AND_HANDHELD.md) for the full Steam Big
Picture and handheld (ROG Ally, Legion Go) guide.

## Settings

**ภาษาไทย:** หน้าต่างการตั้งค่าเปิดได้จากเมนูของหน้าต่างหลัก (`settings`), ไอคอนถาด (tray), `Ctrl+O`,
หรือปุ่ม R3 ของคอนโทรลเลอร์ ตั้งค่าได้:

- **การเล่น / Playback** — ตัวจับเวลาปิดเล่นอัตโนมัติ (`sleepTimerMinutes`, พร้อมเวลาที่เหลือแบบนับถอยหลัง),
  ตัวกรอง codec (`codecFilter`, พร้อมหมายเหตุ "มีผลหลังโหลดใหม่"), การถอดรหัสวิดีโอด้วยฮาร์ดแวร์
  (`hardwareDecoding`, พร้อมหมายเหตุ "มีผลหลังเปิดแอปใหม่" ที่ขึ้นสีเตือนเมื่อค่ายังไม่ตรงกับค่าที่ใช้งานอยู่
  จริง) — ดู [Playback](#playback)
- **หน้าจอ / Display** — เต็มจอ (fullscreen), อยู่ด้านบนเสมอ (keep on top) และโหมดหน้าต่างเล็ก
  (mini-player, ไม่ persist — สลับได้ด้วย `Ctrl+Shift+M` เช่นกัน)
- **การควบคุม** — เปิด/ปิดคอนโทรลเลอร์ (`controllerEnabled`, ค่าเริ่มต้นเปิด), หยุดวิดีโอเมื่อหน้าต่างเสีย
  โฟกัส (`pauseOnBlur`, ค่าเริ่มต้นปิด), ปุ่มควบคุมบนหน้าจอสัมผัส (`touchOverlay`, ค่าเริ่มต้นเปิด)
- ภาษา (ไทย/English)
- ชื่อที่แสดงผ่าน DIAL (`dialFriendlyName`) — มีผลทันที มองเห็นได้จากมือถือที่ค้นหาอุปกรณ์
- ปุ่มเปิดตัวช่วยติดตั้งเครือข่าย/DIAL อีกครั้ง
- ปุ่มตรวจสอบการอัปเดต และเลขรุ่นปัจจุบันของแอป

การเปลี่ยนแต่ละค่ามีผลทันทีและบันทึกอัตโนมัติ ไม่ต้องกดปุ่มบันทึกแยก (ยกเว้น mini-player ซึ่งเป็นสถานะของ
เซสชันปัจจุบัน ไม่ persist)

**English:** The settings window opens from the media window's menu (`settings`), the tray icon,
`Ctrl+O`, or the controller's R3 button. It lets you change:

- **Playback** — the sleep timer (`sleepTimerMinutes`, with a live countdown), the codec filter
  (`codecFilter`, noted "effective after reload"), and hardware decoding (`hardwareDecoding`, noted
  "effective after restarting the app" and shown in a warning color when the saved value doesn't
  match what's currently running) — see [Playback](#playback)
- **Display** — fullscreen, keep-on-top, and mini-player (not persisted — can also be toggled with
  `Ctrl+Shift+M`)
- **Controls** — the controller toggle (`controllerEnabled`, on by default), pause-on-blur
  (`pauseOnBlur`, off by default), and the touch overlay (`touchOverlay`, on by default)
- language (Thai/English)
- the name shown over DIAL (`dialFriendlyName`) — applies immediately, visible right away to
  phones discovering the device
- a button to reopen the network/DIAL setup wizard
- a button to check for updates, and the app's current version

Every change applies immediately and saves automatically; there is no separate save button (except
mini-player, which is current-session state and is not persisted).

## Updating

The app checks the signed manifest at:

`https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`

The public updater key is committed in `src-tauri/tauri.conf.json`. The private
key must remain outside the repository and is supplied to GitHub Actions through
`LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY` and its optional password secret. The app
never installs an update without user confirmation.

## Provenance

See [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md),
[`docs/architecture/ADR-001-CAST-TAURI-PORT.md`](docs/architecture/ADR-001-CAST-TAURI-PORT.md)
and [`docs/architecture/LALIN_CAST_UPDATER_SPEC.md`](docs/architecture/LALIN_CAST_UPDATER_SPEC.md).
