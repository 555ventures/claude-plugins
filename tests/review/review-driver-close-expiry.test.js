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
//
// specs/20260912/15-the-close-stops-deleting-tests.md D1/D2/D4/D6, AC-20260912-15-1/-2/-6: that
// commit-or-restore machinery is now gone entirely — CLOSE still classifies (nothing writes), the
// 🧹 line is reworded to say nothing is deleted at close, and `--mark closed` never applies expiry,
// commits, restores, or warns; it is gate + whole-suite re-run only.

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

test('AC-20260912-15-1: WHEN the review driver reaches CLOSE for a fixture spec whose two tagged tests are one pin and one plain test THE SYSTEM leaves both test files byte-identical on disk, records tests:{born:2,kept:1,retired:1} on the review row, still flips status to done, and prints exactly the nothing-is-deleted 🧹 line naming the sweep command', () => {
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
  assert.match(r.stdout,
    /🧹 1 tests are retirable with this spec \(0 files would empty\) — nothing is deleted at close; sweep deliberately with: node "\$\(spec-paths test-expiry\)" --root \. --all-done --apply/,
    'D4: the CLOSE step must print exactly this rewritten line — the old wording promised a deletion "in their ' +
    'own commit when you mark closed", which no longer happens; a session reading the old wording would go ' +
    'looking for a commit that was never made: ' + r.stdout)
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

// specs/20260912/15-the-close-stops-deleting-tests.md D1/D2/D13, AC-20260912-15-2: `--mark closed`
// no longer applies expiry, commits a deletion, or restores anything — a close that recorded
// retired:1 and a close that recorded retired:0 must now behave identically with respect to the
// tree and to `git rev-parse HEAD`.
test('AC-20260912-15-2: WHEN --mark closed runs with a green gate and a green suite over a host whose close recorded retired: 1 THE SYSTEM exits 0, leaves git rev-parse HEAD byte-identical before and after the mark, and leaves the retirable test file byte-identical on disk', () => {
  const host = makeExpiryHost('rvdrv-expiry-mark-closed-retired')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-mark-closed-retired-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
  const closeSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const testFilePath = path.join(host.root, 'tests/foo.test.js')
  const before = fs.readFileSync(testFilePath, 'utf8')

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'a close that recorded retired:1 must still let --mark closed succeed once close-time deletion is gone: ' +
    closed.stdout + closed.stderr)

  const headSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(headSha, closeSha,
    'D2/D13: --mark closed no longer applies expiry or makes a deletion commit — a close that retired 1 test ' +
    'and a close that retired none must now leave git rev-parse HEAD identically untouched: a changed HEAD ' +
    'here means the driver still committed a deletion')

  const after = fs.readFileSync(testFilePath, 'utf8')
  assert.strictEqual(after, before,
    'D1/D2: the retirable test file must stay byte-identical across --mark closed — the deliberate sweep is ' +
    'now the only thing that ever deletes it')
  assert.ok(after.includes(host.plainAcId),
    'D1/D2: the plain test tagged ' + host.plainAcId + ' must still be present on disk after --mark closed')
})

// specs/20260912/15-the-close-stops-deleting-tests.md D2/D6, AC-20260912-15-6: none of the removed
// deletion machinery's literals may survive a retiring close — no skip warning (nothing is ever
// skipped, because nothing is ever attempted) and no expiry commit message, on stdout, stderr, or
// in git history.
test('AC-20260912-15-6: WHEN --mark closed completes over a retiring close THE SYSTEM prints neither ⚠ expiry skipped nor chore(tests): expire on stdout or stderr, and git log -1 --format=%s does not match ^chore\\(tests\\): expire', () => {
  const host = makeExpiryHost('rvdrv-expiry-mark-closed-no-expire-commit')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-mark-closed-no-expire-commit-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)

  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'a green gate and a green whole-suite re-run must let --mark closed succeed with no expiry work at all: ' +
    closed.stdout + closed.stderr)

  const combined = closed.stdout + closed.stderr
  assert.doesNotMatch(combined, /⚠ expiry skipped/,
    'AC-20260912-15-6: nothing is ever applied at --mark closed, so nothing can ever be skipped — this literal ' +
    'surviving means the removed restore-and-warn arm is still wired in: ' + combined)
  assert.doesNotMatch(combined, /chore\(tests\): expire/,
    'AC-20260912-15-6: --mark closed must never make an expiry commit or print its message — this literal ' +
    'surviving means the deletion-and-commit machinery is still wired in: ' + combined)

  const msg = execFileSync('git', ['-C', host.root, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  assert.doesNotMatch(msg, /^chore\(tests\): expire/,
    'AC-20260912-15-6: HEAD must never carry an expiry commit — its subject line matching the retired removed ' +
    'commit shape means --mark closed made one anyway: ' + JSON.stringify(msg))
})

test('AC-20260912-13-7: WHEN the resolved host gate exits non-zero over the committed close tree THE SYSTEM SHALL CONTINUE TO refuse --mark closed with exit 2 and "gate red at close", SHALL CONTINUE TO leave the driver state at CLOSE, and SHALL CONTINUE TO print no expiry note when the close retired nothing', () => {
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
  assert.strictEqual(closed.status, 2, 'AC-20260912-13-7: a red gate over the committed close tree must refuse the mark: ' + closed.stderr)
  assert.match(closed.stderr, /gate red at close/,
    'AC-20260912-13-7: the refusal must carry its own literal anchor so a session can tell this apart from the ' +
    'suite-red refusal: ' + closed.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'AC-20260912-13-7: a refused closed mark must leave the driver state at CLOSE: ' + closed.stdout + closed.stderr)
  assert.doesNotMatch(closed.stdout + closed.stderr, /⚠ expiry skipped/,
    'AC-20260912-13-7: a close that retired nothing must print no expiry note — an unconditional note would send ' +
    'every ordinary red gate hunting a deletion that never happened: ' + closed.stdout + closed.stderr)
})

// specs/20260912/15-the-close-stops-deleting-tests.md D11, AC-20260912-15-9: the same gate-red
// refusal carries over a CLOSE that classified a retirable test — since --mark closed no longer
// deletes anything, a close whose classification recorded retired:1 must refuse identically to
// one that recorded retired:0.
test('AC-20260912-15-9: WHEN the resolved host gate exits non-zero over a committed close tree whose classification recorded a retirable test THE SYSTEM SHALL CONTINUE TO refuse --mark closed with exit 2 and "gate red at close", and SHALL CONTINUE TO leave the driver state at CLOSE', () => {
  const host = makeExpiryHost('rvdrv-expiry-gate-red-retired')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-gate-red-retired-clean', CLEAN_RETURN))
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
  assert.strictEqual(closed.status, 2,
    'AC-20260912-15-9: a red gate over the committed close tree must refuse the mark even when the close recorded ' +
    'a retirable test — refusal must not depend on whether anything was classified retirable: ' + closed.stderr)
  assert.match(closed.stderr, /gate red at close/,
    'AC-20260912-15-9: the refusal must carry its own literal anchor so a session can tell this apart from the ' +
    'suite-red refusal: ' + closed.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'AC-20260912-15-9: a refused closed mark must leave the driver state at CLOSE: ' + closed.stdout + closed.stderr)
})
