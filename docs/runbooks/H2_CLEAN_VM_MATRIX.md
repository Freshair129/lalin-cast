---
version: "0.1.0b"
created_at: "2026-09-23T14:00:00+07:00,LALIN,uncommitted"
last_update: "2026-09-23T14:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "distribution"
  doc_type: "runbook"
  scope: "Procedure and result matrix for human gate H2: installing Lalin Cast on a clean Windows machine and updating it from an earlier version, including which rows can only run after the first release is published"
---

# Lalin Cast — H2: clean-VM install → update matrix

## สถานะ / Status

**CANDIDATE — ยังไม่มีแถวไหนถูกรัน.** ไฟล์นี้แตกงานของ human gate **H2** ใน
`docs/runbooks/RELEASE_CHECKLIST.md` ออกเป็นแถวที่ทดสอบได้จริง H2 จะปิดได้ก็ต่อเมื่อทุกแถวที่ไม่ได้
ทำเครื่องหมาย *(หลัง tag)* ผ่านครบ

**CANDIDATE — no row has been run yet.** This file breaks human gate **H2** from
`docs/runbooks/RELEASE_CHECKLIST.md` into rows that can actually be executed. H2 closes when every
row not marked *(post-tag)* has passed.

## 1. ข้อติดขัดที่ต้องตัดสินใจก่อน / The ordering problem

`src-tauri/tauri.conf.json` ตั้ง endpoint ของ updater ไว้ที่

```
https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json
```

repository นี้ **ยังไม่เคยมี release** URL นั้นจึงตอบ 404 อยู่ตอนนี้ และ endpoint ถูก build ติดไปกับ
binary (ไม่มี env override ใน `src-tauri/src/updater.rs`) แปลว่า **ครึ่ง "update" ของ H2 ทดสอบจริง
ไม่ได้เลยก่อนที่จะ publish release แรก** — ถ้าจะทดสอบก่อน ต้อง build binary ที่ชี้ endpoint อื่น ซึ่งก็
จะไม่ใช่ artifact ตัวที่ปล่อยจริงอีกต่อไป

เอกสารนี้จึงแบ่ง H2 เป็นสองช่วงตามแบบเดียวกับที่ H30 เคยถูกย้าย (ดูแถว 0.1.8b ใน changelog ของ
release checklist):

| ช่วง | แถว | ทำเมื่อไหร่ |
|---|---|---|
| **A — ก่อน tag** | M1–M5, M7 | ทำได้ทันทีด้วย artifact ของ dry run |
| **B — หลัง publish** | M6 | ต้องมี release จริงบน GitHub ก่อน |

**ข้อเสนอ:** ปิด H2 ด้วยช่วง A ก่อน tag แล้วบันทึกช่วง B ไว้เป็นเงื่อนไขหลัง publish คู่กับ H30
ถ้าไม่ยอมรับ ทางเลือกเดียวที่เหลือคือเลื่อน tag ออกไปจนกว่าจะมี release สองตัว ซึ่งเป็นไปไม่ได้

The updater endpoint is baked into the binary and points at a release that does not exist yet, so
the "update" half of H2 cannot be tested honestly before the first publish. Phase A closes H2
pre-tag; phase B (M6 only) is recorded as a post-publish obligation next to H30.

## 2. เครื่องที่ใช้ / The clean machine

เครื่อง dev ปัจจุบัน (Windows 11 Pro 26200) **ไม่มี** Hyper-V, Windows Sandbox, VirtualBox, VMware
หรือ Vagrant ติดตั้งอยู่ ตรวจแล้วเมื่อ 2026-09-23:

| สิ่งที่ตรวจ | ผล |
|---|---|
| `Microsoft-Hyper-V-All` | ไม่มี (`vmms` service ไม่มี, ไม่มี `vmconnect.exe`, ไม่มี Hyper-V module) |
| Windows Sandbox | ไม่มี (`%WINDIR%\System32\WindowsSandbox.exe` ไม่มีอยู่) |
| VirtualBox / VMware / QEMU / multipass / vagrant | ไม่มีใน `PATH` |
| RAM / ที่ว่าง | 31.8 GB / C: 16.0 GB, F: 159.7 GB |

**เลือกแล้ว 2026-09-23: ทางที่ 1 — เครื่องจริงเครื่องที่สอง** (เครื่องเดียวกับที่ใช้ปิด H28/H29)
ข้อดีคือไม่ต้องแก้ค่าระบบของเครื่อง dev และเก็บสถานะข้ามวันได้ จึงรองรับ M6 ซึ่งต้องติดตั้ง 0.1.9
ค้างไว้ข้ามการ tag

ทางเลือกที่พิจารณา:

1. **เครื่องจริงเครื่องที่สอง** — ตัวเดียวกับที่ใช้ปิด H28/H29 ได้เลย ถ้ายังสะอาดอยู่ **(แนะนำ —
   ไม่ต้องแก้ค่าระบบ และเป็นสภาพแวดล้อมที่ใกล้ผู้ใช้จริงที่สุด)**
2. **เปิด Hyper-V หรือ Windows Sandbox บนเครื่องนี้** — ต้องใช้สิทธิ์ผู้ดูแลระบบและ reboot เป็น
   การเปลี่ยนค่าระบบ ผู้ใช้ต้องทำเอง Sandbox เหมาะกับ M1/M3/M5 (เครื่องรีเซ็ตทุกครั้งที่ปิด) แต่
   **ใช้กับ M6 ไม่ได้** เพราะสถานะที่ติดตั้งไว้จะหายไปเมื่อปิด จึงต้องใช้ Hyper-V ที่มี snapshot
3. **VM บนโฮสต์อื่น** ที่มี Windows 11 x64 สะอาด

เงื่อนไขของเครื่องสะอาด: ไม่เคยติดตั้ง Lalin Cast, ไม่มี `%APPDATA%\ai.lalin.cast`,
`%LOCALAPPDATA%\ai.lalin.cast` หรือคีย์ `HKCU\Software\Classes\lalin-cast`, และต่ออินเทอร์เน็ตได้
(installer ใช้ WebView2 bootstrapper แบบดาวน์โหลด)

## 3. artifact ที่ใช้ / Artifacts

- **รุ่นปัจจุบัน (0.2.0):** run **35774804430** ของ `release-dryrun.yml` ที่ commit `67c6f56`
  (= `main` ตอนนั้น) **อย่าใช้ artifact ของ run 35601453787 ที่ใช้ปิด H28/H29** เพราะ build ก่อน
  PR #25/#26/#27 จึงไม่มีทั้งการแก้ DIAL 504, การแก้ CSP stylesheet และ touch overlay
  ยืนยัน SHA256 แล้วเมื่อ 2026-09-23 ตรงกับ `SHA256SUMS.txt` ทั้งสองไฟล์:

  | ไฟล์ | SHA256 |
  |---|---|
  | `Lalin.Cast_0.2.0_x64-setup.exe` | `5c75b3fef044c24f3fe11f54cf022b1746fe8b26ff403498cd6e8a90a93b95fd` |
  | `Lalin-Cast_0.2.0_x64_portable.zip` | `b2d0b35194c035d4d1a71407bf73b69c31eee4c1be1fc92d987bfb2527ac9581` |
- **รุ่นเก่ากว่า (สำหรับ M6):** สร้างแล้วเมื่อ 2026-09-23 จาก branch **`test/h2-downgrade-0.1.9`**
  (commit `ef78464` = `main` ที่ `67c6f56` + ลด `version` ใน `Cargo.toml`/`Cargo.lock` เป็น `0.1.9`
  เท่านั้น) ด้วย run **35776816637** ของ `release-dryrun.yml`
  SHA256 ของ installer ที่ยืนยันแล้ว: `c69f320a0129c5726bff0a9f7ab8a74d09ceee1d588d6deabce88cc1c6f8071d`
  **ห้าม merge branch นี้** — `main` ต้องเป็น 0.2.0 ตลอด branch นี้มีไว้ให้ M6 ใช้อย่างเดียว
  และลบได้หลัง M6 ผ่าน
- ตรวจ checksum ของทุกไฟล์ที่ดาวน์โหลดด้วย `Get-FileHash -Algorithm SHA256` เทียบกับ
  `SHA256SUMS.txt` ก่อนติดตั้งทุกครั้ง

## 4. Matrix

แต่ละแถวบันทึกผลกลับมาที่ตาราง §5 อย่าติ๊กแถวที่ "ไม่ได้ลอง" ว่าผ่าน

### ช่วง A — ก่อน tag

#### M1 — ติดตั้งสะอาดจาก installer / fresh install

1. รัน `Lalin.Cast_0.2.0_x64-setup.exe` บนเครื่องสะอาด
2. บันทึก: มี UAC prompt หรือไม่, ติดตั้งลงโฟลเดอร์ไหน (per-user จะเป็น `%LOCALAPPDATA%`)
3. บันทึก: WebView2 ถูกดาวน์โหลดติดตั้งหรือมีอยู่แล้ว
4. เปิดแอป — หน้าต่างหลักขึ้น, YouTube TV โหลดได้, ไม่มี dialog ข้อผิดพลาด

**ผ่านเมื่อ:** ติดตั้งจบโดยไม่มี error, แอปเปิดและโหลด Leanback ได้, ไม่มี prompt ที่อธิบายไม่ได้

**ผลจริง 2026-09-23 — ผ่าน** (เครื่องจริงเครื่องที่สอง, `Lalin Cast_0.2.0_x64-setup.exe` จาก run
35774804430):
- **ไม่มี UAC เด้ง** → เป็นการติดตั้งแบบ per-user ตามค่ามาตรฐานของ NSIS ที่เราไม่ได้ override
- installer **ให้เลือกโฟลเดอร์ปลายทางเองได้** และผู้ทดสอบเลือกโฟลเดอร์บนไดรฟ์ `F:`
  (ไม่ใช่ `%LOCALAPPDATA%` ที่เป็นค่าเริ่มต้น) — ติดตั้งสำเร็จ แปลว่าแอปไม่ผูกกับ path ใด path หนึ่ง
  ข้อควรรู้: ถ้าผู้ใช้เลือก path ใต้ `Program Files` การติดตั้งจะต้องใช้สิทธิ์ผู้ดูแลระบบ
- **ไม่มีการดาวน์โหลด WebView2** เพราะเครื่องมีอยู่แล้ว (ปกติของ Windows 11) — เงื่อนไข
  "ต้องต่ออินเทอร์เน็ตตอนติดตั้ง" ยังไม่ถูกพิสูจน์ และจะพิสูจน์ได้ก็ต่อเมื่อมีเครื่องที่ไม่มี WebView2

#### M2 — ที่เก็บข้อมูลของโหมดติดตั้ง / installed-mode data locations

หลังเปิดแอปครั้งแรกและเปลี่ยนค่าใน settings สักหนึ่งค่า:

1. ต้องมี `%APPDATA%\ai.lalin.cast\` (settings store `media-settings.json`) และ `%LOCALAPPDATA%\ai.lalin.cast\`
   (WebView2 profile)
2. **ต้องไม่มี** โฟลเดอร์ `lalin-cast-data` ข้าง ๆ ไฟล์ exe
3. ปิดแล้วเปิดใหม่ — ค่าที่เปลี่ยนไว้ยังอยู่

**ผ่านเมื่อ:** ครบทั้งสามข้อ

**ผลจริง 2026-09-23 — ผ่าน** ครบทั้งสามข้อ: store เกิดใน `%APPDATA%\ai.lalin.cast\`,
**ไม่มี** `lalin-cast-data` ข้าง `lalin-cast.exe` (ซึ่งอยู่บนไดรฟ์ `F:` ตาม M1 — จึงเป็นการพิสูจน์
ที่หนักแน่นว่าโหมดติดตั้งไม่เขียนข้างตัวโปรแกรมแม้จะติดตั้งนอก `%LOCALAPPDATA%`), และค่าที่ตั้งไว้
ยังอยู่หลังปิดเปิดใหม่

#### M3 — zip พกพาบนเครื่องเดียวกัน / portable zip

1. แตก `Lalin-Cast_0.2.0_x64_portable.zip` ลงโฟลเดอร์ใหม่ (เช่น `D:\LalinPortable`)
2. เปิดแอปจาก zip นั้น เปลี่ยนค่า settings หนึ่งค่า
3. ต้องเกิด `D:\LalinPortable\lalin-cast-data\` และค่าต้องอยู่ในนั้น **ไม่ใช่** ใน `%APPDATA%`
4. เปิด settings: ตัวเลือก start-with-Windows และ deep link ต้องไม่เขียน registry —
   ตรวจว่า `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` ไม่มีค่า Lalin Cast และ
   `HKCU\Software\Classes\lalin-cast` ไม่ถูกสร้าง
5. ปิดแอป ลบทั้งโฟลเดอร์ — ต้องไม่มีอะไรหลงเหลือใน `%APPDATA%` / `%LOCALAPPDATA%` / registry

**ผ่านเมื่อ:** ครบทุกข้อ (ข้อ 4 คือ contract ของ wave 11 ที่ยังไม่เคยพิสูจน์บนเครื่องสะอาด)

**ผลจริง 2026-09-23 — ผ่าน** ครบทุกข้อ นี่คือการพิสูจน์ contract ของ wave 11 บนเครื่องจริง
ครั้งแรก: ข้อมูลไปอยู่ใน `lalin-cast-data` ข้าง exe ไม่ใช่ `%APPDATA%`, การเปิด/ปิดสวิตช์
start-with-Windows และ deep link **ไม่เขียน registry เลย** (ไม่มีค่าใน
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` และไม่มี `HKCU\Software\Classes\lalin-cast`)
และลบโฟลเดอร์แล้วไม่มีอะไรหลงเหลือ

#### M4 — ติดตั้งทับเวอร์ชันเดิม / reinstall over the same version

1. รัน installer 0.2.0 ตัวเดิมซ้ำบนเครื่องที่ผ่าน M1/M2 แล้ว
2. เปิดแอป — ค่า settings ที่ตั้งไว้ใน M2 ต้องยังอยู่ครบ

**ผ่านเมื่อ:** ติดตั้งทับได้ และข้อมูลผู้ใช้ไม่หาย

**ผลจริง 2026-09-23 — ผ่าน** ติดตั้งทับเวอร์ชันเดิมลงโฟลเดอร์เดิมได้ และค่า settings จาก M2
ยังอยู่ครบหลังติดตั้งทับ

#### M5 — การตรวจอัปเดตตอนที่ยังไม่มี release / update check with no release

ก่อน tag endpoint ตอบ 404 ซึ่งเป็นสภาพที่ผู้ใช้รุ่นแรกจะไม่เจอ แต่เป็นสภาพที่ **เราจะเจอตอนนี้** และ
ต้องไม่ทำให้แอปพัง

1. เปิดแอป รอเกิน 8 วินาทีหลังหน้าต่างหลักขึ้น — การตรวจตอนเริ่มโปรแกรมต้อง **เงียบ** ไม่มีหน้าต่าง
   หรือ dialog เด้ง
2. สั่งตรวจอัปเดตเองจากเมนู/settings — ต้องขึ้นหน้าต่างที่บอกผลอย่างสุภาพ (ไม่ crash, ไม่ค้าง)
3. ดู log — ต้องไม่มี path หรือชื่อบัญชีผู้ใช้โผล่ (ตาม H26)
4. ในโหมดพกพา (M3) ต้องไม่มีการตรวจอัปเดตตอนเริ่มโปรแกรมเลย

**ผ่านเมื่อ:** ครบทุกข้อ

#### M7 — ถอนการติดตั้ง / uninstall

1. ถอนการติดตั้งจาก Settings → Apps
2. บันทึกว่า `%APPDATA%\ai.lalin.cast` และ `%LOCALAPPDATA%\ai.lalin.cast` ถูกลบหรือคงไว้
   (ทั้งสองแบบยอมรับได้ แต่ต้องตรงกับที่ PRIVACY.md เขียนไว้ — ถ้าไม่ตรง ให้แก้เอกสาร)
3. `HKCU\Software\Classes\lalin-cast` ต้องหายไปถ้าเคยเปิด deep link ไว้
4. ไม่มี process `lalin-cast.exe` ค้าง

**ผ่านเมื่อ:** ถอนได้สะอาดและพฤติกรรมเรื่องข้อมูลผู้ใช้ตรงกับ PRIVACY.md

### ช่วง B — หลัง publish release แรก *(post-tag)*

#### M6 — อัปเดตข้ามเวอร์ชันจริง / real cross-version update *(post-tag)*

1. ก่อน tag: ติดตั้ง installer 0.1.9 จาก run 35776816637 (ดู §3) ไว้บนเครื่องที่สอง
   **หลังทำ M1–M5 และ M7 เสร็จและถอนการติดตั้ง 0.2.0 ออกแล้ว** เพื่อไม่ให้ชนกัน
2. ติดตั้ง 0.1.9 บนเครื่องสะอาด เปิดแอปหนึ่งครั้ง ตั้งค่า settings ไว้หนึ่งค่า แล้วปิด
3. หลัง publish `v0.2.0` แล้ว เปิดแอป 0.1.9 อีกครั้ง
4. แอปต้องพบ 0.2.0, ตรวจลายเซ็น, ดาวน์โหลดและติดตั้งแบบ `passive`
5. หลังอัปเดต: เวอร์ชันในหน้าต่าง About/settings เป็น 0.2.0 และค่า settings จากข้อ 2 ยังอยู่

**ผ่านเมื่อ:** อัปเดตสำเร็จโดยไม่ต้องดาวน์โหลดเอง และข้อมูลผู้ใช้ไม่หาย

## 5. ตารางผล / Results

| แถว | เครื่อง | วันที่ | ผล | หมายเหตุ |
|---|---|---|---|---|
| M1 | เครื่องที่สอง | 2026-09-23 | ✅ ผ่าน | ไม่มี UAC (per-user), เลือกโฟลเดอร์เองบนไดรฟ์ F:, WebView2 มีอยู่แล้ว |
| M2 | เครื่องที่สอง | 2026-09-23 | ✅ ผ่าน | store อยู่ใน %APPDATA%, ไม่มี lalin-cast-data ข้าง exe บน F:, ค่าคงอยู่หลังรีสตาร์ต |
| M3 | เครื่องที่สอง | 2026-09-23 | ✅ ผ่าน | ข้อมูลอยู่ข้าง exe, ไม่แตะ registry ทั้งสองสวิตช์, ลบแล้วสะอาด |
| M4 | เครื่องที่สอง | 2026-09-23 | ✅ ผ่าน | ติดตั้งทับได้ ค่า settings จาก M2 ไม่หาย |
| M5 | | | ⬜ | |
| M7 | | | ⬜ | |
| M6 *(post-tag)* | | | ⬜ | |

เมื่อ M1–M5 และ M7 ผ่านครบ ให้ติ๊ก H2 ใน `docs/runbooks/RELEASE_CHECKLIST.md` พร้อมหมายเหตุลงวันที่ที่
อ้างไฟล์นี้ และเพิ่ม M6 เข้าไปในส่วนหลัง tag คู่กับ H30

## Changelog

| version | date | status | change | commit | by |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-23 | candidate | เอกสารแรก: แตก H2 เป็น M1–M7, บันทึกว่า endpoint ของ updater ชี้ไป release ที่ยังไม่มี จึงต้องแยก M6 ไว้หลัง publish, และบันทึกว่าเครื่อง dev ไม่มี Hyper-V/Sandbox/VirtualBox | uncommitted | LALIN |
