'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { VERDICT, STOPPED_LEDGER_REL, run, stateOf, readJsonl, readSidecar, makeHost, makeWorktreeHost, driveToCapEdge } = require('./escalate-row.fixtures')

// Shard G of the escalate-row family (escalate-row.test.js, split from escalate-row.test.js
// by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns
// specs/20260822/01-escalate-ledger-row.md AC-20260822-01-1..-7 and
// specs/20260824/06-review-range-identity.md AC-20260824-06-7. Shared helpers live in
// escalate-row.fixtures.js (D2).

// ---- verdict.js-level ACs (D1-D4): --escalated behavior, no driver involved --------------------

test('AC-20260822-01-1 (also AC-20260903-02-15, SHALL CONTINUE TO): WHEN verdict.js runs --escalated --fixDispatched 0 --ledger against 1 hard survivor + 1 red at-risk leg with --waived 1 --rejected 0 THE SYSTEM SHALL print HARD_FINDINGS (exit 1) and a ledger row carrying escalated:true and findings.fixDispatched:0', () => {
  const dir = fs.realpathSync(tmpdir('esc-ac1'))
  const manifestPath = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifestPath, [
    { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 } },
    // specs/20260903/02-whole-suite-review-leg.md D6 (AC-20260903-02-15): A3's executed check
    // confirms the pre-image verdict.js ignores this unknown green row entirely, so this pin
    // stays green pre-image.
    { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1035 } },
    { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
    { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
    { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
    { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
    { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
    { leg: 'at-risk', exit: 1, observed: { files: 1, testsExecuted: 5 } },
    { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflowPath, JSON.stringify({
    verdict: 'CLEAN', survivors: [{ severity: 'hard', claim: 'x', file: 'a', line: 1, impact: 'x', evidence: 'x' }],
    killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
  }))
  const retainDir = fs.realpathSync(tmpdir('esc-ac1-retain'))
  const r = runNode(VERDICT, [
    '--manifest', manifestPath, '--workflow', workflowPath,
    '--waived', '1', '--rejected', '0', '--fixDispatched', '0',
    '--escalated', '--ledger', '--spec', 'specs/20260822/99-esc-ac1.md', '--tier', 'standard',
    '--diff-loc', '10', '--iteration', '1', '--run-id', 'rv_esc1test01', '--retain', retainDir,
  ])
  assert.strictEqual(r.status, 1,
    'a 1-hard-survivor + 1-red-at-risk-leg escalate pass with --waived 1 must derive HARD_FINDINGS (exit 1) — a different exit means --escalated is not yet accepted or the derivation regressed: ' + r.stdout + r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'HARD_FINDINGS',
    'stdout line 1 must be the bare derived word HARD_FINDINGS: ' + JSON.stringify(r.stdout))
  assert.ok(lines[1], 'a --ledger --escalated pass must still print the ledger row on stdout line 2: ' + r.stdout)
  const row = JSON.parse(lines[1])
  assert.strictEqual(row.escalated, true,
    'the ledger row must carry escalated:true — this is the ONLY mechanism by which a capped run becomes distinguishable from an ordinary non-CLEAN review row: ' + JSON.stringify(row))
  assert.ok(row.findings && row.findings.fixDispatched === 0,
    'the row\'s findings.fixDispatched must be 0 — the escalate row must never credit a fix that never landed: ' + JSON.stringify(row))
})

test('AC-20260822-01-2: WHEN --escalated is passed with --fixDispatched 1 THE SYSTEM SHALL refuse (exit 2) with a stderr message naming "dispatched fix never landed", checked BEFORE any manifest file I/O', () => {
  const r = runNode(VERDICT, ['--manifest', '/nonexistent/does-not-exist.jsonl', '--escalated', '--fixDispatched', '1'])
  assert.strictEqual(r.status, 2,
    '--escalated with --fixDispatched > 0 must be refused — crediting a fix that never landed fabricates disposition coverage: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /dispatched fix never landed/,
    'the refusal must name the specific rule ("dispatched fix never landed"), never just exit 2 — the pre-image ALSO exits 2 for an unrecognized --escalated flag via the generic usage fallback, so an exit-code-only assert would pass vacuously against unimplemented code: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /cannot read/,
    'the refusal must fire on flag presence alone, before the (nonexistent) --manifest file is ever read — a "cannot read --manifest" message here would mean the check ran too late: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a before-file-I/O refusal must print no verdict word: ' + JSON.stringify(r.stdout))
})

test('AC-20260822-01-3: WHEN --escalated is passed with --profile release THE SYSTEM SHALL refuse (exit 2) with a stderr message naming "drop --escalated", checked BEFORE any manifest file I/O', () => {
  const r = runNode(VERDICT, ['--manifest', '/nonexistent/does-not-exist.jsonl', '--escalated', '--profile', 'release'])
  assert.strictEqual(r.status, 2,
    '--escalated is a review-profile-only fact and must be refused under --profile release: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /drop --escalated/,
    'the refusal must name the specific remedy ("drop --escalated") — a release row carries no runId and no reviewer return, so escalated:true has nothing to key: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /cannot read/,
    'the refusal must fire on flag presence alone, before the (nonexistent) --manifest file is ever read: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a before-file-I/O refusal must print no verdict word: ' + JSON.stringify(r.stdout))
})

test('AC-20260822-01-4 (also AC-20260902-05-2, AC-20260903-02-15, SHALL CONTINUE TO): WHEN --escalated derivation reaches CLEAN (spike S1 Case B: 6 green fix-delta legs + green at-risk, 1 hard survivor, --waived 1 --fixDispatched 0) THE SYSTEM SHALL exit 2, print no verdict word and no ledger line, and name evidence drift on stderr — even though the identical inputs without --escalated derive CLEAN exit 0', () => {
  const dir = fs.realpathSync(tmpdir('esc-ac4'))
  const manifestPath = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifestPath, [
    // specs/20260902/05 D1/D2 (A4 fallback): the pass scope lives on the rows review-legs.js
    // writes (gate/smoke/ci/at-risk stamped fix-delta), never on the reviewer return
    { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 }, scope: 'fix-delta' },
    // specs/20260903/02-whole-suite-review-leg.md D6 (AC-20260903-02-15): suite is required in
    // BOTH scopes (D3), so a fix-delta manifest carries its own row too — A3's executed check
    // confirms the pre-image ignores this unknown green row, so this pin stays green pre-image.
    { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1035 }, scope: 'fix-delta' },
    { leg: 'smoke', exit: 4, observed: { result: 'inert' }, scope: 'fix-delta' },
    { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
    { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
    { leg: 'ci', exit: 0, observed: { conclusion: 'success' }, scope: 'fix-delta' },
    { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
    { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 }, scope: 'fix-delta' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflowPath, JSON.stringify({
    verdict: 'CLEAN', survivors: [{ severity: 'hard', claim: 'x', file: 'a', line: 1, impact: 'x', evidence: 'x' }],
    killed: [], reviewerCount: 1, tokens: 10,
  }))

  // Regression proof this fixture is genuinely CLEAN-bound (never a vacuous rejection): the SAME
  // manifest/workflow/waived WITHOUT --escalated must derive CLEAN exit 0.
  const baseline = runNode(VERDICT, ['--manifest', manifestPath, '--workflow', workflowPath, '--waived', '1', '--rejected', '0', '--fixDispatched', '0'])
  assert.strictEqual(baseline.status, 0, 'setup precondition: this fixture must derive plain CLEAN without --escalated, or the guard below is never actually exercised: ' + baseline.stdout + baseline.stderr)
  assert.strictEqual(baseline.stdout.trim(), 'CLEAN', 'setup precondition: the un-escalated word must be exactly CLEAN: ' + baseline.stdout)

  const retainDir = fs.realpathSync(tmpdir('esc-ac4-retain'))
  const r = runNode(VERDICT, [
    '--manifest', manifestPath, '--workflow', workflowPath,
    '--waived', '1', '--rejected', '0', '--fixDispatched', '0',
    '--escalated', '--ledger', '--spec', 'specs/20260822/99-esc-ac4.md', '--tier', 'standard',
    '--diff-loc', '5', '--iteration', '3', '--run-id', 'rv_esc4test01', '--retain', retainDir,
  ])
  assert.strictEqual(r.status, 2,
    'a derived CLEAN under --escalated must be refused — a self-contradictory CLEAN+escalated:true row in the ledger file that must never wrongly say CLEAN is the worst possible output: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, '', 'a CLEAN-under-escalated refusal must print NO verdict word and NO ledger line: ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, /derived CLEAN under --escalated/,
    'the refusal must name that the derivation reached CLEAN under --escalated: ' + r.stderr)
  assert.match(r.stderr, /re-run dispositions/i,
    'the refusal must instruct re-running dispositions against the current evidence — the remedy for drift, not a crash: ' + r.stderr)
})

// ---- driver-level ACs (D5-D10): writeEscalateRow(), self-heal, D10 detector --------------------

test('AC-20260822-01-5 (also AC-20260901-09-2): WHEN the third fix-applied mark is refused in an in-place review THE SYSTEM SHALL have appended exactly one row with escalated:true to .claude/spec-runs.jsonl whose runId equals the sidecar\'s own runId and whose iteration equals the final manifest number, and the sidecar SHALL record escalateRunId', () => {
  const host = makeHost('esc-ac5')
  driveToCapEdge(host.root, host.spec)
  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledgerPath)

  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'a third fix-applied must still be refused — the iteration cap of 2 is unchanged by this spec: ' + thirdFix.stdout + thirdFix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused third fix-applied must land the terminal state ESCALATE: ' + thirdFix.stdout + thirdFix.stderr)

  const after = readJsonl(ledgerPath)
  const newRows = after.slice(before.length)
  const escalateRows = newRows.filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(escalateRows.length, 1,
    'exactly one escalated:true row must be appended for this cap refusal — zero means the write point is missing, more than one is a duplicate append: ' + JSON.stringify(newRows))
  const row = escalateRows[0]

  const sidecar = readSidecar(host.sidecar)
  assert.ok(sidecar.runId, 'the sidecar must record marks.runId once the escalate row is written: ' + JSON.stringify(sidecar))
  assert.strictEqual(row.runId, sidecar.runId,
    'the appended row\'s runId must equal the sidecar\'s own runId — a mismatch would mean the row was minted under a second, unrelated run id: ' + JSON.stringify({ row, sidecar }))
  assert.strictEqual(row.iteration, 3,
    'the row\'s iteration must equal the final manifest number (3, after two real fix cycles) — a stale iteration would misattribute which pass the capped evidence came from: ' + JSON.stringify(row))
  assert.strictEqual(sidecar.escalateRunId, row.runId,
    'the sidecar must record escalateRunId equal to the appended row\'s runId — this is the idempotency guard a bare re-invocation checks before ever writing again: ' + JSON.stringify(sidecar))
})

// specs/20260824/06-review-range-identity.md D4/AC-7: writeEscalateRow() mirrors
// runHardStopVerdict()'s D4 threading exactly — the capped run's escalate row must name the range
// it burned its fix loop against, same as the hard-stop and close rows.
test('AC-20260824-06-7 (also AC-20260901-09-2): WHEN a third fix-applied lands ESCALATE THE SYSTEM writes an escalate row carrying diff.base and diff.head as 40-hex shas and diff.dirty as a boolean', () => {
  const host = makeHost('esc-ac7-range')
  driveToCapEdge(host.root, host.spec)
  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'setup: a third fix-applied must still be refused so the escalate row gets written: ' + thirdFix.stdout + thirdFix.stderr)

  const rows = readJsonl(path.join(host.root, '.claude/spec-runs.jsonl'))
  const escalateRows = rows.filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(escalateRows.length, 1,
    'setup: exactly one escalated:true row must exist for this spec before the range fields can be checked: ' +
    JSON.stringify(rows))
  const row = escalateRows[0]
  assert.match((row.diff && row.diff.base) || '', /^[0-9a-f]{40}$/,
    'AC-20260824-06-7: the escalate row\'s diff.base must be a 40-hex commit sha — D4 threads the resolved ' +
    'base sha onto all three ledger passes, escalate included: ' + JSON.stringify(row))
  assert.match((row.diff && row.diff.head) || '', /^[0-9a-f]{40}$/,
    'AC-20260824-06-7: the escalate row\'s diff.head must be a 40-hex commit sha — HEAD is re-read fresh at ' +
    'this pass, after the two real fix cycles: ' + JSON.stringify(row))
  assert.strictEqual(typeof (row.diff && row.diff.dirty), 'boolean',
    'AC-20260824-06-7: the escalate row\'s diff.dirty must be a boolean — an absent or non-boolean value here ' +
    'means the driver never threaded the flag onto writeEscalateRow()\'s verdict.js invocation: ' + JSON.stringify(row))
})

test('AC-20260822-01-6 (also AC-20260901-09-2): WHEN the refused third fix-applied mark is repeated THE SYSTEM SHALL still have exactly one escalated:true row for the spec — the write is idempotent on the persisted escalateRunId mark, never a second append', () => {
  const host = makeHost('esc-ac6')
  driveToCapEdge(host.root, host.spec)
  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')

  const first = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(first.status, 2, 'setup: the first capping fix-applied must be refused: ' + first.stdout + first.stderr)
  const second = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(second.status, 2,
    'a repeated refused mark must still exit 2 — the cap does not become permissive on retry: ' + second.stdout + second.stderr)

  const rows = readJsonl(ledgerPath).filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(rows.length, 1,
    'two refusals of the SAME third fix-applied mark must leave exactly one escalated:true row — a count of 0 means the first write never landed, a count of 2 means idempotency was never checked (pre-image count here is 0, so this pins both presence and idempotency at once): ' + JSON.stringify(rows))
})

test('AC-20260822-01-7 (also AC-20260901-09-2): WHEN the cap is hit in a worktree review whose main root already ignores the stopped ledger THE SYSTEM SHALL append the escalate row to <mainRoot>/.claude/spec-runs.stopped.jsonl and record that absolute path as marks.escalateLedgerPath with escalateFallback:false', () => {
  const host = makeWorktreeHost({ name: 'esc-ac7', ignoreStopped: true })
  driveToCapEdge(host.wt, host.spec)

  const wtLedger = path.join(host.wt, '.claude/spec-runs.jsonl')
  const wtLedgerBefore = fs.existsSync(wtLedger) ? fs.readFileSync(wtLedger, 'utf8') : null

  const thirdFix = run(host.wt, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2, 'setup: the capping fix-applied must be refused: ' + thirdFix.stdout + thirdFix.stderr)

  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  assert.ok(fs.existsSync(stoppedPath),
    'a worktree cap refusal must write its escalate row to the DURABLE main-root path — writing it only inside the worktree means `git worktree remove` (merge-back\'s own eventual cleanup) destroys the only record of the capped run: ' + thirdFix.stdout + thirdFix.stderr)
  const rows = readJsonl(stoppedPath).filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(rows.length, 1,
    'exactly one escalated:true row for this spec must land in the durable stopped ledger: ' + JSON.stringify(rows))

  const wtLedgerAfter = fs.existsSync(wtLedger) ? fs.readFileSync(wtLedger, 'utf8') : null
  assert.strictEqual(wtLedgerAfter, wtLedgerBefore,
    'the worktree\'s own .claude/spec-runs.jsonl must stay byte-unchanged — the durable write must relocate the append, never duplicate it: ' + JSON.stringify({ before: wtLedgerBefore, after: wtLedgerAfter }))

  const sidecar = readSidecar(host.sidecar)
  assert.strictEqual(sidecar.escalateLedgerPath, stoppedPath,
    'the sidecar must record the absolute durable path as escalateLedgerPath so the ESCALATE step and D10\'s detector can both name where the row actually landed: ' + JSON.stringify(sidecar))
  assert.strictEqual(sidecar.escalateFallback, false,
    'escalateFallback must be false — the durable write succeeded, this was never a fallback: ' + JSON.stringify(sidecar))
})
