'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')
const { GREEN_TEST, specBody, run, stateOf, returnFileWith, CLEAN_RETURN, fiveSeedReviews, makeReplayHost, driveToClose, commitClose, ledgerRows, closeRunIdOf } = require('./review-driver.fixtures')

// Shard F of the review-driver family (review-driver-replay-record.test.js, split from
// review-driver.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns the replay
// record ACs: specs/20260821/02-replay-review-phase.md AC-20260821-02-2/-3/-4/-5/-6/-7 (the
// worktree merge carrier and the record-outcome mechanics). Shared helpers (incl. the replay
// fixture family) live in review-driver.fixtures.js (D2).

test('AC-20260821-02-3: WHEN due but --select resolves no usable CLEAN target THE SYSTEM transitions to DONE printing the harness\'s own advisory — a due-but-unmeasurable close is never parked', () => {
  // The exit-1 arm ("no eligible CLEAN row in the window") is structurally unreachable from
  // REPLAY: the driver's own close appends a CLEAN review row with a runId moments earlier, so a
  // candidate always exists. The reachable arm is --select failing to RESOLVE that candidate
  // (exit 4) — here because the spec's newest commit has no parent revision carrying the spec.
  const host = makeReplayHost('rvdrvreplaynosel', { acId: 'AC-20260820-99-9', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-nosel-ret')
  commitClose(host, { amend: true })
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a close the harness cannot select a target for must still be accepted — an unmeasurable window may never fail a finished review: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /replay\.js:/,
    'the harness\'s own advisory must be printed verbatim so the reason the measurement was skipped is on the record, not silently swallowed: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a due close with nothing selectable must land DONE, never park — the review would otherwise be unfinishable through no fault of its own: ' + r.stdout)
})

test('AC-20260821-02-4: WHEN --mark replay-recorded is given and the ledger holds no stage:"replay" row for the sidecar target\'s reviewRunId THE SYSTEM refuses with exit 2, naming the missing row for that reviewRunId and the replay.js --record remedy', () => {
  const host = makeReplayHost('rvdrvreplaynorow', { acId: 'AC-20260820-99-10', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-norow-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  // A replay row for a DIFFERENT target — a concurrent session's measurement — must not satisfy
  // this review's mark: the join is on the selected target's reviewRunId, never a bare count.
  fs.appendFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), JSON.stringify({
    ts: '2026-08-21T00:00:00Z', stage: 'replay', spec: 'specs/other/01-other.md',
    runId: 'rp_other000000', reviewRunId: 'rv_someoneelse', class: 'off-by-one',
    files: ['x.js'], legs: 'green', outcome: 'caught', tokens: 1,
  }) + '\n')

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 2,
    'marking replay-recorded with no replay row for THIS review\'s target must be refused — accepting it would let the state machine report a measurement that never happened, which is the procedural-hallucination failure the driver exists to block: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(runId),
    'the refusal must name the target reviewRunId whose replay row is missing, or the session cannot tell which measurement it still owes: ' + JSON.stringify({ runId, out }))
  assert.match(out, /--record/,
    'the refusal must name the replay.js --record remedy — an error path without its remedy command is a hard finding under this repo\'s rules: ' + out)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a refused mark must leave the state unchanged; a foreign session\'s replay row must never advance this review: ' + out)
})

test('AC-20260821-02-5: WHEN a stage:"replay" row for the target reviewRunId exists with the non-measurement outcome setup-failed THE SYSTEM accepts replay-recorded and transitions to DONE — any recorded outcome concludes the review', () => {
  const host = makeReplayHost('rvdrvreplaysetupfail', { acId: 'AC-20260820-99-11', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-setupfail-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  // Recorded through the real harness, never a hand-written line — the mark's join must hold
  // against the row shape replay.js actually appends.
  const rec = runNode('scripts/replay.js', ['--record', '--spec', host.specRel, '--review-run-id', runId,
    '--legs', 'none', '--outcome', 'setup-failed'], { cwd: host.root })
  assert.strictEqual(rec.status, 0, 'setup: replay.js --record must accept a setup-failed row: ' + rec.stdout + rec.stderr)

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 0,
    'a recorded setup-failed outcome must satisfy the mark — parking a finished review on a broken scratch worktree would make an infrastructure failure block delivery: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'once any outcome is on the record the review must conclude; the harness stays due (replay.js D5) and retries at the NEXT review, never this one: ' + r.stdout)
})

test('AC-20260821-02-6: WHEN the recorded outcome is missed THE SYSTEM CONTINUES TO leave the reviewed spec at status: done and appends no review-stage ledger row from the mark — replay measures the reviewer, never the verdict', () => {
  const host = makeReplayHost('rvdrvreplaymissed', { acId: 'AC-20260820-99-12', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-missed-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  const scratch = fs.realpathSync(tmpdir('rvdrv-replay-missed-art'))
  const patchFile = path.join(scratch, 'mutation.patch')
  fs.writeFileSync(patchFile, [
    'diff --git a/src/foo.js b/src/foo.js',
    'index 1111111..2222222 100644',
    '--- a/src/foo.js',
    '+++ b/src/foo.js',
    '@@ -1 +1 @@',
    '-module.exports = () => 42',
    '+module.exports = () => 41',
    '',
  ].join('\n'))
  const workflowFile = path.join(scratch, 'blind-return.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }))
  const rec = runNode('scripts/replay.js', ['--record', '--spec', host.specRel, '--review-run-id', runId,
    '--legs', 'green', '--outcome', 'missed', '--class', 'silent-fallback',
    '--patch', patchFile, '--workflow', workflowFile], { cwd: host.root })
  assert.strictEqual(rec.status, 0, 'setup: replay.js --record must accept a missed row: ' + rec.stdout + rec.stderr)

  const reviewsBefore = ledgerRows(host.root).filter((x) => x.stage === 'review').length
  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 0,
    'a missed outcome must conclude the review exactly like a caught one — gating the verdict on the reviewer\'s own score confuses what is being measured: ' + r.stdout + r.stderr)
  assert.match(fs.readFileSync(host.spec, 'utf8'), /^status:\s*done$/m,
    'a missed replay must leave the reviewed spec at status: done — the verdict is committed history and REPLAY may never re-open it: ' + r.stdout)
  assert.strictEqual(ledgerRows(host.root).filter((x) => x.stage === 'review').length, reviewsBefore,
    'the mark must append no review-stage ledger row — a second review row for one review would double-count the very denominator the replay window is measured against: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a recorded missed outcome must land DONE: ' + r.stdout)
})

test('AC-20260821-02-7: WHEN review ran on the originating branch (merge-back skipped with its one-line note) THE SYSTEM still enters REPLAY before DONE — the skip path is not a back door around the measurement', () => {
  const host = makeReplayHost('rvdrvreplayskip', { acId: 'AC-20260820-99-13', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-skip-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0, 'setup: the merge-skipped close must be accepted: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /originating branch/,
    'setup precondition: this fixture has no build branch, so the driver must take the merge-skipped arm: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'the merge-skipped arm must reach REPLAY too — a review that happened not to run in a worktree owes the same measurement as one that did, and an arm that bypasses REPLAY makes the whole state a matter of where the session happened to be standing: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /^## DONE$/m,
    'the merge-skipped arm must NOT print DONE while a due replay is outstanding: ' + r.stdout)
})

test('AC-20260821-02-2 (worktree merge carrier): WHEN a due CLEAN close merges back from a linked worktree THE SYSTEM survives cleanup — the sidecar is retained in the MAIN root, state is REPLAY, and the printed step names the main-root spec path (D8 (b))', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-replay-wt'))
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
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-replay-wt', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  const specRel = 'specs/20260820/99-drv-replay-wt.md'
  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-14' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-14'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  // The ledger lives under the review's own root (the worktree) until the merge promotes it.
  fs.mkdirSync(path.join(wt, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(wt, '.claude/spec-runs.jsonl'),
    fiveSeedReviews.map((r) => JSON.stringify(r)).join('\n') + '\n')

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the two-branch fixture must reach REVIEWER on green legs')
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-replay-wt-return', CLEAN_RETURN))
  run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean worktree pass must reach CLOSE')
  gw('add', specRel); gw('commit', '-q', '-m', 'close')
  const closed = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'setup: closed must succeed: ' + closed.stdout + closed.stderr)

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'the merge mark must be accepted and run merge + cleanup + verify before REPLAY: ' + merged.stdout + merged.stderr)
  assert.ok(!fs.existsSync(wt),
    'cleanup must still remove the build worktree — retaining the sidecar for REPLAY may never come at the cost of leaving the worktree behind: ' + merged.stdout)
  const mainSpec = path.join(root, specRel)
  const mainSidecar = path.join(root, 'specs/20260820/99-drv-replay-wt.review/review-state.json')
  assert.ok(fs.existsSync(mainSidecar),
    'the sidecar must survive cleanup in the MAIN root — REPLAY runs after the worktree is gone, and a sidecar that died with it would leave the review unfinishable and its own state unreadable: ' + merged.stdout)
  assert.match(merged.stdout, new RegExp(specRel.replace(/[.\/]/g, '\\$&')),
    'the printed step must name the main-root spec path; naming the deleted worktree path would hand the session a command that cannot run: ' + merged.stdout)
  assert.match(merged.stdout, /spec\/commands\/replay\.md/,
    'the merged path must print the same REPLAY execution step as the in-place path: ' + merged.stdout)
  assert.strictEqual(stateOf(root, mainSpec), 'REPLAY',
    'a due close that merged back must park at REPLAY, re-derivable from the main root alone — a fresh session resuming after the merge has nothing else to read: ' + merged.stdout)
})
