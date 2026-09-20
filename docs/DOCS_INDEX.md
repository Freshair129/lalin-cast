# Lalin Cast documentation index

## Document version vs. app version

The `version` field in each doc's frontmatter (e.g. `0.8.0b`) is a **document
revision number**, tracked independently per file via that file's own
CHANGELOG table. It is not the Lalin Cast application version. The app version
comes only from `src-tauri/Cargo.toml` (`package.version`, surfaced at
runtime through `env!("CARGO_PKG_VERSION")`); do not infer the shipped app
version from any doc's frontmatter `version` value.

## Planning

- [`plans/H0_RELEASE_READINESS_PLAN.md`](plans/H0_RELEASE_READINESS_PLAN.md) — H0 release-readiness DAG, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W2_LIVING_ROOM_PLAN.md`](plans/W2_LIVING_ROOM_PLAN.md) — Wave 2 living-room readiness DAG (tray DIAL status, first-run network/DIAL setup wizard, offline/blocked-surface status window), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W3_CONTROLS_PLAN.md`](plans/W3_CONTROLS_PLAN.md) — Wave 3 controls DAG (controller and keyboard support, native settings window, command-line deep link, pause-on-blur), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.

## Product and architecture

- [`ADR-001-CAST-TAURI-PORT.md`](architecture/ADR-001-CAST-TAURI-PORT.md) — Rust + Tauri v2 shell, Leanback surface, DIAL boundary and feature gates.
- [`ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md`](architecture/ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md) — repository split, identity and external-write approval gates.
- [`CAST_PLATFORM_PLAN.md`](architecture/CAST_PLATFORM_PLAN.md) — Cast runtime ownership and acceptance plan.
- [`CAST_MIGRATION_MAP.md`](architecture/CAST_MIGRATION_MAP.md) — source export and rollback map.
- [`LALIN_CAST_REPOSITORY_SPLIT_PLAN.md`](architecture/LALIN_CAST_REPOSITORY_SPLIT_PLAN.md) — exact export inventory and release stages.
- [`LALIN_CAST_UPDATER_SPEC.md`](architecture/LALIN_CAST_UPDATER_SPEC.md) — signed updater and GitHub Actions contract.

## Legal and licensing

- [`../PRIVACY.md`](../PRIVACY.md) — privacy notice (local data, DIAL/SSDP on LAN, updater network contact, startup connectivity probe, first-run network-profile check, local-only Gamepad API reading, the `Ctrl+Shift+C` clipboard copy, validated never-logged command-line deep links, no telemetry).
- [`../TERMS.md`](../TERMS.md) — terms of use (unofficial/not-affiliated status, YouTube ToS binding, no warranty).
- [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) — third-party license notices for every `Cargo.lock` package plus VacuumTube/Tauri/WebView2 attributions.
- [`LICENSE_DECISION.md`](LICENSE_DECISION.md) — MIT / Apache-2.0 / proprietary license comparison and the founder decision checklist for Lalin Cast itself.

## Guides

- [`guides/STEAM_AND_HANDHELD.md`](guides/STEAM_AND_HANDHELD.md) — adding Lalin Cast to Steam as a non-Steam game, launch options, Big Picture, supported controllers, ROG Ally/Legion Go tips and current limitations.

## Runbooks

- [`runbooks/SIGNING_KEY_CUSTODY.md`](runbooks/SIGNING_KEY_CUSTODY.md) — updater signing-key roles, storage, verification and rotation/leak procedure.

## Provenance and evidence

- [`../LALIN_PROVENANCE.md`](../LALIN_PROVENANCE.md) — Cast-to-VacuumTube provenance.
- [`../reference/vacuumtube/LALIN_PROVENANCE.md`](../reference/vacuumtube/LALIN_PROVENANCE.md) — pinned upstream source/archive record.
- [`../.brain/rca/`](../.brain/rca/) — retained runtime RCA evidence.

## Release boundary

The first release target is Windows x64 NSIS. The updater endpoint is
`https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`.
The private updater key is never stored in this repository.
