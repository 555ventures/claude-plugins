'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const fx = require('./mock-app-fixtures')

// specs/20260914/01-the-mock-contract-and-the-driver.md D16, AC-20260914-01-16 (SHALL CONTINUE
// TO), AC-20260914-01-24: the ledger verbs (add/set/catch/check/counts) and the gateVerdict gate
// before seed-done/journey-approved/theme-picked/approved keep their exact flags, output and
// exit codes over the new mock-app host shape — only the host underneath the ledger changed.

test('AC-20260914-01-16: `ledger add` then `ledger counts` SHALL CONTINUE TO exit 0, append the exact row, print the exact counts line, and leave status.json byte-identical on the mock-app fixture host', () => {
  const root = tmpdir('ledger-ac16')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root)
  fx.writeApp(root, { records: [] })
  const statusPath = path.join(root, 'design/mocks/status.json')
  const before = fs.readFileSync(statusPath, 'utf8')

  const add = runNode('scripts/mocks-driver.js',
    ['--root', root, 'ledger', 'add', '--id', 'A1', '--step', 'SCREENS', '--kind', 'product', '--claim', 'x', '--tag', 'invented', '--status', 'open'])
  assert.strictEqual(add.status, 0, 'ledger add on a valid mock-app host must CONTINUE TO exit 0: ' + add.stderr)
  const ledger = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  assert.ok(ledger.includes('| A1 | SCREENS | product | x | invented | open | - | - | - |'),
    'ledger add must CONTINUE TO append the exact pinned row shape: ' + ledger)

  const counts = runNode('scripts/mocks-driver.js', ['--root', root, 'ledger', 'counts'])
  assert.strictEqual(counts.status, 0, 'ledger counts must CONTINUE TO exit 0: ' + counts.stderr)
  assert.match(counts.stdout, /1 invented \(1 open\)/, 'ledger counts must CONTINUE TO print the exact counts line: ' + counts.stdout)

  assert.strictEqual(fs.readFileSync(statusPath, 'utf8'), before,
    'neither ledger add nor ledger counts may touch status.json — the ledger is a separate file from driver state')
})

test('AC-20260914-01-24: `--mark journey-approved` refuses naming an open ledger row and its exact confirm remedy, even once every D7 approval condition is satisfied', () => {
  const root = tmpdir('ledger-ac24')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: { seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: null, approved: null },
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: null } },
  })
  fx.writeApp(root, {
    records: [],
    approval: fx.defaultApproval({
      journeys: { 'first-visit': { client: 'ok', beats: fx.DEFAULT_BEAT_HASH } },
    }),
  })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk({
    journeys: [{ id: 'first-visit', title: 'First visit', steps: [{ screen: 'home', beat: fx.DEFAULT_BEAT_TEXT, state: null }], edges: [], resolved: true, unresolved: [] }],
  }))

  const add = runNode('scripts/mocks-driver.js',
    ['--root', root, 'ledger', 'add', '--id', 'A1', '--step', 'SCREENS', '--kind', 'product', '--claim', 'invented claim', '--tag', 'invented', '--status', 'open'])
  assert.strictEqual(add.status, 0, 'seeding the open ledger row must succeed: ' + add.stderr)

  const mark = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-approved', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(mark.status, 2, 'an open (unconfirmed) ledger row must refuse journey-approved even when every D7 approval condition is satisfied: ' + mark.stderr)
  assert.match(mark.stderr, /A1/, 'the refusal must name the open ledger row\'s id: ' + mark.stderr)
  assert.match(mark.stderr, /ledger set --id A1 --status confirmed --tag said-by-user/, 'the refusal must name the exact confirm remedy: ' + mark.stderr)
})
