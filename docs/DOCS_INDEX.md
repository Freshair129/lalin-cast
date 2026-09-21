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
- [`plans/W4_PLAYBACK_PLAN.md`](plans/W4_PLAYBACK_PLAN.md) — Wave 4 playback and handheld DAG (sleep timer, codec filter, hardware-decoding toggle, touch overlay, mini-player, ARM64 release matrix, winget manifest templates), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W5_DESKTOP_PLAN.md`](plans/W5_DESKTOP_PLAN.md) — Wave 5 desktop integration and launcher DAG (Studio launcher lifecycle CLI + state file, window-bounds persistence, start with Windows, offline auto-retry, diagnostics snapshot, playback-speed keys, help overlay, now-playing title, repository support files), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W6_POLISH_PLAN.md`](plans/W6_POLISH_PLAN.md) — Wave 6 living-room polish and QA DAG (UI scale, settings profiles, reset to defaults, sleep at end of video, tray/menu play-pause, Steam launch-command copy button, controller help binding, CI smoke job, `scripts/lifecycle-driver.ps1`, release-notes-from-CHANGELOG), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W7_DEEPLINK_PLAN.md`](plans/W7_DEEPLINK_PLAN.md) — Wave 7 deep link and DIAL hardening DAG (stricter SSDP `MAN` header validation, the `lalin-cast://` URL scheme via the approved `tauri-plugin-deep-link` crate with opt-in HKCU registration, `THIRD_PARTY_NOTICES.md` sync), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W8_BOUNDARY_PLAN.md`](plans/W8_BOUNDARY_PLAN.md) — Wave 8 client-side modification boundary DAG (the founder's escalation ก decision recorded as ADR-004, opt-in CSS-only hiding of the Shorts shelf and guide tabs, keep-display-awake driven by real playback state with its two narrow rule exceptions, and promoting the CI `smoke` job to blocking), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W9_SUPPORTABILITY_PLAN.md`](plans/W9_SUPPORTABILITY_PLAN.md) — Wave 9 supportability and guardrails DAG (a rotating local log file behind a single `sanitize_log_message` sanitiser that strips URLs/Windows paths before every write, replacing all 32 `eprintln!` call sites that were otherwise invisible in a release build, a settings-window button to open the log folder, and a blocking CI check that keeps `THIRD_PARTY_NOTICES.md` in agreement with `Cargo.lock`), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W10_RELEASE_REHEARSAL_PLAN.md`](plans/W10_RELEASE_REHEARSAL_PLAN.md) — Wave 10 release rehearsal DAG (an unsigned NSIS installer dry run through the same pinned `tauri-action` SHA that `release.yml` uses, a fail-closed CI check that the rendered installer script never registers `lalin-cast://` itself, a fixture-driven self-test proving the notices check can actually fail, and a sanitiser update that masks the Windows home folder and account name wherever they appear, before the path rule runs), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.
- [`plans/W11_PORTABLE_PLAN.md`](plans/W11_PORTABLE_PLAN.md) — Wave 11 portable mode DAG (a `lalin-cast.portable` marker beside the exe that moves the settings store, log, `lifecycle.json` and every window's WebView2 profile into a `lalin-cast-data` folder beside the exe, with installed mode unchanged by even one path, the registry and the in-place NSIS updater refused in Rust, a CI portable smoke run against the real exe, and a dry-run portable zip plus an experimental ARM64 dry-run leg), constants/contracts, file ownership matrix and parallel-stream/verify-gate plan.

## Product and architecture

- [`ADR-001-CAST-TAURI-PORT.md`](architecture/ADR-001-CAST-TAURI-PORT.md) — Rust + Tauri v2 shell, Leanback surface, DIAL boundary, feature gates and, added in wave 9, the local rotating log file's single-sanitiser guarantee, extended in wave 10 to also mask the Windows home folder and account name and to record the unsigned release-dry-run workflow, and in wave 11 to record the `lalin-cast.portable` marker, the `<data_root>` that carries the settings/log/lifecycle/WebView2 paths, and the in-Rust refusal of the registry and the in-place updater when portable.
- [`ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md`](architecture/ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md) — repository split, identity and external-write approval gates.
- [`ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md`](architecture/ADR-004-CLIENT-SIDE-MODIFICATION-BOUNDARY.md) — the founder's escalation ก decision (no ad filtering, no SponsorBlock/DeArrow/Return YouTube Dislike, opt-in CSS-only Shorts/guide-tab hiding, no userstyle sandbox yet, no config-editing low-memory mode, keep-display-awake with its two rule exceptions, the smoke-job promotion) and the client-side modification boundary that governs future requests of this kind.
- [`CAST_PLATFORM_PLAN.md`](architecture/CAST_PLATFORM_PLAN.md) — Cast runtime ownership and acceptance plan.
- [`CAST_MIGRATION_MAP.md`](architecture/CAST_MIGRATION_MAP.md) — source export and rollback map.
- [`LALIN_CAST_REPOSITORY_SPLIT_PLAN.md`](architecture/LALIN_CAST_REPOSITORY_SPLIT_PLAN.md) — exact export inventory and release stages.
- [`LALIN_CAST_UPDATER_SPEC.md`](architecture/LALIN_CAST_UPDATER_SPEC.md) — signed updater and GitHub Actions contract.
- [`CAST_LAUNCHER_IPC.md`](architecture/CAST_LAUNCHER_IPC.md) — Studio launcher IPC: `--lifecycle`/`--request-id` CLI grammar, the atomic `lifecycle.json` state-file schema, launch/focus/close/timeout sequences, exit codes, Studio-side polling guidance and a PowerShell driver example for human gate H13.

## Legal and licensing

- [`../PRIVACY.md`](../PRIVACY.md) — privacy notice (local data, DIAL/SSDP on LAN, updater network contact, startup connectivity probe, first-run network-profile check, local-only Gamepad API reading, the `Ctrl+Shift+C` clipboard copy, validated never-logged command-line and `lalin-cast://` deep links, the opt-in HKCU-only `lalin-cast://` scheme registration, the local-only sleep timer/codec filter/hardware decoding/touch overlay/UI scale/sleep-at-end-of-video/keep-display-awake, the CSS-only opt-in Shorts-shelf/guide-tab hiding that reads only already-rendered DOM, the atomic `lifecycle.json` launcher state file, the registry Run-key autostart write, offline auto-retry, the local-only diagnostics-copy and launch-command-copy buttons, what reset to defaults does and does not remove, the local-only Media Session now-playing title, the rotating local log file whose every line is sanitised before a write, with the sanitiser's exact limits stated including the wave 10 home-folder/account-name masking and its remaining out-of-home-folder-path limit, no telemetry, and the wave 11 portable-mode data-location table plus its warning that the `lalin-cast-data\WebView2` folder carries a signed-in YouTube session).
- [`../TERMS.md`](../TERMS.md) — terms of use (unofficial/not-affiliated status, YouTube ToS binding, no warranty).
- [`../SECURITY.md`](../SECURITY.md) — supported versions and how to report a security vulnerability privately.
- [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) — third-party license notices for every `Cargo.lock` package plus VacuumTube/Tauri/WebView2 attributions.
- [`LICENSE_DECISION.md`](LICENSE_DECISION.md) — MIT / Apache-2.0 / proprietary license comparison and the founder decision checklist for Lalin Cast itself.

## Guides

- [`guides/STEAM_AND_HANDHELD.md`](guides/STEAM_AND_HANDHELD.md) — adding Lalin Cast to Steam as a non-Steam game, launch options, Big Picture, supported controllers, the touch overlay, mini-player while gaming, hardware decoding on handhelds, start with Windows, offline auto-retry at boot, playback speed keys, ROG Ally/Legion Go tips and current limitations.

## Scripts

- [`../scripts/README.md`](../scripts/README.md) — usage for `scripts/lifecycle-driver.ps1`, the read-only PowerShell driver that exercises the Studio launcher lifecycle (`launch`/`focus`/`close`) against a built `lalin-cast.exe` for human gate H13 (see `docs/architecture/CAST_LAUNCHER_IPC.md`) and the CI `smoke` job.

## Packaging

- [`../packaging/winget/README.md`](../packaging/winget/README.md) — winget manifest templates (`Lalin.LalinCast*.yaml`) and the submission checklist (release → `winget hash` → fill in the placeholders → `winget validate` → PR to `microsoft/winget-pkgs`); the submission itself has not shipped yet, and ARM64 packaging is experimental (see `plans/W4_PLAYBACK_PLAN.md`).

## Release

- [`../CHANGELOG.md`](../CHANGELOG.md) — the app's release history in Keep a Changelog format, with an `[Unreleased]` section referencing the wave/human-gate plans each entry comes from.

## Runbooks

- [`runbooks/SIGNING_KEY_CUSTODY.md`](runbooks/SIGNING_KEY_CUSTODY.md) — updater signing-key roles, storage, verification and rotation/leak procedure.
- [`runbooks/RELEASE_CHECKLIST.md`](runbooks/RELEASE_CHECKLIST.md) — the pre-tag checklist (open human gates closed, `Cargo.toml` version bump, `CHANGELOG.md` `[Unreleased]` moved to a version, `THIRD_PARTY_NOTICES.md` matches the lock file), the tag step, and post-release verification (`latest.json` and its signature, the winget manifest).

## Provenance and evidence

- [`../LALIN_PROVENANCE.md`](../LALIN_PROVENANCE.md) — Cast-to-VacuumTube provenance.
- [`../reference/vacuumtube/LALIN_PROVENANCE.md`](../reference/vacuumtube/LALIN_PROVENANCE.md) — pinned upstream source/archive record.
- [`../.brain/rca/`](../.brain/rca/) — retained runtime RCA evidence.

## Release boundary

The first release target is Windows x64 NSIS. The updater endpoint is
`https://github.com/Freshair129/lalin-cast/releases/latest/download/latest.json`.
The private updater key is never stored in this repository. CI also produces an ARM64
(`aarch64-pc-windows-msvc`) build as an experimental, `continue-on-error` job (see
`plans/W4_PLAYBACK_PLAN.md`); it is not held to the same acceptance gates as the x64 target yet. A
winget package submission is prepared (see [`../packaging/winget/README.md`](../packaging/winget/README.md))
but has not been submitted to `microsoft/winget-pkgs` yet.
