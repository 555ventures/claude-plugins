'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const {
  mark, statusJson,
  writeKitCanon,
  decideLook,
  advanceToShapePicked,
  ledgerCmd,
} = require('./mocks-driver-fixtures')
const { tmpdir } = require('../helpers')

// specs/20260907/04-kit-canon-family.md D7/D2: handleKitSignedOff() opens with requireGateOpen()
// exactly like every other gated mark — an open/invented provenance-ledger row blocks
// --mark kit-signed the same way it blocks approved. Split from tests/mocks/mocks-driver-2.test.js
// under specs/20260903/07-test-file-budget-guard.md's per-file 45s guard.

test('AC-20260907-04-9: --mark kit-signed refuses naming "provenance ledger is blocked" while an open invented row stands, leaving marks.kitSignedOff null, and accepts once the row is confirmed said-by-user', () => {
  const dir = tmpdir('mocks-driver')
  advanceToShapePicked(dir)
  writeKitCanon(dir)
  decideLook(dir, 'kit-signed', 'approve', { by: 'jj' })

  const added = ledgerCmd(dir, 'add', [
    '--id', 'P90', '--step', 'KIT', '--kind', 'product', '--claim', 'kit: reuse a sheet primitive',
    '--tag', 'invented', '--status', 'open',
  ])
  assert.strictEqual(added.status, 0,
    'test setup requires `ledger add` to accept a well-formed invented/open row: ' + added.stdout + added.stderr)

  const blocked = mark(dir, 'kit-signed')
  assert.strictEqual(blocked.status, 2,
    '--mark kit-signed must refuse (D2\'s requireGateOpen) while an open invented row stands, even with a decided stop and a non-empty design/kit/: ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stderr + blocked.stdout, /provenance ledger is blocked/,
    'the refusal must name D2\'s exact gate literal "provenance ledger is blocked": ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stderr + blocked.stdout, /P90/,
    'the refusal must name the blocking row\'s id: ' + blocked.stdout + blocked.stderr)
  assert.strictEqual(statusJson(dir).marks.kitSignedOff, null,
    'a gate-blocked kit-signed mark must leave marks.kitSignedOff null: ' + JSON.stringify(statusJson(dir).marks))

  const fixed = ledgerCmd(dir, 'set', ['--id', 'P90', '--status', 'confirmed', '--tag', 'said-by-user'])
  assert.strictEqual(fixed.status, 0,
    'test setup requires `ledger set` to flip P90 to confirmed/said-by-user: ' + fixed.stdout + fixed.stderr)

  const accepted = mark(dir, 'kit-signed')
  assert.strictEqual(accepted.status, 0,
    'once the blocking row is confirmed said-by-user, --mark kit-signed must accept exactly as it would with no ledger row at all: ' + accepted.stdout + accepted.stderr)
  assert.ok(statusJson(dir).marks.kitSignedOff,
    'an accepted kit-signed mark must set marks.kitSignedOff: ' + JSON.stringify(statusJson(dir).marks))
})
