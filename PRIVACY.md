# นโยบายความเป็นส่วนตัว — Lalin Cast

_ภาษาไทยเป็นภาษาหลักของเอกสารนี้ คำแปลภาษาอังกฤษอยู่ด้านล่าง (English translation follows the
Thai text)._

เอกสารฉบับนี้เป็นสถานะปัจจุบันของแผนปรับปรุง H0 (`docs/plans/H0_RELEASE_READINESS_PLAN.md`) ยังไม่
ผ่านการอนุมัติจากผู้ก่อตั้งโปรเจกต์ (human gate H1) — ห้าม merge เข้า `main` หรือเผยแพร่เป็นทางการ
จนกว่าจะผ่านการอนุมัตินั้น

## 1. สรุปสั้น ๆ

Lalin Cast ไม่มีระบบ telemetry, ไม่มีการส่ง crash report ออกจากเครื่อง, และไม่มีระบบบัญชีผู้ใช้ของ
Lalin ผู้ใช้ไม่ต้องสมัครหรือเข้าสู่ระบบอะไรกับ Lalin เพื่อใช้แอปนี้ ข้อมูลเกือบทั้งหมดที่แอปสร้างหรือ
เก็บไว้อยู่บนเครื่องของผู้ใช้เท่านั้น การเชื่อมต่อเครือข่ายที่แอปทำเองมีอยู่สองทางเท่านั้น: (ก) ตรวจสอบ
อัปเดตแอปจาก GitHub Releases และ (ข) ตอบสนองการค้นหาอุปกรณ์ผ่านโปรโตคอล DIAL บนเครือข่ายวงเดียวกัน
(LAN) เพื่อให้แอป YouTube บนมือถือค้นหาเจอ Lalin Cast ได้ นอกเหนือจากนี้ หน้าต่างหลักของแอปจะโหลด
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

## 4. การตรวจสอบอัปเดต

แอปจะติดต่อ `github.com` (ที่อยู่: `github.com/Freshair129/lalin-cast/releases/latest/download/
latest.json`) เพื่อตรวจสอบว่ามีรุ่นใหม่หรือไม่ ทั้งตอนเปิดแอป (แบบ non-blocking) และเมื่อผู้ใช้กด
ตรวจสอบเองจากเมนู คำขอ HTTPS นี้มีข้อมูลมาตรฐานที่คำขอ HTTPS ทุกครั้งมีอยู่แล้ว (เช่น ที่อยู่ IP,
User-Agent) ตามกลไกของโปรโตคอล HTTP เอง ไม่มีการแนบข้อมูลส่วนตัวหรือข้อมูลการใช้งานเพิ่มเติมใด ๆ เข้าไป
ในคำขอนี้ การติดตั้งอัปเดตต้องให้ผู้ใช้กดยืนยันเองเสมอ ไม่มีการติดตั้งอัตโนมัติโดยไม่ถาม ดูรายละเอียด
เพิ่มเติมที่หัวข้อ "Updating" ใน [`README.md`](README.md)

## 5. หน้า YouTube ในหน้าต่างหลัก

หน้าต่างหลักของ Lalin Cast โหลดหน้า YouTube TV จริงจาก `https://www.youtube.com/tv` ผ่าน remote
WebView ทุกสิ่งที่เกิดขึ้นภายในหน้านั้น (คุกกี้, การเข้าสู่ระบบบัญชี Google, ประวัติการรับชม, โฆษณา,
อัลกอริทึมแนะนำวิดีโอ) อยู่ภายใต้การควบคุมของ YouTube/Google ทั้งหมด ไม่ใช่ของ Lalin Cast โปรดอ่าน
นโยบายความเป็นส่วนตัวของ Google ที่ `https://policies.google.com/privacy` สำหรับสิ่งที่เกิดขึ้นในหน้า
นั้นโดยเฉพาะ

## 6. Logging

Lalin Cast ไม่ log ข้อมูลส่วนบุคคล (PII), รหัสจับคู่ทีวี (TV code), คุกกี้, หรือ token/key ใด ๆ ลงไฟล์
log อย่างถาวร ข้อความ debug/log ระหว่างพัฒนา (ถ้ามี) จะพิมพ์เฉพาะข้อมูลสถานะทางเทคนิคของแอปเอง (เช่น
สถานะการ bind พอร์ต, สถานะการเชื่อมต่อ) ไม่ใช่เนื้อหาที่ระบุตัวตนผู้ใช้

## 7. การลบข้อมูล

เนื่องจากข้อมูลทั้งหมดที่แอปเก็บอยู่ในเครื่องของผู้ใช้เอง การลบข้อมูลทำได้โดยลบโฟลเดอร์ข้อมูลแอปทิ้ง:

```
%APPDATA%\ai.lalin.cast\
```

การลบโฟลเดอร์นี้จะลบทั้ง `media-settings.json` (รวม `dialDeviceId`/`dialFriendlyName` ที่ตั้งไว้) และ
สถานะภายในอื่น ๆ ของแอป การลบข้อมูลบัญชี Google/YouTube (ประวัติการรับชม, คุกกี้เข้าสู่ระบบ) ต้องทำผ่าน
การตั้งค่าบัญชี Google โดยตรง เพราะข้อมูลนั้นไม่ได้อยู่ในความควบคุมของ Lalin Cast

## 8. ติดต่อ

เนื่องจาก Lalin Cast เป็นโปรเจกต์โอเพนซอร์สอิสระ ช่องทางติดต่อหลักคือ GitHub Issues ของ repository
นี้ (`github.com/Freshair129/lalin-cast`) ก่อนเผยแพร่ต่อสาธารณะ ผู้ก่อตั้งโปรเจกต์ควรพิจารณาเพิ่มช่องทาง
ติดต่ออื่น (เช่นอีเมล) ไว้ในเอกสารนี้หากต้องการ — รายการนี้อยู่ใน checklist ของ
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md) เช่นกัน

---

# Privacy Policy — Lalin Cast (English)

_This is an English translation of the Thai text above, which is the primary version of this
document._

This document reflects the current state of the H0 readiness plan
(`docs/plans/H0_RELEASE_READINESS_PLAN.md`). It has not yet been approved by the project founder
(human gate H1) — do not merge to `main` or publish it as final until that approval happens.

## 1. Summary

Lalin Cast has no telemetry, sends no crash reports off the device, and has no Lalin user-account
system. Users never sign up for or log into anything with Lalin to use this app. Almost all data
the app creates or stores stays on the user's own machine. The app makes exactly two kinds of
network connections on its own: (a) checking for app updates from GitHub Releases, and (b)
responding to device discovery over the DIAL protocol on the local network (LAN) so the YouTube
mobile app can find Lalin Cast. Beyond that, the main window loads the real YouTube TV page from
`youtube.com`, which is governed by Google's/YouTube's own privacy policy, not Lalin's.

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

## 4. Update checks

The app contacts `github.com` (specifically
`github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`) to check for a new
version, both on startup (non-blocking) and when the user checks manually from the menu. This
HTTPS request carries only what any HTTPS request inherently carries (such as IP address and
User-Agent, per the HTTP protocol itself); no additional personal or usage data is attached.
Installing an update always requires explicit user confirmation; nothing installs automatically
without being asked. See the "Updating" section of [`README.md`](README.md) for more detail.

## 5. The YouTube page in the main window

The main Lalin Cast window loads the real YouTube TV page from `https://www.youtube.com/tv`
through a remote WebView. Everything that happens inside that page — cookies, Google account
sign-in, watch history, ads, the recommendation algorithm — is entirely under YouTube's/Google's
control, not Lalin Cast's. See Google's privacy policy at `https://policies.google.com/privacy`
for what happens specifically inside that page.

## 6. Logging

Lalin Cast does not persistently log personal information (PII), TV pairing codes, cookies, or any
tokens/keys. Whatever debug/log output exists during development prints only the app's own
technical state (such as port-bind status or connection status), never user-identifying content.

## 7. Deleting your data

Because everything the app stores lives on the user's own machine, deleting your data means
deleting the app's data folder:

```
%APPDATA%\ai.lalin.cast\
```

Deleting this folder removes `media-settings.json` (including any `dialDeviceId`/
`dialFriendlyName` you set) and any other internal app state. Deleting Google/YouTube account data
(watch history, sign-in cookies) must be done through your Google account settings directly, since
that data is not under Lalin Cast's control.

## 8. Contact

Since Lalin Cast is an independent open-source project, the primary contact channel is GitHub
Issues on this repository (`github.com/Freshair129/lalin-cast`). Before a public release, the
project founder should consider adding another contact channel (such as an email address) to this
document if desired — this is also tracked in the checklist in
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md).
