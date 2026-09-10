#!/usr/bin/env node
'use strict'

// Usage: node --test --test-reporter=./scripts/test-file-budget-reporter.js
//        --test-reporter-destination=stdout ... (alongside the spec reporter)
// Owner: specs/20260910/01-contention-proof-budget-and-uncapped-suite.md D2, D7
//   (AC-20260910-01-3, AC-20260910-01-4, AC-20260910-01-5, AC-20260910-01-8,
//    AC-20260910-01-9, AC-20260910-01-10)
//
// A node:test custom reporter that sums each test file's serial runtime and
// fails the run when any file is a CONFIRMED offender — node:test
// parallelises across files but serialises within one, so a file's summed
// test duration is its wall-clock floor, though that floor inflates under
// contention. A file whose summed duration exceeds the budget in the normal
// (parallel) stream is only a suspect: this reporter re-spawns itself as a
// serial child (--test-concurrency=1) over the suspects alone, with
// SPEC_TEST_BUDGET_CONFIRMING=1 set in the child env, and trusts only the
// child's own measurement to decide RED vs CONTENTION. With
// SPEC_TEST_BUDGET_CONFIRMING=1 already set, this same module measures and
// prints, spawning nothing — that is what keeps the recursion one level
// deep by construction.
//
// Does NOT: measure wall-clock time directly (it sums `duration_ms` off
// test:pass/test:fail events), replace or wrap the `spec` reporter's own
// output, decide pass/fail for the underlying test run, consult the serial
// child's own exit status (only its stdout measurement lines), or ever
// lower an exit code the run already set — it can only turn a green run
// red, never the reverse. A suspect the child could not measure at all
// (crashed, timed out, or printed no measurement line for that file) is
// treated as a CONFIRMED offender, not as contention: the guard fails
// closed, because an unmeasurable file is exactly the shape of a file that
// hangs.
//
// Exit codes (via process.exitCode, never process.exit):
//   sets 1  — some suspect is a confirmed offender after the serial re-run
//   sets nothing (leaves exitCode alone) — every file is under budget, every
//     suspect cleared as contention, or this is the confirming child (which
//     never judges); node:test's own pass/fail exit status is authoritative

const BUDGET_MS = 45000
const CONFIRMING_ENV = 'SPEC_TEST_BUDGET_CONFIRMING'
// D7: a fixed allowance for the confirm child's own node + test-runner startup cost (measured
// 90-160ms), added on top of the budget-scaled bound so a fixture-scale budget cannot kill the
// child before it ever reaches its first measurement line.
const CHILD_STARTUP_SLACK_MS = 30000
// D7: the confirm child's per-test timeout is budget * CHILD_TIMEOUT_FACTOR, strictly above the
// budget it judges — a threshold must never also be the clamp on the thing it measures, or a
// genuine offender gets truncated to (and sometimes rounds under) the very number it should fail.
const CHILD_TIMEOUT_FACTOR = 2

// D2: SPEC_TEST_FILE_BUDGET_MS may only tighten the budget, never loosen it.
function resolveBudget(env) {
  const raw = env && env.SPEC_TEST_FILE_BUDGET_MS
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? Math.min(BUDGET_MS, n) : BUDGET_MS
}

// Confirms the given suspect relpaths by re-running them serially, in-process
// recursion-safe because the child carries SPEC_TEST_BUDGET_CONFIRMING=1.
// D7: the child is bounded, never unbounded — its own --test-timeout=<budget *
// CHILD_TIMEOUT_FACTOR> plus --test-force-exit stops a hanging test strictly
// above the budget (never at the budget itself, or a genuine offender's
// measurement gets truncated to the threshold it is compared against), and
// the spawnSync timeout (budget * CHILD_TIMEOUT_FACTOR * (suspects + 1) +
// CHILD_STARTUP_SLACK_MS) kills the child itself if it hangs anyway, so a
// never-resolving test cannot hang the whole suite. The slack term is
// process-startup allowance only, not part of the hang bound itself.
// Returns a Map relpath -> { ms, timedOut } for every suspect the child
// managed to measure; a suspect missing from the map could not be measured
// at all. `timedOut` marks a file in which some test timed out or was
// cancelled inside the child — such a file confirms regardless of its ms.
function confirmSuspects(suspectRelPaths, budget) {
  const { spawnSync } = require('child_process')
  const env = Object.assign({}, process.env, { [CONFIRMING_ENV]: '1' })
  delete env.NODE_TEST_CONTEXT
  const childTimeout = budget * CHILD_TIMEOUT_FACTOR

  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      '--test-timeout=' + childTimeout,
      '--test-force-exit',
      '--test-reporter=' + __filename,
      '--test-reporter-destination=stdout',
      ...suspectRelPaths
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: childTimeout * (suspectRelPaths.length + 1) + CHILD_STARTUP_SLACK_MS,
      env
    }
  )

  const measured = new Map()
  const stdout = (result && result.stdout) || ''
  // Raw, not rounded: rounding here would let a true duration between the
  // budget and budget + 0.5ms print as exactly "<budget>ms" and compare as
  // not-over — the parent must judge the real number, not its display form.
  const re = /^__FILE_BUDGET_MEASURED__ (.+) ([\d.]+)ms( timedout)?$/gm
  let m
  while ((m = re.exec(stdout))) {
    measured.set(m[1], { ms: Number(m[2]), timedOut: Boolean(m[3]) })
  }
  return measured
}

async function* reporter(source) {
  const confirming = process.env[CONFIRMING_ENV] === '1'
  const budget = resolveBudget(process.env)
  const perFile = new Map() // absolute file path -> summed duration_ms
  const timedOutFiles = new Set() // absolute file path -> some test in it timed out/was cancelled

  for await (const ev of source) {
    if (
      (ev.type === 'test:pass' || ev.type === 'test:fail') &&
      ev.data &&
      ev.data.nesting === 0 &&
      ev.data.file
    ) {
      const dur = (ev.data.details && ev.data.details.duration_ms) || 0
      perFile.set(ev.data.file, (perFile.get(ev.data.file) || 0) + dur)
      const failureType = ev.data.details && ev.data.details.error && ev.data.details.error.failureType
      if (failureType === 'testTimeoutFailure' || failureType === 'cancelledByParent') {
        timedOutFiles.add(ev.data.file)
      }
    }
  }

  const path = require('path')
  const cwd = process.cwd()
  const rows = Array.from(perFile.entries())
    .map(([absFile, ms]) => [path.relative(cwd, absFile), ms, absFile])
    .sort((a, b) => b[1] - a[1]) // worst first

  // The confirming child: measure and print, never judge, never spawn. A file
  // in which some test timed out or was cancelled is marked ` timedout` — its
  // duration_ms lands near the child's own timeout, not the file's real
  // serial duration, so the parent must confirm it regardless of the number.
  if (confirming) {
    for (const [file, ms, absFile] of rows) {
      const suffix = timedOutFiles.has(absFile) ? ' timedout' : ''
      // Raw duration, decimals included — the parent compares this exact
      // number against the budget; rounding here would reintroduce the
      // truncate-to-budget window the parent-side fix closes.
      yield `__FILE_BUDGET_MEASURED__ ${file} ${ms}ms${suffix}\n`
    }
    return
  }

  const suspects = rows.filter(([, ms]) => ms > budget)

  if (suspects.length === 0) {
    const slowest = rows[0]
    const label = slowest ? slowest[0] : '(none)'
    const ms = slowest ? Math.round(slowest[1]) : 0
    yield `__FILE_BUDGET_OK__ slowest ${label} ${ms}ms of ${budget}ms\n`
    return
  }

  const measured = confirmSuspects(suspects.map(([file]) => file), budget)
  let anyConfirmed = false

  for (const [file, loadMs] of suspects) {
    const entry = measured.get(file)
    // Unmeasurable => confirmed (fail closed). Timed out/cancelled inside the
    // child => confirmed regardless of its number — a timeout's duration_ms
    // lands near the child's per-test timeout, not the file's real serial
    // duration, so the number alone must never clear it. Compare before any
    // rounding: rounding first can push a true offender's ms down to exactly
    // the budget and read as cleared.
    const confirmed = !entry || entry.timedOut || entry.ms > budget
    if (confirmed) {
      // Report the alone measurement when we have one — it is the proof —
      // and fall back to the load measurement when the child could not
      // produce one at all.
      anyConfirmed = true
      const ms = entry ? entry.ms : loadMs
      yield `__FILE_BUDGET_RED__ ${file} ${Math.round(ms)}ms > ${budget}ms` +
        ` — split this file into sibling *.test.js files (node:test runs one` +
        ` file's tests serially; specs/20260903/06-test-suite-critical-path.md)\n`
    } else {
      yield `__FILE_BUDGET_CONTENTION__ ${file} ${Math.round(loadMs)}ms under load but` +
        ` ${Math.round(entry.ms)}ms alone — under the ${budget}ms budget, not a red\n`
    }
  }

  if (anyConfirmed) {
    process.exitCode = 1
  }
}

module.exports = reporter
module.exports.BUDGET_MS = BUDGET_MS
module.exports.resolveBudget = resolveBudget
module.exports.CONFIRMING_ENV = CONFIRMING_ENV
module.exports.CHILD_STARTUP_SLACK_MS = CHILD_STARTUP_SLACK_MS
module.exports.CHILD_TIMEOUT_FACTOR = CHILD_TIMEOUT_FACTOR
