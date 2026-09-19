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
| User-Agent | derived from the pinned upstream source for compatibility testing |

The standalone Cast runtime does not copy VacuumTube DOM modules. Each future
module must record its source path, local adaptation, runtime assumptions and
WebView2 evidence before it is enabled. No custom YouTube-specific ad bypass or
credential relay is part of this product.

The current Tauri source was exported from the Lalin AI repository at commit
`58af113`, which includes supervised DIAL listener recovery and device-id
persistence. The export must retain the source-to-reference relationship and
must not include updater private keys or user state.
