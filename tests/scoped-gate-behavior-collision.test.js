'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// JJ-20260815-03 — escape wf_e1da0ea6-94c (2026-08-14, foundBy user, severity hard, spec
// specs/20260813/10-host-capabilities.md, file tests/review/verdict.test.js).
//
// What happened: D4 taught verdict.js's review profile to derive CLEAN-with-qualifier on an
// unavailable observation leg. Five pins in tests/review/verdict.test.js and
// tests/run-ledger.test.js were green before that change and red after it — and NOTHING saw
// it. The spec's scoped gate resolved to tests/capabilities/ plus tests/model-placement.js
// (its File Plan's own test rows), so neither the build's gate loop nor the review panel ever
// executed the suites that pinned the behavior D4 altered. Review returned
// CLEAN-with-qualifier at 22:30 UTC; the breakage was found by hand and fixed at 22:42.
//
// Why the existing carriers do not cover it, each checked:
//
//   * The colliding-pin Gotcha in the host rules covers a Decision that RETIRES OR NARROWS A
//     LITERAL — a retired glyph, phrase, or doctrine claim — and prescribes a stem-level grep
//     of tests/ and the doctrine corpus. D4 retired no literal. It changed what a script
//     RETURNS. There is no string to grep for.
//   * plan.md's obligation→carrier sweep confirms "every STATED obligation has a carrier".
//     D4 stated no obligation about other suites; the collision is a property of the repo's
//     test topology, not of the Decision's text. An open-ended rule cannot fire on an
//     obligation nobody wrote down. (This is exactly why the two 2026-08 gotchas about a
//     Decision naming a backlog row or a model seat WERE closed as covered — their obligation
//     is visible in the Decision. This one is not.)
//   * CROSS-20260727-01 (fix-delta inherits gate state, fixed@6.59.0) is a different failure:
//     that review's iteration-2 legs all re-ran and all returned exit 0. They re-ran the
//     WRONG SCOPE, which no amount of re-assertion fixes.
//
// The scoped gate is deliberate and correct — this repo carries red INTAKE pins, so an
// unscoped gate would be permanently red (host rules § Test Rules, "Red-pin baseline"). The
// gap is that scoping is applied with no compensating derivation of which OTHER suites pin
// the behavior a spec is about to change. That derivation is mechanical: the File Plan names
// the source files; a grep of tests/ for those paths and their exported symbols yields the
// suites at risk, and any hit outside the resolved {testDirs} is a plan-time File Plan row or
// a recorded waive — the same shape the retired-literal anchor already uses, applied to
// behavior instead of text.
//
// Doctrine pin (mode 2). Deliberately fix-shape-agnostic about WHERE the obligation lands
// (plan lock, build's gate resolution, or review's scope reconciliation) — it asserts only
// that some pipeline surface names the behavior-collision obligation. Today none does.

const plan = read('spec/commands/plan.md')
const build = read('spec/commands/build.md')
const review = read('spec/commands/review.md')

const NAMES_BEHAVIOR_COLLISION =
  /(chang|alter|modif)\w*\s+(what\s+)?[^.\n]{0,60}(return|behavior|output|contract)[^.\n]{0,120}(outside|beyond|other)\s+[^.\n]{0,40}(scope|gate|testDirs|suite)/i

const NAMES_OUT_OF_SCOPE_PIN_SWEEP =
  /(pins?|tests?|suites?)\s+(that\s+)?[^.\n]{0,80}(outside|beyond|not (run|executed) by)\s+[^.\n]{0,40}(the\s+)?(scoped gate|resolved \{?testDirs\}?|spec's gate)/i

test('JJ-20260815-03: some pipeline surface obliges a sweep for pins outside the scoped gate when a Decision changes shared behavior', () => {
  const hit = [plan, build, review].some(
    doc => NAMES_BEHAVIOR_COLLISION.test(doc) || NAMES_OUT_OF_SCOPE_PIN_SWEEP.test(doc))
  assert.ok(hit,
    'no pipeline surface obliges anyone to look for pins the scoped gate will not run. A ' +
    'Decision that changes what a shared script returns reddens the suites that pinned the old ' +
    'behavior, and because the gate is scoped to the spec\'s own File Plan test rows, neither ' +
    'the build gate nor the review panel ever executes them — the breakage ships behind a CLEAN ' +
    'verdict and is found by hand later (escape wf_e1da0ea6-94c: five pins, two files, zero ' +
    'signal). The retired-literal anchor does not reach it because a behavior change leaves no ' +
    'literal to grep, and the obligation→carrier sweep does not reach it because the Decision ' +
    'states no obligation about other suites. The File Plan already names the source files ' +
    'being changed, so the at-risk suites are mechanically derivable — the sweep just has to ' +
    'be owed by someone.')
})
