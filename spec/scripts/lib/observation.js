#!/usr/bin/env node
'use strict'
// lib/observation.js — the sole qualifying-row algorithm for a spec's post-review
// observation state, read from `.claude/spec-runs*.jsonl` (live + year archives).
// Extracted verbatim from spec-status.js and observe-ci.js
// so both consumers share one derivation
// instead of two copies drifting apart — the repo rules flag a second derivation of the same
// algorithm as a hard finding. This module has no CLI of its own — it exports
// readLedgerRows/qualifyingObservation for both callers.
// Owner: specs/20260805/03-done-unobserved-observation.md.
//
// sinceLastRelease() is the derivation for the status footer's done-since-release clause:
// distinct specs closed CLEAN since the last CLEAN release row, never a raw row count (a fix
// round writes two review rows for one close).
//
// What it deliberately does NOT do: query CI (that's ci-query.js/observe-ci.js), write ledger
// rows (observe-ci.js only), or interpret the result beyond the raw derived value — callers
// shape their own render (spec-status.js's footer clauses).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// Ledger reads: live + year archives, filename order then line order. Malformed lines
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
// runAt (tie -> red wins) — a union-merged worktree history reorders lines, not time.
// Returns null when there is no qualifying row (unobserved); otherwise the winning row itself.
function qualifyingObservation(rows, specPath) {
  let lastReviewIdx = -1
  rows.forEach((row, i) => { if (row.stage === 'review' && row.spec === specPath) lastReviewIdx = i })
  const qualifying = rows.filter((row, i) => i > lastReviewIdx && row.stage === 'observe' && row.spec === specPath)
  if (!qualifying.length) return null
  return qualifying.reduce((best, row) =>
    !best || row.runAt > best.runAt || (row.runAt === best.runAt && row.ci === 'red') ? row : best, null)
}

// ---- Specs done since the last release. `released` is true when any stage:"release" row -----
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
  readLedgerRows, qualifyingObservation, sinceLastRelease,
}
