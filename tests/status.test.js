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
  for (const e of ['✅', '🔶', '⬜', '⛔', '🗺️']) assert.ok(text.includes(e))
})

test('empty queue verdict; next ready verdict', () => {
  const d = tmpdir('status'); gitRepo(d)
  assert.match(JSON.parse(run(d).stdout).verdict, /^⚪/)
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
