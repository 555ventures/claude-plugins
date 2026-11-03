'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, runNode } = require('../helpers')
const esc = require('./escalate-row.fixtures')
const drv = require('./review-driver.fixtures')

// specs/20261102/02-a-delegated-driver-stops-on-disk.md D3/D5 — the review driver, run inside a
// child session, writes each judgment stop to .claude/pending-question.json instead of printing
// an AskUserQuestion instruction, resumes from the answered file, and parks at MERGE_READY.

const DRIVER = esc.DRIVER
const DRIVER_ABS = path.join(SPEC, DRIVER)
const CHILD = { CLAUDE_CODE_CHILD_SESSION: '1' }
const runD = (root, spec, ...args) => runNode(DRIVER, [spec, ...args], { cwd: root, env: CHILD })
const runPlain = (root, spec, ...args) => runNode(DRIVER, [spec, ...args], { cwd: root })
const pendingOf = (root) => path.join(root, '.claude', 'pending-question.json')
const readPending = (root) => JSON.parse(fs.readFileSync(pendingOf(root), 'utf8'))
const stateFile = (host) => path.join(host.sidecar, 'review-state.json')
const readMarks = (host) => JSON.parse(fs.readFileSync(stateFile(host), 'utf8'))
const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' })

const HARD = (claim, line) => ({ severity: 'hard', claim, file: 'src/foo.js', line, impact: 'x', evidence: 'x' })
const twoHardReturn = () => ({
  verdict: 'CLEAN', survivors: [HARD('first claim', 1), HARD('second claim', 2)],
  killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10,
})
const REPAIR = 'run one in-session repair round (Recommended)'

// A host whose committed suite fails: the first bare run lands STOPPED with the round unspent.
function redGateHost(name) {
  const host = esc.makeHost(name)
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 0\n')
  git(host.root, 'add', '-A'); git(host.root, 'commit', '-q', '-m', 'break foo')
  const r = runPlain(host.root, host.spec)
  assert.strictEqual(esc.stateOf(host.root, host.spec), 'STOPPED',
    'setup precondition: a failing committed suite must hard-stop LEGS into STOPPED: ' + r.stdout + r.stderr)
  host.firstStep = r.stdout
  return host
}

// The file a delegated STOPPED writes, authored by hand so the bare-run contract is exercised
// apart from the writer: answers/dismissed are the parent's to set.
function seedRepairPending(host, extra = {}) {
  const doc = {
    schemaVersion: 1, kind: 'repair-round', stage: 'review', state: 'STOPPED', spec: host.specRel,
    writtenAt: '2026-11-02T10:00:00Z',
    questions: [{
      id: 'q1', header: 'Review stop', question: 'A blocking review leg went red. What should the lane do?',
      options: [{ label: REPAIR, description: 'The lane fixes the failing leg and re-runs the legs; red again lands here with the round spent',
        resume: `node ${DRIVER_ABS} ${host.spec} --mark repair-round` }],
    }],
    answers: null, dismissed: null, ...extra,
  }
  fs.mkdirSync(path.join(host.root, '.claude'), { recursive: true })
  fs.writeFileSync(pendingOf(host.root), JSON.stringify(doc))
  return doc
}

test('AC-20261102-02-6: a delegated STOPPED with the repair round unspent writes a repair-round file with the three options and prints PENDING_QUESTION in place of the ask', () => {
  const host = redGateHost('dlg-stopped')
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'the delegated stop must exit 0 so the lane ends cleanly: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(pendingOf(host.root)), 'the question must land on disk or the parent has nothing to relay: ' + r.stdout)
  const doc = readPending(host.root)
  assert.strictEqual(doc.kind, 'repair-round', 'the kind is the closed-set key a parent matches standing answers on')
  const opts = doc.questions[0].options
  assert.strictEqual(opts.length, 3, 'repair, queue and abandon must all be offered: ' + JSON.stringify(opts))
  assert.strictEqual(opts[0].label, REPAIR, 'the recommended option leads')
  assert.strictEqual(opts[0].resume, `node ${DRIVER_ABS} ${host.spec} --mark repair-round`,
    'the resume line is what the lane runs after an affirmative answer')
  assert.ok(r.stdout.includes('## PENDING_QUESTION — repair-round written to ' + pendingOf(host.root)),
    'the stop line is the contract the parent session greps for: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /AskUserQuestion/, 'the sub-agent has no such tool; naming it sends the worker improvising: ' + r.stdout)
  for (const opt of [opts[1], opts[2]]) {
    assert.ok(host.firstStep.includes(opt.then),
      'the then line of "' + opt.label + '" must be byte-equal to the in-session text it mirrors, or the two forms drift: ' + opt.then)
  }
})

test('AC-20261102-02-17: an in-session STOPPED with the round unspent still prints the ask with its three options and writes no pending file', () => {
  const host = redGateHost('dlg-stopped-plain')
  const step = runPlain(host.root, host.spec).stdout
  assert.match(step, /Ask ONE AskUserQuestion/, 'a session that never delegates must keep today\'s ask: ' + step)
  for (const opt of ['run one in-session repair round (Recommended)', 'queue /spec:fix and stop', 'abandon the review']) {
    assert.ok(step.includes(opt), 'option "' + opt + '" must still print: ' + step)
  }
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'an in-session run must write no pending file, or it blocks later runs')
})

test('AC-20261102-02-7: a delegated dispositions mark with an unanswered waive writes one dispositions question and changes no mark; once answered the same mark rewrites the return and proceeds', () => {
  const host = esc.makeHost('dlg-disp')
  esc.run(host.root, host.spec)
  esc.run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', esc.returnFileWith('dlg-disp-r', twoHardReturn()))
  const ret = esc.returnFileWith('dlg-disp-d', { verdict: 'DISPOSED', tokens: 1, dispositions: [
    { ref: 's0', recommended: 'waive', reason: 'sanctioned by the spec' },
    { ref: 's1', recommended: 'fix', reason: 'fix it' },
  ] })
  const before = fs.readFileSync(stateFile(host), 'utf8')
  const r = runD(host.root, host.spec, '--mark', 'dispositions', '--file', ret)
  assert.strictEqual(r.status, 0, 'the delegated mark must hand the question up with exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /PENDING_QUESTION/, 'the stop line must print: ' + r.stdout)
  const doc = readPending(host.root)
  assert.strictEqual(doc.kind, 'dispositions', 'the kind must be dispositions')
  assert.deepStrictEqual(doc.questions.map((q) => q.id), ['s0'], 'only the waive entry is a user decision; a fix entry is never asked')
  assert.deepStrictEqual(doc.questions[0].options.map((o) => o.label), ['accept waive (Recommended)', 'fix instead', 'reject instead'],
    'the three fates must be offered with the recommendation first')
  assert.strictEqual(fs.readFileSync(stateFile(host), 'utf8'), before, 'an unanswered stop must change no mark, or a re-run double-counts')

  doc.answers = { s0: { label: 'reject instead', by: 'user', at: '2026-11-02T10:05:00Z' } }
  fs.writeFileSync(pendingOf(host.root), JSON.stringify(doc))
  const again = runD(host.root, host.spec, '--mark', 'dispositions', '--file', ret)
  assert.strictEqual(again.status, 0, 'the answered mark must proceed as today: ' + again.stdout + again.stderr)
  const s0 = JSON.parse(fs.readFileSync(ret, 'utf8')).dispositions.find((d) => d.ref === 's0')
  assert.strictEqual(s0.final, 'reject', 'the chosen fate must land as final in the return file')
  assert.strictEqual(s0.overriddenBy, 'user', 'a differing final needs the user override marker the driver already demands')
  assert.strictEqual(s0.overrideReason, 'answered through the delegated stop by user', 'the override reason must name the delegated stop')
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'the answered file must be consumed, not left to re-answer')
  assert.strictEqual(esc.stateOf(host.root, host.spec), 'FIX', 'the remaining fix entry must land the run where today\'s mark reaches')
})

test('AC-20261102-02-7: a delegated dispositions mark whose waive reason quotes two backticked identifiers still writes the pending file and prints PENDING_QUESTION', () => {
  const host = esc.makeHost('dlg-disp-ticks')
  esc.run(host.root, host.spec)
  esc.run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', esc.returnFileWith('dlg-disp-ticks-r', twoHardReturn()))
  const ret = esc.returnFileWith('dlg-disp-ticks-d', { verdict: 'DISPOSED', tokens: 1, dispositions: [
    { ref: 's0', recommended: 'waive', reason: 'the `===` check in `src/foo.js` is sanctioned by D2' },
    { ref: 's1', recommended: 'fix', reason: 'fix it' },
  ] })
  const r = runD(host.root, host.spec, '--mark', 'dispositions', '--file', ret)
  assert.strictEqual(r.status, 0, 'a disposer reason with code identifiers must not make the question gate refuse the relay: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /PENDING_QUESTION/, 'the stop line must print: ' + r.stdout)
  assert.ok(fs.existsSync(pendingOf(host.root)), 'the question must be written even when the reason is full of identifiers')
})

// Drives a host to the fix cap with two hard survivors in the final pool; leaves the run at ESCALATE.
function escalateHost(name) {
  const host = esc.makeHost(name)
  esc.run(host.root, host.spec)
  const both = [{ ref: 's0', recommended: 'fix', reason: 'fix it' }, { ref: 's1', recommended: 'fix', reason: 'fix it' }]
  for (let cycle = 1; cycle <= 3; cycle++) {
    esc.run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', esc.returnFileWith(name + '-r' + cycle, twoHardReturn()))
    esc.run(host.root, host.spec, '--mark', 'dispositions',
      '--file', esc.returnFileWith(name + '-d' + cycle, { verdict: 'DISPOSED', dispositions: both, tokens: 1 }),
      '--waived', '0', '--rejected', '0', '--fix-dispatched', '2')
    fs.writeFileSync(path.join(host.root, 'src/foo.js'), `module.exports = () => 42 // cycle ${cycle}\n`)
    esc.run(host.root, host.spec, '--mark', 'fix-applied')
  }
  assert.strictEqual(esc.stateOf(host.root, host.spec), 'ESCALATE', 'setup precondition: the third fix-applied must park the run at ESCALATE')
  return host
}

test('AC-20261102-02-8: a delegated ESCALATE writes a review-escalate file whose options resume through the dispositions mark, a delete of the sidecar, and a queue add', () => {
  const host = escalateHost('dlg-esc')
  const plainStep = runPlain(host.root, host.spec).stdout
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'the delegated stop exits 0: ' + r.stdout + r.stderr)
  const doc = readPending(host.root)
  assert.strictEqual(doc.kind, 'review-escalate', 'the kind must be review-escalate')
  const [waive, abandon, replan] = doc.questions[0].options
  assert.strictEqual(waive.label, 'waive or reject everything through the disposer (Recommended)', 'the recommended exit leads')
  assert.ok(waive.resume.includes('--mark dispositions'), 'the first option resumes through the dispositions mark: ' + waive.resume)
  assert.strictEqual(abandon.label, 'abandon', 'abandon must be offered')
  assert.strictEqual(abandon.resume, 'stop', 'abandon ends the lane')
  assert.ok(abandon.then.includes(path.basename(host.sidecar)), 'abandon must name the sidecar to delete: ' + abandon.then)
  assert.strictEqual(replan.label, 're-plan', 're-plan must be offered')
  assert.strictEqual(replan.resume, 'stop', 're-plan ends the lane')
  assert.ok(replan.then.startsWith('node "$(spec-paths spec-queue)" add'), 're-plan queues the spec: ' + replan.then)
  for (const opt of [abandon, replan]) {
    assert.ok(plainStep.includes(opt.then),
      'the then line of "' + opt.label + '" must be byte-equal to the in-session text it mirrors, or the two forms drift: ' + opt.then)
  }
})

// A closed review parked at MERGE with a real spec branch at the main root.
function mergeHost(name) {
  const host = esc.makeWorktreeHost({ name, ignoreStopped: false })
  const { root, wt, spec, specRel } = host
  esc.run(wt, spec)
  assert.strictEqual(esc.stateOf(wt, spec), 'REVIEWER', 'setup precondition: green legs must reach REVIEWER')
  esc.run(wt, spec, '--mark', 'reviewer-returned', '--file', esc.returnFileWith(name + '-r', drv.CLEAN_RETURN))
  esc.run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(esc.stateOf(wt, spec), 'CLOSE', 'setup precondition: a clean disposition must reach CLOSE')
  git(wt, 'add', specRel, 'tests/foo.test.js'); git(wt, 'commit', '-q', '-m', 'close')
  const closed = esc.run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'setup: closed must succeed: ' + closed.stdout + closed.stderr)
  assert.strictEqual(esc.stateOf(wt, spec), 'MERGE', 'setup precondition: a closed spec lands MERGE')
  return host
}

test('AC-20261102-02-9: a delegated review at MERGE prints MERGE_READY, exits 0, runs no inspect and does not conclude the merge', () => {
  const host = mergeHost('dlg-merge')
  const r = runD(host.wt, host.spec)
  assert.strictEqual(r.status, 0, 'the parked merge exits 0: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes(`## MERGE_READY — ${host.specRel} is closed on spec/dlg-merge; the parent session runs the merge from ${host.root}`),
    'the parent session needs this exact line to know where to merge from: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /RECOMMEND:|Step: merge strategy/, 'inspect output means the lane tried to merge from inside its own worktree: ' + r.stdout)
  assert.ok(!readMarks({ sidecar: host.sidecar }).mergeConcluded, 'MERGE_READY must not record the merge as done')
})

test('AC-20261102-02-18: an in-session review at MERGE still prints the merge-strategy step with the inspect recommendation and the merge-strategy mark line', () => {
  const host = mergeHost('dlg-merge-plain')
  const step = runPlain(host.root, host.spec).stdout
  assert.match(step, /## Step: merge strategy/, 'the in-session merge step must be unchanged: ' + step)
  assert.match(step, /RECOMMEND: \S+/, 'inspect must still run and recommend a strategy: ' + step)
  assert.match(step, /--mark merge-strategy/, 'the mark line must still print: ' + step)
})

test('AC-20261102-02-10: a delegated review whose spec branch does not exist still concludes MERGE straight to DONE', () => {
  const host = drv.makeReplayHost('dlgskip', { acId: 'AC-20260820-99-40' })
  drv.driveToClose(host, 'dlgskip-ret')
  drv.commitClose(host)
  const r = runD(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0, 'the skipped merge must still close: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /review ran on the originating branch — MERGE skipped/, 'the DONE note must still say the merge was skipped: ' + r.stdout)
})

test('AC-20261102-02-13: bare re-runs while the pending file is unanswered print the waiting line identically and leave the file and sidecar byte-identical', () => {
  const host = redGateHost('dlg-wait')
  seedRepairPending(host)
  const fileBefore = fs.readFileSync(pendingOf(host.root), 'utf8')
  const stateBefore = fs.readFileSync(stateFile(host), 'utf8')
  const outs = [1, 2, 3].map(() => runD(host.root, host.spec))
  for (const r of outs) {
    assert.strictEqual(r.status, 0, 'waiting is not a failure: ' + r.stdout + r.stderr)
    assert.ok(r.stdout.includes('## PENDING_QUESTION — waiting for the parent session: ' + pendingOf(host.root)), 'the waiting line must name the file: ' + r.stdout)
  }
  assert.strictEqual(new Set(outs.map((r) => r.stdout)).size, 1, 'a re-run must be idempotent output, not a re-ask')
  assert.strictEqual(fs.readFileSync(pendingOf(host.root), 'utf8'), fileBefore, 'waiting must not touch the file')
  assert.strictEqual(fs.readFileSync(stateFile(host), 'utf8'), stateBefore, 'waiting must not touch the sidecar')
})

test('AC-20261102-02-14: a bare run on a fully answered file prints the resume step, consumes the file, appends marks.answered, and the next run prints the normal STOPPED step', () => {
  const host = redGateHost('dlg-answered')
  const doc = seedRepairPending(host)
  doc.answers = { q1: { label: REPAIR, by: 'standing', at: '2026-11-02T10:05:00Z' } }
  fs.writeFileSync(pendingOf(host.root), JSON.stringify(doc))
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'the resume print exits 0: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes('## Step: resume — repair-round'), 'the resume heading must name the kind: ' + r.stdout)
  assert.ok(r.stdout.includes('q1: ' + REPAIR + ' (by standing)'), 'each answer must be listed with who gave it: ' + r.stdout)
  assert.ok(r.stdout.includes(`node ${DRIVER_ABS} ${host.spec} --mark repair-round`), 'the chosen option\'s resume line must print: ' + r.stdout)
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'the file is consumed in the same invocation (terminal means gone)')
  const answered = readMarks(host).answered
  assert.ok(Array.isArray(answered) && answered.length === 1, 'marks.answered must record the answer once: ' + JSON.stringify(answered))
  assert.strictEqual(answered[0].kind, 'repair-round', 'the record names the kind')
  assert.deepStrictEqual(answered[0].answers, doc.answers, 'the record keeps the answers verbatim')
  const next = runD(host.root, host.spec).stdout
  assert.match(next, /## STOPPED — a blocking leg is red/, 'the following run returns to the state\'s normal step: ' + next)
  assert.doesNotMatch(next, /PENDING_QUESTION/, 'an answered stop must not be re-asked by a delegated re-run, or the lane loops on the same question: ' + next)
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'an answered stop must not write a fresh pending file')
})

test('AC-20261102-02-15: a bare run on a dismissed file consumes it, records dismissedStop, prints the STOPPED line forever, and the repair-round mark is refused naming the remedy', () => {
  const host = redGateHost('dlg-dismissed')
  seedRepairPending(host, { dismissed: { at: '2026-11-02T10:06:00Z' } })
  const LINE = '## STOPPED — the question was dismissed; the run ends (core § Decisions)'
  const r = runD(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a dismissal is a clean stop: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes(LINE), 'the dismissal line must print: ' + r.stdout)
  assert.ok(!fs.existsSync(pendingOf(host.root)), 'the dismissed file is consumed on sight')
  const mark = readMarks(host).dismissedStop
  assert.ok(mark && mark.kind === 'repair-round' && typeof mark.at === 'string', 'the sidecar must remember the dismissal: ' + JSON.stringify(mark))
  assert.ok(runD(host.root, host.spec).stdout.includes(LINE), 'every later bare run must re-print the line from the mark, or the lane resumes a dismissed run')
  const refused = runD(host.root, host.spec, '--mark', 'repair-round')
  assert.strictEqual(refused.status, 2, 'a mark after a dismissal must be refused: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr, /dismissedStop/, 'the refusal must name the mark: ' + refused.stderr)
  assert.match(refused.stderr, /delete \S*\.review\S* to restart/, 'the refusal must name the remedy: ' + refused.stderr)
})
