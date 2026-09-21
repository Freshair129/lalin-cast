# scripts/

สคริปต์ช่วยงาน repo ของ Lalin Cast — ไม่มีสคริปต์ใดถูกใช้โดยตัวแอปเอง (ทั้งหมดเป็นเครื่องมือสำหรับคน/CI
ที่ต้องการขับ `lalin-cast.exe` หรือ CI เอง) / Repository helper scripts for Lalin Cast — none of these
run inside the shipped app itself; they are tools for a human or CI to drive `lalin-cast.exe`, or for
CI itself.

## `lifecycle-driver.ps1`

ขับวงจรชีวิต `--lifecycle launch|focus|close --request-id <id>` ของ `lalin-cast.exe` แล้วรอผลจากไฟล์
สถานะ `%LOCALAPPDATA%\ai.lalin.cast\lifecycle.json` (ดูสัญญาเต็มที่
[`docs/architecture/CAST_LAUNCHER_IPC.md`](../docs/architecture/CAST_LAUNCHER_IPC.md)) / Drives
`lalin-cast.exe`'s `--lifecycle launch|focus|close --request-id <id>` contract and waits for the
outcome via the `%LOCALAPPDATA%\ai.lalin.cast\lifecycle.json` state file (see the full contract at
[`docs/architecture/CAST_LAUNCHER_IPC.md`](../docs/architecture/CAST_LAUNCHER_IPC.md)).

สคริปต์นี้**อ่านไฟล์สถานะเท่านั้น** — ไม่เขียน ไม่ลบ `lifecycle.json` หรือไฟล์อื่นใด การกระทำเดียวที่มัน
สั่งกับระบบคือเรียก `lalin-cast.exe` ด้วย argument คงที่ (`--lifecycle`, ค่าที่ผ่าน `-Command`,
`--request-id`, ค่าที่ผ่าน validation แล้ว) ผ่าน `Start-Process` / This script **only reads** the
state file — it never writes to or deletes `lifecycle.json` or any other file. The one thing it does
to the system is invoke `lalin-cast.exe` with a fixed argument list (`--lifecycle`, the value from
`-Command`, `--request-id`, an already-validated value) via `Start-Process`.

### พารามิเตอร์ / Parameters

| พารามิเตอร์ / Parameter | บังคับ / Required | ค่าเริ่มต้น / Default | คำอธิบาย / Description |
|---|---|---|---|
| `-Command` | ใช่ / Yes | — | `launch`, `focus`, หรือ `close` เท่านั้น (`ValidateSet`) / one of `launch`, `focus`, `close` only (`ValidateSet`) |
| `-RequestId` | ไม่ / No | token สุ่มที่สร้างเอง รูปแบบ `driver-<12 ตัวอักษร>` / a generated `driver-<12 chars>` token | ต้องตรง `[A-Za-z0-9_.-]{1,64}` — ค่าเดียวกับที่ `lalin-cast.exe` เองตรวจสอบ / must match `[A-Za-z0-9_.-]{1,64}` — the same class `lalin-cast.exe` itself validates |
| `-ExePath` | ใช่ / Yes | — | พาธเต็มไปยัง `lalin-cast.exe` / full path to `lalin-cast.exe` |
| `-TimeoutSeconds` | ไม่ / No | `10` | เวลาสูงสุดที่จะ poll ไฟล์สถานะก่อนยอมแพ้ / how long to poll the state file before giving up |

### รหัสออก / Exit codes

| รหัส / Code | ความหมาย / Meaning |
|---|---|
| `0` | `lifecycle.json` ถึงสถานะ `ready` หรือ `stopped` สำหรับ `requestId` นี้ / `lifecycle.json` reached `ready` or `stopped` for this `requestId` |
| `1` | `lifecycle.json` ถึงสถานะ `failed` / `lifecycle.json` reached `failed` |
| `2` | หมดเวลาก่อนเจอสถานะปลายทาง (หรือหา `-ExePath` ไม่เจอ) / timed out before a terminal state appeared (or `-ExePath` was not found) |

### ตัวอย่าง / Example

```powershell
./scripts/lifecycle-driver.ps1 -Command launch -ExePath "C:\Program Files\Lalin Cast\lalin-cast.exe"
./scripts/lifecycle-driver.ps1 -Command close -ExePath "C:\Program Files\Lalin Cast\lalin-cast.exe" -TimeoutSeconds 30
```

สคริปต์พิมพ์ระเบียน `lifecycle.json` ที่พบ (หรือระเบียนล่าสุดถ้าหมดเวลา) ออกทาง stdout เสมอ เพื่อให้
ดูได้ทั้งตอนสำเร็จและตอนล้มเหลว / The script always prints the `lifecycle.json` record it found (or
the last-known one on timeout) to stdout, so it is visible on both success and failure.

### human gate H13

สคริปต์นี้คือหลักฐานฝั่งไดรเวอร์จริงสำหรับ human gate H13 (`docs/plans/W5_DESKTOP_PLAN.md`) — รันด้วย
`lalin-cast.exe` ที่ build จริงบนเครื่อง Windows แล้วยืนยันว่า `launch`/`focus`/`close` ทั้งสามคำสั่งจบ
ด้วยรหัสออก `0` ตามลำดับที่คาดไว้ ก่อนปิด gate / This script is the real driver-side evidence for
human gate H13 (`docs/plans/W5_DESKTOP_PLAN.md`) — run it against a real Windows build of
`lalin-cast.exe` and confirm `launch`/`focus`/`close` each end with exit code `0` in the expected
order before closing the gate.

## `check-notices.mjs`

**ภาษาไทย:** ตรวจว่าตาราง package ใน `THIRD_PARTY_NOTICES.md` ตรงกับ `src-tauri/Cargo.lock` แบบสองทาง
รันด้วย `node scripts/check-notices.mjs` จากรากของ repository ไม่ต้องติดตั้งอะไรเพิ่ม ออกด้วยรหัส 1 พร้อม
รายการที่ขาดในแต่ละทิศเมื่อไม่ตรง และรหัส 0 พร้อมจำนวนรายการเมื่อตรงกัน รับ argument สองตัวเป็น path ของ
lock และ notices ได้ (ใช้ตอนทดสอบกับไฟล์สำเนา) CI รัน job `notices` ด้วยคำสั่งนี้แบบ blocking ตั้งแต่ wave 9

**English:** Compares the package table in `THIRD_PARTY_NOTICES.md` against `src-tauri/Cargo.lock` in
both directions. Run `node scripts/check-notices.mjs` from the repository root; it needs no
dependencies. It exits 1 and prints what is missing on each side when they disagree, and exits 0 with
the entry count when they agree. Two optional arguments override the lock and notices paths, which is
how the negative case is exercised against throwaway copies. CI runs it as the blocking `notices` job
from wave 9 onward.

## CI smoke job

`.github/workflows/ci.yml`'s `smoke` job (wave 6 U4) exercises the same `--version` and
`--lifecycle close --request-id ci-smoke` contract this script drives, directly on a `windows-latest`
runner, without going through this script — it is a blocking check since human gate H20
confirms two stable runs. See that job's comments for why.

## `release/`

**ภาษาไทย:** สคริปต์ปล่อยรุ่น (release) ที่ `release-dryrun.yml` และ `release.yml` เรียกร่วมกัน (Wave 12,
`docs/plans/W12_RELEASE_ASSETS_PLAN.md`) เพื่อให้ dry run พิสูจน์โค้ดชุดเดียวกับที่ release ใช้จริง แทนที่
จะมี logic สองชุดแยกกันที่ค่อย ๆ ห่างกัน ทุกสคริปต์เป็น `pwsh` (PowerShell 7), `Set-StrictMode -Version
Latest`, `$ErrorActionPreference = 'Stop'`, ไม่มี module ภายนอก, ไม่รับ path จาก environment โดยปริยาย (ทุก
อย่างเป็นพารามิเตอร์), ล้มด้วย `throw` ข้อความที่บอกวิธีแก้, และพิมพ์ `OK: ...` เมื่อผ่าน

**English:** The release scripts that `release-dryrun.yml` and `release.yml` both call (Wave 12,
`docs/plans/W12_RELEASE_ASSETS_PLAN.md`), so the dry run exercises exactly the code the real release
runs instead of two copies of the same logic slowly drifting apart. Every script is `pwsh`
(PowerShell 7), uses `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'`, has no
external module dependency, takes no path implicitly from the environment (everything is a
parameter), fails with a `throw` whose message says how to fix it, and prints `OK: ...` lines on
success.

| สคริปต์ / Script | หน้าที่ / Purpose |
|---|---|
| `Test-ReleaseVersion.ps1` | ล้มก่อน build ถ้า `-Tag` ไม่ตรงกับเวอร์ชันของแอป (`tauri.conf.json`'s `version`, ถ้าไม่มีใช้ `Cargo.toml`'s `[package].version`) หรือ CHANGELOG ไม่มีหัวข้อของเวอร์ชันนั้น (`-SkipChangelog` ใช้เฉพาะ dry run) / Fails before any build if `-Tag` does not match the app version (`tauri.conf.json`'s `version`, falling back to `Cargo.toml`'s `[package].version`) or CHANGELOG.md has no populated section for it (`-SkipChangelog` is dry-run only) |
| `Test-InstallerScheme.ps1` | ตรวจ `installer.nsi` ที่ render แล้วใต้ `-SearchRoot` แบบ fail-closed ว่าไม่มี `Classes\lalin-cast` (ย้ายมาจาก wave 10 โดยไม่ผ่อน) / Fail-closed check that no rendered `installer.nsi` under `-SearchRoot` self-registers `Classes\lalin-cast` (moved from wave 10 without loosening) |
| `New-PortableZip.ps1` | สร้าง `Lalin-Cast_<Version>_<Arch>_portable.zip` (exe + `lalin-cast.portable` ว่าง + README) แล้วเปิดซ้ำเพื่อตรวจว่ามีครบสามไฟล์เท่านั้น / Builds `Lalin-Cast_<Version>_<Arch>_portable.zip` (the exe, an empty `lalin-cast.portable`, and the README) and re-opens it to verify it holds exactly those three files |
| `Write-Checksums.ps1` | เขียน checksum manifest รูปแบบ `sha256sum` (hex ตัวเล็ก, สองช่องว่าง, ชื่อไฟล์อย่างเดียว, เรียงชื่อ, จบด้วย LF) / Writes a `sha256sum`-format checksum manifest (lower-case hex, two spaces, bare file name, sorted, LF-terminated) |
| `Publish-ReleaseAssets.ps1` | แนบไฟล์กับ release ด้วย `gh release upload <Tag> ... --clobber`; `-WhatIf` แสดงรายการไฟล์และขนาดโดยไม่เรียก `gh` เลย / Attaches files to the release via `gh release upload <Tag> ... --clobber`; `-WhatIf` lists the files and their sizes without ever calling `gh` |

### `selftest.ps1`

**ภาษาไทย:** รันสคริปต์ทั้งห้าตัวข้างต้นกับ fixture ใน `release/fixtures/` (ไฟล์ข้อความเล็ก ๆ เท่านั้น
ไม่มี binary) ครอบทั้งกรณีผ่านและกรณีที่ต้องล้มจริง ไม่แตะเครือข่ายหรือเรียก `gh` จริง (ใช้ shim บน `PATH`
ตรวจว่า `-WhatIf` ไม่เรียก `gh`) `exit 0` เมื่อทุกกรณีผ่าน หรือ `exit 1` พร้อมสรุปกรณีที่ล้มเมื่อไม่ผ่าน CI
รัน `pwsh scripts/release/selftest.ps1` เป็น job `release-scripts` แบบ blocking ทุก PR ที่แตะ
`scripts/release/**`

**English:** Runs all five scripts above against the fixtures in `release/fixtures/` (small text files
only — no binaries), covering both pass and genuine-throw fail cases, without touching the network or
calling a real `gh` (a shim on `PATH` proves `-WhatIf` never calls it). Exits 0 when every case
behaves as expected, or 1 with a summary of what failed otherwise. CI runs
`pwsh scripts/release/selftest.ps1` as the blocking `release-scripts` job on every PR touching
`scripts/release/**`.

```powershell
pwsh scripts/release/selftest.ps1
```
