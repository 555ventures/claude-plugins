'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { run, stateOf, returnFileWith, oneFixReturnFile, readJsonl, readSidecar, overrideLeg, makeHost, makeWorktreeHost, driveToCapEdge } = require('./escalate-row.fixtures')

// Shard H of the escalate-row family (escalate-row-step.test.js, split from
// escalate-row.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns
// specs/20260822/01-escalate-ledger-row.md AC-20260822-01-8/-9/-12/-13 (the ESCALATE step's
// bare-invocation, retryable-drift, and durable-row mechanics). Shared helpers live in
// escalate-row.fixtures.js (D2).

test('AC-20260822-01-8 (also AC-20260901-09-2): WHEN the driver is invoked bare with marks.escalated set and no escalateRunId THE SYSTEM SHALL self-heal by appending the row then, and print the ESCALATE step', () => {
  const host = makeHost('esc-ac8')
  driveToCapEdge(host.root, host.spec)
  // Simulate the crash-between-refusal-and-write case directly (D5's own rationale: "the
  // abandonment path never re-invokes" — the refusal is the last guaranteed execution moment) by
  // hand-setting the mark WITHOUT ever calling the real capping fix-applied, mirroring this
  // suite's own established idiom of hand-editing review-state.json to reach an exact
  // precondition the CLI cannot construct directly (AC-20260820-07-8's manifest-provable-cap test).
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const marks = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  marks.escalated = true
  fs.writeFileSync(stateFile, JSON.stringify(marks, null, 2) + '\n')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'setup precondition: escalated:true with pendingFix:true must derive state ESCALATE before the self-heal can be exercised')

  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledgerPath).filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(before.length, 0,
    'setup precondition: no escalate row must exist yet — the hand-set mark never went through the real write point, so self-heal is what has to append the FIRST row')

  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a bare invocation at ESCALATE must exit 0 (step printed): ' + r.stdout + r.stderr)
  assert.match(r.stdout, /ESCALATE/, 'the bare invocation must print the ESCALATE step: ' + r.stdout)

  const after = readJsonl(ledgerPath).filter((r2) => r2.spec === host.specRel && r2.escalated === true)
  assert.strictEqual(after.length, 1,
    'the self-heal must append exactly one escalated:true row on this bare invocation — a session that hits the cap and walks away, then returns later with no fix-applied re-attempt, must still get a durable record: ' + JSON.stringify(after))

  const sidecar = readSidecar(host.sidecar)
  assert.ok(sidecar.escalateRunId, 'the self-heal must record escalateRunId once it succeeds, same as the direct write point: ' + JSON.stringify(sidecar))
})

test('AC-20260822-01-9 (also AC-20260901-09-2): WHEN the escalate verdict pass exits 2 because a red leg drifted green between the dispositions pass and the cap (deriving CLEAN) THE SYSTEM SHALL embed the verdict error in the refusal output, append no row, leave escalateRunId unset, and keep marks.escalated true so the next invocation can retry', () => {
  const host = makeHost('esc-ac9')
  const emptyReturn = () => ({ verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10 })

  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: green legs must reach REVIEWER: ' + r0.stdout + r0.stderr)

  // Cycles 1 and 2: inject a red skip-reconcile finding into each manifest right after it is
  // created (before dispositions reads it) so a 0-survivor return can still justify
  // fix-dispatched 1 — the real fix-delta rerun each cycle produces naturally leaves
  // skip-reconcile genuinely green again, exactly the "red leg, then green" drift this AC pins.
  for (let cycle = 1; cycle <= 2; cycle++) {
    const n = cycle // manifest-<n> is current entering this loop iteration
    overrideLeg(path.join(host.sidecar, `manifest-${n}.jsonl`), 'skip-reconcile', 1, { skipped: 1, sanctioned: 0 })
    const rf = returnFileWith('esc-ac9-' + cycle, emptyReturn())
    run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
    // AC-20260901-09-2: the pool here is the injected leg finding (leg:skip-reconcile), not a
    // survivor — the disposer return's ref must name it exactly.
    const dispFile = oneFixReturnFile('esc-ac9-disp-' + cycle, 'leg:skip-reconcile')
    const d = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
    assert.strictEqual(stateOf(host.root, host.spec), 'FIX',
      `setup cycle ${cycle}: the injected red skip-reconcile finding must justify fix-dispatched 1: ` + d.stdout + d.stderr)
    const f = run(host.root, host.spec, '--mark', 'fix-applied')
    assert.strictEqual(f.status, 0, `setup cycle ${cycle}: fix-applied within the cap must succeed: ` + f.stdout + f.stderr)
  }

  // Third (final) cycle: inject red skip-reconcile again into manifest-3 and record dispositions
  // against it — waived 0, rejected 0, fixDispatched 1 (pool 1, sum 1, fits).
  overrideLeg(path.join(host.sidecar, 'manifest-3.jsonl'), 'skip-reconcile', 1, { skipped: 1, sanctioned: 0 })
  const rf3 = returnFileWith('esc-ac9-3', emptyReturn())
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf3)
  const dispFile3 = oneFixReturnFile('esc-ac9-disp-3', 'leg:skip-reconcile')
  const d3 = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile3, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX',
    'setup: the third dispositions must land FIX, poised for the capping fix-applied: ' + d3.stdout + d3.stderr)

  // Drift: AFTER dispositions recorded waived:0/rejected:0 against a pool of 1 (the injected red
  // skip-reconcile), the SAME manifest-3.jsonl is overridden green — the recomputed pool at the
  // escalate pass shrinks to 0, and waived:0+rejected:0+fixDispatched:0(forced) already covers it.
  overrideLeg(path.join(host.sidecar, 'manifest-3.jsonl'), 'skip-reconcile', 0, { skipped: 0, sanctioned: 0 })

  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledgerPath)

  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'the capping fix-applied must still exit 2 — the cap refusal stands regardless of what the escalate verdict pass derives: ' + thirdFix.stdout + thirdFix.stderr)
  const combined = thirdFix.stdout + thirdFix.stderr
  assert.match(combined, /iteration cap 2/,
    'the refusal must still name the iteration cap — D8\'s drift handling must never replace the base cap message: ' + combined)
  assert.match(combined, /derived CLEAN under --escalated/,
    'the refusal must embed the verdict.js drift error verbatim — a session hitting the cap needs to see WHY no row was written, not just that it was refused: ' + combined)

  const after = readJsonl(ledgerPath)
  assert.strictEqual(after.length, before.length,
    'a drift-refused escalate pass must append NO row — printing a CLEAN-tainted or otherwise fabricated row would be worse than printing nothing: ' + JSON.stringify({ before, after }))

  const sidecar = readSidecar(host.sidecar)
  assert.ok(!sidecar.escalateRunId,
    'escalateRunId must stay unset after a drift refusal — a set value here would falsely tell a later self-heal that the write already succeeded: ' + JSON.stringify(sidecar))
  assert.strictEqual(sidecar.escalated, true,
    'marks.escalated must remain true — the cap refusal itself still stands and must not be undone by the drifted verdict pass: ' + JSON.stringify(sidecar))
})

test('AC-20260822-01-12 (also AC-20260901-09-2): WHEN the driver prints the ESCALATE step THE SYSTEM SHALL name the waive/reject close route, the abandon route, and the absolute ledger path the escalate row landed in', () => {
  const host = makeHost('esc-ac12')
  driveToCapEdge(host.root, host.spec)
  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2, 'setup: the capping fix-applied must be refused: ' + thirdFix.stdout + thirdFix.stderr)

  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE', 'setup precondition: state must be ESCALATE for this AC: ' + r.stdout + r.stderr)

  assert.match(r.stdout, /dispositions --fix-dispatched 0/,
    'the ESCALATE step must name the waive/reject route — a fresh --mark dispositions --fix-dispatched 0 covering the pool closes normally, and today\'s ESCALATE text names no exit at all: ' + r.stdout)
  assert.match(r.stdout, /delete/i,
    'the ESCALATE step must name the abandon route (delete the sidecar and manifests to restart cold): ' + r.stdout)
  assert.match(r.stdout, /\.review/,
    'the abandon route must literally name the <spec>.review sidecar directory to delete: ' + r.stdout)
  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  assert.ok(r.stdout.includes(ledgerPath),
    'the ESCALATE step must name the absolute path the escalate row actually landed in — a session cannot judge or audit evidence it was never told the location of: ' + r.stdout)
})

test('AC-20260822-01-13 (also AC-20260901-09-2): WHEN the sidecar records a durable escalate ledger path but no row for this spec+runId is readable there THE SYSTEM SHALL print one stderr warning naming the spec, runId, and path, with the exit status and printed step identical to the no-warning run', () => {
  const host = makeWorktreeHost({ name: 'esc-ac13', ignoreStopped: true })
  driveToCapEdge(host.wt, host.spec)
  const thirdFix = run(host.wt, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2, 'setup: the capping fix-applied must be refused: ' + thirdFix.stdout + thirdFix.stderr)

  const sidecar = readSidecar(host.sidecar)
  assert.ok(sidecar.escalateRunId && sidecar.escalateLedgerPath,
    'setup precondition: the escalate write must have landed durably before this AC can exercise its loss: ' + JSON.stringify(sidecar))

  const r1 = run(host.wt, host.spec)
  assert.strictEqual(r1.status, 0, 'setup: a bare re-invocation with the row intact must exit 0: ' + r1.stdout + r1.stderr)

  const stoppedPath = sidecar.escalateLedgerPath
  const lines = fs.readFileSync(stoppedPath, 'utf8').trim().split('\n').filter(Boolean)
  const kept = lines.filter((l) => { const row = JSON.parse(l); return !(row.spec === host.specRel && row.runId === sidecar.escalateRunId) })
  assert.ok(kept.length < lines.length, 'setup: the escalate row must actually be removable from the durable file to simulate its loss')
  fs.writeFileSync(stoppedPath, kept.length ? kept.join('\n') + '\n' : '')

  const r2 = run(host.wt, host.spec)
  assert.strictEqual(r2.status, r1.status,
    'the silent-loss detector must never block or change the exit status — a partial dead-letter observation must not itself become a new failure: ' + JSON.stringify({ r1status: r1.status, r2status: r2.status, r2out: r2.stdout + r2.stderr }))
  assert.strictEqual(r2.stdout, r1.stdout,
    'the printed step must be byte-identical to the no-warning run — the detector is stderr-only and must never alter the step text: ' + JSON.stringify({ r1: r1.stdout, r2: r2.stdout }))
  assert.match(r2.stderr, new RegExp(host.specRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the warning must name the spec whose durable row went missing: ' + r2.stderr)
  assert.match(r2.stderr, new RegExp(sidecar.escalateRunId),
    'the warning must name the runId whose row is unreadable — without it a session cannot correlate the warning to a specific run: ' + r2.stderr)
  assert.match(r2.stderr, new RegExp(stoppedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the warning must name the durable path that was checked, so the loss is diagnosable: ' + r2.stderr)
  assert.doesNotMatch(r1.stderr, new RegExp(sidecar.escalateRunId),
    'sanity: the FIRST bare invocation (row still present) must not have printed this warning — otherwise the detector would be firing unconditionally, not on genuine loss: ' + r1.stderr)
})
