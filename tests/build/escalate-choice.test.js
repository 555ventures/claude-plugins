'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, makeNoTestsHost, run, stateOf, testFileContent } = require('./build-driver.fixtures')

// specs/20261029/07-every-dead-stop-becomes-a-question-with-a-default.md D2/D3 — the build
// driver's ESCALATE step recommends re-arm or park from the gate logs' failure-count trend and
// takes `--mark escalate-choice`; its RED_FINDINGS step auto-picks the mechanical fixes.
// specs/20261103/04-predictable-stops-become-host-policy.md D5/D7/D10/D14 — AC-20261103-04-6, -10,
// -14, -21: a default host auto-picks ESCALATE and the critical red finding; stops set to ask keep them.

const ASK_ESCALATE = { buildEscalate: 'ask' }
const ASK_RED = { redFindings: 'ask' }
const hostStops = (root, stops) => {
  if (!stops) return
  const cfgPath = path.join(root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.policy = { ...(cfg.policy || {}), stops }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
}
const readBuildState = (host) => JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))

const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' })

// A no-tests host whose gate is red every run and prints, per run, the next line of counts.txt.
function escalatedHost(lines, failCountPattern, stops) {
  const host = makeNoTestsHost()
  hostStops(host.root, stops)
  if (failCountPattern !== undefined) {
    const cfgPath = path.join(host.root, '.claude/spec.config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.capabilities.failCountPattern = failCountPattern
    fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  }
  fs.writeFileSync(path.join(host.root, 'gate.sh'),
    '#!/usr/bin/env bash\nline=$(head -1 counts.txt)\ntail -n +2 counts.txt > counts.next && mv counts.next counts.txt\necho "$line"\nexit 1\n')
  fs.writeFileSync(path.join(host.root, 'counts.txt'), lines.join('\n') + '\n')
  git(host.root, 'add', '-A'); git(host.root, 'commit', '-q', '-m', 'counting gate')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  run(host.root, host.spec, '--mark', 'integrated')
  for (let i = 1; i <= 3; i++) run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  const fourth = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'setup precondition: a refused fourth repair-applied must park the run at ESCALATE: ' + fourth.stdout + fourth.stderr)
  return { host, fourth }
}

test('AC-20261029-07-2 / AC-20261102-01-7: gate logs carrying Failed: 9, 4, 2 under a declared failCountPattern make the ESCALATE step recommend re-arm, name the mark, and the re-arm mark re-enters the repair round', () => {
  const { host, fourth } = escalatedHost(['Failed: 20', 'Failed: 9', 'Failed: 4', 'Failed: 2'], 'Failed:\\s+(\\d+)', ASK_ESCALATE)
  assert.match(fourth.stdout + fourth.stderr, /--mark escalate-choice/,
    'the fourth-repair refusal must name the sanctioned mark, or the owner is told to delete files by hand: ' + fourth.stdout + fourth.stderr)
  assert.doesNotMatch(fourth.stdout + fourth.stderr, /delete/,
    'the refusal must not instruct file deletion — the mark replaces it: ' + fourth.stdout + fourth.stderr)
  const step = run(host.root, host.spec).stdout
  assert.match(step, /recommended: re-arm \(failures shrank 9 → 4 → 2\)/,
    'a strictly shrinking trend must recommend re-arm with the trend quoted: ' + step)
  assert.match(step, /--mark escalate-choice/, 'the step must name the mark that carries the answer: ' + step)
  const m = run(host.root, host.spec, '--mark', 'escalate-choice', 're-arm')
  assert.strictEqual(m.status, 0, 'the escalate-choice mark must be admitted at ESCALATE: ' + m.stdout + m.stderr)
  const next = run(host.root, host.spec).stdout
  assert.match(next, /round 4 \(re-armed past the cap of 3\)/,
    'a re-arm must land the next repair step labelled as past the cap: ' + next)
})

test('AC-20261029-07-2: with no failCountPattern declared, gate logs carrying fail 9, 4, 2 still recommend re-arm from the built-in shape', () => {
  const { host } = escalatedHost(['ℹ fail 20', 'ℹ fail 9', 'ℹ fail 4', 'ℹ fail 2'], undefined, ASK_ESCALATE)
  const step = run(host.root, host.spec).stdout
  assert.match(step, /recommended: re-arm \(failures shrank 9 → 4 → 2\)/,
    'a host declaring nothing must keep the built-in count shapes, or every default host loses its trend: ' + step)
})

test('AC-20261102-01-7: a host declaring failCountPattern "none" gets the unavailable-count park recommendation even when the logs carry a built-in shape', () => {
  const { host } = escalatedHost(['ℹ fail 20', 'ℹ fail 9', 'ℹ fail 4', 'ℹ fail 2'], 'none', ASK_ESCALATE)
  const step = run(host.root, host.spec).stdout
  assert.ok(step.includes('recommended: park (fail count unavailable — the host declares failCountPattern "none")'),
    'a declined count must say so instead of recommending on a guess or on "not derivable": ' + step)
})

test('AC-20261029-07-2: a flat failure trend recommends park, and a log with no recognizable summary recommends park with the not-derivable reason', () => {
  const flat = escalatedHost(['ℹ fail 3', 'ℹ fail 3', 'ℹ fail 3', 'ℹ fail 3'], undefined, ASK_ESCALATE)
  const flatStep = run(flat.host.root, flat.host.spec).stdout
  assert.match(flatStep, /recommended: park \(failures did not shrink: 3 → 3 → 3\)/,
    'a non-shrinking trend must not recommend another round of the same failure: ' + flatStep)
  const none = escalatedHost(['no summary here', 'no summary here', 'no summary here', 'no summary here'], undefined, ASK_ESCALATE)
  const noneStep = run(none.host.root, none.host.spec).stdout
  assert.match(noneStep, /recommended: park \(failure count not derivable from the gate logs\)/,
    'an unreadable count must fall to park — a wrong re-arm costs a gate run, a wrong park costs one question: ' + noneStep)
})

test('AC-20261029-07-2: the park choice prints the spec-queue add line with the fix lane and leaves the state at ESCALATE', () => {
  const { host } = escalatedHost(['ℹ fail 5', 'ℹ fail 5', 'ℹ fail 5', 'ℹ fail 5'])
  const m = run(host.root, host.spec, '--mark', 'escalate-choice', 'park')
  assert.strictEqual(m.status, 0, 'the park choice must be admitted at ESCALATE: ' + m.stdout + m.stderr)
  assert.ok(m.stdout.includes('spec-queue)" add'), 'the mark must print the exact queue line for the session to run: ' + m.stdout)
  assert.ok(m.stdout.includes('--lane fix --top'), 'the queued repair must go to the top of the fix lane: ' + m.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE', 'a parked build stays at ESCALATE, never silently advances: ' + m.stdout)
})

// A host at RED_FINDINGS: the base already computes 42, so a test pinning 42 is green on the pre-image.
function redFindingsHost({ tier = 'standard', mixed = false, stops = null } = {}) {
  const host = makeHost()
  hostStops(host.root, stops)
  let body = fs.readFileSync(host.spec, 'utf8').replace('tier: standard', 'tier: ' + tier)
  if (mixed) {
    body = body.replace('- **AC-20260901-01-1**: foo() returns the correct computed value.',
      '- **AC-20260901-01-1**: WHEN foo runs THE SYSTEM SHALL print the new banner; WHEN bar runs THE SYSTEM SHALL CONTINUE TO exit 0 → tests/foo.test.js')
  }
  fs.writeFileSync(host.spec, body)
  run(host.root, host.spec)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(42))
  const r = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_FINDINGS',
    'setup precondition: a green or mixed test must stop at RED_FINDINGS: ' + r.stdout + r.stderr)
  return run(host.root, host.spec).stdout
}

test('AC-20261029-07-3: a mixed-pin finding on a standard spec prints the auto-picked split line naming the file and AC-ID', () => {
  const step = redFindingsHost({ mixed: true })
  assert.ok(step.includes('📌 Auto-picked split the bullet — tests/foo.test.js: AC-20260901-01-1 (veto anytime)'),
    'a mixed bullet has one mechanical fix, so the step must announce it instead of asking: ' + step)
})

test('AC-20261029-07-3: an unsanctioned-green finding on a standard spec auto-picks removing the AC-ID mention without asking', () => {
  const step = redFindingsHost({ tier: 'standard' })
  assert.match(step, /📌 Auto-picked remove the AC-ID mention/,
    'the documented known cause has one fix, so the step must announce it: ' + step)
  assert.doesNotMatch(step, /AskUserQuestion/, 'a standard-tier green must not stop for a diagnosis conversation: ' + step)
})

test('AC-20261029-07-3: the same unsanctioned-green finding on a critical spec asks one question with the recommended removal first (also AC-20261103-04-21: under stops.redFindings ask)', () => {
  const step = redFindingsHost({ tier: 'critical', stops: ASK_RED })
  assert.match(step, /AskUserQuestion/, 'a critical-tier green stays a human decision: ' + step)
  assert.match(step, /remove the AC-ID mention \(Recommended\)/, 'the question must carry the recommended default: ' + step)
})

test('AC-20261103-04-6: on a default host a shrinking-trend ESCALATE prints the Auto-picked re-arm line, the past-the-cap repair step and the override mark, asks nothing, and records escalateChoice re-arm', () => {
  const { host } = escalatedHost(['Failed: 20', 'Failed: 9', 'Failed: 4', 'Failed: 2'], 'Failed:\\s+(\\d+)')
  const step = run(host.root, host.spec).stdout
  assert.ok(step.includes('📌 Auto-picked re-arm one more round — host policy stops.buildEscalate: derived (recommended: re-arm (failures shrank 9 → 4 → 2)) (veto anytime)'),
    'without the printed pick the owner cannot see or veto the re-arm the policy derived: ' + step)
  assert.match(step, /round 4 \(re-armed past the cap of 3\)/, 'the pick must land the same repair step the explicit mark prints: ' + step)
  assert.ok(step.includes('--mark escalate-choice <re-arm|cold|park|amend>'), 'the veto surface must name the mark that answers differently: ' + step)
  assert.doesNotMatch(step, /AskUserQuestion/, 'a default host must not be asked the derived stop: ' + step)
  assert.strictEqual(readBuildState(host).escalateChoice, 're-arm', 'the pick must be recorded as the choice, or the next run re-picks: ' + JSON.stringify(readBuildState(host)))
})

test('AC-20261103-04-6: on a default host a flat-trend ESCALATE prints the Auto-picked park line and the fix-lane queue add and stays at ESCALATE', () => {
  const { host } = escalatedHost(['ℹ fail 5', 'ℹ fail 5', 'ℹ fail 5', 'ℹ fail 5'])
  const step = run(host.root, host.spec).stdout
  assert.ok(step.includes('📌 Auto-picked park and queue a /spec:fix — host policy stops.buildEscalate: derived (recommended: park (failures did not shrink: 5 → 5 → 5)) (veto anytime)'),
    'a flat trend must auto-pick the reversible park and say so: ' + step)
  assert.ok(step.includes('spec-queue)" add'), 'the park pick must print the queue line: ' + step)
  assert.ok(step.includes('--lane fix --top'), 'the queued repair must go to the top of the fix lane: ' + step)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE', 'a parked build stays at ESCALATE: ' + step)
})

test('AC-20261103-04-14: the park choice records laneExit with the cap reason and a queue subject starting with the spec relative path', () => {
  const { host } = escalatedHost(['ℹ fail 5', 'ℹ fail 5', 'ℹ fail 5', 'ℹ fail 5'], undefined, ASK_ESCALATE)
  const m = run(host.root, host.spec, '--mark', 'escalate-choice', 'park')
  assert.strictEqual(m.status, 0, 'the park choice must be admitted at ESCALATE: ' + m.stdout + m.stderr)
  const exit = readBuildState(host).laneExit
  assert.ok(exit && exit.reason === 'build parked at the repair cap',
    'a parked lane must record why it ended, or the fan-out returns it as an unrecognised stop: ' + JSON.stringify(exit))
  assert.ok(typeof exit.queued === 'string' && exit.queued.startsWith(path.relative(host.root, host.spec)),
    'the recorded queue subject must start with the spec path so the parent lists it: ' + JSON.stringify(exit))
})

test('AC-20261103-04-10: an in-session critical-tier unsanctioned-green on a default host prints the Auto-picked removal line and no AskUserQuestion', () => {
  const step = redFindingsHost({ tier: 'critical' })
  assert.ok(step.includes('📌 Auto-picked remove the AC-ID mention — host policy stops.redFindings: remove-mention (veto anytime)'),
    'the known-cause fix must be announced on the critical tier too: ' + step)
  assert.doesNotMatch(step, /AskUserQuestion/, 'a default host must not be asked the red-findings stop: ' + step)
})

test('AC-20261103-04-6: after a default host auto-picks re-arm, the printed override mark escalate-choice park is admitted and lands the explicit park state', () => {
  const { host } = escalatedHost(['Failed: 20', 'Failed: 9', 'Failed: 4', 'Failed: 2'], 'Failed:\\s+(\\d+)')
  const step = run(host.root, host.spec).stdout
  assert.ok(step.includes('📌 Auto-picked re-arm one more round') && step.includes('--mark escalate-choice <re-arm|cold|park|amend>'),
    'setup precondition: the bare run must print the re-arm pick and the override mark: ' + step)
  const m = run(host.root, host.spec, '--mark', 'escalate-choice', 'park')
  assert.strictEqual(m.status, 0, 'the printed veto mark must be admitted after the auto-pick, or the owner cannot answer differently: ' + m.stdout + m.stderr)
  const state = readBuildState(host)
  assert.strictEqual(state.escalateChoice, 'park', 'the vetoing mark must replace the derived re-arm with park: ' + JSON.stringify(state))
  assert.ok(state.laneExit && state.laneExit.reason === 'build parked at the repair cap',
    'a vetoed-to-park lane must record why it ended like the explicit park mark: ' + JSON.stringify(state.laneExit))
})
