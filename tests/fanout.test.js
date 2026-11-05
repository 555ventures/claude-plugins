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

const SPEC_LIST = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/a.js']]
const specPath = (stem) => `specs/20261104/${stem}.md`

function specText(stem, file, { status = 'hardened', deps } = {}) {
  const dep = deps === undefined ? '' : `depends_on: ${Array.isArray(deps) ? `[${deps.join(', ')}]` : deps}\n`
  return `---\ndate: 2026-11-04\nstatus: ${status}\n${dep}architecture: false\n---\n# ${stem}\n\n## Intent\n- You asked: ${stem}\n\n` +
    `## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| \`${file}\` | CREATE | ${stem} |\n`
}

// opts: lanes, specs (stem, file pairs), deps {stem: depends_on}, status {stem: status}
function host(opts = {}) {
  const SPECS = opts.specs || SPEC_LIST
  const dir = tmpdir('fanout')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nspecs/**/*.run/\n')
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify({ testCommand: 'test ! -f RED', lanes: opts.lanes || 2 }))
  for (const [stem, file] of SPECS) {
    fs.mkdirSync(path.join(dir, 'specs', '20261104'), { recursive: true })
    fs.writeFileSync(path.join(dir, specPath(stem)), specText(stem, file, { status: (opts.status || {})[stem], deps: (opts.deps || {})[stem] }))
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
  assert.strictEqual(h.step(), 'MERGE_RED', 'lane 1 lands as it returns; the red gate stops the queue while lane 2 is still out')
  assert.ok(!fs.existsSync(path.join(h.dir, 'src/b.js')), 'the next lane is not merged while trunk is red')
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '2').status, 2, 'no lane returns onto a red trunk')
  assert.strictEqual(h.run('--mark', 'gate-repaired').status, 0)
  assert.strictEqual(h.step(), 'MERGE_RED', 'still red: gate-repaired re-runs the gate and stays')
  h.g('rm', '-q', 'RED')
  h.g('commit', '-q', '-m', 'repair')
  h.ok('--mark', 'gate-repaired')
  assert.strictEqual(h.step(), 'WAIT', 'green → lane 2 is still out, so the batch waits for it')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT', 'the remaining lane lands as it returns → REPORT')
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

test('AUTO PLAN names queued specs held back for not being hardened, in one line', () => {
  const h = host()
  st.writeStatus(path.join(h.dir, specPath('02-beta')), 'draft')
  const j = JSON.parse(h.ok('--json').stdout)
  assert.strictEqual(j.step, 'PLAN')
  assert.ok(j.body.includes('lane 1: ' + specPath('01-alpha')) && j.body.includes('lane 2: ' + specPath('03-gamma')))
  const held = j.body.split('\n').filter((l) => l.startsWith('Held (not hardened, not shown as lanes): '))
  assert.strictEqual(held.length, 1, j.body)
  assert.strictEqual(held[0], 'Held (not hardened, not shown as lanes): 1 — 02-beta (draft)')
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

test('AC-20261105-02-12 AC-20261105-02-15 a rebase conflict sends the lane back once: the resolution is continued, gated and reviewed in that one dispatch, then lands', () => {
  const h = host()
  conflicting(h)
  assert.strictEqual(h.step(), 'MERGE')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'src/a.js'), 'utf8'), 'alpha\n', 'the first lane landed')
  const lane = st.readFanout(h.dir).batch[1]
  assert.deepStrictEqual([lane.status, lane.conflicts], ['sent-back', ['src/a.js']])
  const gd = execFileSync('git', ['-C', h.wt('03-gamma'), 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  const rebaseOn = () => fs.existsSync(path.join(gd, 'rebase-merge')) || fs.existsSync(path.join(gd, 'rebase-apply'))
  assert.ok(rebaseOn(), 'the rebase is left in progress in the lane worktree')
  const out = h.ok().stdout
  assert.ok(out.includes(`prompt: "/spec:run ${specPath('03-gamma')} --root ${h.wt('03-gamma')}"`), 'the re-dispatch prompt is the bare /spec:run, nothing shell-hostile')
  assert.match(out, /lane 2 conflicts: src\/a\.js/)
  const w = h.wt('03-gamma')
  const laneRun = (...a) => runNode('scripts/run.js', [specPath('03-gamma'), '--root', w, ...a])
  const laneOut = laneRun()
  assert.match(laneOut.stdout, /▶ MERGE_READY\n\na rebase onto trunk is in progress in this worktree: edit each conflicted file/, 'the lane driver prints the rebase instruction itself')
  assert.ok(laneOut.stdout.includes(h.g('rev-parse', 'main').trim()), 'and names the trunk head it rebases onto')
  h.ok('--mark', 'resent')
  assert.strictEqual(h.step(), 'WAIT')
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '2').status, 2, 'a lane still mid-rebase cannot return')

  fs.writeFileSync(path.join(w, 'src/a.js'), 'alpha\ngamma\n')
  fs.writeFileSync(path.join(w, 'RED'), '') // the resolution broke the suite
  const cont = laneRun()
  assert.match(cont.stdout, /^▶ REPAIR/, 'one invocation: the rebase continues, the gate runs, and the red resolution is repaired, never landed')
  assert.ok(!rebaseOn(), 'the rebase is finished')
  const run = st.readRun(path.join(w, specPath('03-gamma')))
  assert.deepStrictEqual([run.step, run.base], ['REPAIR', h.g('rev-parse', 'main').trim()], 'base moved to merge-base(trunk, HEAD)')
  fs.rmSync(path.join(w, 'RED'))
  assert.match(laneRun('--mark', 'repaired').stdout, /REPAIR → REVIEW/)
  assert.match(fs.readFileSync(path.join(w, 'specs/20261104/03-gamma.run/diff.patch'), 'utf8'), /\+gamma/, 'the reviewer sees the resolved diff')
  const f = path.join(tmpdir('findings'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: [], verdict: 'clean' }))
  assert.match(laneRun('--mark', 'reviewed', '--file', f).stdout, /REVIEW → MERGE_READY/)
  const head = execFileSync('git', ['-C', w, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.ok(st.readRun(path.join(w, specPath('03-gamma'))).report.includes(`commit ${head}`), 'the MERGE_READY report names the rebased head')
  fs.writeFileSync(path.join(h.dir, 'other.txt'), 'x\n'); h.g('add', 'other.txt'); h.g('commit', '-q', '-m', 'trunk moved meanwhile')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT', 'no second re-dispatch: the returned lane lands')
  assert.ok(!JSON.stringify(st.readFanout(h.dir)).includes('resolving'), 'fanout no longer writes resolving')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'src/a.js'), 'utf8'), 'alpha\ngamma\n', 'the resolved lane landed on trunk')
  assert.ok(st.readQueue(h.dir).items[2].done && !fs.existsSync(w), 'ticked and cleaned')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'other.txt'), 'utf8'), 'x\n', 'the trunk commit made meanwhile survived')
  assert.ok(h.ok().stdout.includes(`merged 03-gamma as ${h.g('rev-parse', 'HEAD').trim()} into trunk; queue item ticked`), 'REPORT prints the sha trunk holds after the landing')
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

test('landing refuses while the main checkout is off trunk instead of fast-forwarding a stray branch', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  h.g('checkout', '-q', '-b', 'feat')
  const r = h.run('--mark', 'returned', '--lane', '1')
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /on feat, not main/)
  assert.strictEqual(h.g('rev-parse', 'feat').trim(), h.g('rev-parse', 'main').trim(), 'nothing landed on the stray branch')
  h.g('checkout', '-q', 'main')
  h.ok()
  h.ok('--mark', 'returned', '--lane', '2')
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

// ---- spec 20261105/02: lanes that wait for each other ------------------------------------------

const SPEC4 = [...SPEC_LIST, ['04-delta', 'src/d.js']]
const P = (stem) => specPath(stem)
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })

test('AC-20261105-02-1 PLAN holds a spec whose dependency is not done and says why; once the dependency merged, the next PLAN picks it', () => {
  const h = host({
    lanes: 4, specs: SPEC4,
    deps: { '02-beta': [P('01-alpha')], '03-gamma': [P('04-delta')] }, status: { '04-delta': 'draft' },
  })
  const plan = h.ok()
  assert.match(plan.stdout, /Auto-picked batch: 1 lane\(s\)/)
  assert.ok(plan.stdout.includes('lane 1: ' + P('01-alpha')) && !plan.stdout.includes('lane 2:'), 'A runs alone')
  assert.ok(plan.stdout.includes(`${P('02-beta')} waits — depends on ${P('01-alpha')} (lane 1 this batch)`), plan.stdout)
  assert.ok(plan.stdout.includes(`${P('03-gamma')} waits — depends on ${P('04-delta')} (draft — it cannot land in this fan-out)`), plan.stdout)
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'src/a.js')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  h.ok('--mark', 'reported')
  const next = h.ok()
  assert.ok(next.stdout.includes('lane 1: ' + P('02-beta')), 'B is auto-picked once A is done on trunk')
  assert.ok(next.stdout.includes(`${P('03-gamma')} waits — depends on ${P('04-delta')}`), 'C still waits')
})

test('AC-20261105-02-2 a missing or done dependency does not hold a spec; a hardened one that was not picked is named; a scalar depends_on is one entry', () => {
  const h = host({ lanes: 4, deps: { '01-alpha': [P('99-nope')], '02-beta': P('03-gamma'), '03-gamma': [] } })
  st.writeStatus(path.join(h.dir, P('03-gamma')), 'done')
  const j = JSON.parse(h.ok('--json').stdout)
  assert.ok(j.body.includes('lane 1: ' + P('01-alpha')), 'a dependency with no file on disk is ignored')
  assert.ok(j.body.includes('lane 2: ' + P('02-beta')), 'a dependency whose root copy is done is satisfied')
  const h2 = host({ lanes: 4, deps: { '02-beta': [P('01-alpha')] } })
  const only = JSON.parse(h2.ok(P('02-beta'), '--json').stdout)
  assert.ok(only.body.includes(`${P('02-beta')} waits — depends on ${P('01-alpha')} (hardened, not done)`), only.body)
  const h3 = host({ lanes: 4, deps: { '02-beta': P('01-alpha') } })
  assert.ok(JSON.parse(h3.ok(P('02-beta'), '--json').stdout).body.includes('depends on ' + P('01-alpha')), 'a scalar string is one entry')
})

test('AC-20261105-02-3 an explicit spec, --pick and picked all obey the dependency rule', () => {
  const h = host({ lanes: 4, deps: { '02-beta': [P('01-alpha')] } })
  const explicit = JSON.parse(h.ok(P('02-beta'), '--json').stdout)
  assert.match(explicit.body, /queue drained/, 'nothing runnable is today\'s drained report')
  assert.ok(explicit.body.includes(`${P('02-beta')} waits — depends on ${P('01-alpha')} (hardened, not done)`))
  assert.strictEqual(explicit.mark, null, 'and no lane is planned')
  const pick = h.ok('--pick').stdout
  assert.match(pick, /\[ \] 01-alpha/); assert.ok(!/\[ \] 02-beta/.test(pick), 'SELF-PICK offers A and not B')
  const r = h.run('--mark', 'picked', '--label', '02-beta')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes(`${P('02-beta')} is not runnable — depends on ${P('01-alpha')} (hardened, not done)`), r.stderr)
})

test('AC-20261105-02-4 a lane that stops keeps its work in a wip commit without the relay file; dismissing keeps the commit and the worktree', () => {
  const h = host()
  dispatchTwo(h)
  const w = h.wt('01-alpha')
  fs.mkdirSync(path.join(w, 'src'), { recursive: true })
  fs.writeFileSync(path.join(w, 'src/staged.js'), 's\n'); gitIn(w, 'add', 'src/staged.js')
  fs.writeFileSync(path.join(w, 'src/loose.js'), 'u\n')
  pending.writePending(w, { lane: '1', question: 'Which shape?', options: ['flat', 'nested'] })
  h.ok('--mark', 'returned', '--lane', '1', '--stopped', 'x')
  assert.strictEqual(gitIn(w, 'rev-list', '--count', 'main..spec/01-alpha').trim(), '1', 'the branch is one commit ahead')
  assert.strictEqual(gitIn(w, 'log', '-1', '--format=%s').trim(), 'wip(spec): 01-alpha')
  assert.deepStrictEqual(gitIn(w, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort(), ['src/loose.js', 'src/staged.js'], 'both files, not the pending file')
  assert.strictEqual(gitIn(w, 'status', '--porcelain', '--untracked-files=all').trim(), '?? .claude/pending-question.json', 'the worktree is clean but for the relay file')
  const sha = gitIn(w, 'rev-parse', 'HEAD').trim()
  h.ok('--mark', 'dismissed', '--lane', '1')
  assert.strictEqual(gitIn(w, 'rev-parse', 'spec/01-alpha').trim(), sha, 'dismissing keeps the commit')
  assert.ok(fs.existsSync(w), 'and the worktree')
})

test('a lane that ended PARKED is dismissed with its work committed first', () => {
  const h = host()
  dispatchTwo(h)
  fs.writeFileSync(path.join(h.wt('01-alpha'), 'src-wip.txt'), 'w\n')
  st.writeRun(path.join(h.wt('01-alpha'), P('01-alpha')), { step: 'PARKED', spec: P('01-alpha') })
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(gitIn(h.wt('01-alpha'), 'log', '-1', '--format=%s').trim(), 'wip(spec): 01-alpha')
})

// A lane worktree that exists from an earlier batch: branched at main, then trunk moves two commits.
function reusedLane(h, { conflict = false } = {}) {
  const w = h.wt('01-alpha')
  const old = h.g('rev-parse', 'main').trim()
  h.g('worktree', 'add', '-q', '-b', 'spec/01-alpha', w, 'main')
  for (const n of [1, 2]) { fs.writeFileSync(path.join(h.dir, `t${n}.txt`), 't\n'); h.g('add', '-A'); h.g('commit', '-q', '-m', 'trunk ' + n) }
  if (conflict) { fs.mkdirSync(path.join(h.dir, 'src'), { recursive: true }); fs.writeFileSync(path.join(h.dir, 'src/a.js'), 'trunk\n'); h.g('add', '-A'); h.g('commit', '-q', '-m', 'trunk a') }
  fs.mkdirSync(path.join(w, 'src'), { recursive: true })
  fs.writeFileSync(path.join(w, 'src/a.js'), 'lane\n') // uncommitted edits
  st.writeRun(path.join(w, P('01-alpha')), {
    step: 'FIX', spec: P('01-alpha'), lane: true, worktree: '.', branch: 'spec/01-alpha', base: old, inPlace: false,
    attempts: { repair: 0, fix: 0 }, gate: null, review: { verdict: 'fix', findings: [{ severity: 'blocking', file: 'src/a.js', summary: 'wrong thing' }] },
  })
  return { w, old }
}

test('AC-20261105-02-6 PLAN re-picks a lane whose worktree is behind trunk: its edits go into a wip commit and the branch is rebased onto trunk', () => {
  const h = host()
  const { w } = reusedLane(h)
  h.ok('--mark', 'planned')
  const out = h.ok().stdout
  const trunk = h.g('rev-parse', 'main').trim()
  assert.match(out, /^▶ DISPATCH/)
  assert.ok(out.includes(`reused worktree — rebased onto ${trunk}`), out)
  assert.strictEqual(gitIn(w, 'merge-base', 'main', 'spec/01-alpha').trim(), trunk, 'the branch sits on trunk')
  assert.deepStrictEqual(gitIn(w, 'log', '--format=%s', 'main..spec/01-alpha').trim().split('\n'), ['wip(spec): 01-alpha'], 'the edits are in a wip commit')
  assert.strictEqual(st.readRun(path.join(w, P('01-alpha'))).base, trunk, 'the run state base is the trunk sha')
  assert.ok(pending.isLane(w), 'the worktree is a lane again')
})

test('AC-20261105-02-7 a conflicting rebase of a reused lane stays in progress; the lane resolves it and continues in its own dispatch', () => {
  const h = host()
  const { w } = reusedLane(h, { conflict: true })
  h.ok('--mark', 'planned')
  const out = h.ok().stdout
  assert.ok(out.includes('reused worktree — rebase in progress, conflicts: src/a.js (the lane resolves first)'), out)
  const gd = gitIn(w, 'rev-parse', '--absolute-git-dir').trim()
  assert.ok(fs.existsSync(path.join(gd, 'rebase-merge')) || fs.existsSync(path.join(gd, 'rebase-apply')), 'the rebase is left in progress')
  const trunk = h.g('rev-parse', 'main').trim()
  const laneRun = () => runNode('scripts/run.js', [P('01-alpha'), '--root', w])
  const first = laneRun().stdout
  assert.match(first, /^▶ FIX\n\na rebase onto trunk is in progress/, first)
  assert.ok(first.includes(trunk), 'the resolve text names the trunk sha')
  fs.writeFileSync(path.join(w, 'src/a.js'), 'both\n')
  const second = laneRun().stdout
  assert.match(second, /^▶ FIX\n\nDispatch ONE `builder`/, 'with the markers gone the rebase continues and the FIX brief prints')
  assert.strictEqual(st.readRun(path.join(w, P('01-alpha'))).base, gitIn(w, 'merge-base', 'main', 'HEAD').trim(), 'base is merge-base(trunk, HEAD)')
  assert.strictEqual(gitIn(w, 'status', '--porcelain', '--untracked-files=no').trim(), '')
})

test('AC-20261105-02-9 a lane whose run state carries waitingOn returns as waiting: committed, unmarked, off the merge queue; re-picked and rebased once the spec is done', () => {
  const h = host()
  dispatchTwo(h)
  const w = h.wt('01-alpha')
  fs.writeFileSync(path.join(w, 'half.txt'), 'h\n')
  st.writeRun(path.join(w, P('01-alpha')), { step: 'FIX', spec: P('01-alpha'), lane: true, worktree: '.', branch: 'spec/01-alpha', base: h.g('rev-parse', 'main').trim(), waitingOn: P('03-gamma'), attempts: { repair: 0, fix: 0 } })
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1')
  const lane = st.readFanout(h.dir).batch[0]
  assert.deepStrictEqual([lane.status, lane.on], ['waiting', P('03-gamma')])
  assert.strictEqual(gitIn(w, 'log', '-1', '--format=%s').trim(), 'wip(spec): 01-alpha')
  assert.ok(!pending.isLane(w), 'no lane marker')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT', 'the other lane lands without the waiting one')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/b.js')))
  const rep = h.ok().stdout
  assert.match(rep, /1 waiting/)
  assert.ok(rep.includes(`waiting 01-alpha — on ${P('03-gamma')}; worktree kept at ${lane.worktree}`), rep)
  h.ok('--mark', 'reported')
  const plan = h.ok().stdout
  assert.ok(plan.includes(`${P('01-alpha')} waits — waiting on ${P('03-gamma')} (hardened, not done)`), plan)
  assert.ok(plan.includes('lane 1: ' + P('03-gamma')), 'the spec it waits on is picked')

  st.writeStatus(path.join(h.dir, P('03-gamma')), 'done'); h.g('commit', '-q', '-am', 'gamma done')
  const again = h.ok().stdout
  assert.ok(again.includes('lane 1: ' + P('01-alpha')), 'once the spec is done the waiting lane is picked: ' + again)
  h.ok('--mark', 'planned')
  const disp = h.ok().stdout
  const trunk = h.g('rev-parse', 'main').trim()
  assert.ok(disp.includes(`reused worktree — rebased onto ${trunk}`), disp)
  const run = st.readRun(path.join(w, P('01-alpha')))
  assert.strictEqual(run.waitingOn, undefined, 'waitingOn is removed'); assert.strictEqual(run.base, trunk)
})

test('AC-20261105-02-10 waiting --lane N --on is accepted at WAIT for a dispatched lane and at RELAY for a stopped lane; a non-spec --on is refused', () => {
  const h = host()
  dispatchTwo(h)
  assert.strictEqual(h.run('--mark', 'waiting', '--lane', '1', '--on', 'nope.md').status, 2)
  const bad = h.run('--mark', 'waiting', '--lane', '1', '--on', 'nope.md')
  assert.match(bad.stderr, /--on nope\.md is not a spec file under /)
  assert.strictEqual(h.run('--mark', 'waiting', '--lane', '1').status, 2, '--on is required')
  fs.writeFileSync(path.join(h.wt('01-alpha'), 'half.txt'), 'h\n')
  h.ok('--mark', 'waiting', '--lane', '1', '--on', P('03-gamma'))
  const lane = st.readFanout(h.dir).batch[0]
  assert.deepStrictEqual([lane.status, lane.on], ['waiting', P('03-gamma')])
  const run = st.readRun(path.join(h.wt('01-alpha'), P('01-alpha')))
  assert.deepStrictEqual([run.step, run.waitingOn], ['OPEN', P('03-gamma')], 'the run state is created as OPEN')
  assert.strictEqual(gitIn(h.wt('01-alpha'), 'log', '-1', '--format=%s').trim(), 'wip(spec): 01-alpha')
  assert.ok(!pending.isLane(h.wt('01-alpha')))
  assert.match(h.ok().stdout, /lane 1 — 01-alpha: waiting/)

  const g = host()
  dispatchTwo(g)
  pending.writePending(g.wt('01-alpha'), { lane: '1', question: 'Which shape?', options: ['flat', 'nested'] })
  g.ok('--mark', 'returned', '--lane', '1')
  g.finish('02-beta', 'src/b.js'); g.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(g.step(), 'RELAY')
  const relay = g.ok().stdout
  const wait = relay.indexOf('wait for a spec: node '); const ans = relay.indexOf('answer: node ')
  assert.ok(wait > 0 && wait < ans && relay.includes('--mark waiting --lane 1 --on <spec path>'), relay)
  assert.ok(wait < relay.indexOf('drop it instead:'))
  g.ok('--mark', 'waiting', '--lane', '1', '--on', P('03-gamma'))
  assert.strictEqual(g.step(), 'REPORT', 'the waiting lane leaves the batch; lane 2 lands')
  assert.strictEqual(st.readFanout(g.dir).batch[0].status, 'waiting')
})

test('AC-20261105-02-11 a MERGE_READY lane lands inside its returned mark while another lane is out; not while a sent-back lane holds a rebase', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/b.js')), 'trunk holds lane 2 already')
  assert.ok(st.readQueue(h.dir).items[1].done, 'its queue item is ticked')
  assert.ok(!fs.existsSync(h.wt('02-beta')), 'its worktree is removed')
  assert.strictEqual(h.step(), 'WAIT')
  assert.match(h.ok().stdout, /lane 1 — 01-alpha: dispatched/, 'WAIT lists the lane still out')

  // alpha and gamma conflict; beta finishes after gamma was sent back
  const g = host({ lanes: 3 })
  g.ok(P('01-alpha'), P('03-gamma'), P('02-beta'), '--mark', 'planned')
  g.ok('--mark', 'dispatched')
  g.finish('01-alpha', 'src/a.js', 'alpha\n'); g.finish('03-gamma', 'src/a.js', 'gamma\n'); g.finish('02-beta', 'src/b.js')
  g.ok('--mark', 'returned', '--lane', '1')
  g.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(st.readFanout(g.dir).batch[1].status, 'sent-back')
  g.ok('--mark', 'returned', '--lane', '3')
  assert.strictEqual(st.readFanout(g.dir).batch[2].status, 'done', 'lane 3 waits for the sent-back lane')
  assert.ok(!fs.existsSync(path.join(g.dir, 'src/b.js')))
})

test('AC-20261105-02-16 the interface contract lists the real fanout arguments and marks', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/v8/interface-contract.md'), 'utf8')
  const rows = doc.split('\n').filter((l) => l.startsWith('| `/spec:fanout`') || l.startsWith('| fanout |'))
  assert.ok(rows.length >= 4, 'the fanout rows are found')
  const all = rows.join('\n')
  assert.ok(rows[0].includes('`[--pick] [<spec path>…]`'), rows[0])
  assert.ok(all.includes('`planned`, `picked --label <title>…`, `dispatched`, `returned --lane <id> [--stopped "<reason>"]`, `resent`, `answered --lane <id> [--label <label>]`, `resumed`, `dismissed --lane <id>`, `waiting --lane <id> --on <spec>`, `gate-repaired`, `reported`'))
  for (const gone of ['--batch', '--include-fixes', '--override-serial', '--ask <key', '`merged`']) assert.ok(!all.includes(gone), gone)
  assert.match(rows.find((l) => l.startsWith('| fanout | RELAY')), /dependency/, 'the ask row names the dependency stop')
  const run = doc.split('\n').filter((l) => /\(`\/spec:run`\)/.test(l)).join('\n')
  for (const m of ['`waiting --on <spec>`', '`unmet --decision <id> --why <text>`', '`escalate <retry\\|park\\|amend\\|revert>`']) assert.ok(run.includes(m), m)
})
