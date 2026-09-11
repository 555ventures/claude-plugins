'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, SPEC, tmpdir, runNode, gitRepo } = require('../helpers')
const { makeReviewLegsHost } = require('../review/review-legs.fixtures')

// specs/20260911/02-tests-have-a-ceiling.md D4′: pins review-legs.js's
// `tests` leg (AC-5) and verdict.js's advisory-only derivation over it (AC-6). The leg is
// required in both scopes but forbidden from every blocking spelling — required-but-never-red
// is the property under test, not a comparison against any limit.
//
// specs/20260911/04-every-criterion-declares-its-test.md AC-20260911-04-16 reuses the
// BLOCKING-array case below (its name and header now cite both AC-IDs) — unchanged assertions.

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

// specs/20260911/04-every-criterion-declares-its-test.md D9: review-legs.fixtures.js's shared
// makeReviewLegsHost only ever seeds a spec with ONE AC bullet, so AC-20260911-04-11's four-AC,
// mixed-disposition fixture needs its own thin host builder — the same git/config/spec-write
// steps, inlined here rather than widening the shared fixture for one caller (A1's own rule).
function multiDispositionSpecBody() {
  return `---
status: implementing
tier: standard
---
# Multi Disposition Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | four ACs, four dispositions | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260911-98-1**: WHEN a runs THE SYSTEM SHALL b → writes tests/foo.test.js
- **AC-20260911-98-2**: WHEN c runs THE SYSTEM SHALL d → writes tests/bar.test.js
- **AC-20260911-98-3**: WHEN e runs THE SYSTEM SHALL CONTINUE TO f → rewrites tests/foo.test.js :: AC-1: some title
- **AC-20260911-98-4**: WHEN g runs THE SYSTEM SHALL CONTINUE TO h → reuses tests/foo.test.js :: AC-2: another title
`
}

function makeMultiDispositionHost(prefix, config) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260911'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260911/98-test.md'), multiDispositionSpecBody())
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

// ---- AC-20260911-02-5: review-legs.js's own `tests` leg row ---------------------------------

// AC-20260911-04-10 (rewrites AC-20260911-02-5, full scope, specs/20260911/04-every-criterion-
// declares-its-test.md D9): the original assertion here (a healthy count-tests.js reporting
// {"count":5}) is now covered by AC-20260911-04-11 below instead — this case is repurposed to
// pin the FAILED-INSTRUMENT arm the old assertion never exercised: a count-tests.js invocation
// that itself crashes must read as the typed {"unavailable":"count-failed"} shape, never as
// {"count":0} — a failed instrument silently reporting a healthy zero is indistinguishable from a
// genuinely empty suite.
test('AC-20260911-04-10 (rewrites AC-20260911-02-5, full scope): WHEN review-legs.js runs over a fixture host whose count-tests.js invocation exits non-zero THE SYSTEM SHALL append exactly one {"leg":"tests","exit":0,"observed":{"unavailable":"count-failed"}} row carrying no count key', () => {
  const cfg = baseConfig()
  // A null entry in testGlobs crashes lib/scan-test-calls.js's listTestFiles (globMatch(null, …)
  // throws), forcing count-tests.js's own child process to exit non-zero with no parseable
  // stdout — the "broken instrument" fixture this AC exists to name. Confirmed executed against
  // the untouched pre-image: count-tests.js exits 1 with an empty stdout under this config.
  cfg.testGlobs = [null]
  const { dir, base } = makeReviewLegsHost('tests-leg-countfail', {
    specDate: '20260911', ordinal: '97', acId: 'AC-20260911-97-1',
    config: cfg,
    testBody: GREEN_TEST_5,
  })
  const direct = runNode('scripts/count-tests.js', ['--root', dir, '--json'])
  assert.notStrictEqual(direct.status, 0,
    'setup precondition: count-tests.js must genuinely crash (non-zero exit) against this ' +
    'testGlobs:[null] config, or this fixture never exercises a failed instrument at all: ' +
    direct.stdout + ' / ' + direct.stderr)

  const manifest = path.join(tmpdir('tests-leg-countfail-out'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260911/97-test.md',
    '--base', base, '--manifest', manifest])
  const rows = manifestRows(manifest).filter((x) => x.leg === 'tests')
  assert.strictEqual(rows.length, 1,
    'review-legs.js must append EXACTLY one "tests" manifest row even when count-tests.js fails: ' +
    JSON.stringify(manifestRows(manifest)) + ' / ' + r.stdout + r.stderr)
  const row = rows[0]
  assert.strictEqual(row.exit, 0,
    'D9: a failed instrument is still advisory-only — the leg must still exit 0: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.observed, { unavailable: 'count-failed' },
    'D9: a count-tests.js failure must read as the typed {"unavailable":"count-failed"} shape, ' +
    'never as {"count":0} — a failed instrument reporting count:0 is indistinguishable from a ' +
    'genuinely empty suite: ' + JSON.stringify(row))
})

test('AC-20260911-04-11: WHEN review-legs.js runs over a fixture host reviewing a spec whose ACs declare two writes, one rewrites and one reuses THE SYSTEM SHALL append {"leg":"tests","exit":0,"observed":{"count":N,"dispositions":{"writes":2,"rewrites":1,"reuses":1}}}', () => {
  const { dir, base } = makeMultiDispositionHost('tests-leg-dispositions', baseConfig())
  const manifest = path.join(tmpdir('tests-leg-dispositions-out'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260911/98-test.md',
    '--base', base, '--manifest', manifest])
  const rows = manifestRows(manifest).filter((x) => x.leg === 'tests')
  assert.strictEqual(rows.length, 1,
    'review-legs.js must append EXACTLY one "tests" manifest row: ' +
    JSON.stringify(manifestRows(manifest)) + ' / ' + r.stdout + r.stderr)
  const row = rows[0]
  assert.strictEqual(row.exit, 0,
    'D9: the tests leg has no red arm — it must exit 0 regardless of the disposition mix: ' + JSON.stringify(row))
  assert.ok(Number.isInteger(row.observed.count),
    'D9: observed.count must still be reported alongside dispositions, never dropped: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.observed.dispositions, { writes: 2, rewrites: 1, reuses: 1 },
    'D9: observed.dispositions must count each AC bullet\'s own declared disposition via parseDisposition, ' +
    'exactly two writes, one rewrites, one reuses for this spec: ' + JSON.stringify(row))
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

test('AC-20260911-04-16 (reuses AC-20260911-02-5): review-legs.js\'s own BLOCKING array literal SHALL NOT contain "tests" — the leg can never redden a review', () => {
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

// Every other REVIEW_LEGS-required leg, all green, deliberately WITHOUT a tests row — a local
// fixture rather than verdict.test.js's SIX_GREEN (which carries the D10′ green tests row for
// its own SHALL-CONTINUE-TO pin), so this test isolates the tests row's OWN presence the same
// way SIX_LEGS_NO_AT_RISK isolates at-risk's.
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
