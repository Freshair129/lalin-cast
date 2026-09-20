# นโยบายความเป็นส่วนตัว — Lalin Cast

_ภาษาไทยเป็นภาษาหลักของเอกสารนี้ คำแปลภาษาอังกฤษอยู่ด้านล่าง (English translation follows the
Thai text)._

เอกสารฉบับนี้เป็นสถานะปัจจุบันของแผนปรับปรุง H0 และ wave 2 (`docs/plans/H0_RELEASE_READINESS_PLAN.md`, `docs/plans/W2_LIVING_ROOM_PLAN.md`) ยังไม่
ผ่านการอนุมัติจากผู้ก่อตั้งโปรเจกต์ (human gate H1) — ห้าม merge เข้า `main` หรือเผยแพร่เป็นทางการ
จนกว่าจะผ่านการอนุมัตินั้น

## 1. สรุปสั้น ๆ

Lalin Cast ไม่มีระบบ telemetry, ไม่มีการส่ง crash report ออกจากเครื่อง, และไม่มีระบบบัญชีผู้ใช้ของ
Lalin ผู้ใช้ไม่ต้องสมัครหรือเข้าสู่ระบบอะไรกับ Lalin เพื่อใช้แอปนี้ ข้อมูลเกือบทั้งหมดที่แอปสร้างหรือ
เก็บไว้อยู่บนเครื่องของผู้ใช้เท่านั้น การเชื่อมต่อเครือข่ายที่แอปทำเองมีอยู่สามทางเท่านั้น: (ก) ตรวจสอบ
อัปเดตแอปจาก GitHub Releases, (ข) ตอบสนองการค้นหาอุปกรณ์ผ่านโปรโตคอล DIAL บนเครือข่ายวงเดียวกัน (LAN)
เพื่อให้แอป YouTube บนมือถือค้นหาเจอ Lalin Cast ได้ และ (ค) ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
(connectivity probe) ตอนเริ่มแอปและเมื่อผู้ใช้กด "โหลดใหม่" ในหน้าต่างสถานะ ด้วยการเชื่อมต่อ TCP ไปยัง
`www.youtube.com:443` (ดูข้อ 4) นอกเหนือจากนี้ หน้าต่างหลักของแอปจะโหลด
หน้า YouTube TV จริงจาก `youtube.com` ซึ่งอยู่ภายใต้นโยบายความเป็นส่วนตัวของ Google/YouTube เอง ไม่ใช่
ของ Lalin

## 2. ข้อมูลที่เก็บไว้บนเครื่องของผู้ใช้

แอปเก็บการตั้งค่าไว้ในไฟล์เดียว ชื่อ `media-settings.json` ผ่าน Tauri Store plugin โดยทั่วไปไฟล์นี้อยู่
ที่ `%APPDATA%\ai.lalin.cast\media-settings.json` บนเครื่อง Windows ของผู้ใช้ (ตำแหน่งจริงขึ้นกับ Tauri
app-data directory ของระบบ) คีย์ที่เก็บมีดังนี้:

| คีย์ | ความหมาย | ส่งออกนอกเครื่องหรือไม่ |
|---|---|---|
| `fullscreen` | จำสถานะเปิดเต็มจอครั้งล่าสุด | ไม่ |
| `keepOnTop` | จำสถานะ "อยู่บนสุดเสมอ" ครั้งล่าสุด | ไม่ |
| `language` | ภาษาของเมนู/หน้าต่างอัปเดต (`th` หรือ `en`) | ไม่ |
| `dialDeviceId` | รหัสอุปกรณ์ Leanback/DIAL แบบสุ่ม ใช้ให้แอป YouTube มือถือจำอุปกรณ์นี้ได้ต่อเนื่องระหว่างเซสชัน | ตอบผ่าน DIAL บน LAN เท่านั้น (ดูข้อ 3) ไม่ส่งออกอินเทอร์เน็ต |
| `dialFriendlyName` | ชื่อที่แสดงเมื่อถูกค้นพบผ่าน DIAL ค่าเริ่มต้นคือ `Lalin Cast` ผู้ใช้ตั้งเองได้ | ตอบผ่าน DIAL บน LAN เท่านั้น |
| `setupCompleted` | ผู้ใช้กด "ไม่ต้องแสดงอีก" ในตัวช่วยติดตั้งครั้งแรก (setup wizard); ถ้าไม่ใช่ `true` ตัวช่วยติดตั้งจะเปิดอีกทุกครั้งที่เริ่มแอป | ไม่ |
| `controllerEnabled` | เปิด/ปิดการอ่านค่าคอนโทรลเลอร์เกม (Gamepad API) ในหน้า YouTube ค่าเริ่มต้นเปิด | ไม่ |
| `pauseOnBlur` | หยุดวิดีโอโดยอัตโนมัติเมื่อหน้าต่างสื่อ (media) เสียโฟกัส ค่าเริ่มต้นปิด | ไม่ |

การตั้งค่ารุ่นก่อนหน้าเคยมีคีย์ `adFilterMode` ซึ่งถูกลบออกในรุ่น H0 นี้แล้ว (ไม่มีการเก็บ/อ่านคีย์นี้
อีกต่อไป) หากพบไฟล์ `media-settings.json` เก่าที่ยังมีคีย์นี้ค้างอยู่ แอปจะไม่ใช้งานค่านั้น

ถ้าไฟล์การตั้งค่านี้เข้าถึงไม่ได้หรือเสียหาย แอปจะใช้ค่าเริ่มต้นที่ปลอดภัยแทนและยังเปิดใช้งานได้ตามปกติ
(การตั้งค่าเป็นแบบ best-effort เสมอ)

แอปไม่เก็บประวัติการรับชม, คำค้นหา, บัญชี Google, คุกกี้ของ `youtube.com`, หรือรหัสจับคู่ทีวี (TV
pairing code) ไว้เป็นไฟล์ของตัวเอง — ค่าที่เกี่ยวกับบัญชี/การรับชมบน YouTube เก็บโดย WebView2 runtime
ของ Windows ตามกลไกปกติของเบราว์เซอร์ ไม่ใช่โดยโค้ดของ Lalin Cast

## 3. การค้นพบผ่าน DIAL บนเครือข่ายท้องถิ่น (LAN)

Lalin Cast รันตัวตอบสนอง DIAL (DIscovery And Launch) ของตัวเองบนพอร์ต SSDP มาตรฐานและพอร์ต HTTP ที่
ผูกกับ IP ของเครื่องบน LAN (ไม่ผูกกับทุกอินเทอร์เฟซ) ตัวตอบสนองนี้ทำสองอย่าง: (1) ตอบคำค้นหา SSDP
M-SEARCH จากอุปกรณ์อื่นบนเครือข่ายเดียวกัน และ (2) ให้ device descriptor ผ่าน HTTP ที่มีชื่ออุปกรณ์
(`dialFriendlyName`), ผู้ผลิต และรุ่น อุปกรณ์ใดก็ตามที่อยู่บนเครือข่าย Wi-Fi/LAN เดียวกันสามารถเห็น
การตอบสนองนี้ได้ (พฤติกรรมมาตรฐานของโปรโตคอล DIAL/SSDP ทุกตัว ไม่ใช่เฉพาะ Lalin Cast) — นี่คือกลไกที่
ทำให้แอป YouTube บนมือถือค้นหาเจอ Lalin Cast บนเครือข่ายเดียวกันได้ ดูรายละเอียดเพิ่มเติมที่
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) หมวด DIAL

ข้อมูลที่ตอบผ่าน DIAL (ชื่ออุปกรณ์, `dialDeviceId`) ไม่ถูกส่งออกนอกเครือข่ายท้องถิ่น และไม่ถูกส่งไปยัง
เซิร์ฟเวอร์ของ Lalin หรือบุคคลที่สามใด ๆ

ไอคอนถาด (tray) ของแอปแสดงสถานะ DIAL ปัจจุบันใน tooltip ซึ่งรวมที่อยู่ IP บนเครือข่ายท้องถิ่น (LAN) ของ
เครื่องผู้ใช้เองเมื่อพร้อมใช้งาน (เช่น `192.168.1.100`) — เป็น IP ของเครื่องผู้ใช้เอง ไม่ใช่ของอุปกรณ์อื่น
และไม่ถูกส่งออกไปที่ใดนอกเหนือจากที่แสดงบนหน้าจอเครื่องนั้นเอง

## 4. ตัวช่วยติดตั้งครั้งแรก (setup wizard) และหน้าต่างสถานะ (status window)

เมื่อเริ่มแอปครั้งแรก (หรือเมื่อผู้ใช้เปิดเองจากถาดไอคอนหรือเมนู) ตัวช่วยติดตั้งครั้งแรกจะอ่านหมวดหมู่
เครือข่าย (network category: Private, Public, Domain หรือ Unknown) ของอินเทอร์เฟซที่ต่ออินเทอร์เน็ตอยู่
โดยรันคำสั่ง PowerShell (`Get-NetConnectionProfile`) **ในเครื่องเท่านั้น** เพื่อแนะนำวิธีเปลี่ยนโปรไฟล์
เป็น Private หากจำเป็นสำหรับให้ DIAL ทำงานได้ (ดูข้อ 3) ค่าที่อ่านได้นี้**ไม่ถูกบันทึกลงไฟล์การตั้งค่า
และไม่ถูกส่งออกจากเครื่องไม่ว่ากรณีใด** — ใช้แสดงผลบนหน้าต่างตัวช่วยติดตั้งเท่านั้น

ทุกครั้งที่เริ่มแอป แอปจะเปิดการเชื่อมต่อ TCP ไปยัง `www.youtube.com:443` (connectivity probe) ในเธรด
แยกต่างหาก รันก่อน/ขนานกับการสร้างหน้าต่าง media (หน้าต่าง media ถูกสร้างเสมอไม่ว่าผลตรวจจะเป็นอย่างไร)
โดยกำหนดเวลาคอย (timeout) ไว้ 4 วินาที เพื่อตรวจว่าเครื่องต่ออินเทอร์เน็ตอยู่หรือไม่ การเชื่อมต่อนี้เป็น
เพียงการทำ TCP handshake ไม่มีการส่ง HTTP request หรือ payload ใด ๆ ออกไปเกินกว่านั้น และผลการตรวจไม่ถูก
บันทึกลงไฟล์การตั้งค่าหรือที่ใดถาวร หากผู้ใช้กดปุ่ม "โหลดใหม่" (Reload) ในหน้าต่างสถานะ แอปจะทำการตรวจซ้ำ
แบบเดียวกันอีกครั้งหนึ่งเท่านั้น (ไม่มี auto-retry loop อัตโนมัติ)

แอปยังอาจเปิดหน้าต่างสถานะ (status window) แยกต่างหากเมื่อ (ก) การตรวจสอบการเชื่อมต่อข้างต้นล้มเหลว
ตอนเริ่มแอป หรือ (ข) หน้า YouTube ที่โหลดอยู่ในหน้าต่างหลักส่ง event ชื่อ `lalin-cast-surface` มาบอกว่าไม่ได้แสดง
หน้าทีวี (Leanback) ตามที่คาดไว้ (เช่นถูก redirect ไปหน้าอื่น หรือหาองค์ประกอบของหน้าทีวีไม่เจอ) event นี้
มี URL ของหน้าที่ตัดส่วน query string และ hash ออกแล้ว (เหลือเฉพาะ scheme/host/path) กับชื่อหัวเรื่องของหน้า
(page title) เท่านั้น — ส่งจากหน้า YouTube ในหน้าต่างหลัก **มาที่ Rust shell ในเครื่องเดียวกัน** เพื่อใช้
ตัดสินใจแสดงหน้าต่างสถานะเท่านั้น ไม่ถูกส่งออกนอกเครื่อง ไม่ถูกบันทึกถาวร และ Rust จะตรวจสอบรูปแบบของ
ข้อมูลนี้ซ้ำ (ความยาว, ต้องขึ้นต้นด้วย `https://`) ก่อนใช้งานเสมอ

## 5. คอนโทรลเลอร์เกม (Gamepad) และคีย์ลัดคัดลอกลิงก์

เมื่อเปิดใช้ตัวเลือก `controllerEnabled` (ค่าเริ่มต้นเปิด) หน้าต่างสื่อ (media) จะอ่านสถานะปุ่ม/แกนของ
คอนโทรลเลอร์เกมที่เสียบไว้ ผ่าน Gamepad API มาตรฐานของเบราว์เซอร์ (WebView2) เท่านั้น การอ่านนี้เกิดขึ้น
**ในเครื่องเท่านั้น** ไม่มีการส่งข้อมูลคอนโทรลเลอร์ ชื่อคอนโทรลเลอร์ หรือรูปแบบการกดปุ่มออกนอกเครื่องไม่ว่า
ทางใด และไม่ถูกบันทึกลงไฟล์ใด ๆ ปิดตัวเลือกนี้ได้จากหน้าต่างการตั้งค่าเมื่อไรก็ได้ (ดูหัวข้อ "Settings"
ใน [`README.md`](README.md)) เมื่อปิดแล้วแอปจะไม่ polling สถานะคอนโทรลเลอร์อีก

คีย์ลัด `Ctrl+Shift+C` คัดลอกลิงก์วิดีโอ/เพลย์ลิสต์ที่กำลังดูอยู่ไปยังคลิปบอร์ดของเครื่อง (ผ่าน
`navigator.clipboard.writeText`) **เฉพาะเมื่อผู้ใช้กดคีย์ผสมนี้เองเท่านั้น** — ไม่มีการเขียนคลิปบอร์ด
อัตโนมัติจากเหตุการณ์อื่นใด ลิงก์ที่คัดลอกจะถูกตัด query string อื่นทั้งหมดออก เหลือเฉพาะพารามิเตอร์
`v` (รหัสวิดีโอ) หรือ `list` (รหัสเพลย์ลิสต์) เท่านั้น ไม่มีคุกกี้ ตัวติดตาม หรือพารามิเตอร์อื่นติดไปกับ
ลิงก์ที่คัดลอก

## 6. ลิงก์จากบรรทัดคำสั่ง (command-line deep link)

`lalin-cast.exe` รับ URL ของ YouTube เป็นพารามิเตอร์บรรทัดคำสั่งได้ (เช่นจาก Steam launch options หรือ
Studio launcher) ดูรายละเอียดที่ [`README.md`](README.md) หัวข้อ "Command line" ค่าที่รับมาจะถูกตรวจสอบ
รูปแบบอย่างเข้มงวดก่อนใช้งานเสมอ (ต้องเป็น `https://` เท่านั้น, host ต้องตรงกับรายชื่อโดเมน YouTube ที่
อนุญาตไว้ล่วงหน้าแบบตรงตัว ไม่ใช่การจับคู่แบบ suffix, รหัสวิดีโอ/เพลย์ลิสต์ต้องมีรูปแบบที่ถูกต้อง) —
ค่าที่ไม่ผ่านการตรวจสอบจะถูกทิ้งไปเฉย ๆ ไม่ถูกนำไปเปิดหรือ redirect ไปที่ใด ค่าที่ผ่านการตรวจสอบแล้วจะ
**ไม่ถูกบันทึกลงไฟล์ log หรือไฟล์การตั้งค่าถาวรใด ๆ** ใช้เพียงส่งต่อให้หน้าต่างสื่อ (media) ในเครื่อง
เดียวกันเปิดวิดีโอ/เพลย์ลิสต์นั้นเท่านั้น ถ้า Lalin Cast กำลังรันอยู่แล้ว ลิงก์จากอินสแตนซ์ใหม่จะถูกส่งต่อ
ให้หน้าต่างเดิมในลักษณะเดียวกัน ไม่มีการส่งลิงก์นี้ออกนอกเครื่อง

## 7. การตรวจสอบอัปเดต

แอปจะติดต่อ `github.com` (ที่อยู่: `github.com/Freshair129/lalin-cast/releases/latest/download/
latest.json`) เพื่อตรวจสอบว่ามีรุ่นใหม่หรือไม่ ทั้งตอนเปิดแอป (แบบ non-blocking) และเมื่อผู้ใช้กด
ตรวจสอบเองจากเมนู คำขอ HTTPS นี้มีข้อมูลมาตรฐานที่คำขอ HTTPS ทุกครั้งมีอยู่แล้ว (เช่น ที่อยู่ IP,
User-Agent) ตามกลไกของโปรโตคอล HTTP เอง ไม่มีการแนบข้อมูลส่วนตัวหรือข้อมูลการใช้งานเพิ่มเติมใด ๆ เข้าไป
ในคำขอนี้ การติดตั้งอัปเดตต้องให้ผู้ใช้กดยืนยันเองเสมอ ไม่มีการติดตั้งอัตโนมัติโดยไม่ถาม ดูรายละเอียด
เพิ่มเติมที่หัวข้อ "Updating" ใน [`README.md`](README.md)

## 8. หน้า YouTube ในหน้าต่างหลัก

หน้าต่างหลักของ Lalin Cast โหลดหน้า YouTube TV จริงจาก `https://www.youtube.com/tv` ผ่าน remote
WebView ทุกสิ่งที่เกิดขึ้นภายในหน้านั้น (คุกกี้, การเข้าสู่ระบบบัญชี Google, ประวัติการรับชม, โฆษณา,
อัลกอริทึมแนะนำวิดีโอ) อยู่ภายใต้การควบคุมของ YouTube/Google ทั้งหมด ไม่ใช่ของ Lalin Cast โปรดอ่าน
นโยบายความเป็นส่วนตัวของ Google ที่ `https://policies.google.com/privacy` สำหรับสิ่งที่เกิดขึ้นในหน้า
นั้นโดยเฉพาะ

## 9. Logging

Lalin Cast ไม่ log ข้อมูลส่วนบุคคล (PII), รหัสจับคู่ทีวี (TV code), คุกกี้, หรือ token/key ใด ๆ ลงไฟล์
log อย่างถาวร ข้อความ debug/log ระหว่างพัฒนา (ถ้ามี) จะพิมพ์เฉพาะข้อมูลสถานะทางเทคนิคของแอปเอง (เช่น
สถานะการ bind พอร์ต, สถานะการเชื่อมต่อ) ไม่ใช่เนื้อหาที่ระบุตัวตนผู้ใช้ ลิงก์จากบรรทัดคำสั่ง (ข้อ 6) ก็อยู่
ภายใต้กฎเดียวกันนี้ — ไม่ถูก log ไม่ว่าจะผ่านการตรวจสอบรูปแบบหรือไม่ก็ตาม

## 10. การลบข้อมูล

เนื่องจากข้อมูลทั้งหมดที่แอปเก็บอยู่ในเครื่องของผู้ใช้เอง การลบข้อมูลทำได้โดยลบโฟลเดอร์ข้อมูลแอปทิ้ง:

```
%APPDATA%\ai.lalin.cast\
```

การลบโฟลเดอร์นี้จะลบทั้ง `media-settings.json` (รวม `dialDeviceId`/`dialFriendlyName` ที่ตั้งไว้) และ
สถานะภายในอื่น ๆ ของแอป การลบข้อมูลบัญชี Google/YouTube (ประวัติการรับชม, คุกกี้เข้าสู่ระบบ) ต้องทำผ่าน
การตั้งค่าบัญชี Google โดยตรง เพราะข้อมูลนั้นไม่ได้อยู่ในความควบคุมของ Lalin Cast

## 11. ติดต่อ

เนื่องจาก Lalin Cast เป็นโปรเจกต์โอเพนซอร์สอิสระ ช่องทางติดต่อหลักคือ GitHub Issues ของ repository
นี้ (`github.com/Freshair129/lalin-cast`) ก่อนเผยแพร่ต่อสาธารณะ ผู้ก่อตั้งโปรเจกต์ควรพิจารณาเพิ่มช่องทาง
ติดต่ออื่น (เช่นอีเมล) ไว้ในเอกสารนี้หากต้องการ — รายการนี้อยู่ใน checklist ของ
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md) เช่นกัน

---

# Privacy Policy — Lalin Cast (English)

_This is an English translation of the Thai text above, which is the primary version of this
document._

This document reflects the current state of the H0 readiness and wave 2 living-room plans
(`docs/plans/H0_RELEASE_READINESS_PLAN.md`, `docs/plans/W2_LIVING_ROOM_PLAN.md`). It has not yet been approved by the project founder
(human gate H1) — do not merge to `main` or publish it as final until that approval happens.

## 1. Summary

Lalin Cast has no telemetry, sends no crash reports off the device, and has no Lalin user-account
system. Users never sign up for or log into anything with Lalin to use this app. Almost all data
the app creates or stores stays on the user's own machine. The app makes exactly three kinds of
network connections on its own: (a) checking for app updates from GitHub Releases, (b) responding
to device discovery over the DIAL protocol on the local network (LAN) so the YouTube mobile app can
find Lalin Cast, and (c) a connectivity probe — a TCP connection to `www.youtube.com:443` — at
startup and whenever the user presses retry in the status window (see section 4). Beyond that, the
main window loads the real YouTube TV page from `youtube.com`, which is governed by
Google's/YouTube's own privacy policy, not Lalin's.

## 2. Data stored on the user's machine

The app keeps its settings in a single file, `media-settings.json`, through the Tauri Store
plugin. On Windows this typically lives at `%APPDATA%\ai.lalin.cast\media-settings.json` (the
exact path follows Tauri's app-data directory for the system). The stored keys are:

| Key | Meaning | Ever leaves the device? |
|---|---|---|
| `fullscreen` | Remembers the last fullscreen state | No |
| `keepOnTop` | Remembers the last "always on top" state | No |
| `language` | Menu/update-window language (`th` or `en`) | No |
| `dialDeviceId` | A randomly generated Leanback/DIAL device id, used so the YouTube mobile app can recognize this device across sessions | Answered over DIAL on the LAN only (see section 3); never sent over the internet |
| `dialFriendlyName` | The name shown when discovered over DIAL. Defaults to `Lalin Cast`; user-settable | Answered over DIAL on the LAN only |
| `setupCompleted` | Set when the user checks "Don't show again" in the first-run setup wizard; if not `true`, the wizard opens again every time the app starts | No |
| `controllerEnabled` | Turns game-controller (Gamepad API) reading on or off in the YouTube page. Defaults to on | No |
| `pauseOnBlur` | Automatically pauses playback when the media window loses focus. Defaults to off | No |

A previous build stored an `adFilterMode` key; it was removed in this H0 release and is no longer
read or written. If an old `media-settings.json` still has that key from a previous install, the
app ignores it.

If this settings file is unreachable or corrupted, the app falls back to safe defaults and still
opens normally — settings persistence is always best-effort.

The app does not keep its own file of watch history, search queries, a Google account,
`youtube.com` cookies, or a TV pairing code — anything account- or viewing-related on YouTube is
handled by the Windows WebView2 runtime through its normal browser mechanisms, not by Lalin Cast's
own code.

## 3. Discovery over DIAL on the local network (LAN)

Lalin Cast runs its own DIAL (DIscovery And Launch) responder on the standard SSDP port and an
HTTP port bound to the machine's LAN IP address (not to every interface). This responder does two
things: (1) answers SSDP M-SEARCH queries from other devices on the same network, and (2) serves a
device descriptor over HTTP containing the device name (`dialFriendlyName`), manufacturer, and
model. Any device on the same Wi-Fi/LAN network can see this response — that is standard behavior
for every DIAL/SSDP responder, not something specific to Lalin Cast — and it is exactly the
mechanism that lets the YouTube mobile app find Lalin Cast on the same network. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for more on the DIAL protocol itself.

Data answered over DIAL (device name, `dialDeviceId`) never leaves the local network and is never
sent to any Lalin server or third party.

The app's tray icon shows the current DIAL status in its tooltip, which includes the machine's own
local-network (LAN) IP address once DIAL is ready (for example `192.168.1.100`) — this is the
user's own machine's IP, not another device's, and it is never sent anywhere beyond being displayed
on that same machine's screen.

## 4. First-run setup wizard and status window

The first time the app starts (or whenever the user opens it themselves from the tray icon or
menu), the first-run setup wizard reads the network category (Private, Public, Domain, or Unknown)
of the interface that has internet connectivity by running a PowerShell command
(`Get-NetConnectionProfile`) **locally only**, so it can explain how to switch the profile to
Private if that's needed for DIAL to work (see section 3). This reading is **never written to the
settings file and never leaves the device under any circumstance** — it is used only to render the
setup wizard's screen.

Every time the app starts, it opens a TCP connection to `www.youtube.com:443` (a connectivity
probe) in its own thread, run before/in parallel with creating the main media window (the media
window is always created regardless of the probe's result), with a 4-second timeout, to check
whether the machine has internet connectivity. This connection is only a TCP handshake — it sends
no HTTP request or payload beyond that — and the result is never persisted to the settings file or
anywhere else. If the user presses "Reload" in the status window, the app runs this same probe
exactly once more (there is no automatic retry loop).

The app may also open a separate status window when either (a) the connectivity probe above fails
at startup, or (b) the YouTube page loaded in the main window sends a `lalin-cast-surface`
event reporting that it isn't showing the expected TV (Leanback) surface — for example it was
redirected elsewhere, or the expected TV-surface markup could not be found. That event carries only
the page's URL with its query string and hash stripped off (leaving just scheme/host/path) and the
page's title — sent from the YouTube page in the main window **to the local Rust shell on the same
machine**, solely to decide whether to show the status window. It never leaves the device, is never
persisted, and Rust re-validates its shape (length limits, must start with `https://`) before using
it.

## 5. Game controller (Gamepad) and the copy-link shortcut

When the `controllerEnabled` setting is on (the default), the media window reads the state of any
connected game controller's buttons and axes through the browser's (WebView2's) standard Gamepad
API only. This reading happens **entirely on the device** — no controller data, controller name, or
button-press pattern is ever sent off the device in any way, and none of it is written to a file.
This setting can be turned off at any time from the settings window (see the "Settings" section of
[`README.md`](README.md)); once off, the app stops polling controller state.

The `Ctrl+Shift+C` shortcut copies the currently playing video's or playlist's URL to the device's
clipboard (via `navigator.clipboard.writeText`) **only when the user presses that key combination
themselves** — nothing else triggers a clipboard write automatically. The copied link has every
other query-string parameter stripped, keeping only `v` (video id) or `list` (playlist id); no
cookies, trackers, or other parameters travel with the copied link.

## 6. Command-line deep link

`lalin-cast.exe` accepts a YouTube URL as a command-line argument (for example from Steam launch
options or the Studio launcher); see the "Command line" section of [`README.md`](README.md). Any
value received is always strictly validated before use (it must be `https://` only, the host must
exactly match a pre-approved YouTube domain — not a suffix match — and the video/playlist id must
be well-formed). A value that fails validation is simply discarded and never opened or redirected
to. A value that passes validation is **never written to a log file or persisted to any settings
file** — it is only forwarded, in the same process, to the local media window to open that
video/playlist. If Lalin Cast is already running, a link from a new instance is forwarded to the
existing window the same way. This link is never sent off the device.

## 7. Update checks

The app contacts `github.com` (specifically
`github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`) to check for a new
version, both on startup (non-blocking) and when the user checks manually from the menu. This
HTTPS request carries only what any HTTPS request inherently carries (such as IP address and
User-Agent, per the HTTP protocol itself); no additional personal or usage data is attached.
Installing an update always requires explicit user confirmation; nothing installs automatically
without being asked. See the "Updating" section of [`README.md`](README.md) for more detail.

## 8. The YouTube page in the main window

The main Lalin Cast window loads the real YouTube TV page from `https://www.youtube.com/tv`
through a remote WebView. Everything that happens inside that page — cookies, Google account
sign-in, watch history, ads, the recommendation algorithm — is entirely under YouTube's/Google's
control, not Lalin Cast's. See Google's privacy policy at `https://policies.google.com/privacy`
for what happens specifically inside that page.

## 9. Logging

Lalin Cast does not persistently log personal information (PII), TV pairing codes, cookies, or any
tokens/keys. Whatever debug/log output exists during development prints only the app's own
technical state (such as port-bind status or connection status), never user-identifying content.
The command-line deep link (section 6) falls under this same rule — it is never logged, whether or
not it passes validation.

## 10. Deleting your data

Because everything the app stores lives on the user's own machine, deleting your data means
deleting the app's data folder:

```
%APPDATA%\ai.lalin.cast\
```

Deleting this folder removes `media-settings.json` (including any `dialDeviceId`/
`dialFriendlyName` you set) and any other internal app state. Deleting Google/YouTube account data
(watch history, sign-in cookies) must be done through your Google account settings directly, since
that data is not under Lalin Cast's control.

## 11. Contact

Since Lalin Cast is an independent open-source project, the primary contact channel is GitHub
Issues on this repository (`github.com/Freshair129/lalin-cast`). Before a public release, the
project founder should consider adding another contact channel (such as an email address) to this
document if desired — this is also tracked in the checklist in
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md).
