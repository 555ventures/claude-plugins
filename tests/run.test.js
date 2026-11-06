'use strict'
// Pins spec/scripts/run.js: the OPEN → … → DONE loop on a tmp host, repair/fix caps, ESCALATE
// choices, lane mode (MERGE_READY, PENDING_QUESTION, resume after answer), --in-place, conflicts.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync, spawn } = require('child_process')
const { tmpdir, gitRepo, runNode, runBash, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const pending = require(path.join(SPEC, 'scripts/lib/pending.js'))
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))

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

// A builder round changes the tree: a repaired or fixed mark on the tree the last gate ran on is refused.
let bumps = 0
const bump = (dir) => fs.writeFileSync(path.join(dir, 'bump.txt'), `round ${++bumps} ${process.hrtime.bigint()}\n`)
const unbump = (dir) => fs.rmSync(path.join(dir, 'bump.txt'), { force: true })

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

  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
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

test('briefs: a v7 spec with only ## Goal fills Intent from it; a Decisions row with JSX survives, a template placeholder row is dropped', () => {
  const doc = SPEC_DOC
    .replace(/## Intent[\s\S]*?(?=## Goal)/, '')
    .replace('| D1 | plain text, no JSON \\| no YAML | ADR-0001 |', '| D1 | plain text, no JSON \\| no YAML | ADR-0001 |\n| D3 | renders <MessageThread items={x} /> | because |\n| <id> | <decision> | <why> |')
  assert.ok(!doc.includes('## Intent') && doc.includes('## Goal'), 'the fixture spec has Goal and no Intent')
  const h = fixture({ files: { [REL]: doc } })
  const build = ok(h.run())
  assert.ok(build.includes('## Intent\nfeature.txt exists.'), 'the build brief falls back to Goal under the Intent heading:\n' + build)
  assert.ok(build.includes('- D3: renders <MessageThread items={x} /> — because'), 'a decision mentioning JSX reaches the builder:\n' + build)
  const OTHER = 'Other sections (File Plan, Contracts, UI, Behavior, Canonical Delta) are not printed here — read them in the spec file; a Canonical Delta is applied by the builder.'
  assert.ok(build.includes('## Acceptance Criteria\n- AC-20261104-01-1: WHEN the build is done THE SYSTEM SHALL have feature.txt.\n\n## Assumptions\n- none\n\n' + OTHER), 'the build brief prints Assumptions, then points at the unprinted sections after the ACs:\n' + build)
  assert.ok(!build.includes('<id>') && !build.includes('<decision>'), 'a template placeholder row is dropped')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const j = JSON.parse(ok(h.run('--json')))
  assert.strictEqual(j.step, 'REVIEW')
  assert.ok(j.body.includes('## Intent\nfeature.txt exists.'), 'the review brief falls back to Goal too')
  assert.ok(j.body.includes('- D3: renders <MessageThread items={x} /> — because') && !j.body.includes('<id>'), 'the reviewer brief keeps the JSX decision and drops the placeholder row')
  assert.ok(j.body.includes('## Acceptance Criteria\n- AC-20261104-01-1: WHEN the build is done THE SYSTEM SHALL have feature.txt.\n\n## Assumptions\n- none\n\n' + OTHER), 'the review brief points at the unprinted sections after the ACs:\n' + j.body)
  assert.ok(j.body.includes("Files changed outside the File Plan: none\nThe spec's frontmatter status line changes during the run; that is bookkeeping, not a finding."), 'the review brief tells the reviewer the status flip is bookkeeping:\n' + j.body)
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
  bump(h.wt)
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → REPAIR/)
  bump(h.wt)
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → ESCALATE/, 'REPAIR is capped at 2')
  assert.match(ok(h.run()), /--mark escalate <retry\|park\|amend>/)
  assert.strictEqual(h.run('--mark', 'escalate', 'nope').status, 2, 'an unknown choice is refused')
  assert.strictEqual(h.run('--mark', 'escalate', 'revert').status, 2, 'revert answers a spec edit only')

  assert.match(ok(h.run('--mark', 'escalate', 'retry')), /ESCALATE → REPAIR/)
  assert.deepStrictEqual([h.state().attempts.repair, h.state().opus], [0, true], 'retry resets attempts and pins opus')
  bump(h.wt)
  ok(h.run('--mark', 'repaired'))
  bump(h.wt)
  assert.match(ok(h.run('--mark', 'repaired')), /→ ESCALATE/)

  assert.match(ok(h.run('--mark', 'escalate', 'park')), /ESCALATE → PARKED/)
  const items = Q.read(h.dir).items
  assert.strictEqual(items.length, 1)
  assert.deepStrictEqual([items[0].kind, items[0].type, items[0].spec], ['prompt', 'fix', REL], 'park queues a fix item bound to the spec')
  assert.ok(items[0].payload.length > 0 && !items[0].payload.startsWith('/spec:'), 'the payload is the bare first finding')
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
  bump(h.wt)
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
  bump(h.wt)
  ok(h.runIn(h.wt, '--mark', 'repaired'))
  bump(h.wt)
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
  unbump(h.wt)
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
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n') // a real build writes its planned file
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
  bump(h.dir)
  ok(h.run('--mark', 'repaired'))
  bump(h.dir)
  ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().step, 'ESCALATE')
  assert.ok(!pending.isLane(h.dir), 'no agent is out at ESCALATE: the marker is off')
  assert.strictEqual(hook(h.dir, 'git commit -m x'), 0, "the user's own commits are not blocked between dispatches")
  ok(h.run('--mark', 'escalate', 'retry'))
  assert.ok(pending.isLane(h.dir), 'retry dispatches a builder again: marked')
  fs.rmSync(path.join(h.dir, 'RED'))
  unbump(h.dir)
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
  bump(h.wt)
  ok(h.run('--mark', 'fixed'))
  assert.strictEqual(h.state().step, 'REVIEW')
  assert.ok(!fs.existsSync(findingsPath), "entering REVIEW deletes the last round's findings, so a stale file is never re-read")
})

test('conflicts-resolved commits the merge without sweeping untracked files of the main checkout', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n') // a real build writes its planned file
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
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n') // a real build writes its planned file
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

// ---- spec 20261105/02: lanes that wait for each other ------------------------------------------

const OTHER = 'specs/20261104/02-other.md'
const OTHER_DOC = SPEC_DOC.replace('# Thing', '# Other').replace('status: hardened', 'status: hardened')
const laneAt = (h) => { h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt); ok(h.runIn(h.wt)) }
function laneAtFix(h) {
  laneAt(h)
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.runIn(h.wt, '--mark', 'built'))
  ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings(BLOCKING)))
  assert.strictEqual(h.state(h.wt).step, 'FIX')
}

test('AC-20261105-02-5 COMMIT folds wip commits into the one build commit, so the branch carries no wip subject', () => {
  const h = fixture()
  laneAt(h)
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  h.g('-C', h.wt, 'add', '-A'); h.g('-C', h.wt, 'commit', '-q', '-m', 'wip(spec): 01-thing')
  fs.writeFileSync(path.join(h.wt, 'more.txt'), 'more\n')
  h.g('-C', h.wt, 'add', '-A'); h.g('-C', h.wt, 'commit', '-q', '-m', 'wip(spec): 01-thing')
  fs.writeFileSync(path.join(h.wt, 'last.txt'), 'last\n')
  ok(h.runIn(h.wt, '--mark', 'built'))
  assert.match(ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → MERGE_READY/)
  const mb = h.g('merge-base', 'main', 'spec/01-thing').trim()
  assert.strictEqual(h.g('rev-list', '--count', `${mb}..spec/01-thing`).trim(), '1', 'exactly one commit above trunk')
  assert.match(h.g('log', '-1', '--format=%s', 'spec/01-thing'), /^build\(/)
  assert.ok(!/wip\(spec\):/.test(h.g('log', '--format=%s', 'spec/01-thing')), 'no wip subject on the branch')
  for (const f of ['feature.txt', 'more.txt', 'last.txt']) assert.ok(h.g('ls-tree', '--name-only', 'spec/01-thing').split('\n').includes(f), f + ' is in the build commit')
})

test('AC-20261105-02-8 a lane marks waiting --on a spec: waitingOn is written, the step stays, and a WAITING line prints; a non-lane run refuses', () => {
  const h = fixture({ files: { [OTHER]: OTHER_DOC } })
  laneAtFix(h)
  const bad = h.runIn(h.wt, '--mark', 'waiting', '--on', 'specs/nope.md')
  assert.strictEqual(bad.status, 2); assert.match(bad.stderr, /--on specs\/nope\.md is not a spec file under /)
  assert.strictEqual(h.runIn(h.wt, '--mark', 'waiting').status, 2, '--on is required')
  const out = ok(h.runIn(h.wt, '--mark', 'waiting', '--on', OTHER))
  assert.match(out, /^WAITING — /m)
  assert.ok(out.includes(`waits on ${OTHER}; the lane stops here and fanout re-picks it once ${OTHER} is done on trunk`), out)
  assert.deepStrictEqual([h.state(h.wt).step, h.state(h.wt).waitingOn], ['FIX', OTHER])

  const solo = fixture({ files: { [OTHER]: OTHER_DOC } })
  ok(solo.run())
  const r = solo.run('--mark', 'waiting', '--on', OTHER)
  assert.strictEqual(r.status, 2); assert.ok(r.stderr.includes(`not a lane — run /spec:run ${OTHER} first, then re-run`), r.stderr)
})

test('AC-20261105-02-13 a build that edits another spec or a Decisions row escalates after the green gate; revert restores them and returns to the gate; an AC edit passes', () => {
  const h = fixture({ files: { [OTHER]: OTHER_DOC } })
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  const own = path.join(h.wt, REL)
  const ownBefore = fs.readFileSync(own, 'utf8')
  fs.writeFileSync(own, ownBefore.replace('plain text, no JSON', 'rich text, with JSON'))
  fs.writeFileSync(path.join(h.wt, OTHER), OTHER_DOC + '\nrewritten\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → ESCALATE/)
  assert.strictEqual(h.state().why, 'spec-edit')
  const q = ok(h.run())
  assert.ok(q.includes(`20261104/01 edited spec text it may not: ${REL}, ${OTHER}. How should it continue?`) || (q.includes('edited spec text it may not:') && q.includes(REL) && q.includes(OTHER)), q)
  assert.match(q, /- revert —/); assert.match(q, /- amend —/); assert.ok(!/- retry —/.test(q), 'retry is not offered')
  assert.match(q, /--mark escalate <revert\|amend>/)
  assert.strictEqual(h.run('--mark', 'escalate', 'retry').status, 2, 'only revert and amend answer a spec edit')
  assert.match(ok(h.run('--mark', 'escalate', 'revert')), /ESCALATE → REVIEW/, 'back through the gate to the reviewer')
  assert.strictEqual(fs.readFileSync(path.join(h.wt, OTHER), 'utf8'), OTHER_DOC, 'the other spec is restored from base')
  assert.strictEqual(fs.readFileSync(own, 'utf8'), ownBefore, 'the own spec is restored, status line kept')
  assert.ok(fs.existsSync(path.join(h.wt, 'feature.txt')), 'the build itself is kept')
  assert.strictEqual(h.run('--mark', 'escalate', 'revert').status, 2, 'revert is a spec-edit answer only')

  const ac = fixture()
  ok(ac.run())
  fs.writeFileSync(path.join(ac.wt, 'feature.txt'), 'thing\n')
  const wtSpec = path.join(ac.wt, REL)
  fs.writeFileSync(wtSpec, fs.readFileSync(wtSpec, 'utf8').replace('SHALL have feature.txt', 'SHALL have a non-empty feature.txt'))
  assert.match(ok(ac.run('--mark', 'built')), /BUILD → REVIEW/, 'an acceptance-criterion edit is not a spec-edit stop')
})

test('AC-20261105-02-14 a lane marks a Decision unmet: a question with retry, park and amend, never an edit; retry returns to the step on opus', () => {
  const h = fixture()
  laneAtFix(h)
  const bad = h.runIn(h.wt, '--mark', 'unmet', '--decision', 'D9', '--why', 'x')
  assert.strictEqual(bad.status, 2); assert.match(bad.stderr, /D9[\s\S]*D1/, 'the known ids are named')
  assert.strictEqual(h.runIn(h.wt, '--mark', 'unmet', '--decision', 'D1').status, 2, '--why is required')
  const out = ok(h.runIn(h.wt, '--mark', 'unmet', '--decision', 'D1', '--why', 'trunk removed the hook'))
  assert.match(out, /PENDING_QUESTION/, 'the lane stops')
  const q = pending.readPending(h.wt)
  assert.ok(q.question.includes('cannot meet D1: trunk removed the hook'), q.question)
  assert.deepStrictEqual(q.options.map((o) => o.label), ['retry', 'park', 'amend'])
  assert.ok(q.options[2].description.includes('trunk removed the hook'), 'the amend option carries the proposed amendment')
  assert.strictEqual(h.state(h.wt).step, 'ESCALATE')
  pending.answerPending(h.wt, 'retry')
  assert.match(ok(h.runIn(h.wt)), /^▶ FIX/, 'retry goes back to the step it came from')
  const s = h.state(h.wt)
  assert.deepStrictEqual([s.attempts, s.opus], [{ repair: 0, fix: 0 }, true], 'fresh attempts on opus')
})

test('AC-20261105-02-14 unmet outside a builder or reviewer step is refused', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'RED'), '')
  ok(h.run('--mark', 'built'))
  bump(h.wt); ok(h.run('--mark', 'repaired')); bump(h.wt); ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().step, 'ESCALATE')
  assert.strictEqual(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'x').status, 2)
})

// ---- spec 20261105/07: a batch ends clean --------------------------------------------------------

test('AC-20261105-07-4 run.js --fix in a fanout lane opens a done spec at BUILD with a Fix brief and no File Plan, and commits fix(<id>): <symptom>', () => {
  const h = fixture({ status: 'done' })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt)
  const brief = ok(h.runIn(h.wt, '--fix', 'x'))
  assert.match(brief, /^▶ BUILD/)
  assert.ok(brief.includes('## Fix\nx\n1. Reproduce it and state the root cause in one sentence before the first edit.'), brief)
  assert.ok(!brief.includes('## File Plan') && !brief.includes('## Intent'), 'no File Plan, no Intent')
  assert.ok(brief.includes('## Decisions\n- D1:') && brief.includes('## Acceptance Criteria\n- AC-20261104-01-1:'), 'Decisions and ACs as today')
  assert.strictEqual(h.state(h.wt).fix.symptom, 'x')
  assert.strictEqual(h.status(h.wt), 'done', 'no status is written into the spec')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  st.writeJson(path.join(h.wt, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  ok(h.runIn(h.wt, '--mark', 'built'))
  const review = JSON.parse(ok(h.runIn(h.wt, '--json')))
  assert.ok(review.body.includes('## Fix\nx') && !review.body.includes('## Intent'), 'the reviewer brief carries the Fix block')
  assert.match(ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → MERGE_READY/)
  assert.strictEqual(h.g('log', '-1', '--format=%s', 'spec/01-thing').trim(), 'fix(20261104/01): x')
})

test('AC-20261105-07-4 --fix outside a lane and not in place is refused with exit 2 naming --in-place and the fanout lane', () => {
  const h = fixture({ status: 'done' })
  const r = h.run('--fix', 'x')
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /--fix works in place \(--in-place\) or as a fanout lane/)
  assert.strictEqual(h.state(), null, 'nothing started')
  const g = fixture()
  assert.strictEqual(g.run('--fix').status, 2, '--fix needs a symptom too')
})

test('AC-20261105-07-13 evidence.md is appended to the build commit body; absent, the subject stands alone; the builder brief names the file', () => {
  const h = fixture()
  const brief = ok(h.run())
  assert.ok(brief.includes('evidence.md'), 'the BUILD brief names the evidence file')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  fs.writeFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/evidence.md'), 'migrations: 18\n\n')
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  const build = h.g('log', '-1', '--format=%B', 'main^2').trim()
  assert.strictEqual(build, 'build(20261104/01): Thing\n\nmigrations: 18')
  const bare = fixture()
  ok(bare.run())
  fs.writeFileSync(path.join(bare.wt, 'feature.txt'), 'thing\n')
  ok(bare.run('--mark', 'built'))
  ok(bare.run('--mark', 'reviewed', '--file', bare.findings([])))
  assert.strictEqual(bare.g('log', '-1', '--format=%B', 'main^2').trim(), 'build(20261104/01): Thing')
})

// ---- spec 20261105/08: a load flake is not a repair -------------------------------------------

// A suite whose first `fails` runs are red naming tests/slow.test.js (a file no build touches); the run
// count lives outside the worktree so the tree a gate keys on never moves.
function flaky(fails, extra = {}) {
  const state = path.join(tmpdir('flaky'), 'n')
  const check = `const fs = require('fs')
const n = fs.existsSync(${JSON.stringify(state)}) ? Number(fs.readFileSync(${JSON.stringify(state)}, 'utf8')) : 0
fs.writeFileSync(${JSON.stringify(state)}, String(n + 1))
if (n < ${fails}) { console.error('FAIL tests/slow.test.js > jsdom timeout'); process.exit(1) }
console.log('ok')
`
  const h = fixture({ files: { 'check.js': check, 'tests/slow.test.js': '// slow\n', ...extra } })
  return Object.assign(h, { suiteRuns: () => (fs.existsSync(state) ? Number(fs.readFileSync(state, 'utf8')) : 0) })
}
const BRIEF_RULE = 'A failing test the diff does not touch, a timeout, or a flake under load is not yours to fix: say so in your reply and stop; the driver re-runs the gate. Never raise a host test timeout, retry count or worker limit to pass.'

test('AC-20261105-08-1 a red gate naming only tests outside the diff is re-run once; green on the rerun goes to REVIEW with no repair counted', () => {
  const h = flaky(1)
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  const out = ok(h.run('--mark', 'built'))
  assert.match(out, /BUILD → REVIEW;/, 'the rerun was green')
  assert.match(out, /\ngate: green \(ran \d+ms\) · rerun\n/, 'the gate line says it was a rerun (AC-20261105-08-16)')
  assert.strictEqual(h.suiteRuns(), 2, 'the suite ran twice')
  const s = h.state()
  assert.deepStrictEqual([s.attempts.repair, s.gate.reruns, s.gate.status], [0, 1, 'green'])
  assert.deepStrictEqual(s.gate.failing, [], 'the green result names no failing file')
  assert.match(s.gate.tree, /^[0-9a-f]{40,}$/, 'state.gate keeps the tree it keyed on')
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /- load: 1 gate rerun\(s\), 0s waiting for a slot\n/, 'the DONE report counts the rerun (AC-20261105-08-16)')
})

test('AC-20261105-08-2 a rerun that is red again goes to REPAIR as before and the same tree is never re-run again', () => {
  const h = flaky(99)
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  const out = ok(h.run('--mark', 'built'))
  assert.match(out, /BUILD → REPAIR;/)
  assert.match(out, /\ngate: red — .* · rerun\n/, 'the red line names the rerun')
  assert.strictEqual(h.suiteRuns(), 2, 'one rerun, not two')
  assert.deepStrictEqual([h.state().attempts.repair, h.state().gate.reruns, h.state().gate.failing], [0, 1, ['tests/slow.test.js']])
  const brief = ok(h.run())
  assert.ok(brief.includes(BRIEF_RULE), 'the REPAIR brief carries the flake rule (AC-20261105-08-6)')
  assert.ok(brief.indexOf('FAIL tests/slow.test.js') < brief.indexOf(BRIEF_RULE), 'the rule follows the failure tail')
  assert.match(ok(h.run('--mark', 'regate')), /REPAIR → REPAIR;/, 'regate on the same tree runs the gate again: still red')
  assert.strictEqual(h.suiteRuns(), 3, 'a tree that was re-run once is not re-run again by the gate step')
  bump(h.wt)
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → REPAIR;/, 'a new tree can be re-run once')
  assert.strictEqual(h.suiteRuns(), 5, 'the changed tree got its own rerun')
  bump(h.wt)
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → ESCALATE;/, 'REPAIR_CAP still ends in ESCALATE')
  assert.strictEqual(h.state().attempts.repair, 2)
})

test('AC-20261105-08-3 a red tail that names a file the diff touched, or no file, goes to REPAIR without a rerun', () => {
  const h = flaky(99)
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'tests/slow.test.js'), '// slow\n// edited by the build\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;/)
  assert.strictEqual(h.suiteRuns(), 1, 'the failing file is in the diff: no rerun')
  assert.strictEqual(h.state().gate.reruns, 0)
  const bare = fixture()
  ok(bare.run())
  fs.writeFileSync(path.join(bare.wt, 'RED'), '')
  const out = ok(bare.run('--mark', 'built'))
  assert.match(out, /BUILD → REPAIR;.*\ngate: red — [^\n]*\n$/, 'no rerun text on a plain red gate')
  assert.strictEqual(bare.runs(), 1, 'a tail naming no file is not re-run')
  assert.strictEqual(bare.state().gate.reruns, 0)
})

test('AC-20261105-08-4 repaired and fixed on a tree the last gate ran on are refused with their remedy; attempts stay', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'RED'), '')
  ok(h.run('--mark', 'built'))
  for (const verb of ['repaired']) {
    const r = h.run('--mark', verb)
    assert.strictEqual(r.status, 2)
    assert.ok(r.stderr.includes('nothing changed since the last gate — re-run the gate (mark regate) or dispatch a builder'), r.stderr)
    assert.strictEqual(h.state().attempts.repair, 0, 'the budget counts builder rounds')
  }
  assert.match(ok(h.run()), /Gate tree [0-9a-f]{7}\./, 'the REPAIR body prints the current gate tree short sha')
  const f = fixture()
  ok(f.run())
  fs.writeFileSync(path.join(f.wt, 'feature.txt'), 'thing\n')
  ok(f.run('--mark', 'built'))
  ok(f.run('--mark', 'reviewed', '--file', f.findings(BLOCKING)))
  const r = f.run('--mark', 'fixed')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('nothing changed since the last gate — dispatch a builder'), r.stderr)
  assert.ok(!r.stderr.includes('regate'), 'FIX does not accept regate, so the refusal does not name it')
  assert.strictEqual(f.state().attempts.fix, 0)
  assert.strictEqual(f.state().step, 'FIX')
})

test('a fix that changes only the builder-written run files is a round: fixed goes to GATE, a cache hit', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING)))
  const runDir = path.join(h.dir, 'specs/20261104/01-thing.run')
  fs.writeFileSync(path.join(runDir, 'evidence.md'), 'migrations: 18\n')
  const runs = h.runs()
  const out = ok(h.run('--mark', 'fixed'))
  assert.match(out, /FIX → REVIEW;/)
  assert.strictEqual(h.state().attempts.fix, 1)
  assert.strictEqual(h.runs(), runs, 'the gate was a cache hit: the suite did not run again')
  assert.ok(out.includes('(cached)'), out)
  assert.ok(ok(h.run()).includes(`Evidence the builder recorded (not in the diff): ${path.join(runDir, 'evidence.md')}`), 'the reviewer brief names evidence.md')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING))), /REVIEW → ESCALATE;/, 'FIX_CAP still ends in ESCALATE')
})

test('evidence.md written before built does not make a later fixed with no change a round', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/evidence.md'), 'migrations: 18\n')
  ok(h.run('--mark', 'built'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING)))
  const r = h.run('--mark', 'fixed')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('nothing changed since the last gate'), r.stderr)
  assert.strictEqual(h.state().attempts.fix, 0)
})

test('a fix that changes only fix.json is a round', () => {
  const f = fixture()
  ok(f.run())
  fs.writeFileSync(path.join(f.wt, 'feature.txt'), 'thing\n')
  ok(f.run('--mark', 'built'))
  ok(f.run('--mark', 'reviewed', '--file', f.findings(BLOCKING)))
  fs.writeFileSync(path.join(f.dir, 'specs/20261104/01-thing.run/fix.json'), '{"cause":"c","test":"t"}\n')
  assert.match(ok(f.run('--mark', 'fixed')), /FIX → REVIEW;/)
  assert.strictEqual(f.state().attempts.fix, 1)
})

test('AC-20261105-08-5 regate re-runs the gate without a repair, once per tree; at any other step it is refused', () => {
  const h = flaky(2)
  ok(h.run())
  assert.strictEqual(h.run('--mark', 'regate').status, 2, 'regate at BUILD is refused')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;/, 'two reds: the rerun did not help')
  assert.ok(ok(h.run()).includes('--mark regate'), 'the REPAIR body offers regate')
  const out = ok(h.run('--mark', 'regate'))
  assert.match(out, /REPAIR → REVIEW;/, 'the third run is green')
  assert.strictEqual(h.state().attempts.repair, 0, 'no repair was counted')
  assert.strictEqual(h.suiteRuns(), 3)
  const g = flaky(99)
  ok(g.run())
  fs.writeFileSync(path.join(g.wt, 'feature.txt'), 'thing\n')
  ok(g.run('--mark', 'built'))
  ok(g.run('--mark', 'regate'))
  assert.strictEqual(g.state().attempts.repair, 0)
  const again = g.run('--mark', 'regate')
  assert.strictEqual(again.status, 2, 'a second regate on the same tree is refused')
  assert.strictEqual(g.suiteRuns(), 3, 'the refused regate ran nothing')
  bump(g.wt)
  assert.strictEqual(g.run('--mark', 'regate').status, 2, 'regate needs the tree unchanged')
})

test('AC-20261105-08-6 builder.md carries the flake rule', () => {
  const md = fs.readFileSync(path.join(SPEC, 'agents/builder.md'), 'utf8')
  assert.match(md, /not yours to fix/)
  assert.match(md, /never raise a host test timeout, retry count or worker limit to pass/)
})

test('AC-20261105-08-16 a lane that waited for a gate slot shows it on the gate line and in the report; a lane that did not shows nothing', () => {
  const quiet = fixture()
  ok(quiet.run())
  fs.writeFileSync(path.join(quiet.wt, 'feature.txt'), 'thing\n')
  const q = ok(quiet.run('--mark', 'built'))
  assert.ok(!/rerun|waited/.test(q), 'no cost, no text:\n' + q)
  const qr = ok(quiet.run('--mark', 'reviewed', '--file', quiet.findings([])))
  assert.ok(!/load:/.test(qr), 'no load bullet in a quiet report:\n' + qr)

  const h = fixture({ cfg: { gateConcurrency: 1 } })
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  const dir = path.join(h.dir, '.git', 'spec-gate.lock')
  fs.mkdirSync(dir, { recursive: true })
  const sleeper = spawn('sleep', ['30'])
  const holder = path.join(dir, String(sleeper.pid))
  fs.writeFileSync(holder, `${sleeper.pid} now ${h.dir}\n`)
  spawn('sh', ['-c', `sleep 1; rm -f ${holder}`], { detached: true, stdio: 'ignore' }).unref()
  try {
    const out = ok(h.run('--mark', 'built'))
    assert.match(out, /\ngate: green \(ran \d+ms\) · waited [1-9]\ds? for a gate slot\n|\ngate: green \(ran \d+ms\) · waited \d+s for a gate slot\n/, out)
    assert.ok(h.state().gate.lockWaitMs >= 1000)
    assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /- load: 0 gate rerun\(s\), [1-9]\d*s waiting for a slot\n/)
  } finally { sleeper.kill() }
})

// ---- laneFiles at OPEN -------------------------------------------------------------------------

test('AC-20261105-08-14 AC-20261105-08-15 OPEN copies untracked laneFiles into the fresh worktree byte for byte before setupCommand; a tracked or missing entry is skipped with a reason', () => {
  const seen = path.join(tmpdir('seen'), 'env.copy')
  const bytes = Buffer.from([0x53, 0x45, 0x43, 0x00, 0xff, 0x0a, 0x4b, 0x3d, 0x31, 0x0a])
  const dirName = tmpdir('laneenv')
  fs.writeFileSync(path.join(dirName, '.env'), bytes)
  const h = fixture({ dirName, files: { '.gitignore': '.claude/worktrees/\nspecs/**/*.run/\n.env\n' }, cfg: { laneFiles: ['.env', 'a.txt', 'nope.env'], setupCommand: `cp .env ${seen}` } })
  const r = h.run()
  ok(r)
  assert.ok(fs.existsSync(seen), 'setupCommand ran with .env already in place')
  assert.ok(fs.readFileSync(seen).equals(bytes), 'the copy seen by setupCommand is byte-identical')
  assert.ok(fs.readFileSync(path.join(h.wt, '.env')).equals(bytes), 'the worktree holds the byte-identical file')
  assert.ok(!/\.env/.test(h.g('-C', h.wt, 'status', '--porcelain')), 'git status in the worktree does not list the copied file')
  assert.match(r.stderr, /laneFiles: skipped a\.txt \(tracked\)/)
  assert.match(r.stderr, /laneFiles: skipped nope\.env \(missing\)/)
})

// ---- spec 20261105/06: the client says yes ------------------------------------------------------

const A_DOC = SPEC_DOC.replace(/\n$/, '') + `

## Assumptions

- A1: the table is empty — if false: delete the rows in the migration
- A2: old rows exist (D1) — if false: ask: keep the old rows | delete them
- A3: the cache is warm — if false: ask
`
const a_fixture = (extra = {}) => fixture({ files: { [REL]: A_DOC }, ...extra })
const laneBuild = (h) => { h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt); ok(h.runIn(h.wt)) }
const specAt = (h, root = h.wt) => fs.readFileSync(path.join(root, REL), 'utf8')

test('AC-20261105-06-3 both briefs print an ## Assumptions block with every A<n> line; OTHER_SECTIONS no longer names Assumptions', () => {
  const h = a_fixture()
  const build = ok(h.run())
  assert.ok(build.includes('## Assumptions\n- A1: the table is empty — if false: delete the rows in the migration\n- A2: old rows exist (D1) — if false: ask: keep the old rows | delete them\n- A3: the cache is warm — if false: ask\n'), build)
  assert.ok(build.indexOf('## Acceptance Criteria') < build.indexOf('## Assumptions') && build.indexOf('## Assumptions') < build.indexOf('Other sections'), 'after the ACs, before the pointer')
  assert.ok(!/Other sections \([^)]*Assumptions/.test(build), 'the pointer does not name Assumptions')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const rev = JSON.parse(ok(h.run('--json'))).body
  assert.ok(rev.includes('## Assumptions\n- A1: the table is empty') && rev.includes('- A3: the cache is warm'), 'the reviewer brief prints them too:\n' + rev)
})

test('AC-20261105-06-4 unmet --assumption writes an assumption question with the arm options and amend last; unknown ids and written fallbacks are refused with the remedy', () => {
  const h = a_fixture()
  laneBuild(h)
  const unknown = h.runIn(h.wt, '--mark', 'unmet', '--assumption', 'A9')
  assert.strictEqual(unknown.status, 2); assert.match(unknown.stderr, /A9 is not an Assumption of .*known: A1, A2, A3/)
  const fallback = h.runIn(h.wt, '--mark', 'unmet', '--assumption', 'A1')
  assert.strictEqual(fallback.status, 2); assert.ok(fallback.stderr.includes('A1 has a written fallback: delete the rows in the migration — apply it'), fallback.stderr)
  assert.strictEqual(pending.readPending(h.wt), null, 'a refusal writes no question')
  const out = ok(h.runIn(h.wt, '--mark', 'unmet', '--assumption', 'A2', '--why', '3 rows found'))
  assert.match(out, /PENDING_QUESTION/)
  const q = pending.readPending(h.wt)
  assert.strictEqual(q.kind, 'assumption')
  assert.ok(q.question.includes('20261104/01 found A2 false: old rows exist (D1) — 3 rows found. How should it continue?'), q.question)
  assert.deepStrictEqual(q.options.map((o) => o.label), ['keep the old rows', 'delete them', 'amend'])
  assert.deepStrictEqual([h.state(h.wt).step, h.state(h.wt).from], ['ESCALATE', 'BUILD'])

  const bare = a_fixture()
  laneBuild(bare)
  ok(bare.runIn(bare.wt, '--mark', 'unmet', '--assumption', 'A3'))
  assert.deepStrictEqual(pending.readPending(bare.wt).options.map((o) => o.label), ['retry', 'park', 'amend'], 'a bare ask arm offers the usual three')
})

test('AC-20261105-06-5 answering an assumption question appends a Decisions row, returns to the step on opus, and the gate does not call the row a spec edit', () => {
  const h = a_fixture()
  laneBuild(h)
  ok(h.runIn(h.wt, '--mark', 'unmet', '--assumption', 'A2'))
  pending.answerPending(h.wt, 'keep the old rows')
  assert.match(ok(h.runIn(h.wt)), /^▶ BUILD/, 'back to the step it came from')
  const s = h.state(h.wt)
  assert.deepStrictEqual([s.step, s.opus, s.attempts, s.rulings], ['BUILD', true, { repair: 0, fix: 0 }, ['D2']])
  assert.ok(specAt(h).includes('| D2 | A2 ruled: keep the old rows | asked at BUILD |'), specAt(h))
  assert.strictEqual(pending.readPending(h.wt), null, 'the answer is consumed')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  assert.match(ok(h.runIn(h.wt, '--mark', 'built')), /BUILD → REVIEW/, 'the ruling row is not a spec-edit stop')
  assert.ok(!/spec text edited/.test(JSON.parse(ok(h.runIn(h.wt, '--json'))).body), 'nor does the reviewer brief call it a spec edit')

  // a builder-made Decisions edit still escalates, ruling or no
  const h2 = a_fixture()
  laneBuild(h2)
  ok(h2.runIn(h2.wt, '--mark', 'unmet', '--assumption', 'A2'))
  pending.answerPending(h2.wt, 'delete them')
  ok(h2.runIn(h2.wt))
  fs.writeFileSync(path.join(h2.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h2.wt, REL), specAt(h2).replace('plain text', 'rich text'))
  assert.match(ok(h2.runIn(h2.wt, '--mark', 'built')), /BUILD → ESCALATE/)
  assert.strictEqual(h2.state(h2.wt).why, 'spec-edit')
})

test('AC-20261105-06-5 outside a lane the assumption question is printed with the arm options and the label answers it', () => {
  const h = a_fixture()
  ok(h.run())
  ok(h.run('--mark', 'unmet', '--assumption', 'A2'))
  const out = ok(h.run())
  assert.match(out, /Ask the user ONE question[\s\S]*A2 false/)
  assert.match(out, /- keep the old rows —[\s\S]*- delete them —[\s\S]*- amend —/)
  assert.match(out, /--mark escalate <keep the old rows\|delete them\|amend>/)
  assert.strictEqual(h.run('--mark', 'escalate', 'retry').status, 2, 'only the offered labels answer')
  assert.match(ok(h.run('--mark', 'escalate', 'delete them')), /ESCALATE → BUILD/)
  assert.ok(specAt(h, h.wt).includes('A2 ruled: delete them'))
})

const ND = [{ severity: 'needs-decision', file: 'feature.txt', line: 1, summary: 'hid the archived rows', evidence: 'filter(a => !a.archived)' }]
function atReview(h) { ok(h.run()); fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n'); ok(h.run('--mark', 'built')) }

test('AC-20261105-06-6 a needs-decision finding with nothing blocking asks keep / fix / amend before any FIX round; keep records a ruling and commits; fix does not count against the cap', () => {
  const h = fixture()
  atReview(h)
  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings(ND)))
  assert.match(cp, /REVIEW → ESCALATE/)
  assert.match(cp, /review: 1 needs-decision → ESCALATE/)
  const q = ok(h.run())
  assert.ok(q.includes('20261104/01 made a choice you did not: hid the archived rows. Keep it?'), q)
  assert.match(q, /- keep —[\s\S]*- fix —[\s\S]*- amend —/); assert.match(q, /--mark escalate <keep\|fix\|amend>/)
  assert.strictEqual(h.run('--mark', 'escalate', 'retry').status, 2)
  assert.match(ok(h.run('--mark', 'escalate', 'keep')), /ESCALATE → DONE/, 'keep goes straight through COMMIT to the end')
  assert.ok(h.g('show', `main:${REL}`).includes('| D2 | reviewer: hid the archived rows | asked at REVIEW |'), 'the ruling row travels with the build')

  const f = fixture()
  atReview(f)
  ok(f.run('--mark', 'reviewed', '--file', f.findings([...ND, { severity: 'needs-decision', summary: 'second' }])))
  assert.ok(ok(f.run()).includes('hid the archived rows; +1 more. Keep it?'))
  const fx = ok(f.run('--mark', 'escalate', 'fix'))
  assert.match(fx, /ESCALATE → FIX/)
  const brief = ok(f.run())
  assert.ok(brief.includes('undo this choice; follow the spec') && brief.includes('hid the archived rows') && brief.includes('second'), brief)
  assert.strictEqual(f.state().attempts.fix, 0)
  bump(f.wt)
  ok(f.run('--mark', 'fixed'))
  assert.strictEqual(f.state().attempts.fix, 0, 'a decision fix round is not counted against FIX_CAP')
  assert.strictEqual(f.state().step, 'REVIEW')
  ok(f.run('--mark', 'reviewed', '--file', f.findings(BLOCKING)))
  assert.strictEqual(f.state().step, 'FIX', 'the one counted FIX round is still available')

  const am = fixture()
  atReview(am)
  ok(am.run('--mark', 'reviewed', '--file', am.findings(ND)))
  ok(am.run('--mark', 'escalate', 'amend'))
  assert.strictEqual(am.status(), 'draft')
})

test('AC-20261105-06-7 a blocking finding wins: FIX as today, and the needs-decision finding stays in state.review', () => {
  const h = fixture()
  atReview(h)
  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings([...BLOCKING, ...ND])))
  assert.match(cp, /REVIEW → FIX/)
  assert.deepStrictEqual(h.state().review.findings.map((f) => f.severity), ['blocking', 'needs-decision'])
  const brief = ok(h.run())
  assert.ok(brief.includes('wrong thing') && !brief.includes('hid the archived rows'), 'the FIX brief lists the blocking finding only')
  bump(h.wt)
  ok(h.run('--mark', 'fixed'))
  assert.strictEqual(h.state().attempts.fix, 1)
})

const SCOPE_CFG = { askPaths: ['apps/server/src/db/**'] }
const touch = (h, ...fs_) => { for (const f of fs_) { fs.mkdirSync(path.dirname(path.join(h.wt, f)), { recursive: true }); fs.writeFileSync(path.join(h.wt, f), 'x\n') } }

test('AC-20261105-06-8 an out-of-plan file under an askPaths glob stops after the green gate with a scope question naming it; other out-of-plan files do not', () => {
  const h = fixture({ cfg: SCOPE_CFG })
  laneBuild(h)
  touch(h, 'feature.txt', 'apps/server/src/db/schema.ts', 'apps/web/x.ts')
  assert.match(ok(h.runIn(h.wt, '--mark', 'built')), /BUILD → ESCALATE/)
  const q = pending.readPending(h.wt)
  assert.strictEqual(q.kind, 'scope')
  assert.ok(q.question.includes('changed files outside its File Plan on paths you watch: apps/server/src/db/schema.ts. How should it continue?') && !q.question.includes('apps/web'), q.question)
  assert.deepStrictEqual(q.options.map((o) => o.label), ['widen', 'separate', 'park'])
  assert.strictEqual(h.state(h.wt).why, 'scope')

  const quiet = fixture({ cfg: SCOPE_CFG })
  ok(quiet.run())
  touch(quiet, 'feature.txt', 'apps/web/x.ts')
  assert.match(ok(quiet.run('--mark', 'built')), /BUILD → REVIEW/, 'an unwatched out-of-plan file widens and is reported, as today')
  const rev = JSON.parse(ok(quiet.run('--json'))).body
  assert.ok(rev.includes('Files changed outside the File Plan: apps/web/x.ts'), rev)

  const planned = fixture({ cfg: { askPaths: ['feature.txt'] } })
  ok(planned.run()); touch(planned, 'feature.txt')
  assert.match(ok(planned.run('--mark', 'built')), /BUILD → REVIEW/, 'a File Plan file never asks')
})

test('AC-20261105-06-9 widen records a ruling and goes to REVIEW (marking the file askPaths); separate restores the file, queues a follow-up and gates again; park queues a fix', () => {
  const FILE = 'apps/server/src/db/schema.ts'
  const w = fixture({ cfg: SCOPE_CFG })
  ok(w.run()); touch(w, 'feature.txt', FILE)
  ok(w.run('--mark', 'built'))
  assert.match(ok(w.run()), /--mark escalate <widen\|separate\|park>/)
  assert.match(ok(w.run('--mark', 'escalate', 'widen')), /ESCALATE → REVIEW/)
  assert.ok(specAt(w).includes(`| D2 | scope widened: ${FILE} | asked at GATE |`), specAt(w))
  assert.ok(fs.existsSync(path.join(w.wt, FILE)), 'the file stays')
  assert.ok(fs.existsSync(path.join(w.dir, 'specs/20261104/01-thing.run/diff.patch')), 'REVIEW has its diff')
  const rev = JSON.parse(ok(w.run('--json'))).body
  assert.ok(rev.includes(`Files changed outside the File Plan: ${FILE} (askPaths)`), rev)
  assert.ok(!rev.includes('spec text edited'), 'the ruling row is not a spec edit in the reviewer brief')
  // the widened file does not ask again on a later gate
  ok(w.run('--mark', 'reviewed', '--file', w.findings(BLOCKING)))
  ok(w.run('--mark', 'fixed'))
  assert.strictEqual(w.state().step, 'REVIEW', 'a later gate round does not re-ask a widened path')

  const s = fixture({ cfg: SCOPE_CFG })
  ok(s.run()); touch(s, 'feature.txt', FILE)
  ok(s.run('--mark', 'built'))
  assert.match(ok(s.run('--mark', 'escalate', 'separate')), /ESCALATE → REVIEW/, 'back through the gate, now clean')
  assert.ok(!fs.existsSync(path.join(s.wt, FILE)), 'the file is restored from base (absent there)')
  assert.ok(fs.existsSync(path.join(s.wt, 'feature.txt')), 'the build itself is kept')
  const item = Q.read(s.dir).items.find((i) => i.kind === 'prompt')
  assert.ok(item.payload.includes(REL) && item.payload.includes(FILE) && item.payload.startsWith('follow-up:') && item.type === undefined, JSON.stringify(item))
  assert.ok(!specAt(s).includes('scope widened'))

  const p = fixture({ cfg: SCOPE_CFG })
  ok(p.run()); touch(p, 'feature.txt', FILE)
  ok(p.run('--mark', 'built'))
  assert.match(ok(p.run('--mark', 'escalate', 'park')), /parked; a fix is queued/)
  assert.strictEqual(p.status(), 'hardened')
})

test('AC-20261105-06-10 a ## Canonical Delta spec does not list docs/canonical files as outside the File Plan; without the section they are listed', () => {
  const withDelta = SPEC_DOC.replace(/\n$/, '') + '\n\n## Canonical Delta\n\nThe admin screen gains a Delete button.\n'
  const h = fixture({ files: { [REL]: withDelta } })
  ok(h.run()); touch(h, 'feature.txt', 'docs/canonical/admin.md')
  ok(h.run('--mark', 'built'))
  const rev = JSON.parse(ok(h.run('--json'))).body
  assert.ok(rev.includes('Files changed outside the File Plan: none'), rev)
  const none = fixture()
  ok(none.run()); touch(none, 'feature.txt', 'docs/canonical/admin.md')
  ok(none.run('--mark', 'built'))
  assert.ok(JSON.parse(ok(none.run('--json'))).body.includes('Files changed outside the File Plan: docs/canonical/admin.md'))
  const brief = ok(fixture({ files: { [REL]: withDelta } }).run())
  assert.ok(/Canonical Delta/.test(brief), 'the build brief names the Canonical Delta')
})

test('AC-20261105-06-11 every lane question run.js writes carries its kind', () => {
  const kind = (h) => pending.readPending(h.wt).kind
  const g = fixture(); laneBuild(g)
  fs.writeFileSync(path.join(g.wt, 'RED'), '')
  ok(g.runIn(g.wt, '--mark', 'built')); bump(g.wt); ok(g.runIn(g.wt, '--mark', 'repaired')); bump(g.wt); ok(g.runIn(g.wt, '--mark', 'repaired'))
  assert.strictEqual(kind(g), 'escalate', 'gate red')
  const u = fixture(); laneBuild(u)
  ok(u.runIn(u.wt, '--mark', 'unmet', '--decision', 'D1', '--why', 'x'))
  assert.strictEqual(kind(u), 'unmet')
  const d = fixture(); laneBuild(d)
  fs.writeFileSync(path.join(d.wt, 'feature.txt'), 'thing\n'); ok(d.runIn(d.wt, '--mark', 'built'))
  ok(d.runIn(d.wt, '--mark', 'reviewed', '--file', d.findings(ND)))
  assert.strictEqual(kind(d), 'decision', 'review-decision')
  const e = fixture(); laneBuild(e)
  fs.writeFileSync(path.join(e.wt, 'feature.txt'), 'thing\n'); fs.writeFileSync(path.join(e.wt, REL), specAt(e).replace('plain text', 'rich text'))
  ok(e.runIn(e.wt, '--mark', 'built'))
  assert.strictEqual(kind(e), 'spec-edit')
  const c = fixture()
  const m = path.join(c.dir, 'x'); fs.mkdirSync(m)
  c.g('worktree', 'add', '-q', '-b', 'spec/01-thing', c.wt, 'main'); pending.markLane(c.wt); ok(c.runIn(c.wt))
  st.writeRun(path.join(c.wt, REL), { ...c.state(c.wt), step: 'CONFLICTS', conflicts: ['a.txt'], branch: 'spec/01-thing' })
  ok(c.runIn(c.wt))
  assert.strictEqual(kind(c), 'conflict')
})

test('AC-20261105-06-14 the interface contract lists every kind run.js passes to writePending, the needs-decision severity, the sign-off line, breaking and askPaths', () => {
  const run = fs.readFileSync(path.join(SPEC, 'scripts/run.js'), 'utf8')
  const map = /const KIND_OF = \{([\s\S]*?)\n\}/.exec(run)
  assert.ok(map, 'run.js names its kinds in one KIND_OF map')
  const kinds = [...new Set([...map[1].matchAll(/:\s*'([a-z-]+)'/g)].map((m) => m[1]))]
  assert.deepStrictEqual([...kinds].sort(), [...pending.KINDS].sort(), 'run.js writes all seven kinds and no other')
  const contract = fs.readFileSync(path.join(SPEC, '..', 'docs/v8/interface-contract.md'), 'utf8')
  for (const k of kinds) assert.ok(new RegExp('\\|\\s*`' + k + '`\\s*\\|').test(contract), `the contract's kinds table lists ${k}`)
  for (const s of ['needs-decision', 'Client sign-off', '`breaking`', 'askPaths']) assert.ok(contract.includes(s), `the contract names ${s}`)
})

test('AC-20261105-06-13 doctrine and the commands carry the sign-off test, the real-fork list and the stop rules', () => {
  const read = (f) => fs.readFileSync(path.join(SPEC, f), 'utf8').replace(/\s+/g, ' ')
  const doctrine = read('doctrine.md')
  assert.ok(/would the client need to sign this off/i.test(doctrine), 'the sign-off test')
  assert.ok(!/never at run/i.test(doctrine), '"never at run" is deleted')
  assert.ok(doctrine.includes('product facts are asked, never derived') && doctrine.includes('never answers for the user') && doctrine.includes('only the user waives a Decision'))
  const plan = read('commands/plan.md')
  for (const item of ['UI flow or screen', 'permission, restriction or something taken away', 'existing data', 'pricing, limits or a paid service', 'breaking change', 'hard-to-reverse architecture']) assert.ok(plan.includes(item), 'plan.md lists: ' + item)
  assert.ok(plan.includes('product facts are asked, never derived') && plan.includes('[asked:') && plan.includes('Client sign-off') && plan.includes('breaking'))
  assert.ok(read('commands/run.md').includes('unmet --assumption'))
  assert.ok(/empty list/.test(read('commands/fix.md')) && /stop before the first edit/.test(read('commands/fix.md')))
  assert.ok(read('commands/fanout.md').includes('never answers for the user'))
  const builder = read('agents/builder.md')
  assert.ok(builder.includes('Canonical Delta') && builder.includes('do not pick'))
  assert.ok(read('agents/reviewer.md').includes('needs-decision'))
})

// ---- spec 20261105/10: the spec on trunk says what was built; a pipe in backticks survives ------------

const RE_CELL = '`/\\b(cannot|only \\w+ can)\\b/i`'
const OTHER_TEXT = 'Other sections (File Plan, Contracts, UI, Behavior, Canonical Delta) are not printed here — read them in the spec file; a Canonical Delta is applied by the builder.'
const asBuiltOf = (text) => (/\n## As built\n([\s\S]*)$/.exec(text) || [])[1]

test('AC-20261105-10-6 AC-20261105-10-10 the BUILD and REVIEW briefs carry a regex cell with pipes in backticks verbatim; the builder brief names as-built.md', () => {
  const doc = SPEC_DOC.replace('| D1 | plain text', `| D2 | ${RE_CELL} | because |\n| D1 | plain text`)
  const h = fixture({ files: { [REL]: doc } })
  const build = ok(h.run())
  assert.ok(build.includes(`- D2: ${RE_CELL} — because`), 'the builder brief carries the whole cell:\n' + build)
  assert.ok(build.includes('01-thing.run/as-built.md'), 'the builder brief names as-built.md')
  assert.ok(build.includes(OTHER_TEXT), 'OTHER_SECTIONS is unchanged')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const review = JSON.parse(ok(h.run('--json')))
  assert.ok(review.body.includes(`- D2: ${RE_CELL} — because`), 'the reviewer brief carries the whole cell:\n' + review.body)
})

test('AC-20261105-10-8 the build commit ends the spec with ## As built: as-built.md lines, advisories and files outside the File Plan', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.mkdirSync(path.join(h.wt, 'src'), { recursive: true })
  fs.writeFileSync(path.join(h.wt, 'src/extra.js'), 'x\n')
  fs.writeFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/as-built.md'), '- migration renumbered 0041 → 0047\n\nplain line\n')
  ok(h.run('--mark', 'built'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings([{ severity: 'advisory', file: 'src/x.js', line: 12, summary: 'count is now 36' }])))
  const spec = h.g('show', 'main:' + REL)
  const tail = asBuiltOf(spec)
  assert.ok(tail !== undefined && spec.trimEnd().split('\n').includes('## As built'), 'the section is on trunk:\n' + spec)
  assert.strictEqual(tail.trim(), ['- migration renumbered 0041 → 0047', '- plain line', '- src/x.js:12 count is now 36', '- touched outside the File Plan: src/extra.js'].join('\n'))
  assert.ok(spec.indexOf('## Acceptance Criteria') < spec.indexOf('## As built'), 'created after the last section')
  assert.ok(spec.includes('| D1 | plain text, no JSON \\| no YAML | ADR-0001 |'), 'Decisions stay as locked')
})

test('AC-20261105-10-8 with no as-built.md, no advisory and nothing outside the File Plan the spec gains no section', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings([{ severity: 'blocking', file: 'feature.txt', summary: 'wrong' }])))
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing 2\n')
  ok(h.run('--mark', 'fixed'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(!h.g('show', 'main:' + REL).includes('As built'))
})

test('AC-20261105-10-9 AC-20261105-10-10 AC-20261105-11-4 AC-20261105-11-9 a fix lane appends the (fix: <symptom>) bullets, the outside file included and the regression test exempt, once, and reaches MERGE_READY', () => {
  const existing = SPEC_DOC.replace('status: hardened', 'status: done') + '\n## As built\n\n- (fix: x) already there\n'
  const h = fixture({ files: { [REL]: existing } })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt)
  const brief = ok(h.runIn(h.wt, '--fix', 'x'))
  assert.ok(brief.includes('as-built.md'), 'the fix brief names as-built.md')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.wt, 't.test.js'), 'x\n')
  fs.mkdirSync(path.join(h.wt, 'src'), { recursive: true }); fs.writeFileSync(path.join(h.wt, 'src/extra.js'), 'x\n')
  fs.writeFileSync(path.join(h.wt, 'specs/20261104/01-thing.run/as-built.md'), 'already there\nrenamed the column\n')
  st.writeJson(path.join(h.wt, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  ok(h.runIn(h.wt, '--mark', 'built'))
  const review = ok(h.runIn(h.wt))
  assert.ok(review.includes("Files changed outside the File Plan: src/extra.js (a fix's plan is the spec's File Plan plus its regression test)"), review)
  assert.match(ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → MERGE_READY/)
  const spec = h.g('show', 'spec/01-thing:' + REL)
  assert.strictEqual(asBuiltOf(spec).trim(), '- (fix: x) already there\n- (fix: x) renamed the column\n- (fix: x) touched outside the File Plan: src/extra.js', 'the old bullet is not appended twice; the regression test is not listed')
})

test('AC-20261105-11-4 a spec-bound fix touching only plan files and its regression test appends no section', () => {
  const h = fixture({ status: 'done' })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt)
  ok(h.runIn(h.wt, '--fix', 'x'))
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.wt, 't.test.js'), 'x\n')
  st.writeJson(path.join(h.wt, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  ok(h.runIn(h.wt, '--mark', 'built'))
  const review = ok(h.runIn(h.wt))
  assert.ok(review.includes("Files changed outside the File Plan: none (a fix's plan is"), review)
  ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(!h.g('show', 'spec/01-thing:' + REL).includes('As built'))
})

test('AC-20261105-11-5 a spec-bound fix never stops for scope on an askPaths file; a spec-less fix prints n/a at REVIEW and commits no section', () => {
  const h = fixture({ status: 'done', cfg: { askPaths: ['src/extra.js'] } })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt)
  ok(h.runIn(h.wt, '--fix', 'x'))
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.mkdirSync(path.join(h.wt, 'src'), { recursive: true }); fs.writeFileSync(path.join(h.wt, 'src/extra.js'), 'x\n')
  st.writeJson(path.join(h.wt, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  assert.match(ok(h.runIn(h.wt, '--mark', 'built')), /BUILD → REVIEW/, 'the askPaths file is a record, not a stop')
  assert.ok(ok(h.runIn(h.wt)).includes('src/extra.js (askPaths) (a fix\'s plan'), 'the brief names it')

  const l = fixture(); const f = specless(l, { lane: true })
  f.built()
  const review = ok(f.fx())
  assert.ok(review.includes('Files changed outside the File Plan: n/a (fix — it has no File Plan)'), review)
  ok(f.fx('--mark', 'reviewed', '--file', l.findings([{ severity: 'advisory', file: 'a.js', summary: 'note' }])))
  assert.ok(!l.g('log', '--all', '-p').includes('As built'), 'no ## As built anywhere: a spec-less fix has no spec to carry one')
})

test('AC-20261105-10-9 a fix lane on a spec with no ## As built creates it after the last section', () => {
  const h = fixture({ status: 'done' })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt)
  ok(h.runIn(h.wt, '--fix', 'x'))
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.wt, 'specs/20261104/01-thing.run/as-built.md'), '- moved the count\n')
  st.writeJson(path.join(h.wt, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  ok(h.runIn(h.wt, '--mark', 'built'))
  ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([])))
  assert.strictEqual(asBuiltOf(h.g('show', 'spec/01-thing:' + REL)).trim(), '- (fix: x) moved the count')
})

test('AC-20261105-10-10 an in-place build appends ## As built into the build commit and reaches MERGE', () => {
  const h = fixture()
  ok(h.run('--in-place'))
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/as-built.md'), '- used a map\n')
  ok(h.run('--mark', 'built'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.strictEqual(asBuiltOf(h.g('show', 'main:' + REL)).trim(), '- used a map')
})

// ---- spec 20261105/09: fix is a driver and every fix is a lane -----------------------------------

const SYMPTOM = 'login button stays disabled after a failed submit'
const CAUSE = { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null }

// A fix with no spec: in place in the checkout, or a lane worktree. fx(...) runs run.js --fix; fix(obj) writes fix.json.
function specless(h, { lane = false, symptom = SYMPTOM } = {}) {
  const slug = st.slugOf(symptom)
  let root = h.dir
  if (lane) {
    root = path.join(h.dir, '.claude/worktrees/fix-' + slug)
    h.g('worktree', 'add', '-q', '-b', 'fix/' + slug, root, 'main')
    pending.markLane(root)
  }
  const runDir = st.fixRunDir(h.dir, slug)
  const fx = (...a) => runNode('scripts/run.js', ['--fix', symptom, ...(lane ? [] : ['--in-place']), '--root', root, ...a], { env: { RUN_COUNTER: h.counter } })
  return {
    slug, root, runDir, fx, lane,
    state: () => st.readJson(path.join(runDir, 'state.json')),
    fix: (obj) => st.writeJson(path.join(runDir, 'fix.json'), obj),
    // up to REVIEW or ESCALATE: a builder round (feature.txt) with the given fix.json
    built: (obj = CAUSE) => { ok(fx()); fs.writeFileSync(path.join(root, 'feature.txt'), 'thing\n'); st.writeJson(path.join(runDir, 'fix.json'), obj); return ok(fx('--mark', 'built')) },
  }
}

test('AC-20261105-09-1 run.js --fix in place opens at BUILD with no spec, the four steps and fix.json in the brief, and its state under the git common dir; without --in-place outside a lane it refuses', () => {
  const h = fixture()
  const f = specless(h)
  const brief = ok(f.fx())
  assert.match(brief, /^▶ BUILD/)
  for (const s of ['## Fix\n' + SYMPTOM, '1. Reproduce it and state the root cause in one sentence before the first edit.', '2. Write a regression test that fails for that reason.', '3. Fix the cause.', '4. Run the test command until green.', 'fix.json', '"needsPlan"', 'When needsPlan is set, make no edit.'])
    assert.ok(brief.includes(s), s + '\n' + brief)
  assert.ok(!brief.includes('## File Plan') && !brief.includes('## Intent') && !brief.includes('Spec:'), 'no spec, no File Plan')
  assert.match(f.slug, /^login-button-stays-disabled-after-a-[0-9a-f]{6}$/)
  assert.strictEqual(f.runDir, path.join(h.dir, '.git', 'spec-fix', f.slug + '.run'))
  assert.ok(fs.existsSync(path.join(f.runDir, 'state.json')), 'the state is under the git common dir')
  assert.strictEqual(h.g('status', '--porcelain', '--untracked-files=all'), '', 'nothing in the checkout: no gitignore line needed')
  assert.match(brief, new RegExp(`--fix '${SYMPTOM}' --root \\S+ --mark built`), 'the mark line carries the symptom, so a spec-less run finds its state')

  const bare = fixture()
  const r = runNode('scripts/run.js', ['--fix', 'x', '--root', bare.dir])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('--in-place') && r.stderr.includes('fanout lane'), r.stderr)
  assert.strictEqual(runNode('scripts/run.js', ['--root', bare.dir]).status, 2, 'no spec and no --fix is still a usage refusal')
})

test('AC-20261105-09-1 a spec path beside --fix keeps the spec-bound behaviour: <spec>.run/ and the spec Decisions and ACs in the brief', () => {
  const h = fixture({ status: 'done' })
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main'); pending.markLane(h.wt)
  const brief = ok(h.runIn(h.wt, '--fix', 'x'))
  assert.ok(brief.includes('## Decisions\n- D1:') && brief.includes('- AC-20261104-01-1:'))
  assert.ok(fs.existsSync(path.join(h.wt, 'specs/20261104/01-thing.run/state.json')))
  assert.ok(brief.includes(path.join(h.wt, 'specs/20261104/01-thing.run/fix.json')), 'fix.json sits in the spec run dir')
})

test('AC-20261105-09-3 built on a fix needs fix.json with a cause and a test; a good one is stored and goes to GATE', () => {
  const h = fixture()
  const f = specless(h)
  ok(f.fx())
  const need = (r) => { assert.strictEqual(r.status, 2, r.stderr); assert.ok(r.stderr.includes('fix.json needs cause and test'), r.stderr) }
  need(f.fx('--mark', 'built'))
  f.fix({ cause: 'c', test: ' ', strings: [], choices: [], needsPlan: null }); need(f.fx('--mark', 'built'))
  f.fix({ cause: '', test: 't', needsPlan: '' }); need(f.fx('--mark', 'built'))
  fs.writeFileSync(path.join(f.runDir, 'fix.json'), '{not json'); need(f.fx('--mark', 'built'))
  assert.strictEqual(f.state().step, 'BUILD', 'a refusal leaves the step')
  f.fix(CAUSE)
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  assert.match(ok(f.fx('--mark', 'built')), /BUILD → REVIEW;/, 'a green gate with empty lists goes to REVIEW')
  assert.deepStrictEqual([f.state().fix.cause, f.state().fix.test, f.state().fix.symptom], ['c', 't.test.js :: guards c', SYMPTOM])
})

test('AC-20261105-09-4 needsPlan restores the tree, queues /spec:plan with the diagnosis and ends at NEEDS_PLAN; a second built is refused', () => {
  const h = fixture()
  const f = specless(h, { lane: true })
  ok(f.fx())
  fs.writeFileSync(path.join(f.root, 'a.txt'), 'edited\n'); fs.writeFileSync(path.join(f.root, 'new.txt'), 'new\n')
  f.fix({ ...CAUSE, cause: '', test: '', needsPlan: 'the handler needs a new table' })
  const out = ok(f.fx('--mark', 'built'))
  assert.match(out, /BUILD → NEEDS_PLAN;/)
  assert.ok(out.includes('🚫 needs a spec — the handler needs a new table') && out.includes(`📋 queued /spec:plan ${SYMPTOM} — the handler needs a new table`), out)
  assert.strictEqual(fs.readFileSync(path.join(f.root, 'a.txt'), 'utf8'), 'a\n', 'tracked edits are gone')
  assert.ok(!fs.existsSync(path.join(f.root, 'new.txt')), 'untracked files the builder added are gone')
  assert.strictEqual(h.g('-C', f.root, 'status', '--porcelain'), '')
  const items = Q.read(h.dir).items
  assert.deepStrictEqual(items.map((i) => [i.kind, i.type, i.payload]), [['prompt', 'plan', `${SYMPTOM} — the handler needs a new table`]])
  assert.deepStrictEqual([f.state().step, f.state().needsPlan], ['NEEDS_PLAN', 'the handler needs a new table'], 'a lane keeps its ending for fanout')
  const again = f.fx('--mark', 'built')
  assert.strictEqual(again.status, 2); assert.ok(again.stderr.includes('not accepted at NEEDS_PLAN'), again.stderr)
  assert.strictEqual(Q.read(h.dir).items.length, 1, 'nothing is queued twice')

  const solo = fixture()
  const g = specless(solo)
  fs.writeFileSync(path.join(solo.dir, 'untracked-before.txt'), 'mine\n')
  ok(g.fx()); fs.writeFileSync(path.join(solo.dir, 'added.txt'), 'x\n'); g.fix({ needsPlan: 'why' })
  assert.match(ok(g.fx('--mark', 'built')), /BUILD → NEEDS_PLAN;/)
  assert.ok(fs.existsSync(path.join(solo.dir, 'untracked-before.txt')) && !fs.existsSync(path.join(solo.dir, 'added.txt')), "in place the user's own untracked files stay")
  assert.strictEqual(g.state(), null, 'in place the ending clears the run state')
})

const STRING = 'Your session expired — sign in again'
const CHOICE = 'hide the retry button after three failures'

test('AC-20261105-09-5 a green gate with an authored string and choice asks keep / revert / plan; a lane writes a decision question and prints PENDING_QUESTION', () => {
  const h = fixture()
  const f = specless(h)
  const cp = f.built({ ...CAUSE, strings: [STRING], choices: [CHOICE] })
  assert.match(cp, /BUILD → ESCALATE;/)
  const q = ok(f.fx())
  assert.ok(q.includes('authored 1 user-facing string(s) and 1 display or policy choice(s)') && q.includes(STRING) && q.includes(CHOICE), q)
  assert.deepStrictEqual([...q.matchAll(/^- (keep|revert|plan) —/gm)].map((m) => m[1]), ['keep', 'revert', 'plan'])
  assert.match(q, /--mark escalate <keep\|revert\|plan>/)
  assert.strictEqual(f.fx('--mark', 'escalate', 'retry').status, 2, 'only the three are offered')
  const more = fixture(); const m = specless(more)
  m.built({ ...CAUSE, strings: ['s1', 's2'], choices: ['c1', 'c2'] })
  assert.ok(ok(m.fx()).includes('s1; s2; c1; +1 more. Keep them?'), 'at most three, then +N more')

  const l = fixture(); const lf = specless(l, { lane: true })
  lf.built({ ...CAUSE, strings: [STRING], choices: [CHOICE] })
  assert.match(ok(lf.fx()), /PENDING_QUESTION/, 'a lane never asks: the re-run prints the stop line')
  const doc = pending.readPending(lf.root)
  assert.strictEqual(doc.kind, 'decision')
  assert.deepStrictEqual(doc.options.map((o) => o.label), ['keep', 'revert', 'plan'])
  assert.ok(doc.question.includes('authored 1 user-facing string(s)'))
})

test('AC-20261105-09-6 keep goes to REVIEW; revert is one uncounted builder round and the stop does not return; plan ends as needs-a-spec', () => {
  const k = fixture(); const kf = specless(k)
  kf.built({ ...CAUSE, strings: [STRING], choices: [CHOICE] })
  assert.match(ok(kf.fx('--mark', 'escalate', 'keep')), /ESCALATE → REVIEW;/)
  assert.deepStrictEqual(kf.state().attempts, { repair: 0, fix: 0 })

  const r = fixture(); const rf = specless(r)
  rf.built({ ...CAUSE, strings: [STRING], choices: [CHOICE] })
  const brief = ok(rf.fx('--mark', 'escalate', 'revert'))
  assert.match(brief, /ESCALATE → FIX;/)
  const fixBrief = ok(rf.fx())
  assert.ok(fixBrief.includes('Undo every listed string and choice back to the pre-fix behaviour; keep the fix and its test:') && fixBrief.includes(STRING) && fixBrief.includes(CHOICE), fixBrief)
  fs.writeFileSync(path.join(r.dir, 'feature.txt'), 'thing, undone\n'); rf.fix(CAUSE)
  assert.match(ok(rf.fx('--mark', 'fixed')), /FIX → REVIEW;/)
  assert.deepStrictEqual(rf.state().attempts, { repair: 0, fix: 0 }, 'the revert round is not counted')
  assert.strictEqual(rf.state().fixFor, undefined)

  const again = fixture(); const af = specless(again)
  af.built({ ...CAUSE, strings: [STRING], choices: [] })
  ok(af.fx('--mark', 'escalate', 'revert'))
  fs.writeFileSync(path.join(again.dir, 'feature.txt'), 'round\n') // the builder forgot to empty the lists
  assert.match(ok(af.fx('--mark', 'fixed')), /FIX → REVIEW;/, 'the stop fires once per run')

  const p = fixture(); const pf = specless(p)
  pf.built({ ...CAUSE, strings: [STRING], choices: [] })
  const end = ok(pf.fx('--mark', 'escalate', 'plan'))
  assert.match(end, /ESCALATE → NEEDS_PLAN;/)
  assert.ok(end.includes('🚫 needs a spec — the user sent the fix to plan'))
  assert.deepStrictEqual(Q.read(p.dir).items.map((i) => [i.type, i.payload]), [['plan', `${SYMPTOM} — the user sent the fix to plan`]])
  assert.ok(!fs.existsSync(path.join(p.dir, 'feature.txt')), 'the fix is discarded')
})

test('AC-20261105-09-7 empty strings and choices: no ESCALATE step, straight to REVIEW', () => {
  const h = fixture(); const f = specless(h)
  assert.match(f.built(), /BUILD → REVIEW;/)
  assert.ok(!f.state().history.some((x) => x.step === 'ESCALATE'))
})

test('AC-20261105-09-8 the fix reviewer brief carries the cause, the test and the check; a spec-bound fix adds the Decisions', () => {
  const h = fixture(); const f = specless(h)
  f.built()
  const body = JSON.parse(ok(f.fx('--json'))).body
  for (const s of ['## Fix\n' + SYMPTOM, 'Root cause: c', 'Regression test: t.test.js :: guards c', 'fails for the stated cause']) assert.ok(body.includes(s), s + '\n' + body)
  assert.ok(!body.includes('## Intent') && !body.includes('## Decisions'))

  const b = fixture({ status: 'done' })
  b.g('worktree', 'add', '-q', '-b', 'spec/01-thing', b.wt, 'main'); pending.markLane(b.wt)
  ok(b.runIn(b.wt, '--fix', 'x'))
  fs.writeFileSync(path.join(b.wt, 'feature.txt'), 'thing\n')
  st.writeJson(path.join(b.wt, 'specs/20261104/01-thing.run/fix.json'), CAUSE)
  ok(b.runIn(b.wt, '--mark', 'built'))
  const sb = JSON.parse(ok(b.runIn(b.wt, '--json'))).body
  assert.ok(sb.includes('Root cause: c') && sb.includes('## Decisions\n- D1:') && sb.includes('fails for the stated cause'))
})

test('AC-20261105-09-9 a clean review commits fix(<slug>): <symptom> with the cause and the test in the body; spec-bound uses the spec id; the report is fixed', () => {
  const h = fixture(); const f = specless(h, { lane: true })
  f.built()
  const out = ok(f.fx('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(out, /REVIEW → MERGE_READY/)
  const msg = h.g('log', '-1', '--format=%B', 'fix/' + f.slug).trim()
  assert.strictEqual(msg, `fix(${f.slug}): ${SYMPTOM}\n\nRoot cause: c\nRegression test: t.test.js :: guards c`)
  assert.ok(f.state().report.startsWith(`**✅ fixed — ${SYMPTOM}**`) && f.state().report.includes('- root cause: c') && f.state().report.includes('- regression test: t.test.js :: guards c'), f.state().report)

  const p = fixture(); const pf = specless(p)
  pf.built()
  const done = ok(pf.fx('--mark', 'reviewed', '--file', p.findings([])))
  assert.match(done, /REVIEW → DONE;/)
  assert.ok(done.includes(`✅ fixed — ${SYMPTOM}`) && done.includes('- root cause: c'), done)
  assert.strictEqual(p.g('log', '-1', '--format=%s').trim(), `fix(${pf.slug}): ${SYMPTOM}`, 'in place commits on the current branch')
  assert.strictEqual(pf.state(), null)

  const b = fixture({ status: 'done' })
  b.g('worktree', 'add', '-q', '-b', 'spec/01-thing', b.wt, 'main'); pending.markLane(b.wt)
  ok(b.runIn(b.wt, '--fix', 'x'))
  fs.writeFileSync(path.join(b.wt, 'feature.txt'), 'thing\n')
  st.writeJson(path.join(b.wt, 'specs/20261104/01-thing.run/fix.json'), CAUSE)
  ok(b.runIn(b.wt, '--mark', 'built'))
  ok(b.runIn(b.wt, '--mark', 'reviewed', '--file', b.findings([])))
  assert.strictEqual(b.g('log', '-1', '--format=%s', 'spec/01-thing').trim(), 'fix(20261104/01): x')
})

test('a spec-less fix has no Decisions to be unmet; its regate line names the symptom, not a spec', () => {
  const h = fixture(); const f = specless(h, { lane: true })
  ok(f.fx())
  assert.strictEqual(f.fx('--mark', 'unmet', '--decision', 'D1', '--why', 'x').status, 2)
  fs.writeFileSync(path.join(f.root, 'RED'), '')
  f.fix(CAUSE)
  ok(f.fx('--mark', 'built'))
  const repair = ok(f.fx())
  assert.match(repair, /^▶ REPAIR/)
  assert.ok(repair.includes(`--fix '${SYMPTOM}' --root`) && !repair.includes(' null '), repair)
})

// ---- spec 20261105/14: a prototype spec goes REVIEW → PIN_TESTS → LOOK → COMMIT -------------------------

const PROTO_CFG = { url: 'http://127.0.0.1:{port}', bootCommand: 'node app.js', e2eFile: 'e2e/pins-{stem}.spec.js', e2eCommand: 'node e2e-stub.js {file}', publicUrl: 'http://box.tail:{port}' }
// The stub e2eCommand: the app must answer at APP_URL; a PINRED file in the cwd makes it red.
const E2E_STUB = `const fs = require('fs')
fetch(process.env.APP_URL).then(() => {
  console.log('e2e file=' + process.argv[2] + ' APP_URL=' + process.env.APP_URL)
  if (fs.existsSync('PINRED')) { console.error('FAIL pin p1: Delete asks first'); process.exit(1) }
}, (e) => { console.error('app did not answer: ' + e.message); process.exit(1) })
`
const PINS = [
  { id: 'p1', kind: 'behaviour', route: '/invoices', given: 'an unpaid invoice', note: 'Delete asks for confirmation', sentence: 'On /invoices, given an unpaid invoice: Delete asks for confirmation', round: 1, status: 'active' },
  { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', sentence: 'On /invoices: Bigger title', round: 1, status: 'active' },
  { id: 'p3', kind: 'behaviour', route: '/old', note: 'Gone', sentence: 'On /old: Gone', round: 1, status: 'dropped', why: 'changed' },
]

function protoFixture({ cfgProto = PROTO_CFG, status = 'hardened' } = {}) {
  const doc = SPEC_DOC.replace('status: hardened', `status: ${status}`).replace('depends_on: []', 'depends_on: []\nprototype: inv')
    .replace('feature.txt exists.\n', 'feature.txt exists.\n').replace(/- \*\*AC-20261104-01-1\*\*.*/, '- **AC-20261104-01-1**: WHEN the user deletes THE SYSTEM SHALL ask first (pin p1).')
  return fixture({
    cfg: { prototype: cfgProto },
    files: {
      [REL]: doc,
      'e2e-stub.js': E2E_STUB,
      'design/prototypes/inv/contract.json': JSON.stringify({ stem: 'inv', rounds: 1, pins: PINS }),
      'design/prototypes/inv/pictures/invoices.png': 'PNG',
    },
  })
}

const listen = (t, port) => new Promise((resolve) => {
  const c = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('app')).listen(${port}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => c.kill('SIGKILL'))
  c.stdout.once('data', () => resolve(c))
})

test('AC-20261105-14-9 a prototype spec needs e2eFile and e2eCommand to open; with them both briefs carry the pins', () => {
  const bare = protoFixture({ cfgProto: { url: 'http://127.0.0.1:{port}', bootCommand: 'node app.js' } })
  const r = bare.run()
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('prototype.e2eFile') && r.stderr.includes('prototype.e2eCommand'), r.stderr)
  assert.ok(!fs.existsSync(bare.wt), 'no worktree')

  const h = protoFixture()
  const build = ok(h.run())
  assert.match(build, /^▶ BUILD\n/)
  const pins = '## Pins\n- p1 (behaviour): On /invoices, given an unpaid invoice: Delete asks for confirmation\n- p2 (look): On /invoices: Bigger title\n'
  assert.ok(build.includes(pins), build)
  assert.ok(!build.includes('p3'), 'a dropped pin is not listed')
  assert.ok(build.includes('e2e/pins-inv.spec.js') && build.includes('`pin pN: <sentence>`') && build.includes('role and visible text') && build.includes('APP_URL'), build)
  assert.ok(build.includes('Never copy a selector or a line of code from proto/inv'))
  assert.ok(build.indexOf('## Assumptions') < build.indexOf('## Pins'), 'after the Assumptions')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const review = ok(h.run())
  assert.match(review, /^▶ REVIEW/)
  assert.ok(review.includes(pins), 'the reviewer sees the same list')
  assert.ok(/open its test in e2e\/pins-inv\.spec\.js: .*pin pN:.*is blocking/.test(review), review)
  assert.ok(review.includes('design/prototypes/inv/pictures/invoices.png'), 'the picture paths that exist')
})

test('AC-20261105-14-10/11 REVIEW → PIN_TESTS (one port) → red is a repair → LOOK → look-failed is a FIX → looked commits', async (t) => {
  const h = protoFixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(cp, /REVIEW → PIN_TESTS;/)
  const s1 = h.state()
  assert.strictEqual(s1.step, 'PIN_TESTS')
  assert.ok(Number.isInteger(s1.appPort) && s1.appUrl === `http://127.0.0.1:${s1.appPort}`)
  const body = ok(h.run())
  assert.ok(body.includes(`cd ${h.wt} && export PORT=${s1.appPort} && node app.js`) && body.includes(`should answer at http://127.0.0.1:${s1.appPort}`), body)
  assert.ok(!body.includes('APP_URL=APP_URL'))
  const nope = h.run('--mark', 'pin-tested')
  assert.strictEqual(nope.status, 2)
  assert.ok(nope.stderr.includes(`nothing answers at http://127.0.0.1:${s1.appPort}`), nope.stderr)

  await listen(t, s1.appPort)
  fs.writeFileSync(path.join(h.wt, 'PINRED'), '')
  const red = ok(h.run('--mark', 'pin-tested'))
  assert.match(red, /PIN_TESTS → REPAIR;/)
  assert.match(red, /pin tests: red/)
  const repair = ok(h.run())
  assert.ok(repair.includes('The pin tests are red') && repair.includes('FAIL pin p1: Delete asks first'), repair)
  assert.ok(repair.includes('pin tests red:\ne2e file=e2e/pins-inv.spec.js') || repair.includes(`APP_URL=http://127.0.0.1:${s1.appPort}`), repair)
  assert.strictEqual(h.state().attempts.repair, 0)
  fs.rmSync(path.join(h.wt, 'PINRED')); bump(h.wt)
  ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().attempts.repair, 1, 'a red pin run counts as a repair')
  assert.strictEqual(h.state().step, 'REVIEW')
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.strictEqual(h.state().appPort, s1.appPort, 'one port for the run')

  const green = ok(h.run('--mark', 'pin-tested'))
  assert.match(green, /PIN_TESTS → LOOK;/)
  assert.match(green, /pin tests: green/)
  const pt = h.state().pinTests
  assert.strictEqual(pt.status, 'green')
  assert.ok(pt.output_tail.includes(`file=e2e/pins-inv.spec.js APP_URL=http://127.0.0.1:${s1.appPort}`), pt.output_tail)

  const look = ok(h.run())
  assert.match(look, /^▶ LOOK/)
  assert.ok(look.includes(`👀 look — http://box.tail:${s1.appPort}`), look)
  assert.ok(look.includes('- p2: On /invoices: Bigger title') && !look.includes('Delete asks'), 'only look pins')
  assert.ok(look.includes('design/prototypes/inv/pictures/invoices.png'))
  assert.ok(look.includes('`close enough`') && look.includes('END YOUR TURN'))
  assert.strictEqual(h.run('--mark', 'look-failed').status, 2, 'the reply is the symptom: --why is required')
  const fx = ok(h.run('--mark', 'look-failed', '--why', 'the title is still small'))
  assert.match(fx, /LOOK → FIX;/)
  assert.strictEqual(h.state().attempts.fix, 0, 'not counted against FIX_CAP')
  const fixBrief = ok(h.run())
  assert.ok(fixBrief.includes('The user looked at the running app and said: the title is still small. Treat it as the symptom: find the cause, fix it, keep every pin test green.'), fixBrief)
  bump(h.wt)
  assert.match(ok(h.run('--mark', 'fixed')), /FIX → REVIEW;/)
  assert.strictEqual(h.state().attempts.fix, 0)
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(ok(h.run('--mark', 'pin-tested')), /PIN_TESTS → LOOK;/)

  const done = ok(h.run('--mark', 'looked'))
  assert.match(done, /LOOK → DONE;/)
  assert.ok(done.includes('- pin tests green · look accepted after 2 round(s)'), done)
  assert.ok(h.g('log', '-1', '--format=%B', 'main^2').includes('pin tests green · look accepted after 2 round(s)') || h.g('log', '--format=%B', 'main').includes('pin tests green · look accepted after 2 round(s)'), 'the commit body carries the line')
  assert.strictEqual(h.status(), 'done')
  assert.strictEqual(h.g('status', '--porcelain'), '')
})

test('AC-20261105-14-10/11 a --fix on a prototype spec follows D14: the briefs carry the pins, and REVIEW → PIN_TESTS → LOOK → look-failed is a FIX → looked commits', async (t) => {
  const bare = protoFixture({ status: 'done', cfgProto: { url: 'http://127.0.0.1:{port}', bootCommand: 'node app.js' } })
  const r = bare.run('--fix', 'x', '--in-place')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('prototype.e2eFile') && r.stderr.includes('prototype.e2eCommand'), r.stderr)

  const h = protoFixture({ status: 'done' })
  const fx = (...a) => h.run('--fix', 'x', '--in-place', ...a)
  const pins = '## Pins\n- p1 (behaviour): On /invoices, given an unpaid invoice: Delete asks for confirmation\n- p2 (look): On /invoices: Bigger title\n'
  const build = ok(fx())
  assert.match(build, /^(📌[^\n]*\n)?▶ BUILD\n/)
  assert.ok(build.includes('## Fix\nx') && build.includes(pins), build)
  assert.strictEqual(h.state().prototype, 'inv')
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  st.writeJson(path.join(h.dir, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  ok(fx('--mark', 'built'))
  const review = ok(fx())
  assert.ok(review.includes(pins) && /open its test in e2e\/pins-inv\.spec\.js: .*is blocking/.test(review), review)

  assert.match(ok(fx('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → PIN_TESTS;/)
  const port = h.state().appPort
  assert.ok(Number.isInteger(port) && h.state().appUrl === `http://127.0.0.1:${port}`)
  await listen(t, port)
  assert.match(ok(fx('--mark', 'pin-tested')), /PIN_TESTS → LOOK;/)
  assert.strictEqual(h.state().pinTests.status, 'green')

  ok(fx('--mark', 'look-failed', '--why', 'the title is still small'))
  assert.strictEqual(h.state().step, 'FIX')
  assert.ok(ok(fx()).includes('The user looked at the running app and said: the title is still small'))
  bump(h.dir)
  ok(fx('--mark', 'fixed'))
  assert.strictEqual(h.state().attempts.fix, 0, 'not counted against FIX_CAP')
  ok(fx('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(ok(fx('--mark', 'pin-tested')), /PIN_TESTS → LOOK;/)

  const done = ok(fx('--mark', 'looked'))
  assert.match(done, /LOOK → DONE;/)
  assert.ok(done.includes('✅ fixed — x') && done.includes('- pin tests green · look accepted after 2 round(s)'), done)
  const body = h.g('log', '-1', '--format=%B')
  assert.ok(body.startsWith('fix(20261104/01): x') && body.includes('pin tests green · look accepted after 2 round(s)'), body)
})

// The line fanout holds a fix item with, read as the shell reads it when the user pastes it.
const heldFix = (dir, words = '') => {
  const out = ok(runNode('scripts/fanout.js', ['--root', dir]))
  const line = out.split('\n').find((l) => l.includes('waits — stops at LOOK for you') && l.includes(words))
  const m = /stops at LOOK for you — \/spec:run (\S+) --fix (.+) --in-place$/.exec(line || '')
  assert.ok(m, out)
  return { spec: m[1], symptom: spawnSync('sh', ['-c', `printf %s ${m[2]}`], { encoding: 'utf8' }).stdout }
}
// The printed --fix line, run through PIN_TESTS and LOOK to DONE.
async function heldFixToDone(t, h, symptom) {
  const fx = (...a) => h.run('--fix', symptom, '--in-place', ...a)
  ok(fx())
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  st.writeJson(path.join(h.dir, 'specs/20261104/01-thing.run/fix.json'), { cause: 'c', test: 't.test.js :: guards c', strings: [], choices: [], needsPlan: null })
  ok(fx('--mark', 'built'))
  ok(fx('--mark', 'reviewed', '--file', h.findings([])))
  await listen(t, h.state().appPort)
  ok(fx('--mark', 'pin-tested'))
  return ok(fx('--mark', 'looked'))
}
const openFixes = (dir) => Q.open(Q.read(dir)).filter((i) => i.type === 'fix').map((i) => i.payload)

test('AC-20261105-14-17 a held fix item closes when its printed line reaches DONE, and only that one: fanout stops holding it', async (t) => {
  const symptom = `the "Save" button doesn't stick`
  const h = protoFixture({ status: 'done' })
  Q.add(h.dir, { type: 'fix', spec: REL, payload: symptom })
  Q.add(h.dir, { type: 'fix', spec: REL, payload: 'another symptom' })
  Q.add(h.dir, { type: 'fix', payload: symptom })
  const held = heldFix(h.dir, 'Save')
  assert.deepStrictEqual(held, { spec: REL, symptom }, 'the printed line pastes as the item says')

  const done = await heldFixToDone(t, h, held.symptom)
  assert.ok(done.includes(`✅ fixed — ${symptom}`), done)
  assert.deepStrictEqual(openFixes(h.dir), ['another symptom', symptom], 'the sibling on this spec and the spec-less item with the same words stay')
  const after = ok(runNode('scripts/fanout.js', ['--root', h.dir]))
  assert.ok(!after.includes(`${REL} --fix 'the "Save"`), after)
  assert.strictEqual(heldFix(h.dir, 'another').symptom, 'another symptom', 'the sibling is still held')
})

test('AC-20261105-14-17 a held fix item with no words closes on the symptom fanout printed for it', async (t) => {
  const h = protoFixture({ status: 'done' })
  Q.add(h.dir, { type: 'fix', spec: REL, payload: '' })
  const held = heldFix(h.dir)
  assert.strictEqual(held.symptom, 'repair 01-thing')
  await heldFixToDone(t, h, held.symptom)
  assert.deepStrictEqual(openFixes(h.dir), [])
})

test('AC-20261105-14-10 a spec without prototype: goes REVIEW → DONE with no port allocated', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  assert.strictEqual(h.state().appPort, undefined)
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE;/)
})

test('no bootCommand: the PIN_TESTS boot line refuses, naming prototype.bootCommand, and never prints undefined', () => {
  const h = protoFixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  ok(h.run('--mark', 'built'))
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.strictEqual(h.state().step, 'PIN_TESTS')
  const cfgFile = path.join(h.dir, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'))
  delete cfg.prototype.bootCommand
  fs.writeFileSync(cfgFile, JSON.stringify(cfg))
  for (const args of [[], ['--mark', 'pin-tested']]) {
    const r = h.run(...args)
    assert.strictEqual(r.status, 2, r.stdout + r.stderr)
    assert.ok(r.stderr.includes('prototype.bootCommand') && !(r.stdout + r.stderr).includes('undefined'), r.stdout + r.stderr)
  }
})

// ---- spec 20261105/15: the gates prove what they claim ---------------------------------------------

const AKIA = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP' // built at run time: this file holds no literal secret
const withoutStatus = SPEC_DOC.replace('status: hardened\n', '')
const committed = (h) => h.g('show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean).sort()
const reviewedClean = (h, ...a) => ok(h.run('--mark', 'reviewed', '--file', h.findings([]), ...a))

test('AC-20261105-15-1 a superseded, bogus or missing status exits 2 naming it and hardened or implementing, creating no worktree or branch; hardened and implementing reach BUILD', () => {
  for (const [status, files, named] of [['superseded', {}, 'superseded'], ['bogus', {}, 'bogus'], ['hardened', { [REL]: withoutStatus }, '<missing>']]) {
    const h = fixture({ status, files })
    const r = h.run()
    assert.strictEqual(r.status, 2, r.stderr + r.stdout)
    assert.ok(r.stderr.includes(named) && r.stderr.includes('hardened or implementing'), r.stderr)
    assert.ok(!fs.existsSync(h.wt), `${named}: no worktree`)
    assert.strictEqual(h.g('branch', '--list', 'spec/01-thing').trim(), '', `${named}: no branch`)
    assert.strictEqual(h.state(), null)
  }
  for (const status of ['hardened', 'implementing']) assert.match(ok(fixture({ status }).run()), /^▶ BUILD\n/, status)
})

test('AC-20261105-15-2 a failed setupCommand removes the worktree and branch it just made; the re-run runs setup again before BUILD', () => {
  const dir = tmpdir('setup')
  const log = path.join(dir, 'setup.log')
  const flag = path.join(dir, 'ok.flag')
  const h = fixture({ cfg: { setupCommand: `echo ran >> ${log}; test -f ${flag}` } })
  const r = h.run()
  assert.strictEqual(r.status, 1, r.stderr)
  assert.match(r.stderr, /setupCommand failed/)
  assert.ok(!fs.existsSync(h.wt), 'the worktree is gone')
  assert.strictEqual(h.g('branch', '--list', 'spec/01-thing').trim(), '', 'the branch is gone')
  assert.strictEqual(h.g('worktree', 'list').trim().split('\n').length, 1)
  fs.writeFileSync(flag, '')
  assert.match(ok(h.run()), /^▶ BUILD\n/)
  assert.strictEqual(fs.readFileSync(log, 'utf8').trim().split('\n').length, 2, 'setup ran again on the re-run')
})

const PLAN_SPEC = SPEC_DOC.replace(/\| feature\.txt \| CREATE \| the thing \|/, [
  '| feature.txt | CREATE | the thing |', '| a.txt | MODIFY | edit |', '| old.txt | DELETE | gone |',
  '| src/**/*.js | CREATE | sources |', '| tmp/*.log | DELETE | logs |'].join('\n'))

test('AC-20261105-15-3 a build that changed only its own status goes to REPAIR naming nothing changed; a spec-less fix too', () => {
  const h = fixture()
  ok(h.run())
  const out = ok(h.run('--mark', 'built'))
  assert.strictEqual(h.state().step, 'REPAIR')
  assert.match(h.state().gate.output_tail, /^build: nothing changed since [0-9a-f]{40}$/)
  assert.match(out, /gate: red — build: nothing changed/)
  const f = specless(fixture())
  ok(f.fx()); f.fix(CAUSE)
  ok(f.fx('--mark', 'built'))
  assert.strictEqual(f.state().step, 'REPAIR')
  assert.match(f.state().gate.output_tail, /nothing changed/)
})

test('AC-20261105-15-3 a File Plan row that is not true on disk goes to REPAIR naming each row; past REPAIR_CAP it escalates with why gate, never REVIEW', () => {
  const h = fixture({ files: { [REL]: PLAN_SPEC, 'old.txt': 'o\n', 'tmp/x.log': 'l\n' } })
  ok(h.run())
  bump(h.wt)
  ok(h.run('--mark', 'built'))
  assert.strictEqual(h.state().step, 'REPAIR')
  assert.deepStrictEqual(h.state().gate.output_tail.split('\n'), [
    'file plan: CREATE feature.txt is not true on disk', 'file plan: DELETE old.txt is not true on disk',
    'file plan: CREATE src/**/*.js is not true on disk', 'file plan: DELETE tmp/*.log is not true on disk'])
  assert.match(ok(h.run()), /file plan: DELETE old\.txt is not true on disk/, 'the repair brief carries the tail')
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  bump(h.wt); ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().step, 'REPAIR', 'still three rows short')
  assert.strictEqual(h.state().gate.output_tail.split('\n').length, 3)
  bump(h.wt); ok(h.run('--mark', 'repaired'))
  assert.deepStrictEqual([h.state().step, h.state().why], ['ESCALATE', 'gate'], 'past REPAIR_CAP')
  const ok2 = fixture({ files: { [REL]: PLAN_SPEC, 'old.txt': 'o\n', 'tmp/x.log': 'l\n' } })
  ok(ok2.run())
  fs.writeFileSync(path.join(ok2.wt, 'feature.txt'), 'thing\n')
  fs.rmSync(path.join(ok2.wt, 'old.txt')); fs.rmSync(path.join(ok2.wt, 'tmp/x.log'))
  fs.mkdirSync(path.join(ok2.wt, 'src/deep'), { recursive: true }); fs.writeFileSync(path.join(ok2.wt, 'src/deep/x.js'), 'x\n')
  ok(ok2.run('--mark', 'built'))
  assert.strictEqual(ok2.state().step, 'REVIEW', 'every row true: CREATE, MODIFY, DELETE and both globs')
})

const porcelain = (h, root) => h.g('-C', root, 'status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).sort()
const gitDirOf = (h, root) => h.g('-C', root, 'rev-parse', '--absolute-git-dir').trim()

test('AC-20261105-15-6 a planned untracked file is intent-to-add while the host command runs, a file outside the plan stays untracked, and the merge goes through with the file in the commit', () => {
  const lsLog = path.join(tmpdir('ls'), 'ls.log')
  const h = fixture({ cfg: { testCommand: `node check.js && git ls-files > ${lsLog}` } })
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.wt, 'stray.txt'), 'stray\n')
  ok(h.run('--mark', 'built'))
  const listed = fs.readFileSync(lsLog, 'utf8').split('\n')
  assert.ok(listed.includes('feature.txt') && !listed.includes('stray.txt'), `the gate saw ${listed}`)
  assert.deepStrictEqual(porcelain(h, h.wt).filter((l) => !l.includes(REL)), [' A feature.txt', '?? stray.txt'], 'feature.txt is an intent-to-add entry, stray.txt untracked')
  assert.strictEqual(h.g('status', '--porcelain'), '', 'the main checkout is untouched')
  reviewedClean(h)
  assert.strictEqual(h.status(), 'done', 'no dirty refusal at the merge')
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n', 'the planned file is in the commit')
})

test('AC-20261105-15-6 a planned file .gitignore hides is warned once and the gate still runs; a failing git call exits 2 without running the gate', () => {
  const hidden = fixture({ files: { '.gitignore': '.claude/worktrees/\nspecs/**/*.run/\nfeature.txt\n' } })
  ok(hidden.run())
  fs.writeFileSync(path.join(hidden.wt, 'feature.txt'), 'thing\n')
  bump(hidden.wt)
  const r = hidden.run('--mark', 'built')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stderr.split('\n').filter((l) => l.startsWith('⚠️')).length, 1, r.stderr)
  assert.ok(r.stderr.includes('feature.txt'), r.stderr)
  assert.strictEqual(hidden.state().step, 'REVIEW', 'the gate ran')

  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(gitDirOf(h, h.wt), 'index.lock'), '')
  const runs = h.runs()
  const f = h.run('--mark', 'built')
  assert.strictEqual(f.status, 2, f.stderr)
  assert.match(f.stderr, /git add -N failed/)
  assert.strictEqual(h.runs(), runs, 'the gate did not run')
})

test('AC-20261105-15-6 a fix gate adds no intent-to-add entry', () => {
  const h = fixture()
  const f = specless(h)
  f.built()
  assert.strictEqual(f.state().step, 'REVIEW')
  assert.deepStrictEqual(porcelain(h, f.root).filter((l) => l.includes('feature.txt')), ['?? feature.txt'], 'still untracked: no entry')
})

test('AC-20261105-15-7 an in-place spec run commits its File Plan paths and the spec, leaves notes.txt untracked and warns; a widened path is committed; a worktree run commits the whole tree', () => {
  const h = fixture({ cfg: { askPaths: ['docs/**'] } })
  ok(h.run('--in-place'))
  fs.writeFileSync(path.join(h.dir, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.dir, 'notes.txt'), 'mine\n')
  fs.mkdirSync(path.join(h.dir, 'docs'))
  fs.writeFileSync(path.join(h.dir, 'docs/extra.md'), 'widened\n')
  ok(h.run('--mark', 'built'))
  assert.deepStrictEqual([h.state().step, h.state().why], ['ESCALATE', 'scope'])
  ok(h.run('--mark', 'escalate', 'widen'))
  const done = reviewedClean(h)
  assert.match(done, /left uncommitted: notes\.txt/)
  assert.deepStrictEqual(committed(h), ['docs/extra.md', 'feature.txt', REL], 'the plan, the widened path and the spec')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '?? notes.txt')

  const w = fixture()
  ok(w.run())
  fs.writeFileSync(path.join(w.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(w.wt, 'notes.txt'), 'in the tree\n')
  ok(w.run('--mark', 'built'))
  reviewedClean(w)
  assert.strictEqual(w.g('show', 'main:notes.txt'), 'in the tree\n', 'a worktree run holds only the build, so the whole tree is committed')
})

test('AC-20261105-15-8 run.js --fix --in-place with an untracked notes.txt reaches BUILD; the fix commits only its own files, leaves notes.txt and warns', () => {
  const h = fixture()
  fs.writeFileSync(path.join(h.dir, 'notes.txt'), 'mine\n')
  const f = specless(h)
  f.built()
  assert.strictEqual(f.state().step, 'REVIEW')
  const done = ok(f.fx('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /left uncommitted: notes\.txt/)
  assert.deepStrictEqual(committed(h), ['feature.txt'])
  assert.strictEqual(h.g('status', '--porcelain').trim(), '?? notes.txt')
})

// A hook that rejects the first commit only (the flag file it removes), to send COMMIT back through REPAIR.
const rejectOnce = (h) => {
  const flag = path.join(tmpdir('hook'), 'reject')
  fs.writeFileSync(flag, '')
  fs.mkdirSync(path.join(h.dir, '.git/hooks'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, '.git/hooks/pre-commit'), `#!/bin/sh\nif [ -f ${flag} ]; then rm ${flag}; echo rejected >&2; exit 1; fi\n`, { mode: 0o755 })
}

test('AC-20261105-15-9 a spec run with a secret stops at ESCALATE secrets naming every hit, exclude first; exclude commits without it, keeps it on disk and warns; a repair that adds a new hit is asked again', () => {
  const h = fixture()
  ok(h.run())
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.wt, '.env'), 'K=1\n')
  fs.writeFileSync(path.join(h.wt, 'conf.js'), `module.exports = '${AKIA}'\n`)
  ok(h.run('--mark', 'built'))
  const head = h.g('rev-parse', 'main').trim()
  rejectOnce(h)
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.deepStrictEqual([h.state().step, h.state().why], ['ESCALATE', 'secrets'])
  const q = ok(h.run())
  assert.match(q, /These files look like secrets\. Keep them out of this commit\?/)
  assert.ok(q.includes('.env') && q.includes('conf.js:1') && q.includes('content:AKIA'), q)
  assert.ok(q.indexOf('- exclude') > 0 && q.indexOf('- exclude') < q.indexOf('- stage'), 'exclude first')
  assert.match(q, /--mark escalate <exclude\|stage>/)
  assert.strictEqual(h.g('rev-parse', 'main').trim(), head, 'nothing was committed')
  // exclude: the commit hook rejects once, the repair adds a new secret file, which is asked again
  const out = ok(h.run('--mark', 'escalate', 'exclude'))
  assert.strictEqual(h.state().step, 'REPAIR', out)
  fs.writeFileSync(path.join(h.wt, 'creds.js'), `module.exports = '${AKIA}'\n`)
  bump(h.wt)
  ok(h.run('--mark', 'repaired'))
  reviewedClean(h)
  assert.deepStrictEqual([h.state().step, h.state().why], ['ESCALATE', 'secrets'], 'a new hit is asked again')
  const again = ok(h.run())
  assert.ok(again.includes('creds.js') && !again.includes('.env (') && !again.includes('conf.js'), 'only the new hit is named')
  const fin = ok(h.run('--mark', 'escalate', 'stage'))
  assert.match(fin, /kept out of this commit: \.env, conf\.js/)
  assert.match(fin, /staged on your say-so: creds\.js/)
  const files = h.g('ls-tree', '-r', '--name-only', 'main').split('\n')
  assert.ok(files.includes('creds.js') && files.includes('feature.txt') && !files.includes('.env') && !files.includes('conf.js'))
  assert.ok(fs.existsSync(path.join(h.wt, '.env')), 'an excluded file stays on disk')
})

test('AC-20261105-15-9 a fix with a secret stops, and after exclude commits without it and names it', () => {
  const h = fixture()
  const f = specless(h)
  f.built()
  fs.writeFileSync(path.join(h.dir, '.env'), 'K=1\n')
  ok(f.fx('--mark', 'reviewed', '--file', h.findings([])))
  assert.deepStrictEqual([f.state().step, f.state().why], ['ESCALATE', 'secrets'])
  assert.ok(ok(f.fx()).includes('.env'))
  const done = ok(f.fx('--mark', 'escalate', 'exclude'))
  assert.match(done, /kept out of this commit: \.env/)
  assert.deepStrictEqual(committed(h), ['feature.txt'])
  assert.strictEqual(h.g('status', '--porcelain').trim(), '?? .env')
})

test('AC-20261105-15-9 in a lane the secrets stop is a pending question of kind decision; a wip commit holding the hit still stops at COMMIT; the answer resumes', () => {
  const h = fixture()
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt, 'main')
  pending.markLane(h.wt)
  ok(h.runIn(h.wt))
  fs.writeFileSync(path.join(h.wt, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(h.wt, '.env'), 'K=1\n')
  ok(h.runIn(h.wt, '--mark', 'built'))
  require(path.join(SPEC, 'scripts/lib/git.js')).commitWip(h.wt, 'wip(spec): lane stopped') // fanout's safety net holds the secret
  ok(h.runIn(h.wt, '--mark', 'reviewed', '--file', h.findings([])))
  assert.match(ok(h.runIn(h.wt)), /PENDING_QUESTION/)
  const doc = pending.readPending(h.wt)
  assert.strictEqual(doc.kind, 'decision')
  assert.deepStrictEqual(doc.options.map((o) => o.label), ['exclude', 'stage'])
  assert.ok(doc.question.includes('.env') && doc.question.includes('look like secrets'))
  assert.strictEqual(h.state(h.wt).step, 'ESCALATE')
  pending.answerPending(h.wt, 'exclude')
  const resumed = ok(h.runIn(h.wt))
  assert.match(resumed, /MERGE_READY|merge-ready/)
  assert.strictEqual(h.state(h.wt).step, 'MERGE_READY')
  assert.match(h.state(h.wt).report, /kept out of this commit: \.env/)
  assert.ok(!h.g('ls-tree', '-r', '--name-only', 'spec/01-thing').split('\n').includes('.env'))
  assert.ok(h.g('ls-tree', '-r', '--name-only', 'spec/01-thing').split('\n').includes('feature.txt'))
})

test('AC-20261105-15-11 doctrine, release.md and reviewer.md carry the dismissal and reviewer rules', () => {
  const read = (f) => fs.readFileSync(path.join(SPEC, f), 'utf8').replace(/\s+/g, ' ')
  assert.match(read('doctrine.md'), /dismissed AskUserQuestion stops the run/)
  assert.match(read('doctrine.md'), /spec-release\.json/)
  assert.match(read('commands/release.md'), /dismissed question promotes nothing/)
  const reviewer = read('agents/reviewer.md')
  assert.match(reviewer, /new test that passes on the base is `blocking`, unless it covers a `SHALL CONTINUE TO` criterion/)
  assert.match(reviewer, /deletes the test behind a `SHALL CONTINUE TO` criterion is `blocking`, even when the criterion belongs to an earlier spec/)
})

test('AC-20261105-15-18 architecture.md names red-check as reviewer information, the allowlist, spec-release.json and the release keys', () => {
  const doc = fs.readFileSync(path.join(SPEC, '../docs/v8/architecture.md'), 'utf8').replace(/\s+/g, ' ')
  assert.match(doc, /It is information, never a block: GATE runs it once per tree after a GREEN gate/)
  assert.match(doc, /REVIEW brief prints its line/)
  assert.match(doc, /v7's read-only allowlist \(`status diff log show/)
  assert.match(doc, /`<git-common-dir>\/spec-release\.json`/)
  for (const k of ['testCountPattern', 'productionUrl', 'healthPath', 'migrationsCheck']) assert.ok(doc.includes(`"${k}"`), k)
})
