'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, SPEC } = require('../helpers')
const { fanoutHost, askBlocks, specRel, LANE_AGENT, repairRoundDoc, dispositionsDoc, redFindingsDoc } = require('./fixture')

// specs/20261102/03-one-session-runs-the-lanes.md D3-D10, D4a: AC-20261102-03-5 .. -18, -21, -22; specs/20261103/04 AC-12 .. -15 —
// fanout-driver.js is driven end to end against a synthetic host (tests/fanout/fixture.js); every
// state is reached through the driver's own marks and read back from its state file.
// specs/20261103/06-the-fan-out-drains-the-queue.md D4-D7, D12: the derived batch, born fixes, the REPORT after a batch and the RELAY/MERGE-before-DISPATCH order.
// specs/20261103/08-queue-items-remember-their-origin.md D5-D6, D9-D10, D12, D14-D17: a fix is admitted by the origin and batch its item carries, the batch walk, files-aware fix dispatch, gated fixes, the repair lane and the dirty-root refusal.
// specs/20261103/14-the-fan-out-has-two-modes.md D1-D5, D9: a bare run is AUTO (derived batch, fix group, one veto line), --pick is SELF-PICK (checkbox round, boundary validation, the picked mark); every other argument is refused with the usage line.
// q28: a lane's laneExit outlives the sidecar delete its own step prints (pending-question.js lane-exit record).

const S03 = specRel('03-x')
const S04 = specRel('04-z')
const S06 = specRel('06-y')
const S08S = specRel('08-s')
const S08K = specRel('08-k')
const S08C = specRel('08-c')
const bytes = (file) => fs.readFileSync(file, 'utf8')
const batchOf = (h) => {
  const b = h.state().batch
  assert.ok(b, 'the state file must record the batch it derived, or a resumed session cannot name where the batch stops: ' + JSON.stringify(h.state()))
  return b
}
const idOf = (h, spec) => {
  const l = h.state().lanes.find((x) => x.spec === spec)
  assert.ok(l, 'the table must carry a lane for ' + spec + ', or the rest of the test means nothing: ' + JSON.stringify(h.state().lanes.map((x) => [x.id, x.spec])))
  return l.id
}
// One lane finished the way a closed review leaves it: committed, returned merge-ready, merged into main, gated.
function landLane(h, stem, id) {
  h.closeLane(stem)
  h.must(['--mark', 'returned', '--lane', id])
  h.mergeLane(stem, { markDone: true })
  return h.must(['--mark', 'merged', '--lane', id])
}

const USAGE = 'usage: fanout-driver.js [--root <dir>] [--pick] | --mark <m> [flags] | --state'

test('AC-20261102-03-5 / AC-20261103-04-12: a bare run with no state file prints the PLAN step with the lane table, the parked line and the planned mark, writes every lane planned with policyPicks [] and no standing key, and --state moves from PLAN to DISPATCH at the mark', () => {
  const h = fanoutHost({ briefed: true, parked: true })
  const parkedWt = h.startLane('05-p')
  const before = h.run(['--state'])
  assert.strictEqual(before.status, 0, '--state must answer before any file exists: ' + before.stderr)
  assert.match(before.stdout, /\bPLAN\b/, '--state with no file must say PLAN, or a resumed session cannot tell nothing has started: ' + before.stdout)
  assert.ok(!fs.existsSync(h.stateFile), '--state must not create the state file, or asking where we are starts a fan-out')
  const r = h.run()
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes('[fanout-driver] state: PLAN  root: ' + h.root), 'the first line names the state and root: ' + r.stdout)
  const pin = r.stdout.split('\n').find((x) => x.startsWith('📌 Auto-picked batch:'))
  assert.ok(pin, 'a bare run must print the derived batch as one 📌 line, or the user has no line to veto: ' + r.stdout)
  for (const stem of ['03-x', '06-y', '04-z']) assert.ok(pin.includes(stem), 'the 📌 line must name member ' + stem + ': ' + pin)
  assert.ok(r.stdout.includes('## Step: plan the lanes'), 'the PLAN step header must print: ' + r.stdout)
  assert.match(r.stdout, /L1\s+specs\/20261102\/03-x\.md\s+brief 32\s+spec\/03-x/, 'the table must carry one row per lane with spec, brief and branch: ' + r.stdout)
  assert.match(r.stdout, /L2\s+specs\/20261102\/06-y\.md\s+brief 32\s+spec\/06-y\s+\(waiting: shared brief 32\)/, 'the shared-brief member must print as waiting beside the lanes, or the batch silently drops it: ' + r.stdout)
  assert.match(r.stdout, /L3\s+specs\/20261102\/04-z\.md\s+brief 33\s+spec\/04-z/, 'the third lane row must print: ' + r.stdout)
  assert.ok(r.stdout.includes('⏸ specs/20261102/05-p.md parked in ' + parkedWt + ' — finish it there in-session'), 'a lane whose branch lives in a linked worktree must print the hand command and never be dispatched: ' + r.stdout)
  assert.match(r.stdout, /Then: node .*fanout-driver.* --mark planned/, 'the step must end with the one mark that admits the table: ' + r.stdout)
  const st = h.state()
  assert.deepStrictEqual(st.lanes.map((l) => [l.id, l.spec, l.state]), [['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned']], 'the file must hold the batch minus the parked spec: two lanes planned and the shared-brief member waiting: ' + JSON.stringify(st.lanes))
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
  const cases = [[h.run([], { cwd: linked }), 'fanout-driver: run from the main worktree — cd ' + h.root], [h.run(['--mark', 'x']), 'fanout-driver: unknown mark "x"'], [h.run(['--mark', 'merged', '--lane', 'L9']), 'fanout-driver: no lane L9 in the table'],]
  for (const [r, msg] of cases) {
    assert.strictEqual(r.status, 2, 'a refusal must exit 2: ' + msg + ' :: ' + r.stdout)
    assert.ok(r.stderr.includes(msg), 'stderr must carry "' + msg + '", or the user is not told the remedy: ' + r.stderr)
    assert.strictEqual(bytes(h.stateFile), before, 'a refused run must leave the state file byte-identical, or a typo corrupts the table')
  }
})

test('AC-20261102-03-7: --lanes is refused as an unknown argument with every other retired flag and a bare spec path, exits 2 with the --pick usage line and writes no state, AC-20261103-06-14 / AC-20261103-14-1', () => {
  const h = fanoutHost()
  const r = h.run(['--batch', 'all'])
  assert.strictEqual(r.status, 2, 'the retired batch flag must exit 2, or a stale command line silently plans a third mode: ' + r.stdout)
  assert.ok(r.stderr.includes('unknown argument --batch — ' + USAGE), 'stderr must name the argument it refused and the two-mode usage line, or the user is not told what to type: ' + r.stderr)
  assert.ok(r.stderr.includes('[--pick]'), 'the usage line must read --pick, the one choice the user has left: ' + r.stderr)
  for (const args of [['--include-fixes'], ['--override-serial'], ['--ask', 'repairRound'], ['--lanes', '1'], ['--spec', S03], [S03]]) { // retired-flag probe
    const x = h.run(args)
    assert.strictEqual(x.status, 2, args.join(' ') + ' must exit 2, or a retired knob still plans a batch: ' + x.stdout)
    assert.ok(x.stderr.includes('unknown argument ' + args[0] + ' — ' + USAGE), 'stderr must name ' + args[0] + ' and the usage line: ' + x.stderr)
  }
  assert.ok(!fs.existsSync(h.stateFile), 'a refused run must write no state file, or the refusal leaves a half-planned table behind')
})

test('AC-20261102-03-7: the fix group appends fix lanes F1 and F2 with their branches after the run lanes, AC-20261103-14-2: a bare run tables the derived batch then the fix group with no flag, prints the pick veto and no question, and writes no options or ask key', () => {
  const h = fanoutHost({ briefed: true, fixes: true })
  const r = h.must([])
  const lanes = h.state().lanes
  assert.deepStrictEqual(lanes.map((l) => [l.id, l.spec || l.branch, l.state]), [['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned'], ['F1', 'fix/q107', 'planned'], ['F2', 'fix/q116', 'planned']], 'a bare run must table every queued fix as the fix group after the run lanes in queue order, or a queued repair is silently dropped: ' + JSON.stringify(lanes))
  const [f1, f2] = [lanes.find((l) => l.id === 'F1'), lanes.find((l) => l.id === 'F2')]
  assert.deepStrictEqual([f1.kind, f1.queueId, f2.kind, f2.queueId], ['fix', 'q107', 'fix', 'q116'], 'the fix lanes carry their queue items: ' + JSON.stringify([f1, f2]))
  assert.ok(r.stdout.includes('📌 Auto-picked batch: 03-x, 06-y, 04-z — the whole queue (veto: /spec:fanout --pick)'), 'the one line must name --pick as the veto: ' + r.stdout)
  assert.strictEqual(askBlocks(r.stdout).length, 0, 'a bare run asks no question before DISPATCH, or the safe default is dressed as a question: ' + r.stdout)
  const st = h.state()
  assert.ok(!('options' in st) && !('ask' in st), 'the state file must carry no options or ask key, or a retired knob still has a place to live: ' + JSON.stringify(Object.keys(st)))
  assert.deepStrictEqual(st.batch, { members: [S03, S06, S04], stopBefore: null, by: 'derived' }, 'the batch records the derived members: ' + JSON.stringify(st.batch))
})

test('AC-20261102-03-21: an explicit --spec list is replaced by AC-20261103-14-7 picks: --mark picked tables the picks in queue order through the derived batch\'s boundary validation and never admits a pick the bare run would refuse', () => {
  const lanesOf = (h) => h.state().lanes.map((l) => [l.id, l.spec, l.state])
  const order = fanoutHost({ briefed: true })
  const first = order.pick([S04, S03])
  assert.deepStrictEqual(lanesOf(order), [['L1', S03, 'planned'], ['L2', S04, 'planned']], 'picks z, x must table in queue order whatever the order ticked: ' + JSON.stringify(order.state().lanes))
  assert.deepStrictEqual(batchOf(order), { members: [S03, S04], stopBefore: null, by: 'pick' }, 'the batch records the picks with by pick: ' + JSON.stringify(order.state().batch))
  assert.ok(!first.stdout.includes('⏭'), 'no pick lies past a boundary, so no left-for-later line: ' + first.stdout)
  const shared = fanoutHost({ briefed: true })
  shared.pick([S03, S06])
  assert.deepStrictEqual(lanesOf(shared), [['L1', S03, 'planned'], ['L2', S06, 'waiting']], 'a shared-brief pick waits, never planned beside its sibling: ' + JSON.stringify(shared.state().lanes))
  assert.strictEqual(shared.lane('L2').waitingOn, 'shared brief 32', 'the waiting pick names what it waits on: ' + JSON.stringify(shared.lane('L2')))
  const adhoc = fanoutHost()
  adhoc.pick([S04, S03, S06])
  assert.deepStrictEqual(lanesOf(adhoc), [['L1', S03, 'planned'], ['L2', S04, 'planned'], ['L3', S06, 'planned']], 'ad-hoc specs sharing src/shared.js are all planned in queue order, or File Plan overlap still holds a pick back: ' + JSON.stringify(adhoc.state().lanes))
  for (const [what, opts, picks, want, tail = ''] of [
    ['a self-surface pick is tabled like any other, as the bare run tables it', { selfSurface: true }, [S03, S08S], [['L1', S03, 'planned'], ['L2', S08S, 'planned']]],
    ['a self-surface spec picked alone is a one-lane batch', { selfSurface: true }, [S08S], [['L1', S08S, 'planned']], 'the whole pick'],
    ['a critical pick sharing a Risk Tiers path is tabled like any other', { critical: true }, [S03, S08C], [['L1', S03, 'planned'], ['L2', S08C, 'planned']]],
  ]) {
    const h = fanoutHost({ briefed: true, ...opts })
    const x = h.pick(picks)
    assert.deepStrictEqual(lanesOf(h), want, what + ': ' + JSON.stringify(h.state().lanes))
    assert.ok(!x.stdout.includes('⏭') && batchOf(h).stopBefore === null && x.stdout.includes(tail), what + ' and ends no batch: ' + x.stdout)
  }
  const dep = fanoutHost({ briefed: true, dependent: true })
  const xd = dep.pick([S03, specRel('07-d')])
  assert.deepStrictEqual(lanesOf(dep), [['L1', S03, 'planned']], 'a pick whose brief depends on a member is never tabled: ' + JSON.stringify(dep.state().lanes))
  assert.deepStrictEqual(batchOf(dep).stopBefore, { path: specRel('07-d'), reason: DEP_REASON }, 'the dependent pick ends the batch with the bare run\'s reason: ' + JSON.stringify(dep.state().batch))
  assert.ok(xd.stdout.includes('⏭ left for a later run: 07-d'), 'the pick left out is named, or it vanishes without a word: ' + xd.stdout)
})

test('AC-20261102-03-22: a listed spec on a shared brief waits and is planned when its predecessor merges, and the next bare run dispatches it', () => {
  const h = fanoutHost({ briefed: true })
  h.pickPlan([S03, S06])
  const st = h.state()
  assert.strictEqual(st.lanes[0].state, 'planned', 'L1 = 03-x starts planned')
  assert.deepStrictEqual([st.lanes[1].spec, st.lanes[1].state, st.lanes[1].waitingOn], [S06, 'waiting', 'shared brief 32'], 'L2 = 06-y waits on the shared brief, or two specs of one brief build at once: ' + JSON.stringify(st.lanes[1]))
  h.dispatch('L1', 'lane-one')
  h.closeLane('03-x')
  h.must(['--mark', 'returned', '--lane', 'L1'])
  assert.strictEqual(h.lane('L1').state, 'merge-ready', 'a closed review sidecar makes the lane merge-ready')
  h.mergeLane('03-x', { markDone: true })
  h.must(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(h.lane('L2').state, 'planned', 'the merge must flip the waiting lane to planned in the same mark: ' + JSON.stringify(h.state().lanes))
  const next = h.must([])
  assert.ok(next.stdout.includes('## Step: dispatch 1 lanes'), 'the next bare run dispatches the freed lane: ' + next.stdout)
  assert.ok(next.stdout.includes(S06), 'the dispatch names 06-y: ' + next.stdout)
})

test('AC-20261102-03-22: a waiting spec whose predecessor stopped is reported as not started with no lane tabled for the unlisted spec and the run reaches REPORT, AC-20261103-06-17, AC-20261103-10-9', () => {
  const h = fanoutHost({ briefed: true })
  h.pickPlan([S03, S06])
  h.dispatch('L1', 'lane-one')
  h.must(['--mark', 'returned', '--lane', 'L1', '--stopped', 'worker gone'])
  assert.ok(!h.state().lanes.some((l) => l.spec === S04), 'a spec outside the pick must never be tabled, or a stopped run quietly widens: ' + JSON.stringify(h.state().lanes))
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: report'), 'with the only runnable lane stopped the run must reach REPORT, or the waiting lane hangs the session: ' + r.stdout)
  const slots = JSON.parse(bytes(h.reportFile))
  assert.ok(slots.bullets.includes(S06 + ': not started — waited on ' + S03 + ', which stopped'), 'the report must say the waiting spec never started and why: ' + JSON.stringify(slots.bullets))
})

test('AC-20261103-10-8 / AC-20261103-15-6: on the ad-hoc default fixture a lane sharing a File Plan row with a stopped lane is tabled planned beside it and never reported as waiting on the stopped lane', () => {
  const h = fanoutHost()
  h.pickPlan([S03, S06, S04])
  assert.deepStrictEqual(h.state().lanes.map((l) => [l.id, l.spec, l.state, l.waitingOn || null]), [['L1', S03, 'planned', null], ['L2', S04, 'planned', null], ['L3', S06, 'planned', null]], 'two ad-hoc specs sharing src/shared.js must both be planned, or the File Plan overlap still serializes the fan-out: ' + JSON.stringify(h.state().lanes))
  h.dispatchAll('L1', 'L2', 'L3')
  h.must(['--mark', 'returned', '--lane', 'L1', '--stopped', 'worker gone'])
  h.must(['--mark', 'returned', '--lane', 'L3', '--stopped', 'worker gone'])
  landLane(h, '04-z', 'L2')
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: report'), 'with L1 and L3 stopped and L2 merged the run must reach REPORT: ' + r.stdout)
  const bullets = JSON.parse(bytes(h.reportFile)).bullets
  assert.ok(!bullets.some((b) => b.includes('not started')), 'no ad-hoc lane waits on anything, so none may be reported as not started: ' + JSON.stringify(bullets))
})

test('AC-20261103-10-17: the fixture writes ad-hoc specs with File Plan rows by default, the briefed opt restores the brief stamps, and dependent without briefed throws', () => {
  const d = fanoutHost()
  const x = bytes(path.join(d.root, S03))
  assert.match(x, /^brief: n\/a$/m, 'the default 03-x must be an ad-hoc spec, or the ad-hoc path is not the default every new test walks: ' + x)
  assert.ok(x.includes('src/shared.js'), 'the default 03-x must carry the shared File Plan row that keeps the lane topology: ' + x)
  const lanes = JSON.parse(d.status(['--lanes', '--json']).stdout)
  assert.deepStrictEqual(lanes.lanes.map((l) => l.path), [S03, S04, S06], 'the default topology must admit 03-x, 04-z and 06-y as lanes, File Plan overlap holding nothing back: ' + JSON.stringify(lanes))
  assert.deepStrictEqual(lanes.serialized, [], '06-y shares src/shared.js with 03-x and must still be a lane, or File Plan overlap serializes the fan-out: ' + JSON.stringify(lanes.serialized))
  const b = fanoutHost({ briefed: true })
  assert.match(bytes(path.join(b.root, S03)), /^brief: 32$/m, 'briefed: true must write the brief stamp, or the shared-brief tests lose their fixture')
  const bl = JSON.parse(b.status(['--lanes', '--json']).stdout)
  assert.strictEqual(bl.serialized[0].reason, 'shared brief 32', 'the briefed fixture must serialize 06-y on the shared brief: ' + JSON.stringify(bl.serialized))
  assert.throws(() => fanoutHost({ dependent: true }), /dependent needs briefed: true/, 'a brief-level dependency on an ad-hoc fixture must be refused, or the opt silently builds nothing it names')
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

test('AC-20261102-03-9 / AC-20261103-04-12 / AC-20261103-09-8: the planned mark prints DISPATCH with no AskUserQuestion block and the standing mark is refused with the remaining marks listed, the picked mark among them', () => {
  const h = fanoutHost()
  const r = h.plan()
  assert.match(r.stdout, /state: DISPATCH/, 'the planned mark leaves the run in DISPATCH: ' + r.stdout)
  assert.strictEqual(askBlocks(r.stdout).length, 0, 'no standing sheet is asked any more, or the host policy answers nothing: ' + r.stdout)
  const std = h.run(['--mark', 'standing'])
  assert.strictEqual(std.status, 2, 'the retired standing mark must be refused: ' + std.stdout)
  assert.match(std.stderr, /marks are planned, picked, dispatched/, 'the refusal lists the marks without standing and with picked, or the session cannot find the pick mark: ' + std.stderr)
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
  assert.deepStrictEqual([l.state, l.worktree, l.question], ['pending', pend.wt('03-x'), pend.pendingPath('03-x')], 'a pending file in the lane worktree makes the lane pending and records where: ' + JSON.stringify(l))

  const ready = returnedHost()
  ready.sidecar('03-x', 'review', { closed: true })
  ready.must(['--mark', 'returned', '--lane', 'L1'])
  assert.strictEqual(ready.lane('L1').state, 'merge-ready', 'a closed review sidecar with no pending file is merge-ready')

  const dismissed = returnedHost()
  dismissed.sidecar('03-x', 'build', { dismissedStop: { kind: 'repair-round', at: '2026-11-02T10:00:00Z' } })
  dismissed.must(['--mark', 'returned', '--lane', 'L1'])
  assert.deepStrictEqual([dismissed.lane('L1').state, dismissed.lane('L1').stoppedReason], ['stopped', 'question dismissed'], 'a dismissed stop in the build sidecar ends the lane with that reason')

  const gone = fanoutHost()
  gone.dispatchedPair()
  gone.must(['--mark', 'returned', '--lane', 'L1'])
  assert.deepStrictEqual([gone.lane('L1').state, gone.lane('L1').stoppedReason], ['stopped', 'worktree not found'], 'a lane whose branch lives in no worktree is stopped, never re-dispatched')

  const said = returnedHost()
  said.must(['--mark', 'returned', '--lane', 'L1', '--stopped', 'worker gone'])
  assert.deepStrictEqual([said.lane('L1').state, said.lane('L1').stoppedReason], ['stopped', 'worker gone'], '--stopped records the reason given')
})

test('AC-20261102-03-12 / AC-20261103-04-13: RELAY relays a lane\'s repair-round question under the lane-prefixed header and answers nothing itself', () => {
  const h = fanoutHost()
  const cfgPath = path.join(h.root, '.claude/spec.config.json')
  fs.writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(bytes(cfgPath)), policy: { stops: { repairRound: 'ask' } } }, null, 2) + '\n')
  h.git('add', '-A')
  h.git('commit', '-q', '-m', 'host asks repairRound')
  h.pickPlan([S03])
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
  for (const stem of ['03-x', '04-z']) h.startLane(stem)
  h.writePending('03-x', dispositionsDoc(S03, 5))
  h.writePending('04-z', redFindingsDoc(S04))
  for (const id of ['L1', 'L2']) h.must(['--mark', 'returned', '--lane', id])
  const r = h.must([])
  const blocks = askBlocks(r.stdout)
  assert.deepStrictEqual(blocks.map((b) => b.questions.map((q) => q.header)), [['L1 · s0', 'L1 · s1', 'L1 · s2', 'L1 · s3'], ['L1 · s4', 'L2 · q1']], 'questions batch four to a block in lane order under lane-prefixed headers: ' + r.stdout)
  assert.ok(blocks[0].questions.every((q) => q.question.includes('03-x')), 'each question names its lane\'s spec, or the user cannot tell whose it is')
  assert.ok(blocks[1].questions[1].question.includes('04-z'), 'the second lane\'s question names its own spec')
  const file = h.readPending('03-x').questions[0]
  assert.deepStrictEqual(blocks[0].questions[0].options.map((o) => [o.label, o.description]), file.options.map((o) => [o.label, o.description]), 'options and descriptions are relayed verbatim from the file')
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
  for (const stem of ['03-x', '04-z']) h.startLane(stem)
  const bad = dispositionsDoc(S03, 1)
  bad.questions[0].options[1].description = 'ok'
  h.writePending('03-x', bad)
  h.writePending('04-z', repairRoundDoc(S04))
  for (const id of ['L1', 'L2']) h.must(['--mark', 'returned', '--lane', id])
  const r = h.must([])
  const l1 = h.lane('L1')
  assert.strictEqual(l1.state, 'stopped', 'a question failing the style gate must stop its lane: ' + JSON.stringify(l1))
  assert.ok(l1.stoppedReason.startsWith('malformed question:'), 'the reason names the malformed question: ' + l1.stoppedReason)
  assert.ok(askBlocks(r.stdout).every((b) => b.questions.every((q) => !q.header.startsWith('L1'))), 'a malformed question is never relayed: ' + r.stdout)
  const d = h.must(['--mark', 'dismissed', '--lane', 'L2'])
  assert.ok(h.readPending('04-z').dismissed && h.readPending('04-z').dismissed.at, 'the dismissal is written into the lane\'s file so its next run stops')
  assert.ok(d.stdout.includes('SendMessage {to: "lane-two"'), 'the worker is told to continue to its stop: ' + d.stdout)
})

test('AC-20261102-03-15: MERGE names only the first merge-ready lane from the main root, and a pending lane keeps the run in RELAY, and a clean lane on a moved main is rebased onto it, fast-forwarded and landed with the review driver finishing promotion (AC-20261103-15-9)', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  for (const stem of ['03-x', '04-z']) h.closeLane(stem)
  for (const id of ['L1', 'L2']) h.must(['--mark', 'returned', '--lane', id])
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: merge L1'), 'merges go in table order: ' + r.stdout)
  assert.ok(r.stdout.includes('run from ' + h.root + ': node "$(spec-paths review-driver)" ' + h.wt('03-x') + '/' + S03), 'the review driver\'s MERGE step runs from the main root on the lane\'s spec: ' + r.stdout)
  assert.ok(r.stdout.includes('git worktree unlock ' + h.wt('03-x')), 'the harness lock on the worktree is lifted before cleanup: ' + r.stdout)
  assert.ok(r.stdout.includes('--mark merged --lane L1'), 'the merged mark closes the step')
  assert.ok(!r.stdout.includes('--lane L2') && !r.stdout.includes(h.wt('04-z')), 'only one lane is merged at a time: ' + r.stdout)

  const p = fanoutHost()
  p.dispatchedPair()
  p.closeLane('03-x')
  p.startLane('04-z')
  p.writePending('04-z', repairRoundDoc(S04))
  for (const id of ['L1', 'L2']) p.must(['--mark', 'returned', '--lane', id])
  const rp = p.must([])
  assert.match(rp.stdout, /state: RELAY/, 'a pending question may change the outcome, so it is relayed before any merge: ' + rp.stdout)
  assert.ok(!rp.stdout.includes('## Step: merge'), 'no merge while a lane is pending: ' + rp.stdout)
  const m = mergeReadyHost()
  m.moveMain('other.txt', 'o\n')
  const mr = m.must([])
  const wt = m.wt('03-x')
  assert.ok(mr.stdout.includes('## Step: merge L1'), 'the bare run prints the merge step: ' + mr.stdout)
  assert.ok(mr.stdout.includes('rebased spec/03-x onto main and fast-forwarded'), 'merge-back\'s landed note is printed, or the session cannot tell the landing happened: ' + mr.stdout)
  assert.ok(mr.stdout.includes('git worktree unlock ' + wt), 'the harness lock on the worktree is lifted before cleanup: ' + mr.stdout)
  assert.ok(mr.stdout.includes('node "$(spec-paths review-driver)" ' + wt + '/' + S03 + ' — its MERGE step finds spec/03-x already landed; mark merge-strategy rebase-ff'), 'the review driver finishes promotion and cleanup on the landed branch: ' + mr.stdout)
  assert.ok(mr.stdout.includes('--mark merged --lane L1'), 'the merged mark closes the step: ' + mr.stdout)
  assert.ok(!mr.stdout.includes('strategy derived') && !mr.stdout.includes('/git:merge'), 'the session is no longer asked to choose a strategy or run the merge command: ' + mr.stdout)
  assert.strictEqual(isAncestor(m, 'spec/03-x'), 0, 'the lane branch must be contained in main after the bare run, or nothing landed: ' + mr.stdout)
  assert.strictEqual(m.git('status', '--porcelain').trim(), '', 'the main root must stay clean after the landing, or the next landing is refused')
  m.mergeLane('03-x')
  m.must(['--mark', 'merged', '--lane', 'L1'])
  assert.deepStrictEqual([m.lane('L1').state, m.lane('L1').gate], ['merged', 'green'], 'the merged mark gates main once and lands the lane')
})

// Lane L1 (03-x) merge-ready with real work on its branch, as a closed review leaves it.
function mergeReadyHost(picks = [S03], before = () => {}) {
  const h = fanoutHost()
  before(h)
  h.pickPlan(picks)
  h.dispatch('L1', 'lane-one')
  h.startLane('03-x')
  h.commitInLane('03-x', 'x.txt', 'x\n')
  h.sidecar('03-x', 'review', { closed: true })
  h.returnedOut = h.must(['--mark', 'returned', '--lane', 'L1']).stdout
  return h
}
const gitIn = (dir, ...args) => require('node:child_process').execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
const isAncestor = (h, branch) => require('node:child_process').spawnSync('git', ['-C', h.root, 'merge-base', '--is-ancestor', branch, 'HEAD']).status

test('AC-20261102-03-16 / AC-20261103-15-10 / AC-20261103-15-18: a mark that reaches MERGE prints the land-it line and runs no git, --mark merged refuses a branch that is not contained in HEAD, and for a merged one runs the host gate in the root, logs it and records green, AC-20261103-06-22', () => {
  const h = mergeReadyHost()
  assert.ok(h.returnedOut.includes('## Step: merge L1') && h.returnedOut.includes('— lands spec/03-x (rebase onto main, fast-forward)'), 'the mark must print the merge step with the land-it line, or the session is told to run a merge the driver now performs: ' + h.returnedOut)
  assert.strictEqual(isAncestor(h, 'spec/03-x'), 1, 'a mark must run no git, or the landing happens before the bare run that owns it: ' + h.returnedOut)
  const refused = h.run(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(refused.status, 2, 'an unmerged branch must be refused: ' + refused.stdout)
  assert.ok(refused.stderr.includes('fanout-driver: lane L1 is not merged — run the MERGE step first'), 'the refusal names the remedy: ' + refused.stderr)
  h.mergeLane('03-x', { markDone: true })
  h.must(['--mark', 'merged', '--lane', 'L1'])
  assert.ok(fs.existsSync(path.join(h.common, 'spec-fanout', 'L1.gate.log')), 'the gate output is kept for the report and the queue line')
  assert.strictEqual(bytes(path.join(h.root, '.gate-cwd')).trim(), h.root, 'the gate runs with the main root as its cwd, or it judges the wrong tree')
  assert.deepStrictEqual([h.lane('L1').gate, h.lane('L1').state], ['green', 'merged'], 'a green gate lands the lane as merged')
})

test('AC-20261102-03-17: a red gate after a merge enters MERGE_RED, queues the fix, refuses every further merge, and gate-repaired clears it, AC-20261103-08-14', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  for (const stem of ['03-x', '04-z']) h.closeLane(stem)
  for (const id of ['L1', 'L2']) h.must(['--mark', 'returned', '--lane', id])
  h.mergeLane('03-x', { markDone: true })
  h.mergeLane('04-z', { markDone: true, cleanup: false })
  h.gateRed(true)
  const r = h.run(['--mark', 'merged', '--lane', 'L1'])
  const log = path.join(h.common, 'spec-fanout', 'L1.gate.log')
  assert.ok(r.stdout.includes('## MERGE_RED — main gate red after L1'), 'the red gate stops the queue with its own header: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes(log), 'the log path is printed: ' + r.stdout)
  assert.ok(r.stdout.includes('node "$(spec-paths spec-queue)" add "main gate red after merging L1: ' + log + '" --lane fix --top'), 'the repair is queued on top: ' + r.stdout)
  assert.ok(r.stdout.includes('--top --origin ' + S03 + ' --stage fanout --trigger gate-red'), 'the printed add line must carry the red lane\'s origin, the fanout stage and the gate-red trigger, or the birth cannot be tied to this run: ' + r.stdout)
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

test('AC-20261102-03-18 / AC-20261103-04-15 / AC-20261103-06-19 / AC-20261103-14-8: a recorded pick prints the picked line, the fix group and by pick and moves --state PICK, PLAN, DISPATCH, then REPORT writes the slots with the merged and stopped bullets, the policy-applied trail and no batch-stopped warn, prints the render line, and the reported mark deletes the state', () => {
  const fx = fanoutHost({ briefed: true, fixes: true })
  const stateOf = (x) => x.must(['--state']).stdout
  fx.must(['--pick'])
  assert.match(stateOf(fx), /\bPICK\b/, '--state after --pick must say PICK, or a resumed session cannot tell the question is open')
  const picked = fx.must(['--mark', 'picked', '--label', 'x'])
  assert.ok(picked.stdout.includes('✅ Picked batch: 03-x — the whole pick'), 'the PLAN step must print the picked line in the 📌 line\'s place: ' + picked.stdout)
  assert.match(picked.stdout, /Then: node .*fanout-driver.* --mark planned/, 'the picked step ends with the planned mark: ' + picked.stdout)
  assert.deepStrictEqual(fx.state().lanes.map((l) => [l.id, l.spec || l.branch]), [['L1', S03], ['F1', 'fix/q107'], ['F2', 'fix/q116']], 'the fix group is appended to the pick: ' + JSON.stringify(fx.state().lanes))
  assert.deepStrictEqual(fx.state().batch, { members: [S03], stopBefore: null, by: 'pick' }, 'the batch records by pick: ' + JSON.stringify(fx.state().batch))
  assert.deepStrictEqual(fx.state().pick.chosen, ['x'], 'the chosen labels are recorded, or a resumed session loses what was ticked: ' + JSON.stringify(fx.state().pick))
  assert.match(stateOf(fx), /\bPLAN\b/, '--state after the picked mark must say PLAN')
  fx.must(['--mark', 'planned'])
  assert.match(stateOf(fx), /\bDISPATCH\b/, '--state after the planned mark must say DISPATCH')
  const h = fanoutHost()
  h.pick([S03, S04])
  assert.deepStrictEqual(batchOf(h), { members: [S03, S04], stopBefore: null, by: 'pick' }, 'the pick must record exactly the ticked specs as the batch with no boundary, or REPORT cannot tell a picked run from a derived one: ' + JSON.stringify(h.state().batch))
  h.must(['--mark', 'planned'])
  h.dispatchAll('L1', 'L2')
  for (const stem of ['03-x', '04-z']) h.startLane(stem)
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
  assert.ok(!slots.warns.some((w) => w.startsWith('batch stopped')), 'a picked batch has no boundary, so REPORT carries no batch-stopped warn: ' + JSON.stringify(slots.warns))
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
  for (const stem of ['03-x', '04-z']) h.startLane(stem)
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

test('q28: --mark returned lands a lane stopped on the laneExit its driver recorded even after the lane deleted the sidecar as its step instructed', () => {
  const h = fanoutHost()
  h.dispatchedPair()
  const wt = h.startLane('03-x')
  const pq = require(path.join(SPEC, 'scripts/pending-question.js'))
  assert.ok(pq.isDelegated(wt), 'setup precondition: a lane listed in the fan-out table is delegated')
  const queued = '03-x: review escalated at the fix cap — 2 open findings'
  const marks = {}
  pq.recordLaneExit(wt, marks, { reason: 'review escalated at the fix cap — 2 open findings', queued })
  h.sidecar('03-x', 'review', marks)
  fs.rmSync(path.join(wt, 'specs/20261102/03-x.review'), { recursive: true, force: true })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  const l = h.lane('L1')
  assert.deepStrictEqual([l.state, l.stoppedReason], ['stopped', 'review escalated at the fix cap — 2 open findings'], 'a lane that followed its own `delete <sidecar>` must still land on its recorded exit, never "without a recognised stop": ' + JSON.stringify(l))
  assert.ok((h.state().queued || []).includes(queued), 'the queue subject must reach st.queued so the report names the repair: ' + JSON.stringify(h.state().queued))
})

test('AC-20261102-03-17: with the gate red after a merge and another lane pending on a question, the next bare run relays the question instead of printing MERGE_RED, and a merge-ready lane is still refused until gate-repaired, AC-20261103-06-23', () => {
  const h = fanoutHost()
  h.pickPlan([S03, S04, S06])
  h.dispatchAll('L1', 'L2', 'L3')
  for (const stem of ['03-x', '04-z', '06-y']) h.startLane(stem)
  for (const [stem, id] of [['03-x', 'L1'], ['06-y', 'L3']]) {
    h.closeLane(stem)
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

// Two fix lanes and no run lanes: every spec is done, so the bare run tables the fix group alone —
// F1 = queued item q107 (branch fix/q107), F2 = queued item q116.
function fixOnlyHost() {
  const h = fanoutHost({ fixes: true })
  h.markDone('03-x', '04-z', '06-y')
  h.admit()
  return h
}

// F1 is dispatched, committed in its own worktree, returned merge-ready and merged into main; F2 is left planned.
function fixMergedHost() {
  const h = fixOnlyHost()
  h.dispatch('F1', 'fix-one')
  h.git('worktree', 'add', '-q', '-b', 'fix/q107', h.wt('q107'))
  h.commitInLane('q107', 'fix.txt', 'fix\n')
  h.must(['--mark', 'returned', '--lane', 'F1'])
  assert.strictEqual(h.lane('F1').state, 'merge-ready', 'the setup needs F1 merge-ready')
  h.git('merge', '-q', '--no-ff', '-m', 'merge fix/q107', 'fix/q107')
  return h
}

test('fanout: a red gate after merging a fix lane (AC-20261103-06-21 / AC-20261103-08-15) prints MERGE_RED on that same mark, never a dispatch block for the next planned fix lane', () => {
  const h = fixMergedHost()
  h.gateRed(true)
  const r = h.run(['--mark', 'merged', '--lane', 'F1'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes('## MERGE_RED — main gate red after F1'), 'a red main must stop the queue at once: ' + r.stdout)
  assert.ok(!r.stdout.includes('## Step: dispatch'), 'F2 must never be dispatched onto a red main: ' + r.stdout)
  assert.match(r.stdout, /--top --trigger gate-red$/m, 'a queued fix lane has no spec, so its add line carries the trigger only: ' + r.stdout)
  const addLine = r.stdout.split('\n').find((x) => x.includes('add "main gate red after merging F1'))
  assert.ok(addLine && !addLine.includes('--stage') && !addLine.includes('--origin'), 'a spec-less lane passes neither --origin nor --stage: ' + addLine)
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

// L1 (03-x) closed, returned and merged into a main whose gate is red; returns the --mark merged result.
const redMerge = (h, beforeMark = () => {}) => {
  h.closeLane('03-x')
  h.must(['--mark', 'returned', '--lane', 'L1'])
  h.mergeLane('03-x', { markDone: true })
  h.gateRed(true)
  beforeMark()
  return h.run(['--mark', 'merged', '--lane', 'L1'])
}
const pinLine = (members, tail) => '📌 Auto-picked batch: ' + members + ' — ' + tail + ' (veto:'
const DEP_REASON = 'blocked: brief 34 depends on 32'

test('AC-20261103-06-9 / AC-20261103-14-15 / AC-20261103-15-7: a bare run prints the derived batch as one 📌 line before the table, tables a spec naming the driver and a critical spec sharing a Risk Tiers path like any other, and records the batch with no boundary', () => {
  const h = fanoutHost({ briefed: true, selfSurface: true })
  const r = h.must([])
  const line = pinLine('03-x, 06-y, 04-z, 08-s', 'the whole queue')
  assert.ok(r.stdout.includes(line), 'the PLAN step must print the whole queue as one vetoable line, or a spec naming the driver still ends the batch: ' + r.stdout)
  assert.ok(r.stdout.indexOf(line) < r.stdout.indexOf('L1 '), 'the 📌 line must come ahead of the table, or the veto is read after the plan is already shown: ' + r.stdout)
  const st = h.state()
  assert.deepStrictEqual(st.lanes.map((l) => [l.id, l.spec, l.state]), [['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned'], ['L4', S08S, 'planned']], 'the batch members must be tabled in queue order, the shared-brief member waiting and the driver-naming spec planned: ' + JSON.stringify(st.lanes))
  assert.strictEqual(st.lanes[1].waitingOn, 'shared brief 32', 'the waiting member must name what it waits on: ' + JSON.stringify(st.lanes[1]))
  assert.deepStrictEqual(batchOf(h), { members: [S03, S06, S04, S08S], stopBefore: null, by: 'derived' }, 'the state must record the derived batch with no boundary, or a self-surface spec still serializes the fan-out: ' + JSON.stringify(st.batch))
  const crit = fanoutHost({ briefed: true, critical: true })
  crit.must([])
  assert.ok(batchOf(crit).members.includes(S08C), 'a critical spec sharing a Risk Tiers path with a member must be tabled, or the critical boundary still ends the batch: ' + JSON.stringify(crit.state().batch))
  assert.strictEqual(batchOf(crit).stopBefore, null, 'no boundary is met when shared files hold nothing back: ' + JSON.stringify(crit.state().batch))
})

test('AC-20261103-06-12: a blocked entry ends the batch with its first blocker and a planning item ends it with the action that heads the queue', () => {
  const blocked = fanoutHost({ blocked: true })
  blocked.must([])
  assert.deepStrictEqual(batchOf(blocked).stopBefore, { path: S08K, reason: 'blocked: specs/20261102/03-x.md (hardened)' }, 'a spec whose dependency this batch cannot meet must end the batch with the blocker named: ' + JSON.stringify(blocked.state().batch))
  const draft = fanoutHost({ draft: true })
  draft.must([])
  assert.deepStrictEqual(batchOf(draft).stopBefore, { path: specRel('08-p'), reason: '/spec:plan item heads the queue' }, 'a planning item must end the batch, because the planner is attended: ' + JSON.stringify(draft.state().batch))
})

test('AC-20261103-06-13: --batch all ticks every candidate to one batch becomes AC-20261103-14-6: --mark picked with no label, an unknown label or --mark planned on a pick-state file exits 2 naming the remedy and leaves the file byte-identical', () => {
  const h = fanoutHost({ briefed: true })
  h.must(['--pick'])
  const before = bytes(h.stateFile)
  const cases = [[['--mark', 'picked'], 'nothing picked — tick at least one box, or delete ' + h.stateFile + ' and run bare for the derived batch'], [['--mark', 'picked', '--label', 'nope'], 'label "nope" matches no candidate — labels are: x, y, z'], [['--mark', 'planned'], 'the batch is not picked yet — answer the pick question, then run --mark picked'],]
  for (const [args, msg] of cases) {
    const r = h.run(args)
    assert.strictEqual(r.status, 2, args.join(' ') + ' must exit 2, or a half-answered pick plans a batch: ' + r.stdout)
    assert.ok(r.stderr.includes(msg), 'stderr must carry "' + msg + '", or the user is not told the remedy: ' + r.stderr)
    assert.strictEqual(bytes(h.stateFile), before, 'a refused mark must leave the pick-state file byte-identical, or a typo corrupts the question')
  }
  h.must(['--mark', 'picked', '--label', 'z', '--label', 'y', '--label', 'x'])
  assert.deepStrictEqual(h.state().lanes.map((l) => [l.id, l.spec, l.state]), [['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned']], 'ticking every box tables the whole queue in queue order whatever the label order, the shared-brief pick waiting: ' + JSON.stringify(h.state().lanes))
})

const BORN = { origin: S03, stage: 'review', trigger: 'close-followup' }

test('AC-20261103-06-15 / AC-20261103-08-9 / AC-20261103-14-3: a bare run tables every pending fix item at PLAN with the gated one waiting, and a green merge promotes it, appends the fix born of the merged member once and leaves the batch\'s waiting lane planned', () => {
  const h = fanoutHost({ bornFix: true })
  h.must([])
  const fixesOf = () => h.state().lanes.filter((l) => l.kind === 'fix')
  assert.deepStrictEqual(fixesOf().map((l) => [l.id, l.queueId, l.state]), [['F1', 'q109', 'planned'], ['F2', 'q110', 'planned'], ['F3', 'q111', 'planned'], ['F4', 'q108', 'waiting']], 'every pending fix item must be tabled at PLAN in the fix group, or the pre-existing queued fixes are silently left out of a bare run: ' + JSON.stringify(h.state().lanes))
  assert.strictEqual(fixesOf()[3].waitingOn, 'after ' + S03 + ' (hardened)', 'the gated item waits on its blocker: ' + JSON.stringify(fixesOf()[3]))
  h.must(['--mark', 'planned'])
  const [l1, l2] = [idOf(h, S03), idOf(h, S06)]
  const born = h.born('fix export after x', BORN)
  h.dispatch(l1, 'lane-one')
  landLane(h, '03-x', l1)
  const lanes = h.state().lanes
  const f5 = lanes.find((l) => l.id === 'F5')
  assert.ok(f5, 'the fix born of the merged member must join the batch on that merge as the next fix lane: ' + JSON.stringify(lanes.map((l) => [l.id, l.queueId])))
  assert.deepStrictEqual([f5.kind, f5.branch, f5.queueId, f5.state], ['fix', 'fix/' + born, born, 'planned'], 'the born fix is a planned fix lane on its own branch: ' + JSON.stringify(f5))
  assert.deepStrictEqual(fixesOf().map((l) => l.queueId), ['q109', 'q110', 'q111', 'q108', born], 'the fix queue is the tabled items then the born one, once: ' + JSON.stringify(lanes))
  assert.strictEqual(h.lane('F4').state, 'planned', 'the merge that meets q108\'s gate must promote it: ' + JSON.stringify(h.lane('F4')))
  assert.strictEqual(h.lane(l2).state, 'planned', 'the same merge must promote the waiting shared-brief lane: ' + JSON.stringify(h.lane(l2)))
})

test('AC-20261103-06-16 / AC-20261103-08-9: a born fix is appended once across later merges, the fix group is dispatched one lane at a time once every run lane is terminal, and a born fix joins a picked run the same way', () => {
  const h = fanoutHost({ bornFix: true })
  h.admit()
  const [l1, l2, l3] = [idOf(h, S03), idOf(h, S06), idOf(h, S04)]
  const born = h.born('fix export after x', BORN)
  h.dispatchAll(l1, l3)
  landLane(h, '03-x', l1)
  assert.strictEqual(h.state().lanes.filter((l) => l.queueId === born).length, 1, 'the first landing must append the born fix: ' + JSON.stringify(h.state().lanes))
  h.dispatch(l2, 'lane-two')
  landLane(h, '04-z', l3)
  assert.strictEqual(h.state().lanes.filter((l) => l.queueId === born).length, 1, 'a later merge must not append the same queue item a second time: ' + JSON.stringify(h.state().lanes))
  landLane(h, '06-y', l2)
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: dispatch 1 lanes') && r.stdout.includes('fix q109'), 'with every run lane terminal the fix group is dispatched alone, in table order: ' + r.stdout)
  assert.ok(!r.stdout.includes('fix q108') && !r.stdout.includes('fix ' + born), 'a file-less fix waits for the one ahead of it, so only one is dispatched: ' + r.stdout)
  const s = fanoutHost({ bornFix: true })
  s.pickPlan([S03])
  const sb = s.born('fix export after x', BORN)
  s.dispatch('L1', 'lane-one')
  landLane(s, '03-x', 'L1')
  assert.deepStrictEqual(s.state().lanes.filter((l) => l.queueId === sb).map((l) => [l.kind, l.branch, l.state]), [['fix', 'fix/' + sb, 'planned']], 'a picked run admits a birth by its origin exactly as a bare run does: ' + JSON.stringify(s.state().lanes))
})

test('AC-20261103-08-10: a birth by a lane still running, another run\'s birth and a birth by a fix lane all wait, while the birth of a landed member joins once', () => {
  const h = fanoutHost({ bornFix: true })
  h.plan()
  const first = h.born('fix export after x', BORN)
  h.dispatchAll('L1', 'L2')
  landLane(h, '03-x', 'L1')
  h.startFixLane(first)
  const a = h.born('after z', { origin: S04, stage: 'review', trigger: 'close-followup' })
  const c = h.born('from the fix lane', { cwd: h.wt(first) })
  const r = landLane(h, '04-z', 'L2')
  assert.deepStrictEqual(h.state().lanes.filter((l) => l.kind === 'fix').map((l) => l.queueId), ['q109', 'q110', 'q111', 'q108', first, a], 'beside the items tabled at PLAN only A (born of 04-z, merged now) joins; the fix lane\'s own birth waits: ' + JSON.stringify(h.state().lanes))
  const f2 = h.state().lanes.find((l) => l.queueId === a)
  assert.deepStrictEqual([f2.kind, f2.branch, f2.queueId, f2.state], ['fix', 'fix/' + a, a, 'planned'], 'A is a planned fix lane: ' + JSON.stringify(f2))
  assert.ok(!r.stdout.includes(c), 'a birth that waits is left in the queue with no note naming ' + c + ': ' + r.stdout)
  const item = JSON.parse(bytes(path.join(h.common, 'spec-queue.json'))).items.find((i) => i.id === c)
  assert.ok(item && item.batch && !('origin' in item), 'a birth by a spec-less fix lane carries the batch and no origin: ' + JSON.stringify(item))
})

test('AC-20261103-08-11: a green gate-repaired ticks this run\'s gate-red birth, leaves another run\'s gate-red item pending, and prints no failed-tick warning', () => {
  const h = fanoutHost({ bornFix: true })
  h.plan()
  h.dispatch('L1', 'lane-one')
  const red = redMerge(h)
  assert.ok(red.stdout.includes('## MERGE_RED'), 'the setup needs a red main: ' + red.stdout)
  const id = h.born('main gate red after merging L1: ' + h.state().lastGate.log, { origin: S03, stage: 'fanout', trigger: 'gate-red' })
  h.gateRed(false)
  const r = h.must(['--mark', 'gate-repaired'])
  const show = runNode('scripts/spec-queue.js', ['show', id], { cwd: h.root })
  assert.match(show.stdout, /done \(archived\)/, 'the green gate must tick this run\'s gate-red birth, or the next run reads a repaired main as still broken: ' + show.stdout + show.stderr)
  const live = JSON.parse(bytes(path.join(h.common, 'spec-queue.json'))).items.filter((i) => i.lane === 'fix').map((i) => i.id)
  assert.deepStrictEqual(live, ['q108', 'q109', 'q110', 'q111'], 'another run\'s gate-red item q111 must stay pending: ' + JSON.stringify(live))
  assert.ok(!(r.stdout + r.stderr).includes('spec-queue done'), 'a clean tick prints no warning: ' + r.stdout + r.stderr)
})

test('AC-20261103-08-18: REPORT leads queued with this run\'s births, a plan birth first, drops the st.queued string a birth duplicates, and equals st.queued when nothing was born', () => {
  const SUBJECT = S03 + ': review stopped, repair round spent'
  const stage = (h) => {
    h.plan()
    h.dispatchAll('L1', 'L2')
    h.startLane('03-x')
    h.sidecar('03-x', 'review', { laneExit: { reason: 'review stopped, repair round spent', queued: SUBJECT, at: '2026-11-03T10:00:00Z' } })
    h.must(['--mark', 'returned', '--lane', 'L1'])
  }
  const h = fanoutHost()
  stage(h)
  const f = h.born(SUBJECT, { origin: S03, stage: 'review', trigger: 'red-leg' })
  const p = h.born('split the queue render', { lane: 'plan', origin: S03, stage: 'plan', trigger: 'gap' })
  h.must(['--mark', 'returned', '--lane', 'L2', '--stopped', 'worker gone'])
  assert.ok(h.must([]).stdout.includes('## Step: report'), 'every lane terminal means REPORT')
  assert.deepStrictEqual(JSON.parse(bytes(h.reportFile)).queued, [p + '  /spec:plan split the queue render  ↳ from ' + S03 + ' (gap)', f + '  /spec:fix ' + SUBJECT + '  ↳ from ' + S03 + ' (red-leg)',], 'births must lead the slot, plan first, with the duplicate st.queued string dropped, or the REPORT hides why each item exists')
  const n = fanoutHost()
  stage(n)
  n.must(['--mark', 'returned', '--lane', 'L2', '--stopped', 'worker gone'])
  n.must([])
  assert.deepStrictEqual(JSON.parse(bytes(n.reportFile)).queued, [SUBJECT], 'with no births the slot must stay byte-identical to st.queued')
})

const PLAN_REASON = '/spec:plan item heads the queue'

test('AC-20261103-08-21: a queue plan item ends the batch after every startable spec, is named first in REPORT with its origin line, and holds no spec back', () => {
  const h = fanoutHost({ briefed: true, planItem: true })
  const r = h.must([])
  assert.ok(r.stdout.includes(pinLine('03-x, 06-y, 04-z', 'stops before q112 (' + PLAN_REASON + ')')), 'the batch must hold every startable spec and stop before the plan item: ' + r.stdout)
  assert.deepStrictEqual(h.state().lanes.map((l) => [l.id, l.spec, l.state]), [['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned']], 'a plan item at the head must hold no spec back: ' + JSON.stringify(h.state().lanes))
  assert.deepStrictEqual(batchOf(h).stopBefore, { path: 'q112', reason: PLAN_REASON }, 'the boundary is the item id: ' + JSON.stringify(h.state().batch))
  h.must(['--mark', 'planned'])
  h.dispatchAll('L1', 'L3')
  landLane(h, '03-x', 'L1')
  h.dispatch('L2', 'lane-two')
  h.must(['--mark', 'returned', '--lane', 'L2', '--stopped', 'worker gone'])
  landLane(h, '04-z', 'L3')
  assert.ok(h.must([]).stdout.includes('## Step: report'), 'every lane terminal means REPORT')
  const slots = JSON.parse(bytes(h.reportFile))
  assert.strictEqual(slots.bullets[0], 'q112  /spec:plan re-plan ' + specRel('01-base') + ': the export contract heads the queue — ' + PLAN_REASON + '; run it attended', 'the attended item heads the bullets: ' + JSON.stringify(slots.bullets))
  assert.strictEqual(slots.bullets[1], '   ↳ from ' + specRel('01-base') + ' (gap)', 'its origin line follows it: ' + JSON.stringify(slots.bullets))
  assert.ok(slots.warns.includes('batch stopped before q112 — ' + PLAN_REASON + '; the next bare run starts the next batch'), 'the warn names the item the batch stopped before: ' + JSON.stringify(slots.warns))
})

const fixLane = (h, q) => h.state().lanes.find((l) => l.queueId === q)

test('AC-20261103-08-22 / AC-20261103-14-16: a fix naming files runs beside the run lanes it does not overlap and after the one it does, and a fix naming none waits for every lane', () => {
  const h = fanoutHost({ briefed: true, fixFiles: true })
  const first = h.admit()
  assert.deepStrictEqual([fixLane(h, 'q113').files, fixLane(h, 'q113').overlaps], [['src/b.js'], []], 'q113 names a file no open spec plans: ' + JSON.stringify(fixLane(h, 'q113')))
  assert.deepStrictEqual([fixLane(h, 'q114').files, fixLane(h, 'q114').overlaps], [['src/shared.js'], [S03]], 'q114 names a file 03-x plans: ' + JSON.stringify(fixLane(h, 'q114')))
  assert.strictEqual(fixLane(h, 'q107').files, null, 'q107 names no file: ' + JSON.stringify(fixLane(h, 'q107')))
  assert.ok(first.stdout.includes('## Step: dispatch 3 lanes') && first.stdout.includes(S03) && first.stdout.includes(S04) && first.stdout.includes('fix q113'), 'the disjoint fix is dispatched beside the run lanes: ' + first.stdout)
  assert.ok(!first.stdout.includes('fix q114') && !first.stdout.includes('fix q107'), 'the overlapping fix and the file-less fix wait: ' + first.stdout)
  const [l1, l2, l3] = [idOf(h, S03), idOf(h, S06), idOf(h, S04)]
  const [f13, f14] = [fixLane(h, 'q113').id, fixLane(h, 'q114').id]
  h.dispatchAll(l1, l3)
  h.dispatch(f13, 'fix-one')
  const after = landLane(h, '03-x', l1)
  assert.ok(after.stdout.includes('## Step: dispatch 2 lanes') && after.stdout.includes(S06) && after.stdout.includes('fix q114'), 'once 03-x has merged its overlapping fix is free: ' + after.stdout)
  assert.ok(!after.stdout.includes('fix q107'), 'the file-less fix still waits for every lane: ' + after.stdout)
  h.dispatch(l2, 'lane-two')
  h.dispatch(f14, 'fix-two')
  landLane(h, '04-z', l3)
  landLane(h, '06-y', l2)
  assert.match(h.must([]).stdout, /state: WAIT/, 'run lanes terminal and fix lanes active means WAIT, never a file-less dispatch: ' + JSON.stringify(h.state().lanes.map((l) => l.state)))
  const mid = h.must(['--mark', 'returned', '--lane', f13, '--stopped', 'done by hand'])
  assert.ok(!mid.stdout.includes('fix q107'), 'one fix lane still active, so q107 still waits: ' + mid.stdout)
  const last = h.must(['--mark', 'returned', '--lane', f14, '--stopped', 'done by hand'])
  assert.ok(last.stdout.includes('fix q107'), 'the mark that makes every fix lane terminal dispatches q107: ' + last.stdout)
})

test('AC-20261103-08-23: a gated fix is tabled waiting in the fix group, never dispatched, reported as not started when its gate stopped, and promoted when its gate is met', () => {
  const stage = () => {
    const h = fanoutHost({ gatedFix: true })
    const planned = h.admit()
    const q = fixLane(h, 'q115')
    assert.deepStrictEqual(q && [q.kind, q.branch, q.queueId, q.state, q.waitingOn], ['fix', 'fix/q115', 'q115', 'waiting', 'after ' + S04 + ' (hardened)'], 'the unmet gate tables the fix waiting: ' + JSON.stringify(h.state().lanes))
    assert.ok(!planned.stdout.includes('fix q115'), 'a waiting fix is never printed under dispatch: ' + planned.stdout)
    return h
  }
  const stopped = stage()
  const [a, b, c] = [idOf(stopped, S03), idOf(stopped, S06), idOf(stopped, S04)]
  stopped.dispatchAll(a, c)
  landLane(stopped, '03-x', a)
  stopped.dispatch(b, 'lane-two')
  landLane(stopped, '06-y', b)
  stopped.must(['--mark', 'returned', '--lane', c, '--stopped', 'worker gone'])
  assert.ok(stopped.must([]).stdout.includes('## Step: report'), 'a gate that stopped leaves the fix waiting and the run at REPORT')
  const bullets = JSON.parse(bytes(stopped.reportFile)).bullets
  assert.ok(bullets.includes('fix/q115: not started — waited on ' + S04 + ', which stopped'), 'REPORT names why the fix never started: ' + JSON.stringify(bullets))
  const met = stage()
  const [a2, b2, c2] = [idOf(met, S03), idOf(met, S06), idOf(met, S04)]
  met.dispatchAll(a2, c2)
  landLane(met, '03-x', a2)
  met.dispatch(b2, 'lane-two')
  landLane(met, '06-y', b2)
  const r = landLane(met, '04-z', c2)
  assert.deepStrictEqual([fixLane(met, 'q115').state, fixLane(met, 'q115').waitingOn], ['planned', null], 'the mark that merges the gate promotes the fix: ' + JSON.stringify(fixLane(met, 'q115')))
  assert.ok(r.stdout.includes('fix q115'), 'with every run lane terminal the promoted fix is dispatched: ' + r.stdout)
})

test('AC-20261103-08-24: a birth whose after gate is unmet joins only at the merge that meets the gate', () => {
  const h = fanoutHost({ bornFix: true })
  h.plan()
  const id = h.born('after z', { ...BORN, after: S04 })
  h.dispatchAll('L1', 'L2')
  landLane(h, '03-x', 'L1')
  assert.deepStrictEqual(h.state().lanes.filter((l) => l.queueId === id), [], 'its gate (04-z) is unmet, so it must not join: ' + JSON.stringify(h.state().lanes))
  landLane(h, '04-z', 'L2')
  const lanes = h.state().lanes.filter((l) => l.queueId === id)
  assert.strictEqual(lanes.length, 1, 'exactly one lane once the gate is met: ' + JSON.stringify(h.state().lanes))
  assert.deepStrictEqual([lanes[0].kind, lanes[0].branch, lanes[0].queueId, lanes[0].state], ['fix', 'fix/' + id, id, 'planned'], 'the joined lane is planned: ' + JSON.stringify(lanes[0]))
})

test('AC-20261103-08-25: a red main is repaired by a lane tabled from the gate-red birth, dispatched alone, merged and re-gated, and a still-red repair prints a fresh add line', () => {
  const redHost = () => {
    const h = fanoutHost({ bornFix: true })
    h.plan()
    h.dispatch('L1', 'lane-one')
    const red = redMerge(h, () => { h.git('add', '.gate-red'); h.git('commit', '-q', '-m', 'main goes red') })
    assert.ok(red.stdout.includes('then re-run the driver bare: the item is tabled as the repair lane and dispatched onto the red main — the one lane a red main admits'), 'MERGE_RED names the repair lane: ' + red.stdout)
    assert.ok(red.stdout.includes('--mark gate-repaired'), 'and the other way out: ' + red.stdout)
    const id = h.born('main gate red after merging L1: ' + h.state().lastGate.log, { origin: S03, stage: 'fanout', trigger: 'gate-red' })
    return { h, id }
  }
  const { h, id } = redHost()
  const d = h.must([])
  const lane = h.state().lanes.find((l) => l.queueId === id)
  assert.deepStrictEqual(lane && [lane.kind, lane.branch, lane.queueId, lane.repairs, lane.state], ['fix', 'fix/' + id, id, 'L1', 'planned'], 'the gate-red birth is tabled as the repair lane: ' + JSON.stringify(h.state().lanes))
  assert.ok(d.stdout.includes('## Step: dispatch 1 lanes') && d.stdout.includes('fix ' + id) && /state: DISPATCH/.test(d.stdout), 'the repair lane is the one lane dispatched onto the red main: ' + d.stdout)
  h.dispatch(lane.id, 'fix-repair')
  h.startFixLane(id)
  fs.rmSync(path.join(h.wt(id), '.gate-red'))
  h.commitInLane(id, 'repair.txt', 'repair\n')
  h.must(['--mark', 'returned', '--lane', lane.id])
  h.git('merge', '-q', '--no-ff', '-m', 'merge fix/' + id, 'fix/' + id)
  h.must(['--mark', 'merged', '--lane', lane.id])
  const st = h.state()
  assert.strictEqual(st.lastGate, null, 'a green re-gate of the repaired lane clears the red gate: ' + JSON.stringify(st.lastGate))
  assert.strictEqual(h.lane('L1').gate, 'green', 'the repaired lane records the green gate')
  assert.deepStrictEqual([h.lane(lane.id).state, h.lane(lane.id).gate], ['merged', 'green'], 'the repair lane lands merged and green')
  assert.ok(!st.queued.some((q) => q.startsWith('main gate red after merging L1')), 'the queued repair line is dropped: ' + JSON.stringify(st.queued))
  const show = runNode('scripts/spec-queue.js', ['show', id], { cwd: h.root })
  assert.match(show.stdout, /done \(archived\)/, 'the repair item is ticked: ' + show.stdout)
  const again = redHost()
  again.h.must([])
  const l2 = again.h.state().lanes.find((l) => l.queueId === again.id)
  again.h.dispatch(l2.id, 'fix-repair')
  again.h.startFixLane(again.id)
  again.h.commitInLane(again.id, 'repair.txt', 'repair\n')
  again.h.must(['--mark', 'returned', '--lane', l2.id])
  again.h.git('merge', '-q', '--no-ff', '-m', 'merge fix/' + again.id, 'fix/' + again.id)
  const red = again.h.run(['--mark', 'merged', '--lane', l2.id])
  assert.strictEqual(again.h.state().lastGate.result, 'red', 'a repair that leaves main red keeps the gate red: ' + red.stdout + red.stderr)
  assert.ok(red.stdout.includes('## MERGE_RED — main gate red after L1') && red.stdout.includes('spec-queue)" add "main gate red after merging L1:'), 'and prints a fresh add line on that mark: ' + red.stdout)
})

test('AC-20261103-08-26: MERGE exits 2 naming the stray file and the session scratchpad when the main root is dirty, and prints no merge step', () => {
  const h = mergeReadyHost()
  fs.writeFileSync(path.join(h.root, 'notes.md'), 'x')
  const r = h.run([])
  assert.strictEqual(r.status, 2, 'a dirty main root must stop the MERGE step before merge-back refuses it: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('the main root is dirty') && r.stderr.includes('notes.md') && r.stderr.includes('session scratchpad'), 'stderr names the file and the remedy: ' + r.stderr)
  assert.ok(!r.stdout.includes('## Step: merge'), 'no merge step is printed over a dirty root: ' + r.stdout)
})

test('AC-20261103-06-18 / AC-20261103-15-8: REPORT after a derived batch names where the batch stopped, and the next bare run after the reported mark starts the next batch with the stopped spec startable again', () => {
  const h = fanoutHost({ briefed: true, dependent: true })
  h.admit()
  const [l1, l2, l3] = [idOf(h, S03), idOf(h, S06), idOf(h, S04)]
  h.dispatchAll(l1, l3)
  landLane(h, '03-x', l1)
  h.dispatch(l2, 'lane-two')
  h.must(['--mark', 'returned', '--lane', l2, '--stopped', 'worker gone'])
  landLane(h, '04-z', l3)
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: report'), 'every lane terminal means REPORT: ' + r.stdout)
  const slots = JSON.parse(bytes(h.reportFile))
  assert.ok(slots.warns.includes('batch stopped before 07-d — ' + DEP_REASON + '; the next bare run starts the next batch'), 'REPORT must say where the batch stopped and that the next bare run goes on: ' + JSON.stringify(slots.warns))
  h.must(['--mark', 'reported'])
  const next = h.must([])
  assert.match(next.stdout, /state: PLAN/, 'after the reported mark the next bare run is a fresh plan: ' + next.stdout)
  assert.ok(next.stdout.includes(pinLine('06-y', 'stops before 07-d (' + DEP_REASON + ')')), 'the spec whose lane stopped is startable again in the next batch: ' + next.stdout)
})

test('AC-20261103-06-20: a merge-ready lane is merged before a planned lane is dispatched, and --state says MERGE', () => {
  const h = fanoutHost()
  h.admit()
  const [a, b] = [idOf(h, S03), idOf(h, S04)]
  assert.strictEqual(h.state().lanes.filter((l) => l.state === 'planned').length, 3, 'the ad-hoc batch must leave all three lanes planned: ' + JSON.stringify(h.state().lanes))
  h.dispatchAll(a, b)
  h.closeLane('03-x')
  h.must(['--mark', 'returned', '--lane', a])
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: merge ' + a), 'the finished lane must be merged first, or a lane dispatched now branches from a main about to move: ' + r.stdout)
  assert.ok(!r.stdout.includes('## Step: dispatch'), 'no lane is dispatched while one is merge-ready: ' + r.stdout)
  assert.match(h.must(['--state']).stdout, /\bMERGE\b/, '--state must agree with the step the bare run printed: ' + r.stdout)
})

const PICK_DESC = {
  x: 'specs/20261102/03-x.md — brief 32; in the derived batch',
  y: 'specs/20261102/06-y.md — brief 32; waits: shared brief 32',
  z: 'specs/20261102/04-z.md — brief 33; in the derived batch',
  s: 'specs/20261102/08-s.md — brief 35; in the derived batch',
}

test('AC-20261103-14-4: --pick writes a PICK-state file and prints one AskUserQuestion block with one multiSelect question of the four startable specs in queue order, plain-word labels and path-led descriptions, then the picked mark line', () => {
  const h = fanoutHost({ briefed: true, selfSurface: true, blocked: true })
  const r = h.must(['--pick'])
  assert.match(h.must(['--state']).stdout, /\bPICK\b/, '--state must say PICK, or a resumed session cannot tell the question is open: ' + r.stdout)
  const blocks = askBlocks(r.stdout)
  assert.strictEqual(blocks.length, 1, 'exactly one AskUserQuestion block is printed: ' + r.stdout)
  assert.strictEqual(blocks[0].questions.length, 1, 'four candidates fit one question: ' + JSON.stringify(blocks[0]))
  const q = blocks[0].questions[0]
  assert.deepStrictEqual([q.header, q.question, q.multiSelect], ['Pick 1/1', 'Which of these specs should this fan-out run? Tick any — group 1 of 1.', true], 'the question carries its group header, the fixed sentence and multiSelect, or the tool renders a single choice: ' + JSON.stringify(q))
  assert.deepStrictEqual(q.options.map((o) => o.label), ['x', 'y', 'z', 's'], 'labels are the stems minus their number, in queue order, and the blocked 08-k is no option: ' + JSON.stringify(q.options))
  assert.deepStrictEqual(q.options.map((o) => o.description), [PICK_DESC.x, PICK_DESC.y, PICK_DESC.z, PICK_DESC.s], 'each description leads with the path and says where the spec sits against the derived batch: ' + JSON.stringify(q.options))
  assert.match(r.stdout, /Then: node .*fanout-driver.* --mark picked --label "<label>"/, 'the block is followed by the picked mark line, or the session has no mark to run: ' + r.stdout)
  const st = h.state()
  assert.deepStrictEqual(st.pick.candidates.map((c) => c.path), [S03, S06, S04, S08S], 'the candidates are recorded in queue order: ' + JSON.stringify(st.pick))
  assert.strictEqual(st.batch, null, 'no batch exists while the step is PICK, or a resumed session plans before the user ticked: ' + JSON.stringify(st))
})

test('AC-20261103-14-5: --pick splits more than four candidates over ceil(n / 4) balanced questions, shows at most sixteen and says how many it left out', () => {
  const five = fanoutHost({ briefed: true, selfSurface: true, critical: true })
  const qs = askBlocks(five.must(['--pick']).stdout)[0].questions
  assert.deepStrictEqual(qs.map((q) => [q.header, q.options.length]), [['Pick 1/2', 3], ['Pick 2/2', 2]], 'five candidates split 3 + 2, or the tool refuses a one-option question: ' + JSON.stringify(qs))
  const many = fanoutHost({ many: 17 })
  const r = many.must(['--pick'])
  const big = askBlocks(r.stdout)[0].questions
  assert.deepStrictEqual(big.map((q) => q.options.length), [4, 4, 4, 4], 'twenty startable specs show sixteen in four questions of four: ' + JSON.stringify(big.map((q) => q.options.length)))
  assert.deepStrictEqual([many.state().pick.shown, many.state().pick.startable], [16, 20], 'the state records what was shown and how many were startable: ' + JSON.stringify(many.state().pick))
  assert.ok(r.stdout.includes('16 of 20 startable specs shown — the rest come after this run'), 'the cut must be said aloud, or the user thinks the list is complete: ' + r.stdout)
})

test('AC-20261103-14-9: --pick with fewer than two candidates prints no question and tables the one spec, the fix group alone, or nothing', () => {
  const one = fanoutHost()
  one.markDone('03-x', '06-y')
  const r = one.must(['--pick'])
  assert.strictEqual(askBlocks(r.stdout).length, 0, 'one candidate is a question with one answer: ' + r.stdout)
  assert.ok(r.stdout.includes('📌 Auto-picked the one startable spec 04-z — nothing else to choose (veto anytime)'), 'the safe default is announced with a veto: ' + r.stdout)
  assert.deepStrictEqual(one.state().lanes.map((l) => [l.id, l.spec, l.state]), [['L1', S04, 'planned']], 'the one spec is tabled: ' + JSON.stringify(one.state().lanes))
  assert.strictEqual(one.state().batch.by, 'pick', 'the batch records by pick: ' + JSON.stringify(one.state().batch))
  const fixes = fanoutHost({ fixes: true })
  fixes.markDone('03-x', '04-z', '06-y')
  const f = fixes.must(['--pick'])
  assert.ok(f.stdout.includes('📌 Auto-picked the fix group alone — no startable spec (veto anytime)'), 'the fix group alone is announced: ' + f.stdout)
  assert.deepStrictEqual(fixes.state().lanes.map((l) => [l.id, l.branch]), [['F1', 'fix/q107'], ['F2', 'fix/q116']], 'only the fix group is tabled: ' + JSON.stringify(fixes.state().lanes))
  const none = fanoutHost()
  none.markDone('03-x', '04-z', '06-y')
  const n = none.must(['--pick'])
  assert.ok(n.stdout.includes('no startable lanes — nothing to fan out'), 'with nothing to run the bare run\'s line prints: ' + n.stdout)
  assert.ok(!fs.existsSync(none.stateFile), 'nothing to fan out writes no state file')
})

test('AC-20261103-14-10: a bare run on a pick-state file re-prints the pick step unchanged, and --pick on an admitted table exits 2', () => {
  const h = fanoutHost({ briefed: true })
  const first = h.must(['--pick'])
  const file = bytes(h.stateFile)
  const again = h.must([])
  assert.strictEqual(again.stdout, first.stdout, 'a bare run on PICK must print the same step, or /clear loses the question: ' + again.stdout)
  assert.strictEqual(bytes(h.stateFile), file, 'the re-print must not rewrite the file')
  h.pickPlan([S03])
  const r = h.run(['--pick'])
  assert.strictEqual(r.status, 2, '--pick on an admitted table must be refused or a running fan-out is replaced: ' + r.stdout)
  assert.ok(r.stderr.includes('a fan-out is already running — delete ' + h.stateFile + ' to start over'), 'the refusal names the remedy: ' + r.stderr)
})

// specs/20261103/15-shared-files-land-by-rebase.md D1, D4-D6: shared files hold no lane back; MERGE rebases and fast-forwards;
// a conflict goes back to the lane's worker; a second conflict against the same main stops the lane.
const OVERLAP_STEMS = ['20-o01', '20-o02', '20-o03', '20-o04', '20-o05']
const stemOf = (spec) => path.basename(spec, '.md')

test('AC-20261103-15-6: five hardened briefless specs naming the same two scripts are all tabled planned, four are dispatched with none waiting, and the fifth is dispatched after a landing', () => {
  const h = fanoutHost({ overlap: 5 })
  const r = h.must([])
  assert.ok(r.stdout.includes(pinLine(OVERLAP_STEMS.join(', '), 'the whole queue')), 'the batch must be the whole queue, or shared scripts still end it: ' + r.stdout)
  assert.deepStrictEqual(h.state().lanes.map((l) => [l.id, stemOf(l.spec), l.state]), OVERLAP_STEMS.map((s, i) => ['L' + (i + 1), s, 'planned']), 'every overlapping spec must be tabled planned and none waiting, or File Plan overlap still serializes the fan-out: ' + JSON.stringify(h.state().lanes))
  assert.strictEqual(batchOf(h).stopBefore, null, 'no boundary may end a batch over shared files: ' + JSON.stringify(h.state().batch))
  assert.deepStrictEqual(JSON.parse(h.status(['--lanes', '--json']).stdout).serialized, [], '--lanes --json must serialize nothing on File Plan overlap, or spec-status still predicts a collision')
  const d = h.must(['--mark', 'planned'])
  assert.ok(d.stdout.includes('## Step: dispatch 4 lanes'), 'the four-lane cap dispatches four at once: ' + d.stdout)
  for (const s of OVERLAP_STEMS.slice(0, 4)) assert.ok(d.stdout.includes(s), 'the dispatch must name ' + s + ': ' + d.stdout)
  assert.ok(!d.stdout.includes('20-o05'), 'the fifth spec stays planned past the cap: ' + d.stdout)
  assert.strictEqual(h.lane('L5').state, 'planned', 'L5 is held by the cap alone, never by a wait: ' + JSON.stringify(h.state().lanes))
  for (let i = 1; i <= 4; i++) h.dispatch('L' + i, 'lane-' + i)
  landLane(h, '20-o01', 'L1')
  const next = h.must([])
  assert.ok(next.stdout.includes('## Step: dispatch 1 lanes') && next.stdout.includes('20-o05'), 'the first bare run after a landing dispatches the fifth lane: ' + next.stdout)
})

// A base where x.txt already exists, so the lane's edit and main's edit conflict as UU (add/add would show AA).
const conflictHost = () => mergeReadyHost([S03], (h) => h.moveMain('x.txt', 'base\n'))
const resumedConflict = () => { const h = conflictHost(); h.moveMain('x.txt', 'main\n'); h.must([]); h.must(['--mark', 'resumed', '--lane', 'L1']); return h }

test('AC-20261103-15-11: a lane whose branch conflicts with the moved main is left mid-rebase in its worktree, recorded conflicted and sent back to its worker, and a second bare run changes nothing', () => {
  const h = conflictHost()
  h.moveMain('x.txt', 'main\n')
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: send L1 back to rebase'), 'a conflict prints the send-back step: ' + r.stdout)
  assert.ok(r.stdout.includes('SendMessage {to: "lane-one", message: "Lane L1: main moved and spec/03-x conflicts with it in x.txt'), 'the message goes to the lane\'s own worker and names the conflicted file: ' + r.stdout)
  assert.ok(r.stdout.includes('run `/spec:run ' + S03 + '` again'), 'a run lane\'s worker is told to run its spec again and report MERGE_READY: ' + r.stdout)
  assert.ok(r.stdout.includes('--mark resumed --lane L1'), 'the step closes with the resumed mark: ' + r.stdout)
  const l = h.lane('L1')
  assert.deepStrictEqual([l.state, l.conflicts, l.rebases, l.rebaseHead], ['conflicted', ['x.txt'], 1, h.git('rev-parse', 'HEAD').trim()], 'the lane records the conflict, the round and the main it conflicted with: ' + JSON.stringify(l))
  assert.match(gitIn(h.wt('03-x'), 'status', '--porcelain'), /^UU x\.txt$/m, 'the rebase must stay in progress in the lane\'s worktree, or the worker has nothing to continue')
  assert.strictEqual(h.git('status', '--porcelain').trim(), '', 'the conflict must never touch the main root')
  assert.match(h.must(['--state']).stdout, /\bREBASE\b/, '--state must name the REBASE state')
  const before = fs.readFileSync(h.stateFile, 'utf8')
  const again = h.must([])
  assert.strictEqual(fs.readFileSync(h.stateFile, 'utf8'), before, 'a bare run on REBASE must change nothing, or a re-print counts as a second round')
  assert.ok(again.stdout.includes('## Step: send L1 back to rebase'), 'a bare run re-prints the same step: ' + again.stdout)
})

test('AC-20261103-15-12: a worker that resolves the rebase and returns gets its lane landed on the next bare run, and REPORT says it was rebased', () => {
  const h = resumedConflict()
  const l = h.lane('L1')
  assert.strictEqual(l.state, 'dispatched', 'resumed puts the lane back to work: ' + JSON.stringify(l))
  assert.ok(l.conflicts === undefined || l.conflicts === null, 'the resumed mark clears the conflict list: ' + JSON.stringify(l))
  const wt = h.wt('03-x')
  fs.writeFileSync(path.join(wt, 'x.txt'), 'both\n')
  gitIn(wt, 'add', 'x.txt')
  require('node:child_process').execFileSync('git', ['-C', wt, 'rebase', '--continue'], { env: { ...process.env, GIT_EDITOR: 'true' } })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  assert.strictEqual(h.lane('L1').state, 'merge-ready', 'the resolved lane returns merge-ready')
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: merge L1'), 'the next bare run lands the resolved lane: ' + r.stdout)
  assert.strictEqual(isAncestor(h, 'spec/03-x'), 0, 'the resolved branch must be contained in main: ' + r.stdout)
  h.mergeLane('03-x')
  h.must(['--mark', 'merged', '--lane', 'L1'])
  h.must([])
  assert.ok(JSON.parse(bytes(h.reportFile)).bullets.includes(S03 + ': merged (gate green, rebased ×1)'), 'REPORT must say where the shared files collided: ' + bytes(h.reportFile))
})

test('AC-20261103-15-13: a lane returned merge-ready with its conflict unresolved against the same main has its rebase aborted and is stopped naming the hand remedy', () => {
  const h = resumedConflict()
  const wt = h.wt('03-x')
  gitIn(wt, 'rebase', '--abort')
  h.must(['--mark', 'returned', '--lane', 'L1'])
  const r = h.must([])
  const l = h.lane('L1')
  assert.strictEqual(l.state, 'stopped', 'a second conflict against the same main stops the lane: ' + JSON.stringify(l))
  assert.match(l.stoppedReason, /^rebase conflict unresolved twice on [0-9a-f]{7} — resume by hand: cd .* && git rebase main$/, 'the reason names the hand remedy: ' + l.stoppedReason)
  assert.strictEqual(gitIn(wt, 'status', '--porcelain', '--untracked-files=no').trim(), '', 'the driver must abort the rebase and leave the worktree clean, or the person resuming by hand inherits a half-done rebase')
  assert.match(gitIn(wt, 'log', '--oneline', '-1'), /lane work 03-x/, 'the lane\'s own commit survives the abort')
  assert.ok(r.stdout.includes('## Step: report'), 'with its only lane stopped the run reaches REPORT: ' + r.stdout)
  assert.ok(JSON.parse(bytes(h.reportFile)).bullets.some((b) => b.startsWith(S03 + ': stopped — rebase conflict unresolved twice')), 'REPORT names the reason: ' + bytes(h.reportFile))
})

test('AC-20261103-15-14: a bare run at MERGE lands a merge-ready fix lane the same way and prints only the merged mark after the landing note', () => {
  const h = fixOnlyHost()
  h.dispatch('F1', 'fix-one')
  h.startFixLane('q107')
  h.commitInLane('q107', 'fix.txt', 'fix\n')
  h.must(['--mark', 'returned', '--lane', 'F1'])
  assert.strictEqual(h.lane('F1').state, 'merge-ready', 'the setup needs F1 merge-ready')
  const r = h.must([])
  assert.ok(r.stdout.includes('## Step: merge F1'), 'the bare run prints the merge step: ' + r.stdout)
  assert.ok(r.stdout.includes('rebased fix/q107 onto main and fast-forwarded'), 'the fix lane is landed by the driver: ' + r.stdout)
  assert.ok(r.stdout.includes('--mark merged --lane F1'), 'the merged mark closes the step: ' + r.stdout)
  assert.ok(!r.stdout.includes('/git:merge') && !r.stdout.includes('review-driver'), 'a fix lane has no spec to promote and no merge command to run: ' + r.stdout)
})
