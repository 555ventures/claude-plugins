'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./helpers')

// Doctrine-diff review panel: doctrine is the one artifact class in the system
// that gets no adversarial pass — host code gets a diff-scaled review panel, doctrine changes
// get `npm test` (regex pins on past incidents) and a sole author's read. Both independent
// design reviews of the v7 hypothesis converged on this as the true residue: the recurring
// gap classes (closed lists, ambiguous stage ownership, unstated seam decisions) are
// write-time-detectable by an executor-perspective reviewer, but every instance so far was
// detected in a host, after a live incident. The panel is dev tooling (this repo only, not
// shipped) and enters ADVISORY per the scaffold-ledger lifecycle — the T3-checkpoint and
// refutation-filter retirements are the measured evidence against shipping it as a gate.

const CMD = path.join(ROOT, '.claude/commands/doctrine-review.md')

test('doctrine-review dev command exists', () => {
  assert.ok(fs.existsSync(CMD),
    'no .claude/commands/doctrine-review.md: doctrine diffs still ship on npm test alone')
})

const cmd = fs.existsSync(CMD) ? fs.readFileSync(CMD, 'utf8') : ''

test('panel reviews the doctrine diff from the executor perspective', () => {
  assert.match(cmd, /spec\/commands|spec\/doctrine/,
    'panel must scope to the shipped doctrine surfaces')
  assert.match(cmd, /context-free|stranger/i,
    'the reviewer lens is a faithful-but-context-free executor, not a co-author')
  assert.match(cmd, /under-deliver|improvise/i,
    'question 1: where does an executor under-deliver or improvise against this text?')
  assert.match(cmd, /contradict/i,
    'question 2: does the diff contradict any other command or doctrine surface?')
  assert.match(cmd, /uncorrelated|independent/i,
    'reviewers must be uncorrelated — shared context reproduces the author blind spot')
})

test('panel is advisory and diffs against the last shipped version', () => {
  assert.match(cmd, /advisory/i,
    'ships ADVISORY per scaffold-ledger lifecycle; promotion needs a measured catch')
  assert.match(cmd, /never blocks|does not block/i,
    'verdicts are reported, never bump-blocking, until the ledger promotes')
  assert.match(cmd, /plugin\.json/,
    'diff base is the last commit that bumped spec/.claude-plugin/plugin.json')
})
