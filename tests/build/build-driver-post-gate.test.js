'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, read } = require('../helpers')
const { makeHost, makeNoTestsHost, run, stateOf, toIntegration, toCommit } = require('./build-driver.fixtures')

// specs/20260910/07-post-gate-command.md: AC-20260910-07-1..10. Owns the host-declared
// `postGateCommand` chained into runGate()'s ONE bash -c child (D1/D2), the REPAIR step's
// post-gate line (D3), the DONE row's gate.postGate flag (D4), and the two CONTINUE-TO pins
// (D5: resolveGate ignores the key; D5/AC-8: an absent key is byte-for-byte today's gate).
// specs/20260910/08-gate-sees-created-files.md D6/AC-20260910-08-6 retags the AC-20260910-07-5
// test below — its own gateRuns.length===2 assertion is that coverage; no assertion changed.

function setConfig(host, patch) {
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  Object.assign(cfg, patch)
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
}

function gateStateAndLog(host) {
  const state = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  const log = fs.readFileSync(state.gateRuns[state.gateRuns.length - 1].log, 'utf8')
  return { state, log }
}

test('AC-20260910-07-1: WHEN the config declares a postGateCommand that prints POST-RED and exits 3 and the scoped gate at --mark integrated passes THE SYSTEM lands REPAIR, records gateRuns[0].exit===3, and gate-1.log ends with the == postGateCommand marker followed by POST-RED', () => {
  const host = makeHost()
  toIntegration(host)
  fs.writeFileSync(path.join(host.root, 'post.sh'), '#!/usr/bin/env bash\necho POST-RED\nexit 3\n')
  setConfig(host, { postGateCommand: 'bash post.sh' })

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r.status, 0,
    'a red post-gate after a green scoped gate is a normal step-printing outcome (REPAIR), not a refusal of the mark: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
    'D1: a post-gate that exits non-zero after the scoped gate passed must land REPAIR exactly as a red scoped gate does — a build that passes its own tests but breaks a repo-wide pin must not be allowed to reach COMMIT: ' + r.stdout + r.stderr)

  const { state, log } = gateStateAndLog(host)
  assert.strictEqual(state.gateRuns[0].exit, 3,
    'D1: gateRuns[0].exit must carry the CHAIN\'s exit (the post-gate\'s 3) — the repair-round bookkeeping reads this field, and a wrong value would either hide the red or double-count it: ' + JSON.stringify(state.gateRuns))
  assert.match(log, /== postGateCommand[\s\S]*POST-RED/,
    'gate-1.log must contain the == postGateCommand marker line followed by the post-gate\'s own output — without it D3\'s REPAIR step cannot tell the session which half of the log names the failure: ' + log)
})

test('AC-20260910-07-2: WHEN the config declares postGateCommand "echo POST-GREEN" and both the scoped gate and the post-gate exit 0 THE SYSTEM lands COMMIT with gateRuns[0].exit===0 and gate-1.log containing == postGateCommand followed by POST-GREEN', () => {
  const host = makeHost()
  toIntegration(host)
  setConfig(host, { postGateCommand: 'echo POST-GREEN' })

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'D1: a scoped gate and a declared post-gate that both exit 0 must land COMMIT — a chain that behaves like the scoped gate alone when the post-gate is also green is the whole point of D1\'s bash && semantics: ' + r.stdout + r.stderr)

  const { state, log } = gateStateAndLog(host)
  assert.strictEqual(state.gateRuns[0].exit, 0,
    'the recorded exit for an all-green chain must be 0, matching the D4 ledger boolean\'s companion finalRounds:1 shape: ' + JSON.stringify(state.gateRuns))
  assert.match(log, /== postGateCommand[\s\S]*POST-GREEN/,
    'the marker and the post-gate\'s own output must both land in gate-1.log even on a green chain, or the session has no way to confirm the post-gate genuinely ran rather than being silently skipped: ' + log)
})

test('AC-20260910-07-3: WHEN the config declares postGateCommand "echo POST-RAN" and the scoped gate itself exits non-zero THE SYSTEM lands REPAIR with gate-1.log containing neither == postGateCommand nor POST-RAN', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')
  setConfig(host, { postGateCommand: 'echo POST-RAN' })

  run(host.root, host.spec)
  const rWave = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the only wave must land INTEGRATION before the gate can be exercised: ' + rWave.stdout + rWave.stderr)

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
    'D1: a red scoped gate must land REPAIR whether or not a post-gate is declared — bash && short-circuits before the post-gate ever runs: ' + r.stdout + r.stderr)

  const { log } = gateStateAndLog(host)
  assert.doesNotMatch(log, /== postGateCommand/,
    'D1: a red scoped gate must short-circuit the bash && chain — the marker line must never appear in the log when the scoped gate itself failed: ' + log)
  assert.doesNotMatch(log, /POST-RAN/,
    'the post-gate\'s own output must never appear in the log when the scoped gate never let the chain reach it: ' + log)
})

test('AC-20260910-07-4: WHEN the config declares testCommand "echo SUITE-SENTINEL-7" and postGateCommand "{testCommand}" and the scoped gate passes THE SYSTEM runs the substituted command, observable as SUITE-SENTINEL-7 in gate-1.log after the marker, and lands COMMIT', () => {
  const host = makeHost()
  toIntegration(host)
  setConfig(host, { testCommand: 'echo SUITE-SENTINEL-7', postGateCommand: '{testCommand}' })

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'D2: once {testCommand} is substituted with the config\'s testCommand string and that command exits 0, the chain must land COMMIT: ' + r.stdout + r.stderr)

  const { log } = gateStateAndLog(host)
  assert.match(log, /== postGateCommand[\s\S]*SUITE-SENTINEL-7/,
    'D2: the literal {testCommand} placeholder inside postGateCommand must be replaced with the config\'s testCommand string before the chain runs — a log without SUITE-SENTINEL-7 means the placeholder reached bash unresolved: ' + log)
})

test('AC-20260910-07-5 / AC-20260910-08-6 (SHALL CONTINUE TO): WHEN a run is at REPAIR because only a flag-file-reading post-gate is red and the flag is removed before --mark repair-applied THE SYSTEM re-runs the chain and lands COMMIT with gateRuns.length===2 and gateRuns[1].exit===0', () => {
  const host = makeHost()
  toIntegration(host)
  fs.writeFileSync(path.join(host.root, 'post.sh'),
    '#!/usr/bin/env bash\nif [ -f POST_FAIL_FLAG ]; then echo POST-RED; exit 3; else echo POST-OK; exit 0; fi\n')
  fs.writeFileSync(path.join(host.root, 'POST_FAIL_FLAG'), '')
  setConfig(host, { postGateCommand: 'bash post.sh' })

  const r1 = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
    'setup precondition: a red post-gate with a green scoped gate must land REPAIR before the re-run leg can be exercised: ' + r1.stdout + r1.stderr)

  fs.rmSync(path.join(host.root, 'POST_FAIL_FLAG'))
  const r2 = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(r2.status, 0,
    'a repair-applied call whose re-run chain now exits 0 must be accepted: ' + r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'D1: the post-gate re-enters the SAME repair loop a red scoped gate uses — once the flag is removed the chain must re-run and land COMMIT, never a separate cap or state machine: ' + r2.stdout + r2.stderr)

  const state = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(state.gateRuns.length, 2,
    'exactly two gate runs must be recorded — the chain counts as ONE gate run per round (D1), so a repair round must add exactly one entry, never two for the two commands it contains: ' + JSON.stringify(state.gateRuns))
  assert.strictEqual(state.gateRuns[1].exit, 0,
    'the second round\'s recorded exit must be the chain\'s 0 once the post-gate\'s flag is gone: ' + JSON.stringify(state.gateRuns))
})

test('AC-20260910-07-6: WHEN the bare driver invocation prints the REPAIR step on a host whose config declares postGateCommand "bash post.sh" THE SYSTEM prints a line beginning "post-gate: bash post.sh" immediately after the gate line; a host with no such key prints no post-gate: line', () => {
  const host = makeHost()
  toIntegration(host)
  fs.writeFileSync(path.join(host.root, 'post.sh'), '#!/usr/bin/env bash\necho POST-RED\nexit 3\n')
  setConfig(host, { postGateCommand: 'bash post.sh' })
  run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'setup precondition: REPAIR before the bare step print can be checked')

  const bare = run(host.root, host.spec)
  assert.match(bare.stdout, /^gate: .*\npost-gate: bash post\.sh — red only after the scoped gate passed/m,
    'D3: the REPAIR step must print the post-gate line immediately after the gate line, naming the resolved post command and the remedy sentence — the repair worker is routed by failing file and needs to know which half of the log to read: ' + bare.stdout)

  const noPostHost = makeNoTestsHost()
  fs.writeFileSync(path.join(noPostHost.root, 'FAIL_FLAG'), '')
  noPostHost.g('add', '-A'); noPostHost.g('commit', '-q', '-m', 'fail flag')
  run(noPostHost.root, noPostHost.spec)
  run(noPostHost.root, noPostHost.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  run(noPostHost.root, noPostHost.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(noPostHost.root, noPostHost.spec), 'REPAIR', 'setup precondition: REPAIR on the no-post-gate host too')

  const bareNoPost = run(noPostHost.root, noPostHost.spec)
  assert.doesNotMatch(bareNoPost.stdout, /^post-gate:/m,
    'a host with no postGateCommand key must print no post-gate: line at all — the reminder only makes sense once a post-gate is actually declared: ' + bareNoPost.stdout)
})

test('AC-20260910-07-7: WHEN --mark committed appends the stage:"build" ledger row THE SYSTEM writes gate.postGate as true on a host whose config declared a non-empty postGateCommand and false on a host without one', () => {
  const declaredHost = makeHost()
  setConfig(declaredHost, { postGateCommand: 'echo x' })
  toCommit(declaredHost)
  fs.writeFileSync(declaredHost.spec.replace(/\.md$/, '.deviations.md'), '# Deviations — 99-bd-test\n\n- one departure\n')
  execFileSync('git', ['-C', declaredHost.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', declaredHost.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })
  const r1 = run(declaredHost.root, declaredHost.spec, '--mark', 'committed')
  assert.strictEqual(r1.status, 0, 'a clean, advanced File Plan must be accepted at COMMIT: ' + r1.stdout + r1.stderr)
  const rows1 = fs.readFileSync(path.join(declaredHost.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const row1 = rows1[rows1.length - 1]
  assert.strictEqual(row1.gate.postGate, true,
    'D4: a host whose config declared a non-empty postGateCommand at row-write time must carry gate.postGate:true on the DONE row — without this boolean, review\'s GATE_RED rate cannot later be compared for builds with the knob on vs off: ' + JSON.stringify(row1))

  const bareHost = makeHost()
  toCommit(bareHost)
  fs.writeFileSync(bareHost.spec.replace(/\.md$/, '.deviations.md'), '# Deviations — 99-bd-test\n\n- one departure\n')
  execFileSync('git', ['-C', bareHost.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', bareHost.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })
  const r2 = run(bareHost.root, bareHost.spec, '--mark', 'committed')
  assert.strictEqual(r2.status, 0, 'a clean, advanced File Plan must be accepted at COMMIT: ' + r2.stdout + r2.stderr)
  const rows2 = fs.readFileSync(path.join(bareHost.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const row2 = rows2[rows2.length - 1]
  assert.strictEqual(row2.gate.postGate, false,
    'D4: a host with no postGateCommand key must carry gate.postGate:false — never an absent key, which would make the boolean uncountable across a fleet-reader sweep: ' + JSON.stringify(row2))
})

test('AC-20260910-07-8: WHEN the config has no postGateCommand key THE SYSTEM CONTINUES TO run the resolved scoped gate alone at --mark integrated — gate-1.log contains no == postGateCommand line and a green gate lands COMMIT', () => {
  const host = makeHost()
  toIntegration(host)
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'an unchanged host (no postGateCommand key) must still land COMMIT on a green scoped gate, byte-for-byte today\'s behavior: ' + r.stdout + r.stderr)
  const { log } = gateStateAndLog(host)
  assert.doesNotMatch(log, /== postGateCommand/,
    'D1: a host that declares no postGateCommand must never see the == postGateCommand marker in its log — the chain must degrade to the scoped gate alone, with nothing appended: ' + log)
})

test('AC-20260910-07-9: WHEN lib/gate-resolve.js\'s resolveGate(specText, config) is called with a config that declares postGateCommand THE SYSTEM CONTINUES TO return the same gate string it returns for the identical config without that key', () => {
  const { resolveGate } = require(path.join(ROOT, 'spec/scripts/lib/gate-resolve.js'))
  const fakeSpecText = '## File Plan\n\n| File | Action | Layer |\n|---|---|---|\n| tests/foo.test.js | CREATE | tests |\n'
  const withoutKey = resolveGate(fakeSpecText, { gateCommand: 'node --test {testDirs}' })
  const withKey = resolveGate(fakeSpecText, { gateCommand: 'node --test {testDirs}', postGateCommand: 'exit 9' })
  assert.strictEqual(withKey.gate, withoutKey.gate,
    'D5/D9: resolveGate() must return the identical gate string whether or not postGateCommand is present — review\'s gate leg and close-time re-run share this resolver, and it must never see the build-only post-gate: ' + JSON.stringify({ withKey, withoutKey }))
  assert.doesNotMatch(withKey.gate || '', /exit 9/,
    'D5: the post-gate command must never leak into the shared resolver\'s returned gate string, or review would run it a second time inside its own gate leg: ' + JSON.stringify(withKey))
})

test('AC-20260910-07-10: WHEN this repo\'s .claude/spec.config.json is read THE SYSTEM carries postGateCommand equal to the literal string {testCommand}', () => {
  const config = JSON.parse(read('.claude/spec.config.json'))
  assert.strictEqual(config.postGateCommand, '{testCommand}',
    'D7: this repo dogfoods its own post-gate knob — the config must declare postGateCommand as the literal string "{testCommand}" so the build driver chains the whole suite after every green scoped gate: ' + JSON.stringify(config.postGateCommand))
})
