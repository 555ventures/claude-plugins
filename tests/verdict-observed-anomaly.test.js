'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// INTAKE JJ-20260817-03 — logged during the review of
// specs/20260816/01-gate-baseline-reconcile.md (2026-08-17).
//
// D6 of that spec loosened verdict.js's deriveTestsSkipped gate-row regex to
// `/^skips=(\d+) todos=(\d+)(?: sanctionedReds=\d+)?$/`. It stays fully anchored, so ANY malformed
// gate `observed` string (a typo, a trailing space, an empty `sanctionedReds=`, an extra field)
// fails the whole match and — per verdict.js's own header comment ("parse failures degrade to
// 0/omitted") — degrades `testsSkipped.total` to a confident-looking `0`. The spec calls this
// "fails closed", but 0 UNDER-REPORTS: it silently erases the skip count from the ledger row
// instead of announcing that the observation was unreadable. review.md now has the reviewing
// session append the `sanctionedReds=` suffix as hand-typed prose (D6), which widens exactly the
// typo surface this regex cannot tolerate.
//
// This pin is EXECUTED, not a doctrine-prose pin: it runs the real `verdict.js` binary against a
// malformed gate observed string and asserts the ledger row never presents that silent 0 as fact.
// It stays LOOSE about HOW an anomaly is encoded (an omitted key, an explicit null/string marker,
// a sibling flag) but STRICT that a confident, unmarked `total: 0` is wrong. A second assert shows
// the well-formed suffix form is untouched, so this pin cannot be satisfied by breaking the good
// path. EXPECTED RED until a fix spec lands.

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

function cleanWorkflow() {
  return {
    verdict: 'CLEAN',
    survivors: [],
    killed: 0,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0,
      miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1,
    scope: 'full',
    tokens: { workflow: 100 },
  }
}

// Full required-leg shape (REVIEW_LEGS in verdict.js), gate row swapped per test.
function sixGreen(gateObserved) {
  return [
    { leg: 'gate', exit: 0, observed: gateObserved },
    { leg: 'smoke', exit: 4, observed: 'inert' },
    { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
    { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
    { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
    { leg: 'ci', exit: 0, observed: 'conclusion=success' },
    { leg: 'at-risk', exit: 0, observed: 'files=0' },
  ]
}

// Loose-but-strict contract: a confident, unmarked `{total: 0, ...}` object is the one shape this
// pin forbids. Any other encoding (omitted key, null, string, or a sibling anomaly-marking field
// alongside total:0) is accepted — the fix spec keeps its own design freedom for the marker shape.
function isSilentConfidentZero(row) {
  if (!('testsSkipped' in row)) return false
  const ts = row.testsSkipped
  if (ts === null || typeof ts !== 'object') return false
  if (ts.total !== 0) return false
  const anomalyKeys = ['anomalous', 'unavailable', 'unparseable', 'unparsed', 'parseError', 'confidence', 'ok']
  return !anomalyKeys.some(k => k in ts)
}

test('JJ-20260817-03: a malformed gate "observed" string (empty sanctionedReds value) is recorded as unavailable/anomalous in the ledger row, never as a confident testsSkipped.total of 0', () => {
  const dir = tmpdir('verdict-anomaly')
  const manifest = writeManifest(dir, sixGreen('skips=2 todos=1 sanctionedReds='))
  const workflow = writeWorkflow(dir, cleanWorkflow())
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger'])
  const lines = r.stdout.trim().split('\n')
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must still print a parseable JSON row on line 2 even when the gate observed string is ' +
    'malformed: ' + r.stdout + ' / ' + r.stderr)
  assert.ok(!isSilentConfidentZero(row),
    'a gate row observed "skips=2 todos=1 sanctionedReds=" (empty sanctionedReds value) fails ' +
    'deriveTestsSkipped\'s fully-anchored regex and must not be recorded as a confident, unmarked ' +
    '`testsSkipped: {total: 0, ...}` — that silently erases 2 real skips and 1 todo from the ledger row ' +
    'instead of announcing that the gate leg\'s observation was unreadable: ' + JSON.stringify(row))
})

test('JJ-20260817-03: the well-formed "skips=N todos=M sanctionedReds=K" suffix form still derives testsSkipped.total = 3 unchanged, so this pin cannot be satisfied by breaking the good path', () => {
  const dir = tmpdir('verdict-anomaly')
  const manifest = writeManifest(dir, sixGreen('skips=2 todos=1 sanctionedReds=21'))
  const workflow = writeWorkflow(dir, cleanWorkflow())
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.strictEqual(row.testsSkipped.total, 3,
    'the well-formed gate observed "skips=2 todos=1 sanctionedReds=21" must still derive a confident ' +
    'testsSkipped.total of 3 (2 skips + 1 todo) — a fix for the malformed case above must not regress ' +
    'the already-pinned good path (AC-20260816-01-8): ' + JSON.stringify(row))
})
