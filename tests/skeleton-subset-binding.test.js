'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// PRAX-20260804-02: design.md's skeleton authoring contract lets a screen-level skeleton bind a
// SUBSET of a surface's regions while naming itself after the bare surface id. A bare-surface ref
// claims every region of the mock — including chrome (status bars, browser furniture) no shipped
// screen actually renders — so when the fidelity gate refuses the mismatch it names the chrome
// copy as missing, not the real cause: a naming collision between "the surface id" and "the
// screen skeleton that binds only part of it". Fix contract: name screen-level skeletons
// `<surface>-screen` (or any id distinct from the bare surface id) whenever they bind a subset of
// the surface's regions.
//
// AC-20260814-02-9 (spec 20260814/02 D5, retagged from PRAX-20260804-02's pins, 2026-08-14):
// fidelity-check.js now detects the over-claim class itself and names it directly in its own
// findings output (tests/fidelity-check.test.js), so design.md's incident-shaped multi-line
// chrome-copy misdiagnosis narration collapses to one class-level sentence — the literal
// `<surface>-screen` remedy survives, the "fidelity refusal names the chrome copy, not the
// naming collision" narration does not.

const design = read('spec/commands/design.md')

test('AC-20260814-02-9: design.md requires a screen-level skeleton binding a region subset to use a non-bare-surface id', () => {
  assert.match(design, /<surface>-screen/,
    'without a required distinct id like `<surface>-screen`, a screen skeleton binding only some ' +
    'of a surface\'s regions can still be named after the bare surface id, silently claiming every ' +
    'region of the mock including chrome no shipped screen renders')
})

test('AC-20260814-02-9: design.md collapses the subset-binding rule to one class-level sentence, dropping the chrome-misdiagnosis narration now that fidelity-check.js names the over-claim itself', () => {
  assert.doesNotMatch(design, /name the chrome copy/,
    'the multi-line chrome-copy-misdiagnosis narration must be gone — the fidelity gate now ' +
    'detects and names the over-claim class directly (spec 20260814/02 D5), so design.md no ' +
    'longer needs to walk the reader through the confusing symptom by hand')
  assert.match(design, /fidelity gate now names|fidelity-check\.js/,
    'the collapsed sentence must point at the mechanism that now names the over-claim — either ' +
    'stating the fidelity gate names it directly or citing fidelity-check.js — or a reader has no ' +
    'way to know the old narration was replaced by real detection rather than silently dropped')
})
