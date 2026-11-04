'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261103/13-a-change-is-sized-by-its-files.md D13, AC-20261103-13-8: a present slow row blocks
// the release profile too.

const GREEN = [
  { leg: 'deploy', exit: 0, observed: {}, scope: null },
  { leg: 'ready', exit: 0, observed: {}, scope: null },
  { leg: 'e2e', exit: 0, observed: { executed: 3 }, scope: null },
  { leg: 'journeys', exit: 0, observed: {}, scope: null },
  { leg: 'substrate', exit: 0, observed: { checked: 2, inert: 0 }, scope: null },
  { leg: 'production', exit: 0, observed: { result: 'pass' }, scope: null },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' }, scope: null },
]

function derive(extraRows) {
  const dir = tmpdir('verdict-tier')
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, GREEN.concat(extraRows).map(r => JSON.stringify(r)).join('\n') + '\n')
  return runNode('scripts/verdict.js', ['--manifest', manifest, '--profile', 'release'])
}

test('AC-20261103-13-8: a red slow row derives GATE_RED and a green slow row derives CLEAN over an otherwise green release manifest', () => {
  const red = derive([{ leg: 'slow', exit: 1, observed: { skips: 0, todos: 0, testsExecuted: 17 }, scope: null }])
  assert.strictEqual(red.stdout.split('\n')[0], 'GATE_RED',
    'a red slow row must block the release profile like any release leg — CLEAN here promotes a release over failing host integration tests: ' + red.stdout + red.stderr)
  const green = derive([{ leg: 'slow', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 17 }, scope: null }])
  assert.strictEqual(green.stdout.split('\n')[0], 'CLEAN',
    'a green slow row must not disturb the release verdict: ' + green.stdout + green.stderr)
})
