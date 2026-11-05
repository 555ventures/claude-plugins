'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

const plan = (d, ...a) => runNode('scripts/plan.js', [...a, '--root', d])
const status = (f) => /^status:\s*(\S+)/m.exec(fs.readFileSync(f, 'utf8'))[1]
const raw = (d, slug) => { const r = plan(d, 'new', slug); assert.strictEqual(r.status, 0, r.stderr); return path.join(d, r.stdout.trim()) }
// A filled-in spec: every template placeholder replaced, the way the session leaves it.
const fresh = (d, slug) => { const f = raw(d, slug); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/no \| yes — <what>, needs your yes/, 'no').replace(/<[^<>\n]+>/g, 'x')); return f }

test('new numbers per date and creates a draft; a raw template never locks', () => {
  const d = tmpdir('plan')
  const a = raw(d, 'first')
  const r = plan(d, 'lock', a)
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /template placeholders left: <Title>/)
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
  fs.writeFileSync(f, text.replace('## Goal', '## Goal\n\nx [NEEDS CLARIFICATION: y]'))
  assert.strictEqual(plan(d, 'lock', f).status, 2)
  assert.strictEqual(status(f), 'draft')
  fs.writeFileSync(f, text)
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /^✅ spec hardened & locked — specs\/\d{8}\/01-first\.md\nNext: \/spec:queue add specs\/\d{8}\/01-first\.md\n/)
  assert.strictEqual(status(f), 'hardened')
})

test('re-locking a queued spec points at /spec:run, not a second queue add', () => {
  const d = tmpdir('plan'); gitRepo(d)
  const f = fresh(d, 'again'); const rel = path.relative(d, f)
  assert.strictEqual(runNode('scripts/queue.js', ['add', rel, '--root', d]).status, 0)
  assert.match(plan(d, 'lock', f).stdout, new RegExp(`Next: /spec:run ${rel.replace(/[/.]/g, '\\$&')}`))
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

test('lock commits new or edited ADRs and briefs with the spec; an empty docs/adr is fine', () => {
  const d = tmpdir('plan'); const g = gitRepo(d)
  fs.mkdirSync(path.join(d, 'docs/adr'), { recursive: true })
  assert.strictEqual(plan(d, 'lock', fresh(d, 'plain')).status, 0, 'empty docs/adr does not break the commit')
  const f = fresh(d, 'arch')
  fs.mkdirSync(path.join(d, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs/adr/0002-orm.md'), '# 0002. ORM\n\n- Status: accepted\n')
  fs.writeFileSync(path.join(d, 'docs/roadmap/03-old.md'), '# 03 — Old\n\n> Superseded by 01\n')
  assert.strictEqual(plan(d, 'lock', f).status, 0)
  assert.strictEqual(g('status', '--porcelain'), '', 'spec, ADR and brief are all committed')
  assert.match(g('show', '--stat', '--format=%s', 'HEAD'), /chore\(spec\): lock[\s\S]*docs\/adr\/0002-orm\.md[\s\S]*docs\/roadmap\/03-old\.md/)
})

test('placeholder check fires on template lines only: `<path>` in a sentence passes', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'doc')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('## Goal\n\nx', '## Goal\n\nRun `doctor --root <path>` and keep `Map<string, Lane>` typed.'))
  assert.strictEqual(plan(d, 'lock', f).status, 0)
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('## Goal', '## Goal\n\nWHEN x THE SYSTEM SHALL <observable result>.'))
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /<observable result>/, 'a half-filled template line is still a placeholder')
})
