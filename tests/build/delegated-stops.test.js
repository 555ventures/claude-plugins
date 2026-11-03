'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, runNode } = require('../helpers')
const { makeHost, makeNoTestsHost, run, stateOf, testFileContent } = require('./build-driver.fixtures')

// specs/20261102/02-a-delegated-driver-stops-on-disk.md D4 — the build driver, run inside a child
// session, writes its ESCALATE and critical-tier RED_FINDINGS asks to
// .claude/pending-question.json instead of printing an AskUserQuestion instruction.

const DRIVER = 'scripts/spec-build-driver.js'
const DRIVER_ABS = path.join(SPEC, DRIVER)
const runD = (root, spec, ...args) => runNode(DRIVER, [spec, ...args], { cwd: root, env: { CLAUDE_CODE_CHILD_SESSION: '1' } })
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
