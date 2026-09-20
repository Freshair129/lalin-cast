<!--
Lalin Cast เป็นโปรเจกต์อิสระของบุคคลที่สาม ไม่ได้เกี่ยวข้อง ไม่ได้รับการรับรอง และไม่ได้เป็นส่วนหนึ่งของ
YouTube หรือ Google — Lalin Cast is an independent, third-party project with no affiliation to,
endorsement from, or sponsorship by YouTube or Google.
-->

## สรุปการเปลี่ยนแปลง / Summary

<!-- อธิบายว่า PR นี้ทำอะไรและทำไม / Describe what this PR does and why. -->

## เกี่ยวข้องกับ / Related

<!-- ลิงก์ issue หรือแผนที่เกี่ยวข้อง เช่น docs/plans/W5_DESKTOP_PLAN.md / Link related issues or plans,
     e.g. docs/plans/W5_DESKTOP_PLAN.md -->

## Checklist

ทำเครื่องหมายเฉพาะข้อที่เกี่ยวข้องกับ PR นี้จริง ข้อที่ไม่เกี่ยวข้องปล่อยว่างไว้พร้อมอธิบายเหตุผลสั้น ๆ
ด้านล่าง / Only check items that actually apply to this PR. Leave irrelevant items unchecked and
note why below.

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` ผ่าน / passes
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` ผ่าน / passes
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` ผ่าน / passes
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` ผ่าน / passes
- [ ] ชุดทดสอบ Node ที่เกี่ยวข้องผ่าน — `node --check` ทุกไฟล์ `.js` ที่แก้ และชุดทดสอบที่ครอบคลุมไฟล์นั้น
      (`node src-tauri/injected.test.js`, `node fallback/settings.test.js`,
      `node fallback/setup.test.js`, `node fallback/status.test.js`, `node fallback/update.test.js`)
      / relevant Node suites pass — `node --check` on every changed `.js` file, plus whichever suite
      covers it (`node src-tauri/injected.test.js`, `node fallback/settings.test.js`,
      `node fallback/setup.test.js`, `node fallback/status.test.js`, `node fallback/update.test.js`)
- [ ] `src-tauri/capabilities/default.json` **ไม่เปลี่ยน** (`git diff` ว่างเปล่า) — ถ้าจำเป็นต้องเปลี่ยน
      จริง อธิบายเหตุผลไว้ด้านบนอย่างชัดเจน / `src-tauri/capabilities/default.json` is **unchanged**
      (empty `git diff`) — if it truly must change, explain why clearly above
- [ ] ไม่มีการเพิ่ม crate ใหม่ใน `Cargo.toml`/`Cargo.lock`, ไม่มี `windows-sys` feature ใหม่, และไม่มี
      block `unsafe` ใหม่ โดยไม่ได้รับอนุมัติล่วงหน้า / no new crate added to
      `Cargo.toml`/`Cargo.lock`, no new `windows-sys` feature, and no new `unsafe` block without
      prior approval
- [ ] เอกสารที่เกี่ยวข้องอัปเดตแล้ว (README, PRIVACY, `docs/**` ที่เกี่ยวข้อง) และ
      `THIRD_PARTY_NOTICES.md` ตรงกับ `src-tauri/Cargo.lock` ปัจจุบัน (ถ้ามี dependency เปลี่ยนแปลง) /
      related docs are updated (README, PRIVACY, relevant `docs/**`), and `THIRD_PARTY_NOTICES.md`
      matches the current `src-tauri/Cargo.lock` (if any dependency changed)
- [ ] ไม่มี secret, token, คุกกี้, รหัสจับคู่ทีวี (TV pairing code), ข้อมูลบัญชีผู้ใช้ หรือ URL ที่มี
      query string ปรากฏใน diff, commit message, หรือ log ใด ๆ ของ PR นี้ / no secret, token, cookie,
      TV pairing code, user account data, or URL with a query string appears in this PR's diff,
      commit messages, or any log

## วิธีทดสอบ / How this was tested

<!-- อธิบายการทดสอบด้วยมือหรืออัตโนมัติเพิ่มเติมจาก checklist ข้างบน (เช่น ทดสอบบนเครื่องจริง, ผลลัพธ์
     ของคำสั่งที่รัน) / Describe any manual or automated testing beyond the checklist above (e.g. a
     real-device test, output of commands run). -->
