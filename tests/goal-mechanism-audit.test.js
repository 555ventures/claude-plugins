'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// JJ-20260720-01 (Fable hardening-review brief, 2026-07-20): a Sonnet-planned spec promised
// an outcome in its Goal that no locked Decision delivered; the ACs — written from the
// Decisions, not the Goal — stayed green in the mechanism's absence, and the Phase 3
// refuters never flagged it because refuters attack claims the spec makes, not promises it
// makes without a mechanism. Nothing downstream catches the class either: build and review
// verify diff-against-spec, never spec-against-goal. The fix contract: plan.md's Phase 4
// lock confirmation must trace every Goal promise to a Decision that delivers it and an AC
// that goes red in that Decision's absence, and block lock when either is missing. The
// guard is an in-session lock bullet — no emitted table, no agent dispatch (the brief's
// heavier forms — per-spec escape-ledger worklists, an optional expensive-model T3 pass —
// were rejected at intake; see INTAKE.md).

const plan = fs.readFileSync(path.join(SPEC, 'commands/plan.md'), 'utf8')

// The lock phase: from the Phase 4 header to the next phase header or EOF.
const lockBlock = (() => {
  const start = plan.indexOf('## Phase 4')
  assert.ok(start !== -1, 'Phase 4 — Lock section missing from plan.md')
  const rest = plan.slice(start)
  const end = rest.slice(2).search(/\n## /)
  return end === -1 ? rest : rest.slice(0, end + 2)
})()

test('lock confirmation audits Goal promises against delivering Decisions', () => {
  assert.match(lockBlock, /Goal promise|promise in the Goal|every promise/i,
    'no Goal-promise clause: a spec can promise an outcome no Decision delivers and ' +
    'still lock — ACs written from Decisions stay green in the mechanism\'s absence')
  assert.match(lockBlock, /Decision that delivers|delivering Decision|Decision.{0,40}delivers/i,
    'the audit must name the mechanism: the Decision that delivers each promise')
})

test('the audit demands a red-capable AC and blocks lock without one', () => {
  assert.match(lockBlock, /red|fails? in.{0,20}absence/i,
    'a mechanism no AC can catch missing is unverified — the audit needs the AC that ' +
    'goes red when the Decision is absent')
  assert.match(lockBlock, /blocks lock|lock is blocked|cannot lock/i,
    'an advisory audit is a rubber stamp — a promise with no mechanism, or a mechanism ' +
    'with no red-capable AC, must block lock')
})
