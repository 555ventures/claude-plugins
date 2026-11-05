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

test('roadmap states: done, implementing (from a run sidecar or lane worktree), open, superseded', () => {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/00-overview.md', '# Overview\n')
  for (const n of ['01-a', '02-b', '03-c', '04-d', '05-e']) w(d, `docs/roadmap/${n}.md`, `# ${n.slice(0, 2)} — T${n}\n` + (n === '04-d' ? '\n> Superseded by 01\n' : ''))
  w(d, 'specs/20261104/01-x.md', spec('done', '01', ['a.js']))
  w(d, 'specs/20261104/02-y.md', spec('hardened', '02', ['b.js']))
  w(d, 'specs/20261104/02-y.run/state.json', '{"step":"BUILD"}')
  w(d, 'specs/20261104/03-z.md', spec('implementing', '03', ['c.js'])) // stale frontmatter, nothing in flight
  w(d, 'specs/20261104/05-v.md', spec('hardened', '05', ['e.js']))
  fs.mkdirSync(path.join(d, '.claude/worktrees/spec-05-v'), { recursive: true })
  const r = JSON.parse(run(d).stdout)
  assert.deepStrictEqual(r.roadmap.map((b) => b.state), ['done', 'implementing', 'open', 'superseded', 'implementing'])
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
