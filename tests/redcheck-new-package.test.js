'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// HEARWELL-20260804-02: the tdd-red-check exception row (build.md) currently handles a
// red-expected file that PASSES and a green-expected carrier that FAILS, but not a third,
// legitimate state: a red-expected file the runner reports `not-collected` because its
// collecting home (a new workspace package, a config registration, a harness entry) does not
// exist yet — and the spec itself is what creates that home later in the same batch. That is a
// satisfied expectation (redder than red, not a mismatch) and should proceed on the spec's
// authority, not stall the build waiting for a state that cannot occur before the home exists.

const build = read('spec/commands/build.md')

test('tdd-red-check exception row names not-collected-because-spec-creates-the-home as satisfied, not a mismatch', () => {
  assert.match(build, /strictly redder than red/,
    'without this the red-check has no vocabulary for "not-collected because the collecting home ' +
    'does not exist yet" and treats it as an ordinary mismatch, stalling the build on a retainer ' +
    'consult for a state the spec itself is about to resolve')
})

test('tdd-red-check exception row lets the spec\'s own creation of the collecting home authorize proceeding', () => {
  assert.match(build, /the spec itself creates/,
    'the row must tie the satisfied-expectation reading to the spec creating the collecting home ' +
    '(workspace package, config registration, harness) — otherwise a not-collected file with no ' +
    'such home coming still gets waved through as though it were fine')
})
