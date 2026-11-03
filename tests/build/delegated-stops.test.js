'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, runNode, laneMarkerPath } = require('../helpers')
const { makeHost, makeNoTestsHost, run, stateOf, testFileContent } = require('./build-driver.fixtures')

// specs/20261102/02-a-delegated-driver-stops-on-disk.md D4 — the build driver, run inside a child
// session, writes its ESCALATE and critical-tier RED_FINDINGS asks to
// .claude/pending-question.json instead of printing an AskUserQuestion instruction.

const DRIVER = 'scripts/spec-build-driver.js'
const DRIVER_ABS = path.join(SPEC, DRIVER)
// A lane is a plugin-owned fact: the marker in the lane's private git dir, never an environment variable.
const runD = (root, spec, ...args) => { fs.writeFileSync(laneMarkerPath(root), ''); return runNode(DRIVER, [spec, ...args], { cwd: root }) }
const pendingOf = (root) => path.join(root, '.claude', 'pending-question.json')
const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' })

// A no-tests host whose gate is red every run and prints, per run, the next line of counts.txt;
// four repair rounds park it at ESCALATE with no escalateChoice.
function escalatedHost(lines) {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'gate.sh'),
    '#!/usr/bin/env bash\nline=$(head -1 counts.txt)\nsed -i 1d counts.txt\necho "$line"\nexit 1\n')
  fs.writeFileSync(path.join(host.root, 'counts.txt'), lines.join('\n') + '\n')
  git(host.root, 'add', '-A'); git(host.root, 'commit', '-q', '-m', 'counting gate')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  run(host.root, host.spec, '--mark', 'integrated')
  for (let i = 1; i <= 3; i++) run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE', 'setup precondition: a refused fourth repair-applied must park the run at ESCALATE')
  return host
}
const SHRINKING = ['ℹ fail 20', 'ℹ fail 9', 'ℹ fail 4', 'ℹ fail 2']

test('AC-20261102-02-11: a delegated ESCALATE with no choice writes a build-escalate file whose four options resume through the escalate-choice mark, and prints PENDING_QUESTION', () => {
  const host = escalatedHost(SHRINKING)
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'the delegated stop exits 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /PENDING_QUESTION/, 'the stop line must print: ' + r.stdout)
  assert.ok(fs.existsSync(pendingOf(host.root)), 'the question must land on disk or the parent has nothing to relay')
  const doc = JSON.parse(fs.readFileSync(pendingOf(host.root), 'utf8'))
  assert.strictEqual(doc.kind, 'build-escalate', 'the kind must be build-escalate')
  const opts = doc.questions[0].options
  assert.strictEqual(opts.length, 4, 'all four exits must be offered: ' + JSON.stringify(opts))
  assert.strictEqual(opts[0].label, 're-arm one more round (Recommended when shrinking)', 'a shrinking trend recommends re-arm')
  assert.deepStrictEqual(opts.map((o) => o.resume),
    ['re-arm', 'cold', 'park', 'amend'].map((c) => `node ${DRIVER_ABS} ${host.spec} --mark escalate-choice ${c}`),
    'each option must resume through the mark that already carries its answer')
})

// The file a delegated ESCALATE writes, authored by hand so the bare-run contract is exercised
// apart from the writer.
function seedEscalatePending(host, extra = {}) {
  const doc = {
    schemaVersion: 1, kind: 'build-escalate', stage: 'build', state: 'ESCALATE', spec: host.spec,
    writtenAt: '2026-11-02T10:00:00Z',
    questions: [{
      id: 'q1', header: 'Build cap', question: 'The build hit its repair cap. What should the lane do?',
      options: [{ label: 'park and queue a /spec:fix', description: 'The build stays parked; the queue\'s top item becomes the repair of this spec',
        resume: `node ${DRIVER_ABS} ${host.spec} --mark escalate-choice park` }],
    }],
    answers: null, dismissed: null, ...extra,
  }
  fs.mkdirSync(path.join(host.root, '.claude'), { recursive: true })
  fs.writeFileSync(pendingOf(host.root), JSON.stringify(doc))
  return doc
}

test('AC-20261102-02-13: bare build re-runs while the pending file is unanswered print the waiting line identically and leave the file and sidecar byte-identical', () => {
  const host = escalatedHost(SHRINKING)
  seedEscalatePending(host)
  const stateFile = path.join(host.spec.replace(/\.md$/, '.build'), 'build-state.json')
  const fileBefore = fs.readFileSync(pendingOf(host.root), 'utf8')
  const stateBefore = fs.readFileSync(stateFile, 'utf8')
  const outs = [1, 2, 3].map(() => runD(host.root, host.spec))
  for (const r of outs) {
    assert.strictEqual(r.status, 0, 'waiting is not a failure: ' + r.stdout + r.stderr)
    assert.ok(r.stdout.includes('## PENDING_QUESTION — waiting for the parent session: ' + pendingOf(host.root)), 'the waiting line must name the file: ' + r.stdout)
  }
  assert.strictEqual(new Set(outs.map((r) => r.stdout)).size, 1, 're-runs must print identical output, not re-ask')
  assert.strictEqual(fs.readFileSync(pendingOf(host.root), 'utf8'), fileBefore, 'waiting must not touch the file')
  assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), stateBefore, 'waiting must not touch the sidecar')
})

test('AC-20261102-02-15: a bare build run on a dismissed file consumes it, prints the STOPPED line forever, and a mark is refused naming dismissedStop and the delete remedy', () => {
  const host = escalatedHost(SHRINKING)
  seedEscalatePending(host, { dismissed: { at: '2026-11-02T10:06:00Z' } })
  const LINE = '## STOPPED — the question was dismissed; the run ends (core § Decisions)'
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a dismissal is a clean stop: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes(LINE), 'the dismissal line must print: ' + r.stdout)
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'the dismissed file is consumed on sight')
  assert.ok(runD(host.root, host.spec).stdout.includes(LINE), 'every later bare run must re-print the line, or the lane resumes a dismissed run')
  const refused = runD(host.root, host.spec, '--mark', 'escalate-choice', 'park')
  assert.strictEqual(refused.status, 2, 'a mark after a dismissal must be refused: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr, /dismissedStop/, 'the refusal must name the mark: ' + refused.stderr)
  assert.ok(refused.stderr.includes('delete ' + host.spec.replace(/\.md$/, '.build') + ' to restart'), 'the refusal must name the remedy command: ' + refused.stderr)
})

test('AC-20261102-02-19: an in-session ESCALATE with no choice still prints the ask with the four options and the escalate-choice mark line, and writes no pending file', () => {
  const host = escalatedHost(SHRINKING)
  const step = run(host.root, host.spec).stdout
  assert.match(step, /Ask ONE AskUserQuestion/, 'a session that never delegates must keep today\'s ask: ' + step)
  for (const opt of ['re-arm one more round', 'restart cold', 'park and queue a /spec:fix', 'amend the spec']) {
    assert.ok(step.includes(opt), 'option "' + opt + '" must still print: ' + step)
  }
  assert.ok(step.includes('--mark escalate-choice <re-arm|cold|park|amend>'), 'the mark line must still print: ' + step)
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'an in-session run must write no pending file')
})

test('AC-20261102-02-12: a delegated critical-tier unsanctioned-green writes a red-findings file with the removal first and prints PENDING_QUESTION', () => {
  const host = makeHost()
  fs.writeFileSync(host.spec, fs.readFileSync(host.spec, 'utf8').replace('tier: standard', 'tier: critical'))
  run(host.root, host.spec)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(42))
  const m = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_FINDINGS',
    'setup precondition: a green test on the pre-image must stop at RED_FINDINGS: ' + m.stdout + m.stderr)
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'the delegated stop exits 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /PENDING_QUESTION/, 'the stop line must print: ' + r.stdout)
  const doc = JSON.parse(fs.readFileSync(pendingOf(host.root), 'utf8'))
  assert.strictEqual(doc.kind, 'red-findings', 'the kind must be red-findings')
  const opts = doc.questions[0].options
  assert.deepStrictEqual(opts.map((o) => o.label),
    ['remove the AC-ID mention (Recommended)', 'rewrite the test red', 'pause the build'], 'the three options lead with the recommended removal')
  assert.deepStrictEqual(opts.map((o) => o.resume),
    [`edit then node ${DRIVER_ABS} ${host.spec}`, `edit then node ${DRIVER_ABS} ${host.spec}`, 'stop'],
    'the edit options re-run the driver and pause ends the lane')
})
