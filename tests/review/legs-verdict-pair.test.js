'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260820/03-review-observation-truth.md D6 (AC-20260820-03-10, AC-20260820-03-11,
// 2026-08-20, Salon OS field report): the 11 hand-written "skips=" fixtures in verdict.test.js
// pin verdict.js's parser against the test author's memory of review-legs.js's emitted grammar,
// not against the emitter itself — exactly how the D2/D3 defect (an unparseable skip
// observation silently decaying to testsSkipped.total:0 and a CLEAN verdict) survived
// undetected. This file is the producer→consumer authority: it drives review-legs.js against a
// synthetic host for each gate-observed skip branch, then feeds the ACTUAL emitted manifest —
// never a hand-written observed string — to verdict.js --ledger and asserts the derived row.
// Unit pins in verdict.test.js stay as fast regression checks; this pair test is the contract
// authority (Rationale).

const SPEC_BODY = `---
status: implementing
tier: standard
---
# Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260820-98-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260820-98-1**: foo() returns 42.
`

const TEST_BODY = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260820-98-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

// A green synthetic host, shaped like review-legs.test.js's fixture, except the gate command is
// a literal shell script (no {testDirs} placeholder) so this file controls the gate's stdout
// precisely — the one axis under test — while every other leg stays green exactly as there.
function makeHost({ skipReportPattern, gateCommand }) {
  const dir = tmpdir('legs-verdict-pair')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand,
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/98-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), TEST_BODY)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

function runLegs(dir, base) {
  const manifest = path.join(tmpdir('legs-verdict-pair-out'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260820/98-test.md',
    '--base', base, '--manifest', manifest])
  return { r, manifest }
}

function feedToVerdict(dir, manifest) {
  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  return runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
}

test('AC-20260820-03-10: review-legs.js against a synthetic host whose declared skipReportPattern matches gate output reporting 2 skips produces a manifest which, fed unmodified to verdict.js --ledger, derives testsSkipped.total 2', () => {
  const { dir, base } = makeHost({
    skipReportPattern: 'CUSTOM_SKIP_MARKER: (\\d+)',
    gateCommand: "echo 'CUSTOM_SKIP_MARKER: 2'; node --test tests/*.test.js",
  })
  const { r, manifest } = runLegs(dir, base)
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const gateRow = rows.find(x => x.leg === 'gate')
  assert.ok(gateRow,
    'review-legs.js must append a gate row to the manifest — with no row there is nothing to feed verdict.js ' +
    'and this pair test proves nothing: ' + r.stdout + r.stderr)
  assert.strictEqual(gateRow.observed, 'skips=2 todos=0',
    'the emitter itself must report 2 skips when its declared pattern matches the gate output — a mismatch ' +
    'here means the fixture is not exercising the matched branch this test claims to pin: ' + JSON.stringify(gateRow))

  const v = feedToVerdict(dir, manifest)
  const lines = v.stdout.trim().split('\n')
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'verdict.js --ledger must print a parseable row when fed review-legs.js\'s own emitted manifest: ' +
    v.stdout + ' / ' + v.stderr)
  assert.strictEqual(row.testsSkipped.total, 2,
    'AC-20260820-03-10: feeding review-legs.js\'s ACTUAL emitted manifest (never a hand-written ' +
    '"skips=2 todos=0" string, per D6) to verdict.js --ledger must derive row.testsSkipped.total 2 — this is ' +
    'the producer→consumer contract the hand-written fixtures in verdict.test.js only approximate: ' +
    JSON.stringify(row))
})

test('AC-20260820-03-11: review-legs.js against a synthetic host whose declared skipReportPattern does NOT match the gate output produces a manifest which, fed unmodified to verdict.js --ledger, derives testsSkipped {"unavailable":true} and findings.legFindings >= 1', () => {
  const { dir, base } = makeHost({
    skipReportPattern: 'CUSTOM_SKIP_MARKER: (\\d+)',
    gateCommand: 'node --test tests/*.test.js',
  })
  const { r, manifest } = runLegs(dir, base)
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const gateRow = rows.find(x => x.leg === 'gate')
  assert.ok(gateRow,
    'review-legs.js must append a gate row to the manifest — with no row there is nothing to feed verdict.js ' +
    'and this pair test proves nothing: ' + r.stdout + r.stderr)
  assert.strictEqual(gateRow.observed, 'unavailable — skip format did not match gate output',
    'the emitter itself must report the pinned did-not-match literal when its declared pattern finds no ' +
    'match anywhere in the gate output — a different string here means the fixture is not exercising the ' +
    'unmatched branch this test claims to pin: ' + JSON.stringify(gateRow))

  const v = feedToVerdict(dir, manifest)
  const lines = v.stdout.trim().split('\n')
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'verdict.js --ledger must print a parseable row even when a leg finding leaves the run undispositioned: ' +
    v.stdout + ' / ' + v.stderr)
  assert.deepStrictEqual(row.testsSkipped, { unavailable: true },
    'AC-20260820-03-11: feeding review-legs.js\'s ACTUAL emitted manifest (an unmatched-pattern gate ' +
    'observation, never hand-written, per D6) to verdict.js --ledger must derive row.testsSkipped ' +
    '{"unavailable":true} — never a fabricated zero total: ' + JSON.stringify(row))
  assert.ok(row.findings && row.findings.legFindings >= 1,
    'D3: this exact producer-emitted observed literal must contribute at least 1 leg finding to the ' +
    'undispositioned pool — a silent skip-format regression must page the same run it occurs on, not decay ' +
    'over five runs: ' + JSON.stringify(row.findings))
})
