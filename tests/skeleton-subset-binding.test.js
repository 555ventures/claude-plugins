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

const design = read('spec/commands/design.md')

test('design.md requires a screen-level skeleton binding a region subset to use a non-bare-surface id', () => {
  assert.match(design, /<surface>-screen/,
    'without a required distinct id like `<surface>-screen`, a screen skeleton binding only some ' +
    'of a surface\'s regions can still be named after the bare surface id, silently claiming every ' +
    'region of the mock including chrome no shipped screen renders')
})

test('design.md explains the naming collision surfaces as a chrome-copy failure, not the real cause', () => {
  assert.match(design, /name the chrome copy/,
    'the contract must name the actual symptom — the fidelity refusal names missing chrome copy ' +
    '(status bars, browser furniture) instead of the real naming collision — so the naming rule is ' +
    'legible as the fix for that specific confusing failure mode, not an arbitrary style preference')
})
