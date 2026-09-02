'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { SPEC, tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260821/04-stopped-row-durability.md (2026-08-21): closes deferred ruling R3(1) of
// specs/20260820/07-review-driver.md. Today a worktree review's RED_BLOCKING hard-stop appends
// its GATE_RED row to the WORKTREE's own .claude/spec-runs.jsonl, so `git worktree remove
// --force` (the pipeline's own printed remedy) destroys it permanently and a stopped attempt
// vanishes from spec-status/replay/`/spec:escape`. D1-D6 make the durable write land at
// <mainRoot>/.claude/spec-runs.stopped.jsonl (gitignored, self-healing via git's info/exclude,
// falling back to today's behavior only when the path genuinely cannot be ignored), drained into
// the tracked ledger at close/merge time. Every test here fails against current code: the driver
// has no notion of mainRoot vs repoRoot for the ledger write yet. AC-20260821-04-1 … -7, -10.
// AC-8/-9 are SHALL-CONTINUE-TO retags of existing tests/review/review-driver.test.js pins.

const DRIVER = 'scripts/spec-review-driver.js'
const STOPPED_LEDGER_REL = '.claude/spec-runs.stopped.jsonl'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-PLACEHOLDER: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody({ diffBase, acId }) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Durability Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}
const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

// In-place (no worktree) host: repoRoot === mainRoot, the D6/in-place-close-drain fixture shape.
function makeHost({ gateFails = false } = {}) {
  const root = fs.realpathSync(tmpdir('sr-durability-inplace'))
  const g = gitRepo(root)
  // Ignored up front (mirrors D7's dogfooded .gitignore line): a pre-existing stopped-ledger
  // file from an earlier hard-stopped attempt at this spec must never itself read as an
  // out-of-plan stray file to the reconcile leg when this in-place review's legs run.
  fs.appendFileSync(path.join(root, '.gitignore'), STOPPED_LEDGER_REL + '\n')
  g('add', '.gitignore'); g('commit', '-q', '-m', 'ignore stopped ledger')
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const specRel = 'specs/20260820/99-sr-durability-inplace.md'
  const spec = path.join(root, specRel)
  const acId = 'AC-20260820-99-30'
  fs.writeFileSync(spec, specBody({ diffBase, acId }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), gateFails ? 'module.exports = () => 0\n' : 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-PLACEHOLDER', acId))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, specRel, sidecar: spec.replace(/\.md$/, '.review') }
}

function toReviewer(host) {
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before this AC can be exercised: ' + r.stdout + r.stderr)
  return r
}

// Linked-worktree host: repoRoot (the worktree) !== mainRoot (root). `ignoreStopped` seeds the
// main root's .gitignore with the stopped-ledger line (the AC-1/AC-5/AC-10 "already ignored"
// case); `negateStopped` additionally appends the negation pattern that outranks git's
// info/exclude self-heal (the AC-3/AC-4-fallback case, per D3's rationale — git consults a
// directory's .gitignore before $GIT_DIR/info/exclude, so a negation there always wins).
function makeWorktreeHost({ name, acId, gateFails = false, ignoreStopped = false, negateStopped = false }) {
  const root = fs.realpathSync(tmpdir(name + '-root'))
  const g = gitRepo(root)
  if (ignoreStopped) {
    fs.appendFileSync(path.join(root, '.gitignore'), STOPPED_LEDGER_REL + '\n')
    g('add', '.gitignore'); g('commit', '-q', '-m', 'ignore stopped ledger')
  }
  if (negateStopped) {
    fs.appendFileSync(path.join(root, '.gitignore'), '!' + STOPPED_LEDGER_REL + '\n')
    g('add', '.gitignore'); g('commit', '-q', '-m', 'negate stopped ledger ignore')
  }
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/' + name, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  const specRel = `specs/20260820/${name}.md`
  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), gateFails ? 'module.exports = () => 0\n' : 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-PLACEHOLDER', acId))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  return { root, wt, spec, specRel, sidecar: spec.replace(/\.md$/, '.review'), gw }
}

const readJsonl = (file) =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []

test('AC-20260821-04-1 / AC-20260824-06-5 (worktree carrier) / AC-20260901-09-13: WHEN a review running in a linked worktree hard-stops on RED_BLOCKING THE SYSTEM appends verdict.js\'s ledger line — whose diff.base/diff.head/diff.dirty name the reviewed range — to <mainRoot>/.claude/spec-runs.stopped.jsonl and never to the worktree\'s own .claude/spec-runs.jsonl', () => {
  const host = makeWorktreeHost({ name: 'sr-durability-ac1', acId: 'AC-20260820-99-31', gateFails: true, ignoreStopped: true })
  const wtLedger = path.join(host.wt, '.claude/spec-runs.jsonl')
  const wtLedgerBefore = fs.existsSync(wtLedger) ? fs.readFileSync(wtLedger, 'utf8') : null
  const expectedBase = /^build_base:\s*(\S+)/m.exec(fs.readFileSync(host.spec, 'utf8'))[1]

  const r = run(host.wt, host.spec)
  const expectedHead = execFileSync('git', ['-C', host.wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(stateOf(host.wt, host.spec), 'STOPPED',
    'setup precondition: the gate-failing fixture must hard-stop before this AC can be exercised: ' + r.stdout + r.stderr)

  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  assert.ok(fs.existsSync(stoppedPath),
    'the durable write must land at <mainRoot>/.claude/spec-runs.stopped.jsonl — writing it anywhere else means the destructive `git worktree remove` remedy the pipeline itself prints destroys the only evidence of the stop: ' + r.stdout + r.stderr)
  const rows = readJsonl(stoppedPath)
  assert.strictEqual(rows.length, 1,
    'exactly one row must land in the durable stopped ledger for this single hard-stop — more than one is a duplicate append, fewer means the write was skipped: ' + JSON.stringify(rows))
  assert.strictEqual(rows[0].verdict, 'GATE_RED', 'the durable row must carry verdict GATE_RED: ' + JSON.stringify(rows[0]))

  const wtLedgerAfter = fs.existsSync(wtLedger) ? fs.readFileSync(wtLedger, 'utf8') : null
  assert.strictEqual(wtLedgerAfter, wtLedgerBefore,
    'the worktree\'s own .claude/spec-runs.jsonl must stay byte-unchanged — a row appended there too means the durability fix only ADDED a copy instead of relocating the authoritative write: ' + JSON.stringify({ before: wtLedgerBefore, after: wtLedgerAfter }))

  // AC-20260824-06-5: the durable hard-stop row must name the range it hard-stopped on.
  const appendedForRange = rows[0]
  assert.match((appendedForRange.diff && appendedForRange.diff.base) || '', /^[0-9a-f]{40}$/,
    'AC-20260824-06-5: the durable GATE_RED row\'s diff.base must be a 40-hex commit sha — D4 resolves the ' +
    'spec\'s base ref once via git rev-parse --verify before the first leg ever runs, worktree or in-place ' +
    'alike: ' + JSON.stringify(appendedForRange))
  assert.strictEqual(appendedForRange.diff.base, expectedBase,
    'AC-20260824-06-5: diff.base must equal git rev-parse --verify <resolved base>^{commit} of the fixture — a ' +
    'mismatch means the driver resolved a different ref than the spec\'s own build_base frontmatter: ' + JSON.stringify(appendedForRange))
  assert.strictEqual(appendedForRange.diff.head, expectedHead,
    'AC-20260824-06-5: diff.head must equal git rev-parse HEAD of the worktree at the moment of this hard-stop ' +
    'pass — the row\'s head is the tree the red leg actually ran on: ' + JSON.stringify(appendedForRange))
  assert.strictEqual(appendedForRange.diff.dirty, false,
    'AC-20260824-06-5: the worktree carries no uncommitted edits at hard-stop time — diff.dirty must be false, ' +
    'never true or absent, once the sha pair is threaded onto the hard-stop pass: ' + JSON.stringify(appendedForRange))

  // Reproducibility: feeding verdict.js the same manifest with the driver's own recorded
  // tier/diff/iteration/runId/base-sha/head-sha/dirty must reproduce an identical row (aside
  // from ts) — proving the durable line is verdict.js's own printed line, not a hand-composed
  // one (mirrors AC-20260820-07-2's proof for the in-place path).
  const appended = rows[0]
  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  assert.ok(fs.existsSync(manifestPath), 'a STOPPED run must still have written manifest-1.jsonl before hard-stopping: ' + r.stdout)
  assert.ok(appended.spec && appended.tier, 'the durable row must carry --spec and --tier so a GATE_RED run is attributable: ' + JSON.stringify(appended))
  const reArgs = ['--manifest', manifestPath, '--ledger', '--spec', appended.spec, '--tier', appended.tier, '--run-id', appended.runId]
  if (appended.diff && typeof appended.diff.loc === 'number') reArgs.push('--diff-loc', String(appended.diff.loc))
  if (appended.iteration !== undefined) reArgs.push('--iteration', String(appended.iteration))
  if (appended.diff && typeof appended.diff.base === 'string') {
    reArgs.push('--base-sha', appended.diff.base, '--head-sha', appended.diff.head)
    if (appended.diff.dirty) reArgs.push('--dirty')
  }
  // AC-20260901-09-13/D6: the driver threads a derived --checkpoint onto every review verdict
  // pass, both via values — a GATE_RED hard-stop row (worktree or in-place alike) is always
  // "not-reached" (no disposer mark can exist before LEGS even finishes).
  if (appended.checkpoint) {
    reArgs.push('--checkpoint', appended.checkpoint.outcome)
    if (appended.checkpoint.outcome === 'disposer') reArgs.push('--checkpoint-overrides', String(appended.checkpoint.overrides))
  }
  const reRun = runNode('scripts/verdict.js', reArgs)
  const reRunLine = reRun.stdout.trim().split('\n')[1]
  assert.ok(reRunLine, 'verdict.js must print a ledger line when re-invoked with the driver\'s own recorded flags against the same manifest: ' + reRun.stdout + reRun.stderr)
  const reRunRow = JSON.parse(reRunLine)
  delete reRunRow.ts
  const appendedNoTs = { ...appended }; delete appendedNoTs.ts
  assert.deepStrictEqual(appendedNoTs, reRunRow,
    'the durable row must be byte-equal (aside from ts) to verdict.js\'s own output for the same manifest and flags — any divergence means the driver hand-assembled the row instead of appending verdict.js\'s printed line: appended=' + JSON.stringify(appended) + ' reRun=' + JSON.stringify(reRunRow))
})

test('AC-20260821-04-2: WHEN the stopped-ledger path is not ignored at the main root THE SYSTEM appends .claude/spec-runs.stopped.jsonl to the main root\'s git info/exclude, re-checks, and proceeds with the durable write', () => {
  const host = makeWorktreeHost({ name: 'sr-durability-ac2', acId: 'AC-20260820-99-32', gateFails: true, ignoreStopped: false })

  const preCheck = spawnSync('git', ['-C', host.root, 'check-ignore', '-q', STOPPED_LEDGER_REL])
  assert.notStrictEqual(preCheck.status, 0,
    'setup precondition: this fixture\'s main root must start with the stopped-ledger path genuinely unignored, or the self-heal path is never exercised')

  const r = run(host.wt, host.spec)
  assert.strictEqual(stateOf(host.wt, host.spec), 'STOPPED',
    'setup precondition: the gate-failing fixture must hard-stop before this AC can be exercised: ' + r.stdout + r.stderr)

  const commonDirR = spawnSync('git', ['-C', host.root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' })
  assert.strictEqual(commonDirR.status, 0, 'setup: git-common-dir must resolve at the main root: ' + commonDirR.stderr)
  const excludePath = path.join(commonDirR.stdout.trim(), 'info/exclude')
  const excludeContent = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : ''
  assert.match(excludeContent, /(^|\n)\.claude\/spec-runs\.stopped\.jsonl(\n|$)/,
    'the self-heal must append the exact ignore line to <git-common-dir>/info/exclude when the path starts out unignored — without it every host repo hits the loud fallback forever, which is exactly the manual-setup gap D2 exists to close: ' + JSON.stringify(excludeContent))

  const postCheck = spawnSync('git', ['-C', host.root, 'check-ignore', '-q', STOPPED_LEDGER_REL])
  assert.strictEqual(postCheck.status, 0,
    'after the self-heal, `git check-ignore -q` must exit 0 at the main root — a nonzero exit here means the guard still treats the path as untracked and dangerous to write into, per A3\'s executed spike')

  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  const rows = readJsonl(stoppedPath)
  assert.ok(rows.some((x) => x.verdict === 'GATE_RED'),
    'once the self-heal succeeds the durable write must still proceed in the SAME hard-stop — a guard that only fixes the ignore state but skips the write this run would defer durability to a run that never comes: ' + JSON.stringify(rows))
})

test('AC-20260821-04-3: WHEN the main root\'s .gitignore negates the stopped-ledger path (outranking info/exclude) THE SYSTEM falls back to appending the row to the worktree\'s own ledger and the STOPPED text names the .gitignore remedy', () => {
  const host = makeWorktreeHost({ name: 'sr-durability-ac3', acId: 'AC-20260820-99-33', gateFails: true, ignoreStopped: false, negateStopped: true })
  const r = run(host.wt, host.spec)
  assert.strictEqual(stateOf(host.wt, host.spec), 'STOPPED',
    'setup precondition: the gate-failing fixture must hard-stop before this AC can be exercised: ' + r.stdout + r.stderr)

  const wtLedger = path.join(host.wt, '.claude/spec-runs.jsonl')
  const wtRows = readJsonl(wtLedger)
  assert.ok(wtRows.some((x) => x.verdict === 'GATE_RED'),
    'when the path genuinely cannot be made ignored, the row must land in the worktree\'s OWN ledger (today\'s pre-durability behavior) — a stop must never be silently dropped just because the durable location was unreachable: ' + JSON.stringify(wtRows))

  assert.match(r.stdout, /\.gitignore/,
    'the STOPPED step must name the .gitignore remedy line — an error path without its remedy is a hard finding under this repo\'s rules, and here the host would otherwise never learn how to stop taking the fallback: ' + r.stdout)
  assert.match(r.stdout, /spec-runs\.stopped\.jsonl/,
    'the remedy must literally name the negated path (.claude/spec-runs.stopped.jsonl) so the host knows exactly which .gitignore line to remove or amend: ' + r.stdout)
})

test('AC-20260821-04-4: WHEN the driver prints the STOPPED step THE SYSTEM names the absolute path the GATE_RED row actually landed in — the durable main-root path or the fallback worktree path — including on a bare re-invocation', () => {
  const durable = makeWorktreeHost({ name: 'sr-durability-ac4d', acId: 'AC-20260820-99-34', gateFails: true, ignoreStopped: true })
  const r1 = run(durable.wt, durable.spec)
  assert.strictEqual(stateOf(durable.wt, durable.spec), 'STOPPED', 'setup precondition: the durable fixture must hard-stop: ' + r1.stdout + r1.stderr)
  const durableStoppedPath = path.join(durable.root, STOPPED_LEDGER_REL)
  assert.ok(r1.stdout.includes(durableStoppedPath),
    'the STOPPED step must print the absolute durable path the row landed in — a session (or a later /spec:escape) cannot find terminal-red evidence it was never told the location of: ' + r1.stdout)
  const r1Again = run(durable.wt, durable.spec)
  assert.strictEqual(stateOf(durable.wt, durable.spec), 'STOPPED', 'a bare re-invocation must remain STOPPED: ' + r1Again.stdout + r1Again.stderr)
  assert.ok(r1Again.stdout.includes(durableStoppedPath),
    'a bare re-invocation after the stop must re-print the SAME durable path, sourced from the persisted sidecar mark — a session that returns later and gets a different or missing answer cannot trust the location: ' + r1Again.stdout)

  const fallback = makeWorktreeHost({ name: 'sr-durability-ac4f', acId: 'AC-20260820-99-35', gateFails: true, ignoreStopped: false, negateStopped: true })
  const r2 = run(fallback.wt, fallback.spec)
  assert.strictEqual(stateOf(fallback.wt, fallback.spec), 'STOPPED', 'setup precondition: the fallback fixture must hard-stop: ' + r2.stdout + r2.stderr)
  const fallbackLedgerPath = path.join(fallback.wt, '.claude/spec-runs.jsonl')
  assert.ok(r2.stdout.includes(fallbackLedgerPath),
    'the fallback case\'s STOPPED step must name the worktree ledger\'s absolute path (where the row actually landed) — printing the never-written main-root path here would send a session looking for evidence that does not exist: ' + r2.stdout)
  const r2Again = run(fallback.wt, fallback.spec)
  assert.ok(r2Again.stdout.includes(fallbackLedgerPath),
    'the fallback re-invocation must also re-print the worktree ledger path: ' + r2Again.stdout)
})

// specs/20260822/01-escalate-ledger-row.md D7/D12 (2026-08-22, AC-20260822-01-11): an escalate
// row (a capped-review row carrying "escalated": true) is drained by the exact same
// spec-partitioned mechanism as a GATE_RED stopped row — drainStoppedRows() partitions purely on
// JSON.parse(line).spec (A4), never on verdict word, so it needs zero code changes to also
// relocate an escalated:true row. cRow below is seeded alongside the pre-existing GATE_RED row to
// prove that: this is an extension of the SAME test (never weakened), retagged below.
test('AC-20260821-04-5 (also AC-20260822-01-11, SHALL CONTINUE TO): WHEN a worktree review closes CLEAN and the merge lands THE SYSTEM drains this spec\'s rows out of spec-runs.stopped.jsonl into the tracked ledger before the close row — including an escalated:true row, unchanged and in read order — leaving other specs\' rows byte-for-byte untouched', () => {
  const host = makeWorktreeHost({ name: 'sr-durability-ac5', acId: 'AC-20260820-99-36', gateFails: false, ignoreStopped: true })
  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  const aRow = JSON.stringify({ ts: '2026-08-21T00:00:00Z', stage: 'review', spec: host.specRel, verdict: 'GATE_RED', runId: 'rv_seed0000a1', tier: 'standard' })
  const bRow = JSON.stringify({ ts: '2026-08-21T00:00:00Z', stage: 'review', spec: 'specs/other/01-unrelated.md', verdict: 'GATE_RED', runId: 'rv_seed0000b1', tier: 'standard' })
  const cRow = JSON.stringify({ ts: '2026-08-21T01:00:00Z', stage: 'review', spec: host.specRel, verdict: 'HARD_FINDINGS', escalated: true, runId: 'rv_seed0000c1', tier: 'standard', iteration: 3 })
  fs.mkdirSync(path.dirname(stoppedPath), { recursive: true })
  fs.writeFileSync(stoppedPath, aRow + '\n' + bRow + '\n' + cRow + '\n')

  run(host.wt, host.spec)
  assert.strictEqual(stateOf(host.wt, host.spec), 'REVIEWER', 'setup precondition: green legs must reach REVIEWER before the drain can be exercised')
  run(host.wt, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('sr-durability-ac5-return', CLEAN_RETURN))
  const dispR = run(host.wt, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.wt, host.spec), 'CLOSE', 'setup precondition: a zero-survivor disposition must reach CLOSE: ' + dispR.stdout + dispR.stderr)

  host.gw('add', host.specRel); host.gw('commit', '-q', '-m', 'close')
  const closeR = run(host.wt, host.spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0, 'setup: closed must succeed once the tree is clean apart from the sidecar: ' + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(host.wt, host.spec), 'MERGE', 'setup precondition: a closed spec must land state MERGE')

  const merged = run(host.root, host.spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'the merge mark must succeed and run the spec-scoped drain before promoting the worktree ledger: ' + merged.stdout + merged.stderr)

  const trackedRows = readJsonl(path.join(host.root, '.claude/spec-runs.jsonl'))
  const gateRedIdx = trackedRows.findIndex((x) => x.spec === host.specRel && x.verdict === 'GATE_RED')
  const escalateIdx = trackedRows.findIndex((x) => x.spec === host.specRel && x.escalated === true)
  const cleanIdx = trackedRows.findIndex((x) => x.spec === host.specRel && x.verdict === 'CLEAN')
  assert.ok(gateRedIdx !== -1,
    'this spec\'s stopped GATE_RED row must be drained into the tracked ledger at merge time — left undrained it either dies with the worktree at cleanup or is stranded in the stopped file forever: ' + JSON.stringify(trackedRows))
  assert.ok(escalateIdx !== -1,
    'this spec\'s escalated:true row must ALSO be drained into the tracked ledger at merge time — the drain partitions purely by spec, never by verdict word, so an escalate row sitting in the same stopped file must relocate exactly like a GATE_RED row: ' + JSON.stringify(trackedRows))
  assert.ok(cleanIdx !== -1, 'setup: the merge must also append the authoritative CLEAN close row: ' + JSON.stringify(trackedRows))
  assert.ok(gateRedIdx < cleanIdx && escalateIdx < cleanIdx,
    'both drained rows (GATE_RED and escalated:true) must sit BEFORE the CLEAN close row in read order — qualifyingObservation() picks the LAST review row by read-order position, so either one landing after CLEAN would poison observation for this spec forever: ' + JSON.stringify(trackedRows))
  const drainedEscalate = trackedRows[escalateIdx]
  assert.strictEqual(drainedEscalate.escalated, true,
    'the drained row must still carry escalated:true unchanged — the drain moves rows verbatim, never rewriting fields: ' + JSON.stringify(drainedEscalate))
  assert.strictEqual(JSON.stringify(drainedEscalate), cRow,
    'the drained escalated row must be byte-for-byte identical to the seeded stopped-ledger line — the drain MOVES rows, it must never re-serialize or otherwise alter them: ' + JSON.stringify({ drainedEscalate, cRow }))

  const stoppedAfter = fs.existsSync(stoppedPath) ? fs.readFileSync(stoppedPath, 'utf8').trim() : ''
  assert.strictEqual(stoppedAfter, bRow,
    'the drain must remove ONLY this spec\'s rows (both the GATE_RED and the escalated:true row) from the stopped file, leaving the unrelated spec\'s row byte-for-byte untouched — rewriting or dropping another spec\'s evidence would be a second, unrelated data-loss bug riding this fix: ' + JSON.stringify({ stoppedAfter }))
})

test('AC-20260821-04-6: WHEN an in-place review closes CLEAN and the stopped file holds rows for this spec THE SYSTEM drains them into the tracked ledger before appending the close row, with the same ordering and other-spec preservation as the merge-time drain', () => {
  const host = makeHost()
  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  const aRow = JSON.stringify({ ts: '2026-08-21T00:00:00Z', stage: 'review', spec: host.specRel, verdict: 'GATE_RED', runId: 'rv_seed0000c1', tier: 'standard' })
  const bRow = JSON.stringify({ ts: '2026-08-21T00:00:00Z', stage: 'review', spec: 'specs/other/02-unrelated.md', verdict: 'GATE_RED', runId: 'rv_seed0000d1', tier: 'standard' })
  fs.mkdirSync(path.dirname(stoppedPath), { recursive: true })
  fs.writeFileSync(stoppedPath, aRow + '\n' + bRow + '\n')

  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('sr-durability-ac6-return', CLEAN_RETURN))
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup precondition: a zero-survivor in-place disposition must reach CLOSE: ' + dispR.stdout + dispR.stderr)

  const trackedRows = readJsonl(path.join(host.root, '.claude/spec-runs.jsonl'))
  const gateRedIdx = trackedRows.findIndex((x) => x.spec === host.specRel && x.verdict === 'GATE_RED')
  const cleanIdx = trackedRows.findIndex((x) => x.spec === host.specRel && x.verdict === 'CLEAN')
  assert.ok(gateRedIdx !== -1,
    'an abandoned-worktree-then-rebuilt-in-place path must also drain this spec\'s stopped GATE_RED row into the tracked ledger — doCloseWork() is the only append point for the in-place close, so the drain has to run there too: ' + JSON.stringify(trackedRows))
  assert.ok(cleanIdx !== -1, 'setup: the in-place close must append the authoritative CLEAN row: ' + JSON.stringify(trackedRows))
  assert.ok(gateRedIdx < cleanIdx,
    'the drained GATE_RED row must sit BEFORE the CLEAN close row in read order for the in-place path too, for the same qualifyingObservation() position-based reason as the merge-time drain: ' + JSON.stringify(trackedRows))

  const stoppedAfter = fs.existsSync(stoppedPath) ? fs.readFileSync(stoppedPath, 'utf8').trim() : ''
  assert.strictEqual(stoppedAfter, bRow,
    'the in-place drain must also leave another spec\'s stopped row byte-for-byte untouched: ' + JSON.stringify({ stoppedAfter }))
})

test('AC-20260821-04-7: WHEN git check-ignore -q .claude/spec-runs.stopped.jsonl runs at THIS repository\'s root THE SYSTEM exits 0', () => {
  const r = spawnSync('git', ['-C', path.join(SPEC, '..'), 'check-ignore', '-q', STOPPED_LEDGER_REL], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'this repo\'s own .gitignore must ignore .claude/spec-runs.stopped.jsonl (D7) — without the tracked line, D2\'s self-heal has to fire on every invocation here even though the dogfooding repo is exactly the host that should need zero manual setup: ' + JSON.stringify(r))
})

test('AC-20260821-04-10: WHEN a worktree hard-stop\'s row has landed durably and the worktree is then force-removed THE SYSTEM still returns the GATE_RED row from readLedgerRows(<mainRoot>)', () => {
  const host = makeWorktreeHost({ name: 'sr-durability-ac10', acId: 'AC-20260820-99-37', gateFails: true, ignoreStopped: true })
  const r = run(host.wt, host.spec)
  assert.strictEqual(stateOf(host.wt, host.spec), 'STOPPED', 'setup precondition: the gate-failing fixture must hard-stop: ' + r.stdout + r.stderr)
  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  assert.ok(fs.existsSync(stoppedPath) && readJsonl(stoppedPath).length > 0,
    'setup precondition: the durable write must have landed before the worktree is force-removed, or this AC never gets to exercise survival')

  const removeR = spawnSync('git', ['-C', host.root, 'worktree', 'remove', '--force', host.wt], { encoding: 'utf8' })
  assert.strictEqual(removeR.status, 0,
    'setup: force-removing the worktree must succeed so this test proves survival against the actual destructive remedy the STOPPED step itself names: ' + JSON.stringify(removeR))
  assert.ok(!fs.existsSync(host.wt), 'setup: the worktree directory must actually be gone after --force removal')

  const { readLedgerRows } = require(path.join(SPEC, 'scripts/lib/observation.js'))
  const rows = readLedgerRows(host.root)
  const gateRed = rows.find((x) => x.spec === host.specRel && x.verdict === 'GATE_RED')
  assert.ok(gateRed,
    'readLedgerRows(<mainRoot>) must still return the GATE_RED row after the worktree that produced it is force-removed — the row\'s durability is the WRITE location, not the reader (which already union-merges spec-runs*.jsonl with zero changes), and this is exactly what makes an abandoned worktree survivable: ' + JSON.stringify(rows))
})
