# Changelog — Lalin Cast

เอกสารนี้บันทึกการเปลี่ยนแปลงที่สำคัญของ Lalin Cast ตามรูปแบบ
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) และจะอิง
[Semantic Versioning](https://semver.org/) เมื่อเริ่มมีการ tag เวอร์ชันเผยแพร่ / This document records
notable changes to Lalin Cast, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
adopting [Semantic Versioning](https://semver.org/) once tagged releases begin.

Lalin Cast ยังไม่มีเวอร์ชันที่ tag เผยแพร่ต่อสาธารณะ (ดู
[`docs/runbooks/RELEASE_CHECKLIST.md`](docs/runbooks/RELEASE_CHECKLIST.md)) ทุกรายการด้านล่างจึงอยู่ใต้
`[Unreleased]` และจัดกลุ่มย่อยตาม wave การพัฒนา (อ้างอิงแผนใน `docs/plans/`) แทนเลขเวอร์ชัน / Lalin Cast
has not tagged a public release yet (see
[`docs/runbooks/RELEASE_CHECKLIST.md`](docs/runbooks/RELEASE_CHECKLIST.md)), so every entry below sits
under `[Unreleased]`, sub-grouped by development wave (see the plans under `docs/plans/`) instead of a
version number.

## [Unreleased]

### Added

#### H0 — Release readiness (`docs/plans/H0_RELEASE_READINESS_PLAN.md`)

- อัตลักษณ์ของ Lalin Cast เอง (User-Agent `LalinCast/<version>`, DIAL `manufacturer`/`modelName`) แทน
  ของ VacuumTube เดิม / Lalin Cast's own identity (User-Agent `LalinCast/<version>`, DIAL
  `manufacturer`/`modelName`) replacing the inherited VacuumTube identity
- หน้าต่างอัปเดตแบบ native พร้อมการยืนยันจากผู้ใช้ก่อนติดตั้งเสมอ / a native update window that always
  requires explicit user confirmation before installing
- ตัด command/permission ที่ไม่ได้ใช้ออกจาก Tauri capabilities / trimmed unused commands/permissions
  from the Tauri capabilities
- CI (`cargo fmt`/`clippy -D warnings`/`test`/`check`, SHA-pinned GitHub Actions), `cargo-deny`
  supply-chain audit, Dependabot / CI (`cargo fmt`/`clippy -D warnings`/`test`/`check`, SHA-pinned
  GitHub Actions), the `cargo-deny` supply-chain audit, and Dependabot
- เอกสารกฎหมายชุดแรก: `PRIVACY.md`, `TERMS.md`, `THIRD_PARTY_NOTICES.md`, `docs/LICENSE_DECISION.md` /
  the first legal documents: `PRIVACY.md`, `TERMS.md`, `THIRD_PARTY_NOTICES.md`,
  `docs/LICENSE_DECISION.md`
- `docs/runbooks/SIGNING_KEY_CUSTODY.md` runbook สำหรับดูแลกุญแจเซ็นชื่อ updater / a runbook for
  updater signing-key custody

#### Wave 2 — Living-room readiness (`docs/plans/W2_LIVING_ROOM_PLAN.md`)

- ไอคอน tray พร้อมสถานะ DIAL (starting/ready/degraded/disabled) / a tray icon showing DIAL status
  (starting/ready/degraded/disabled)
- ตัวช่วยติดตั้งครั้งแรก (first-run setup wizard) ที่ตรวจโปรไฟล์เครือข่ายและสถานะ DIAL / a first-run
  setup wizard that checks the network profile and DIAL status
- หน้าต่างสถานะเมื่อออฟไลน์ตอนเปิดแอป หรือเมื่อ YouTube surface ถูกบล็อก/redirect / a status window for
  offline-at-startup or blocked/redirected YouTube surfaces

#### Wave 3 — Controls (`docs/plans/W3_CONTROLS_PLAN.md`)

- รองรับ game controller (Gamepad API แปลงเป็น Leanback key events) พร้อมคีย์ลัดคีย์บอร์ดเพิ่มเติม
  (Ctrl+O, F11, Shift+Enter, ปุ่มขวาถอยกลับ, +/−/M ปรับเสียง, C คำบรรยาย, Ctrl+Shift+C คัดลอกลิงก์) /
  game controller support (Gamepad API mapped to Leanback key events) plus extra keyboard shortcuts
  (Ctrl+O, F11, Shift+Enter, right-click back, +/−/M volume, C captions, Ctrl+Shift+C copy link)
- หน้าต่างตั้งค่าแบบ native (ภาษา, ชื่อ DIAL, fullscreen, keep-on-top, pause-on-blur, controller) / a
  native settings window (language, DIAL name, fullscreen, keep-on-top, pause-on-blur, controller)
- เปิดวิดีโอจากบรรทัดคำสั่ง (CLI) และ deep link ระหว่าง instance ที่กำลังรันอยู่ / opening a video from
  the command line, and deep-linking into an already-running instance
- pause-on-blur (หยุดเล่นเมื่อหน้าต่างเสียโฟกัส) / pause-on-blur (pauses playback when the window loses
  focus)

#### Wave 4 — Playback and handheld (`docs/plans/W4_PLAYBACK_PLAN.md`)

- ตัวจับเวลาปิดเล่นอัตโนมัติ (sleep timer) พร้อม OSD ในหน้า / a sleep timer with an in-page OSD
- ตัวกรอง codec (ปฏิเสธ VP8/VP9/AV1 เมื่อเลือกโหมด H.264) / a codec filter (rejects VP8/VP9/AV1 when
  H.264 mode is selected)
- สวิตช์เปิด/ปิดการถอดรหัสด้วยฮาร์ดแวร์ (มีผลหลังเปิดแอปใหม่) / a hardware-decoding toggle (takes effect
  after restart)
- overlay ควบคุมด้วยการสัมผัสหน้าจอสำหรับอุปกรณ์ handheld ที่มี touch / a touch-control overlay for
  touch-capable handheld devices
- โหมด mini-player (หน้าต่างเล็กมุมจอ อยู่บนสุด ไม่มีขอบ) / mini-player mode (a small, borderless,
  always-on-top corner window)
- release matrix ARM64 แบบ experimental (`continue-on-error`) และ template manifest สำหรับ winget / an
  experimental ARM64 release matrix (`continue-on-error`) and winget manifest templates

#### Wave 5 — Desktop integration and launcher (`docs/plans/W5_DESKTOP_PLAN.md`, merge แล้วผ่าน PR #8 / merged via PR #8)

- วงจรชีวิตของ Studio launcher ผ่าน CLI (`--lifecycle launch|focus|close`) และไฟล์สถานะ
  `lifecycle.json` / a Studio launcher lifecycle via the CLI (`--lifecycle launch|focus|close`) and a
  `lifecycle.json` state file
- จำตำแหน่ง/ขนาดหน้าต่าง media ข้ามการเปิดแอป (`windowBounds`) / remembering the media window's
  position/size across app launches (`windowBounds`)
- ตัวเลือก "เริ่มพร้อม Windows" ผ่าน registry Run key ของผู้ใช้เอง / a "start with Windows" option via
  the user's own registry Run key
- ลองเชื่อมต่อใหม่อัตโนมัติเมื่อออฟไลน์ตอนเปิดแอป พร้อมตัวนับถอยหลังบนหน้าสถานะ / automatic offline
  retry on app startup, with a countdown shown on the status page
- สแนปช็อตข้อมูลวินิจฉัยพร้อมปุ่มคัดลอกในหน้าตั้งค่า / a diagnostics snapshot with a copy button in the
  settings window
- ชื่อวิดีโอที่กำลังเล่นแสดงในหัวหน้าต่างและ tooltip ของ tray / the now-playing title shown in the
  window title and tray tooltip
- คีย์ลัดปรับความเร็วเล่น (Shift+, / Shift+.) พร้อม OSD / playback-speed keyboard shortcuts (Shift+, /
  Shift+.) with an OSD
- overlay ช่วยเหลือแสดงผังคีย์บอร์ด/คอนโทรลเลอร์สองภาษา (กด ? หรือ F1) / a help overlay showing the
  bilingual keyboard/controller layout (press ? or F1)
- ไฟล์ support ของ repository: issue templates, PR template, `SECURITY.md`, `CHANGELOG.md` (ไฟล์นี้),
  `docs/runbooks/RELEASE_CHECKLIST.md` / repository support files: the issue templates, the PR
  template, `SECURITY.md`, `CHANGELOG.md` (this file), and `docs/runbooks/RELEASE_CHECKLIST.md`

#### Wave 6 — Living-room polish and QA (`docs/plans/W6_POLISH_PLAN.md`)

- CI job `smoke` (windows-latest, `continue-on-error: true` จนกว่า human gate H20 จะยืนยันเสถียร 2 รอบ)
  build debug binary แล้วตรวจ `--version` และวงจร `--lifecycle close` จริงผ่านไฟล์ `lifecycle.json` / a
  `smoke` CI job (windows-latest, `continue-on-error: true` until human gate H20 confirms two stable
  runs) that builds the debug binary and verifies `--version` and a real `--lifecycle close` round
  trip against `lifecycle.json`
- `scripts/lifecycle-driver.ps1` และ `scripts/README.md`: สคริปต์ขับวงจรชีวิต Studio launcher
  (`launch`/`focus`/`close`) แบบอ่านไฟล์สถานะอย่างเดียว สำหรับ human gate H13 / `scripts/lifecycle-driver.ps1`
  and `scripts/README.md`: a read-only Studio launcher lifecycle driver script (`launch`/`focus`/`close`)
  for human gate H13
- release notes ของ GitHub Release ดึงมาจากส่วน `## [<version>]` ของ `CHANGELOG.md` โดยตรง (พร้อม
  fallback ถ้าไม่พบส่วนนั้น) / GitHub Release notes are now extracted directly from the `## [<version>]`
  section of `CHANGELOG.md` (with a fallback when that section is missing)

#### Wave 7 — Deep link and DIAL hardening (`docs/plans/W7_DEEPLINK_PLAN.md`)

- `lalin-cast://` URL scheme (`lalin-cast://watch?v=<id>` และ `lalin-cast://playlist?list=<id>`) ผ่าน
  crate `tauri-plugin-deep-link` ที่ผู้ก่อตั้งอนุมัติ ตรวจ id เดิมเหมือนลิงก์ https และแปลงเป็น
  `DeepLink` เดิมก่อนใช้งานเสมอ / the `lalin-cast://` URL scheme
  (`lalin-cast://watch?v=<id>` and `lalin-cast://playlist?list=<id>`) via the founder-approved
  `tauri-plugin-deep-link` crate, validated with the existing id checks and always converted to the
  existing `DeepLink` before use, the same as an https link
- ตัวเลือกเปิด/ปิด (`deepLinkScheme`, ปิดเป็นค่าเริ่มต้น) ในหน้าตั้งค่า สำหรับจดทะเบียน/ยกเลิก scheme
  `lalin-cast://` แบบ opt-in / an opt-in toggle (`deepLinkScheme`, off by default) in the settings
  window to register or unregister the `lalin-cast://` scheme

### Changed

#### Wave 2 — Living-room readiness (`docs/plans/W2_LIVING_ROOM_PLAN.md`)

- Updater: กันการกดตรวจสอบอัปเดตซ้ำ และ refresh สถานะของหน้าต่างที่เปิดอยู่แล้ว / the updater now
  guards against duplicate checks and refreshes the state of windows already open
- `dialFriendlyName` อ่านค่าใหม่ทันทีเมื่อมีการ rebind DIAL / `dialFriendlyName` is re-read immediately
  on a DIAL rebind

#### Wave 3 — Controls (`docs/plans/W3_CONTROLS_PLAN.md`)

- ลบคำสั่ง `dial_get_info` ที่ไม่มี permission หรือผู้เรียกใช้งานจริง / removed the unused
  `dial_get_info` command, which had no permission grant or real caller

#### Wave 4 — Playback and handheld (`docs/plans/W4_PLAYBACK_PLAN.md`)

- หน้าตั้งค่า refresh สถานะ DIAL และตัวนับถอยหลังทุก 5 วินาที ผ่าน `settings_get` / the settings window
  now refreshes DIAL status and countdowns every 5 seconds via `settings_get`

#### Wave 7 — Deep link and DIAL hardening (`docs/plans/W7_DEEPLINK_PLAN.md`)

- **การเปลี่ยนพฤติกรรมของ DIAL discovery:** `is_dial_search` ตรวจ header `MAN` ของคำขอ SSDP M-SEARCH
  เข้มขึ้น ต้องมีค่าเทียบเท่า `ssdp:discover` (มีหรือไม่มีเครื่องหมายคำพูดคู่ก็ได้ case-insensitive)
  ควบคู่กับ `ST` เดิม มิฉะนั้นจะถูกทิ้ง — ผู้ที่อัปเกรดควรยืนยัน human gate H22 (การค้นหาจาก YouTube app
  บนมือถือ) ก่อน tag เวอร์ชันถัดไป / **DIAL discovery behavior change:** `is_dial_search` now enforces
  a stricter check on the SSDP M-SEARCH `MAN` header — it must equal `ssdp:discover` (with or without
  surrounding double quotes, case-insensitive) alongside the existing `ST` check, or the datagram is
  dropped; anyone upgrading should confirm human gate H22 (mobile YouTube app discovery) before the
  next tag

### Security

#### H0 — Release readiness (`docs/plans/H0_RELEASE_READINESS_PLAN.md`)

- จำกัด Tauri capabilities ของแต่ละหน้าต่างให้เหลือเฉพาะ command/permission ที่ใช้จริง / trimmed each
  window's Tauri capabilities down to only the commands/permissions actually used
- ปักหมุด SHA ของ GitHub Actions ทุกตัวใน CI แทนการอ้าง tag ลอย / pinned every GitHub Action in CI to a
  commit SHA instead of a floating tag
- เพิ่ม `cargo-deny` ตรวจสัญญาอนุญาต/advisory/bans/sources ของ dependency ทุกครั้งที่มีการเปลี่ยนแปลง /
  added `cargo-deny` to check dependency licenses/advisories/bans/sources on every change
- แก้ RUSTSEC-2026-0285 โดยอัปเกรด rustls 0.23.44 -> 0.23.45 / fixed RUSTSEC-2026-0285 by upgrading
  rustls 0.23.44 -> 0.23.45

#### Wave 5 — Desktop integration and launcher (`docs/plans/W5_DESKTOP_PLAN.md`, merge แล้วผ่าน PR #8 / merged via PR #8)

- `reg.exe` (สำหรับ start-with-Windows) ถูกเรียกด้วย argument คงที่จาก pure function เท่านั้น — ไม่มี
  PowerShell, ไม่มี `unsafe` ใหม่, ไม่มี `windows-sys` feature ใหม่ / `reg.exe` (for start-with-Windows)
  is invoked with fixed arguments built by a pure function only — no PowerShell, no new `unsafe`, no
  new `windows-sys` feature
- ไฟล์ `lifecycle.json` และข้อมูลวินิจฉัยไม่มี URL, deep link, TV pairing code หรือ device id ปรากฏอยู่
  / the `lifecycle.json` state file and the diagnostics snapshot never contain a URL, deep link, TV
  pairing code, or device id
- event `lalin-cast-media` (ชื่อวิดีโอที่กำลังเล่น) ถูก validate และจำกัดอัตรา (rate-limited) ฝั่ง Rust
  ก่อนนำไปใช้ / the `lalin-cast-media` event (now-playing title) is validated and rate-limited on the
  Rust side before use
- capability ระยะไกล (`src-tauri/capabilities/default.json`) ไม่เปลี่ยนแปลงตลอดทั้ง wave 5 / the
  remote capability (`src-tauri/capabilities/default.json`) is unchanged throughout wave 5

#### Wave 6 — Living-room polish and QA (`docs/plans/W6_POLISH_PLAN.md`)

- ทุก step ของ CI smoke job และ release-notes extraction เป็น pwsh ที่มี argument คงที่ ไม่มี secret ใด
  ถูกพิมพ์ลง log / every step of the CI smoke job and the release-notes extraction is pwsh with fixed
  arguments; no secret is ever printed to the log
- `scripts/lifecycle-driver.ps1` อ่าน `lifecycle.json` อย่างเดียว ไม่เขียนหรือแก้ไขไฟล์ใด ๆ / `scripts/lifecycle-driver.ps1`
  only reads `lifecycle.json` — it never writes to or modifies any file

#### Wave 7 — Deep link and DIAL hardening (`docs/plans/W7_DEEPLINK_PLAN.md`)

- การจดทะเบียน `lalin-cast://` เป็น opt-in เสมอ (ปิดเป็นค่าเริ่มต้น) และเขียนเฉพาะ
  `HKCU\Software\Classes\lalin-cast` ของบัญชีผู้ใช้ปัจจุบัน — ไม่ใช้สิทธิ์ผู้ดูแลระบบ ไม่แตะ
  `HKLM` / registering `lalin-cast://` is always opt-in (off by default) and writes only to the
  current user's `HKCU\Software\Classes\lalin-cast` — no administrator rights, no `HKLM` touched
- ไม่มีหน้าต่างใด (รวมถึงหน้ารีโมท `youtube.com`) ได้รับ permission ของปลั๊กอิน deep-link — capability
  `src-tauri/capabilities/default.json` ไม่เปลี่ยนแปลง และการจด/ยกเลิก/ตรวจ scheme ทำผ่าน
  `settings_get`/`settings_set` ฝั่ง Rust เท่านั้น / no window (including the remote `youtube.com`
  page) is granted any deep-link plugin permission — the
  `src-tauri/capabilities/default.json` capability is unchanged, and registering, unregistering, or
  checking the scheme happens only through the Rust-side `settings_get`/`settings_set` commands
