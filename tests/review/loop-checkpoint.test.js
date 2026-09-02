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
//
// specs/20260901/05-checkpoint-fail-closed.md D1/D2/D3/D6 (2026-09-01, brief 18a): the no-stamp
// degrade above is a fail-open gap (ADR-0004) — both real loop reviews on this machine took it,
// with no ledger trace. D1 makes a no-stamp reviewer-returned park at CHECKPOINT exactly like a
// same-session stamp does, lifting on any stamp appearing (checkpoint.sessionId === null) or on
// the one override flag `--skip-independence-check-because "<reason>"` (D2, no-stamp parks
// only). D3 threads a derived `--checkpoint <outcome>` onto every loop verdict.js pass. D6:
// the second AC-20260901-03-4 test below (the no-stamp degrade) is rewritten in place to
// AC-20260901-05-1 — the once-per-run AC-20260901-03-4 test (checkpointCleared sticky) keeps its
// own tag untouched, since that clause still holds. AC-20260901-05-1..4 and -10 are new
// mechanism, written before spec-review-driver.js/verdict.js implement D1-D3 (TDD red,
// 2026-09-01); AC-20260901-05-9 tags the four other pre-existing tests in this file in place, no
// assertion touched (A2: this suite measured 5/5 green against the pre-image on 2026-09-01,
// confirming those four are genuinely unaffected by D1-D3, not accidentally broken and re-fixed).

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
// gateFails (AC-20260901-05-10): mirrors review-driver.test.js's makeHost({gateFails}) — foo.js
// returns 0 instead of 42, so the fixture's own gate test fails and the driver hard-stops at
// STOPPED / GATE_RED on the very first invocation instead of reaching REVIEWER.
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
  const spec = path.join(root, 'specs/20260820/99-loop-checkpoint.md')
  fs.writeFileSync(spec, specBody(diffBase, 'AC-20260820-99-1'))
  fs.writeFileSync(path.join(root, 'src/foo.js'), gateFails ? 'module.exports = () => 0\n' : 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

function readState(sidecar) {
  return JSON.parse(fs.readFileSync(path.join(sidecar, 'review-state.json'), 'utf8'))
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

test('AC-20260901-03-2 (also AC-20260901-05-9, SHALL CONTINUE TO): WHEN a --via loop review driver reaches reviewer-returned and the stamped session id is still the one recorded there THE SYSTEM prints state CHECKPOINT with a step body naming /clear and /spec:build, --state reports CHECKPOINT, and --mark dispositions is refused leaving state CHECKPOINT', () => {
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

test('AC-20260901-03-3 (also AC-20260901-05-9, SHALL CONTINUE TO): WHEN the stamped session id changes after CHECKPOINT has parked the run THE SYSTEM admits DISPOSITIONS on the very next invocation and records checkpointCleared: true in review-state.json', () => {
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

test('AC-20260901-03-4 (also AC-20260901-05-9, SHALL CONTINUE TO): WHEN checkpointCleared is already true a second reviewer-returned in the same session (stamp unchanged) lands DISPOSITIONS directly, never CHECKPOINT again', () => {
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

// specs/20260901/05-checkpoint-fail-closed.md D1/D6 (2026-09-01, brief 18a): this test is the
// REWRITE IN PLACE (never left beside a new test) of the degrade test above — the no-stamp path
// no longer degrades to a warning-and-admit; it parks at CHECKPOINT exactly like a same-session
// stamp does, refuses --mark dispositions, and names the restart remedy rather than /clear.
test('AC-20260901-05-1 (rewrites the former AC-20260901-03-4 no-stamp degrade test in place, D6): WHEN a --via loop review driver reaches --mark reviewer-returned with no .claude/spec-session.json on the host THE SYSTEM writes a stderr line naming both .claude/spec-session.json and restart Claude Code, --state reports CHECKPOINT, the bare invocation\'s stdout names restart Claude Code and /spec:build, and --mark dispositions is refused (exit 2) leaving --state at CHECKPOINT', () => {
  const host = makeHost('checkpoint-ac5-1')
  run(host.root, host.spec, '--via', 'loop')
  assert.ok(!fs.existsSync(path.join(host.root, '.claude/spec-session.json')),
    'setup precondition: the fixture must carry no stamp file at all for this no-stamp park to be exercised honestly')

  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-1-return', CLEAN_RETURN))
  assert.match(r.stdout + r.stderr, /\.claude\/spec-session\.json/,
    'AC-20260901-05-1/D1: the no-stamp park must write a stderr line naming .claude/spec-session.json — a silent park would hide from the session why it never reached DISPOSITIONS: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /restart Claude Code/,
    'AC-20260901-05-1/D1: the no-stamp park\'s stderr must contain the literal phrase "restart Claude Code" — the remedy is a restart (the stamp hook loads at session start), never /clear: ' + r.stdout + r.stderr)

  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'AC-20260901-05-1/D1: a --via loop run reaching reviewer-returned with no stamp on the host must park at CHECKPOINT — the missing stamp is evidence the pipeline\'s own hook layer is not running, not "no evidence" to be waved through')

  const stepR = run(host.root, host.spec)
  assert.match(stepR.stdout, /restart Claude Code/,
    'AC-20260901-05-1/Contracts: the CHECKPOINT step body for a null park must name "restart Claude Code" — a step naming /clear here would send the session back into the same park: ' + stepR.stdout)
  assert.match(stepR.stdout, /\/spec:build/,
    'AC-20260901-05-1/Contracts: the null-park CHECKPOINT step body must name /spec:build <spec> as the re-run command: ' + stepR.stdout)

  const markR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(markR.status, 2,
    'AC-20260901-05-1/D1: --mark dispositions must be refused (exit 2) while a null park has not yet lifted — admitting it here is exactly the fail-open gap ADR-0004 records (both real loop reviews on this machine took it, with no ledger trace): ' + markR.stdout + markR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'AC-20260901-05-1: a refused dispositions mark on a null park must leave --state at CHECKPOINT unchanged')
})

test('AC-20260901-03-5 (also AC-20260901-05-9, SHALL CONTINUE TO): WHEN the review driver is created without --via (direct entry) and a session stamp DOES exist at reviewer-returned time THE SYSTEM still lands DISPOSITIONS directly, with no CHECKPOINT and no checkpoint key written to review-state.json', () => {
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

test('AC-20260901-05-2: WHEN, after a --via loop run\'s no-stamp park, a stamp is written THE SYSTEM prints state DISPOSITIONS on the next invocation, accepts --mark dispositions (exit 0), records checkpointCleared: true with checkpoint.sessionId still null, and the CLOSE row carries checkpoint:{"outcome":"stamp-appeared"}', () => {
  const host = makeHost('checkpoint-ac5-2')
  run(host.root, host.spec, '--via', 'loop')
  const parkR = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-2-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'setup precondition: a --via loop run with no stamp on the host must park at CHECKPOINT before this AC exercises the stamp-appeared lift: ' + parkR.stdout + parkR.stderr)

  writeStamp(host.root, 's9')
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-05-2/D1: once a stamp exists — ANY session id, since a null park has no recorded id to differ from — the run must admit DISPOSITIONS on the very next invocation')

  const markR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(markR.status, 0,
    'AC-20260901-05-2: a zero-survivor, zero-finding dispositions mark must be accepted once any stamp has appeared past a null park: ' + markR.stdout + markR.stderr)

  const stateJson = readState(host.sidecar)
  assert.strictEqual(stateJson.checkpointCleared, true,
    'AC-20260901-05-2/Contracts: review-state.json must record checkpointCleared: true once a stamp-appeared lift has admitted DISPOSITIONS: ' + JSON.stringify(stateJson))
  assert.strictEqual(stateJson.checkpoint && stateJson.checkpoint.sessionId, null,
    'AC-20260901-05-2/D1: the recorded checkpoint.sessionId must stay null — the null park never gains a recorded id, only a cleared flag: ' + JSON.stringify(stateJson))

  const row = lastLedgerRow(host.root)
  assert.strictEqual(row.verdict, 'CLEAN', 'the authoritative close pass must still derive CLEAN for a zero-survivor, zero-finding run: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.checkpoint, { outcome: 'stamp-appeared' },
    'AC-20260901-05-2/D3: the CLOSE row must carry checkpoint:{"outcome":"stamp-appeared"} — checkpointCleared is true and checkpoint.sessionId is null, the exact shape the driver derives "stamp-appeared" from: ' + JSON.stringify(row))
})

test('AC-20260901-05-3: WHEN, after a --via loop run\'s no-stamp park with no stamp ever written, --mark dispositions carries --skip-independence-check-because "<reason>" THE SYSTEM exits 0, records checkpointCleared: true and checkpointOverride: {reason, ts} in review-state.json, and the CLOSE row carries checkpoint:{"outcome":"overridden","reason":"<reason>"}', () => {
  const host = makeHost('checkpoint-ac5-3')
  run(host.root, host.spec, '--via', 'loop')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-3-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CHECKPOINT',
    'setup precondition: the run must be parked at CHECKPOINT with no stamp ever written for this override to be exercised honestly')
  assert.ok(!fs.existsSync(path.join(host.root, '.claude/spec-session.json')),
    'setup precondition: no stamp file must exist on the host — the override is the ONLY remedy left when the hook genuinely cannot write one')

  const reason = 'hook cannot write .claude on this host'
  const before = new Date()
  const markR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because', reason)
  assert.strictEqual(markR.status, 0,
    'AC-20260901-05-3/D2: a --mark dispositions carrying --skip-independence-check-because with a non-blank reason must be admitted on a no-stamp park: ' + markR.stdout + markR.stderr)

  const stateJson = readState(host.sidecar)
  assert.strictEqual(stateJson.checkpointCleared, true,
    'AC-20260901-05-3/Contracts: the override must record checkpointCleared: true in review-state.json: ' + JSON.stringify(stateJson))
  assert.ok(stateJson.checkpointOverride, 'AC-20260901-05-3/Contracts: the override must record a checkpointOverride key in review-state.json: ' + JSON.stringify(stateJson))
  assert.strictEqual(stateJson.checkpointOverride.reason, reason,
    'AC-20260901-05-3/Contracts: checkpointOverride.reason must equal the exact reason text passed to --skip-independence-check-because: ' + JSON.stringify(stateJson))
  assert.ok(!Number.isNaN(Date.parse(stateJson.checkpointOverride.ts)) && Date.parse(stateJson.checkpointOverride.ts) >= before.getTime() - 1000,
    'AC-20260901-05-3/Contracts: checkpointOverride.ts must be a real ISO-8601 timestamp recorded at override time, not a placeholder: ' + JSON.stringify(stateJson))

  const row = lastLedgerRow(host.root)
  assert.deepStrictEqual(row.checkpoint, { outcome: 'overridden', reason },
    'AC-20260901-05-3/D3: the CLOSE row must carry checkpoint:{"outcome":"overridden","reason":"' + reason + '"} — checkpointOverride is set, which the driver derives "overridden" from: ' + JSON.stringify(row))
})

test('AC-20260901-05-4: --skip-independence-check-because is refused (exit 2, stderr naming the flag, state unchanged, no checkpointOverride key) on a same-session park (stderr also names /clear), on a no-stamp park with a blank reason, on a --via direct run at DISPOSITIONS, and on a no-stamp park where the flag is followed immediately by another flag with no reason value (D7)', () => {
  // (a) same-session (non-null) park: the stamp is unchanged since reviewer-returned.
  const sameSessionHost = makeHost('checkpoint-ac5-4a')
  run(sameSessionHost.root, sameSessionHost.spec, '--via', 'loop')
  writeStamp(sameSessionHost.root, 's1')
  run(sameSessionHost.root, sameSessionHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-4a-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(sameSessionHost.root, sameSessionHost.spec), 'CHECKPOINT',
    'setup precondition (a): a stamp unchanged since reviewer-returned must park at CHECKPOINT before this refusal can be exercised')
  const rA = run(sameSessionHost.root, sameSessionHost.spec, '--mark', 'dispositions', '--waived', '0',
    '--rejected', '0', '--fix-dispatched', '0', '--skip-independence-check-because', 'trying anyway')
  assert.strictEqual(rA.status, 2,
    'AC-20260901-05-4(a): the override must be refused on a same-session park — that park has a cheap correct remedy (/clear); admitting a reasoned override here is exactly the bypass D2 exists to prevent: ' + rA.stdout + rA.stderr)
  assert.match(rA.stderr, /--skip-independence-check-because/,
    'AC-20260901-05-4(a): the refusal must name --skip-independence-check-because specifically: ' + rA.stderr)
  assert.match(rA.stderr, /\/clear/,
    'AC-20260901-05-4(a): the same-session-park refusal must also name /clear as the remedy — the override is not a bypass for the build session: ' + rA.stderr)
  assert.strictEqual(stateOf(sameSessionHost.root, sameSessionHost.spec), 'CHECKPOINT',
    'AC-20260901-05-4(a): a refused override must leave --state unchanged at CHECKPOINT')
  const stateA = readState(sameSessionHost.sidecar)
  assert.strictEqual('checkpointOverride' in stateA, false,
    'AC-20260901-05-4(a): a refused override must write no checkpointOverride key: ' + JSON.stringify(stateA))

  // (b) no-stamp park, blank reason (after trim).
  const blankHost = makeHost('checkpoint-ac5-4b')
  run(blankHost.root, blankHost.spec, '--via', 'loop')
  run(blankHost.root, blankHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-4b-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(blankHost.root, blankHost.spec), 'CHECKPOINT',
    'setup precondition (b): a no-stamp reviewer-returned must park at CHECKPOINT before this refusal can be exercised')
  const rB = run(blankHost.root, blankHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because', '   ')
  assert.strictEqual(rB.status, 2,
    'AC-20260901-05-4(b): a reason that is blank after trim must be refused, never treated as "no reason given but admit anyway": ' + rB.stdout + rB.stderr)
  assert.match(rB.stderr, /--skip-independence-check-because/,
    'AC-20260901-05-4(b): the refusal must name --skip-independence-check-because specifically: ' + rB.stderr)
  assert.strictEqual(stateOf(blankHost.root, blankHost.spec), 'CHECKPOINT',
    'AC-20260901-05-4(b): a refused blank-reason override must leave --state unchanged at CHECKPOINT')
  const stateB = readState(blankHost.sidecar)
  assert.strictEqual('checkpointOverride' in stateB, false,
    'AC-20260901-05-4(b): a refused blank-reason override must write no checkpointOverride key: ' + JSON.stringify(stateB))

  // (c) --via direct run, already at DISPOSITIONS (never parked at all — nothing to override).
  const directHost = makeHost('checkpoint-ac5-4c')
  run(directHost.root, directHost.spec, '--via', 'direct')
  writeStamp(directHost.root, 's1')
  run(directHost.root, directHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-4c-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'DISPOSITIONS',
    'setup precondition (c): a --via direct run must land DISPOSITIONS directly with no CHECKPOINT to park at')
  const rC = run(directHost.root, directHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because', 'trying anyway')
  assert.strictEqual(rC.status, 2,
    'AC-20260901-05-4(c): the override must be refused on a --via direct run — via:"direct" never parks, so there is nothing to override; accepting it would launder a false "overridden" onto a run the loop checkpoint never governed: ' + rC.stdout + rC.stderr)
  assert.match(rC.stderr, /--skip-independence-check-because/,
    'AC-20260901-05-4(c): the refusal must name --skip-independence-check-because specifically: ' + rC.stderr)
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'DISPOSITIONS',
    'AC-20260901-05-4(c): a refused override on a --via direct run must leave --state unchanged at DISPOSITIONS')
  const stateC = readState(directHost.sidecar)
  assert.strictEqual('checkpointOverride' in stateC, false,
    'AC-20260901-05-4(c): a refused override on a --via direct run must write no checkpointOverride key: ' + JSON.stringify(stateC))

  // (d) no-stamp park, --skip-independence-check-because immediately followed by another flag
  // with no reason value at all (D7: a flag name is not a reason — reviewer 2026-09-02 found
  // this admitted with checkpointOverride.reason == "--waived", laundering a false override).
  const flagHost = makeHost('checkpoint-ac5-4d')
  run(flagHost.root, flagHost.spec, '--via', 'loop')
  run(flagHost.root, flagHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('checkpoint-ac5-4d-park', CLEAN_RETURN))
  assert.strictEqual(stateOf(flagHost.root, flagHost.spec), 'CHECKPOINT',
    'setup precondition (d): a no-stamp reviewer-returned must park at CHECKPOINT before this refusal can be exercised')
  const rD = run(flagHost.root, flagHost.spec, '--mark', 'dispositions', '--skip-independence-check-because',
    '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(rD.status, 2,
    'AC-20260901-05-4(d)/D7: a --skip-independence-check-because with no reason value, immediately followed by another flag, must be refused — treating the next flag\'s name as the reason would launder checkpointOverride.reason == "--waived" onto the ledger: ' + rD.stdout + rD.stderr)
  assert.match(rD.stderr, /--skip-independence-check-because/,
    'AC-20260901-05-4(d): the refusal must name --skip-independence-check-because specifically: ' + rD.stderr)
  assert.strictEqual(stateOf(flagHost.root, flagHost.spec), 'CHECKPOINT',
    'AC-20260901-05-4(d): a refused override must leave --state unchanged at CHECKPOINT')
  const stateD = readState(flagHost.sidecar)
  assert.strictEqual('checkpointOverride' in stateD, false,
    'AC-20260901-05-4(d): a refused override must write no checkpointOverride key — a flag name (e.g. "--waived") must never be recorded as the reason: ' + JSON.stringify(stateD))
})

test('AC-20260901-05-10: WHEN a --via loop run\'s synthetic gate fails at iteration 1 THE SYSTEM appends a GATE_RED row carrying checkpoint:{"outcome":"not-reached"}; WHEN a --via direct run\'s gate fails the same way THE SYSTEM appends a GATE_RED row with no checkpoint key', () => {
  const loopHost = makeHost('checkpoint-ac5-10-loop', { gateFails: true })
  const rLoop = run(loopHost.root, loopHost.spec, '--via', 'loop')
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'STOPPED',
    'setup precondition: a red synthetic gate must land the driver at STOPPED on the first invocation: ' + rLoop.stdout + rLoop.stderr)
  const loopRow = lastLedgerRow(loopHost.root)
  assert.strictEqual(loopRow.verdict, 'GATE_RED', 'a red-gate run must append a GATE_RED row: ' + JSON.stringify(loopRow))
  assert.deepStrictEqual(loopRow.checkpoint, { outcome: 'not-reached' },
    'AC-20260901-05-10/D3: a --via loop hard-stop row written before the checkpoint is ever recorded (reviewer-returned never marked) must carry checkpoint:{"outcome":"not-reached"}: ' + JSON.stringify(loopRow))

  const directHost = makeHost('checkpoint-ac5-10-direct', { gateFails: true })
  const rDirect = run(directHost.root, directHost.spec)
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'STOPPED',
    'setup precondition: a red synthetic gate must land the driver at STOPPED on the first invocation for the --via direct comparison too: ' + rDirect.stdout + rDirect.stderr)
  const directRow = lastLedgerRow(directHost.root)
  assert.strictEqual(directRow.verdict, 'GATE_RED', 'a red-gate run must append a GATE_RED row: ' + JSON.stringify(directRow))
  assert.strictEqual('checkpoint' in directRow, false,
    'AC-20260901-05-10/D3: a --via direct GATE_RED row must carry no checkpoint key at all — the checkpoint field is a loop-only fact and via:"direct" runs never see it: ' + JSON.stringify(directRow))
})
