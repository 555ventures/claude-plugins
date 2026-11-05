'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode } = require('./helpers')

function repo() {
  const d = tmpdir('queue'); gitRepo(d)
  fs.mkdirSync(path.join(d, 'specs/20261104'), { recursive: true })
  fs.mkdirSync(path.join(d, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs/roadmap/07-auth.md'), '# 07 — Auth\n')
  fs.writeFileSync(path.join(d, 'specs/20261104/01-a.md'), '---\nstatus: hardened\n---\n# A\n')
  fs.writeFileSync(path.join(d, 'specs/20261104/02-b.md'), '---\nstatus: draft\n---\n# B\n')
  return d
}
const q = (d, ...a) => runNode('scripts/queue.js', [...a, '--root', d])

test('add classifies kinds, next prints paste lines', () => {
  const d = repo()
  for (const p of ['specs/20261104/02-b.md', '07', 'fix the login bug']) assert.strictEqual(q(d, 'add', p).status, 0)
  const items = JSON.parse(q(d, 'list', '--json').stdout).items
  assert.deepStrictEqual(items.map((i) => i.kind), ['spec', 'brief', 'prompt'])
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan specs/20261104/02-b.md')
  q(d, 'done', '1')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan docs/roadmap/07-auth.md')
  q(d, 'done', '07')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan fix the login bug')
})

test('hardened spec pastes /spec:run; empty queue is not an error', () => {
  const d = repo()
  assert.strictEqual(q(d).status, 0)
  q(d, 'add', 'specs/20261104/01-a.md')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:run specs/20261104/01-a.md')
})

test('duplicate payload refused with exit 2', () => {
  const d = repo()
  q(d, 'add', 'same thing')
  const r = q(d, 'add', 'same thing')
  assert.strictEqual(r.status, 2)
  assert.strictEqual(JSON.parse(q(d, 'list', '--json').stdout).items.length, 1)
})

test('add --top, move, list footer', () => {
  const d = repo()
  for (const p of ['one', 'two', 'three']) q(d, 'add', p)
  q(d, 'add', 'top', '--top')
  const order = () => JSON.parse(q(d, 'list', '--json').stdout).items.map((i) => i.payload)
  assert.deepStrictEqual(order(), ['top', 'one', 'two', 'three'])
  q(d, 'move', 'three', '1')
  assert.deepStrictEqual(order(), ['three', 'top', 'one', 'two'])
  q(d, 'done', 'two')
  const out = q(d, 'list').stdout
  assert.match(out, /^1 {2}q\d+ {2}\d+m {2}three$/m)
  assert.match(out, /— 1 done$/m)
})

test('refs: id, position, basename, substring; ambiguous or unknown fails', () => {
  const d = repo()
  q(d, 'add', 'specs/20261104/02-b.md'); q(d, 'add', 'alpha task'); q(d, 'add', 'alpha other')
  const show = (r) => q(d, 'show', r)
  assert.strictEqual(show('q2').stdout.trim(), 'alpha task')
  assert.strictEqual(show('2').stdout.trim(), 'alpha task')
  assert.strictEqual(show('02-b.md').stdout.trim(), 'specs/20261104/02-b.md')
  assert.strictEqual(show('specs/20261104/02-b.md').status, 0)
  assert.strictEqual(show('task').stdout.trim(), 'alpha task')
  assert.strictEqual(show('alpha').status, 1)
  assert.strictEqual(show('nope').status, 1)
})

test('a spec item whose spec is done counts as done, and the next write records it', () => {
  const d = repo()
  q(d, 'add', 'specs/20261104/01-a.md'); q(d, 'add', 'later')
  const f = path.join(d, 'specs/20261104/01-a.md')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('hardened', 'done'))
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan later')
  q(d, 'add', 'more')
  const stored = JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8')).items
  assert.ok(stored.find((i) => i.payload === 'specs/20261104/01-a.md').done, 'the done timestamp is written back')
})

test('add stores @-prefixed, ./ and absolute spec paths root-relative, as a spec item', () => {
  const dir = tmpdir('q-norm')
  gitRepo(dir)
  const f = 'specs/20261104/01-x.md'
  fs.mkdirSync(path.join(dir, 'specs/20261104'), { recursive: true })
  fs.writeFileSync(path.join(dir, f), '---\nstatus: hardened\n---\n# X\n')
  const add = (p) => runNode('scripts/queue.js', ['add', p, '--root', dir])
  const r = add('@' + f)
  assert.strictEqual(r.status, 0, r.stderr)
  const item = require('../spec/scripts/lib/state').readQueue(dir).items[0]
  assert.deepStrictEqual([item.kind, item.payload], ['spec', f])
  assert.strictEqual(add('./' + f).status, 2, './ form is the same spec: a duplicate')
  assert.strictEqual(add(path.join(dir, f)).status, 2, 'the absolute form is the same spec: a duplicate')
})

test('list ages accept an epoch-number added and the next write stores ISO', () => {
  const d = repo()
  q(d, 'add', 'a thing')
  const S = require('../spec/scripts/lib/state')
  const doc = S.readQueue(d)
  doc.items[0].added = Date.now() - 2 * 3600e3
  S.writeQueue(d, doc)
  assert.match(q(d, 'list').stdout, /^1 {2}q1 {2}2h {2}a thing$/m)
  q(d, 'add', 'another')
  assert.match(S.readQueue(d).items[0].added, /^\d{4}-\d\d-\d\dT/)
})

test('a brief number names the brief item, not the row; 1 and 01 are the same brief', () => {
  const d = repo()
  fs.writeFileSync(path.join(d, 'docs/roadmap/01-x.md'), '# 01 — X\n'); fs.writeFileSync(path.join(d, 'docs/roadmap/02-y.md'), '# 02 — Y\n')
  for (const p of ['docs/roadmap/01-x.md', 'docs/roadmap/02-y.md', '7', 'specs/20261104/01-a.md']) q(d, 'add', p)
  q(d, 'done', '01')
  assert.match(q(d, 'done', '02').stdout, /docs\/roadmap\/02-y\.md/, 'done 02 closes brief 02, not the 2nd row')
  assert.match(q(d, 'done', '07').stdout, /done q3: 7/, 'padding does not matter')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:run specs/20261104/01-a.md', 'the spec was never touched')
  const r = q(d, 'done', '03'); assert.strictEqual(r.status, 0); assert.match(r.stdout, /nothing queued for brief 03/, 'an unqueued brief number is never row 3, and not an error either')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:run specs/20261104/01-a.md', 'row 3 is untouched')
})

test('a bare number that names a roadmap brief is that brief even unqueued and unpadded, never a row', () => {
  const d = repo()
  fs.writeFileSync(path.join(d, 'docs/roadmap/12-twelve.md'), '# 12 — Twelve\n')
  for (let i = 0; i < 12; i++) q(d, 'add', `task ${i}`)
  const r = q(d, 'done', '12')
  assert.strictEqual(r.status, 0); assert.match(r.stdout, /nothing queued for brief 12/)
  assert.strictEqual(JSON.parse(q(d, 'list', '--json').stdout).items.length, 12, 'row 12 was not closed')
  assert.strictEqual(q(d, 'show', '3').stdout.trim(), 'task 2', 'a number that is no brief is still a row')
})

test('a v7 brief item with `brief` and no payload lists as the brief number, not undefined', () => {
  const { reconcile } = require('../spec/scripts/queue')
  const q = reconcile(process.cwd(), { version: 2, seq: 1, items: [{ id: 'q1', kind: 'brief', brief: '33' }] })
  assert.strictEqual(q.items[0].payload, '33')
  assert.strictEqual(q.items[0].brief, undefined)
})

// ---- spec 20261105/04: items carry type and gate ----------------------------------------------
const items = (d) => JSON.parse(q(d, 'list', '--json').stdout).items
const w = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const sp = (status, brief) => `---\nstatus: ${status}\n${brief ? `brief: ${brief}\n` : ''}---\n# S\n`

test('AC-20261105-04-1 a prose item stores type plan and pastes /spec:plan; a command payload keeps its type verbatim; decide and prototype paste their own lines', () => {
  const d = repo()
  q(d, 'add', 'fix the login bug')
  assert.strictEqual(items(d)[0].type, 'plan')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan fix the login bug')
  q(d, 'done', '1')
  q(d, 'add', '/spec:fix specs/x.md — gate red')
  assert.strictEqual(items(d)[0].type, 'fix')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:fix specs/x.md — gate red')
  q(d, 'done', '1')
  q(d, 'add', 'pick a database', '--type', 'decide')
  assert.strictEqual(q(d, 'next').stdout.trim(), '📌 decide: pick a database')
  q(d, 'done', '1')
  q(d, 'add', 'a rough idea', '--type', 'prototype')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:prototype a rough idea')
  assert.strictEqual(JSON.parse(q(d, 'next', '--json').stdout).paste, '/spec:prototype a rough idea')
})

test('AC-20261105-04-2 --type on a spec or brief item, or outside the four, exits 2 and stores nothing; a type-less prompt pastes verbatim', () => {
  const d = repo()
  for (const args of [['specs/20261104/01-a.md', '--type', 'plan'], ['07', '--type', 'plan'], ['x', '--type', 'other']]) {
    const r = q(d, 'add', ...args)
    assert.strictEqual(r.status, 2)
    assert.ok(r.stderr.includes('--type takes plan, prototype, fix or decide, on a prompt item'), r.stderr)
  }
  assert.strictEqual(items(d).length, 0)
  const f = path.join(d, '.git/spec-queue.json')
  fs.writeFileSync(f, JSON.stringify({ version: 2, seq: 1, items: [{ id: 'q1', kind: 'prompt', payload: 'migrated words', added: '2026-11-01T00:00:00.000Z' }] }))
  assert.strictEqual(q(d, 'next').stdout.trim(), 'migrated words')
})

test('AC-20261105-04-3 --after stores a normalised brief or a root-relative spec, and refuses a target with no file naming it as typed', () => {
  const d = repo()
  w(d, 'docs/roadmap/03-rounds.md', '# 03\n'); w(d, 'docs/roadmap/04B-boards.md', '# 04b\n'); w(d, 'specs/20261104/01-a.md', sp('hardened'))
  q(d, 'add', 'x', '--after', '3')
  q(d, 'add', 'y', '--after', 'docs/roadmap/04B-boards.md')
  q(d, 'add', 'z', '--after', '@specs/20261104/01-a.md')
  assert.deepStrictEqual(items(d).map((i) => i.after), [{ brief: '03' }, { brief: '04b' }, { spec: 'specs/20261104/01-a.md' }])
  for (const t of ['9', 'specs/nope.md', 'whatever']) {
    const r = q(d, 'add', 'w' + t, '--after', t)
    assert.strictEqual(r.status, 2)
    assert.ok(r.stderr.includes(`--after target not found: ${t}`), r.stderr)
  }
  assert.strictEqual(items(d).length, 3)
  q(d, 'add', 'specs/20261104/01-a.md', '--after', '3') // accepted on every kind
  assert.deepStrictEqual(items(d)[3].after, { brief: '03' })
})

test('AC-20261105-04-4 next skips a gated head, list marks it, an all-gated queue says so, and the gate opens when the brief is done', () => {
  const d = repo()
  w(d, 'docs/roadmap/03-rounds.md', '# 03\n'); w(d, 'specs/20261102/08-server-timeouts.md', sp('hardened'))
  q(d, 'add', 'gated', '--after', '3'); q(d, 'add', 'free')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan free')
  assert.match(q(d, 'list').stdout, /^1 {2}q1 {2}\d+m {2}gated {2}⏳ after brief 03$/m)
  q(d, 'done', 'free')
  const none = q(d, 'next')
  assert.strictEqual(none.status, 0)
  assert.strictEqual(none.stdout.trim(), 'nothing ready — 1 waiting on after gates or finished briefs')
  assert.deepStrictEqual(JSON.parse(q(d, 'next', '--json').stdout), { empty: false, waiting: 1 })
  q(d, 'add', 'by spec', '--after', 'specs/20261102/08-server-timeouts.md')
  assert.match(q(d, 'list').stdout, /by spec {2}⏳ after 08-server-timeouts$/m)
  w(d, 'specs/20261104/03-a.md', sp('done', '03')); w(d, 'specs/20261104/03-b.md', sp('hardened', '03'))
  assert.strictEqual(q(d, 'next').stdout.trim(), 'nothing ready — 2 waiting on after gates or finished briefs', 'a hardened live spec keeps brief 03 open')
  w(d, 'specs/20261104/03-b.md', sp('done', '03'))
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan gated')
  assert.strictEqual(items(d)[0].after.brief, '03', 'list --json carries after as stored')
})

test('AC-20261105-04-5 a superseded spec meets a spec gate; a path with no file never does', () => {
  const d = repo()
  w(d, 'specs/20261104/09-old.md', sp('superseded'))
  q(d, 'add', 'after old', '--after', 'specs/20261104/09-old.md')
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan after old')
  const f = path.join(d, '.git/spec-queue.json')
  const s = JSON.parse(fs.readFileSync(f, 'utf8'))
  s.items.push({ id: 'q9', kind: 'prompt', payload: 'ghost gate', added: '2026-11-01T00:00:00.000Z', type: 'plan', after: { spec: 'specs/20261104/missing.md' } })
  s.items[0].done = 'x'
  fs.writeFileSync(f, JSON.stringify(s))
  assert.match(q(d, 'next').stdout, /nothing ready — 1 waiting/)
  s.items[1].after = { brief: '77' }
  fs.writeFileSync(f, JSON.stringify(s))
  assert.match(q(d, 'list').stdout, /ghost gate {2}⏳ after brief 77/)
})

test('AC-20261105-04-6 AC-20261105-10-15 a brief item is never ticked by the driver (it stays pending); a spec item ticks only with no live sidecar', () => {
  const d = repo()
  w(d, 'docs/roadmap/03-rounds.md', '# 03\n'); w(d, 'docs/roadmap/04-boards.md', '# 04\n')
  w(d, 'specs/20261104/03-a.md', sp('done', '03')); w(d, 'specs/20261104/03-b.md', sp('superseded', '03'))
  w(d, 'specs/20261104/04-a.md', sp('done', '04')); w(d, 'specs/20261104/04-b.md', sp('hardened', '04'))
  q(d, 'add', '03'); q(d, 'add', '04')
  const l = JSON.parse(q(d, 'list', '--json').stdout)
  assert.deepStrictEqual(l.items.map((i) => i.payload), ['03', '04'], 'brief 03 has every spec done and its item stays pending')
  q(d, 'add', 'poke')
  assert.ok(!JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8')).items.find((i) => i.payload === '03').done, 'no done timestamp is written on the next write either')
  w(d, 'specs/20261104/01-a.md', sp('done'))
  q(d, 'add', 'specs/20261104/01-a.md')
  const wtRun = path.join(d, '.claude/worktrees/spec-01-a/specs/20261104/01-a.run/state.json')
  w(d, path.relative(d, wtRun), '{"step":"GATE"}')
  assert.ok(items(d).some((i) => i.payload === 'specs/20261104/01-a.md'), 'a spec still in a lane stays pending')
  w(d, path.relative(d, wtRun), '{"step":"DONE","ended":true}')
  assert.ok(!items(d).some((i) => i.payload === 'specs/20261104/01-a.md'), 'an ended sidecar ticks it')
})

test('AC-20261105-04-11 the interface contract and architecture name type, after, --type, --after, decide and the ⏳ row; §7 drops the v7 fields', () => {
  const root = path.join(__dirname, '..')
  const ic = fs.readFileSync(path.join(root, 'docs/v8/interface-contract.md'), 'utf8')
  const arch = fs.readFileSync(path.join(root, 'docs/v8/architecture.md'), 'utf8')
  const s7 = ic.slice(ic.search(/^## 7\b/m)).split(/^## (?!7\b)/m)[0]
  for (const t of ['type', 'after', '--type', '--after', '📌 decide:', '⏳ after']) assert.ok(s7.includes(t), 'interface-contract §7 names ' + t)
  for (const t of ['type', 'after']) assert.ok(arch.includes(t), 'architecture names ' + t)
  assert.ok(/lib\/work\.js/.test(arch))
  for (const t of ['lane?', 'when?', 'origin?', 'trigger?']) assert.ok(!s7.includes(t), '§7 no longer names ' + t)
  const cmd = fs.readFileSync(path.join(root, 'spec/commands/queue.md'), 'utf8')
  assert.ok(cmd.includes('--type') && cmd.includes('--after') && cmd.includes('⏳ after'))
})

test('AC-20261105-07-14 --type or --after with no value exits 2 with needs a value and adds nothing', () => {
  const d = repo()
  for (const flag of ['--type', '--after']) {
    const r = runNode('scripts/queue.js', ['add', 'x', '--root', d, flag])
    assert.strictEqual(r.status, 2, flag)
    assert.ok(r.stderr.includes(`${flag} needs a value`), r.stderr)
    const mid = runNode('scripts/queue.js', ['add', 'x', flag, '--root', d])
    assert.strictEqual(mid.status, 2, flag + ' before another flag')
  }
  assert.strictEqual(JSON.parse(q(d, 'list', '--json').stdout).items.length, 0, 'nothing was added')
})

// ---- spec 20261105/10: a brief closes when the user says so -----------------------------------

function finishedBrief() {
  const d = repo()
  w(d, 'docs/roadmap/03-rounds.md', '# 03\n')
  w(d, 'specs/20261104/03-a.md', sp('done', '03'))
  q(d, 'add', '03')
  return d
}

test('AC-20261105-10-11 a queued brief with every spec done stays pending; next skips it, list tags it', () => {
  const d = finishedBrief()
  q(d, 'add', 'poke')
  assert.deepStrictEqual(items(d).map((i) => [i.payload, !!i.done]), [['03', false], ['poke', false]])
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:plan poke', 'a finished brief is skipped the way a gated head is')
  assert.match(q(d, 'list').stdout, /^1 {2}q1 {2}\d+m {2}03 {2}✔ specs done — \/spec:queue done 03$/m)
  q(d, 'done', 'poke')
  const none = q(d, 'next')
  assert.strictEqual(none.stdout.trim(), 'nothing ready — 1 waiting on after gates or finished briefs')
  assert.deepStrictEqual(JSON.parse(q(d, 'next', '--json').stdout), { empty: false, waiting: 1 })
  const raw = JSON.parse(q(d, 'list', '--json').stdout).items[0]
  assert.deepStrictEqual(Object.keys(raw).sort(), ['added', 'id', 'kind', 'payload'], '--json rows are unchanged')
  const f = JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8'))
  assert.ok(!f.items.find((i) => i.payload === '03').done, 'no done timestamp on disk')
})

test('AC-20261105-10-12 done NN ticks a finished brief; a superseded brief lists with its own tail and stays pending until done', () => {
  const d = finishedBrief()
  w(d, 'docs/roadmap/05-old.md', '# 05\n\n> **Superseded by 06**\n'); w(d, 'specs/20261104/05-a.md', sp('done', '05'))
  q(d, 'add', '05')
  assert.match(q(d, 'list').stdout, /^2 {2}q2 {2}\d+m {2}05 {2}⛔ superseded — \/spec:queue done 05$/m)
  assert.strictEqual(items(d).length, 2)
  assert.match(q(d, 'done', '03').stdout, /^done q1: 03/)
  assert.deepStrictEqual(items(d).map((i) => i.payload), ['05'])
  q(d, 'done', '05')
  assert.deepStrictEqual(items(d), [])
})
