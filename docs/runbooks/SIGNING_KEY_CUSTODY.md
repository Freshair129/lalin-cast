---
version: "0.1.0b"
created_at: "2026-09-20T21:00:00+07:00,LALIN,uncommitted"
last_update: "2026-09-20T21:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "security"
  doc_type: "runbook"
  scope: "Custody, storage, verification, rotation and leak response for the Lalin Cast Tauri updater signing key"
---

# Lalin Cast — คู่มือดูแลกุญแจเซ็นชื่อ Updater / Signing Key Custody Runbook

## สถานะ / Status

**CANDIDATE — runbook เอกสารเท่านั้น ยังไม่มีการสร้างกุญแจหรือ GitHub secret จริงจากไฟล์นี้.**
บทบาทที่ระบุด้านล่างเป็น **placeholder role เท่านั้น ห้ามใส่ชื่อบุคคลจริง** ในไฟล์นี้
หรือในไฟล์ใด ๆ ที่อยู่ใน repository นี้ — mapping ระหว่าง role กับชื่อจริงเก็บไว้นอก
repository (เช่น password manager ของทีม หรือ HR record) เท่านั้น

**CANDIDATE — documentation-only runbook.** No key or GitHub secret is created
by this file. The roles below are **placeholder roles only — never put a real
person's name** in this file or anywhere in this repository; the mapping from
role to real identity is kept outside the repository (e.g. the team's password
manager or an HR record) only.

อ้างอิง / References: [`LALIN_CAST_UPDATER_SPEC.md`](../architecture/LALIN_CAST_UPDATER_SPEC.md)
(Secret and key lifecycle section), [`README.md`](../../README.md) (Updating section).

## บทบาท (placeholder) / Roles (placeholder)

| Role (placeholder) | หน้าที่ / Responsibility |
|---|---|
| `KEY_HOLDER_PRIMARY` | ถือรหัสผ่านของ private key หลัก / เป็นผู้เริ่ม rotation เมื่อจำเป็น — holds the primary private key password; initiates rotation when required |
| `KEY_HOLDER_BACKUP` | ถือสำเนา offline backup แยกที่เก็บ / ใช้เมื่อ primary ไม่พร้อมใช้งาน — holds the separately stored offline backup copy; used when the primary holder is unavailable |
| `REPO_OWNER` | ผู้ดูแล GitHub organization/repository ที่มีสิทธิ์แก้ GitHub Actions secrets — the GitHub org/repo administrator with permission to edit Actions secrets |

กฎ / Rules:

- ห้ามให้บุคคลเดียวถือทั้ง `KEY_HOLDER_PRIMARY` และ `KEY_HOLDER_BACKUP` — the same
  person must not hold both `KEY_HOLDER_PRIMARY` and `KEY_HOLDER_BACKUP`.
- แต่ละ role ต้องมีผู้สำรอง (deputy) ที่รู้ขั้นตอนนี้ล่วงหน้า — each role must have a
  known deputy who has read this runbook before an incident happens.
- ไฟล์นี้ห้ามแก้ไขเพื่อใส่ชื่อจริง อีเมลส่วนตัว หรือข้อมูลติดต่อ — this file must
  never be edited to add a real name, personal email or contact detail.

## ที่เก็บกุญแจ / Storage

| Artifact | ที่เก็บ / Location | หมายเหตุ / Notes |
|---|---|---|
| Public key | `src-tauri/tauri.conf.json` (committed) | ไม่ใช่ความลับ / not a secret |
| Private key | GitHub Actions secret `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY` | prefix `LALIN_CAST_` เท่านั้น ห้ามใช้ prefix อื่น / `LALIN_CAST_` prefix only |
| Private key password | GitHub Actions secret `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ถ้ากุญแจสร้างแบบไม่มี password ต้องบันทึกในบรรทัด CHANGELOG ว่าทำไม / if the key was generated without a password, record why in the CHANGELOG below |
| Offline backup | สื่อ offline เข้ารหัส เก็บโดย `KEY_HOLDER_BACKUP` แยกจากที่เก็บของ `KEY_HOLDER_PRIMARY` ทางกายภาพ (เช่น encrypted USB/hardware token ในที่ปลอดภัยคนละแห่ง) | encrypted offline media, physically separate from `KEY_HOLDER_PRIMARY`'s copy |

ข้อห้ามเด็ดขาด / Hard rules:

- **ห้ามใช้กุญแจของ G-Music (`keys/g-music.key`, `keys/g-music.key.pub`) กับ Lalin
  Cast** ไม่ว่ากรณีใด — Lalin Cast มีขอบเขตความไว้วางใจ (trust boundary) แยกจาก
  G-Music/Lalin Studio ตาม `LALIN_CAST_UPDATER_SPEC.md`. **Never reuse the
  G-Music keypair (`keys/g-music.key`, `keys/g-music.key.pub`) for Lalin Cast**
  under any circumstance — Lalin Cast has its own trust boundary, separate from
  G-Music/Lalin Studio, per `LALIN_CAST_UPDATER_SPEC.md`.
- ห้ามวาง private key, password, หรือ backup ไว้ใน repository, issue, PR, chat log,
  หรือ build log — never place the private key, its password, or any backup
  copy in the repository, an issue, a PR, a chat log, or a build log.
- ผู้ที่เข้าถึง private key material ได้มีเฉพาะ `KEY_HOLDER_PRIMARY`,
  `KEY_HOLDER_BACKUP` และ `REPO_OWNER` (สำหรับตั้งค่า secret เท่านั้น ไม่ใช่เพื่อดู
  ค่าคีย์) — only `KEY_HOLDER_PRIMARY`, `KEY_HOLDER_BACKUP` and `REPO_OWNER` (the
  latter only to configure the secret slot, not to view the key value) may
  access private key material.

## การตรวจว่า public key ตรงกัน / Verifying the public key matches

ก่อน commit การตั้งค่าใด ๆ ที่อ้างอิง public key ใหม่ ต้องตรวจว่า public key ที่จะ
commit ตรงกับ private key ที่เก็บใน GitHub secret จริง โดย:

1. รัน Tauri signer ในเครื่องที่แยก/ปลอดภัยเพื่อ derive public key จาก private key
   ที่จะใช้จริง (ห้ามรันบนเครื่องที่ใช้ร่วมกับผู้อื่นหรือ CI runner สาธารณะ)
2. เทียบสตริง public key ที่ได้กับค่าที่จะใส่ใน `src-tauri/tauri.conf.json`
   ทีละตัวอักษร (ไม่ใช่แค่ diff ความยาว)
3. บันทึกผลการตรวจ (ตรง/ไม่ตรง, วันที่, ผู้ตรวจตาม role placeholder) ไว้ในแถว
   CHANGELOG ของไฟล์นี้ — ห้ามบันทึกค่ากุญแจเอง

Before committing any config referencing a new public key, verify it actually
matches the private key held in the GitHub secret:

1. Derive the public key from the intended private key on an isolated/trusted
   machine (never on a shared machine or a public CI runner).
2. Compare the derived public key string against the value going into
   `src-tauri/tauri.conf.json` character-for-character (not just a length
   check).
3. Record the verification result (match/mismatch, date, verifying role
   placeholder) as a CHANGELOG row in this file — never record the key value
   itself.

## Rotation drill / การซ้อมหมุนเวียนกุญแจ

ความถี่ / Frequency: อย่างน้อยทุก 6 เดือน หรือก่อน major release ที่เปลี่ยน
product identity — at least every 6 months, or before any major release that
changes product identity.

ขั้นตอนซ้อม (ไม่ publish จริง) / Drill steps (no real publish):

1. ยืนยันว่า `KEY_HOLDER_BACKUP` เข้าถึง offline backup ได้จริงและกู้คืนได้ —
   confirm `KEY_HOLDER_BACKUP` can actually access and restore the offline
   backup.
2. สร้าง keypair ทดสอบใหม่ในสภาพแวดล้อมแยก (ไม่ใช่ production secret) —
   generate a fresh test keypair in an isolated environment (not the
   production secret).
3. ตรวจ public/private key ตรงกันตามขั้นตอนด้านบน — verify the public/private
   pair matches per the verification steps above.
4. จำลองการอัปเดต GitHub secret บน fork/test repository เท่านั้น ไม่แตะ secret
   จริงของ `Freshair129/lalin-cast` — simulate the GitHub secret update on a
   fork/test repository only; never touch `Freshair129/lalin-cast`'s real
   secret during a drill.
5. บันทึกผลซ้อม (ผ่าน/ไม่ผ่าน, ปัญหาที่พบ, วันที่) เป็นแถว CHANGELOG

## ขั้นตอนเมื่อกุญแจรั่วไหล / Key leak procedure

ตาม `LALIN_CAST_UPDATER_SPEC.md` หมวด "Secret and key lifecycle" ข้อ 5: ถ้า
private key รั่วไหล ต้อง revoke update trust path ด้วยการออก release ที่หมุนกุญแจ
ใหม่ตามแผน **ห้ามแอบเปลี่ยน public key เงียบ ๆ**

Per `LALIN_CAST_UPDATER_SPEC.md` "Secret and key lifecycle" item 5: if the
private key is exposed, the update trust path must be revoked by shipping a
**planned** key-rotation release. **Never silently replace the public key.**

1. **หยุดความเสียหายทันที** — ลบ/หมุน GitHub Actions secret
   (`LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY`,
   `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) ทันทีที่ทราบว่ารั่ว แม้ยังไม่มี
   กุญแจใหม่พร้อม — **contain immediately**: delete/rotate the GitHub Actions
   secrets as soon as the leak is known, even before a replacement key is
   ready.
2. **สร้างกุญแจใหม่นอก repository** โดย `KEY_HOLDER_PRIMARY` ร่วมกับ
   `KEY_HOLDER_BACKUP` ในสภาพแวดล้อมที่แยกจากเครื่องที่ถูกละเมิด — **generate a new
   keypair outside the repository**, by `KEY_HOLDER_PRIMARY` together with
   `KEY_HOLDER_BACKUP`, on an environment separate from the compromised one.
3. **ตรวจ public/private key ตรงกัน** ตามหัวข้อ "การตรวจว่า public key ตรงกัน"
   ก่อน commit ใด ๆ — **verify the new public/private pair matches** per the
   verification section above, before committing anything.
4. **อัปเดต** `src-tauri/tauri.conf.json` ด้วย public key ใหม่ และอัปเดต GitHub
   secret ด้วยกุญแจใหม่ (คง prefix `LALIN_CAST_`) — **update**
   `src-tauri/tauri.conf.json` with the new public key and update the GitHub
   secret with the new key (keep the `LALIN_CAST_` prefix).
5. **ออก release ที่ลงนามด้วยกุญแจใหม่** พร้อมประกาศชัดเจนว่ากุญแจเก่าถูกเพิกถอน —
   ผู้ใช้เวอร์ชันเก่าที่พึ่งกุญแจที่รั่วอาจต้อง **ดาวน์โหลด installer ใหม่ด้วยตนเอง**
   หนึ่งครั้ง เพราะ auto-update ที่พึ่งกุญแจเก่าใช้ต่อไม่ได้อย่างปลอดภัย — **ship a
   release signed with the new key** and publish a clear notice that the old
   key is revoked; users on versions that trusted the leaked key may need to
   **manually download the new installer once**, since further auto-updates
   cannot safely rely on the old key.
6. **บันทึกเหตุการณ์**: วันที่ทราบเรื่อง, ช่องทางที่รั่ว (เท่าที่ทราบ), การยืนยันว่า
   กุญแจเก่าถูกเพิกถอนจากทุกที่ (GitHub secret, backup offline, build log/cache) —
   **record the incident**: date discovered, leak vector (as far as known), and
   confirmation that the old key is revoked everywhere (GitHub secret, offline
   backup, any build log/cache).
7. **ห้าม** ใช้กุญแจของ G-Music เป็นทางลัดชั่วคราวระหว่างกู้คืน — **never** use the
   G-Music key as a temporary stopgap during recovery.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | candidate | Created the signing-key custody runbook with placeholder roles, storage, verification, rotation-drill and leak-response procedures for H0 | uncommitted | LALIN |
