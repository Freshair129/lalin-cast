# Lalin Cast

Lalin Cast is a standalone Rust + Tauri v2 Windows app that loads the real
YouTube Leanback surface at `https://www.youtube.com/tv` in a remote WebView.
The pinned VacuumTube fork is retained under `reference/vacuumtube` as the
behavior reference and fallback.

## Disclaimer

**ภาษาไทย:** Lalin Cast เป็นโปรเจกต์อิสระของบุคคลที่สาม ไม่ได้เกี่ยวข้อง ไม่ได้รับการรับรอง และ
ไม่ได้เป็นส่วนหนึ่งของ YouTube หรือ Google ผู้ใช้ยังต้องผูกพันตามข้อกำหนดการให้บริการของ YouTube เอง
อ่านรายละเอียดที่ [`PRIVACY.md`](PRIVACY.md), [`TERMS.md`](TERMS.md) และ
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — สัญญาอนุญาตของซอร์สโค้ด Lalin Cast เอง (แยกจาก
ไลบรารี third-party) ยังไม่ได้เลือก รอผู้ก่อตั้งอนุมัติ ดูตัวเลือกที่
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md)

**English:** Lalin Cast is an independent, third-party project with no affiliation to, endorsement
from, or sponsorship by YouTube or Google. Using it remains subject to YouTube's own Terms of
Service. See [`PRIVACY.md`](PRIVACY.md), [`TERMS.md`](TERMS.md), and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for details. Lalin Cast's own source-code
license (separate from its third-party dependencies) has not been chosen yet and is pending
founder approval; see the options in
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md).

Current scope:

- native Tauri window and lifecycle;
- Lalin Cast's own Leanback-compatible User-Agent (`LalinCast/<version>` identity token built from
  the app's own version, no longer VacuumTube-derived);
- single-instance focus;
- fullscreen, keep-on-top, reload, quit, and Thai/English language toggle native menu actions;
- signed GitHub Releases updater with a native in-app update window (checked on startup and
  on demand from the menu) that always requires user confirmation before installing and
  restarting;
- best-effort shell-setting persistence through the Tauri Store plugin;
- supervised Rust DIAL SSDP discovery on the LAN plus a bounded HTTP device
  descriptor bound to the local LAN IP address (not every network interface), which rebinds
  after listener/IP failure;
- a user-settable DIAL friendly name (`dialFriendlyName`, defaults to `Lalin Cast`);
- narrow `window.h5vcc` DIAL route bridge for the embedded YouTube WebView;
- continuous Leanback device-id sync with best-effort persistence.

If the local settings store is unavailable, the shell uses safe defaults and
still opens; the failure is not allowed to block the media window.

Inherited local evidence: the debug runtime binds the DIAL SSDP port, returns
the device descriptor with an `Application-URL` header and passes the Rust
unit tests (DIAL, HTTP parser, identity and i18n). Same-Wi-Fi iPhone TV-code connection is user-confirmed for the previous
debug runtime. Standalone packaging, signed updater artifacts, network-drop
recovery, controller parity and account acceptance remain separate gates until
rerun in this repository. Ad filtering and SponsorBlock are not implemented; they
wait on the decisions recorded in `docs/plans/H0_RELEASE_READINESS_PLAN.md`.

Static check:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

For a local Windows bundle, use the Tauri CLI from the repository root:

```powershell
cargo tauri build --debug --no-bundle --ci
```

The GUI/WebView2 smoke test and clean install/update smoke are separate Windows
runtime gates. Do not remove the VacuumTube reference until Tauri parity passes.

## Updating

The app checks the signed manifest at:

`https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`

The public updater key is committed in `src-tauri/tauri.conf.json`. The private
key must remain outside the repository and is supplied to GitHub Actions through
`LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY` and its optional password secret. The app
never installs an update without user confirmation.

## Provenance

See [`LALIN_PROVENANCE.md`](LALIN_PROVENANCE.md),
[`docs/architecture/ADR-001-CAST-TAURI-PORT.md`](docs/architecture/ADR-001-CAST-TAURI-PORT.md)
and [`docs/architecture/LALIN_CAST_UPDATER_SPEC.md`](docs/architecture/LALIN_CAST_UPDATER_SPEC.md).
