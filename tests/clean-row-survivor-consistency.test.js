'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, tmpdir, runNode } = require('./helpers')

// INTAKE pin JJ-20260814-01 (2026-08-14, review of specs/20260813/06-report-renderer.md,
// run wf_59aba53d-4a5). spec/commands/review.md's ledger-row prose states, in bold: "never
// write `CLEAN` on a row whose `survived` is non-zero". spec/scripts/verdict.js's derive()
// disagrees: CLEAN is whatever's left once every survivor is dispositioned
// (waived+rejected+fixDispatched === survivors.length), with no floor on survivors.length
// itself. An all-waived disposition — one real finding, all of it waived — prints exactly
// the row the prose forbids: verdict CLEAN beside findings.survived:1. That row was appended
// to .claude/spec-runs.jsonl during the cited review. The doctrine text and the script
// disagree, and nothing pins either reading.
//
// EXPECTED-RED: this is a deliberate backlog pin, not a defect in this test — do not "fix"
// it by loosening the assertion below. Turns green when verdict.js's derive()/ledger path
// changes so a printed row can never carry both verdict CLEAN and findings.survived > 0
// (e.g. a distinct CLEAN-with-waivers/qualifier word, or a hard floor of survived === 0 on
// the CLEAN branch) — whichever way review.md's own prohibition and derive() get reconciled.

const REVIEW = path.join(ROOT, 'spec/commands/review.md')

test('JJ-20260814-01: verdict.js --ledger prints a row with verdict CLEAN and a non-zero findings.survived count, contradicting review.md\'s own prohibition', () => {
  const dir = tmpdir('verdict-clean-survivor')
  const manifestPath = path.join(dir, 'manifest.jsonl')
  const workflowPath = path.join(dir, 'workflow.json')

  // A fully-green manifest across every required review leg (gate/smoke/reconcile/
  // ac-matrix/skip-reconcile/ci) so derive() reaches the disposition branch, not UNVERIFIED
  // or GATE_RED — the assertion under test is about the disposition branch specifically.
  const legs = [
    { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
    { leg: 'smoke', exit: 0, observed: 'pass' },
    { leg: 'reconcile', exit: 0, observed: 'clean' },
    { leg: 'ac-matrix', exit: 0, observed: 'covered' },
    { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
    { leg: 'ci', exit: 0, observed: 'success' }
  ]
  fs.writeFileSync(manifestPath, legs.map(l => JSON.stringify(l)).join('\n') + '\n')

  // One real survivor, waived in full — the disposition class the incident reproduced.
  fs.writeFileSync(workflowPath, JSON.stringify({
    scope: 'full',
    survivors: [{ id: 'F1', severity: 'soft' }],
    killed: [],
    reviewerCount: 1
  }))

  const r = runNode('scripts/verdict.js', [
    '--manifest', manifestPath, '--workflow', workflowPath,
    '--waived', '1', '--ledger', '--spec', 'specs/x/y.md', '--tier', 'T2',
    '--diff-loc', '10', '--iteration', '1', '--run-id', 'wf_test0000000'
  ])
  assert.strictEqual(r.status, 0,
    'verdict.js must exit 0 on a fully-green, fully-dispositioned manifest for this pin to ' +
    'reach the branch under test — a non-zero exit means the executed leg failed before the ' +
    'assertion below could even run, not that review.md\'s prohibition held: ' + r.stderr)

  const lines = r.stdout.trim().split('\n')
  assert.ok(lines.length >= 2,
    'verdict.js --ledger must print the verdict word on line 1 and the JSON ledger row on ' +
    'line 2 — without both lines this pin cannot compare them: ' + r.stdout)
  const row = JSON.parse(lines[1])

  assert.ok(
    !(row.verdict === 'CLEAN' && row.findings && row.findings.survived > 0),
    'review.md forbids ever writing a row with verdict CLEAN whose survived count is ' +
    'non-zero, but verdict.js\'s derive() reaches CLEAN the moment every survivor is ' +
    'dispositioned regardless of how many there were — an all-waived review with one real ' +
    'finding produces exactly the forbidden row, indistinguishable in .claude/spec-runs.jsonl ' +
    'from a review that found nothing: ' + JSON.stringify(row))
})

test('JJ-20260814-01 premise: review.md still states the CLEAN-with-survivors prohibition verbatim, so this pin stays aimed at a live contradiction', () => {
  assert.ok(fs.existsSync(REVIEW),
    'spec/commands/review.md does not exist — JJ-20260814-01 has nothing to compare ' +
    'verdict.js\'s behavior against; this pin needs the doctrine file back before it can mean ' +
    'anything')
  const review = read('spec/commands/review.md')
  assert.match(review, /never write `CLEAN` on a row whose\s*\n?`survived` is non-zero/,
    'this pin exists specifically to hold verdict.js accountable to review.md\'s own stated ' +
    'prohibition — if that sentence is ever softened or removed, JJ-20260814-01\'s premise ' +
    'must be revisited explicitly (re-aimed or retired) rather than left silently orphaned by ' +
    'an unrelated doctrine edit')
})
