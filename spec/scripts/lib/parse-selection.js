'use strict'
// lib/parse-selection.js — the sole parser for replay.js --select's stdout line, shared so
// spec-review-driver.js's REPLAY entry and this module's own direct tests exercise the identical
// regex instead of two copies drifting apart.
//
// specs/20260823/09-replay-baseline-attribution.md D6 (2026-08-23): replay.js --select gained two
// tokens (baselineRed=/baselineLegs=) appended after the five this parser already read — the
// baseline step 7 attributes red legs against. Captured OPTIONALLY (each group's own trailing
// `?`, matching only when the literal key= is present) so a five-token line from an old sidecar
// resumed mid-flight against a pre-D1 replay.js still parses cleanly: absent -> null, never a
// parse failure (AC-8).
//
// Escaped from spec-review-driver.js's own review (2026-08-24): the driver's REPLAY-path test for
// AC-8 drove the real replay.js binary, which (line 340) always prints both baselineRed=/
// baselineLegs= tokens as VALUES (never omits the keys) — so no fixture reachable through that
// path can ever produce a genuine five-token line, and the absence branch this function's `|| null`
// exists for went unexercised by any test. Extracting the regex here lets a direct test hand it a
// hand-built five-token string and prove the fallback, instead of relying on an exec fixture that
// structurally cannot produce one.
//
// What this deliberately does NOT do: read replay.js's stdout itself (callers pass the string
// they already captured), or validate the five required fields' shapes beyond "non-whitespace" —
// that's the caller's concern once it has the parsed object.
//
// Exit codes: n/a (library, not an entrypoint).

// The parsed selection line, or null when `out` doesn't match at all. baselineRed/baselineLegs
// are null when their tokens are absent from `out` (pre-D1 replay.js, or a five-token line built
// by hand) — never a parse failure; only the five required fields are non-optional in the regex.
function parseSelection(out) {
  const m = /spec=(\S+)\s+reviewRunId=(\S+)\s+commit=(\S+)\s+parent=(\S+)\s+diffBase=(\S+)(?:\s+baselineRed=(\S+))?(?:\s+baselineLegs=(\S+))?/.exec(out)
  if (!m) return null
  return {
    spec: m[1], reviewRunId: m[2], commit: m[3], parent: m[4], diffBase: m[5],
    baselineRed: m[6] || null, baselineLegs: m[7] || null,
  }
}

module.exports = { parseSelection }
