'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { run, stateOf, returnFileWith, oneFixReturnFile, reviewerReturn, readJsonl, makeHost, driveToCapEdge } =
  require('./escalate-row.fixtures')

// core § Incident Policy same-session fix: the ESCALATE step's abandon exit ("delete <spec>.review
// to restart cold") deletes the manifest files the fix cap is counted from, so a cold restart alone
// would begin at zero and one spec could escalate repeatedly as unrelated first reviews. The
// escalate rows those refusals write are the durable record the cap reads. These tests drive the
// driver's OWN documented remedy and pin that the count survives it.
//
// specs/20260909/05-fix-delta-reviewer-pass.md D2/AC-20260909-05-6 (A2): a fix-applied call that
// is NOT the capping call (i.e. not preceded by driveToCapEdge()) now needs a real,
// content-preserving edit to src/foo.js first, or the driver refuses it on an empty delta before
// it ever reaches the cap-cleared/other-spec logic these two tests pin.

function reviewerThenFixDispatched(root, spec, tag) {
  run(root, spec, '--mark', 'reviewer-returned', '--file', returnFileWith(tag, reviewerReturn()))
  return run(root, spec, '--mark', 'dispositions', '--file', oneFixReturnFile(tag + '-disp', 's0'),
    '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
}

test('durable cap: WHEN a capped review is abandoned by deleting the sidecar (the ESCALATE step\'s own remedy) and the spec is reviewed again cold THE SYSTEM SHALL refuse the restarted review\'s FIRST fix-applied, append a second escalated:true row, and name the earlier escalate row in the refusal', () => {
  const host = makeHost('esc-durable-restart')
  driveToCapEdge(host.root, host.spec)
  const capped = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(capped.status, 2, 'setup: the capping fix-applied must be refused: ' + capped.stdout + capped.stderr)
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledger).filter((r) => r.escalated === true)
  assert.strictEqual(before.length, 1, 'setup: exactly one escalate row after the first cap')

  // The documented abandon exit.
  const step = run(host.root, host.spec)
  assert.match(step.stdout, /does NOT reset the cap/,
    'the ESCALATE step must say plainly that abandoning does not reset the cap: ' + step.stdout)
  fs.rmSync(host.sidecar, { recursive: true, force: true })

  // Cold restart: legs run fresh, reviewer returns, a fix is dispatched — the FIRST fix-applied of
  // this restarted review is already over the cap because the ledger remembers the spent one.
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'cold restart must reach REVIEWER')
  const d = reviewerThenFixDispatched(host.root, host.spec, 'esc-durable-r1')
  assert.match(d.stderr, /cap .* is already spent/,
    'dispositions --fix-dispatched 1 into a spent cap must warn on stderr before workers are dispatched: ' + d.stderr)
  const first = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(first.status, 2,
    'the restarted review\'s first fix-applied must be refused — before this fix it succeeded and the spiral continued: ' + first.stdout + first.stderr)
  assert.match(first.stderr + first.stdout, /cap was already spent: 1 earlier escalate row/,
    'the refusal must name the earlier escalate row so the session sees this is a repeat, not a first review: ' + first.stderr)
  assert.ok((first.stderr + first.stdout).includes(before[0].runId), 'the refusal must cite the earlier row\'s runId')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE')
  const after = readJsonl(ledger).filter((r) => r.escalated === true)
  assert.strictEqual(after.length, 2, 'the repeat refusal appends its own escalate row (the count keeps climbing, never resets)')
  assert.notStrictEqual(after[1].runId, after[0].runId, 'the restarted review has its own runId')
})

test('durable cap: WHEN an earlier escalate row for the spec is followed by a non-escalated review row (a waive/reject close) THE SYSTEM SHALL treat the cap as cleared and accept the next review\'s first fix-applied', () => {
  const host = makeHost('esc-durable-cleared')
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  const esc = { ts: '2026-09-01', spec: host.specRel, stage: 'review', runId: 'rv_old_escalate', verdict: 'SURVIVORS', escalated: true, iteration: 3 }
  const close = { ts: '2026-09-02', spec: host.specRel, stage: 'review', runId: 'rv_old_escalate', verdict: 'CLEAN', iteration: 4 }
  fs.writeFileSync(ledger, JSON.stringify(esc) + '\n' + JSON.stringify(close) + '\n')

  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER')
  const d = reviewerThenFixDispatched(host.root, host.spec, 'esc-durable-c1')
  assert.doesNotMatch(d.stderr, /already spent/, 'a cleared escalation must not warn: ' + d.stderr)
  // AC-20260909-05-6 (A2): a real, content-preserving edit so fix-applied never sees an empty delta.
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42 // durable cleared\n')
  const first = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(first.status, 0,
    'a closed escalation is history, not a spent cap — the first fix-applied of a later review must succeed: ' + first.stdout + first.stderr)
})

test('durable cap: WHEN an uncleared escalate row exists for a DIFFERENT spec THE SYSTEM SHALL not count it against this spec', () => {
  const host = makeHost('esc-durable-other')
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  const esc = { ts: '2026-09-01', spec: 'specs/20260901/99-other.md', stage: 'review', runId: 'rv_other', verdict: 'SURVIVORS', escalated: true, iteration: 3 }
  fs.writeFileSync(ledger, JSON.stringify(esc) + '\n')
  run(host.root, host.spec)
  reviewerThenFixDispatched(host.root, host.spec, 'esc-durable-o1')
  // AC-20260909-05-6 (A2): a real, content-preserving edit so fix-applied never sees an empty delta.
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42 // durable other-spec\n')
  const first = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(first.status, 0, 'another spec\'s escalation is not this spec\'s: ' + first.stdout + first.stderr)
})
