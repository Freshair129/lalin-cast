# นโยบายความปลอดภัย — Lalin Cast / Security Policy

_ภาษาไทยเป็นภาษาหลักของเอกสารนี้ คำแปลภาษาอังกฤษอยู่ด้านล่าง (English translation follows the Thai
text)._

Lalin Cast เป็นโปรเจกต์อิสระของบุคคลที่สาม ไม่ได้เกี่ยวข้อง ไม่ได้รับการรับรอง และไม่ได้เป็นส่วนหนึ่งของ
YouTube หรือ Google — ดู [`README.md`](README.md#disclaimer) และ
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)

## เวอร์ชันที่ได้รับการดูแลด้านความปลอดภัย

Lalin Cast ยังไม่มีการ tag เวอร์ชันเผยแพร่ต่อสาธารณะ (pre-release, พัฒนาอยู่บน branch) — รายงานทั้งหมด
ควรอ้างอิงคอมมิตหรือ branch ที่ใช้ทดสอบ เมื่อเริ่มมีการ tag เวอร์ชันแล้ว มีเฉพาะ **เวอร์ชันล่าสุดที่ tag
ไว้** เท่านั้นที่จะได้รับ patch ด้านความปลอดภัย (ไม่มี long-term support branch แยกต่างหาก)

| เวอร์ชัน | ได้รับการดูแล |
|---|---|
| `main` / pre-release (ยังไม่มี tag) | ใช่ — เป้าหมายปัจจุบัน |
| เวอร์ชัน tag ล่าสุดหลังเผยแพร่ครั้งแรก | ใช่ |
| เวอร์ชัน tag ที่เก่ากว่าเวอร์ชันล่าสุด | ไม่ — กรุณาอัปเดตก่อนรายงาน |

## วิธีรายงานช่องโหว่

**ห้ามเปิด GitHub issue สาธารณะสำหรับช่องโหว่ความปลอดภัย** ให้รายงานผ่าน **GitHub private
vulnerability reporting** ของ repository นี้แทน (แท็บ "Security" > "Report a vulnerability" บน
`github.com/Freshair129/lalin-cast`)

> **หมายเหตุสำคัญ:** ฟีเจอร์นี้ต้องถูก **เปิดใช้งานโดยผู้ก่อตั้งโปรเจกต์ใน repository settings ก่อน**
> (Settings > Security > "Private vulnerability reporting") — นี่คือ **human gate H17** ใน
> `docs/plans/W5_DESKTOP_PLAN.md` ซึ่งยังไม่เสร็จ ณ เวลาที่เขียนเอกสารนี้ จนกว่าจะเปิดใช้งานสำเร็จ ให้
> ผู้ก่อตั้งกำหนดช่องทางรายงานชั่วคราวเอง (เช่น ติดต่อโดยตรงผ่านโปรไฟล์ GitHub ของผู้ดูแล) และปรับปรุง
> เอกสารนี้ทันทีที่เปิดใช้งานได้สำเร็จ

สิ่งที่ควรใส่ในรายงาน: คำอธิบายช่องโหว่, ขั้นตอนทำซ้ำ, ผลกระทบที่เป็นไปได้, เวอร์ชัน/คอมมิตที่ทดสอบ —
**ห้ามใส่รหัสจับคู่ทีวี (TV pairing code), ข้อมูลบัญชี Google/YouTube, คุกกี้ หรือโทเคนจริงในรายงาน**
(คำอธิบายลักษณะของข้อมูลก็เพียงพอ ไม่ต้องแนบค่าจริง)

## ขอบเขต

**อยู่ในขอบเขต** (โค้ดของ Lalin Cast เอง):

- Native updater (`src-tauri/src/updater.rs`, การตรวจสอบลายเซ็น, `latest.json`)
- DIAL SSDP listener และ HTTP device descriptor (`src-tauri/src/dial.rs`)
- Tauri capabilities (`src-tauri/capabilities/*.json`) และขอบเขตคำสั่งที่ expose ให้แต่ละหน้าต่าง
- Injected bridge (`src-tauri/injected.js`) ที่ฉีดเข้าไปในหน้า YouTube TV
- ไฟล์สถานะ/การตั้งค่าในเครื่อง (`media-settings.json`, `lifecycle.json`) และกระบวนการ CLI/lifecycle

**อยู่นอกขอบเขต:**

- ตัว YouTube เอง (`youtube.com`) — รายงานผ่านช่องทางของ Google/YouTube โดยตรง
- ช่องโหว่ในไลบรารี third-party ต้นทาง (รายงานต่อโปรเจกต์ต้นทางโดยตรง — ดูรายชื่อและลิงก์ใน
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md); แจ้ง Lalin Cast เพิ่มเติมได้ถ้าคิดว่ากระทบการใช้
  งานจริงในแอปนี้)
- WebView2 runtime ของ Microsoft
- Windows หรือ hardware ของผู้ใช้เอง

**ความเสี่ยงจากการครอบครองอุปกรณ์ (physical access):** ในโหมดพกพา (ดู [`README.md`](README.md) และ
[`PRIVACY.md`](PRIVACY.md)) โฟลเดอร์ `lalin-cast-data\WebView2` เก็บ session ที่ล็อกอินบัญชี YouTube ไว้
ในไฟล์ธรรมดา ไม่ได้เข้ารหัส — ใครก็ตามที่ได้โฟลเดอร์ทั้งชุดไป (เช่น USB หาย) จึงใช้บัญชีนั้นได้ทันที
ซึ่งไม่ใช่ช่องโหว่ของโค้ด Lalin Cast แต่เป็นความเสี่ยงโดยธรรมชาติของข้อมูลที่พกพาได้

## ไม่มี bug bounty

โปรเจกต์นี้ **ไม่มีโปรแกรม bug bounty และไม่มีรางวัลตอบแทนทางการเงิน** สำหรับการรายงานช่องโหว่ ขอบคุณ
ทุกรายงานที่ช่วยให้ Lalin Cast ปลอดภัยขึ้น

---

# Security Policy — Lalin Cast (English)

_This is an English translation of the Thai text above, which is the primary version of this
document._

Lalin Cast is an independent, third-party project with no affiliation to, endorsement from, or
sponsorship by YouTube or Google. See [`README.md`](README.md#disclaimer) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Supported versions

Lalin Cast has not tagged a public release yet (pre-release, developed on a branch) — reports
should reference the commit or branch tested. Once tagging begins, only the **latest tagged
version** receives security patches (no separate long-term-support branch).

| Version | Supported |
|---|---|
| `main` / pre-release (no tag yet) | Yes — current target |
| Latest tagged version after the first release | Yes |
| Any tagged version older than the latest | No — please update first |

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.** Report it instead through this
repository's **GitHub private vulnerability reporting** (the "Security" tab > "Report a
vulnerability" on `github.com/Freshair129/lalin-cast`).

> **Important note:** this feature must be **enabled by the project founder in the repository
> settings first** (Settings > Security > "Private vulnerability reporting") — this is **human gate
> H17** in `docs/plans/W5_DESKTOP_PLAN.md`, not yet done as of this writing. Until it is enabled,
> the founder should set a temporary reporting channel (for example, direct contact through the
> maintainer's GitHub profile) and update this document as soon as it is enabled.

Please include: a description of the vulnerability, reproduction steps, the likely impact, and the
version/commit tested — **do not include a real TV pairing code, Google/YouTube account data,
cookies, or tokens in the report** (describing the kind of data involved is enough; do not attach
real values).

## Scope

**In scope** (Lalin Cast's own code):

- The native updater (`src-tauri/src/updater.rs`, signature verification, `latest.json`)
- The DIAL SSDP listener and HTTP device descriptor (`src-tauri/src/dial.rs`)
- Tauri capabilities (`src-tauri/capabilities/*.json`) and the command surface exposed to each
  window
- The injected bridge (`src-tauri/injected.js`) that runs inside the YouTube TV page
- Local state/settings files (`media-settings.json`, `lifecycle.json`) and the CLI/lifecycle
  process

**Out of scope:**

- YouTube itself (`youtube.com`) — report through Google/YouTube's own channels
- Vulnerabilities in upstream third-party libraries (report to the upstream project directly — see
  the list and links in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md); you may also let Lalin
  Cast know if you believe it affects real usage of this app)
- The Microsoft WebView2 runtime
- The user's own Windows installation or hardware

**Physical-access risk:** in portable mode (see [`README.md`](README.md) and
[`PRIVACY.md`](PRIVACY.md)), the `lalin-cast-data\WebView2` folder holds a signed-in YouTube session
in plain, unencrypted files — anyone who gets the whole folder (for example a lost USB drive) can
use that account immediately, which is not a Lalin Cast code vulnerability but an inherent risk of
data that can be carried around.

## No bug bounty

This project has **no bug bounty program and no financial reward** for vulnerability reports.
Every report that helps make Lalin Cast safer is appreciated.
