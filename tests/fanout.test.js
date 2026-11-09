'use strict'
// Pins spec/scripts/fanout.js by execution: AUTO and --pick plans, dispatch makes the lane worktrees, a lane ends DONE in its
// worktree and lands through lib/land.js (rebase, gate and merge in the worktree), a conflict goes back to the lane, RELAY
// carries the three questions, a lane that needs another spec holds on its queue item, and every fix item is a lane.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))
const pending = require(path.join(SPEC, 'scripts/lib/pending.js'))
const stub = require(path.join(SPEC, 'scripts/lib/stub.js'))

const SPEC_LIST = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/a.js']]
const P = (stem) => `specs/20261104/${stem}.md`

function specText(stem, file, { status = 'hardened', deps, proto } = {}) {
  const dep = deps === undefined ? '' : `depends_on: ${Array.isArray(deps) ? `[${deps.join(', ')}]` : deps}\n`
  return `---\ndate: 2026-11-04\nstatus: ${status}\n${dep}${proto ? 'prototype: x\n' : ''}architecture: false\n---\n# ${stem}\n\n## Intent\n- You asked: ${stem}\n- Users will notice: ${stem} appears\n\n` +
    `## Decisions\n\n| ID | Decision | Why |\n|---|---|---|\n| D1 | plain | simple |\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| \`${file}\` | CREATE | ${stem} |\n`
}

// opts: lanes, specs (stem, file pairs), deps {stem: depends_on}, status {stem: status}, proto [stem], testCommand, cfg, queue
function host(opts = {}) {
  const SPECS = opts.specs || SPEC_LIST
  const dir = tmpdir('fanout')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'specs', '20261104'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nspecs/**/*.run/\n')
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify({ testCommand: opts.testCommand || 'test ! -f RED', lanes: opts.lanes || 2, ...(opts.cfg || {}) }))
  for (const [stem, file] of SPECS) fs.writeFileSync(path.join(dir, P(stem)), specText(stem, file, { status: (opts.status || {})[stem], deps: (opts.deps || {})[stem], proto: (opts.proto || []).includes(stem) }))
  const g = gitRepo(dir)
  Q.write(dir, { version: 3, seq: 9, items: opts.queue || SPECS.map(([stem], i) => ({ id: 'q' + (i + 1), kind: 'spec', payload: P(stem), added: '2026-11-04' })) })
  const run = (...a) => runNode('scripts/fanout.js', ['--root', dir, ...a])
  const ok = (...a) => { const r = run(...a); assert.strictEqual(r.status, 0, `${a.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout }
  const wt = (stem, kind = 'spec') => path.join(dir, '.claude', 'worktrees', `${kind}-${stem}`)
  const lane = (stem, ...a) => runNode('scripts/run.js', [P(stem), '--root', wt(stem), ...a])
  const lok = (stem, ...a) => { const r = lane(stem, ...a); assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout }
  const findings = (list = []) => { const f = path.join(tmpdir('f'), 'f.json'); fs.writeFileSync(f, JSON.stringify({ findings: list, verdict: 'clean' })); return f }
  // A lane's agent: its own run.js builds the file, gates, reviews clean and commits; the run ends DONE in the worktree.
  const finish = (stem, file, content = stem + '\n') => {
    lok(stem); fs.mkdirSync(path.dirname(path.join(wt(stem), file)), { recursive: true }); fs.writeFileSync(path.join(wt(stem), file), content)
    lok(stem, '--mark', 'built'); return lok(stem, '--mark', 'reviewed', '--file', findings())
  }
  return { dir, g, run, ok, wt, lane, lok, finish, findings, step: () => run('--state').stdout.trim(), fan: () => st.readFanout(dir) }
}
const dispatch = (h, ...a) => { const plan = h.ok(...a); h.ok('--mark', 'planned', ...a.slice(1)); const disp = h.ok(); h.ok('--mark', 'dispatched'); return { plan, disp } }
const newestGateTree = (h) => {
  const d = path.join(h.dir, '.git/spec-run-cache')
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))).sort((a, b) => a.ts.localeCompare(b.ts)).pop().tree
}

test('AC-20261105-16-23 AC-20261105-02-11 AC-20261105-02-15 AC-20261105-07-1 AC-20261105-10-3 AC-20261105-10-4 AC-20261107-01-7 AUTO: two lanes go out, each ends DONE in its worktree and lands as it returns, a stub commit after it; REPORT counts what is left; PLAN picks the third', () => {
  const h = host({ queue: [...SPEC_LIST.map(([stem], i) => ({ id: 'q' + (i + 1), kind: 'spec', payload: P(stem), added: 'x' })), { id: 'q4', kind: 'prompt', type: 'fix', payload: 'login is slow', added: 'x' }] })
  const { plan, disp } = dispatch(h)
  assert.match(plan, /📌 Auto-picked batch: 2 lane\(s\)/)
  assert.ok(!/AskUserQuestion/.test(plan) && plan.includes(`${P('03-gamma')} waits — all 2 lanes are taken`))
  assert.deepStrictEqual(h.fan().batch.map((l) => [l.spec, l.worktree, l.branch]), [[P('01-alpha'), '.claude/worktrees/spec-01-alpha', 'spec/01-alpha'], [P('02-beta'), '.claude/worktrees/spec-02-beta', 'spec/02-beta']])
  for (const stem of ['01-alpha', '02-beta']) {
    assert.ok(pending.isLane(h.wt(stem)))
    assert.ok(disp.includes(`prompt: ${JSON.stringify(`/spec:run ${P(stem)} --root ${h.wt(stem)}`)}`), disp)
  }
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '1').status, 2, 'a lane not at DONE cannot return done')
  assert.match(h.finish('01-alpha', 'src/a.js'), /REVIEW → DONE;[\s\S]*fanout lands it/)
  const sha1 = (/^lane 1 landed as ([0-9a-f]{40})$/m.exec(h.ok('--mark', 'returned', '--lane', '1')) || [])[1]
  assert.strictEqual(sha1, h.g('rev-parse', 'main~1').trim(), 'it lands inside its own returned mark, under one stub commit')
  assert.strictEqual(h.g('log', '-1', '--format=%s', 'main').trim(), 'chore(spec): stub 20261104/01')
  assert.deepStrictEqual(h.g('show', '--name-only', '--format=', 'main').trim().split('\n'), [P('01-alpha')], 'the stub commit touches only the finished spec')
  assert.strictEqual(st.readSpec(path.join(h.dir, P('01-alpha'))).frontmatter.text, sha1)
  assert.strictEqual(h.step(), 'WAIT', 'lane 2 is still out')
  h.finish('02-beta', 'src/b.js')
  const two = h.ok('--mark', 'returned', '--lane', '2')
  assert.ok(two.includes('lane 2 landed as ') && !two.includes('lane 1 landed'), 'a lane landed by an earlier mark is not printed again: ' + two)
  assert.strictEqual(h.step(), 'REPORT')
  for (const f of ['src/a.js', 'src/b.js']) assert.ok(fs.existsSync(path.join(h.dir, f)))
  assert.strictEqual(st.readSpec(path.join(h.dir, P('01-alpha'))).frontmatter.status, 'done')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
  assert.strictEqual(h.g('rev-parse', 'main~1^{tree}').trim(), newestGateTree(h), 'the landed sha holds the tree the last landing gate passed')
  assert.deepStrictEqual(Q.read(h.dir).items.map((i) => !!i.done), [true, true, false, false])
  assert.ok(!fs.existsSync(h.wt('01-alpha')) && !fs.existsSync(h.wt('02-beta')))
  const rep = h.ok()
  assert.ok(rep.includes(`- merged spec-01-alpha as ${sha1}; queue item ticked`) && rep.includes('Next: 1 spec(s) and 1 fix(es) left — /clear, then /spec:fanout to continue'), rep)
  assert.ok(!h.ok('--mark', 'reported').includes('Auto-picked'), 'reported prints the checkpoint, no PLAN body')
  assert.strictEqual(h.fan(), null)
  assert.match(h.ok(), new RegExp(`^▶ PLAN[\\s\\S]*lane 1: ${P('03-gamma')}`))
  h.ok('--mark', 'planned')
  assert.deepStrictEqual(h.fan().batch.map((l) => l.spec || l.symptom), [P('03-gamma'), 'login is slow'])
})

const SHARED = [['01-alpha', 'src/a.js'], ['02-beta', 'src/a.js']]
test('AC-20261107-02-1 AC-20261105-02-12 AC-20261105-10-1 AC-20261105-10-2 AC-20261105-10-5 AC-20261105-11-7 a lane whose landing conflicts goes back with the rebase left in its worktree; main stays clean; other lanes land as they return; its run gates and reviews again, then it lands', () => {
  const h = host({ lanes: 4, specs: [...SHARED, ['03-gamma', 'src/c.js'], ['04-delta', 'src/d.js']] })
  dispatch(h)
  h.finish('01-alpha', 'src/a.js', 'alpha\n')
  h.finish('02-beta', 'src/a.js', 'beta\n')
  h.ok('--mark', 'returned', '--lane', '1')
  const cp = h.ok('--mark', 'returned', '--lane', '2')
  assert.match(cp, /lane 2 sent back — conflicts: src\/a\.js\n {2}Agent\(/)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '', 'the main checkout is never left mid-merge')
  assert.deepStrictEqual(h.fan().batch[1].status, 'sent-back')
  const wait = h.ok()
  assert.match(wait, /lane 2 conflicts: src\/a\.js\n\nLanes \(status · run step\):\n {2}lane 1 — spec-01-alpha: merged\n {2}lane 2 — spec-02-beta: sent-back · resolving rebase \(1 files\)\n {2}lane 3 — spec-03-gamma: dispatched · no run state yet\n {2}lane 4 — spec-04-delta: dispatched · no run state yet\n\n▶ when done: /, 'the re-send dispatch, a blank line, the lane list, nothing after it: ' + wait)
  h.finish('03-gamma', 'src/c.js')
  assert.match(h.ok('--mark', 'returned', '--lane', '3'), /^lane 3 landed as [0-9a-f]{40}$/m, 'a lane lands while another is sent back')
  assert.match(h.lok('02-beta'), /^▶ DONE · spec \S+\n\nA rebase onto trunk [0-9a-f]{40} is in progress/, 'the lane driver prints the rebase step itself')
  h.ok('--mark', 'resent')
  assert.match(h.ok(), /lane 2 — spec-02-beta: dispatched · resolving rebase \(1 files\)/)
  h.finish('04-delta', 'src/d.js')
  assert.match(h.ok('--mark', 'returned', '--lane', '4'), /^lane 4 landed as [0-9a-f]{40}$/m, 'a dispatched lane mid-rebase holds no ready lane')
  assert.strictEqual(h.run('--mark', 'returned', '--lane', '2').status, 2, 'mid-rebase it cannot return')
  fs.writeFileSync(path.join(h.wt('02-beta'), 'src/a.js'), 'alpha\nbeta\n')
  assert.match(h.lok('02-beta'), /^▶ REVIEW/, 'the resolution is gated and reviewed in that one dispatch')
  assert.strictEqual(st.readRun(path.join(h.wt('02-beta'), P('02-beta'))).base, h.g('-C', h.wt('02-beta'), 'merge-base', 'main', 'HEAD').trim())
  h.lok('02-beta', '--mark', 'reviewed', '--file', h.findings())
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'REPORT')
  assert.strictEqual(fs.readFileSync(path.join(h.dir, 'src/a.js'), 'utf8'), 'alpha\nbeta\n')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-20261105-07-5 AC-20261105-10-3 AC-20261105-10-5 AC-20261107-01-7 a red rebased tree goes back to the lane\'s own GATE and lands once green; a second conflict against the same trunk stops the lane for the user', () => {
  const h = host({ testCommand: 'if test -f src/a.js && test -f src/b.js && test ! -f ok; then echo "FAIL: a and b collide"; exit 1; fi' })
  dispatch(h)
  h.finish('01-alpha', 'src/a.js'); h.finish('02-beta', 'src/b.js')
  h.ok('--mark', 'returned', '--lane', '1')
  const head = h.g('rev-parse', 'main').trim()
  const red = h.ok('--mark', 'returned', '--lane', '2')
  assert.match(red, /lane 2 gate red after rebase: FAIL: a and b collide\n {2}Agent\(/)
  const run2 = st.readRun(path.join(h.wt('02-beta'), P('02-beta')))
  assert.deepStrictEqual([run2.step, run2.base], ['GATE', head], 'back to its own run at GATE on the new base')
  assert.ok(!fs.existsSync(path.join(h.dir, 'src/b.js')) && h.g('rev-parse', 'main').trim() === head, 'red never reaches trunk')
  assert.strictEqual(h.g('log', '-1', '--format=%s', 'main').trim(), 'chore(spec): stub 20261104/01', 'and makes no stub commit: lane 1\'s is the last')
  assert.match(h.ok(), /lane 2 gate red after rebase: FAIL[\s\S]*lane 2 — spec-02-beta: sent-back · gate red after rebase/)
  h.ok('--mark', 'resent'); fs.writeFileSync(path.join(h.wt('02-beta'), 'ok'), '')
  assert.match(h.lok('02-beta'), /^▶ REVIEW/); h.lok('02-beta', '--mark', 'reviewed', '--file', h.findings())
  assert.match(h.ok('--mark', 'returned', '--lane', '2'), /^lane 2 landed as [0-9a-f]{40}$/m)
  const c = host({ specs: SHARED })
  dispatch(c)
  c.finish('01-alpha', 'src/a.js', 'alpha\n'); c.finish('02-beta', 'src/a.js', 'beta\n')
  c.ok('--mark', 'returned', '--lane', '1'); c.ok('--mark', 'returned', '--lane', '2')
  execFileSync('git', ['-C', c.wt('02-beta'), 'rebase', '--abort'])
  c.ok('--mark', 'resent'); c.ok('--mark', 'returned', '--lane', '2')
  assert.deepStrictEqual([c.fan().batch[1].status, c.fan().batch[1].reason], ['stopped', 'second rebase conflict'])
})

test('AC-20261105-06-12 RELAY: lane questions are grouped by kind, asked verbatim with the first option recommended, answered, resumed, and their text reaches REPORT with the lane\'s notice and decided lines', () => {
  const h = host()
  dispatch(h)
  h.lok('01-alpha')
  assert.match(h.lok('01-alpha', '--mark', 'unmet', '--decision', 'D1', '--why', 'Plain cannot hold the nested list.'), /PENDING_QUESTION/)
  h.ok('--mark', 'returned', '--lane', '1')
  pending.writePending(h.wt('02-beta'), { lane: '02-beta', question: 'Keep the old rows?', options: ['keep the old rows', 'delete them'], kind: 'assumption' })
  h.ok('--mark', 'returned', '--lane', '2')
  assert.strictEqual(h.step(), 'RELAY')
  const relay = h.ok()
  assert.ok(relay.includes('[unmet] lane 1 — spec-01-alpha\n  Q: Plain cannot hold the nested list.\n   - amend (recommended)') && relay.includes('   - keep the old rows (recommended)'), relay)
  assert.ok(relay.indexOf('[assumption] lane 2') >= 0 && relay.indexOf('[assumption] lane 2') < relay.indexOf('[unmet] lane 1') && relay.includes('The orchestrator never answers for the user'), relay)
  assert.strictEqual(h.run('--mark', 'answered', '--lane', '1').status, 2, 'a pending question needs --label')
  h.ok('--mark', 'answered', '--lane', '1', '--label', 'retry'); h.ok('--mark', 'answered', '--lane', '2', '--label', 'keep the old rows')
  assert.ok(h.ok().includes(`/spec:run ${P('01-alpha')}`), 'the answered lane is re-dispatched')
  h.ok('--mark', 'resumed')
  assert.match(h.lok('01-alpha'), /^▶ BUILD/, 'the lane applies the answer and goes on')
  fs.mkdirSync(path.join(h.wt('01-alpha'), 'src'), { recursive: true }); fs.writeFileSync(path.join(h.wt('01-alpha'), 'src/a.js'), 'a\n')
  h.lok('01-alpha', '--mark', 'built')
  h.lok('01-alpha', '--mark', 'reviewed', '--file', h.findings([{ severity: 'advisory', summary: 'tidy it' }]))
  h.ok('--mark', 'returned', '--lane', '1')
  pending.consumePending(h.wt('02-beta')) // what the lane's own run does with an answer it applies
  h.finish('02-beta', 'src/b.js'); h.ok('--mark', 'returned', '--lane', '2')
  const rep = h.ok()
  assert.ok(rep.includes('- answered lane 1 (spec-01-alpha): Plain cannot hold the nested list. → retry') && rep.includes('- answered lane 2 (spec-02-beta): Keep the old rows? → keep the old rows'), rep)
  assert.ok(rep.includes("📌 lane 1 (spec-01-alpha): queued the review's advisories as one fix") && rep.includes('📌 lane 1 (spec-01-alpha): Users will notice: 01-alpha appears'), rep)
})

test('AC-20261107-02-7 AC-20261105-16-8 a dismissed lane question parks the lane with a decide item holding the question; no label is recorded; REPORT opens ⚠️', () => {
  const h = host({ lanes: 1 })
  dispatch(h)
  h.lok('01-alpha')
  h.lok('01-alpha', '--mark', 'unmet', '--decision', 'D1', '--why', 'Which list shape?')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.match(h.ok(), /dismissed: node .* --mark dismissed --lane 1/)
  h.ok('--mark', 'dismissed', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  assert.deepStrictEqual(Q.open(Q.read(h.dir)).filter((i) => i.type === 'decide').map((i) => i.payload), ['Which list shape?'])
  assert.deepStrictEqual(h.fan().answered, [], 'nothing is answered for the user')
  assert.strictEqual(st.readRun(path.join(h.wt('01-alpha'), P('01-alpha'))).step, 'STOPPED')
  const rep = h.ok()
  assert.ok(rep.includes('⚠️ fanout — 0 lane(s) merged, 1 stopped or dismissed') && rep.includes('stopped spec-01-alpha — the question was dismissed') && rep.includes('📌 lane 1 (spec-01-alpha): stopped: the question was dismissed — queued 📌 decide: Which list shape?'), rep)
  h.ok('--mark', 'reported')
  assert.match(h.ok(), new RegExp(`${P('01-alpha')} waits — its lane stopped \\(the question was dismissed\\)`))
  // a fix item bound to that hardened spec waits with the spec lane's stop reason: its code lives only in the kept spec worktree, not on trunk
  Q.write(h.dir, { ...Q.read(h.dir), items: [...Q.read(h.dir).items, { id: 'q9', kind: 'prompt', type: 'fix', spec: P('01-alpha'), payload: 'tidy the list', added: 'x' }] })
  const plan = h.ok(); assert.ok(!plan.includes('fix: tidy the list'), 'no fix lane goes out from trunk\n' + plan)
  assert.match(plan, /tidy the list waits — its lane stopped \(the question was dismissed\)/, plan)
})

test('AC-20261107-02-6 a lane that needs spec Y holds on its queue item until Y is done, then goes out again on its kept worktree with no user action', () => {
  const h = host({ lanes: 1, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js']], queue: [{ id: 'q1', kind: 'spec', payload: P('01-alpha'), added: 'x' }] })
  dispatch(h)
  h.lok('01-alpha'); fs.writeFileSync(path.join(h.wt('01-alpha'), 'half.txt'), 'half\n')
  h.lok('01-alpha', '--mark', 'after', '--on', P('02-beta'))
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.fan().batch[0].status, 'held')
  assert.deepStrictEqual(Q.read(h.dir).items[0].after, { spec: P('02-beta') }, 'the queue\'s own gate holds it')
  assert.match(h.ok(), /⚠️ fanout — 0 lane\(s\) merged, 1 held[\s\S]*held spec-01-alpha — after specs\/20261104\/02-beta\.md/)
  h.ok('--mark', 'reported')
  const plan = h.ok(P('01-alpha'))
  assert.ok(plan.includes(`${P('01-alpha')} waits — after ${P('02-beta')} (hardened)`), plan)
  // a fix item bound to the held spec waits on its lane: the spec's code is only in the kept spec worktree, not on trunk
  const q = Q.read(h.dir); Q.write(h.dir, { ...q, items: [...q.items, { id: 'q9', kind: 'prompt', type: 'fix', spec: P('01-alpha'), payload: 'tidy the list', added: 'x' }] })
  const fixPlan = h.ok(); assert.ok(!fixPlan.includes('fix: tidy the list'), 'no fix lane goes out from trunk\n' + fixPlan)
  assert.ok(fixPlan.includes(`tidy the list waits — its spec's lane is held on .claude/worktrees/spec-01-alpha (after ${P('02-beta')})`), fixPlan)
  Q.write(h.dir, q)
  st.writeStatus(path.join(h.dir, P('02-beta')), 'done'); h.g('commit', '-qam', 'beta done')
  const again = dispatch(h)
  assert.ok(again.plan.includes('lane 1: ' + P('01-alpha')), again.plan)
  assert.ok(fs.existsSync(path.join(h.wt('01-alpha'), 'half.txt')), 'the kept worktree, with its work')
  assert.match(h.lok('01-alpha'), /^▶ BUILD/, 'its run goes on by itself, rebased onto trunk')
  fs.mkdirSync(path.join(h.wt('01-alpha'), 'src')); fs.writeFileSync(path.join(h.wt('01-alpha'), 'src/a.js'), 'a\n')
  h.lok('01-alpha', '--mark', 'built'); h.lok('01-alpha', '--mark', 'reviewed', '--file', h.findings())
  h.ok('--mark', 'returned', '--lane', '1')
  assert.ok(fs.existsSync(path.join(h.dir, 'src/a.js')) && fs.existsSync(path.join(h.dir, 'half.txt')))
})

test('AC-20261108-03-6 a lane that picks amend is held on its kept worktree with no queue gate, PLAN waits it until the spec is re-locked, then it resumes at GATE and lands with the amended text', () => {
  const h = host({ lanes: 1, specs: [['01-alpha', 'src/a.js']], queue: [{ id: 'q1', kind: 'spec', payload: P('01-alpha'), added: 'x' }] })
  dispatch(h)
  h.lok('01-alpha'); fs.mkdirSync(path.join(h.wt('01-alpha'), 'src'), { recursive: true }); fs.writeFileSync(path.join(h.wt('01-alpha'), 'src/a.js'), 'a\n')
  h.lok('01-alpha', '--mark', 'unmet', '--decision', 'D1', '--why', 'Plain cannot hold it.')
  h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'RELAY')
  assert.ok(h.ok().includes('[unmet] lane 1 — spec-01-alpha\n  Q: Plain cannot hold it.\n   - amend (recommended)'))
  h.ok('--mark', 'answered', '--lane', '1', '--label', 'amend'); h.ok('--mark', 'resumed')
  assert.ok(h.lok('01-alpha').includes(`/spec:plan ${P('01-alpha')}`), 'the lane applies the answer and stops')
  h.ok('--mark', 'returned', '--lane', '1')
  const lane = h.fan().batch[0]
  assert.deepStrictEqual([lane.status, lane.why, lane.on], ['held', 'amend', P('01-alpha')])
  assert.strictEqual(Q.read(h.dir).items[0].after, undefined, 'the run state in the worktree is the hold, not a queue gate')
  const rep = h.ok()
  assert.ok(rep.includes('⚠️ fanout — 0 lane(s) merged, 1 held') && rep.includes(`held spec-01-alpha — amend: /spec:plan ${P('01-alpha')}; PLAN re-picks it on its worktree once the amended spec is locked`) && !rep.includes('its lane stopped'), rep)
  h.ok('--mark', 'reported')
  assert.ok(h.ok(P('01-alpha')).includes(`${P('01-alpha')} waits — its lane waits for the amended spec`))
  // a fix item bound to the amend-held spec waits on that lane too, rather than going out from trunk without its work
  const q = Q.read(h.dir); Q.write(h.dir, { ...q, items: [...q.items, { id: 'q9', kind: 'prompt', type: 'fix', spec: P('01-alpha'), payload: 'tidy the list', added: 'x' }] })
  const fixPlan = h.ok(); assert.ok(!fixPlan.includes('fix: tidy the list'), 'no fix lane goes out from trunk\n' + fixPlan)
  assert.ok(fixPlan.includes(`tidy the list waits — its lane waits for the amended spec — /spec:plan ${P('01-alpha')}, then /spec:fanout`), fixPlan)
  Q.write(h.dir, q)
  const spec = path.join(h.dir, P('01-alpha'))
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('- You asked: 01-alpha', '- You asked: 01-alpha, amended')); h.g('commit', '-qam', 'lock the amended spec')
  const again = dispatch(h)
  assert.ok(again.plan.includes('lane 1: ' + P('01-alpha')), again.plan)
  assert.ok(h.lok('01-alpha').startsWith('▶ REVIEW'), 'the kept lane resumes at GATE')
  h.lok('01-alpha', '--mark', 'reviewed', '--file', h.findings())
  assert.match(h.ok('--mark', 'returned', '--lane', '1'), /^lane 1 landed as [0-9a-f]{40}$/m)
  const built = h.g('log', '-1', '--format=%H', '--grep=^build(').trim()
  assert.ok(h.g('show', `${built}:${P('01-alpha')}`).includes('01-alpha, amended') && fs.existsSync(path.join(h.dir, 'src/a.js')), 'the build commit carries the amended text and the kept work')
})

const FIXQ = (extra) => [{ id: 'q1', kind: 'prompt', type: 'fix', ...extra, added: 'x' }]

test('AC-20261107-02-4 AC-20261107-02-5 AC-20261105-12-8 AC-20261105-07-2 AC-20261105-07-3 AC-20261105-07-4 AC-20261105-09-10 AC-20261105-09-11 AC-20261107-01-7 a fix item is a lane: the advisories item bound to a done spec, and a spec-less fix, each land as fix(…) with no spec file written, a stub commit after the first; open items left end REPORT nothing runnable', () => {
  const h = host({ lanes: 2, status: { '01-alpha': 'done' }, specs: [['01-alpha', 'src/a.js']],
    queue: [...FIXQ({ spec: P('01-alpha'), payload: 'advisories of 01-alpha: tidy it' }), { id: 'q2', kind: 'prompt', type: 'fix', payload: 'login is slow', added: 'x' }] })
  const { plan, disp } = dispatch(h)
  const slug = st.slugOf('login is slow')
  assert.ok(plan.includes(`lane 1: ${P('01-alpha')} — fix: advisories of 01-alpha: tidy it`) && plan.includes(`lane 2: fix-${slug} — fix: login is slow`), plan)
  const w1 = h.wt('01-alpha', 'fix'); const w2 = h.wt(slug, 'fix')
  assert.deepStrictEqual(h.fan().batch.map((l) => [l.worktree, l.branch]), [['.claude/worktrees/fix-01-alpha', 'fix/01-alpha'], [`.claude/worktrees/fix-${slug}`, `fix/${slug}`]])
  assert.ok(disp.includes(JSON.stringify(`/spec:fix --root ${w1} ${P('01-alpha')} — advisories of 01-alpha: tidy it`)) && disp.includes(JSON.stringify(`/spec:fix --root ${w2} login is slow`)), disp)
  const fx = (w, spec, sym, ...a) => { const r = runNode('scripts/run.js', [...spec, '--fix', sym, '--root', w, ...a]); assert.strictEqual(r.status, 0, r.stderr); return r.stdout }
  for (const [w, spec, sym] of [[w1, [P('01-alpha')], 'advisories of 01-alpha: tidy it'], [w2, [], 'login is slow']]) {
    const b = fx(w, spec, sym)
    assert.ok(/^▶ BUILD/.test(b) && b.includes(`- Fix: ${sym}`) && !b.includes('## File Plan'), b)
    fs.writeFileSync(path.join(w, path.basename(w) + '.txt'), 'fixed\n')
    fx(w, spec, sym, '--mark', 'built'); fx(w, spec, sym, '--mark', 'reviewed', '--file', h.findings())
  }
  const sha1 = (/^lane 1 landed as ([0-9a-f]{40})$/m.exec(h.ok('--mark', 'returned', '--lane', '1')) || [])[1]
  assert.strictEqual(h.g('log', '-1', '--format=%s %P', 'main').trim(), `chore(spec): stub 20261104/01 ${sha1}`, 'the done spec is stubbed on the landed sha')
  assert.strictEqual(st.readSpec(path.join(h.dir, P('01-alpha'))).frontmatter.text, sha1)
  assert.ok(!h.ok('--mark', 'returned', '--lane', '2', '--json').includes('landed as'), '--json prints no landing line')
  assert.strictEqual(h.step(), 'REPORT')
  assert.ok(h.ok().includes(`- merged fix-${slug} as ${h.g('rev-parse', 'main').trim()}; queue item ticked`) && !h.g('branch', '--list', 'fix/*').trim())
  assert.strictEqual(st.readSpec(path.join(h.dir, P('01-alpha'))).frontmatter.status, 'done', 'the spec is left as it was')
  const subjects = h.g('log', '--format=%s', 'main').split('\n')
  assert.ok(subjects.includes('fix(20261104/01): advisories of 01-alpha: tidy it') && subjects.includes(`fix(${slug}): login is slow`), subjects.join('\n'))
  assert.ok(!subjects.some((s) => /done$/.test(s)), 'a fix makes no done commit')
  for (const c of h.g('log', '--format=%H %s', 'main').split('\n').filter((l) => / fix\(/.test(l)).map((l) => l.split(' ')[0])) {
    assert.ok(!h.g('show', '--name-only', '--format=', c).includes('specs/'), 'no spec file written by ' + c)
  }
  assert.strictEqual(h.g('diff', '--name-only', h.g('rev-list', '--max-parents=0', 'main').trim(), sha1, '--', 'specs').trim(), '', 'none up to the landed sha')
  assert.ok(Q.read(h.dir).items.every((i) => i.done) && !fs.existsSync(w1) && !fs.existsSync(w2))
  Q.add(h.dir, { payload: 'pick a database', type: 'decide' }); Q.add(h.dir, { payload: 'remember the footer' }); const rep = h.ok()
  assert.ok(rep.includes('Next: nothing runnable — 2 open item(s) need you: /spec:queue list') && !rep.includes('queue drained'), rep)
})

test('AC-20261107-01-5 a fix lane bound to a stub briefs the Decisions of its text: sha, takes unmet --decision D1, and lands fix(…) with no spec file and no stub commit', () => {
  const sym = 'alpha is slow'
  const h = host({ lanes: 1, status: { '01-alpha': 'done' }, specs: [['01-alpha', 'src/a.js']], queue: FIXQ({ spec: P('01-alpha'), payload: sym }) })
  assert.deepStrictEqual(stub.sweep(h.dir).paths, [P('01-alpha')])
  const head = h.g('rev-parse', 'main').trim()
  dispatch(h)
  const w = h.wt('01-alpha', 'fix')
  const fx = (...a) => { const r = runNode('scripts/run.js', [P('01-alpha'), '--fix', sym, '--root', w, ...a]); assert.strictEqual(r.status, 0, r.stderr); return r.stdout }
  assert.ok(fx().includes('## Decisions\n- D1: plain — simple'), 'the builder brief carries the full text')
  assert.match(fx('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain is too slow.'), /PENDING_QUESTION/)
  pending.answerPending(w, 'retry'); assert.match(fx(), /^▶ BUILD/)
  fs.writeFileSync(path.join(w, 'slow.txt'), 'fixed\n'); fx('--mark', 'built')
  assert.ok(fx().includes('## Decisions\n- D1: plain — simple'), 'the reviewer brief too')
  assert.ok(!fx('--mark', 'reviewed', '--file', h.findings()).includes('reverted spec text'))
  const sha = (/^lane 1 landed as ([0-9a-f]{40})$/m.exec(h.ok('--mark', 'returned', '--lane', '1')) || [])[1]
  assert.strictEqual(sha, h.g('rev-parse', 'main').trim(), 'nothing left to stub: the landed sha is trunk\'s head')
  assert.deepStrictEqual(h.g('diff', '--name-only', head, sha).trim().split('\n'), ['slow.txt'])
  assert.ok(h.g('log', '--format=%s', `${head}..${sha}`).split('\n').includes(`fix(20261104/01): ${sym}`))
})

test('AC-20261105-14-17 AC-20261105-12-8 AC-20261105-12-7 AC-20261105-16-7 PLAN: dependencies, a prototype spec, an explicit list, an unknown flag, the queue rows when nothing runs, drained, and off trunk', () => {
  const h = host({ lanes: 4, deps: { '02-beta': [P('01-alpha')] }, proto: ['03-gamma'] })
  const plan = h.ok()
  assert.ok(plan.includes('lane 1: ' + P('01-alpha')) && plan.includes(`${P('02-beta')} waits — depends on ${P('01-alpha')} (lane 1 this batch)`) && plan.includes(`${P('03-gamma')} waits — stops at LOOK for you — /spec:run it`), plan)
  const named = h.ok(P('02-beta'))
  assert.ok(named.includes('⏸️ nothing runnable — 1 named spec(s) wait') && named.includes('Next: nothing runnable — /spec:queue list') && !named.includes('drained'), named)
  assert.strictEqual(h.run('--bogus').status, 2)
  st.writeStatus(path.join(h.dir, P('01-alpha')), 'draft'); st.writeStatus(path.join(h.dir, P('02-beta')), 'draft')
  const none = h.ok()
  assert.match(none, /nothing runnable — 3 open item\(s\)/)
  assert.match(none, /^1 {2}q1 .*specs\/20261104\/01-alpha\.md/m, 'the queue rows, as /spec:queue list prints them')
  assert.ok(!none.includes('drained'))
  for (const e of [host({ queue: [], specs: [] }), host({ specs: [['01-alpha', 'src/a.js']], status: { '01-alpha': 'done' } })]) { // a done spec's item counts closed
    const out = e.ok(); assert.ok(out.includes('✅ queue drained') && out.includes('Next: nothing needs you — queue drained') && !out.includes('--mark') && !out.includes('nothing runnable'), out) }
  h.g('checkout', '-qb', 'side')
  assert.match(h.run().stderr, /not trunk main — run \/spec:fanout from the main checkout/)
})

test('AC-20261105-02-3 --pick asks a checkbox question; picked builds the batch from the ticked titles and obeys the rules; nothing else starts or drops a pick', () => {
  const h = host({ lanes: 4, deps: { '02-beta': [P('01-alpha')] } })
  const pick = h.ok('--pick')
  assert.match(pick, /\[ \] 01-alpha/); assert.ok(!/\[ \] 02-beta/.test(pick))
  assert.ok(pick.includes(`--pick --root ${h.dir} --mark picked --label`), pick) // the printed mark line keeps --pick
  // planned never auto-picks at the --pick question, and picked is not taken at the bare PLAN
  for (const a of [['--pick', '--mark', 'planned'], ['--mark', 'picked', '--label', '01-alpha']]) {
    const r = h.run(...a); assert.strictEqual(r.status, 2, a.join(' ') + r.stdout); assert.strictEqual(h.fan(), null, a.join(' '))
  }
  assert.ok(h.run('--pick', '--mark', 'picked', '--label', '02-beta').stderr.includes(`${P('02-beta')} is not runnable — depends on ${P('01-alpha')} (hardened, not done)`))
  h.ok('--pick', '--mark', 'picked', '--label', '01-alpha')
  const saved = h.fan()
  assert.deepStrictEqual(saved.batch.map((l) => l.spec), [P('01-alpha')])
  // a saved batch: a second selection refuses instead of a green checkpoint that drops it
  for (const a of [['--mark', 'picked', '--label', '03-gamma'], ['--mark', 'planned']]) {
    const r = h.run(...a); assert.strictEqual(r.status, 2, a.join(' ') + r.stdout); assert.ok(!r.stdout.includes('already applied'), r.stdout)
  }
  // --pick over a saved batch refuses, naming the batch and the per-lane remedy; nothing is resumed or removed
  const r = h.run('--pick')
  assert.strictEqual(r.status, 2, r.stdout)
  for (const s of [saved.started, 'lane 1 (spec-01-alpha)', `--mark dismissed --lane 1 --discard`, 'without --pick']) assert.ok(r.stderr.includes(s), s + '\n' + r.stderr)
  assert.deepStrictEqual(h.fan(), saved); assert.ok(fs.existsSync(h.wt('01-alpha')))
})

test('AC-20261105-07-8 AC-20261105-07-11 AC-20261105-07-12 AC-20261105-09-13 dismissed keeps the worktree, --discard removes it and its branch and names the wip commit; a lost state file with open lanes refuses', () => {
  const h = host()
  dispatch(h)
  pending.writePending(h.wt('02-beta'), { lane: '2', question: 'Which shape?', options: ['flat', 'nested'], kind: 'unmet' })
  assert.match(h.ok(), /lane 2 — spec-02-beta: dispatched · no run state yet \(question waiting — mark returned\)/)
  pending.consumePending(h.wt('02-beta'))
  h.ok('--mark', 'dismissed', '--lane', '1')
  assert.ok(fs.existsSync(h.wt('01-alpha')) && !pending.isLane(h.wt('01-alpha')))
  fs.writeFileSync(path.join(h.wt('02-beta'), 'w.txt'), 'w\n')
  const wip = (/discarded lane 2 — wip ([0-9a-f]{40})/.exec(h.ok('--mark', 'dismissed', '--lane', '2', '--discard')) || [])[1]
  assert.ok(wip && h.g('show', '--name-only', '--format=', wip).includes('w.txt'), 'the wip commit holds the uncommitted file')
  assert.ok(!fs.existsSync(h.wt('02-beta')) && !h.g('branch', '--list', 'spec/02-beta').trim())
  assert.strictEqual(h.step(), 'REPORT')
  st.writeStatus(path.join(h.dir, P('01-alpha')), 'superseded')
  const rep = h.ok()
  assert.ok(rep.includes('dismissed spec-01-alpha — worktree kept at .claude/worktrees/spec-01-alpha, spec left hardened in the lane (trunk: superseded)') && rep.includes(`dismissed spec-02-beta — worktree and branch removed (wip ${wip})`), rep)
  assert.match(h.ok('--mark', 'dismissed', '--lane', '1'), /already applied/, 'a mark whose effect is in the state is applied, exit 0')
  const f = host({ specs: [], queue: FIXQ({ payload: 'login is slow' }) }); dispatch(f)
  const fw = f.wt(st.slugOf('login is slow'), 'fix'); f.ok('--mark', 'dismissed', '--lane', '1', '--discard')
  assert.ok(!fs.existsSync(fw) && !fs.existsSync(path.join(f.dir, '.git/worktrees', path.basename(fw))) && !f.g('branch', '--list', 'fix/*').trim() && Q.open(Q.read(f.dir)).length === 1, 'a spec-less fix lane goes with its run state; its item stays pending')
  const l = host()
  dispatch(l)
  const common = path.join(l.dir, '.git'); fs.rmSync(path.join(common, 'spec-fanout.json'))
  assert.match(l.run().stderr, /lanes are open \(spec-01-alpha, spec-02-beta\) but .*spec-fanout\.json is missing — reconstruct it/)
  for (const n of ['2026-11-01', '2026-11-02']) { fs.mkdirSync(path.join(common, 'spec-v7-backup', n), { recursive: true }); fs.writeFileSync(path.join(common, 'spec-v7-backup', n, 'spec-fanout.json'), '{}') }
  assert.ok(l.run('--mark', 'planned').stderr.includes(`cp ${path.join(common, 'spec-v7-backup/2026-11-02/spec-fanout.json')} ${path.join(common, 'spec-fanout.json')}, then re-run`))
  assert.match(host().ok(), /^▶ PLAN/, 'no lane markers: it plans')
})

test('AC-20261105-02-1 AC-20261105-02-2 a spec waits for a dependency that is not done and says why; a missing or done one holds nothing; once it is done the next PLAN picks it', () => {
  const h = host({ lanes: 4, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js'], ['03-gamma', 'src/c.js'], ['04-delta', 'src/d.js'], ['05-eps', 'src/e.js'], ['06-zeta', 'src/f.js']],
    status: { '04-delta': 'draft', '05-eps': 'done' }, deps: { '02-beta': [P('01-alpha')], '03-gamma': [P('04-delta')], '06-zeta': [P('99-gone'), P('05-eps')] } })
  const plan = h.ok()
  for (const l of ['lane 1: ' + P('01-alpha'), 'lane 2: ' + P('06-zeta'), `${P('02-beta')} waits — depends on ${P('01-alpha')} (lane 1 this batch)`, `${P('03-gamma')} waits — depends on ${P('04-delta')} (draft — it cannot land in this fan-out)`]) assert.ok(plan.includes(l), l + '\n' + plan)
  const named = h.ok(P('02-beta'))
  assert.ok(named.includes(`${P('02-beta')} waits — depends on ${P('01-alpha')} (hardened, not done)`) && !named.includes('lane 1:'), named)
  st.writeStatus(path.join(h.dir, P('01-alpha')), 'done'); h.g('commit', '-qam', 'alpha done')
  assert.ok(h.ok().includes('lane 1: ' + P('02-beta')))
})

test('fanout holds a spec on the dependencies the status screen shows: a superseded one holds nothing, one named by file name holds it', () => {
  const two = [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js']]
  const h = host({ lanes: 2, specs: two, status: { '01-alpha': 'superseded' }, deps: { '02-beta': [P('01-alpha')] } })
  assert.ok(h.ok().includes('lane 1: ' + P('02-beta')), 'a retired spec never blocks')
  const byName = host({ lanes: 2, specs: two, status: { '01-alpha': 'draft' }, deps: { '02-beta': ['01-alpha.md'] } })
  const plan = byName.ok()
  assert.ok(!plan.includes('lane 1: ' + P('02-beta')) && plan.includes(`${P('02-beta')} waits — depends on ${P('01-alpha')} (draft — it cannot land in this fan-out)`), plan)
})

test('AC-20261105-07-2 AC-20261105-09-10 lanes go spec, bound fix, spec-less fix; a fix waits while its spec is in a lane or when it names no spec on disk', () => {
  const fix = (id, extra) => ({ id, kind: 'prompt', type: 'fix', added: 'x', ...extra })
  const h = host({ lanes: 4, specs: [['01-alpha', 'src/a.js'], ['02-beta', 'src/b.js']], status: { '02-beta': 'done' },
    queue: [fix('q1', { payload: 'login is slow' }), fix('q2', { spec: P('02-beta'), payload: 'RED file left' }), fix('q3', { spec: P('01-alpha'), payload: 'x' }), fix('q4', { spec: P('09-gone'), payload: 'y' }), { id: 'q5', kind: 'spec', payload: P('01-alpha'), added: 'x' }] })
  const plan = h.ok()
  for (const l of ['lane 1: ' + P('01-alpha'), `lane 2: ${P('02-beta')} — fix: RED file left`, 'lane 3: fix-' + st.slugOf('login is slow'), 'waits — its spec is in a lane', 'waits — fix item names no spec on disk']) assert.ok(plan.includes(l), l + '\n' + plan)
})

test('AC-20261105-07-9 AC-20261105-08-16 a returned mark refused by a dirty main checkout lands on the re-run, already applied; REPORT names a lane\'s reruns and slot waits and sums them', () => {
  const h = host({ lanes: 1, specs: [['01-alpha', 'src/a.js']] })
  dispatch(h); h.finish('01-alpha', 'src/a.js')
  const runFile = path.join(h.wt('01-alpha'), 'specs/20261104/01-alpha.run/state.json')
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8')); fs.writeFileSync(runFile, JSON.stringify({ ...run, gate: { ...run.gate, reruns: 1, lockWaitMs: 3000 } }))
  fs.appendFileSync(path.join(h.dir, '.gitignore'), '# dirty\n')
  const bad = h.run('--mark', 'returned', '--lane', '1')
  assert.ok(bad.status === 2 && bad.stderr.includes('uncommitted tracked changes'), bad.stderr)
  h.g('commit', '-qam', 'tidy')
  assert.match(h.ok('--mark', 'returned', '--lane', '1'), /mark returned was already applied/)
  assert.ok(fs.existsSync(path.join(h.dir, 'src/a.js')) && h.fan().batch[0].status === 'merged')
  const rep = h.ok()
  assert.ok(/- merged spec-01-alpha as [0-9a-f]{40}; queue item ticked \(1 rerun\(s\), 3s slot wait\)\n/.test(rep) && rep.includes('load: 1 rerun(s), 3s of slot waits across the batch'), rep)
})

// The fixture host: brief 03 (hardened 01-a1, 02-a2), brief 04 (Depends on 03; hardened 03-b1), brief 05 (no spec), ad-hoc hardened
// 04-adhoc, ad-hoc draft 05-adhoc-draft, ad-hoc hardened 06-blocked after that draft; no queue file.
const FIX16 = 'specs/20261104'
function bareHost() {
  const h = host({ specs: [], lanes: 4 })
  fs.rmSync(path.join(h.dir, '.git/spec-queue.json'), { force: true })
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(h.dir, rel)), { recursive: true }); fs.writeFileSync(path.join(h.dir, rel), text) }
  for (const [nn, name, deps] of [['03', 'alpha', '—'], ['04', 'beta', '03'], ['05', 'gamma', '—']]) w(`docs/roadmap/${nn}-${name}.md`, `# ${nn} — ${name}\n\nPhase: P1 · Depends on: ${deps} · Primary workspaces: app\n\n## Result\n\nx\n`)
  const spec = (stem, status, b, deps) => w(`${FIX16}/${stem}.md`, specText(stem, `src/${stem}.js`, { status, deps }).replace('architecture: false', `brief: ${b || 'n/a'}\narchitecture: false`))
  spec('01-a1', 'hardened', '03'); spec('02-a2', 'hardened', '03'); spec('03-b1', 'hardened', '04')
  spec('04-adhoc', 'hardened'); spec('05-adhoc-draft', 'draft'); spec('06-blocked', 'hardened', null, [`${FIX16}/05-adhoc-draft.md`])
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'fixture')
  return Object.assign(h, { w, qfile: path.join(h.dir, '.git/spec-queue.json') })
}

test('AC-20261105-16-5 bare fanout takes every startable spec in queue order, with the brief rules, and writes no queue file', () => {
  const h = bareHost()
  const check = (plan) => {
    assert.ok(plan.includes('📌 Auto-picked batch: 1 lane(s)') && plan.includes(`lane 1: ${FIX16}/01-a1.md`) && !plan.includes('lane 2:'), plan)
    for (const l of [`${FIX16}/02-a2.md waits — shared brief 03`, `${FIX16}/03-b1.md waits — brief 04 depends on 03`, `${FIX16}/04-adhoc.md waits — the batch stops before 03-b1`,
      `${FIX16}/06-blocked.md waits — depends on ${FIX16}/05-adhoc-draft.md (draft — it cannot land in this fan-out)`]) assert.ok(plan.includes('\n  ' + l + '\n'), l + '\n' + plan)
    assert.ok(/\nHeld \(.*05-adhoc-draft \(draft\)/.test(plan) && /brief 05 \(gamma\)/.test(plan), plan)
  }
  check(h.ok())
  assert.ok(!fs.existsSync(h.qfile), 'no queue file is written')
  runNode('scripts/queue.js', ['next', '--root', h.dir]); check(h.ok())
})

test('AC-20261105-16-6 an implementing sibling holds its spec and waits the rest of its brief; a plan prompt ahead ends nothing', () => {
  const h = bareHost()
  h.w(`${FIX16}/01-a1.run/state.json`, '{"step":"BUILD"}')
  const body = h.ok()
  assert.ok(body.includes('⏸️ nothing runnable — 6 open item(s)') && body.includes(`${FIX16}/02-a2.md waits — shared brief 03`) && /Held \(.*01-a1 \(implementing\)/.test(body) && !body.includes('Auto-picked'), body)
  fs.rmSync(path.join(h.dir, FIX16, '01-a1.run'), { recursive: true })
  assert.strictEqual(runNode('scripts/queue.js', ['add', 'x', '--type', 'plan', '--top', '--root', h.dir]).status, 0)
  const again = h.ok()
  assert.ok(again.includes(`lane 1: ${FIX16}/01-a1.md`) && /\n1 {2}q1 .*plan/.test(again), again)
})

test('AC-20261105-16-7 a brief item\'s unmet after gate holds its hardened specs, explicit paths and --pick obey the walk, an unknown status is held, nothing open is drained', () => {
  const h = bareHost()
  fs.writeFileSync(h.qfile, JSON.stringify({ version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-04', after: { brief: '05' } }] }))
  const gated = h.ok()
  for (const l of [`${FIX16}/01-a1.md waits — after brief 05 (unplanned)`, `${FIX16}/02-a2.md waits — after brief 05 (unplanned)`, `lane 1: ${FIX16}/03-b1.md`]) assert.ok(gated.includes(l), l + '\n' + gated)
  fs.rmSync(h.qfile)
  const explicit = h.ok(`${FIX16}/01-a1.md`, `${FIX16}/02-a2.md`)
  assert.ok(explicit.includes(`lane 1: ${FIX16}/01-a1.md`) && explicit.includes(`${FIX16}/02-a2.md waits — shared brief 03`), explicit)
  const pick = h.ok('--pick')
  assert.ok(pick.includes('01-a1') && !pick.includes('02-a2') && !pick.includes('03-b1') && !pick.includes('06-blocked'), pick)
  h.w(`${FIX16}/07-wip.md`, specText('07-wip', 'src/w.js', { status: 'wip' }))
  assert.match(h.ok(), /Held \(.*07-wip \(wip\)/)
  assert.ok(host({ specs: [] }).ok().includes('✅ queue drained — nothing queued'))
})

// spec 20261107/05: a lane landing a brief's last spec closes the brief as a batch line, or warns while a step is open.
function briefLaneHost(steps = '') {
  const h = host({ specs: [], lanes: 4 })
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(h.dir, rel)), { recursive: true }); fs.writeFileSync(path.join(h.dir, rel), text) }
  w('docs/roadmap/03-alpha.md', `# 03 — alpha\n\nPhase: P1 · Depends on: — · Primary workspaces: app\n\n## Result\n\nx\n${steps}`)
  w(`${FIX16}/01-a1.md`, specText('01-a1', 'src/a1.js').replace('architecture: false', 'brief: 03\narchitecture: false'))
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'fixture')
  Q.write(h.dir, { version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-07' }] })
  dispatch(h); h.finish('01-a1', 'src/a1.js'); h.ok('--mark', 'returned', '--lane', '1')
  assert.strictEqual(h.step(), 'REPORT')
  return h
}

test('AC-20261107-05-5 a lane landing the last spec of a stored brief ticks it and REPORT pins one auto-closed line with no lane prefix; an open step warns instead', () => {
  const h = briefLaneHost()
  const rep = h.ok()
  assert.ok(Q.read(h.dir).items.find((i) => i.id === 'q1').done, 'the brief item is ticked')
  assert.strictEqual(rep.split('auto-closed brief 03').length, 2, 'one pin: ' + rep)
  assert.ok(rep.includes('\n📌 auto-closed brief 03 (alpha) — its last spec merged and docs/roadmap/03-alpha.md lists no open step (veto anytime)\n'), rep)
  assert.ok(!/📌 lane \d+ \([^)]*\): auto-closed/.test(rep), rep)
  assert.ok(rep.includes('Next: nothing needs you — queue drained'), rep)
  const o = briefLaneHost('\n## Steps outside specs\n\n- [ ] load the data\n')
  const open = o.ok()
  assert.ok(!Q.read(o.dir).items.find((i) => i.id === 'q1').done && !open.includes('auto-closed'), open)
  assert.ok(open.includes('\n⚠️ brief 03 (alpha) has every spec done; 1 step(s) outside specs still open in docs/roadmap/03-alpha.md — tick them there, then /spec:queue done 03\n'), open)
  assert.ok(open.includes('Next: nothing runnable — 1 open item(s) need you: /spec:queue list'), open)
})
