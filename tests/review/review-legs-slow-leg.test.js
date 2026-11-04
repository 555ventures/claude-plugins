'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { makeReviewLegsHost, reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261103/13-a-change-is-sized-by-its-files.md D13, AC-20261103-13-6: review-legs never runs
// the optional slowTestCommand — close and release own it.

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

test('AC-20261103-13-6: a host declaring slowTestCommand gets no slow row, no slow-output.txt, never runs the command, and the summary and leg set are identical to a host declaring none', () => {
  const withSlow = makeHost()
  const a = run(withSlow.dir, withSlow.base)
  const without = makeHost({ slow: false })
  const b = run(without.dir, without.base)
  assert.ok(!a.legs.includes('slow'),
    'the slow tier runs at close and at release, never per review iteration — a slow row here makes the review loop pay its most expensive cost every pass: ' + JSON.stringify(a.legs))
  assert.deepStrictEqual([...a.legs].sort(), KNOWN_LEGS,
    'a host declaring the key must produce exactly the leg list of a host declaring none: ' + JSON.stringify(a.legs))
  assert.ok(!fs.existsSync(path.join(a.outDir, 'slow-output.txt')), 'no slow-output.txt may be written by review-legs: ' + a.r.stdout)
  assert.ok(!fs.existsSync(path.join(withSlow.dir, 'slow-counter')),
    'review-legs must not execute slowTestCommand at all — a counter file means the command still ran: ' + a.r.stdout)
  assert.ok(!/slow/.test(a.r.stdout), 'the summary must not mention slow: ' + a.r.stdout)
  assert.deepStrictEqual([...a.legs].sort(), [...b.legs].sort(),
    'the declared and undeclared hosts must share one leg set: ' + JSON.stringify([a.legs, b.legs]))
  assert.strictEqual(a.r.status, 0, 'every leg is green so review-legs must exit 0: ' + a.r.stdout + a.r.stderr)
})

const KNOWN_LEGS = ['ac-matrix', 'at-risk', 'ci', 'gate', 'promise-sweep', 'reconcile', 'skip-reconcile', 'smoke', 'suite', 'tests']
