'use strict'
// Pins lib/work.js (spec 20261105/04 D4): brief ids, roadmap header shapes, brief state, readSpecs.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
const W = require(path.join(SPEC, 'scripts/lib/work.js'))

const w = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const sp = (status, brief, extra = '') => `---\n${status === null ? '' : `status: ${status}\n`}${brief === undefined ? '' : `brief: ${brief}\n`}${extra}---\n# S\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| a.js | MODIFY | x |\n`

test('AC-20261105-04-7 normBrief and briefOrd normalise ids and order 04 < 04a < 04b < 05', () => {
  assert.deepStrictEqual(['3', '03', '4B', '04-auth', 'docs/roadmap/04B-boards.md', '@./7'].map(W.normBrief), ['03', '03', '04b', '04', '04b', '07'])
  assert.strictEqual(W.normBrief('  n/a '), 'n/a')
  const ord = ['05', '04b', '04', '04a'].sort((a, b) => W.briefOrd(a) - W.briefOrd(b))
  assert.deepStrictEqual(ord, ['04', '04a', '04b', '05'])
})

test('AC-20261105-04-7 readBriefs parses a wrapped header strictly: depends_on, rejects, phase, 04A numbering', () => {
  const d = tmpdir('work'); gitRepo(d)
  w(d, 'docs/roadmap/00-overview.md', '# overview\n')
  w(d, 'docs/roadmap/02-b.md', '# 02 — B\n\nPhase: P1 · Depends on: 02 (02a-2; parts of 02a-3a), brief 04-auth,\n05B, none, 2026-style <!-- x -->\n\n## Goal\nDepends on: 99\n')
  w(d, 'docs/roadmap/04A-boards.md', '# 04a\n')
  const bs = W.readBriefs(d, [])
  assert.deepStrictEqual(bs.map((b) => b.num), ['02', '04a'])
  assert.deepStrictEqual(bs[0].depends_on, ['02', '04', '05b'])
  assert.deepStrictEqual(bs[0].dep_rejects, ['2026-style'])
  assert.strictEqual(bs[0].phase, 'P1')
  assert.strictEqual(bs[0].name, 'b')
  assert.strictEqual(bs[1].phase, null)
  assert.strictEqual(bs[1].status, 'unplanned')
})

test('AC-20261105-04-7 brief state: unplanned, in-flight, done, superseded; a 4B spec is a member of 04b; a spec with no status is omitted', () => {
  const d = tmpdir('work'); gitRepo(d)
  w(d, 'docs/roadmap/01-a.md', '# a\n'); w(d, 'docs/roadmap/02-b.md', '# b\n'); w(d, 'docs/roadmap/03-c.md', '# c\n')
  w(d, 'docs/roadmap/04b-d.md', '# d\n'); w(d, 'docs/roadmap/05-e.md', '# e\n\n> Superseded by 04\n'); w(d, 'docs/roadmap/06-f.md', '# f\n\n> **Superseded by 04**\n'); w(d, 'docs/roadmap/07-g.md', '# g\n\n> Superseded by 04\n')
  w(d, 'specs/20261105/01-x.md', sp('done', '01')); w(d, 'specs/20261105/01-y.md', sp('superseded', '01'))
  w(d, 'specs/20261105/02-x.md', sp('done', '02')); w(d, 'specs/20261105/02-y.md', sp('hardened', '02'))
  w(d, 'specs/20261105/04-x.md', sp('hardened', '4B'))
  w(d, 'specs/20261105/05-x.md', sp('done', '5')); w(d, 'specs/20261105/06-x.md', sp('done', '6')); w(d, 'specs/20261105/07-x.md', sp('hardened', '7'))
  w(d, 'specs/20261105/09-nostatus.md', sp(null, '03')); w(d, 'specs/20261105/10-na.md', sp('draft', 'n/a')); w(d, 'specs/20261105/11.run/state.json', '{}')
  const specs = W.readSpecs(d)
  assert.ok(!specs.some((s) => s.path.endsWith('09-nostatus.md')), 'no status: omitted')
  assert.strictEqual(specs.find((s) => s.path.endsWith('10-na.md')).brief, null)
  assert.deepStrictEqual(specs.map((s) => s.path), specs.map((s) => s.path).sort(), 'lexical order')
  assert.deepStrictEqual(specs[0].filePaths, ['a.js'])
  const st = Object.fromEntries(W.readBriefs(d, specs).map((b) => [b.num, b.status]))
  assert.deepStrictEqual(st, { '01': 'done', '02': 'in-flight', '03': 'unplanned', '04b': 'in-flight', '05': 'superseded', '06': 'superseded', '07': 'in-flight' })
  assert.strictEqual(W.readBriefs(d, specs).find((b) => b.num === '01').specs.length, 1, 'a superseded spec is no member')
})

test('AC-20261105-04-7 brief state: a Superseded banner with no live member spec is superseded, not unplanned', () => {
  const d = tmpdir('work'); gitRepo(d)
  w(d, 'docs/roadmap/05-e.md', '# e\n\n> Superseded by 04\n'); w(d, 'docs/roadmap/06-f.md', '# f\n\n> Superseded by 04\n')
  w(d, 'specs/20261105/05-x.md', sp('superseded', '05'))
  const st = Object.fromEntries(W.readBriefs(d, W.readSpecs(d)).map((b) => [b.num, b.status]))
  assert.deepStrictEqual(st, { '05': 'superseded', '06': 'superseded' })
})

test('readSpecs: a live lane sidecar makes a hardened spec implementing; depends_on loses @ and ./', () => {
  const d = tmpdir('work'); gitRepo(d)
  w(d, 'specs/20261105/01-x.md', sp('hardened', 'n/a', 'depends_on: @specs/a.md, ./specs/b.md\n'))
  w(d, '.claude/worktrees/spec-01-x/specs/20261105/01-x.run/state.json', '{"step":"BUILD"}')
  const [s] = W.readSpecs(d)
  assert.strictEqual(s.status, 'implementing')
  assert.deepStrictEqual(s.depends_on, ['specs/a.md', 'specs/b.md'])
})

test('work.js stays within its caps: at most 250 lines and no CLI', () => {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/work.js'), 'utf8')
  assert.ok(src.split('\n').length <= 251)
  assert.ok(!/require\.main/.test(src))
  assert.ok(fs.readFileSync(path.join(SPEC, 'scripts/queue.js'), 'utf8').split('\n').length <= 201)
})
