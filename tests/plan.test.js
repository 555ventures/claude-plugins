'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, runNode } = require('./helpers')

const plan = (d, ...a) => runNode('scripts/plan.js', [...a, '--root', d])
const status = (f) => /^status:\s*(\S+)/m.exec(fs.readFileSync(f, 'utf8'))[1]
const fresh = (d, slug) => { const r = plan(d, 'new', slug); assert.strictEqual(r.status, 0, r.stderr); return path.join(d, r.stdout.trim()) }

test('new numbers per date and creates a draft', () => {
  const d = tmpdir('plan')
  const a = fresh(d, 'first')
  assert.match(path.relative(d, a), /^specs\/\d{8}\/01-first\.md$/)
  assert.strictEqual(path.basename(fresh(d, 'second')), '02-second.md')
  assert.strictEqual(status(a), 'draft')
  assert.strictEqual(plan(d, 'new', 'Bad Slug').status, 2)
})

test('lock refuses a missing section or an open marker, then locks', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'first')
  const text = fs.readFileSync(f, 'utf8')
  fs.writeFileSync(f, text.replace('## Assumptions', '## Notes'))
  assert.strictEqual(plan(d, 'lock', f).status, 2)
  fs.writeFileSync(f, text.replace('<bullets>', 'x [NEEDS CLARIFICATION: y]'))
  assert.strictEqual(plan(d, 'lock', f).status, 2)
  assert.strictEqual(status(f), 'draft')
  fs.writeFileSync(f, text)
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /^✅ spec hardened & locked — specs\/\d{8}\/01-first\.md\nNext: \/spec:queue add specs\/\d{8}\/01-first\.md\n/)
  assert.strictEqual(status(f), 'hardened')
})

test('architecture: true needs --confirmed', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'arch')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('architecture: false', 'architecture: true'))
  assert.strictEqual(plan(d, 'lock', f).status, 2)
  assert.strictEqual(status(f), 'draft')
  assert.strictEqual(plan(d, 'lock', f, '--confirmed').status, 0)
  assert.strictEqual(status(f), 'hardened')
})
