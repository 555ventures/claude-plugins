'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// UPWELL-20260810-01: upwell spec 20260731/04 (build + review 2026-08-10) shipped SIX
// severed-chain defects in one spec — a legend gated on an always-false condition, a
// computed number hardcoded to null at its one render site, a defer-time write a later
// phase rebuilt away, an orphaned caller behind a too-narrow filter, a heatmap whose
// only production producer pinned null, a ranked list never sorted. Every File Plan row
// was implemented faithfully and every AC was green, because ACs pinned INTERMEDIATE
// hops (field exists on the model, component renders with a fixture) while the terminal
// hop — the thing the user sees — had no observer. Holistic disposition (2026-08-10):
// NOT a new Wiring Plan artifact / review leg / verdict entry — the chain is already in
// the Decision's prose; the mis-aim is the AC-shape rule. Fix contract: for a Decision
// whose data path spans files, at least one AC must assert the chain's TERMINAL
// observable fed by the production path (a fixture-fed observation is not terminal) —
// verifying the end of the chain transitively verifies every hop upstream.

const plan = read('spec/commands/plan.md')

test('plan.md AC-shape rule requires a cross-file Decision to pin the terminal observable, not an intermediate hop', () => {
  assert.match(plan, /terminal observable|end of (the|its) chain|chain'?s end|last hop|intermediate hop/i,
    'an AC may observe any point on a Decision\'s data path, so every AC can sit on an ' +
    'intermediate hop and stay green while the user-visible outcome never happens — ' +
    'six green-gate severed-chain defects in one upwell spec rode exactly this gap')
})

test('plan.md AC-shape rule rules out fixture-fed observations as terminal evidence', () => {
  // 6.51.0 (specs/20260810/02-terminal-observable-acs.md D2) renamed this class to
  // "invented-fixture liveness" and stated it as an explicit disqualification. This pin
  // now tracks the DISQUALIFICATION clause; the positive produced-fixture requirement and
  // the anti-pattern's literal name are pinned by tests/terminal-observable-acs.test.js AC-2.
  assert.match(plan, /never a hand-(authored|typed) props object|hand-(typed|authored) props proves[^.]{0,90}never|fixture(-| )fed observation|only non-null.{0,60}(fixture|story)/i,
    'a component whose only non-null input in the whole repo lives in an invented fixture ' +
    'passes an "observable response" AC unless AC-shape doctrine explicitly disqualifies a ' +
    'hand-authored props object as terminal evidence — the recorded invented-fixture tell, ' +
    'on its fourth appearance, must be ruled out where AC shape is defined, not merely named')
})
