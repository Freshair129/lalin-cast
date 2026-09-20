# Third-Party Notices — Lalin Cast

_เอกสารนี้เป็นภาษาอังกฤษเป็นหลัก เนื่องจากเป็นการอ้างอิงข้อความสัญญาอนุญาต (license) ต้นฉบับ
ซึ่งต้องคงไว้ตามที่เจ้าของลิขสิทธิ์เผยแพร่ ห้ามแปล — This document is kept primarily in English
because it reproduces upstream license texts verbatim; those texts must not be translated or
altered. A short Thai summary is given per section for context._

Lalin Cast (`ai.lalin.cast`) is a Rust + Tauri v2 Windows application. It statically links a
number of open-source Rust crates, bundles the Microsoft Edge WebView2 runtime loader via Tauri,
and retains a MIT-licensed reference copy of VacuumTube under `reference/vacuumtube/`. This file
lists every third-party component and its license, as required by those licenses.

**ภาษาไทยโดยสรุป:** ไฟล์นี้รวบรวมรายชื่อไลบรารี Rust ทุกตัวที่ใช้ใน Lalin Cast (จาก
`src-tauri/Cargo.lock`) พร้อมสัญญาอนุญาตของแต่ละตัว, ข้อความสัญญาอนุญาต MIT ฉบับเต็มของ
VacuumTube ที่เก็บไว้เป็นข้อมูลอ้างอิงใน `reference/vacuumtube/`, หมายเหตุเกี่ยวกับ Tauri /
WebView2 runtime, ประกาศลิขสิทธิ์ที่เกี่ยวข้องกับโปรโตคอล DIAL ซึ่งพัฒนาร่วมโดย Netflix, Inc. และ
YouTube, และคำชี้แจงเรื่องเครื่องหมายการค้า สัญญาอนุญาตของตัวแอป Lalin Cast เอง (ยังไม่เลือก) ดูได้
ที่ [`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md)

This file is generated from `src-tauri/Cargo.lock` and does not cover the license Lalin Cast
chooses for its own original source code — that decision is tracked separately in
[`docs/LICENSE_DECISION.md`](docs/LICENSE_DECISION.md) and is not yet made.

## Contents

1. [Rust dependencies (`src-tauri/Cargo.lock`)](#1-rust-dependencies-src-tauricargolock)
2. [VacuumTube reference copy](#2-vacuumtube-reference-copy)
3. [Tauri framework and Microsoft Edge WebView2 runtime](#3-tauri-framework-and-microsoft-edge-webview2-runtime)
4. [DIAL protocol notice](#4-dial-protocol-notice)
5. [Trademarks](#5-trademarks)
6. [How this file is generated](#6-how-this-file-is-generated)

---

## 1. Rust dependencies (`src-tauri/Cargo.lock`)

**สรุป:** ตารางด้านล่างครอบคลุมทุก package ที่ปรากฏใน `src-tauri/Cargo.lock` ณ วันที่ทำเอกสารนี้
(ไม่นับ crate หลักของแอปเอง `lalin-cast`) รวม 518 รายการ (462 ชื่อ crate ที่ไม่ซ้ำ, บาง crate ปรากฏ
หลายเวอร์ชันเพราะการ resolve dependency ของ Cargo) ข้อมูลสัญญาอนุญาตดึงจาก
`cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1` (SPDX license
expression ตามที่แต่ละ crate ประกาศไว้ใน `Cargo.toml` ของตัวเอง)

This table enumerates every package entry in `src-tauri/Cargo.lock` as of this document's
generation date (excluding the `lalin-cast` crate itself, which is this application's own code):
**518 package entries covering 462 distinct crate names** (several crates appear at more than one
resolved version because of Cargo's dependency resolution — each resolved version is listed
separately below since a crate's declared license can in principle differ between its own
versions). License identifiers are the SPDX license expression each crate declares in its own
`Cargo.toml`, read via:

```
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1
```

No package in the lockfile was missing a machine-readable `license` field at generation time, so
no entry below required a manual fallback read of a vendored `Cargo.toml` under the local cargo
registry cache.

### 1.1 License families used (summary)

| License (SPDX expression) | Package count |
|---|---|
| `MIT OR Apache-2.0` | 244 |
| `MIT` | 113 |
| `Apache-2.0 OR MIT` | 52 |
| `MIT/Apache-2.0` | 19 |
| `Zlib OR Apache-2.0 OR MIT` | 18 |
| `Unicode-3.0` | 18 |
| `Unlicense OR MIT` | 9 |
| `MPL-2.0` | 5 |
| `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` | 5 |
| `BSD-3-Clause` | 3 |
| `Apache-2.0/MIT` | 3 |
| `Apache-2.0 OR ISC OR MIT` | 3 |
| `ISC` | 3 |
| `Zlib` | 2 |
| `MIT OR Zlib OR Apache-2.0` | 2 |
| `BSD-3-Clause OR MIT OR Apache-2.0` | 2 |
| `MIT OR Apache-2.0 OR LGPL-2.1-or-later` | 2 |
| `Unlicense/MIT` | 2 |
| `Apache-2.0` | 2 |
| `0BSD OR MIT OR Apache-2.0` | 1 |
| `BSD-3-Clause AND MIT` | 1 |
| `BSD-3-Clause/MIT` | 1 |
| `Apache-2.0 AND MIT` | 1 |
| `CC0-1.0 OR MIT-0 OR Apache-2.0` | 1 |
| `Apache-2.0 / MIT` | 1 |
| `MIT OR Apache-2.0 OR Zlib` | 1 |
| `Apache-2.0 AND ISC` | 1 |
| `Apache-2.0 WITH LLVM-exception` | 1 |
| `(MIT OR Apache-2.0) AND Unicode-3.0` | 1 |
| `CDLA-Permissive-2.0` | 1 |

Total third-party package entries: **518** across **462** distinct crate names.

### 1.2 Full package list

**สรุป:** รายการเต็มทุก package เรียงตามชื่อ (ก-ฮ/A-Z) แล้วเวอร์ชัน — Full list, sorted by
crate name then version.

| # | Crate | Version | License |
|---|---|---|---|
| 1 | [adler2](https://github.com/oyvindln/adler2) | 2.0.1 | `0BSD OR MIT OR Apache-2.0` |
| 2 | [aho-corasick](https://github.com/BurntSushi/aho-corasick) | 1.1.5 | `Unlicense OR MIT` |
| 3 | [alloc-no-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib) | 2.0.4 | `BSD-3-Clause` |
| 4 | [alloc-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib) | 0.2.4 | `BSD-3-Clause` |
| 5 | [android_system_properties](https://github.com/nical/android_system_properties) | 0.1.6 | `MIT OR Apache-2.0` |
| 6 | [anyhow](https://github.com/dtolnay/anyhow) | 1.0.104 | `MIT OR Apache-2.0` |
| 7 | [arbitrary](https://github.com/rust-fuzz/arbitrary/) | 1.4.2 | `MIT OR Apache-2.0` |
| 8 | [async-broadcast](https://github.com/smol-rs/async-broadcast) | 0.7.2 | `MIT OR Apache-2.0` |
| 9 | [async-channel](https://github.com/smol-rs/async-channel) | 2.5.0 | `Apache-2.0 OR MIT` |
| 10 | [async-executor](https://github.com/smol-rs/async-executor) | 1.14.0 | `Apache-2.0 OR MIT` |
| 11 | [async-io](https://github.com/smol-rs/async-io) | 2.6.0 | `Apache-2.0 OR MIT` |
| 12 | [async-lock](https://github.com/smol-rs/async-lock) | 3.4.2 | `Apache-2.0 OR MIT` |
| 13 | [async-process](https://github.com/smol-rs/async-process) | 2.5.0 | `Apache-2.0 OR MIT` |
| 14 | [async-recursion](https://github.com/dcchut/async-recursion) | 1.1.1 | `MIT OR Apache-2.0` |
| 15 | [async-signal](https://github.com/smol-rs/async-signal) | 0.2.14 | `Apache-2.0 OR MIT` |
| 16 | [async-task](https://github.com/smol-rs/async-task) | 4.7.1 | `Apache-2.0 OR MIT` |
| 17 | [async-trait](https://github.com/dtolnay/async-trait) | 0.1.92 | `MIT OR Apache-2.0` |
| 18 | [atk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 19 | [atk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 20 | [atomic-waker](https://github.com/smol-rs/atomic-waker) | 1.1.2 | `Apache-2.0 OR MIT` |
| 21 | [autocfg](https://github.com/cuviper/autocfg) | 1.5.1 | `Apache-2.0 OR MIT` |
| 22 | [base64](https://github.com/marshallpierce/rust-base64) | 0.21.7 | `MIT OR Apache-2.0` |
| 23 | [base64](https://github.com/marshallpierce/rust-base64) | 0.22.1 | `MIT OR Apache-2.0` |
| 24 | [base64](https://github.com/marshallpierce/rust-base64) | 0.23.1 | `MIT OR Apache-2.0` |
| 25 | [bit-set](https://github.com/contain-rs/bit-set) | 0.8.0 | `Apache-2.0 OR MIT` |
| 26 | [bit-vec](https://github.com/contain-rs/bit-vec) | 0.8.0 | `Apache-2.0 OR MIT` |
| 27 | [bitflags](https://github.com/bitflags/bitflags) | 1.3.2 | `MIT/Apache-2.0` |
| 28 | [bitflags](https://github.com/bitflags/bitflags) | 2.13.2 | `MIT OR Apache-2.0` |
| 29 | [block-buffer](https://github.com/RustCrypto/utils) | 0.10.4 | `MIT OR Apache-2.0` |
| 30 | [block2](https://github.com/madsmtm/objc2) | 0.6.2 | `MIT` |
| 31 | [blocking](https://github.com/smol-rs/blocking) | 1.7.0 | `Apache-2.0 OR MIT` |
| 32 | [brotli](https://github.com/dropbox/rust-brotli) | 8.0.4 | `BSD-3-Clause AND MIT` |
| 33 | [brotli-decompressor](https://github.com/dropbox/rust-brotli-decompressor) | 5.0.3 | `BSD-3-Clause/MIT` |
| 34 | [bs58](https://github.com/Nullus157/bs58-rs) | 0.5.1 | `MIT/Apache-2.0` |
| 35 | [bumpalo](https://github.com/fitzgen/bumpalo) | 3.20.3 | `MIT OR Apache-2.0` |
| 36 | [bytemuck](https://github.com/Lokathor/bytemuck) | 1.25.2 | `Zlib OR Apache-2.0 OR MIT` |
| 37 | [byteorder](https://github.com/BurntSushi/byteorder) | 1.5.0 | `Unlicense OR MIT` |
| 38 | [bytes](https://github.com/tokio-rs/bytes) | 1.12.1 | `MIT` |
| 39 | [cairo-rs](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | `MIT` |
| 40 | [cairo-sys-rs](https://github.com/gtk-rs/gtk-rs-core) | 0.18.2 | `MIT` |
| 41 | [camino](https://github.com/camino-rs/camino) | 1.2.6 | `MIT OR Apache-2.0` |
| 42 | [cargo_metadata](https://github.com/oli-obk/cargo_metadata) | 0.19.2 | `MIT` |
| 43 | [cargo_toml](https://gitlab.com/lib.rs/cargo_toml) | 0.22.3 | `Apache-2.0 OR MIT` |
| 44 | [cargo-platform](https://github.com/rust-lang/cargo) | 0.1.9 | `MIT OR Apache-2.0` |
| 45 | [cc](https://github.com/rust-lang/cc-rs) | 1.4.7 | `MIT OR Apache-2.0` |
| 46 | [cesu8](https://github.com/emk/cesu8-rs) | 1.1.0 | `Apache-2.0/MIT` |
| 47 | [cfb](https://github.com/mdsteele/rust-cfb) | 0.7.3 | `MIT` |
| 48 | [cfg-expr](https://github.com/EmbarkStudios/cfg-expr) | 0.15.8 | `MIT OR Apache-2.0` |
| 49 | [cfg-if](https://github.com/rust-lang/cfg-if) | 1.0.5 | `MIT OR Apache-2.0` |
| 50 | [chrono](https://github.com/chronotope/chrono) | 0.4.45 | `MIT OR Apache-2.0` |
| 51 | [combine](https://github.com/Marwes/combine) | 4.6.8 | `MIT` |
| 52 | [concurrent-queue](https://github.com/smol-rs/concurrent-queue) | 2.5.0 | `Apache-2.0 OR MIT` |
| 53 | [cookie](https://github.com/SergioBenitez/cookie-rs) | 0.18.2 | `MIT OR Apache-2.0` |
| 54 | [core-foundation](https://github.com/servo/core-foundation-rs) | 0.9.4 | `MIT OR Apache-2.0` |
| 55 | [core-foundation](https://github.com/servo/core-foundation-rs) | 0.10.1 | `MIT OR Apache-2.0` |
| 56 | [core-foundation-sys](https://github.com/servo/core-foundation-rs) | 0.8.7 | `MIT OR Apache-2.0` |
| 57 | [core-graphics](https://github.com/servo/core-foundation-rs) | 0.25.0 | `MIT OR Apache-2.0` |
| 58 | [core-graphics-types](https://github.com/servo/core-foundation-rs) | 0.2.0 | `MIT OR Apache-2.0` |
| 59 | [cpufeatures](https://github.com/RustCrypto/utils) | 0.2.17 | `MIT OR Apache-2.0` |
| 60 | [crc32fast](https://github.com/srijs/rust-crc32fast) | 1.5.2 | `MIT OR Apache-2.0` |
| 61 | [crossbeam-channel](https://github.com/crossbeam-rs/crossbeam) | 0.5.17 | `MIT OR Apache-2.0` |
| 62 | [crossbeam-utils](https://github.com/crossbeam-rs/crossbeam) | 0.8.23 | `MIT OR Apache-2.0` |
| 63 | [crypto-common](https://github.com/RustCrypto/traits) | 0.1.7 | `MIT OR Apache-2.0` |
| 64 | [cssparser](https://github.com/servo/rust-cssparser) | 0.36.0 | `MPL-2.0` |
| 65 | [cssparser-macros](https://github.com/servo/rust-cssparser) | 0.6.1 | `MPL-2.0` |
| 66 | [ctor](https://github.com/mmastrac/rust-ctor) | 0.8.0 | `Apache-2.0 OR MIT` |
| 67 | [ctor-proc-macro](https://github.com/mmastrac/rust-ctor) | 0.0.7 | `Apache-2.0 OR MIT` |
| 68 | [darling](https://github.com/TedDriggs/darling) | 0.24.1 | `MIT` |
| 69 | [darling_core](https://github.com/TedDriggs/darling) | 0.24.1 | `MIT` |
| 70 | [darling_macro](https://github.com/TedDriggs/darling) | 0.24.1 | `MIT` |
| 71 | [dbus](https://github.com/diwic/dbus-rs) | 0.9.12 | `Apache-2.0/MIT` |
| 72 | [defmt](https://github.com/knurling-rs/defmt) | 1.1.1 | `MIT OR Apache-2.0` |
| 73 | [defmt-macros](https://github.com/knurling-rs/defmt) | 1.1.1 | `MIT OR Apache-2.0` |
| 74 | [defmt-parser](https://github.com/knurling-rs/defmt) | 1.0.0 | `MIT OR Apache-2.0` |
| 75 | [deranged](https://github.com/jhpratt/deranged) | 0.5.8 | `MIT OR Apache-2.0` |
| 76 | [derive_arbitrary](https://github.com/rust-fuzz/arbitrary) | 1.4.2 | `MIT OR Apache-2.0` |
| 77 | [derive_more](https://github.com/JelteF/derive_more) | 2.1.1 | `MIT` |
| 78 | [derive_more-impl](https://github.com/JelteF/derive_more) | 2.1.1 | `MIT` |
| 79 | [digest](https://github.com/RustCrypto/traits) | 0.10.7 | `MIT OR Apache-2.0` |
| 80 | [dirs](https://github.com/soc/dirs-rs) | 6.0.0 | `MIT OR Apache-2.0` |
| 81 | [dirs-sys](https://github.com/dirs-dev/dirs-sys-rs) | 0.5.0 | `MIT OR Apache-2.0` |
| 82 | [dispatch2](https://github.com/madsmtm/objc2) | 0.3.1 | `Zlib OR Apache-2.0 OR MIT` |
| 83 | [displaydoc](https://github.com/yaahc/displaydoc) | 0.2.7 | `MIT OR Apache-2.0` |
| 84 | [dlopen2](https://github.com/OpenByteDev/dlopen2) | 0.8.2 | `MIT` |
| 85 | [dlopen2_derive](https://github.com/OpenByteDev/dlopen2) | 0.4.3 | `MIT` |
| 86 | [dom_query](https://github.com/niklak/dom_query) | 0.27.0 | `MIT` |
| 87 | [dpi](https://github.com/rust-windowing/winit) | 0.1.2 | `Apache-2.0 AND MIT` |
| 88 | [dtoa](https://github.com/dtolnay/dtoa) | 1.0.11 | `MIT OR Apache-2.0` |
| 89 | [dtoa-short](https://github.com/upsuper/dtoa-short) | 0.3.5 | `MPL-2.0` |
| 90 | [dtor](https://github.com/mmastrac/rust-ctor) | 0.3.0 | `Apache-2.0 OR MIT` |
| 91 | [dtor-proc-macro](https://github.com/mmastrac/rust-ctor) | 0.0.6 | `Apache-2.0 OR MIT` |
| 92 | [dunce](https://gitlab.com/kornelski/dunce) | 1.0.5 | `CC0-1.0 OR MIT-0 OR Apache-2.0` |
| 93 | [dyn-clone](https://github.com/dtolnay/dyn-clone) | 1.0.20 | `MIT OR Apache-2.0` |
| 94 | [embed_plist](https://github.com/nvzqz/embed-plist-rs) | 1.2.2 | `MIT OR Apache-2.0` |
| 95 | [embed-resource](https://github.com/nabijaczleweli/rust-embed-resource) | 3.0.11 | `MIT` |
| 96 | [endi](https://github.com/zeenix/endi) | 1.1.1 | `MIT` |
| 97 | [enumflags2](https://github.com/meithecatte/enumflags2) | 0.7.12 | `MIT OR Apache-2.0` |
| 98 | [enumflags2_derive](https://github.com/meithecatte/enumflags2) | 0.7.12 | `MIT OR Apache-2.0` |
| 99 | [equivalent](https://github.com/indexmap-rs/equivalent) | 1.0.2 | `Apache-2.0 OR MIT` |
| 100 | [erased-serde](https://github.com/dtolnay/erased-serde) | 0.4.10 | `MIT OR Apache-2.0` |
| 101 | [errno](https://github.com/lambda-fairy/rust-errno) | 0.3.14 | `MIT OR Apache-2.0` |
| 102 | [event-listener](https://github.com/smol-rs/event-listener) | 5.4.2 | `Apache-2.0 OR MIT` |
| 103 | [event-listener-strategy](https://github.com/smol-rs/event-listener-strategy) | 0.5.4 | `Apache-2.0 OR MIT` |
| 104 | [fastrand](https://github.com/smol-rs/fastrand) | 2.5.0 | `Apache-2.0 OR MIT` |
| 105 | [fdeflate](https://github.com/image-rs/fdeflate) | 0.3.7 | `MIT OR Apache-2.0` |
| 106 | [field-offset](https://github.com/Diggsey/rust-field-offset) | 0.3.6 | `MIT OR Apache-2.0` |
| 107 | [filetime](https://github.com/alexcrichton/filetime) | 0.2.29 | `MIT/Apache-2.0` |
| 108 | [find-msvc-tools](https://github.com/rust-lang/cc-rs) | 0.1.13 | `MIT OR Apache-2.0` |
| 109 | [flate2](https://github.com/rust-lang/flate2-rs) | 1.1.10 | `MIT OR Apache-2.0` |
| 110 | [fnv](https://github.com/servo/rust-fnv) | 1.0.7 | `Apache-2.0 / MIT` |
| 111 | [foldhash](https://github.com/orlp/foldhash) | 0.2.0 | `Zlib` |
| 112 | [foreign-types](https://github.com/sfackler/foreign-types) | 0.5.0 | `MIT/Apache-2.0` |
| 113 | [foreign-types-macros](https://github.com/sfackler/foreign-types) | 0.2.4 | `MIT/Apache-2.0` |
| 114 | [foreign-types-shared](https://github.com/sfackler/foreign-types) | 0.3.1 | `MIT/Apache-2.0` |
| 115 | [form_urlencoded](https://github.com/servo/rust-url) | 1.2.2 | `MIT OR Apache-2.0` |
| 116 | [futures-channel](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 117 | [futures-core](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 118 | [futures-executor](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 119 | [futures-io](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 120 | [futures-lite](https://github.com/smol-rs/futures-lite) | 2.6.1 | `Apache-2.0 OR MIT` |
| 121 | [futures-macro](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 122 | [futures-sink](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 123 | [futures-task](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 124 | [futures-util](https://github.com/rust-lang/futures-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 125 | [gdk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 126 | [gdk-pixbuf](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | `MIT` |
| 127 | [gdk-pixbuf-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | `MIT` |
| 128 | [gdk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 129 | [gdkwayland-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 130 | [gdkx11](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 131 | [gdkx11-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 132 | [generic-array](https://github.com/fizyk20/generic-array.git) | 0.14.7 | `MIT` |
| 133 | [getrandom](https://github.com/rust-random/getrandom) | 0.2.17 | `MIT OR Apache-2.0` |
| 134 | [getrandom](https://github.com/rust-random/getrandom) | 0.3.4 | `MIT OR Apache-2.0` |
| 135 | [getrandom](https://github.com/rust-random/getrandom) | 0.4.3 | `MIT OR Apache-2.0` |
| 136 | [gio](https://github.com/gtk-rs/gtk-rs-core) | 0.18.4 | `MIT` |
| 137 | [gio-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.1 | `MIT` |
| 138 | [glib](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | `MIT` |
| 139 | [glib-macros](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | `MIT` |
| 140 | [glib-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.1 | `MIT` |
| 141 | [glob](https://github.com/rust-lang/glob) | 0.3.4 | `MIT OR Apache-2.0` |
| 142 | [gobject-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | `MIT` |
| 143 | [gtk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 144 | [gtk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 145 | [gtk3-macros](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | `MIT` |
| 146 | [hashbrown](https://github.com/rust-lang/hashbrown) | 0.12.3 | `MIT OR Apache-2.0` |
| 147 | [hashbrown](https://github.com/rust-lang/hashbrown) | 0.17.1 | `MIT OR Apache-2.0` |
| 148 | [heck](https://github.com/withoutboats/heck) | 0.4.1 | `MIT OR Apache-2.0` |
| 149 | [heck](https://github.com/withoutboats/heck) | 0.5.0 | `MIT OR Apache-2.0` |
| 150 | [hermit-abi](https://github.com/hermit-os/hermit-rs) | 0.5.3 | `MIT OR Apache-2.0` |
| 151 | [hex](https://github.com/KokaKiwi/rust-hex) | 0.4.3 | `MIT OR Apache-2.0` |
| 152 | [html5ever](https://github.com/servo/html5ever) | 0.38.0 | `MIT OR Apache-2.0` |
| 153 | [http](https://github.com/hyperium/http) | 1.5.0 | `MIT OR Apache-2.0` |
| 154 | [http-body](https://github.com/hyperium/http-body) | 1.1.0 | `MIT` |
| 155 | [http-body-util](https://github.com/hyperium/http-body) | 0.1.5 | `MIT` |
| 156 | [httparse](https://github.com/seanmonstar/httparse) | 1.10.1 | `MIT OR Apache-2.0` |
| 157 | [httpdate](https://github.com/pyfisch/httpdate) | 1.0.3 | `MIT OR Apache-2.0` |
| 158 | [hyper](https://github.com/hyperium/hyper) | 1.11.1 | `MIT` |
| 159 | [hyper-rustls](https://github.com/rustls/hyper-rustls) | 0.27.9 | `Apache-2.0 OR ISC OR MIT` |
| 160 | [hyper-util](https://github.com/hyperium/hyper-util) | 0.1.20 | `MIT` |
| 161 | [iana-time-zone](https://github.com/strawlab/iana-time-zone) | 0.1.65 | `MIT OR Apache-2.0` |
| 162 | [iana-time-zone-haiku](https://github.com/strawlab/iana-time-zone) | 0.1.2 | `MIT OR Apache-2.0` |
| 163 | [ico](https://github.com/mdsteele/rust-ico) | 0.5.0 | `MIT` |
| 164 | [icu_collections](https://github.com/unicode-org/icu4x) | 2.3.0 | `Unicode-3.0` |
| 165 | [icu_locale_core](https://github.com/unicode-org/icu4x) | 2.3.0 | `Unicode-3.0` |
| 166 | [icu_normalizer](https://github.com/unicode-org/icu4x) | 2.3.0 | `Unicode-3.0` |
| 167 | [icu_normalizer_data](https://github.com/unicode-org/icu4x) | 2.3.0 | `Unicode-3.0` |
| 168 | [icu_properties](https://github.com/unicode-org/icu4x) | 2.3.0 | `Unicode-3.0` |
| 169 | [icu_properties_data](https://github.com/unicode-org/icu4x) | 2.3.0 | `Unicode-3.0` |
| 170 | [icu_provider](https://github.com/unicode-org/icu4x) | 2.3.1 | `Unicode-3.0` |
| 171 | [ident_case](https://github.com/TedDriggs/ident_case) | 1.0.1 | `MIT/Apache-2.0` |
| 172 | [idna](https://github.com/servo/rust-url/) | 1.1.0 | `MIT OR Apache-2.0` |
| 173 | [idna_adapter](https://github.com/hsivonen/idna_adapter) | 1.2.2 | `Apache-2.0 OR MIT` |
| 174 | [indexmap](https://github.com/bluss/indexmap) | 1.9.3 | `Apache-2.0 OR MIT` |
| 175 | [indexmap](https://github.com/indexmap-rs/indexmap) | 2.14.2 | `Apache-2.0 OR MIT` |
| 176 | [infer](https://github.com/bojand/infer) | 0.19.0 | `MIT` |
| 177 | [ipnet](https://github.com/krisprice/ipnet) | 2.12.2 | `MIT OR Apache-2.0` |
| 178 | [itoa](https://github.com/dtolnay/itoa) | 1.0.18 | `MIT OR Apache-2.0` |
| 179 | [javascriptcore-rs](https://github.com/tauri-apps/javascriptcore-rs) | 1.1.2 | `MIT` |
| 180 | [javascriptcore-rs-sys](https://github.com/tauri-apps/javascriptcore-rs) | 1.1.1 | `MIT` |
| 181 | [jiff](https://github.com/BurntSushi/jiff) | 0.2.37 | `Unlicense OR MIT` |
| 182 | [jiff-core](https://github.com/BurntSushi/jiff) | 0.1.1 | `Unlicense OR MIT` |
| 183 | [jiff-static](https://github.com/BurntSushi/jiff) | 0.2.37 | `Unlicense OR MIT` |
| 184 | [jiff-tzdb](https://github.com/BurntSushi/jiff) | 0.1.8 | `Unlicense OR MIT` |
| 185 | [jiff-tzdb-platform](https://github.com/BurntSushi/jiff) | 0.1.3 | `Unlicense OR MIT` |
| 186 | [jni](https://github.com/jni-rs/jni-rs) | 0.21.1 | `MIT/Apache-2.0` |
| 187 | [jni](https://github.com/jni-rs/jni-rs) | 0.22.4 | `MIT OR Apache-2.0` |
| 188 | [jni-macros](https://github.com/jni-rs/jni-rs) | 0.22.4 | `MIT OR Apache-2.0` |
| 189 | [jni-sys](https://github.com/jni-rs/jni-sys) | 0.3.1 | `MIT OR Apache-2.0` |
| 190 | [jni-sys](https://github.com/jni-rs/jni-sys) | 0.4.1 | `MIT OR Apache-2.0` |
| 191 | [jni-sys-macros](https://github.com/jni-rs/jni-sys) | 0.4.1 | `MIT OR Apache-2.0` |
| 192 | [js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys) | 0.3.105 | `MIT OR Apache-2.0` |
| 193 | [json-patch](https://github.com/idubrov/json-patch) | 3.0.1 | `MIT/Apache-2.0` |
| 194 | [jsonptr](https://github.com/chanced/jsonptr) | 0.6.3 | `MIT OR Apache-2.0` |
| 195 | [keyboard-types](https://github.com/pyfisch/keyboard-types) | 0.7.0 | `MIT OR Apache-2.0` |
| 196 | libappindicator | 0.9.0 | `Apache-2.0 OR MIT` |
| 197 | libappindicator-sys | 0.9.0 | `Apache-2.0 OR MIT` |
| 198 | [libc](https://github.com/rust-lang/libc) | 0.2.189 | `MIT OR Apache-2.0` |
| 199 | [libdbus-sys](https://github.com/diwic/dbus-rs) | 0.2.7 | `Apache-2.0/MIT` |
| 200 | [libloading](https://github.com/nagisa/rust_libloading/) | 0.7.4 | `ISC` |
| 201 | [libredox](https://gitlab.redox-os.org/redox-os/libredox.git) | 0.1.23 | `MIT` |
| 202 | [linux-raw-sys](https://github.com/sunfishcode/linux-raw-sys) | 0.12.1 | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` |
| 203 | [litemap](https://github.com/unicode-org/icu4x) | 0.8.3 | `Unicode-3.0` |
| 204 | [lock_api](https://github.com/Amanieu/parking_lot) | 0.4.14 | `MIT OR Apache-2.0` |
| 205 | [log](https://github.com/rust-lang/log) | 0.4.34 | `MIT OR Apache-2.0` |
| 206 | [markup5ever](https://github.com/servo/html5ever) | 0.38.0 | `MIT OR Apache-2.0` |
| 207 | [memchr](https://github.com/BurntSushi/memchr) | 2.8.3 | `Unlicense OR MIT` |
| 208 | [memoffset](https://github.com/Gilnaa/memoffset) | 0.9.1 | `MIT` |
| 209 | [mime](https://github.com/hyperium/mime) | 0.3.17 | `MIT OR Apache-2.0` |
| 210 | [minisign-verify](https://github.com/jedisct1/rust-minisign-verify) | 0.2.5 | `MIT` |
| 211 | [miniz_oxide](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | 0.8.9 | `MIT OR Zlib OR Apache-2.0` |
| 212 | [miniz_oxide](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | 0.9.1 | `MIT OR Zlib OR Apache-2.0` |
| 213 | [mio](https://github.com/tokio-rs/mio) | 1.2.3 | `MIT` |
| 214 | [muda](https://github.com/tauri-apps/muda) | 0.19.3 | `Apache-2.0 OR MIT` |
| 215 | [ndk](https://github.com/rust-mobile/ndk) | 0.9.0 | `MIT OR Apache-2.0` |
| 216 | [ndk-sys](https://github.com/rust-mobile/ndk) | 0.6.0+11769913 | `MIT OR Apache-2.0` |
| 217 | [new_debug_unreachable](https://github.com/mbrubeck/rust-debug-unreachable) | 1.0.6 | `MIT` |
| 218 | [num_enum](https://github.com/illicitonion/num_enum) | 0.7.6 | `BSD-3-Clause OR MIT OR Apache-2.0` |
| 219 | [num_enum_derive](https://github.com/illicitonion/num_enum) | 0.7.6 | `BSD-3-Clause OR MIT OR Apache-2.0` |
| 220 | [num-conv](https://github.com/jhpratt/num-conv) | 0.2.2 | `MIT OR Apache-2.0` |
| 221 | [num-traits](https://github.com/rust-num/num-traits) | 0.2.19 | `MIT OR Apache-2.0` |
| 222 | [objc2](https://github.com/madsmtm/objc2) | 0.6.4 | `MIT` |
| 223 | [objc2-app-kit](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 224 | [objc2-cloud-kit](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 225 | [objc2-core-data](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 226 | [objc2-core-foundation](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 227 | [objc2-core-graphics](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 228 | [objc2-core-image](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 229 | [objc2-core-location](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 230 | [objc2-core-text](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 231 | [objc2-encode](https://github.com/madsmtm/objc2) | 4.1.0 | `MIT` |
| 232 | [objc2-exception-helper](https://github.com/madsmtm/objc2) | 0.1.1 | `Zlib OR Apache-2.0 OR MIT` |
| 233 | [objc2-foundation](https://github.com/madsmtm/objc2) | 0.3.2 | `MIT` |
| 234 | [objc2-io-surface](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 235 | [objc2-osa-kit](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 236 | [objc2-quartz-core](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 237 | [objc2-ui-kit](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 238 | [objc2-user-notifications](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 239 | [objc2-web-kit](https://github.com/madsmtm/objc2) | 0.3.2 | `Zlib OR Apache-2.0 OR MIT` |
| 240 | [once_cell](https://github.com/matklad/once_cell) | 1.21.4 | `MIT OR Apache-2.0` |
| 241 | [openssl-probe](https://github.com/rustls/openssl-probe) | 0.2.1 | `MIT OR Apache-2.0` |
| 242 | [option-ext](https://github.com/soc/option-ext.git) | 0.2.0 | `MPL-2.0` |
| 243 | [ordered-stream](https://github.com/danieldg/ordered-stream) | 0.2.0 | `MIT OR Apache-2.0` |
| 244 | [osakit](https://github.com/mdevils/rust-osakit) | 0.3.1 | `MIT OR Apache-2.0` |
| 245 | [pango](https://github.com/gtk-rs/gtk-rs-core) | 0.18.3 | `MIT` |
| 246 | [pango-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | `MIT` |
| 247 | [parking](https://github.com/smol-rs/parking) | 2.2.1 | `Apache-2.0 OR MIT` |
| 248 | [parking_lot](https://github.com/Amanieu/parking_lot) | 0.12.5 | `MIT OR Apache-2.0` |
| 249 | [parking_lot_core](https://github.com/Amanieu/parking_lot) | 0.9.12 | `MIT OR Apache-2.0` |
| 250 | [percent-encoding](https://github.com/servo/rust-url/) | 2.3.2 | `MIT OR Apache-2.0` |
| 251 | [phf](https://github.com/rust-phf/rust-phf) | 0.13.1 | `MIT` |
| 252 | [phf_codegen](https://github.com/rust-phf/rust-phf) | 0.13.1 | `MIT` |
| 253 | [phf_generator](https://github.com/rust-phf/rust-phf) | 0.13.1 | `MIT` |
| 254 | [phf_macros](https://github.com/rust-phf/rust-phf) | 0.13.1 | `MIT` |
| 255 | [phf_shared](https://github.com/rust-phf/rust-phf) | 0.13.1 | `MIT` |
| 256 | [pin-project-lite](https://github.com/taiki-e/pin-project-lite) | 0.2.17 | `Apache-2.0 OR MIT` |
| 257 | [piper](https://github.com/smol-rs/piper) | 0.2.5 | `MIT OR Apache-2.0` |
| 258 | [pkg-config](https://github.com/rust-lang/pkg-config-rs) | 0.3.34 | `MIT OR Apache-2.0` |
| 259 | [plist](https://github.com/ebarnard/rust-plist/) | 1.10.1 | `MIT` |
| 260 | [png](https://github.com/image-rs/image-png) | 0.17.16 | `MIT OR Apache-2.0` |
| 261 | [png](https://github.com/image-rs/image-png) | 0.18.1 | `MIT OR Apache-2.0` |
| 262 | [polling](https://github.com/smol-rs/polling) | 3.11.0 | `Apache-2.0 OR MIT` |
| 263 | [portable-atomic](https://github.com/taiki-e/portable-atomic) | 1.15.0 | `Apache-2.0 OR MIT` |
| 264 | [portable-atomic-util](https://github.com/taiki-e/portable-atomic-util) | 0.2.8 | `Apache-2.0 OR MIT` |
| 265 | [potential_utf](https://github.com/unicode-org/icu4x) | 0.1.6 | `Unicode-3.0` |
| 266 | [powerfmt](https://github.com/jhpratt/powerfmt) | 0.2.0 | `MIT OR Apache-2.0` |
| 267 | [precomputed-hash](https://github.com/emilio/precomputed-hash) | 0.1.1 | `MIT` |
| 268 | [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 1.3.1 | `MIT OR Apache-2.0` |
| 269 | [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 2.0.2 | `MIT OR Apache-2.0` |
| 270 | [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 3.5.0 | `MIT OR Apache-2.0` |
| 271 | [proc-macro-error](https://gitlab.com/CreepySkeleton/proc-macro-error) | 1.0.4 | `MIT OR Apache-2.0` |
| 272 | [proc-macro-error-attr](https://gitlab.com/CreepySkeleton/proc-macro-error) | 1.0.4 | `MIT OR Apache-2.0` |
| 273 | [proc-macro2](https://github.com/dtolnay/proc-macro2) | 1.0.107 | `MIT OR Apache-2.0` |
| 274 | [quick-xml](https://github.com/tafia/quick-xml) | 0.42.0 | `MIT` |
| 275 | [quote](https://github.com/dtolnay/quote) | 1.0.47 | `MIT OR Apache-2.0` |
| 276 | [r-efi](https://github.com/r-efi/r-efi) | 5.3.0 | `MIT OR Apache-2.0 OR LGPL-2.1-or-later` |
| 277 | [r-efi](https://github.com/r-efi/r-efi) | 6.0.0 | `MIT OR Apache-2.0 OR LGPL-2.1-or-later` |
| 278 | [raw-window-handle](https://github.com/rust-windowing/raw-window-handle) | 0.6.2 | `MIT OR Apache-2.0 OR Zlib` |
| 279 | [redox_syscall](https://gitlab.redox-os.org/redox-os/syscall) | 0.5.18 | `MIT` |
| 280 | [redox_users](https://gitlab.redox-os.org/redox-os/users) | 0.5.2 | `MIT` |
| 281 | [ref-cast](https://github.com/dtolnay/ref-cast) | 1.0.27 | `MIT OR Apache-2.0` |
| 282 | [ref-cast-impl](https://github.com/dtolnay/ref-cast) | 1.0.27 | `MIT OR Apache-2.0` |
| 283 | [regex](https://github.com/rust-lang/regex) | 1.13.1 | `MIT OR Apache-2.0` |
| 284 | [regex-automata](https://github.com/rust-lang/regex) | 0.4.18 | `MIT OR Apache-2.0` |
| 285 | [regex-syntax](https://github.com/rust-lang/regex) | 0.8.11 | `MIT OR Apache-2.0` |
| 286 | [reqwest](https://github.com/seanmonstar/reqwest) | 0.13.5 | `MIT OR Apache-2.0` |
| 287 | [ring](https://github.com/briansmith/ring) | 0.17.14 | `Apache-2.0 AND ISC` |
| 288 | [rustc_version](https://github.com/djc/rustc-version-rs) | 0.4.1 | `MIT OR Apache-2.0` |
| 289 | [rustc-hash](https://github.com/rust-lang/rustc-hash) | 2.1.3 | `Apache-2.0 OR MIT` |
| 290 | [rustix](https://github.com/bytecodealliance/rustix) | 1.1.4 | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` |
| 291 | [rustls](https://github.com/rustls/rustls) | 0.23.45 | `Apache-2.0 OR ISC OR MIT` |
| 292 | [rustls-native-certs](https://github.com/rustls/rustls-native-certs) | 0.8.4 | `Apache-2.0 OR ISC OR MIT` |
| 293 | [rustls-pki-types](https://github.com/rustls/pki-types) | 1.15.1 | `MIT OR Apache-2.0` |
| 294 | [rustls-platform-verifier](https://github.com/rustls/rustls-platform-verifier) | 0.7.0 | `MIT OR Apache-2.0` |
| 295 | [rustls-platform-verifier-android](https://github.com/rustls/rustls-platform-verifier) | 0.1.1 | `MIT OR Apache-2.0` |
| 296 | [rustls-webpki](https://github.com/rustls/webpki) | 0.103.15 | `ISC` |
| 297 | [rustversion](https://github.com/dtolnay/rustversion) | 1.0.23 | `MIT OR Apache-2.0` |
| 298 | [same-file](https://github.com/BurntSushi/same-file) | 1.0.6 | `Unlicense/MIT` |
| 299 | [schannel](https://github.com/steffengy/schannel-rs) | 0.1.29 | `MIT` |
| 300 | [schemars](https://github.com/GREsau/schemars) | 0.8.22 | `MIT` |
| 301 | [schemars](https://github.com/GREsau/schemars) | 0.9.0 | `MIT` |
| 302 | [schemars](https://github.com/GREsau/schemars) | 1.2.2 | `MIT` |
| 303 | [schemars_derive](https://github.com/GREsau/schemars) | 0.8.22 | `MIT` |
| 304 | [scopeguard](https://github.com/bluss/scopeguard) | 1.2.0 | `MIT OR Apache-2.0` |
| 305 | [security-framework](https://github.com/kornelski/rust-security-framework) | 3.7.0 | `MIT OR Apache-2.0` |
| 306 | [security-framework-sys](https://github.com/kornelski/rust-security-framework) | 2.17.0 | `MIT OR Apache-2.0` |
| 307 | [selectors](https://github.com/servo/stylo) | 0.36.1 | `MPL-2.0` |
| 308 | [semver](https://github.com/dtolnay/semver) | 1.0.28 | `MIT OR Apache-2.0` |
| 309 | [serde](https://github.com/serde-rs/serde) | 1.0.229 | `MIT OR Apache-2.0` |
| 310 | [serde_core](https://github.com/serde-rs/serde) | 1.0.229 | `MIT OR Apache-2.0` |
| 311 | [serde_derive](https://github.com/serde-rs/serde) | 1.0.229 | `MIT OR Apache-2.0` |
| 312 | [serde_derive_internals](https://github.com/serde-rs/serde) | 0.29.1 | `MIT OR Apache-2.0` |
| 313 | [serde_json](https://github.com/serde-rs/json) | 1.0.151 | `MIT OR Apache-2.0` |
| 314 | [serde_repr](https://github.com/dtolnay/serde-repr) | 0.1.21 | `MIT OR Apache-2.0` |
| 315 | [serde_spanned](https://github.com/toml-rs/toml) | 0.6.9 | `MIT OR Apache-2.0` |
| 316 | [serde_spanned](https://github.com/toml-rs/toml) | 1.1.1 | `MIT OR Apache-2.0` |
| 317 | [serde_with](https://github.com/jonasbb/serde_with/) | 3.23.0 | `MIT OR Apache-2.0` |
| 318 | [serde_with_macros](https://github.com/jonasbb/serde_with/) | 3.23.0 | `MIT OR Apache-2.0` |
| 319 | [serde-untagged](https://github.com/dtolnay/serde-untagged) | 0.1.9 | `MIT OR Apache-2.0` |
| 320 | [serialize-to-javascript](https://github.com/chippers/serialize-to-javascript) | 0.1.2 | `MIT OR Apache-2.0` |
| 321 | [serialize-to-javascript-impl](https://github.com/chippers/serialize-to-javascript) | 0.1.2 | `MIT OR Apache-2.0` |
| 322 | [servo_arc](https://github.com/servo/stylo) | 0.4.3 | `MIT OR Apache-2.0` |
| 323 | [sha2](https://github.com/RustCrypto/hashes) | 0.10.9 | `MIT OR Apache-2.0` |
| 324 | [shlex](https://github.com/comex/rust-shlex) | 2.0.1 | `MIT OR Apache-2.0` |
| 325 | [signal-hook-registry](https://github.com/vorner/signal-hook) | 1.4.8 | `MIT OR Apache-2.0` |
| 326 | [simd_cesu8](https://github.com/seancroach/simd_cesu8) | 1.2.0 | `Apache-2.0 OR MIT` |
| 327 | [simd-adler32](https://github.com/mcountryman/simd-adler32) | 0.3.10 | `MIT` |
| 328 | [simdutf8](https://github.com/rusticstuff/simdutf8) | 0.1.5 | `MIT OR Apache-2.0` |
| 329 | [siphasher](https://github.com/jedisct1/rust-siphash) | 1.0.3 | `MIT/Apache-2.0` |
| 330 | [slab](https://github.com/tokio-rs/slab) | 0.4.12 | `MIT` |
| 331 | [smallvec](https://github.com/servo/rust-smallvec) | 1.16.1 | `MIT OR Apache-2.0` |
| 332 | [socket2](https://github.com/rust-lang/socket2) | 0.6.5 | `MIT OR Apache-2.0` |
| 333 | [softbuffer](https://github.com/rust-windowing/softbuffer) | 0.4.8 | `MIT OR Apache-2.0` |
| 334 | [soup3](https://gitlab.gnome.org/World/Rust/soup3-rs) | 0.5.0 | `MIT` |
| 335 | [soup3-sys](https://gitlab.gnome.org/World/Rust/soup3-rs) | 0.5.0 | `MIT` |
| 336 | [stable_deref_trait](https://github.com/storyyeller/stable_deref_trait) | 1.2.1 | `MIT OR Apache-2.0` |
| 337 | [string_cache](https://github.com/servo/string-cache) | 0.9.0 | `MIT OR Apache-2.0` |
| 338 | [string_cache_codegen](https://github.com/servo/string-cache) | 0.6.1 | `MIT OR Apache-2.0` |
| 339 | [strsim](https://github.com/rapidfuzz/strsim-rs) | 0.11.1 | `MIT` |
| 340 | [subtle](https://github.com/dalek-cryptography/subtle) | 2.6.1 | `BSD-3-Clause` |
| 341 | [swift-rs](https://github.com/Brendonovich/swift-rs) | 1.0.8 | `MIT OR Apache-2.0` |
| 342 | [syn](https://github.com/dtolnay/syn) | 1.0.109 | `MIT OR Apache-2.0` |
| 343 | [syn](https://github.com/dtolnay/syn) | 2.0.119 | `MIT OR Apache-2.0` |
| 344 | [syn](https://github.com/dtolnay/syn) | 3.0.6 | `MIT OR Apache-2.0` |
| 345 | [sync_wrapper](https://github.com/Actyx/sync_wrapper) | 1.0.2 | `Apache-2.0` |
| 346 | [synstructure](https://github.com/mystor/synstructure) | 0.14.0 | `MIT` |
| 347 | [system-configuration](https://github.com/mullvad/system-configuration-rs) | 0.7.0 | `MIT OR Apache-2.0` |
| 348 | [system-configuration-sys](https://github.com/mullvad/system-configuration-rs) | 0.6.0 | `MIT OR Apache-2.0` |
| 349 | [system-deps](https://github.com/gdesmott/system-deps) | 6.2.2 | `MIT OR Apache-2.0` |
| 350 | [tao](https://github.com/tauri-apps/tao) | 0.35.3 | `Apache-2.0` |
| 351 | [tao-macros](https://github.com/tauri-apps/tao) | 0.1.4 | `MIT OR Apache-2.0` |
| 352 | [tar](https://github.com/composefs/tar-rs) | 0.4.46 | `MIT OR Apache-2.0` |
| 353 | [target-lexicon](https://github.com/bytecodealliance/target-lexicon) | 0.12.16 | `Apache-2.0 WITH LLVM-exception` |
| 354 | [tauri](https://github.com/tauri-apps/tauri) | 2.11.5 | `Apache-2.0 OR MIT` |
| 355 | [tauri-build](https://github.com/tauri-apps/tauri) | 2.6.3 | `Apache-2.0 OR MIT` |
| 356 | [tauri-codegen](https://github.com/tauri-apps/tauri) | 2.6.3 | `Apache-2.0 OR MIT` |
| 357 | [tauri-macros](https://github.com/tauri-apps/tauri) | 2.6.3 | `Apache-2.0 OR MIT` |
| 358 | [tauri-plugin](https://github.com/tauri-apps/tauri) | 2.6.3 | `Apache-2.0 OR MIT` |
| 359 | [tauri-plugin-single-instance](https://github.com/tauri-apps/plugins-workspace) | 2.4.4 | `Apache-2.0 OR MIT` |
| 360 | [tauri-plugin-store](https://github.com/tauri-apps/plugins-workspace) | 2.4.3 | `Apache-2.0 OR MIT` |
| 361 | [tauri-plugin-updater](https://github.com/tauri-apps/plugins-workspace) | 2.11.0 | `Apache-2.0 OR MIT` |
| 362 | [tauri-runtime](https://github.com/tauri-apps/tauri) | 2.11.3 | `Apache-2.0 OR MIT` |
| 363 | [tauri-runtime-wry](https://github.com/tauri-apps/tauri) | 2.11.4 | `Apache-2.0 OR MIT` |
| 364 | [tauri-utils](https://github.com/tauri-apps/tauri) | 2.9.3 | `Apache-2.0 OR MIT` |
| 365 | [tauri-winres](https://github.com/tauri-apps/winres) | 0.3.6 | `MIT` |
| 366 | [tempfile](https://github.com/Stebalien/tempfile) | 3.27.0 | `MIT OR Apache-2.0` |
| 367 | [tendril](https://github.com/servo/html5ever) | 0.5.1 | `MIT OR Apache-2.0` |
| 368 | [thiserror](https://github.com/dtolnay/thiserror) | 1.0.69 | `MIT OR Apache-2.0` |
| 369 | [thiserror](https://github.com/dtolnay/thiserror) | 2.0.20 | `MIT OR Apache-2.0` |
| 370 | [thiserror-impl](https://github.com/dtolnay/thiserror) | 1.0.69 | `MIT OR Apache-2.0` |
| 371 | [thiserror-impl](https://github.com/dtolnay/thiserror) | 2.0.20 | `MIT OR Apache-2.0` |
| 372 | [time](https://github.com/time-rs/time) | 0.3.55 | `MIT OR Apache-2.0` |
| 373 | [time-core](https://github.com/time-rs/time) | 0.1.9 | `MIT OR Apache-2.0` |
| 374 | [time-macros](https://github.com/time-rs/time) | 0.2.32 | `MIT OR Apache-2.0` |
| 375 | [tinystr](https://github.com/unicode-org/icu4x) | 0.8.4 | `Unicode-3.0` |
| 376 | [tinyvec](https://github.com/Lokathor/tinyvec) | 1.13.3 | `Zlib OR Apache-2.0 OR MIT` |
| 377 | [tokio](https://github.com/tokio-rs/tokio) | 1.53.1 | `MIT` |
| 378 | [tokio-macros](https://github.com/tokio-rs/tokio) | 2.7.2 | `MIT` |
| 379 | [tokio-rustls](https://github.com/rustls/tokio-rustls) | 0.26.5 | `MIT OR Apache-2.0` |
| 380 | [tokio-util](https://github.com/tokio-rs/tokio) | 0.7.19 | `MIT` |
| 381 | [toml](https://github.com/toml-rs/toml) | 0.8.2 | `MIT OR Apache-2.0` |
| 382 | [toml](https://github.com/toml-rs/toml) | 0.9.12+spec-1.1.0 | `MIT OR Apache-2.0` |
| 383 | [toml](https://github.com/toml-rs/toml) | 1.1.6+spec-1.1.0 | `MIT OR Apache-2.0` |
| 384 | [toml_datetime](https://github.com/toml-rs/toml) | 0.6.3 | `MIT OR Apache-2.0` |
| 385 | [toml_datetime](https://github.com/toml-rs/toml) | 0.7.5+spec-1.1.0 | `MIT OR Apache-2.0` |
| 386 | [toml_datetime](https://github.com/toml-rs/toml) | 1.1.1+spec-1.1.0 | `MIT OR Apache-2.0` |
| 387 | [toml_edit](https://github.com/toml-rs/toml) | 0.19.15 | `MIT OR Apache-2.0` |
| 388 | [toml_edit](https://github.com/toml-rs/toml) | 0.20.2 | `MIT OR Apache-2.0` |
| 389 | [toml_edit](https://github.com/toml-rs/toml) | 0.25.15+spec-1.1.0 | `MIT OR Apache-2.0` |
| 390 | [toml_parser](https://github.com/toml-rs/toml) | 1.1.3+spec-1.1.0 | `MIT OR Apache-2.0` |
| 391 | [toml_writer](https://github.com/toml-rs/toml) | 1.1.2+spec-1.1.0 | `MIT OR Apache-2.0` |
| 392 | [tower](https://github.com/tower-rs/tower) | 0.5.3 | `MIT` |
| 393 | [tower-http](https://github.com/tower-rs/tower-http) | 0.6.11 | `MIT` |
| 394 | [tower-layer](https://github.com/tower-rs/tower) | 0.3.3 | `MIT` |
| 395 | [tower-service](https://github.com/tower-rs/tower) | 0.3.3 | `MIT` |
| 396 | [tracing](https://github.com/tokio-rs/tracing) | 0.1.44 | `MIT` |
| 397 | [tracing-attributes](https://github.com/tokio-rs/tracing) | 0.1.31 | `MIT` |
| 398 | [tracing-core](https://github.com/tokio-rs/tracing) | 0.1.36 | `MIT` |
| 399 | [tray-icon](https://github.com/tauri-apps/tray-icon) | 0.24.2 | `MIT OR Apache-2.0` |
| 400 | [try-lock](https://github.com/seanmonstar/try-lock) | 0.2.5 | `MIT` |
| 401 | [typeid](https://github.com/dtolnay/typeid) | 1.0.3 | `MIT OR Apache-2.0` |
| 402 | [typenum](https://github.com/paholg/typenum) | 1.20.1 | `MIT OR Apache-2.0` |
| 403 | [uds_windows](https://github.com/haraldh/rust_uds_windows) | 1.2.1 | `MIT` |
| 404 | [unic-char-property](https://github.com/open-i18n/rust-unic/) | 0.9.0 | `MIT/Apache-2.0` |
| 405 | [unic-char-range](https://github.com/open-i18n/rust-unic/) | 0.9.0 | `MIT/Apache-2.0` |
| 406 | [unic-common](https://github.com/open-i18n/rust-unic/) | 0.9.0 | `MIT/Apache-2.0` |
| 407 | [unic-ucd-ident](https://github.com/open-i18n/rust-unic/) | 0.9.0 | `MIT/Apache-2.0` |
| 408 | [unic-ucd-version](https://github.com/open-i18n/rust-unic/) | 0.9.0 | `MIT/Apache-2.0` |
| 409 | [unicode-ident](https://github.com/dtolnay/unicode-ident) | 1.0.26 | `(MIT OR Apache-2.0) AND Unicode-3.0` |
| 410 | [unicode-segmentation](https://github.com/unicode-rs/unicode-segmentation) | 1.13.3 | `MIT OR Apache-2.0` |
| 411 | [untrusted](https://github.com/briansmith/untrusted) | 0.9.0 | `ISC` |
| 412 | [url](https://github.com/servo/rust-url) | 2.5.8 | `MIT OR Apache-2.0` |
| 413 | [urlpattern](https://github.com/denoland/rust-urlpattern) | 0.3.0 | `MIT` |
| 414 | [utf8_iter](https://github.com/hsivonen/utf8_iter) | 1.0.4 | `Apache-2.0 OR MIT` |
| 415 | [uuid](https://github.com/uuid-rs/uuid) | 1.26.1 | `Apache-2.0 OR MIT` |
| 416 | [version_check](https://github.com/SergioBenitez/version_check) | 0.9.5 | `MIT/Apache-2.0` |
| 417 | [version-compare](https://gitlab.com/timvisee/version-compare) | 0.2.1 | `MIT` |
| 418 | [vswhom](https://github.com/nabijaczleweli/vswhom.rs) | 0.1.0 | `MIT` |
| 419 | [vswhom-sys](https://github.com/nabijaczleweli/vswhom-sys.rs) | 0.1.3 | `MIT` |
| 420 | [walkdir](https://github.com/BurntSushi/walkdir) | 2.5.0 | `Unlicense/MIT` |
| 421 | [want](https://github.com/seanmonstar/want) | 0.3.1 | `MIT` |
| 422 | [wasi](https://github.com/bytecodealliance/wasi) | 0.11.1+wasi-snapshot-preview1 | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` |
| 423 | [wasip2](https://github.com/bytecodealliance/wasi-rs) | 1.0.4+wasi-0.2.12 | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` |
| 424 | [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) | 0.2.128 | `MIT OR Apache-2.0` |
| 425 | [wasm-bindgen-futures](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures) | 0.4.78 | `MIT OR Apache-2.0` |
| 426 | [wasm-bindgen-macro](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro) | 0.2.128 | `MIT OR Apache-2.0` |
| 427 | [wasm-bindgen-macro-support](https://github.com/wasm-bindgen/wasm-bindgen/tree/main/crates/macro-support) | 0.2.128 | `MIT OR Apache-2.0` |
| 428 | [wasm-bindgen-shared](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared) | 0.2.128 | `MIT OR Apache-2.0` |
| 429 | [wasm-streams](https://github.com/MattiasBuelens/wasm-streams/) | 0.5.0 | `MIT OR Apache-2.0` |
| 430 | [web_atoms](https://github.com/servo/html5ever) | 0.2.6 | `MIT OR Apache-2.0` |
| 431 | [web-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys) | 0.3.105 | `MIT OR Apache-2.0` |
| 432 | [webkit2gtk](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | `MIT` |
| 433 | [webkit2gtk-sys](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | `MIT` |
| 434 | [webpki-root-certs](https://github.com/rustls/webpki-roots) | 1.0.9 | `CDLA-Permissive-2.0` |
| 435 | [webview2-com](https://github.com/wravery/webview2-rs) | 0.38.2 | `MIT` |
| 436 | [webview2-com-macros](https://github.com/wravery/webview2-rs) | 0.8.1 | `MIT` |
| 437 | [webview2-com-sys](https://github.com/wravery/webview2-rs) | 0.38.2 | `MIT` |
| 438 | [winapi](https://github.com/retep998/winapi-rs) | 0.3.9 | `MIT/Apache-2.0` |
| 439 | [winapi-i686-pc-windows-gnu](https://github.com/retep998/winapi-rs) | 0.4.0 | `MIT/Apache-2.0` |
| 440 | [winapi-util](https://github.com/BurntSushi/winapi-util) | 0.1.11 | `Unlicense OR MIT` |
| 441 | [winapi-x86_64-pc-windows-gnu](https://github.com/retep998/winapi-rs) | 0.4.0 | `MIT/Apache-2.0` |
| 442 | [window-vibrancy](https://github.com/tauri-apps/tauri-plugin-vibrancy) | 0.6.0 | `Apache-2.0 OR MIT` |
| 443 | [windows](https://github.com/microsoft/windows-rs) | 0.61.3 | `MIT OR Apache-2.0` |
| 444 | [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 445 | [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 446 | [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 447 | [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 448 | [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 449 | [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 450 | [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 451 | [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 452 | [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 453 | [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 454 | [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 455 | [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 456 | [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 457 | [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 458 | [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 459 | [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 460 | [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 461 | [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 462 | [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 463 | [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 464 | [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 465 | [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 466 | [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | `MIT OR Apache-2.0` |
| 467 | [windows-collections](https://github.com/microsoft/windows-rs) | 0.2.0 | `MIT OR Apache-2.0` |
| 468 | [windows-core](https://github.com/microsoft/windows-rs) | 0.61.2 | `MIT OR Apache-2.0` |
| 469 | [windows-core](https://github.com/microsoft/windows-rs) | 0.62.2 | `MIT OR Apache-2.0` |
| 470 | [windows-future](https://github.com/microsoft/windows-rs) | 0.2.1 | `MIT OR Apache-2.0` |
| 471 | [windows-implement](https://github.com/microsoft/windows-rs) | 0.60.2 | `MIT OR Apache-2.0` |
| 472 | [windows-interface](https://github.com/microsoft/windows-rs) | 0.59.3 | `MIT OR Apache-2.0` |
| 473 | [windows-link](https://github.com/microsoft/windows-rs) | 0.1.3 | `MIT OR Apache-2.0` |
| 474 | [windows-link](https://github.com/microsoft/windows-rs) | 0.2.1 | `MIT OR Apache-2.0` |
| 475 | [windows-numerics](https://github.com/microsoft/windows-rs) | 0.2.0 | `MIT OR Apache-2.0` |
| 476 | [windows-registry](https://github.com/microsoft/windows-rs) | 0.6.1 | `MIT OR Apache-2.0` |
| 477 | [windows-result](https://github.com/microsoft/windows-rs) | 0.3.4 | `MIT OR Apache-2.0` |
| 478 | [windows-result](https://github.com/microsoft/windows-rs) | 0.4.1 | `MIT OR Apache-2.0` |
| 479 | [windows-strings](https://github.com/microsoft/windows-rs) | 0.4.2 | `MIT OR Apache-2.0` |
| 480 | [windows-strings](https://github.com/microsoft/windows-rs) | 0.5.1 | `MIT OR Apache-2.0` |
| 481 | [windows-sys](https://github.com/microsoft/windows-rs) | 0.45.0 | `MIT OR Apache-2.0` |
| 482 | [windows-sys](https://github.com/microsoft/windows-rs) | 0.52.0 | `MIT OR Apache-2.0` |
| 483 | [windows-sys](https://github.com/microsoft/windows-rs) | 0.59.0 | `MIT OR Apache-2.0` |
| 484 | [windows-sys](https://github.com/microsoft/windows-rs) | 0.60.2 | `MIT OR Apache-2.0` |
| 485 | [windows-sys](https://github.com/microsoft/windows-rs) | 0.61.2 | `MIT OR Apache-2.0` |
| 486 | [windows-targets](https://github.com/microsoft/windows-rs) | 0.42.2 | `MIT OR Apache-2.0` |
| 487 | [windows-targets](https://github.com/microsoft/windows-rs) | 0.52.6 | `MIT OR Apache-2.0` |
| 488 | [windows-targets](https://github.com/microsoft/windows-rs) | 0.53.5 | `MIT OR Apache-2.0` |
| 489 | [windows-threading](https://github.com/microsoft/windows-rs) | 0.1.0 | `MIT OR Apache-2.0` |
| 490 | [windows-version](https://github.com/microsoft/windows-rs) | 0.1.7 | `MIT OR Apache-2.0` |
| 491 | [winnow](https://github.com/winnow-rs/winnow) | 0.5.40 | `MIT` |
| 492 | [winnow](https://github.com/winnow-rs/winnow) | 0.7.15 | `MIT` |
| 493 | [winnow](https://github.com/winnow-rs/winnow) | 1.0.4 | `MIT` |
| 494 | [winreg](https://github.com/gentoo90/winreg-rs) | 0.55.0 | `MIT` |
| 495 | [wit-bindgen](https://github.com/bytecodealliance/wit-bindgen) | 0.57.1 | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` |
| 496 | [writeable](https://github.com/unicode-org/icu4x) | 0.6.4 | `Unicode-3.0` |
| 497 | [wry](https://github.com/tauri-apps/wry) | 0.55.1 | `Apache-2.0 OR MIT` |
| 498 | [x11](https://github.com/AltF02/x11-rs.git) | 2.21.0 | `MIT` |
| 499 | [x11-dl](https://github.com/AltF02/x11-rs.git) | 2.21.0 | `MIT` |
| 500 | [xattr](https://github.com/Stebalien/xattr) | 1.6.1 | `MIT OR Apache-2.0` |
| 501 | [yoke](https://github.com/unicode-org/icu4x) | 0.8.3 | `Unicode-3.0` |
| 502 | [yoke-derive](https://github.com/unicode-org/icu4x) | 0.8.3 | `Unicode-3.0` |
| 503 | [zbus](https://github.com/z-galaxy/zbus/) | 5.19.0 | `MIT` |
| 504 | [zbus_macros](https://github.com/z-galaxy/zbus/) | 5.19.0 | `MIT` |
| 505 | [zbus_names](https://github.com/z-galaxy/zbus/) | 4.3.4 | `MIT` |
| 506 | [zcheapstr](https://github.com/z-galaxy/zcheapstr/) | 1.1.0 | `MIT` |
| 507 | [zerofrom](https://github.com/unicode-org/icu4x) | 0.1.8 | `Unicode-3.0` |
| 508 | [zerofrom-derive](https://github.com/unicode-org/icu4x) | 0.1.8 | `Unicode-3.0` |
| 509 | [zeroize](https://github.com/RustCrypto/utils) | 1.9.0 | `Apache-2.0 OR MIT` |
| 510 | [zerotrie](https://github.com/unicode-org/icu4x) | 0.2.5 | `Unicode-3.0` |
| 511 | [zerovec](https://github.com/unicode-org/icu4x) | 0.11.8 | `Unicode-3.0` |
| 512 | [zerovec-derive](https://github.com/unicode-org/icu4x) | 0.11.6 | `Unicode-3.0` |
| 513 | [zip](https://github.com/zip-rs/zip2.git) | 4.6.1 | `MIT` |
| 514 | [zlib-rs](https://github.com/trifectatechfoundation/zlib-rs) | 0.6.8 | `Zlib` |
| 515 | [zmij](https://github.com/dtolnay/zmij) | 1.0.23 | `MIT` |
| 516 | [zvariant](https://github.com/z-galaxy/zbus/) | 5.15.0 | `MIT` |
| 517 | [zvariant_derive](https://github.com/z-galaxy/zbus/) | 5.15.0 | `MIT` |
| 518 | [zvariant_utils](https://github.com/z-galaxy/zbus/) | 4.2.0 | `MIT` |


---

## 2. VacuumTube reference copy

**สรุป:** โฟลเดอร์ `reference/vacuumtube/` เก็บซอร์สของโปรเจกต์ VacuumTube (ต้นทาง
`https://github.com/shy1132/VacuumTube`, baseline `v1.8.2` / commit `4dd3ee4`) ไว้เป็นข้อมูล
อ้างอิงพฤติกรรม/fallback เท่านั้น ไม่ใช่ส่วนหนึ่งของ build output ของ Lalin Cast โค้ดนี้อยู่ภายใต้
สัญญาอนุญาต MIT ของผู้เขียนเดิม (ชื่อผู้ใช้ "shy") ซึ่งคัดลอกข้อความเต็มไว้ด้านล่างตามเงื่อนไขของ
สัญญาอนุญาต MIT (ต้องแนบข้อความสัญญาอนุญาตและประกาศลิขสิทธิ์ไว้ในทุกสำเนา) โค้ด Rust/Tauri ของ
Lalin Cast เองไม่ได้คัดลอกโมดูล DOM ของ VacuumTube มาใช้ (ดู `LALIN_PROVENANCE.md`)

The `reference/vacuumtube/` directory retains a copy of the VacuumTube project (upstream
`https://github.com/shy1132/VacuumTube`, baseline `v1.8.2` / commit `4dd3ee4`) purely as a
behavior reference and fallback; it is not part of the Lalin Cast Rust/Tauri build output. It is
distributed under the MIT License of its original author (username "shy"). The full, unmodified
license text from `reference/vacuumtube/LICENSE` is reproduced below, as the MIT License requires
the license text and copyright notice to accompany every copy of the software:

```
MIT License

Copyright (c) 2025-2026 shy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

VacuumTube itself may declare further third-party notices for its own JavaScript dependencies
(see `reference/vacuumtube/package.json`); those are internal to the reference copy and are not
re-enumerated here because they do not ship inside the Lalin Cast Rust/Tauri binary. Do not remove
`reference/vacuumtube/LICENSE` while `reference/vacuumtube/` remains part of this repository.

---

## 3. Tauri framework and Microsoft Edge WebView2 runtime

**สรุป:** เฟรมเวิร์ก Tauri v2 (ตัว runtime ของแอป, ไม่ใช่ crate dependency แต่ละตัวที่แยกอยู่ในตาราง
ข้อ 1 อยู่แล้ว) อยู่ภายใต้สัญญาอนุญาตคู่ MIT/Apache-2.0 เจ้าของคือ Tauri Programme within the
Commons Conservancy Lalin Cast ไม่ได้แนบตัวติดตั้ง WebView2 runtime มาเอง — Tauri จะเรียกใช้
Microsoft Edge WebView2 runtime ที่ติดตั้งอยู่ในเครื่อง Windows ของผู้ใช้อยู่แล้ว (หรือดาวน์โหลดผ่าน
bootstrapper ของ Microsoft ตอนติดตั้งถ้ายังไม่มี) การใช้งาน WebView2 runtime อยู่ภายใต้เงื่อนไขของ
Microsoft แยกต่างหาก ไม่ใช่สัญญาอนุญาตโอเพนซอร์สของ Lalin Cast

- **Tauri** (`tauri`, `tauri-build`, `tauri-plugin-single-instance`, `tauri-plugin-store`,
  `tauri-plugin-updater`, and related `tauri-*` crates) is dual-licensed **MIT OR Apache-2.0**,
  copyright the Tauri Programme within The Commons Conservancy and contributors. Each `tauri-*`
  crate's exact SPDX expression is listed in the table in section 1.
- **Microsoft Edge WebView2 runtime**: Lalin Cast does not vendor or redistribute the WebView2
  runtime binary. At runtime, Tauri loads whichever WebView2 runtime is already installed on the
  Windows system it runs on (Windows 11 ships it by default; on Windows 10 without it, the NSIS
  installer produced by `cargo tauri build` can invoke Microsoft's WebView2 bootstrapper to fetch
  it). Use of the WebView2 runtime is governed by Microsoft's own license terms for WebView2, not
  by any Lalin Cast or Tauri license.

---

## 4. DIAL protocol notice

**สรุป:** Lalin Cast มีโค้ด Rust ของตัวเอง (`src-tauri/src/dial.rs`) ที่ implement โปรโตคอล DIAL
(DIscovery And Launch) ตามสเปกที่เผยแพร่สาธารณะ เพื่อให้แอป YouTube บนมือถือค้นหาเจอ Lalin Cast บน
เครือข่ายเดียวกันและส่งคำสั่งเปิดหน้า YouTube ได้ ผ่าน DIAL ซึ่งเป็นโปรโตคอลเปิดของตัวเอง
โปรโตคอล DIAL พัฒนาร่วมกันโดย Netflix, Inc. และ YouTube และเผยแพร่ผ่าน DIAL Multi-Screen Alliance
โดย Netflix, Inc. เป็นผู้ถือลิขสิทธิ์สเปกและเครื่องหมาย "DIAL" โค้ดของ Lalin Cast ในไฟล์นี้เป็นงาน
เขียนขึ้นเองทั้งหมด ไม่ได้คัดลอกหรือ derive จาก dial-reference ของ Netflix และไม่ได้ฝัง binary หรือ
ซอร์สของ Netflix เข้ามาในแอป

DIAL (DIscovery And Launch) is its own open, local-network device-discovery and app-launch
protocol, co-developed by Netflix, Inc. and YouTube and published by the DIAL Multi-Screen
Alliance. It is what lets the YouTube mobile app discover Lalin Cast on the same network and hand
it a video to open. Lalin Cast's HTTP/SSDP responder that implements this protocol
(`src-tauri/src/dial.rs`) is Lalin's own original Rust implementation of the publicly published
DIAL specification; it contains no source code or binary from Netflix's `dial-reference`
implementation and is not a redistribution of the DIAL Specification document itself.

Per the DIAL Specification's published terms, an implementer that ships a binary implementation of
the specification is required to reproduce the specification's copyright notice in the product's
accompanying documentation. In that spirit, this notice records the following, assembled in good
faith from the publicly stated DIAL copyright and mark-usage terms at
`https://www.dial-multiscreen.org/dial/faq` and
`https://www.dial-multiscreen.org/dial/use-of-the-dial-mark`:

> The DIAL protocol and the DIAL Specification are Copyright 2012 Netflix, Inc. All rights
> reserved. The "DIAL" mark is owned by Netflix, Inc. Use of the DIAL mark or specification does
> not imply that Netflix or YouTube is affiliated with, sponsoring, endorsing, or certifying Lalin
> Cast.

This paraphrase is not a verbatim reproduction of the DIAL Specification document itself (Lalin
Cast does not have redistribution rights to reproduce that document verbatim here). Before a
public release, whoever completes human gate **H1** in
`docs/plans/H0_RELEASE_READINESS_PLAN.md` should compare this notice against the current text of
the DIAL Specification published by the DIAL Multi-Screen Alliance and adjust the wording above if
the specification's own required notice text differs from this paraphrase.

---

## 5. Trademarks

**สรุป:** "YouTube", "Google", "Cobalt" และเครื่องหมายการค้าอื่นใดที่กล่าวถึงในโปรเจกต์นี้ (เช่นใน
User-Agent string) เป็นทรัพย์สินของเจ้าของแต่ละราย Lalin Cast ไม่มีความเกี่ยวข้อง ไม่ได้รับการ
รับรอง และไม่ได้เป็นส่วนหนึ่งของเจ้าของเครื่องหมายเหล่านั้น ชื่อ "Lalin" และ "Lalin Cast" เป็นชื่อของ
โปรเจกต์นี้เอง

"YouTube", "Google", and "Cobalt" (referenced in this project's Leanback-compatible User-Agent
string) are trademarks of their respective owners. Lalin Cast is an independent project with no
affiliation to, sponsorship from, or endorsement by the owners of those marks. "Lalin" and "Lalin
Cast" are this project's own names. See `TERMS.md` for the full relationship disclaimer.

---

## 6. How this file is generated

**สรุป:** ส่วนตารางในข้อ 1 สร้างจากคำสั่งด้านล่างนี้ ถ้าต้องอัปเดต ให้รันคำสั่งเดิมซ้ำแล้วสร้างตาราง
ใหม่ เมื่อ `src-tauri/Cargo.lock` เปลี่ยน (เพิ่ม/ลบ/อัปเดต dependency)

Section 1's table is generated from `src-tauri/Cargo.lock` via:

```
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1
```

reading each package's declared `license` (SPDX expression) and `repository` fields. If
`cargo metadata` cannot reach the network/registry, the license for an affected crate can instead
be read directly from that crate's vendored manifest under
`%USERPROFILE%\.cargo\registry\src\*\<name>-<version>\Cargo.toml`. Regenerate this section
whenever `src-tauri/Cargo.lock` changes (dependency added, removed, or upgraded) so the list stays
in sync with what actually ships.
