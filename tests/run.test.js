'use strict'
// Pins spec/scripts/run.js: the OPEN → … → DONE loop on a tmp host, repair/fix caps, ESCALATE
// choices, lane mode (MERGE_READY, PENDING_QUESTION, resume after answer), --in-place, conflicts.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const pending = require(path.join(SPEC, 'scripts/lib/pending.js'))

const REL = 'specs/20261104/01-thing.md'
const SPEC_DOC = `---
date: 2026-11-04
status: hardened
area: core
depends_on: []
brief: n/a
architecture: false
---

# Thing

## Intent
- You asked: make a thing
- I will build:
  - feature.txt holding the thing
- I will not touch:
  - a.txt
- Architecture or behaviour change: no

## Goal

feature.txt exists.

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| feature.txt | CREATE | the thing |

## Acceptance Criteria

- **AC-20261104-01-1**: WHEN the build is done THE SYSTEM SHALL have feature.txt.
`
// testCommand: red while a RED file exists; every real run appends a line to $RUN_COUNTER.
const CHECK = `const fs = require('fs')
if (process.env.RUN_COUNTER) fs.appendFileSync(process.env.RUN_COUNTER, process.cwd() + '\\n')
if (fs.existsSync('RED')) { console.error('FAIL: RED flag present'); process.exit(1) }
console.log('ok')
`

function fixture({ ignoreRun = true, status = 'hardened', cfg = {}, files = {} } = {}) {
  const dir = tmpdir('run')
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  put('.gitignore', '.claude/worktrees/\n' + (ignoreRun ? 'specs/**/*.run/\n' : ''))
  put('check.js', CHECK)
  put('a.txt', 'a\n')
  put('.claude/spec.config.json', JSON.stringify({ testCommand: 'node check.js', ...cfg }))
  put(REL, SPEC_DOC.replace('status: hardened', 'status: ' + status))
  for (const [f, t] of Object.entries(files)) put(f, t)
  const g = gitRepo(dir)
  const counter = path.join(tmpdir('counter'), 'runs.log')
  const runIn = (root, ...a) => runNode('scripts/run.js', [REL, '--root', root, ...a], { env: { RUN_COUNTER: counter } })
  return {
    dir, g, counter, runIn,
    run: (...a) => runIn(dir, ...a),
    wt: path.join(dir, '.claude/worktrees/spec-01-thing'),
    runs: () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').trim().split('\n').length : 0),
    state: (root = dir) => st.readRun(path.join(root, REL)),
    status: (root = dir) => st.readSpec(path.join(root, REL)).frontmatter.status,
    findings: (findings) => {
      const f = path.join(tmpdir('findings'), 'f.json')
      fs.writeFileSync(f, JSON.stringify({ findings, verdict: findings.some((x) => x.severity === 'blocking') ? 'fix' : 'clean' }))
      return f
    },
  }
}

const ok = (r) => { assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout }
const BLOCKING = [{ severity: 'blocking', file: 'feature.txt', line: 1, summary: 'wrong thing', evidence: 'cat' }]

test('the whole loop: OPEN → BUILD → GATE → REVIEW → COMMIT → MERGE → DONE', () => {
  const h = fixture()
  const out = ok(h.run())
  assert.match(out, /^▶ BUILD\n/, 'OPEN is automatic and settles on BUILD')
  assert.ok(out.includes('- You asked: make a thing') && out.includes('  - feature.txt holding the thing'), 'the builder brief carries the Intent block verbatim')
  assert.ok(out.includes(h.wt) && out.includes('feature.txt'), 'the brief names the worktree and the File Plan')
  assert.ok(fs.existsSync(path.join(h.wt, REL)), 'OPEN creates the worktree')
  assert.strictEqual(h.state().branch, 'spec/01-thing')
  assert.strictEqual(h.status(), 'implementing', 'OPEN marks the spec implementing')
  assert.ok(pending.isLane(h.wt), 'OPEN marks the worktree so agents cannot run git there')

  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REVIEW/, 'a green gate goes straight to REVIEW')
  assert.strictEqual(h.runs(), 1, 'the gate ran once in the worktree')
  const diff = fs.readFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/, 'REVIEW writes the working-tree diff for the reviewer')
  const j = JSON.parse(ok(h.run('--json')))
  assert.strictEqual(j.step, 'REVIEW')
  assert.match(j.mark, /--mark reviewed --file \S+findings\.json/, 'the reviewer is told where to write findings')

  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings([{ severity: 'advisory', summary: 'nit' }])))
  assert.match(cp, /REVIEW → DONE/, 'no blocking findings → commit, merge, done without the session')
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n', 'the build is merged into trunk')
  assert.match(h.g('log', '--format=%s', 'main'), /build\(20261104\/01\): Thing/, 'the commit message names the spec id and title')
  assert.strictEqual(h.status(), 'done')
  assert.strictEqual(h.g('status', '--porcelain'), '', 'trunk is left clean')
  assert.strictEqual(h.state(), null, 'the sidecar is cleared')
  assert.ok(!fs.existsSync(h.wt), 'the worktree is removed')
  assert.strictEqual(h.g('branch', '--list', 'spec/01-thing'), '', 'the merged branch is deleted')
  assert.strictEqual(h.runs(), 1, 'the trunk gate after an unchanged merge is a cache hit')
  assert.strictEqual(h.run().status, 2, 'a done spec is refused')
})

test('red gate: two repairs then ESCALATE; retry bumps to opus with fresh attempts; park queues a fix', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'RED'), '')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR/)
  const repair = ok(h.run())
  assert.match(repair, /FAIL: RED flag present/, 'REPAIR carries the failure tail')
  assert.match(repair, /model opus/, 'the builder retries on opus after one red gate')
  assert.strictEqual(h.run('--mark', 'built').status, 2, 'a mark for another step is refused')
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → REPAIR/)
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → ESCALATE/, 'REPAIR is capped at 2')
  assert.match(ok(h.run()), /--mark escalate <retry\|park\|amend>/)
  assert.strictEqual(h.run('--mark', 'escalate', 'nope').status, 2, 'an unknown choice is refused')

  assert.match(ok(h.run('--mark', 'escalate', 'retry')), /ESCALATE → REPAIR/)
  assert.deepStrictEqual([h.state().attempts.repair, h.state().opus], [0, true], 'retry resets attempts and pins opus')
  ok(h.run('--mark', 'repaired'))
  assert.match(ok(h.run('--mark', 'repaired')), /→ ESCALATE/)

  assert.match(ok(h.run('--mark', 'escalate', 'park')), /ESCALATE → PARKED/)
  const items = st.readQueue(h.dir).items
  assert.strictEqual(items.length, 1)
  assert.strictEqual(items[0].kind, 'prompt')
  assert.ok(items[0].payload.startsWith(`/spec:fix ${REL} — `), 'park queues a /spec:fix item for the spec')
  assert.strictEqual(h.status(), 'hardened', 'park sets the spec back to hardened')
  assert.strictEqual(h.state(), null, 'park ends the run')
  assert.ok(!pending.isLane(h.wt), 'park removes the lane marker')
})

test('blocking findings: one FIX round, then ESCALATE; amend sets the spec to draft', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  assert.strictEqual(h.run('--mark', 'reviewed').status, 2, 'reviewed needs --file')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING))), /REVIEW → FIX/)
  assert.match(ok(h.run()), /wrong thing/, 'the fix brief carries the blocking findings')
  assert.match(ok(h.run('--mark', 'fixed')), /FIX → REVIEW/, 'a fix re-gates, then re-reviews')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING))), /REVIEW → ESCALATE/, 'FIX is capped at 1')
  assert.match(ok(h.run('--mark', 'escalate', 'amend')), /ESCALATE → AMENDED/)
  assert.strictEqual(h.status(), 'draft')
  assert.strictEqual(h.state(), null)
})

test('--in-place builds and commits on the current branch with no worktree', () => {
  const h = fixture()
  const out = ok(h.run('--in-place'))
  assert.match(out, /📌 Auto-picked in place — --in-place/)
  assert.ok(!fs.existsSync(path.join(h.dir, '.claude/worktrees')), 'no worktree is created')
  assert.strictEqual(h.state().worktree, '.')
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE/)
  assert.strictEqual(h.g('show', 'HEAD:feature.txt'), 'thing\n')
  assert.match(h.g('log', '-1', '--format=%s'), /^build\(20261104\/01\)/)
  assert.strictEqual(h.status(), 'done')
  assert.strictEqual(h.g('status', '--porcelain'), '')
  assert.ok(!pending.isLane(h.dir), 'DONE removes the marker')
})

test('lane mode: PENDING_QUESTION at ESCALATE, resume after the answer, stop at MERGE_READY', () => {
  const h = fixture()
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main')
  pending.markLane(h.wt)
  const out = ok(h.runIn(h.wt))
  assert.match(out, /^▶ BUILD/)
  assert.match(out, /📌 Auto-picked in place — fanout lane/, 'a lane runs in place in its worktree')
  assert.strictEqual(h.state(h.wt).worktree, '.')
  assert.strictEqual(h.g('worktree', 'list').trim().split('\n').length, 2, 'no second worktree in a lane')

  fs.writeFileSync(path.join(h.wt, 'RED'), '')
  ok(h.runIn(h.wt, '--mark', 'built'))
  ok(h.runIn(h.wt, '--mark', 'repaired'))
  ok(h.runIn(h.wt, '--mark', 'repaired'))
  const q = ok(h.runIn(h.wt))
  assert.match(q, /PENDING_QUESTION/, 'a lane never asks: it prints PENDING_QUESTION and exits 0')
  const doc = pending.readPending(h.wt)
  assert.deepStrictEqual(doc.options.map((o) => o.label), ['retry', 'park', 'amend'])
  assert.strictEqual(doc.answer, null)
  assert.match(ok(h.runIn(h.wt)), /PENDING_QUESTION/, 'an unanswered question keeps the lane stopped')
  assert.strictEqual(h.state(h.wt).step, 'ESCALATE')

  pending.answerPending(h.wt, 'retry')
  fs.rmSync(path.join(h.wt, 'RED'))
  assert.match(ok(h.runIn(h.wt)), /^▶ REPAIR/, 'the re-dispatched lane continues with the recorded answer')
  assert.strictEqual(pending.readPending(h.wt), null, 'the answer is consumed')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  assert.match(ok(h.runIn(h.wt, '--mark', 'repaired')), /REPAIR → REVIEW/)
  assert.match(ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → MERGE_READY/)

  assert.strictEqual(h.state(h.wt).step, 'MERGE_READY', 'fanout reads MERGE_READY from the lane sidecar')
  assert.match(h.g('log', '-1', '--format=%s', 'spec/01-thing'), /^build\(20261104\/01\)/, 'the lane branch is committed')
  assert.ok(!h.g('ls-tree', '--name-only', 'main').split('\n').includes('feature.txt'), 'a lane does not merge')
  assert.notStrictEqual(h.status(h.wt), 'done', 'a lane does not write status: done')
  assert.ok(fs.existsSync(h.wt), 'a lane keeps its worktree')
  assert.match(ok(h.runIn(h.wt)), /^▶ MERGE_READY/, 'a re-run at MERGE_READY is a no-op exit 0')
})

test('merge conflicts stop at CONFLICTS until the markers are gone', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'a.txt'), 'branch\n')
  ok(h.run('--mark', 'built'))
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'trunk\n')
  h.g('commit', '-q', '-m', 'trunk edit', '--', 'a.txt')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → CONFLICTS/)
  assert.deepStrictEqual(h.state().conflicts, ['a.txt'])
  assert.strictEqual(h.run('--mark', 'conflicts-resolved').status, 2, 'markers left in a file are refused')
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'both\n')
  assert.match(ok(h.run('--mark', 'conflicts-resolved')), /CONFLICTS → DONE/)
  assert.strictEqual(h.g('show', 'main:a.txt'), 'both\n')
  assert.strictEqual(h.status(), 'done')
})

test('refusals: run sidecars not git-ignored, a draft spec', () => {
  const unignored = fixture({ ignoreRun: false })
  const r = unignored.run()
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /specs\/\*\*\/\*\.run\//, 'the remedy names the ignore line')
  const draft = fixture({ status: 'draft' })
  assert.strictEqual(draft.run().status, 2)
  assert.strictEqual(draft.state(), null, 'a refused OPEN writes no state')
})
