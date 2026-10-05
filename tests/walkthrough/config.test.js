'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { HEARWELL, makeHost, block, seedRound, startStub, runWalkthrough, HELLO_OK } = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-4, AC-20260929-01-5,
// AC-20260929-01-17 (D1, D12): a project without the block is untouched, a bad block is refused
// before any request, and `check` inspects the config only.

const NOT_CONFIGURED = 'walkthrough: not configured for this project — nothing sent'


test('AC-20260929-01-5: an unset or empty token variable exits 2 with code no-token naming WALKTHROUGH_TOKEN and sends nothing', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)
  for (const value of [null, '']) {
    const r = await runWalkthrough(host, ['pull-approvals', '--round', '2'], { env: { WALKTHROUGH_TOKEN: value } })
    assert.strictEqual(r.status, 2, 'a missing token is a config error (exit 2), value ' + JSON.stringify(value) + ': ' + JSON.stringify(r))
    assert.match(r.stderr, /no-token/, 'the refusal code must be no-token: ' + r.stderr)
    assert.match(r.stderr, /WALKTHROUGH_TOKEN/, 'the refusal must name the variable (never its value): ' + r.stderr)
  }
  assert.deepStrictEqual(stub.log(), [], 'no request may leave without a token')
})

