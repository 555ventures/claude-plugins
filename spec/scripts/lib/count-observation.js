#!/usr/bin/env node
'use strict'
// spec/scripts/lib/count-observation.js — required by review-legs.js and release-legs.js. No CLI.
//
// Why (specs/20260908/05-release-e2e-unobserved-count.md D1): review-legs.js defined
// lastMatch/computeTestsExecuted/computeSkips/isUnobserved locally (specs/20260907/03 D4/D5);
// release-legs.js then copied computeTestsExecuted/computeSkips by hand, and that copy had
// already drifted — it read the FIRST regex match instead of the LAST (measured A1). This
// module is the one binding home for all four functions so the two consumers can never read a
// runner's output differently again; each importer requires this file instead of re-defining
// any of them.
//
// What this deliberately does NOT do: parse a runner's exit code, decide what forces a leg red
// (that stays in each leg script, which owns its own row grammar), or provide a CLI.
//
// Exit codes: n/a — this file is a library, never executed directly.

// Last match of `pattern` (a regex source string) over `output`, or null. LAST, never first: a
// test NAME that quotes the summary phrase precedes the real summary line in typical runner
// output, and a first-match read would silently take the decoy as the count.
function lastMatch(output, pattern) {
  let last = null
  for (const m of output.matchAll(new RegExp(pattern, 'g'))) last = m
  return last
}

// N | {unavailable:'no-format-declared'} (pattern absent or 'none') | {unavailable:'pattern-no-match'}
function computeTestsExecuted(output, pattern) {
  if (!pattern || pattern === 'none') return { unavailable: 'no-format-declared' }
  const m = lastMatch(output, pattern)
  return m ? (Number(m[1]) || 0) : { unavailable: 'pattern-no-match' }
}

// {skips: N, todos: N} | {skips: {unavailable:'no-format-declared'}} | {skips: {unavailable:'pattern-no-match'}}
function computeSkips(output, pattern) {
  if (!pattern || pattern === 'none') return { skips: { unavailable: 'no-format-declared' } }
  const m = lastMatch(output, pattern)
  if (!m) return { skips: { unavailable: 'pattern-no-match' } }
  return { skips: Number(m[1]) || 0, todos: m[2] !== undefined ? Number(m[2]) || 0 : 0 }
}

// true iff testsExecuted === 0 || testsExecuted.unavailable === 'pattern-no-match'
function isUnobserved(testsExecuted) {
  return testsExecuted === 0 ||
    (testsExecuted && typeof testsExecuted === 'object' && testsExecuted.unavailable === 'pattern-no-match')
}

module.exports = { lastMatch, computeTestsExecuted, computeSkips, isUnobserved }
