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
  // A spec past 12 Decisions or 90 lines is refused: it is two specs or a wrong design.
  fs.writeFileSync(f, text.replace(/^\| D1 \|.*$/m, Array.from({ length: 13 }, (_, i) => `| D${i + 1} | x | x |`).join('\n')))
  assert.match(plan(d, 'lock', f).stderr, /13 Decisions \(max 12\)/)
  fs.writeFileSync(f, text + '\nx\n'.repeat(90))
  assert.strictEqual(plan(d, 'lock', f).status, 2)
  assert.strictEqual(status(f), 'draft')
  fs.writeFileSync(f, text)
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /^✅ spec hardened & locked — specs\/\d{8}\/01-first\.md\nNext: \/spec:run @specs\/\d{8}\/01-first\.md\n/)
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

test('lock prints the derivation\'s next pick, never a queue add', () => {
  const d = tmpdir('plan'); gitRepo(d)
  const f = fresh(d, 'again'); const rel = path.relative(d, f)
  assert.strictEqual(runNode('scripts/queue.js', ['add', rel, '--root', d]).status, 0)
  const out = plan(d, 'lock', f).stdout
  assert.match(out, new RegExp(`Next: /spec:run @${rel.replace(/[/.]/g, '\\$&')}`))
  assert.doesNotMatch(out, /queue add/)
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

// ---- spec 20261105/14: the lock reads the prototype contract ----------------------------------------

// A spec citing the prototype `inv`: acs = the AC lines it carries.
function protoSpec(d, slug, acs, { stem = 'inv', status: st = 'draft' } = {}) {
  const f = raw(d, slug)
  const n = path.basename(f).slice(0, 2)
  const text = fs.readFileSync(f, 'utf8')
    .replace(/^status: draft$/m, `status: ${st}\nprototype: ${stem}`)
    .replace(/no \| yes — <what>, needs your yes/, 'no').replace(/^- Client sign-off:.*$/m, '- Client sign-off: none')
    .replace(/^- \*\*AC-[^\n]*$/m, acs.map((a, i) => `- **AC-X-${n}-${i + 1}**: ${a}`).join('\n'))
    .replace(/<[^<>\n]+>/g, 'x')
  fs.writeFileSync(f, text)
  return f
}
const pinRec = (id, kind, status = 'active') => ({ id, kind, route: '/invoices', note: `n ${id}`, sentence: `On /invoices: n ${id}`, round: 1, status })

function protoHost(pins = [pinRec('p1', 'behaviour'), pinRec('p2', 'look'), pinRec('p3', 'behaviour')]) {
  const d = tmpdir('plan'); const g = gitRepo(d)
  fs.mkdirSync(path.join(d, 'design/prototypes/inv'), { recursive: true })
  fs.writeFileSync(path.join(d, 'design/prototypes/inv/contract.json'), JSON.stringify({ stem: 'inv', rounds: 1, pins }))
  const q = runNode('scripts/queue.js', ['add', 'design/prototypes/inv/contract.json', '--type', 'plan', '--root', d])
  assert.strictEqual(q.status, 0, q.stderr)
  return { d, g }
}
const openItems = (d) => JSON.parse(runNode('scripts/queue.js', ['list', '--json', '--root', d]).stdout).items.filter((i) => i.kind === 'prompt')

test('AC-20261105-14-8 AC-20261108-06-9 a behaviour pin with no (pin pN) AC refuses the lock by id; covering it locks, names the plan item in the lock commit and closes it', () => {
  const { d, g } = protoHost()
  const itemId = openItems(d)[0].id
  const f = protoSpec(d, 'first', ['WHEN the user deletes THE SYSTEM SHALL ask first (pin p1).'])
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('behaviour pins without an AC: p3 — write an AC ending (pin pN) for each, or node prototype.js inv drop pN --why'), r.stderr)
  assert.ok(!r.stderr.includes('p2'), 'a look pin needs no AC')
  assert.strictEqual(status(f), 'draft')
  assert.strictEqual(openItems(d).length, 1)

  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/(- \*\*AC-X-\d+-1\*\*:.*)/, '$1\n- **AC-X-01-2**: WHEN the user adds THE SYSTEM SHALL total live (pin p3).'))
  const ok = plan(d, 'lock', f)
  assert.strictEqual(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /plan item closed — every behaviour pin has an AC/)
  assert.strictEqual(status(f), 'hardened')
  assert.deepStrictEqual(openItems(d), [], 'the queued plan item reads done: its lock commit names it')
  assert.ok(g('log', '-1', '--format=%B').trimEnd().endsWith(`\n\nQueue: ${itemId}`) && /^chore\(spec\): lock /.test(g('log', '-1', '--format=%s')), 'the lock commit ends with the trailer')
})

test('AC-20261105-14-8 a dropped pin needs no AC; an earlier hardened citing spec covers for a later one; a missing contract is refused naming the path', () => {
  const { d } = protoHost([pinRec('p1', 'behaviour'), pinRec('p2', 'behaviour', 'dropped')])
  const a = protoSpec(d, 'first', ['WHEN x THE SYSTEM SHALL y (pin p1).'])
  assert.strictEqual(plan(d, 'lock', a).status, 0)
  const b = protoSpec(d, 'second', ['WHEN x THE SYSTEM SHALL z.'])
  const r = plan(d, 'lock', b)
  assert.strictEqual(r.status, 0, 'the first spec (hardened) already covers every pin: ' + r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /without an AC/)

  const c = protoSpec(d, 'third', ['WHEN x THE SYSTEM SHALL y.'], { stem: 'ghost' })
  const m = plan(d, 'lock', c)
  assert.strictEqual(m.status, 2)
  assert.ok(m.stderr.includes('no contract at design/prototypes/ghost/contract.json'), m.stderr)
  assert.strictEqual(status(c), 'draft')

  const v7 = protoSpec(d, 'fourth', ['WHEN x THE SYSTEM SHALL y.'], { stem: 'old' })
  fs.mkdirSync(path.join(d, 'design/prototypes/old'), { recursive: true })
  fs.writeFileSync(path.join(d, 'design/prototypes/old/contract.json'), JSON.stringify({ schemaVersion: 1, stem: 'old', pins: [] }))
  const o = plan(d, 'lock', v7)
  assert.strictEqual(o.status, 2)
  assert.ok(o.stderr.includes('is a v7 file — run /spec:migrate'), o.stderr)
})

test('AC-20261107-01-10 an earlier done citing spec that is a stub covers a pin through its acs: cites; without the cite the lock refuses naming p3', () => {
  const { d } = protoHost()
  const a = protoSpec(d, 'first', ['WHEN x THE SYSTEM SHALL y (pin p3).'])
  const stubbed = (acs) => fs.writeFileSync(a, `---\ndate: 2026-11-07\nstatus: done\nprototype: inv\ntext: 0123abcd\nacs: ${acs}\n---\n\n# First\n`)
  stubbed('[AC-X-01-2 (pin p3)]')
  const b = protoSpec(d, 'second', ['WHEN x THE SYSTEM SHALL z (pin p1).'])
  const r = plan(d, 'lock', b)
  assert.strictEqual(r.status, 0, 'the stub covers p3: ' + r.stderr)
  stubbed('[AC-X-01-2]')
  const c = protoSpec(d, 'third', ['WHEN x THE SYSTEM SHALL w (pin p1).'])
  const m = plan(d, 'lock', c)
  assert.strictEqual(m.status, 2)
  assert.ok(m.stderr.includes('behaviour pins without an AC: p3 —'), m.stderr)
  assert.strictEqual(status(c), 'draft')
})

test('AC-20261105-14-8 a spec without prototype: locks as before', () => {
  const { d } = protoHost()
  assert.strictEqual(plan(d, 'lock', fresh(d, 'plain')).status, 0)
  assert.strictEqual(openItems(d).length, 1, 'the contract item is untouched')
})

test('AC-20261107-04-6 lock refuses a Retired criteria line with no AC-ID, a retired by with no such row, or a checked at review naming another spec\'s AC, quoting it; a valid section locks', () => {
  const d = tmpdir('plan')
  const f = fresh(d, 'retire')
  const text = fs.readFileSync(f, 'utf8')
  const own = /\*\*(AC-\d{8}-\d{2}-1)\*\*/.exec(text)[1]
  const retire = (...lines) => fs.writeFileSync(f, text.replace('## Assumptions', `## Retired criteria\n\n${lines.join('\n')}\n\n## Assumptions`))
  for (const line of ['- the old export — retired by D1: gone', '- AC-20990101-01-1 — retired by D9: gone', '- AC-20990101-01-1 — checked at review: prose']) {
    retire(line)
    const r = plan(d, 'lock', f)
    assert.strictEqual(r.status, 2, line)
    assert.ok(r.stderr.includes(`"${line}"`), r.stderr)
    assert.strictEqual(status(f), 'draft')
  }
  retire('- AC-20990101-01-1 — retired by D1: the old export goes', `- ${own} — checked at review: prose`)
  const r = plan(d, 'lock', f)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(status(f), 'hardened')
})
