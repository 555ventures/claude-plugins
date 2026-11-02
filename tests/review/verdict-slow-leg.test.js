'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md D3: AC-20261101-07-5 —
// verdict.js treats a present slow row as blocking and never requires one.

const GREEN = [
  { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 }, scope: 'full' },
  { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1035 }, scope: 'full' },
  { leg: 'smoke', exit: 4, observed: { result: 'inert' }, scope: 'full' },
  { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 }, scope: 'full' },
  { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 }, scope: 'full' },
  { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 }, scope: 'full' },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' }, scope: 'full' },
  { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 }, scope: 'full' },
  { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 }, scope: 'full' },
  { leg: 'tests', exit: 0, observed: { count: 1 }, scope: 'full' },
]

function derive(extraRows) {
  const dir = tmpdir('verdict-tier')
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, GREEN.concat(extraRows).map(r => JSON.stringify(r)).join('\n') + '\n')
  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  return runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', workflow])
}

test('AC-20261101-07-5: a red slow row derives GATE_RED and a green slow row derives CLEAN over an otherwise green full-scope manifest', () => {
  const red = derive([{ leg: 'slow', exit: 1, observed: { skips: 0, todos: 0, testsExecuted: 17 }, scope: 'full' }])
  assert.strictEqual(red.stdout.split('\n')[0], 'GATE_RED',
    'a red slow row must block like a red suite row — CLEAN here lets a review close over failing host integration tests: ' + red.stdout + red.stderr)
  const green = derive([{ leg: 'slow', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 17 }, scope: 'full' }])
  assert.strictEqual(green.stdout.split('\n')[0], 'CLEAN',
    'a green slow row must not disturb the verdict: ' + green.stdout + green.stderr)
})
