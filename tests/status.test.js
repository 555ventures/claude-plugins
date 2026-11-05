'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const w = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const spec = (st, brief, files) => `---\nstatus: ${st}\nbrief: ${brief}\n---\n# S\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n${files.map((f) => `| ${f} | MODIFY | x |`).join('\n')}\n`
const run = (d, ...a) => runNode('scripts/status.js', [...a, '--root', d, '--json'])
const queue = (d, ...a) => runNode('scripts/queue.js', [...a, '--root', d])

test('roadmap states: done needs every spec done and the brief item closed; any spec means implementing', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/00-overview.md', '# Overview\n')
  for (const n of ['01-a', '02-b', '03-c', '04-d', '05-e']) w(d, `docs/roadmap/${n}.md`, `# ${n.slice(0, 2)} — T${n}\n` + (n === '04-d' ? '\n> Superseded by 01\n' : ''))
  w(d, 'specs/20261104/01-x.md', spec('done', '01', ['a.js']))
  w(d, 'specs/20261104/02-y.md', spec('done', '02', ['b.js']))
  w(d, 'specs/20261104/03-y2.md', spec('hardened', '02', ['b2.js'])) // one done + one hardened
  w(d, 'specs/20261104/04-v.md', spec('done', '05', ['e.js']))
  queue(d, 'add', 'docs/roadmap/05-e.md') // all specs done, but the brief is still being planned
  const r = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(r.roadmap.map((b) => b.state), ['done', 'implementing', 'open', 'superseded', 'implementing'])
  queue(d, 'done', '05')
  assert.strictEqual(JSON.parse(run(d).stdout).roadmap[4].state, 'done', 'closing the brief item by number completes it')
  queue(d, 'add', 'undefined') // a v7-migrated brief item with no number must not crash status
  assert.strictEqual(run(d).status, 0)
  const text = runNode('scripts/status.js', ['--root', d]).stdout
  for (const e of ['✅', '🔨', '⬜', '⛔', '🗺️']) assert.ok(text.includes(e))
})

test('empty queue verdict; next ready verdict', () => {
  const d = tmpdir('status'); gitRepo(d)
  assert.match(JSON.parse(run(d).stdout).verdict, /^⬜/)
  assert.ok(!runNode('scripts/status.js', ['--root', d]).stdout.includes('Roadmap'), 'no briefs → no roadmap header')
  queue(d, 'add', 'do a thing')
  const r = JSON.parse(run(d).stdout)
  assert.strictEqual(r.next, 'do a thing')
  assert.match(r.verdict, /^🟢/)
})

test('lanes: hardened queue specs in order, File Plan overlap regardless', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'specs/20261104/01-a.md', spec('hardened', 'n/a', ['x.js']))
  w(d, 'specs/20261104/02-b.md', spec('hardened', 'n/a', ['x.js', 'y.js']))
  w(d, 'specs/20261104/03-c.md', spec('hardened', 'n/a', ['z.js']))
  w(d, 'specs/20261104/04-d.md', spec('draft', 'n/a', ['w.js']))
  for (const n of ['01-a', '02-b', '03-c', '04-d']) queue(d, 'add', `specs/20261104/${n}.md`)
  const r = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(r.lanes, ['specs/20261104/01-a.md', 'specs/20261104/02-b.md', 'specs/20261104/03-c.md'], 'overlapping 02-b is a lane too; the draft is not')
  assert.match(runNode('scripts/status.js', ['--root', d]).stdout, /⚡ 3 parallel lanes ready[\s\S]*\/spec:run @specs\/20261104\/03-c\.md/)
})

test('pending questions in root and worktrees turn the verdict yellow', () => {
  const d = tmpdir('status'); gitRepo(d)
  queue(d, 'add', 'task')
  w(d, '.claude/worktrees/spec-1/.claude/pending-question.json', JSON.stringify({ lane: 'spec-1', question: 'which?', options: [], answer: null }))
  w(d, '.claude/pending-question.json', JSON.stringify({ lane: 'root', question: 'done?', options: [], answer: { label: 'x' } }))
  const r = JSON.parse(run(d).stdout)
  assert.strictEqual(r.questions.length, 1)
  assert.match(r.verdict, /^🟡/)
})

test('Next skips a brief that already has specs in progress, shows an unqueued run in flight, and names fanout', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/01-a.md', '# 01 — A\n')
  queue(d, 'add', 'docs/roadmap/01-a.md'); queue(d, 'add', 'do a thing')
  assert.strictEqual(JSON.parse(run(d).stdout).next, '/spec:plan docs/roadmap/01-a.md')
  w(d, 'specs/20261104/01-x.md', spec('draft', '01', ['a.js']))
  assert.strictEqual(JSON.parse(run(d).stdout).next, '/spec:plan specs/20261104/01-x.md', 'a brief mid-plan points at its draft')
  w(d, 'specs/20261104/01-x.md', spec('hardened', '01', ['a.js']))
  assert.strictEqual(JSON.parse(run(d).stdout).next, '/spec:queue add specs/20261104/01-x.md', 'a hardened spec nobody queued is the next step')
  queue(d, 'add', 'specs/20261104/01-x.md')
  assert.strictEqual(JSON.parse(run(d).stdout).next, 'do a thing', 'a planned brief is not offered for planning again; its spec waits its turn')
  w(d, 'specs/20261104/01-x.run/state.json', '{"step":"REVIEW"}')
  assert.strictEqual(JSON.parse(run(d).stdout).next, '/spec:run specs/20261104/01-x.md', 'a run started by hand comes first')
  fs.rmSync(path.join(d, 'specs/20261104/01-x.run'), { recursive: true })
  w(d, 'specs/20261104/02-y.md', spec('hardened', 'n/a', ['b.js']))
  queue(d, 'add', 'specs/20261104/01-x.md'); queue(d, 'add', 'specs/20261104/02-y.md')
  assert.match(runNode('scripts/status.js', ['--root', d]).stdout, /2 parallel lanes ready — \/spec:fanout/)
})

test('a live fan-out owns Next; a run whose spec already merged (stopped at CONFLICTS) still counts as in flight', () => {
  const d = tmpdir('status'); gitRepo(d)
  const st = require(path.join(require('./helpers').SPEC, 'scripts/lib/state.js'))
  w(d, 'specs/20261104/01-x.md', spec('done', 'n/a', ['a.js']))
  queue(d, 'add', 'specs/20261104/01-x.md')
  w(d, 'specs/20261104/01-x.run/state.json', JSON.stringify({ step: 'CONFLICTS', spec: 'specs/20261104/01-x.md' }))
  let r = JSON.parse(run(d).stdout)
  assert.strictEqual(r.next, '/spec:run specs/20261104/01-x.md', 'the sidecar, not the frontmatter, says it is in flight')
  assert.strictEqual(JSON.parse(runNode('scripts/queue.js', ['list', '--json', '--root', d]).stdout).items.length, 1, 'the queue item is not closed while the run is in flight')
  st.writeFanout(d, { step: 'WAIT', batch: [] })
  r = JSON.parse(run(d).stdout)
  assert.deepStrictEqual([r.next, r.lanes], ['/spec:fanout', []])
  assert.match(r.verdict, /fan-out is in flight/)
})

test('a run resting at CONFLICTS or ESCALATE is "waiting on you", and every run in flight is counted', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'specs/20261104/01-x.md', spec('implementing', 'n/a', ['a.js'])); w(d, 'specs/20261104/01-x.run/state.json', '{"step":"ESCALATE"}')
  w(d, 'specs/20261104/02-y.md', spec('implementing', 'n/a', ['b.js'])); w(d, 'specs/20261104/02-y.run/state.json', '{"step":"BUILD"}')
  const r = JSON.parse(run(d).stdout)
  assert.match(r.verdict, /🟡 a run is waiting on you \(2 runs\)/)
})

// ---- the dashboard (spec 20261105/01) ------------------------------------------------------

const SPEC_DIR = require('./helpers').SPEC
const GOLD = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'status', n), 'utf8')
const text = (d, ...a) => runNode('scripts/status.js', [...a, '--root', d])
const brief = (nn, title, phase, deps, extra = '') => `# ${nn} — ${title}\n\nPhase: ${phase} · Depends on: ${deps} · Primary workspaces: app\n\n## Result\n\nx\n${extra}`
const specD = (st, b, files, deps) => `---\nstatus: ${st}\nbrief: ${b}\n${deps ? `depends_on: [${deps.join(', ')}]\n` : ''}---\n# S\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n${files.map((f) => `| ${f} | MODIFY | x |`).join('\n')}\n`
const config = (d, cfg) => { w(d, '.claude/spec.config.json', JSON.stringify({ testCommand: 'true', ...cfg })); require(path.join(SPEC_DIR, 'scripts/init.js')).ensureGitignore(d) }

// Briefs 01..05 (Phase P0,P0,P0,P1,P1,P1 by file order 01,02,02a,03,04,05), specs in every state,
// a queue of two prompts and five specs, and exactly one hygiene finding (a stale sidecar).
function fixture() {
  const d = tmpdir('status'); gitRepo(d)
  config(d, { lanes: 3 })
  w(d, 'docs/roadmap/00-overview.md', '# Overview\n')
  w(d, 'docs/roadmap/01-foundation.md', brief('01', 'Foundation', 'P0', '—'))
  w(d, 'docs/roadmap/02-schema.md', brief('02', 'Schema', 'P0', '01'))
  w(d, 'docs/roadmap/02a-primitives.md', brief('02a', 'Primitives', 'P0', '02'))
  w(d, 'docs/roadmap/03-rounds.md', brief('03', 'Rounds', 'P1', '02a, 02'))
  w(d, 'docs/roadmap/04-boards.md', brief('04', 'Boards', 'P1', '03, 99'))
  w(d, 'docs/roadmap/05-old.md', brief('05', 'Old', 'P1', '—', '\n> Superseded by 04\n'))
  w(d, 'specs/20261101/01-foundation.md', specD('done', '01', ['a.js']))
  w(d, 'specs/20261101/02-schema.md', specD('done', '02', ['b.js']))
  w(d, 'specs/20261101/09-ghost.run/keep', '')
  fs.rmSync(path.join(d, 'specs/20261101/09-ghost.run/keep'))
  for (const n of ['01-prim-a', '02-prim-b', '03-prim-c']) w(d, `specs/20261102/${n}.md`, specD('done', '02a', ['p.js']))
  w(d, 'specs/20261102/04-prim-d.md', specD('hardened', '02a', ['src/shared.js', 'src/a.js']))
  w(d, 'specs/20261103/06-drafty.md', specD('draft', 'n/a', ['src/g.js']))
  w(d, 'specs/20261103/01-lane-b.md', specD('hardened', 'n/a', ['src/shared.js', 'src/b.js']))
  w(d, 'specs/20261103/02-lane-c.md', specD('hardened', 'n/a', ['src/c.js']))
  w(d, 'specs/20261103/03-capped.md', specD('hardened', 'n/a', ['src/d.js']))
  w(d, 'specs/20261103/04-unqueued.md', specD('hardened', 'n/a', ['src/e.js']))
  w(d, 'specs/20261103/05-gated.md', specD('hardened', 'n/a', ['src/f.js'], ['specs/20261103/02-lane-c.md']))
  queue(d, 'add', 'tighten the retry copy on the failed-send banner')
  queue(d, 'add', 'notifications: a removed or soft-deleted staff person has no ended suppression rule so the lookup returns a stale row and the digest still goes out')
  for (const s of ['20261102/04-prim-d', '20261103/01-lane-b', '20261103/02-lane-c', '20261103/03-capped', '20261103/05-gated']) queue(d, 'add', `specs/${s}.md`)
  return d
}

test('AC-20261105-01-1 the bare screen matches the golden render: collapsed ranges, phase column, bar, lanes, footer', () => {
  const d = fixture()
  const r = text(d)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout, GOLD('bare.txt'))
})

test('AC-20261105-01-5 AC-20261105-01-4 AC-20261105-01-6 --all adds after that, blocked and hygiene, and matches the golden render', () => {
  const d = fixture()
  w(d, 'marker.sh', 'touch ran.marker\n')
  config(d, { lanes: 3, testCommand: 'sh marker.sh' })
  const r = text(d, '--all')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout, GOLD('all.txt'))
  assert.ok(!fs.existsSync(path.join(d, 'ran.marker')), 'status never runs the host testCommand')
  assert.ok(!/blocked:|after that:|Hygiene/.test(text(d).stdout), 'the default screen has none of the --all sections')
})

test('AC-20261105-01-8 NN reports one brief\'s dependency readiness with an exit code', () => {
  const d = fixture()
  const met = text(d, '03'); assert.strictEqual(met.status, 0, met.stderr); assert.strictEqual(met.stdout, GOLD('brief-met.txt'))
  const unmet = text(d, '04'); assert.strictEqual(unmet.status, 1); assert.strictEqual(unmet.stdout, GOLD('brief-unmet.txt'))
  const none = text(d, '07'); assert.strictEqual(none.status, 2); assert.match(none.stderr, /docs\/roadmap/)
  assert.deepStrictEqual(JSON.parse(text(d, '03', '--json').stdout), { brief: '03', name: 'rounds', dependencies: [{ brief: '02a', status: 'implementing', met: true }, { brief: '02', status: 'done', met: true }], ready: true })
  const j = JSON.parse(text(d, '04', '--json').stdout)
  assert.deepStrictEqual([j.ready, j.dependencies.map((x) => [x.brief, x.status, x.met])], [false, [['03', 'open', false], ['99', 'missing', false]]])
  assert.strictEqual(text(d, '04', '--json').status, 1)
  const hardenedOnly = tmpdir('status'); gitRepo(hardenedOnly)
  w(hardenedOnly, 'docs/roadmap/02a-prim.md', brief('02a', 'Prim', 'P0', '—')); w(hardenedOnly, 'docs/roadmap/03-x.md', brief('03', 'X', 'P0', '02a'))
  w(hardenedOnly, 'specs/20261104/01-h.md', specD('hardened', '02a', ['a.js']))
  assert.match(text(hardenedOnly, '03').stdout, /^brief 03 \(x\): UNMET dependencies — 02a \(implementing\)$/m, 'a brief with only a hardened spec is built-not-yet')
  assert.match(text(d, '01').stdout, /^brief 01 \(foundation\): all zero dependencies met$/m)
})

test('AC-20261105-01-2 queued prompts print as qNN rows before any command, padded and cut to 100 columns', () => {
  const d = tmpdir('status'); gitRepo(d)
  const st = require(path.join(SPEC_DIR, 'scripts/lib/state.js'))
  const long = 'word '.repeat(40).trim()
  st.writeQueue(d, { version: 2, seq: 12, items: [{ id: 'q7', kind: 'prompt', payload: 'short\n  prompt  text', added: '2026-11-01T00:00:00Z' }, { id: 'q12', kind: 'prompt', payload: long, added: '2026-11-01T00:00:00Z' }] })
  w(d, 'specs/20261104/01-a.md', specD('hardened', 'n/a', ['a.js'])); queue(d, 'add', 'specs/20261104/01-a.md')
  const lines = text(d).stdout.split('\n')
  const i7 = lines.indexOf('q7   short prompt text')
  assert.ok(i7 > 0, lines.join('\n'))
  const l12 = lines[i7 + 1]
  assert.ok(l12.startsWith('q12  word word') && l12.endsWith('…') && [...l12].length === 100, l12)
  assert.ok(lines.indexOf('/spec:run @specs/20261104/01-a.md') > i7 + 1, 'prompts come before the command line')
  const j = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(j.prompts, [{ id: 'q7', payload: 'short\n  prompt  text' }, { id: 'q12', payload: long }])
})

test('AC-20261105-01-3 one unblocked hardened spec among other open work is solo; lane pairs that share a File Plan path get a risk line', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'specs/20261104/01-a.md', specD('hardened', 'n/a', ['x.js'])); w(d, 'specs/20261104/02-b.md', specD('draft', 'n/a', ['y.js']))
  queue(d, 'add', 'specs/20261104/01-a.md')
  assert.match(text(d).stdout, /\/spec:run @specs\/20261104\/01-a\.md\n   └─ 🚦 solo\n/)
  fs.rmSync(path.join(d, 'specs/20261104/02-b.md')); queue(d, 'done', '01-a.md')
  queue(d, 'add', 'specs/20261104/01-a.md')
  assert.ok(!/solo/.test(text(d).stdout), 'nothing else open → no solo line')
  // three lanes, two overlapping pairs: one line per pair, the last one closes the branch
  for (const [n, f] of [['02-b', ['x.js', 'q.js', 'r.js']], ['03-c', ['x.js', 'z.js', 'q.js']]]) { w(d, `specs/20261104/${n}.md`, specD('hardened', 'n/a', f)); queue(d, 'add', `specs/20261104/${n}.md`) }
  const out = text(d).stdout
  assert.match(out, /⚡ 3 parallel lanes ready — \/spec:fanout\n\/spec:run @specs\/20261104\/01-a\.md\n\/spec:run @specs\/20261104\/02-b\.md\n\/spec:run @specs\/20261104\/03-c\.md\n/)
  assert.match(out, /   ├─ 🔶 01-a\.md × 02-b\.md: merge-conflict risk: x\.js\n   ├─ 🔶 01-a\.md × 03-c\.md: merge-conflict risk: x\.js\n   └─ 🔶 02-b\.md × 03-c\.md: merge-conflict risk: x\.js, q\.js\n/)
  w(d, 'specs/20261104/02-b.md', specD('hardened', 'n/a', ['x.js', 'q.js', 'r.js', 's.js'])); w(d, 'specs/20261104/03-c.md', specD('hardened', 'n/a', ['x.js', 'q.js', 'r.js', 's.js']))
  assert.match(text(d).stdout, /02-b\.md × 03-c\.md: merge-conflict risk: x\.js, q\.js \(\+2 more\)/)
})

test('AC-20261105-01-4 a spec whose depends_on is not done is no lane and no top pick; --all lists it as blocked', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'specs/20261104/01-base.md', specD('hardened', 'n/a', ['a.js'])); w(d, 'specs/20261104/02-top.md', specD('hardened', 'n/a', ['b.js'], ['01-base']))
  w(d, 'specs/20261104/03-by-path.md', specD('hardened', 'n/a', ['c.js'], ['specs/20261104/01-base.md']))
  queue(d, 'add', 'specs/20261104/02-top.md'); queue(d, 'add', 'specs/20261104/03-by-path.md'); queue(d, 'add', 'specs/20261104/01-base.md')
  const j = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(j.lanes, ['specs/20261104/01-base.md'])
  assert.strictEqual(j.top.path, 'specs/20261104/01-base.md')
  assert.deepStrictEqual(j.blocked.map((b) => [b.path, b.blockers]), [['specs/20261104/02-top.md', ['specs/20261104/01-base.md']], ['specs/20261104/03-by-path.md', ['specs/20261104/01-base.md']]])
  assert.ok(!/blocked:|⏳/.test(text(d).stdout))
  assert.match(text(d, '--all').stdout, /⛔ blocked:\n\/spec:run @specs\/20261104\/02-top\.md\n   └─ ⏳ 01-base\n\/spec:run @specs\/20261104\/03-by-path\.md\n   └─ ⏳ 01-base\n/)
  w(d, 'specs/20261104/01-base.md', specD('done', 'n/a', ['a.js']))
  const j2 = JSON.parse(run(d).stdout)
  assert.deepStrictEqual([j2.top.path, j2.blocked], ['specs/20261104/02-top.md', []], 'a done dependency unblocks')
})

test('a draft spec inherits its brief\'s unbuilt dependency briefs as blockers', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/01-a.md', brief('01', 'A', 'P0', '—')); w(d, 'docs/roadmap/02-b.md', brief('02', 'B', 'P0', '01'))
  w(d, 'specs/20261104/01-x.md', specD('draft', '02', ['a.js']))
  const j = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(j.blocked.map((b) => b.blockers), [['brief 01 (open)']])
  assert.match(text(d, '--all').stdout, /⛔ blocked:[\s\S]*\/spec:plan @specs\/20261104\/01-x\.md\n   └─ ⏳ brief 01\n/)
  assert.strictEqual(j.top.action, '/spec:plan', 'the unplanned brief with all dependencies met is the top pick')
  assert.strictEqual(j.top.path, 'docs/roadmap/01-a.md')
  assert.match(text(d).stdout, /\n\/spec:plan @docs\/roadmap\/01-a\.md\n/)
})

test('AC-20261105-01-7 the footer: more open, hygiene count, nothing else open, nothing waits; verdict is the footer line', () => {
  const d = tmpdir('status'); gitRepo(d); config(d, {})
  w(d, 'specs/20261104/01-a.md', specD('hardened', 'n/a', ['a.js'])); queue(d, 'add', 'specs/20261104/01-a.md')
  assert.match(text(d).stdout, /\n🟢 next is ready · nothing else open\n```\n$/)
  for (const p of ['p1', 'p2', 'p3', 'p4', 'p5']) queue(d, 'add', `prompt ${p}`)
  w(d, 'specs/20261104/09-x.run/k', ''); fs.rmSync(path.join(d, 'specs/20261104/09-x.run/k')); w(d, 'specs/20261104/08-y.run/k', ''); fs.rmSync(path.join(d, 'specs/20261104/08-y.run/k'))
  const j = JSON.parse(run(d).stdout)
  assert.strictEqual(j.verdict, '🟢 next is ready · 5 more open · 2 hygiene findings (/spec:doctor)')
  assert.strictEqual(j.hygiene.length, 2); assert.strictEqual(j.open, 6)
  assert.ok(text(d).stdout.endsWith(`${j.verdict}\n\`\`\`\n`))
  const e = tmpdir('status'); gitRepo(e); config(e, {})
  assert.strictEqual(JSON.parse(run(e).stdout).verdict, '⬜ nothing waits')
})

test('AC-20261105-01-9 --json keeps every key and adds the dashboard keys', () => {
  const d = fixture()
  const j = JSON.parse(run(d).stdout)
  for (const k of ['roadmap', 'next', 'lanes', 'questions', 'verdict', 'prompts', 'top', 'after', 'blocked', 'hygiene', 'open']) assert.ok(k in j, k)
  assert.ok(j.roadmap.every((b) => ['done', 'implementing', 'open', 'superseded'].includes(b.state)))
  assert.deepStrictEqual(j.roadmap.map((b) => [b.brief, b.phase, b.done, b.total, b.name]), [['01', 'P0', 1, 1, 'foundation'], ['02', 'P0', 1, 1, 'schema'], ['02a', 'P0', 3, 4, 'primitives'], ['03', 'P1', 0, 0, 'rounds'], ['04', 'P1', 0, 0, 'boards'], ['05', 'P1', 0, 0, 'old']])
  assert.deepStrictEqual(j.top, { action: '/spec:run', path: 'specs/20261102/04-prim-d.md', blockers: [] })
  assert.deepStrictEqual(j.after.map((x) => [x.action, x.path, x.reason]), [
    ['/spec:run', 'specs/20261103/03-capped.md', '🤷 beyond the lane cap (3)'],
    ['/spec:run', 'specs/20261103/04-unqueued.md', '🤷 not queued — /spec:queue add specs/20261103/04-unqueued.md'],
    ['/spec:plan', 'specs/20261103/06-drafty.md', '🤷 draft — /spec:plan first']])
  assert.deepStrictEqual(j.blocked, [{ action: '/spec:run', path: 'specs/20261103/05-gated.md', blockers: ['specs/20261103/02-lane-c.md'] }])
  assert.strictEqual(j.open, 9)
  assert.strictEqual(j.hygiene.length, 1)
  assert.strictEqual(j.next, 'tighten the retry copy on the failed-send banner', 'next keeps its v8 derivation: the queue head')
})

test('briefs sort by number then letter suffix: 11 before 11a, 02a after 02', () => {
  const d = tmpdir('status'); gitRepo(d)
  for (const n of ['11a-x', '11-y', '3-z', '02a-w', '02-v', '10-u']) w(d, `docs/roadmap/${n}.md`, `# ${n}\n`)
  assert.deepStrictEqual(JSON.parse(run(d).stdout).roadmap.map((b) => b.brief), ['02', '02a', '3', '10', '11', '11a'])
})

test('AC-20261105-01-11 a fan-out in flight owns the only command line; a run in flight is the top pick with no lanes header', () => {
  const d = tmpdir('status'); gitRepo(d)
  const st = require(path.join(SPEC_DIR, 'scripts/lib/state.js'))
  for (const n of ['01-a', '02-b']) { w(d, `specs/20261104/${n}.md`, specD('hardened', 'n/a', [n + '.js'])); queue(d, 'add', `specs/20261104/${n}.md`) }
  queue(d, 'add', 'a prompt row')
  w(d, 'specs/20261104/02-b.run/state.json', '{"step":"BUILD"}')
  let out = text(d).stdout
  assert.match(out, /\nq3  a prompt row\n\/spec:run @specs\/20261104\/02-b\.md\n/)
  assert.ok(!/⚡|solo/.test(out), out)
  assert.strictEqual(JSON.parse(run(d).stdout).top.path, 'specs/20261104/02-b.md')
  fs.rmSync(path.join(d, 'specs/20261104/02-b.run'), { recursive: true })
  st.writeFanout(d, { step: 'WAIT', batch: [] })
  out = text(d).stdout
  assert.match(out, /🎯 Next\nq3  a prompt row\n\/spec:fanout\n/)
  assert.ok(!/\/spec:run|⚡/.test(out.split('🎯 Next')[1]), 'fanout is the only command line')
  assert.match(out, /\n🟢 a fan-out is in flight · \/spec:fanout · 3 more open/)
})

test('AC-20261105-01-10 drivers and plan lock treat @specs/x.md as specs/x.md', () => {
  const dir = tmpdir('drv'); const file = path.join(dir, 'echo.js')
  fs.writeFileSync(file, `'use strict'
const { makeDriver } = require(${JSON.stringify(path.join(SPEC_DIR, 'scripts/lib/driver.js'))})
process.exitCode = makeDriver({ name: 'echo', specArg: 'spec', load: (ctx) => ({ arg: ctx.arg }), save: () => {}, derive: (s) => ({ name: 'arg=' + s.arg }) })()
`)
  assert.strictEqual(runNode(file, ['@specs/x.md', '--root', dir, '--state']).stdout, 'arg=specs/x.md\n')
  assert.strictEqual(runNode(file, ['specs/x.md', '--root', dir, '--state']).stdout, 'arg=specs/x.md\n')
  const d = tmpdir('plan'); gitRepo(d)
  const f = runNode('scripts/plan.js', ['new', 'first', '--root', d]).stdout.trim()
  const p = path.join(d, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/no \| yes — <what>, needs your yes/, 'no').replace(/<[^<>\n]+>/g, 'x'))
  const r = runNode('scripts/plan.js', ['lock', '@' + f, '--root', d])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /spec hardened & locked — specs\/\d{8}\/01-first\.md/)
})

test('AC-20261105-01-5 an unblocked spec that shares a brief with, or whose brief depends on, an admitted lane waits for it', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/01-a.md', brief('01', 'A', 'P0', '—')); w(d, 'docs/roadmap/02-b.md', brief('02', 'B', 'P0', '01'))
  w(d, 'specs/20261104/01-x.md', specD('hardened', '01', ['a.js'])); w(d, 'specs/20261104/02-y.md', specD('draft', '01', ['b.js'])); w(d, 'specs/20261104/03-z.md', specD('hardened', '02', ['c.js']))
  queue(d, 'add', 'specs/20261104/01-x.md')
  assert.match(text(d, '--all').stdout, /🕓 after that:\n\/spec:run @specs\/20261104\/03-z\.md\n   └─ ⛓️ brief 02 depends on 01\n\/spec:plan @specs\/20261104\/02-y\.md\n   └─ ⛓️ shared brief 01\n/)
  w(d, 'specs/20261104/04-w.md', specD('draft', '01', ['d.js']))
  assert.match(text(d, '--all').stdout, /\/spec:plan @specs\/20261104\/02-y\.md\n\/spec:plan @specs\/20261104\/04-w\.md\n   └─ ⛓️ shared brief 01\n/, 'consecutive equal reasons print one branch')
})

test('unqueued hardened specs: the count and every /spec:queue add line are printed, in path order; the first stays the Next paste', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'specs/20261104/03-c.md', spec('hardened', 'n/a', ['c.js']))
  w(d, 'specs/20261104/01-a.md', spec('hardened', 'n/a', ['a.js']))
  w(d, 'specs/20261105/01-d.md', spec('hardened', 'n/a', ['d.js']))
  w(d, 'specs/20261104/02-b.md', spec('draft', 'n/a', ['b.js']))
  const r = JSON.parse(run(d).stdout)
  assert.strictEqual(r.next, '/spec:queue add specs/20261104/01-a.md')
  assert.deepStrictEqual(r.unqueued, ['specs/20261104/01-a.md', 'specs/20261104/03-c.md', 'specs/20261105/01-d.md'])
  const out = text(d).stdout
  assert.match(out, /3 hardened specs are not queued/, out)
  for (const p of r.unqueued) assert.ok(out.includes('/spec:queue add ' + p), p)
  assert.ok(out.indexOf('/spec:queue add specs/20261104/03-c.md') < out.indexOf('/spec:queue add specs/20261105/01-d.md'), 'path order')
  queue(d, 'add', 'specs/20261104/01-a.md')
  const r2 = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(r2.unqueued, ['specs/20261104/03-c.md', 'specs/20261105/01-d.md'], 'a queued spec leaves the list')
  assert.match(text(d).stdout, /2 hardened specs are not queued/)
  queue(d, 'add', 'specs/20261104/03-c.md')
  assert.ok(!/hardened specs are not queued/.test(text(d).stdout), 'a single unqueued spec is left to the Next paste and --all')
})

test('the dashboard redraws from the top on a terminal only, as v7 did: a TTY run starts with the reset, piped, --json and NN runs never carry it', () => {
  const { execFileSync } = require('child_process')
  const { SPEC } = require('./helpers')
  const d = tmpdir('status-tty'); gitRepo(d)
  w(d, 'docs/roadmap/01-a.md', '# 01 — A\n')
  // `script` (util-linux) gives the child a real pseudo-terminal; a missing binary fails here loudly.
  const tty = (...a) => execFileSync('script', ['-qec', [process.execPath, path.join(SPEC, 'scripts/status.js'), ...a, '--root', d].map((s) => `'${s}'`).join(' '), '/dev/null'], { encoding: 'utf8' })
  assert.ok(tty().startsWith('\x1Bc'), 'a terminal run clears the screen before the dashboard')
  assert.ok(!tty('--json').includes('\x1Bc'), '--json never clears')
  assert.ok(!tty('01').includes('\x1Bc'), 'the NN line never clears')
  assert.ok(!runNode('scripts/status.js', ['--root', d]).stdout.includes('\x1Bc'), 'piped output stays escape-free')
})
