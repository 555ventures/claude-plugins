'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN, ledgerRows } = require('./review-driver.fixtures')

// specs/20260911/03-tests-expire-at-close.md D5/D6, AC-20260911-03-7: doCloseWork() must run
// expire-tests.js --apply over the closing spec's own tagged tests before the ledger append,
// record tests:{born,kept,retired} on the review row, and print the 🧹 line only when the pass
// actually retired something.

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

test('AC-20260911-03-7: WHEN the review driver reaches CLOSE for a fixture spec whose two tagged tests are one pin and one plain test THE SYSTEM deletes the plain test before the ledger append, records tests:{born:2,kept:1,retired:1} on the review row, still flips status to done, and prints the 🧹 expired-tests line naming zero files removed', () => {
  const host = makeExpiryHost('rvdrv-expiry-retire')
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-expiry-retire-clean', CLEAN_RETURN)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(r.status, 0,
    'a zero-survivor reviewer-returned mark must self-disposition and close even once expiry runs at CLOSE: ' +
    r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a zero-survivor reviewer-returned mark must land CLOSE directly: ' + r.stdout + r.stderr)

  const rows = ledgerRows(host.root)
  const row = rows[rows.length - 1]
  assert.deepStrictEqual(row.tests, { born: 2, kept: 1, retired: 1 },
    'D5: the close row must record exactly one retired test out of two tagged tests, with the pin kept — a ' +
    'missing or wrong tests key means doCloseWork() never ran expire-tests.js --apply: ' + JSON.stringify(row))

  const testFilePath = path.join(host.root, 'tests/foo.test.js')
  assert.ok(fs.existsSync(testFilePath),
    'D6: the pin test\'s survival must keep tests/foo.test.js on disk — its total disappearance would mean ' +
    'the pin was retired too')
  const testFileText = fs.readFileSync(testFilePath, 'utf8')
  assert.ok(!testFileText.includes(host.plainAcId),
    'D3/D4: the plain test tagged ' + host.plainAcId + ' must be deleted at CLOSE, before the ledger append — ' +
    'its survival means the close never applied expiry: ' + JSON.stringify(testFileText))
  assert.ok(testFileText.includes(host.pinAcId),
    'D3(c): the SHALL CONTINUE TO pin tagged ' + host.pinAcId + ' must survive the same expiry pass — deleting ' +
    'it would remove a sanctioned regression pin: ' + JSON.stringify(testFileText))

  assert.match(fs.readFileSync(host.spec, 'utf8'), /status:\s*done/,
    'CLOSE must still flip the spec to done once expiry is wired into doCloseWork()')
  assert.match(r.stdout, /🧹 expired 1 tests \(0 files removed\)/,
    'D6: the CLOSE step must print the exact 🧹 line naming one retired test and zero files removed — the ' +
    'file survives because its sibling pin keeps it non-empty: ' + r.stdout)
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

// Direct fix, 2026-09-12 (prax close deadlock): CLOSE deletes the closing spec's own expired
// tests and then `--mark closed` re-runs the host gate over that same tree. A host gate enforcing
// a test carrier per acceptance criterion on `done` specs reports every criterion of the spec just
// closed as uncovered and refuses the close forever. The driver cannot read the host gate's output
// to know that happened (and must not fork on a host gate's semantics), but it does know its own
// two facts — expiry retired something, and the re-run then went red — which is exactly when the
// refusal must name the contradiction and point at the grounding contract's § Test expiry.
test('a close-time gate that goes red right after expiry deleted tests names the expiry and the contract obligation in its refusal', () => {
  const host = makeExpiryHost('rvdrv-expiry-gate-red')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-expiry-gate-red-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE with expiry applied: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /🧹 expired 1 tests/,
    'setup precondition: CLOSE must have retired exactly the one plain test — without a retirement the hint ' +
    'under test is correctly silent: ' + r.stdout)

  // Stand in for the host gate that reports the just-closed spec's criteria uncovered: a check
  // that is red over the close tree and has nothing to do with the pipeline's own artifacts.
  fs.writeFileSync(path.join(host.root, 'ac-coverage.sh'),
    '#!/usr/bin/env bash\necho "AC_UNCOVERED AC-20260911-88-1"\nexit 1\n')
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.gateCommand = 'bash ac-coverage.sh'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 2,
    'a red close-time gate must still refuse the mark — the hint explains the refusal, it never excuses it: ' +
    closed.stdout + closed.stderr)
  assert.match(closed.stderr, /gate red at close/,
    'the existing close-time gate anchor must survive the added hint: ' + closed.stderr)
  assert.match(closed.stderr, /CLOSE deleted 1 expired test\(s\)/,
    'the refusal must name how many tests expiry deleted from this very tree — a session reading a bare red ' +
    'gate has no way to connect the deletion to the failure: ' + closed.stderr)
  assert.match(closed.stderr, /§ Test expiry/,
    'the refusal must point at the grounding contract section carrying the host obligation, so the fix lands ' +
    'in the host check rather than in restored tests: ' + closed.stderr)
  assert.match(closed.stderr, /never restore the tests, and never relabel the criteria/,
    'the refusal must foreclose both wrong repairs (restoring the tests, relabelling the criteria SHALL ' +
    'CONTINUE TO) — both were reached for in the field before the real cause was found: ' + closed.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave the state at CLOSE')
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
