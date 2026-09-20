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

## CI smoke job

`.github/workflows/ci.yml`'s `smoke` job (wave 6 U4) exercises the same `--version` and
`--lifecycle close --request-id ci-smoke` contract this script drives, directly on a `windows-latest`
runner, without going through this script — it is `continue-on-error: true` until human gate H20
confirms two stable runs. See that job's comments for why.
