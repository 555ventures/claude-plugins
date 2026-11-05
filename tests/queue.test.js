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
  assert.strictEqual(q(d, 'next').stdout.trim(), 'fix the login bug')
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
  assert.strictEqual(q(d, 'next').stdout.trim(), 'later')
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
