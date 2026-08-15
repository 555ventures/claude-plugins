'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// CROSS-20260813-01 (3 corroborating hosts): at plan lock, an obligation stated in the
// Decisions table has no derivation ensuring some carrier — a File Plan row, a Contracts entry,
// a Contracts factory signature, a listed ground-truth source — actually owns it. plan.md's
// Phase 4 lock check already traces Goal promises and Decision-level observable promises to an
// AC (the terminal-observable rule), but that trace stops at "an AC exists" — it never asks
// whether the THING the Decision named (a file, a persisted artifact's shape, a test's imported
// factory, a helper's own correctness) has a carrier anyone can point to. Four corroborated
// shapes below, one test each: the class fix is a single lock-time obligation→carrier sweep,
// but each shape gets its own assertion so a partial fix (e.g. only the File Plan row shape)
// still surfaces the other three as red.
//
// AC-20260814-05-9 (specs/20260814/05-collision-closure.md D9a, 2026-08-14): D7 rewrites this
// same Phase 4 step 2 paragraph's FIFTH obligation shape (the hand-executed stem-level-grep
// sentence) into an invocation line for spec/scripts/collision-closure.js. This is a regression
// pin — the sanctioned exception to red-first named in that spec's Goal — green before D7's
// edit lands and required to stay green after it, so a collateral deletion of one of the four
// surviving shapes while rewriting the fifth is caught immediately.

const plan = read('spec/commands/plan.md')

test('AC-20260813-04-1 / CROSS-20260813-01a: a Decision naming a file by path must get a File Plan row for that file', () => {
  assert.match(plan, /[Dd]ecision (that )?names? a file( by path)?.*File Plan row/,
    'plan.md has no lock-time check forcing a File Plan row for every file a Decision names — ' +
    'upwell spec 20260811/01: D6 ordered an edit to a file no batch owned, so the edit was an ' +
    'unassignable orchestrator action that scope-reconcile.js flagged out-of-plan at review ' +
    'instead of being caught at lock, when the Decision itself already named the file')
})

test('AC-20260813-04-2 / CROSS-20260813-01b: a Decision ordering a persisted, later-rendered artifact must carry the contracts/schema row typing it', () => {
  assert.match(plan,
    /[Dd]ecision (that )?orders?[\s\S]*(persisted|rendered) artifact[\s\S]*(Contracts|schema)/,
    'plan.md has no lock-time check that a Decision promising a persisted, later-rendered ' +
    'artifact (a message, card, or notice) gets a Contracts/schema row typing its shape — ' +
    'upwell spec 20260731/06: the only in-scope option left to the build worker was a raw ' +
    'English template literal, invisible to the jsx-only i18n lint, because nothing at plan ' +
    'time forced the artifact into a typed carrier')
})

test('AC-20260813-04-3 / CROSS-20260813-01c: a spec whose tests import CREATE-d modules must pin those modules\' factory signatures in Contracts', () => {
  assert.match(plan,
    /[Ff]actory signatures?.*Contracts|Contracts.*[Ii]njectable seams?/,
    'plan.md has no lock-time check that a spec whose tests import a CREATE-d module pins that ' +
    'module\'s factory signature (including injectable seams) in Contracts — autopilot-hub, 2 ' +
    'specs: the test author invented a factory shape with no spec anchor, and the implementer ' +
    'silently conformed to that unreviewed invention instead of a Contracts-pinned signature')
})

test('AC-20260813-04-4 / CROSS-20260813-01d: an AC expectation computed by a helper needs the helper\'s own ground-truth carrier listed or checked', () => {
  assert.match(plan,
    /helper'?s own (ground.truth|correctness).*(listed|checked)|ground.truth carrier/,
    'plan.md has no lock-time check that an AC whose expected value is COMPUTED by a helper ' +
    '(rather than a literal example) lists or checks that helper\'s own ground-truth carrier — ' +
    'prax spec 20260812/02: flat_bars_after_warmup encoded a subtle kernel claim with zero ' +
    'direct tests, so every downstream AC was expectation-construction against an unverified ' +
    'helper, never a real check against ground truth')
})

test('AC-20260814-05-9: plan.md Phase 4 step 2 continues to state all four surviving obligation shapes after the fifth shape is rewritten into a collision-closure invocation line', () => {
  assert.match(plan, /[Dd]ecision (that )?names? a file( by path)?.*File Plan row/,
    'the file-by-path obligation shape must survive D7\'s rewrite of the fifth (stem-grep) shape ' +
    'in the same Phase 4 step 2 paragraph — a collateral deletion here means the regression pin ' +
    'guarding the paragraph did not hold')
  assert.match(plan,
    /[Dd]ecision (that )?orders?[\s\S]*(persisted|rendered) artifact[\s\S]*(Contracts|schema)/,
    'the persisted-artifact obligation shape must survive D7\'s rewrite of the fifth shape in ' +
    'the same paragraph')
  assert.match(plan,
    /[Ff]actory signatures?.*Contracts|Contracts.*[Ii]njectable seams?/,
    'the CREATE-d-module factory-signature obligation shape must survive D7\'s rewrite of the ' +
    'fifth shape in the same paragraph')
  assert.match(plan,
    /helper'?s own (ground.truth|correctness).*(listed|checked)|ground.truth carrier/,
    'the helper ground-truth obligation shape must survive D7\'s rewrite of the fifth shape in ' +
    'the same paragraph')
})
