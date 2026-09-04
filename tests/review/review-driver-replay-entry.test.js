'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const { run, stateOf, seedReplayRow, seedReviewRow, fiveSeedReviews, makeReplayHost, driveToClose, commitClose, closeRunIdOf } = require('./review-driver.fixtures')

// Shard E of the review-driver family (review-driver-replay-entry.test.js, split from
// review-driver.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns the replay
// entry ACs: specs/20260821/02-replay-review-phase.md AC-20260821-02-1/-2;
// specs/20260823/09 AC-20260823-09-7; specs/20260903/01-owed-query-and-row-handoff.md AC-20260903-01-12;
// plus the seven-token selection line and replay-root-4 regressions. Shared helpers (incl. the
// replay fixture family) live in review-driver.fixtures.js (D2).

test('AC-20260821-02-1: WHEN a CLEAN close reaches REPLAY and the harness reports the window is not yet due THE SYSTEM transitions straight to DONE, printing the harness\'s own not-due line (reviewsSince=3) rather than deriving dueness itself', () => {
  const host = makeReplayHost('rvdrvreplaynotdue', {
    acId: 'AC-20260820-99-7',
    seedRows: [seedReplayRow('caught', 'rv_prior000000'), seedReviewRow(1), seedReviewRow(2)],
  })
  driveToClose(host, 'rvdrv-replay-notdue-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a not-due CLEAN close must still be accepted — REPLAY may never turn a finished review into a failure: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /not due/,
    'the driver must print the replay harness\'s own not-due verdict; a driver that decides dueness itself becomes a second derivation of the measurement window and will drift from replay.js: ' + r.stdout)
  assert.match(r.stdout, /reviewsSince=3/,
    'the harness\'s own count must be surfaced verbatim (2 seeded review rows + this run\'s close row after the last caught replay) — a hand-composed count hides a window-semantics change instead of failing on it: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a not-due close must pass through REPLAY untouched and land DONE — parking a review that owes no measurement would make every close hostage to the harness: ' + r.stdout)
})

test('AC-20260821-02-2: WHEN due and --select yields an eligible CLEAN row THE SYSTEM prints an execution step naming spec/commands/replay.md plus the selection\'s spec path and reviewRunId, reports state REPLAY, and prints no retired manual /spec:replay reminder anywhere in the run (D8)', () => {
  const host = makeReplayHost('rvdrvreplaydue', { acId: 'AC-20260820-99-8', seedRows: fiveSeedReviews })
  const closeStep = driveToClose(host, 'rvdrv-replay-due-ret')
  assert.doesNotMatch(closeStep.stdout, /replay is DUE/,
    'D8: the CLOSE step must no longer carry the advisory reminder — a printed "run it yourself" line is the exact mechanism this spec exists to replace, and leaving it beside a state machine that now runs the replay itself tells the user to do the work twice: ' + closeStep.stdout)
  assert.doesNotMatch(closeStep.stdout, /run \/spec:replay/,
    'D8: no step may instruct the session to run /spec:replay by hand at close — REPLAY executes replay.md\'s phases in this session instead: ' + closeStep.stdout)
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a due CLEAN close must be accepted and enter REPLAY, never refused: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /spec\/commands\/replay\.md/,
    'the execution step must name spec/commands/replay.md as the executor — duplicating its phases into the driver or review.md is the collision class the host Gotchas already record twice: ' + r.stdout)
  assert.match(r.stdout, new RegExp(host.specRel.replace(/[.\/]/g, '\\$&')),
    'the step must inline --select\'s chosen spec path; a step that omits it forces the session to re-derive the target by hand, which is what the driver exists to prevent: ' + r.stdout)
  assert.ok(r.stdout.includes(runId),
    'the step must inline --select\'s reviewRunId — it is the join key the replay row must carry for the mark to be satisfiable at all: ' + JSON.stringify({ runId, stdout: r.stdout }))
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a due close with a selected target must PARK at REPLAY — reaching DONE with the measurement unrun is precisely the skip this spec removes: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /replay is DUE/,
    'D8: the retired advisory line must not survive into the REPLAY step either: ' + r.stdout)
})

// specs/20260823/09-replay-baseline-attribution.md D6: replay.js --select gains two
// tokens (baselineRed/baselineLegs) appended after the five this driver already parses — the
// baseline step 7 attributes red legs against. parseSelection must capture them when present
// (AC-7, proven below via the real replay.js's actual seven-token output) and tolerate their
// absence without dying (AC-8) — but the real replay.js NEVER omits those tokens, so AC-8's
// absent-token case cannot be reached through this exec fixture at all; it's proven directly in
// tests/parse-selection/parse-selection.test.js instead (review finding).
test('AC-20260823-09-7: WHEN --select prints the two new baseline tokens THE SYSTEM prints baselineRed: and baselineLegs: lines in the REPLAY step body, inlining --select\'s own attribution baseline for step 7 to read', () => {
  const host = makeReplayHost('rvdrvreplaybaseline', { acId: 'AC-20260820-99-17', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-baseline-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'D6: a due close with a selected target carrying baseline tokens must still be accepted into REPLAY: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'setup precondition: the fixture must park at REPLAY before the baseline-token printing can be exercised: ' + r.stdout)
  assert.match(r.stdout, /baselineRed:\s*\S+/,
    'D6/AC-7: the REPLAY step body must print a baselineRed: line — omitting it leaves replay.md\'s step 7 ' +
    'with no baseline to attribute red legs against, forcing the exact rp_1b176ebff5c7 falsification this ' +
    'spec exists to stop: ' + r.stdout)
  assert.match(r.stdout, /baselineLegs:\s*\S+/,
    'D6/AC-7: the REPLAY step body must print a baselineLegs: line alongside baselineRed — step 7\'s D4 ' +
    'reconcile exemption and D5 question seam both need to know which legs the baseline recorded at all, ' +
    'not just which of them were red: ' + r.stdout)
})

// specs/20260903/01-owed-query-and-row-handoff.md D10: the REPLAY step body's --record
// sentence and the replay-recorded refusal's remedy command both gain --via driver — the review
// driver is the only caller that knows a replay run is driver-handed, so it prints the flag
// where the session copies the command from.
test('AC-20260903-01-12: WHEN the driver enters REPLAY with a selected target THE SYSTEM prints a step body whose --record sentence carries --review-run-id <id> --via driver', () => {
  const host = makeReplayHost('rvdrvreplayvia', { acId: 'AC-20260820-99-19', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-via-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'D10: a due close with a selected target must still be accepted into REPLAY: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'setup precondition: the fixture must park at REPLAY before the --record sentence can be exercised: ' + r.stdout)
  assert.match(r.stdout, new RegExp('--review-run-id ' + runId + ' --via driver'),
    'D10: the REPLAY step body\'s --record sentence must spell --via driver right after --review-run-id <id> ' +
    '— the review driver is the only caller that knows this run is driver-handed, and printing it where the ' +
    'session copies the command from is the cheapest correct stamp: ' + r.stdout)
})

test('AC-20260903-01-12: WHEN --mark replay-recorded is refused for a missing row THE SYSTEM prints a remedy command carrying --via driver before --legs', () => {
  const host = makeReplayHost('rvdrvreplayviaremedy', { acId: 'AC-20260820-99-20', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-via-remedy-ret')
  commitClose(host)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 2,
    'marking replay-recorded with no replay row for this review\'s target must still be refused: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.match(out, /--record --spec \S+ --review-run-id \S+ --via driver --legs/,
    'D10: the refusal\'s printed --record remedy command must carry --via driver right before --legs — a ' +
    'remedy the session copies verbatim that omits it would silently record the retry as manual: ' + out)
})

// Review of specs/20260823/09-replay-baseline-attribution.md: this test's earlier form
// claimed AC-20260823-09-8 (a FIVE-token line, neither baseline token present) but its fixture —
// makeReplayHost driving the REAL spec/scripts/replay.js — can never produce one: replay.js:340
// unconditionally prints both baselineRed=/baselineLegs= as VALUES, never omits the keys. So this
// exec test always exercised the seven-token shape and its two assertions passed trivially
// regardless of whether the regex's absence fallback worked. AC-8's actual coverage (the five-token
// / absent-token shape) lives in tests/parse-selection/parse-selection.test.js, which drives
// the extracted parser directly with a hand-built five-token string — the only way to reach that
// branch. This test is retargeted to what its exec fixture genuinely proves: a seven-token line
// (today's real replay.js output) still enters REPLAY without dying.
test('WHEN the driver parses a seven-token selection line carrying both baseline tokens (replay.js\'s real output shape) THE SYSTEM enters the REPLAY state and prints the step, never a parse die', () => {
  const host = makeReplayHost('rvdrvreplaynobaseline', { acId: 'AC-20260820-99-18', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-nobaseline-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a seven-token selection line — the only shape the real replay.js binary emits — must be ACCEPTED: ' +
    r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a close with a selected target carrying both baseline tokens must park at REPLAY exactly like any ' +
    'other selected close: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /\bdie\b|parse.*fail|cannot parse/i,
    'a well-formed seven-token line must never be treated as a parse failure: ' + r.stdout)
})

// Direct fix, no spec (the CWD-relocation trap): the driver's own replay.js calls were
// never vulnerable (they pass cwd: repoRoot explicitly), but the step it PRINTS hands the executing
// session every other --select value and left the root to be inferred from wherever the shell
// happened to stand. During the review of specs/20260827/01 that shell was inside the replay's own
// scratch worktree, so the measurement row was appended into a tree --teardown deleted seconds
// later. replay.js now takes --root; this pin makes the driver name the value so the session
// executing replay.md's phases has it in hand rather than reconstructing it.
test('replay-root-4: the REPLAY execution step inlines the repo root alongside the other --select values, so the session executing replay.md never has to infer the ledger\'s home from its own working directory', () => {
  const host = makeReplayHost('rvdrvreplayroot', { acId: 'AC-20260820-99-9', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-root-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a due CLEAN close must still be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'the run must park at REPLAY for this pin to be about the execution step at all: ' + r.stdout)
  assert.match(r.stdout, /root:\s+\S/,
    'the step must carry a root: value beside spec/reviewRunId/commit/parent/diffBase — every other ' +
    'selection value is inlined precisely so the session never re-derives, and the root is the one whose ' +
    'silent re-derivation cost a measurement on 2026-08-27: ' + r.stdout)
  assert.ok(r.stdout.includes(fs.realpathSync(host.root)) || r.stdout.includes(host.root),
    'the printed root must be the actual repo root the driver resolved, not a placeholder: ' +
    JSON.stringify({ root: host.root, stdout: r.stdout }))
  assert.match(r.stdout, /--root/,
    'the step must name the flag the value feeds — a bare path with no flag beside it is a fact, not an ' +
    'instruction, and the incident happened because the instruction was missing: ' + r.stdout)
})
