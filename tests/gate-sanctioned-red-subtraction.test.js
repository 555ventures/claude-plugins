'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// INTAKE JJ-20260816-03 — self-hosted, observed at the review of
// specs/20260815/05-env-preflight.md (runId wf_2222584b-9a8, 2026-08-16).
//
// This repo deliberately carries a checked-in sanctioned-red set (`.claude/suite-baseline.json`,
// 18 rows across 11 files, 10 of them top-level `tests/*.test.js`). `.claude/rules/spec-pipeline.md`
// § Test Rules claims the gate is protected from them because "pipeline-authored tests live under
// `tests/<scope>/` … so scoped gate runs are pin-free". That premise is false whenever a spec
// MODIFIES a pre-existing top-level test file — which every pin-closing spec must do — so
// `{testDirs}` resolves to `tests` and the gate sweeps every pin in scope.
//
// Observed: spec 05's gate ran 405 tests, 17 failed, ALL 17 were the baseline set, while
// `suite-baseline.js --check` independently returned `newFailing=0 fixedNotRemoved=0`. Nothing
// the diff touched had broken. Mechanically that is a pre-panel `GATE_RED` hard stop on a
// provably clean diff (review.md Phase 0 step 8; `verdict.js`'s REVIEW_BLOCKING), and at build it
// is a repair round dispatched at tests no repair can fix — the same category error
// specs/20260815/05 just closed for unprovisioned environment variables.
//
// The reviewing session worked around it by re-measuring with the other form § Test Rules
// sanctions (`node --test <file>`) and recording the gate leg on that basis. That is a per-review
// human judgment standing in for a mechanism, and it left the run ledger holding a `gate` row the
// gate never produced — invisible to doctor's correlations.
//
// Same disease, same class, second carrier: the `at-risk` leg has returned red on 4 of the last 4
// full-scope reviews (specs 20260815/02, /03, /04, /05), every one waived as pre-existing
// sanctioned pins. Its scaffold-ledger row retires it as pure noise at 10 consecutive such waives
// — a leg that exists because of a real escape is 4/10 of the way to being retired by this defect.
//
// These pins are deliberately LOOSE (the tests/gate-env-preflight.test.js precedent): they assert
// that the doctrine states the obligation, not how it is mechanized, so the fix spec keeps its
// design freedom.
//
// specs/20260816/02-sanctioned-red-closure.md D6: these four pins are retagged
// AC-20260816-02-1..4 (closing INTAKE JJ-20260816-03) — green once this spec's doctrine rows
// land (build.md D4, review.md D1/D2), red before.

const build = read('spec/commands/build.md')
const review = read('spec/commands/review.md')

test('AC-20260816-02-1: gate resolution subtracts the host\'s declared sanctioned-red set, so a red composed only of known pins is not read as a regression', () => {
  // Deliberately anchored on the gate's own FAILURES being adjudicated: build.md already
  // mentions suite-baseline (Phase 4, after the gate is green), so a bare gate↔baseline
  // proximity match would pass on prose that has nothing to do with this defect.
  const adjudicated = /gate[\s\S]{0,300}(red|fail)[\s\S]{0,300}(sanctioned[- ]red|suite-baseline)[\s\S]{0,200}(subtract|adjudicat|exclud)/i
  assert.ok(adjudicated.test(build),
    'build.md resolves the gate with no notion of the host\'s declared sanctioned-red set, so a ' +
    'gate red composed entirely of known-failing pins is indistinguishable from a regression — ' +
    'build dispatches a repair round at tests no repair can fix, and review hard-stops GATE_RED ' +
    'on a provably clean diff (observed: spec 20260815/05, 17/17 failures all baseline)')
})

test('AC-20260816-02-2: a gate red made only of sanctioned pins is routed away from the repair loop, exactly as an unprovisioned environment is', () => {
  const routedAway = /(sanctioned|baseline|known[- ]failing)[\s\S]{0,300}(never enter|not enter|instead of entering|skip|no repair)[\s\S]{0,120}repair/i
  assert.ok(routedAway.test(build),
    'build doctrine never states that a gate red consisting only of declared sanctioned-red pins ' +
    'must not enter the repair loop — the repair loop is structurally incapable of fixing another ' +
    'intake item\'s open pin, so the spend is guaranteed useless, the same shape INTAKE ' +
    'JJ-20260815-08 closed for unprovisioned environment variables')
})

test('AC-20260816-02-3: review\'s at-risk leg adjudicates its failures against the sanctioned-red set instead of spending a per-review human waive', () => {
  const mechanized = /at-risk[\s\S]{0,900}(sanctioned[- ]red|suite-baseline)[\s\S]{0,300}(subtract|adjudicat|excluded|not a finding)/i
  assert.ok(mechanized.test(review),
    'review.md still instructs the session to hand-waive a red at-risk leg whose failures are ' +
    'pre-existing sanctioned pins ("a five-second waive naming the pin"). That waive has now been ' +
    'paid on 4 of the last 4 full-scope reviews, and the leg\'s own scaffold-ledger retire ' +
    'condition fires at 10 — the subtraction suite-baseline.js already computes must adjudicate ' +
    'this leg, or a leg earned by a real escape gets retired as noise it never was')
})

test('AC-20260816-02-4: the run ledger can express a gate red that was entirely sanctioned, so the sanction survives outside console scrollback', () => {
  // Anchored on a distinct encoding token, not the word "sanctioned" — review.md already uses
  // that word for skip reconciliation, which would make a proximity match pass vacuously.
  const durable = /(subtracted|sanctioned-only)[\s\S]{0,300}qualifier/i
  assert.ok(durable.test(review),
    'review.md defines no durable encoding for "gate red, all failures sanctioned" — the ledger ' +
    'row\'s legs array carries name+exit only, so the reviewing session either records a red that ' +
    'blocks a clean diff or records a green the gate never produced (the latter happened, run ' +
    'wf_2222584b-9a8). A qualifier that lives only in console scrollback is the exact defect ' +
    'CROSS-20260813-03 closed for skips and structurally-absent CI')
})
