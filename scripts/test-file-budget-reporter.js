#!/usr/bin/env node
'use strict'

// Usage: node --test --test-reporter=./scripts/test-file-budget-reporter.js
//        --test-reporter-destination=stdout ... (alongside the spec reporter)
// Owner: specs/20260903/07-test-file-budget-guard.md D1/D2/D4/D5
//   (AC-20260903-07-2, AC-20260903-07-3, AC-20260903-07-4, AC-20260903-07-5)
//
// A node:test custom reporter that sums each test file's serial runtime and
// fails the run when any file exceeds a budget — node:test parallelises
// across files but serialises within one, so a file's summed test duration
// is its wall-clock floor. Catches the trap sibling spec 06 removed once
// (one file quietly becoming the suite's floor again) from reforming
// silently, because node:test itself would otherwise stay green, only
// slower.
//
// Does NOT: measure wall-clock time directly (it sums `duration_ms` off
// test:pass/test:fail events), replace or wrap the `spec` reporter's own
// output, decide pass/fail for the underlying test run, or ever lower an
// exit code the run already set — it can only turn a green run red, never
// the reverse.
//
// Exit codes (via process.exitCode, never process.exit):
//   sets 1  — some file's summed test duration exceeds the budget
//   sets nothing (leaves exitCode alone) — every file is under budget;
//     node:test's own pass/fail exit status is authoritative

const BUDGET_MS = 45000

// D2: SPEC_TEST_FILE_BUDGET_MS may only tighten the budget, never loosen it.
function resolveBudget(env) {
  const raw = env && env.SPEC_TEST_FILE_BUDGET_MS
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? Math.min(BUDGET_MS, n) : BUDGET_MS
}

async function* reporter(source) {
  const budget = resolveBudget(process.env)
  const perFile = new Map() // absolute file path -> summed duration_ms

  for await (const ev of source) {
    if (
      (ev.type === 'test:pass' || ev.type === 'test:fail') &&
      ev.data &&
      ev.data.nesting === 0 &&
      ev.data.file
    ) {
      const dur = (ev.data.details && ev.data.details.duration_ms) || 0
      perFile.set(ev.data.file, (perFile.get(ev.data.file) || 0) + dur)
    }
  }

  const path = require('path')
  const cwd = process.cwd()
  const rows = Array.from(perFile.entries())
    .map(([file, ms]) => [path.relative(cwd, file), ms])
    .sort((a, b) => b[1] - a[1]) // worst first

  const offenders = rows.filter(([, ms]) => ms > budget)

  if (offenders.length > 0) {
    process.exitCode = 1
    for (const [file, ms] of offenders) {
      yield `__FILE_BUDGET_RED__ ${file} ${Math.round(ms)}ms > ${budget}ms` +
        ` — split this file into sibling *.test.js files (node:test runs one` +
        ` file's tests serially; specs/20260903/06-test-suite-critical-path.md)\n`
    }
  } else {
    const slowest = rows[0]
    const label = slowest ? slowest[0] : '(none)'
    const ms = slowest ? Math.round(slowest[1]) : 0
    yield `__FILE_BUDGET_OK__ slowest ${label} ${ms}ms of ${budget}ms\n`
  }
}

module.exports = reporter
module.exports.BUDGET_MS = BUDGET_MS
module.exports.resolveBudget = resolveBudget
