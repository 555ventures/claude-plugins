'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { run, stateOf, toReviewer, returnFileWith, specBody, GREEN_TEST, CLEAN_RETURN } = require('./review-driver.fixtures')

// specs/20261103/12-one-suite-run-per-tree.md D1/D5/D8: AC-20261103-12-20, -21, -22, -23.

const SKIPPED = 'close-time suite: skipped — close delta is overlay-only and no test reads it (policy.closeSuite: auto)'

// Counters live in a sibling dir outside the repo (spec § Fixture notes) so a counter write never
// moves the tree; gate.sh and test.sh each print an `ℹ tests 1` line so a green run carries a count.
function makeHost({ closeSuite, testReadsOverlay = false }) {
  const root = fs.realpathSync(tmpdir('rvdrv-close-policy'))
  const counters = fs.realpathSync(tmpdir('rvdrv-close-policy-ctr'))
  const gateCtr = path.join(counters, 'gate')
  const suiteCtr = path.join(counters, 'suite')
  const g = gitRepo(root)
  for (const d of ['.claude', 'src', 'tests', 'docs/canonical']) fs.mkdirSync(path.join(root, d), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'bash gate.sh',
    testCommand: 'bash test.sh',
    policy: { closeSuite },
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none', testCountPattern: 'ℹ tests (\\d+)' },
  }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'specs/**/*.review/\nspecs/**/*.build/\n')
  fs.writeFileSync(path.join(root, 'gate.sh'), `#!/usr/bin/env bash\necho x >> '${gateCtr}'\necho "ℹ tests 1"\n`)
  fs.writeFileSync(path.join(root, 'test.sh'), `#!/usr/bin/env bash\necho x >> '${suiteCtr}'\necho "ℹ tests 1"\n`)
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-close-policy.md')
  fs.writeFileSync(spec, specBody({ diffBase }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  if (testReadsOverlay) {
    // the File Plan's own test file names the path, so reconcile never sees an out-of-plan file
    fs.appendFileSync(path.join(root, 'tests/foo.test.js'), '// reads docs/canonical/x.md\n')
  }
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  const lines = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0)
  return { root, spec, g, gateCount: () => lines(gateCtr), suiteCount: () => lines(suiteCtr) }
}

// Legs (the suite leg runs green with a count and, under D5, is recorded in the run cache) ->
// clean reviewer -> close commit touching only the spec file and docs/canonical/x.md.
function toClosed(host) {
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-close-policy-clean', CLEAN_RETURN))
  run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)
  fs.writeFileSync(path.join(host.root, 'docs/canonical/x.md'), '# x\n')
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
}

const cacheEntries = root => {
  const dir = path.join(root, '.git/spec-run-cache')
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    : []
}

test('AC-20261103-12-20: WHEN --mark closed runs under policy.closeSuite auto after a green counted suite leg and an overlay-only close commit no test reads THE SYSTEM prints the skipped line, spawns no testCommand, and sets marks.closed', () => {
  const host = makeHost({ closeSuite: 'auto' })
  toClosed(host)
  const before = host.suiteCount()
  assert.ok(before > 0, 'setup precondition: the legs iteration must have run testCommand at least once, else the unchanged-counter claim is vacuous')
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'an overlay-only close over a green judged suite must let --mark closed succeed: ' + closed.stdout + closed.stderr)
  assert.ok(closed.stdout.includes(SKIPPED),
    'the driver must print the exact skipped line so a skipped suite is never silent: ' + closed.stdout)
  assert.strictEqual(host.suiteCount(), before,
    'close must not spawn testCommand — a moved counter means the whole suite re-ran over a delta no test reads')
  // marks.closed is set, then the driver retires the sidecar at DONE — so the set mark shows as the state leaving CLOSE
  assert.match(closed.stdout, /state: DONE/,
    'the skipped close must still set marks.closed (state leaves CLOSE for DONE), else the spec never completes')
})

test('AC-20261103-12-21: WHEN the same close runs under policy.closeSuite always THE SYSTEM spawns testCommand once and prints no skipped line', () => {
  const host = makeHost({ closeSuite: 'always' })
  toClosed(host)
  const before = host.suiteCount()
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'a green close must succeed under always: ' + closed.stdout + closed.stderr)
  assert.strictEqual(host.suiteCount() - before, 1,
    'always must spawn testCommand exactly once at close — a delta of 0 means the policy was ignored and the suite was skipped')
  assert.ok(!closed.stdout.includes('close-time suite: skipped'),
    'always must never print the skipped line: ' + closed.stdout)
})

test('AC-20261103-12-22: WHEN closeSuite is auto but a test file contains docs/canonical/x.md THE SYSTEM spawns testCommand once and prints no skipped line', () => {
  const host = makeHost({ closeSuite: 'auto', testReadsOverlay: true })
  toClosed(host)
  const before = host.suiteCount()
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'a green close must succeed: ' + closed.stdout + closed.stderr)
  assert.strictEqual(host.suiteCount() - before, 1,
    'a test that names a changed overlay path must force the suite to run — a delta of 0 skips a suite that reads the delta')
  assert.ok(!closed.stdout.includes('close-time suite: skipped'),
    'the skipped line must not print when a test reads the delta: ' + closed.stdout)
})

const runCache = () => require('../../spec/scripts/lib/run-cache.js')
const closeTreeOf = host => runCache().cacheTree(host.root, [path.relative(host.root, host.spec.replace(/\.md$/, '.review'))])

test('AC-20261103-12-23: WHEN --mark closed runs the gate over a close tree with no cache entry THE SYSTEM spawns it and writes the entry for the close tree', () => {
  const host = makeHost({ closeSuite: 'always' })
  toClosed(host)
  const gateBefore = host.gateCount()
  const closeTree = closeTreeOf(host)
  const key = runCache().keyFor('bash gate.sh', closeTree, [])
  assert.ok(!fs.existsSync(path.join(host.root, '.git/spec-run-cache', key + '.json')),
    'setup precondition: the legs iteration records its own gate under the judged tree, never under the close tree')
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'a green close must succeed: ' + closed.stdout + closed.stderr)
  assert.strictEqual(host.gateCount() - gateBefore, 1,
    'with no entry the close-time gate must spawn once — a delta of 0 means the gate ran nowhere')
  assert.ok(fs.existsSync(path.join(host.root, '.git/spec-run-cache', key + '.json')),
    'a green spawned close-time gate with a count must write an entry for the close tree under <git-dir>/spec-run-cache, else no later stage can reuse it')
})

test('AC-20261103-12-23: WHEN the cache holds a green entry for the resolved gate over the close tree THE SYSTEM prints "close-time gate: reused cache:<tree7>" and spawns no gate', () => {
  const host = makeHost({ closeSuite: 'always' })
  toClosed(host)
  const closeTree = closeTreeOf(host)
  assert.strictEqual(runCache().record(host.root, 'bash gate.sh', closeTree, { exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1 } }), true,
    'setup precondition: a green counted run must be recordable, else the hit leg has nothing to hit')
  const gateBefore = host.gateCount()
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'a green close must succeed: ' + closed.stdout + closed.stderr)
  assert.strictEqual(host.gateCount(), gateBefore,
    'a cache hit over the close tree must spawn no gate — a moved counter means the entry was never consulted')
  assert.match(closed.stdout, new RegExp('^close-time gate: reused cache:' + closeTree.slice(0, 7) + '$', 'm'),
    'the driver must say it reused the cache entry so a skipped gate is never silent: ' + closed.stdout)
})
