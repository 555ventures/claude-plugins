'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { run, stateOf, returnFileWith, makeHost } = require('./escalate-row.fixtures')

// specs/20261029/07-every-dead-stop-becomes-a-question-with-a-default.md D5/D6/D7 — the review
// driver's STOPPED step offers one in-session repair round, its ESCALATE step lists the open
// pool and the four options, and the close notice no longer asks for a re-confirmation.

const HARD = (claim, line) => ({ severity: 'hard', claim, file: 'src/foo.js', line, impact: 'x', evidence: 'x' })
const twoHardReturn = () => ({
  verdict: 'CLEAN', survivors: [HARD('first claim', 1), HARD('second claim', 2)],
  killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10,
})
const oneHardReturn = () => ({
  verdict: 'CLEAN', survivors: [HARD('only claim', 1)],
  killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10,
})
const disposerFile = (name, entries) => returnFileWith(name, { verdict: 'DISPOSED', dispositions: entries, tokens: 1 })

// A host whose committed suite fails — the gate leg lands red and the first bare run is STOPPED.
function redGateHost(name) {
  const host = makeHost(name)
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 0\n')
  const g = (...a) => execFileSync('git', ['-C', host.root, ...a], { encoding: 'utf8' })
  g('add', '-A'); g('commit', '-q', '-m', 'break foo')
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'STOPPED',
    'setup precondition: a failing committed suite must hard-stop LEGS into STOPPED: ' + r.stdout + r.stderr)
  return { host, g, first: r }
}
const makeGreen = (host, g) => {
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42\n')
  g('add', '-A'); g('commit', '-q', '-m', 'repair foo')
}

test('AC-20261029-07-5: a red gate leg prints STOPPED with the repair-round, queue and abandon options and names --mark repair-round; a green gate then lets the mark exit 0 into REVIEWER', () => {
  const { host, g, first } = redGateHost('stopped-rr-green')
  const step = first.stdout
  assert.match(step, /STOPPED/, 'the red-leg stop must print the STOPPED step: ' + step)
  assert.match(step, /repair round \(Recommended\)/,
    'without the recommended repair-round option the owner is back to deleting the manifest by hand: ' + step)
  assert.match(step, /queue/, 'the /spec:fix queue exit must be offered so a red the session cannot repair has a route: ' + step)
  assert.match(step, /abandon/, 'the abandon exit must be offered so the owner can walk away: ' + step)
  assert.match(step, /--mark repair-round/, 'the step must name the mark that carries the answer: ' + step)

  makeGreen(host, g)
  const m = run(host.root, host.spec, '--mark', 'repair-round')
  assert.strictEqual(m.status, 0, 'the repair-round mark must be admitted at STOPPED and exit 0 once the gate is green: ' + m.stdout + m.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'a green re-run at the same iteration must continue to REVIEWER, not stay stopped: ' + m.stdout)
})

test('AC-20261029-07-5: a gate that stays red after the one repair round keeps STOPPED, prints repair round spent (1 of 1), and refuses a second repair-round with exit 2', () => {
  const { host } = redGateHost('stopped-rr-red')
  run(host.root, host.spec, '--mark', 'repair-round')
  assert.strictEqual(stateOf(host.root, host.spec), 'STOPPED',
    'a still-red gate must land STOPPED again, never advance past a blocking leg')
  const step = run(host.root, host.spec).stdout
  assert.match(step, /repair round spent \(1 of 1\)/,
    'the second stop must say the one round is spent, or the owner retries a loop that cannot succeed: ' + step)
  const second = run(host.root, host.spec, '--mark', 'repair-round')
  assert.strictEqual(second.status, 2,
    'a second repair-round must be refused with exit 2 — an uncapped retry lets a flapping gate loop forever: ' + second.stdout + second.stderr)
})

// Drives a host to the fix cap with TWO hard survivors in the final pool; leaves the run at ESCALATE.
function escalateWithTwoHard(name) {
  const host = makeHost(name)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: green legs must reach REVIEWER')
  const both = [
    { ref: 's0', recommended: 'fix', reason: 'fix it' },
    { ref: 's1', recommended: 'fix', reason: 'fix it' },
  ]
  for (let cycle = 1; cycle <= 3; cycle++) {
    run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(name + '-r' + cycle, twoHardReturn()))
    const d = run(host.root, host.spec, '--mark', 'dispositions', '--file', disposerFile(name + '-d' + cycle, both),
      '--waived', '0', '--rejected', '0', '--fix-dispatched', '2')
    assert.strictEqual(stateOf(host.root, host.spec), 'FIX', `setup cycle ${cycle}: two fix dispositions must land FIX: ` + d.stdout + d.stderr)
    fs.writeFileSync(path.join(host.root, 'src/foo.js'), `module.exports = () => 42 // cycle ${cycle}\n`)
    const f = run(host.root, host.spec, '--mark', 'fix-applied')
    if (cycle < 3) assert.strictEqual(f.status, 0, `setup cycle ${cycle}: fix-applied within the cap must succeed: ` + f.stdout + f.stderr)
  }
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE', 'setup precondition: the third fix-applied must park the run at ESCALATE')
  return host
}

test('AC-20261029-07-6: the ESCALATE step with two open hard findings lists both and prints one AskUserQuestion with the four options', () => {
  const host = escalateWithTwoHard('stopped-rr-esc')
  const step = run(host.root, host.spec).stdout
  assert.match(step, /open findings \(2\):/, 'the step must count the open pool so the owner sees what an abandon leaves behind: ' + step)
  assert.match(step, /\bs0\b/, 'the first open finding must be listed by its ref: ' + step)
  assert.match(step, /\bs1\b/, 'the second open finding must be listed by its ref: ' + step)
  assert.match(step, /AskUserQuestion/, 'without the question instruction the capped review stays a bare stop: ' + step)
  assert.match(step, /abandon and queue \/spec:fix \(Recommended\)/, 'the recommended exit must be named: ' + step)
  assert.match(step, /waive all and close/, 'the waive-all option must be offered: ' + step)
  assert.match(step, /reject with evidence/, 'the reject option must be offered: ' + step)
  assert.match(step, /re-plan/, 'the re-plan option must be offered: ' + step)
})

test('AC-20261029-07-7: a review whose disposer return waives one hard finding closes with the recorded notice and never asks to confirm in the close report', () => {
  const host = makeHost('stopped-rr-waive')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('stopped-rr-waive-r', oneHardReturn()))
  const d = run(host.root, host.spec, '--mark', 'dispositions',
    '--file', disposerFile('stopped-rr-waive-d', [{ ref: 's0', recommended: 'waive', reason: 'sanctioned by the spec' }]),
    '--waived', '1', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(d.status, 0, 'setup precondition: a waive disposition must be accepted: ' + d.stdout + d.stderr)
  const out = run(host.root, host.spec).stdout
  assert.match(out, /1 finding\(s\) waived at DISPOSITIONS \(recorded\)/,
    'the close step must report the waive as already recorded: ' + out)
  assert.doesNotMatch(out, /confirm in the close report/,
    'the user already approved the waive at DISPOSITIONS; asking again is a redundant confirmation: ' + out)
})
