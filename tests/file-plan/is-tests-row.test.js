'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20261026/02-one-tests-row-check-and-host-shape-hints.md AC-20261026-02-1 (D1): the one
// tests-layer predicate lives in lib/file-plan.js.

const filePlan = require(path.join(SPEC, 'scripts/lib/file-plan.js'))

test('AC-20261026-02-1: isTestsRow is true for tests, test, Tests and a padded Test and false for testing, baseline, empty and a layer-less row', () => {
  assert.strictEqual(typeof filePlan.isTestsRow, 'function',
    'lib/file-plan.js must export isTestsRow — without it every script keeps its own inline tests-layer predicate and the spellings drift apart again')
  const isTestsRow = filePlan.isTestsRow
  for (const layer of ['tests', 'test', 'Tests', ' Test ']) {
    assert.strictEqual(isTestsRow({ layer }), true,
      `layer ${JSON.stringify(layer)} must be a tests row — a miss lets red-check skip a row that build dispatches as a test`)
  }
  for (const layer of ['testing', 'baseline', '']) {
    assert.strictEqual(isTestsRow({ layer }), false,
      `layer ${JSON.stringify(layer)} must not be a tests row — a hit sends a non-test file through the red-first check`)
  }
  assert.strictEqual(isTestsRow({}), false,
    'a row with no layer must not be a tests row — a hit would treat every Layer-less table row as a test')
})
