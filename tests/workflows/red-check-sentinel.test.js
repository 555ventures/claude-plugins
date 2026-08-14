'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260813/05-workflow-correctness-repairs.md D4 (AC-20260813-05-6, -14). Today the
// red-check phase's only proof that newly authored tests actually fail rides the gate-check
// agent's own reading of raw command stdout — the exact false-green hole the Gate phase 40 lines
// below closes with exit-code-only sentinel discipline. D4 gives the red-check the same
// discipline: per-file `<testCommand> <path> && echo AUDIT_GREEN:<path> || echo AUDIT_RED:<path>`
// sentinel commands, a `sentinels` array on the RED schema, and a cross-check treating any
// mismatched/missing sentinel as UNVERIFIED red. The sanctioned-green-carriers path (no agent
// runs — pinned by tests/redcheck-green-carriers.test.js) is exempt: its hand-built `red` literal
// gains `sentinels: null`, and the cross-check skips `null`.

const src = read('spec/workflows/src/wf-build.body.js')

const redCheckStart = src.indexOf("phase('RedCheck')")
assert.ok(redCheckStart !== -1, 'RedCheck phase missing from wf-build source')
const redBlock = src.slice(redCheckStart, src.indexOf('FAIL CLOSED', redCheckStart))

test('AC-20260813-05-6: the red-check prompt mandates per-file AUDIT_RED/AUDIT_GREEN sentinel commands', () => {
  assert.match(redBlock, /AUDIT_RED:/,
    'the red-check prompt must instruct the agent to run a per-file sentinel command ending in ' +
    '`|| echo AUDIT_RED:<path>` — without a machine-checkable sentinel, "red" rests entirely on ' +
    'the model reading stdout, the exact false-green hole the Gate phase\'s sentinel already closes')
  assert.match(redBlock, /AUDIT_GREEN:/,
    'the sentinel command must also emit AUDIT_GREEN:<path> on the passing branch so a sanctioned ' +
    'green-expected carrier\'s pass state is equally machine-checkable, not just read off stdout')
})

test('AC-20260813-05-6: the RED schema requires a sentinels array reported alongside each mismatch', () => {
  const schemaStart = src.indexOf('const RED = {')
  assert.ok(schemaStart !== -1, 'RED schema missing from wf-build source')
  const schemaEnd = src.indexOf('\n}\n', schemaStart)
  const schema = src.slice(schemaStart, schemaEnd)
  assert.match(schema, /sentinels/,
    'the RED schema must gain a `sentinels: [{path, sentinel}]` field the agent reports its ' +
    'observed sentinel lines into — with no such field the workflow has nothing to cross-check ' +
    'the agent\'s per-file verdict against')
})

test('AC-20260813-05-6: the workflow cross-checks reported state against the sentinel and treats a mismatch or missing sentinel as unverified red', () => {
  assert.match(redBlock, /sentinel/i,
    'the RedCheck block must cross-check each file\'s reported red/green state against its ' +
    'observed sentinel line before trusting the agent\'s verdict — today nothing in this block ' +
    'mentions a sentinel at all')
  assert.match(redBlock, /unverified/i,
    'a file whose reported state has no matching sentinel (or a mismatched one) must be treated ' +
    'as an UNVERIFIED red state — the same fail-closed standing a null red-check result already ' +
    'gets, not a silent pass-through')
})

test('AC-20260813-05-14: the sanctioned-green-carriers hand-built red literal gains sentinels: null so the cross-check exempts it', () => {
  const literalStart = src.indexOf('let red = {')
  assert.ok(literalStart !== -1, 'the sanctioned-green-carriers hand-built `red` literal is missing from wf-build source')
  const literalEnd = src.indexOf('\n', literalStart)
  const literal = src.slice(literalStart, literalEnd)
  assert.match(literal, /sentinels:\s*null/,
    'the hand-built literal for the all-sanctioned-green-carriers path (no red-check agent runs — ' +
    'pinned by tests/redcheck-green-carriers.test.js) must carry `sentinels: null` so the new ' +
    'sentinel cross-check can recognize and skip this agent-less path instead of treating its ' +
    'absent sentinels as an unverified mismatch')
})
