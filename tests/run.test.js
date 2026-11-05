'use strict'
// Pins spec/scripts/run.js: the OPEN → … → DONE loop on a tmp host, repair/fix caps, ESCALATE
// choices, lane mode (MERGE_READY, PENDING_QUESTION, resume after answer), --in-place, conflicts.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { tmpdir, gitRepo, runNode, runBash, SPEC } = require('./helpers')
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

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | plain text, no JSON \\| no YAML | ADR-0001 |

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

function fixture({ ignoreRun = true, status = 'hardened', cfg = {}, files = {}, dirName } = {}) {
  const dir = dirName || tmpdir('run')
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
  assert.ok(out.includes('## Decisions\n- D1: plain text, no JSON | no YAML — ADR-0001'), 'the builder brief carries the Decisions, escaped pipes unescaped')
  assert.ok(out.includes('## Acceptance Criteria\n- AC-20261104-01-1: WHEN the build is done'), 'the builder brief carries the ACs')
  assert.ok(fs.existsSync(path.join(h.wt, REL)), 'OPEN creates the worktree')
  assert.strictEqual(h.state().branch, 'spec/01-thing')
  assert.strictEqual(h.status(), 'hardened', "OPEN leaves the main checkout's copy alone")
  assert.strictEqual(h.g('status', '--porcelain'), '', 'the main checkout stays clean; the sidecar is the in-flight state')
  assert.ok(pending.isLane(h.wt), 'OPEN marks the worktree so agents cannot run git there')

  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REVIEW;.*\ngate: green \(ran \d+ms\)\n/, 'a green gate goes straight to REVIEW and the checkpoint shows it')
  assert.strictEqual(h.runs(), 1, 'the gate ran once in the worktree')
  const diff = fs.readFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/, 'REVIEW writes the working-tree diff for the reviewer')
  const j = JSON.parse(ok(h.run('--json')))
  assert.strictEqual(j.step, 'REVIEW')
  assert.match(j.mark, /--mark reviewed --file \S+findings\.json/, 'the reviewer is told where to write findings')
  assert.ok(j.body.includes('## Decisions\n- D1: plain text, no JSON | no YAML — ADR-0001'), 'the reviewer brief carries the Decisions')

  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings([{ severity: 'advisory', summary: 'nit' }])))
  assert.match(cp, /REVIEW → DONE/, 'no blocking findings → commit, merge, done without the session')
  assert.match(cp, /^review: clean$/m, 'the checkpoint shows the review result')
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
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — \S/, 'a red gate shows its first tail line')
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
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING))), /REVIEW → FIX;.*\nreview: 1 blocking → FIX/)
  assert.match(ok(h.run()), /wrong thing/, 'the fix brief carries the blocking findings')
  assert.match(ok(h.run('--mark', 'fixed')), /FIX → REVIEW/, 'a fix re-gates, then re-reviews')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING))), /REVIEW → ESCALATE/, 'FIX is capped at 1')
  assert.match(ok(h.run('--mark', 'escalate', 'amend')), /ESCALATE → AMENDED/)
  assert.strictEqual(h.status(), 'draft')
  assert.strictEqual(h.state(), null)
})

test('a FIX round that edits the spec text still merges with no manual step', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  assert.match(ok(h.run()), /Files changed outside the File Plan: none\n/, 'a status-only spec change is not listed')
  ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING)))
  const wtSpec = path.join(h.wt, REL)
  fs.writeFileSync(wtSpec, fs.readFileSync(wtSpec, 'utf8').replace('SHALL have feature.txt', 'SHALL have a non-empty feature.txt'))
  ok(h.run('--mark', 'fixed'))
  assert.ok(ok(h.run()).includes(`Files changed outside the File Plan: ${REL} (spec text edited)`), 'the reviewer sees the spec edit')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE/)
  const merged = h.g('show', `main:${REL}`)
  assert.match(merged, /SHALL have a non-empty feature\.txt/, 'trunk carries the edited spec text')
  assert.match(merged, /^status: done$/m)
  assert.strictEqual(h.g('status', '--porcelain'), '', 'trunk is left clean')
})

test('--in-place builds and commits on the current branch with no worktree', () => {
  const h = fixture()
  const out = ok(h.run('--in-place'))
  assert.match(out, /📌 Auto-picked in place — --in-place/)
  assert.strictEqual(h.status(), 'implementing', 'in place, the single checkout is marked implementing')
  assert.ok(!fs.existsSync(path.join(h.dir, '.claude/worktrees')), 'no worktree is created')
  assert.strictEqual(h.state().worktree, '.')
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE/)
  assert.strictEqual(h.g('show', 'HEAD:feature.txt'), 'thing\n')
  assert.match(h.g('log', '-1', '--format=%s'), /^build\(20261104\/01\)/)
  assert.match(h.g('show', `HEAD:${REL}`), /^status: done$/m, 'the build commit carries status: done')
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

test('the run marker is on only while a builder or reviewer is out; a stale run marker is not a lane', () => {
  const h = fixture()
  const hook = (cwd, command) => runBash('scripts/block-worker-git.sh', [], { input: JSON.stringify({ cwd, tool_input: { command } }) }).status
  fs.writeFileSync(path.join(h.dir, '.git', 'spec-lane-open'), 'run') // left by a crashed earlier run
  ok(h.run('--in-place'))
  assert.strictEqual(h.state().lane, false, 'a run marker left behind does not make the main checkout a lane')
  assert.ok(pending.isLane(h.dir), 'BUILD is printed: the builder is out, the checkout is marked')
  assert.strictEqual(hook(h.dir, 'git commit -m x'), 2, 'agents cannot commit while the builder is out')
  fs.writeFileSync(path.join(h.dir, 'RED'), '')
  ok(h.run('--mark', 'built'))
  assert.strictEqual(h.state().step, 'REPAIR')
  assert.ok(pending.isLane(h.dir), 'REPAIR dispatches a builder: marked')
  ok(h.run('--mark', 'repaired'))
  ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().step, 'ESCALATE')
  assert.ok(!pending.isLane(h.dir), 'no agent is out at ESCALATE: the marker is off')
  assert.strictEqual(hook(h.dir, 'git commit -m x'), 0, "the user's own commits are not blocked between dispatches")
  ok(h.run('--mark', 'escalate', 'retry'))
  assert.ok(pending.isLane(h.dir), 'retry dispatches a builder again: marked')
  fs.rmSync(path.join(h.dir, 'RED'))
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().step, 'REVIEW')
  assert.ok(pending.isLane(h.dir), 'REVIEW dispatches a reviewer: marked')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE/)
  assert.ok(!pending.isLane(h.dir), 'DONE leaves no marker')
})

test('reviewer findings: malformed or ambiguous files are refused; any blocking finding means FIX', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const findingsPath = path.join(h.dir, 'specs/20261104/01-thing.run/findings.json')
  const put = (doc) => { const f = path.join(tmpdir('f'), 'f.json'); fs.writeFileSync(f, typeof doc === 'string' ? doc : JSON.stringify(doc)); return f }
  const refused = (f, why) => { const r = h.run('--mark', 'reviewed', '--file', f); assert.strictEqual(r.status, 2, why); assert.strictEqual(h.state().step, 'REVIEW', why); return r.stderr }
  refused(path.join(h.dir, 'nope.json'), 'a missing file')
  refused(put('{"findings": [ '), 'truncated JSON')
  assert.match(refused(put({ findings: [{ severity: 'critical', summary: 'x' }], verdict: 'fix' }), 'an unknown severity'), /blocking or advisory/)
  refused(put({ findings: ['just a string'] }), 'a finding that is not an object')
  refused(put({ findings: [{ severity: 'advisory', summary: 'x' }], verdict: 'fix' }), 'verdict fix with nothing blocking')
  refused(put({ findings: [], verdict: 'lgtm' }), 'an unknown verdict')
  const r = h.run('--mark', 'reviewed', '--file', put({ findings: BLOCKING, verdict: 'clean' }))
  assert.match(ok(r), /REVIEW → FIX/, 'a blocking finding wins over a clean verdict')
  fs.writeFileSync(findingsPath, JSON.stringify({ findings: BLOCKING, verdict: 'fix' }))
  ok(h.run('--mark', 'fixed'))
  assert.strictEqual(h.state().step, 'REVIEW')
  assert.ok(!fs.existsSync(findingsPath), "entering REVIEW deletes the last round's findings, so a stale file is never re-read")
})

test('conflicts-resolved commits the merge without sweeping untracked files of the main checkout', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'a.txt'), 'branch\n')
  ok(h.run('--mark', 'built'))
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'trunk\n')
  h.g('commit', '-q', '-m', 'trunk edit', '--', 'a.txt')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → CONFLICTS/)
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'both\n')
  fs.writeFileSync(path.join(h.dir, 'my-notes.txt'), 'private\n')
  assert.match(ok(h.run('--mark', 'conflicts-resolved')), /CONFLICTS → DONE/)
  assert.ok(!h.g('ls-tree', '-r', '--name-only', 'HEAD').split('\n').includes('my-notes.txt'), 'the untracked file is not committed')
  assert.match(h.g('status', '--porcelain'), /\?\? my-notes\.txt/, 'it is still untracked')
  assert.strictEqual(h.g('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ').length, 3, 'the result is a merge commit')
  assert.strictEqual(h.g('show', 'HEAD:a.txt'), 'both\n')
})

test('a crash after the worktree is removed resumes at FINISH instead of re-merging a deleted branch', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  // Play MERGE and the first half of FINISH by hand, then "crash" with the sidecar at FINISH.
  h.g('-C', h.wt, 'add', '-A'); h.g('-C', h.wt, 'commit', '-q', '-m', 'build')
  h.g('merge', '-q', '--no-ff', '--no-edit', 'spec/01-thing')
  h.g('worktree', 'remove', '--force', h.wt); h.g('branch', '-D', 'spec/01-thing')
  const s = h.state()
  st.writeRun(path.join(h.dir, REL), { ...s, step: 'FINISH', review: { findings: [], verdict: 'clean' }, mergeSha: h.g('rev-parse', 'HEAD').trim(), marked: false })
  const out = ok(h.run())
  assert.match(out, /^▶ DONE/)
  assert.strictEqual(h.status(), 'done')
  assert.strictEqual(h.state(), null)
})

test('paths with spaces: the printed mark lines run as printed and the hook sees the quoted worktree', () => {
  const base = tmpdir('sp')
  const h = fixture({ dirName: path.join(base, 'my host') })
  const j = JSON.parse(ok(h.run('--json')))
  assert.strictEqual(j.step, 'BUILD')
  assert.ok(fs.existsSync(h.wt))
  const hook = runBash('scripts/block-worker-git.sh', [], { input: JSON.stringify({ cwd: h.dir, tool_input: { command: `cd "${h.wt}" && git commit -m x` } }) })
  assert.strictEqual(hook.status, 2, 'a quoted worktree path with spaces is still a lane target')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  const r = spawnSync('bash', ['-c', j.mark.replace(/^node /, `"${process.execPath}" `)], { encoding: 'utf8', env: { ...process.env, RUN_COUNTER: h.counter } })
  assert.strictEqual(r.status, 0, r.stderr)
  const rev = JSON.parse(ok(h.run('--json')))
  assert.strictEqual(rev.step, 'REVIEW')
  const f = h.findings([])
  const r2 = spawnSync('bash', ['-c', rev.mark.replace(/^node /, `"${process.execPath}" `).replace(/--file .*$/, `--file '${f}'`)], { encoding: 'utf8' })
  assert.strictEqual(r2.status, 0, r2.stderr)
  assert.strictEqual(h.status(), 'done')
  assert.ok(/--file '[^']+ host[^']+findings\.json'$/.test(rev.mark), 'the findings path is quoted in the mark line')
})

test('a commit hook that rejects the build commit sends it to REPAIR, not a dead end', () => {
  const h = fixture()
  fs.mkdirSync(path.join(h.dir, '.git/hooks'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, '.git/hooks/pre-commit'), '#!/bin/sh\ngit diff --cached | grep -q TODO && { echo "[lint] no TODO" >&2; exit 1; }; exit 0\n', { mode: 0o755 })
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'TODO thing\n')
  ok(h.run('--mark', 'built'))
  const out = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(out, /REVIEW → REPAIR/, 'the hook refusal is treated as a red gate')
  assert.match(ok(h.run()), /rejected[\s\S]*\[lint\] no TODO/, 'the builder sees the hook output')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'repaired'))
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE/)
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n')
})

test('OPEN refuses a dirty tracked tree, a fanout lane worktree and a spec branch with unmerged commits; an already-merged branch is re-pointed', () => {
  const h = fixture()
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'wip\n')
  let r = h.run()
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /uncommitted tracked changes/)
  h.g('checkout', '--', 'a.txt')
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt)
  pending.markLane(h.wt, 'fanout')
  r = h.run()
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /fanout lane in flight/)
  pending.unmarkLane(h.wt); h.g('worktree', 'remove', '--force', h.wt)
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'stale\n') // a commit only the abandoned branch holds
  h.g('checkout', '-q', 'spec/01-thing'); h.g('commit', '-q', '-am', 'abandoned'); h.g('checkout', '-q', 'main')
  r = h.run()
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /commits not on main/)
  h.g('branch', '-f', 'spec/01-thing', 'main') // now an ancestor: safe to re-point
  assert.match(ok(h.run()), /^▶ BUILD/)
  assert.strictEqual(h.g('rev-parse', 'spec/01-thing').trim(), h.g('rev-parse', 'main').trim())
})

test('OPEN refuses a detached HEAD and a trunk that is not a branch', () => {
  const h = fixture()
  h.g('checkout', '-q', '--detach')
  let r = h.run(); assert.strictEqual(r.status, 2); assert.match(r.stderr, /detached HEAD/)
  h.g('checkout', '-q', 'main')
  fs.writeFileSync(path.join(h.dir, '.claude/spec.config.json'), JSON.stringify({ testCommand: 'node check.js', trunk: 'master' }))
  h.g('commit', '-q', '-am', 'trunk master')
  r = h.run(); assert.strictEqual(r.status, 2); assert.match(r.stderr, /trunk "master" is not a branch/)
})

test('--in-place on a feature branch finishes on that branch and never merges into trunk', () => {
  const h = fixture()
  h.g('checkout', '-q', '-b', 'feat/pr')
  ok(h.run('--in-place'))
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const out = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(out, /REVIEW → DONE/)
  assert.match(out, /built and reviewed on feat\/pr/)
  assert.strictEqual(h.g('rev-parse', 'main').trim(), h.g('rev-list', '--max-parents=0', 'HEAD').trim(), 'main did not move: the branch is for a PR')
  assert.strictEqual(h.status(), 'done')
})

test('an aborted squash merge is retried on the next run instead of finishing without the code', () => {
  const h = fixture({ cfg: { mergeStrategy: 'squash' } })
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'a.txt'), 'branch\n')
  ok(h.run('--mark', 'built'))
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'trunk\n')
  h.g('commit', '-q', '-m', 'trunk edit', '--', 'a.txt')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → CONFLICTS/)
  assert.match(ok(h.run()), /git reset --merge/, 'the abort remedy works for every merge strategy')
  h.g('reset', '--merge')
  assert.match(ok(h.run()), /^▶ CONFLICTS/, 'nothing merges by itself after an abort')
  assert.match(ok(h.run('--mark', 'conflicts-resolved')), /CONFLICTS → CONFLICTS/, 'the mark retries the merge, which conflicts again')
  assert.ok(fs.existsSync(h.wt), 'the built lane is never thrown away')
  assert.match(h.g('show', `main:${REL}`), /status: hardened/, 'nothing landed on trunk yet')
})

test('the hook blocks destructive git in every checkout while a lane is open, and git commands inside the lane', () => {
  const h = fixture()
  const hook = (cwd, command) => runBash('scripts/block-worker-git.sh', [], { input: JSON.stringify({ cwd, tool_input: { command } }) })
  assert.strictEqual(hook(h.dir, 'git reset --hard').status, 0, 'no lane open: the user is free')
  ok(h.run()) // BUILD: a builder is out in the worktree lane
  assert.strictEqual(hook(h.dir, 'git reset --hard').status, 2, 'main checkout, destructive verb, lane open')
  assert.strictEqual(hook(h.dir, 'git stash').status, 2)
  assert.strictEqual(hook(h.dir, 'git checkout -- .').status, 2)
  assert.strictEqual(hook(h.dir, 'git commit -m x').status, 0, 'committing in the main checkout is the user\'s own business')
  assert.strictEqual(hook(h.dir, 'git status').status, 0)
  assert.strictEqual(hook(h.wt, 'git stash').status, 2, 'inside the lane')
  assert.strictEqual(hook(h.wt, 'git clean -fdx').status, 2)
  assert.strictEqual(hook(h.wt, 'git commit -m x').status, 2)
  assert.strictEqual(hook(h.wt, 'git add -A').status, 0)
  assert.strictEqual(hook(h.dir, 'git branch').status, 0, 'listing branches is harmless in the main checkout')
  assert.strictEqual(hook(h.dir, 'git worktree list && git stash list && git branch -a').status, 0)
  assert.strictEqual(hook(h.dir, 'git branch && git reset --hard').status, 2, 'a harmless verb never unlocks the rest of the command')
  assert.strictEqual(hook(h.dir, 'git commit -m x && git reset --hard').status, 2, 'nor does a lane-only verb placed first')
  assert.strictEqual(hook(h.dir, 'git branch -v --delete --force feat').status, 2, 'long-form delete is not a listing')
  for (const c of ['git branch -v --mov main gone', 'git branch -a -C side o4', 'git branch -r --dele X', 'git stash -m list', 'git stash -- list', 'timeout 30 git reset --hard', 'nice -n 5 git clean -fdx', 'xargs -0 git checkout -- .']) assert.strictEqual(hook(h.dir, c).status, 2, c)
  for (const c of ['git branch --merged', 'git branch --format=%(refname)', 'git stash list', 'git stash show -p']) assert.strictEqual(hook(h.dir, c).status, 0, c)
  assert.strictEqual(hook(h.dir, 'git branch -D x').status, 2); assert.strictEqual(hook(h.dir, 'git checkout -b feat').status, 2, 'moving the checkout mid-run breaks the merge')
  assert.strictEqual(hook(h.wt, 'git branch').status, 2, 'inside the lane every blocked verb stays blocked')
  const other = tmpdir('other'); gitRepo(other)
  assert.strictEqual(hook(h.dir, `git -C ${other} reset --hard`).status, 0, 'another repo is not guarded by this one\'s lane')
  assert.strictEqual(hook(h.dir, `git -C ${other} reset --hard && git commit -m y`).status, 0, 'each verb is judged in its own directory')
  fs.rmSync(h.wt, { recursive: true, force: true }) // a crash left the marker behind
  const r = hook(h.dir, 'git reset --hard')
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /stale marker.*rm /, 'the way out is printed')
})

test('a lane run started from the main checkout finds its spec under --root, not under the shell directory', () => {
  const h = fixture()
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt)
  pending.markLane(h.wt, 'fanout')
  const r = runNode('scripts/run.js', [REL, '--root', h.wt], { cwd: h.dir })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^▶ BUILD/)
  assert.strictEqual(h.state(h.wt).lane, true)
})

test('a main checkout left mid-merge by another run gets the right remedy, not "stash"', () => {
  const h = fixture()
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'trunk\n'); h.g('commit', '-q', '-am', 'trunk')
  h.g('checkout', '-q', '-b', 'other', 'HEAD~1'); fs.writeFileSync(path.join(h.dir, 'a.txt'), 'other\n'); h.g('commit', '-q', '-am', 'other'); h.g('checkout', '-q', 'main')
  assert.notStrictEqual(require('child_process').spawnSync('git', ['-C', h.dir, 'merge', 'other']).status, 0, 'conflicts, leaving MERGE_HEAD')
  const r = h.run()
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /mid-merge .*CONFLICTS/)
})
