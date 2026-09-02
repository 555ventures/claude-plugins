'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260820/03-review-observation-truth.md D6 (AC-20260820-03-10, AC-20260820-03-11):
// the 11 hand-written "skips=" fixtures in verdict.test.js
// pin verdict.js's parser against the test author's memory of review-legs.js's emitted grammar,
// not against the emitter itself — exactly how the D2/D3 defect (an unparseable skip
// observation silently decaying to testsSkipped.total:0 and a CLEAN verdict) survived
// undetected. This file is the producer→consumer authority: it drives review-legs.js against a
// synthetic host for each gate-observed skip branch, then feeds the ACTUAL emitted manifest —
// never a hand-written observed string — to verdict.js --ledger and asserts the derived row.
// Unit pins in verdict.test.js stay as fast regression checks; this pair test is the contract
// authority (Rationale).
//
// specs/20260820/06-typed-evidence-manifest.md D1/D2/D5/D10 (brief 16's second move): every
// emitted manifest row's `observed` field becomes a typed JSON object, and this
// file — already the grammar authority per D6 above — is EXTENDED (never replaced) to the new
// typed branches: D10 names it explicitly ("the pair test is extended to the typed gate
// branches and the at-risk contradiction branch"). The two skip-pattern tests below are
// retyped/retagged in place (AC-20260820-03-10 → AC-20260820-06-5, extended to also assert the
// gate row's typed shape and a declared testCountPattern; AC-20260820-03-11 → a companion under
// the same AC-ID, since both are branches of the one skipReportPattern mechanism A8's collision
// closure names for retag). Two genuinely new tests pin AC-20260820-06-6 (the at-risk
// contradiction: testCountPattern declared, files>0, captured executed count 0 → exit FORCED to
// 1, never the pre-image's vacuous green) and AC-20260820-06-7 (no testCountPattern declared →
// the at-risk row keeps the child's real exit code, no contradiction possible without an
// observation). Every row asserted below is the ACTUAL manifest row review-legs.js appended,
// never hand-written, per D10's own standing rule.

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
function makeHost({ skipReportPattern, gateCommand, testCountPattern }) {
  const dir = tmpdir('legs-verdict-pair')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const capabilities = { forge: 'none', skipReportPattern }
  if (testCountPattern) capabilities.testCountPattern = testCountPattern
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand,
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities,
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

test('AC-20260820-06-5 (retag/extension of AC-20260820-03-10): review-legs.js against a synthetic host whose declared skipReportPattern matches gate output reporting 2 skips AND whose declared testCountPattern matches the gate\'s executed-count line emits a typed gate row {"skips":2,"todos":0,"testsExecuted":N}, generated by the emitter and never hand-written, which fed unmodified to verdict.js --ledger derives testsSkipped.total 2', () => {
  const { dir, base } = makeHost({
    skipReportPattern: 'CUSTOM_SKIP_MARKER: (\\d+)',
    testCountPattern: 'TESTS_RAN_MARKER: (\\d+)',
    gateCommand: "echo 'CUSTOM_SKIP_MARKER: 2'; echo 'TESTS_RAN_MARKER: 1'; node --test tests/*.test.js",
  })
  const { r, manifest } = runLegs(dir, base)
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const gateRow = rows.find(x => x.leg === 'gate')
  assert.ok(gateRow,
    'review-legs.js must append a gate row to the manifest — with no row there is nothing to feed verdict.js ' +
    'and this pair test proves nothing: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(gateRow.observed, { skips: 2, todos: 0, testsExecuted: 1 },
    'D2/D5: the emitter itself must report the typed object {"skips":2,"todos":0,"testsExecuted":1} when both ' +
    'its declared skipReportPattern and testCountPattern match the gate output — a hand-written object here ' +
    'would prove nothing about the emitter, and a mismatch means the fixture is not exercising the ' +
    `matched-both-patterns branch this test claims to pin: ${JSON.stringify(gateRow)}`)

  const v = feedToVerdict(dir, manifest)
  const lines = v.stdout.trim().split('\n')
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'verdict.js --ledger must print a parseable row when fed review-legs.js\'s own emitted manifest: ' +
    v.stdout + ' / ' + v.stderr)
  assert.strictEqual(row.testsSkipped.total, 2,
    'AC-20260820-06-5: feeding review-legs.js\'s ACTUAL emitted manifest (never a hand-written ' +
    '{"skips":2,"todos":0,...} object, per D10) to verdict.js --ledger must derive row.testsSkipped.total 2 — ' +
    `this is the producer→consumer contract the hand-written fixtures in verdict.test.js only approximate: ${JSON.stringify(row)}`)
})

test('AC-20260820-06-5 (companion, retag of AC-20260820-03-11): review-legs.js against a synthetic host whose declared skipReportPattern does NOT match the gate output emits a typed gate row {"skips":{"unavailable":"pattern-no-match"},"testsExecuted":{"unavailable":"no-format-declared"}} which fed unmodified to verdict.js --ledger derives testsSkipped {"unavailable":true} and findings.legFindings >= 1', () => {
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
  assert.deepStrictEqual(gateRow.observed, {
    skips: { unavailable: 'pattern-no-match' },
    testsExecuted: { unavailable: 'no-format-declared' },
  }, 'D2: the emitter itself must report skips as the typed enum {"unavailable":"pattern-no-match"} (and carry ' +
    'no "todos" key alongside it, per the Contracts\' skips-unavailable alternative) when its declared pattern ' +
    'finds no match anywhere in the gate output; this host declares no testCountPattern, so testsExecuted must ' +
    'be typed {"unavailable":"no-format-declared"} — a different shape here means the fixture is not ' +
    `exercising the unmatched branch this test claims to pin: ${JSON.stringify(gateRow)}`)

  const v = feedToVerdict(dir, manifest)
  const lines = v.stdout.trim().split('\n')
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'verdict.js --ledger must print a parseable row even when a leg finding leaves the run undispositioned: ' +
    v.stdout + ' / ' + v.stderr)
  assert.deepStrictEqual(row.testsSkipped, { unavailable: true },
    'AC-20260820-06-5 companion: feeding review-legs.js\'s ACTUAL emitted manifest (an unmatched-pattern gate ' +
    'observation, never hand-written, per D10) to verdict.js --ledger must derive row.testsSkipped ' +
    `{"unavailable":true} — never a fabricated zero total: ${JSON.stringify(row)}`)
  assert.ok(row.findings && row.findings.legFindings >= 1,
    'D4: this exact producer-emitted skips.unavailable === "pattern-no-match" observation must still ' +
    'contribute at least 1 leg finding to the undispositioned pool under the typed grammar — a silent ' +
    'skip-format regression must page the same run it occurs on, not decay over five runs: ' +
    JSON.stringify(row.findings))
})

// ---- at-risk / testCountPattern contradiction (D5, D10) --------------------------------------
// Mirrors tests/review/review-legs-at-risk-argv.test.js's host shape: an at-risk test file must
// predate the diff, live OUTSIDE the File Plan, and content-reference the changed file's stem —
// scope-reconcile.js's at-risk derivation requires exactly that shape.

function makeAtRiskHost({ testCountPattern, recorderBody, recorderExitCode }) {
  const dir = tmpdir('legs-verdict-pair-atrisk')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/inplan'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin/recorder.js'), recorderBody)
  const capabilities = { forge: 'none', skipReportPattern: 'none' }
  if (testCountPattern) capabilities.testCountPattern = testCountPattern
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: `node ${JSON.stringify(path.join(dir, 'bin/recorder.js'))}`,
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities,
  }))
  fs.writeFileSync(path.join(dir, 'src/riskyfoo.js'), 'module.exports = () => 1\n')
  fs.writeFileSync(path.join(dir, 'tests/inplan/covers.test.js'), "require('node:test')\n")
  fs.mkdirSync(path.join(dir, 'tests/outofplan'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/outofplan/atrisk.test.js'),
    "'use strict'\nrequire('../../src/riskyfoo.js')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/97-test.md'),
    '---\nstatus: implementing\ntier: standard\n---\n# At-risk contradiction fixture\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `src/riskyfoo.js` | MODIFY | scripts | x |\n| `tests/inplan/covers.test.js` | CREATE | tests | x |\n')
  fs.writeFileSync(path.join(dir, 'src/riskyfoo.js'), 'module.exports = () => 2\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')
  return { dir, base }
}

function runLegsAtRisk(dir, base) {
  const manifest = path.join(tmpdir('legs-verdict-pair-atrisk-out'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260820/97-test.md',
    '--base', base, '--manifest', manifest])
  return { r, manifest }
}

test('AC-20260820-06-6: a synthetic host declaring testCountPattern, with one at-risk file, whose testCommand exits 0 while printing a captured executed-count of 0 emits {"leg":"at-risk","exit":1,"observed":{"files":1,"testsExecuted":0}}, and verdict.js pools at least 1 leg finding from it — the emitter forces the exit itself, never a vacuous green', () => {
  const { dir, base } = makeAtRiskHost({
    testCountPattern: 'RAN_MARKER: (\\d+)',
    recorderBody: 'process.stdout.write("RAN_MARKER: 0\\n")\nprocess.exit(0)\n',
  })
  const { r, manifest } = runLegsAtRisk(dir, base)
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const row = rows.find(x => x.leg === 'at-risk')
  assert.ok(row,
    'review-legs.js must append an "at-risk" manifest row when scope-reconcile.js finds an at-risk file: ' +
    r.stdout + r.stderr)
  assert.deepStrictEqual(row, { leg: 'at-risk', exit: 1, observed: { files: 1, testsExecuted: 0 } },
    'AC-20260820-06-6 (literal): the recorder EXITS 0 and files>0, but its captured executed-count is 0 — the ' +
    'emitter must force exit to 1 (D5\'s emitter-side contradiction rule, keyed on testsExecuted === 0 ' +
    'STRICTLY, never a falsy check) so this is a same-run red, never the 2026-08-16 escape\'s vacuous green ' +
    `(exit:0, observed:"files=1"): ${JSON.stringify(row)}`)

  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  const v = runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const lines = v.stdout.trim().split('\n')
  let ledgerRow
  assert.doesNotThrow(() => { ledgerRow = JSON.parse(lines[1]) },
    'verdict.js --ledger must print a parseable row even with an undispositioned leg finding: ' +
    v.stdout + ' / ' + v.stderr)
  assert.ok(ledgerRow.findings && ledgerRow.findings.legFindings >= 1,
    'AC-20260820-06-6: the forced-red at-risk row must pool at least 1 leg finding into the undispositioned ' +
    'pool (at-risk stays non-blocking, so this rides Phase 2 disposition, never GATE_RED) — verdict.js needs ' +
    `no new rule for this, per D5\'s rationale ("a red non-blocking row already pools"): ${JSON.stringify(ledgerRow.findings)}`)
})

test('AC-20260820-06-7: a synthetic host declaring no testCountPattern gives the at-risk row the child\'s real exit code (1) with observed {"files":1,"testsExecuted":{"unavailable":"no-format-declared"}} — no contradiction check is possible without an observation', () => {
  const { dir, base } = makeAtRiskHost({
    testCountPattern: null,
    recorderBody: 'process.stdout.write("some unrelated output\\n")\nprocess.exit(1)\n',
  })
  const { r, manifest } = runLegsAtRisk(dir, base)
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const row = rows.find(x => x.leg === 'at-risk')
  assert.ok(row,
    'review-legs.js must append an "at-risk" manifest row when scope-reconcile.js finds an at-risk file: ' +
    r.stdout + r.stderr)
  assert.deepStrictEqual(row, {
    leg: 'at-risk', exit: 1, observed: { files: 1, testsExecuted: { unavailable: 'no-format-declared' } },
  }, 'AC-20260820-06-7 (literal): with no declared testCountPattern, the row must carry the CHILD\'s real exit ' +
    'code (1, from the recorder\'s own process.exit(1)) unmodified — D5\'s emitter-side contradiction only ' +
    'applies when an executed-count observation actually exists; with none, there is nothing to contradict, ' +
    `so the exit must never be forced: ${JSON.stringify(row)}`)
})
