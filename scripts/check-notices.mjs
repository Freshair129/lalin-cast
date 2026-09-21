#!/usr/bin/env node
// scripts/check-notices.mjs
//
// Plain Node, zero dependencies. Compares the crate (name, version) pairs
// recorded in `src-tauri/Cargo.lock` against the ones listed in the full
// package table of `THIRD_PARTY_NOTICES.md`, in both directions, and fails
// (exit 1) the moment the two disagree.
//
// Wave 9 (docs/plans/W9_SUPPORTABILITY_PLAN.md, stream U3, contract 5):
// this exists because tauri-plugin-store 2.4.3 -> 2.4.5 (Dependabot) landed
// on `main` without THIRD_PARTY_NOTICES.md being updated, and nothing in CI
// caught it -- it had to be fixed after the fact in a follow-up PR (#12).
// `cargo-deny` in the `supply-chain` CI job checks license *policy* against
// Cargo.lock; it has no idea our notices file exists. This script closes
// that gap.
//
// Usage:
//   node scripts/check-notices.mjs [lockfilePath] [noticesPath]
//
// Both arguments are optional and default to the real repository files,
// resolved relative to the current working directory (the CI job runs this
// from the repo root). Explicit paths are accepted so the script can also
// be pointed at copies -- e.g. for the "does this actually catch a
// mismatch" rehearsal described in the wave 9 plan, which must never touch
// the real files.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_LOCKFILE = "src-tauri/Cargo.lock";
const DEFAULT_NOTICES = "THIRD_PARTY_NOTICES.md";

const LALIN_CAST_CRATE_NAME = "lalin-cast";

/**
 * Parses every `[[package]]` block of a Cargo.lock file into a Map of
 * "name@version" -> { name, version }, excluding the lalin-cast crate
 * itself (that is this application's own code, not a third-party
 * dependency, and is intentionally absent from THIRD_PARTY_NOTICES.md).
 *
 * @param {string} text raw file contents (any line-ending style)
 * @returns {Map<string, {name: string, version: string}>}
 */
function parseCargoLock(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\[\[package\]\]\n/).slice(1);
  const pairs = new Map();

  for (const block of blocks) {
    const nameMatch = block.match(/^name = "([^"]+)"/m);
    const versionMatch = block.match(/^version = "([^"]+)"/m);
    if (!nameMatch || !versionMatch) {
      continue;
    }
    const name = nameMatch[1];
    const version = versionMatch[1];
    if (name === LALIN_CAST_CRATE_NAME) {
      continue;
    }
    pairs.set(`${name}@${version}`, { name, version });
  }

  return pairs;
}

/**
 * Parses the "Full package list" table of THIRD_PARTY_NOTICES.md into the
 * same "name@version" -> { name, version } shape as parseCargoLock.
 *
 * Table rows look like:
 *   | 1 | [adler2](https://github.com/oyvindln/adler2) | 2.0.1 | `0BSD OR MIT OR Apache-2.0` |
 * but a handful of crates have no upstream repository link recorded, so
 * their Crate column is plain text with no markdown link at all:
 *   | 201 | libappindicator | 0.9.0 | `Apache-2.0 OR MIT` |
 * Both forms are handled.
 *
 * @param {string} text raw file contents (any line-ending style)
 * @returns {Map<string, {name: string, version: string}>}
 */
function parseNotices(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const pairs = new Map();

  // Matches a numbered table row: | <int> | <crate cell> | <version> | <license> |
  const rowPattern = /^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/;
  // Matches the linked form of the crate cell: [name](url)
  const linkPattern = /^\[([^\]]+)\]\([^)]*\)$/;

  for (const line of lines) {
    const rowMatch = line.match(rowPattern);
    if (!rowMatch) {
      continue;
    }
    const crateCell = rowMatch[1];
    const version = rowMatch[2];

    const linkMatch = crateCell.match(linkPattern);
    const name = linkMatch ? linkMatch[1] : crateCell;

    if (!name || !version) {
      continue;
    }
    pairs.set(`${name}@${version}`, { name, version });
  }

  return pairs;
}

function formatEntry({ name, version }) {
  return `${name}@${version}`;
}

function main() {
  const argLock = process.argv[2];
  const argNotices = process.argv[3];

  const lockfilePath = resolve(process.cwd(), argLock || DEFAULT_LOCKFILE);
  const noticesPath = resolve(process.cwd(), argNotices || DEFAULT_NOTICES);

  let lockText;
  let noticesText;
  try {
    lockText = readFileSync(lockfilePath, "utf8");
  } catch (err) {
    console.error(`check-notices: cannot read lockfile at ${lockfilePath}: ${err.message}`);
    process.exit(1);
  }
  try {
    noticesText = readFileSync(noticesPath, "utf8");
  } catch (err) {
    console.error(`check-notices: cannot read notices file at ${noticesPath}: ${err.message}`);
    process.exit(1);
  }

  const lockPairs = parseCargoLock(lockText);
  const noticesPairs = parseNotices(noticesText);

  // In Cargo.lock but missing from THIRD_PARTY_NOTICES.md.
  const missingFromNotices = [];
  for (const [key, entry] of lockPairs) {
    if (!noticesPairs.has(key)) {
      missingFromNotices.push(entry);
    }
  }

  // In THIRD_PARTY_NOTICES.md but not (or no longer) in Cargo.lock.
  const missingFromLock = [];
  for (const [key, entry] of noticesPairs) {
    if (!lockPairs.has(key)) {
      missingFromLock.push(entry);
    }
  }

  missingFromNotices.sort((a, b) => formatEntry(a).localeCompare(formatEntry(b)));
  missingFromLock.sort((a, b) => formatEntry(a).localeCompare(formatEntry(b)));

  console.log(`check-notices: lockfile   ${lockfilePath}`);
  console.log(`check-notices: notices    ${noticesPath}`);
  console.log(`check-notices: Cargo.lock package entries (excluding lalin-cast): ${lockPairs.size}`);
  console.log(`check-notices: THIRD_PARTY_NOTICES.md table entries: ${noticesPairs.size}`);

  if (missingFromNotices.length === 0 && missingFromLock.length === 0) {
    console.log(
      `check-notices: OK -- ${lockPairs.size} entries agree in both directions between ` +
        "Cargo.lock and THIRD_PARTY_NOTICES.md",
    );
    process.exit(0);
  }

  if (missingFromNotices.length > 0) {
    console.log("");
    console.log(
      `check-notices: MISSING FROM THIRD_PARTY_NOTICES.md (${missingFromNotices.length}) -- ` +
        "in Cargo.lock but not listed in the notices table:",
    );
    for (const entry of missingFromNotices) {
      console.log(`  - ${formatEntry(entry)}`);
    }
  }

  if (missingFromLock.length > 0) {
    console.log("");
    console.log(
      `check-notices: MISSING FROM Cargo.lock (${missingFromLock.length}) -- ` +
        "listed in THIRD_PARTY_NOTICES.md but not (or no longer) in Cargo.lock:",
    );
    for (const entry of missingFromLock) {
      console.log(`  - ${formatEntry(entry)}`);
    }
  }

  console.log("");
  console.log(
    `check-notices: FAIL -- ${missingFromNotices.length} missing from notices, ` +
      `${missingFromLock.length} missing from lockfile`,
  );
  process.exit(1);
}

main();
