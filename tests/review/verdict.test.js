'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260805/02-review-evidence-manifest.md (D1-D3): today /spec:review can say CLEAN with
// nothing executed — a zero-findings panel returns CLEAN from the workflow, and the CLEAN
// definition is prose a model applies, not a value a script computes. verdict.js makes the
// verdict word a DERIVED value: a fresh per-iteration manifest of executed-leg rows +
// the workflow's return + disposition counts feed one derivation (D3's first-match-wins
// order). This file pins verdict.js's derivation contract directly by execution; review.md's
// wiring of the script is pinned in verdict-doctrine.test.js.

const SCRIPT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

function writeWorkflow(dir, obj) {
  const p = path.join(dir, 'workflow.json')
  fs.writeFileSync(p, JSON.stringify(obj))
  return p
}

const SIX_GREEN = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 4, observed: 'inert' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'unavailable' },
]

function cleanWorkflow(survivors) {
  return {
    verdict: 'CLEAN',
    survivors: survivors || [],
    killed: 0,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0,
      miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1,
    scope: 'full',
    tokens: { workflow: 100 },
  }
}

const VERDICT_WORDS = /^(CLEAN|FINDINGS|HARD_FINDINGS|REVIEWER_FAILED|UNVERIFIED|GATE_RED)$/

test('AC-20260805-02-1: a manifest missing required legs derives UNVERIFIED and exits 1, never CLEAN', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'a manifest carrying only the gate leg is missing smoke/reconcile/ac-matrix/skip-reconcile/ci — ' +
    'the run has no evidence those legs ever executed, so the derivation must be UNVERIFIED, never CLEAN, ' +
    'even though the workflow return itself is zero-findings CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260805-02-2: six green legs (smoke exit 4 counts green-inert) with a CLEAN workflow return derive CLEAN and exit 0', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'every required leg is present and green (smoke exit 4 is the sanctioned inert-green case) and the ' +
    'workflow returned zero survivors — the derivation must reach CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'derived CLEAN must exit 0: ' + r.stderr)
})

test('AC-20260805-02-3: a red ci leg derives GATE_RED and exits 1 even with a CLEAN workflow return', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 1, observed: 'conclusion=failure' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'ci is a blocking leg (D3) — a red ci row must override an otherwise-CLEAN workflow return: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'GATE_RED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260805-02-3: a ci leg observed unavailable with exit 0 is treated as satisfied and CLEAN is still reachable', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN) // ci row is exit 0, observed "unavailable"
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'per D4, ci "unavailable" (no CI to consult) must never block — it is exit 0 and satisfies the ci ' +
    'leg requirement, so an otherwise-green run must still reach CLEAN: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-3: a non-zero ac-matrix exit (findings emitted) counts as executed-green and CLEAN is reachable once those findings are waived', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'ac-matrix' ? { leg: 'ac-matrix', exit: 1, observed: 'uncovered=1' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-20260805-02-99' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'ac-matrix is a findings-producing leg (D3) — its non-zero exit must count as executed-green for leg ' +
    'purposes, and its one finding is fully waived, so the derivation must still reach CLEAN, not get stuck ' +
    'unable to ever return to CLEAN: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-4: undispositioned survivors of medium+soft severity derive FINDINGS', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'medium', id: 'AC-a' }, { severity: 'soft', id: 'AC-b' }, { severity: 'medium', id: 'AC-c' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'FINDINGS',
    '3 survivors, 1 waived, and no hard severity among them — undispositioned medium/soft findings must ' +
    'derive FINDINGS, never CLEAN and never the harder HARD_FINDINGS word: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'FINDINGS is a non-CLEAN word and must still exit 1: ' + r.stderr)
})

test('AC-20260805-02-4: undispositioned survivors including a hard severity derive HARD_FINDINGS', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'hard', id: 'AC-a' }, { severity: 'medium', id: 'AC-b' }, { severity: 'soft', id: 'AC-c' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'HARD_FINDINGS',
    'a hard-severity survivor among the undispositioned set must derive the stronger HARD_FINDINGS word, ' +
    'not the FINDINGS word medium/soft alone would get: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-4: a non-zero fixDispatched derives FINDINGS even when it equals the survivor count, because a dispatched fix is non-terminal', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-a' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--fixDispatched', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'FINDINGS',
    'fixDispatched fully accounting for the one survivor must NOT derive CLEAN — a dispatched fix is ' +
    'non-terminal by design (D3): CLEAN is only reachable from the NEXT iteration\'s fresh derivation: ' +
    r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-5: --ledger prints a row whose verdict matches line 1 and whose legs mirror the manifest name+exit pairs exactly', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--spec', 'specs/20260805/02-review-evidence-manifest.md', '--tier', 'T2',
    '--diff-loc', '42', '--iteration', '1'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN', 'line 1 must still be the bare verdict word: ' + r.stdout + ' / ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must print a parseable JSON row on line 2, never prose: ' + r.stdout)
  assert.strictEqual(row.verdict, 'CLEAN',
    'the ledger row\'s verdict field must equal the word printed on line 1 — a mismatch means the ledger ' +
    'and the console can disagree about what happened: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.legs, SIX_GREEN.map(({ leg, exit }) => ({ leg, exit })),
    'the row\'s legs must mirror the manifest\'s name+exit pairs exactly, in order — anything else means the ' +
    'ledger record diverges from the evidence that actually produced the verdict: ' + JSON.stringify(row.legs))
})

test('AC-20260805-02-9: dispositions exceeding the workflow file\'s survivor count exit 2 without printing a verdict word', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'soft', id: 'AC-a' }, { severity: 'soft', id: 'AC-b' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '3'])
  assert.strictEqual(r.status, 2,
    'waived(3) alone already exceeds the workflow file\'s 2 survivors — a contradictory disposition count ' +
    'must exit 2 (usage/contradictory inputs), never silently pick a verdict: ' + r.stdout + ' / ' + r.stderr)
  assert.ok(!VERDICT_WORDS.test(r.stdout.split('\n')[0] || ''),
    'no verdict word may be printed on a contradictory-input run — printing one anyway would let a caller ' +
    'read stdout without checking the exit code and get a fabricated verdict: ' + JSON.stringify(r.stdout))
  assert.ok(r.stderr.length > 0, 'the contradiction must be named on stderr so the remedy is discoverable: (empty stderr)')
})
