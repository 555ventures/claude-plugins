'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN, ledgerRows } = require('./review-driver.fixtures')

// specs/20260912/13-expired-tests-leave-in-their-own-commit.md D2-D7, AC-20260912-13-2..-7:
// doCloseWork() only classifies at CLOSE (never --apply); the deletion, the whole-suite re-run and
// the driver's own path-scoped commit-or-restore all move inside --mark closed, after the
// close-time gate has certified the tree with the tests still present.

function expiryHostSpecBody({ diffBase, plainAcId, pinAcId, onlyPin }) {
  const plainDecision = onlyPin ? '' : `| D1 | foo() returns 42 (${plainAcId}) | why |\n`
  const plainAc = onlyPin ? '' : `- **${plainAcId}**: foo() returns 42.\n`
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Driver Expiry Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
${plainDecision}| D2 | bar() keeps returning true (${pinAcId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

${plainAc}- **${pinAcId}**: WHEN a caller invokes bar() THE SYSTEM SHALL CONTINUE TO return true.
`
}

function testFileBody({ plainAcId, pinAcId, onlyPin }) {
  const plain = onlyPin ? ''
    : `test('${plainAcId}: foo() returns 42', () => { assert.strictEqual(require('../src/foo.js')(), 42) })\n`
  return `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
${plain}test('${pinAcId}: bar keeps returning true', () => { assert.ok(true) })
`
}

// A closing spec dated on/after the floor (specs/20260911/…) so its own SHALL CONTINUE TO
// bullet counts as a pin (D3(c)) — one plain AC (retired at close, unless onlyPin) and one pin
// AC, both cited by tests living in the SAME file, so retiring only the plain one never empties
// the file (D6's "0 files removed").
function makeExpiryHost(prefix, { onlyPin = false } = {}) {
  const root = fs.realpathSync(tmpdir(prefix))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  // Real hosts (this repo included) never track the driver's own review/build sidecars — without
  // this the fixture's own `git add -A` would track .review/, which no real host does, and would
  // make AC-20260912-13-4's clean `git status --porcelain` assertion pass for the wrong reason.
  fs.writeFileSync(path.join(root, '.gitignore'), 'specs/**/*.review/\nspecs/**/*.build/\n')
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260911'), { recursive: true })
  const spec = path.join(root, 'specs/20260911/88-drv-expiry.md')
  const plainAcId = 'AC-20260911-88-1'
  const pinAcId = 'AC-20260911-88-2'
  fs.writeFileSync(spec, expiryHostSpecBody({ diffBase, plainAcId, pinAcId, onlyPin }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), testFileBody({ plainAcId, pinAcId, onlyPin }))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, plainAcId, pinAcId }
}

test('AC-20260912-13-2: WHEN the review driver reaches CLOSE for a fixture spec whose two tagged tests are one pin and one plain test THE SYSTEM leaves both tests on disk (classification only, nothing written), records tests:{born:2,kept:1,retired:1} on the review row, still flips status to done, and prints the D3 deferred-commit 🧹 line naming zero files removed', () => {
  const host = makeExpiryHost('rvdrv-expiry-retire')
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-expiry-retire-clean', CLEAN_RETURN)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(r.status, 0,
    'a zero-survivor reviewer-returned mark must self-disposition and close even once expiry classification ' +
    'runs at CLOSE: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a zero-survivor reviewer-returned mark must land CLOSE directly: ' + r.stdout + r.stderr)

  const rows = ledgerRows(host.root)
  const row = rows[rows.length - 1]
  assert.deepStrictEqual(row.tests, { born: 2, kept: 1, retired: 1 },
    'D2: the close row must record exactly one retired test out of two tagged tests, with the pin kept — a ' +
    'missing or wrong tests key means doCloseWork() never ran expire-tests.js: ' + JSON.stringify(row))

  const testFilePath = path.join(host.root, 'tests/foo.test.js')
  const testFileText = fs.readFileSync(testFilePath, 'utf8')
  assert.ok(testFileText.includes(host.plainAcId),
    'D1/D2: doCloseWork() drops --apply — the plain test tagged ' + host.plainAcId + ' must still be on disk at ' +
    'CLOSE. Its absence means the close is still deleting eagerly, which is exactly the bug this spec fixes ' +
    '(the close commit would once again record a tree the review never judged): ' + JSON.stringify(testFileText))
  assert.ok(testFileText.includes(host.pinAcId),
    'D3(c): the SHALL CONTINUE TO pin tagged ' + host.pinAcId + ' must be on disk at CLOSE too: ' +
    JSON.stringify(testFileText))

  assert.match(fs.readFileSync(host.spec, 'utf8'), /status:\s*done/,
    'CLOSE must still flip the spec to done once expiry classification is wired into doCloseWork()')
  assert.match(r.stdout, /🧹 1 tests expire with this spec \(0 files removed\) — deleted in their own commit when you mark closed/,
    'D3: the CLOSE step must print the new deferred-commit wording verbatim, naming what will happen when the ' +
    'session marks closed — not the retired "part of the close commit" phrasing, which claims the deletion is ' +
    'already inside this tree: ' + r.stdout)
})

test('AC-20260911-03-7: WHEN nothing is retired at CLOSE THE SYSTEM records tests:{born:1,kept:1,retired:0} on the review row and prints no 🧹 line', () => {
  const host = makeExpiryHost('rvdrv-expiry-keep', { onlyPin: true })
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-expiry-keep-clean', CLEAN_RETURN)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(r.status, 0,
    'a zero-survivor reviewer-returned mark must self-disposition and close when nothing is retired: ' +
    r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a zero-survivor reviewer-returned mark must land CLOSE directly: ' + r.stdout + r.stderr)

  const rows = ledgerRows(host.root)
  const row = rows[rows.length - 1]
  assert.deepStrictEqual(row.tests, { born: 1, kept: 1, retired: 0 },
    'D5: a host holding only the pin test must record one born, one kept, zero retired — a missing tests key ' +
    'means doCloseWork() never ran expire-tests.js: ' + JSON.stringify(row))

  assert.doesNotMatch(r.stdout, /🧹/,
    'D6: the CLOSE step must print no 🧹 line at all when nothing was retired — printing one here would ' +
    'misreport a deletion that never happened: ' + r.stdout)
})

test('AC-20260912-13-6: WHEN a close retires nothing THE SYSTEM leaves git rev-parse HEAD byte-identical before and after --mark closed', () => {
  const host = makeExpiryHost('rvdrv-expiry-mark-closed-nothing', { onlyPin: true })
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-mark-closed-nothing-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
  const closeSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'a close that retires nothing must still succeed: ' + closed.stdout + closed.stderr)

  const headSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headSha, closeSha,
    'D4: when retired is 0 the sequence collapses to exactly today\'s two runs and makes no commit at all — a ' +
    'changed HEAD here means a commit was made (or attempted) with nothing to actually commit')
})

// specs/20260912/13-expired-tests-leave-in-their-own-commit.md D5: on a green whole-suite re-run
// with an expiry applied, `--mark closed` itself deletes and commits the retired tests, path-scoped
// to the union of retired[].file and emptied[] — never `git add -A`. That second commit must touch
// nothing under specs/, so `git log -1 -- <spec>` keeps resolving the close commit that precedes it.
test('AC-20260912-13-3: WHEN --mark closed runs over a host with a green gate and a green suite THE SYSTEM deletes the retired test, creates exactly one new commit naming the retired count and spec whose only changed path is that test file, and leaves git log -1 for the spec resolving to the close commit rather than the new one', () => {
  const host = makeExpiryHost('rvdrv-expiry-mark-closed-green')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-mark-closed-green-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  const specRel = path.relative(host.root, host.spec).split(path.sep).join('/')
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
  const closeSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'a green gate and a green whole-suite re-run must let --mark closed succeed and commit the deletion ' +
    'itself: ' + closed.stdout + closed.stderr)

  const headSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.notStrictEqual(headSha, closeSha,
    'D5: --mark closed must create a NEW commit carrying the deletion — the deletion never folding into (or ' +
    'being skipped past) the already-made close commit is the entire point of this spec')

  const msg = execFileSync('git', ['-C', host.root, 'log', '-1', '--format=%s', headSha], { encoding: 'utf8' }).trim()
  assert.strictEqual(msg, 'chore(tests): expire 1 tests closed with ' + specRel,
    'D5: the expiry commit message must be exactly this literal — a session or the replay harness reading ' +
    'history depends on it naming the retired count and the closing spec: ' + JSON.stringify(msg))

  const changed = execFileSync('git', ['-C', host.root, 'diff', '--name-only', closeSha, headSha], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
  assert.deepStrictEqual(changed, ['tests/foo.test.js'],
    'D5: the expiry commit must be staged path-scoped to the retired/emptied union, never `git add -A` — ' +
    'anything else riding this commit (the ledger, retained evidence) would strand a linked worktree\'s ' +
    'finishMerge() promotion: ' + JSON.stringify(changed))

  const testFileText = fs.readFileSync(path.join(host.root, 'tests/foo.test.js'), 'utf8')
  assert.ok(!testFileText.includes(host.plainAcId),
    'the plain test must actually be deleted from disk by the expiry commit, not merely reported retired')
  assert.ok(testFileText.includes(host.pinAcId), 'the pin test must survive the same sweep')

  const specLogSha = execFileSync('git', ['-C', host.root, 'log', '-1', '--format=%H', '--', specRel],
    { encoding: 'utf8' }).trim()
  assert.strictEqual(specLogSha, closeSha,
    'the whole point of this spec: git log -1 for the spec path must still resolve to the close commit, never ' +
    'to the expiry commit that follows it — otherwise the replay harness rebuilds a tree missing coverage the ' +
    'review just certified')
})

// specs/20260912/13-expired-tests-leave-in-their-own-commit.md D6/D7: the close-time gate now runs
// BEFORE any deletion, so a gate observing the committed close tree never sees the tests gone — the
// prax deadlock this once caused can no longer happen at the gate step. What CAN still go red is the
// whole-suite re-run AFTER expiry applies; when restoring the deletion makes that suite green again,
// the deletion is provably the cause, and the mark must succeed with a warning rather than deadlock.
test('a close-time gate that goes red right after expiry deletes the retired test, and turns green again once it is restored, skips the expiry with a warning instead of refusing the mark', () => {
  const host = makeExpiryHost('rvdrv-expiry-skip-warn')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-skip-warn-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  // Stands in for a host check demanding a test carrier per acceptance criterion: green while
  // tests/foo.test.js still names the plain AC, red the instant expiry's --apply removes it.
  fs.writeFileSync(path.join(host.root, 'check-test.sh'),
    '#!/usr/bin/env bash\ngrep -q "' + host.plainAcId + '" tests/foo.test.js && exit 0 || exit 1\n')
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.testCommand = 'bash check-test.sh'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
  const closeSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'D6: a suite that is red only because of the deletion, and provably green once the deletion is undone, ' +
    'must let the mark succeed rather than deadlock the close forever: ' + closed.stdout + closed.stderr)

  assert.match(closed.stdout, /⚠ expiry skipped/,
    'AC-4: the skip warning must carry its own literal anchor: ' + closed.stdout)
  assert.match(closed.stdout, /deleting the 1 test\(s\) this close retired turns the suite red/,
    'AC-4/D7: the warning must name the retired count so a session can tell which deletion is implicated: ' +
    closed.stdout)
  assert.match(closed.stdout, /§ Test expiry/,
    'AC-4/D7: the warning must point at the grounding contract section carrying the host obligation: ' +
    closed.stdout)
  assert.match(closed.stdout, /--all-done --apply/,
    'AC-4/D7: the warning must name the sweep remedy for a host whose own check silently never expires ' +
    'anything: ' + closed.stdout)

  const headSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headSha, closeSha,
    'D6: skipping the expiry must make no commit at all — the close stays exactly at the tree the gate ' +
    'certified')
  const statusPorcelain = execFileSync('git', ['-C', host.root, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
  assert.strictEqual(statusPorcelain, '',
    'D6: the restore (git checkout HEAD -- <paths>) must leave the working tree clean, not merely reverted ' +
    'content that git still reports as a diff: ' + JSON.stringify(statusPorcelain))

  const testFileText = fs.readFileSync(path.join(host.root, 'tests/foo.test.js'), 'utf8')
  assert.ok(testFileText.includes(host.plainAcId),
    'D6: the retired test must be restored on disk since its deletion was reverted')
})

// specs/20260912/13-expired-tests-leave-in-their-own-commit.md D6: the OTHER arm of the restored
// re-run — still red once the deletion is undone means the close tree itself is broken for a reason
// that has nothing to do with expiry, and the mark must refuse exactly as it always has.
test('AC-20260912-13-5: WHEN the host testCommand stays red both with the retired test deleted and with it restored THE SYSTEM restores the file, creates no commit, refuses --mark closed with exit 2 and "suite red at close", and prints no expiry-skipped warning', () => {
  const host = makeExpiryHost('rvdrv-expiry-suite-still-red')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-suite-still-red-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  fs.writeFileSync(path.join(host.root, 'always-red.sh'), '#!/usr/bin/env bash\nexit 1\n')
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.testCommand = 'bash always-red.sh'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
  const closeSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 2,
    'a suite that is red for a reason unrelated to the deletion must still refuse the close, or a genuinely ' +
    'broken close tree could be masked as an expiry skip: ' + closed.stdout + closed.stderr)
  assert.match(closed.stderr, /suite red at close/,
    'the existing close-time suite-red refusal must survive: ' + closed.stderr)
  assert.doesNotMatch(closed.stdout + closed.stderr, /⚠ expiry skipped/,
    'D6: the still-red arm is the broken-close-tree arm, not the deletion-is-the-cause arm — it must never ' +
    'print the skip warning: ' + closed.stdout + closed.stderr)

  const headSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headSha, closeSha, 'a refused mark must make no commit')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'a refused closed mark must leave the state at CLOSE')

  const testFileText = fs.readFileSync(path.join(host.root, 'tests/foo.test.js'), 'utf8')
  assert.ok(testFileText.includes(host.plainAcId),
    'D6: even though this arm refuses, the retired test must have been restored back onto disk rather than ' +
    'left deleted, since the driver never leaves an interrupted mark holding a mutation it did not commit')
})

test('a close-time gate that goes red when expiry retired nothing carries no expiry note', () => {
  const host = makeExpiryHost('rvdrv-expiry-gate-red-keep', { onlyPin: true })
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-gate-red-keep-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  fs.writeFileSync(path.join(host.root, 'always-red.sh'), '#!/usr/bin/env bash\nexit 1\n')
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.gateCommand = 'bash always-red.sh'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 2, 'setup precondition: the red gate must refuse the mark: ' + closed.stderr)
  assert.doesNotMatch(closed.stderr, /CLOSE deleted/,
    'a close that retired nothing must print no expiry note — an unconditional note would send every ordinary ' +
    'red gate hunting a deletion that never happened: ' + closed.stderr)
})
