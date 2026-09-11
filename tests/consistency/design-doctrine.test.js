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

test('AC-20260910-05-9: spec/commands/mocks.md names exclusions.md', () => {
  const p = path.join(ROOT, 'spec/commands/mocks.md')
  assert.ok(fs.existsSync(p), 'AC-9: spec/commands/mocks.md must exist: not found at ' + p)
  const text = read('spec/commands/mocks.md')
  assert.match(text, /exclusions\.md/,
    'AC-9: spec/commands/mocks.md must name "exclusions.md" — its absence leaves the D7 artifact undocumented for a session reading the command: got the full file with no match')
})
