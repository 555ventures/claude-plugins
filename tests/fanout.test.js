'use strict'
// Pins spec/scripts/fanout.js by execution: AUTO and --pick plans, dispatch creates the lane worktrees,
// lanes return, MERGE rebases each onto trunk and fast-forwards, ticks the queue, removes worktrees; a
// rebase conflict sends the lane back (twice → stopped); RELAY for a stopped lane; MERGE_RED.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const pending = require(path.join(SPEC, 'scripts/lib/pending.js'))

const SPECS = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/a.js']]
const specPath = (stem) => `specs/20261104/${stem}.md`

function specText(stem, file) {
  return `---\ndate: 2026-11-04\nstatus: hardened\narchitecture: false\n---\n# ${stem}\n\n## Intent\n- You asked: ${stem}\n\n` +
    `## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| \`${file}\` | CREATE | ${stem} |\n`
}

function host() {
  const dir = tmpdir('fanout')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nspecs/**/*.run/\n')
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify({ testCommand: 'test ! -f RED', lanes: 2 }))
  for (const [stem, file] of SPECS) {
    fs.mkdirSync(path.join(dir, 'specs', '20261104'), { recursive: true })
    fs.writeFileSync(path.join(dir, specPath(stem)), specText(stem, file))
  }
  const g = gitRepo(dir)
  st.writeQueue(dir, { version: 2, seq: 3, items: SPECS.map(([stem], i) => ({ id: i + 1, kind: 'spec', payload: specPath(stem), added: '2026-11-04' })) })
  const run = (...a) => runNode('scripts/fanout.js', ['--root', dir, ...a])
  const ok = (...a) => { const r = run(...a); assert.strictEqual(r.status, 0, `${a.join(' ')}: ${r.stderr}${r.stdout}`); return r }
  const wt = (stem) => path.join(dir, '.claude', 'worktrees', 'spec-' + stem)
  // A lane finishing: code committed on its branch, run state at MERGE_READY.
  const finish = (stem, file, content = stem + '\n') => {
    const w = wt(stem)
    fs.mkdirSync(path.dirname(path.join(w, file)), { recursive: true })
    fs.writeFileSync(path.join(w, file), content)
    execFileSync('git', ['-C', w, 'add', '-A'])
    execFileSync('git', ['-C', w, 'commit', '-q', '-m', 'lane ' + stem])
    const base = execFileSync('git', ['-C', w, 'merge-base', 'main', 'HEAD'], { encoding: 'utf8' }).trim()
    st.writeRun(path.join(w, specPath(stem)), { step: 'MERGE_READY', spec: specPath(stem), lane: true, worktree: '.', branch: 'spec/' + stem, base, inPlace: false, attempts: { repair: 0, fix: 0 }, gate: null, review: null })
  }
  return { dir, g, run, ok, wt, finish, step: () => run('--state').stdout.trim() }
}

function dispatchTwo(h) {
  const plan = h.ok()
  assert.match(plan.stdout, /^▶ PLAN/)
  h.ok('--mark', 'planned')
  const disp = h.ok()
  assert.match(disp.stdout, /^▶ DISPATCH/)
  h.ok('--mark', 'dispatched')
  return { plan, disp }
}

test('AUTO: the first two lanes are planned, rebased onto trunk and fast-forwarded, ticked, cleaned; then PLAN picks the third', () => {
  const h = host()
  const { plan, disp } = dispatchTwo(h)
  assert.match(plan.stdout, /📌 Auto-picked batch: 2 lane\(s\)/, 'bare run auto-picks and says so')
  assert.ok(!/AskUserQuestion/.test(plan.stdout), 'bare run asks no question')
  assert.ok(plan.stdout.includes('03-gamma.md waits — all 2 lanes are taken'), 'the third spec waits for a lane')
  const f = st.readFanout(h.dir)
  assert.deepStrictEqual(f.batch.map((l) => l.spec), [specPath('01-alpha'), specPath('02-beta')], 'the first two queue specs become lanes')
  assert.deepStrictEqual(f.batch.map((l) => l.branch), ['spec/01-alpha', 'spec/02-beta'])
  for (const stem of ['01-alpha', '02-beta']) {
    assert.ok(fs.existsSync(h.wt(stem)), 'the driver creates each lane worktree before dispatch')
    assert.ok(pending.isLane(h.wt(stem)), 'each lane worktree is marked as a lane')
    assert.ok(disp.stdout.includes(`/spec:run ${specPath(stem)}`) && disp.stdout.includes(h.wt(stem)), 'dispatch names the prompt and the worktree root per lane')
  }
  assert.match(disp.stdout, /model: "opus", effort: "medium"/, 'each Agent call carries the orchestrator seat effort')
  assert.strictEqual(h.step(), 'WAIT')

  assert.strictEqual(h.run('--mark', 'returned', '--lane', '1').status, 2, 'a lane that has not reached MERGE_READY cannot return done')
  h.finish('01-alpha', 'src/a.js')
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'WAIT', 'one lane still out keeps WAIT')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT', 'both done → merges run → REPORT')

  for (const f of ['src/a.js', 'src/b.js']) assert.ok(fs.existsSync(path.join(h.dir, f)), `${f} is merged into trunk`)
  assert.strictEqual(h.g('rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
  assert.strictEqual(st.readSpec(path.join(h.dir, specPath('01-alpha'))).frontmatter.status, 'done', 'merged spec is done on trunk')
  assert.strictEqual(h.g('status', '--porcelain', '--untracked-files=no').trim(), '', 'trunk is left clean')
  assert.strictEqual(h.g('log', '--merges', '--format=%H').trim(), '', 'lanes land by rebase + fast-forward: no merge commits')
  const q = st.readQueue(h.dir)
  assert.ok(q.items[0].done && q.items[1].done && !q.items[2].done, 'the two merged queue items are ticked, the third is not')
  assert.ok(!fs.existsSync(h.wt('01-alpha')) && !fs.existsSync(h.wt('02-beta')), 'lane worktrees are removed')

  const rep = h.ok()
  assert.match(rep.stdout, /Next: \/spec:fanout/, 'a runnable spec remains, so next is /spec:fanout')
  h.ok('--mark', 'reported')
  assert.strictEqual(st.readFanout(h.dir), null, 'reported clears the fanout state')
  const again = JSON.parse(h.run('--json').stdout)
  assert.strictEqual(again.step, 'PLAN')
  h.ok('--mark', 'planned')
  assert.deepStrictEqual(st.readFanout(h.dir).batch.map((l) => l.spec), [specPath('03-gamma')], 'the next PLAN picks the third spec')
})

test('a stopped lane goes through RELAY: one batch, answered, resumed, then merged', () => {
  const h = host()
  dispatchTwo(h)
  pending.writePending(h.wt('01-alpha'), { lane: '1', question: 'Which shape?', options: ['flat', 'nested'] })
  h.ok('--mark', 'returned', '--lane', '1')
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'RELAY', 'a stopped lane routes to RELAY before any merge')
  const relay = h.ok()
  assert.ok(relay.stdout.includes('Which shape?') && relay.stdout.includes('nested'), 'the pending question and its options are relayed')
  assert.strictEqual(h.run('--mark', 'answered', '--lane', '1').status, 2, 'a pending question needs --label')
  assert.strictEqual(h.run('--mark', 'answered', '--lane', '1', '--label', 'round').status, 2, 'an unknown label is refused')
  h.ok('--mark', 'answered', '--lane', '1', '--label', 'nested')
  assert.strictEqual(pending.readPending(h.wt('01-alpha')).answer.label, 'nested', 'the answer lands in the lane worktree')
  const resume = h.ok()
  assert.match(resume.stdout, /^▶ RELAY/)
  assert.ok(resume.stdout.includes(`/spec:run ${specPath('01-alpha')}`), 'the answered lane is re-dispatched')
  h.ok('--mark', 'resumed')
  assert.strictEqual(h.step(), 'WAIT')
  h.finish('01-alpha', 'src/a.js')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/a.js')) && fs.existsSync(path.join(h.dir, 'src/b.js')), 'both lanes merged')
  assert.ok(!fs.existsSync(path.join(h.dir, '.claude', 'pending-question.json')), 'the lane question does not reach trunk')
})

test('a dismissed lane is dropped, its worktree kept', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  h.ok('--mark', 'dismissed', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  assert.ok(fs.existsSync(h.wt('01-alpha')), 'a dismissed lane keeps its worktree')
  assert.ok(!st.readQueue(h.dir).items[0].done, 'a dismissed lane is not ticked')
  assert.strictEqual(st.readFanout(h.dir).batch[0].status, 'dismissed')
})

test('a red trunk gate after a merge stops at MERGE_RED until gate-repaired', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('01-alpha', 'RED', 'broken\n')
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'MERGE_RED', 'the red gate stops the merge queue')
  assert.ok(!fs.existsSync(path.join(h.dir, 'src/b.js')), 'the next lane is not merged while trunk is red')
  assert.strictEqual(h.run('--mark', 'gate-repaired').status, 0)
  assert.strictEqual(h.step(), 'MERGE_RED', 'still red: gate-repaired re-runs the gate and stays')
  h.g('rm', '-q', 'RED')
  h.g('commit', '-q', '-m', 'repair')
  h.ok('--mark', 'gate-repaired')
  assert.strictEqual(h.step(), 'REPORT', 'green → the remaining lane merges → REPORT')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/b.js')))
  assert.ok(st.readQueue(h.dir).items[0].done, 'the repaired lane is ticked')
})

test('an empty queue prints the drained report and no mark', () => {
  const dir = tmpdir('fanout-empty')
  gitRepo(dir)
  const r = runNode('scripts/fanout.js', ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  assert.strictEqual(j.step, 'PLAN')
  assert.strictEqual(j.mark, null, 'a drained queue needs no mark')
  assert.match(j.body, /queue drained/)
})

test('explicit spec paths limit the plan; the mark line carries them', () => {
  const h = host()
  const r = h.ok(specPath('03-gamma'), specPath('01-alpha'), '--json')
  const j = JSON.parse(r.stdout)
  assert.ok(!j.body.includes('waits'), 'overlapping File Plans do not make a spec wait')
  const mark = j.mark.replace(/^node /, '').split(' ')
  const m = runNode(mark[0], mark.slice(1))
  assert.strictEqual(m.status, 0, m.stderr)
  assert.deepStrictEqual(st.readFanout(h.dir).batch.map((l) => l.spec), [specPath('03-gamma'), specPath('01-alpha')], 'the printed mark line plans the same lanes, in argument order')
})

test('a lane that ended PARKED or AMENDED is dismissed on return, reported as parked, and not re-planned', () => {
  const h = host()
  dispatchTwo(h)
  const alpha = path.join(h.wt('01-alpha'), specPath('01-alpha'))
  st.writeStatus(alpha, 'draft')
  st.writeRun(alpha, { step: 'AMENDED', spec: specPath('01-alpha') })
  h.ok('--mark', 'returned', '--lane', '1')
  const lane = st.readFanout(h.dir).batch[0]
  assert.deepStrictEqual([lane.status, lane.ended], ['dismissed', 'AMENDED'], 'returned dismisses the ended lane')
  assert.strictEqual(st.readSpec(alpha).frontmatter.status, 'draft', 'the spec is left as the lane set it')
  assert.ok(!pending.isLane(h.wt('01-alpha')), 'the lane marker comes off')
  const beta = path.join(h.wt('02-beta'), specPath('02-beta'))
  st.writeRun(beta, { step: 'PARKED', spec: specPath('02-beta') })
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
  const rep = h.ok().stdout
  assert.match(rep, /2 parked/)
  assert.match(rep, /parked 01-alpha — its lane ended AMENDED/)
  assert.match(rep, /parked 02-beta — its lane ended PARKED/)
  assert.ok(fs.existsSync(h.wt('01-alpha')) && fs.existsSync(h.wt('02-beta')), 'both worktrees are kept')
  h.ok('--mark', 'reported')
  const plan = JSON.parse(h.run('--json').stdout)
  assert.match(plan.body, /01-alpha\.md waits — its lane ended AMENDED/, 'an ended lane is not planned again')
  h.ok('--mark', 'planned')
  assert.deepStrictEqual(st.readFanout(h.dir).batch.map((l) => l.spec), [specPath('03-gamma')], 'gamma takes the free lane')
})

test('explicit @-prefixed paths and lane prompts with spaces in the worktree path', () => {
  const base = tmpdir('fan sp')
  const h = host()
  const j = JSON.parse(h.ok('@' + specPath('02-beta'), '--json').stdout)
  assert.match(j.body, /lane 1: specs\/20261104\/02-beta\.md/, 'status prints /spec:run @<spec>; fanout takes the same form')
  const prompt = /prompt: ("[^\n]+")/
  fs.renameSync(h.dir, path.join(base, 'my host'))
  const dir = path.join(base, 'my host')
  const r = runNode('scripts/fanout.js', [specPath('02-beta'), '--root', dir, '--mark', 'planned'])
  assert.strictEqual(r.status, 0, r.stderr)
  const disp = runNode('scripts/fanout.js', ['--root', dir]).stdout
  const p = JSON.parse(prompt.exec(disp)[1])
  assert.strictEqual(p, `/spec:run ${specPath('02-beta')} --root '${path.join(dir, '.claude/worktrees/spec-02-beta')}'`, 'the worktree path is quoted in the lane prompt')
})

// alpha and gamma share src/a.js: both run as lanes; alpha lands first, gamma's rebase conflicts.
function conflicting(h) {
  h.ok(specPath('01-alpha'), specPath('03-gamma'), '--mark', 'planned', specPath('03-gamma'))
  h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'src/a.js', 'alpha\n')
  h.finish('03-gamma', 'src/a.js', 'gamma\n')
  h.ok('--mark', 'returned', '--lane', '1')
  h.ok('--mark', 'returned', '--lane', '2')
}

test('a rebase conflict sends the lane back with the rebase in progress; resolved, it lands on the next pass', () => {
  const h = host()
  conflicting(h)
  assert.strictEqual(h.step(), 'MERGE')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'src/a.js'), 'utf8'), 'alpha\n', 'the first lane landed')
  const lane = st.readFanout(h.dir).batch[1]
  assert.deepStrictEqual([lane.status, lane.conflicts], ['sent-back', ['src/a.js']])
  const gd = execFileSync('git', ['-C', h.wt('03-gamma'), 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  assert.ok(fs.existsSync(path.join(gd, 'rebase-merge')) || fs.existsSync(path.join(gd, 'rebase-apply')), 'the rebase is left in progress in the lane worktree')
  const out = h.ok().stdout
  assert.ok(out.includes(`prompt: "/spec:run ${specPath('03-gamma')} --root ${h.wt('03-gamma')}"`), 'the re-dispatch prompt is the bare /spec:run, nothing shell-hostile')
  assert.match(out, /lane 2 conflicts: src\/a\.js/)
  const laneOut = runNode('scripts/run.js', [specPath('03-gamma'), '--root', h.wt('03-gamma')])
  assert.match(laneOut.stdout, /▶ MERGE_READY\n\na rebase onto trunk is in progress in this worktree: edit each conflicted file/, 'the lane driver prints the rebase instruction itself')
  h.ok('--mark', 'resent')
  assert.strictEqual(h.step(), 'WAIT')
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '2').status, 2, 'a lane still mid-rebase cannot return')
  const w = h.wt('03-gamma')
  fs.writeFileSync(path.join(w, 'src/a.js'), 'alpha\ngamma\n')
  const cont = runNode('scripts/run.js', [specPath('03-gamma'), '--root', w])
  assert.match(cont.stdout, /^▶ MERGE_READY\n/, 'with no markers left the driver continues the rebase; no instruction is printed')
  assert.ok(!/rebase onto trunk is in progress/.test(cont.stdout))
  assert.ok(!fs.existsSync(path.join(gd, 'rebase-merge')) && !fs.existsSync(path.join(gd, 'rebase-apply')), 'the rebase is finished')
  const rebasedOnto = h.g('rev-parse', 'HEAD').trim()
  fs.writeFileSync(path.join(h.dir, 'other.txt'), 'x\n'); h.g('add', 'other.txt'); h.g('commit', '-q', '-m', 'trunk moved meanwhile')
  fs.writeFileSync(path.join(w, 'RED'), '') // the resolution broke the suite
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'WAIT', 'a resolved rebase is not merged blind, and the other lanes keep their order')
  const back = st.readFanout(h.dir).batch[1]
  assert.deepStrictEqual([back.status, back.resolving, back.conflicts], ['sent-back', undefined, undefined])
  const run = st.readRun(path.join(w, specPath('03-gamma')))
  assert.deepStrictEqual([run.step, run.base], ['GATE', rebasedOnto], 'the lane re-gates against the trunk it was rebased onto, even after trunk moved')
  assert.match(h.ok().stdout, /resolved a rebase conflict; they gate and review/)
  h.ok('--mark', 'resent')
  const laneRun = (...a) => runNode('scripts/run.js', [specPath('03-gamma'), '--root', w, ...a])
  assert.match(laneRun().stdout, /^▶ REPAIR/, 'a red resolution is repaired, never landed')
  fs.rmSync(path.join(w, 'RED'))
  assert.match(laneRun('--mark', 'repaired').stdout, /REPAIR → REVIEW/)
  assert.match(fs.readFileSync(path.join(w, 'specs/20261104/03-gamma.run/diff.patch'), 'utf8'), /\+gamma/, 'the reviewer sees the resolved diff')
  const f = path.join(tmpdir('findings'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: [], verdict: 'clean' }))
  assert.match(laneRun('--mark', 'reviewed', '--file', f).stdout, /REVIEW → MERGE_READY/)
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'src/a.js'), 'utf8'), 'alpha\ngamma\n', 'the resolved lane landed on trunk')
  assert.ok(st.readQueue(h.dir).items[2].done && !fs.existsSync(w), 'ticked and cleaned')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'other.txt'), 'utf8'), 'x\n', 'the trunk commit made meanwhile survived')
})

test('a second rebase conflict against the same trunk stops the lane for the user', () => {
  const h = host()
  conflicting(h)
  h.ok('--mark', 'resent')
  execFileSync('git', ['-C', h.wt('03-gamma'), 'rebase', '--abort'])
  h.ok('--mark', 'returned', '--lane', '2')
  const lane = st.readFanout(h.dir).batch[1]
  assert.deepStrictEqual([lane.status, lane.reason], ['stopped', 'second rebase conflict'])
  assert.strictEqual(h.step(), 'RELAY')
  assert.match(h.ok().stdout, /stopped: second rebase conflict/, 'relayed to the user')
})

test('--pick prints a checkbox question; picked builds the batch from exactly the ticked specs', () => {
  const h = host()
  const r = h.ok('--pick')
  assert.match(r.stdout, /AskUserQuestion call with multiSelect checkboxes/)
  assert.match(r.stdout, /Question 1: [\s\S]*\[ \] 01-alpha[\s\S]*\[ \] 03-gamma/, 'every runnable spec is a box, labelled by title')
  assert.match(r.stdout, /--mark picked --label <title>/)
  assert.ok(!/Auto-picked/.test(r.stdout))
  assert.strictEqual(h.run('--mark', 'picked', '--label', 'nope').status, 2, 'an unknown label is refused')
  assert.strictEqual(h.run('--mark', 'picked', '--label', '01-alpha', '--label', '02-beta', '--label', '03-gamma').status, 2, 'more than lanes is refused')
  st.writeStatus(path.join(h.dir, specPath('01-alpha')), 'draft')
  const bad = h.run('--mark', 'picked', '--label', '01-alpha')
  assert.strictEqual(bad.status, 2)
  assert.match(bad.stderr, /not runnable — status is draft/, 'the same validity checks as AUTO')
  st.writeStatus(path.join(h.dir, specPath('01-alpha')), 'hardened')
  h.g('worktree', 'add', '-q', '-b', 'spec/02-beta', h.wt('02-beta'))
  pending.markLane(h.wt('02-beta'), 'fanout')
  const busy = h.run('--mark', 'picked', '--label', '02-beta')
  assert.match(busy.stderr, /already in a lane/, 'a spec already in a lane is refused')
  h.ok('--mark', 'picked', '--label', '03-gamma', '--label', '01-alpha')
  assert.deepStrictEqual(st.readFanout(h.dir).batch.map((l) => l.spec), [specPath('03-gamma'), specPath('01-alpha')], 'exactly the picked specs, in pick order')
})

test('MERGE refuses while the main checkout is off trunk instead of fast-forwarding a stray branch', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  h.g('checkout', '-q', '-b', 'feat')
  h.ok('--mark', 'returned', '--lane', '1')
  const r = h.run('--mark', 'returned', '--lane', '2')
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /on feat, not main/)
  assert.strictEqual(h.g('rev-parse', 'feat').trim(), h.g('rev-parse', 'main').trim(), 'nothing landed on the stray branch')
  h.g('checkout', '-q', 'main')
  h.ok()
  assert.strictEqual(h.step(), 'REPORT')
})

test('WAIT prints the Agent line of every lane still out, so a crashed session can re-send them', () => {
  const h = host()
  dispatchTwo(h)
  const out = h.ok().stdout
  assert.match(out, /re-send any other lane whose agent is no longer running/)
  assert.match(out, new RegExp(`Agent\\(\\{[^\\n]*lane 1: 01-alpha[^\\n]*/spec:run ${specPath('01-alpha').replace(/[/.]/g, '\\$&')} --root`))
  assert.match(out, /lane 2: 02-beta/)
  h.finish('01-alpha', 'src/a.js'); h.ok('--mark', 'returned', '--lane', '1')
  h.finish('02-beta', 'src/b.js') // finished but not yet marked: a returned line, not a second agent in the same worktree
  const again = h.ok().stdout
  assert.ok(!/lane 1: 01-alpha[^\n]*--root/.test(again) && !/lane 2: 02-beta[^\n]*--root/.test(again), 'no lane is re-sent')
  assert.match(again, /--mark returned --lane 2/)
})

test('the bookkeeping commit after a rebase never runs the host hook, so a red resolution reaches MERGE_RED instead of wedging', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js')
  h.finish('02-beta', 'RED', 'broken\n') // lane 2 lands a red suite
  fs.mkdirSync(path.join(h.dir, '.git/hooks'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, '.git/hooks/pre-commit'), '#!/bin/sh\ntest ! -f RED\n', { mode: 0o755 }) // the host runs its suite on every commit
  h.ok('--mark', 'returned', '--lane', '1')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'MERGE_RED', 'the hook did not block the bookkeeping commit; the gate caught the red')
  assert.match(h.ok().stdout, /MERGE_RED/)
})
