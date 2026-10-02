'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fx = require('./wireframe-fixtures')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md — AC-20261002-01-14 (D8): the
// ledger gate still guards the journey confirmation, in terminal mode and for a waiver.

const ROW = '| A1 | SCREENS | product | invented claim | invented | open | - | - | - |'
const APPROVE = ['--mark', 'journey-approved', '--journey', 'owner-onboarding']

test('AC-20261002-01-14: an open invented ledger row refuses a terminal confirmation naming the row and its remedy, and an override lets the same mark through', () => {
  const root = fx.makeRoot({ block: false, rows: [ROW] })
  fx.writeStatus(root)
  const refused = fx.runDriver(root, APPROVE)
  assert.strictEqual(refused.status, 2, 'an unconfirmed invented claim must hold the confirmation — otherwise an invention reaches the client as agreed fact: ' + refused.stdout)
  assert.ok(refused.stderr.includes('A1'), 'the refusal must name the open row: ' + refused.stderr)
  assert.ok(refused.stderr.includes('ledger set --id A1 --status confirmed --tag said-by-user'), 'the refusal must carry the exact confirm remedy: ' + refused.stderr)
  assert.ok(!fx.readStatus(root).journeys['owner-onboarding'] || !fx.readStatus(root).journeys['owner-onboarding'].approved, 'a refused mark must leave the journey\'s approved unset')

  const set = fx.runDriver(root, ['ledger', 'set', '--id', 'A1', '--status', 'overridden'])
  assert.strictEqual(set.status, 0, 'overriding the row must be accepted: ' + set.stderr)
  const ok = fx.runDriver(root, APPROVE)
  assert.strictEqual(ok.status, 0, 'once the row is overridden the same mark must be accepted: ' + ok.stderr)
})

test('AC-20261002-01-14: the same open row refuses a waiver in service mode, so a waiver cannot launder an unconfirmed invention', async (t) => {
  const stub = await fx.startStub(t, {})
  const root = fx.makeRoot({ block: stub.url, rows: [ROW] })
  fx.writeStatus(root, { journeys: { 'team-invite': fx.journeyEntry({ approved: null, beats: fx.H_TEAM }) } })
  const r = fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'team-invite', '--waive', '--reason', 'client on leave'])
  assert.strictEqual(r.status, 2, 'a waiver must still pass the ledger gate: ' + r.stdout)
  assert.ok(r.stderr.includes('A1'), 'the refusal must name the open row: ' + r.stderr)
  assert.ok(!fx.readStatus(root).journeys['team-invite'].approved, 'a refused waiver must leave the journey\'s approved unset')
})
