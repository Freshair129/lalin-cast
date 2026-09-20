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
- a native settings window (language, DIAL name, fullscreen, keep-on-top, controller toggle,
  pause-on-blur, reopen the setup wizard, check for updates) reachable from the media window's
  menu, the tray icon, `Ctrl+O`, or the controller's R3 button — see [Settings](#settings)
  (live-apply behavior on a real machine is human gate H9);
- command-line startup flags and a YouTube URL/playlist deep link, including forwarding a link to
  an already-running instance instead of opening a second window — see
  [Command line](#command-line) (deep-link behavior on the real Leanback surface is human gate H7).

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

- ภาษา (ไทย/English)
- ชื่อที่แสดงผ่าน DIAL (`dialFriendlyName`) — มีผลทันที มองเห็นได้จากมือถือที่ค้นหาอุปกรณ์
- เต็มจอ (fullscreen) และอยู่ด้านบนเสมอ (keep on top)
- เปิด/ปิดคอนโทรลเลอร์ (`controllerEnabled`, ค่าเริ่มต้นเปิด)
- หยุดวิดีโอเมื่อหน้าต่างเสียโฟกัส (`pauseOnBlur`, ค่าเริ่มต้นปิด)
- ปุ่มเปิดตัวช่วยติดตั้งเครือข่าย/DIAL อีกครั้ง
- ปุ่มตรวจสอบการอัปเดต และเลขรุ่นปัจจุบันของแอป

การเปลี่ยนแต่ละค่ามีผลทันทีและบันทึกอัตโนมัติ ไม่ต้องกดปุ่มบันทึกแยก

**English:** The settings window opens from the media window's menu (`settings`), the tray icon,
`Ctrl+O`, or the controller's R3 button. It lets you change:

- language (Thai/English)
- the name shown over DIAL (`dialFriendlyName`) — applies immediately, visible right away to
  phones discovering the device
- fullscreen and keep-on-top
- the controller toggle (`controllerEnabled`, on by default)
- pause-on-blur (`pauseOnBlur`, off by default) — pauses playback when the window loses focus
- a button to reopen the network/DIAL setup wizard
- a button to check for updates, and the app's current version

Every change applies immediately and saves automatically; there is no separate save button.

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
