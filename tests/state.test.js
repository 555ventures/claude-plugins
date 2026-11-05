'use strict'
// Pins lib/state.js: the single owner of every on-disk file in architecture §2.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
const S = require(path.join(SPEC, 'scripts/lib/state.js'))

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

test('queue and fanout live in the git common dir, shared by every worktree', () => {
  const root = tmpdir('q')
  const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'lane')
  g('worktree', 'add', '-q', '-b', 'lane', wt)
  assert.deepStrictEqual(S.readQueue(root), { version: 2, seq: 0, items: [] }, 'an absent queue reads as empty')
  S.writeQueue(wt, { version: 2, seq: 1, items: [{ id: 'q1', kind: 'prompt', payload: 'x' }] })
  assert.ok(fs.existsSync(path.join(root, '.git', 'spec-queue.json')), 'the queue must sit in the common git dir, not the checkout')
  assert.strictEqual(S.readQueue(root).items[0].id, 'q1', 'a lane write must be visible from the main root')
  assert.strictEqual(S.readFanout(root), null, 'no fanout file means no batch')
  S.writeFanout(root, { step: 'PLAN', batch: [] })
  assert.strictEqual(S.readFanout(wt).step, 'PLAN', 'fanout state must be shared across worktrees')
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
test('AC-20261105-04-8 specState: a live sidecar in the root or the lane worktree makes a hardened spec implementing; ended, PARKED, AMENDED, done and superseded keep the frontmatter', () => {
  const root = tmpdir('live'); gitRepo(root)
  const rel = 'specs/20261105/01-a.md'
  const put = (base, run) => { fs.mkdirSync(path.join(base, 'specs/20261105/01-a.run'), { recursive: true }); fs.writeFileSync(path.join(base, 'specs/20261105/01-a.run/state.json'), JSON.stringify(run)) }
  const wt = path.join(root, '.claude/worktrees/spec-01-a')
  assert.strictEqual(S.specState(root, rel, 'hardened'), 'hardened')
  put(wt, { step: 'BUILD' })
  assert.strictEqual(S.specState(root, rel, 'hardened'), 'implementing')
  assert.strictEqual(S.specState(root, rel, 'done'), 'done')
  assert.strictEqual(S.specState(root, rel, 'superseded'), 'superseded')
  for (const run of [{ step: 'PARKED', ended: true }, { step: 'AMENDED' }, { step: 'BUILD', ended: true }, { step: 'DONE' }]) {
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
  const fm = (v) => S.parseFrontmatter(`---\ndepends_on: ${v}\nstatus: x\n---\n`).frontmatter
  assert.deepStrictEqual(fm('specs/a.md, specs/b.md').depends_on, ['specs/a.md', 'specs/b.md'])
  assert.deepStrictEqual(fm('[specs/a.md, specs/b.md]').depends_on, ['specs/a.md', 'specs/b.md'])
  assert.deepStrictEqual(fm('specs/a.md').depends_on, ['specs/a.md'])
  assert.strictEqual(fm('x').status, 'x')
  assert.strictEqual(S.parseFrontmatter('---\nstatus: a, b\n---\n').frontmatter.status, 'a, b', 'only depends_on splits')
})
