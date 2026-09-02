'use strict'
// Read-load budget: what a /spec command actually loads into the session before it acts —
// its own command file plus the doctrine sections `spec-paths shared-for <cmd>` prints.
// Generalizes the three ad-hoc line caps that already exist (design.md ≤160 in
// design-doctrine.test.js, genesis.md ≤120 in genesis-doctrine.test.js) into one budget per
// command, measured through the real binary so the number is the load, not a guess — this
// pins that procedure growth cannot happen silently; a grandfathered ratchet may only shrink.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const COMMANDS = path.join(ROOT, 'spec', 'commands')
const SPEC_PATHS = path.join(ROOT, 'spec', 'bin', 'spec-paths')

const CAP = 500
// Grandfathered ratchets: may shrink, never grow. Delete the entry once the command fits CAP.
const RATCHET = { init: 970 }

function lines(text) { return text.split('\n').length }

function readLoad(cmd) {
  const own = lines(fs.readFileSync(path.join(COMMANDS, cmd + '.md'), 'utf8'))
  const shared = lines(execFileSync(SPEC_PATHS, ['shared-for', cmd], { encoding: 'utf8' }))
  return { own, shared, total: own + shared }
}

const commands = fs.readdirSync(COMMANDS).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))

test('every /spec command has a read-load budget entry (cap or grandfathered ratchet)', () => {
  assert.ok(commands.length >= 10, 'expected the command roster, got ' + commands.length)
  for (const extra of Object.keys(RATCHET)) {
    assert.ok(commands.includes(extra), 'RATCHET names a command that no longer exists: ' + extra)
  }
})

for (const cmd of commands) {
  const limit = RATCHET[cmd] || CAP
  test(`read-load budget: /spec:${cmd} loads ≤ ${limit} lines (command file + shared-for sections)`, () => {
    const { own, shared, total } = readLoad(cmd)
    assert.ok(total <= limit,
      `/spec:${cmd} loads ${total} lines (own ${own} + shared ${shared}) > ${limit}. ` +
      'Procedure belongs in a driver script that prints one step; prose states contracts ' +
      '(core § Doctrine Authoring). Shrink the command or move the mechanism into spec/scripts/.')
  })
}

test('shared-for prints only sections for a known command (an unknown command falls open to both files)', () => {
  const known = lines(execFileSync(SPEC_PATHS, ['shared-for', 'status'], { encoding: 'utf8' }))
  const unknown = lines(execFileSync(SPEC_PATHS, ['shared-for', 'no-such-command'], { encoding: 'utf8' }))
  assert.ok(known < unknown, 'the section filter should load less than the fail-open whole-file fallback')
})
