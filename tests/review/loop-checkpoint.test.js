'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260901/03-unified-build-loop.md D2 (2026-09-01, brief 18): the review driver, when its
// sidecar records via:"loop", lands a new state CHECKPOINT between reviewer-returned and
// DISPOSITIONS — the one enforced property the separate build/review session split bought (core
// § Feedback Loop: the printed-reminder form was measured to fail for replay, skipped through
// 12+ reviews). A bare invocation whose current .claude/spec-session.json session id equals the
// one recorded at reviewer-returned time parks at CHECKPOINT and refuses --mark dispositions; a
// differing session id (the /clear signature, per sibling 02 A4) admits DISPOSITIONS once and
// records checkpointCleared: true, which then stays sticky for the rest of the run. No stamp
// file at reviewer-returned degrades to a printed warning and admits DISPOSITIONS. via:"direct"
// runs never see CHECKPOINT at all, stamp present or not. Written before spec-review-driver.js
// implements any of this (TDD red, 2026-09-01) — every test below fails against current code
// because CHECKPOINT does not yet exist as a reachable state.

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
# Loop Checkpoint Test Spec

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

// A fresh green-legs host, identical in shape to review-driver.test.js's makeHost — the review
// driver reaches REVIEWER on the first invocation with no gate/leg failures to exercise.
function makeHost(prefix) {
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
  const spec = path.join(root, 'specs/20260820/99-loop-checkpoint.md')
  fs.writeFileSync(spec, specBody(diffBase, 'AC-20260820-99-1'))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
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
const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }
const SURVIVOR_RETURN = {
  verdict: 'CLEAN',
  survivors: [{ severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

// readSessionStamp(root) (spec/scripts/lib/session-stamp.js) reads exactly this shape from
// <root>/.claude/spec-session.json.
function writeStamp(root, sessionId) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-session.json'), JSON.stringify({
    session_id: sessionId,
    transcript_path: path.join(root, 'transcript.jsonl'),
    cwd: root,
    ts: new Date().toISOString(),
  }))
}

test('AC-20260901-03-2: WHEN a --via loop review driver reaches reviewer-returned and the stamped session id is still the one recorded there THE SYSTEM prints state CHECKPOINT with a step body naming /clear and /spec:build, --state reports CHECKPOINT, and --mark dispositions is refused leaving state CHECKPOINT', () => {
  const host = makeHost('checkpoint-ac2')
  const rInit = run(host.root, host.spec, '--via', 'loop')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a --via loop run on a fully green fixture must reach REVIEWER before this AC can be exercised: ' + rInit.stdout + rInit.stderr)

  writeStamp(host.root, 's1')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac2-return', CLEAN_RETURN))

  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'AC-20260901-03-2/D2: a --via loop run whose stamped session id at reviewer-returned time is unchanged must park at CHECKPOINT rather than fall through to DISPOSITIONS — this is the enforced disposition-clear the loop exists to guarantee, not an advisory print')

  const stepR = run(host.root, host.spec)
  assert.match(stepR.stdout, /\/clear/,
    'AC-20260901-03-2/Contracts: the CHECKPOINT step body must name /clear — a stop printed with no remedy command leaves the session guessing how to proceed: ' + stepR.stdout)
  assert.match(stepR.stdout, /\/spec:build/,
    'AC-20260901-03-2/Contracts: the CHECKPOINT step body must name /spec:build <spec> as the re-run command — the loop\'s own resume entry, per D2/D11\'s "next" slot: ' + stepR.stdout)

  const markR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(markR.status, 2,
    'AC-20260901-03-2/Contracts: --mark dispositions while the session id is unchanged must be refused (exit 2) — accepting it would let the build session disposition its own review, defeating the entire reason the checkpoint exists: ' + markR.stdout + markR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'AC-20260901-03-2: a refused dispositions mark must leave the state at CHECKPOINT unchanged — advancing here on a refused mark would silently grant the exact bypass the refusal exists to prevent')
})

test('AC-20260901-03-3: WHEN the stamped session id changes after CHECKPOINT has parked the run THE SYSTEM admits DISPOSITIONS on the very next invocation and records checkpointCleared: true in review-state.json', () => {
  const host = makeHost('checkpoint-ac3')
  run(host.root, host.spec, '--via', 'loop')
  writeStamp(host.root, 's1')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac3-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'setup precondition: the run must park at CHECKPOINT with the stamp unchanged before this AC exercises the clear')

  writeStamp(host.root, 's2')
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-03-3/D2: a stamp rewritten to a new session id (the /clear signature, executed per sibling 02 A4) must admit DISPOSITIONS on the very next invocation — a stale CHECKPOINT here would mean a genuine /clear could never unstick the run')

  const markR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(markR.status, 0,
    'AC-20260901-03-3: a zero-survivor, zero-finding dispositions mark must be accepted once the session id has genuinely changed: ' + markR.stdout + markR.stderr)

  const stateJson = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'review-state.json'), 'utf8'))
  assert.strictEqual(stateJson.checkpointCleared, true,
    'AC-20260901-03-3/Contracts: review-state.json must record checkpointCleared: true once the new session id has admitted DISPOSITIONS — this is the sticky flag AC-20260901-03-4 depends on to keep the checkpoint from firing a second time in the same run: ' + JSON.stringify(stateJson))
})

test('AC-20260901-03-4: WHEN checkpointCleared is already true a second reviewer-returned in the same session (stamp unchanged) lands DISPOSITIONS directly, never CHECKPOINT again', () => {
  const host = makeHost('checkpoint-ac4a')
  run(host.root, host.spec, '--via', 'loop')
  writeStamp(host.root, 's1')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac4a-park', SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'setup precondition: park at CHECKPOINT on a survivor return so the run has a fix cycle to drive through')
  writeStamp(host.root, 's2')
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: the changed stamp must admit DISPOSITIONS before the fix cycle can begin')

  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(dispR.status, 0,
    'setup precondition: fix-dispatched 1 within the 1-survivor pool must be accepted: ' + dispR.stdout + dispR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'setup precondition: fix-dispatched 1 must land FIX')

  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0,
    'setup precondition: fix-applied within the iteration cap must succeed: ' + fixR.stdout + fixR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: fix-applied must return to REVIEWER for the fix-delta reviewer pass')

  // The stamp is still "s2" — unchanged since the clear that admitted DISPOSITIONS the first time.
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac4a-second', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-03-4/D2: once checkpointCleared is true, a second reviewer-returned in the same session (stamp still "s2") must land DISPOSITIONS directly — the checkpoint fires once per run; a fix cycle\'s second pass is judged by this session\'s own dispositions, not the build\'s trade-offs')
})

test('AC-20260901-03-4: WHEN a --via loop run reaches reviewer-returned with no .claude/spec-session.json stamp at all THE SYSTEM prints a stderr warning naming the stamp path and admits DISPOSITIONS', () => {
  const host = makeHost('checkpoint-ac4b')
  run(host.root, host.spec, '--via', 'loop')
  assert.ok(!fs.existsSync(path.join(host.root, '.claude/spec-session.json')),
    'setup precondition: the fixture must carry no stamp file at all for this degrade path to be exercised honestly')

  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac4b-return', CLEAN_RETURN))
  assert.match(r.stdout + r.stderr, /\.claude\/spec-session\.json/,
    'AC-20260901-03-4/Contracts: the no-stamp degrade must print a warning naming .claude/spec-session.json — a silent degrade would hide from the session why the checkpoint never fired: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-03-4/Contracts: with no stamp file present the checkpoint must degrade honestly and DISPOSITIONS must still be admitted — stalling at REVIEWER or a phantom CHECKPOINT here would strand the run over evidence the driver cannot obtain')
})

test('AC-20260901-03-5: WHEN the review driver is created without --via (direct entry) and a session stamp DOES exist at reviewer-returned time THE SYSTEM still lands DISPOSITIONS directly, with no CHECKPOINT and no checkpoint key written to review-state.json', () => {
  const noFlagHost = makeHost('checkpoint-ac5-noflag')
  run(noFlagHost.root, noFlagHost.spec)
  const stateAtCreation = JSON.parse(fs.readFileSync(path.join(noFlagHost.sidecar, 'review-state.json'), 'utf8'))
  assert.strictEqual(stateAtCreation.via, 'direct',
    'setup precondition: a driver invocation with no --via flag must default via to "direct" at sidecar creation: ' + JSON.stringify(stateAtCreation))
  writeStamp(noFlagHost.root, 's1')
  run(noFlagHost.root, noFlagHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-noflag-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(noFlagHost.root, noFlagHost.spec), 'DISPOSITIONS',
    'AC-20260901-03-5/D2: a run created with no --via flag must land DISPOSITIONS directly after reviewer-returned even when a session stamp is present — CHECKPOINT exists only for the via:"loop" entry')
  const noFlagState = JSON.parse(fs.readFileSync(path.join(noFlagHost.sidecar, 'review-state.json'), 'utf8'))
  assert.strictEqual('checkpoint' in noFlagState, false,
    'AC-20260901-03-5/Contracts: a via:"direct" (default) run must never write a checkpoint key into review-state.json, stamp present or not — a stray key here would be a silent behavior seam leaking the loop-only mechanism into direct entries: ' + JSON.stringify(noFlagState))

  const explicitHost = makeHost('checkpoint-ac5-explicit')
  run(explicitHost.root, explicitHost.spec, '--via', 'direct')
  writeStamp(explicitHost.root, 's1')
  run(explicitHost.root, explicitHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-explicit-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(explicitHost.root, explicitHost.spec), 'DISPOSITIONS',
    'AC-20260901-03-5/D2: a run explicitly created with --via direct must also land DISPOSITIONS directly, stamp present or not — "no --via (or --via direct)" names both forms in the same AC')
  const explicitState = JSON.parse(fs.readFileSync(path.join(explicitHost.sidecar, 'review-state.json'), 'utf8'))
  assert.strictEqual('checkpoint' in explicitState, false,
    'AC-20260901-03-5/Contracts: an explicit --via direct run must also never write a checkpoint key into review-state.json: ' + JSON.stringify(explicitState))
})
