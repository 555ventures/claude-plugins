'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, run, stateOf, toIntegration } = require('./build-driver.fixtures')

// A `baseline`-layer File Plan row names a file only the built product can produce and only a
// person may approve (a screenshot baseline). Planned as a tests-layer row it made TESTS
// unpassable: the tests-authored mark demands every tests-layer path on disk before any
// implementation exists. Deliberately carries no AC-ID: red-check reads an AC-ID anywhere in a
// file, comments included, as a carried-red expectation.
test('a baseline-layer File Plan row is not demanded at TESTS or by any wave, and is demanded before the gate runs', () => {
  const host = makeHost()
  const picture = 'tests/screens/empty.png'
  fs.writeFileSync(host.spec, fs.readFileSync(host.spec, 'utf8')
    .replace('| tests/foo.test.js | CREATE | tests |',
      '| tests/foo.test.js | CREATE | tests |\n| ' + picture + ' | CREATE | baseline |'))

  // Every mark on the way passes with the picture absent — tests-authored, red-attributed, and
  // both wave-done marks (a baseline row folded into the `other` wave would refuse the second).
  toIntegration(host)

  const step = run(host.root, host.spec)
  assert.match(step.stdout, new RegExp(picture.replace(/[.]/g, '\\.')),
    'the INTEGRATION step must name the baseline file a person still owes, or the session marks ' +
    'integrated blind and learns of it only from the refusal: ' + step.stdout)

  const refused = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(refused.status, 2,
    'integrated must refuse while a baseline file is missing — accepting it runs a gate that can ' +
    'only fail and spends a repair round on a file no worker may produce: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr, /tests\/screens\/empty\.png/,
    'the refusal must name the missing baseline path: ' + refused.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'a refused integrated mark must leave the state at INTEGRATION')
  assert.doesNotMatch(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), /"gateRuns"/,
    'no gate run may be recorded by a refused integrated mark — a recorded red run counts toward the repair cap')

  fs.mkdirSync(path.join(host.root, 'tests/screens'), { recursive: true })
  fs.writeFileSync(path.join(host.root, picture), 'approved picture bytes')
  const ok = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'with the approved baseline on disk the gate must run and pass — a red gate here means the ' +
    'baseline file was handed to the test command as if it were a test file: ' + ok.stdout + ok.stderr)
})
