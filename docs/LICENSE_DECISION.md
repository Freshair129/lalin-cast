---
version: "0.1.0b"
created_at: "2026-09-20T22:00:00+07:00,LALIN,uncommitted"
last_update: "2026-09-20T22:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "legal"
  doc_type: "decision-record"
  scope: "License choice for Lalin Cast's own original source code (not third-party dependencies)"
---

# License decision — Lalin Cast

## สถานะ

**ยังไม่ตัดสินใจ — รอผู้ก่อตั้งโปรเจกต์เลือก (human gate H1 ใน
`docs/plans/H0_RELEASE_READINESS_PLAN.md`)** เอกสารนี้เตรียมข้อมูลเปรียบเทียบให้เลือกเท่านั้น ไม่ใช่
การตัดสินใจ ปัจจุบัน repository ไม่มีไฟล์ `LICENSE` ที่ root และ `src-tauri/Cargo.toml` ไม่มีฟิลด์
`license`/`license-file` — โค้ดต้นฉบับของ Lalin Cast เองจึงยังไม่มีสัญญาอนุญาตที่ประกาศไว้อย่างเป็น
ทางการ (สงวนสิทธิ์ทั้งหมดโดยปริยายตามกฎหมายลิขสิทธิ์จนกว่าจะเลือก)

สิ่งนี้แยกจากสัญญาอนุญาตของไลบรารี third-party ที่ใช้ (ดู
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)) และแยกจากสัญญาอนุญาต MIT ของสำเนา
VacuumTube ที่เก็บไว้เป็นข้อมูลอ้างอิงใน `reference/vacuumtube/` — ทั้งสองอย่างนั้นคงอยู่ตามเดิมไม่ว่า
Lalin Cast จะเลือกสัญญาอนุญาตของตัวเองแบบใด

## ตัวเลือกที่เปรียบเทียบ

| หัวข้อ | MIT | Apache-2.0 | Proprietary (ปิดแหล่งที่มา) |
|---|---|---|---|
| อนุญาตให้ใช้/แก้ไข/แจกจ่ายต่อ | ได้ ฟรี รวมถึงใช้ในเชิงพาณิชย์ | ได้ ฟรี รวมถึงใช้ในเชิงพาณิชย์ | ตามเงื่อนไขที่ผู้ถือสิทธิ์กำหนดเองเท่านั้น |
| Patent grant ชัดเจน | ไม่มีข้อความสิทธิบัตรชัดเจน | มี (มาตรา 3) และมีเงื่อนไข patent-retaliation | ตามที่กำหนดเอง (ปกติไม่ให้สิทธิ์สิทธิบัตรแก่ผู้ใช้) |
| ความยาว/ความซับซ้อนของข้อความ | สั้นมาก อ่านง่าย | ยาวกว่า มีหลายมาตรา | กำหนดเองทั้งหมด ต้องร่าง/ตรวจสอบเอง (ควรให้ทนายความช่วย) |
| ผลต่อ contributor ภายนอก | รับ PR ได้ทันที ไม่ต้องเซ็น CLA เพิ่ม (แนะนำให้ยังระบุ DCO/CLA แยกถ้าต้องการความชัดเจนเรื่องสิทธิ์) | เหมือน MIT แต่ contributor ควรรู้ว่ากำลังให้สิทธิบัตรของตัวเองไปด้วย | ต้องมีข้อตกลง contributor ที่ชัดเจน (CLA) ก่อนรับโค้ดจากภายนอก ไม่งั้นเสี่ยงข้อพิพาทความเป็นเจ้าของ |
| การใช้ร่วมกับ VacuumTube (MIT) ที่เก็บไว้ใน `reference/vacuumtube/` | เข้ากันได้ตรงไปตรงมา สัญญาอนุญาตแบบเดียวกัน | เข้ากันได้ (MIT code รวมเข้ากับ Apache-2.0 project ได้ ตราบใดที่ยังคงประกาศ MIT ของส่วนที่มาจาก MIT ไว้ตามที่ MIT กำหนด) | เข้ากันได้ในแง่กฎหมาย (MIT อนุญาตให้ sublicense เป็น proprietary ได้) แต่ต้องคง `reference/vacuumtube/LICENSE` และประกาศลิขสิทธิ์ไว้ตามเดิมสำหรับสำเนา VacuumTube เอง ส่วนโค้ด Lalin ของตัวเองปิดได้ |
| โมเดลธุรกิจในอนาคต (เช่น non-commercial, ขายลิขสิทธิ์แยก) | ทำได้ยาก ต้อง relicense ใหม่ทั้งหมดหรือ dual-license ตั้งแต่ต้น | เหมือน MIT | ยืดหยุ่นที่สุด — ตั้งเงื่อนไขเองได้ทุกอย่างตั้งแต่แรก |
| การรับรู้ในวงการโอเพนซอร์ส/badge บน GitHub | สูงมาก คุ้นเคยที่สุด | สูง มักเลือกเพราะมี patent grant | ไม่นับเป็นโอเพนซอร์ส ("source available" อย่างมากที่สุด ถ้าเผยแพร่ซอร์สแต่จำกัดสิทธิ์) |
| ความเสี่ยงด้านสิทธิบัตรจากภายนอก (เช่น Netflix/DIAL, Google/YouTube) | ไม่มีเงื่อนไข patent-retaliation ป้องกันให้ | มีเงื่อนไข patent-retaliation ที่ช่วยป้องกัน contributor/ผู้ใช้จากการถูกฟ้องสิทธิบัตรโดยผู้ร่วมโครงการ | ขึ้นกับสัญญาที่ร่างเอง ปกติไม่มี |

## ข้อพิจารณาเฉพาะของ Lalin Cast

1. **VacuumTube reference:** ไม่ว่าจะเลือกสัญญาอนุญาตใด ต้องคง `reference/vacuumtube/LICENSE` และ
   ข้อความสัญญาอนุญาต MIT/ประกาศลิขสิทธิ์ของ VacuumTube ไว้ตราบใดที่สำเนานั้นยังอยู่ใน repository
   (ดู [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) หมวด 2) — เรื่องนี้ไม่เปลี่ยนตามตัวเลือก
   ที่นี่
2. **DIAL/trademark:** สัญญาอนุญาตของ Lalin Cast เองไม่กระทบสิทธิ์การใช้เครื่องหมาย "DIAL" ของ
   Netflix — ไม่ว่าเลือกสัญญาอนุญาตใด การใช้เครื่องหมายนั้นยังคงอยู่ภายใต้เงื่อนไขของ Netflix แยกต่าง
   หาก (ดู [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) หมวด 4)
3. **ชื่อโปรเจกต์:** สัญญาอนุญาตโค้ด (MIT/Apache-2.0/proprietary) ไม่ครอบคลุมเครื่องหมายการค้า/ชื่อ
   "Lalin" และ "Lalin Cast" โดยอัตโนมัติ ถ้าต้องการคุ้มครองชื่อแยกจากโค้ด ต้องพิจารณาเรื่องเครื่องหมาย
   การค้าต่างหาก (นอกขอบเขตเอกสารนี้)
4. **Cargo/crates.io:** ถ้าต้องการเผยแพร่ crate ใด ๆ ของ Lalin Cast ขึ้น crates.io ในอนาคต crates.io
   แนะนำอย่างยิ่งให้ระบุฟิลด์ `license`/`license-file` ที่เป็นสัญญาอนุญาตโอเพนซอร์สที่ SPDX รู้จัก
   (proprietary ไม่มี SPDX identifier มาตรฐานและอาจสร้างปัญหาให้เครื่องมือ dependency-scanning เช่น
   `cargo-deny` ที่ S3 ตั้งค่าไว้ ซึ่ง allow-list ปัจจุบันมีเฉพาะสัญญาอนุญาตโอเพนซอร์สมาตรฐาน)

## คำแนะนำ (ไม่ใช่การตัดสินใจ)

ถ้าเป้าหมายคือให้ชุมชนมีส่วนร่วม, ให้คนอื่นนำ Lalin Cast ไปต่อยอด, และให้เข้ากับสัญญาอนุญาต MIT ของ
VacuumTube reference ได้ตรงไปตรงมาที่สุด **MIT** เป็นตัวเลือกที่ตรงไปตรงมาที่สุด และเป็นสิ่งที่
`cargo-deny` allow-list ของ S3 รองรับอยู่แล้ว ถ้ากังวลเรื่องความเสี่ยงสิทธิบัตร (เช่นจาก
บริษัทใหญ่ที่เกี่ยวข้องกับ YouTube/DIAL) และต้องการ patent-retaliation clause **Apache-2.0** ให้
ความคุ้มครองเพิ่มเติมโดยแทบไม่มีข้อเสียเทียบกับ MIT (ทั้งสองแบบเข้ากับ VacuumTube's MIT ได้) เลือก
**Proprietary** ก็ต่อเมื่อมีแผนธุรกิจที่ต้องปิดซอร์สโค้ดหรือขายสิทธิ์แยกอย่างชัดเจน — แนวทางนี้ต้องใช้
ทนายความร่างสัญญาอนุญาตเอง และควรทำ CLA ให้ contributor เซ็นก่อนรับ PR ใด ๆ

ท้ายที่สุดการเลือกเป็นของผู้ก่อตั้งโปรเจกต์เท่านั้น เอกสารนี้ไม่ใช่คำแนะนำทางกฎหมาย

## Checklist เมื่อเลือกแล้ว (สำหรับผู้ก่อตั้ง/ผู้ดำเนินการ merge)

- [ ] เพิ่มไฟล์ `LICENSE` ที่ root ของ repository ด้วยข้อความสัญญาอนุญาตเต็มที่เลือก
- [ ] เพิ่มฟิลด์ `license = "..."` (หรือ `license-file = "LICENSE"` สำหรับ proprietary) ใน
      `src-tauri/Cargo.toml` — ไฟล์นี้อยู่ใน ownership ของ S4/rust-core ไม่ใช่ S1 ส่งต่อเป็น
      openQuestions ถ้าต้องแก้ตอนนี้
- [ ] อัปเดต `deny.toml` (`licenses.allow`) ถ้าเลือก proprietary หรือสัญญาอนุญาตที่ยังไม่อยู่ใน
      allow-list — ไฟล์นี้อยู่ใน ownership ของ S3/ci-supply-chain
- [ ] อัปเดตบรรทัด "License" ใน `LALIN_PROVENANCE.md` ให้ระบุสัญญาอนุญาตของ Lalin Cast เอง แยกจาก
      บรรทัด VacuumTube ที่มีอยู่แล้ว — ไฟล์นี้อยู่ใน ownership ของ S2/docs-hygiene
- [ ] ถ้าเลือก proprietary: ร่าง Contributor License Agreement (CLA) หรือปิดการรับ external PR จน
      กว่าจะมี CLA
- [ ] พิจารณาว่าต้องการ badge สัญญาอนุญาตใน `README.md` หรือไม่ (เพิ่มได้ในการแก้ไข README ครั้ง
      ถัดไปที่อยู่ใน ownership ของ S1)
- [ ] แจ้งผลการตัดสินใจกลับเข้าเอกสารนี้ (แก้ "สถานะ" ด้านบนและ CHANGELOG ด้านล่าง) ก่อน merge

---

## License decision — Lalin Cast (English)

_This is an English summary of the Thai analysis above, which is the primary version of this
document._

### Status

**Undecided — pending the project founder's choice (human gate H1 in
`docs/plans/H0_RELEASE_READINESS_PLAN.md`).** This document only prepares a comparison; it does
not make the decision. The repository currently has no root `LICENSE` file, and
`src-tauri/Cargo.toml` has no `license`/`license-file` field — Lalin Cast's own original source
code therefore has no formally declared license yet (all rights reserved by default under
copyright law until one is chosen).

This is separate from the licenses of the third-party libraries in use (see
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)) and separate from the MIT license of the
VacuumTube reference copy kept under `reference/vacuumtube/` — both of those stay as they are
regardless of which license Lalin Cast picks for its own code.

### Options compared

| Topic | MIT | Apache-2.0 | Proprietary (closed-source) |
|---|---|---|---|
| Use/modify/redistribute | Free, including commercial use | Free, including commercial use | Only under whatever terms the rights holder sets |
| Explicit patent grant | None | Yes (section 3), with patent-retaliation terms | Whatever is drafted (typically none granted to users) |
| Text length/complexity | Very short, easy to read | Longer, several sections | Fully custom — needs drafting/review (get a lawyer) |
| Effect on outside contributors | PRs can be accepted immediately, no extra CLA required (a DCO/CLA is still worth adding for clarity) | Same as MIT, but contributors should know they are also granting their own patent rights | Needs a clear Contributor License Agreement (CLA) before accepting outside code, or risks ownership disputes |
| Compatibility with the VacuumTube (MIT) reference copy under `reference/vacuumtube/` | Directly compatible, same license family | Compatible (MIT code can be combined into an Apache-2.0 project as long as the MIT notice for the MIT-derived parts is kept as MIT requires) | Legally compatible (MIT permits sublicensing as proprietary), but `reference/vacuumtube/LICENSE` and its copyright notice must still be kept for that copy; Lalin's own code can be closed |
| Future business models (e.g. non-commercial, separately sold licenses) | Hard — needs a full relicense or dual-licensing from the start | Same as MIT | Most flexible — any terms can be set from the outset |
| Open-source community recognition / GitHub badges | Very high, most familiar | High, often chosen for the patent grant | Does not count as open source ("source available" at most, if source is published with restricted rights) |
| Protection against outside patent risk (e.g. from Netflix/DIAL, Google/YouTube) | No patent-retaliation clause | Has a patent-retaliation clause that helps protect contributors/users from being sued by a fellow project participant over patents | Depends entirely on the custom contract; typically none |

### Lalin Cast-specific considerations

1. **VacuumTube reference**: whichever license is chosen, `reference/vacuumtube/LICENSE` and
   VacuumTube's MIT notice must stay intact as long as that copy remains in the repository (see
   [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) section 2) — this does not change based on
   the choice here.
2. **DIAL/trademark**: Lalin Cast's own license does not affect rights to use Netflix's "DIAL"
   mark — whichever license is chosen, use of that mark remains governed separately by Netflix's
   own terms (see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) section 4).
3. **Project name**: a code license (MIT/Apache-2.0/proprietary) does not automatically cover the
   "Lalin"/"Lalin Cast" trademark or name. Protecting the name separately from the code is a
   trademark question outside this document's scope.
4. **Cargo/crates.io**: if any Lalin Cast crate is ever published to crates.io, crates.io strongly
   recommends a `license`/`license-file` field naming a recognized SPDX open-source license
   (proprietary has no standard SPDX identifier and can trip up dependency-scanning tooling such as
   the `cargo-deny` config S3 is setting up, whose current allow-list only lists standard
   open-source licenses).

### Recommendation (not a decision)

If the goal is community contribution, letting others build on Lalin Cast, and staying most
directly compatible with the VacuumTube reference's MIT license, **MIT** is the most
straightforward choice, and it is already covered by S3's `cargo-deny` allow-list. If patent risk
is a concern (for example, from large companies connected to YouTube/DIAL) and a
patent-retaliation clause is wanted, **Apache-2.0** adds that protection with almost no downside
compared to MIT (both are compatible with VacuumTube's MIT license). Choose **proprietary** only
if there is a clear business plan requiring closed source or separately sold licenses — that path
needs a lawyer-drafted license and a signed CLA from contributors before accepting any PRs.

The final choice belongs to the project founder alone. This document is not legal advice.

### Checklist once a choice is made (for the founder / merge operator)

- [ ] Add a `LICENSE` file at the repository root with the full text of the chosen license
- [ ] Add a `license = "..."` field (or `license-file = "LICENSE"` for proprietary) to
      `src-tauri/Cargo.toml` — that file is owned by S4/rust-core, not S1; route this as an
      openQuestion if it needs to change now
- [ ] Update `deny.toml` (`licenses.allow`) if proprietary or another license not already on the
      allow-list is chosen — that file is owned by S3/ci-supply-chain
- [ ] Update the "License" row in `LALIN_PROVENANCE.md` to name Lalin Cast's own license,
      separate from the existing VacuumTube row — that file is owned by S2/docs-hygiene
- [ ] If proprietary: draft a Contributor License Agreement (CLA), or close external PRs until one
      exists
- [ ] Decide whether to add a license badge to `README.md` (can be added in a future README
      edit, owned by S1)
- [ ] Record the decision back into this document (update "Status" above and the CHANGELOG below)
      before merging

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | candidate | Initial MIT / Apache-2.0 / proprietary comparison and founder checklist for the H0 legal-texts stream (S1) | uncommitted | LALIN |
