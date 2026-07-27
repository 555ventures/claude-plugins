'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// HEARWELL-20260721-02: `rulesEnforcementHash` never matched any committed revision of
// `.claude/rules/enforcement.json` — walking hearwell's full history, the stamp
// (b4ebf45ae39c) matches no revision, while the sibling designRulesHash recomputes
// exactly. The stamp is computed against an intermediate state and the manifest is
// written/reformatted afterward, so doctor check 10 reports drift unconditionally: a
// real enforcement change is indistinguishable from the permanent false positive — a
// hash that never matches is not a weaker check, it is no check. Fix contract: the
// stamp is computed from the FINAL on-disk serialization of enforcement.json, after
// the last write, in the same step that writes the config.

const enforce = read('spec/commands/enforce.md')

test('enforce.md pins the hash to the final on-disk manifest, after the last write', () => {
  const i = enforce.indexOf('rulesEnforcementHash')
  assert.ok(i !== -1, 'rulesEnforcementHash missing from enforce.md')
  const section = enforce.slice(Math.max(0, i - 1500), i + 1500)
  assert.match(section, /final|on-disk|after (the )?(last|final) write|re-?read/i,
    'nothing orders the stamp after the manifest\'s final serialization: computing it ' +
    'against an intermediate state makes doctor check 10 fire unconditionally, so the ' +
    'enforcement drift detector is dark from the day it is installed')
})
