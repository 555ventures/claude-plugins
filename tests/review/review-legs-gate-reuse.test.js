'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, SPEC } = require('../helpers')
const { makeReviewLegsHost, reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md D1-D4: AC-20261101-05-1..7, -10.

const SCRIPT = 'scripts/review-legs.js'
const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260817-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

// The counter lives outside the fixture repo: an untracked file inside it would reconcile as
// out-of-plan. The stub appends one line per invocation, so line count = runner invocations.
function makeHost({ gateCommand = 'bash lint.sh && bash test.sh', countPattern = true, tests = 3 } = {}) {
  const counter = path.join(tmpdir('gate-reuse-counter'), 'counter')
  const capabilities = { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' }
  if (countPattern) capabilities.testCountPattern = 'ℹ tests (\\d+)'
  const host = makeReviewLegsHost('gate-reuse', {
    specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1',
    config: { gateCommand, testCommand: 'bash test.sh', runtime: { inert: 'fixture' }, capabilities },
    testBody: GREEN_TEST,
    extraFiles: {
      // The stubs are planned files, so reconcile sees no out-of-plan change.
      'specs/20260817/99-test.md': reviewLegsSpecBody({ specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1' })
        .replace('| tests/foo.test.js | create | tests |\n', '| tests/foo.test.js | create | tests |\n| lint.sh | create | scripts |\n| test.sh | create | scripts |\n'),
      'lint.sh': '#!/usr/bin/env bash\nexit 0\n',
      'test.sh': `#!/usr/bin/env bash\necho x >> '${counter}'\necho "ℹ tests ${tests}"\necho "ℹ skipped 0"\nexit \${STUB_EXIT:-0}\n`,
    },
  })
  return { ...host, counter }
}

const lines = counter => fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0

function run(host, extra = [], env = {}) {
  const outDir = tmpdir('gate-reuse-out')
  const manifest = path.join(tmpdir('gate-reuse-manifest'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', host.dir, '--spec', 'specs/20260817/99-test.md',
    '--base', host.base, '--manifest', manifest, '--out-dir', outDir, ...extra],
  { env: { ...process.env, ...env } })
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) : []
  return { r, rows, byLeg: new Map(rows.map(x => [x.leg, x])), manifest, outDir }
}

test('AC-20261101-05-1: gateRunsSuite returns true only for an && segment equal to testCommand in an unscoped gate, false for every other shape', () => {
  const { gateRunsSuite } = require(path.join(SPEC, 'scripts/lib/gate-resolve.js'))
  assert.strictEqual(typeof gateRunsSuite, 'function',
    'lib/gate-resolve.js must export gateRunsSuite — review-legs and the driver have no shared reuse predicate without it')
  const cases = [
    ['lint && node --test', 'lint && node --test', 'node --test', true],
    ['node --test {testDirs}', "node --test 'tests/*.test.js'", 'node --test', false],
    ['lint || node --test', 'lint || node --test', 'node --test', false],
    ['lint && node --test tests/a.test.js', 'lint && node --test tests/a.test.js', 'node --test', false],
    ['lint && CI=1 node --test', 'lint && CI=1 node --test', 'node --test', false],
    ['lint && node --test', 'lint && node --test', '', false],
    ['lint && node --test', null, 'node --test', false],
    ['check && lint && vitest run', 'check && lint && vitest run', 'vitest run', true],
    ['lint; node --test', 'lint; node --test', 'node --test', false],
  ]
  for (const [raw, resolved, tc, want] of cases) {
    assert.strictEqual(gateRunsSuite(raw, resolved, tc), want,
      `gateRunsSuite(${JSON.stringify([raw, resolved, tc])}) must be ${want} — true on a shape where a green gate does not imply the test command ran loses the suite observation; false on the && shape costs a redundant run`)
  }
})

test('AC-20261101-05-2: an unscoped gate whose && segment is testCommand runs the runner once, appends a reused suite row, omits suite-output.txt, and derives CLEAN', () => {
  const host = makeHost()
  const { r, byLeg, manifest, outDir } = run(host)
  assert.strictEqual(r.status, 0, 'a green unscoped host must exit 0: ' + r.stdout + r.stderr)
  assert.strictEqual(lines(host.counter), 1,
    'the suite leg must reuse the gate run — a second counter line means the whole suite ran twice in one review: ' + r.stdout)
  assert.deepStrictEqual(byLeg.get('suite'),
    { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 3, reused: 'gate' }, scope: 'full' },
    'the reused suite row must copy the gate evidence plus reused:"gate": ' + JSON.stringify(byLeg.get('suite')))
  const out = r.stdout.split('\n').find(l => l.startsWith('outputs:')) || ''
  assert.ok(out && !out.includes('suite-output.txt'),
    'the outputs: line must not advertise a suite-output.txt that was never written: ' + out)
  assert.ok(!fs.existsSync(path.join(outDir, 'suite-output.txt')), 'a reused suite leg must not write suite-output.txt')
  const wf = path.join(tmpdir('gate-reuse-wf'), 'workflow.json')
  fs.writeFileSync(wf, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  const v = runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', wf])
  assert.strictEqual(v.stdout.split('\n')[0], 'CLEAN',
    'verdict.js must derive CLEAN over a manifest with a reused suite row — otherwise a reused review can never close: ' + v.stdout + v.stderr)
})

test('AC-20261101-05-3: a --fix-delta run over the unscoped fixture reuses the gate too, with scope as the last key', () => {
  const host = makeHost()
  const { r, byLeg } = run(host, ['--fix-delta'])
  assert.strictEqual(lines(host.counter), 1,
    'reuse applies in fix-delta scope too — a second counter line means the fix pass reran the whole suite: ' + r.stdout + r.stderr)
  const row = byLeg.get('suite')
  assert.ok(row, 'fix-delta run must still carry a suite row: ' + r.stdout)
  assert.strictEqual(row.observed.reused, 'gate', 'fix-delta suite row must be reused: ' + JSON.stringify(row))
  assert.strictEqual(row.scope, 'fix-delta', 'scope must read fix-delta: ' + JSON.stringify(row))
  assert.strictEqual(Object.keys(row).at(-1), 'scope', 'scope must stay the last key on the row: ' + JSON.stringify(row))
})

test('AC-20261101-05-4: with no testCountPattern declared the gate cannot vouch for the suite, so the bare testCommand runs for real', () => {
  const host = makeHost({ countPattern: false })
  const { r, byLeg } = run(host)
  assert.strictEqual(lines(host.counter), 2,
    'without an observed executed count a gate green on lint alone must not stand in for the suite — one counter line means the suite observation was lost: ' + r.stdout + r.stderr)
  const row = byLeg.get('suite')
  assert.ok(row && !('reused' in row.observed), 'the real-run suite row must carry no reused key: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.observed.testsExecuted, { unavailable: 'no-format-declared' },
    'testsExecuted must stay typed unavailable: ' + JSON.stringify(row))
})

test('AC-20261101-05-5: a gate that executed zero tests yields a reused suite row with exit 1 and RED_BLOCKING: suite', () => {
  const host = makeHost({ tests: 0 })
  const { r, byLeg } = run(host)
  const row = byLeg.get('suite')
  assert.ok(row, 'a suite row must be appended: ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 1, 'a reused zero-test observation must stay vacuous-green red (exit 1), never inherit the gate exit 0: ' + JSON.stringify(row))
  assert.strictEqual(row.observed.testsExecuted, 0, 'testsExecuted must be 0: ' + JSON.stringify(row))
  assert.strictEqual(row.observed.reused, 'gate', 'the row must be a reused one: ' + JSON.stringify(row))
  assert.match(r.stdout, /^RED_BLOCKING: suite$/m, 'a zero-test whole-suite observation must block the review: ' + r.stdout)
})

test('AC-20261101-05-6: a red gate that ran the runner leaves one counter line and reddens both gate and suite rows', () => {
  const host = makeHost()
  const { r, byLeg } = run(host, [], { STUB_EXIT: '1' })
  assert.strictEqual(lines(host.counter), 1, 'a red gate must not trigger a second whole-suite run: ' + r.stdout + r.stderr)
  assert.strictEqual(byLeg.get('gate').exit, 1, 'gate row must carry exit 1: ' + JSON.stringify(byLeg.get('gate')))
  const row = byLeg.get('suite')
  assert.ok(row && row.exit === 1 && row.observed.reused === 'gate',
    'suite row must be a reused exit-1 row: ' + JSON.stringify(row))
  assert.match(r.stdout, /^RED_BLOCKING: gate,suite$/m, 'both legs must block: ' + r.stdout)
})

test('AC-20261101-05-7 (SHALL CONTINUE TO): a scoped gate keeps running the bare testCommand with no reused key', () => {
  const host = makeHost({ gateCommand: 'bash lint.sh && bash test.sh {testDirs}' })
  const { r, byLeg } = run(host)
  assert.strictEqual(lines(host.counter), 2,
    'a {testDirs}-scoped gate ran only the spec tests, so the suite leg must still run for real: ' + r.stdout + r.stderr)
  const row = byLeg.get('suite')
  assert.ok(row && !('reused' in row.observed), 'a scoped gate must never yield a reused suite row: ' + JSON.stringify(row))
})

test('AC-20261101-05-10: every run writes timings.json (one non-negative integer per leg, total last) and every summary line carries seconds', () => {
  const host = makeHost()
  const { r, rows, outDir } = run(host)
  const file = path.join(outDir, 'timings.json')
  assert.ok(fs.existsSync(file), 'timings.json must be written beside the outputs — a slow leg is otherwise invisible: ' + r.stdout + r.stderr)
  const t = JSON.parse(fs.readFileSync(file, 'utf8'))
  const keys = Object.keys(t)
  assert.strictEqual(keys.at(-1), 'total', 'total must be the last key: ' + keys)
  const legs = [...new Set(rows.map(x => x.leg))]
  assert.deepStrictEqual([...keys.slice(0, -1)].sort(), [...legs].sort(),
    'timings.json must hold exactly one key per appended leg: ' + keys + ' vs ' + legs)
  for (const k of keys) {
    assert.ok(Number.isInteger(t[k]) && t[k] >= 0, `timings.${k} must be a non-negative integer: ${t[k]}`)
  }
  const legLines = r.stdout.split('\n').filter(l => /^(✅|❌|⚠️ ) \S+\s+exit=\d+ /.test(l))
  assert.ok(legLines.length >= legs.length, 'summary must print a line per leg: ' + r.stdout)
  for (const l of legLines) {
    assert.match(l, / \(\d+\.\ds\)/, 'every summary line must show wall-clock seconds: ' + l)
  }
  const suiteLine = legLines.find(l => /^✅ suite /.test(l)) || ''
  assert.match(suiteLine, /\{"skips":0,"todos":0,"testsExecuted":3,"reused":"gate"\} \(\d+\.\ds\)$/,
    'the observed JSON must be followed directly by the seconds suffix: ' + suiteLine)
})
