'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { ROOT, read } = require('../helpers')
// AC-20261008-01-3 (specs/20261008/01-doctrine-states-contracts-and-points-at-its-enforcers.md D5): each of
// the six doctrine files is held to its own measured line ceiling; the table may only shrink.

// each entry may only shrink afterwards — never raise a ceiling to make a file fit
const DOCTRINE_BUDGET = {
  'spec/doctrine/core.md': 230,
  'spec/doctrine/genesis.md': 448,
  'spec/doctrine/mocks.md': 200,
  'spec/doctrine/design.md': 65,
  'spec/doctrine/stages/stage-build.md': 85,
  'spec/doctrine/stages/stage-review.md': 93,
}

for (const [rel, limit] of Object.entries(DOCTRINE_BUDGET)) {
  test(`AC-20261008-01-3: ${rel} is at or under its ${limit}-line doctrine budget`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' is missing — the budget pins a file that no longer exists')
    const n = read(rel).split('\n').length
    assert.ok(n <= limit,
      rel + ' is ' + n + ' lines > ' + limit + ' — doctrine states contracts and points at the enforcing script; ' +
      'delete restated rules (never rewrite) until it fits, and never raise this ceiling')
  })
}
