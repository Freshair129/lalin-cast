# Lalin Cast provenance

| Field | Value |
|---|---|
| Product | Lalin Cast |
| Feature reference | VacuumTube |
| Upstream | https://github.com/shy1132/VacuumTube |
| Baseline | v1.8.2 / 4dd3ee4 |
| License | MIT for the retained upstream reference; retain `reference/vacuumtube/LICENSE` in distributions that copy upstream code |
| Port scope | Rust + Tauri v2 native shell and WebView boundary |
| Leanback surface | `https://www.youtube.com/tv` |
| User-Agent | `Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; LalinCast/<version>` — `<version>` is `env!("CARGO_PKG_VERSION")` at build time (H0 identity token; no longer VacuumTube-derived) |

The standalone Cast runtime does not copy VacuumTube DOM modules. Each future
module must record its source path, local adaptation, runtime assumptions and
WebView2 evidence before it is enabled. No custom YouTube-specific ad bypass or
credential relay is part of this product.

The current Tauri source was exported from the Lalin AI repository at commit
`58af113`, which includes supervised DIAL listener recovery and device-id
persistence. The export must retain the source-to-reference relationship and
must not include updater private keys or user state.

## H0 identity change (2026-09-20)

As part of H0 release readiness, the User-Agent above, the DIAL `APP_AGENT` /
SSDP `SERVER` string (`Windows/10 UPnP/1.0 LalinCast/<version>`), and the DIAL
`manufacturer`/`modelName` fields (`Lalin` / `Lalin Cast`) were changed from
the previously VacuumTube-derived/compatibility strings to Lalin Cast's own
identity tokens (see `docs/plans/H0_RELEASE_READINESS_PLAN.md` constants
table). The `dialFriendlyName` store key still defaults to `Lalin Cast` and is
user-settable; it is not derived from the User-Agent change.

This is a documentation-only record of the identity change. Runtime regression
against the real YouTube Leanback surface and iPhone/DIAL pairing with the new
identity tokens is **NOT_RUN** — it is tracked as human gate H3 in the H0 plan
and must be evidenced before this change is treated as production-ready.
