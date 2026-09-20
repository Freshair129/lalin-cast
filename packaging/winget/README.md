# winget manifest templates — Lalin Cast

**สถานะ: template เท่านั้น ยังไม่ได้ส่ง PR ไป `microsoft/winget-pkgs`**

`PackageIdentifier: Lalin.LalinCast` ในไฟล์ทั้งสามเป็น **ข้อเสนอ** เท่านั้น ไม่ใช่การตัดสินใจ — รอการ
ตัดสินใจเรื่องชื่อโปรเจกต์ (human gate H1/H15 ตาม `docs/plans/W4_PLAYBACK_PLAN.md`) ฟิลด์ `License` ใน
`Lalin.LalinCast.locale.en-US.yaml` ก็เป็น placeholder เช่นกัน (`Proprietary`) เพราะสัญญาอนุญาตของ
Lalin Cast เองยังไม่ตัดสินใจ ดู [`docs/LICENSE_DECISION.md`](../../docs/LICENSE_DECISION.md) **ห้ามส่ง
PR ไป winget-pkgs จนกว่าทั้งสองเรื่องนี้จะตัดสินใจแล้ว**

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
|---|---|
| `Lalin.LalinCast.yaml` | version manifest |
| `Lalin.LalinCast.installer.yaml` | installer manifest (x64 NSIS เท่านั้นตอนนี้ — ดูหมายเหตุ arm64 ในไฟล์) |
| `Lalin.LalinCast.locale.en-US.yaml` | default-locale manifest |

ทั้งสามไฟล์ตาม [winget manifest schema 1.6](https://aka.ms/winget-manifest.version.1.6.0.schema.json)
และมี placeholder 3 ตัวที่ต้องเติมทุกครั้งที่ตัดรุ่นใหม่: `{{VERSION}}`, `{{INSTALLER_URL}}`,
`{{INSTALLER_SHA256}}`

## ขั้นตอนเติมค่าและส่ง PR

1. **รอ release public**: แท็ก `v*` บน `main` ต้อง trigger `.github/workflows/release.yml` จนจบและ
   release บน GitHub ต้องถูกเปลี่ยนจาก draft เป็น published แล้ว (ตอนนี้ workflow ตั้ง
   `releaseDraft: true` — ต้อง publish เองหลัง build เสร็จ) ใช้เฉพาะไฟล์ NSIS `.exe` ของ leg **x64**
   (`label: x64`, `target: x86_64-pc-windows-msvc`); leg **arm64** ยังเป็น `experimental: true` /
   `continue-on-error: true` และยังไม่มีแถวใน installer manifest นี้
2. **ดาวน์โหลดตัวติดตั้งและคำนวณ SHA-256**:
   ```powershell
   $url = "https://github.com/Freshair129/lalin-cast/releases/download/v<VERSION>/<installer-file>.exe"
   Invoke-WebRequest -Uri $url -OutFile installer.exe
   winget hash installer.exe
   # หรือ: Get-FileHash installer.exe -Algorithm SHA256
   ```
3. **เติมค่า placeholder** (และลบ comment แม่แบบ/template banner ออกจากทั้งสามไฟล์ก่อนส่ง): คัดลอกไฟล์ทั้งสามไปยังโฟลเดอร์รุ่นใหม่ (ดูโครงสร้างด้านล่าง) แล้วแทนที่
   - `{{VERSION}}` → เลขรุ่น (เช่น `0.1.0`) — ปรากฏใน `PackageVersion` ทั้งสามไฟล์
   - `{{INSTALLER_URL}}` → URL ของไฟล์ `.exe` บน GitHub Releases จากขั้นตอน 1
   - `{{INSTALLER_SHA256}}` → ผลลัพธ์จาก `winget hash` (ตัวพิมพ์ใหญ่)
4. **ตรวจสอบ YAML ก่อน**: `python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" Lalin.LalinCast.yaml Lalin.LalinCast.installer.yaml Lalin.LalinCast.locale.en-US.yaml` — ตรวจ
   แค่ไวยากรณ์ YAML เท่านั้น ไม่ใช่ schema ของ winget
5. **`winget validate`** (ต้องมี winget-cli บนเครื่อง): `winget validate --manifest <โฟลเดอร์ที่เติมค่าแล้ว>` —
   ตรวจตาม schema ของ winget จริง (URL เข้าถึงได้, SHA-256 ตรงกับไฟล์จริง ฯลฯ)
6. **โครงสร้างโฟลเดอร์สำหรับส่ง PR** (ตามธรรมเนียมของ winget-pkgs: `manifests/<ตัวอักษรแรกตัวเล็กของ
   Publisher>/<Publisher>/<PackageName>/<version>/`):
   ```
   manifests/l/Lalin/LalinCast/<VERSION>/
     Lalin.LalinCast.yaml
     Lalin.LalinCast.installer.yaml
     Lalin.LalinCast.locale.en-US.yaml
   ```
7. **ส่ง PR**: fork `microsoft/winget-pkgs`, วางไฟล์ตามโครงสร้างข้อ 6, เปิด PR (หรือใช้
   [`wingetcreate`](https://github.com/microsoft/winget-create) แบบ interactive แทนขั้นตอน 3–6 ก็ได้
   — เครื่องมือจะถามค่าเดียวกันและสร้างไฟล์ให้)

## หมายเหตุ

- `Scope: user` และสวิตช์ silent `/S` อิงจากค่า default ของ Tauri NSIS bundler (ไม่มีการตั้ง
  `bundle.windows.nsis.installMode` ใน `src-tauri/tauri.conf.json` ตอนที่เขียนไฟล์นี้) — ตรวจสอบกับ
  ตัวติดตั้งจริงก่อนส่ง PR ถ้ามีการเปลี่ยน config นั้นในภายหลัง
- ยังไม่มีแถว `Architecture: arm64` ใน installer manifest — เพิ่มได้เมื่อ leg arm64 ของ
  `release.yml` เสถียรพอที่จะไม่ใช่ `experimental` แล้ว
- อัปเดตไฟล์ template สามไฟล์นี้ (ไม่ใช่แค่โฟลเดอร์รุ่นที่เติมค่าแล้ว) ถ้าโครงสร้างแอปเปลี่ยน (เช่น
  เปลี่ยน installer เป็น MSI, เปลี่ยน scope) เพื่อให้รุ่นถัดไปเติมค่าได้ถูกจากไฟล์เดิม

---

## English

**Status: templates only — no PR has been sent to `microsoft/winget-pkgs` yet.**

`PackageIdentifier: Lalin.LalinCast` in all three files is a **proposal**, not a final decision — it
is pending the project naming decision (human gate H1/H15 per
`docs/plans/W4_PLAYBACK_PLAN.md`). The `License` field in `Lalin.LalinCast.locale.en-US.yaml` is
also a placeholder (`Proprietary`) because Lalin Cast's own source license has not been chosen yet;
see [`docs/LICENSE_DECISION.md`](../../docs/LICENSE_DECISION.md). **Do not submit a PR to
winget-pkgs until both of these are decided.**

### Files in this folder

| File | Role |
|---|---|
| `Lalin.LalinCast.yaml` | version manifest |
| `Lalin.LalinCast.installer.yaml` | installer manifest (x64 NSIS only for now — see the arm64 note in the file) |
| `Lalin.LalinCast.locale.en-US.yaml` | default-locale manifest |

All three follow [winget manifest schema
1.6](https://aka.ms/winget-manifest.version.1.6.0.schema.json) and carry three placeholders to fill
in on every new release: `{{VERSION}}`, `{{INSTALLER_URL}}`, `{{INSTALLER_SHA256}}`.

### Fill-and-submit procedure

1. **Wait for a public release**: a `v*` tag on `main` must trigger
   `.github/workflows/release.yml` to completion, and the GitHub Release must be published (moved
   out of draft — the workflow sets `releaseDraft: true`, so this is a manual step after the build
   finishes). Use only the NSIS `.exe` from the **x64** leg (`label: x64`, target
   `x86_64-pc-windows-msvc`); the **arm64** leg is still `experimental: true` /
   `continue-on-error: true` and has no row in this installer manifest yet.
2. **Download the installer and hash it**:
   ```powershell
   $url = "https://github.com/Freshair129/lalin-cast/releases/download/v<VERSION>/<installer-file>.exe"
   Invoke-WebRequest -Uri $url -OutFile installer.exe
   winget hash installer.exe
   # or: Get-FileHash installer.exe -Algorithm SHA256
   ```
3. **Fill in the placeholders** (and strip the template banner comments from all three files before submitting): copy the three files into a new version folder (see structure
   below) and replace
   - `{{VERSION}}` → the version number (e.g. `0.1.0`) — appears in `PackageVersion` in all three files
   - `{{INSTALLER_URL}}` → the `.exe` URL on GitHub Releases from step 1
   - `{{INSTALLER_SHA256}}` → the output of `winget hash` (uppercase)
4. **Check the YAML first**: `python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" Lalin.LalinCast.yaml Lalin.LalinCast.installer.yaml Lalin.LalinCast.locale.en-US.yaml` —
   this only checks YAML syntax, not the winget schema itself.
5. **`winget validate`** (requires winget-cli locally): `winget validate --manifest <filled-in folder>` —
   validates against the real winget schema (URL reachability, SHA-256 matching the actual file, etc).
6. **Folder layout for the PR** (winget-pkgs convention: `manifests/<lowercase first letter of
   Publisher>/<Publisher>/<PackageName>/<version>/`):
   ```
   manifests/l/Lalin/LalinCast/<VERSION>/
     Lalin.LalinCast.yaml
     Lalin.LalinCast.installer.yaml
     Lalin.LalinCast.locale.en-US.yaml
   ```
7. **Submit the PR**: fork `microsoft/winget-pkgs`, place the files per step 6, open a PR (or use
   [`wingetcreate`](https://github.com/microsoft/winget-create) interactively instead of steps 3–6 —
   it asks for the same values and generates the files for you).

### Notes

- `Scope: user` and the `/S` silent switch are based on Tauri's NSIS bundler defaults (no
  `bundle.windows.nsis.installMode` is set in `src-tauri/tauri.conf.json` as of this writing) —
  verify against the real installer before submitting if that config changes later.
- There is no `Architecture: arm64` row in the installer manifest yet — add one once the arm64 leg
  of `release.yml` is stable enough to no longer be `experimental`.
- Update these three template files themselves (not just a filled-in version folder) if the app's
  packaging changes (e.g. switching the installer to MSI, changing scope), so the next release fills
  in values from a correct template.
