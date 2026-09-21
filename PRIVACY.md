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
| `sleepTimerMinutes` | ตั้งเวลาปิดเล่นอัตโนมัติเป็นนาที ค่าที่รับ ∈ {0, 15, 30, 60, 90, 120}; `0` = ปิดใช้งาน/ยกเลิก เมื่อหมดเวลา Rust จะเขียนค่ากลับเป็น `0` เอง — ดูข้อ 8 | ไม่ |
| `codecFilter` | ตัวกรอง codec ที่หน้า YouTube เห็นผ่าน Web API มาตรฐาน (`off` หรือ `h264`) มีผลหลังโหลดหน้าใหม่เท่านั้น — ดูข้อ 8 | ไม่ |
| `hardwareDecoding` | เปิด/ปิดการถอดรหัสวิดีโอด้วยฮาร์ดแวร์ (GPU) ของหน้าต่างสื่อ ค่าเริ่มต้นเปิด มีผลหลังเปิดแอปใหม่เท่านั้น — ดูข้อ 8 | ไม่ |
| `touchOverlay` | เปิด/ปิดปุ่มควบคุมบนหน้าจอที่ปรากฏหลังตรวจพบการแตะหน้าจอ (`touchstart`) ครั้งแรก ค่าเริ่มต้นเปิด — ดูข้อ 8 | ไม่ |
| `startWithWindows` | เปิด/ปิดการเริ่ม Lalin Cast พร้อม Windows (registry Run key ของบัญชีนี้) ค่าเริ่มต้นปิด ตั้งได้จากหน้าต่างการตั้งค่าเท่านั้น — ดูข้อ 7 | ไม่ |
| `deepLinkScheme` | เปิด/ปิดการจดทะเบียนให้ลิงก์ `lalin-cast://` เปิดด้วย Lalin Cast (เขียน/ลบค่าใน `HKCU\Software\Classes\lalin-cast` ของบัญชีนี้) ค่าเริ่มต้นปิด เป็น opt-in ตั้งได้จากหน้าต่างการตั้งค่าเท่านั้น — ดูข้อ 7 | ไม่ |
| `windowBounds` | ตำแหน่ง (x, y) และขนาด (width, height) ของหน้าต่างสื่อ (media) ล่าสุด เป็นพิกเซล เขียนโดย Rust เท่านั้น ไม่ปรากฏในผลลัพธ์ของหน้าต่างการตั้งค่า — ดูข้อ 7 | ไม่ |
| `uiScale` | มาตราส่วนการแสดงผล (zoom) ของหน้าต่างสื่อ ผ่าน API `set_zoom` ของ WebView2 เอง ค่าที่รับ ∈ {100, 125, 150, 175, 200} เปอร์เซ็นต์ มีผลทันทีที่ตั้งค่าและอีกครั้งหลังเปิดแอปใหม่ — ดูข้อ 7 | ไม่ |
| `sleepAtEndOfVideo` | เปิด/ปิดการหยุดเล่นอัตโนมัติเมื่อวิดีโอปัจจุบันจบ (กัน autoplay-next ของ YouTube หนึ่งครั้ง) ค่าเริ่มต้นปิด ไม่รีเซ็ตกลับเป็นปิดเอง — ดูข้อ 7 | ไม่ |
| `keepDisplayAwake` | กันจอดับ/เครื่องหลับเฉพาะขณะกำลังเล่นวิดีโอจริง โดยเรียก API ของ Windows เองเท่านั้น ค่าเริ่มต้นเปิด — ดูข้อ 8 | ไม่ |
| `hideShorts` | ซ่อนชั้น Shorts บนหน้าแรกด้วย CSS ของ Lalin Cast เอง ค่าเริ่มต้นปิด (opt-in) — ดูข้อ 10 | ไม่ |
| `hideGuideTabs` | ซ่อนแท็บ Shorts ในแถบนำทางด้านข้างด้วย CSS ของ Lalin Cast เอง ค่าเริ่มต้นปิด (opt-in) — ดูข้อ 10 | ไม่ |

การตั้งค่ารุ่นก่อนหน้าเคยมีคีย์ `adFilterMode` ซึ่งถูกลบออกในรุ่น H0 นี้แล้ว (ไม่มีการเก็บ/อ่านคีย์นี้
อีกต่อไป) หากพบไฟล์ `media-settings.json` เก่าที่ยังมีคีย์นี้ค้างอยู่ แอปจะไม่ใช้งานค่านั้น

โหมดหน้าต่างเล็ก (mini-player) ไม่ใช่คีย์ที่บันทึกลงไฟล์นี้ — เป็นสถานะของ session ปัจจุบันเท่านั้น
ปรากฏในผลลัพธ์ (snapshot) ของหน้าต่างการตั้งค่าเป็นค่า `true`/`false` แต่ไม่ถูกบันทึกข้ามการเปิดแอปใหม่

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
แบบเดียวกันอีกครั้งหนึ่ง; นอกจากนี้ยังมีการลองใหม่อัตโนมัติเมื่อหน้าต่างสถานะแสดงเพราะออฟไลน์ (ดูข้อ 7)

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

## 7. การผสานรวมกับเดสก์ท็อป: ไฟล์วงจรชีวิตของตัวเปิดแอป, ตำแหน่งหน้าต่าง, เริ่มพร้อม Windows, ลองใหม่อัตโนมัติเมื่อออฟไลน์ และข้อมูลวินิจฉัย

รุ่นนี้เพิ่มคีย์การตั้งค่าอีกสองตัวในไฟล์ `media-settings.json` เดียวกับข้อ 2: `startWithWindows` (bool
เปิด/ปิดการเริ่มแอปพร้อม Windows) และ `windowBounds` (ตำแหน่ง/ขนาดหน้าต่างสื่อ เขียนโดย Rust เท่านั้น ไม่
ปรากฏในผลลัพธ์ของหน้าต่างการตั้งค่า) ทั้งสองคีย์ไม่ถูกส่งออกนอกเครื่องเช่นเดียวกับคีย์อื่นทั้งหมดในไฟล์นี้
— ดูรายละเอียดค่าที่คีย์ `windowBounds` เก็บ (ตำแหน่ง x/y และขนาด width/height ของหน้าต่างเป็นพิกเซล) ที่
ข้อ 2

**ไฟล์วงจรชีวิต (`lifecycle.json`):** ทุกครั้งที่ทำงาน Lalin Cast จะเขียนสถานะปัจจุบันของตัวเอง (เริ่ม
ทำงาน/พร้อม/หยุดแล้ว/ล้มเหลว) ลงไฟล์ `lifecycle.json` ที่ `%LOCALAPPDATA%\ai.lalin.cast\lifecycle.json`
เสมอ แบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename ทับ) เพื่อให้ตัวเปิดแอปภายนอก เช่น Lalin Studio ตรวจสอบ
สถานะได้ — ไฟล์นี้มีเพียงสถานะทางเทคนิคของกระบวนการ (process id, exit code, รหัสข้อผิดพลาด) และตัวระบุ
คำขอ (`requestId`) ที่ตัวเปิดแอปกำหนดเอง (ทึบ ไม่ใช่ข้อมูลระบุตัวตนผู้ใช้) **ไม่มี URL, deep link, คุกกี้
หรือ token ใด ๆ อยู่ในไฟล์นี้** ดูสัญญา (contract) ฉบับเต็มที่
[`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md)

**เริ่มพร้อม Windows:** เมื่อผู้ใช้เปิดตัวเลือก "เริ่มพร้อม Windows" จากหน้าต่างการตั้งค่าเท่านั้น (ไม่มีการ
เปิดใช้เองโดยอัตโนมัติ) แอปจะเขียนค่าเข้ารายการ Run ใน registry ของบัญชี Windows ปัจจุบัน
(`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) ผ่านคำสั่ง `reg.exe` ของ Windows เอง ด้วย
argument คงที่ (ไม่มี PowerShell, ไม่มี unsafe code) ค่าที่เขียนคือ path เต็มของไฟล์ .exe เท่านั้น ไม่มี
argument อื่นติดไปด้วย ปิดตัวเลือกนี้เพื่อลบค่าออกจาก registry การเขียน/ลบ registry นี้จำกัดอยู่แค่ค่าเดียว
ในบัญชีผู้ใช้ปัจจุบันเท่านั้น ไม่แตะ registry ระดับเครื่อง (HKLM) หรือของผู้ใช้อื่น

**ลิงก์ผ่าน URL scheme (`lalin-cast://`):** เมื่อผู้ใช้เปิดตัวเลือก "ให้ลิงก์ `lalin-cast://` เปิดด้วย
Lalin Cast" จากหน้าต่างการตั้งค่าเท่านั้น (ค่าเริ่มต้นปิด, คีย์ `deepLinkScheme`, ไม่มีการเปิดใช้เองโดย
อัตโนมัติ) แอปจะจดทะเบียน scheme `lalin-cast` เข้ารายการ `HKCU\Software\Classes\lalin-cast` ของบัญชี
Windows ปัจจุบันเท่านั้น ผ่าน crate `tauri-plugin-deep-link` ที่ทำหน้าที่จดทะเบียน/ยกเลิก/ตรวจสอบ registry
เพียงอย่างเดียว ไม่มีความสามารถอื่นเพิ่มเติม ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ และไม่แตะ registry ระดับเครื่อง
(HKLM) หรือของบัญชีอื่น ปิดตัวเลือกนี้เพื่อยกเลิกการจดทะเบียน (ลบค่าออกจาก registry เดียวกัน) แอปจะบันทึก
ค่านี้ลงไฟล์การตั้งค่าก็ต่อเมื่อ registry ไปถึงสถานะที่ขอจริงเท่านั้น (ถ้าปิดตัวเลือกขณะที่ยังไม่เคยจดทะเบียนไว้ ถือว่าสำเร็จ
โดยไม่ต้องเรียกยกเลิก) เมื่อลิงก์ `lalin-cast://` มาถึงแอป (จาก
Explorer, เบราว์เซอร์ หรือแอปอื่น) Windows จะส่งมาเป็นพารามิเตอร์บรรทัดคำสั่งของโปรเซสใหม่ ผ่านเส้นทางการ
ตรวจสอบและแปลงเป็น URL ของ YouTube เดียวกันกับลิงก์บรรทัดคำสั่งทุกประการ (ดูข้อ 6) และอยู่ภายใต้กฎเดียวกัน
ทุกข้อ: ค่าที่ไม่ผ่านการตรวจสอบจะถูกทิ้งไปเฉย ๆ และค่าที่ผ่านแล้ว **ไม่ถูกบันทึกลงไฟล์ log หรือไฟล์การตั้งค่า
ถาวรใด ๆ** สตริง `lalin-cast://` ดิบเองก็ไม่ถูกส่งเข้าหน้าเว็บ (WebView) หรือถูก log เช่นกัน — เห็นเฉพาะ URL
ของ YouTube ที่แปลงแล้วเท่านั้น

**ลองใหม่อัตโนมัติเมื่อออฟไลน์:** เมื่อหน้าต่างสถานะแสดงเพราะออฟไลน์ตอนเริ่มแอป (ดูข้อ 4) Lalin Cast จะทำ
การตรวจสอบการเชื่อมต่อ (TCP handshake ไปยัง `www.youtube.com:443` แบบเดียวกับข้อ 4 ไม่มี HTTP request
หรือ payload อื่นใด) ซ้ำเองเป็นระยะโดยไม่ต้องกดปุ่ม เริ่มที่ 5 วินาทีแล้วเพิ่มเป็นสูงสุด 30 วินาที และหยุด
เองเมื่อครบ 10 นาที ผลของแต่ละครั้งไม่ถูกบันทึกถาวรเช่นเดียวกับการตรวจครั้งแรก

**มาตราส่วน UI และหยุดเล่นเมื่อจบวิดีโอ:** รุ่นนี้เพิ่มคีย์การตั้งค่าอีกสองตัวในไฟล์เดียวกับข้อ 2:
`uiScale` (มาตราส่วนการแสดงผล/zoom ของหน้าต่างสื่อ ผ่าน API ของ WebView2 เอง) และ `sleepAtEndOfVideo`
(หยุดเล่นอัตโนมัติเมื่อวิดีโอปัจจุบันจบ) ทั้งสองเป็นการตั้งค่าในเครื่องล้วน ๆ เหมือนคีย์อื่นทุกตัวในไฟล์นี้
— ไม่มีการส่งค่าใดออกนอกเครื่อง

**คำสั่งเปิดสำหรับ Steam (launch command):** ปุ่ม "คัดลอกคำสั่งเปิดสำหรับ Steam" ในหน้าต่างการตั้งค่าสร้าง
ข้อความที่มีเพียง path เต็มของไฟล์ .exe ของแอปเองบนเครื่องนี้ (`"<path>" --fullscreen` ไม่มี URL หรือ
argument อื่นใดติดไปด้วย) แล้วคัดลอกไปยังคลิปบอร์ดของเครื่อง **เมื่อผู้ใช้กดปุ่มนี้เท่านั้น** ไม่มีการ
คัดลอกอัตโนมัติจากเหตุการณ์อื่นใด

**รีเซ็ตค่าเริ่มต้น (reset to defaults):** ปุ่ม "รีเซ็ตค่าเริ่มต้น" แบบกดสองจังหวะยืนยันในหน้าต่างการ
ตั้งค่าคืนค่าเกือบทุกการตั้งค่ากลับเป็นค่าเริ่มต้นของแอปผ่าน path เดียวกับที่ใช้บันทึกค่าปกติทีละคีย์
**แต่ไม่ลบ** รหัส/ชื่ออุปกรณ์ DIAL (`dialDeviceId`, `dialFriendlyName`), ภาษา (`language`), สถานะว่าผ่าน
ตัวช่วยติดตั้งแล้ว (`setupCompleted`) หรือรายการเริ่มพร้อม Windows (`startWithWindows`) หรือการจดทะเบียน
`lalin-cast://` (`deepLinkScheme`) ออก — ทั้งหกค่านี้ยังคงเดิมหลังกดรีเซ็ต (ดูข้อ 12 สำหรับวิธีลบ
ค่าเหล่านี้ด้วยตัวเองถ้าต้องการ)

**ข้อมูลวินิจฉัย:** ปุ่ม "คัดลอกข้อมูลวินิจฉัย" ในหน้าต่างการตั้งค่าสร้างข้อความสรุปสถานะแอปแบบข้อความล้วน
ประกอบด้วย: เวอร์ชันแอป, เวอร์ชัน Tauri/WebView2, ระบบปฏิบัติการ/สถาปัตยกรรม, ภาษาที่ใช้, สถานะ DIAL
**รวมที่อยู่ IP และพอร์ตบน LAN ของเครื่องเอง** (เช่น `192.168.1.10:8008`), หมวดหมู่เครือข่ายพร้อมชื่ออินเทอร์เฟซ (เช่น `Ethernet`),
ชื่อที่แสดงผ่าน DIAL, ค่าตั้งปัจจุบันทั้งหมด, สถานะวงจรชีวิตของแอปพร้อมหมายเลขโปรเซส (pid) และเวลาที่สร้างข้อความ — **ไม่มี** `dialDeviceId`, URL ใด ๆ, deep link,
รหัสจับคู่ทีวี (TV code), คุกกี้, token หรือชื่อผู้ใช้/hostname อยู่ในข้อความนี้ ข้อความนี้ถูกคัดลอกไปยัง
คลิปบอร์ดของเครื่อง **เมื่อผู้ใช้กดปุ่มเองเท่านั้น** ไม่มีการคัดลอกอัตโนมัติ และไม่มีการส่งข้อความนี้ออกจาก
เครื่องโดยแอปไม่ว่ากรณีใด (ผู้ใช้เป็นคนตัดสินใจเองว่าจะวางข้อความนี้ไปที่ใดต่อ เช่นในรายงานปัญหา)

**ชื่อวิดีโอที่กำลังเล่น:** หน้า YouTube อ่านชื่อวิดีโอที่กำลังเล่นผ่าน Media Session API มาตรฐานของ
เบราว์เซอร์เท่านั้น (`navigator.mediaSession.metadata.title`) ไม่อ่าน DOM อื่นของหน้า แล้วส่งมาที่ Rust
shell **ในเครื่องเดียวกัน** เพื่อใช้ตั้งชื่อหน้าต่างและบรรทัดใน tooltip ของไอคอนถาดเท่านั้น (ตัดความยาว,
กรองอักขระควบคุม) ไม่ถูกบันทึกถาวร ไม่ถูกส่งออกนอกเครื่อง

ทุกอย่างในข้อนี้ไม่เกี่ยวข้องกับระบบ telemetry ใด ๆ — Lalin Cast ยังคงไม่มี telemetry เหมือนที่ระบุในข้อ 1

## 8. การเล่น: ตัวจับเวลาปิดเล่นอัตโนมัติ, ตัวกรอง codec, การถอดรหัสด้วยฮาร์ดแวร์, ปุ่มสัมผัสบนจอ และกันจอดับขณะเล่น

ตัวจับเวลาปิดเล่นอัตโนมัติ (sleep timer, คีย์ `sleepTimerMinutes`) ทำงานทั้งหมดในเครื่อง: ตัวจับเวลาเป็น
เธรด Rust ที่นับถอยหลังในหน่วยความจำ ไม่มีการเชื่อมต่อเครือข่ายใด ๆ เกี่ยวข้อง เมื่อหมดเวลา Rust จะส่ง
event ไปยังหน้าต่างสื่อในเครื่องเดียวกันเพื่อหยุดเล่นวิดีโอทุกตัวในหน้าและแสดงข้อความบนหน้าจอ (OSD) ของ
Lalin Cast เอง แล้วเขียนค่าคีย์กลับเป็น `0` ให้เอง ยกเลิกได้ทันทีโดยตั้งค่าเป็น `0` จากหน้าต่างการตั้งค่า

ตัวกรอง codec (`codecFilter`, ค่า `off` หรือ `h264`) เมื่อเปิดใช้ (`h264`) สคริปต์ที่ฉีดเข้าไปในหน้า
YouTube จะ override ฟังก์ชัน Web API มาตรฐานสองตัวคือ `MediaSource.isTypeSupported` และ
`HTMLMediaElement.prototype.canPlayType` ให้รายงานว่าไม่รองรับเฉพาะรูปแบบที่มี `vp8`, `vp9` หรือ `av01`
เท่านั้น (รูปแบบอื่นไม่เปลี่ยนพฤติกรรม) การเปลี่ยนนี้มีผลแค่กับสิ่งที่หน้า YouTube "เห็น" ผ่าน Web API
มาตรฐานสองตัวนี้เท่านั้น ไม่มีการอ่าน ส่ง หรือบันทึกข้อมูลใด ๆ เพิ่มเติม และไม่เปลี่ยนความสามารถถอดรหัส
จริงของ WebView2 มีผลหลังโหลดหน้าใหม่เท่านั้น (หน้าที่เปิดค้างอยู่จะไม่เปลี่ยนพฤติกรรมทันที)

การถอดรหัสวิดีโอด้วยฮาร์ดแวร์ (`hardwareDecoding`) เป็นการตั้งค่าแฟล็กเริ่มต้นของ WebView2
(ค่า default ของ WebView2 บวก `--disable-accelerated-video-decode` เมื่อปิด) สำหรับหน้าต่างสื่อเท่านั้น เป็นการเลือกเส้นทางการเรนเดอร์
ในเครื่อง ไม่มีข้อมูลใดออกจากเครื่อง มีผลหลังเปิดแอปใหม่เท่านั้น

ปุ่มควบคุมบนหน้าจอสัมผัส (touch overlay, คีย์ `touchOverlay`) เป็นองค์ประกอบ DOM ที่ Lalin Cast สร้างขึ้น
เองในหน้า ปรากฏหลังตรวจพบการแตะหน้าจอ (`touchstart`) ครั้งแรก และส่ง synthetic key event ด้วยกลไกเดียวกับ
คอนโทรลเลอร์/คีย์บอร์ด (ดูข้อ 5) — ไม่มีการเก็บหรือส่งข้อมูลตำแหน่งการแตะออกจากเครื่อง ใช้เพียงตัดสินใจว่า
จะแสดง/ซ่อนปุ่มเท่านั้น

โหมดหน้าต่างเล็ก (mini-player) เป็นสถานะของ session ปัจจุบันเท่านั้น ไม่ถูกบันทึกลงไฟล์การตั้งค่า (ไม่มี
คีย์ persist ตามที่ระบุในข้อ 2) และไม่มีผลด้านความเป็นส่วนตัวเพิ่มเติม — เป็นเพียงการเปลี่ยนขนาด/ตำแหน่ง/
กรอบของหน้าต่างที่มีอยู่แล้วเท่านั้น

กันจอดับขณะเล่น (keep-display-awake, คีย์ `keepDisplayAwake`, ค่าเริ่มต้นเปิด) **เรียกเฉพาะ API ของ
Windows เอง** (`SetThreadExecutionState`) เพื่อบอกระบบปฏิบัติการว่าเครื่องกำลังถูกใช้งานอยู่ **เฉพาะขณะ
กำลังเล่นวิดีโอจริงเท่านั้น** (อิงจากสถานะเล่น/หยุดเดียวกับที่ใช้ตั้งชื่อวิดีโอที่กำลังเล่น ดูข้อ 7) API
นี้ **ไม่ส่งข้อมูลใดออกจากเครื่อง ไม่อ่านเนื้อหาบนหน้าจอ และไม่เกี่ยวข้องกับเครือข่ายเลย** — เป็นเพียงการ
บอกระบบปฏิบัติการไม่ให้ปิดจอ/พักเครื่องเท่านั้น เมื่อหยุดเล่น ปิดตัวเลือกนี้ หรือปิดแอป Lalin Cast จะยกเลิก
การจองสถานะนี้ทันทีให้จอ/เครื่องกลับไปดับ/หลับตามการตั้งค่า Windows ปกติ

## 9. การตรวจสอบอัปเดต

แอปจะติดต่อ `github.com` (ที่อยู่: `github.com/Freshair129/lalin-cast/releases/latest/download/
latest.json`) เพื่อตรวจสอบว่ามีรุ่นใหม่หรือไม่ ทั้งตอนเปิดแอป (แบบ non-blocking) และเมื่อผู้ใช้กด
ตรวจสอบเองจากเมนู คำขอ HTTPS นี้มีข้อมูลมาตรฐานที่คำขอ HTTPS ทุกครั้งมีอยู่แล้ว (เช่น ที่อยู่ IP,
User-Agent) ตามกลไกของโปรโตคอล HTTP เอง ไม่มีการแนบข้อมูลส่วนตัวหรือข้อมูลการใช้งานเพิ่มเติมใด ๆ เข้าไป
ในคำขอนี้ การติดตั้งอัปเดตต้องให้ผู้ใช้กดยืนยันเองเสมอ ไม่มีการติดตั้งอัตโนมัติโดยไม่ถาม ดูรายละเอียด
เพิ่มเติมที่หัวข้อ "Updating" ใน [`README.md`](README.md)

## 10. หน้า YouTube ในหน้าต่างหลัก

หน้าต่างหลักของ Lalin Cast โหลดหน้า YouTube TV จริงจาก `https://www.youtube.com/tv` ผ่าน remote
WebView ทุกสิ่งที่เกิดขึ้นภายในหน้านั้น (คุกกี้, การเข้าสู่ระบบบัญชี Google, ประวัติการรับชม, โฆษณา,
อัลกอริทึมแนะนำวิดีโอ) อยู่ภายใต้การควบคุมของ YouTube/Google ทั้งหมด ไม่ใช่ของ Lalin Cast โปรดอ่าน
นโยบายความเป็นส่วนตัวของ Google ที่ `https://policies.google.com/privacy` สำหรับสิ่งที่เกิดขึ้นในหน้า
นั้นโดยเฉพาะ

**ซ่อนชั้น Shorts / แท็บ Shorts (คีย์ `hideShorts`, `hideGuideTabs`, ทั้งสองค่าเริ่มต้นปิด เป็น
opt-in):** เมื่อเปิดตัวเลือกใดตัวเลือกหนึ่งจากหน้าต่างการตั้งค่า สคริปต์ที่ฉีดเข้าไปในหน้าจะ**อ่านเฉพาะ
DOM ของหน้า YouTube ที่ render เสร็จแล้ว** เพื่อติด class ของ Lalin Cast เองบน element ที่ตรงกับรูปแบบ
Shorts shelf/แท็บ Shorts แล้วซ่อนด้วย stylesheet ของ Lalin Cast เอง (`display: none`) — **ไม่มีการอ่าน
เนื้อหาที่แสดงบนหน้าจอแล้วส่งออกไปที่ใด ไม่มีการดักหรือแก้ไข response ของ YouTube, ไม่มีการลบ node ออก
จากหน้า, และไม่มีการซ่อนแท็บ Home ไม่ว่ากรณีใด** (ดู
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md)
สำหรับเหตุผลและเส้นแบ่งฉบับเต็ม) เนื่องจากเป็นการซ่อนด้วย CSS ของเราเองล้วน ๆ การซ่อนนี้จึงอาจหยุด
ทำงานได้ทุกเมื่อที่ YouTube เปลี่ยนโครงสร้างหน้าเว็บ

## 11. ไฟล์ log ในเครื่อง

Lalin Cast เขียนไฟล์ log ไว้ในเครื่องที่ `%LOCALAPPDATA%\ai.lalin.cast\logs\lalin-cast.log` เพื่อช่วย
วินิจฉัยปัญหา (เช่น DIAL bind ไม่สำเร็จ หรือตรวจสอบอัปเดตล้มเหลว) **ไฟล์นี้อยู่ในเครื่องเท่านั้น ไม่มีการ
ส่งออกไปที่ใดโดยอัตโนมัติไม่ว่ากรณีใด** — ผู้ใช้เป็นคนตัดสินใจเองว่าจะแนบไฟล์นี้ไปกับรายงานปัญหาหรือไม่
(ดู [`README.md`](README.md) หัวข้อ "Support")

ก่อนข้อความใด ๆ จะถูกเขียนลงไฟล์นี้ ทุกบรรทัดต้องผ่านฟังก์ชัน sanitiser ตัวเดียวกันเสมอ (ไม่มีทางลัดที่
เขียนข้อความดิบลงไฟล์ได้) ซึ่งทำตามลำดับนี้กับทุกข้อความก่อนเขียนเสมอ (ลำดับมีผลจริง เพราะแต่ละขั้นพึ่งผล
ของขั้นก่อนหน้า):

1. แทนที่ตัวอักษรควบคุมทุกตัว (รวมทั้ง `\r` และ `\n`) ด้วยช่องว่าง
2. ถ้าอ่านโฟลเดอร์ home ของ Windows ได้ (`USERPROFILE`) และยาวพอ (อย่างน้อย 3 ตัวอักษร): แทนที่**ทุกครั้ง**
   ที่พบโฟลเดอร์นี้ (ไม่สนตัวพิมพ์เฉพาะตัวอักษรภาษาอังกฤษ — ตัวอักษรที่ไม่ใช่ ASCII เช่นสระ/พยัญชนะที่มีเครื่องหมาย
   หรือภาษาที่ไม่ใช่อังกฤษ ยังต้องตรงตัวพิมพ์เป๊ะจึงจะแทนได้ ทั้งรูปแบบ `\` และ `/`) ด้วย `<home>` โดยนับเฉพาะเมื่อตัวอักษรถัดจากโฟลเดอร์นั้นไม่ใช่ตัวอักษรหรือตัวเลข (จึงไม่ไปจับ `C:\Users\bobby`
   เมื่อ home คือ `C:\Users\bob`) — ขั้นนี้ทำงาน**ก่อน**กฎ path ในขั้นที่ 5 เสมอ เพื่อให้ช่องว่างในชื่อบัญชี
   (เช่น `C:\Users\First Last`) ไม่ทำให้ path ถูกตัดครึ่งกลางชื่อ
3. ถ้าอ่านชื่อบัญชี Windows ได้ (`USERNAME`) และยาวพอ (อย่างน้อย 3 ตัวอักษร): แทนที่ทุกครั้งที่พบ**ทั้งสตริง**
   `USERNAME` แบบทั้งคำเท่านั้น (ตรวจว่าตัวอักษรก่อนหน้าและตามหลังไม่ใช่ตัวอักษร/ตัวเลข ไม่สนตัวพิมพ์เฉพาะ
   ตัวอักษรภาษาอังกฤษ) ด้วย `<user>` — ครอบกรณีที่ชื่อบัญชีหลุดเข้ามาในข้อความโดยไม่ได้อยู่ในรูป path ของ
   โฟลเดอร์ home
4. แทนที่ URL ที่มี scheme **ใดก็ได้** (ไม่ใช่แค่ `http`/`https`/`lalin-cast` สามแบบเหมือนก่อนหน้านี้)
   ตามด้วย `://` (ไปจนถึงช่องว่างถัดไป) ด้วย `<url>`
5. แทนที่ path แบบ Windows ที่ขึ้นต้นด้วย `<ตัวอักษร>:\` หรือ `<ตัวอักษร>:/` (เช่น `C:\` หรือ `C:/`) หรือ
   `\\` หรือขึ้นต้นด้วย `<home>\` หรือ `<home>/` (คือ path ใต้โฟลเดอร์ home ที่ขั้นที่ 2 แทนส่วนต้นไปแล้ว) ไปจนถึง
   ช่องว่างถัดไป ด้วย `<path>` — ดังนั้น path อย่าง `C:\Users\First Last\AppData\x.log` จะกลายเป็น `<path>`
   ทั้งก้อน ทั้งชื่อบัญชี โฟลเดอร์ย่อย และชื่อไฟล์ ไม่ใช่แค่ส่วนต้นที่เป็นโฟลเดอร์ home
6. ตัดความยาวข้อความเหลือ 512 ตัวอักษร (นับตัวอักษร ไม่ใช่ไบต์)

เพราะ**ทุกการเขียนไฟล์ log ต้องผ่านฟังก์ชันนี้เพียงจุดเดียว** (ไม่ใช่การไว้ใจให้ทุกจุดในโค้ดที่เรียก log
ระวังเอง) ขั้นตอนทั้งหกข้อข้างต้นจึงเกิดขึ้นทุกครั้งโดยอัตโนมัติ กับทุกจุดที่เรียก log รวมถึงจุดที่จะเพิ่ม
ในอนาคตด้วย แต่ก็ยังมีขอบเขตที่ต้องรู้ไว้ตรง ๆ: ขั้นที่ 5 (กฎ path ที่เหลือ) จับคู่ได้แค่**จนถึงช่องว่างถัดไป**
เท่านั้น ดังนั้น path ใดก็ตามที่มีช่องว่างอยู่หลังจุดเริ่มต้น ไม่ว่าจะอยู่นอกโฟลเดอร์ home (เช่น
`D:\Media Library\...` หรือ `C:\Program Files\...`) หรืออยู่ใต้ home แต่ชื่อไฟล์มีช่องว่าง (เช่น
`C:\Users\bob\Documents\Jane Doe.pdf` ซึ่งจะเหลือ `<path> Doe.pdf`) ยังคงมีส่วนหลังช่องว่างแรกทิ้งไว้ในบรรทัด log — **ส่วนหางนี้ (หลังช่องว่างแรก) ไม่มีการรับประกันใด ๆ อีกแล้ว** ขั้นที่ 2 และ 3 เพิ่มโอกาสที่ชื่อบัญชี
จะถูกจับได้ก่อนถึงจุดนั้น แต่ไม่ได้ปิดช่องทั้งหมด เศษของชื่อบัญชีอาจหลงเหลืออยู่ในส่วนหางได้ในกรณีเหล่านี้:
(ก) ชื่อบัญชีสั้นกว่า 3 ตัวอักษร — ขั้นที่ 3 จะไม่แทนเลย เช่น `USERNAME=Al` ในข้อความ
`D:\Media Library\Al\x.mp4` จะเหลือ `Al` อยู่ในส่วนหาง; (ข) ชื่อบัญชีเป็นส่วนหนึ่งของคำหรือตัวเลขที่ยาวกว่า
เช่น `USERNAME=bob` แต่ข้อความมีคำว่า `bob2020` — ขั้นที่ 3 จับเฉพาะคำเดี่ยวเท่านั้นและปล่อยผ่านคำที่ติดกับ
ตัวอักษร/ตัวเลขอื่น; (ค) ตัวพิมพ์ใหญ่เล็กต่างกันในตัวอักษรที่ไม่ใช่ ASCII เช่น `USERNAME=élodie` แต่ข้อความมี
`Élodie` — การเทียบแบบไม่สนตัวพิมพ์ครอบคลุมเฉพาะตัวอักษร ASCII เท่านั้น; หรือ (ง) `USERNAME` เป็นหลายคำ เช่น
`First Last` แต่ข้อความมีเพียงคำเดียวอย่าง `First` — ขั้นที่ 3 แทนได้เฉพาะสตริง `USERNAME` เต็มรูปแบบเท่านั้น
จึงไม่จับคำย่อยนี้ ด้วยเหตุนี้ไฟล์ log นี้จึงยังไม่ได้การันตีว่าจะไม่มี URL, path หรือเศษของชื่อบัญชีหลุด
เข้ามาได้เลย รับประกันได้แค่ว่ารูปแบบที่ตรงกับเงื่อนไขของแต่ละขั้นทั้งหกข้อข้างต้นจะถูกแทนที่แน่นอน
ส่วนที่แยกออกไปคนละกลไกกัน:
Lalin Cast ยังไม่ log ข้อมูลส่วนบุคคล (PII), รหัสจับคู่ทีวี (TV pairing code), คุกกี้ หรือ token/key ใด ๆ
ลงไฟล์นี้อย่างถาวร — ค่าเหล่านี้ไม่เคยถูกส่งเข้ามาที่จุดเขียน log ตั้งแต่แรก จึงไม่มีรูปแบบให้ sanitiser
จับได้เลย การไม่มีค่าเหล่านี้ในไฟล์ log เป็นเรื่องวินัยของแต่ละจุดที่เรียก log ไม่ใช่สิ่งที่ฟังก์ชันนี้
บังคับใช้ ข้อความ debug/log จะพิมพ์เฉพาะข้อมูลสถานะทางเทคนิคของแอปเอง (เช่น สถานะการ bind พอร์ต,
สถานะการเชื่อมต่อ) ไม่ใช่เนื้อหาที่ระบุตัวตนผู้ใช้ ลิงก์จากบรรทัดคำสั่ง (ข้อ 6) ก็อยู่ภายใต้กฎเดียวกันนี้ —
ไม่ถูก log ไม่ว่าจะผ่านการตรวจสอบรูปแบบหรือไม่ก็ตาม

ไฟล์นี้หมุนเวียนเองเมื่อไฟล์ปัจจุบันมีขนาดเกินประมาณ 512 KiB — ไฟล์เก่าจะถูกเก็บไว้อีกหนึ่งไฟล์
(`lalin-cast.log.1`) แล้วเริ่มไฟล์ใหม่ เก็บไว้สูงสุดสองไฟล์เท่านั้น เพดานรวมจึงประมาณ 1 MiB และไม่โตต่อไป
เรื่อย ๆ หน้าต่างการตั้งค่ามีปุ่มเปิดโฟลเดอร์นี้โดยตรง (ดู [`README.md`](README.md) หัวข้อ "Support" และ
"Settings") ลบไฟล์เหล่านี้ได้โดยลบโฟลเดอร์ `logs` ทิ้ง (ดูข้อ 12)

## 12. การลบข้อมูล

เนื่องจากข้อมูลทั้งหมดที่แอปเก็บอยู่ในเครื่องของผู้ใช้เอง การลบข้อมูลทำได้โดยลบโฟลเดอร์ข้อมูลแอปทั้งสองโฟลเดอร์ทิ้ง:

```
%APPDATA%\ai.lalin.cast\
%LOCALAPPDATA%\ai.lalin.cast\
```

การลบโฟลเดอร์แรกจะลบทั้ง `media-settings.json` (รวม `dialDeviceId`/`dialFriendlyName` ที่ตั้งไว้) และ
สถานะภายในอื่น ๆ ของแอป ส่วนโฟลเดอร์ที่สองมีไฟล์วงจรชีวิตของตัวเปิดแอป (`lifecycle.json` — ดูข้อ 7) และ
โฟลเดอร์ย่อย `logs\` ที่เก็บไฟล์ log ในเครื่อง (`lalin-cast.log` และ `lalin-cast.log.1` ถ้ามี — ดูข้อ 11)
การลบโฟลเดอร์ที่สองทั้งโฟลเดอร์จึงลบไฟล์ log ไปด้วยเสมอ หากเคยเปิดตัวเลือก "เริ่มพร้อม Windows" ไว้ ให้ปิดตัวเลือกนั้นจากหน้าต่างการตั้งค่าก่อนลบโฟลเดอร์ (หรือลบค่า
`Lalin Cast` ออกจาก registry ที่ `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` เอง) มิฉะนั้นแอปจะยัง
ถูกเรียกให้เริ่มทำงานทุกครั้งที่เข้าสู่ระบบ Windows ต่อไป — ดูข้อ 7 การลบข้อมูลบัญชี Google/YouTube (ประวัติ
การรับชม, คุกกี้เข้าสู่ระบบ) ต้องทำผ่านการตั้งค่าบัญชี Google โดยตรง เพราะข้อมูลนั้นไม่ได้อยู่ในความควบคุม
ของ Lalin Cast

## 13. ติดต่อ

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
| `sleepTimerMinutes` | Sleep-timer duration in minutes; accepted values are {0, 15, 30, 60, 90, 120}. `0` disables/cancels it; when it fires, Rust writes it back to `0` itself — see section 8 | No |
| `codecFilter` | Which codec the YouTube page is told it supports through the standard Web API (`off` or `h264`); takes effect only after the next page reload — see section 8 | No |
| `hardwareDecoding` | Turns hardware-accelerated video decoding on or off for the media window. Defaults to on; takes effect only after restarting the app — see section 8 | No |
| `touchOverlay` | Turns the on-screen touch control buttons on or off; they appear after the first detected screen touch. Defaults to on — see section 8 | No |
| `startWithWindows` | Turns starting Lalin Cast with Windows on or off (this account's registry Run key). Defaults to off; only ever set from the settings window — see section 7 | No |
| `deepLinkScheme` | Turns registering `lalin-cast://` links to open in Lalin Cast on or off (writes/removes a value under `HKCU\Software\Classes\lalin-cast` for this account). Defaults to off; opt-in, only ever set from the settings window — see section 7 | No |
| `windowBounds` | The media window's last position (x, y) and size (width, height), in pixels. Written by Rust only; never shown in the settings window's snapshot — see section 7 | No |
| `uiScale` | The media window's display scale (zoom), through WebView2's own `set_zoom` API. Accepted values are {100, 125, 150, 175, 200} percent; applies immediately when set, and again after the app restarts — see section 7 | No |
| `sleepAtEndOfVideo` | Turns on/off pausing playback automatically once the current video ends (guarding against one YouTube autoplay-next). Defaults to off; not reset back to off automatically — see section 7 | No |
| `keepDisplayAwake` | Keeps the display/machine from sleeping only while a video is actually playing, by calling a Windows API only. Defaults to on — see section 8 | No |
| `hideShorts` | Hides the Shorts shelf on the home page with Lalin Cast's own CSS. Defaults to off (opt-in) — see section 10 | No |
| `hideGuideTabs` | Hides the Shorts tab in the side navigation with Lalin Cast's own CSS. Defaults to off (opt-in) — see section 10 | No |

A previous build stored an `adFilterMode` key; it was removed in this H0 release and is no longer
read or written. If an old `media-settings.json` still has that key from a previous install, the
app ignores it.

Mini-player mode is not a key stored in this file — it is current-session state only. It appears as
a `true`/`false` value in the settings window's snapshot but is not persisted across app restarts.

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
exactly once more; in addition, the offline case retries automatically on a schedule (see
section 7).

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

## 7. Desktop integration: launcher lifecycle file, window position, start with Windows, offline auto-retry, and diagnostics

This release adds two more settings keys to the same `media-settings.json` file described in
section 2: `startWithWindows` (bool, turns starting with Windows on or off) and `windowBounds` (the
media window's position/size, written by Rust only and never shown in the settings window's
snapshot). Neither key ever leaves the device, same as every other key in this file — see section 2
for what `windowBounds` stores (the window's x/y position and width/height, in pixels).

**Lifecycle file (`lifecycle.json`):** Every time it runs, Lalin Cast always writes its current
lifecycle state (starting/ready/stopped/failed) to `lifecycle.json` at
`%LOCALAPPDATA%\ai.lalin.cast\lifecycle.json`, atomically (writing a temp file, then renaming it
into place), so an external launcher such as Lalin Studio can check on it. This file contains only
the process's own technical state (process id, exit code, an error code) and a request identifier
(`requestId`) the launcher chooses itself (an opaque token, not user-identifying data). **No URL,
deep link, cookie, or token of any kind is ever written to this file.** See the full contract at
[`docs/architecture/CAST_LAUNCHER_IPC.md`](docs/architecture/CAST_LAUNCHER_IPC.md).

**Start with Windows:** Only when the user turns on "start with Windows" from the settings window
(never enabled automatically) does the app write a value into the current Windows account's own Run
key (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`), through Windows' own `reg.exe` command
with fixed arguments (no PowerShell, no unsafe code). The value written is only the full path to the
`.exe` file — no other arguments travel with it. Turning the setting off removes that value from the
registry. This write/delete is limited to that single value in the current user's own account; it
never touches machine-wide (`HKLM`) registry or another user's account.

**`lalin-cast://` URL scheme link:** Only when the user turns on "Let `lalin-cast://` links open in
Lalin Cast" from the settings window (off by default, the `deepLinkScheme` key, never enabled
automatically, and never by the installer) does the app register the `lalin-cast` scheme into
`HKCU\Software\Classes\lalin-cast` for the current Windows account only, through the
`tauri-plugin-deep-link` crate, which is used solely to register, unregister, and check that
registry entry and does nothing else. No administrator rights are required, and it never touches
machine-wide (`HKLM`) registry or another account's. Turning the setting off unregisters it (removes
the value from that same registry entry). The app persists this setting only once the registry actually
reached the requested state (turning the setting off while nothing was registered counts as
success without an unregister call). When a `lalin-cast://` link reaches the app (from
Explorer, a browser, or another app), Windows delivers it as a new process's command-line argument,
going through the exact same validation-and-convert-to-a-YouTube-URL path as the command-line link
(see section 6) and under all the same rules: a value that fails validation is simply discarded, and
one that passes is **never written to a log file or persisted to any settings file**. The raw
`lalin-cast://` string itself is likewise never sent into the webview or logged — only the converted
YouTube URL is ever seen.

**Offline auto-retry:** When the status window is shown because the app started offline (see
section 4), Lalin Cast repeats the same connectivity check (a TCP handshake to
`www.youtube.com:443`, exactly as in section 4 — no HTTP request or payload beyond that) on its own,
on a schedule, without the user pressing anything: starting at 5 seconds, stepping up to a maximum
of 30 seconds, and stopping on its own after 10 minutes. Each attempt's result is never persisted,
the same as the initial check.

**UI scale and sleep at end of video:** This release adds two more settings keys to the same file
described in section 2: `uiScale` (the media window's display scale/zoom, through WebView2's own
API) and `sleepAtEndOfVideo` (pauses playback automatically once the current video ends). Both are
entirely local settings, the same as every other key in this file — neither value ever leaves the
device.

**Launch command for Steam:** The "copy launch command for Steam" button in the settings window
builds text containing only the full path to the app's own `.exe` file on this machine
(`"<path>" --fullscreen` — no URL or other argument travels with it), and copies it to the device's
clipboard **only when the user presses that button** — nothing else triggers this copy automatically.

**Reset to defaults:** The two-step confirm "reset to defaults" button in the settings window resets
almost every setting back to the app's own defaults, through the same per-key path used for normal
setting saves, **but does not remove** the DIAL name/id (`dialDeviceId`, `dialFriendlyName`), the
language (`language`), the setup-wizard-completed flag (`setupCompleted`), the "start with
Windows" entry (`startWithWindows`), or the `lalin-cast://` scheme registration (`deepLinkScheme`) —
those six values stay exactly as they were after a reset (see section 12 for how to remove them
yourself if you want to).

**Diagnostics:** The "copy diagnostics" button in the settings window builds a plain-text summary of
the app's state: app version, Tauri/WebView2 version, OS/architecture, current language, DIAL status
**including the machine's own LAN IP address and port** (for example `192.168.1.10:8008`), network
category with the interface name (for example `Ethernet`), the DIAL friendly name, every current
setting, the app's lifecycle state with its process id (pid), and the time the text was generated —
**none of `dialDeviceId`, any URL, a deep link, a TV pairing code, a cookie, a token, or a
username/hostname** is ever included. This text is copied to the device's clipboard **only when the
user presses the button** — there is no automatic copy, and the app never sends this text off the
device on its own under any circumstance; the user decides where to paste it next (for example, into
a bug report).

**Now-playing title:** The YouTube page reads the title of the video currently playing only through
the browser's standard Media Session API (`navigator.mediaSession.metadata.title`), never any other
DOM content, and sends it to the Rust shell **on the same machine** solely to set the window title
and a line in the tray icon's tooltip (length-capped, control characters stripped). It is never
persisted and never leaves the device.

None of this involves any telemetry system — Lalin Cast still has none, as stated in section 1.

## 8. Playback: sleep timer, codec filter, hardware decoding, touch overlay, and keeping the display awake

The sleep timer (`sleepTimerMinutes`) runs entirely on the device: the timer itself is a Rust thread
counting down in memory, with no network connection involved. When it fires, Rust sends an event to
the media window in the same process to pause every video on the page and show Lalin Cast's own
on-screen message, then writes the key back to `0` itself. It can be cancelled immediately by
setting it to `0` from the settings window.

The codec filter (`codecFilter`, `off` or `h264`) — when set to `h264` — has the script injected
into the YouTube page override two standard Web APIs, `MediaSource.isTypeSupported` and
`HTMLMediaElement.prototype.canPlayType`, so they report no support only for formats containing
`vp8`, `vp9`, or `av01` (every other format is unaffected). This change only affects what the
YouTube page "sees" through those two standard APIs — nothing extra is read, sent, or recorded, and
WebView2's actual decoding capability is unchanged. It only takes effect after the page is reloaded
(an already-open page keeps its current behavior).

Hardware video decoding (`hardwareDecoding`) sets a WebView2 startup flag
(WebView2's default arguments plus `--disable-accelerated-video-decode` when off) for the media window only. It is purely a local
rendering-path choice — no data leaves the device — and only takes effect after the app is
restarted.

The on-screen touch overlay (`touchOverlay`) is a DOM element Lalin Cast creates itself inside the
page. It appears after the first detected screen touch (`touchstart`) and dispatches synthetic key
events through the same mechanism as the controller/keyboard support (see section 5) — no touch
position data is ever collected or sent off the device; it is used only to decide whether to show or
hide the buttons.

Mini-player mode is current-session state only. It is never written to the settings file (there is
no persisted key for it, as noted in section 2) and has no additional privacy implication — it only
changes the size, position, and frame of the window that already exists.

Keeping the display awake (`keepDisplayAwake`, on by default) **calls a Windows API only**
(`SetThreadExecutionState`) to tell the operating system the machine is in use **only while a video
is actually playing** (driven by the same playing/paused state used for the now-playing title — see
section 7). This API call **sends nothing off the device, reads nothing that is on screen, and
involves no network of any kind** — it only asks the operating system not to sleep the display or
the machine. As soon as playback stops, the setting is turned off, or Lalin Cast is closed, this
request is released immediately and the display/machine go back to sleeping normally on Windows'
own schedule.

## 9. Update checks

The app contacts `github.com` (specifically
`github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`) to check for a new
version, both on startup (non-blocking) and when the user checks manually from the menu. This
HTTPS request carries only what any HTTPS request inherently carries (such as IP address and
User-Agent, per the HTTP protocol itself); no additional personal or usage data is attached.
Installing an update always requires explicit user confirmation; nothing installs automatically
without being asked. See the "Updating" section of [`README.md`](README.md) for more detail.

## 10. The YouTube page in the main window

The main Lalin Cast window loads the real YouTube TV page from `https://www.youtube.com/tv`
through a remote WebView. Everything that happens inside that page — cookies, Google account
sign-in, watch history, ads, the recommendation algorithm — is entirely under YouTube's/Google's
control, not Lalin Cast's. See Google's privacy policy at `https://policies.google.com/privacy`
for what happens specifically inside that page.

**Hiding the Shorts shelf / Shorts tab (`hideShorts`, `hideGuideTabs` keys, both off by default,
opt-in):** When either option is turned on from the settings window, the script injected into the
page **reads only the already-rendered DOM of the YouTube page** to tag matching Shorts-shelf/
Shorts-tab elements with Lalin Cast's own class, then hides them with Lalin Cast's own stylesheet
(`display: none`). **Nothing that is displayed on screen is ever read and sent anywhere, nothing
about YouTube's response is intercepted or modified, no node is ever removed from the page, and the
Home tab is never hidden under any circumstance** (see
[`docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](docs/architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md)
for the full reasoning and the boundary this follows). Because this is entirely our own CSS, it may
stop working at any time YouTube changes its page structure.

## 11. Local log file

Lalin Cast writes a local log file at `%LOCALAPPDATA%\ai.lalin.cast\logs\lalin-cast.log` to help
diagnose problems (such as a failed DIAL bind or a failed update check). **This file stays on the
device only — nothing in it is ever sent anywhere automatically, under any circumstance.** It is
entirely up to the user whether to attach it to a bug report (see the "Support" section of
[`README.md`](README.md)).

Before any text reaches this file, every line always passes through the same one sanitiser
function first — there is no path that writes raw text to the file. That function does the
following, **in this order**, to every message before it is written (the order matters — each
step relies on the one before it):

1. every control character (including `\r` and `\n`) is replaced with a space
2. if the Windows home folder (`USERPROFILE`) can be read and is at least 3 characters long:
   **every** occurrence of it (ASCII case-insensitive — non-ASCII letters, such as accented or
   non-English characters, must still match exactly by case — in both `\` and `/` form) is
   replaced with `<home>`, counted only when the character right after it is not a letter or
   digit (so home `C:\Users\bob` does not match inside `C:\Users\bobby`) — this step always runs
   **before** the path rule in step 5, so that a space inside the account name (as in
   `C:\Users\First Last`) cannot cut the path in the middle of the name.
3. if the Windows account name (`USERNAME`) can be read and is at least 3 characters long: every
   occurrence of the **full `USERNAME` string** is replaced with `<user>`, matched **as a whole
   word only** (the character immediately before and after must be neither a letter nor a digit;
   ASCII case-insensitive only) — this covers the account name showing up somewhere that isn't a
   home-folder path
4. any URL with **any** scheme (not only the fixed `http`/`https`/`lalin-cast` three from before)
   followed by `://` (up to the next whitespace) is replaced with `<url>`
5. any Windows filesystem path starting with `<letter>:\` or `<letter>:/` (e.g. `C:\` or `C:/`) or
   `\\`, or starting `<home>\` or `<home>/` (a path under the home folder whose prefix step 2
   already replaced), up to the next whitespace, is replaced with `<path>` — so a path like
   `C:\Users\First Last\AppData\x.log` becomes `<path>` as a whole: the account name, the
   sub-folders and the file name, not only the home-folder prefix
6. the message is truncated to 512 characters (counted in Unicode scalar values, not bytes)

Because **every log write funnels through this one function** — not something each call site in
the code has to remember to do on its own — all six steps above happen every time, automatically,
for every call site including any added later. There is still a limit worth stating plainly: step
5 (the remaining path rule) only matches up to the next whitespace character, so any path that
contains a space after its start, whether outside the home folder (for example
`D:\Media Library\...` or `C:\Program Files\...`) or under it with a file name containing a space
(for example `C:\Users\bob\Documents\Jane Doe.pdf`, which becomes `<path> Doe.pdf`), still has its
tail past that first space left in the line. **That
tail is not a guaranteed-clean zone.** Steps 2 and 3 raise the odds that an account name is caught
before that point, but they do not close every gap — a fragment of the account name can still
survive in the tail in these cases: (a) the account name is under 3 characters, so step 3 never
replaces it at all — for example `USERNAME=Al` leaves `Al` behind in
`D:\Media Library\Al\x.mp4`; (b) the account name sits inside a longer word or number, such as
`USERNAME=bob` against the text `bob2020` — step 3 only matches the name as a standalone word and
passes over it when it's glued to other letters or digits; (c) the case differs in non-ASCII
letters, such as `USERNAME=élodie` against the text `Élodie` — the case-insensitive match covers
ASCII letters only; or (d) `USERNAME` is more than one word, such as `First Last`, but the text
contains only one of those words, such as `First` — step 3 only replaces the full `USERNAME`
string and does not match a sub-word of it. This file is therefore still not a guarantee that no
URL, path, or account-name fragment can ever appear in it — only that text matching each step's
own conditions, across all six steps above, is reliably caught. Separately, and by a different
mechanism, Lalin Cast still does not persistently log
personal information (PII), a TV pairing code, a cookie, or any token/key to this file — those
values are never handed to the logging call in the first place, so there is no pattern here for
the sanitiser to catch; keeping them out is call-site discipline, not something this function
enforces. Whatever debug/log output exists prints only the app's own technical state (such as
port-bind status or connection status), never user-identifying content. The command-line deep link
(section 6) falls under this same rule — it is never logged, whether or not it passes validation.

This file rotates on its own once the current file passes roughly 512 KiB: the older file is kept
as one extra copy (`lalin-cast.log.1`) and a new file is started; at most two files are ever kept,
so the total stays around 1 MiB and never grows without bound. The settings window has a button
that opens this folder directly (see the "Support" and "Settings" sections of
[`README.md`](README.md)). Delete these files by deleting the `logs` folder (see section 12).

## 12. Deleting your data

Because everything the app stores lives on the user's own machine, deleting your data means
deleting both of the app's data folders:

```
%APPDATA%\ai.lalin.cast\
%LOCALAPPDATA%\ai.lalin.cast\
```

Deleting the first folder removes `media-settings.json` (including any `dialDeviceId`/
`dialFriendlyName` you set) and any other internal app state. The second folder holds the launcher
lifecycle file (`lifecycle.json` — see section 7) and the `logs\` subfolder holding the local log
file (`lalin-cast.log` and `lalin-cast.log.1` if present — see section 11); deleting that whole
second folder always removes the log file along with it. If you ever turned on "start with Windows", turn
it off from the settings window before deleting the folders (or remove the `Lalin Cast` value from
the registry yourself, at `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) — otherwise the app
will keep being launched at sign-in — see section 7. Deleting Google/YouTube account data (watch
history, sign-in cookies) must be done through your Google account settings directly, since that
data is not under Lalin Cast's control.

## 13. Contact

Since Lalin Cast is an independent open-source project, the primary contact channel is GitHub
Issues on this repository (`github.com/Freshair129/lalin-cast`). Before a public release, the
project founder should consider adding another contact channel (such as an email address) to this
document if desired — this is also tracked in the checklist in
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md).
