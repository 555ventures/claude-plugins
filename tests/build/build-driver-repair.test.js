'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, makeNoTestsHost, run, stateOf, toFirstWave, toIntegration, toEscalateCap, implementScriptsWave } = require('./build-driver.fixtures')

// specs/20260901/01-build-driver.md (brief 18): shard of build-driver.test.js, split by
// specs/20260903/07-test-file-budget-guard.md D7. Owns the WAVE/INTEGRATION/REPAIR/ESCALATE
// lifecycle: AC-20260901-01-6, -7, -8 (all legs), -18 (all three admission-gate legs), and the
// empty-waves field report. Admission/TESTS-stage lives in build-driver.test.js; commit/ledger/
// provenance/glob lives in build-driver-commit.test.js. Shared helpers live in
// tests/build/build-driver.fixtures.js.

test('AC-20260901-01-6: WHEN --mark wave-done names the current wave and every row of it verifies THE SYSTEM prints the next wave in layerGroups order then other, or INTEGRATION when none remain — a wrong wave name or an unverified row is refused', () => {
  const host = makeHost()
  toFirstWave(host)
  const rWrong = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(rWrong.status, 2,
    'marking a wave that is not the current one must be refused — accepting it would let a wave whose files were never verified ride through: ' + rWrong.stdout + rWrong.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts', 'a wrong-wave mark must leave the current wave unchanged')

  const rMissing = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  assert.strictEqual(rMissing.status, 2,
    'wave-done must refuse when the wave\'s CREATE row (src/bar.js) does not yet exist on disk — a missing implementation file must never be marked done: ' + rMissing.stdout + rMissing.stderr)

  implementScriptsWave(host)
  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  assert.strictEqual(r1.status, 0, 'once every row of the wave verifies the mark must be accepted: ' + r1.stdout + r1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:other',
    'the first layerGroups entry must be followed by the other wave — the exact worked example of AC-20260901-01-6 (layerGroups doctrine+scripts, rows in scripts and other): ' + r1.stdout)

  const r2 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(r2.status, 0, 'the other wave\'s row (other.txt, a MODIFY row that already exists) must verify: ' + r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION', 'no wave remains after other, so the state must be INTEGRATION: ' + r2.stdout)
})

test('AC-20260901-01-7: WHEN --mark integrated is received THE SYSTEM runs the resolved gate command itself, writes gate-1.log, and prints COMMIT on a pass', () => {
  const host = makeHost()
  toIntegration(host)
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r.status, 0, 'a passing gate at INTEGRATION must be accepted: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-1.log')),
    'the driver must write gate-1.log for its own gate run — without it the session has no evidence to point to: ' + host.sidecar)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT', 'a passing gate must land COMMIT: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /COMMIT/, 'the printed step must name COMMIT: ' + r.stdout)
})

test('AC-20260901-01-7 (fail branch) / AC-20260901-01-8: a red gate at INTEGRATION prints REPAIR naming round "1 of 3" and the log path; three repair-applied cycles that stay red are each accepted, and a fourth is refused with exit 2, touching gate-cap and parking the run at the terminal state ESCALATE', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')

  run(host.root, host.spec)
  const rWave = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the only wave (scripts, no other/tests rows) must land INTEGRATION: ' + rWave.stdout + rWave.stderr)

  const rInt = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(rInt.status, 0, 'a red gate at INTEGRATION is a normal step-printing outcome, not a refusal of the mark: ' + rInt.stdout + rInt.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'a failing gate must land the REPAIR state: ' + rInt.stdout + rInt.stderr)
  assert.match(rInt.stdout, /round 1 of 3/, 'the first REPAIR round must be literally named "round 1 of 3" per the Contracts\' own worked example: ' + rInt.stdout)
  assert.match(rInt.stdout, /gate-1\.log/, 'the REPAIR step must name the current gate log path so the session can read the failure: ' + rInt.stdout)

  for (let i = 1; i <= 3; i++) {
    const r = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
    assert.strictEqual(r.status, 0, `repair-applied call #${i} (within the 3-call cap) must be accepted: ` + r.stdout + r.stderr)
    assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
      `repair-applied call #${i} against a gate that is still red must return to REPAIR: ` + r.stdout + r.stderr)
  }

  const fourth = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(fourth.status, 2,
    'a fourth repair-applied call must be refused — accepting it would let the repair loop run unbounded: ' + fourth.stdout + fourth.stderr)
  assert.match(fourth.stdout + fourth.stderr, /cap/i, 'the refusal must name the cap: ' + fourth.stdout + fourth.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'a refused fourth repair-applied must touch <spec>.build/gate-cap: ' + host.sidecar)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused fourth repair-applied must park the run at the terminal state ESCALATE: ' + fourth.stdout + fourth.stderr)

  const rEsc = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'every later bare invocation must keep printing ESCALATE until <spec>.build/gate-cap is deleted — a session that just re-runs the driver must never silently re-enter the repair loop: ' + rEsc.stdout + rEsc.stderr)
})

test('AC-20260901-01-8 (re-arm, gate now passes): deleting gate-cap and issuing one more repair-applied whose gate genuinely exits 0 prints COMMIT and leaves gate-cap absent, not buried at ESCALATE', () => {
  const host = makeNoTestsHost()
  toEscalateCap(host)

  // The gate now genuinely passes: remove FAIL_FLAG, commit the fix, delete the cap, and issue
  // exactly one more repair-applied — the "one deletion buys one more round" re-arm (D4).
  fs.rmSync(path.join(host.root, 'FAIL_FLAG'))
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fix landed')
  fs.rmSync(path.join(host.sidecar, 'gate-cap'))
  const r = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '0', '--spawned', '0')
  assert.strictEqual(r.status, 0, 'a re-armed repair-applied whose gate re-run exits 0 must be accepted, never refused as if the cap were still spent: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'a re-armed round whose gate genuinely exits 0 must land COMMIT — this is the regression this test pins: afterWaves() ' +
    'used to check gate-cap existence before the last gate run\'s exit code, so a re-armed PASS was buried at ESCALATE, ' +
    'forcing the D7 resume path and stamping a degraded redCheck:"skipped-resume" on a build that actually passed: ' +
    r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'a re-armed round that goes green must leave gate-cap absent — a stale cap file would wrongly re-trip the next bare invocation into ESCALATE: ' +
    host.sidecar)
})

test('AC-20260901-01-8 (re-arm, gate stays red): deleting gate-cap and issuing one more repair-applied whose gate still exits non-zero re-touches gate-cap and returns to ESCALATE', () => {
  const host = makeNoTestsHost()
  toEscalateCap(host)

  // FAIL_FLAG stays in place — the re-armed round is still genuinely red.
  fs.rmSync(path.join(host.sidecar, 'gate-cap'))
  const r = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '0', '--spawned', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a re-armed round whose gate still exits non-zero must return to ESCALATE, not COMMIT: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'a re-armed round that is still red must re-touch gate-cap — without this leg the fix could regress into "just stop ' +
    'touching gate-cap on the re-arm branch", making the cap soft forever instead of costing one round per deletion: ' +
    host.sidecar)
})

test('AC-20260901-01-8: a bare invocation after deleting gate-cap prints REPAIR labeled "re-armed past the cap of 3", never the impossible "round 4 of 3"', () => {
  const host = makeNoTestsHost()
  toEscalateCap(host)
  fs.rmSync(path.join(host.sidecar, 'gate-cap'))
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
    'deleting gate-cap while the last recorded gate run is still red must re-open REPAIR on the very next bare invocation, before any repair-applied mark is issued: ' +
    r.stdout + r.stderr)
  assert.match(r.stdout, /re-armed past the cap of 3/,
    'once capEverTripped is recorded the re-opened REPAIR step must use the "re-armed past the cap" label, not a fresh round count: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /round 4 of 3/,
    'the driver must never print the impossible "round 4 of 3" — the cap was already spent once, so this round is a re-arm, not the 4th slot of the original 3: ' + r.stdout)
})

test('AC-20260901-01-18 (ESCALATE not laundered): a --mark integrated re-issued at ESCALATE with a now-green tree and gate-cap still on disk is refused with exit 2 naming the current state, runs no gate, and leaves gateRuns unchanged', () => {
  const host = makeNoTestsHost()
  toEscalateCap(host)
  fs.rmSync(path.join(host.root, 'FAIL_FLAG'))
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fix landed')
  const before = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')).gateRuns.length

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r.status, 2,
    'before the admission gate, `integrated` had no state guard at all — re-issued at ESCALATE it re-ran the gate and printed COMMIT, laundering the terminal state with gate-cap still on disk: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /ESCALATE/,
    'the refusal must name the current state (ESCALATE) so the session re-runs the driver bare instead of guessing a remedy: ' + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused mark must leave the state unchanged (D1): ' + r.stdout + r.stderr)
  const after = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')).gateRuns.length
  assert.strictEqual(after, before,
    'a refused integrated mark must run no gate — gateRuns must stay exactly where ESCALATE left it, or the refusal is cosmetic while the side effect still lands: ' + JSON.stringify({ before, after }))
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'gate-cap must remain on disk — deleting it is the only sanctioned re-arm; a re-issued integrated mark must never be a second way out')
})

test('AC-20260901-01-18 (the repair cap cannot be bypassed via integrated): four --mark integrated re-issues at REPAIR are each refused, add no gate run, and the bare step still reads "round 1 of 3", never "round 4 of 3"', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  const rInt = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
    'setup precondition: a red gate at INTEGRATION must land REPAIR: ' + rInt.stdout + rInt.stderr)

  for (let i = 1; i <= 4; i++) {
    const r = run(host.root, host.spec, '--mark', 'integrated')
    assert.strictEqual(r.status, 2,
      `re-issue #${i} of integrated at REPAIR must be refused — before the admission gate each re-issue ran the gate and appended to gateRuns without ever appending to repairs[], an unbounded uncounted repair loop that never trips the 3-round cap: ` +
      r.stdout + r.stderr)
  }
  const stateJson = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(stateJson.gateRuns.length, 1,
    'four refused integrated re-issues must add zero gate runs — gateRuns must stay at the single round the initial integrated mark produced: ' + JSON.stringify(stateJson))
  const bare = run(host.root, host.spec)
  assert.match(bare.stdout, /round 1 of 3/,
    'the REPAIR step must still read "round 1 of 3" — an uncounted repair loop would have inflated the printed round past the cap without ever tripping it: ' + bare.stdout)
})

test('AC-20260901-01-18 (legitimate re-entry still admits): a gate that dies without an exit code after integrated was recorded re-derives the state to INTEGRATION, and a second integrated mark is accepted and actually runs the gate — this must hold both before and after the admission-gate fix, or /clear-safe resume would break', () => {
  const host = makeNoTestsHost()
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the only wave (scripts, no other/tests rows) must land INTEGRATION')

  fs.writeFileSync(path.join(host.root, 'gate.sh'), '#!/usr/bin/env bash\nkill -9 $$\n')
  const r1 = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r1.status, 2, 'a signal-killed gate child is a fail-closed refusal via lib/driver-io.js runChild(): ' + r1.stdout + r1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'no gate run was recorded (the child died before producing an exit code), so the state must re-derive to INTEGRATION and print integrated again: ' + r1.stdout + r1.stderr)

  fs.writeFileSync(path.join(host.root, 'gate.sh'), '#!/usr/bin/env bash\nexit 0\n')
  const r2 = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r2.status, 0,
    'the re-issued integrated mark that the driver itself printed must be admitted — the admission check keys on the derived state alone, never on mark history, or a mark could only ever be issued once and /clear-safe resume would break: ' +
    r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'the re-admitted integrated mark must actually run the gate and reach COMMIT on a genuine pass: ' + r2.stdout + r2.stderr)
})

test('AC-20260901-01-8 (phantom round): a repair-applied whose gate child dies without an exit code exits 2, leaves marks.repairs unchanged, and a subsequent honest repair-applied for the same round is accepted rather than refused as a fourth', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'setup precondition: a red gate at INTEGRATION must land REPAIR')

  const r1 = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(r1.status, 0, 'setup precondition: the first honest repair-applied call must be accepted: ' + r1.stdout + r1.stderr)
  const repairsAfterFirst = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')).repairs.length
  assert.strictEqual(repairsAfterFirst, 1, 'setup precondition: one accepted repair-applied call must record exactly one round')

  fs.writeFileSync(path.join(host.root, 'gate.sh'), '#!/usr/bin/env bash\nkill -9 $$\n')
  const r2 = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(r2.status, 2, 'a signal-killed gate child during repair-applied must exit 2 via the fail-closed runChild refusal: ' + r2.stdout + r2.stderr)
  const repairsAfterDeath = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')).repairs.length
  assert.strictEqual(repairsAfterDeath, repairsAfterFirst,
    'before the reorder, marks.repairs.push() ran BEFORE runGate() so a dying gate child still left a phantom round recorded — repairs.length must stay unchanged here: ' +
    JSON.stringify({ repairsAfterFirst, repairsAfterDeath }))
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'a failed repair-applied call must leave the run at REPAIR, not silently advance it')

  fs.writeFileSync(path.join(host.root, 'gate.sh'), '#!/usr/bin/env bash\nif [ -f FAIL_FLAG ]; then echo GATE_FAILED_MARKER; exit 1; else exit 0; fi\n')
  const r3 = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(r3.status, 0,
    'the honest retry for this same round must be accepted, not refused as a fourth round — the dying gate must not have consumed one of the 3 repair slots: ' + r3.stdout + r3.stderr)
  const finalState = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(finalState.repairs.length, 2,
    'exactly two genuine repair rounds must be recorded — the signal-killed attempt must never have counted, and the D6 row\'s workers sums must never be inflated by a round that never produced a result: ' +
    JSON.stringify(finalState))
})

test('AC-20260901-01-18 (class coverage: red-attributed): a --mark red-attributed issued at TESTS, before RED_ATTRIBUTION is ever printed, is refused with exit 2 naming the current state and leaves build-state.json unchanged', () => {
  const host = makeHost()
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS', 'setup precondition: a fresh hardened host must start at TESTS: ' + r0.stdout + r0.stderr)
  const before = fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')

  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(r.status, 2,
    'before the admission gate, red-attributed had no state guard and was accepted at TESTS, pre-recording the judgment so the RED_ATTRIBUTION step was never printed: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /TESTS/, 'the refusal must name the current state (TESTS): ' + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS', 'a refused red-attributed mark must leave the state unchanged: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), before,
    'a refused mark must leave build-state.json byte-unchanged — recording it here would let the RED_ATTRIBUTION judgment step be silently skipped: ' + before)
})

test('field report 2026-09-02 (empty waves): WHEN layerGroups declares groups with no File Plan rows THE SYSTEM skips them at derivation — the first WAVE is the first non-empty group, one printed line names the skipped groups, unlisted layers still trail as other, and no wave-done mark is ever demanded for a skipped group', () => {
  const host = makeNoTestsHost()
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.layerGroups = [['contracts'], ['doctrine', 'scripts'], ['wiring']]
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  // Add an unlisted-layer row so the trailing `other` wave is exercised alongside the skips.
  fs.writeFileSync(host.spec, fs.readFileSync(host.spec, 'utf8').replace(
    '| src/only.js | MODIFY | scripts |', '| src/only.js | MODIFY | scripts |\n| gate.sh | MODIFY | other |'))

  const r0 = run(host.root, host.spec)
  assert.strictEqual(r0.status, 0, r0.stdout + r0.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'the empty leading group (contracts) must never become a wave — the first step is the first non-empty group: ' + r0.stdout)
  assert.match(r0.stdout, /empty wave\(s\) skipped — no File Plan rows: contracts, wiring/,
    'one line must name every skipped group so the session can see the derivation: ' + r0.stdout)
  const rWrong = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'contracts', '--workers', '0')
  assert.strictEqual(rWrong.status, 2, 'a skipped group is not a wave, so marking it must be refused: ' + rWrong.stdout + rWrong.stderr)

  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(r1.status, 0, r1.stdout + r1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:other',
    'the empty trailing group (wiring) must be skipped straight to the other wave: ' + r1.stdout)
  const r2 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(r2.status, 0, r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION', 'no wave remains after other: ' + r2.stdout)
})
