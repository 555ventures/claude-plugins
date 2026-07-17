'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// PRAX-20260717-01: genesis-architect's ops-conventions ADR dictation is a closed row
// list, and executors fill dictated rows reliably but exceed the list only by luck (prax
// added a dependency-currency row from research, yet still missed both categories below —
// each of which produced a live incident there: the run_id/runId seam contradiction written
// into ADR-0012's own Logging row, three divergent id spellings across byte-locked
// artifacts, a +00:00 timestamp defect caught only by execution-grounded review, and a
// bigint ledger amount with no JSON representation). The dictated list is the reliable
// floor, so both categories must be rows in it.

const architect = fs.readFileSync(path.join(SPEC, 'commands/genesis-architect.md'), 'utf8')

// The ops-conventions step: from its bold header to the next numbered step.
const step = (() => {
  const start = architect.indexOf('**Write the ops-conventions ADR**')
  assert.ok(start !== -1, 'ops-conventions ADR step missing from genesis-architect Phase A')
  const rest = architect.slice(start)
  const end = rest.search(/\n\d+\. /)
  return end === -1 ? rest : rest.slice(0, end)
})()

test('ops-conventions dictation includes a naming & identifiers row', () => {
  assert.match(step, /naming/i, 'no naming row: table/column/value casing goes undecided')
  assert.match(step, /id[- ]minting|identifier/i,
    'no id-minting clause: ids get improvised per spec and pinned by first write')
  assert.match(step, /generator|prefix/i,
    'the row must force the one-generator-module + prefix-grammar decision, not just casing')
})

test('ops-conventions dictation includes a wire-representations row', () => {
  assert.match(step, /wire represent/i,
    'no wire-representations row: JSON form of non-native types is guessed under deadline')
  assert.match(step, /timestamp/i,
    'timestamp form (UTC-only vs offsets) shipped as a cross-plane defect unforced by any row')
  assert.match(step, /bigint|non-JSON-native/i,
    'bigint/decimal wire form is the highest-cost unforced representation decision')
  assert.match(step, /seam/i,
    'representation decisions belong to the contracts seam, or the row contradicts it later')
})

// 2026-07-17 follow-through: floor-not-ceiling licenses executors to exceed the list but
// gives them no way to do it reliably — prax exceeded it exactly once, by luck. The step
// must state the GENERATING QUESTION the rows are samples of, and run an advisory
// derive-then-check pass against it, with the same-model correlation caveat stated (the
// coverage checker shares the deriver's blind spots — that is why it advises, never blocks).
test('the row list states its generating question with an advisory derivation pass', () => {
  assert.match(step, /generating question/i,
    'no generating question: executors can only exceed the sampled rows by luck')
  assert.match(step, /derive/i,
    'the generating question must be exercised — a derivation pass, not a motto')
  assert.match(step, /blind spot|correlat/i,
    'the coverage check shares the deriver blind spots; the caveat must be stated')
  assert.match(step, /advisor/i,
    'derive-then-check is advisory — same-model coverage cannot gate')
})

test('the row list is a floor and DECIDED rows must be checker-enforceable', () => {
  assert.match(step, /floor, not a ceiling|floor — not a ceiling/i,
    'prax exceeded the closed list once by luck; nothing licenses executors to add rows')
  assert.match(step, /checker-enforceable/i,
    'a naming rule with a taste clause cannot be mechanized by /spec:enforce')
  assert.match(step, /taste/i,
    'the rejected taste variant belongs in Dissents, not in the rule')
})
