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
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))
const pending = require(path.join(SPEC, 'scripts/lib/pending.js'))

const SPEC_LIST = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/a.js']]
const specPath = (stem) => `specs/20261104/${stem}.md`

function specText(stem, file, { status = 'hardened', deps } = {}) {
  const dep = deps === undefined ? '' : `depends_on: ${Array.isArray(deps) ? `[${deps.join(', ')}]` : deps}\n`
  return `---\ndate: 2026-11-04\nstatus: ${status}\n${dep}architecture: false\n---\n# ${stem}\n\n## Intent\n- You asked: ${stem}\n\n` +
    `## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| \`${file}\` | CREATE | ${stem} |\n`
}

// opts: lanes, specs (stem, file pairs), deps {stem: depends_on}, status {stem: status}, testCommand
function host(opts = {}) {
  const SPECS = opts.specs || SPEC_LIST
  const dir = tmpdir('fanout')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nspecs/**/*.run/\n' + (opts.ignore || ''))
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify({ testCommand: opts.testCommand || 'test ! -f RED', lanes: opts.lanes || 2, ...(opts.cfg || {}) }))
  for (const [f, t] of Object.entries(opts.files || {})) fs.writeFileSync(path.join(dir, f), t)
  for (const [stem, file] of SPECS) {
    fs.mkdirSync(path.join(dir, 'specs', '20261104'), { recursive: true })
    fs.writeFileSync(path.join(dir, specPath(stem)), specText(stem, file, { status: (opts.status || {})[stem], deps: (opts.deps || {})[stem] }))
  }
  const g = gitRepo(dir)
  Q.write(dir, { version: 3, seq: 3, items: SPECS.map(([stem], i) => ({ id: i + 1, kind: 'spec', payload: specPath(stem), added: '2026-11-04' })) })
  const run = (...a) => runNode('scripts/fanout.js', ['--root', dir, ...a])
  const ok = (...a) => { const r = run(...a); assert.strictEqual(r.status, 0, `${a.join(' ')}: ${r.stderr}${r.stdout}`); return r }
  const wt = (stem) => path.join(dir, '.claude', 'worktrees', 'spec-' + stem)
  // A lane finishing: code committed on its branch, run state at MERGE_READY.
  const finish = (stem, file, content = stem + '\n', gate = null) => {
    const w = wt(stem)
    fs.mkdirSync(path.dirname(path.join(w, file)), { recursive: true })
    fs.writeFileSync(path.join(w, file), content)
    execFileSync('git', ['-C', w, 'add', '-A'])
    execFileSync('git', ['-C', w, 'commit', '-q', '-m', 'lane ' + stem])
    const base = execFileSync('git', ['-C', w, 'merge-base', 'main', 'HEAD'], { encoding: 'utf8' }).trim()
    st.writeRun(path.join(w, specPath(stem)), { step: 'MERGE_READY', spec: specPath(stem), lane: true, worktree: '.', branch: 'spec/' + stem, base, inPlace: false, attempts: { repair: 0, fix: 0 }, gate, review: null })
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
  const q = Q.read(h.dir)
  assert.ok(q.items[0].done && q.items[1].done && !q.items[2].done, 'the two merged queue items are ticked, the third is not')
  assert.ok(!fs.existsSync(h.wt('01-alpha')) && !fs.existsSync(h.wt('02-beta')), 'lane worktrees are removed')

  const rep = h.ok()
  assert.match(rep.stdout, /Next: 1 spec\(s\) and 0 fix\(es\) left — \/clear, then \/spec:fanout to continue/, 'a runnable spec remains, so the turn ends with the /clear line')
  const reported = h.ok('--mark', 'reported')
  assert.ok(!reported.stdout.includes('Auto-picked'), 'reported prints the checkpoint and no PLAN body')
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
  assert.ok(!Q.read(h.dir).items[0].done, 'a dismissed lane is not ticked')
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
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '2').status, 0, 'a lane returning onto a red trunk is accepted and held (spec 20261105/11 D1)')
  assert.ok(!fs.existsSync(path.join(h.dir, 'src/b.js')), 'and it does not land')
  assert.strictEqual(h.run('--mark', 'gate-repaired').status, 0)
  assert.strictEqual(h.step(), 'MERGE_RED', 'still red: gate-repaired re-runs the gate and stays')
  h.g('rm', '-q', 'RED')
  h.g('commit', '-q', '-m', 'repair')
  h.ok('--mark', 'gate-repaired')
  assert.strictEqual(h.step(), 'REPORT', 'green → the held lane 2 lands in that settle → REPORT')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/b.js')))
  assert.ok(Q.read(h.dir).items[0].done, 'the repaired lane is ticked')
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

test('an AMENDED lane whose trunk spec was re-locked after it ended is planned again: rebased onto trunk, run reset to BUILD, .run/ kept', () => {
  const h = host()
  dispatchTwo(h)
  const w = h.wt('01-alpha')
  const alpha = path.join(w, specPath('01-alpha'))
  st.writeStatus(alpha, 'draft')
  const tip = h.g('rev-parse', 'main').trim()
  st.writeRun(alpha, { step: 'AMENDED', spec: specPath('01-alpha'), lane: true, worktree: '.', branch: 'spec/01-alpha', base: tip, amendedOn: tip, attempts: { repair: 1, fix: 1 }, gate: { tree: 'x' }, review: { verdict: 'fix' }, report: 'old' })
  fs.writeFileSync(path.join(st.runDir(alpha), 'evidence.md'), 'kept\n')
  h.ok('--mark', 'returned', '--lane', '1')
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  h.ok('--mark', 'reported')
  const waits = JSON.parse(h.run('--json').stdout).body
  assert.match(waits, /01-alpha\.md waits — its lane ended AMENDED/, 'before the re-lock the AMENDED lane still waits')
  // The user amends the spec on trunk with /spec:plan: the new text is locked and committed.
  const trunkSpec = path.join(h.dir, specPath('01-alpha'))
  fs.writeFileSync(trunkSpec, fs.readFileSync(trunkSpec, 'utf8') + '\nAmended on trunk.\n')
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'chore(spec): lock 20261104/01')
  const plan = JSON.parse(h.run('--json').stdout).body
  assert.match(plan, /lane \d: specs\/20261104\/01-alpha\.md/, 'the re-locked AMENDED lane is picked: ' + plan)
  assert.ok(!/01-alpha\.md waits/.test(plan), plan)
  h.ok('--mark', 'planned')
  const out = h.ok().stdout
  const trunk = h.g('rev-parse', 'main').trim()
  assert.ok(out.includes(`reused worktree — rebased onto ${trunk}`), out)
  assert.strictEqual(gitIn(w, 'merge-base', 'main', 'spec/01-alpha').trim(), trunk, 'the branch sits on trunk')
  const run = st.readRun(alpha)
  assert.strictEqual(run.step, 'BUILD', 'the run restarts at BUILD')
  assert.strictEqual(run.base, trunk)
  assert.deepStrictEqual(run.attempts, { repair: 0, fix: 0 })
  assert.deepStrictEqual([run.gate, run.review, run.report, run.amendedOn], [null, null, undefined, undefined])
  assert.strictEqual(fs.readFileSync(path.join(st.runDir(alpha), 'evidence.md'), 'utf8'), 'kept\n', '.run/ is kept')
  assert.strictEqual(st.readSpec(alpha).frontmatter.status, 'hardened', 'the lane spec is locked again')
  assert.ok(fs.readFileSync(alpha, 'utf8').includes('Amended on trunk.'), 'the lane has the amended spec')
  assert.ok(pending.isLane(w), 'the worktree is a lane again')
})

test('a spec edit that landed on trunk while the lane was still building is no re-lock: the AMENDED lane waits, untouched', () => {
  const h = host()
  dispatchTwo(h)
  const w = h.wt('01-alpha')
  const alpha = path.join(w, specPath('01-alpha'))
  const base = h.g('rev-parse', 'main').trim()
  const trunkSpec = path.join(h.dir, specPath('01-alpha'))
  fs.writeFileSync(trunkSpec, fs.readFileSync(trunkSpec, 'utf8') + '\nEdited while the lane built.\n')
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'docs: touch the spec mid-build')
  const tip = h.g('rev-parse', 'main').trim()
  assert.notStrictEqual(tip, base)
  st.writeStatus(alpha, 'draft')
  st.writeRun(alpha, { step: 'AMENDED', spec: specPath('01-alpha'), lane: true, worktree: '.', branch: 'spec/01-alpha', base, amendedOn: tip })
  h.ok('--mark', 'returned', '--lane', '1')
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  h.ok('--mark', 'reported')
  const plan = JSON.parse(h.run('--json').stdout).body
  assert.match(plan, /01-alpha\.md waits — its lane ended AMENDED/, 'nobody has amended anything yet: ' + plan)
  assert.strictEqual(st.readRun(alpha).step, 'AMENDED')
  assert.strictEqual(st.readSpec(alpha).frontmatter.status, 'draft')
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
  assert.ok(Q.read(h.dir).items[2].done && !fs.existsSync(w), 'ticked and cleaned')
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
  st.writeFanout(h.dir, { step: 'PLAN' }) // a state file exists, so the lane marker below is not a lost fan-out
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
  h.finish('02-beta', 'RED', 'broken\n') // lane 2 lands a red suite on an unmoved trunk: no pre-ff gate, the trunk gate catches it
  fs.mkdirSync(path.join(h.dir, '.git/hooks'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, '.git/hooks/pre-commit'), '#!/bin/sh\ntest ! -f RED\n', { mode: 0o755 }) // the host runs its suite on every commit
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
  assert.match(explicit.body, /nothing runnable — 1 named spec\(s\) wait/, 'an explicit run judges only the specs it named')
  assert.ok(!explicit.body.includes('drained'))
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

test('AC-20261105-02-11 AC-20261105-10-1 AC-20261105-10-15 a MERGE_READY lane lands inside its returned mark while another lane is out, also while a sent-back lane holds a rebase', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/b.js')), 'trunk holds lane 2 already')
  assert.ok(Q.read(h.dir).items[1].done, 'its queue item is ticked')
  assert.ok(!fs.existsSync(h.wt('02-beta')), 'its worktree is removed')
  assert.strictEqual(h.step(), 'WAIT')
  assert.match(h.ok().stdout, /lane 1 — 01-alpha: dispatched/, 'WAIT lists the lane still out')

  // alpha and gamma conflict; beta finishes after gamma was sent back and lands anyway
  const g = host({ lanes: 3 })
  g.ok(P('01-alpha'), P('03-gamma'), P('02-beta'), '--mark', 'planned')
  g.ok('--mark', 'dispatched')
  g.finish('01-alpha', 'src/a.js', 'alpha\n'); g.finish('03-gamma', 'src/a.js', 'gamma\n'); g.finish('02-beta', 'src/b.js')
  g.ok('--mark', 'returned', '--lane', '1')
  g.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(st.readFanout(g.dir).batch[1].status, 'sent-back')
  const three = g.ok('--mark', 'returned', '--lane', '3').stdout
  const batch = st.readFanout(g.dir).batch
  assert.deepStrictEqual(batch.map((l) => l.status), ['merged', 'sent-back', 'merged'], 'lane 3 landed while lane 2 stays sent back')
  assert.ok(fs.existsSync(path.join(g.dir, 'src/b.js')) && Q.read(g.dir).items[1].done && !fs.existsSync(g.wt('02-beta')), 'trunk holds it, ticked, worktree removed')
  assert.ok(three.includes(`lane 3 landed as ${g.g('rev-parse', 'HEAD').trim()}`), three)

  // lane 2 resolves, gates and reviews in its own dispatch; its return is rebased onto the moved trunk and lands
  g.ok('--mark', 'resent')
  const w = g.wt('03-gamma')
  const laneRun = (...a) => runNode('scripts/run.js', [P('03-gamma'), '--root', w, ...a])
  laneRun()
  fs.writeFileSync(path.join(w, 'src/a.js'), 'alpha\ngamma\n')
  assert.match(laneRun().stdout, /^▶ REVIEW/, 'the resolution continues to review')
  const f = path.join(tmpdir('findings'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: [], verdict: 'clean' }))
  assert.match(laneRun('--mark', 'reviewed', '--file', f).stdout, /REVIEW → MERGE_READY/)
  g.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(g.step(), 'REPORT')
  assert.strictEqual(fs.readFileSync(path.join(g.dir, 'src/a.js'), 'utf8'), 'alpha\ngamma\n')
  assert.ok(fs.existsSync(path.join(g.dir, 'src/b.js')), 'lane 3 is still on trunk')
  assert.deepStrictEqual(st.readFanout(g.dir).batch.map((l) => l.status), ['merged', 'merged', 'merged'])
})

test('AC-20261105-02-16 the interface contract lists the real fanout arguments and marks', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/v8/interface-contract.md'), 'utf8')
  const rows = doc.split('\n').filter((l) => l.startsWith('| `/spec:fanout`') || l.startsWith('| fanout |'))
  assert.ok(rows.length >= 4, 'the fanout rows are found')
  const all = rows.join('\n')
  assert.ok(rows[0].includes('`[--pick] [<spec path>…]`'), rows[0])
  assert.ok(all.includes('`planned`, `picked --label <title>…`, `dispatched`, `returned --lane <id> [--stopped "<reason>"]`, `resent`, `answered --lane <id> [--label <label>]`, `resumed`, `dismissed --lane <id> [--discard]`, `waiting --lane <id> --on <spec>`, `gate-repaired`, `reported`'))
  for (const gone of ['--batch', '--include-fixes', '--override-serial', '--ask <key', '`merged`']) assert.ok(!all.includes(gone), gone)
  assert.match(rows.find((l) => l.startsWith('| fanout | RELAY')), /dependency/, 'the ask row names the dependency stop')
  const run = doc.split('\n').filter((l) => /\(`\/spec:run`\)/.test(l)).join('\n')
  for (const m of ['`waiting --on <spec>`', '`unmet --decision <id> --why <text>`', '`escalate <retry\\|park\\|amend\\|revert>`']) assert.ok(run.includes(m), m)
})

// ---- spec 20261105/04 D8: the queue's `after` gate -----------------------------------------------
test('AC-20261105-04-9 a hardened spec whose queue item has an unmet after waits, is picked when the gate opens, and obeys it as an explicit path', () => {
  const h = host({ lanes: 4, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js']] })
  const q = Q.read(h.dir)
  q.items[1].after = { brief: '03' }
  Q.write(h.dir, q)
  fs.mkdirSync(path.join(h.dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, 'docs/roadmap/03-rounds.md'), '# 03\n')
  const line = `${P('02-beta')} waits — after brief 03 (unplanned)`
  const auto = JSON.parse(h.ok('--json').stdout)
  assert.ok(auto.body.includes('lane 1: ' + P('01-alpha')) && !auto.body.includes('lane 2:'), auto.body)
  assert.ok(auto.body.includes(line), auto.body)
  const explicit = JSON.parse(h.ok(P('02-beta'), '--json').stdout)
  assert.ok(explicit.body.includes(line), explicit.body)
  assert.match(explicit.body, /nothing runnable — 1 named spec\(s\) wait/)
  assert.ok(!explicit.body.includes('drained'))
  fs.writeFileSync(path.join(h.dir, 'specs/20261104/03-done.md'), '---\nstatus: done\nbrief: 03\n---\n# Done\n')
  const open = JSON.parse(h.ok('--json').stdout)
  assert.ok(open.body.includes('lane 2: ' + P('02-beta')), open.body)
  const q2 = Q.read(h.dir); q2.items[1].after = { spec: 'specs/20261104/missing.md' }; Q.write(h.dir, q2)
  assert.ok(JSON.parse(h.ok('--json').stdout).body.includes(`${P('02-beta')} waits — after specs/20261104/missing.md (missing)`))
})

test('AC-20261105-04-9 a bracketless depends_on of two specs is evaluated entry by entry', () => {
  const h = host({ lanes: 4, deps: { '03-gamma': `${P('01-alpha')}, ${P('02-beta')}` } })
  st.writeStatus(path.join(h.dir, P('01-alpha')), 'done')
  const only = JSON.parse(h.ok(P('03-gamma'), '--json').stdout)
  assert.ok(only.body.includes(`${P('03-gamma')} waits — depends on ${P('02-beta')} (hardened, not done)`), only.body)
})

// ---- spec 20261105/07: a batch ends clean --------------------------------------------------------

const FIX_PAYLOAD = (stem = '01-alpha', symptom = 'RED file left') => `/spec:fix ${P(stem)} — ${symptom}`
// Seeds a fix through the owner's door: typed text is parsed once, here.
function addFix(h, payload = FIX_PAYLOAD(), extra = {}) {
  return Q.add(h.dir, { payload, type: 'fix', ...extra })
}
const commitAll = (h, msg = 'edit') => { h.g('add', '-A'); h.g('commit', '-q', '--allow-empty', '-m', msg) }
const mainHead = (h) => h.g('rev-parse', 'main').trim()

test('AC-20261105-07-1 REPORT counts the specs and fixes left and ends the turn; reported prints no PLAN body; the next bare run plans', () => {
  const h = host()
  addFix(h)
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1'); h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
  const rep = h.ok().stdout
  assert.ok(rep.includes('Next: 1 spec(s) and 1 fix(es) left — /clear, then /spec:fanout to continue'), rep)
  assert.ok(!rep.includes('queue drained'))
  const done = h.ok('--mark', 'reported').stdout
  assert.match(done, /^✅ checkpoint — REPORT → PLAN;/, done)
  assert.ok(!done.includes('▶ PLAN') && !done.includes('Auto-picked'), 'the turn ends at the checkpoint: no PLAN body')
  const next = h.ok().stdout
  assert.match(next, /^▶ PLAN/)
  assert.ok(next.includes('lane 1: ' + P('03-gamma')), next)
  assert.ok(next.includes(`lane 2: ${P('01-alpha')} — fix: RED file left`), next)
})

test('AC-20261105-07-1 a drained queue ends REPORT with the drained line', () => {
  const h = host({ specs: [SPEC_LIST[0]] })
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'src/a.js'); h.ok('--mark', 'returned', '--lane', '1')
  assert.ok(h.ok().stdout.includes('Next: nothing needs you — queue drained'))
})

// A queue holding one fix item for a done 01-alpha (and, optionally, more specs).
function fixHost(opts = {}) {
  const h = host({ specs: [['01-alpha', 'src/a.js'], ...(opts.more || [])], status: { '01-alpha': 'done' }, ...opts.host })
  const q = Q.read(h.dir); q.items = []; Q.write(h.dir, q)
  commitAll(h, 'alpha done')
  addFix(h, opts.payload || FIX_PAYLOAD())
  return h
}

test('AC-20261105-07-2 a fix item is auto-picked as a fix lane with its own worktree, branch and --fix prompt', () => {
  const h = fixHost()
  const plan = h.ok().stdout
  assert.ok(plan.includes(`lane 1: ${P('01-alpha')} — fix: RED file left`), plan)
  h.ok('--mark', 'planned')
  const lane = st.readFanout(h.dir).batch[0]
  assert.deepStrictEqual([lane.kind, lane.stem, lane.worktree, lane.branch, lane.spec, lane.symptom], ['fix', 'fix-01-alpha', '.claude/worktrees/fix-01-alpha', 'fix/01-alpha', P('01-alpha'), 'RED file left'])
  const disp = h.ok().stdout
  const wtp = path.join(h.dir, '.claude/worktrees/fix-01-alpha')
  assert.ok(fs.existsSync(wtp) && pending.isLane(wtp), 'the driver creates and marks the fix worktree')
  assert.strictEqual(h.g('rev-parse', '--verify', 'fix/01-alpha').trim(), mainHead(h), 'branched at trunk')
  const prompt = JSON.parse(/prompt: ("[^\n]+") \}\)/.exec(disp)[1])
  assert.strictEqual(prompt, `/spec:fix --root ${wtp} ${P('01-alpha')} — RED file left`)
})

test('AC-20261105-07-2 a fix item waits while its spec is in a lane, and when it names no spec on disk', () => {
  const h = fixHost()
  addFix(h, FIX_PAYLOAD('99-nope', 'x'))
  // alpha live in a lane: its worktree exists and is marked
  st.writeFanout(h.dir, { step: 'PLAN' })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-alpha', h.wt('01-alpha'))
  pending.markLane(h.wt('01-alpha'), 'fanout')
  const out = JSON.parse(h.ok('--json').stdout).body
  assert.ok(out.includes(`${FIX_PAYLOAD()} waits — its spec is in a lane`), out)
  assert.ok(out.includes(`${FIX_PAYLOAD('99-nope', 'x')} waits — fix item names no spec on disk`), out)
  assert.match(out, /nothing runnable — 2 open item\(s\)/, 'nothing is runnable, and two items are open')
  assert.ok(!out.includes('drained'))
  // a free-text fix item is a spec-less fix lane
  const free = fixHost({ payload: 'fix the login' })
  assert.ok(JSON.parse(free.ok('--json').stdout).body.includes(`lane 1: fix-${st.slugOf('fix the login')} — fix: fix the login`))
})

test('AC-20261105-07-3 a fix lane runs through run.js --fix and lands as fix(<id>): <symptom>, ticks its item, leaves the spec and makes no done commit', () => {
  const h = fixHost()
  const item = Q.read(h.dir).items[0]
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  const w = path.join(h.dir, '.claude/worktrees/fix-01-alpha')
  const laneRun = (...a) => runNode('scripts/run.js', [P('01-alpha'), '--root', w, ...a])
  const first = laneRun('--fix', 'RED file left')
  assert.strictEqual(first.status, 0, first.stderr)
  assert.match(first.stdout, /^▶ BUILD/)
  assert.ok(first.stdout.includes('## Fix\nRED file left') && !first.stdout.includes('## File Plan'), first.stdout)
  fs.writeFileSync(path.join(w, 'src-fix.txt'), 'fixed\n')
  st.writeJson(path.join(st.runDir(path.join(w, P('01-alpha'))), 'fix.json'), { cause: 'c', test: 't :: guards c', strings: [], choices: [], needsPlan: null })
  assert.strictEqual(laneRun('--mark', 'built').status, 0)
  const f = path.join(tmpdir('findings'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: [], verdict: 'clean' }))
  assert.match(laneRun('--mark', 'reviewed', '--file', f).stdout, /REVIEW → MERGE_READY/)
  assert.strictEqual(st.readRun(path.join(w, P('01-alpha'))).step, 'MERGE_READY')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  assert.strictEqual(h.g('log', '-1', '--format=%s', 'main').trim(), 'fix(20261104/01): RED file left')
  assert.ok(!/chore\(spec\):.*done/.test(h.g('log', '--format=%s', 'main')), 'no done commit')
  assert.strictEqual(st.readSpec(path.join(h.dir, P('01-alpha'))).frontmatter.status, 'done', 'the spec status is unchanged')
  assert.ok(fs.existsSync(path.join(h.dir, 'src-fix.txt')))
  const ticked = Q.read(h.dir).items.find((i) => i.id === item.id)
  assert.ok(ticked.done, 'the prompt item is ticked')
  assert.ok(!fs.existsSync(w) && !h.g('branch', '--list', 'fix/01-alpha').trim(), 'worktree and branch are gone')
  assert.strictEqual(h.g('status', '--porcelain', '--untracked-files=no').trim(), '')
})

// Two lanes whose files are green alone and red together.
const COLLIDE = 'if test -f src/a.js && test -f src/b.js; then echo "FAIL: a and b collide"; exit 1; fi'

test('AC-20261105-07-5 a lane that is red on top of the landed trunk is gated before the fast-forward and sent back to its own GATE; its repaired return lands', () => {
  const h = host({ testCommand: COLLIDE })
  commitAll(h, 'config')
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1')
  const trunk = mainHead(h)
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(mainHead(h), trunk, 'trunk did not move')
  const lane = st.readFanout(h.dir).batch[1]
  assert.deepStrictEqual([lane.status, lane.red], ['sent-back', 'FAIL: a and b collide'])
  const w = h.wt('02-beta')
  const run = st.readRun(path.join(w, P('02-beta')))
  assert.deepStrictEqual([run.step, run.base, run.review, run.attempts], ['GATE', trunk, null, { repair: 0, fix: 0 }])
  const redo = h.ok().stdout
  assert.ok(redo.includes('lane 2 gate red after rebase: FAIL: a and b collide'), 're-dispatch body prints it: ' + redo)
  assert.ok(redo.indexOf('Agent(') < redo.indexOf('lane 2 gate red after rebase'), 'under the Agent line')
  h.ok('--mark', 'resent')
  assert.strictEqual(h.step(), 'WAIT')
  const laneRun = (...a) => runNode('scripts/run.js', [P('02-beta'), '--root', w, ...a])
  assert.match(laneRun().stdout, /^▶ REPAIR/, 'the lane gates again and finds it red')
  fs.rmSync(path.join(w, 'src/b.js')); fs.writeFileSync(path.join(w, 'src/b2.js'), 'b2\n')
  const sp = path.join(w, P('02-beta')) // a real build that moves its planned file amends the File Plan row
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').split('src/b.js').join('src/b2.js'))
  assert.match(laneRun('--mark', 'repaired').stdout, /REPAIR → REVIEW/)
  const f = path.join(tmpdir('findings'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: [], verdict: 'clean' }))
  assert.match(laneRun('--mark', 'reviewed', '--file', f).stdout, /REVIEW → MERGE_READY/)
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/b2.js')) && !fs.existsSync(path.join(h.dir, 'src/b.js')))
  assert.strictEqual(h.g('status', '--porcelain', '--untracked-files=no').trim(), '')
})

test('AC-20261105-07-6 a lane whose base is trunk\'s head runs no gate in its worktree before the fast-forward', () => {
  const log = path.join(tmpdir('gatelog'), 'runs.log')
  const h = host({ testCommand: `echo "$PWD" >> ${log}; test ! -f RED` })
  commitAll(h, 'config')
  dispatchTwo(h)
  h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '2')
  const dirs = fs.readFileSync(log, 'utf8').trim().split('\n')
  assert.deepStrictEqual(dirs.map((d) => fs.realpathSync(d)), [fs.realpathSync(h.dir)], 'one gate run, on trunk')
})

// A red trunk caused outside the tree: a flag file the suite reads.
function flagHost() {
  const flag = path.join(tmpdir('flag'), 'RED-flag')
  const h = host({ testCommand: `if test -f ${flag}; then echo "FAIL: RED flag present"; exit 1; fi` })
  commitAll(h, 'config')
  return { h, flag }
}

test('AC-20261105-07-7 MERGE_RED opens with the first failing line and says a flaky re-run needs no commit; gate-repaired with no commit is accepted', () => {
  const { h, flag } = flagHost()
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  fs.writeFileSync(flag, '')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'MERGE_RED')
  const body = h.ok().stdout.split('\n')
  assert.match(body[2], /^first failing line: .*RED/, body.join('\n'))
  assert.ok(body.join('\n').includes('re-run as it is when the failure was a flake'))
  assert.strictEqual(h.run('--mark', 'gate-repaired').status, 0)
  assert.strictEqual(h.step(), 'MERGE_RED', 'still red')
  fs.rmSync(flag)
  h.ok('--mark', 'gate-repaired')
  assert.strictEqual(h.step(), 'WAIT')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
})

test('AC-20261105-07-8 dismissed --discard removes the worktree and branch after a wip commit and prints its sha; dismissed is accepted at DISPATCH, MERGE_RED and REPORT', () => {
  const h = host()
  dispatchTwo(h)
  const w = h.wt('02-beta')
  fs.writeFileSync(path.join(w, 'loose.txt'), 'loose\n')
  const out = h.ok('--mark', 'dismissed', '--lane', '2', '--discard').stdout
  const sha = /discarded lane 2 — wip ([0-9a-f]{40})/.exec(out)
  assert.ok(sha, out)
  assert.ok(!fs.existsSync(w), 'no worktree')
  assert.strictEqual(h.g('branch', '--list', 'spec/02-beta').trim(), '', 'no branch')
  assert.strictEqual(h.g('show', `${sha[1]}:loose.txt`), 'loose\n', 'the wip commit holds the file')
  h.finish('01-alpha', 'src/a.js'); h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  assert.ok(h.ok().stdout.includes(`dismissed 02-beta — worktree and branch removed (wip ${sha[1]})`))
  // REPORT: a waiting lane dismissed there
  const g = host()
  dispatchTwo(g)
  g.ok('--mark', 'waiting', '--lane', '1', '--on', P('03-gamma'))
  g.finish('02-beta', 'src/b.js'); g.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(g.step(), 'REPORT')
  g.ok('--mark', 'dismissed', '--lane', '1')
  assert.strictEqual(g.step(), 'REPORT'); assert.strictEqual(st.readFanout(g.dir).batch[0].status, 'dismissed')
  // DISPATCH: dismissed before the lanes go out
  const d = host()
  d.ok(); d.ok('--mark', 'planned'); assert.strictEqual(d.step(), 'DISPATCH')
  d.ok('--mark', 'dismissed', '--lane', '1')
  assert.ok(!d.ok().stdout.includes('lane 1 —'), 'the dismissed lane is not dispatched')
  d.ok('--mark', 'dispatched')
  assert.deepStrictEqual(st.readFanout(d.dir).batch.map((l) => l.status), ['dismissed', 'dispatched'])
  // MERGE_RED
  const { h: r, flag } = flagHost()
  dispatchTwo(r)
  r.finish('01-alpha', 'src/a.js'); fs.writeFileSync(flag, '')
  r.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(r.step(), 'MERGE_RED')
  r.ok('--mark', 'dismissed', '--lane', '2')
  assert.strictEqual(r.step(), 'MERGE_RED'); assert.strictEqual(st.readFanout(r.dir).batch[1].status, 'dismissed')
})

test('AC-20261105-07-8 dismissing the only planned lane at DISPATCH goes straight on to REPORT', () => {
  const h = host({ specs: [SPEC_LIST[0]] })
  h.ok('--mark', 'planned'); h.ok()
  h.ok('--mark', 'dismissed', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
})

test('AC-20261105-07-9 a returned mark refused by a dirty main checkout lands on the re-run and reports it was already applied, exit 0', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  fs.appendFileSync(path.join(h.dir, '.gitignore'), '# dirty\n')
  const bad = h.run('--mark', 'returned', '--lane', '1')
  assert.strictEqual(bad.status, 2); assert.match(bad.stderr, /uncommitted tracked changes/)
  h.g('commit', '-q', '-am', 'tidy')
  const again = h.run('--mark', 'returned', '--lane', '1')
  assert.strictEqual(again.status, 0, again.stderr)
  assert.match(again.stdout, /mark returned was already applied/)
  assert.ok(fs.existsSync(path.join(h.dir, 'src/a.js')), 'the lane landed')
  assert.strictEqual(st.readFanout(h.dir).batch[0].status, 'merged')
})

test('AC-20261105-07-9 marks whose effect is already in the state are applied: reported at PLAN, planned at DISPATCH; a mark that did not happen is still refused', () => {
  const h = host()
  assert.match(h.ok('--mark', 'reported').stdout, /mark reported was already applied/)
  h.ok('--mark', 'planned')
  assert.match(h.ok('--mark', 'planned').stdout, /mark planned was already applied/)
  assert.strictEqual(h.run('--mark', 'resent').status, 0, 'no lane is sent back: resent is applied')
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '1').status, 2, 'a planned lane has not returned: refused')
})

test('AC-20261105-07-11 a missing spec-fanout.json with open fanout lanes refuses and names the newest backup; without markers it plans', () => {
  const h = host()
  dispatchTwo(h)
  const common = path.join(h.dir, '.git')
  fs.rmSync(path.join(common, 'spec-fanout.json'))
  for (const args of [[], ['--mark', 'planned'], ['--state']]) {
    const r = h.run(...args)
    assert.strictEqual(r.status, 2, args.join(' '))
    assert.ok(r.stderr.includes('spec-01-alpha') && r.stderr.includes('spec-02-beta') && r.stderr.includes(path.join(common, 'spec-fanout.json')), r.stderr)
    assert.ok(r.stderr.includes('reconstruct it, or remove the markers to abandon the lanes'), 'no backup: no cp')
  }
  for (const n of ['2026-11-01T10-00-00.000Z', '2026-11-02T10-00-00.000Z']) {
    fs.mkdirSync(path.join(common, 'spec-v7-backup', n), { recursive: true })
    fs.writeFileSync(path.join(common, 'spec-v7-backup', n, 'spec-fanout.json'), '{}')
  }
  const r = h.run()
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes(`cp ${path.join(common, 'spec-v7-backup', '2026-11-02T10-00-00.000Z', 'spec-fanout.json')} ${path.join(common, 'spec-fanout.json')}, then re-run`), r.stderr)
  assert.match(host().ok().stdout, /^▶ PLAN/, 'no markers: plan as today')
})

test('AC-20261105-07-12 REPORT says what trunk holds for a dismissed lane; WAIT marks a lane whose question waits', () => {
  const h = host()
  dispatchTwo(h)
  pending.writePending(h.wt('02-beta'), { lane: '2', question: 'Which shape?', options: ['flat', 'nested'] })
  const wait = h.ok().stdout
  assert.ok(wait.split('\n').find((l) => l.includes('lane 2 — 02-beta')).endsWith(' (question waiting — mark returned)'), wait)
  assert.ok(!wait.split('\n').find((l) => l.includes('lane 1 — 01-alpha')).includes('question waiting'))
  pending.consumePending(h.wt('02-beta'))
  st.writeStatus(path.join(h.dir, P('01-alpha')), 'superseded'); commitAll(h, 'alpha superseded')
  h.ok('--mark', 'dismissed', '--lane', '1')
  h.finish('02-beta', 'src/b.js'); h.ok('--mark', 'returned', '--lane', '2')
  assert.ok(h.ok().stdout.includes('dismissed 01-alpha — worktree kept at .claude/worktrees/spec-01-alpha, spec left hardened in the lane (trunk: superseded)'))
  const g = host()
  dispatchTwo(g)
  g.ok('--mark', 'dismissed', '--lane', '1')
  g.finish('02-beta', 'src/b.js'); g.ok('--mark', 'returned', '--lane', '2')
  assert.match(g.ok().stdout, /^⚠️ dismissed 01-alpha — worktree kept at \.claude\/worktrees\/spec-01-alpha, spec left hardened in the lane$/m, 'a hardened root copy adds no trunk note')
})

test('AC-20261105-07-15 the contract names the discard flag and --fix; fanout.md ends the turn at REPORT', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/v8/interface-contract.md'), 'utf8')
  assert.ok(doc.includes('dismissed --lane <id> [--discard]') && doc.includes('--fix'))
  const cmd = fs.readFileSync(path.join(__dirname, '..', 'spec/commands/fanout.md'), 'utf8')
  const report = cmd.slice(cmd.indexOf('**REPORT**'))
  assert.ok(report.includes('end the turn') && !cmd.includes('continue until the queue drains'))
})

// ---- spec 20261105/08: lanes share a machine ---------------------------------------------------

test('AC-20261105-08-14 AC-20261105-08-15 prepare copies an untracked laneFiles entry into each fresh lane worktree, byte for byte, and skips a tracked or missing one with its reason', () => {
  const bytes = Buffer.from([0x41, 0x00, 0xff, 0x0a, 0x42])
  const h = host({ ignore: '.env\n', cfg: { laneFiles: ['.env', 'src-tracked.txt', 'gone.env'] }, files: { 'src-tracked.txt': 'tracked\n' } })
  fs.writeFileSync(path.join(h.dir, '.env'), bytes)
  const r = h.ok('--mark', 'planned') // the worktrees are created while this mark settles
  for (const stem of ['01-alpha', '02-beta']) {
    assert.ok(fs.readFileSync(path.join(h.wt(stem), '.env')).equals(bytes), `${stem} holds the byte-identical .env`)
    assert.ok(!/\.env/.test(h.g('-C', h.wt(stem), 'status', '--porcelain')), `${stem}: git status does not list the copy`)
  }
  assert.match(r.stderr, /laneFiles: skipped src-tracked\.txt \(tracked\)/)
  assert.match(r.stderr, /laneFiles: skipped gone\.env \(missing\)/)
})

test('AC-20261105-08-16 the REPORT names the reruns and slot waits of a lane that paid them and sums them in one load: line; a batch that paid nothing prints neither', () => {
  const h = host()
  dispatchTwo(h)
  h.finish('01-alpha', 'src/a.js', 'a\n', { status: 'green', reruns: 1, lockWaitMs: 3000 })
  h.finish('02-beta', 'src/b.js', 'b\n', { status: 'green', reruns: 0, lockWaitMs: 0 })
  h.ok('--mark', 'returned', '--lane', '1')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
  const rep = h.ok().stdout
  assert.match(rep, /- merged 01-alpha as \w+ into trunk; queue item ticked \(1 rerun\(s\), 3s slot wait\)\n/, rep)
  assert.match(rep, /- merged 02-beta as \w+ into trunk; queue item ticked\n/, 'a lane that paid nothing has no suffix')
  assert.ok(rep.includes('⚠️ load: 1 rerun(s), 3s of slot waits across the batch\n'), rep)

  const q = host()
  dispatchTwo(q)
  q.finish('01-alpha', 'src/a.js'); q.finish('02-beta', 'src/b.js')
  q.ok('--mark', 'returned', '--lane', '1'); q.ok('--mark', 'returned', '--lane', '2')
  const quiet = q.ok().stdout
  assert.ok(!/rerun|slot wait|load:/.test(quiet), 'no cost, no text:\n' + quiet)
})

test('AC-20261105-08-17 the commands and docs name gateConcurrency, laneFiles, regate and the TMPDIR advice where the spec puts them', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
  const fan = read('spec/commands/fanout.md')
  assert.ok(fan.includes('gateConcurrency') && fan.includes('only gates queue'), 'fanout.md: gates queue, builders stay parallel')
  assert.ok(/Temp space:[\s\S]*export TMPDIR[\s\S]*real disk[\s\S]*doctor prints the free space/.test(fan), 'fanout.md: the TMPDIR advice under Long marks')
  assert.ok(read('spec/commands/run.md').includes('`regate`'), 'run.md names the regate mark')
  const arch = read('docs/v8/architecture.md')
  const sec3 = arch.slice(arch.indexOf('## 3. Config keys'), arch.indexOf('## 4.'))
  assert.ok(sec3.includes('gateConcurrency') && sec3.includes('laneFiles'), 'architecture §3 lists both keys')
  const gateRow = arch.split('\n').find((l) => l.startsWith('| GATE |'))
  assert.ok(/re-run once/.test(gateRow) && /spec-gate\.lock/.test(gateRow), 'the GATE row names the rerun rule and the lock')
  const contract = read('docs/v8/interface-contract.md')
  assert.ok(contract.includes('`gateConcurrency`') && contract.includes('`laneFiles`'), 'the interface contract config row names both keys')
  assert.ok(contract.includes('`regate`'), 'the interface contract lists the regate mark')
})

test('AC-20261105-06-12 RELAY groups lane questions by kind (assumption before escalate), marks the first option recommended, and says the orchestrator never answers for the user', () => {
  const h = host()
  dispatchTwo(h)
  pending.writePending(h.wt('01-alpha'), { lane: '1', kind: 'escalate', question: 'Gate red twice?', options: [{ label: 'retry', description: 'again' }, 'park', 'amend'] })
  pending.writePending(h.wt('02-beta'), { lane: '2', kind: 'assumption', question: 'Old rows exist?', options: ['keep the old rows', 'delete them', 'amend'] })
  h.ok('--mark', 'returned', '--lane', '1')
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'RELAY')
  const out = h.ok().stdout
  const a = out.indexOf('[assumption] lane 2 — 02-beta'); const e = out.indexOf('[escalate] lane 1 — 01-alpha')
  assert.ok(a >= 0 && e > a, 'assumption is printed before escalate:\n' + out)
  assert.ok(out.includes('   - keep the old rows (recommended)') && out.includes('   - retry (recommended) — again'), out)
  assert.ok(!/- delete them \(recommended\)/.test(out) && !/- park \(recommended\)/.test(out), 'only the first option is marked')
  assert.ok(out.includes('never answers for the user'), 'the relay says who answers')
  assert.ok(out.includes('--mark answered --lane 2 --label "<label>"'), 'the answered line is still printed')
  assert.strictEqual(JSON.parse(h.run('--json').stdout).step, 'RELAY')
  assert.strictEqual(st.readFanout(h.dir).batch.find((l) => String(l.id) === '2').question.kind, 'assumption', 'the lane keeps the kind it stopped with')
})

// ---- spec 20261105/10: a batch tells the truth ---------------------------------------------------

const THREE = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/a.js']]
// alpha and gamma share src/a.js; beta is clear of both. Lanes 1..3 = alpha, gamma, beta, all out.
function threeOut(opts = {}) {
  const g = host({ lanes: 3, specs: THREE, ...opts })
  g.ok(P('01-alpha'), P('03-gamma'), P('02-beta'), '--mark', 'planned')
  g.ok('--mark', 'dispatched')
  return g
}
const lastLines = (out) => out.split('\n')

test('AC-20261105-10-2 AC-20261105-10-5 a lane resolving a rebase does not hold a ready lane; WAIT lists it as resolving rebase', () => {
  const g = threeOut()
  g.finish('01-alpha', 'src/a.js', 'alpha\n'); g.finish('03-gamma', 'src/a.js', 'gamma\n')
  g.ok('--mark', 'returned', '--lane', '1')
  g.ok('--mark', 'returned', '--lane', '2')
  const sent = g.ok().stdout
  assert.ok(sent.includes('lane 2 — 03-gamma: sent-back · resolving rebase (1 files)'), sent)
  assert.ok(sent.includes('lane 3 — 02-beta: dispatched · '), 'the lane still out is listed beside it')
  g.ok('--mark', 'resent')
  const out = g.ok().stdout
  assert.ok(out.includes('lane 2 — 03-gamma: dispatched · resolving rebase (1 files)'), out)
  assert.ok(/lane 3 — 02-beta: dispatched · (?!resolving)/.test(out), 'a dispatched lane with no rebase lists its run step as today')
  g.finish('02-beta', 'src/b.js')
  const mark = g.ok('--mark', 'returned', '--lane', '3').stdout
  assert.match(mark, /lane 3 landed as [0-9a-f]{40}/, 'lane 3 landed in that mark')
  assert.deepStrictEqual(st.readFanout(g.dir).batch.map((l) => l.status), ['merged', 'dispatched', 'merged'])
})

test('AC-20261105-10-2 AC-20261105-10-3 a red trunk holds a returning lane and the mark says so', () => {
  const h = host()
  dispatchTwo(h)
  const f = st.readFanout(h.dir)
  f.red = { lane: '1', runId: 'x', tail: 'FAIL: trunk' }
  st.writeFanout(h.dir, f)
  h.finish('02-beta', 'src/b.js')
  const trunk = mainHead(h)
  const out = h.ok('--mark', 'returned', '--lane', '2').stdout
  assert.ok(out.includes('lane 2 held — trunk gate is red'), out)
  assert.strictEqual(mainHead(h), trunk, 'trunk did not move')
  assert.strictEqual(st.readFanout(h.dir).batch[1].status, 'done')
})

test('AC-20261105-10-3 a returned mark that sends a lane back prints the conflict files and its Agent call; --json prints neither', () => {
  const g = threeOut()
  g.finish('01-alpha', 'src/a.js', 'alpha\n'); g.finish('03-gamma', 'src/a.js', 'gamma\n')
  const one = g.ok('--mark', 'returned', '--lane', '1').stdout
  assert.ok(one.includes(`lane 1 landed as ${mainHead(g)}`), one)
  const lines = lastLines(g.ok('--mark', 'returned', '--lane', '2').stdout)
  const i = lines.indexOf('lane 2 sent back — conflicts: src/a.js')
  assert.ok(i > 0 && lines[0].startsWith('✅ checkpoint'), lines.join('\n'))
  assert.ok(lines[i + 1].startsWith('  Agent({') && lines[i + 1].includes(`lane 2: 03-gamma`) && lines[i + 1].includes(g.wt('03-gamma')), lines[i + 1])

  const j = threeOut()
  j.finish('01-alpha', 'src/a.js', 'alpha\n')
  const json = j.ok('--mark', 'returned', '--lane', '1', '--json').stdout
  assert.ok(!json.includes('landed as'), json)
})

const COLLIDE_ABC = 'if test -f src/a.js && test -f src/b.js; then echo "FAIL: a and b collide"; exit 1; fi'

test('AC-20261105-10-3 AC-20261105-10-5 a red pre-ff gate prints gate red after rebase with the Agent call, and the list says gate red after rebase', () => {
  const h = host({ testCommand: COLLIDE_ABC, lanes: 3, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/c.js']] })
  commitAll(h, 'config')
  h.ok('--mark', 'planned')
  h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1')
  const lines = lastLines(h.ok('--mark', 'returned', '--lane', '2').stdout)
  const i = lines.indexOf('lane 2 gate red after rebase: FAIL: a and b collide')
  assert.ok(i > 0 && lines[i + 1].startsWith('  Agent({'), lines.join('\n'))
  assert.ok(h.ok().stdout.includes('lane 2 — 02-beta: sent-back · gate red after rebase'))
})

test('AC-20261105-10-4 a mark that lands two lanes prints one landed line each in batch order; a lane landed earlier is not printed again', () => {
  const h = host({ lanes: 3, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/c.js']], files: { 'check.sh': 'test ! -f RED\n' } })
  h.ok(P('01-alpha'), P('02-beta'), P('03-gamma'), '--mark', 'planned')
  h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'RED')
  const first = h.ok('--mark', 'returned', '--lane', '1').stdout
  assert.match(first, /lane 1 landed as [0-9a-f]{40}/)
  assert.strictEqual(h.step(), 'MERGE_RED')
  h.finish('02-beta', 'src/b.js'); h.finish('03-gamma', 'src/c.js')
  const f = st.readFanout(h.dir)
  for (const l of f.batch.slice(1)) l.status = 'done'
  st.writeFanout(h.dir, f)
  h.g('rm', '-q', 'RED'); h.g('commit', '-q', '-m', 'repair')
  const out = h.ok('--mark', 'gate-repaired').stdout
  const landed = out.split('\n').filter((l) => /^lane \d+ landed as /.test(l))
  assert.deepStrictEqual(landed.map((l) => l.split(' ')[1]), ['2', '3'], out)
  assert.ok(!out.includes('lane 1 landed'), 'a lane landed by an earlier mark is not printed again')
  const shas = landed.map((l) => l.split(' ').pop())
  assert.strictEqual(shas[1], mainHead(h))
  assert.notStrictEqual(shas[0], shas[1])
  h.g('merge-base', '--is-ancestor', shas[0], shas[1])
  assert.ok(h.g('log', '--format=%s', shas[0]).includes('chore(spec): 02-beta done'), 'the first sha is the head after lane 2 landed')
})

test('AC-20261105-10-14 fanout.md, the contract and the architecture note carry the landing rule, the mark output and the brief rules; the header comment drops the guards', () => {
  const root = path.join(__dirname, '..')
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  assert.match(read('spec/commands/fanout.md'), /lands as it returns[^\n]*sent-back|sent-back[^\n]*lands as it returns/i)
  const ic = read('docs/v8/interface-contract.md'); const arch = read('docs/v8/architecture.md')
  for (const t of ['lane N landed as', 'As built', 'brief-done-queued', '✔ specs done']) assert.ok(ic.includes(t), 'contract: ' + t)
  assert.ok(arch.includes('brief-done-queued') && arch.includes('lane.last'), 'architecture note')
  const queueMd = read('spec/commands/queue.md')
  assert.ok(queueMd.includes('/spec:queue done') && /finished brief|specs done/.test(queueMd), 'queue.md')
  assert.ok(read('spec/agents/builder.md').includes('as-built.md'), 'builder.md')
  const head = read('spec/scripts/fanout.js').split('\n').slice(0, 20).join('\n')
  assert.ok(!/no other lane is sent back or mid-rebase/.test(head), 'the header comment')
})

// ---- spec 20261105/09: fix is a driver and every fix is a lane -----------------------------------

const SYMPTOM = 'login button stays disabled after a failed submit'
const SLUG = st.slugOf(SYMPTOM)
const LESS = SYMPTOM
const LESS_LINE = `/spec:fix ${SYMPTOM}`
const goodFix = { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null }

// A host whose queue holds one spec-less fix item (and optionally more).
function lessHost(opts = {}) {
  const h = fixHost({ payload: LESS, ...opts })
  return h
}
const lessWt = (h) => path.join(h.dir, '.claude/worktrees/fix-' + SLUG)
const lessRun = (h, ...a) => runNode('scripts/run.js', ['--fix', SYMPTOM, '--root', lessWt(h), ...a])
const putFix = (h, obj) => st.writeJson(path.join(st.fixRunDir(h.dir, SLUG), 'fix.json'), obj)

test('AC-20261105-09-10 a spec-less /spec:fix item is auto-picked as lane fix-<slug> with its own worktree, branch and a --fix prompt; lanes order spec, spec-bound fix, spec-less fix', () => {
  const h = lessHost()
  const plan = h.ok().stdout
  assert.ok(plan.includes(`lane 1: fix-${SLUG} — fix: ${SYMPTOM}`), plan)
  h.ok('--mark', 'planned')
  const lane = st.readFanout(h.dir).batch[0]
  assert.deepStrictEqual([lane.kind, lane.spec, lane.stem, lane.worktree, lane.branch, lane.symptom, lane.slug], ['fix', null, 'fix-' + SLUG, '.claude/worktrees/fix-' + SLUG, 'fix/' + SLUG, SYMPTOM, SLUG])
  assert.match(SLUG, /^login-button-stays-disabled-after-a-[0-9a-f]{6}$/)
  const disp = h.ok().stdout
  assert.ok(fs.existsSync(lessWt(h)) && pending.isLane(lessWt(h)))
  const prompt = JSON.parse(/prompt: ("[^\n]+") \}\)/.exec(disp)[1])
  assert.strictEqual(prompt, `/spec:fix --root ${lessWt(h)} ${SYMPTOM}`)

  const o = fixHost({ more: [['02-beta', 'src/b.js']], host: { lanes: 4 } })
  Q.add(o.dir, { payload: LESS, type: 'fix' }, { top: true })
  Q.add(o.dir, { payload: P('02-beta') })
  const text = o.ok().stdout
  const at = (s) => text.indexOf(s)
  assert.ok(at(`lane 1: ${P('02-beta')}`) >= 0 && at(`lane 2: ${P('01-alpha')} — fix: RED file left`) > at('lane 1:') && at(`lane 3: fix-${SLUG}`) > at('lane 2:'), text)
})

test('AC-20261105-09-10 a spec-less fix waits on its after gate, on a lane already in flight, and a duplicate item is one lane', () => {
  const h = lessHost()
  assert.strictEqual(addFix(h, LESS), null, 'the door refuses the same fix twice')
  assert.strictEqual(addFix(h, LESS_LINE), null, 'whatever the spelling')
  const twice = Q.read(h.dir); twice.items.push({ ...twice.items[0], id: 'q77' }); Q.write(h.dir, twice) // a file edited by hand
  assert.ok(h.ok().stdout.match(/lane \d+: fix-/g).length === 1, 'two items with the same text are one lane')
  const w = lessHost()
  const q = Q.read(w.dir); q.items[0].after = { spec: P('02-nope') }; Q.write(w.dir, q)
  assert.ok(JSON.parse(w.ok('--json').stdout).body.includes(`${LESS_LINE} waits — after ${P('02-nope')} (missing)`))
  const l = lessHost()
  st.writeFanout(l.dir, { step: 'PLAN' })
  l.g('worktree', 'add', '-q', '-b', 'fix/' + SLUG, lessWt(l)); pending.markLane(lessWt(l), 'fanout')
  assert.ok(JSON.parse(l.ok('--json').stdout).body.includes(`${LESS_LINE} waits — already in a lane at .claude/worktrees/fix-${SLUG}`))
})

test('AC-20261105-09-11 a spec-less fix lane lands as fix(<slug>): <symptom>, ticks its item, flips no spec, makes no done commit and cleans up; REPORT names the sha', () => {
  const h = lessHost()
  const item = Q.read(h.dir).items[0]
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  const w = lessWt(h)
  const first = lessRun(h)
  assert.strictEqual(first.status, 0, first.stderr)
  assert.match(first.stdout, /^▶ BUILD/)
  assert.ok(first.stdout.includes('## Fix\n' + SYMPTOM) && !first.stdout.includes('## File Plan'))
  fs.writeFileSync(path.join(w, 'src-fix.txt'), 'fixed\n')
  putFix(h, goodFix)
  assert.strictEqual(lessRun(h, '--mark', 'built').status, 0)
  const f = path.join(tmpdir('findings'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: [], verdict: 'clean' }))
  assert.match(lessRun(h, '--mark', 'reviewed', '--file', f).stdout, /REVIEW → MERGE_READY/)
  assert.strictEqual(st.readJson(st.fixRunPath(h.dir, SLUG)).step, 'MERGE_READY')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  assert.strictEqual(h.g('log', '-1', '--format=%s', 'main').trim(), `fix(${SLUG}): ${SYMPTOM}`)
  assert.ok(h.g('log', '-1', '--format=%B', 'main').includes('Root cause: c\nRegression test: t.test.js :: guards c'))
  assert.ok(!/chore\(spec\):.*done/.test(h.g('log', '--format=%s', 'main')), 'no done commit')
  assert.strictEqual(st.readSpec(path.join(h.dir, P('01-alpha'))).frontmatter.status, 'done', 'no spec status flips')
  assert.ok(fs.existsSync(path.join(h.dir, 'src-fix.txt')))
  assert.ok(Q.read(h.dir).items.find((i) => i.id === item.id).done, 'the item is ticked')
  assert.ok(!fs.existsSync(w) && !h.g('branch', '--list', 'fix/' + SLUG).trim(), 'worktree and branch are gone')
  assert.ok(!fs.existsSync(st.fixRunDir(h.dir, SLUG)), 'the run state is gone')
  const rep = h.ok().stdout
  assert.match(rep, new RegExp(`- merged fix-${SLUG} as [0-9a-f]+ into trunk`))
})

test('AC-20261105-09-12 a lane that ends NEEDS_PLAN is reported, waits with its ending, and leaves the item pending beside the queued plan', () => {
  const h = lessHost()
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  assert.strictEqual(lessRun(h).status, 0)
  putFix(h, { needsPlan: 'the handler needs a new table' })
  const end = lessRun(h, '--mark', 'built')
  assert.strictEqual(end.status, 0, end.stderr)
  assert.strictEqual(st.readJson(st.fixRunPath(h.dir, SLUG)).step, 'NEEDS_PLAN')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  const rep = h.ok().stdout
  assert.ok(rep.includes(`needs a spec: fix-${SLUG} — the handler needs a new table; /spec:plan queued`), rep)
  assert.ok(!rep.includes('parked'), 'not reported as parked')
  h.ok('--mark', 'reported')
  const items = Q.read(h.dir).items
  assert.ok(!items.find((i) => i.payload === LESS).done, 'the fix item stays pending')
  assert.ok(items.some((i) => i.type === 'plan' && i.payload === `${SYMPTOM} — the handler needs a new table`))
  const next = JSON.parse(h.ok('--json').stdout).body
  assert.ok(next.includes(`${LESS_LINE} waits — its lane ended NEEDS_PLAN`), next)

  // once its worktree is gone the stale ending does not hold the fix: the next lane starts over
  h.g('worktree', 'remove', '--force', lessWt(h)); h.g('branch', '-D', 'fix/' + SLUG)
  assert.ok(h.ok().stdout.includes(`lane 1: fix-${SLUG}`), 'runnable again')
  h.ok('--mark', 'planned'); h.ok()
  assert.ok(!fs.existsSync(st.fixRunDir(h.dir, SLUG)), 'the stale ending is cleared when the fresh lane is prepared')
})

test('AC-20261105-09-13 --discard on a spec-less fix lane removes its worktree, branch and run state and leaves the item pending', () => {
  const h = lessHost()
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  assert.strictEqual(lessRun(h).status, 0)
  assert.ok(fs.existsSync(st.fixRunPath(h.dir, SLUG)))
  fs.writeFileSync(path.join(lessWt(h), 'half.txt'), 'x\n')
  const out = h.ok('--mark', 'dismissed', '--lane', '1', '--discard').stdout
  assert.ok(out.includes('discarded lane 1'), out)
  assert.ok(!fs.existsSync(lessWt(h)) && !h.g('branch', '--list', 'fix/' + SLUG).trim())
  assert.ok(!fs.existsSync(st.fixRunDir(h.dir, SLUG)), 'the run state under the git dir is gone')
  assert.ok(!Q.read(h.dir).items.find((i) => i.payload === LESS).done, 'the item stays pending')
})

test('AC-20261105-09-14 the fix command drives the driver; the commands, builder, doctrine and contract say the new fix mode', () => {
  const read = (f) => fs.readFileSync(path.join(SPEC, f), 'utf8').replace(/\s+/g, ' ')
  const fix = read('commands/fix.md')
  assert.ok(fix.includes('run.js --fix') && fix.includes('--in-place') && !fix.includes('AskUserQuestion of at most four'), fix)
  assert.ok(read('commands/fanout.md').includes('fix-<slug>'))
  const builder = read('agents/builder.md')
  assert.ok(builder.includes('fix.json') && builder.includes('needsPlan'))
  assert.ok(read('doctrine.md').includes('keep / revert / plan'))
  const contract = fs.readFileSync(path.join(SPEC, '..', 'docs/v8/interface-contract.md'), 'utf8')
  for (const s of ['fix-<slug>', 'NEEDS_PLAN', 'fix-choices']) assert.ok(contract.includes(s), 'the contract names ' + s)
})

// ---- spec 20261105/11: the batch tells the rest of the truth -------------------------------------

const TRIO = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/c.js']]
function trioOut() {
  const h = host({ lanes: 3, specs: TRIO })
  h.ok('--mark', 'planned')
  h.ok('--mark', 'dispatched')
  return h
}
const repair = (h) => { h.g('rm', '-q', 'RED'); h.g('commit', '-q', '-m', 'repair') }
const setStatus = (h, id, status) => { const f = st.readFanout(h.dir); f.batch.find((l) => l.id === id).status = status; st.writeFanout(h.dir, f) }

// Lane 1 lands RED (the trunk goes red), the host repairs it, lane 2 is rebased onto the repaired trunk and adds RED
// again, lane 3 is clean: both return while the trunk is red, so both are `done`. gate-repaired lands lane 2 with an
// unmoved base (no pre-ff gate), which turns the trunk red inside that mark's settle while lane 3 is still `done`.
function settleRed() {
  const h = trioOut()
  h.finish('01-alpha', 'RED')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'MERGE_RED')
  repair(h)
  execFileSync('git', ['-C', h.wt('02-beta'), 'rebase', '-q', 'main'])
  h.finish('02-beta', 'RED'); h.finish('03-gamma', 'src/c.js')
  h.ok('--mark', 'returned', '--lane', '2'); h.ok('--mark', 'returned', '--lane', '3')
  return h
}

test('AC-20261105-11-1 a landing that turns the trunk red stamps the other done lane in the same mark; --json prints neither line', () => {
  const h = settleRed()
  const out = h.ok('--mark', 'gate-repaired').stdout
  const lines = out.split('\n')
  const landed = lines.indexOf(`lane 2 landed as ${mainHead(h)}`)
  assert.ok(landed > 0 && lines[0].startsWith('✅ checkpoint'), out)
  assert.ok(lines.indexOf('lane 3 held — trunk gate is red') > landed, out)
  assert.ok(!out.includes('lane 2 held'), 'the landed lane is not held:\n' + out)
  assert.strictEqual(h.step(), 'MERGE_RED')
  assert.deepStrictEqual(st.readFanout(h.dir).batch.map((l) => l.status), ['merged', 'done', 'done'])

  const j = settleRed()
  const json = j.ok('--mark', 'gate-repaired', '--json').stdout
  assert.ok(!json.includes('landed as') && !json.includes('held —'), json)
})

test('AC-20261105-11-2 a lane returning at MERGE_RED is accepted and held, never the landed one; gate-repaired lands it', () => {
  const h = trioOut()
  h.finish('01-alpha', 'RED')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'MERGE_RED')
  h.finish('02-beta', 'src/b.js')
  const trunk = mainHead(h)
  const out = h.ok('--mark', 'returned', '--lane', '2').stdout
  assert.ok(out.includes('lane 2 held — trunk gate is red'), out)
  assert.ok(!out.includes('lane 1'), 'the landed lane gets no line:\n' + out)
  assert.strictEqual(mainHead(h), trunk, 'trunk did not move')
  assert.strictEqual(h.step(), 'MERGE_RED')
  assert.strictEqual(st.readFanout(h.dir).batch[1].status, 'done')
  repair(h)
  const rep = h.ok('--mark', 'gate-repaired').stdout
  assert.ok(rep.includes(`lane 2 landed as ${mainHead(h)}`), rep)
  assert.notStrictEqual(mainHead(h), trunk)
  assert.deepStrictEqual(st.readFanout(h.dir).batch.map((l) => l.status), ['merged', 'merged', 'dispatched'])
})

test('AC-20261105-11-3 dismissed at MERGE_RED prints no held line for the landed lane; a stopped return is relayed after the repair', () => {
  const h = trioOut()
  h.finish('01-alpha', 'RED')
  h.ok('--mark', 'returned', '--lane', '1')
  const dis = h.ok('--mark', 'dismissed', '--lane', '3').stdout
  assert.ok(!dis.includes('lane 1 held'), dis)
  h.ok('--mark', 'returned', '--lane', '2', '--stopped', 'needs a call')
  assert.strictEqual(st.readFanout(h.dir).batch[1].status, 'stopped')
  repair(h)
  h.ok('--mark', 'gate-repaired')
  assert.strictEqual(h.step(), 'RELAY')
  assert.ok(h.ok().stdout.includes('lane 2 —'), 'RELAY names lane 2')
})

test('AC-20261105-11-7 the sent-back WAIT body is the dispatch body, a blank line, then the lane list, and nothing after it', () => {
  const g = threeOut()
  g.finish('01-alpha', 'src/a.js', 'alpha\n'); g.finish('03-gamma', 'src/a.js', 'gamma\n')
  g.ok('--mark', 'returned', '--lane', '1')
  g.ok('--mark', 'returned', '--lane', '2')
  const out = g.ok().stdout
  const lines = out.split('\n')
  const at = lines.indexOf('Lanes (status · run step):')
  assert.ok(at > 2 && lines[at - 1] === '' && lines[at - 2] !== '', out)
  assert.ok(lines.slice(0, at).some((l) => l.startsWith('  Agent({')) && /^These lanes hit a rebase conflict/.test(lines.find((l) => l.startsWith('These lanes'))), 'the dispatch body comes first:\n' + out)
  const list = lines.slice(at + 1)
  const ids = list.filter((l) => /^ {2}lane \d+ — /.test(l)).map((l) => l.split(' ')[3])
  assert.deepStrictEqual(ids, ['1', '2', '3'], 'one line per lane in batch order:\n' + out)
  const lastLane = list.map((l, i) => [l, i]).filter(([l]) => /^ {2}lane \d+ — /.test(l)).pop()[1]
  assert.strictEqual(list.slice(lastLane + 1).filter((l) => !l.startsWith('▶ when done')).join('').trim(), '', 'nothing after the list:\n' + out)
})

test('AC-20261105-11-8 fanout.md, the contract and the architecture note carry the lane list, returned at MERGE_RED, the fix plan and gateAfter', () => {
  const root = path.join(__dirname, '..')
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const md = read('spec/commands/fanout.md')
  assert.match(md, /lane list/i)
  assert.match(md, /`returned`[^\n]*(MERGE_RED|red trunk)|(MERGE_RED|red trunk)[^\n]*`returned`/)
  const ic = read('docs/v8/interface-contract.md')
  assert.match(ic, /`returned`[^\n]*MERGE_RED|MERGE_RED[^\n]*`returned`/)
  assert.match(ic, /File Plan plus (its|the) regression test/)
  const arch = read('docs/v8/architecture.md')
  assert.ok(!/(early landing)/.test(arch) && !/no lane is `sent-back` and no dispatched lane is mid-rebase/.test(arch), 'the stale landing sentence is gone')
  assert.match(arch, /gateAfter[\s\S]{0,200}held|held[\s\S]{0,200}gateAfter/)
  assert.match(arch, /File Plan plus (its|the) regression test/)
})

// ---- spec 20261105/12: the queue item has one owner ----------------------------------------------

test('AC-20261105-12-1 a spec-less fix item with a bare payload is a lane, whatever wrote it', () => {
  const h = fixHost({ payload: 'Admin polish after 10' })
  const item = Q.read(h.dir).items[0]
  assert.deepStrictEqual([item.type, item.payload, item.spec], ['fix', 'Admin polish after 10', undefined])
  assert.strictEqual(runNode('scripts/queue.js', ['next', '--root', h.dir]).stdout.trim(), '/spec:fix Admin polish after 10')
  h.ok('--mark', 'planned')
  const lane = st.readFanout(h.dir).batch[0]
  assert.match(lane.stem, /^fix-admin-polish-after-10-[0-9a-f]{6}$/)
  assert.strictEqual(lane.item, item.id)
  assert.strictEqual(lane.symptom, 'Admin polish after 10')
})

test('AC-20261105-14-17 a hardened spec with frontmatter prototype: waits with its reason and is no lane; one without it stays a lane', () => {
  const h = host({ lanes: 3, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js']] })
  const f = path.join(h.dir, specPath('01-alpha'))
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('architecture: false', 'prototype: invoice-list-page\narchitecture: false'))
  const plan = h.ok()
  assert.ok(plan.stdout.includes(`${specPath('01-alpha')} waits — stops at LOOK for you — /spec:run it`), plan.stdout)
  h.ok('--mark', 'planned')
  const lanes = (st.readFanout(h.dir).batch || []).map((l) => l.spec)
  assert.deepStrictEqual(lanes, [specPath('02-beta')])

  // A fix on such a spec runs PIN_TESTS and LOOK too, so a fix item bound to it is held the same way.
  const fx = fixHost({ more: [['02-beta', 'src/b.js']], payload: FIX_PAYLOAD('02-beta'), host: { status: { '01-alpha': 'done', '02-beta': 'done' } } }) // done, so the bare run starts no spec lane beside the fix
  const g = path.join(fx.dir, specPath('01-alpha'))
  fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace('architecture: false', 'prototype: invoice-list-page\narchitecture: false'))
  addFix(fx)
  commitAll(fx, 'alpha came from a prototype')
  const held = fx.ok().stdout
  assert.ok(held.includes(`waits — stops at LOOK for you — /spec:fix ${specPath('01-alpha')} — RED file left`), held)
  assert.ok(!held.includes('--in-place'), held)
  fx.ok('--mark', 'planned')
  const picked = (st.readFanout(fx.dir).batch || []).map((l) => [l.kind, l.stem])
  assert.deepStrictEqual(picked, [['fix', 'fix-02-beta']], 'the plain spec\'s fix item stays a lane')
  assert.ok(!fs.existsSync(path.join(fx.dir, '.claude/worktrees/fix-01-alpha')), 'no worktree for the held fix')
})

// A queue where no lane can be picked and each kind of open item is present once.
function stuckHost() {
  const h = host({ lanes: 4, specs: [['02-beta', 'src/b.js'], ['03-gamma', 'src/c.js']], status: { '03-gamma': 'draft' } })
  fs.mkdirSync(path.join(h.dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, 'docs/roadmap/03-rounds.md'), '# 03\n'); fs.writeFileSync(path.join(h.dir, 'docs/roadmap/05-boards.md'), '# 05\n')
  const q = Q.read(h.dir); q.items[0].after = { brief: '03' }; Q.write(h.dir, q)
  const add = (f) => Q.add(h.dir, f)
  add({ payload: 'docs/roadmap/05-boards.md' })
  add({ payload: 'sketch the billing screen', type: 'plan' })
  add({ payload: 'pick a database', type: 'decide' })
  add({ payload: 'remember the invoice footer' })
  add({ payload: SYMPTOM, type: 'fix' })
  h.g('worktree', 'add', '-q', '-b', 'fix/' + SLUG, lessWt(h)); pending.markLane(lessWt(h), 'fanout')
  st.writeFanout(h.dir, { step: 'PLAN' })
  return h
}

test('AC-20261105-12-7 PLAN with nothing runnable accounts for every open item once, and never says drained', () => {
  const h = stuckHost()
  const body = JSON.parse(h.ok('--json').stdout).body
  const lines = body.split('\n')
  assert.strictEqual(lines[0], '**⏸️ nothing runnable — 8 open item(s)**', body)
  assert.ok(!body.includes('drained') && !body.includes('nothing needs you'), body)
  const has = (l) => assert.ok(lines.includes(l), `${l}\n---\n${body}`)
  has(`⚠️ ${P('02-beta')} waits — after brief 03 (unplanned)`)
  has(`⚠️ ${LESS_LINE} waits — already in a lane at .claude/worktrees/fix-${SLUG}`)
  has('⚠️ Held (not hardened, not shown as lanes): 1 — 03-gamma (draft)')
  has('⚠️ q4 needs you — needs /spec:plan: /spec:plan docs/roadmap/05-boards.md')
  has('⚠️ q5 needs you — needs /spec:plan: /spec:plan sketch the billing screen')
  has('⚠️ q6 needs you — decide: 📌 decide: pick a database')
  has('⚠️ q7 needs you — plain note — paste by hand: remember the invoice footer')
  has('⚠️ — needs you — needs /spec:plan: /spec:plan docs/roadmap/03-rounds.md') // the fill adds the unplanned brief 03, which no queue item held
  assert.strictEqual(lines.filter((l) => l.startsWith('⚠️ ')).length, 8, 'eight open items, eight lines: the held draft has the Held line')
  for (const needle of [P('02-beta'), '03-gamma', 'q4 ', 'q5 ', 'q6 ', 'q7 ', LESS_LINE]) assert.strictEqual(body.split(needle).length - 1, 1, `${needle} is named exactly once`)
  assert.ok(lines.includes('Next: /spec:plan docs/roadmap/05-boards.md'), 'next is the first item that needs you')
  assert.strictEqual(JSON.parse(h.ok('--json').stdout).mark, null)
})

test('AC-20261105-12-7 with every open item waiting or held, next points at the queue', () => {
  const h = host({ lanes: 4, specs: [['02-beta', 'src/b.js']], status: { '02-beta': 'draft' } })
  const body = JSON.parse(h.ok('--json').stdout).body
  assert.ok(body.startsWith('**⏸️ nothing runnable — 1 open item(s)**'), body)
  assert.ok(body.includes('Held (not hardened, not shown as lanes): 1 — 02-beta (draft)') && body.includes('Next: nothing runnable — /spec:queue list'), body)
})

test('AC-20261105-12-7 PLAN with lanes picked keeps its body and adds the needs-you lines after Held', () => {
  const h = host({ lanes: 4, specs: [['01-alpha', 'src/a.js'], ['03-gamma', 'src/c.js']], status: { '03-gamma': 'draft' } })
  Q.add(h.dir, { payload: 'pick a database', type: 'decide' })
  const body = JSON.parse(h.ok('--json').stdout).body
  assert.ok(body.includes('lane 1: ' + P('01-alpha')), body)
  const held = body.indexOf('Held (not hardened')
  assert.ok(held > 0 && body.indexOf('q4 needs you — decide: 📌 decide: pick a database') > held, body)
})

test('AC-20261105-12-8 an empty queue is drained; a done spec item is closed; an explicit run with nothing runnable is never drained', () => {
  const d = tmpdir('fanout-empty'); gitRepo(d)
  const empty = JSON.parse(runNode('scripts/fanout.js', ['--root', d, '--json']).stdout)
  assert.ok(empty.body.startsWith('**✅ queue drained'), empty.body)
  assert.ok(empty.body.includes('Next: nothing needs you — queue drained') && empty.mark === null && !empty.body.includes('nothing runnable'))
  const done = host({ specs: [['01-alpha', 'src/a.js']], status: { '01-alpha': 'done' } })
  const body = JSON.parse(done.ok('--json').stdout).body
  assert.ok(body.startsWith('**✅ queue drained') && body.includes('Next: nothing needs you — queue drained'), 'the only pending item is done on disk: closed, as queue list counts it\n' + body)
  const waiting = host({ deps: { '02-beta': [P('01-alpha')] } })
  const named = JSON.parse(waiting.ok(P('02-beta'), '--json').stdout)
  assert.ok(named.body.startsWith('**⏸️ nothing runnable — 1 named spec(s) wait**') && named.body.includes('Next: nothing runnable — /spec:queue list') && !named.body.includes('drained'), named.body)
})

test('AC-20261105-12-8 REPORT with open items left but nothing runnable ends nothing runnable, never queue drained', () => {
  const h = host({ specs: [SPEC_LIST[0]] })
  Q.add(h.dir, { payload: 'pick a database', type: 'decide' })
  Q.add(h.dir, { payload: 'remember the footer' })
  h.ok('--mark', 'planned'); h.ok(); h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'src/a.js'); h.ok('--mark', 'returned', '--lane', '1')
  const rep = h.ok().stdout
  assert.ok(rep.includes('Next: nothing runnable — 2 open item(s) need you: /spec:queue list'), rep)
  assert.ok(!rep.includes('queue drained'), rep)
})

// ---- spec 20261105/16: the queue fills itself again ---------------------------------------------
// The fixture host: brief 03 (hardened 01-a1, 02-a2), brief 04 (Depends on 03; hardened 03-b1), brief 05 (no spec), ad-hoc hardened
// 04-adhoc, ad-hoc draft 05-adhoc-draft, ad-hoc hardened 06-blocked after that draft; no queue file.
const FIX16 = 'specs/20261104'
function bareHost({ lanes = 4 } = {}) {
  const h = host({ specs: [], lanes })
  fs.rmSync(path.join(h.dir, '.git/spec-queue.json'), { force: true })
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(h.dir, rel)), { recursive: true }); fs.writeFileSync(path.join(h.dir, rel), text) }
  const brief = (nn, name, deps) => w(`docs/roadmap/${nn}-${name}.md`, `# ${nn} — ${name}\n\nPhase: P1 · Depends on: ${deps} · Primary workspaces: app\n\n## Result\n\nx\n`)
  brief('03', 'alpha', '—'); brief('04', 'beta', '03'); brief('05', 'gamma', '—')
  const spec = (stem, file, status, b, deps) => w(`${FIX16}/${stem}.md`, specText(stem, file, { status, deps }).replace('architecture: false', `brief: ${b || 'n/a'}\narchitecture: false`))
  spec('01-a1', 'src/a1.js', 'hardened', '03'); spec('02-a2', 'src/a2.js', 'hardened', '03'); spec('03-b1', 'src/b1.js', 'hardened', '04')
  spec('04-adhoc', 'src/c.js', 'hardened'); spec('05-adhoc-draft', 'src/d.js', 'draft'); spec('06-blocked', 'src/e.js', 'hardened', null, [`${FIX16}/05-adhoc-draft.md`])
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'fixture')
  return Object.assign(h, { w, qfile: path.join(h.dir, '.git/spec-queue.json') })
}
const queueCli = (d, ...a) => runNode('scripts/queue.js', [...a, '--root', d])

test('AC-20261105-16-5 bare fanout takes every startable spec in queue order, with the brief rules, and writes no queue file', () => {
  const h = bareHost()
  const check = (plan) => {
    const lines = plan.split('\n')
    assert.ok(plan.includes('📌 Auto-picked batch: 1 lane(s)') && plan.includes(`lane 1: ${FIX16}/01-a1.md`) && !plan.includes('lane 2:'), plan)
    for (const l of [`${FIX16}/02-a2.md waits — shared brief 03`, `${FIX16}/03-b1.md waits — brief 04 depends on 03`, `${FIX16}/04-adhoc.md waits — the batch stops before 03-b1`,
      `${FIX16}/06-blocked.md waits — depends on ${FIX16}/05-adhoc-draft.md (draft — it cannot land in this fan-out)`]) assert.ok(lines.includes('  ' + l), l + '\n' + plan)
    assert.ok(lines.some((l) => l.startsWith('Held (') && l.includes('05-adhoc-draft (draft)')), plan)
    assert.deepStrictEqual(lines.filter((l) => l.includes('needs you')), ['— needs you — needs /spec:plan: /spec:plan docs/roadmap/05-gamma.md'], 'briefs 03 and 04 stand for their specs and print nothing')
  }
  check(h.ok().stdout)
  assert.ok(!fs.existsSync(h.qfile), 'no queue file is written')
  queueCli(h.dir, 'next'); check(h.ok().stdout)
})

test('AC-20261105-16-6 an implementing sibling holds its spec and waits the rest of its brief; a plan prompt ahead ends nothing', () => {
  const h = bareHost()
  h.w(`${FIX16}/01-a1.run/state.json`, '{"step":"BUILD"}')
  const body = h.ok().stdout
  assert.ok(body.startsWith('▶ PLAN') && body.includes('⏸️ nothing runnable — 6 open item(s)'), body)
  assert.ok(body.includes(`${FIX16}/02-a2.md waits — shared brief 03`) && /Held \(.*01-a1 \(implementing\)/.test(body), body)
  assert.ok(!body.includes('Auto-picked'))
  fs.rmSync(path.join(h.dir, FIX16, '01-a1.run'), { recursive: true })
  assert.strictEqual(queueCli(h.dir, 'add', 'x', '--type', 'plan', '--top').status, 0)
  const again = h.ok().stdout
  assert.ok(again.includes(`lane 1: ${FIX16}/01-a1.md`) && again.includes('q1 needs you — needs /spec:plan: /spec:plan x'), again)
})

test('AC-20261105-16-7 a brief item\'s gate holds its specs, a finished brief says so, explicit paths and --pick obey the walk, an unknown status is held, nothing open is drained', () => {
  const h = bareHost()
  fs.writeFileSync(h.qfile, JSON.stringify({ version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-04', after: { brief: '05' } }] }))
  const gated = h.ok().stdout
  assert.ok(gated.includes(`${FIX16}/01-a1.md waits — after brief 05 (unplanned)`) && gated.includes(`${FIX16}/02-a2.md waits — after brief 05 (unplanned)`) && gated.includes(`lane 1: ${FIX16}/03-b1.md`), gated)
  fs.rmSync(h.qfile)
  const explicit = h.ok(`${FIX16}/01-a1.md`, `${FIX16}/02-a2.md`).stdout
  assert.ok(explicit.includes(`lane 1: ${FIX16}/01-a1.md`) && explicit.includes(`${FIX16}/02-a2.md waits — shared brief 03`), explicit)
  const pick = h.ok('--pick').stdout
  assert.ok(pick.includes('01-a1') && !pick.includes('02-a2') && !pick.includes('03-b1') && !pick.includes('06-blocked'), pick)
  h.w(`${FIX16}/07-wip.md`, specText('07-wip', 'src/w.js', { status: 'wip' }))
  assert.match(h.ok().stdout, /Held \(.*07-wip \(wip\)/)
  const fin = bareHost()
  for (const stem of ['01-a1', '02-a2']) fin.w(`${FIX16}/${stem}.md`, specText(stem, 'src/x.js', { status: 'done' }).replace('architecture: false', 'brief: 03\narchitecture: false'))
  for (const f of ['04-adhoc', '05-adhoc-draft', '06-blocked', '03-b1']) fs.rmSync(path.join(fin.dir, FIX16, f + '.md'))
  for (const n of ['04-beta', '05-gamma']) fs.rmSync(path.join(fin.dir, 'docs/roadmap', n + '.md'))
  fs.writeFileSync(fin.qfile, JSON.stringify({ version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-04' }] }))
  const done = fin.ok().stdout
  assert.ok(done.includes('q1 needs you — specs done: /spec:queue done 03') && done.includes('nothing runnable — 1 open item(s)'), done)
  const drained = host({ specs: [] })
  assert.ok(drained.ok().stdout.includes('✅ queue drained — nothing queued'))
})

test('AC-20261105-16-8 an unqueued hardened spec lands through a stub lane and ends drained; REPORT opens ⚠️ when a lane was dismissed, ✅ otherwise', () => {
  const h = host({ specs: [['01-alpha', 'src/a.js']] })
  const q = Q.read(h.dir); q.items = []; Q.write(h.dir, q)
  h.ok('--mark', 'planned'); h.ok('--mark', 'dispatched')
  h.finish('01-alpha', 'src/a.js'); h.ok('--mark', 'returned', '--lane', '1')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/a.js')), 'landed on trunk')
  const rep = h.ok().stdout
  assert.ok(rep.includes('✅ fanout — 1 lane(s) merged') && rep.includes('nothing needs you — queue drained'), rep)
  const d = host({ specs: [['01-alpha', 'src/a.js']] })
  const dq = Q.read(d.dir); dq.items = []; Q.write(d.dir, dq)
  d.ok('--mark', 'planned'); d.ok('--mark', 'dispatched'); d.ok('--mark', 'dismissed', '--lane', '1')
  assert.ok(d.ok().stdout.includes('⚠️ fanout — 0 lane(s) merged, 1 dismissed'), d.ok().stdout)
})

test('AC-20261105-16-9 a bare fanout refuses an argument it does not take and writes no state', () => {
  const h = bareHost()
  for (const argv of [['--bogus', 'x'], ['--pik']]) {
    const r = h.run(...argv)
    assert.strictEqual(r.status, 2, argv.join(' '))
    assert.strictEqual(r.stderr, `fanout: unknown argument ${argv[0]}\n`)
  }
  assert.ok(!fs.existsSync(path.join(h.dir, '.git/spec-fanout.json')))
})

test('AC-20261105-16-11 a queued spec whose file is gone is not waited on by bare fanout', () => {
  const h = bareHost()
  assert.strictEqual(queueCli(h.dir, 'add', `${FIX16}/04-adhoc.md`).status, 0)
  fs.rmSync(path.join(h.dir, FIX16, '04-adhoc.md'))
  const plan = h.ok().stdout
  assert.ok(!plan.includes('04-adhoc'), plan)
  assert.ok(plan.includes(`lane 1: ${FIX16}/01-a1.md`))
})

test('AC-20261105-16-12 a ticked brief loses its gate on the fanout plan too', () => {
  const h = bareHost()
  fs.writeFileSync(h.qfile, JSON.stringify({ version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-04', after: { brief: '05' } }] }))
  assert.ok(h.ok().stdout.includes('after brief 05'))
  assert.strictEqual(queueCli(h.dir, 'done', '03').status, 0)
  const plan = h.ok().stdout
  assert.ok(!plan.includes('after brief 05') && !plan.includes(`${FIX16}/01-a1.md waits — after`) && plan.includes(`${FIX16}/02-a2.md`), plan)
})

test('AC-20261105-16-23 a spec lane still runs /spec:run; the commands and the contract name /spec:fix as the one fix door', () => {
  const h = host({ specs: [['01-alpha', 'src/a.js']] })
  h.ok('--mark', 'planned')
  const disp = h.ok().stdout
  assert.ok(disp.includes(`prompt: "/spec:run ${P('01-alpha')} --root `) && !disp.includes('prompt: "/spec:fix'), disp)
})
