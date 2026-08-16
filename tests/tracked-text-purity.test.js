'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT } = require('./helpers')

// JJ-20260816-01 (2026-08-16, tracked-text purity): every git-tracked file must be free of raw
// NUL (0x00) bytes. Two incidents, one class, both from a correct in-memory NUL delimiter
// spelled as the raw byte instead of the escape '\x00' (behaviorally identical in JS source):
//   - spec/scripts/fidelity-check.js grew a raw NUL at byte 8449; BSD grep thereafter
//     classified the file binary and returned SILENT exit-1 "no matches" on four real
//     `spec.config.json` hits — including hits BEFORE the byte — which mismeasured spec
//     20260815/01's plan-time census (Assumption A2) and forced the mid-build D10 amendment
//     (specs/20260815/01-recurrence-carriers.md, D10).
//   - spec/scripts/advisory-append.js, authored by that same spec's own build, independently
//     reproduced the idiom the same day (raw NULs at bytes 6407/6420) — inside git's ~8KB
//     binary sniff window, so the review commit 32d7b86's diffstat rendered a pure-JavaScript
//     source file as `Bin 7858 -> 7742 bytes`, binary-blinding the review diff for exactly the
//     file it infected. The same idiom past the window (fidelity-check.js) stays "text" to
//     git: tool visibility is byte-offset-dependent, so no consumer-side habit can close the
//     class. The exposure (ad-hoc model sweeps run from command prose) is an unbounded
//     consumer set; "tracked text is pure text" is one finite producer-side check. This pin is
//     that check.
//
// What this pin deliberately does NOT do:
//   - No allowlist in v1. Measured 2026-08-16: zero binary files are tracked (all 18
//     tests/fixtures files are pure text), so an allowlist would be dead code inviting
//     exemptions. The first deliberately-binary tracked fixture creates one here, in this
//     file, with itself as the justifying evidence.
//   - No ban on NUL delimiters in memory — the technique is correct (NUL is the one byte
//     joined user data cannot contain); '\x00' is the repo's one sanctioned spelling.
//   - No bytes beyond 0x00. Widen only on a measured tool-misread incident involving another
//     byte, per the scaffold-ledger evidence-only widening rule.
//   - No untracked files: scratch, worktrees, and node_modules are out of scope by
//     construction of `git ls-files`.

test('JJ-20260816-01: no git-tracked file contains a raw NUL (0x00) byte — one raw NUL makes BSD grep silently report the whole file clean, and inside git\'s ~8KB sniff window flips the review diff to Bin', () => {
  const listing = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  const tracked = listing.split('\x00').filter(Boolean)
  assert.ok(tracked.length > 0,
    'git ls-files returned zero tracked files — this pin scanned nothing, and a green verdict ' +
    'over an empty scan would be vacuous; run the suite from a git checkout of the repo')

  const offenders = []
  for (const rel of tracked) {
    let buf
    try { buf = fs.readFileSync(path.join(ROOT, rel)) }
    catch { continue } // tracked but absent from the working tree — a git-status concern, not a purity one
    const at = buf.indexOf(0)
    if (at !== -1) offenders.push(rel + ' (first NUL at byte ' + at + ')')
  }

  assert.deepStrictEqual(offenders, [],
    'raw NUL byte(s) found in tracked files. Respell the in-memory delimiter as the escape ' +
    "'\\x00' — behaviorally identical in JS, and the repo's one sanctioned spelling (set by " +
    'the 20260815/01 review fix to advisory-append.js:119). A raw 0x00 makes BSD grep return ' +
    'silent exit-1 "clean" on files with real matches (the spec 20260815/01 A2 census miss, ' +
    "amended as D10) and, inside git's ~8KB sniff window, renders the file's review diff as " +
    'Bin (commit 32d7b86). If a file is a deliberately binary fixture, create the allowlist ' +
    'HERE in this test with a justification comment — none exists yet because none has ever ' +
    'been needed.')
})
