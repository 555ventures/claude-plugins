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
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /template placeholders left: .*<Title>/)
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

test('lock refuses a File Plan that lists another spec file; its own spec and run dir, non-spec paths and prose pass', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'first')
  const text = fs.readFileSync(f, 'utf8')
  const own = path.relative(d, f)
  const planned = (...rows) => text.replace('## File Plan', ['## File Plan', '', '| Path | Action | Summary |', '|---|---|---|', ...rows.map((r) => `| ${r} | MODIFY | x |`), ''].join('\n'))
  for (const [row, named] of [
    ['specs/20260101/01-old.md', 'specs/20260101/01-old.md'],
    ['`specs/20260101/01-old.md`', 'specs/20260101/01-old.md'],
    ['./specs/20260101/01-old.md', 'specs/20260101/01-old.md'],
    ['src/a.js, specs/20260101/02-older.md', 'specs/20260101/02-older.md'],
    ['specs/20260101/{01-old,02-older}.md', 'specs/20260101/01-old.md, specs/20260101/02-older.md'],
  ]) {
    fs.writeFileSync(f, planned(row))
    const r = plan(d, 'lock', f)
    assert.strictEqual(r.status, 2, row)
    assert.ok(r.stderr.includes(`File Plan lists other spec files: ${named} —`), r.stderr)
    assert.strictEqual(status(f), 'draft')
  }
  fs.writeFileSync(f, text.replace('## File Plan', '## File Plan\n\n| specs/20260101/01-old.md | MODIFY | x |\n')) // a table with no header row
  assert.ok(plan(d, 'lock', f).stderr.includes('File Plan lists other spec files: specs/20260101/01-old.md —'))
  fs.writeFileSync(f, planned(own, own.replace(/\.md$/, '.run/evidence.md'), 'specs/README.txt', 'docs/specs/guide.md') + '\n## After merge\n\nEdit specs/20260101/01-old.md on the trunk.\n')
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 0, r.stderr)
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
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('## Goal', '## Goal\n\n```jsx\n<Title>Hi</Title>\n```\n'))
  assert.strictEqual(plan(d, 'lock', f).status, 0, 'a fenced block is code, not a placeholder')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('## Goal', '## Goal\n\nWHEN x THE SYSTEM SHALL <observable result>.'))
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /<observable result>/, 'a half-filled template line is still a placeholder')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('WHEN x THE SYSTEM SHALL <observable result>.', '').replace(/^area: .*$/m, 'area: <area>'))
  assert.strictEqual(plan(d, 'lock', f).status, 2, 'frontmatter placeholders count too')
})

test('lock refuses a spec outside the repo and a missing argument', () => {
  const d = tmpdir('plan'); gitRepo(d)
  const outside = tmpdir('plan'); const f = fresh(outside, 'far')
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /outside/)
  assert.match(fs.readFileSync(f, 'utf8'), /status: draft/, 'nothing was written')
  assert.strictEqual(plan(d, 'lock').status, 2)
})

// ---- spec 20261105/06: the client says yes ------------------------------------------------------

const withRow = (f, cell) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^\| D1 \|.*$/m, `| D1 | ${cell} | x |`))
const withSignoff = (f, line) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^- Client sign-off:.*$/m, `- Client sign-off: ${line}`))

test('AC-20261105-06-1 a Decisions row that restricts users needs a recorded yes: refused naming the row, passes with [asked:] or a filled sign-off line', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'restrict')
  assert.match(fs.readFileSync(f, 'utf8'), /^- Client sign-off: none/m, 'the template carries the line')
  withSignoff(f, 'none')
  withRow(f, 'customers cannot cancel after the cut-off')
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /client sign-off needed: .*D1.*customers cannot cancel after the cut-off.* — ask, then fill the Intent line/)
  assert.strictEqual(status(f), 'draft')
  withRow(f, 'customers cannot cancel after the cut-off [asked: JJ chose cut-off at 18:00]')
  const rr = plan(d, 'lock', f); assert.strictEqual(rr.status, 0, '[asked:] on the row passes: ' + rr.stderr)
  assert.strictEqual(status(f), 'hardened')

  const g = fresh(d, 'restrict-two')
  withSignoff(g, 'none'); withRow(g, 'only an admin can delete a project')
  assert.strictEqual(plan(d, 'lock', g).status, 2, 'only an <role> can is a restriction')
  withSignoff(g, 'delete rights — JJ chose admins only')
  assert.strictEqual(plan(d, 'lock', g).status, 0, 'a filled sign-off line passes')

  for (const [i, cell] of [['a', 'the field is read-only after save'], ['b', 'the old route is no longer served'], ['c', 'requires a reason on refund'], ['d', 'archived rows are hidden from the list']].entries()) {
    const h = fresh(d, 'restrict-' + cell.length + i)
    withSignoff(h, 'none'); withRow(h, cell)
    assert.strictEqual(plan(d, 'lock', h).status, 2, cell)
    withRow(h, cell + ' [guards: AC-1]')
    assert.strictEqual(plan(d, 'lock', h).status, 0, '[guards:] exempts the row: ' + cell)
  }
  const ok = fresh(d, 'plain'); withRow(ok, 'the list is sorted by date')
  assert.strictEqual(plan(d, 'lock', ok).status, 0, 'an ordinary decision locks with sign-off none')
})

test('AC-20261105-06-2 breaking: true with sign-off none refuses the lock; a filled line locks; a spec without Intent keeps its old refusal', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'breaking')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('breaking: false', 'breaking: true'))
  withSignoff(f, 'none')
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /client sign-off needed: .*breaking.* — ask, then fill the Intent line/)
  withSignoff(f, 'dropping the v1 API — JJ chose a 90-day sunset')
  assert.strictEqual(plan(d, 'lock', f).status, 0)

  const v7 = fresh(d, 'v7era')
  fs.writeFileSync(v7, fs.readFileSync(v7, 'utf8').replace('breaking: false', 'breaking: true').replace(/## Intent[\s\S]*?(?=## Goal)/, ''))
  const old = plan(d, 'lock', v7)
  assert.strictEqual(old.status, 2); assert.match(old.stderr, /missing sections: Intent/, 'no Intent section: the refusal is the one it always was, not a sign-off one')
  assert.doesNotMatch(old.stderr, /sign-off/)
})
