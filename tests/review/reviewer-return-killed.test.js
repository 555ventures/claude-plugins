'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260901/08-corpus-derivation-and-kill-match.md D7/D8 (2026-09-01, brief 19): a reviewer
// return's `killed[]` entries carry no location contract today — handleReviewerReturned() in
// spec-review-driver.js validates only `verdict` and `survivors` (measured 2026-08-31 by code
// read, spec's Assumption A5) before writing `.claude/spec-runs/<sidecar>/reviewer-return-<n>.json`
// and updating marks. D8 makes `killed` a validated array: every entry needs a string `claim` and
// BOTH `file` (string|null) and `line` (number|null) KEYS PRESENT, dying (exit 2, naming
// `killed[<i>]` and the required shape) before any file write or mark mutation when the shape is
// wrong — 2 of 52 retained artifacts carry a non-empty killed[] and NONE carries a location (A7),
// so this is new validation, not a tightening of an existing one. Every malformed sub-case below
// currently succeeds against HEAD (no killed validation exists at all), so this file's own red is
// "the return was wrongly ACCEPTED", not a crash or a usage error.

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260901-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Reviewer Return Killed-Shape Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260901-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260901-99-1**: foo() returns 42.
`
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

function makeHost(name) {
  const root = fs.realpathSync(tmpdir(name))
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
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const specRel = `specs/20260901/${name}.md`
  const spec = path.join(root, specRel)
  fs.writeFileSync(spec, specBody(diffBase))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, specRel, sidecar: spec.replace(/\.md$/, '.review') }
}

function reviewReturnFilesIn(sidecarDir) {
  if (!fs.existsSync(sidecarDir)) return []
  return fs.readdirSync(sidecarDir).filter((f) => /^reviewer-return-\d+\.json$/.test(f))
}

// AC-20260901-08-8
test('AC-20260901-08-8: --mark reviewer-returned dies naming killed[0] and the required shape when an entry has no file/line keys, writing no reviewer-return file and leaving the mark unchanged', () => {
  const host = makeHost('killed-8-nokeys')
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before reviewer-returned can be exercised: ' + r0.stdout + r0.stderr)
  const before = reviewReturnFilesIn(host.sidecar)

  const rf = returnFileWith('killed-8-nokeys-return', {
    verdict: 'CLEAN', survivors: [], reviewerCount: 1, scope: 'full', tokens: 10,
    killed: [{ claim: 'x' }],
  })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
  assert.strictEqual(r.status, 2,
    'D8: a killed entry carrying no file/line keys at all must be refused with exit 2, not silently ' +
    'accepted — today\'s driver validates only verdict/survivors and would accept this: ' + JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }))
  assert.match(r.stderr, /killed\[0\]/,
    'D8: the refusal must name the offending index (killed[0]) so the reviewer session can see which ' +
    'entry is malformed: ' + r.stderr)
  assert.match(r.stderr, /claim.*file.*line|file.*line.*claim|\{claim, ?file, ?line, ?evidence\}/i,
    'D8: the refusal must state the required {claim, file, line, evidence} shape, not a generic error: ' + r.stderr)
  assert.deepStrictEqual(reviewReturnFilesIn(host.sidecar), before,
    'D8: a refused reviewer-returned mark must write NO reviewer-return-*.json into the sidecar — a ' +
    'validate-after-write bug here would leave a malformed artifact on disk even though the mark itself died')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'D8: a refused reviewer-returned mark must leave the state machine exactly where it was (REVIEWER) — ' +
    'marks must not mutate before validation completes')
})

test('AC-20260901-08-8: --mark reviewer-returned dies naming killed[0] when an entry has claim and file but no line key, writing no reviewer-return file', () => {
  const host = makeHost('killed-8-noline')
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition failed: ' + r0.stdout + r0.stderr)
  const before = reviewReturnFilesIn(host.sidecar)

  const rf = returnFileWith('killed-8-noline-return', {
    verdict: 'CLEAN', survivors: [], reviewerCount: 1, scope: 'full', tokens: 10,
    killed: [{ claim: 'x', file: 'a.js' }],
  })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
  assert.strictEqual(r.status, 2,
    'D8: a killed entry carrying claim+file but no line key must also be refused — the driver checks ' +
    'BOTH keys are present, not just one: ' + JSON.stringify({ status: r.status, stderr: r.stderr }))
  assert.match(r.stderr, /killed\[0\]/, 'D8: the refusal must name killed[0]: ' + r.stderr)
  assert.deepStrictEqual(reviewReturnFilesIn(host.sidecar), before,
    'D8: nothing must be written into the sidecar on this refusal either')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'D8: state must stay REVIEWER on refusal')
})

test('AC-20260901-08-8: --mark reviewer-returned dies when killed is missing from the return entirely, writing no reviewer-return file', () => {
  const host = makeHost('killed-8-missing')
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition failed: ' + r0.stdout + r0.stderr)
  const before = reviewReturnFilesIn(host.sidecar)

  const rf = returnFileWith('killed-8-missing-return', {
    verdict: 'CLEAN', survivors: [], reviewerCount: 1, scope: 'full', tokens: 10,
  })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
  assert.strictEqual(r.status, 2,
    'D8: a return with no killed key at all must be refused — killed is now a REQUIRED array, not an ' +
    'optional one: ' + JSON.stringify({ status: r.status, stderr: r.stderr }))
  assert.match(r.stderr, /killed/i,
    'D8: the refusal must name killed as the missing/malformed field: ' + r.stderr)
  assert.deepStrictEqual(reviewReturnFilesIn(host.sidecar), before,
    'D8: nothing must be written into the sidecar on this refusal either')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'D8: state must stay REVIEWER on refusal')
})

test('AC-20260901-08-8: --mark reviewer-returned dies when killed is present but not an array, writing no reviewer-return file', () => {
  const host = makeHost('killed-8-notarray')
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition failed: ' + r0.stdout + r0.stderr)
  const before = reviewReturnFilesIn(host.sidecar)

  const rf = returnFileWith('killed-8-notarray-return', {
    verdict: 'CLEAN', survivors: [], reviewerCount: 1, scope: 'full', tokens: 10, killed: 0,
  })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
  assert.strictEqual(r.status, 2,
    'D8: killed:0 (a historical shape some fixtures used) is not an array and must be refused, never ' +
    'coerced or ignored: ' + JSON.stringify({ status: r.status, stderr: r.stderr }))
  assert.match(r.stderr, /killed/i, 'D8: the refusal must name killed as the malformed field: ' + r.stderr)
  assert.deepStrictEqual(reviewReturnFilesIn(host.sidecar), before,
    'D8: nothing must be written into the sidecar on this refusal either')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'D8: state must stay REVIEWER on refusal')
})

test('AC-20260901-08-8: --mark reviewer-returned accepts a killed entry carrying explicit null file/line, writing the reviewer-return file and advancing off REVIEWER', () => {
  const host = makeHost('killed-8-nullok')
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition failed: ' + r0.stdout + r0.stderr)
  const before = reviewReturnFilesIn(host.sidecar)

  const rf = returnFileWith('killed-8-nullok-return', {
    verdict: 'CLEAN', survivors: [], reviewerCount: 1, scope: 'full', tokens: 10,
    killed: [{ claim: 'x', file: null, line: null, evidence: 'e' }],
  })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
  assert.strictEqual(r.status, 0,
    'D8: a killed entry with explicit null file/line (a process-level claim with no location) must be ' +
    'ACCEPTED — the contract requires the keys present, never a location: ' + JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }))
  assert.strictEqual(reviewReturnFilesIn(host.sidecar).length, before.length + 1,
    'D8: an accepted reviewer-returned mark must write exactly one new reviewer-return-*.json into the sidecar')
  assert.notStrictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'D8: an accepted reviewer-returned mark must move the state machine off REVIEWER (marks.reviewerReturnFile ' +
    'now set) — a state stuck at REVIEWER here means the accepted return was never actually recorded')
})
