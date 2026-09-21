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

#### H1 — License (`docs/LICENSE_DECISION.md`)

- ซอร์สโค้ดของ Lalin Cast เผยแพร่ภายใต้ Apache License 2.0 (ไฟล์ `LICENSE` ที่ root และ
  `license = "Apache-2.0"` ใน `src-tauri/Cargo.toml`) / Lalin Cast's own source code is licensed
  under the Apache License 2.0 (root `LICENSE` file and `license = "Apache-2.0"` in
  `src-tauri/Cargo.toml`)

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

#### Wave 8 — Client-side boundary (`docs/plans/W8_BOUNDARY_PLAN.md`)

- ตัวเลือก "กันจอดับ" (`keepDisplayAwake`, เปิดเป็นค่าเริ่มต้น) ที่กันจอดับ/เครื่องหลับเฉพาะขณะกำลังเล่น
  วิดีโอจริง โดยอิงสถานะจาก event `lalin-cast-media` เดิม / a "keep display awake" toggle
  (`keepDisplayAwake`, on by default) that prevents the display/system from sleeping only while a
  video is actually playing, driven by the existing `lalin-cast-media` event
- ตัวเลือกซ่อนชั้น Shorts บนหน้าแรก (`hideShorts`, ปิดเป็นค่าเริ่มต้น) และซ่อนแท็บ Shorts ในแถบนำทาง
  (`hideGuideTabs`, ปิดเป็นค่าเริ่มต้น) ด้วย CSS/คลาสของ Lalin Cast เองเท่านั้น / an opt-in toggle to
  hide the Shorts shelf on the home page (`hideShorts`, off by default) and an opt-in toggle to hide
  the Shorts tab in the guide navigation (`hideGuideTabs`, off by default), both implemented purely
  with Lalin Cast's own CSS/classes

#### Wave 9 — Supportability and guardrails (`docs/plans/W9_SUPPORTABILITY_PLAN.md`)

- ไฟล์ log ในเครื่องแบบหมุนเวียน (`<app_local_data_dir>/logs/lalin-cast.log`) แทนที่จุด `eprintln!`
  ทั้ง 32 จุดที่หายไปเงียบ ๆ ใน release build (ไม่มี console เพราะ `windows_subsystem = "windows"`) —
  หมุนเวียนเมื่อเกิน 512 KiB เก็บไว้สูงสุดสองไฟล์ (เพดานรวมประมาณ 1 MiB) / a rotating local log file
  (`<app_local_data_dir>/logs/lalin-cast.log`) replacing all 32 `eprintln!` call sites that were
  silently lost in release builds (no console, because of `windows_subsystem = "windows"`) —
  rotates past 512 KiB, keeps at most two files (roughly a 1 MiB total ceiling)
- ปุ่มเปิดโฟลเดอร์ log ในหน้าตั้งค่า (กลุ่ม Updates/About) พร้อมหมายเหตุสองภาษาว่า log อยู่ในเครื่อง
  เท่านั้น ไม่ถูกส่งไปที่ใด / a button in the settings window (Updates/About group) that opens the log
  folder, with a bilingual note that the log stays local and is never sent anywhere
- บรรทัด `logFile:` ในสแนปช็อตข้อมูลวินิจฉัย (ชื่อไฟล์และขนาดเท่านั้น ไม่ใช่ path เต็ม) / a `logFile:`
  line in the diagnostics snapshot (filename and size only, never the full path)
- CI job `notices` (บังคับผ่าน, ไม่มี `continue-on-error`) พร้อมสคริปต์
  `scripts/check-notices.mjs` (Node ล้วน ไม่มี dependency) เทียบ `THIRD_PARTY_NOTICES.md` กับ
  `src-tauri/Cargo.lock` สองทางทุกครั้งที่มี pull request / a blocking `notices` CI job (no
  `continue-on-error`), backed by `scripts/check-notices.mjs` (plain Node, zero dependencies), that
  compares `THIRD_PARTY_NOTICES.md` against `src-tauri/Cargo.lock` in both directions on every pull
  request

#### Wave 10 — Release rehearsal (`docs/plans/W10_RELEASE_REHEARSAL_PLAN.md`)

- workflow ใหม่ `.github/workflows/release-dryrun.yml`: ซ้อม build ตัวติดตั้ง NSIS แบบไม่เซ็นชื่อผ่าน
  `tauri-apps/tauri-action` ที่ SHA เดียวกับ `.github/workflows/release.yml` ทุกครั้งที่ไฟล์ที่มีผลต่อการ
  bundle เปลี่ยน (`tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `icons/**`, `release.yml` เอง, และไฟล์
  dry-run เอง) — ไม่สร้างหรืออัปโหลด GitHub Release ใด ๆ และไม่ใช้ secret เลย / a new
  `.github/workflows/release-dryrun.yml` workflow that rehearses an unsigned NSIS installer build
  through the exact same `tauri-apps/tauri-action` SHA as `.github/workflows/release.yml`, on every
  change to a file that can affect the bundle (`tauri.conf.json`, `Cargo.toml`, `Cargo.lock`,
  `icons/**`, `release.yml` itself, and the dry-run file itself) — it creates or uploads no GitHub
  Release and uses no secret at all
- ตรวจสคริปต์ NSIS ที่ render แล้วแบบ fail-closed (ล้มถ้าหาไม่เจอ) และล้มถ้าพบ `Classes\lalin-cast` — ปิด
  ครึ่งหนึ่งของ H23 ด้วยการตรวจอัตโนมัติแทนการติดตั้งบนเครื่องจริงแล้วเปิด regedit / a fail-closed check
  (fails if none is found) of the rendered NSIS script, which also fails if it contains
  `Classes\lalin-cast` — closes half of H23 with an automated check instead of installing on a real
  machine and opening regedit
- fixture `scripts/fixtures/notices-mismatch/{Cargo.lock,THIRD_PARTY_NOTICES.md}` และ step ใหม่ในงาน
  `notices` ของ `ci.yml` ที่พิสูจน์ว่า `scripts/check-notices.mjs` ล้มจริงเมื่อไฟล์ทั้งสองไม่ตรงกัน (ปิด
  H27 ด้วยการพิสูจน์ซ้ำทุกครั้งบน CI แทนการรอ dependency bump ครั้งหน้า) / a
  `scripts/fixtures/notices-mismatch/{Cargo.lock,THIRD_PARTY_NOTICES.md}` fixture and a new step in
  `ci.yml`'s `notices` job that proves `scripts/check-notices.mjs` really fails when the two files
  disagree (closes H27 by proving it on every CI run instead of waiting for the next dependency bump)
- `sanitize_log_message` ปิดบังโฟลเดอร์ home ของผู้ใช้ก่อนกฎ path และให้กฎ path ปิดบัง path ใต้ home ทั้งก้อน
  รวมโฟลเดอร์ย่อยและชื่อไฟล์ ปิดบังชื่อบัญชี Windows เมื่อปรากฏเป็นคำเดี่ยวที่ยาวอย่างน้อย 3 ตัวอักษร และปิดบัง
  URL ทุก scheme — ขอบเขตที่เหลืออยู่ใน `PRIVACY.md` หัวข้อไฟล์ log / `sanitize_log_message` now masks the
  user's home folder before the path rule, and the path rule masks a path under home as a whole,
  sub-folders and file name included; masks the Windows account name where it appears as a whole word
  of at least 3 characters; and masks every URL scheme — the limits that remain are set out in
  `PRIVACY.md`'s log-file section

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

#### Wave 8 — Client-side boundary (`docs/plans/W8_BOUNDARY_PLAN.md`)

- **CI job `smoke` กลายเป็น check บังคับ:** human gate H20 ปิดแล้วหลังจากรันเขียวสองรอบติดกันใน PR #9
  และ PR #10 จึงลบ `continue-on-error: true` ออก — ตั้งแต่นี้ไปการรวม pull request ทุกครั้งต้องรอ job
  `smoke` ผ่านด้วย / **the CI `smoke` job is now a blocking check:** human gate H20 is closed after two
  consecutive green runs on PR #9 and PR #10, so `continue-on-error: true` has been removed — merging
  a pull request from here on requires the `smoke` job to pass

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

#### Wave 8 — Client-side boundary (`docs/plans/W8_BOUNDARY_PLAN.md`)

- **Lalin Cast ไม่ดัก อ่าน หรือแก้ไขทราฟฟิกหรือข้อมูลของเครือข่าย YouTube และจะไม่ทำเช่นนั้น:** ตัวเลือก
  ซ่อน Shorts/แท็บนำทาง (`hideShorts`, `hideGuideTabs`) ทำงานด้วยการอ่าน DOM ที่หน้าเว็บ render ออกมา
  แล้ว ติดคลาสของเราเอง แล้วซ่อนด้วย stylesheet ของเราเองเท่านั้น ไม่มีการห่อหรือแทนที่
  `XMLHttpRequest`/`window.fetch`/`Response`, ไม่มีการอ่านหรือเขียนทับ response ของ
  `/youtubei/v1/browse` หรือ `/youtubei/v1/guide`, ไม่มีการแก้ config JSON ของ YouTube และไม่มีการลบ
  node ออกจาก DOM ดูเหตุผลและเส้นแบ่งเต็มใน `docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`
  / **Lalin Cast does not intercept, read, or modify YouTube's network traffic or data, and never
  will:** the Shorts/guide-tab hiding toggles (`hideShorts`, `hideGuideTabs`) work only by reading the
  DOM as already rendered by the page, tagging matched elements with our own class, and hiding them
  with our own stylesheet — there is no wrapping or replacing of
  `XMLHttpRequest`/`window.fetch`/`Response`, no reading or rewriting of `/youtubei/v1/browse` or
  `/youtubei/v1/guide` responses, no modification of YouTube's config JSON, and no DOM node removal;
  see `docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md` for the full reasoning and
  boundary
- `keepDisplayAwake` เรียก Windows API (`SetThreadExecutionState`) เพื่อบอกระบบปฏิบัติการว่ายังใช้งาน
  อยู่เท่านั้น ไม่ส่งหรือบันทึกข้อมูลใด ๆ ออกจากเครื่อง / `keepDisplayAwake` calls the Windows
  `SetThreadExecutionState` API only to tell the operating system the app is still in active use — it
  sends or records no data anywhere

#### Wave 9 — Supportability and guardrails (`docs/plans/W9_SUPPORTABILITY_PLAN.md`)

- ทุกบรรทัดที่เขียนลงไฟล์ log ผ่าน `sanitize_log_message` เสมอ ไม่มีเส้นทางที่ข้ามได้: URL สาม scheme
  (`http://`, `https://`, `lalin-cast://`) และ path ของ Windows สองรูปแบบถูกแทนที่ด้วย `<url>`/`<path>`
  โดยปิดบังถึงช่องว่างถัดไปเท่านั้น, ตัวอักษรควบคุมกลายเป็นช่องว่าง, และตัดที่ 512 ตัวอักษร ส่วนรหัสจับคู่ทีวี,
  cookie และ token ไม่เคยถูกส่งเข้าฟังก์ชัน log เลยตั้งแต่ต้นทาง ซึ่งเป็นวินัยของจุดเรียก ไม่ใช่กฎใน sanitiser /
  every line written to the log file passes through `sanitize_log_message` with no bypass: the three
  URL schemes (`http://`, `https://`, `lalin-cast://`) and the two Windows path forms are replaced with
  `<url>`/`<path>`, each masked only as far as the next whitespace character; control characters become
  spaces; and the message is truncated to 512 characters. A TV pairing code, cookie or token is kept out
  by never being handed to a logging call in the first place — call-site discipline, not a sanitiser rule
- การเขียน log ที่ล้มเหลวเงียบเสมอ — ไม่ panic ไม่ block การเริ่มแอป / a failed log write is always
  silent — it never panics and never blocks app startup
- job `notices` ป้องกันไม่ให้ `THIRD_PARTY_NOTICES.md` หลุดจาก `Cargo.lock` แบบเงียบ ๆ อีกครั้ง (เหมือนที่
  เกิดตอน merge `tauri-plugin-store` 2.4.3 → 2.4.5 ใน PR #6 ซึ่งต้องตามแก้แยกใน PR #12) / the `notices`
  job prevents `THIRD_PARTY_NOTICES.md` from silently drifting out of sync with `Cargo.lock` again
  (as happened when `tauri-plugin-store` 2.4.3 → 2.4.5 merged in PR #6 and had to be fixed after the
  fact in PR #12)

#### Wave 10 — Release rehearsal (`docs/plans/W10_RELEASE_REHEARSAL_PLAN.md`)

- `.github/workflows/release-dryrun.yml` ไม่อ้าง secret ใดเลย (ไม่มี
  `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY` หรือ secret อื่น) เพราะปิด `bundle.createUpdaterArtifacts`
  ด้วย `--config` override ของ `tauri-action` เอง / `.github/workflows/release-dryrun.yml` references
  no secret at all (no `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY` or any other secret) because it turns
  off `bundle.createUpdaterArtifacts` via `tauri-action`'s own `--config` override
- ตรวจสคริปต์ NSIS ที่ render แล้วแบบ fail-closed: ถ้าไม่พบ `installer.nsi` เลย job จะ fail ทันที
  แทนที่จะผ่านแบบไม่ได้ตรวจอะไร / the rendered NSIS script check is fail-closed: if no
  `installer.nsi` is found at all, the job fails immediately instead of passing having checked
  nothing
- `sanitize_log_message` ปิดบังโฟลเดอร์ home ของผู้ใช้ (ทั้งรูปแบบ `\` และ `/`, ไม่สนตัวพิมพ์ ASCII) ก่อนกฎ path
  และกฎ path ปิดบัง path ใต้ home ทั้งก้อน จึงปิดข้อจำกัดของ wave 9 ที่ path ใต้ home ซึ่งชื่อบัญชีมีช่องว่าง
  อาจเผยชื่อบัญชีได้ ชื่อบัญชีถูกปิดบังเมื่อเป็นคำเดี่ยวที่ยาวอย่างน้อย 3 ตัวอักษรเท่านั้น / `sanitize_log_message`
  now masks the current user's home folder (both `\` and `/` forms, ASCII case-insensitive) before the
  path rule, and the path rule masks a path under home as a whole, closing wave 9's limitation that a
  home path whose account name contains a space could reveal that name; the account name itself is
  masked only as a whole word of at least 3 characters

#### Wave 11 — Portable mode (`docs/plans/W11_PORTABLE_PLAN.md`)

- โหมดพกพา: ไฟล์ marker ชื่อ `lalin-cast.portable` ข้าง `lalin-cast.exe` ทำให้ทุกอย่างที่แอปเขียนเอง
  (settings store, log, `lifecycle.json`, โปรไฟล์ WebView2) ย้ายไปอยู่ในโฟลเดอร์ `lalin-cast-data`
  ข้าง exe แทน `%APPDATA%`/`%LOCALAPPDATA%\ai.lalin.cast`; **โหมด installed ไม่เปลี่ยนพฤติกรรมแม้แต่
  path เดียว** / portable mode: a `lalin-cast.portable` marker file beside `lalin-cast.exe` moves
  every piece of data the app itself writes (the settings store, logs, `lifecycle.json`, the WebView2
  profile) into a `lalin-cast-data` folder beside the exe instead of
  `%APPDATA%`/`%LOCALAPPDATA%\ai.lalin.cast`; **installed mode's behavior does not change by even one
  path**
- โหมดพกพาไม่สร้าง ไม่ลบ และไม่แก้ Run key หรือการจดทะเบียน `lalin-cast://` เลย (แม้แต่ตอนปิดตัวเลือก
  เพราะรายการที่มีอยู่อาจเป็นของตัวที่ติดตั้งไว้บนเครื่องเดียวกัน) และปฏิเสธการเปิดตัวเลือกทั้งสองนี้ในชั้น Rust
  ไม่ใช่แค่ซ่อนปุ่มใน UI; การติดตั้งอัปเดตทับ (in-place updater) ถูกปิดเช่นกัน เพราะ NSIS installer
  ติดตั้งลงโฟลเดอร์ติดตั้งของตัวเอง ไม่ใช่ทับโฟลเดอร์ข้าง exe แบบพกพา / portable mode never creates,
  deletes or changes the Run key or the `lalin-cast://` registration (not even when a toggle is
  turned off, since an existing entry may belong to an installed copy on the same machine) and refuses
  to turn either toggle on at the Rust layer, not only by hiding the UI control; the in-place updater
  is disabled too, since the NSIS installer installs into its own install folder, not over the
  portable folder beside the exe
- แถบข้อความในหน้า settings และ update เมื่อ `portable === true` อธิบายโหมดพกพาและ disable ตัวเลือกที่ปิด
  ไว้ พร้อมเหตุผลสั้น ๆ (ไทยก่อนอังกฤษตาม) / a banner on the settings and update pages, shown when
  `portable === true`, explains portable mode and disables the toggles that are turned off, with a
  short reason (Thai first, English follows)
- CI job `smoke` เพิ่มการรัน exe จริงในโหมดพกพา พิสูจน์ว่า `lifecycle.json` ไปอยู่ใต้ `lalin-cast-data`
  ข้าง exe จริง และไฟล์ `lifecycle.json` เดิมใน `%LOCALAPPDATA%\ai.lalin.cast` ของขั้นตอน installed-mode
  ก่อนหน้าไม่ถูกแตะเลย (ทั้ง `requestId` และ `LastWriteTimeUtc`) / the `smoke` CI job now runs the real
  exe in portable mode, proving `lifecycle.json` really lands under `lalin-cast-data` beside the exe,
  and that the earlier installed-mode step's `lifecycle.json` in
  `%LOCALAPPDATA%\ai.lalin.cast` is left completely untouched (both its `requestId` and its
  `LastWriteTimeUtc`)
- `.github/workflows/release-dryrun.yml` ผลิต zip พกพาที่ไม่ได้เซ็นชื่อ (`lalin-cast.exe` + marker ว่าง
  + `packaging/portable/README-PORTABLE.txt`) เป็น artifact `lalin-cast-dryrun-portable` เก็บ 7 วัน
  พร้อมขนาดไฟล์ในสรุปงาน และเพิ่มขา ARM64 แบบ `continue-on-error` (`aarch64-pc-windows-msvc`) ที่รัน
  การตรวจ `installer.nsi` แบบ fail-closed เดียวกันและไม่ทำให้ขา x64 หยุดทำงาน — ไม่อ้าง secret ใดเลย และ
  ไม่แตะ `.github/workflows/release.yml` / `.github/workflows/release-dryrun.yml` now produces an
  unsigned portable zip (`lalin-cast.exe` + an empty marker + `packaging/portable/README-PORTABLE.txt`)
  as the `lalin-cast-dryrun-portable` artifact, retained 7 days with its size in the job summary, and
  adds a `continue-on-error` ARM64 leg (`aarch64-pc-windows-msvc`) that runs the same fail-closed
  `installer.nsi` check and never stops the x64 leg -- it references no secret at all and never
  touches `.github/workflows/release.yml`
- `packaging/portable/README-PORTABLE.txt` (ไทย+อังกฤษ): วิธีใช้, ต้องมี WebView2 runtime, โฟลเดอร์
  `lalin-cast-data` มี session YouTube ที่ล็อกอินอยู่ให้ถือเหมือนรหัสผ่าน, วิธีอัปเดต, และเตือนว่าเปิด
  พร้อมกับตัวติดตั้งไม่ได้ / `packaging/portable/README-PORTABLE.txt` (Thai + English): how to use it,
  the WebView2 runtime requirement, treating the `lalin-cast-data` folder's signed-in YouTube session
  like a password, how to update, and a warning against running it alongside an installed copy

#### Wave 12 — Release assets (`docs/plans/W12_RELEASE_ASSETS_PLAN.md`)

- ย้าย logic ของ dry run ไปเป็นสคริปต์ที่ใช้ร่วมกันใน `scripts/release/` (ตรวจ tag/เวอร์ชัน/CHANGELOG,
  ตรวจ scheme ของ installer แบบ fail-closed, สร้าง zip พกพา, สร้าง checksum SHA-256, อัปโหลด asset
  พร้อมโหมด `-WhatIf`) พร้อม self-test ที่รันบน CI ทุก PR ทำให้ dry run พิสูจน์โค้ดชุดเดียวกับที่
  `release.yml` จะใช้จริง / moved the dry run's inline logic into shared scripts under
  `scripts/release/` (tag/version/CHANGELOG check, a fail-closed installer-scheme check, portable-zip
  creation, SHA-256 checksum generation, and asset upload with a `-WhatIf` mode), each with a
  self-test that runs on CI for every pull request, so the dry run now proves the exact code
  `release.yml` will run
- guard เวอร์ชันใหม่ (`Test-ReleaseVersion.ps1`) เป็นสเต็ปแรกของ `release.yml` **ก่อน** เริ่ม build ใด ๆ
  ล้มทันทีถ้า tag ที่ push ไม่ตรงกับเวอร์ชันแอปเป๊ะ ๆ หรือ `CHANGELOG.md` ไม่มีหัวข้อ `## [x.y.z]` ของ
  เวอร์ชันนั้น (หรือหัวข้อว่างเปล่า) ปิดช่องโหว่ที่ `tagName: v__VERSION__` ของ `tauri-action` เคยอ่าน
  เวอร์ชันจาก `Cargo.toml` แทน tag ที่ push จริงอย่างเงียบ ๆ / a new version guard
  (`Test-ReleaseVersion.ps1`) runs as the very first step of `release.yml`, **before** any build
  starts, and fails immediately if the pushed tag does not exactly match the app version or
  `CHANGELOG.md` has no `## [x.y.z]` section for that version (or an empty one) — closing the gap
  where `tauri-action`'s `tagName: v__VERSION__` silently read the version from `Cargo.toml` instead
  of the tag actually pushed
- `release.yml` แนบ zip พกพาและไฟล์ checksum (`Lalin-Cast_<เวอร์ชัน>_<arch>_SHA256SUMS.txt`) เข้ากับ
  draft release จริงเป็นครั้งแรก ทั้งสองสถาปัตยกรรม (x64 และ ARM64) โดยไม่ลบหรือผ่อน step เดิมที่มีอยู่
  แล้วแม้แต่ตัวเดียว (การตรวจ updater secret, Rust checks, clippy, placeholder ของ H4,
  การดึง CHANGELOG, `max-parallel: 1`, `fail-fast: false`, `continue-on-error` ของ ARM64,
  `uploadUpdaterJson`) / `release.yml` now attaches the portable zip and a checksum file
  (`Lalin-Cast_<version>_<arch>_SHA256SUMS.txt`) to the real draft release for the first time, for
  both architectures (x64 and ARM64), without removing or loosening a single existing step (the
  updater-secret check, Rust checks, clippy, the H4 placeholder, the CHANGELOG extraction,
  `max-parallel: 1`, `fail-fast: false`, ARM64's `continue-on-error`, `uploadUpdaterJson`)
- `ci.yml` เพิ่มงาน `release-scripts` (blocking) ที่รัน self-test ของสคริปต์ release ทุกตัวบน
  `ubuntu-latest` / `ci.yml` gained a new blocking `release-scripts` job that runs the release
  scripts' self-test on `ubuntu-latest`
- อัปเดตเอกสาร: `docs/runbooks/RELEASE_CHECKLIST.md` (guard อัตโนมัติ, การตรวจ asset ทั้งสอง
  สถาปัตยกรรมหลัง tag, การตรวจ checksum ด้วย `Get-FileHash`, human gate H30), README (ส่วนดาวน์โหลด:
  installer เทียบกับ portable เทียบกับ ARM64, วิธีตรวจ checksum, ยังไม่เซ็น Authenticode จนกว่า H4 จะปิด),
  `docs/architecture/LALIN_CAST_UPDATER_SPEC.md` (zip พกพาไม่อยู่ใน `latest.json` และไม่รับอัปเดต
  อัตโนมัติ), `packaging/portable/README-PORTABLE.txt` (วิธีตรวจ zip กับไฟล์ SHA256SUMS) / updated
  documentation: `docs/runbooks/RELEASE_CHECKLIST.md` (the automated guard, checking both
  architectures' assets after tagging, verifying checksums with `Get-FileHash`, human gate H30), the
  README (a download section: installer vs. portable vs. ARM64, how to verify a checksum, not
  Authenticode-signed until H4 closes), `docs/architecture/LALIN_CAST_UPDATER_SPEC.md` (the portable
  zip is outside `latest.json` and receives no automatic updates), and
  `packaging/portable/README-PORTABLE.txt` (how to verify the zip against its SHA256SUMS file)
