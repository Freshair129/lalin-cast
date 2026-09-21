---
version: "0.1.0b"
created_at: "2026-09-21T03:10:00+07:00,LALIN,uncommitted"
last_update: "2026-09-21T03:10:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "architecture-decision-record"
  scope: "Founder decision on escalation ก: what Lalin Cast may and may not change about the embedded YouTube page, and the boundary that governs every future request of this kind"
---

# ADR-004 — Client-side Modification Boundary

## Decision status

**APPROVED — RECORDS THE FOUNDER'S DECISION ON ESCALATION ก, CLOSES IT.** เอกสารนี้บันทึกการตัดสินที่
ผู้ก่อตั้งให้ไว้แล้วก่อนเริ่ม wave 8 (`docs/plans/W8_BOUNDARY_PLAN.md`) ครบทั้งเจ็ดแถวของตาราง escalation
ก ไม่ใช่ข้อเสนอที่รอการอนุมัติ — wave 8 เป็นการนำการตัดสินนี้ไปปฏิบัติ

Complexity: **C-1** (เอกสารล้วน ไม่มีโค้ด). Risk: **LOW**, แต่ผลของการตัดสินผิดสูง เพราะเป็นเส้นแบ่งที่ใช้
ตัดสินคำขอ feature ทุกตัวเกี่ยวกับหน้า YouTube ต่อจากนี้

## Context

ตั้งแต่ ADR-001 เป็นต้นมา Lalin Cast มี "ad-filter boundary" อยู่แล้วในหลักการ (P0 ไม่เพิ่ม custom
YouTube-specific network bypass) แต่ยังไม่เคยมีการตัดสินที่ครอบคลุมคำขอ feature ทั้งตระกูลที่คล้ายกัน:
ตัวกรองโฆษณา, SponsorBlock, DeArrow, Return YouTube Dislike, การซ่อน UI บางส่วนของ YouTube (Shorts,
guide tabs), userstyle ที่ผู้ใช้ใส่เอง, และโหมด low-memory ที่แก้ config ของ YouTube เอง คำขอเหล่านี้ถูก
รวบเป็น "escalation ก" และส่งให้ผู้ก่อตั้งตัดสินก่อน wave 8 เริ่ม เหตุผลที่ต้องรวบตัดสินพร้อมกัน:

- upstream ที่ Lalin Cast อ้างอิง (`reference/vacuumtube`) มีโมดูล `hide-shorts.js` และ `guide-tabs.js`
  ที่ทำงานโดย **ดักและเขียนทับ response ของ `/youtubei/v1/browse` และ `/youtubei/v1/guide`** — กลไก
  ประเภทเดียวกับตัวกรองโฆษณาทุกประการ (intercept + rewrite network response) เพียงแต่เป้าหมายต่างกัน
  (UI element แทนโฆษณา) การจะซ่อน Shorts/guide tabs โดยไม่ผูกกับคำถามเรื่องการดักทราฟฟิกเป็นไปไม่ได้ถ้า
  ทำตามแบบ upstream
- SponsorBlock, DeArrow และ Return YouTube Dislike ต่างพึ่งพา third-party API ภายนอกและมีเงื่อนไข
  licensing ที่ยังไม่ได้ตรวจ (การใช้เชิงพาณิชย์/redistribution) ซึ่งเป็นคำถามที่ยังไม่มีคำตอบและจะไม่มี
  ความหมายเลยถ้าตัดสินใจไม่ทำ ad/content-modification ประเภทนี้อยู่ดี
- H20 (ปลด `continue-on-error` ของ CI smoke job) ถูกผูกรวมไว้ใน escalation เดียวกันเพราะเป็นเงื่อนไข
  gate ที่ค้างมาตั้งแต่ wave 6/7 และมีหลักฐานพร้อมแล้ว (เขียวสองรอบติดใน PR #9 และ #10)

## Decision

ตารางด้านล่างคือการตัดสินของผู้ก่อตั้งครบทั้งเจ็ดแถว พร้อมเหตุผลและทางเลือกที่พิจารณาแล้วไม่เลือกในแต่ละ
แถว:

### 1. Ad filtering — ไม่ทำ ถาวร

**ผล:** Lalin Cast จะไม่มีและจะไม่เพิ่มตัวกรองโฆษณาในทุกรูปแบบ ไม่ว่าจะเป็นการดัก network response, การ
skip โฆษณาอัตโนมัติ, หรือการซ่อนช่องโฆษณาด้วย selector เฉพาะ

**เหตุผล:** โฆษณาคือรายได้ของผู้สร้างเนื้อหาและ YouTube/Google โดยตรง การกรองโฆษณาเป็นการเปลี่ยนแปลง
โมเดลธุรกิจของแพลตฟอร์มที่ Lalin Cast พึ่งพาอยู่ (Lalin Cast ไม่ใช่ YouTube client ของตัวเอง เป็นเพียง
เปลือกที่โหลด Leanback surface จริง) ทำให้ความเสี่ยงด้านสัญญา/ToS และความเสี่ยงที่ YouTube จะปิดกั้น
surface ทั้งหมดสูงกว่าประโยชน์ที่ได้ นอกจากนี้ผู้ใช้ Premium ที่จ่ายเงินเพื่อไม่มีโฆษณาอยู่แล้วไม่ควรถูก
ทำให้สับสนว่า Lalin Cast มีบทบาทอะไรในเรื่องนี้

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| ดักและแก้ response ของ `/youtubei/v1/*` เพื่อลบ ad pod (แบบ upstream ทั่วไปทำ) | ผิดเส้นแบ่งเรื่อง network interception โดยตรง — ดูหัวข้อ "เส้นแบ่ง" ด้านล่าง |
| ใช้ CSS ซ่อนเฉพาะ element โฆษณาที่ render แล้ว (ไม่แตะ network) | องค์ประกอบโฆษณาปนอยู่ในโครงสร้างเดียวกับวิดีโอปกติและเปลี่ยนบ่อยกว่า Shorts shelf มาก ทำให้ selector ผิดพลาดสูง และยังคงเป็นการ "กรองโฆษณา" ในทางปฏิบัติแม้จะทำผ่าน CSS ก็ตาม — ผลลัพธ์ที่ผู้ใช้เห็นคือแอปบล็อกโฆษณา ซึ่งเป็นสิ่งที่ตัดสินใจไม่ทำ ไม่ใช่แค่หลีกเลี่ยงวิธีทำ |
| เพิ่มเป็นตัวเลือก opt-in ปิดเป็นค่าเริ่มต้น | ยังคงเป็นความสามารถกรองโฆษณาที่มีอยู่ในแอป แม้ปิดอยู่ ก็ทำให้คำถามเรื่อง ToS/รายได้ผู้สร้างเนื้อหาไม่หายไป |

### 2. SponsorBlock / DeArrow / Return YouTube Dislike — ไม่ทำ

**ผล:** ไม่ port หรือ integrate ทั้งสามโมดูลนี้ ไม่ว่าจะเป็นการข้าม sponsor segment, การแทนที่ thumbnail/
title, หรือการแสดงจำนวน dislike จริง

**เหตุผล:** ทั้งสามพึ่งพา third-party API ภายนอก (`sponsor.ajay.app`, DeArrow's API, Return YouTube
Dislike's API) ซึ่งหมายถึงการเชื่อมต่อเครือข่ายใหม่ที่ไม่ใช่ของ Lalin หรือ YouTube เอง (ขัดกับจุดยืนเรื่อง
telemetry/เครือข่ายขั้นต่ำที่ `PRIVACY.md` ยืนยันมาตลอด) และเงื่อนไข license ของทั้งสามยังไม่ได้ตรวจสอบ
ว่าเข้ากันได้กับการแจกจ่าย Lalin Cast แบบ non-commercial/commercial หรือไม่ **เนื่องจากข้อ 1 ตัดสินใจไม่
ทำ ad filtering ไปแล้ว คำถามเรื่อง license ของ SponsorBlock/DeArrow จึงตกไปเองโดยไม่ต้องตอบ** — ทั้งสอง
โมดูลเป็นกลไกประเภทเดียวกับ ad filtering (ข้าม/แก้ไขสิ่งที่ผู้สร้างเนื้อหาหรือ YouTube ตั้งใจแสดง) เพียงแค่
เป็นโฆษณาแฝง (sponsor segment) แทนโฆษณา YouTube เอง

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| Integrate เฉพาะ Return YouTube Dislike (อ่านอย่างเดียว ไม่ตัดข้าม) | ยังต้องเรียก third-party API ภายนอกทุกครั้งที่โหลดวิดีโอ ขัดกับจุดยืนเรื่องเครือข่ายขั้นต่ำ และเปิดช่องให้ third-party service เห็น video id ที่ผู้ใช้กำลังดู ซึ่งเป็นการรั่วไหลข้อมูลการรับชมที่ `PRIVACY.md` ไม่เคยมีมาก่อน |
| รอให้ผู้ใช้ตรวจ license เอง แล้วตัดสินใจทีหลัง | เลื่อนปัญหาที่ตัดสินได้ตอนนี้ออกไปโดยไม่จำเป็น เพราะข้อ 1 ทำให้คำถามนี้ตกไปแล้ว |

### 3. ซ่อน Shorts shelf และ guide tabs — ทำ แบบ opt-in ด้วย CSS/DOM เท่านั้น

**ผล:** ทำได้ แต่ **ต้องเป็น opt-in ปิดเป็นค่าเริ่มต้น** (`hideShorts`, `hideGuideTabs`) และทำได้ด้วยวิธี
เดียวเท่านั้น: อ่าน DOM ที่ render เสร็จแล้ว ติดคลาสของเราเอง แล้วซ่อนด้วย stylesheet ของเราเอง — ไม่แตะ
network layer ไม่แก้ response ไม่ลบ node

**เหตุผล:** นี่คือความสามารถ VacuumTube ต้นทางมี (`hide-shorts.js`, `guide-tabs.js`) แต่ **เราจงใจไม่
port วิธีที่ upstream ใช้** เพราะ upstream ดักและเขียนทับ response ของ `/youtubei/v1/browse` และ
`/youtubei/v1/guide` ซึ่งเป็นกลไกเดียวกับ ad filtering ที่ข้อ 1 ตัดสินใจไม่ทำ สิ่งที่ต่างจากข้อ 1 คือ
**เป้าหมาย** — ซ่อน element การนำทาง ไม่ใช่โฆษณาหรือรายได้ของผู้สร้างเนื้อหา — และ **วิธีทำ** ที่เลือกใช้
คือการอ่าน DOM ที่ render เสร็จแล้วเท่านั้น ซึ่งเป็นกลไกเดียวกับ touch overlay (wave 4) และ help overlay
(wave 5) ที่ผ่านมาแล้วและไม่เคยถูกตั้งคำถามเรื่องการดักข้อมูล — ทั้งสองสิ่งนั้นก็สร้าง DOM/อ่าน DOM ของหน้า
เองเช่นกัน ไม่ใช่สิ่งใหม่ในหลักการ

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| Port `hide-shorts.js`/`guide-tabs.js` ตรงตาม upstream (ดัก response) | ผิดเส้นแบ่งเรื่อง network interception — ดูหัวข้อ "เส้นแบ่ง" ด้านล่าง |
| เปิดเป็นค่าเริ่มต้น (ไม่ opt-in) | selector ของ Leanback ไม่มีสัญญาว่าจะคงที่ (risk ที่บันทึกไว้ใน `docs/plans/W8_BOUNDARY_PLAN.md`) การเปิดเป็นค่าเริ่มต้นหมายถึงผู้ใช้ทุกคนเจอความเสี่ยงนี้แม้ไม่ต้องการฟีเจอร์นี้ |
| ใช้ `textContent`/`aria-label` จับคำว่า "Shorts" | เปลี่ยนตามภาษาของบัญชี YouTube ทำให้ matcher ใช้ไม่ได้กับผู้ใช้ที่ตั้งภาษาอื่น ต้องใช้ attribute/tag ที่ไม่ใช่ข้อความแทน |
| ลบ node ออกจาก DOM แทนการซ่อนด้วย CSS | เสี่ยงทำให้ Leanback JS internal state พัง (ตามที่ upstream เองบันทึกไว้ว่าการปิดแท็บ Home ทำให้หน้าเว็บพัง) การซ่อนด้วย CSS (`display: none`) reversible และปลอดภัยกว่า |

### 4. Userstyle ที่ผู้ใช้ใส่เอง (custom CSS) — ไม่ทำตอนนี้

**ผล:** ยังไม่เพิ่มความสามารถให้ผู้ใช้ใส่ CSS ของตัวเองเข้าไปในหน้า YouTube

**เหตุผล:** CSS ที่ผู้ใช้ใส่เองสามารถทำสิ่งที่เกินขอบเขตการ "ซ่อนด้วย CSS" ของข้อ 3 ได้ง่าย เช่น
`content:`/`background-image:` ที่ดึงทรัพยากรจากอินเทอร์เน็ต, selector ที่บังเอิญเปลี่ยนพฤติกรรม layout
จนทำให้ปุ่มสำคัญใช้ไม่ได้ หรือการฝัง CSS ที่พยายามหลอกให้ดูเหมือนไม่มีโฆษณา (ทางอ้อมของข้อ 1) การอนุญาต
ให้ใส่ CSS ใดก็ได้จึงต้องมี **sandbox design** (จำกัด selector ที่แตะได้ จำกัด property ที่ใช้ได้ ป้องกัน
การดึงทรัพยากรภายนอก) ซึ่งเป็นงานออกแบบที่ใหญ่พอจะต้องมี ADR ของตัวเอง ไม่ใช่ส่วนขยายของ wave 8

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| อนุญาต CSS แบบไม่มี sandbox (textarea ธรรมดา) | เปิดช่องให้ CSS ดึงทรัพยากรภายนอกหรือปิดบังโฆษณาทางอ้อม ขัดกับข้อ 1 และความปลอดภัยของ `injected.js` |
| จำกัดเฉพาะ property ที่ "ปลอดภัย" แบบ hardcode รายการสั้น ๆ ใน wave นี้ | ยังต้องออกแบบ allowlist, parser และ CSP ให้รัดกุมพอ ซึ่งเป็นขอบเขตงานเท่ากับ ADR แยกอยู่ดี ไม่ใช่สิ่งที่ทำ "เผื่อ" ได้ในโค้ดของฟีเจอร์อื่น |

### 5. Low-memory mode ที่แก้ config JSON ของ YouTube — ไม่ทำ

**ผล:** ไม่มีโหมด low-memory ที่ไปแก้ config หรือ state object ของหน้า YouTube (เช่น
`ytcfg`/`INNERTUBE_CONTEXT` หรือ response JSON อื่น) เพื่อลดการโหลด/หน่วยความจำ

**เหตุผล:** วิธีที่โหมดแบบนี้มักใช้คือแก้ config JSON ที่ YouTube ส่งมา หรือ intercept request เพื่อขอ
ข้อมูลชุดเล็กลง — ทั้งสองแบบเป็นการแก้ไข/ดักข้อมูลของ YouTube โดยตรง ผิดเส้นแบ่งเดียวกับข้อ 1 และ 3 ทันที
ไม่มีทางทำ low-memory mode แบบนี้โดยไม่แตะ config/network ของ YouTube เลย

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| แก้ `ytcfg`/response JSON เพื่อปิด feature ที่กินหน่วยความจำ | ผิดเส้นแบ่งเรื่อง network/config interception โดยตรง |
| ใช้ `hardwareDecoding=false` (มีอยู่แล้วตั้งแต่ wave 4) เป็นทางแก้บางส่วนแทน | ยังคงเป็นตัวเลือกที่เปิดให้ผู้ใช้ใช้ได้อยู่แล้วในขอบเขตที่ไม่แตะข้อมูลของ YouTube — ไม่ใช่ทางเลือกใหม่ที่ต้องตัดสิน เพียงแค่ชี้ว่าคำขอ "low-memory" ส่วนหนึ่งมีทางแก้อยู่แล้วโดยไม่ต้องข้ามเส้นแบ่ง |

### 6. Keep-display-awake — ทำ พร้อมอนุมัติข้อยกเว้นกฎสองข้อ

**ผล:** ทำ กันจอดับ/เครื่องหลับเฉพาะขณะกำลังเล่นวิดีโอจริง (`keepDisplayAwake`, ค่าเริ่มต้นเปิด) ผ่าน
Windows `SetThreadExecutionState` API

**เหตุผล:** นี่เป็นพฤติกรรมมาตรฐานของแอปเล่นสื่อทุกตัวบน Windows (Netflix, YouTube บนเบราว์เซอร์เองก็ทำ)
ไม่แตะ YouTube เลยแม้แต่น้อย — เป็นการเรียก Windows API ฝั่ง native ล้วน ๆ เพื่อบอกระบบปฏิบัติการว่า
เครื่องกำลังถูกใช้งานอยู่ ไม่ส่งหรืออ่านข้อมูลใด ๆ จึงไม่มีคำถามเรื่องเส้นแบ่งเลย ประเด็นเดียวที่ต้องอนุมัติ
คือกฎมาตรฐานของโปรเจกต์ที่ห้าม `unsafe` และห้ามเพิ่ม `windows-sys` feature ใหม่ เพราะ
`SetThreadExecutionState` เป็น raw Win32 API ที่ต้องเรียกผ่าน `unsafe` block และต้องเปิด feature
`Win32_System_Power` จึงจะมีสัญลักษณ์นี้ให้เรียก

**ข้อยกเว้นกฎที่อนุมัติ (เฉพาะสอง scope นี้เท่านั้น ไม่ใช่การเปิดกว้าง `unsafe`/feature โดยทั่วไป):**

1. เปิด feature `Win32_System_Power` ของ crate `windows-sys` (crate เดิม ไม่ใช่ crate ใหม่) — ไม่เปิด
   feature อื่นใดเพิ่ม
2. เพิ่ม `unsafe` block ได้หนึ่งจุดเท่านั้น คือรอบการเรียก `SetThreadExecutionState` ใน `src/power.rs`
   พร้อม `// SAFETY:` comment อธิบายว่า argument เป็น bitmask คงที่และ API นี้ไม่มี precondition ด้าน
   หน่วยความจำ (ไม่รับ pointer, ไม่เขียนหน่วยความจำร่วมกับ thread อื่น)

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| ไม่ทำเลย ปล่อยให้ Windows Power plan จัดการเอง | ผู้ใช้ฟังวิดีโอยาว/ดู TV บนจอที่ตั้งเวลาดับจอสั้นจะโดนจอดับระหว่างดูอยู่บ่อย ๆ เป็นปัญหาการใช้งานจริงที่ VacuumTube/Netflix แก้กันมาตรฐานอยู่แล้ว |
| กันจอดับตลอดเวลาที่แอปเปิดอยู่ (ไม่ผูกกับสถานะเล่น) | สิ้นเปลืองพลังงานเกินจำเป็นเมื่อหยุดเล่นหรือเปิดแอปทิ้งไว้เฉย ๆ ขัดกับพฤติกรรมมาตรฐานของแอปเล่นสื่อที่กันจอดับเฉพาะตอนเล่นจริง |
| เรียกผ่าน PowerShell (`powercfg`/`SetThreadExecutionState` แบบ external process) แทน raw API | เพิ่ม process ใหม่ทุกครั้งที่สถานะเล่นเปลี่ยน ช้ากว่าและซับซ้อนกว่า raw API เรียกในเธรดเดียวที่มีอยู่แล้ว ไม่ได้ลดความเสี่ยงจริง เพราะยังต้องเรียก system API อยู่ดี เพียงแค่ผ่านชั้น process เพิ่ม |

### 7. H20 — ปลด `continue-on-error` ของ CI smoke job

**ผล:** ทำ — smoke job ใน `ci.yml` (ที่ build `lalin-cast.exe` debug และรันจริงด้วย
`--lifecycle close --request-id ci-smoke` เพื่อตรวจ `lifecycle.json`) กลายเป็น check ที่บังคับผ่าน
(blocking) ไม่ใช่ advisory อีกต่อไป

**เหตุผล:** เป็น gate ที่ตั้งไว้ตั้งแต่ wave 6 ว่าจะปลด `continue-on-error` ก็ต่อเมื่อ job นี้เขียวติดกัน
สองรอบ — เกณฑ์นั้นครบแล้วใน PR #9 และ PR #10 (ดู `docs/runbooks/RELEASE_CHECKLIST.md`) การปลดจึงเป็นการ
ทำตามเกณฑ์ที่ตกลงกันไว้ล่วงหน้า ไม่ใช่การตัดสินใจใหม่

**ทางเลือกที่พิจารณาแล้วไม่เลือก:**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| รอเขียวเพิ่มอีกหลายรอบก่อนปลด | เกณฑ์ "สองรอบติด" ถูกกำหนดไว้แล้วตั้งแต่ wave 6 และครบแล้ว การเลื่อนออกไปอีกโดยไม่มีเหตุผลใหม่คือการเปลี่ยนเกณฑ์หลังจากรู้ผลแล้ว |
| ปลด `continue-on-error` ของ job อื่นในคราวเดียวกัน | นอกขอบเขตของ gate นี้ (H20 พูดถึง smoke job เดียว) การรวม job อื่นเข้ามาโดยไม่มีเกณฑ์ของตัวเองเป็นการขยายขอบเขตที่ไม่ได้รับอนุมัติ |

## เส้นแบ่งที่ใช้ตัดสินกรณีในอนาคต (สำคัญที่สุดของเอกสารนี้)

จากทั้งเจ็ดการตัดสินข้างบน สรุปเป็นกฎเดียวที่ใช้พิจารณาคำขอ feature ใหม่ ๆ เกี่ยวกับหน้า YouTube ต่อจาก
นี้ไป:

> **เปลี่ยนการแสดงผลฝั่ง client ในหน้าต่างของเราเอง = ทำได้** ถ้า (ก) เป็น **opt-in** ปิดเป็นค่าเริ่มต้น
> และ (ข) ทำโดย **อ่าน DOM/state ที่ render เสร็จแล้วเท่านั้น** แล้วบันทึกไว้อย่างชัดเจนว่าเป็น
> "พฤติกรรมที่สังเกตได้" (observed behavior) ไม่ใช่ "สัญญา" ที่ YouTube ให้ไว้ — เพราะ selector/โครงสร้าง
> หน้าเปลี่ยนได้ทุกเมื่อโดยไม่แจ้งล่วงหน้า
>
> **ดัก แก้ไข หรือปลอมแปลงทราฟฟิกหรือข้อมูลของ YouTube = ไม่ทำ** ไม่ว่าจะเป็น `XMLHttpRequest`,
> `window.fetch`, `Response`, การ override `.open`/`.send`, การแก้ response JSON, การแก้ config
> object (`ytcfg`/`INNERTUBE_CONTEXT`) หรือกลไกอื่นใดที่เข้าถึงชั้นเครือข่ายหรือข้อมูลที่ YouTube ส่งมา
> ก่อนที่หน้าเว็บจะ render ไม่ว่าเป้าหมายปลายทางจะเป็นโฆษณา, sponsor segment, Shorts, หรือสิ่งอื่นใดก็ตาม

กฎนี้ไม่ขึ้นกับว่าเป้าหมายปลายทาง "ดูดี" แค่ไหน (ซ่อน Shorts ฟังดูไม่มีพิษภัยกว่ากรองโฆษณา) — **วิธีทำ**
ต่างหากที่เป็นเส้นแบ่ง ไม่ใช่ผลลัพธ์ที่ผู้ใช้เห็น คำขอในอนาคตที่ต้องแตะ network layer หรือแก้ข้อมูลของ
YouTube เพื่อให้ได้ผลลัพธ์ที่ "ดูเหมือน" ทำได้ด้วย CSS (เช่น "ซ่อนโฆษณาด้วย CSS อย่างเดียวไม่ได้ผล ต้อง
สกัดที่ response ก่อน") ให้ถือว่าข้ามเส้นแบ่งและปฏิเสธ ไม่ใช่หาวิธี "ทำ CSS แบบพิเศษ" มาเลี่ยง

**เอกสารนี้ปิด escalation ก** ทุกคำขอในตระกูลนี้ (ตัวกรองโฆษณา, SponsorBlock, DeArrow, RYD, userstyle,
low-memory-by-config, และคำขอซ่อน/แก้ UI อื่น ๆ ของ YouTube ในอนาคต) ให้ตรวจกับเส้นแบ่งข้างบนโดยตรง
ไม่ต้องเปิด escalation ใหม่ เว้นแต่คำขอนั้นเสนอกลไกที่ไม่เคยพิจารณามาก่อนจริง ๆ (เช่น sandbox design ของ
userstyle ในข้อ 4 ซึ่งต้องมี ADR ของตัวเองอยู่แล้วตามที่ระบุไว้)

## Security and ownership rules

- **ไม่มี network interception ในแอปนี้เลย ไม่ว่าฟีเจอร์ใดก็ตาม** — ไม่มีการ override
  `XMLHttpRequest`/`window.fetch`/`Response`, ไม่มีการ hook `.open`/`.send`, และไม่มี native WebView2
  network-interception adapter ใช้งานอยู่ในโค้ดฐานนี้ (ADR-001 เคยเว้นช่องไว้ในตาราง feature-matrix ว่า
  "Electron request/response interception … not in P0"; wave 8 ปิดช่องนั้นถาวรแทนที่จะเป็นแค่ "ยังไม่ทำ")
  ตรวจได้ด้วย grep เดียวกับที่ `docs/plans/W8_BOUNDARY_PLAN.md` กำหนดไว้สำหรับ `injected.js`
  (`XMLHttpRequest|window\.fetch|fetch *=|\.open *=|\.send *=|Response\(`)
- การซ่อน Shorts/guide tabs ทำผ่าน `MutationObserver` ที่อ่าน DOM ที่ render เสร็จแล้วเท่านั้น ติด
  class ของ Lalin Cast เอง (`lalin-cast-hidden-shorts`, `lalin-cast-hidden-guide-tab`) แล้วซ่อนด้วย
  `<style id="lalin-cast-hide-style">` ของเราเอง scope ด้วย `data-lalin-hide-shorts`/
  `data-lalin-hide-guide-tabs` บน `documentElement` — ไม่มีการลบ node, ไม่มี `innerHTML`, ไม่ซ่อนแท็บ
  Home, ไม่ซ่อน element ที่กำลัง focus อยู่ ดู `docs/plans/W8_BOUNDARY_PLAN.md` contract ข้อ 3 สำหรับ
  รายละเอียดทางเทคนิคเต็มรูปแบบ
- Matcher การระบุ Shorts shelf/guide tab **ต้องไม่พึ่งข้อความ** (ห้าม match `textContent`/`aria-label`
  เพราะเปลี่ยนตามภาษาบัญชี YouTube) ให้ใช้ tag ของ Leanback หรือ attribute/icon type ที่ไม่ใช่ข้อความ
  แทน — เป็นกฎเดียวกับที่ทำให้ selector "พฤติกรรมที่สังเกตได้ ไม่ใช่สัญญา" ตามเส้นแบ่งข้างบน
- `keepDisplayAwake` เป็น native Windows API เรียกล้วน ๆ ไม่แตะหน้า YouTube หรือเครือข่ายใด ๆ เลย —
  `SetThreadExecutionState` ส่งเฉพาะ bitmask คงที่และไม่รับ/คืนข้อมูลผู้ใช้ ดู `PRIVACY.md` ข้อ 8
  สำหรับคำอธิบายฉบับผู้ใช้
- ทั้งสามคีย์ใหม่ (`keepDisplayAwake`, `hideShorts`, `hideGuideTabs`) เป็นการตั้งค่าในเครื่องล้วน ๆ
  เก็บในไฟล์ `media-settings.json` เดียวกับคีย์อื่นทั้งหมด ไม่มีคีย์ใดถูกส่งออกนอกเครื่อง
- `unsafe` เพิ่มได้เฉพาะหนึ่งจุดตามที่อนุมัติในข้อ 6 ข้างบน (`src/power.rs`,
  `SetThreadExecutionState`, พร้อม `// SAFETY:` comment) เพิ่มเติมจาก `unsafe` block สองจุดที่มีอยู่
  ก่อนแล้วและผ่านการรีวิวมาก่อน wave นี้ ได้แก่ `GetUserDefaultUILanguage` ใน `src/i18n.rs` และ
  `AttachConsole` ใน `src/lib.rs` — โค้ดฐานนี้จึงไม่ใช่และไม่เคยเป็น
  `#![forbid(unsafe_code)]`-equivalent นอกเหนือจาก `power.rs`; wave 8 ไม่เพิ่ม `unsafe` block อื่น
  และไม่เพิ่ม crate ใหม่
- `windows-sys` เพิ่ม feature ได้เฉพาะ `Win32_System_Power` ตามที่อนุมัติในข้อ 6 — ไม่มี crate ใหม่ใน
  wave นี้

## Sources

- `reference/vacuumtube/src/preload/modules/hide-shorts.js`,
  `reference/vacuumtube/src/preload/modules/guide-tabs.js` — upstream ที่ถูกพิจารณาแล้วไม่ port
  (ดู `LALIN_PROVENANCE.md`)
- [`docs/architecture/ADR-001-CAST-TAURI-PORT.md`](ADR-001-CAST-TAURI-PORT.md) — ad-filter boundary
  เดิมที่เอกสารนี้ขยายให้ครอบคลุมทั้งตระกูล
- `docs/plans/W8_BOUNDARY_PLAN.md` — DAG, contract และ acceptance criteria ของการนำการตัดสินนี้ไป
  ปฏิบัติ
- [SponsorBlock](https://sponsor.ajay.app/), [DeArrow](https://dearrow.ajay.app/),
  [Return YouTube Dislike](https://www.returnyoutubedislike.com/) — โปรเจกต์ third-party ที่ข้อ 2
  ตัดสินใจไม่ integrate

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-21 | beta | Recorded the founder's escalation ก decision across all seven rows (no ad filtering, no SponsorBlock/DeArrow/RYD, opt-in CSS-only Shorts/guide-tab hiding, no userstyle sandbox yet, no config-editing low-memory mode, keep-display-awake with its two rule exceptions, H20 smoke-job promotion), the client-side modification boundary for future requests, and closed escalation ก | uncommitted | LALIN |
