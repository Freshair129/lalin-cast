# ข้อกำหนดการใช้งาน — Lalin Cast

_ภาษาไทยเป็นภาษาหลักของเอกสารนี้ คำแปลภาษาอังกฤษอยู่ด้านล่าง (English translation follows the
Thai text)._

เอกสารฉบับนี้เป็นสถานะปัจจุบันของแผนปรับปรุง H0 (`docs/plans/H0_RELEASE_READINESS_PLAN.md`) และ
**ผ่านการอนุมัติจากผู้ก่อตั้งโปรเจกต์แล้วเมื่อ 2026-09-21** (human gate H1) การแก้ไขเนื้อหาในอนาคตที่เปลี่ยน
สิ่งที่แอปเก็บ ส่ง หรือสัญญากับผู้ใช้ ต้องให้ผู้ก่อตั้งอนุมัติอีกครั้งก่อนเผยแพร่

## 1. โปรเจกต์อิสระ ไม่ได้เป็นส่วนหนึ่งของ YouTube หรือ Google

Lalin Cast เป็นโปรเจกต์อิสระที่พัฒนาโดยบุคคลที่สาม YouTube LLC และ Google LLC ไม่ได้สร้าง, ไม่ได้
รับรอง, ไม่ได้สนับสนุน, ไม่ได้ตรวจสอบรับรอง (certify) และไม่มีความเกี่ยวข้องใด ๆ กับ Lalin Cast
เครื่องหมายการค้า "YouTube" และ "Google" เป็นทรัพย์สินของเจ้าของแต่ละราย การใช้ชื่อเหล่านี้ในเอกสาร
นี้เป็นเพียงการอธิบายว่าแอปนี้เชื่อมต่อกับบริการใดเท่านั้น ไม่ได้สื่อถึงความเป็นเจ้าของหรือความสัมพันธ์
ใด ๆ กับเจ้าของเครื่องหมายการค้านั้น

## 2. สิ่งที่ Lalin Cast ทำ

Lalin Cast เป็นเชลล์ Windows ที่เขียนด้วย Rust และ Tauri v2 ซึ่งเปิดหน้าเว็บ YouTube TV จริงจาก
`https://www.youtube.com/tv` ในหน้าต่างของตัวเอง (remote WebView) พร้อมกลไกเสริมของตัวเอง เช่น
เมนูเต็มจอ/อยู่บนสุดเสมอ, การอัปเดตแอปแบบมีการยืนยันจากผู้ใช้, และการตอบสนองโปรโตคอล DIAL บนเครือข่าย
ท้องถิ่นเพื่อให้แอป YouTube บนมือถือค้นหาเจอ Lalin Cast บนเครือข่ายเดียวกันได้ Lalin Cast ไม่ได้ดัดแปลง
เนื้อหา, โฆษณา, หรือฟีเจอร์ใด ๆ ที่ YouTube ส่งมา และไม่ได้ดัก อ่าน หรือแก้ไขการรับส่งข้อมูลระหว่าง
WebView กับ YouTube เลย ข้อยกเว้นเดียวคือตัวเลือกที่ผู้ใช้เปิดเองและปิดไว้เป็นค่าเริ่มต้น สำหรับซ่อน
ชั้น Shorts และแท็บ Shorts ด้วย CSS ของ Lalin Cast เองบนหน้าที่ถูก render ออกมาแล้ว ซึ่งเป็นการเปลี่ยน
การแสดงผลในหน้าต่างของผู้ใช้เท่านั้น ไม่ได้เปลี่ยนข้อมูลหรือการทำงานของ YouTube (ดู
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md))
นอกเหนือจากนั้น สิ่งที่ปรากฏในหน้าเป็นไปตามที่ YouTube ส่งมาให้ WebView โดยตรง

## 3. ข้อผูกพันกับ YouTube

การใช้เนื้อหา YouTube ผ่าน Lalin Cast ยังคงอยู่ภายใต้ข้อกำหนดการให้บริการ (Terms of Service) ของ
YouTube ทุกประการ (ดูที่ `https://www.youtube.com/t/terms`) ผู้ใช้ต้องยอมรับและปฏิบัติตามข้อกำหนด
เหล่านั้นเพื่อใช้บริการ YouTube ผ่านแอปนี้ Lalin Cast ไม่ได้เป็นคู่สัญญาในความสัมพันธ์ระหว่างผู้ใช้กับ
YouTube และไม่รับผิดชอบต่อการเปลี่ยนแปลงเงื่อนไขหรือการระงับบัญชีใด ๆ ที่ YouTube เป็นผู้ดำเนินการ

## 4. อายุผู้ใช้งาน

Lalin Cast ไม่มีระบบตรวจสอบอายุของตัวเอง อายุขั้นต่ำในการใช้บริการ YouTube ให้เป็นไปตามข้อกำหนดของ
YouTube เอง (ปัจจุบันกำหนดขั้นต่ำที่ 13 ปี หรือมากกว่านั้นในบางประเทศ) ผู้ปกครองหรือผู้ดูแลมีหน้าที่
กำกับดูแลการใช้งานของผู้เยาว์

## 5. แอปนี้อาจหยุดทำงานได้โดยไม่แจ้งล่วงหน้า

Lalin Cast โหลดหน้าเว็บของ YouTube ผ่าน WebView โดยตรง หาก YouTube เปลี่ยนโครงสร้างหน้า, User-Agent
ที่รองรับ, หรือพฤติกรรมของหน้า Leanback บางฟีเจอร์หรือทั้งแอปอาจหยุดทำงานได้ทันทีโดยไม่มีการแจ้งเตือน
ล่วงหน้าจาก Lalin และไม่มีการรับประกันว่าแอปจะใช้งานได้ต่อเนื่องหรือเข้ากันได้กับ YouTube ในอนาคต

## 6. ไม่มีการรับประกัน (No warranty)

Lalin Cast จัดให้ "ตามสภาพที่เป็นอยู่" (AS IS) โดยไม่มีการรับประกันไม่ว่ารูปแบบใด ไม่ว่าจะโดยชัดแจ้ง
หรือโดยนัย รวมถึงแต่ไม่จำกัดเพียงการรับประกันความสามารถในเชิงพาณิชย์, ความเหมาะสมกับวัตถุประสงค์ใด
วัตถุประสงค์หนึ่ง, และการไม่ละเมิดสิทธิ์ ผู้พัฒนาไม่รับผิดต่อความเสียหายใด ๆ ที่เกิดจากการใช้หรือไม่
สามารถใช้งานแอปนี้ได้ ไม่ว่าจะเป็นความเสียหายทางตรง, ทางอ้อม, พิเศษ, หรือที่เป็นผลสืบเนื่อง สอดคล้อง
กับเงื่อนไข "AS IS" ของสัญญาอนุญาตของไลบรารีที่ใช้ (ดู [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md))

## 7. บุคคลที่สามและ third-party notices

Lalin Cast ใช้ไลบรารีโอเพนซอร์สหลายตัว และเก็บสำเนา VacuumTube ไว้เป็นข้อมูลอ้างอิง รายละเอียด
สัญญาอนุญาตของแต่ละส่วนอยู่ที่ [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) ซอร์สโค้ดของ
Lalin Cast เองเผยแพร่ภายใต้ Apache License 2.0 ดู [`LICENSE`](LICENSE) และ
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md)

## 8. การเปลี่ยนแปลงเอกสารนี้

Lalin อาจปรับปรุงข้อกำหนดนี้ได้ตามความจำเป็น (เช่นเมื่อพฤติกรรมของแอปเปลี่ยนไป) การใช้งานแอปต่อหลังมี
การปรับปรุงถือว่ายอมรับข้อกำหนดฉบับล่าสุด

---

# Terms of Use — Lalin Cast (English)

_This is an English translation of the Thai text above, which is the primary version of this
document._

This document reflects the current state of the H0 readiness plan
(`docs/plans/H0_RELEASE_READINESS_PLAN.md`). It **was approved by the project founder on
2026-09-21** (human gate H1). Any future change to what the app stores, sends or promises to users
needs the founder's approval again before it is published.

## 1. An independent project, not part of YouTube or Google

Lalin Cast is an independent, third-party project. YouTube LLC and Google LLC did not create it,
do not endorse it, do not sponsor it, do not certify it, and have no affiliation with it
whatsoever. The "YouTube" and "Google" trademarks are the property of their respective owners.
Naming them in this document only describes which service this app connects to; it does not imply
ownership of, or any relationship with, the owners of those marks.

## 2. What Lalin Cast does

Lalin Cast is a Windows shell written in Rust and Tauri v2 that opens the real YouTube TV page
from `https://www.youtube.com/tv` in its own window (a remote WebView), plus its own supporting
features such as a fullscreen/always-on-top menu, a user-confirmed app updater, and a local-network
DIAL responder that lets the YouTube mobile app discover Lalin Cast on the same network. Lalin
Cast does not modify the content, advertising, or features YouTube serves, and it never intercepts,
reads, or rewrites the traffic between the WebView and YouTube. The single exception is an opt-in
setting, off by default, that hides the Shorts shelf and the Shorts navigation tab using Lalin
Cast's own CSS on the already-rendered page: a presentation change inside the user's own window
that alters neither YouTube's data nor its behaviour (see
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md)).
Apart from that, whatever appears there is exactly what YouTube serves to the WebView.

## 3. Obligations to YouTube

Using YouTube content through Lalin Cast remains fully subject to YouTube's own Terms of Service
(see `https://www.youtube.com/t/terms`). Users must accept and follow those terms to use YouTube
through this app. Lalin Cast is not a party to the relationship between the user and YouTube, and
is not responsible for any change in terms or account action that YouTube itself makes.

## 4. Age requirement

Lalin Cast has no age-verification system of its own. The minimum age to use YouTube's service
follows YouTube's own requirements (currently a minimum of 13, or higher in some countries).
Parents or guardians are responsible for supervising a minor's use of the app.

## 5. This app can stop working without notice

Lalin Cast loads YouTube's own web page directly through a WebView. If YouTube changes its page
structure, its supported User-Agents, or the behavior of the Leanback surface, some features or
the whole app can stop working immediately with no advance notice from Lalin, and there is no
guarantee of continued operation or compatibility with YouTube going forward.

## 6. No warranty

Lalin Cast is provided "AS IS", without warranty of any kind, express or implied, including but
not limited to the warranties of merchantability, fitness for a particular purpose, and
non-infringement. The developers are not liable for any damages arising from the use or inability
to use this app, whether direct, indirect, special, or consequential — consistent with the "AS IS"
terms of the libraries it depends on (see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)).

## 7. Third parties and third-party notices

Lalin Cast uses a number of open-source libraries and retains a copy of VacuumTube as a reference.
Their license details are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Lalin Cast's own
source code is licensed under the Apache License 2.0; see [`LICENSE`](LICENSE) and
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md).

## 8. Changes to this document

Lalin may update these terms as needed (for example, when the app's behavior changes). Continuing
to use the app after an update means accepting the latest version of these terms.
