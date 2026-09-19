# Lalin Cast documentation index

## Product and architecture

- [`ADR-001-CAST-TAURI-PORT.md`](architecture/ADR-001-CAST-TAURI-PORT.md) — Rust + Tauri v2 shell, Leanback surface, DIAL boundary and feature gates.
- [`ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md`](architecture/ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md) — repository split, identity and external-write approval gates.
- [`CAST_PLATFORM_PLAN.md`](architecture/CAST_PLATFORM_PLAN.md) — Cast runtime ownership and acceptance plan.
- [`CAST_MIGRATION_MAP.md`](architecture/CAST_MIGRATION_MAP.md) — source export and rollback map.
- [`LALIN_CAST_REPOSITORY_SPLIT_PLAN.md`](architecture/LALIN_CAST_REPOSITORY_SPLIT_PLAN.md) — exact export inventory and release stages.
- [`LALIN_CAST_UPDATER_SPEC.md`](architecture/LALIN_CAST_UPDATER_SPEC.md) — signed updater and GitHub Actions contract.

## Provenance and evidence

- [`../LALIN_PROVENANCE.md`](../LALIN_PROVENANCE.md) — Cast-to-VacuumTube provenance.
- [`../reference/vacuumtube/LALIN_PROVENANCE.md`](../reference/vacuumtube/LALIN_PROVENANCE.md) — pinned upstream source/archive record.
- [`../.brain/rca/`](../.brain/rca/) — retained runtime RCA evidence.

## Release boundary

The first release target is Windows x64 NSIS. The updater endpoint is
`https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`.
The private updater key is never stored in this repository.
