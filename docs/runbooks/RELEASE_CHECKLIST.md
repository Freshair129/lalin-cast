---
version: "0.1.11b"
created_at: "2026-09-20T23:15:00+07:00,LALIN,uncommitted"
last_update: "2026-09-22T10:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "distribution"
  doc_type: "runbook"
  scope: "Step-by-step checklist for tagging and shipping a Lalin Cast release: pre-tag gates, tagging, post-tag verification, winget manifest update, post-release follow-up"
---

# Lalin Cast — รายการตรวจก่อนออกรุ่น / Release Checklist

## สถานะ / Status

**CANDIDATE — เอกสารขั้นตอนเท่านั้น ยังไม่มีการ tag เวอร์ชันเผยแพร่ต่อสาธารณะจากไฟล์นี้.** ใช้ไฟล์นี้เป็น
checklist ทุกครั้งที่เตรียม tag รุ่นใหม่ของ Lalin Cast บน `main`

**CANDIDATE — a procedure document only. No public release has been tagged from this file.** Use
this checklist every time a new Lalin Cast tag on `main` is being prepared.

อ้างอิง / References:
[`docs/architecture/LALIN_CAST_UPDATER_SPEC.md`](../architecture/LALIN_CAST_UPDATER_SPEC.md),
[`.github/workflows/release.yml`](../../.github/workflows/release.yml),
[`packaging/winget/README.md`](../../packaging/winget/README.md),
[`docs/runbooks/SIGNING_KEY_CUSTODY.md`](SIGNING_KEY_CUSTODY.md), [`SECURITY.md`](../../SECURITY.md),
[`CHANGELOG.md`](../../CHANGELOG.md)

## 1. ก่อน tag (pre-tag) / Before tagging

ทำทุกข้อให้ครบก่อนสร้าง tag — ถ้าข้อใดยังไม่เสร็จ **ห้าม tag** / Complete every item before creating a
tag — if any item is not done, **do not tag**:

- [ ] **Human gates H1–H4 ปิดครบแล้ว** (`docs/plans/H0_RELEASE_READINESS_PLAN.md`) — **human gates
      H1–H4 are all closed**:
  - [x] H1 — ผู้ก่อตั้งอนุมัติ `PRIVACY.md`/`TERMS.md` และเลือกสัญญาอนุญาตแล้ว
        (`docs/LICENSE_DECISION.md` มีสถานะ "ตัดสินใจแล้ว" ไม่ใช่ "ยังไม่ตัดสินใจ") — the founder has
        approved `PRIVACY.md`/`TERMS.md` and chosen a license (`docs/LICENSE_DECISION.md`'s status
        says "decided", not "undecided")
        **ปิดแล้ว 2026-09-21:** เลือก Apache-2.0 (PR #17) และอนุมัติ PRIVACY/TERMS — ถ้า PRIVACY หรือ
        TERMS ถูกแก้เนื้อหาหลังวันนี้ ให้ขออนุมัติใหม่ก่อน tag / **Closed 2026-09-21:** Apache-2.0
        chosen (PR #17) and PRIVACY/TERMS approved — if either document's substance changes after
        this date, get it re-approved before tagging
  - [ ] H2 — ผ่าน clean-VM install → update matrix แล้ว — the clean-VM install → update matrix has
        passed
  - [ ] H3 — regression บน Leanback จริง และการจับคู่ iPhone ด้วย identity ปัจจุบันผ่านแล้ว — real
        Leanback regression and iPhone pairing with the current identity has passed
  - [x] H4 — ซื้อใบรับรอง code-signing แล้ว **หรือ** เผยแพร่รุ่นนี้แบบยังไม่เซ็น Authenticode โดยเจตนา
        (บันทึกเหตุผลไว้) — ถ้าซื้อแล้ว ต้องเปิด step "Sign Windows binaries with Authenticode" ใน
        `.github/workflows/release.yml` (ลบ `if: false`) ก่อน tag — a code-signing certificate has
        been purchased **or** shipping this release without Authenticode signing is an intentional,
        recorded decision — if purchased, the "Sign Windows binaries with Authenticode" step in
        `.github/workflows/release.yml` must be enabled (remove `if: false`) before tagging
        **ปิดแล้ว 2026-09-21:** ผู้ก่อตั้งตัดสินใจเผยแพร่ **โดยไม่เซ็น Authenticode โดยเจตนา** ตั้งแต่ v0.2.0
        ไปจนกว่าจะซื้อใบรับรอง ผลที่ยอมรับ: SmartScreen/เบราว์เซอร์อาจเตือนว่าเป็น "publisher ที่ไม่รู้จัก"
        ผู้ใช้ยืนยันไฟล์ได้ด้วย `SHA256SUMS` และ updater ในแอปยังตรวจลายเซ็นอัปเดตของตัวเองเสมอ ถ้าซื้อใบรับรอง
        ภายหลัง ให้เปิด step ด้านบนก่อน tag รุ่นถัดไป / **Closed 2026-09-21:** the founder decided to ship
        **intentionally without Authenticode signing** from v0.2.0 until a certificate is purchased.
        Accepted consequence: SmartScreen or browsers may warn about an "unknown publisher"; users can
        verify files with `SHA256SUMS`, and the in-app updater still always verifies its own update
        signature. If a certificate is bought later, enable the step above before tagging the next
        release
  - [ ] gate อื่นที่ wave นั้น ๆ เพิ่มเข้ามาภายหลัง (เช่น H13–H17 ของ wave 5) ก็ต้องปิดก่อน ถ้าฟีเจอร์
        ของ wave นั้นรวมอยู่ในรุ่นนี้ — ดูตาราง human gates ในแผนแต่ละ wave ที่ `docs/plans/` — any
        later gates a wave adds (e.g. H13–H17 from wave 5) must also be closed if that wave's
        features are included in this release — see each wave plan's human-gates table under
        `docs/plans/`
- [ ] **human gates H22–H23 ปิดครบแล้ว** (`docs/plans/W7_DEEPLINK_PLAN.md`) — ถ้าฟีเจอร์ wave 7 รวมอยู่
      ในรุ่นนี้ — **human gates H22–H23 are both closed** (`docs/plans/W7_DEEPLINK_PLAN.md`) — if
      wave 7's features are included in this release:
  - [ ] H22 — ยืนยันว่าโทรศัพท์ (iPhone/Android YouTube app) ยังค้นหา Lalin Cast เจอผ่าน DIAL หลังการ
        ตรวจ header `MAN` ของ SSDP M-SEARCH เข้มขึ้น — ถ้าหาไม่เจอ ให้ย้อนการเปลี่ยนแปลงนี้ทันทีก่อน tag
        — confirm phones (iPhone/Android YouTube app) still discover Lalin Cast over DIAL after the
        stricter SSDP M-SEARCH `MAN` header check — if discovery fails, revert this change before
        tagging
  - [ ] H23 — ยืนยันว่าลิงก์ `lalin-cast://` เปิดแอป Lalin Cast ได้จริงจาก Windows Explorer หรือเบราว์เซอร์
        เมื่อเปิดตัวเลือก `deepLinkScheme` ไว้ **และ** เมื่อปิดตัวเลือกนี้ลง scheme ที่จดทะเบียนไว้จะหาย
        ไปจากระบบ (เปิดลิงก์แล้วไม่มีแอปใดถูกเรียก) — confirm a `lalin-cast://` link really opens the
        Lalin Cast app from Windows Explorer or a browser when the `deepLinkScheme` setting is on,
        **and** that turning the setting back off removes the registered association (opening the
        link no longer launches any app)
- [ ] **human gates H24–H25 ปิดครบแล้ว** (`docs/plans/W8_BOUNDARY_PLAN.md`) — ถ้าฟีเจอร์ wave 8 รวมอยู่
      ในรุ่นนี้ — **human gates H24–H25 are both closed** (`docs/plans/W8_BOUNDARY_PLAN.md`) — if
      wave 8's features are included in this release:
  - [ ] H24 — ยืนยันบน session Leanback จริงว่าชั้น Shorts (เมื่อเปิด `hideShorts`) และแท็บ Shorts ใน
        แถบนำทาง (เมื่อเปิด `hideGuideTabs`) ซ่อนได้จริง และ focus ไม่เคยตกลงบน element ที่ถูกซ่อนอยู่
        — confirm on a real Leanback session that the Shorts shelf (with `hideShorts` on) and the
        guide Shorts tab (with `hideGuideTabs` on) really do hide, and that focus never lands on a
        hidden element
  - [ ] H25 — ยืนยันว่าจอไม่ดับ/เครื่องไม่หลับขณะกำลังเล่นวิดีโอ (`keepDisplayAwake` เปิดอยู่) และจอ
        กลับไปดับ/เครื่องหลับตามปกติเมื่อหยุดหรือ pause การเล่น — confirm the display stays awake while
        a video plays (with `keepDisplayAwake` on), and that the display/system sleeps normally again
        once playback is paused or stopped
- [ ] **human gate H26 ปิดแล้ว** (`docs/plans/W9_SUPPORTABILITY_PLAN.md`) — ถ้าฟีเจอร์ wave 9 รวมอยู่ใน
      รุ่นนี้ — **human gate H26 is closed** (`docs/plans/W9_SUPPORTABILITY_PLAN.md`) — if wave 9's
      features are included in this release:
  - [ ] H26 — ยืนยันบน release build จริงว่าไฟล์ log (`<app_local_data_dir>/logs/lalin-cast.log`)
        เกิดขึ้นจริง, หมุนเวียนได้จริงเมื่อไฟล์เกิน 512 KiB (เหลือสูงสุดสองไฟล์เท่านั้น), และเปิดหลาย
        บรรทัดตัวอย่างมาตรวจว่าไม่มีรหัสจับคู่ทีวี, cookie, token, URL หรือ path ของระบบไฟล์ปรากฏอยู่เลย
        แม้แต่บรรทัดเดียว — confirm on a real release build that the log file
        (`<app_local_data_dir>/logs/lalin-cast.log`) really appears, really rotates once it exceeds
        512 KiB (keeping at most two files), and that a sample of its lines contains no TV pairing
        code, cookie, token, URL, or filesystem path anywhere — not even one line
- [x] **human gate H28 ปิดแล้ว** (`docs/plans/W10_RELEASE_REHEARSAL_PLAN.md`) — ถ้าฟีเจอร์ wave 10 รวม
      อยู่ในรุ่นนี้ — **human gate H28 is closed** (`docs/plans/W10_RELEASE_REHEARSAL_PLAN.md`) — if
      wave 10's features are included in this release:
  - [x] H28 — ดาวน์โหลด artifact `lalin-cast-dryrun-installer` จาก run ล่าสุดของ
        `.github/workflows/release-dryrun.yml` บน commit ที่จะ tag (ถ้า commit นั้นไม่มี run เพราะไม่ได้แตะไฟล์
        ที่เกี่ยวกับการ bundle ให้สั่งรันเองด้วย `workflow_dispatch`) แล้วติดตั้งบนเครื่องสะอาด ยืนยันว่า
        เปิดแอปได้จริง (ตัวติดตั้งนี้**ไม่ได้เซ็นชื่อ** — ใช้ยืนยันแค่ว่า bundle ใช้งานได้ ไม่ใช่การตรวจ
        ลายเซ็นตามข้อ 3 ด้านล่าง ซึ่งใช้ไฟล์จาก `release.yml` จริงเท่านั้น) — download the
        `lalin-cast-dryrun-installer` artifact from the latest
        `.github/workflows/release-dryrun.yml` run on the commit about to be tagged (start one with
        `workflow_dispatch` if that commit touched no bundle file and so has no run), install it on a
        clean machine, and confirm the app launches (this installer is **unsigned** — it only
        confirms the bundle works, not the signature verification in step 3 below, which uses only
        the real `release.yml` output)
        **ปิดแล้ว 2026-09-22:** ทดสอบด้วย artifact จาก run
        [35601453787](https://github.com/Freshair129/lalin-cast/actions/runs/35601453787) (build ของ
        commit เดียวกับที่อยู่บน `main`, เวอร์ชัน 0.2.0) ติดตั้งบนเครื่องสะอาดและเปิดแอปได้จริง — ผ่าน /
        **Closed 2026-09-22:** tested with the artifact from run
        [35601453787](https://github.com/Freshair129/lalin-cast/actions/runs/35601453787) (built from
        the same commit as on `main`, version 0.2.0); installed on a clean machine and the app
        launched — passed
      > หมายเหตุ: H27 เดิม (wave 9 — "notices check ทำ PR แดงจริงเมื่อ lock เปลี่ยนโดยไม่ sync") ถูก
      > แทนที่ด้วยการตรวจอัตโนมัติแล้วตั้งแต่ wave 10: fixture
      > `scripts/fixtures/notices-mismatch/` และ self-test step ในงาน `notices` ของ `ci.yml` พิสูจน์
      > สิ่งนี้ซ้ำทุกครั้งที่ CI รัน จึงไม่ต้องมีรายการตรวจด้วยมือแยกต่างหากในรายการนี้อีกต่อไป /
      > **Note:** the former H27 (wave 9 — "the notices check really turns a PR red when the lock
      > changes without sync") is superseded by an automated check as of wave 10: the
      > `scripts/fixtures/notices-mismatch/` fixture and the self-test step in `ci.yml`'s `notices`
      > job prove this on every CI run, so it no longer needs a separate manual item in this
      > checklist
- [x] **human gate H29 ปิดแล้ว** (`docs/plans/W11_PORTABLE_PLAN.md`) — ถ้าฟีเจอร์ wave 11 รวมอยู่ในรุ่นนี้
      — **human gate H29 is closed** (`docs/plans/W11_PORTABLE_PLAN.md`) — if wave 11's features are
      included in this release:
  - [x] H29 — ดาวน์โหลด artifact `lalin-cast-dryrun-portable` จาก run ล่าสุดของ
        `.github/workflows/release-dryrun.yml` บน commit ที่จะ tag (ถ้า commit นั้นไม่มี run เพราะไม่ได้แตะไฟล์
        ที่เกี่ยวกับการ bundle ให้สั่งรันเองด้วย `workflow_dispatch`) แตก zip ลง USB บนเครื่องสะอาด เปิดแอป ตั้งค่า
        บางอย่าง ปิดแล้วเปิดใหม่ ยืนยันว่าค่าที่ตั้งยังอยู่ ยืนยันว่า `%APPDATA%\ai.lalin.cast` และ
        `%LOCALAPPDATA%\ai.lalin.cast` ไม่ถูกสร้างหรือแก้ไข และไม่มี Run key หรือ
        `HKCU\Software\Classes\lalin-cast` ใหม่เกิดขึ้น — download the `lalin-cast-dryrun-portable`
        artifact from the latest `.github/workflows/release-dryrun.yml` run on the commit about to be
        tagged (start one with `workflow_dispatch` if that commit touched no bundle file and so has no
        run), extract the zip onto a USB drive on a clean machine, open the app, change a setting,
        close and reopen it, confirm the setting persisted, confirm
        `%APPDATA%\ai.lalin.cast` and `%LOCALAPPDATA%\ai.lalin.cast` were not created or modified, and
        confirm no new Run key or `HKCU\Software\Classes\lalin-cast` registry entry appears
        **ปิดแล้ว 2026-09-22:** ทดสอบด้วย artifact จาก run เดียวกับ H28 (เวอร์ชัน 0.2.0) แตก zip ลง USB
        บนเครื่องสะอาด ตั้งค่าคงอยู่หลังปิดเปิดใหม่ ไม่มีการสร้าง/แก้ `%APPDATA%\ai.lalin.cast` หรือ
        `%LOCALAPPDATA%\ai.lalin.cast` และไม่มี Run key หรือ `HKCU\Software\Classes\lalin-cast` ใหม่ —
        ผ่าน / **Closed 2026-09-22:** tested with the same run's artifact (version 0.2.0); extracted
        the zip to a USB drive on a clean machine, settings persisted across a restart, neither
        `%APPDATA%\ai.lalin.cast` nor `%LOCALAPPDATA%\ai.lalin.cast` was created or modified, and no
        new Run key or `HKCU\Software\Classes\lalin-cast` entry appeared — passed
- [ ] **bump เวอร์ชันใน `src-tauri/Cargo.toml`** (`[package].version`) ให้ตรงกับ `vX.Y.Z` ที่จะ tag
      (ไม่มี prefix `v` ในไฟล์นี้) — เวอร์ชันในแอป (`env!("CARGO_PKG_VERSION")`), User-Agent, DIAL
      identity และหน้าต่าง update จะดึงค่านี้อัตโนมัติ — **bump the version in
      `src-tauri/Cargo.toml`** (`[package].version`) to match the `vX.Y.Z` about to be tagged (no `v`
      prefix in this file) — the in-app version (`env!("CARGO_PKG_VERSION")`), the User-Agent, the
      DIAL identity, and the update window all read this value automatically
- [ ] **ย้าย `[Unreleased]` ใน `CHANGELOG.md` ไปเป็นหัวข้อเวอร์ชันใหม่** พร้อมวันที่
      (`## [X.Y.Z] - YYYY-MM-DD`) โดยเก็บหมวด Added/Changed/Security เดิมไว้ แล้วเปิด
      `## [Unreleased]` ว่างใหม่ด้านบนไว้รับงานรุ่นถัดไป — **move `[Unreleased]` in `CHANGELOG.md`
      into a new version heading** with a date (`## [X.Y.Z] - YYYY-MM-DD`), keeping the existing
      Added/Changed/Security groups, then open a fresh, empty `## [Unreleased]` above it for the
      next release
- [ ] **ส่วน CHANGELOG ของเวอร์ชันต้องมีก่อน tag**: หลังย้ายข้อข้างบนแล้ว ตรวจว่า `CHANGELOG.md` มีหัวข้อ
      `## [X.Y.Z]` ที่ตรงกับ tag เป๊ะ ๆ (ตัด prefix `v` ออกแล้ว) — `.github/workflows/release.yml`
      ดึงส่วนนี้มาเป็น release body ของ GitHub Release โดยอัตโนมัติ (ดูขั้นตอน "Extract CHANGELOG
      section for release body") ถ้าหาไม่เจอจะ fallback ไปเป็นประโยคทั่วไปแทน — **the CHANGELOG
      section for the version must exist before tagging**: after the item above, confirm
      `CHANGELOG.md` has a `## [X.Y.Z]` heading that exactly matches the tag (with the `v` prefix
      stripped) — `.github/workflows/release.yml` automatically extracts this section as the GitHub
      Release body (see its "Extract CHANGELOG section for release body" step); if it cannot find
      one, it falls back to a generic sentence instead
  > **wave 12:** ทั้งสองข้อข้างบนไม่ใช่แค่คำแนะนำอีกต่อไป — ตอนนี้มี **guard อัตโนมัติ**
  > (`scripts/release/Test-ReleaseVersion.ps1`) เป็นสเต็ปแรกของ `.github/workflows/release.yml` ที่
  > **ล้ม tag/release ทั้งชุดก่อนเริ่ม build ใด ๆ** ถ้า (ก) tag ที่ push ไม่ตรงกับเวอร์ชันแอปเป๊ะ ๆ
  > (`vX.Y.Z` เทียบกับ `tauri.conf.json`/`Cargo.toml`) **หรือ** (ข) `CHANGELOG.md` ไม่มีหัวข้อ
  > `## [X.Y.Z]` ของเวอร์ชันนั้น (หรือหัวข้อนั้นว่างเปล่า ไม่มีเนื้อหาใต้หัวข้อ) — ลืมข้อใดข้อหนึ่งจะไม่ได้
  > draft release ที่ตั้งชื่อผิด/มี release note fallback อีกต่อไป แต่ workflow จะแดงทันทีก่อน build เริ่ม
  > พร้อมข้อความบอกวิธีแก้ / **wave 12:** the two items above are no longer just guidance — there is now
  > an **automated guard** (`scripts/release/Test-ReleaseVersion.ps1`) as the first step of
  > `.github/workflows/release.yml` that **fails the whole tag/release before any build starts** if
  > either (a) the pushed tag does not exactly match the app version (`vX.Y.Z` against
  > `tauri.conf.json`/`Cargo.toml`), **or** (b) `CHANGELOG.md` has no `## [X.Y.Z]` heading for that
  > version (or that heading has no content under it). Forgetting either one no longer produces a
  > misnamed draft release with a fallback note — the workflow turns red immediately, before the
  > build starts, with a message describing the fix
- [ ] **`THIRD_PARTY_NOTICES.md` ตรงกับ `src-tauri/Cargo.lock` ปัจจุบัน** — รัน
      `cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1` แล้วตรวจว่ารายชื่อ
      crate/เวอร์ชัน/สัญญาอนุญาตในไฟล์ตรงกัน (ดูขั้นตอนที่ท้าย `THIRD_PARTY_NOTICES.md`) —
      **`THIRD_PARTY_NOTICES.md` matches the current `src-tauri/Cargo.lock`** — run
      `cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1` and confirm the crate
      names/versions/licenses listed match (see the procedure at the end of
      `THIRD_PARTY_NOTICES.md`)
- [ ] **`cargo-deny` เขียว**: `cargo deny --manifest-path src-tauri/Cargo.toml check licenses
      advisories bans sources` ผ่านทั้งหมด ไม่มี advisory ใหม่ที่ยังไม่แก้ — **`cargo-deny` is
      green**: `cargo deny --manifest-path src-tauri/Cargo.toml check licenses advisories bans
      sources` passes completely, with no unresolved new advisory
- [ ] CI เขียวครบทุก job บน commit ที่จะ tag (`fmt`, `clippy -D warnings`, `test`, `check`,
      `node --check`, arm64 cross-compile check, `cargo-deny`, `notices` พร้อม self-test) — และถ้าไฟล์
      ที่มีผลต่อการ bundle เปลี่ยน job `release-dryrun` (`.github/workflows/release-dryrun.yml`) ต้อง
      เขียวด้วย — CI is green across every job on the commit about to be tagged (`fmt`,
      `clippy -D warnings`, `test`, `check`, `node --check`, the arm64 cross-compile check,
      `cargo-deny`, `notices` with its self-test) — and if a file that affects the bundle changed, the
      `release-dryrun` job (`.github/workflows/release-dryrun.yml`) must also be green
- [ ] commit ที่จะ tag อยู่บน `main` แล้ว (ไม่ tag จาก feature branch) — the commit being tagged is
      already on `main` (never tag from a feature branch)

## 2. Tag

- [ ] สร้าง annotated tag รูปแบบ `vX.Y.Z` (ต้องตรงกับ `src-tauri/Cargo.toml` เป๊ะ ๆ) แล้ว push ไปที่
      `origin` — การ push tag `v*` จะ trigger `.github/workflows/release.yml` โดยอัตโนมัติ — create
      an annotated tag shaped `vX.Y.Z` (must exactly match `src-tauri/Cargo.toml`) and push it to
      `origin` — pushing a `v*` tag automatically triggers `.github/workflows/release.yml`:
      ```
      git tag -a vX.Y.Z -m "Lalin Cast vX.Y.Z"
      git push origin vX.Y.Z
      ```
- [ ] ติดตาม run ของ `release.yml` จนจบทั้งสอง leg (`x64` ต้องผ่าน, `arm64` เป็น
      `continue-on-error: true` — ล้มเหลวได้แต่ห้ามบล็อก `x64`) — watch the `release.yml` run to
      completion for both legs (`x64` must pass; `arm64` is `continue-on-error: true` — it may fail
      but must not block `x64`)
- [ ] release ที่ workflow สร้างจะเป็น **draft** เสมอ (`releaseDraft: true`) — **เปลี่ยนจาก draft เป็น
      published ด้วยตนเอง** บน GitHub หลัง build เสร็จและตรวจไฟล์ตามข้อ 3 แล้วเท่านั้น — the workflow
      always creates the release as a **draft** (`releaseDraft: true`) — **manually publish it** on
      GitHub only after the build finishes and the artifacts in step 3 below have been checked

## 3. ตรวจหลัง tag (post-tag verification) / Post-tag verification

ทำก่อนเปลี่ยน draft release เป็น published / Do this before switching the draft release to
published:

- [ ] ดาวน์โหลด `.exe` ของ leg x64 จาก draft release แล้วติดตั้งบนเครื่องทดสอบสะอาด ตรวจว่าเปิดแอปได้
      และเวอร์ชันในหน้าต่างตั้งค่า/About ตรงกับ tag — download the x64 leg's `.exe` from the draft
      release and install it on a clean test machine; confirm the app opens and the version shown in
      the settings/About matches the tag
- [ ] ตรวจว่า `latest.json` ถูกอัปโหลดเป็น release asset และ `version` ในไฟล์ตรงกับ tag (ไม่มี prefix
      `v`) — confirm `latest.json` was uploaded as a release asset and its `version` field matches
      the tag (no `v` prefix)
- [ ] ตรวจลายเซ็นของ `latest.json`/installer ด้วย public key ใน `src-tauri/tauri.conf.json`
      (`plugins.updater.pubkey`) — ถ้าไม่ตรง **ห้าม publish release นี้** ให้ตรวจ GitHub secret
      `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY`/`LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ตาม
      [`docs/runbooks/SIGNING_KEY_CUSTODY.md`](SIGNING_KEY_CUSTODY.md) ก่อน — verify the
      `latest.json`/installer signature against the public key in `src-tauri/tauri.conf.json`
      (`plugins.updater.pubkey`) — if it does not match, **do not publish this release**; check the
      `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY`/`LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub
      secrets per [`docs/runbooks/SIGNING_KEY_CUSTODY.md`](SIGNING_KEY_CUSTODY.md) first
- [ ] เปิดแอปรุ่นก่อนหน้า (ถ้ามี) แล้วกด "ตรวจสอบอัปเดต" ยืนยันว่าเห็นรุ่นใหม่นี้และติดตั้งผ่าน updater
      จริงได้ (ไม่ใช่แค่ดาวน์โหลดตรง) — open a previous release of the app (if one exists) and press
      "check for updates", confirming it sees this new release and can install it through the real
      updater (not just a direct download)
- [ ] **(wave 12) ตรวจว่า asset ครบทั้งสองสถาปัตยกรรม** บน draft release — ต่อ leg (x64 และ arm64)
      ต้องมี: ตัวติดตั้ง NSIS (`*-setup.exe`), ไฟล์ลายเซ็น (`.sig`), zip พกพา
      (`Lalin-Cast_<version>_<arch>_portable.zip`) และไฟล์ checksum
      (`Lalin-Cast_<version>_<arch>_SHA256SUMS.txt`); `latest.json` มีครั้งเดียวรวมทั้งสอง arch —
      **confirm every asset exists for both architectures** on the draft release — each leg (x64 and
      arm64) must have: the NSIS installer (`*-setup.exe`), its signature file (`.sig`), the portable
      zip (`Lalin-Cast_<version>_<arch>_portable.zip`), and its checksum file
      (`Lalin-Cast_<version>_<arch>_SHA256SUMS.txt`); `latest.json` appears once, covering both
      architectures
- [ ] **(wave 12) ตรวจ checksum ด้วย `Get-FileHash`** — ดาวน์โหลดไฟล์ installer และ zip พกพาของแต่ละ
      arch มาไว้โฟลเดอร์เดียวกับไฟล์ `SHA256SUMS.txt` ของ arch นั้น แล้วรัน (PowerShell) โดยใช้ **ชื่อไฟล์
      ตามที่ดาวน์โหลดมาจริง** (GitHub เปลี่ยนช่องว่างใน `productName` เป็นจุดตอนอัปโหลด asset จึงได้ชื่อ
      `Lalin.Cast_<version>_<arch>-setup.exe` ไม่ใช่ `Lalin-Cast_...`):
      ```powershell
      Get-FileHash .\Lalin.Cast_<version>_<arch>-setup.exe -Algorithm SHA256
      Get-FileHash .\Lalin-Cast_<version>_<arch>_portable.zip -Algorithm SHA256
      ```
      เทียบค่า hash ที่ได้ (ตัวพิมพ์เล็ก-ใหญ่ไม่สำคัญ) กับบรรทัดของไฟล์นั้นใน `SHA256SUMS.txt` — ถ้าไม่ตรง
      แม้แต่ไฟล์เดียว **ห้าม publish release นี้** — **verify checksums with `Get-FileHash`** —
      download the installer and portable zip for each architecture into the same folder as that
      architecture's `SHA256SUMS.txt`, then run the PowerShell command above using **the file name
      exactly as downloaded** (GitHub turns the space in `productName` into a dot when it uploads the
      asset, so the real name is `Lalin.Cast_<version>_<arch>-setup.exe`, not `Lalin-Cast_...`), and
      compare the resulting hash (case-insensitive) against that file's line in `SHA256SUMS.txt` — if
      even one file does not match, **do not publish this release**
- [ ] **human gate H30 ปิดแล้ว** (`docs/plans/W12_RELEASE_ASSETS_PLAN.md`) — บังคับสำหรับ **draft
      release จริงครั้งแรก** ที่เกิดจาก `.github/workflows/release.yml` (ไม่ใช่ dry run) — **human gate
      H30 is closed** (`docs/plans/W12_RELEASE_ASSETS_PLAN.md`) — required for the **very first real**
      draft release produced by `.github/workflows/release.yml` (not the dry run):
  - [ ] H30 — ดาวน์โหลด asset **ทุกตัว** จาก draft release จริงครั้งแรก (installer, `.sig`, `latest.json`,
        zip พกพา, `SHA256SUMS.txt` ทั้งสองสถาปัตยกรรม) ตรวจ checksum ด้วย `Get-FileHash` ตามข้อด้านบน
        และแตก zip พกพาไปรันบนเครื่องสะอาดจริง ก่อนกด publish — ทำครั้งเดียวพอสำหรับ tag แรกที่พิสูจน์ว่า
        pipeline ของ `release.yml` เองทำงานถูก (ไม่ใช่แค่ dry run) — download **every** asset from the
        very first real draft release (installer, `.sig`, `latest.json`, the portable zip, both
        architectures' `SHA256SUMS.txt`), verify checksums with `Get-FileHash` per the item above, and
        extract and actually run the portable zip on a clean machine, before pressing publish — this
        is a one-time gate for the first tag that proves `release.yml`'s own pipeline works (not just
        the dry run)
- [ ] เปลี่ยน draft release เป็น **published** บน GitHub — switch the draft release to **published**
      on GitHub

## 4. winget manifest

ทำเฉพาะรุ่นที่ตั้งใจส่งขึ้น winget (ไม่บังคับทุกรุ่น) — ตามขั้นตอนเต็มใน
[`packaging/winget/README.md`](../../packaging/winget/README.md) — do this only for a release meant
to go to winget (not required for every release) — follow the full procedure in
[`packaging/winget/README.md`](../../packaging/winget/README.md):

- [ ] release เปลี่ยนจาก draft เป็น published แล้ว (ข้อ 3) และมีเฉพาะไฟล์ `.exe` ของ leg **x64**
      เท่านั้นที่ใช้ — the release is published (step 3) and only the **x64** leg's `.exe` is used
- [ ] เติมค่า `{{VERSION}}`, `{{INSTALLER_URL}}`, `{{INSTALLER_SHA256}}` ในสำเนาของทั้งสามไฟล์ manifest
      แล้วลบ comment/banner ของ template ออก — fill in `{{VERSION}}`, `{{INSTALLER_URL}}`,
      `{{INSTALLER_SHA256}}` in a copy of all three manifest files, and remove the template
      comments/banner
- [ ] ตรวจ YAML ทั้งสามไฟล์ด้วย Python `yaml` แล้วรัน `winget validate` ตามขั้นตอนใน README ของ
      `packaging/winget/` — validate all three YAML files with Python's `yaml` module, then run
      `winget validate` per the `packaging/winget/` README
- [ ] **ยังไม่ส่ง PR ไป `microsoft/winget-pkgs`** จนกว่าชื่อ `PackageIdentifier: Lalin.LalinCast` และ
      สัญญาอนุญาตของ Lalin Cast จะตัดสินใจแล้ว (ดู `packaging/winget/README.md`) — **do not send the
      PR to `microsoft/winget-pkgs`** until the `PackageIdentifier: Lalin.LalinCast` name and Lalin
      Cast's own license are decided (see `packaging/winget/README.md`)

## 5. หลังเผยแพร่ (post-release) / Post-release

- [ ] ประกาศ release (ผ่านช่องทางที่ผู้ก่อตั้งเลือก) พร้อมลิงก์ไปยังรายการของเวอร์ชันนี้ใน
      `CHANGELOG.md` — announce the release (through whatever channel the founder chooses) with a
      link to this version's entry in `CHANGELOG.md`
- [ ] ปิด/ปรับปรุง milestone หรือ project board ที่ติดตามรุ่นนี้ (ถ้ามี) — close or update any
      milestone/project board tracking this release, if one exists
- [ ] ตรวจว่า `docs/DOCS_INDEX.md` และลิงก์ที่อ้างถึงเวอร์ชัน/รุ่นล่าสุดยังตรง (ไม่มีลิงก์เสีย) —
      confirm `docs/DOCS_INDEX.md` and any links referencing the latest version still resolve (no
      broken links)
- [ ] เริ่มติดตามรายงานที่เข้ามาทาง GitHub Issues (จาก `.github/ISSUE_TEMPLATE/`) และ GitHub private
      vulnerability reporting (`SECURITY.md`) สำหรับรุ่นนี้ — start watching for reports coming in
      through GitHub Issues (via `.github/ISSUE_TEMPLATE/`) and GitHub private vulnerability
      reporting (`SECURITY.md`) for this release
- [ ] ถ้าพบปัญหาสำคัญหลังเผยแพร่ ให้เตรียม patch release ใหม่โดยเริ่ม checklist นี้ใหม่ตั้งแต่ข้อ 1 —
      if a significant issue is found after release, prepare a new patch release by restarting this
      checklist from item 1

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | candidate | Created the release checklist runbook (pre-tag human gates, tagging, post-tag verification, winget manifest step, post-release follow-up) for wave 5 (U4) | uncommitted | LALIN |
| 0.1.1b | 2026-09-21 | candidate | Added the "CHANGELOG section for the version must exist before tagging" pre-tag item for wave 6 (U4), matching `release.yml`'s new CHANGELOG-derived release body | uncommitted | LALIN |
| 0.1.2b | 2026-09-21 | candidate | Added the pre-tag human gates H22 (DIAL discovery after the stricter SSDP `MAN` check) and H23 (`lalin-cast://` opens the app and the opt-in toggle removes the association) for wave 7 (U3) | uncommitted | LALIN |
| 0.1.3b | 2026-09-21 | candidate | Added the pre-tag human gates H24 (Shorts shelf/guide tab hide on a real Leanback session without stealing focus) and H25 (display stays awake during playback, sleeps normally when paused/stopped) for wave 8 (U4) | uncommitted | LALIN |
| 0.1.4b | 2026-09-21 | candidate | Added the pre-tag human gate H26 (log file appears in a release build, rotates past 512 KiB keeping at most two files, and contains no TV pairing code/cookie/token/URL/path) for wave 9 (U3) | uncommitted | LALIN |
| 0.1.5b | 2026-09-21 | candidate | Added the pre-tag human gate H28 (install the `lalin-cast-dryrun-installer` CI artifact on a clean machine and confirm it launches) for wave 10 (U2); noted that the former H27 is now enforced automatically by the `notices` job's fixture self-test instead of being a manual checklist item; added `notices` and `release-dryrun` to the CI-green pre-tag item | uncommitted | LALIN |
| 0.1.6b | 2026-09-21 | candidate | Added the pre-tag human gate H29 (extract the `lalin-cast-dryrun-portable` CI artifact to a USB drive on a clean machine, confirm settings persist across a restart, and confirm neither `%APPDATA%\ai.lalin.cast`/`%LOCALAPPDATA%\ai.lalin.cast` nor a Run key/`lalin-cast://` registry entry appears) for wave 11 (U3) | uncommitted | LALIN |
| 0.1.7b | 2026-09-21 | candidate | Wave 12 (U3): noted that the version/CHANGELOG pre-tag items are now enforced by an automated guard (`Test-ReleaseVersion.ps1`) that fails `release.yml` before build if the tag doesn't match the app version or the CHANGELOG section is missing/empty; added post-tag items to check every asset exists for both architectures (installer, `.sig`, portable zip, `SHA256SUMS.txt`) and to verify checksums with `Get-FileHash`; added human gate H30 (first real draft release — download and verify every asset, run the portable zip, before publishing) | uncommitted | LALIN |
| 0.1.8b | 2026-09-21 | candidate | Wave 12 (U3) repair: moved human gate H30 from section 1 (pre-tag) to section 3 (post-tag verification, right before "switch to published") since it can only close after a real tag exists; fixed the `Get-FileHash` installer example to use the real downloaded asset name `Lalin.Cast_<version>_<arch>-setup.exe` (GitHub turns the space in `productName` into a dot on upload), not the invented `Lalin-Cast_..._-setup.exe` | uncommitted | LALIN |
| 0.1.9b | 2026-09-21 | candidate | Marked human gate H1 closed: Apache-2.0 chosen (PR #17) and the founder approved PRIVACY.md/TERMS.md; noted that a later change to either document's substance needs re-approval before tagging | uncommitted | LALIN |
| 0.1.10b | 2026-09-21 | candidate | Marked human gate H4 closed: the founder decided to ship intentionally without Authenticode signing from v0.2.0 until a certificate is purchased, with the accepted SmartScreen consequence and the checksum/updater-signature mitigations recorded | uncommitted | LALIN |
| 0.1.11b | 2026-09-22 | candidate | Marked human gates H28 and H29 closed: the founder installed the `lalin-cast-dryrun-installer` and extracted the `lalin-cast-dryrun-portable` zip from run 35601453787 (version 0.2.0) on a clean machine and confirmed both pass their acceptance checks | uncommitted | LALIN |
