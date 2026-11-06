'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { tmpdir, gitRepo, runNode, SPEC, ROOT, v7Scripts, v1Queue } = require('./helpers')
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))

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
  const item = Q.read(dir).items[0]
  assert.deepStrictEqual([item.kind, item.payload], ['spec', f])
  assert.strictEqual(add('./' + f).status, 2, './ form is the same spec: a duplicate')
  assert.strictEqual(add(path.join(dir, f)).status, 2, 'the absolute form is the same spec: a duplicate')
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
  assert.deepStrictEqual([items(d)[0].type, items(d)[0].spec, items(d)[0].payload], ['fix', 'specs/x.md', 'gate red'])
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
  fs.writeFileSync(f, JSON.stringify({ version: 3, seq: 1, items: [{ id: 'q1', kind: 'prompt', payload: 'migrated words', added: '2026-11-01T00:00:00.000Z' }] }))
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

// ---- spec 20261105/12: the queue item has one owner -------------------------------------------

const stored = (d) => JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8'))

test('the queue file lives in the git common dir, shared by every worktree; an absent file reads as an empty version 3', () => {
  const root = tmpdir('q'); const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'lane')
  g('worktree', 'add', '-q', '-b', 'lane', wt)
  assert.deepStrictEqual(Q.read(root), { version: 3, seq: 0, items: [] })
  Q.write(wt, { seq: 1, items: [{ id: 'q1', kind: 'prompt', payload: 'x' }] })
  assert.ok(fs.existsSync(path.join(root, '.git', 'spec-queue.json')), 'the queue sits in the common git dir, not the checkout')
  assert.strictEqual(Q.read(root).items[0].id, 'q1', 'a lane write is visible from the main root')
  assert.strictEqual(stored(root).version, 3, 'write stamps the version')
})

test('AC-20261105-12-4 parse is the one reader of typed text', () => {
  assert.deepStrictEqual(Q.parse('/spec:plan x'), { type: 'plan', payload: 'x' })
  assert.deepStrictEqual(Q.parse('/spec:prototype a rough idea'), { type: 'prototype', payload: 'a rough idea' })
  assert.deepStrictEqual(Q.parse('/spec:fix gate red', 'fix'), { type: 'fix', payload: 'gate red' })
  assert.deepStrictEqual(Q.parse('/spec:fix specs/x.md — gate red'), { type: 'fix', spec: 'specs/x.md', payload: 'gate red' })
  assert.deepStrictEqual(Q.parse('specs/x.md', 'fix'), { type: 'fix', spec: 'specs/x.md', payload: '' })
  assert.deepStrictEqual(Q.parse('specs/x.md — gate red', 'plan'), { type: 'plan', payload: 'specs/x.md — gate red' }, 'only a fix binds a spec')
  assert.deepStrictEqual(Q.parse('/spec:fix y', 'plan'), { type: 'plan', payload: '/spec:fix y' }, 'a prefix that disagrees with the type stays as text')
  assert.deepStrictEqual(Q.parse('/spec:plan y', 'decide'), { type: 'decide', payload: '/spec:plan y' })
  assert.deepStrictEqual(Q.parse('just a note'), { type: undefined, payload: 'just a note' })
})

test('AC-20261105-12-4 a typed fix is stored bare and bound; next prints it byte-equal; list shows the spec path; spellings of one fix are one duplicate', () => {
  const d = repo()
  assert.strictEqual(q(d, 'add', '/spec:fix specs/20261104/01-a.md — gate red').status, 0)
  const it = stored(d).items[0]
  assert.deepStrictEqual([it.kind, it.type, it.spec, it.payload], ['prompt', 'fix', 'specs/20261104/01-a.md', 'gate red'])
  assert.strictEqual(q(d, 'next').stdout.trim(), '/spec:fix specs/20261104/01-a.md — gate red')
  assert.match(q(d, 'list').stdout, /^1 {2}q1 {2}\d+m {2}specs\/20261104\/01-a\.md — gate red$/m)
  assert.strictEqual(q(d, 'add', '--type', 'fix', 'gate red').status, 0)
  const dup = q(d, 'add', '/spec:fix gate red')
  assert.strictEqual(dup.status, 2)
  assert.ok(dup.stderr.includes('duplicate payload already queued'), dup.stderr)
  const same = q(d, 'add', '/spec:fix specs/20261104/01-a.md — gate red')
  assert.strictEqual(same.status, 2, 'the bound spelling is a duplicate too')
  assert.strictEqual(q(d, 'add', '--type', 'plan', '/spec:fix y').status, 0)
  const last = stored(d).items[2]
  assert.deepStrictEqual([last.type, last.payload, last.spec], ['plan', '/spec:fix y', undefined])
  assert.strictEqual(q(d, 'next', '--json').status, 0)
})

test('a bound fix resolves by its spec path, by id and by position; done ticks it', () => {
  const d = repo()
  q(d, 'add', '/spec:fix specs/20261104/01-a.md — gate red'); q(d, 'add', 'other')
  assert.strictEqual(q(d, 'show', 'specs/20261104/01-a.md').status, 0)
  assert.strictEqual(q(d, 'show', 'gate red').status, 0)
  assert.strictEqual(q(d, 'show', 'q1').stdout.trim(), 'specs/20261104/01-a.md — gate red')
  assert.match(q(d, 'done', 'specs/20261104/01-a.md').stdout, /^done q1: specs\/20261104\/01-a\.md — gate red/)
  assert.deepStrictEqual(items(d).map((i) => i.id), ['q2'])
})

test('Q.add: the door shapes, the default type, the dedupe and --top', () => {
  const d = repo()
  const at = (f, o) => Q.add(d, f, o)
  assert.deepStrictEqual(Object.keys(at({ payload: 'specs/20261104/01-a.md' })).sort(), ['added', 'id', 'kind', 'payload'])
  assert.strictEqual(at({ payload: 'specs/20261104/01-a.md' }), null, 'an open item with the same shape is a duplicate')
  assert.strictEqual(at({ payload: '07' }).kind, 'brief')
  assert.deepStrictEqual([at({ payload: 'words', defaultType: 'plan' }).type, at({ payload: 'a note' }).type], ['plan', undefined])
  assert.strictEqual(at({ payload: 'a note' }), null)
  const bound = at({ payload: 'first finding', spec: 'specs/20261104/02-b.md', type: 'fix' })
  assert.deepStrictEqual([bound.spec, bound.payload], ['specs/20261104/02-b.md', 'first finding'])
  assert.strictEqual(at({ payload: 'first finding', spec: 'specs/20261104/02-b.md', type: 'fix' }), null)
  assert.strictEqual(at({ payload: 'first finding', type: 'fix' }).spec, undefined, 'the same words unbound are another item')
  assert.strictEqual(at({ payload: 'top', type: 'plan' }, { top: true }).id, 'q7')
  assert.strictEqual(Q.open(Q.read(d))[0].payload, 'top')
  assert.strictEqual(Q.tick(d, (i) => i.kind === 'brief'), 1)
  assert.strictEqual(Q.tick(d, (i) => i.kind === 'brief'), 0, 'a done item is not ticked twice')
  assert.match(Q.read(d).items.find((i) => i.kind === 'brief').done, /^\d{4}-\d\d-\d\dT/)
})

test('Q.paste: spec, brief, each type, a note; Q.text joins a bound fix', () => {
  const d = repo()
  const p = (it) => Q.paste(d, { id: 'q1', added: 'x', ...it })
  assert.strictEqual(p({ kind: 'spec', payload: 'specs/20261104/01-a.md' }), '/spec:run specs/20261104/01-a.md')
  assert.strictEqual(p({ kind: 'spec', payload: 'specs/20261104/02-b.md' }), '/spec:plan specs/20261104/02-b.md')
  assert.strictEqual(p({ kind: 'brief', payload: '07' }), '/spec:plan docs/roadmap/07-auth.md')
  assert.strictEqual(p({ kind: 'prompt', type: 'plan', payload: 'x' }), '/spec:plan x')
  assert.strictEqual(p({ kind: 'prompt', type: 'prototype', payload: 'x' }), '/spec:prototype x')
  assert.strictEqual(p({ kind: 'prompt', type: 'fix', payload: 'x' }), '/spec:fix x')
  assert.strictEqual(p({ kind: 'prompt', type: 'fix', spec: 'specs/x.md', payload: '' }), '/spec:fix specs/x.md')
  assert.strictEqual(p({ kind: 'prompt', type: 'fix', spec: 'specs/x.md', payload: 'gate red' }), '/spec:fix specs/x.md — gate red')
  assert.strictEqual(p({ kind: 'prompt', type: 'decide', payload: 'x' }), '📌 decide: x')
  assert.strictEqual(p({ kind: 'prompt', payload: 'x y' }), 'x y')
})

test('AC-20261105-12-3 a queue file that is not version 3 stops queue list and add with the remedy and changes nothing', () => {
  const d = repo()
  const f = path.join(d, '.git/spec-queue.json')
  for (const v of [1, 2, 4]) {
    const text = JSON.stringify({ version: v, seq: 1, items: [{ id: 'q1', kind: 'prompt', payload: 'x', added: '2026-11-01T00:00:00.000Z' }] })
    fs.writeFileSync(f, text)
    for (const args of [['list'], ['add', 'y'], ['next'], ['done', '1']]) {
      const r = q(d, ...args)
      assert.strictEqual(r.status, 2, `${args} on v${v}`)
      assert.ok(r.stderr.includes(`queue: queue file is version ${v} — run /spec:migrate`), r.stderr)
    }
    assert.strictEqual(fs.readFileSync(f, 'utf8'), text, 'nothing changed')
    assert.throws(() => Q.read(d), (e) => e.exit === 2 && e.message === `queue file is version ${v} — run /spec:migrate`)
  }
  fs.writeFileSync(f, JSON.stringify({ seq: 0, items: [] }))
  assert.throws(() => Q.read(d), /version undefined — run \/spec:migrate/)
})

test('AC-20261105-12-3 an unmigrated queue stops fanout and run with exit 2, plan lock prints no Next line, and the status screen names /spec:migrate', () => {
  const d = repo()
  const f = path.join(d, '.git/spec-queue.json')
  const text = JSON.stringify({ version: 2, seq: 1, items: [{ id: 'q52', kind: 'prompt', type: 'fix', payload: 'Admin polish', added: '2026-11-01T00:00:00.000Z' }] })
  fs.writeFileSync(f, text)
  const msg = 'queue file is version 2 — run /spec:migrate'
  const fan = runNode('scripts/fanout.js', ['--root', d])
  assert.strictEqual(fan.status, 2); assert.ok(fan.stderr.includes(msg), fan.stderr)
  const run = runNode('scripts/run.js', ['specs/20261104/01-a.md', '--root', d])
  assert.strictEqual(run.status, 2); assert.ok(run.stderr.includes(msg), run.stderr)
  const fresh = runNode('scripts/plan.js', ['new', 'again', '--root', d]).stdout.trim()
  const spec = path.join(d, fresh)
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace(/no \| yes — <what>, needs your yes/, 'no').replace(/<[^<>\n]+>/g, 'x'))
  const lock = runNode('scripts/plan.js', ['lock', spec, '--root', d])
  assert.strictEqual(lock.status, 2); assert.ok(lock.stderr.includes(msg), lock.stderr)
  assert.ok(!lock.stdout.includes('Next:'), 'no Next line hides the refusal')
  const screen = runNode('scripts/status.js', ['--root', d, '--all']).stdout
  assert.match(screen, /\[queue-unparseable\][^\n]*\/spec:migrate/)
  assert.strictEqual(fs.readFileSync(f, 'utf8'), text, 'nothing changed')
})

// ---- D5: the gate -----------------------------------------------------------------------------

const GATE = /\.items\.(push|splice|unshift)\(|\.done = |\breadQueue\b|\bwriteQueue\b/
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const jsUnder = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsUnder(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []))
const OWNERS = ['lib/queue.js', 'queue.js', 'migrate.js']
const touchers = (files) => files.filter((f) => GATE.test(stripComments(fs.readFileSync(f, 'utf8'))))

test('AC-20261105-12-6 no script outside the owner, the CLI and the migration touches queue items', () => {
  const scripts = path.join(SPEC, 'scripts')
  const files = jsUnder(scripts).filter((f) => !OWNERS.includes(path.relative(scripts, f).split(path.sep).join('/')))
  assert.ok(files.length >= 15, 'the walk found the scripts')
  assert.deepStrictEqual(touchers(files).map((f) => path.relative(scripts, f)), [])
  const copy = path.join(tmpdir('gate'), 'fanout.js')
  fs.writeFileSync(copy, fs.readFileSync(path.join(scripts, 'fanout.js'), 'utf8') + '\nq.items.push({})\n')
  assert.deepStrictEqual(touchers([copy]), [copy], 'a hand-built item is reported')
  fs.writeFileSync(copy, '// q.items.push({})\n/* x.done = 1 */\nconst a = 1\n')
  assert.deepStrictEqual(touchers([copy]), [], 'comments are stripped')
  assert.ok(OWNERS.every((o) => fs.existsSync(path.join(scripts, o))))
  assert.ok(fs.readFileSync(path.join(scripts, 'lib/queue.js'), 'utf8').split('\n').length <= 201, 'the owner stays within 200 lines')
})

test('AC-20261105-12-10 the contract, architecture, fanout.md, migrate.md and ADR-0041 name version 3, the owner and the rules', () => {
  const root = path.join(__dirname, '..')
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const ic = read('docs/v8/interface-contract.md')
  const s7 = ic.slice(ic.search(/^## 7\b/m)).split(/^## (?!7\b)/m)[0]
  for (const t of ['version: 3', 'spec?', 'bare text', '/spec:migrate', 'parsed once', 'needs you', 'nothing runnable']) assert.ok(s7.includes(t), 'contract §7 names ' + t)
  assert.ok(!s7.includes('version: 2') && !s7.includes('verbatim when the payload already starts'), '§7 drops the old rules')
  assert.ok(ic.includes('`lib/queue.js`'), 'the §3 row names the owner')
  const arch = read('docs/v8/architecture.md')
  assert.ok(arch.includes('lib/queue.js') && arch.includes('version: 3') && !arch.includes('readQueue'), 'architecture names the owner and version 3')
  assert.ok(read('spec/commands/fanout.md').includes('PLAN with nothing runnable lists every open item with why it needs you; drained means the queue is empty'))
  assert.ok(read('spec/commands/migrate.md').includes('and to the current queue version'))
  assert.match(read('docs/adr/0041-the-screen-is-v7s-derivation-on-v8-state.md').split('\n').slice(0, 8).join('\n'), /Amended by: docs\/adr\/0042-the-queue-item-has-one-owner\.md/)
})

// ---- spec 20261105/13: groom comes back --------------------------------------------------------
// v7's own spec-queue.js groom runs on the host's v1 twin; queue.js groom must print the same bytes.

const D = 'specs/20261101'
const ago = (days) => new Date(Date.now() - days * 86400000 - 3600000).toISOString()
const hostWith = (files, items) => {
  const d = tmpdir('groom'); gitRepo(d)
  for (const [rel, text] of Object.entries(files)) w(d, rel, text)
  Q.write(d, { version: 3, seq: items.length, items: items.map((i, n) => ({ id: 'q' + (n + 1), added: new Date().toISOString(), ...i })) })
  return d
}
const groom = (d, ...a) => q(d, 'groom', ...a)
function v7Groom(host) {
  const twin = v1Queue(host)
  return spawnSync(process.execPath, [path.join(v7Scripts(), 'spec-queue.js'), 'groom'], { cwd: twin, encoding: 'utf8' })
}
const same = (d) => {
  const mine = groom(d); const old = v7Groom(d)
  assert.strictEqual(old.status, 0, old.stderr)
  assert.strictEqual(mine.status, 0, mine.stderr)
  assert.strictEqual(mine.stdout, old.stdout)
  return mine.stdout
}
const baseFiles = {
  'docs/roadmap/02-schema.md': '# 02 — Schema\n', 'docs/roadmap/03-rounds.md': '# 03 — Rounds\n', 'docs/roadmap/04-boards.md': '# 04 — Boards\n', 'docs/roadmap/05-extra.md': '# 05 — Extra\n',
  [`${D}/01-done.md`]: sp('done'), [`${D}/02-sup.md`]: sp('superseded'), [`${D}/03-open.md`]: sp('hardened'), [`${D}/04-schema.md`]: sp('done', '02'),
}

function groomHost() {
  const long = 'rework the whole notification pipeline so that every channel retries with backoff and the digest never sends twice to anyone'
  return hostWith(baseFiles, [
    { kind: 'prompt', type: 'plan', payload: `polish the output of ${D}/01-done.md` },
    { kind: 'prompt', type: 'plan', payload: `revisit specs/20261101/01 for leftovers` },
    { kind: 'prompt', type: 'plan', payload: `see ${D}/02-sup.md again` },
    { kind: 'brief', payload: '03', after: { brief: '02' } },
    { kind: 'spec', payload: `${D}/03-open.md`, after: { spec: `${D}/01-done.md` } },
    { kind: 'prompt', type: 'plan', payload: 'wait for rounds', after: { brief: '03' } },
    { kind: 'prompt', type: 'plan', payload: 'ancient ungated thing', added: ago(20) },
    { kind: 'prompt', type: 'plan', payload: 'ancient gated thing', added: ago(20), after: { brief: '03' } },
    { kind: 'prompt', type: 'plan', payload: 'migrate the billing exports into the warehouse nightly' },
    { kind: 'prompt', type: 'plan', payload: 'migrate billing exports warehouse nightly job' },
    { kind: 'prompt', type: 'plan', payload: 'design/prototypes/a/contract.json' },
    { kind: 'prompt', type: 'plan', payload: './design/prototypes/a/contract.json' },
    { kind: 'prompt', type: 'plan', payload: 'design/prototypes/b/contract.json' },
    { kind: 'prompt', type: 'prototype', payload: long, added: ago(20) },
    { kind: 'prompt', type: 'decide', payload: 'drop the legacy export?' },
    { kind: 'prompt', payload: 'a plain note about nothing' },
    { kind: 'prompt', type: 'fix', spec: `${D}/03-open.md`, payload: 'digest sends twice' },
    { kind: 'prompt', type: 'fix', spec: `${D}/01-done.md`, payload: 'repair the output' },
    { kind: 'brief', payload: '04' },
    { kind: 'spec', payload: `${D}/03-open.md` },
  ])
}

test('AC-20261105-13-1 queue.js groom prints v7\'s bytes, buckets and all, on one host holding every flag shape', () => {
  const out = same(groomHost())
  for (const b of ['duplicates (', 'cites done (', 'gate met (', 'stale (']) assert.ok(out.includes(b), b)
  assert.match(out, /^ {2}q9 ~ q10 {2}0\.\d\d$/m)
  assert.match(out, /^ {2}q11 ~ q12 {2}1\.00$/m)
  assert.ok(!/q11 ~ q13|q12 ~ q13/.test(out), 'a differing path pair is no duplicate')
  assert.ok(/^ {2}q4 .*brief 03 \(rounds\)$/m.test(out) && /^ {2}q5 .*spec specs\/20261101\/03-open\.md$/m.test(out), 'met brief and spec gates')
  assert.ok(!/^ {2}q8 .*$/m.test(out.slice(out.indexOf('stale ('))), 'a gated prompt is never stale')
  assert.ok(/^ {2}q14 .*…$/m.test(out) && out.split('\n').every((l) => [...l].length <= 100), 'a long row is cut to 100 columns')
  assert.ok(out.endsWith('fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes\n'))
})

test('AC-20261105-13-2 nothing flagged: the empty line counts queued and unqueued pending work as v7 did', () => {
  const d = hostWith({
    'docs/roadmap/01-open.md': '# 01\n', 'docs/roadmap/02-old.md': '# 02\n\n> **Superseded by 03**\n', 'docs/roadmap/03-fin.md': '# 03\n', 'docs/roadmap/05-queued.md': '# 05\n',
    [`${D}/03-fin.md`]: sp('done', '03'), [`${D}/05-queued.md`]: sp('done', '05'), [`${D}/06-adhoc.md`]: sp('draft'),
  }, [{ kind: 'brief', payload: '05' }, { kind: 'spec', payload: `${D}/09-gone.md` }])
  assert.strictEqual(same(d), '✨ nothing to groom · 2 pending\n')
})

test('AC-20261105-13-2 only v7\'s bold banner supersedes: a plain `> Superseded by` brief counts, gates and closes as v7 had it', () => {
  const plain = '# 01\n\n> Superseded by 02\n'; const bold = '# 01\n\n> **Superseded by 02**\n'
  const brief = (n) => `docs/roadmap/${n}-a.md`
  assert.strictEqual(same(hostWith({ [brief('01')]: plain }, [])), '✨ nothing to groom · 1 pending\n')
  assert.strictEqual(same(hostWith({ [brief('01')]: bold }, [])), '✨ nothing to groom · 0 pending\n')
  const spec = { [`${D}/01-a.md`]: sp('done', '01') }
  assert.strictEqual(same(hostWith({ [brief('01')]: plain, ...spec }, [])), '✨ nothing to groom · 0 pending\n')
  assert.strictEqual(same(hostWith({ [brief('01')]: plain, ...spec }, [{ kind: 'brief', payload: '01' }])), '✨ nothing to groom · 0 pending\n')
  assert.strictEqual(same(hostWith({ [brief('01')]: bold, ...spec }, [{ kind: 'brief', payload: '01' }])), '✨ nothing to groom · 1 pending\n')
  const gated = [{ kind: 'prompt', type: 'plan', payload: 'after the old brief', after: { brief: '01' } }]
  assert.match(same(hostWith({ [brief('01')]: plain, ...spec }, gated)), /^gate met \(1\):\n {2}q1 /m)
  assert.strictEqual(same(hostWith({ [brief('01')]: bold, ...spec }, gated)), '✨ nothing to groom · 1 pending\n')
})

test('AC-20261105-13-2 two roadmap files sharing a number are one brief, read as the last file, as v7 had it', () => {
  const [a, b] = ['docs/roadmap/04-a.md', 'docs/roadmap/04-b.md']; const bold = '# 04\n\n> **Superseded by 05**\n'; const plain = '# 04\n'
  assert.strictEqual(same(hostWith({ [a]: plain, [b]: plain }, [])), '✨ nothing to groom · 1 pending\n')
  assert.strictEqual(same(hostWith({ [a]: bold, [b]: plain }, [])), '✨ nothing to groom · 1 pending\n')
  assert.strictEqual(same(hostWith({ [a]: plain, [b]: bold }, [])), '✨ nothing to groom · 1 pending\n')
  const spec = { [`${D}/04-a.md`]: sp('done', '04') }
  const gated = [{ kind: 'prompt', type: 'plan', payload: 'wait', after: { brief: '04' } }]
  assert.match(same(hostWith({ [a]: bold, [b]: plain, ...spec }, gated)), /^gate met \(1\):/m)
  assert.strictEqual(same(hostWith({ [a]: plain, [b]: bold, ...spec }, gated)), '✨ nothing to groom · 1 pending\n')
  assert.strictEqual(same(hostWith({ [a]: plain, [b]: bold, ...spec }, [{ kind: 'brief', payload: '04' }])), '✨ nothing to groom · 1 pending\n')
  const named = { [a]: plain, [b]: plain, [`${D}/01-done.md`]: sp('done') }
  assert.match(same(hostWith(named, [{ kind: 'brief', payload: '04', after: { spec: `${D}/01-done.md` } }])), /brief 04 \(b\)$/m)
})

test('AC-20261105-13-3 groom writes nothing: the queue file is byte-identical and the git dir gains no file', () => {
  const d = hostWith(baseFiles, [{ kind: 'spec', payload: `${D}/01-done.md` }, { kind: 'prompt', type: 'plan', payload: 'ancient ungated thing', added: ago(20) }])
  const listing = () => spawnSync('find', [path.join(d, '.git'), '-type', 'f'], { encoding: 'utf8' }).stdout.split('\n').sort().join('\n')
  const file = path.join(d, '.git/spec-queue.json')
  const [bytes, before] = [fs.readFileSync(file), listing()]
  const r = groom(d)
  assert.match(r.stdout, /^stale \(1\):\n {2}q2 /m)
  assert.ok(fs.readFileSync(file).equals(bytes))
  assert.strictEqual(listing(), before)
})

test('AC-20261105-13-4 bound fixes pair on their words and cite a done spec as v7 did', () => {
  const d = hostWith(baseFiles, [
    { kind: 'prompt', type: 'fix', spec: `${D}/03-open.md`, payload: 'digest sends twice to every customer' },
    { kind: 'prompt', type: 'fix', spec: `${D}/03-open.md`, payload: 'digest sends twice to some customers' },
    { kind: 'prompt', type: 'fix', spec: `${D}/01-done.md`, payload: 'repair the output' },
  ])
  const out = same(d)
  assert.match(out, /^ {2}q1 ~ q2 {2}\d\.\d\d$/m)
  assert.match(out, /^cites done \(1\):\n {2}q3 /m)
})

test('AC-20261105-13-5 groom refuses every flag but --root, exits 2 and leaves the queue file alone', () => {
  const d = groomHost()
  const bytes = fs.readFileSync(path.join(d, '.git/spec-queue.json'))
  for (const flag of ['--json', '--distinct', '--top']) {
    const r = runNode('scripts/queue.js', ['groom', flag, '--root', d])
    assert.strictEqual(r.status, 2, flag)
    assert.strictEqual(r.stderr, `queue: groom: unknown flag ${flag}\n`)
    assert.strictEqual(r.stdout, '')
  }
  for (const args of [['--type', 'plan'], ['--type'], ['--after'], ['--after', '02']]) {
    const r = runNode('scripts/queue.js', ['groom', ...args, '--root', d])
    assert.strictEqual(r.status, 2, args.join(' '))
    assert.strictEqual(r.stderr, `queue: groom: unknown flag ${args[0]}\n`)
    const last = runNode('scripts/queue.js', ['groom', '--root', d, ...args])
    assert.strictEqual(last.stderr, `queue: groom: unknown flag ${args[0]}\n`, 'with the flag last')
  }
  assert.strictEqual(runNode('scripts/queue.js', ['add', 'x', '--type', '--root', d]).stderr, 'queue: --type needs a value\n', 'every other subcommand keeps the parser message')
  assert.ok(fs.readFileSync(path.join(d, '.git/spec-queue.json')).equals(bytes))
  const other = tmpdir('groom-other'); gitRepo(other)
  const r = spawnSync(process.execPath, [path.join(SPEC, 'scripts/queue.js'), 'groom', '--root', d], { cwd: other, encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes('duplicates ('), 'grooms the --root repo, not the cwd repo')
})

test('AC-20261105-13-6 the command lists Agent, AskUserQuestion and groom; the doctrine seats the haiku checks', () => {
  const cmd = fs.readFileSync(path.join(SPEC, 'commands/queue.md'), 'utf8')
  const head = cmd.split('---')[1]
  assert.match(head, /^allowed-tools:.*\bAgent\b.*\bAskUserQuestion\b/m)
  assert.match(head, /^argument-hint:.*\bgroom\b/m)
  for (const w of ['groom` checks before it proposes', 'Agent {model: "haiku"}', '📌 Auto-picked done', 'never tick without a yes', 'No agent, no proposal', 'show <id> --json', 'queue.js done <ref>']) assert.ok(cmd.includes(w), w)
  const doc = fs.readFileSync(path.join(SPEC, 'doctrine.md'), 'utf8')
  assert.match(doc, /^\| queue groom checks \| haiku \| low \|$/m)
})

test('AC-20261105-13-7 the contract lists groom in § 1 and the § 7 subcommand table', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/v8/interface-contract.md'), 'utf8')
  assert.match(doc, /^\| `\/spec:queue` \|[^\n]*groom/m)
  const s7 = doc.slice(doc.search(/^## 7\b/m)).split(/^## (?!7\b)/m)[0]
  assert.match(s7, /^\| `groom` \|/m)
})

test('AC-20261105-13-8 a missing spec-v7-final tag fails the groom oracle, it never skips', () => {
  const r = spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', 'refs/tags/spec-v7-final'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'tag spec-v7-final must exist: the oracle has no skip path')
  assert.ok(fs.existsSync(path.join(v7Scripts(), 'spec-queue.js')))
})
