#!/usr/bin/env node
'use strict'
// lib/observation.js — the sole D2 qualifying-row algorithm for a spec's post-review
// observation state, read from `.claude/spec-runs*.jsonl` (live + year archives).
// Extracted verbatim from spec-status.js and observe-ci.js (specs/20260805/03-done-unobserved-
// observation.md) so both consumers share one derivation
// instead of two copies drifting apart — the repo rules flag a second derivation of the same
// algorithm as a hard finding. This module has no CLI of its own — it exports
// readLedgerRows/qualifyingObservation for both callers.
//
// specs/20260913/09-the-tool-shows-never-interrupts.md D2/D3: REPLAY_EVERY, isMeasurementReplay
// (moved verbatim from replay.js, which now imports it back from here) and replayDueness() are
// the one shared derivation of the replay-cadence window — replay.js's own --due/--select and
// spec-status.js's dashboard footer clause both read it, never two copies of the same "reviews
// since the last measurement replay" count. sinceLastRelease() is the sibling derivation for the
// footer's other clause: distinct specs closed CLEAN since the last CLEAN release row, never a
// raw row count (a fix round writes two review rows for one close).
//
// What it deliberately does NOT do: query CI (that's ci-query.js/observe-ci.js), write ledger
// rows (observe-ci.js only), run the replay harness itself (replay.js), or interpret the result
// beyond the raw derived value — callers shape their own render (spec-status.js's footer clauses,
// replay.js's `due reviewsSince=N` line).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// Ledger reads: live + year archives, filename order then line order (D2/A6). Malformed lines
// are silently dropped — flagging them is doctor's job, not this read path's.
function readLedgerRows(root) {
  const dir = path.join(root, '.claude')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /^spec-runs.*\.jsonl$/.test(f)).sort()
  const rows = []
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* doctor check 12's job to flag malformed lines */ }
    }
  }
  return rows
}

// Qualifying rows for a spec = its stage:"observe" rows appearing (by read-order position, not
// timestamp) after its latest stage:"review" row. Winner = the qualifying row with the greatest
// runAt (tie -> red wins, D2) — a union-merged worktree history reorders lines, not time.
// Returns null when there is no qualifying row (unobserved); otherwise the winning row itself.
function qualifyingObservation(rows, specPath) {
  let lastReviewIdx = -1
  rows.forEach((row, i) => { if (row.stage === 'review' && row.spec === specPath) lastReviewIdx = i })
  const qualifying = rows.filter((row, i) => i > lastReviewIdx && row.stage === 'observe' && row.spec === specPath)
  if (!qualifying.length) return null
  return qualifying.reduce((best, row) =>
    !best || row.runAt > best.runAt || (row.runAt === best.runAt && row.ci === 'red') ? row : best, null)
}

// ---- D2: replay-cadence dueness — shared by replay.js's --due/--select and spec-status.js's -----
// ---- dashboard footer clause. A "measurement" replay row is one whose outcome actually answers --
// ---- caught/missed/scores the reviewer against a real leg (leg-caught) — unresolved/setup-failed -
// ---- never reset the window, since neither produced a truth value. -------------------------------
const REPLAY_EVERY = 5
const MEASUREMENT_OUTCOMES = new Set(['caught', 'missed', 'leg-caught'])
function isMeasurementReplay(row) {
  return row.stage === 'replay' && MEASUREMENT_OUTCOMES.has(row.outcome)
}

// reviewsSince = count of stage:"review" rows in READ order after the last measurement replay
// row (readLedgerRows already merges live+archives in that order); due = reviewsSince >= REPLAY_EVERY.
function replayDueness(rows) {
  let lastReplayIdx = -1
  rows.forEach((r, i) => { if (isMeasurementReplay(r)) lastReplayIdx = i })
  const reviewsSince = rows.filter((r, i) => i > lastReplayIdx && r.stage === 'review').length
  return { reviewsSince, due: reviewsSince >= REPLAY_EVERY }
}

// ---- D3: specs done since the last release. `released` is true when any stage:"release" row -----
// ---- with verdict:"CLEAN" exists; `done` counts DISTINCT spec values among stage:"review" rows ---
// ---- with verdict:"CLEAN" positioned after the last such release row (after none when released ---
// ---- is false) — a fix round writes two review rows for one close, so rows would over-count. -----
function sinceLastRelease(rows) {
  let lastReleaseIdx = -1
  rows.forEach((r, i) => { if (r.stage === 'release' && r.verdict === 'CLEAN') lastReleaseIdx = i })
  const released = lastReleaseIdx !== -1
  const done = new Set(
    rows.filter((r, i) => i > lastReleaseIdx && r.stage === 'review' && r.verdict === 'CLEAN')
      .map((r) => r.spec)
  ).size
  return { done, released }
}

module.exports = {
  readLedgerRows, qualifyingObservation, REPLAY_EVERY, isMeasurementReplay, replayDueness, sinceLastRelease,
}
