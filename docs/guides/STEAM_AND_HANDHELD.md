---
version: "0.4.0b"
created_at: "2026-09-20T23:15:00+07:00,LALIN,uncommitted"
last_update: "2026-09-21T00:30:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "guide"
  scope: "Adding Lalin Cast to Steam as a non-Steam game, Big Picture, controller support, touch overlay, mini-player, hardware decoding, the handheld settings profile and the copy-launch-command button on handheld PCs (ROG Ally, Legion Go)"
---

# Lalin Cast — Steam และอุปกรณ์พกพา (Handheld) / Steam and Handheld Guide

## สถานะ / Status

**CANDIDATE** — คู่มือนี้อธิบายวิธีตั้งค่าตามสัญญา (contract) ของ
[`docs/plans/W3_CONTROLS_PLAN.md`](../plans/W3_CONTROLS_PLAN.md) (การรองรับคอนโทรลเลอร์, คีย์ลัด,
ตัวเลือกบรรทัดคำสั่ง), [`docs/plans/W4_PLAYBACK_PLAN.md`](../plans/W4_PLAYBACK_PLAN.md) (ตัวจับเวลา
ปิดเล่น, ตัวกรอง codec, การถอดรหัสด้วยฮาร์ดแวร์, ปุ่มควบคุมบนหน้าจอสัมผัส, โหมดหน้าต่างเล็ก) และ
[`docs/plans/W5_DESKTOP_PLAN.md`](../plans/W5_DESKTOP_PLAN.md) (เริ่มพร้อม Windows, ลองใหม่อัตโนมัติเมื่อ
ออฟไลน์, คีย์ความเร็วเล่น) พฤติกรรมจริงบนอุปกรณ์ Steam Deck / ROG Ally / Legion Go จริงยังเป็น human gate
(H7–H9 ในแผน wave 3, H10–H11 ในแผน wave 4, H14–H16 ในแผน wave 5) ที่ยังไม่ได้บันทึกหลักฐาน — ขั้นตอน
ด้านล่างมาจากสัญญาที่ตกลงกันไว้ ไม่ใช่หลักฐานที่ทดสอบแล้วบนอุปกรณ์จริงทุกรุ่น

**CANDIDATE** — this guide follows the contract in
[`docs/plans/W3_CONTROLS_PLAN.md`](../plans/W3_CONTROLS_PLAN.md) (controller support, keyboard
shortcuts, command-line options), [`docs/plans/W4_PLAYBACK_PLAN.md`](../plans/W4_PLAYBACK_PLAN.md)
(sleep timer, codec filter, hardware decoding, touch overlay, mini-player), and
[`docs/plans/W5_DESKTOP_PLAN.md`](../plans/W5_DESKTOP_PLAN.md) (start with Windows, offline
auto-retry, playback speed keys). Real-device behavior on an actual Steam Deck / ROG Ally / Legion Go
is still an open human gate (H7–H9 in the wave 3 plan, H10–H11 in the wave 4 plan, H14–H16 in the
wave 5 plan) with no recorded evidence yet — the steps below come from the agreed contract, not from
testing already done on every device model.

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

**ภาษาไทย:** วิธีที่แนะนำคือเปิด Lalin Cast ครั้งหนึ่งบนเครื่องนี้ก่อน แล้วในหน้าต่างการตั้งค่า กดปุ่ม
"คัดลอกคำสั่งเปิดสำหรับ Steam" (กลุ่ม "อัปเดตและเกี่ยวกับ" — ดูหัวข้อ "Settings" ใน
[`README.md`](../../README.md#settings)) แอปจะสร้างคำสั่งที่มี path เต็มของ `lalin-cast.exe` บนเครื่องนี้
ให้เองแล้วคัดลอกไปยังคลิปบอร์ด (`"<path เต็มของ .exe>" --fullscreen`) วางลงในช่อง **Launch Options** ของ
หน้า **Properties** ได้ทันที ไม่ต้องพิมพ์ path เอง (ลดโอกาสพิมพ์ผิด)

ถ้าต้องการพิมพ์เอง หรือเพิ่มวิดีโอ/เพลย์ลิสต์ที่ต้องการเปิดทันที ใส่พารามิเตอร์ในช่อง **Launch Options**
ได้ตามรายการที่อธิบายไว้ใน [`README.md`](../../README.md) หัวข้อ "Command line" เช่น:

```
--fullscreen "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

คำสั่งนี้เปิด Lalin Cast แบบเต็มจอทันทีและเล่นวิดีโอที่ระบุ ถ้าต้องการเพียงเปิดเต็มจอโดยไม่เปิดวิดีโอ
เจาะจง ใส่แค่ `--fullscreen` เฉย ๆ ก็พอ แนะนำให้ใส่ `--fullscreen` เสมอเมื่อเปิดผ่าน Big Picture หรือ
อุปกรณ์พกพา เพราะ Lalin Cast ไม่เปิดเต็มจอเองโดยอัตโนมัติถ้าไม่ได้สั่ง

**English:** The recommended way is to open Lalin Cast once on this machine first, then, from the
settings window, press "copy launch command for Steam" (in the Updates & About group — see the
"Settings" section of [`README.md`](../../README.md#settings)). The app builds a command containing
this machine's full path to `lalin-cast.exe` and copies it to the clipboard
(`"<full path to the .exe>" --fullscreen`) — paste it straight into the **Launch Options** field on
the **Properties** page, with no typing required (and no risk of a typo in the path).

To type it by hand instead, or to add a specific video/playlist to open immediately, add arguments
to the **Launch Options** field using the flags documented in the "Command line" section of
[`README.md`](../../README.md), for example:

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
- หน้าต่างการตั้งค่ามีปุ่มโปรไฟล์ "อุปกรณ์พกพา" (`handheld`) ที่ตั้งค่าที่เหมาะกับอุปกรณ์ประเภทนี้ให้ครบ
  ในคลิกเดียว (เต็มจอ, คอนโทรลเลอร์เปิด, ปุ่มควบคุมบนหน้าจอสัมผัสเปิด, ตัวกรอง codec เป็น H.264 เท่านั้น,
  มาตราส่วน UI 125%) แทนที่จะต้องตั้งค่าทีละอย่าง — ดูหัวข้อ "Settings" ใน
  [`README.md`](../../README.md#settings) สำหรับตารางค่าที่แต่ละโปรไฟล์ตั้งให้
- คอนโทรลเลอร์ในตัวเครื่อง (built-in gamepad) ของ ROG Ally และ Legion Go จะถูกอ่านผ่าน Gamepad API
  เหมือนคอนโทรลเลอร์ภายนอกได้ **เมื่อโหมดโอเวอร์เลย์ของผู้ผลิต (Armoury Crate Command Center / Legion
  Space) ตั้งเป็นโหมดที่ปล่อยให้อินพุตผ่านไปยัง Windows ตามปกติ (เช่น "Desktop"/"Gamepad Mode" ที่ไม่
  ดักอินพุตไว้เอง)** — ชื่อโหมดและพฤติกรรมต่างกันไปตามเฟิร์มแวร์ของแต่ละรุ่น ยังไม่มีการยืนยันพฤติกรรม
  ที่แน่นอนบนอุปกรณ์จริงจากทีม Lalin (human gate H8) ถ้าคอนโทรลเลอร์ในตัวไม่ทำงาน ให้ลองเปลี่ยนโหมดโอ
  เวอร์เลย์ของผู้ผลิต หรือใช้คีย์บอร์ด/ทัชสกรีนของอุปกรณ์แทนชั่วคราว
- ทัชสกรีนของอุปกรณ์ทำงานผ่านกลไกมาตรฐานของ WebView2 (แตะ = คลิก) เสมอ นอกจากนี้เมื่อเปิดตัวเลือก
  "touch overlay" ไว้ (ค่าเริ่มต้นเปิด) Lalin Cast จะแสดงปุ่มควบคุมของตัวเอง (ทิศทาง, ตกลง, ย้อนกลับ,
  เล่น/หยุด) บนหน้าจอหลังตรวจพบการแตะครั้งแรก — เหมาะกับการควบคุม TV UI ด้วยนิ้วโดยตรงโดยไม่ต้องใช้
  คอนโทรลเลอร์ในตัวเครื่อง ดูรายละเอียดที่หัวข้อ "Touch overlay" ใน [`README.md`](../../README.md#playback)
- การถอดรหัสวิดีโอด้วยฮาร์ดแวร์ (`hardwareDecoding`, ค่าเริ่มต้นเปิด) มักช่วยประหยัดแบตเตอรี่และลดความร้อน
  บนอุปกรณ์พกพาเมื่อเทียบกับการถอดรหัสด้วยซอฟต์แวร์ จึงแนะนำให้เปิดไว้ตามค่าเริ่มต้น ปิดเฉพาะเมื่อพบภาพ
  กระตุกหรือเสียบนอุปกรณ์บางรุ่น (มีผลหลังเปิดแอปใหม่ ดูหัวข้อ "Hardware decoding" ใน
  [`README.md`](../../README.md#playback))

**English:**

- Add Lalin Cast as a non-Steam game the same way as above, then launch it through the device's
  own Big Picture flow (ASUS Armoury Crate SE on ROG Ally, Lenovo Legion Space on Legion Go), or
  open `lalin-cast.exe` directly from that device's Windows desktop mode
- Always add `--fullscreen` to Launch Options — handheld screens have a fixed, limited resolution
  and should use the full display
- The settings window has a "handheld" (`handheld`) profile button that sets everything suited to
  this kind of device in one click (fullscreen on, controller on, touch overlay on, codec filter set
  to H.264 only, UI scale 125%) instead of setting each option one at a time — see the "Settings"
  section of [`README.md`](../../README.md#settings) for the table of what each profile sets
- The built-in controller on ROG Ally and Legion Go is read through the Gamepad API like any
  external controller **as long as the vendor's own overlay (Armoury Crate Command Center / Legion
  Space) is set to a mode that passes input through to Windows normally (e.g. a "Desktop"/"Gamepad
  Mode" that does not intercept it itself)** — the exact mode name and behavior differ by firmware
  and model, and this has not yet been confirmed on real hardware by the Lalin team (human gate
  H8). If the built-in controller doesn't respond, try switching the vendor overlay's mode, or use
  the device's keyboard/touchscreen in the meantime
- The device's touchscreen always works through WebView2's standard mechanism (tap = click). On
  top of that, when the "touch overlay" option is on (the default), Lalin Cast shows its own
  on-screen control buttons (direction, select, back, play/pause) after the first detected touch —
  handy for driving the TV UI directly with a finger without reaching for the built-in controller.
  See the "Touch overlay" section of [`README.md`](../../README.md#playback) for details
- Hardware decoding (`hardwareDecoding`, on by default) usually saves battery and reduces heat on a
  handheld compared to software decoding, so leaving it on is recommended. Turn it off only if a
  specific device shows video stutter or corruption (takes effect after restarting the app — see
  the "Hardware decoding" section of [`README.md`](../../README.md#playback))

## โหมดหน้าต่างเล็กระหว่างเล่นเกม / Mini-player while gaming

**ภาษาไทย:** บนอุปกรณ์พกพาที่สลับไปมาระหว่างหน้าต่าง (windowed/borderless) ได้ เช่นตอนอยู่ที่ Desktop
mode ของ ROG Ally/Legion Go หรือบนพีซีทั่วไป กด `Ctrl+Shift+M`, เลือก "mini-player" จากเมนูหน้าต่างสื่อ,
หรือไอคอนถาด ("tray-mini") เพื่อย่อ Lalin Cast ให้เป็นหน้าต่างเล็กไม่มีกรอบ ลอยอยู่บนสุดที่มุมล่างขวาของจอ
— เปิดเพลง/สตรีมทิ้งไว้มุมจอระหว่างเล่นเกมอื่นในหน้าต่างแยกได้โดยไม่บังหน้าจอเกม กดซ้ำเพื่อคืนขนาดเดิม
สถานะนี้อยู่แค่ในเซสชันปัจจุบัน (ไม่ persist ข้ามการเปิดแอปใหม่) ดูรายละเอียดที่หัวข้อ "Mini-player" ใน
[`README.md`](../../README.md#playback) หมายเหตุ: เกมส่วนใหญ่ที่รันแบบเต็มจอ (exclusive fullscreen) จะ
บังหน้าต่างอื่นทั้งหมดรวมถึง mini-player ของ Lalin Cast ด้วย — ฟีเจอร์นี้ใช้ได้ดีที่สุดเมื่อเกมรันแบบ
"borderless windowed" หรือเมื่อสลับกลับมาที่ Desktop ชั่วคราว

**English:** On a handheld that can switch to windowed/borderless mode — for example ROG Ally's or
Legion Go's desktop mode, or a regular PC — press `Ctrl+Shift+M`, choose "mini-player" from the
media window's menu, or the tray icon ("tray-mini") to shrink Lalin Cast into a small, undecorated,
always-on-top window pinned to the screen's bottom-right corner. Leave a stream or song playing in
that corner while a different game runs in its own window without it covering the game's screen.
Toggle it again to restore the previous size. This state is session-only (not persisted across app
restarts) — see the "Mini-player" section of [`README.md`](../../README.md#playback) for details.
Note: most games that run in exclusive fullscreen cover every other window, including Lalin Cast's
mini-player — this feature works best with a game in "borderless windowed" mode, or when briefly
switching back to the desktop.

## เริ่มพร้อม Windows, ลองใหม่อัตโนมัติ และคีย์ความเร็ว / Start with Windows, auto-retry, and speed keys

**ภาษาไทย:** สามอย่างต่อไปนี้จากแผน wave 5
([`docs/plans/W5_DESKTOP_PLAN.md`](../plans/W5_DESKTOP_PLAN.md)) มีประโยชน์เป็นพิเศษกับเครื่อง HTPC ที่
เปิดทิ้งไว้หน้าทีวี:

- **เริ่มพร้อม Windows** — เปิดตัวเลือก "เริ่มพร้อม Windows" (`startWithWindows`) จากหน้าต่างการตั้งค่า
  เพื่อให้ Lalin Cast เปิดขึ้นเองทุกครั้งที่เข้าสู่ระบบบัญชี Windows นี้ โดยไม่ต้องมีใครกดเปิดเอง —
  เหมาะกับ HTPC ที่ต่อจอทีวีไว้ถาวรและอยากให้พร้อมใช้งานทันทีหลังเปิดเครื่อง ดูหัวข้อ "Desktop
  integration" ใน [`README.md`](../../README.md#desktop-integration) (มีผลตั้งแต่การเข้าสู่ระบบครั้ง
  ถัดไป — human gate H14)
- **ลองใหม่อัตโนมัติตอนบูต** — เครื่อง HTPC หลายเครื่องบูต Windows และเริ่มโปรแกรมอัตโนมัติเร็วกว่าที่
  Wi-Fi จะเชื่อมต่อสำเร็จ ถ้า Lalin Cast เปิดขึ้นมาก่อนอินเทอร์เน็ตพร้อม หน้าต่างสถานะจะขึ้นแล้วลองเชื่อม
  ต่อใหม่ให้เอง (5 → 30 วินาที ต่อครั้ง สูงสุด 10 นาที) โดยไม่ต้องกดปุ่มใด — ใช้ร่วมกับ "เริ่มพร้อม
  Windows" ด้านบนได้ดีสำหรับเครื่องที่ไม่มีใครอยู่หน้าจอตอนเปิดเครื่อง ดูหัวข้อ "Desktop integration"
  ใน [`README.md`](../../README.md#desktop-integration) (human gate H15)
- **คีย์ความเร็ว** — `Shift+,` ลดความเร็วเล่น, `Shift+.` เพิ่มความเร็วเล่น พร้อมแถบแสดงผลบนจอของ Lalin
  Cast เอง สะดวกเมื่อควบคุมด้วยคีย์บอร์ดจากโซฟาโดยไม่ต้องเปิดเมนูของ YouTube เอง (สถานะอยู่แค่ในเซสชัน
  ปัจจุบัน ไม่ persist) ดูผังคีย์ทั้งหมด (รวม `?` / `F1` สำหรับเปิดผังช่วยเหลือ) ใน
  [`README.md`](../../README.md) หัวข้อ "Controller and keyboard"

**English:** Three more wave 5 features
([`docs/plans/W5_DESKTOP_PLAN.md`](../plans/W5_DESKTOP_PLAN.md)) are especially useful on an HTPC
left running in front of a TV:

- **Start with Windows** — turn on "start with Windows" (`startWithWindows`) from the settings
  window so Lalin Cast opens itself every time this Windows account signs in, with no one needing to
  launch it. Handy for an HTPC permanently connected to a TV that should be ready right after the
  machine powers on — see "Desktop integration" in
  [`README.md`](../../README.md#desktop-integration) (takes effect starting with the next sign-in —
  human gate H14).
- **Auto-retry at boot** — many HTPCs finish booting Windows and auto-starting programs faster than
  Wi-Fi finishes connecting. If Lalin Cast starts before the internet is ready, the status window
  appears and retries on its own (5 → 30 seconds per attempt, up to 10 minutes total) without any
  button press — pairs well with "start with Windows" above for a machine no one is sitting in front
  of when it powers on. See "Desktop integration" in
  [`README.md`](../../README.md#desktop-integration) (human gate H15).
- **Speed keys** — `Shift+,` slows playback down, `Shift+.` speeds it up, with Lalin Cast's own
  on-screen indicator. Handy for keyboard control from the couch without opening YouTube's own menu
  (session-only state, not persisted). See the full key table (including `?` / `F1` for the help
  overlay) in the "Controller and keyboard" section of [`README.md`](../../README.md).

## ข้อจำกัดปัจจุบัน / Current limitations

**ภาษาไทย:**

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

- No `lalin-cast://` URL scheme yet — external launchers can only open a video through the
  command-line argument (see the "Command line" section of [`README.md`](../../README.md)); a
  launcher that requires an OS-level URL scheme cannot use Lalin Cast directly yet
- The right analog stick is not mapped to navigation; only the D-pad and left stick are
- Controller button mapping cannot be customized from inside Lalin Cast itself — the mapping is
  fixed as documented in [`README.md`](../../README.md); use your OS's or Steam Input's own
  remapping feature if you need something different
- Real-device behavior on a Steam Deck, ROG Ally, or Legion Go is still an open human gate with no
  recorded evidence yet (see "Status" above)
