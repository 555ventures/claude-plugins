'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260823/04-review-close-hardening.md D4/D5 (2026-08-23, rv_6825fa48c98d): the recorded
// deadlock chain — merge landed -> finishMerge promoted evidence into the main root (dirtying it
// BY DESIGN) and deleted the worktree's tracked ledger copy (dirtying the WORKTREE) -> `git
// worktree remove` refused (spiked exit 128) -> the driver died mid-finishMerge -> a retry
// re-entered handleMergeStrategy, re-ran merge-back.sh merge, and died on assert_clean_root
// against its own promoted evidence — a permanent MERGE-state wedge with no recorded mark. D4
// makes handleMergeStrategy re-entrant (skip merge-back.sh merge once the source is already fully
// contained in the target); D5 makes evidence promotion restore tracked worktree copies instead
// of deleting them. Per this spec's own Rationale ("Fragile to watch"), these tests build the
// FULL synthetic worktree-review state (real repo, real linked worktree, real spec branch, a real
// review sidecar reaching marks.closed === true, real promoted-evidence files) rather than assert
// on prose — every assertion below is proven red against the current driver by direct execution.

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = (acId) => `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('${acId}: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase, acId) {
  return `---
status: implementing
tier: standard
build_base: ${diffBase}
---
# Merge Reentry Test Spec

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

const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

function run(cwd, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd })
}
const stateOf = (cwd, spec) => run(cwd, spec, '--state').stdout.trim()

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

// Builds a real main root + real linked worktree (via merge-back.sh create) + a real spec branch,
// drives the driver through LEGS -> REVIEWER -> DISPOSITIONS -> CLOSE with a clean reviewer
// return, commits the close, and marks `closed` — landing at real state MERGE with
// marks.closed === true in a real <spec>.review/review-state.json sidecar. `trackLedger`
// pre-commits an initial `.claude/spec-runs.jsonl` on main BEFORE the worktree is created, so the
// worktree inherits it TRACKED — CLOSE's own appendLedger() then appends one row to that same
// tracked file inside the worktree, leaving it modified-but-uncommitted (AC-6's exact setup).
// `label` names the fixture's tmpdir/branch (any short slug); `acId` is the well-formed AC-ID
// token (AC-YYYYMMDD-NN-N) stamped into the fixture's own Decisions/Acceptance Criteria — this
// repo's ac-matrix.js requires that exact shape (spec-pipeline.md's own Gotcha) or it reports the
// fixture's promise as uncovered/orphaned and DISPOSITIONS never reaches CLEAN, regardless of
// this AC's own subject matter.
function driveToMerge(label, acId, { trackLedger = false } = {}) {
  const root = fs.realpathSync(tmpdir('merge-reentry'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  if (trackLedger) fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), '{"stage":"seed"}\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  // merge-back.sh branch-for derives the branch name deterministically from the spec's own
  // filename stem (`spec/<stem>`, no argument) — the branch created here MUST match that
  // derivation exactly, or sourceBranchFor()'s branchExists() check reads it as "no branch to
  // merge" and the driver short-circuits straight past MERGE into REPLAY/DONE, which would make
  // every assertion below vacuous.
  const specStem = `99-${label}`
  const branch = 'spec/' + specStem
  const created = runBash('scripts/merge-back.sh', ['create', '--source', branch, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260823'), { recursive: true })
  const specRel = `specs/20260823/${specStem}.md`
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody(baseSha, acId))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST(acId))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')

  const setupRun = run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER',
    `setup precondition (${label}): a fresh green-legs fixture must reach REVIEWER: ` + setupRun.stdout + setupRun.stderr)
  const returnFile = returnFileWith('mr-clean-' + label, CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const dispR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE',
    `setup precondition (${label}): a clean disposition must reach CLOSE: ` + dispR.stdout + dispR.stderr)

  // The session's close commit — specific file only, never `add -A` (never commits the sidecar
  // or the ledger, per D10's "dies with the worktree at cleanup, by design").
  gw('add', specRel)
  gw('commit', '-q', '-m', 'close')
  const closeR = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0,
    `setup precondition (${label}): closed must succeed once the tree is clean apart from the sidecar and the ledger: ` + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE', `setup precondition (${label}): a closed spec must land state MERGE`)

  return { root, wt, spec, branch, gw }
}

function dirtyRootWithPromotedEvidence(root) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), '{"stage":"close","runId":"rv_partial_promotion"}\n')
}

test('AC-20260823-04-5: WHEN --mark merge-strategy re-runs after the source branch is already fully contained in the target (rev-list --count target..source = 0) THE SYSTEM skips the merge invocation and proceeds to evidence promotion and cleanup even when the main root carries uncommitted promoted evidence — no "root working tree is dirty" death, and the driver reaches its REPLAY/DONE tail', () => {
  const { root, wt, spec, branch } = driveToMerge('ac5', 'AC-20260823-99-5')

  // Simulate the recorded wedge directly: the merge already landed (as the driver's own first
  // handleMergeStrategy call would have done) but the process died before finishMerge concluded,
  // leaving evidence promoted into a now-dirty main root and the worktree/branch still present.
  execFileSync('git', ['-C', root, 'merge', '--no-ff', '--no-edit', branch], { encoding: 'utf8' })
  const contained = execFileSync('git', ['-C', root, 'rev-list', '--count', `main..${branch}`], { encoding: 'utf8' }).trim()
  assert.strictEqual(contained, '0',
    'setup precondition: the manual merge must leave the source branch fully contained in the target, or this fixture is not actually exercising the re-entrant (already-landed) condition AC-5 pins')
  dirtyRootWithPromotedEvidence(root)

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'a re-entrant merge-strategy mark, issued after the source is already fully contained in the target, must not die on the root\'s own dirty state from a prior partial promotion — accepting the old unconditional die() here is exactly rv_6825fa48c98d\'s permanent MERGE-state wedge: ' + merged.stdout + merged.stderr)
  assert.doesNotMatch(merged.stdout + merged.stderr, /root working tree is dirty/,
    'D4 requires the driver to SKIP merge-back.sh merge (and therefore its assert_clean_root) once the source is already contained in the target — this exact refusal text reaching the caller means the skip never happened: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE|REPLAY/,
    'a successful re-entrant merge-strategy call must reach its REPLAY/DONE tail, resuming at promotion/cleanup rather than staying wedged at MERGE with no recorded mark: ' + merged.stdout)
  assert.ok(!fs.existsSync(wt),
    'a concluded re-entrant merge must still remove the now-unused worktree — a lingering worktree here means the skip short-circuited past cleanup entirely instead of resuming it')
})

test('AC-20260823-04-8 (also SHALL CONTINUE TO): WHEN the merge has not yet landed (rev-list --count target..source >= 1) and the main root is dirty THE SYSTEM refuses the first merge with the dirty-root remedy — this behavior must be unchanged by D4\'s re-entrancy fix', () => {
  const { root, wt, spec, branch } = driveToMerge('ac8', 'AC-20260823-99-8')

  const notYetLanded = execFileSync('git', ['-C', root, 'rev-list', '--count', `main..${branch}`], { encoding: 'utf8' }).trim()
  assert.notStrictEqual(notYetLanded, '0',
    'setup precondition: the source branch must NOT yet be contained in the target — this fixture must never manually merge, or it would silently become AC-5\'s scenario instead of AC-8\'s')
  fs.writeFileSync(path.join(root, 'stray-dirty.txt'), 'uncommitted, unrelated to any promotion\n')

  const refused = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(refused.status, 2,
    'the FIRST merge attempt against a dirty root must still be refused — D4 only skips assert_clean_root once the merge has ALREADY landed, and this fixture\'s merge has not: ' + refused.stdout + refused.stderr)
  assert.match(refused.stdout + refused.stderr, /root working tree is dirty/,
    'the refusal must carry merge-back.sh\'s own dirty-root message so the session knows the literal remedy: ' + refused.stdout + refused.stderr)
  assert.match(refused.stdout + refused.stderr, /commit or stash/,
    'the refusal must name the remedy command family (commit or stash) per this repo\'s error-message convention: ' + refused.stdout + refused.stderr)
  assert.ok(fs.existsSync(wt), 'a refused merge-strategy mark must never remove the worktree — the merge never landed, so nothing is safe to clean up yet')
})

test('AC-20260823-04-6: WHEN evidence promotion clears a worktree copy of .claude/spec-runs.jsonl that is tracked in the worktree with one appended uncommitted row THE SYSTEM restores it to the worktree\'s HEAD content instead of deleting it, so the subsequent `git worktree remove` (no --force) succeeds', () => {
  const { root, wt, spec } = driveToMerge('ac6', 'AC-20260823-99-6', { trackLedger: true })

  // CLOSE's own doCloseWork() appended one row to the WORKTREE's tracked .claude/spec-runs.jsonl
  // (repoRoot was the worktree at CLOSE time) — confirm the fixture actually produced the dirty
  // tracked file this AC exercises, before trusting the merge outcome below to mean anything.
  const wtLedgerStatus = execFileSync('git', ['-C', wt, 'status', '--porcelain', '--', '.claude/spec-runs.jsonl'], { encoding: 'utf8' }).trim()
  assert.match(wtLedgerStatus, /^\s?M\s+\.claude\/spec-runs\.jsonl$/,
    'setup precondition: .claude/spec-runs.jsonl must be a TRACKED, MODIFIED (not untracked, not deleted) file in the worktree before merge-strategy runs, or this fixture is not exercising AC-6\'s tracked-restore path: ' + JSON.stringify(wtLedgerStatus))

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'deleting a tracked file (today\'s fs.rmSync) guarantees `git worktree remove` refuses (spiked exit 128 per A1) — merge-back.sh cleanup then dies and the whole mark exits 2; a restore instead of a delete is the only way this exits 0: ' + merged.stdout + merged.stderr)
  assert.ok(!fs.existsSync(wt),
    'the worktree must be gone after a successful merge-strategy mark — its removal is proof that `git worktree remove <wt>` (merge-back.sh cleanup NEVER passes --force, per merge-back.sh\'s own cleanup subcommand) exited 0, which is only possible if `git -C <wt> status --porcelain` was empty at that moment')
  assert.match(merged.stdout, /DONE|REPLAY/, 'a successful merge-strategy mark must reach its REPLAY/DONE tail: ' + merged.stdout)

  const promotedLedger = fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8')
  const promotedLines = promotedLedger.split('\n').filter(Boolean)
  assert.ok(promotedLines.length >= 2,
    'the worktree\'s appended CLOSE row must have been PROMOTED into the main root\'s ledger before the tracked worktree copy was restored — a restore that discarded the row instead of promoting it first would silently lose this review\'s durable evidence: ' + JSON.stringify(promotedLines))
  for (const l of promotedLines) {
    assert.doesNotThrow(() => JSON.parse(l), 'every promoted ledger line must remain valid JSON — a byte-level splice bug in promotion would corrupt every downstream ledger reader: ' + l)
  }
})
