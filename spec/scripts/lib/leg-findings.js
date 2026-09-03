'use strict'
// lib/leg-findings.js — the ONE derivation of how many findings a red non-blocking manifest row
// contributes to the review's disposition pool. verdict.js sums it into `legFindings` (the
// undispositioned arithmetic that derives CLEAN vs HARD_FINDINGS); spec-review-driver.js weighs
// each `leg:<name>` disposition entry by it when checking `--waived/--rejected/--fix-dispatched`.
//
// Unit ruling (direct fix under core § Incident Policy, owner: tests/review/disposer-gate.test.js
// "disposition-pool unit"): a disposition on a leg ref covers that leg's WHOLE count, and both
// callers take the count from here — a driver tally and a verdict sum that count in different
// units leave findings undispositioned that no `--waived N` can cover (a reconcile row with
// `outOfPlan: 5` and one waive entry must clear at `--waived 5`). specs/20260901/09-disposer-
// gate.md D2 binds the driver's tally to verdict.js's contradiction arithmetic; a drift leg
// floors to 1 in both units, which is why that spec's tests alone cannot pin the unit. Rejected
// alternative: per-file refs (`leg:reconcile#<i>`) — stronger falsifiability per finding, but it
// changes the disposer's return contract and spec 09's shape; the weighted leg ref keeps that
// contract and one derivation of the count.
//
// specs/20260820/06-typed-evidence-manifest.md D3: the count is read off each leg's own typed
// observed field — reconcile's out-of-plan count, ac-matrix's uncovered count, skip-reconcile's
// skipped minus sanctioned, promise-sweep's orphans — never pattern-matched out of a string. Any
// other red non-blocking leg (at-risk, drift, patterns) or an absent/non-numeric field floors to
// 1: a red row can never contribute 0 (fail closed, never silently disappear).

function countLegFinding(row) {
  const observed = (row && row.observed) || {}
  let n = NaN
  if (row && row.leg === 'reconcile') {
    n = observed.outOfPlan
  } else if (row && row.leg === 'ac-matrix') {
    n = observed.uncovered
  } else if (row && row.leg === 'skip-reconcile') {
    if (typeof observed.skipped === 'number') {
      n = observed.skipped - (typeof observed.sanctioned === 'number' ? observed.sanctioned : 0)
    }
  } else if (row && row.leg === 'promise-sweep') {
    n = observed.orphans
  }
  return Number.isFinite(n) && n >= 1 ? n : 1
}

module.exports = { countLegFinding }
