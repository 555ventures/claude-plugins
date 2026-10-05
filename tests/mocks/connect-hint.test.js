'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fx = require('./wireframe-fixtures')

// specs/20261005/01-connect-wires-a-project-to-the-review-service.md — AC-20261005-01-19 (D14): the
// terminal-confirm step of the mocks driver names /spec:connect when the project has no walkthrough block.

const HINT = '(this project is not connected to the review service — /spec:connect connects it, and the screens are then drawn and sent)'

test('AC-20261005-01-19: the SCREENS terminal-confirm step carries the connect hint for a config with no walkthrough block and never mentions /spec:connect for a connected one', () => {
  const bare = fx.makeRoot({ block: false })
  fx.writeStatus(bare)
  const r = fx.runDriver(bare, [])
  assert.strictEqual(r.status, 0, 'a bare driver run in SCREENS must print the step: ' + r.stderr)
  assert.ok(r.stdout.includes('confirm journey owner-onboarding in the terminal'), 'the terminal-confirm step must still be printed unchanged: ' + r.stdout)
  assert.ok(r.stdout.includes(HINT), 'the terminal-confirm step must name /spec:connect, or the silent fallback to the terminal stays silent: ' + r.stdout)

  const connected = fx.makeRoot({ block: 'http://127.0.0.1:1' })
  fx.writeStatus(connected)
  const c = fx.runDriver(connected, [])
  assert.strictEqual(c.status, 0, 'a bare driver run in SCREENS on a connected host must print the step: ' + c.stderr)
  assert.ok(!c.stdout.includes('/spec:connect'), 'a connected project must never be told to connect, or the hint is noise: ' + c.stdout)
})
