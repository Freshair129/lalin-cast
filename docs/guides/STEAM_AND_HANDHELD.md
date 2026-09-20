---
version: "0.1.0b"
created_at: "2026-09-20T23:15:00+07:00,LALIN,uncommitted"
last_update: "2026-09-20T23:15:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "guide"
  scope: "Adding Lalin Cast to Steam as a non-Steam game, Big Picture, controller support and handheld PC (ROG Ally, Legion Go) usage"
---

# Lalin Cast — Steam และอุปกรณ์พกพา (Handheld) / Steam and Handheld Guide

## สถานะ / Status

**CANDIDATE** — คู่มือนี้อธิบายวิธีตั้งค่าตามสัญญา (contract) ของ
[`docs/plans/W3_CONTROLS_PLAN.md`](../plans/W3_CONTROLS_PLAN.md) (การรองรับคอนโทรลเลอร์, คีย์ลัด,
ตัวเลือกบรรทัดคำสั่ง) พฤติกรรมจริงบนอุปกรณ์ Steam Deck / ROG Ally / Legion Go จริงยังเป็น human gate
(H7–H9 ในแผนนั้น) ที่ยังไม่ได้บันทึกหลักฐาน — ขั้นตอนด้านล่างมาจากสัญญาที่ตกลงกันไว้ ไม่ใช่หลักฐานที่
ทดสอบแล้วบนอุปกรณ์จริงทุกรุ่น

**CANDIDATE** — this guide follows the contract in
[`docs/plans/W3_CONTROLS_PLAN.md`](../plans/W3_CONTROLS_PLAN.md) (controller support, keyboard
shortcuts, command-line options). Real-device behavior on an actual Steam Deck / ROG Ally / Legion
Go is still an open human gate (H7–H9 in that plan) with no recorded evidence yet — the steps below
come from the agreed contract, not from testing already done on every device model.

## การเพิ่ม Lalin Cast เป็นเกมที่ไม่ใช่ Steam / Adding Lalin Cast as a non-Steam game

**ภาษาไทย:**

1. เปิด Steam ในโหมด Desktop
2. เมนู **Games → Add a Non-Steam Game to My Library…**
3. กด **Browse…** แล้วเลือกไฟล์ `lalin-cast.exe`
4. กด **Add Selected Programs**
5. Lalin Cast จะปรากฏในไลบรารี Steam เหมือนเกมทั่วไป ตั้งชื่อ ไอคอน และ artwork ได้จากเมนูคลิกขวา →
   **Properties**

**English:**

1. Open Steam in Desktop mode
2. **Games → Add a Non-Steam Game to My Library…**
3. Click **Browse…** and select `lalin-cast.exe`
4. Click **Add Selected Programs**
5. Lalin Cast now appears in the Steam library like any other game; rename it and set its icon/
   artwork from right-click → **Properties**

## Launch options / ตัวเลือกการเปิดโปรแกรม

**ภาษาไทย:** ในหน้า **Properties** ของ Lalin Cast ใส่พารามิเตอร์ในช่อง **Launch Options** ได้ตาม
รายการที่อธิบายไว้ใน [`README.md`](../../README.md) หัวข้อ "Command line" เช่น:

```
--fullscreen "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

คำสั่งนี้เปิด Lalin Cast แบบเต็มจอทันทีและเล่นวิดีโอที่ระบุ ถ้าต้องการเพียงเปิดเต็มจอโดยไม่เปิดวิดีโอ
เจาะจง ใส่แค่ `--fullscreen` เฉย ๆ ก็พอ แนะนำให้ใส่ `--fullscreen` เสมอเมื่อเปิดผ่าน Big Picture หรือ
อุปกรณ์พกพา เพราะ Lalin Cast ไม่เปิดเต็มจอเองโดยอัตโนมัติถ้าไม่ได้สั่ง

**English:** On Lalin Cast's **Properties** page, add arguments to the **Launch Options** field
using the flags documented in the "Command line" section of [`README.md`](../../README.md), for
example:

```
--fullscreen "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

This launches Lalin Cast fullscreen and immediately plays that video. To just start fullscreen
without a specific video, pass `--fullscreen` alone. Adding `--fullscreen` is recommended whenever
launching from Big Picture or a handheld, since Lalin Cast does not switch to fullscreen on its own
unless told to.

## Big Picture

**ภาษาไทย:** Lalin Cast เป็นแอป Win32 ปกติ ไม่ใช่เกมที่เขียนเพื่อ Big Picture โดยเฉพาะ เมื่อเปิดจาก
Big Picture มันจะแสดงผลเป็นหน้าต่างเดียวเต็มจอถ้าใส่ `--fullscreen` ไว้ใน Launch Options (ดูด้านบน)
หรือเปิดแบบมีกรอบหน้าต่างถ้าไม่ได้ใส่

ปุ่มคอนโทรลเลอร์ทำงานผ่าน Gamepad API มาตรฐานของเบราว์เซอร์ตามตารางใน
[`README.md`](../../README.md) หัวข้อ "Controller and keyboard" คอนโทรลเลอร์ที่พอร์ตมาจาก VacuumTube
(ดู [`LALIN_PROVENANCE.md`](../../LALIN_PROVENANCE.md)) จะเลือกใช้คอนโทรลเลอร์เสมือนของ Steam Input
ก่อนเป็นอันดับแรกถ้ามี (พฤติกรรมที่สืบทอดมาจากไฟล์ต้นทาง `util/controller.js`) ซึ่งหมายความว่าการตั้ง
ค่า controller layout เป็น "Desktop Configuration" (หรือปล่อยเป็นค่าเริ่มต้นของ Steam สำหรับแอปที่ไม่ใช่
เกม) ควรทำให้คอนโทรลเลอร์ที่ Steam รีแมพให้ใช้งานได้โดยไม่ต้องตั้งค่าเพิ่มเติม — รายละเอียดนี้ยังไม่มี
หลักฐานยืนยันบนอุปกรณ์ Steam Deck จริง (human gate H8)

**English:** Lalin Cast is a regular Win32 app, not a game purpose-built for Big Picture. Launched
from Big Picture, it shows up as a single fullscreen window if `--fullscreen` is set in Launch
Options (see above), or as a normal windowed app if it isn't.

Controller buttons work through the browser's standard Gamepad API using the table in the
"Controller and keyboard" section of [`README.md`](../../README.md). The controller support
ported from VacuumTube (see [`LALIN_PROVENANCE.md`](../../LALIN_PROVENANCE.md)) prefers Steam
Input's virtual controller when one is present (behavior inherited from the `util/controller.js`
source file), which means leaving the controller layout on "Desktop Configuration" (or Steam's
default for a non-Steam app) should make a Steam-remapped controller work without extra setup —
this has not yet been confirmed on a real Steam Deck (human gate H8).

## คอนโทรลเลอร์ที่รองรับ / Supported controllers

**ภาษาไทย:** Lalin Cast อ่านคอนโทรลเลอร์ผ่าน Gamepad API มาตรฐานของเบราว์เซอร์ ใช้ได้กับคอนโทรลเลอร์
ที่ WebView2/Chromium รู้จักในรูปแบบ "standard gamepad mapping" ซึ่งครอบคลุม:

- Xbox controller (มีสาย, Xbox Wireless Adapter หรือ Bluetooth)
- PlayStation DualSense / DualShock 4 (USB หรือ Bluetooth)
- คอนโทรลเลอร์เสมือนของ Steam Input (เมื่อ Steam รีแมพคอนโทรลเลอร์อื่นให้)
- คอนโทรลเลอร์อื่นที่ระบบส่งเป็น standard gamepad mapping เดียวกัน (เช่นคอนโทรลเลอร์ในตัวของอุปกรณ์
  handheld หลายรุ่น — ดูหัวข้อถัดไป)

ดูผังปุ่มทั้งหมดที่ [`README.md`](../../README.md) หัวข้อ "Controller and keyboard" หมายเหตุ: อนาล็อก
ขวายังไม่ถูกแมปเป็นปุ่มทิศทางในรุ่นนี้ (มีแค่ D-pad และอนาล็อกซ้ายเท่านั้นที่ใช้เลื่อนทิศทางได้ ตรงตามที่
พอร์ตมาจาก VacuumTube)

**English:** Lalin Cast reads controllers through the browser's standard Gamepad API, so it works
with any controller WebView2/Chromium exposes under the "standard gamepad mapping". That covers:

- Xbox controllers (wired, Xbox Wireless Adapter, or Bluetooth)
- PlayStation DualSense / DualShock 4 (USB or Bluetooth)
- Steam Input's virtual controller (when Steam is remapping another controller through it)
- other controllers the system reports under that same standard mapping (including several
  handhelds' built-in controllers — see the next section)

See the full button table in the "Controller and keyboard" section of
[`README.md`](../../README.md). Note: the D-pad and both sticks move focus; the right-stick mapping is a
Lalin Cast fix of an upstream slip and is verified under human gate H8.

## ROG Ally / Legion Go และอุปกรณ์พกพาอื่น ๆ / ROG Ally, Legion Go and other handhelds

**ภาษาไทย:**

- เพิ่ม Lalin Cast เข้า Steam แบบ non-Steam game เหมือนขั้นตอนด้านบน แล้วเปิดผ่าน Big Picture ตามปกติ
  ของอุปกรณ์ (ASUS Armoury Crate SE บน ROG Ally, Lenovo Legion Space บน Legion Go) หรือเปิด
  `lalin-cast.exe` ตรง ๆ จาก Desktop mode ของ Windows บนอุปกรณ์นั้นก็ได้เช่นกัน
- แนะนำให้ใส่ `--fullscreen` ใน Launch Options เสมอ เพราะหน้าจออุปกรณ์พกพามีความละเอียดจำกัดและควรใช้
  เต็มพื้นที่
- คอนโทรลเลอร์ในตัวเครื่อง (built-in gamepad) ของ ROG Ally และ Legion Go จะถูกอ่านผ่าน Gamepad API
  เหมือนคอนโทรลเลอร์ภายนอกได้ **เมื่อโหมดโอเวอร์เลย์ของผู้ผลิต (Armoury Crate Command Center / Legion
  Space) ตั้งเป็นโหมดที่ปล่อยให้อินพุตผ่านไปยัง Windows ตามปกติ (เช่น "Desktop"/"Gamepad Mode" ที่ไม่
  ดักอินพุตไว้เอง)** — ชื่อโหมดและพฤติกรรมต่างกันไปตามเฟิร์มแวร์ของแต่ละรุ่น ยังไม่มีการยืนยันพฤติกรรม
  ที่แน่นอนบนอุปกรณ์จริงจากทีม Lalin (human gate H8) ถ้าคอนโทรลเลอร์ในตัวไม่ทำงาน ให้ลองเปลี่ยนโหมดโอ
  เวอร์เลย์ของผู้ผลิต หรือใช้คีย์บอร์ด/ทัชสกรีนของอุปกรณ์แทนชั่วคราว
- ทัชสกรีนของอุปกรณ์ทำงานผ่านกลไกมาตรฐานของ WebView2 (แตะ = คลิก) เท่านั้น Lalin Cast ยังไม่มี touch
  overlay ของตัวเอง (ดูข้อจำกัดด้านล่าง)

**English:**

- Add Lalin Cast as a non-Steam game the same way as above, then launch it through the device's
  own Big Picture flow (ASUS Armoury Crate SE on ROG Ally, Lenovo Legion Space on Legion Go), or
  open `lalin-cast.exe` directly from that device's Windows desktop mode
- Always add `--fullscreen` to Launch Options — handheld screens have a fixed, limited resolution
  and should use the full display
- The built-in controller on ROG Ally and Legion Go is read through the Gamepad API like any
  external controller **as long as the vendor's own overlay (Armoury Crate Command Center / Legion
  Space) is set to a mode that passes input through to Windows normally (e.g. a "Desktop"/"Gamepad
  Mode" that does not intercept it itself)** — the exact mode name and behavior differ by firmware
  and model, and this has not yet been confirmed on real hardware by the Lalin team (human gate
  H8). If the built-in controller doesn't respond, try switching the vendor overlay's mode, or use
  the device's keyboard/touchscreen in the meantime
- The device's touchscreen works only through WebView2's standard mechanism (tap = click) — Lalin
  Cast does not have its own touch overlay yet (see limitations below)

## ข้อจำกัดปัจจุบัน / Current limitations

**ภาษาไทย:**

- ยังไม่มี touch overlay ของตัวเอง — การแตะหน้าจอทำงานผ่านกลไกมาตรฐานของ WebView2 เท่านั้น (แตะ = คลิก
  ธรรมดา) ไม่มีปุ่มควบคุมแบบสัมผัสที่ออกแบบมาสำหรับ TV UI โดยเฉพาะ
- ยังไม่มี URL scheme `lalin-cast://` — เปิดวิดีโอจากภายนอกได้เฉพาะผ่านพารามิเตอร์บรรทัดคำสั่งเท่านั้น
  (ดู [`README.md`](../../README.md) หัวข้อ "Command line") ยังใช้กับ launcher ที่ต้องการ URL scheme
  ของระบบปฏิบัติการโดยตรงไม่ได้
- อนาล็อกขวาของคอนโทรลเลอร์ยังไม่ถูกแมปเป็นปุ่มทิศทาง มีแค่ D-pad และอนาล็อกซ้ายเท่านั้น
- ยังไม่มีการตั้งค่าผังปุ่มคอนโทรลเลอร์เองจากภายใน Lalin Cast ผังปุ่มเป็นค่าคงที่ตามตารางใน
  [`README.md`](../../README.md) — ถ้าต้องการรีแมพปุ่ม ให้ใช้ฟีเจอร์รีแมพของระบบปฏิบัติการหรือของ
  Steam Input แทน
- พฤติกรรมจริงบนอุปกรณ์ Steam Deck / ROG Ally / Legion Go แต่ละรุ่นยังเป็น human gate ที่ยังไม่มี
  หลักฐาน (ดูหัวข้อ "สถานะ" ด้านบน)

**English:**

- No custom touch overlay yet — touch input works only through WebView2's standard mechanism (tap
  = click); there is no touch control surface purpose-built for a TV UI
- No `lalin-cast://` URL scheme yet — external launchers can only open a video through the
  command-line argument (see the "Command line" section of [`README.md`](../../README.md)); a
  launcher that requires an OS-level URL scheme cannot use Lalin Cast directly yet
- The right analog stick is not mapped to navigation; only the D-pad and left stick are
- Controller button mapping cannot be customized from inside Lalin Cast itself — the mapping is
  fixed as documented in [`README.md`](../../README.md); use your OS's or Steam Input's own
  remapping feature if you need something different
- Real-device behavior on a Steam Deck, ROG Ally, or Legion Go is still an open human gate with no
  recorded evidence yet (see "Status" above)
