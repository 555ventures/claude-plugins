'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode } = require('../helpers')
const { fanoutHost, askBlocks, specRel, LANE_AGENT, repairRoundDoc, dispositionsDoc, redFindingsDoc } = require('./fixture')

// specs/20261102/03-one-session-runs-the-lanes.md D3-D10, D4a: AC-20261102-03-5 .. -18, -21, -22; specs/20261103/04 AC-12 .. -15 —
// fanout-driver.js is driven end to end against a synthetic host (tests/fanout/fixture.js); every
// state is reached through the driver's own marks and read back from its state file.

const S03 = specRel('03-x')
const S04 = specRel('04-z')
const S06 = specRel('06-y')
const bytes = (file) => fs.readFileSync(file, 'utf8')

test('AC-20261102-03-5 / AC-20261103-04-12: a bare run with no state file prints the PLAN step with the lane table, the parked line and the planned mark, writes every lane planned with policyPicks [] and no standing key, and --state moves from PLAN to DISPATCH at the mark', () => {
  const h = fanoutHost({ parked: true })
  const parkedWt = h.startLane('05-p')
  const before = h.run(['--state'])
  assert.strictEqual(before.status, 0, '--state must answer before any file exists: ' + before.stderr)
  assert.match(before.stdout, /\bPLAN\b/, '--state with no file must say PLAN, or a resumed session cannot tell nothing has started: ' + before.stdout)
  assert.ok(!fs.existsSync(h.stateFile), '--state must not create the state file, or asking where we are starts a fan-out')
  const r = h.run()
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes('[fanout-driver] state: PLAN  root: ' + h.root), 'the first line names the state and root: ' + r.stdout)
  assert.ok(r.stdout.includes('## Step: plan the lanes'), 'the PLAN step header must print: ' + r.stdout)
  assert.match(r.stdout, /L1\s+specs\/20261102\/03-x\.md\s+brief 32\s+spec\/03-x/, 'the table must carry one row per lane with spec, brief and branch: ' + r.stdout)
  assert.match(r.stdout, /L2\s+specs\/20261102\/04-z\.md\s+brief 33\s+spec\/04-z/, 'the second lane row must print: ' + r.stdout)
  assert.ok(r.stdout.includes('⏸ specs/20261102/05-p.md parked in ' + parkedWt + ' — finish it there in-session'),
    'a lane whose branch lives in a linked worktree must print the hand command and never be dispatched: ' + r.stdout)
  assert.match(r.stdout, /Then: node .*fanout-driver.* --mark planned/, 'the step must end with the one mark that admits the table: ' + r.stdout)
  const st = h.state()
  assert.deepStrictEqual(st.lanes.map((l) => [l.id, l.spec, l.state]), [['L1', S03, 'planned'], ['L2', S04, 'planned']],
    'the file must hold exactly the two unparked lanes, all planned: ' + JSON.stringify(st.lanes))
  assert.ok(st.lanes.every((l) => Array.isArray(l.policyPicks) && l.policyPicks.length === 0), 'every lane must start with an empty policyPicks, or the REPORT trail has nowhere to collect picks: ' + JSON.stringify(st.lanes))
  assert.ok(!('standing' in st) && st.lanes.every((l) => !('standingApplied' in l)), 'the state must carry no standing sheet or standingApplied, or a retired answer path is still live: ' + JSON.stringify(st))
  h.must(['--mark', 'planned'])
  const after = h.run(['--state'])
  assert.match(after.stdout, /\bDISPATCH\b/, '--state after the planned mark must say DISPATCH, or the session waits on a sheet nobody prints: ' + after.stdout)
})

test('AC-20261102-03-6: the driver exits 2 with its remedy from a linked worktree, for an unknown mark and for an unknown lane, and leaves the state file unchanged', () => {
  const h = fanoutHost()
  h.plan()
  const linked = h.startLane('03-x')
  const before = bytes(h.stateFile)
  const cases = [
    [h.run([], { cwd: linked }), 'fanout-driver: run from the main worktree — cd ' + h.root],
    [h.run(['--mark', 'x']), 'fanout-driver: unknown mark "x"'],
    [h.run(['--mark', 'merged', '--lane', 'L9']), 'fanout-driver: no lane L9 in the table'],
  ]
  for (const [r, msg] of cases) {
    assert.strictEqual(r.status, 2, 'a refusal must exit 2: ' + msg + ' :: ' + r.stdout)
    assert.ok(r.stderr.includes(msg), 'stderr must carry "' + msg + '", or the user is not told the remedy: ' + r.stderr)
    assert.strictEqual(bytes(h.stateFile), before, 'a refused run must leave the state file byte-identical, or a typo corrupts the table')
  }
})

test('AC-20261102-03-7: --lanes 1 admits only the first lane', () => {
  const h = fanoutHost()
  h.must(['--lanes', '1'])
  assert.deepStrictEqual(h.state().lanes.map((l) => l.spec), [S03], 'a cap of one must table exactly 03-x, or the user\'s concurrency limit is ignored')
})

test('AC-20261102-03-7: --override-serial admits the shared-brief sibling beside the lanes and never a spec whose brief depends on a running one', () => {
  const h = fanoutHost({ dependent: true })
  h.must(['--override-serial', '--lanes', '4'])
  const specs = h.state().lanes.map((l) => l.spec).sort()
  assert.deepStrictEqual(specs, [S03, S04, S06].sort(), 'the override must add 06-y (shared brief 32) and nothing that waits on a brief dependency: ' + specs.join(','))
  assert.ok(!specs.includes(specRel('07-d')), 'a spec whose brief depends on brief 32 must never be forced into a lane, or it builds on an unfinished dependency')
})

test('AC-20261102-03-7: --include-fixes appends fix lanes F1 and F2 with their branches after the run lanes', () => {
  const h = fanoutHost({ fixes: true })
  h.must(['--include-fixes'])
  const lanes = h.state().lanes
  const f1 = lanes.find((l) => l.id === 'F1')
  const f2 = lanes.find((l) => l.id === 'F2')
  assert.ok(f1 && f2, 'the queued fix and the CI escape must each become a fix lane: ' + JSON.stringify(lanes.map((l) => l.id)))
  assert.deepStrictEqual([f1.kind, f1.branch, f1.queueId], ['fix', 'fix/q107', 'q107'], 'F1 is the queued item: ' + JSON.stringify(f1))
  assert.deepStrictEqual([f2.kind, f2.branch, f2.ci], ['fix', 'fix/ci-deadbee', 'deadbee'], 'F2 is the CI escape named by the red row\'s short sha: ' + JSON.stringify(f2))
  assert.deepStrictEqual(lanes.filter((l) => l.kind === 'run').map((l) => l.id), ['L1', 'L2'], 'run lanes keep their L ids ahead of the fix lanes')
})

test('AC-20261102-03-21: an explicit --spec list tables the startable specs in the order given, prints the unknown one as excluded, records the list as given, and holds the shared-brief one back', () => {
  const h = fanoutHost()
  const nope = specRel('nope')
  const r = h.must(['--spec', S04, '--spec', S03, '--spec', S06, '--spec', nope])
  const st = h.state()
  const planned = st.lanes.filter((l) => l.state === 'planned')
  assert.deepStrictEqual(planned.map((l) => [l.id, l.spec]), [['L1', S04], ['L2', S03]], 'only the startable specs are admitted, in the order given: ' + JSON.stringify(st.lanes))
  const y = st.lanes.find((l) => l.spec === S06)
  assert.ok(!y || y.state === 'waiting', '06-y shares brief 32 with a listed lane and must wait for it (D4), never be planned alongside: ' + JSON.stringify(y))
  assert.ok(r.stdout.includes('⛔ ' + nope + ' — not a startable lane'), 'an unknown spec must print as excluded with the reason: ' + r.stdout)
  assert.deepStrictEqual(st.options.specs, [S04, S03, S06, nope], 'options.specs records the --spec list as given, or a resumed session loses the user\'s selection')
})

test('AC-20261102-03-21: --override-serial lets an explicitly listed shared-brief spec into the table as planned', () => {
  const h = fanoutHost()
  h.must(['--spec', S06, '--override-serial'])
  const y = h.state().lanes.find((l) => l.spec === S06)
  assert.ok(y && y.state === 'planned', 'the override must admit 06-y when the user listed it: ' + JSON.stringify(h.state().lanes))
})

test('AC-20261102-03-22: a listed spec on a shared brief waits and is planned when its predecessor merges, and the next bare run dispatches it', () => {
  const h = fanoutHost()
  h.plan(['--spec', S03, '--spec', S06])
  const st = h.state()
  assert.strictEqual(st.lanes[0].state, 'planned', 'L1 = 03-x starts planned')
  assert.deepStrictEqual([st.lanes[1].spec, st.lanes[1].state, st.lanes[1].waitingOn], [S06, 'waiting', 'shared brief 32'],
    'L2 = 06-y waits on the shared brief, or two specs of one brief build at once: ' + JSON.stringify(st.lanes[1]))
  h.dispatch('L1', 'lane-one')
  h.startLane('03-x')
  h.commitInLane('03-x', 'x.txt', 'x\n')
  h.sidecar('03-x', 'review', { closed: true })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  assert.strictEqual(h.lane('L1').state, 'merge-ready', 'a closed review sidecar makes the lane merge-ready')
  h.mergeLane('03-x', { markDone: true })
  h.must(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(h.lane('L2').state, 'planned', 'the merge must flip the waiting lane to planned in the same mark: ' + JSON.stringify(h.state().lanes))
  const next = h.must([])
  assert.ok(next.stdout.includes('## Step: dispatch 1 lanes'), 'the next bare run dispatches the freed lane: ' + next.stdout)
  assert.ok(next.stdout.includes(S06), 'the dispatch names 06-y: ' + next.stdout)
})

test('AC-20261102-03-22: a waiting spec whose predecessor stopped is reported as not started and the run reaches REPORT', () => {
  const h = fanoutHost()
  h.plan(['--spec', S03, '--spec', S06])
  h.dispatch('L1', 'lane-one')
  h.must(['--mark', 'returned', '--lane', 'L1', '--stopped', 'worker gone'])
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: report'), 'with the only runnable lane stopped the run must reach REPORT, or the waiting lane hangs the session: ' + r.stdout)
  const slots = JSON.parse(bytes(h.reportFile))
  assert.ok(slots.bullets.includes(S06 + ': not started — waited on ' + S03 + ', which stopped'),
    'the report must say the waiting spec never started and why: ' + JSON.stringify(slots.bullets))
})

test('AC-20261102-03-8: a bare run on an existing file in DISPATCH re-prints the DISPATCH step, and a bare run on a file still in PLAN re-prints the table unchanged', () => {
  const h = fanoutHost()
  h.plan()
  const a = h.must([])
  const b = h.must([])
  assert.match(a.stdout, /state: DISPATCH/, 'a resumed session must land on DISPATCH: ' + a.stdout)
  assert.strictEqual(b.stdout, a.stdout, 'a second bare run must print the same step, or /clear loses the dispatch')
  const p = fanoutHost()
  const first = p.must([])
  const file = bytes(p.stateFile)
  const second = p.must([])
  assert.strictEqual(second.stdout, first.stdout, 'a bare run on a file still in PLAN re-prints the plan table unchanged: ' + second.stdout)
  assert.strictEqual(bytes(p.stateFile), file, 'the re-print must not rewrite the file')
})

test('AC-20261102-03-9 / AC-20261103-04-12: the planned mark prints DISPATCH with no AskUserQuestion block, the standing mark is refused with the remaining marks listed, and --ask validates its key and lands in the state file', () => {
  const h = fanoutHost()
  const r = h.plan()
  assert.match(r.stdout, /state: DISPATCH/, 'the planned mark leaves the run in DISPATCH: ' + r.stdout)
  assert.strictEqual(askBlocks(r.stdout).length, 0, 'no standing sheet is asked any more, or the host policy answers nothing: ' + r.stdout)
  const std = h.run(['--mark', 'standing'])
  assert.strictEqual(std.status, 2, 'the retired standing mark must be refused: ' + std.stdout)
  assert.match(std.stderr, /marks are planned, dispatched/, 'the refusal lists the marks without standing: ' + std.stderr)
  const bad = fanoutHost()
  const b = bad.run(['--ask', 'bogus'])
  assert.strictEqual(b.status, 2, 'an unknown --ask key must exit 2 or a typo silently asks nothing: ' + b.stdout)
  for (const w of ['repairRound', 'buildEscalate', 'reviewEscalate', 'redFindings', 'all']) assert.ok(b.stderr.includes(w), 'the refusal must name ' + w + ': ' + b.stderr)
  assert.ok(!fs.existsSync(bad.stateFile), 'a refused planning run must write no state file')
  const ok = fanoutHost()
  ok.plan(['--ask', 'repairRound'])
  assert.deepStrictEqual(ok.state().ask, ['repairRound'], 'the planning run must record the per-run ask list in the state file')
})

test('AC-20261102-03-10: DISPATCH prints one lane-seat agent line and worker prompt per planned lane and the dispatched mark records the agent name', () => {
  const h = fanoutHost()
  h.plan()
  const r = h.plan()
  assert.match(r.stdout, /state: DISPATCH/, 'the planned mark leaves the run in DISPATCH: ' + r.stdout)
  assert.ok(r.stdout.includes('## Step: dispatch 2 lanes'), r.stdout)
  assert.strictEqual(r.stdout.split(LANE_AGENT).length - 1, 2, 'exactly one worktree-isolated background agent line per lane: ' + r.stdout)
  assert.ok(r.stdout.includes('git switch spec/03-x 2>/dev/null || git switch -c spec/03-x'), 'the worker must be told to take the lane branch first')
  assert.ok(r.stdout.includes('/spec:run ' + S03), 'the worker must be told which spec to run')
  assert.ok(r.stdout.includes('Never write an answer into .claude/pending-question.json'), 'the worker must be told never to answer a question itself')
  assert.match(r.stdout, /--mark dispatched --lane L1 --agent \S+/, 'one dispatched mark per lane for L1')
  assert.match(r.stdout, /--mark dispatched --lane L2 --agent \S+/, 'one dispatched mark per lane for L2')
  h.dispatch('L1', 'lane-one')
  assert.deepStrictEqual([h.lane('L1').agent, h.lane('L1').state], ['lane-one', 'dispatched'], 'the mark records the agent so SendMessage can resume it after /clear')
})

// A host with the default pair dispatched and lane L1's worktree standing, ready for a returned mark.
function returnedHost() {
  const h = fanoutHost()
  h.dispatchedPair()
  h.startLane('03-x')
  return h
}

test('AC-20261102-03-11: --mark returned reads the lane from its own worktree: pending, merge-ready, dismissed stop, no worktree, and a stated reason', () => {
  const pend = returnedHost()
  pend.writePending('03-x', repairRoundDoc(S03))
  pend.must(['--mark', 'returned', '--lane', 'L1'])
  const l = pend.lane('L1')
  assert.deepStrictEqual([l.state, l.worktree, l.question], ['pending', pend.wt('03-x'), pend.pendingPath('03-x')],
    'a pending file in the lane worktree makes the lane pending and records where: ' + JSON.stringify(l))

  const ready = returnedHost()
  ready.sidecar('03-x', 'review', { closed: true })
  ready.must(['--mark', 'returned', '--lane', 'L1'])
  assert.strictEqual(ready.lane('L1').state, 'merge-ready', 'a closed review sidecar with no pending file is merge-ready')

  const dismissed = returnedHost()
  dismissed.sidecar('03-x', 'build', { dismissedStop: { kind: 'repair-round', at: '2026-11-02T10:00:00Z' } })
  dismissed.must(['--mark', 'returned', '--lane', 'L1'])
  assert.deepStrictEqual([dismissed.lane('L1').state, dismissed.lane('L1').stoppedReason], ['stopped', 'question dismissed'],
    'a dismissed stop in the build sidecar ends the lane with that reason')

  const gone = fanoutHost()
  gone.dispatchedPair()
  gone.must(['--mark', 'returned', '--lane', 'L1'])
  assert.deepStrictEqual([gone.lane('L1').state, gone.lane('L1').stoppedReason], ['stopped', 'worktree not found'],
    'a lane whose branch lives in no worktree is stopped, never re-dispatched')

  const said = returnedHost()
  said.must(['--mark', 'returned', '--lane', 'L1', '--stopped', 'worker gone'])
  assert.deepStrictEqual([said.lane('L1').state, said.lane('L1').stoppedReason], ['stopped', 'worker gone'], '--stopped records the reason given')
})

test('AC-20261102-03-12 / AC-20261103-04-13: RELAY relays a lane\'s repair-round question under the lane-prefixed header and answers nothing itself', () => {
  const h = fanoutHost()
  h.plan(['--spec', S03, '--ask', 'repairRound'])
  h.dispatch('L1', 'lane-one')
  h.startLane('03-x')
  h.writePending('03-x', repairRoundDoc(S03))
  h.must(['--mark', 'returned', '--lane', 'L1'])
  const r = h.must([])
  assert.match(r.stdout, /state: RELAY/, 'a pending lane puts the run in RELAY: ' + r.stdout)
  const blocks = askBlocks(r.stdout)
  assert.deepStrictEqual(blocks.map((b) => b.questions.map((q) => q.header)), [['L1 · q1']], 'the question must be relayed under the lane-prefixed header: ' + r.stdout)
  assert.strictEqual(h.readPending('03-x').answers, null, 'the driver must write no answer into the lane\'s file, or a question the user never saw is answered: ' + JSON.stringify(h.readPending('03-x')))
  assert.ok(!r.stdout.includes('📌'), 'RELAY prints no auto-pick line: ' + r.stdout)
  assert.ok(!r.stdout.includes('SendMessage {to: "lane-one"'), 'the lane is not resumed before the user answers: ' + r.stdout)
})

test('AC-20261102-03-13: RELAY batches questions four at a time under lane-prefixed headers, an answered mark writes the user answer, and a fully answered lane is resumed without a question', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  h.startLane('03-x')
  h.startLane('04-z')
  h.writePending('03-x', dispositionsDoc(S03, 5))
  h.writePending('04-z', redFindingsDoc(S04))
  h.must(['--mark', 'returned', '--lane', 'L1'])
  h.must(['--mark', 'returned', '--lane', 'L2'])
  const r = h.must([])
  const blocks = askBlocks(r.stdout)
  assert.deepStrictEqual(blocks.map((b) => b.questions.map((q) => q.header)),
    [['L1 · s0', 'L1 · s1', 'L1 · s2', 'L1 · s3'], ['L1 · s4', 'L2 · q1']],
    'questions batch four to a block in lane order under lane-prefixed headers: ' + r.stdout)
  assert.ok(blocks[0].questions.every((q) => q.question.includes('03-x')), 'each question names its lane\'s spec, or the user cannot tell whose it is')
  assert.ok(blocks[1].questions[1].question.includes('04-z'), 'the second lane\'s question names its own spec')
  const file = h.readPending('03-x').questions[0]
  assert.deepStrictEqual(blocks[0].questions[0].options.map((o) => [o.label, o.description]), file.options.map((o) => [o.label, o.description]),
    'options and descriptions are relayed verbatim from the file')
  for (let i = 0; i < 5; i++) h.must(['--mark', 'answered', '--lane', 'L1', '--id', 's' + i, '--label', 'accept waive (Recommended)'])
  const a = h.readPending('03-x').answers.s0
  assert.deepStrictEqual([a.label, a.by, typeof a.at], ['accept waive (Recommended)', 'user', 'string'], 'the user\'s answer is written into the lane\'s own file: ' + JSON.stringify(a))
  const next = h.must([])
  assert.ok(next.stdout.includes('SendMessage {to: "lane-one"'), 'a fully answered lane is resumed: ' + next.stdout)
  assert.ok(askBlocks(next.stdout).every((b) => b.questions.every((q) => !q.header.startsWith('L1'))), 'no question for the answered lane is asked again: ' + next.stdout)
})

test('AC-20261102-03-14: a malformed question stops its lane without relaying it, and a dismissed mark records the dismissal and resumes the worker', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  h.startLane('03-x')
  h.startLane('04-z')
  const bad = dispositionsDoc(S03, 1)
  bad.questions[0].options[1].description = 'ok'
  h.writePending('03-x', bad)
  h.writePending('04-z', repairRoundDoc(S04))
  h.must(['--mark', 'returned', '--lane', 'L1'])
  h.must(['--mark', 'returned', '--lane', 'L2'])
  const r = h.must([])
  const l1 = h.lane('L1')
  assert.strictEqual(l1.state, 'stopped', 'a question failing the style gate must stop its lane: ' + JSON.stringify(l1))
  assert.ok(l1.stoppedReason.startsWith('malformed question:'), 'the reason names the malformed question: ' + l1.stoppedReason)
  assert.ok(askBlocks(r.stdout).every((b) => b.questions.every((q) => !q.header.startsWith('L1'))), 'a malformed question is never relayed: ' + r.stdout)
  const d = h.must(['--mark', 'dismissed', '--lane', 'L2'])
  assert.ok(h.readPending('04-z').dismissed && h.readPending('04-z').dismissed.at, 'the dismissal is written into the lane\'s file so its next run stops')
  assert.ok(d.stdout.includes('SendMessage {to: "lane-two"'), 'the worker is told to continue to its stop: ' + d.stdout)
})

test('AC-20261102-03-15: MERGE names only the first merge-ready lane from the main root, and a pending lane keeps the run in RELAY', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  for (const stem of ['03-x', '04-z']) {
    h.startLane(stem)
    h.commitInLane(stem, stem + '.txt', stem + '\n')
    h.sidecar(stem, 'review', { closed: true })
  }
  h.must(['--mark', 'returned', '--lane', 'L1'])
  h.must(['--mark', 'returned', '--lane', 'L2'])
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: merge L1'), 'merges go in table order: ' + r.stdout)
  assert.ok(r.stdout.includes('run from ' + h.root + ': node "$(spec-paths review-driver)" ' + h.wt('03-x') + '/' + S03), 'the review driver\'s MERGE step runs from the main root on the lane\'s spec: ' + r.stdout)
  assert.ok(r.stdout.includes('git worktree unlock ' + h.wt('03-x')), 'the harness lock on the worktree is lifted before cleanup: ' + r.stdout)
  assert.ok(r.stdout.includes('--mark merged --lane L1'), 'the merged mark closes the step')
  assert.ok(!r.stdout.includes('--lane L2') && !r.stdout.includes(h.wt('04-z')), 'only one lane is merged at a time: ' + r.stdout)

  const p = fanoutHost()
  p.dispatchedPair()
  p.startLane('03-x')
  p.startLane('04-z')
  p.sidecar('03-x', 'review', { closed: true })
  p.writePending('04-z', repairRoundDoc(S04))
  p.must(['--mark', 'returned', '--lane', 'L1'])
  p.must(['--mark', 'returned', '--lane', 'L2'])
  const rp = p.must([])
  assert.match(rp.stdout, /state: RELAY/, 'a pending question may change the outcome, so it is relayed before any merge: ' + rp.stdout)
  assert.ok(!rp.stdout.includes('## Step: merge'), 'no merge while a lane is pending: ' + rp.stdout)
})

// Lane L1 (03-x) merge-ready with real work on its branch, as a closed review leaves it.
function mergeReadyHost(specFlags = ['--spec', S03]) {
  const h = fanoutHost()
  h.plan(specFlags)
  h.dispatch('L1', 'lane-one')
  h.startLane('03-x')
  h.commitInLane('03-x', 'x.txt', 'x\n')
  h.sidecar('03-x', 'review', { closed: true })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  return h
}

test('AC-20261102-03-16: --mark merged refuses a branch that is not contained in HEAD, and for a merged one runs the host gate in the root, logs it and records green', () => {
  const h = mergeReadyHost()
  const refused = h.run(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(refused.status, 2, 'an unmerged branch must be refused: ' + refused.stdout)
  assert.ok(refused.stderr.includes('fanout-driver: lane L1 is not merged — run the MERGE step first'), 'the refusal names the remedy: ' + refused.stderr)
  h.mergeLane('03-x', { markDone: true })
  h.must(['--mark', 'merged', '--lane', 'L1'])
  assert.ok(fs.existsSync(path.join(h.common, 'spec-fanout', 'L1.gate.log')), 'the gate output is kept for the report and the queue line')
  assert.strictEqual(bytes(path.join(h.root, '.gate-cwd')).trim(), h.root, 'the gate runs with the main root as its cwd, or it judges the wrong tree')
  assert.deepStrictEqual([h.lane('L1').gate, h.lane('L1').state], ['green', 'merged'], 'a green gate lands the lane as merged')
})

test('AC-20261102-03-17: a red gate after a merge enters MERGE_RED, queues the fix, refuses every further merge, and gate-repaired clears it', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  for (const stem of ['03-x', '04-z']) {
    h.startLane(stem)
    h.commitInLane(stem, stem + '.txt', stem + '\n')
    h.sidecar(stem, 'review', { closed: true })
  }
  h.must(['--mark', 'returned', '--lane', 'L1'])
  h.must(['--mark', 'returned', '--lane', 'L2'])
  h.mergeLane('03-x', { markDone: true })
  h.mergeLane('04-z', { markDone: true })
  h.gateRed(true)
  const r = h.run(['--mark', 'merged', '--lane', 'L1'])
  const log = path.join(h.common, 'spec-fanout', 'L1.gate.log')
  assert.ok(r.stdout.includes('## MERGE_RED — main gate red after L1'), 'the red gate stops the queue with its own header: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes(log), 'the log path is printed: ' + r.stdout)
  assert.ok(r.stdout.includes('node "$(spec-paths spec-queue)" add "main gate red after merging L1: ' + log + '" --lane fix --top'), 'the repair is queued on top: ' + r.stdout)
  assert.strictEqual(h.lane('L1').gate, 'red', 'the lane records the red gate')
  assert.deepStrictEqual(h.state().lastGate, { lane: 'L1', result: 'red', log }, 'lastGate drives MERGE_RED on every later run')
  const second = h.run(['--mark', 'merged', '--lane', 'L2'])
  assert.strictEqual(second.status, 2, 'a merge onto a broken main must be refused: ' + second.stdout)
  assert.ok(second.stderr.includes('gate-repaired'), 'the refusal names the way out: ' + second.stderr)
  h.gateRed(false)
  h.must(['--mark', 'gate-repaired'])
  assert.ok(!h.state().lastGate, 'a green re-run clears the red gate')
  assert.ok(h.must([]).stdout.includes('## Step: merge L2'), 'the queue goes on with the next lane')
})

test('AC-20261102-03-18 / AC-20261103-04-15: REPORT writes the slots with the merged and stopped bullets and the policy-applied trail, prints the render line, and the reported mark deletes the state', () => {
  const h = fanoutHost()
  h.plan()
  h.dispatch('L1', 'lane-one')
  h.dispatch('L2', 'lane-two')
  h.startLane('03-x')
  h.startLane('04-z')
  h.commitInLane('03-x', 'x.txt', 'x\n')
  const pick = { key: 'repairRound', value: 'repair', label: 'run one in-session repair round', at: '2026-11-03T10:00:00Z' }
  h.sidecar('03-x', 'review', { closed: true, policyPicks: [pick] })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  assert.deepStrictEqual(h.lane('L1').policyPicks, [pick], 'the returned mark must lift the review sidecar\'s picks onto the lane: ' + JSON.stringify(h.lane('L1')))
  h.writePending('04-z', repairRoundDoc(S04))
  h.must(['--mark', 'returned', '--lane', 'L2'])
  h.must(['--mark', 'dismissed', '--lane', 'L2'])
  h.must(['--mark', 'resumed', '--lane', 'L2'])
  fs.rmSync(h.pendingPath('04-z'))
  h.sidecar('04-z', 'build', { dismissedStop: { kind: 'repair-round', at: '2026-11-02T10:00:00Z' } })
  h.must(['--mark', 'returned', '--lane', 'L2'])
  assert.strictEqual(h.lane('L2').stoppedReason, 'question dismissed', 'the second lane ends on its dismissed question')
  h.mergeLane('03-x', { markDone: true })
  h.must(['--mark', 'merged', '--lane', 'L1'])
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: report'), 'every lane terminal means REPORT: ' + r.stdout)
  const slots = JSON.parse(bytes(h.reportFile))
  assert.deepStrictEqual(slots.outcome, { anchor: '⚠️', text: 'fan-out finished with stops — 1 merged, 1 stopped' }, 'the outcome counts merged and stopped lanes')
  assert.deepStrictEqual(slots.bullets, [S03 + ': merged (gate green)', S04 + ': stopped — question dismissed'], 'one bullet per lane in table order')
  assert.deepStrictEqual(slots.warns, ['policy applied — stops.repairRound: run one in-session repair round (L1, 03-x)'], 'the REPORT must trail every policy pick, or an auto-picked stop scrolls past unseen: ' + JSON.stringify(slots.warns))
  assert.strictEqual(slots.next.kind, 'status-verbatim', 'what next is the status script\'s output, never hand-mapped')
  assert.strictEqual(slots.next.text.trim(), h.status(['--next']).stdout.trim(), 'the next slot carries spec-status --next verbatim')
  assert.ok(r.stdout.includes('node "$(spec-paths report-render)" --slots ' + h.reportFile), 'the render line is printed: ' + r.stdout)
  assert.match(r.stdout, /--mark reported/, 'the reported mark closes the run: ' + r.stdout)
  const render = runNode('scripts/report-render.js', ['--slots', h.reportFile])
  assert.strictEqual(render.status, 0, 'the slots file must satisfy the sole renderer: ' + render.stderr)
  h.must(['--mark', 'reported'])
  assert.ok(!fs.existsSync(h.stateFile) && !fs.existsSync(path.join(h.common, 'spec-fanout')), 'the reported mark removes the state file and its directory, or the next fan-out refuses to start')
})

test('AC-20261103-04-14: --mark returned lands a lane stopped on its sidecar\'s laneExit and queues the exit\'s subject, and a lane without one is untouched', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  h.startLane('03-x')
  h.startLane('04-z')
  const queued = '03-x: build parked at the repair cap — gate-3.log'
  h.sidecar('03-x', 'build', { laneExit: { reason: 'build parked at the repair cap', queued, at: '2026-11-03T10:00:00Z' } })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  const l = h.lane('L1')
  assert.deepStrictEqual([l.state, l.stoppedReason], ['stopped', 'build parked at the repair cap'], 'a recorded laneExit must land the lane stopped with its reason, never "without a recognised stop": ' + JSON.stringify(l))
  assert.ok((h.state().queued || []).includes(queued), 'the exit\'s queue subject must reach st.queued so the report names the repair: ' + JSON.stringify(h.state().queued))
  h.sidecar('04-z', 'review', { closed: true })
  h.must(['--mark', 'returned', '--lane', 'L2'])
  assert.strictEqual(h.lane('L2').state, 'merge-ready', 'a lane whose sidecars carry no laneExit stays on its normal path: ' + JSON.stringify(h.lane('L2')))
})

test('AC-20261102-03-17: with the gate red after a merge and another lane pending on a question, the next bare run relays the question instead of printing MERGE_RED, and a merge-ready lane is still refused until gate-repaired', () => {
  const h = fanoutHost()
  h.plan(['--override-serial'])
  for (const [id, agent] of [['L1', 'lane-one'], ['L2', 'lane-two'], ['L3', 'lane-three']]) h.dispatch(id, agent)
  for (const stem of ['03-x', '04-z', '06-y']) h.startLane(stem)
  for (const [stem, id] of [['03-x', 'L1'], ['06-y', 'L3']]) {
    h.commitInLane(stem, stem + '.txt', stem + '\n')
    h.sidecar(stem, 'review', { closed: true })
    h.must(['--mark', 'returned', '--lane', id])
  }
  h.mergeLane('03-x', { markDone: true })
  h.mergeLane('06-y')
  h.gateRed(true)
  h.run(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(h.lane('L1').gate, 'red', 'the setup needs a red gate after the first merge')
  h.writePending('04-z', repairRoundDoc(S04))
  h.must(['--mark', 'returned', '--lane', 'L2'])
  const r = h.must([])
  assert.match(r.stdout, /state: RELAY/, 'a pending question outranks a red gate: MERGE_RED is only reached where MERGE would be: ' + r.stdout)
  assert.ok(!r.stdout.includes('## MERGE_RED'), 'MERGE_RED must not print while a lane is pending, or the user\'s answer is held behind a merge that cannot run: ' + r.stdout)
  const refused = h.run(['--mark', 'merged', '--lane', 'L3'])
  assert.strictEqual(refused.status, 2, 'a merge-ready lane must still be refused while the gate is red: ' + refused.stdout)
  assert.ok(refused.stderr.includes('gate-repaired'), 'the refusal names the way out: ' + refused.stderr)
})

test('AC-20261102-03-16: a lane whose branch is already merged but whose locked worktree and branch remain is unlocked and cleaned up by the merged mark, then gated green', () => {
  const h = mergeReadyHost()
  h.mergeLane('03-x', { markDone: true, cleanup: false })
  h.lockLane('03-x')
  const r = h.run(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(r.status, 0, 'a merge that landed before the cleanup died must be finished by the mark, locked worktree included: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(h.wt('03-x')), 'the lane worktree must be removed, or the next spec run finds the branch parked')
  assert.strictEqual(h.git('branch', '--list', 'spec/03-x').trim(), '', 'the merged lane branch must be deleted')
  assert.deepStrictEqual([h.lane('L1').gate, h.lane('L1').state], ['green', 'merged'], 'after the cleanup the gate runs and the lane lands as merged')
})

// Two fix lanes and no run lanes, as a real `--include-fixes` run over a non-startable --spec plans
// them: F1 = queued item q107 (branch fix/q107), F2 = the CI escape. F1 is dispatched, committed in
// its own worktree, returned merge-ready and merged into main; F2 is left planned.
function fixMergedHost() {
  const h = fanoutHost({ fixes: true })
  h.plan(['--spec', specRel('nope'), '--include-fixes'])
  h.dispatch('F1', 'fix-one')
  h.git('worktree', 'add', '-q', '-b', 'fix/q107', h.wt('q107'))
  h.commitInLane('q107', 'fix.txt', 'fix\n')
  h.must(['--mark', 'returned', '--lane', 'F1'])
  assert.strictEqual(h.lane('F1').state, 'merge-ready', 'the setup needs F1 merge-ready')
  h.git('merge', '-q', '--no-ff', '-m', 'merge fix/q107', 'fix/q107')
  return h
}

test('fanout: a red gate after merging a fix lane prints MERGE_RED on that same mark, never a dispatch block for the next planned fix lane', () => {
  const h = fixMergedHost()
  h.gateRed(true)
  const r = h.run(['--mark', 'merged', '--lane', 'F1'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes('## MERGE_RED — main gate red after F1'), 'a red main must stop the queue at once: ' + r.stdout)
  assert.ok(!r.stdout.includes('## Step: dispatch'), 'F2 must never be dispatched onto a red main: ' + r.stdout)
  assert.match(h.must([]).stdout, /state: MERGE_RED/, 'the bare run agrees')
})

test('fanout: --mark gate-repaired saves its outcome onto the state as it is after the gate, so a lane that returned pending meanwhile stays pending', () => {
  const h = fixMergedHost()
  h.dispatch('F2', 'fix-two')
  h.gateRed(true)
  h.run(['--mark', 'merged', '--lane', 'F1'])
  h.gateRed(false)
  const question = path.join(h.root, 'q.json')
  // The gate itself stands in for a concurrent `--mark returned --lane F2` landing mid-gate.
  fs.writeFileSync(path.join(h.root, 'gate.sh'), '#!/usr/bin/env bash\nnode -e \'' +
    'const fs=require("fs");const f=process.argv[1];const st=JSON.parse(fs.readFileSync(f,"utf8"));' +
    'const l=st.lanes.find((x)=>x.id==="F2");l.state="pending";l.question=process.argv[2];fs.writeFileSync(f,JSON.stringify(st))' +
    '\' ' + JSON.stringify(h.stateFile) + ' ' + JSON.stringify(question) + '\nexit 0\n')
  h.must(['--mark', 'gate-repaired'])
  assert.deepStrictEqual([h.lane('F2').state, h.lane('F2').question], ['pending', question], 'the concurrent return must survive the gate run: ' + JSON.stringify(h.lane('F2')))
  assert.strictEqual(h.state().lastGate, null, 'the green gate is still recorded')
  assert.strictEqual(h.lane('F1').gate, 'green', 'the repaired lane records the green gate')
})

test('fanout: --mark merged on a fix lane with a queueId ticks its queue item, so spec-queue list no longer shows it', () => {
  const h = fixMergedHost()
  h.must(['--mark', 'merged', '--lane', 'F1'])
  const list = runNode('scripts/spec-queue.js', ['list'], { cwd: h.root })
  assert.strictEqual(list.status, 0, list.stderr)
  assert.ok(!list.stdout.includes('q107'), 'the merged fix must leave the pending queue: ' + list.stdout)
  const archive = JSON.parse(bytes(path.join(h.common, 'spec-queue-done.json')))
  const item = archive.items.find((i) => i.id === 'q107')
  assert.ok(item && item.ticked, 'the item is archived with a ticked stamp: ' + JSON.stringify(archive))
})

test('fanout: after a red gate is repaired green, the report carries no queued "main gate red" line for it', () => {
  const h = fixMergedHost()
  h.gateRed(true)
  h.run(['--mark', 'merged', '--lane', 'F1'])
  h.gateRed(false)
  h.must(['--mark', 'gate-repaired'])
  h.dispatch('F2', 'fix-two')
  h.must(['--mark', 'returned', '--lane', 'F2', '--stopped', 'not needed'])
  assert.ok(h.must([]).stdout.includes('## Step: report'), 'every lane terminal means REPORT')
  const slots = JSON.parse(bytes(h.reportFile))
  assert.ok(!slots.queued.some((q) => q.startsWith('main gate red')), 'a repaired gate leaves no queued repair: ' + JSON.stringify(slots.queued))
})
