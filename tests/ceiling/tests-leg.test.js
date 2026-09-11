'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, SPEC, tmpdir, runNode } = require('../helpers')
const { makeReviewLegsHost } = require('../review/review-legs.fixtures')

// specs/20260911/02-tests-have-a-ceiling.md D4′ (amended 2026-09-11): pins review-legs.js's
// `tests` leg (AC-5) and verdict.js's advisory-only derivation over it (AC-6). The leg is
// required in both scopes but forbidden from every blocking spelling — required-but-never-red
// is the property under test, not a comparison against any limit.

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260911-97-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

const GREEN_TEST_5 = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260911-97-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
test('AC-20260911-97-2: foo() returns 42 again', () => { assert.strictEqual(foo(), 42) })
test('AC-20260911-97-3: foo() returns 42 a third time', () => { assert.strictEqual(foo(), 42) })
test('AC-20260911-97-4: foo() returns 42 a fourth time', () => { assert.strictEqual(foo(), 42) })
test('AC-20260911-97-5: foo() returns 42 a fifth time', () => { assert.strictEqual(foo(), 42) })
`

function baseConfig() {
  return {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }
}

function manifestRows(manifestPath) {
  if (!fs.existsSync(manifestPath)) return []
  return fs.readFileSync(manifestPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}

// ---- AC-20260911-02-5: review-legs.js's own `tests` leg row ---------------------------------

test('AC-20260911-02-5 (full scope): WHEN review-legs.js runs over a fixture host holding five test cases in FULL scope THE SYSTEM SHALL append exactly one {"leg":"tests","exit":0,"observed":{"count":5}} row', () => {
  const { dir, base } = makeReviewLegsHost('tests-leg-full', {
    specDate: '20260911', ordinal: '97', acId: 'AC-20260911-97-1',
    config: baseConfig(),
    testBody: GREEN_TEST_5,
  })
  const manifest = path.join(tmpdir('tests-leg-full-out'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260911/97-test.md',
    '--base', base, '--manifest', manifest])
  const rows = manifestRows(manifest).filter((x) => x.leg === 'tests')
  assert.strictEqual(rows.length, 1,
    'review-legs.js must append EXACTLY one "tests" manifest row, never zero or a duplicate: ' +
    JSON.stringify(manifestRows(manifest)) + ' / ' + r.stdout + r.stderr)
  const row = rows[0]
  assert.strictEqual(row.exit, 0,
    'D3′/D4′: the tests leg has no red arm — it must exit 0 regardless of the observed count: ' +
    JSON.stringify(row))
  assert.strictEqual(row.observed.count, 5,
    'observed.count must reflect the host\'s real test-case count (this fixture\'s own five ' +
    'planted cases), derived via count-tests.js, never a stub: ' + JSON.stringify(row))
})

test('AC-20260911-02-5 (fix-delta scope): WHEN review-legs.js runs --fix-delta over the same fixture host THE SYSTEM SHALL still append a green "tests" row — the leg runs in every scope', () => {
  const { dir, base } = makeReviewLegsHost('tests-leg-fixdelta', {
    specDate: '20260911', ordinal: '96', acId: 'AC-20260911-96-1',
    config: baseConfig(),
    testBody: GREEN_TEST.replace('AC-20260911-97-1', 'AC-20260911-96-1'),
  })
  const manifest = path.join(tmpdir('tests-leg-fixdelta-out'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260911/96-test.md',
    '--base', base, '--manifest', manifest, '--fix-delta'])
  const row = manifestRows(manifest).find((x) => x.leg === 'tests')
  assert.ok(row,
    'the tests leg must append its row even in --fix-delta scope — D4′ names it as running "in EVERY ' +
    'scope including --fix-delta": ' + JSON.stringify(manifestRows(manifest)) + ' / ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 0, 'a fix-delta tests row must also exit 0: ' + JSON.stringify(row))
  assert.strictEqual(row.observed.count, 1, 'observed.count must reflect the one planted case: ' + JSON.stringify(row))
})

test('AC-20260911-02-5: review-legs.js\'s own BLOCKING array literal SHALL NOT contain "tests" — the leg can never redden a review', () => {
  const src = read('spec/scripts/review-legs.js')
  const m = src.match(/const BLOCKING = \[([^\]]*)\]/)
  assert.ok(m, 'review-legs.js\'s BLOCKING const array literal was not found — this pin\'s source shape changed: ' + src.slice(0, 0))
  const blocking = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.ok(!blocking.includes('tests'),
    'D4′: "tests" must never appear in review-legs.js\'s BLOCKING array — a leg with no red arm ' +
    'that were also blocking would be a contradiction in terms: ' + JSON.stringify(blocking))
})

// ---- AC-20260911-02-6: verdict.js's derivation over the tests row ---------------------------

const SCRIPT_VERDICT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return p
}

function writeWorkflow(dir, obj) {
  const p = path.join(dir, 'workflow.json')
  fs.writeFileSync(p, JSON.stringify(obj))
  return p
}

// The nine legs REVIEW_LEGS already required before this spec, all green, deliberately WITHOUT
// a tests row — this file's own local fixture (never verdict.test.js's SIX_GREEN, which already
// carries the D10′ green tests row per that spec's own SHALL-CONTINUE-TO pin) so this test can
// isolate tests's OWN presence the same way SIX_LEGS_NO_AT_RISK isolates at-risk's.
const NINE_LEGS_GREEN_NO_TESTS = [
  { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 } },
  { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1035 } },
  { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
  { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
  { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
  { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
  { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 } },
  { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
]

function cleanWorkflow() {
  return { verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full', tokens: { workflow: 10 } }
}

test('AC-20260911-02-6: WHEN verdict.js reads a manifest that would derive CLEAN and a green "tests" row is added THE SYSTEM SHALL still derive CLEAN', () => {
  const dir = tmpdir('tests-leg-verdict-clean')
  const workflow = writeWorkflow(dir, cleanWorkflow())
  const withoutTests = writeManifest(dir, NINE_LEGS_GREEN_NO_TESTS)
  const baseline = runNode(SCRIPT_VERDICT, ['--manifest', withoutTests, '--workflow', workflow])
  assert.strictEqual(baseline.stdout.split('\n')[0], 'UNVERIFIED',
    'setup precondition: a manifest missing the required "tests" row must derive UNVERIFIED, never ' +
    'CLEAN, before the green row is added: ' + baseline.stdout + ' / ' + baseline.stderr)

  const withTests = writeManifest(dir, [...NINE_LEGS_GREEN_NO_TESTS, { leg: 'tests', exit: 0, observed: { count: 500 } }])
  const withRun = runNode(SCRIPT_VERDICT, ['--manifest', withTests, '--workflow', workflow])
  assert.strictEqual(withRun.stdout.split('\n')[0], 'CLEAN',
    'D4′: a present, green "tests" row (even reporting a huge count of 500) must let a manifest that ' +
    'would otherwise derive CLEAN keep deriving CLEAN — the row is advisory, never a verdict input: ' +
    withRun.stdout + ' / ' + withRun.stderr)
})

test('AC-20260911-02-6: WHEN verdict.js reads a manifest carrying a red "gate" row and a green "tests" row THE SYSTEM SHALL still derive GATE_RED, never let the tests row mask it', () => {
  const dir = tmpdir('tests-leg-verdict-gatered')
  const rows = NINE_LEGS_GREEN_NO_TESTS.map((r) => (r.leg === 'gate'
    ? { leg: 'gate', exit: 1, observed: { unavailable: 'gate-unresolvable', detail: 'boot-crash' } }
    : r))
  rows.push({ leg: 'tests', exit: 0, observed: { count: 3 } })
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT_VERDICT, ['--manifest', manifest, '--ledger', '--spec', 'x.md',
    '--tier', 'T2', '--diff-loc', '1', '--iteration', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'a red gate row must still derive GATE_RED with a green advisory "tests" row present — the tests ' +
    'row must never change the verdict word either way: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260911-02-6: WHEN the "tests" row is absent from an otherwise-complete manifest THE SYSTEM SHALL derive UNVERIFIED', () => {
  const dir = tmpdir('tests-leg-verdict-missing')
  const workflow = writeWorkflow(dir, cleanWorkflow())
  const missingManifest = writeManifest(dir, NINE_LEGS_GREEN_NO_TESTS)
  const missingRun = runNode(SCRIPT_VERDICT, ['--manifest', missingManifest, '--workflow', workflow])
  assert.strictEqual(missingRun.stdout.split('\n')[0], 'UNVERIFIED',
    'D4′: "tests" must join REVIEW_LEGS as a required leg in both scopes — a manifest missing its ' +
    'row must derive UNVERIFIED, never CLEAN from the remaining nine green legs alone: ' +
    missingRun.stdout + ' / ' + missingRun.stderr)
})

test('AC-20260911-02-6: verdict.js\'s REVIEW_BLOCKING set literal SHALL NOT contain "tests"', () => {
  const src = read('spec/scripts/verdict.js')
  const m = src.match(/const REVIEW_BLOCKING = new Set\(\[([^\]]*)\]\)/)
  assert.ok(m, 'verdict.js\'s REVIEW_BLOCKING const Set literal was not found — this pin\'s source shape changed')
  const blocking = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.ok(!blocking.includes('tests'),
    'D4′: "tests" must never appear in verdict.js\'s REVIEW_BLOCKING — a red row (which can never ' +
    'happen, D3′) must never be able to change the derived word: ' + JSON.stringify(blocking))
})
