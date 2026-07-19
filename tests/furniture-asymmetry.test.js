'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// v6.13.0 (prax intake, 2026-07-19): signin's missing legal disclaimer was ratified as
// "mock fidelity wins over uniformity" because nothing in the pipeline compares sibling
// mocks — mock supremacy is per-mock, workers are forbidden to unify, and no gate sees a
// family-level furniture asymmetry. Fix: sibling extract inventories ground asymmetry
// DETECTION in the session seat (never transcription, never visible to workers), furniture
// asymmetry is a retainer judgment point, and a mock's omission can never override a
// `grounded` ruling.

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

test('design.md lists family furniture asymmetry as a retainer judgment point', () => {
  const doc = read('commands/design.md')
  assert.match(doc, /judgment points:/)
  assert.match(doc, /family furniture\s+asymmetry/)
})

test('design.md sibling-grounding rule: inventories only, questions never bindings, workers blind', () => {
  const doc = read('commands/design.md')
  assert.match(doc, /Sibling mocks ground asymmetry detection — never transcription/)
  assert.match(doc, /never raw sibling mock HTML/)
  assert.match(doc, /workers never see sibling material/)
  assert.match(doc, /creates asks,\s+never unification/)
})

test('shared.md mock supremacy: a mock omission never overrides a grounded ruling', () => {
  const doc = read('doctrine/shared.md')
  assert.match(doc, /\*\*omission\*\* is not\s+evidence against a `grounded` ruling/)
  assert.match(doc, /silence in a mock can override taste, never grounding/)
})
