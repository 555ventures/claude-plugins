'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, runNode } = require('./helpers')

const plan = (d, ...a) => runNode('scripts/plan.js', [...a, '--root', d])
const status = (f) => /^status:\s*(\S+)/m.exec(fs.readFileSync(f, 'utf8'))[1]

test('new numbers per date and creates a draft', () => {
  const d = tmpdir('plan')
  const a = plan(d, 'new', 'first', '--date', '20261104')
  assert.strictEqual(a.stdout.trim(), 'specs/20261104/01-first.md')
  assert.strictEqual(plan(d, 'new', 'second', '--date', '20261104').stdout.trim(), 'specs/20261104/02-second.md')
  assert.strictEqual(plan(d, 'new', 'other', '--date', '20261105').stdout.trim(), 'specs/20261105/01-other.md')
  assert.strictEqual(status(path.join(d, 'specs/20261104/01-first.md')), 'draft')
  assert.strictEqual(plan(d, 'new', 'Bad Slug').status, 2)
})

test('check reports missing sections and markers; lock refuses then locks', () => {
  const d = tmpdir('plan')
  const f = path.join(d, 'specs/20261104/01-first.md')
  plan(d, 'new', 'first', '--date', '20261104')
  const ok = JSON.parse(plan(d, 'check', f).stdout)
  assert.deepStrictEqual([ok.ok, ok.missing, ok.markers, ok.architecture], [true, [], 0, false])

  const text = fs.readFileSync(f, 'utf8')
  fs.writeFileSync(f, text.replace('## Assumptions', '## Notes').replace('<assumption>', 'x [NEEDS CLARIFICATION: y]'))
  const bad = JSON.parse(plan(d, 'check', f).stdout)
  assert.deepStrictEqual(bad.missing, ['Assumptions'])
  assert.strictEqual(plan(d, 'lock', f).status, 2)

  fs.writeFileSync(f, text.replace('<bullets>', 'x [NEEDS CLARIFICATION: y]'))
  assert.strictEqual(JSON.parse(plan(d, 'check', f).stdout).markers, 1)
  assert.strictEqual(plan(d, 'lock', f).status, 2)
  assert.strictEqual(status(f), 'draft')

  fs.writeFileSync(f, text)
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /^✅ spec hardened & locked — specs\/20261104\/01-first\.md/)
  assert.strictEqual(status(f), 'hardened')
})

test('architecture: true needs --confirmed', () => {
  const d = tmpdir('plan')
  const f = path.join(d, 'specs/20261104/01-arch.md')
  plan(d, 'new', 'arch', '--date', '20261104')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('architecture: false', 'architecture: true'))
  assert.strictEqual(JSON.parse(plan(d, 'check', f).stdout).architecture, true)
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2)
  assert.strictEqual(status(f), 'draft')
  assert.strictEqual(plan(d, 'lock', f, '--confirmed').status, 0)
  assert.strictEqual(status(f), 'hardened')
})
