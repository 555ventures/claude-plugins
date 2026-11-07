'use strict'
// Pins lib/state.js: the single owner of every on-disk file in architecture §2.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
const S = require(path.join(SPEC, 'scripts/lib/state.js'))
const G = require(path.join(SPEC, 'scripts/lib/spec.js')) // the spec grammar

const SPEC_DOC = `---
date: 2026-11-04
status: draft
area: queue
depends_on: [a, b]
brief: n/a
architecture: false
---

# Queue dedup

## Intent
- You asked: make the queue refuse duplicates
- I will build:
  - a payload check in queue.js
  - a test
- I will not touch: status.js
- Architecture or behaviour change: yes — queue add now refuses duplicates, needs your yes

## Goal

Refuse duplicate payloads. [NEEDS CLARIFICATION: exact match only?]

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | exact match | simple |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| \`spec/scripts/queue.js\` | modify | scripts | dedup check |
| tests/queue.test.js | CREATE | tests | AC-20261104-01-1 |

## Acceptance Criteria

- **AC-20261104-01-1**: WHEN add runs twice with one payload
  THE SYSTEM SHALL exit 2 [NEEDS CLARIFICATION: message?]
- **AC-20261104-01-2**: WHEN list runs THE SYSTEM SHALL print one row

Trailing prose.

## Assumptions
- A1: none
`

function writeSpec(dir, text = SPEC_DOC) {
  const p = path.join(dir, 'specs', '20261104', '01-queue-dedup.md')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
  return p
}

test('readConfig applies defaults key by key and merges nested objects one level', () => {
  const root = tmpdir('cfg')
  assert.strictEqual(S.readConfig(root).trunk, 'main', 'a host with no config must still get the default trunk')
  assert.strictEqual(S.readConfig(root).lanes, 4, 'fanout would run with no parallelism default')
  S.writeConfig(root, { testCommand: 'npm test', seats: { builder: { model: 'opus' } }, lanes: 5 })
  const c = S.readConfig(root)
  assert.strictEqual(c.testCommand, 'npm test', 'the gate command must come from the file')
  assert.strictEqual(c.lanes, 5, 'a host override must win over the default')
  assert.deepStrictEqual(c.seats.builder, { model: 'opus', effort: 'high' }, 'a partial seat override must keep the default effort')
  assert.deepStrictEqual(c.seats.reviewer, S.DEFAULTS.seats.reviewer, 'an untouched seat must keep its defaults')
})

test('readSpec parses frontmatter, sections, intent, file plan, ACs and markers', () => {
  const s = S.readSpec(writeSpec(tmpdir('spec')))
  assert.strictEqual(s.frontmatter.status, 'draft', 'lifecycle reads the status from frontmatter')
  assert.deepStrictEqual(s.frontmatter.depends_on, ['a', 'b'], 'depends_on lists must parse as arrays')
  assert.strictEqual(s.frontmatter.architecture, false, 'the architecture flag picks the reviewer seat and must be a boolean')
  assert.strictEqual(s.title, 'Queue dedup', 'commit messages use the spec title')
  assert.ok(s.sections.Goal.startsWith('Refuse duplicate'), 'sections must map heading to text')
  assert.strictEqual(s.intent.asked, 'make the queue refuse duplicates', 'the builder brief quotes the ask')
  assert.deepStrictEqual(s.intent.build, ['a payload check in queue.js', 'a test'], 'nested build bullets must all be captured')
  assert.deepStrictEqual(s.intent.notTouch, ['status.js'], 'inline not-touch value must be captured')
  assert.strictEqual(s.intent.architecture, 'queue add now refuses duplicates, needs your yes', 'a yes must carry what changes')
  assert.deepStrictEqual(s.filePlan, [
    { path: 'spec/scripts/queue.js', action: 'MODIFY', summary: 'dedup check' },
    { path: 'tests/queue.test.js', action: 'CREATE', summary: 'AC-20261104-01-1' },
  ], 'fanout overlap and review scope read the File Plan rows')
  assert.strictEqual(s.acs.length, 2, 'every AC bullet must be found')
  assert.strictEqual(s.acs[0].id, 'AC-20261104-01-1', 'AC ids must be exact')
  assert.ok(s.acs[0].text.includes('THE SYSTEM SHALL exit 2'), 'continuation lines must join the AC text')
  assert.ok(!s.acs[1].text.includes('Trailing'), 'prose after the list must not leak into the last AC')
  assert.strictEqual(s.markers, 2, 'lock refuses while markers remain, so the count must be exact')
})

test('readSpec reads a CRLF spec the same as LF and an architecture: no intent as false', () => {
  const text = SPEC_DOC.replace('yes — queue add now refuses duplicates, needs your yes', 'no').replace(/\n/g, '\r\n')
  const s = S.readSpec(writeSpec(tmpdir('crlf'), text))
  assert.strictEqual(s.frontmatter.status, 'draft', 'a CRLF checkout must not hide the status')
  assert.strictEqual(s.intent.architecture, false, 'architecture: no must not trigger the Fable reviewer')
  assert.strictEqual(s.filePlan.length, 2, 'CRLF must not break the table parse')
})

test('readSpec reads every File Plan table; filePaths splits `+`, commas, {a,b} and (generated) cells', () => {
  const body = `---
status: draft
---
# T

## File Plan

| Path | Action | Summary |
|---|---|---|
| \`src/a.ts + src/b.ts\` | MODIFY | both |
| src/{c,d}.ts (generated) | CREATE | pair |
| Dockerfile | CREATE | bare root file |
| notes | NOTE | a word, not a file |
| src/a.ts | MODIFY | again |

Prose between tables.

| File | Why |
|------|-----|
| docs/{x,y}.md, docs/z-*.md | two |

| docs/headerless.md | MODIFY | first column is the path |

## Contracts

| Path | Action |
|---|---|
| not/in/the/plan.js | MODIFY |
`
  const s = S.readSpec(writeSpec(tmpdir('plan'), body))
  assert.deepStrictEqual(s.filePaths, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'Dockerfile', 'docs/x.md', 'docs/y.md', 'docs/z-*.md', 'docs/headerless.md'])
  assert.deepStrictEqual(s.filePlan.map((r) => [r.path, r.action]), [['src/a.ts + src/b.ts', 'MODIFY'], ['src/{c,d}.ts (generated)', 'CREATE'], ['Dockerfile', 'CREATE'], ['notes', 'NOTE'], ['src/a.ts', 'MODIFY'], ['docs/{x,y}.md, docs/z-*.md', '']], 'filePlan keeps the rows of every headed table as written')
  assert.deepStrictEqual(S.readSpec(writeSpec(tmpdir('plan'), SPEC_DOC)).filePaths, ['spec/scripts/queue.js', 'tests/queue.test.js'])
})

test('writeStatus rewrites only the status line and keeps CRLF endings', () => {
  const dir = tmpdir('status')
  const p = writeSpec(dir, SPEC_DOC.replace(/\n/g, '\r\n'))
  const before = fs.readFileSync(p, 'utf8')
  S.writeStatus(p, 'hardened')
  const after = fs.readFileSync(p, 'utf8')
  assert.strictEqual(after, before.replace('status: draft', 'status: hardened'), 'any other byte change corrupts the spec')
  const q = writeSpec(tmpdir('nostatus'), '---\ndate: x\n---\n\n# T\n')
  S.writeStatus(q, 'done')
  assert.strictEqual(S.readSpec(q).frontmatter.status, 'done', 'a spec without a status line must gain one')
})

test('run sidecar round-trips next to the spec and clears completely', () => {
  const p = writeSpec(tmpdir('run'))
  assert.strictEqual(S.readRun(p), null, 'no sidecar means no run in flight')
  S.writeRun(p, { step: 'BUILD', attempts: { build: 1 } })
  assert.ok(fs.existsSync(p.replace(/\.md$/, '.run/state.json')), 'the sidecar lives at <spec>.run/state.json')
  assert.deepStrictEqual(S.readRun(p), { step: 'BUILD', attempts: { build: 1 } }, 'a crash must resume from the saved state')
  S.clearRun(p)
  assert.ok(!fs.existsSync(S.runDir(p)), 'DONE must leave no sidecar behind')
})

test('fanout lives in the git common dir, shared by every worktree', () => {
  const root = tmpdir('q')
  const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'lane')
  g('worktree', 'add', '-q', '-b', 'lane', wt)
  assert.ok(!('readQueue' in S) && !('writeQueue' in S), 'the queue file belongs to lib/queue.js')
  assert.strictEqual(S.readFanout(root), null, 'no fanout file means no batch')
  S.writeFanout(root, { step: 'PLAN', batch: [] })
  assert.strictEqual(S.readFanout(wt).step, 'PLAN', 'fanout state must be shared across worktrees')
})

test('AC-20261105-15-16 the release record lives in the git common dir: written, read from any worktree, cleared by null', () => {
  const root = tmpdir('rel')
  const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'lane')
  g('worktree', 'add', '-q', '-b', 'lane', wt)
  assert.strictEqual(S.readRelease(root), null, 'no green staging run, no record')
  S.writeRelease(root, { sha: 'abc', note: 'v1' })
  assert.deepStrictEqual(S.readRelease(wt), { sha: 'abc', note: 'v1' })
  assert.ok(fs.existsSync(path.join(root, '.git', 'spec-release.json')))
  S.writeRelease(root, null)
  assert.strictEqual(S.readRelease(root), null)
  assert.ok(!fs.existsSync(path.join(root, '.git', 'spec-release.json')))
  S.writeRelease(root, null) // clearing nothing is fine
})

test('proto, mocks and genesis files round-trip at their §2 paths', () => {
  const root = tmpdir('design')
  S.writeProto(root, 'cart', { status: { round: 1 }, pins: [] })
  assert.deepStrictEqual(S.readProto(root, 'cart'), { status: { round: 1 }, pins: [], contract: null }, 'unwritten proto files read as null')
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/cart/pins.json')), 'pins live under design/prototypes/<stem>')
  S.writeMocks(root, { seed: '# seed\n' })
  assert.deepStrictEqual(S.readMocks(root), { status: null, seed: '# seed\n' }, 'seed and status are independent')
  S.writeGenesis(root, { step: 'DISCOVERY' })
  assert.deepStrictEqual(S.readGenesis(root), { step: 'DISCOVERY' }, 'genesis status must round-trip')
  assert.ok(fs.existsSync(path.join(root, '.claude/genesis/status.json')), 'genesis status lives in .claude/genesis')
  const leftovers = fs.readdirSync(path.join(root, 'design/prototypes/cart')).filter((f) => f.endsWith('.tmp'))
  assert.deepStrictEqual(leftovers, [], 'atomic writes must not leave tmp files')
})

// ---- spec 20261105/04 D6, D7 -----------------------------------------------------------------
test('AC-20261105-04-8 specState: a live sidecar in the root or the lane worktree makes a hardened spec implementing; ended, STOPPED, DONE, draft, done and superseded keep the frontmatter', () => {
  const root = tmpdir('live'); gitRepo(root)
  const rel = 'specs/20261105/01-a.md'
  const put = (base, run) => { fs.mkdirSync(path.join(base, 'specs/20261105/01-a.run'), { recursive: true }); fs.writeFileSync(path.join(base, 'specs/20261105/01-a.run/state.json'), JSON.stringify(run)) }
  const wt = path.join(root, '.claude/worktrees/spec-01-a')
  assert.strictEqual(S.specState(root, rel, 'hardened'), 'hardened')
  put(wt, { step: 'BUILD' })
  assert.strictEqual(S.specState(root, rel, 'hardened'), 'implementing')
  assert.strictEqual(S.specState(root, rel, 'done'), 'done')
  assert.strictEqual(S.specState(root, rel, 'superseded'), 'superseded')
  assert.strictEqual(S.specState(root, rel, 'draft'), 'draft', 'a run never starts from draft: an amended spec with a kept lane sidecar stays draft')
  for (const run of [{ step: 'STOPPED', ended: true }, { step: 'STOPPED', why: 'after' }, { step: 'BUILD', ended: true }, { step: 'DONE' }]) {
    put(wt, run)
    assert.strictEqual(S.specState(root, rel, 'hardened'), 'hardened', JSON.stringify(run))
    assert.strictEqual(S.liveRun(root, rel), null)
  }
  fs.rmSync(wt, { recursive: true })
  put(root, { step: 'GATE' })
  assert.strictEqual(S.specState(root, rel, 'hardened'), 'implementing', 'a root sidecar counts the same')
  assert.deepStrictEqual(S.liveRun(root, rel), { step: 'GATE' })
})

test('AC-20261105-04-8 the worktree copy of the spec saying done never matters: only the sidecar is read there', () => {
  const root = tmpdir('live'); gitRepo(root)
  const wt = path.join(root, '.claude/worktrees/spec-01-a/specs/20261105')
  fs.mkdirSync(path.join(wt, '01-a.run'), { recursive: true })
  fs.writeFileSync(path.join(wt, '01-a.md'), '---\nstatus: done\n---\n# A\n')
  fs.writeFileSync(path.join(wt, '01-a.run/state.json'), '{"step":"REVIEW"}')
  assert.strictEqual(S.specState(root, 'specs/20261105/01-a.md', 'hardened'), 'implementing')
})

test('AC-20261105-04-9 a bracketless depends_on splits like the bracketed form; one value is a one-element list', () => {
  const fm = (v) => G.parseFrontmatter(`---\ndepends_on: ${v}\nstatus: x\n---\n`).frontmatter
  assert.deepStrictEqual(fm('specs/a.md, specs/b.md').depends_on, ['specs/a.md', 'specs/b.md'])
  assert.deepStrictEqual(fm('[specs/a.md, specs/b.md]').depends_on, ['specs/a.md', 'specs/b.md'])
  assert.deepStrictEqual(fm('specs/a.md').depends_on, ['specs/a.md'])
  assert.strictEqual(fm('x').status, 'x')
  assert.strictEqual(G.parseFrontmatter('---\nstatus: a, b\n---\n').frontmatter.status, 'a, b', 'only depends_on splits')
})

// ---- spec 20261105/06: the client says yes ------------------------------------------------------

test('AC-20261105-06-2 parseIntent reads the Client sign-off line: none is null, anything else is the text; frontmatter breaking is a boolean', () => {
  const doc = (line, fm = '') => `---\nstatus: draft\n${fm}---\n# T\n\n## Intent\n- You asked: x\n${line}\n`
  const at = (text) => S.readSpec(writeSpec(tmpdir('signoff'), text))
  assert.strictEqual(at(doc('- Client sign-off: none')).intent.signoff, null)
  assert.strictEqual(at(doc('- Client sign-off: none — JJ wrote the brief')).intent.signoff, null, 'none followed by a reason is still none')
  assert.strictEqual(at(doc('- Client sign-off: None | x — x')).intent.signoff, null)
  assert.strictEqual(at(doc('- Client sign-off: cut-off time — JJ chose 18:00')).intent.signoff, 'cut-off time — JJ chose 18:00')
  assert.strictEqual(at(doc('')).intent.signoff, null, 'no line reads as null')
  assert.strictEqual(at(doc('', 'breaking: true\n')).frontmatter.breaking, true)
  assert.strictEqual(at(doc('', 'breaking: false\n')).frontmatter.breaking, false)
})

test('AC-20261105-06-3 parseAssumptions reads A<n> lines: ask, ask with options, or a written fallback', () => {
  const rows = G.parseAssumptions([
    '- A1: the table is empty — if false: delete the rows in the migration',
    '- A2: old rows exist (D4) — if false: ask: keep the old rows | delete them',
    '- A3: a plain question — if false: ask',
    '- A4: **bold** — **if false:** ask: one | two | three',
    'not an assumption',
  ].join('\n'))
  assert.deepStrictEqual(rows.map((r) => r.id), ['A1', 'A2', 'A3', 'A4'])
  assert.deepStrictEqual(rows[0], { id: 'A1', text: 'the table is empty', line: '- A1: the table is empty — if false: delete the rows in the migration', arm: { ask: false, text: 'delete the rows in the migration', options: [] } })
  assert.deepStrictEqual(rows[1].arm, { ask: true, text: 'ask: keep the old rows | delete them', options: ['keep the old rows', 'delete them'] })
  assert.strictEqual(rows[1].text, 'old rows exist (D4)')
  assert.deepStrictEqual(rows[2].arm, { ask: true, text: 'ask', options: [] })
  assert.deepStrictEqual(rows[3].arm.options, ['one', 'two', 'three'])
})

test('AC-20261105-06-8 globToRe: ** crosses directories, * and ? stay inside one, and the match is root-anchored', () => {
  const m = (glob, f) => G.globToRe(glob).test(f)
  assert.ok(m('apps/server/src/db/**', 'apps/server/src/db/schema.ts'))
  assert.ok(m('apps/server/src/db/**', 'apps/server/src/db/deep/er/x.ts'))
  assert.ok(!m('apps/server/src/db/**', 'apps/web/x.ts'))
  assert.ok(m('src/*.ts', 'src/a.ts') && !m('src/*.ts', 'src/sub/a.ts'))
  assert.ok(m('src/?.ts', 'src/a.ts') && !m('src/?.ts', 'src/ab.ts'))
  assert.ok(m('apps/**/schema.ts', 'apps/schema.ts') && m('apps/**/schema.ts', 'apps/a/b/schema.ts'))
  assert.ok(!m('db/**', 'x/db/a.ts'), 'root-relative: no match below another directory')
  assert.ok(!m('a.b', 'axb'), 'a dot is a dot')
})


test('AC-20261105-10-7 splitCells keeps a pipe inside a backtick span, reads an escaped pipe, and runs an unclosed span to the line end', () => {
  assert.deepStrictEqual(G.splitCells('| x | ``y|z`` | w |'), ['x', '``y|z``', 'w'])
  assert.deepStrictEqual(G.splitCells('| a | `b|c` |'), ['a', '`b|c`'])
  assert.deepStrictEqual(G.splitCells('| `a``b|c` | d |'), ['`a``b|c`', 'd'], 'a one-backtick run does not close a two-backtick span')
  assert.deepStrictEqual(G.splitCells('| a \\| b | c |'), ['a | b', 'c'])
  assert.deepStrictEqual(G.splitCells('| a | `b | c | d'), ['a', '`b | c | d'], 'unclosed span: the rest of the line is inside it')
  assert.deepStrictEqual(G.splitCells('| a | b'), ['a', 'b'], 'no trailing pipe')
})

test('AC-20261105-10-6 decisionRows keeps a regex cell with pipes in backticks intact and still splits on a bare pipe', () => {
  const re = '`/\\b(cannot|only \\w+ can)\\b/i`'
  const rows = G.decisionRows(['| ID | Decision | Why |', '|----|----|----|', `| D1 | ${re} | because |`, '| D2 | a \\| b | outside backticks |'].join('\n'))
  assert.deepStrictEqual(rows[0], ['D1', re, 'because'])
  assert.deepStrictEqual(rows[1], ['D2', 'a | b', 'outside backticks'])
})

test('AC-20261105-10-6 filePlanTables reads a path cell `a|b.js` as one path and keeps the columns aligned', () => {
  const body = `# T\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| \`a|b.js\` | MODIFY | pipes \`x|y\` kept |\n| c.js | CREATE | plain |\n`
  const s = S.readSpec(writeSpec(tmpdir('pipes'), body))
  assert.deepStrictEqual(s.filePlan.map((r) => r.path), ['a|b.js', 'c.js'])
  assert.strictEqual(s.filePlan[0].action, 'MODIFY')
  assert.strictEqual(s.filePlan[0].summary, 'pipes `x|y` kept')
  assert.deepStrictEqual(s.filePaths, ['a|b.js', 'c.js'])
})

test('AC-20261105-09-2 slugOf is the first six words plus six hex of the whole symptom, at most 47 characters; symptoms differing after the sixth word differ', () => {
  const s = S.slugOf('Login button stays disabled after a failed submit, every time')
  assert.match(s, /^login-button-stays-disabled-after-a-[0-9a-f]{6}$/)
  assert.ok(s.length <= 47)
  assert.notStrictEqual(S.slugOf('one two three four five six seven'), S.slugOf('one two three four five six eight'))
  assert.strictEqual(S.slugOf('  one two three four five six seven '), S.slugOf('one two three four five six seven'), 'surrounding blanks are not part of the symptom')
  const long = S.slugOf('internationalization-misconfiguration characteristically unreasonably overcomplicated extraordinarily x')
  assert.ok(long.length <= 47 && /-[0-9a-f]{6}$/.test(long) && !/--/.test(long), long)
  assert.match(S.slugOf('ログインできない'), /^fix-[0-9a-f]{6}$/, 'a symptom with no ascii words still gets a slug')
})

test('gitCommonDir names one dir one way: a root reached through a symlink resolves the same as from a worktree', (t) => {
  const d = tmpdir('commondir'); const g = gitRepo(d)
  const link = path.join(tmpdir('link'), 'repo')
  try { fs.symlinkSync(d, link, 'junction') } catch { return t.skip('this OS refuses symlinks here') }
  const wt = path.join(d, '.claude/worktrees/w'); g('worktree', 'add', '-q', '-b', 'w', wt, 'main')
  const real = fs.realpathSync.native(path.join(d, '.git'))
  assert.strictEqual(S.gitCommonDir(link), real, 'the main checkout through a symlink')
  assert.strictEqual(S.gitCommonDir(wt), real, 'a worktree')
  assert.strictEqual(S.fixRunPath(link, 'x-abcdef'), S.fixRunPath(d, 'x-abcdef'))
})

test('fixRunPath is <git-dir>/spec-fix/<slug>.run/state.json: the main checkout\'s git dir, or a lane worktree\'s own, which goes with it', () => {
  const d = tmpdir('fixrun'); const g = gitRepo(d)
  const p = S.fixRunPath(d, 'x-abcdef')
  assert.strictEqual(p, path.join(fs.realpathSync(d), '.git', 'spec-fix', 'x-abcdef.run', 'state.json'))
  assert.strictEqual(S.fixRunDir(d, 'x-abcdef'), path.dirname(p))
  const wt = path.join(d, '.claude/worktrees/w'); g('worktree', 'add', '-q', '-b', 'w', wt, 'main')
  assert.strictEqual(S.fixRunPath(wt, 'x-abcdef'), path.join(fs.realpathSync(d), '.git', 'worktrees', 'w', 'spec-fix', 'x-abcdef.run', 'state.json'))
  S.writeJson(S.fixRunPath(wt, 'x-abcdef'), { step: 'DONE' }); g('worktree', 'remove', wt)
  assert.ok(!fs.existsSync(S.fixRunPath(d, 'x-abcdef').replace('.git/spec-fix', '.git/worktrees/w/spec-fix')), 'removing the worktree removes its fix state')
})
