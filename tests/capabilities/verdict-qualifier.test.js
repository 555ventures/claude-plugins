'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260813/10-host-capabilities.md D4: verdict.js's review profile fell straight through
// to plain CLEAN even when a declared observation leg (ci; skip legs per D3) was structurally
// `unavailable` — CLEAN-with-qualifier existed only on the release profile before this spec, so
// the wave's whole point (an honest `unavailable` leg flowing into the verdict word) would have
// been silently swallowed into an indistinguishable-from-real-green plain CLEAN, the exact defect
// class this spec fixes. AC-8 pins the new review-profile derivation; AC-9 pins the untouched
// green-path and release-profile behavior as regression (green pre-change, per the AC's wording).

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
function firstLine(stdout) {
  return stdout.split('\n')[0]
}

const GREEN_REVIEW_LEGS = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 0, observed: 'pass' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0 oracle=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0 sanctioned=0' },
]

test('AC-20260813-10-8: verdict.js derives CLEAN-with-qualifier on the review profile when every leg is green but the ci leg is structurally unavailable', () => {
  const dir = tmpdir('verdict-qualifier-review')
  const manifest = writeManifest(dir, [
    ...GREEN_REVIEW_LEGS,
    { leg: 'ci', exit: 0, observed: 'unavailable — no supported forge adapter' },
  ])
  const workflow = writeWorkflow(dir, { verdict: 'CLEAN', survivors: [], killed: [], scope: 'full', tokens: 100, reviewerCount: 1 })
  const r = runNode('scripts/verdict.js',
    ['--manifest', manifest, '--workflow', workflow, '--waived', '0', '--rejected', '0', '--fixDispatched', '0'])
  assert.strictEqual(firstLine(r.stdout), 'CLEAN-with-qualifier',
    'a review whose ci leg never structurally delivered a verdict must print the qualified word, not plain CLEAN — a plain CLEAN here is indistinguishable from a review with a real green CI run (D4), the exact information loss this AC closes. Got: ' + JSON.stringify(r.stdout) + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'CLEAN-with-qualifier is a CLEAN-family word — it must exit 0 like plain CLEAN, gating nothing extra (same word/exit family spec 20260813/02 established): ' + r.stderr)
})

test('AC-20260813-10-9 (regression pin): verdict.js continues to derive plain CLEAN on the review profile when every leg, including ci, is fully green', () => {
  const dir = tmpdir('verdict-plain-clean')
  const manifest = writeManifest(dir, [
    ...GREEN_REVIEW_LEGS,
    { leg: 'ci', exit: 0, observed: 'conclusion=success' },
  ])
  const workflow = writeWorkflow(dir, { verdict: 'CLEAN', survivors: [], killed: [], scope: 'full', tokens: 100, reviewerCount: 1 })
  const r = runNode('scripts/verdict.js',
    ['--manifest', manifest, '--workflow', workflow, '--waived', '0', '--rejected', '0', '--fixDispatched', '0'])
  assert.strictEqual(firstLine(r.stdout), 'CLEAN',
    'a review with a real green CI conclusion on every leg must still print plain CLEAN, unchanged by the D4 qualifier addition: ' + JSON.stringify(r.stdout) + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 0, 'plain CLEAN must still exit 0: ' + r.stderr)
})

test('AC-20260813-10-9 (regression pin): verdict.js\'s release profile continues to derive CLEAN-with-qualifier when its ci leg is structurally unavailable, per spec 20260813/02 unchanged', () => {
  const dir = tmpdir('verdict-release-qualifier')
  const manifest = writeManifest(dir, [
    { leg: 'deploy', exit: 0, observed: 'pass' },
    { leg: 'ready', exit: 0, observed: 'pass' },
    { leg: 'e2e', exit: 0, observed: 'passed=10 failed=0 skipped=0' },
    { leg: 'journeys', exit: 0, observed: 'walked=3 failed=0' },
    { leg: 'substrate', exit: 0, observed: 'checked=5 failed=0 inert=0' },
    { leg: 'production', exit: 0, observed: 'skipped' },
    { leg: 'ci', exit: 0, observed: 'unavailable' },
  ])
  const r = runNode('scripts/verdict.js',
    ['--manifest', manifest, '--profile', 'release', '--milestone', 'v0.0.0'])
  assert.strictEqual(firstLine(r.stdout), 'CLEAN-with-qualifier',
    'the release profile\'s pre-existing CLEAN-with-qualifier derivation (spec 20260813/02) must survive D4\'s review-profile addition byte-for-byte: ' + JSON.stringify(r.stdout) + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 0, 'release CLEAN-with-qualifier must still exit 0: ' + r.stderr)
})
