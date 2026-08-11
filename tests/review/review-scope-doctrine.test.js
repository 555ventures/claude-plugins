'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260805/01-review-scope-reconciliation.md D6/D7/D8/D9: the reviewer prompt promised
// spec-drift coverage its own diff command withheld (wf-review.body.js:91 vs :105 — the diff
// was scoped to the File Plan's directories, so an out-of-plan edit was structurally invisible
// to review). This spec makes the reviewer diff unscoped from base and wires
// scope-reconcile.js's verdict into Phase 0 (reconcile-first, before the parallel legs) and
// Phase 2 (mechanical hard/soft findings). D9 gives /spec:build's Final gate the same signal,
// report-only. These are doctrine regex pins over the prose, not execution tests — the script's
// own behavior is pinned in scope-reconcile.test.js.

const wfReviewSrc = read('spec/workflows/src/wf-review.body.js')
const reviewMd = read('spec/commands/review.md')
const buildMd = read('spec/commands/build.md')

test('AC-20260805-01-5: the full-scope reviewer prompt diffs unscoped from base, with no File-Plan directory scoping', () => {
  assert.doesNotMatch(wfReviewSrc, /git (-C \$\{REVIEW_ROOT\} )?diff \$\{args\.base\}\s*-- <directories from the spec's File Plan>/,
    'the reviewer diff command must no longer be scoped to the File Plan\'s directories — that scoping is ' +
    'exactly the structural gap the confirmed 2026-08 host escape (an out-of-plan waitForExit edit) exploited')
  assert.match(wfReviewSrc, /git (-C \$\{REVIEW_ROOT\} )?diff \$\{args\.base\}(?!\s*-- <directories)/,
    'the full-scope reviewer prompt must still instruct an unscoped `git diff ${args.base}` — reviewing ' +
    'the WHOLE change, not a prediction of it (the optional -C is the UPWELL-20260810-02 frozen ' +
    'review root, which changes WHERE the diff runs, never what it is scoped to)')
})

test('AC-20260805-01-5: wf-review references args.reconcilePath as an additive workflow arg', () => {
  assert.match(wfReviewSrc, /reconcilePath/,
    'wf-review.body.js must declare and use the new reconcilePath arg (path to the Phase 0 reconcile JSON) ' +
    'so the reviewer prompt can point at the mechanical reconciliation output')
})

test('AC-20260805-01-6: review.md Phase 0 runs scope-reconcile.js before the parallel leg group', () => {
  assert.match(reviewMd, /scope-reconcile\.js/,
    'review.md Phase 0 must name scope-reconcile.js — otherwise nothing computes the mechanical ' +
    'out-of-plan/unrealized verdict this whole spec exists to enforce')
  const reconcileAt = reviewMd.indexOf('scope-reconcile')
  const parallelLegAt = reviewMd.indexOf('DIFF_BASE={base}')
  assert.ok(reconcileAt !== -1 && parallelLegAt !== -1 && reconcileAt < parallelLegAt,
    'per D8, scope-reconcile.js (sub-second) must run FIRST, before the parallel background legs launch — ' +
    'it feeds --dirs into the pattern sweep, so the sweep can never be the first thing Phase 0 starts')
})

test('AC-20260805-01-6: review.md wires exit 3 to a mechanical hard finding and unrealized to a mechanical soft finding', () => {
  assert.match(reviewMd, /exit 3[\s\S]{0,300}?hard/i,
    'exit 3 (out-of-plan files present) must be wired to ONE mechanical hard finding in Phase 2, ' +
    'per D7 — grouped so disposition cost stays O(1) per class')
  assert.match(reviewMd, /unrealized[\s\S]{0,300}?soft/i,
    'a non-empty unrealized set must be wired to ONE mechanical soft finding (plan overshoot), per D7')
})

test('AC-20260805-01-6: review.md scopes the mechanical pattern sweep to actually-changed directories, not the File Plan\'s prediction', () => {
  assert.match(reviewMd, /scope-reconcile[\s\S]{0,400}?--dirs/,
    'per D8, the pattern sweep\'s directory list must come from scope-reconcile --dirs (the REAL changed-file ' +
    'set) — sweeping only the predicted File Plan directories misses the out-of-plan dirs that most need sweeping')
})

test('AC-20260805-01-6: reconcilePath appears in both the Phase 1 args-contract block and the Rules restatement', () => {
  const hits = [...reviewMd.matchAll(/reconcilePath/g)]
  assert.ok(hits.length >= 2,
    'reconcilePath must be named in BOTH the args contract shown in the Phase 1 block AND the Rules ' +
    'restatement further down (review.md:300-301 in the spec\'s own citation) — a contract restated in only ' +
    'one place drifts from the other silently')
})

test('AC-20260805-01-6: build.md\'s Final gate names the advisory scope-reconcile line, report-only', () => {
  const finalGate = buildMd.slice(buildMd.indexOf('## Phase 4'), buildMd.indexOf('## Phase 5'))
  assert.match(finalGate, /scope-reconcile/,
    'per D9, /spec:build\'s Final gate must run scope-reconcile.js --json as an advisory signal — build ' +
    'already owns an out-of-scope prose fork with no mechanical signal backing it')
  assert.match(finalGate, /advisory|report-only/i,
    'the build-side reconcile signal must be explicitly advisory — it prints one line and never blocks, ' +
    'unlike review\'s hard/soft findings')
})
