'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// v7.0.0 (2026-08-17): review-legs.js replaces /spec:review's hand-performed Phase 0 — it runs
// every deterministic review leg (reconcile, gate w/ resolved {testDirs}, smoke, ci, at-risk,
// ac-matrix + skip-reconcile), appends one JSONL row per leg to the evidence manifest verdict.js
// derives from, and exits 1 only when a blocking leg (gate/smoke/ci) is red. These tests drive
// it end-to-end against a synthetic git host — the same manifest then feeds verdict.js, pinning
// the two scripts' row-shape contract in one place.

const SCRIPT = 'scripts/review-legs.js'

const SPEC_BODY = `---
status: implementing
tier: standard
---
# Test Spec

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260817-99-1**: foo() returns 42.
`

function makeHost({ testBody }) {
  const dir = tmpdir('review-legs')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260817'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260817/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), testBody)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260817-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function run(dir, base, extra = []) {
  // The manifest lives OUTSIDE the fixture repo — an untracked file inside it would honestly
  // (and correctly) reconcile as out-of-plan.
  const manifest = path.join(tmpdir('review-legs-out'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260817/99-test.md',
    '--base', base, '--manifest', manifest, ...extra])
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  return { r, rows, byLeg: new Map(rows.map(x => [x.leg, x])), manifest }
}

test('a green synthetic host produces every required leg row, resolves {testDirs} to the glob form, and exits 0', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base)
  for (const leg of ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk']) {
    assert.ok(byLeg.has(leg),
      `the manifest must carry a "${leg}" row — verdict.js's REVIEW_LEGS presence rule derives UNVERIFIED ` +
      `without it, so a review over this manifest could never close: rows=${JSON.stringify([...byLeg.keys()])} ` +
      `stderr=${r.stderr}`)
  }
  assert.strictEqual(byLeg.get('gate').exit, 0,
    'the gate must run the resolved glob form and pass — a non-zero exit here means {testDirs} resolution ' +
    'handed the runner something it could not execute (the JJ-20260815-04 bare-directory class): ' + r.stdout)
  assert.strictEqual(byLeg.get('gate').observed, 'skips=0 todos=0',
    'skip counts must be captured via capabilities.skipReportPattern from the gate output, zero-skip runs ' +
    'included — an unavailable observation here means the pattern was not applied: ' + JSON.stringify(byLeg.get('gate')))
  assert.strictEqual(byLeg.get('smoke').observed, 'inert',
    'a host declaring runtime.inert must record the sanctioned inert observation (smoke exit 4): ' +
    JSON.stringify(byLeg.get('smoke')))
  assert.strictEqual(byLeg.get('ci').observed, 'unavailable',
    'capabilities.forge "none" must short-circuit the ci leg to an honest unavailable, never a probe: ' +
    JSON.stringify(byLeg.get('ci')))
  assert.strictEqual(byLeg.get('reconcile').observed, 'outOfPlan=0',
    'both changed files are File Plan rows, so reconcile must report outOfPlan=0: ' + JSON.stringify(byLeg.get('reconcile')))
  assert.strictEqual(byLeg.get('ac-matrix').exit, 0,
    'the one AC is cited by the test file, so ac-matrix must report full coverage: ' + JSON.stringify(byLeg.get('ac-matrix')))
  assert.strictEqual(r.status, 0,
    'every blocking leg is green — review-legs must exit 0 so the review proceeds to the reviewer: ' + r.stdout + r.stderr)
})

test('the green manifest feeds verdict.js to CLEAN — the two scripts agree on row shapes', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { manifest } = run(dir, base)
  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  const v = runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(v.stdout.split('\n')[0], 'CLEAN',
    'review-legs.js rows must satisfy verdict.js\'s required-leg and greenness derivation end-to-end — ' +
    'UNVERIFIED here means a leg name or row shape drifted between the two scripts: ' + v.stdout + ' / ' + v.stderr)
})

test('a red gate exits 1 and names RED_BLOCKING — the review hard-stops before any reviewer spend', () => {
  const { dir, base } = makeHost({
    testBody: GREEN_TEST.replace('assert.strictEqual(foo(), 42)', 'assert.strictEqual(foo(), 43)'),
  })
  const { r, byLeg } = run(dir, base)
  assert.notStrictEqual(byLeg.get('gate').exit, 0, 'the failing test must redden the gate leg: ' + r.stdout)
  assert.strictEqual(r.status, 1,
    'a red blocking leg must exit 1 — exit 0 would let the review proceed to reviewer spend on a red substrate: ' + r.stdout)
  assert.match(r.stdout, /RED_BLOCKING: .*gate/,
    'the summary must name the red blocking leg so the session can report the remedy without parsing the manifest: ' + r.stdout)
})

test('--fix-delta skips reconcile/at-risk and still records the re-executed legs (CROSS-20260727-01: a fix pass re-asserts state, never inherits it)', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base, ['--fix-delta'])
  assert.ok(!byLeg.has('reconcile') && !byLeg.has('at-risk'),
    'fix-delta scope must not run reconcile/at-risk (the fix diff is by definition a response to findings): ' +
    JSON.stringify([...byLeg.keys()]))
  for (const leg of ['gate', 'smoke', 'ci', 'ac-matrix', 'skip-reconcile']) {
    assert.ok(byLeg.has(leg),
      `fix-delta must RE-RUN "${leg}" in full — inheriting the prior iteration's row is the exact ` +
      `fail-open CROSS-20260727-01 closed: ${JSON.stringify([...byLeg.keys()])}`)
  }
  assert.strictEqual(r.status, 0, 'green fix-delta legs must exit 0: ' + r.stdout + r.stderr)
})

test('a missing spec or config is a precondition failure: exit 2, no manifest rows', () => {
  const dir = tmpdir('review-legs-bare')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/nope.md', '--base', 'HEAD',
    '--manifest', path.join(dir, 'm.jsonl')])
  assert.strictEqual(r.status, 2,
    'no config under --root must exit 2 naming /spec:init — running legs against an ungrounded repo would ' +
    'produce a manifest whose greenness means nothing: ' + r.stdout + r.stderr)
})
