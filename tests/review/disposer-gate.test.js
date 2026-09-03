'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260901/09-disposer-gate.md (brief 18b): the session-change CHECKPOINT
// (specs/20260901/03 D2, hardened by 05 D1-D3) is retired — walked past in 2 of 2 real loop
// runs before 18a and, after 18a, converted into a restart ceremony. Independence moves to a
// fresh-context `spec:disposer` agent whose return the driver refuses to advance `--mark
// dispositions` without (D2). Both `via` values now land DISPOSITIONS directly after
// reviewer-returned (D4); every review verdict pass carries a derived `--checkpoint
// <disposer|empty|not-reached>` outcome (D6, verdict.js's new enum per D5). This file replaces
// tests/review/loop-checkpoint.test.js (deleted, D9 — every test there pinned the retired
// mechanism) and reuses that file's makeHost/writeStamp fixture vocabulary plus
// review-driver.test.js's toReviewer/returnFileWith idiom (A6). Written before
// spec-review-driver.js/verdict.js implement any of D1-D6 (TDD red) — every test
// below fails against current code because CHECKPOINT still exists and DISPOSER_FAILED/--file
// verification does not.

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260820-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase, acId) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Disposer Gate Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

// Fixture vocabulary copied from tests/review/loop-checkpoint.test.js (A6) — this file was
// deleted under D9 and its makeHost/writeStamp shape is the one this spec names as the fixture
// this test author reuses.
function makeHost(prefix, { gateFails = false } = {}) {
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
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-disposer-gate.md')
  fs.writeFileSync(spec, specBody(diffBase, 'AC-20260820-99-1'))
  fs.writeFileSync(path.join(root, 'src/foo.js'), gateFails ? 'module.exports = () => 0\n' : 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

function readState(sidecar) {
  return JSON.parse(fs.readFileSync(path.join(sidecar, 'review-state.json'), 'utf8'))
}
function readStateRaw(sidecar) {
  return fs.readFileSync(path.join(sidecar, 'review-state.json'), 'utf8')
}

function lastLedgerRow(root) {
  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  return JSON.parse(lines[lines.length - 1])
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function toReviewer(host) {
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before this AC can be exercised: ' + r.stdout + r.stderr)
  return r
}

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

// readSessionStamp(root) (spec/scripts/lib/session-stamp.js) reads exactly this shape.
function writeStamp(root, sessionId) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-session.json'), JSON.stringify({
    session_id: sessionId,
    transcript_path: path.join(root, 'transcript.jsonl'),
    cwd: root,
    ts: new Date().toISOString(),
  }))
}

const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }
const ONE_SURVIVOR_RETURN = {
  verdict: 'CLEAN',
  survivors: [{ severity: 'soft', claim: 'x0', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}
const TWO_SURVIVOR_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'soft', claim: 'x0', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'x1', file: 'src/foo.js', line: 2, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

// Builds a host at DISPOSITIONS whose pools are exactly AC-20260901-09-3's shape: two
// reviewer survivors (s0, s1) plus one failing non-blocking leg row (leg:drift, exit 1) —
// appended directly onto the driver's own manifest-1.jsonl, mirroring how loop-checkpoint's
// deleted writeStamp() poked the host's stamp file directly (a synthetic evidence row, never a
// second review-legs.js leg implementation).
function makeTwoSurvivorPoolHost(prefix, viaArgs = []) {
  const host = makeHost(prefix)
  run(host.root, host.spec, ...viaArgs)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: the fixture must reach REVIEWER (manifest-1.jsonl written) before the drift leg row can be appended')
  fs.appendFileSync(path.join(host.sidecar, 'manifest-1.jsonl'),
    JSON.stringify({ leg: 'drift', exit: 1, observed: { note: 'synthetic non-blocking finding' } }) + '\n')
  const returnFile = returnFileWith(prefix + '-return', TWO_SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: a two-survivor reviewer return must land DISPOSITIONS directly (D4 — no CHECKPOINT on the way): ' +
    JSON.stringify(readState(host.sidecar)))
  return host
}

const validDispositions = () => ([
  { ref: 's0', recommended: 'fix', reason: 'D1 quoted' },
  { ref: 's1', recommended: 'waive', reason: 'D2 sanctions', final: 'fix', overriddenBy: 'user', overrideReason: 'fix it' },
  { ref: 'leg:drift', recommended: 'reject', reason: 'executed: matrix full' },
])
function disposerReturn(dispositions, tokens = 5, verdict = 'DISPOSED') {
  return { verdict, dispositions, tokens }
}

// ---- AC-20260901-09-1 ---------------------------------------------------------------------

test('AC-20260901-09-1: WHEN a review driver created with --via loop (and, separately, one created without --via) reaches --mark reviewer-returned with a stamp present and unchanged THE SYSTEM lands DISPOSITIONS directly (never CHECKPOINT) on the next bare invocation, --state prints DISPOSITIONS, and review-state.json carries no checkpoint key', () => {
  const loopHost = makeHost('disposer-ac1-loop')
  run(loopHost.root, loopHost.spec, '--via', 'loop')
  writeStamp(loopHost.root, 's1')
  run(loopHost.root, loopHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac1-loop-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'DISPOSITIONS',
    'AC-20260901-09-1/D4: a --via loop run whose stamp is present and unchanged must land DISPOSITIONS directly — CHECKPOINT no longer exists as a state deriveState() can return')
  const stepR = run(loopHost.root, loopHost.spec)
  assert.doesNotMatch(stepR.stdout, /CHECKPOINT/,
    'AC-20260901-09-1: the printed step for a --via loop run must never mention CHECKPOINT — the retired mechanism must not leak into the driver\'s own output: ' + stepR.stdout)
  const loopState = readState(loopHost.sidecar)
  assert.strictEqual('checkpoint' in loopState, false,
    'AC-20260901-09-1: review-state.json must carry no checkpoint key for a --via loop run — D4 removes the marks.checkpoint write entirely: ' + JSON.stringify(loopState))

  const noFlagHost = makeHost('disposer-ac1-noflag')
  run(noFlagHost.root, noFlagHost.spec)
  writeStamp(noFlagHost.root, 's1')
  run(noFlagHost.root, noFlagHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac1-noflag-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(noFlagHost.root, noFlagHost.spec), 'DISPOSITIONS',
    'AC-20260901-09-1/D4: a run created with no --via flag must also land DISPOSITIONS directly with a stamp present and unchanged')
  const noFlagState = readState(noFlagHost.sidecar)
  assert.strictEqual('checkpoint' in noFlagState, false,
    'AC-20260901-09-1: a run created without --via must also carry no checkpoint key in review-state.json: ' + JSON.stringify(noFlagState))
})

// ---- AC-20260901-09-2 ---------------------------------------------------------------------

test('AC-20260901-09-2: WHEN the reviewer return holds one survivor and --mark dispositions --waived 0 --rejected 0 --fix-dispatched 1 is passed without --file THE SYSTEM exits 2 with stderr naming --file and spec:disposer, leaves --state at DISPOSITIONS, and leaves review-state.json byte-identical', () => {
  const host = makeHost('disposer-ac2')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac2-return', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a one-survivor return must land DISPOSITIONS')
  const before = readStateRaw(host.sidecar)

  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(r.status, 2,
    'AC-20260901-09-2/D2: a non-empty pool must refuse --mark dispositions with no --file — the disposer\'s artifact is the mechanical, unskippable gate this spec installs in place of CHECKPOINT: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /--file/,
    'AC-20260901-09-2: the refusal must name --file specifically: ' + r.stderr)
  assert.match(r.stderr, /spec:disposer/,
    'AC-20260901-09-2: the refusal must name spec:disposer — the session must know WHICH agent to dispatch, not just that something is missing: ' + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'a refused dispositions mark must leave the state at DISPOSITIONS unchanged')
  assert.strictEqual(readStateRaw(host.sidecar), before,
    'a refused dispositions mark must leave review-state.json byte-identical — no partial write may survive a refusal')
})

// ---- AC-20260901-09-3 / AC-20260901-09-6 (disposer clause) --------------------------------

test('AC-20260901-09-3: WHEN the reviewer return holds two survivors, the manifest holds one failing non-blocking leg row leg:drift, and --file names a return covering every ref with counts --waived 0 --rejected 1 --fix-dispatched 2 THE SYSTEM exits 0, copies the file to <sidecar>/disposer-return-1.json, and records disposer:{iteration:1,overrides:1} in review-state.json', () => {
  const host = makeTwoSurvivorPoolHost('disposer-ac3')
  const returnFile = returnFileWith('disposer-ac3-file', disposerReturn(validDispositions()))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', returnFile, '--waived', '0', '--rejected', '1', '--fix-dispatched', '2')
  assert.strictEqual(r.status, 0,
    'AC-20260901-09-3: a return covering every survivor and leg finding exactly once, with matching counts, must be accepted: ' + r.stdout + r.stderr)

  const copied = path.join(host.sidecar, 'disposer-return-1.json')
  assert.ok(fs.existsSync(copied),
    'AC-20260901-09-3/Contracts: the accepted return must be copied to <sidecar>/disposer-return-1.json — an unretained return leaves no evidence the disposer actually ran: ' + host.sidecar)
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(copied, 'utf8')), disposerReturn(validDispositions()),
    'the copied disposer-return-1.json must hold the exact return the session wrote, not a re-derived or summarized copy')

  const state = readState(host.sidecar)
  assert.ok(state.disposer, 'review-state.json must gain a disposer key on acceptance: ' + JSON.stringify(state))
  assert.strictEqual(state.disposer.iteration, 1,
    'AC-20260901-09-3/D2: disposer.iteration must equal the reviewer-return iteration this dispositions mark accepted: ' + JSON.stringify(state))
  assert.strictEqual(state.disposer.overrides, 1,
    'AC-20260901-09-3/D2: disposer.overrides must count exactly the one entry (s1) whose final differs from recommended: ' + JSON.stringify(state))
})

test('AC-20260901-09-6 (disposer clause): WHEN a run accepts AC-20260901-09-3\'s return (one override, zero fix-dispatched so the run closes directly) THE SYSTEM appends a ledger row carrying checkpoint deep-equal to {"outcome":"disposer","overrides":1} immediately after verdict', () => {
  // Deviation from a literal re-use of AC-3's own fixture: AC-3's return dispatches 2 fixes,
  // which routes the run through FIX (never straight to a close/escalate row within this single
  // mark). This host isolates the SAME disposer-override mechanism (one waive overridden to
  // reject by the user) with zero fix-dispatched entries, so the mark itself lands CLOSE and
  // appends the row this AC's second clause pins — logged in the spec's deviations sidecar.
  const host = makeHost('disposer-ac6-disposer')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac6-return', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a one-survivor return must land DISPOSITIONS')

  const returnFile = returnFileWith('disposer-ac6-file', disposerReturn([
    { ref: 's0', recommended: 'waive', reason: 'D2 sanctions', final: 'reject', overriddenBy: 'user', overrideReason: 'actually reject it' },
  ]))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', returnFile, '--waived', '0', '--rejected', '1', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a fully covered, count-matching return with zero fix-dispatched must be accepted and close the run: ' + r.stdout + r.stderr)

  const row = lastLedgerRow(host.root)
  const keys = Object.keys(row)
  assert.strictEqual(keys[keys.indexOf('verdict') + 1], 'checkpoint',
    'D5: the checkpoint key must sit immediately after verdict on the close row: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.checkpoint, { outcome: 'disposer', overrides: 1 },
    'AC-20260901-09-6/D6: a run whose disposer mark recorded one override, with no fix cycle in between, must carry checkpoint:{"outcome":"disposer","overrides":1} on its close row: ' + JSON.stringify(row))
})

// ---- AC-20260901-09-4 -----------------------------------------------------------------------

test('AC-20260901-09-4: against AC-20260901-09-3\'s pools, --mark dispositions is refused (exit 2, no disposer-return-1.json written, review-state.json byte-identical) for a missing --file, unreadable/non-JSON content, a DISPOSER_FAILED verdict, an uncovered ref, a duplicate ref, an unknown ref, an out-of-enum recommended, a blank reason, an out-of-enum final, a final without overriddenBy, and a fully valid return with the wrong --fix-dispatched count', () => {
  const host = makeTwoSurvivorPoolHost('disposer-ac4')
  const before = readStateRaw(host.sidecar)
  const copiedPath = path.join(host.sidecar, 'disposer-return-1.json')
  const commonCounts = ['--waived', '0', '--rejected', '1', '--fix-dispatched', '2']

  function expectRefused(name, fileArg, extraArgs, stderrRe) {
    const args = ['--mark', 'dispositions', ...fileArg, ...extraArgs]
    const r = run(host.root, host.spec, ...args)
    assert.strictEqual(r.status, 2,
      `AC-20260901-09-4 (${name}): must exit 2 — an admitted refusal case here would let a malformed or non-covering disposer return land on the ledger: ` + r.stdout + r.stderr)
    if (stderrRe) {
      assert.match(r.stderr, stderrRe,
        `AC-20260901-09-4 (${name}): the refusal must name the failing check: ` + r.stderr)
    }
    assert.ok(!fs.existsSync(copiedPath),
      `AC-20260901-09-4 (${name}): a refused mark must never write disposer-return-1.json: ` + copiedPath)
    assert.strictEqual(readStateRaw(host.sidecar), before,
      `AC-20260901-09-4 (${name}): a refused mark must leave review-state.json byte-identical`)
    assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
      `AC-20260901-09-4 (${name}): a refused mark must leave --state at DISPOSITIONS`)
  }

  const missing = path.join(fs.realpathSync(tmpdir('disposer-ac4-missing')), 'nope.json')
  expectRefused('missing --file', ['--file', missing], commonCounts, /--file/)

  const badJsonFile = returnFileWith('disposer-ac4-badjson', {})
  fs.writeFileSync(badJsonFile, 'not json')
  expectRefused('unreadable/non-JSON content', ['--file', badJsonFile], commonCounts, null)

  const failedFile = returnFileWith('disposer-ac4-failed', { verdict: 'DISPOSER_FAILED', dispositions: [], tokens: 1 })
  expectRefused('DISPOSER_FAILED verdict', ['--file', failedFile], commonCounts, /DISPOSER_FAILED/)

  const uncoveredFile = returnFileWith('disposer-ac4-uncovered', disposerReturn(validDispositions().slice(0, 2)))
  expectRefused('uncovered ref leg:drift', ['--file', uncoveredFile], commonCounts, /leg:drift/)

  const dupDispositions = [validDispositions()[0], validDispositions()[0], validDispositions()[1], validDispositions()[2]]
  const dupFile = returnFileWith('disposer-ac4-dup', disposerReturn(dupDispositions))
  expectRefused('duplicate ref s0', ['--file', dupFile], commonCounts, /s0/)

  const unknownDispositions = [...validDispositions(), { ref: 's9', recommended: 'fix', reason: 'x' }]
  const unknownFile = returnFileWith('disposer-ac4-unknown', disposerReturn(unknownDispositions))
  expectRefused('unknown ref s9', ['--file', unknownFile], commonCounts, /s9/)

  const badRecommended = validDispositions()
  badRecommended[0] = { ...badRecommended[0], recommended: 'skip' }
  const badRecommendedFile = returnFileWith('disposer-ac4-recommended', disposerReturn(badRecommended))
  expectRefused('out-of-enum recommended', ['--file', badRecommendedFile], commonCounts, null)

  const blankReason = validDispositions()
  blankReason[0] = { ...blankReason[0], reason: '   ' }
  const blankReasonFile = returnFileWith('disposer-ac4-blank', disposerReturn(blankReason))
  expectRefused('blank reason', ['--file', blankReasonFile], commonCounts, null)

  const badFinal = validDispositions()
  badFinal[1] = { ...badFinal[1], final: 'later' }
  const badFinalFile = returnFileWith('disposer-ac4-final', disposerReturn(badFinal))
  expectRefused('out-of-enum final', ['--file', badFinalFile], commonCounts, null)

  const finalNoOverride = validDispositions()
  finalNoOverride[0] = { ref: 's0', recommended: 'fix', reason: 'D1 quoted', final: 'waive' }
  const finalNoOverrideFile = returnFileWith('disposer-ac4-nooverride', disposerReturn(finalNoOverride))
  expectRefused('final differs with no overriddenBy', ['--file', finalNoOverrideFile], commonCounts, null)

  const validFile = returnFileWith('disposer-ac4-wrongcount', disposerReturn(validDispositions()))
  expectRefused('fully valid return with wrong --fix-dispatched', ['--file', validFile], ['--waived', '0', '--rejected', '1', '--fix-dispatched', '3'], /--fix-dispatched/)
})

// ---- AC-20260901-09-7 -----------------------------------------------------------------------

test('AC-20260901-09-7: WHEN a fix cycle brings a second reviewer-returned with one survivor THE SYSTEM refuses --mark dispositions --fix-dispatched 1 without --file (exit 2) even though iteration 1\'s disposer-return-1.json exists, and accepts a valid --file recording disposer.iteration:2', () => {
  const host = makeHost('disposer-ac7')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac7-return1', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a one-survivor return must land DISPOSITIONS')

  const fixFile1 = returnFileWith('disposer-ac7-file1', disposerReturn([
    { ref: 's0', recommended: 'fix', reason: 'D1 quoted' },
  ]))
  const disp1 = run(host.root, host.spec, '--mark', 'dispositions', '--file', fixFile1, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(disp1.status, 0, 'setup precondition: a one-entry fix return must be accepted: ' + disp1.stdout + disp1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'setup precondition: --fix-dispatched 1 must land FIX')
  assert.ok(fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')),
    'setup precondition: iteration 1\'s disposer-return-1.json must exist before this AC exercises the reset')

  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0, 'setup precondition: fix-applied within the iteration cap must succeed: ' + fixR.stdout + fixR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: fix-applied must return to REVIEWER for the fix-delta pass')

  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac7-return2', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: the fix-delta reviewer pass must also land DISPOSITIONS directly (D4, both via values, every iteration)')

  const noFileR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(noFileR.status, 2,
    'AC-20260901-09-7/D2: iteration 2 needs its own disposer return — a stale iteration-1 disposer-return-1.json on disk must never satisfy this mark: ' + noFileR.stdout + noFileR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'a refused dispositions mark must leave state at DISPOSITIONS')

  const fixFile2 = returnFileWith('disposer-ac7-file2', disposerReturn([
    { ref: 's0', recommended: 'fix', reason: 'D1 quoted again' },
  ]))
  const disp2 = run(host.root, host.spec, '--mark', 'dispositions', '--file', fixFile2, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(disp2.status, 0, 'a fresh, valid iteration-2 return must be accepted: ' + disp2.stdout + disp2.stderr)
  const state = readState(host.sidecar)
  assert.strictEqual(state.disposer.iteration, 2,
    'AC-20260901-09-7/D2: every iteration needs its own return — disposer.iteration must be reset to 2 for the fix-delta pass: ' + JSON.stringify(state))
  assert.ok(fs.existsSync(path.join(host.sidecar, 'disposer-return-2.json')),
    'AC-20260901-09-7: the iteration-2 return must be retained as disposer-return-2.json, distinct from iteration 1\'s file')
})

// ---- AC-20260901-09-8 -----------------------------------------------------------------------

test('AC-20260901-09-8: WHEN --mark dispositions --waived 0 --rejected 0 --fix-dispatched 0 --skip-independence-check-because "jq missing" is passed on any run THE SYSTEM exits 2 with stderr naming --skip-independence-check-because and ADR-0005, leaving the state unchanged', () => {
  const directHost = makeHost('disposer-ac8-direct')
  toReviewer(directHost)
  run(directHost.root, directHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac8-direct-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'DISPOSITIONS', 'setup precondition: a zero-pool return must land DISPOSITIONS')
  const before = readStateRaw(directHost.sidecar)
  const rDirect = run(directHost.root, directHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because', 'jq missing')
  assert.strictEqual(rDirect.status, 2,
    'AC-20260901-09-8/D4: --skip-independence-check-because must be refused unconditionally now — there is no CHECKPOINT left for it to bypass: ' + rDirect.stdout + rDirect.stderr)
  assert.match(rDirect.stderr, /--skip-independence-check-because/,
    'AC-20260901-09-8: the refusal must name the flag specifically: ' + rDirect.stderr)
  assert.match(rDirect.stderr, /ADR-0005/,
    'AC-20260901-09-8: the refusal must name ADR-0005 — the message must say WHY the flag is gone, not just that it is unknown: ' + rDirect.stderr)
  assert.strictEqual(readStateRaw(directHost.sidecar), before, 'a refused mark must leave review-state.json byte-identical')
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'DISPOSITIONS', 'a refused mark must leave state at DISPOSITIONS')

  const loopHost = makeHost('disposer-ac8-loop')
  run(loopHost.root, loopHost.spec, '--via', 'loop')
  writeStamp(loopHost.root, 's1')
  run(loopHost.root, loopHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac8-loop-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'DISPOSITIONS', 'setup precondition: a --via loop zero-pool return must also land DISPOSITIONS directly')
  const rLoop = run(loopHost.root, loopHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because')
  assert.strictEqual(rLoop.status, 2,
    'AC-20260901-09-8/D4: a bare (no-value) --skip-independence-check-because must also be refused on a --via loop run — "with or without a value" per the Decision: ' + rLoop.stdout + rLoop.stderr)
  assert.match(rLoop.stderr, /--skip-independence-check-because/, 'the bare-flag refusal must also name the flag: ' + rLoop.stderr)
})

// ---- AC-20260901-09-9 -----------------------------------------------------------------------

test('AC-20260901-09-9: WHEN review-state.json (as 7.53.0 wrote it) carries "checkpoint":{"sessionId":"s1"} with no checkpointCleared, the stamp still reads s1, and the reviewer return is recorded for the current iteration THE SYSTEM prints state DISPOSITIONS', () => {
  const host = makeHost('disposer-ac9')
  run(host.root, host.spec, '--via', 'loop')
  writeStamp(host.root, 's1')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac9-return', CLEAN_RETURN))

  // Hand-write the legacy pre-D4 sidecar shape onto the sidecar the current run already created — the
  // driver must never consult these keys once D4 lands.
  const statePath = path.join(host.sidecar, 'review-state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.checkpoint = { sessionId: 's1' }
  delete state.checkpointCleared
  fs.writeFileSync(statePath, JSON.stringify(state))

  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-09-9/D4: a review-state.json carrying a 7.53.0-shaped checkpoint key with no checkpointCleared, stamp unchanged, must still land DISPOSITIONS — unknown keys are never consulted by the retired-mechanism-free driver: ' + JSON.stringify(state))
})

// ---- AC-20260901-09-13 ----------------------------------------------------------------------

test('AC-20260901-09-13: WHEN a run\'s synthetic gate fails at iteration 1 THE SYSTEM appends a GATE_RED row carrying checkpoint deep-equal to {"outcome":"not-reached"}, for --via loop and for a run created without --via alike', () => {
  const loopHost = makeHost('disposer-ac13-loop', { gateFails: true })
  const rLoop = run(loopHost.root, loopHost.spec, '--via', 'loop')
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'STOPPED',
    'setup precondition: a red synthetic gate must land the driver at STOPPED on the first invocation: ' + rLoop.stdout + rLoop.stderr)
  const loopRow = lastLedgerRow(loopHost.root)
  assert.strictEqual(loopRow.verdict, 'GATE_RED', 'a red-gate run must append a GATE_RED row: ' + JSON.stringify(loopRow))
  assert.deepStrictEqual(loopRow.checkpoint, { outcome: 'not-reached' },
    'AC-20260901-09-13/D6: a --via loop hard-stop row written before any disposer mark exists must carry checkpoint:{"outcome":"not-reached"}: ' + JSON.stringify(loopRow))

  const directHost = makeHost('disposer-ac13-direct', { gateFails: true })
  const rDirect = run(directHost.root, directHost.spec)
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'STOPPED',
    'setup precondition: a red synthetic gate must land the driver at STOPPED for the --via-absent comparison too: ' + rDirect.stdout + rDirect.stderr)
  const directRow = lastLedgerRow(directHost.root)
  assert.strictEqual(directRow.verdict, 'GATE_RED', 'a red-gate run must append a GATE_RED row: ' + JSON.stringify(directRow))
  assert.deepStrictEqual(directRow.checkpoint, { outcome: 'not-reached' },
    'AC-20260901-09-13/D6: D6 threads the derived outcome onto EVERY review verdict pass, both via values — unlike the retired mechanism, a --via-absent GATE_RED row must also carry checkpoint:{"outcome":"not-reached"}, not omit the key: ' + JSON.stringify(directRow))
})

// ---- disposition-pool unit (direct fix, core § Incident Policy) --------------------------------
// Fixture shape: a red reconcile row with outOfPlan:5
// and ONE `leg:reconcile` waive entry. Before the fix the driver's tally counted entries (waive:1)
// while verdict.js counted findings (5), so `--waived 1` was accepted and derived HARD_FINDINGS
// forever, and `--waived 5` — the only count verdict.js would have cleared — was refused by the
// driver's own tally check. The ruling (lib/leg-findings.js): a leg ref covers that leg's whole
// count, from the same module both scripts require.

function makeFiveFileReconcileHost(prefix) {
  const host = makeHost(prefix)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: the fixture must reach REVIEWER (manifest-1.jsonl written) before the reconcile row can be appended')
  fs.appendFileSync(path.join(host.sidecar, 'manifest-1.jsonl'),
    JSON.stringify({ leg: 'reconcile', exit: 3, observed: { outOfPlan: 5, files: ['a', 'b', 'c', 'd', 'e'] } }) + '\n')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(prefix + '-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: a red reconcile row must land DISPOSITIONS: ' + JSON.stringify(readState(host.sidecar)))
  return host
}
const ONE_LEG_WAIVE = () => disposerReturn([
  { ref: 'leg:reconcile', recommended: 'waive', reason: 'D1 sanctions every out-of-plan file' },
])

test('disposition-pool unit: WHEN the manifest holds a red reconcile row with outOfPlan:5 and --file holds ONE leg:reconcile waive entry THE SYSTEM refuses --waived 1 (exit 2, stderr names the leg weight, state byte-identical) and accepts --waived 5, recording dispositions.word CLEAN — the count verdict.js derives, never a per-entry tally', () => {
  const host = makeFiveFileReconcileHost('disposer-unit-five')
  const before = readStateRaw(host.sidecar)

  const step = run(host.root, host.spec)
  assert.match(step.stdout, /leg:reconcile exit=3 count=5/,
    'the DISPOSITIONS step body must print each leg\'s finding count so the disposer sees what one leg ref covers: ' + step.stdout)

  const perEntry = run(host.root, host.spec, '--mark', 'dispositions', '--file',
    returnFileWith('disposer-unit-five-w1', ONE_LEG_WAIVE()), '--waived', '1', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(perEntry.status, 2,
    'a per-entry tally (--waived 1) must be refused — verdict.js would subtract 1 from 5 and derive HARD_FINDINGS forever: ' + perEntry.stdout + perEntry.stderr)
  assert.match(perEntry.stderr, /leg:reconcile=5/,
    'the refusal must name the leg weight so the recount is mechanical: ' + perEntry.stderr)
  assert.strictEqual(readStateRaw(host.sidecar), before, 'a refused mark must leave review-state.json byte-identical')
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')), 'a refused mark must write no disposer-return-1.json')

  const weighted = run(host.root, host.spec, '--mark', 'dispositions', '--file',
    returnFileWith('disposer-unit-five-w5', ONE_LEG_WAIVE()), '--waived', '5', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(weighted.status, 0,
    'one leg:reconcile waive must cover the leg\'s whole count (--waived 5): ' + weighted.stdout + weighted.stderr)
  const state = readState(host.sidecar)
  assert.deepStrictEqual(state.dispositions, { waived: 5, rejected: 0, fixDispatched: 0, word: 'CLEAN' },
    'the verdict pass must derive CLEAN from the weighted count: ' + JSON.stringify(state.dispositions))
  assert.strictEqual(state.disposer.iteration, 1, JSON.stringify(state.disposer))
})

test('disposition-pool unit: WHEN the same five-file reconcile row is waived with --waived 6 THE SYSTEM refuses (exit 2) — the weighted tally check stays meaningful in both directions', () => {
  const host = makeFiveFileReconcileHost('disposer-unit-over')
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file',
    returnFileWith('disposer-unit-over-w6', ONE_LEG_WAIVE()), '--waived', '6', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 2, 'an over-count must still die: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /do not match the return's final-or-recommended tallies/, r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')))
})
