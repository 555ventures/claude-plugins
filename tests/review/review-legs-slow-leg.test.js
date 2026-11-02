'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { makeReviewLegsHost, reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md D2: AC-20261101-07-2,
// AC-20261101-07-3, AC-20261101-07-4 — the optional slowTestCommand runs as its own blocking
// `slow` leg, alone in wave 2c, typed like the suite row; an absent key leaves no trace.

const SCRIPT = 'scripts/review-legs.js'
const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260817-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`
const SLOW_SH = '#!/usr/bin/env bash\necho x >> slow-counter\necho "ℹ tests ${SLOW_TESTS:-2}"\necho "ℹ skipped 0"\nexit ${SLOW_EXIT:-0}\n'

function makeHost({ slow = true } = {}) {
  const config = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)', testCountPattern: 'ℹ tests (\\d+)' },
  }
  if (slow) config.slowTestCommand = 'bash slow.sh'
  return makeReviewLegsHost('tier-host', {
    specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1', config, testBody: GREEN_TEST,
    extraFiles: {
      'specs/20260817/99-test.md': reviewLegsSpecBody({ specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1' })
        .replace('| tests/foo.test.js | create | tests |\n', '| tests/foo.test.js | create | tests |\n| slow.sh | create | scripts |\n'),
      'slow.sh': SLOW_SH,
    },
  })
}

function run(dir, base, env = {}) {
  const outDir = tmpdir('tier-outdir')
  const manifest = path.join(tmpdir('tier-out'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260817/99-test.md', '--base', base,
    '--manifest', manifest, '--out-dir', outDir], { env: { ...process.env, ...env } })
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) : []
  return { r, rows, legs: rows.map(x => x.leg), byLeg: new Map(rows.map(x => [x.leg, x])), outDir }
}

test('AC-20261101-07-2: a declared slowTestCommand appends a typed full-scope slow row between smoke and ac-matrix, writes slow-output.txt headed by its command, runs once, and exits 0', () => {
  const { dir, base } = makeHost()
  const { r, rows, legs, outDir } = run(dir, base)
  const slow = rows.find(x => x.leg === 'slow')
  assert.deepStrictEqual(slow, { leg: 'slow', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 2 }, scope: 'full' },
    'the slow row must be typed exactly like the suite row — a missing or differently shaped row means verdict.js cannot judge the host\'s slow tier: ' + JSON.stringify(rows) + r.stderr)
  assert.ok(legs.indexOf('slow') > legs.indexOf('smoke') && legs.indexOf('slow') < legs.indexOf('ac-matrix'),
    'slow runs alone in wave 2c after smoke and before wave 3 — a different position breaks the alone-in-its-wave collision rule: ' + JSON.stringify(legs))
  const out = path.join(outDir, 'slow-output.txt')
  assert.ok(fs.existsSync(out), 'slow-output.txt must be written so the reviewer can read why the slow leg went red: ' + r.stdout)
  assert.strictEqual(fs.readFileSync(out, 'utf8').split('\n')[0], '$ bash slow.sh',
    'the output file\'s first line must name the command that ran, or a red slow leg cannot be traced to its invocation')
  const counter = fs.readFileSync(path.join(dir, 'slow-counter'), 'utf8').split('\n').filter(Boolean)
  assert.strictEqual(counter.length, 1,
    'the slow tier must run exactly once per legs iteration — more means it leaked into the gate or suite legs: ' + counter.length)
  assert.strictEqual(r.status, 0, 'every leg is green so review-legs must exit 0: ' + r.stdout + r.stderr)
})

test('AC-20261101-07-3: a slow.sh exiting 1 prints RED_BLOCKING: slow and exits 1, and an exit-0 run reporting 0 tests is forced to exit 1 with testsExecuted 0', () => {
  const red = makeHost()
  const a = run(red.dir, red.base, { SLOW_EXIT: '1' })
  assert.match(a.r.stdout, /RED_BLOCKING: .*\bslow\b/,
    'a red slow tier must block the review like a red suite — otherwise a failing host integration test closes as CLEAN: ' + a.r.stdout + a.r.stderr)
  assert.strictEqual(a.r.status, 1, 'RED_BLOCKING must exit 1 so the driver stops: ' + a.r.stdout)
  const vac = makeHost()
  const b = run(vac.dir, vac.base, { SLOW_TESTS: '0' })
  const row = b.byLeg.get('slow')
  assert.ok(row, 'the vacuous run must still append its slow row: ' + JSON.stringify(b.rows) + b.r.stderr)
  assert.strictEqual(row.exit, 1,
    'a slow tier that executed zero tests proves nothing, so isUnobserved must force exit 1 exactly like the suite row: ' + JSON.stringify(row))
  assert.strictEqual(row.observed.testsExecuted, 0, 'the observation must record the zero count that forced the exit: ' + JSON.stringify(row))
})

test('AC-20261101-07-4: a host declaring no slowTestCommand gets no slow row, no slow-output.txt and no slow mention in the summary, with the leg set unchanged', () => {
  const { dir, base } = makeHost({ slow: false })
  const { r, legs, outDir } = run(dir, base)
  assert.deepStrictEqual([...legs].sort(), KNOWN_LEGS,
    'a host without the key must produce exactly today\'s leg list — any addition or reorder changes every existing host\'s manifest: ' + JSON.stringify(legs))
  assert.ok(!fs.existsSync(path.join(outDir, 'slow-output.txt')), 'an absent key must write no slow-output.txt: ' + r.stdout)
  assert.ok(!/slow/.test(r.stdout), 'the summary must not mention slow for a host without the key: ' + r.stdout)
  assert.strictEqual(r.status, 0, 'a host with no slow tier must stay green: ' + r.stdout + r.stderr)
})

const KNOWN_LEGS = ['ac-matrix', 'at-risk', 'ci', 'gate', 'promise-sweep', 'reconcile', 'skip-reconcile', 'smoke', 'suite', 'tests']
