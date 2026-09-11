'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260910/05-what-the-journey-does-not-do.md D8, AC-20260910-05-9: recreated after the
// prior 751-line doctrine sweep of the same name was retired as an expired test of closed
// specs — this file carries only this spec's own AC-9 pins.

function section(text, heading) {
  const re = new RegExp('^## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b.*$', 'm')
  const m = re.exec(text)
  if (!m) return null
  const rest = text.slice(m.index + m[0].length)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

test('AC-20260910-05-9: spec/doctrine/mocks.md names the exclusion kind under § Provenance Ledger and `ledger derive` under § Mocks: Client Player', () => {
  const p = path.join(ROOT, 'spec/doctrine/mocks.md')
  assert.ok(fs.existsSync(p), 'AC-9: spec/doctrine/mocks.md must exist — its absence fails this pin once, per the fs.existsSync guard convention: not found at ' + p)
  const text = read('spec/doctrine/mocks.md')
  const ledgerSec = section(text, 'Provenance Ledger')
  assert.ok(ledgerSec, 'AC-9: § Provenance Ledger must exist in spec/doctrine/mocks.md — its absence means the heading itself moved or was renamed')
  assert.match(ledgerSec, /exclusion/,
    'AC-9: § Provenance Ledger must name the "exclusion" kind in its kind sentence — its absence leaves the new D1 kind undocumented: got\n' + ledgerSec)
  const playerSec = section(text, 'Mocks: Client Player')
  assert.ok(playerSec, 'AC-9: § Mocks: Client Player must exist in spec/doctrine/mocks.md')
  assert.match(playerSec, /ledger derive/,
    'AC-9: § Mocks: Client Player must name `ledger derive` — its absence leaves the client\'s last-screen confirm undocumented as tied to the derived ledger: got\n' + playerSec)
})

test('AC-20260910-05-9: spec/doctrine/genesis.md names "Parking lot" beside "exclusion" under § Genesis: Roadmap Decomposition', () => {
  const p = path.join(ROOT, 'spec/doctrine/genesis.md')
  assert.ok(fs.existsSync(p), 'AC-9: spec/doctrine/genesis.md must exist: not found at ' + p)
  const text = read('spec/doctrine/genesis.md')
  const sec = section(text, 'Genesis: Roadmap Decomposition')
  assert.ok(sec, 'AC-9: § Genesis: Roadmap Decomposition must exist in spec/doctrine/genesis.md — its absence means the heading itself moved or was renamed')
  assert.match(sec, /Parking lot/,
    'AC-9: § Genesis: Roadmap Decomposition must name "Parking lot": got\n' + sec)
  assert.match(sec, /exclusion/,
    'AC-9: § Genesis: Roadmap Decomposition must also name "exclusion" beside the parking-lot requirement — its absence leaves D6\'s roadmap-written refusal undocumented: got\n' + sec)
})

// specs/20260911/04-the-client-loop.md D9: the CLIENT server is the user's own long-lived
// process, never started/stopped/probed by any script but the CLIENT step's own answering line
// — three doctrine sections and one command file each gain a literal naming that rule. Unbuilt
// against the pre-image (D9's prose has not landed): every assertion below is red until it does.
test('AC-20260911-04-13: spec/doctrine/mocks.md names the user-owned CLIENT server and the client player\'s six derived states, and spec/commands/mocks.md names the pickup loop and the authoring-only look rule', () => {
  const doctrinePath = path.join(ROOT, 'spec/doctrine/mocks.md')
  assert.ok(fs.existsSync(doctrinePath), 'AC-13: spec/doctrine/mocks.md must exist: not found at ' + doctrinePath)
  const doctrine = read('spec/doctrine/mocks.md')
  const lookSec = section(doctrine, 'Mocks: Look and Serve')
  assert.ok(lookSec, 'AC-13: § Mocks: Look and Serve must exist in spec/doctrine/mocks.md')
  assert.match(lookSec, /the user's own process/,
    'AC-13: § Mocks: Look and Serve must state the CLIENT server is "the user\'s own process" — D9 is unbuilt: got\n' + lookSec)

  const playerSec = section(doctrine, 'Mocks: Client Player')
  assert.ok(playerSec, 'AC-13: § Mocks: Client Player must exist in spec/doctrine/mocks.md')
  for (const literal of ['changes-requested', 'fixed', 'ok', 'Still not right', 'Looks good', 'reopens']) {
    assert.ok(playerSec.includes(literal),
      'AC-13: § Mocks: Client Player must name "' + literal + '" among the client player\'s six derived states/controls — D9 is unbuilt: got\n' + playerSec)
  }

  const commandsPath = path.join(ROOT, 'spec/commands/mocks.md')
  assert.ok(fs.existsSync(commandsPath), 'AC-13: spec/commands/mocks.md must exist: not found at ' + commandsPath)
  const commands = read('spec/commands/mocks.md')
  assert.match(commands, /what the client left/,
    'AC-13: spec/commands/mocks.md must name "what the client left" (the CLIENT step\'s pickup block) — D9 is unbuilt: got the full file with no match')
  assert.match(commands, /authoring states only/,
    'AC-13: spec/commands/mocks.md\'s look-rule sentence must gain "authoring states only" — D9 is unbuilt: got the full file with no match')
})

test('AC-20260910-05-9: spec/commands/mocks.md names exclusions.md', () => {
  const p = path.join(ROOT, 'spec/commands/mocks.md')
  assert.ok(fs.existsSync(p), 'AC-9: spec/commands/mocks.md must exist: not found at ' + p)
  const text = read('spec/commands/mocks.md')
  assert.match(text, /exclusions\.md/,
    'AC-9: spec/commands/mocks.md must name "exclusions.md" — its absence leaves the D7 artifact undocumented for a session reading the command: got the full file with no match')
})
