Lalin Cast — โหมดพกพา / Portable mode
=====================================

[ไทย]

วิธีใช้:
- แตกไฟล์ zip นี้ไปยังโฟลเดอร์ใดก็ได้ที่คุณเขียนได้ (เช่น แฟลชไดรฟ์ USB) โดยให้ lalin-cast.exe และ
  lalin-cast.portable อยู่ในโฟลเดอร์เดียวกันเสมอ แล้วดับเบิลคลิก lalin-cast.exe เพื่อเปิดแอป
- ห้ามลบไฟล์ lalin-cast.portable — ไฟล์นี้บอกให้แอปรู้ว่าต้องทำงานแบบพกพา (เนื้อหาในไฟล์ไม่สำคัญ อาจว่างเปล่า)

ข้อกำหนด:
- ต้องมี Microsoft Edge WebView2 Runtime ติดตั้งอยู่บนเครื่องที่ใช้เปิด (เครื่อง Windows 10/11 ส่วนใหญ่มีอยู่แล้ว)
- ห้ามเปิดพร้อมกับ Lalin Cast รุ่นที่ติดตั้งแบบปกติในเครื่องเดียวกัน — ทั้งสองใช้ identifier เดียวกัน การเปิด
  ตัวที่สองจะไปเรียกตัวที่เปิดอยู่แล้วแทนที่จะเปิดใหม่

ข้อมูลของคุณ:
- เมื่อเปิดแอปครั้งแรก จะมีโฟลเดอร์ชื่อ lalin-cast-data ถูกสร้างขึ้นข้าง lalin-cast.exe เก็บการตั้งค่า,
  log, และ session YouTube ที่ล็อกอินอยู่ทั้งหมด
- ให้ถือว่าโฟลเดอร์ lalin-cast-data เป็นเหมือนรหัสผ่าน — ใครก็ตามที่ได้โฟลเดอร์นี้ไป (เช่น ทำ USB หาย)
  จะสามารถใช้บัญชี YouTube ที่ล็อกอินอยู่ได้ทันที ก่อนส่งต่อหรือทำสำเนาไดรฟ์ ให้ออกจากระบบ YouTube ในแอป
  หรือลบโฟลเดอร์นี้ทิ้งก่อน

วิธีอัปเดต:
- ดาวน์โหลด zip เวอร์ชันใหม่ แตกไฟล์ไปยังโฟลเดอร์ใหม่ แล้วย้ายโฟลเดอร์ lalin-cast-data จากชุดเก่ามาไว้ข้าง
  lalin-cast.exe ของชุดใหม่ (เพื่อไม่ให้เสียการตั้งค่าและ session เดิม)

การตรวจไฟล์ก่อนแตก zip:
- ก่อนแตก zip นี้ ให้ตรวจกับไฟล์ SHA256SUMS.txt ที่แนบมาด้วยกัน ด้วยคำสั่ง PowerShell
  Get-FileHash .\Lalin-Cast_<เวอร์ชัน>_<arch>_portable.zip -Algorithm SHA256 แล้วเทียบค่ากับบรรทัดของไฟล์
  นี้ใน SHA256SUMS.txt ถ้าไม่ตรง ห้ามแตกไฟล์นี้


[English]

How to use:
- Extract this zip to any folder you can write to (a USB flash drive works fine), keeping
  lalin-cast.exe and lalin-cast.portable in the same folder. Double-click lalin-cast.exe to launch.
- Do not delete lalin-cast.portable — its presence is what tells the app to run in portable mode
  (its contents do not matter and may be empty).

Requirements:
- The Microsoft Edge WebView2 Runtime must be installed on the machine you run it on (most
  Windows 10/11 machines already have it).
- Do not run this at the same time as an installed copy of Lalin Cast on the same machine — both
  use the same identifier, so opening a second instance activates the one already running instead
  of starting a new one.

Your data:
- The first time you launch the app, a lalin-cast-data folder is created next to lalin-cast.exe.
  It holds your settings, logs, and your signed-in YouTube session.
- Treat the lalin-cast-data folder like a password. Anyone who gets that folder (for example, if
  the USB drive is lost) can immediately use your signed-in YouTube account. Sign out of YouTube in
  the app, or delete the folder, before handing it off or copying the drive elsewhere.

How to update:
- Download the new version's zip, extract it to a new folder, then move the lalin-cast-data
  folder from the old copy next to the new lalin-cast.exe so your settings and session carry over.

Verifying before you extract:
- Before extracting this zip, verify it against the SHA256SUMS.txt file it shipped with by running
  Get-FileHash .\Lalin-Cast_<version>_<arch>_portable.zip -Algorithm SHA256 in PowerShell and
  comparing the result to that file's line in SHA256SUMS.txt. Do not extract it if they don't match.
