'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md AC-20261002-01-19 (SHALL
// CONTINUE TO): the ledger verbs keep their flags, row shape, counts line and exit codes while the
// driver's state machine is rewritten. Self-contained on purpose: helpers only, a cold root.

test('AC-20261002-01-19: `ledger add` then `ledger counts` on a cold root SHALL CONTINUE TO exit 0, append the exact row, print the exact counts line, and leave status.json byte-identical', () => {
  const root = tmpdir('ledger-verbs')
  assert.ok(!fs.existsSync(path.join(root, 'design/mocks')), 'test setup requires a cold root with no design/mocks/ before the first command')

  const add = runNode('scripts/mocks-driver.js',
    ['--root', root, 'ledger', 'add', '--id', 'A1', '--step', 'SCREENS', '--kind', 'product', '--claim', 'x', '--tag', 'invented', '--status', 'open'])
  assert.strictEqual(add.status, 0, 'ledger add on a cold root must CONTINUE TO exit 0 — a refusal here strands every host whose first act is recording an assumption: ' + add.stderr)
  const ledger = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  assert.ok(ledger.includes('| A1 | SCREENS | product | x | invented | open | - | - | - |'),
    'ledger add must CONTINUE TO append the exact pinned row shape — a changed shape breaks every parser of the ledger: ' + ledger)

  const statusPath = path.join(root, 'design/mocks/status.json')
  const before = fs.existsSync(statusPath) ? fs.readFileSync(statusPath, 'utf8') : null

  const counts = runNode('scripts/mocks-driver.js', ['--root', root, 'ledger', 'counts'])
  assert.strictEqual(counts.status, 0, 'ledger counts must CONTINUE TO exit 0: ' + counts.stderr)
  assert.match(counts.stdout, /1 invented \(1 open\)/, 'ledger counts must CONTINUE TO print the exact counts line — the gates quote it: ' + counts.stdout)

  const after = fs.existsSync(statusPath) ? fs.readFileSync(statusPath, 'utf8') : null
  assert.strictEqual(after, before,
    'ledger counts must not touch status.json — the ledger is a separate file from driver state, and a rewrite would re-stamp lastUpdated on every read')
})
