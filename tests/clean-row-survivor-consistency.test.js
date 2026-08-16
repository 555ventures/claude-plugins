'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, tmpdir, runNode } = require('./helpers')

// INTAKE JJ-20260814-01 (2026-08-14, review of specs/20260813/06-report-renderer.md, run
// wf_59aba53d-4a5), closed by user ruling the same day.
//
// The incident: spec/commands/review.md's ledger-row prose said, in bold, "never write
// `CLEAN` on a row whose `survived` is non-zero" — while spec/scripts/verdict.js's derive()
// reaches CLEAN the moment every survivor is dispositioned, with no floor on survivors.length.
// The cited review waived its single finding and printed exactly the row the prose forbade
// (verdict CLEAN beside findings.survived:1), appending it to .claude/spec-runs.jsonl. Two
// readings were live and nothing pinned either.
//
// The ruling: the SCRIPT was right and the PROSE was wrong. The hole the sentence meant to
// close was always CLEAN with an UNDISPOSITIONED survivor — a review that shrugs off a finding
// — never CLEAN with a survivor the user actually disposed of. review.md now says that, and
// this file pins the invariant by EXECUTION in both directions rather than by prose alone,
// which is why the sentence could drift from the script for as long as it did.
//
// Companion prose pins (retargeted, not weakened, in the same change):
// tests/review/verdict-doctrine.test.js and tests/run-ledger.test.js.

const REVIEW = path.join(ROOT, 'spec/commands/review.md')

// A fully-green manifest across every required review leg, so derive() reaches the disposition
// branch rather than GATE_RED/UNVERIFIED — the branch under test is the disposition one.
//
// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-9, self-application, CONTINUE TO):
// `at-risk` joins REVIEW_LEGS as a required-but-non-blocking leg — this spec's own adversarial
// pass named this fixture as one of the four suites its own required-leg extension would redden
// (found by Phase 4's pre-image check as an in-flight File Plan row). The row is added here so
// both tests below CONTINUE TO derive the same verdict words they already assert.
const GREEN_LEGS = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 0, observed: 'pass' },
  { leg: 'reconcile', exit: 0, observed: 'clean' },
  { leg: 'ac-matrix', exit: 0, observed: 'covered' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'success' },
  { leg: 'at-risk', exit: 0, observed: 'files=0' }
]

// Runs verdict.js --ledger over one survivor with the given dispositions, returning the exec
// result plus the parsed ledger row (null when no row was printed).
function deriveWithOneSurvivor(label, severity, dispositions) {
  const dir = tmpdir(`verdict-survivor-${label}`)
  const manifestPath = path.join(dir, 'manifest.jsonl')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(manifestPath, GREEN_LEGS.map(l => JSON.stringify(l)).join('\n') + '\n')
  fs.writeFileSync(workflowPath, JSON.stringify({
    scope: 'full',
    survivors: [{ id: 'F1', severity }],
    killed: [],
    reviewerCount: 1
  }))

  const r = runNode('scripts/verdict.js', [
    '--manifest', manifestPath, '--workflow', workflowPath,
    ...dispositions,
    '--ledger', '--spec', 'specs/x/y.md', '--tier', 'T2',
    '--diff-loc', '10', '--iteration', '1', '--run-id', 'wf_test0000000'
  ])
  const lines = r.stdout.trim().split('\n')
  const row = lines.length >= 2 ? JSON.parse(lines[1]) : null
  return { r, word: lines[0], row }
}

test('JJ-20260814-01 (CONTINUE TO AC-20260815-02-9): a survivor the user disposed of still closes CLEAN, and the ledger row records both the finding and its disposition', () => {
  const { r, word, row } = deriveWithOneSurvivor('waived', 'soft', ['--waived', '1'])

  assert.strictEqual(r.status, 0,
    'a fully-green manifest whose single survivor was waived is the sanctioned CLEAN close — a ' +
    'non-zero exit here makes Phase 3 unreachable and strands every waive-closed review short ' +
    'of its status flip and merge-back: ' + r.stderr)
  assert.strictEqual(word, 'CLEAN',
    'the derived word for a fully-dispositioned survivor must be CLEAN — anything else reopens ' +
    'the question the 2026-08-14 ruling settled and blocks the close path on user judgment ' +
    'that was already exercised')
  assert.strictEqual(row.findings.survived, 1,
    'the row must still record that a finding survived verification — zeroing it to make the ' +
    'row look clean is precisely the audit-trail loss the ledger exists to prevent')
  assert.strictEqual(row.findings.waived, 1,
    'the row must record HOW the survivor was disposed of — a CLEAN row carrying a survivor ' +
    'with no disposition count is indistinguishable from a review that ignored its finding')
  assert.strictEqual(
    row.findings.waived + row.findings.rejected + row.findings.fixDispatched,
    row.findings.survived,
    'every survivor on a CLEAN row must be accounted for by a disposition — this sum IS the ' +
    'invariant review.md states, and a CLEAN row where it fails means findings vanished ' +
    'between verification and the ledger')
})

test('JJ-20260814-01 (CONTINUE TO AC-20260815-02-9): an undispositioned survivor cannot reach CLEAN — the hole the doctrine sentence meant to close', () => {
  const { r, word, row } = deriveWithOneSurvivor('undisposed', 'hard', [])

  assert.notStrictEqual(word, 'CLEAN',
    'a survivor nobody disposed of must never derive CLEAN — this is the actual hole review.md ' +
    'guards, and a CLEAN here would let a review shrug off a live finding and still flip the ' +
    'spec to done')
  assert.strictEqual(word, 'HARD_FINDINGS',
    'an undispositioned hard survivor must derive HARD_FINDINGS specifically, so the report ' +
    'names the build fix rather than reporting a generic non-CLEAN the user has to decode')
  assert.notStrictEqual(r.status, 0,
    'verdict.js exit 0 is what gates entry into the Phase 3 close — an undispositioned survivor ' +
    'exiting 0 would make the close mechanically reachable on an unresolved finding')
  assert.ok(row.findings.waived + row.findings.rejected + row.findings.fixDispatched <
    row.findings.survived,
    'the row must show the shortfall that justifies the non-CLEAN word, or the ledger cannot ' +
    'explain after the fact why this run did not close')
})

test('JJ-20260814-01: review.md states the invariant verdict.js actually enforces, and the superseded blanket wording is gone', () => {
  assert.ok(fs.existsSync(REVIEW),
    'spec/commands/review.md does not exist — the executed pins above have no doctrine ' +
    'counterpart to hold accountable; this pin needs the doctrine file back before it means ' +
    'anything')
  const review = read('spec/commands/review.md')

  assert.match(review, /never write `CLEAN` while any survivor is undispositioned/,
    'review.md must state the invariant in the form verdict.js enforces — a reader who cannot ' +
    'find it in the doctrine will re-derive the rule from the script, or worse, from a ledger ' +
    'row they happen to be looking at')
  assert.doesNotMatch(review, /never write `CLEAN` on a row whose\s*\n?`survived` is non-zero/,
    'the superseded blanket wording must not return: it contradicts verdict.js on every ' +
    'waive-closed review, and a reader who believes it will "fix" correct ledger rows or ' +
    'refuse a legitimate close (2026-08-14, run wf_59aba53d-4a5)')
  assert.match(review, /never hand-write the word/,
    'the prohibition that survives is against the MODEL asserting a verdict — verdict.js is the ' +
    'sole writer, and losing this clause reopens the "prose, not a derived value" hole that ' +
    'the whole verdict-derivation design closed')
})
