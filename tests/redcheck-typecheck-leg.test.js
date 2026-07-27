'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// HEARWELL-20260721-01: the TDD red-probe runs only the runtime test-runner, so a test
// whose red-ness lives in the gate's typecheck leg (e.g. asserting an as-yet-unadded
// optional property reads `undefined` — vitest passes vacuously, tsc is red with TS2339)
// is falsely reported "not red" and the TDD path is abandoned. The probe measures a
// strictly narrower "red" than the gate it is a proxy for. Fix contract: red = the
// test-runner fails OR the host's typecheck fails on the test files.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-build.body.js'), 'utf8')

const start = src.indexOf("phase('RedCheck')")
assert.ok(start !== -1, 'RedCheck phase missing from wf-build source')
const redBlock = src.slice(start, src.indexOf('FAIL CLOSED', start))

test('red-check includes a typecheck leg, not just the runtime test-runner', () => {
  assert.match(redBlock, /typecheck|type-?check|tsc/i,
    'the red-probe only runs gate.testCommand: a test that is red under the gate\'s ' +
    'typecheck leg but green at runtime (optional-property additions, new union members, ' +
    'widened signatures, assert-absence tests) is falsely reported "not red" and TDD is ' +
    'silently lost for that whole class of specs')
})
