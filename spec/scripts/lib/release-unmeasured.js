'use strict'
// lib/release-unmeasured.js — the ONE derivation of "this release leg row measured nothing",
// judged from a row's typed `observed` object alone, never its `exit` (an unmeasured leg is
// always exit 0 today — that is the whole failure mode this spec closes). verdict.js's release-
// profile derive() and release-legs.js stage's summary both `require` this module; neither
// re-derives, so the ledger's word and the printed summary can never disagree about what
// silence looks like. specs/20260913/08-silence-is-not-a-pass.md D1 (AC-20260913-08-1).
//
// Judged shapes: a `ci` row whose `observed.unavailable` is a string (no-adapter, sha-unseen,
// any future value) -> `ci:unavailable:<value>`; a `ci` row whose `observed.status ===
// 'in-progress'` -> `ci:in-progress`; a `production` row whose `observed.result === 'skipped'`
// -> `production:skipped`; a `substrate` row whose `observed.checked - observed.inert === 0`
// (every check declared inert, nothing actually ran) -> `substrate:nothing-executed`. Every
// other row, including a fully-typed measured row of any leg and an `e2e` row whose nested
// `skipped` slot carries `{"unavailable":"no-format-declared"}` (governed by `executed` at
// append time already, specs/20260908/05), derives `null`.
//
// Does NOT: read `row.exit` (a row's exit code is a separate, unchanged contract — D3/D4 of
// this spec reuse today's exit-0 rows verbatim); judge any leg not named above (deploy, ready,
// e2e, journeys never derive unmeasured); store or print anything — this is a pure function.
//
// Exit codes: n/a (library, no CLI surface).

function unmeasuredReason(row) {
  const leg = row && row.leg
  const observed = (row && row.observed) || {}
  if (leg === 'ci') {
    if (typeof observed.unavailable === 'string') return 'ci:unavailable:' + observed.unavailable
    if (observed.status === 'in-progress') return 'ci:in-progress'
    return null
  }
  if (leg === 'production') {
    if (observed.result === 'skipped') return 'production:skipped'
    return null
  }
  if (leg === 'substrate') {
    if (typeof observed.checked === 'number' && typeof observed.inert === 'number' &&
        observed.checked - observed.inert === 0) {
      return 'substrate:nothing-executed'
    }
    return null
  }
  return null
}

module.exports = { unmeasuredReason }
