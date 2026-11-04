'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { tmpdir, runNode } = require('../helpers')
const { makeReviewLegsHost, reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261103/12-one-suite-run-per-tree.md D1, D5: AC-20261103-12-12..15.

const SCRIPT = 'scripts/review-legs.js'
const SPEC_REL = 'specs/20260817/99-test.md'
const TREE = '3f2a9c1' + '0'.repeat(33)
const GATE = 'bash gate.sh'
const SUITE = 'bash test.sh'
const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260817-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

// Counters live outside the fixture repo (an untracked file inside would reconcile as out-of-plan);
// each stub appends one line per invocation. The gate and the suite count separately.
function makeHost() {
  const cdir = tmpdir('run-cache-counters')
  const gateCounter = path.join(cdir, 'gate')
  const suiteCounter = path.join(cdir, 'suite')
  const host = makeReviewLegsHost('run-cache', {
    specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1',
    config: {
      gateCommand: GATE, testCommand: SUITE, runtime: { inert: 'fixture' },
      capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)', testCountPattern: 'ℹ tests (\\d+)' },
    },
    testBody: GREEN_TEST,
    extraFiles: {
      [SPEC_REL]: reviewLegsSpecBody({ specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1' })
        .replace('| tests/foo.test.js | create | tests |\n', '| tests/foo.test.js | create | tests |\n| gate.sh | create | scripts |\n| test.sh | create | scripts |\n'),
      'gate.sh': `#!/usr/bin/env bash\necho x >> '${gateCounter}'\necho "ℹ tests 2"\necho "ℹ skipped 0"\nexit 0\n`,
      'test.sh': `#!/usr/bin/env bash\necho x >> '${suiteCounter}'\necho "ℹ tests 3"\necho "ℹ skipped 0"\nexit 0\n`,
    },
  })
  return { ...host, gateCounter, suiteCounter, cacheDir: path.join(host.dir, '.git', 'spec-run-cache') }
}

const lines = c => fs.existsSync(c) ? fs.readFileSync(c, 'utf8').split('\n').filter(Boolean).length : 0
const readRows = m => fs.existsSync(m) ? fs.readFileSync(m, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) : []
const keyFor = (cmd, tree) => crypto.createHash('sha256').update(cmd + '\0' + tree + '\0' + '').digest('hex')

// The entry file is written directly (lib/run-cache.js is the implementation under test's
// neighbour, not this file's dependency): key and shape per the spec's Contracts.
function seed(host, cmd, tree, testsExecuted) {
  fs.mkdirSync(host.cacheDir, { recursive: true })
  fs.writeFileSync(path.join(host.cacheDir, keyFor(cmd, tree) + '.json'), JSON.stringify({
    cmd, tree, envNames: [], observed: { skips: 0, todos: 0, testsExecuted }, ts: '2026-11-03T10:00:00.000Z',
  }))
}

function run(host, extra = [], name = 'manifest.jsonl') {
  const manifest = path.join(tmpdir('run-cache-manifest'), name)
  const outDir = tmpdir('run-cache-out')
  const r = runNode(SCRIPT, ['--root', host.dir, '--spec', SPEC_REL, '--base', host.base,
    '--manifest', manifest, '--out-dir', outDir, ...extra])
  const rows = readRows(manifest)
  return { r, rows, byLeg: new Map(rows.map(x => [x.leg, x])), manifest, outDir }
}

const entryFiles = host => fs.existsSync(host.cacheDir) ? fs.readdirSync(host.cacheDir).filter(f => f.endsWith('.json')) : []

test('AC-20261103-12-12: --tree over cache entries for the resolved gate and testCommand appends gate and suite rows stamped reusedFrom cache:<tree7>, spawns neither, writes no gate/suite output, and derives CLEAN', () => {
  const host = makeHost()
  seed(host, GATE, TREE, 2)
  seed(host, SUITE, TREE, 3)
  const { r, byLeg, manifest, outDir } = run(host, ['--tree', TREE])
  assert.strictEqual(r.status, 0, 'a green host with a seeded cache must exit 0: ' + r.stdout + r.stderr)
  assert.strictEqual(lines(host.gateCounter) + lines(host.suiteCounter), 0,
    'a cache hit must spawn neither the gate nor the suite — a counter line means the same tree ran its suite again: ' + r.stdout)
  assert.deepStrictEqual(byLeg.get('gate'),
    { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 2, reusedFrom: 'cache:3f2a9c1' }, scope: 'full' },
    'the gate row must be the recorded observation stamped with cache provenance: ' + JSON.stringify(byLeg.get('gate')))
  assert.deepStrictEqual(byLeg.get('suite'),
    { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 3, reusedFrom: 'cache:3f2a9c1' }, scope: 'full' },
    'the suite row must be the recorded observation stamped with cache provenance: ' + JSON.stringify(byLeg.get('suite')))
  assert.ok(!fs.existsSync(path.join(outDir, 'gate-output.txt')) && !fs.existsSync(path.join(outDir, 'suite-output.txt')),
    'a cached leg must write no output file — advertising evidence that was never produced misleads the reviewer')
  const wf = path.join(tmpdir('run-cache-wf'), 'workflow.json')
  fs.writeFileSync(wf, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  const v = runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', wf])
  assert.strictEqual(v.stdout.split('\n')[0], 'CLEAN',
    'verdict.js must derive CLEAN over cache-stamped rows, or a reused review can never close: ' + v.stdout + v.stderr)
})

test('AC-20261103-12-13: --tree with no entry spawns the gate and suite, records one green entry per command, and a second run with the same --tree spawns nothing', () => {
  const host = makeHost()
  const first = run(host, ['--tree', TREE], 'm1.jsonl')
  assert.strictEqual(first.r.status, 0, 'a green host must exit 0: ' + first.r.stdout + first.r.stderr)
  assert.strictEqual(lines(host.gateCounter), 1, 'the first run must spawn the gate once: ' + first.r.stdout)
  assert.strictEqual(lines(host.suiteCounter), 1, 'the first run must spawn the suite once: ' + first.r.stdout)
  assert.strictEqual(entryFiles(host).length, 2,
    'each green counted gate/suite run must be recorded under cacheDir — without entries the next consumer reruns the suite: ' + JSON.stringify(entryFiles(host)))
  const second = run(host, ['--tree', TREE], 'm2.jsonl')
  assert.strictEqual(lines(host.gateCounter) + lines(host.suiteCounter), 2,
    'the second run over the same --tree must spawn nothing — counters moved past the first run\'s 1+1: ' + second.r.stdout + second.r.stderr)
  assert.strictEqual(second.byLeg.get('suite').observed.reusedFrom, 'cache:3f2a9c1',
    'the second run\'s suite row must carry cache provenance: ' + JSON.stringify(second.byLeg.get('suite')))
})

test('AC-20261103-12-14: without --tree the cache is never consulted (the gate spawns, no reusedFrom), and a malformed --tree exits 2 naming the flag with no row appended', () => {
  const host = makeHost()
  seed(host, GATE, TREE, 2)
  seed(host, SUITE, TREE, 3)
  const bare = run(host, [], 'bare.jsonl')
  assert.strictEqual(lines(host.gateCounter), 1,
    'absent --tree must spawn the gate despite a seeded entry — consulting the cache without a tree key would vouch for an unknown tree: ' + bare.r.stdout + bare.r.stderr)
  assert.ok(!('reusedFrom' in bare.byLeg.get('gate').observed),
    'absent --tree must append no reusedFrom key: ' + JSON.stringify(bare.byLeg.get('gate')))
  const bad = run(host, ['--tree', 'abc'], 'bad.jsonl')
  assert.strictEqual(bad.r.status, 2, 'a malformed --tree must exit 2: ' + bad.r.stdout + bad.r.stderr)
  assert.match(bad.r.stderr, /review-legs\.js: --tree must be a 40-hex tree sha/,
    'the refusal must name the flag and the expected shape, or the driver bug is undiagnosable: ' + bad.r.stderr)
  assert.strictEqual(bad.rows.length, 0, 'a refused invocation must append no manifest row: ' + JSON.stringify(bad.rows))
})

test('AC-20261103-12-15: --reuse-from takes precedence over --tree, so a gate row covered by both is stamped with the prior manifest basename, never cache:', () => {
  const host = makeHost()
  const prior = run(host, [], 'prior-manifest.jsonl')
  assert.strictEqual(prior.r.status, 0, 'setup precondition: a green host must exit 0: ' + prior.r.stdout + prior.r.stderr)
  seed(host, GATE, TREE, 2)
  seed(host, SUITE, TREE, 3)
  const { r, byLeg } = run(host, ['--reuse-from', prior.manifest, '--tree', TREE])
  assert.strictEqual(r.status, 0, 'the combined invocation must succeed: ' + r.stdout + r.stderr)
  assert.strictEqual(byLeg.get('gate').observed.reusedFrom, 'prior-manifest.jsonl',
    'the prior-row path must win over the cache — a cache: stamp here means the precedence order is inverted: ' + JSON.stringify(byLeg.get('gate')))
})
