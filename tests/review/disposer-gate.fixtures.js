'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// disposer-gate family shared fixtures — split from disposer-gate.test.js by
// specs/20260903/06-test-suite-critical-path.md D2. Provenance carried over from the pre-image
// header: specs/20260901/09-disposer-gate.md retires session-change CHECKPOINT for a
// fresh-context spec:disposer agent gate; this file replaces tests/review/loop-checkpoint.test.js.
// Consumed by shards I/J via module.exports.

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

module.exports = { DRIVER, GREEN_TEST, specBody, makeHost, readState, readStateRaw, lastLedgerRow, run, stateOf, toReviewer, returnFileWith, writeStamp, CLEAN_RETURN, ONE_SURVIVOR_RETURN, TWO_SURVIVOR_RETURN, makeTwoSurvivorPoolHost, validDispositions, disposerReturn }
