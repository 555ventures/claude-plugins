#!/usr/bin/env node
'use strict'
// lib/observation.js — the sole D2 qualifying-row algorithm for a spec's post-review
// observation state, read from `.claude/spec-runs*.jsonl` (live + year archives).
// Extracted verbatim from spec-status.js and observe-ci.js (2026-08-06 review of
// specs/20260805/03-done-unobserved-observation.md) so both consumers share one derivation
// instead of two copies drifting apart — the repo rules flag a second derivation of the same
// algorithm as a hard finding. This module has no CLI of its own — it exports
// readLedgerRows/qualifyingObservation for both callers.
//
// What it deliberately does NOT do: query CI (that's ci-query.js/observe-ci.js), write ledger
// rows (observe-ci.js only), or interpret the result beyond the raw qualifying row — callers
// shape their own return value (spec-status.js wants {state, row}, observe-ci.js wants
// {pending, latest}).
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
// Returns null when there is no qualifying row (pending); otherwise the winning row itself.
function qualifyingObservation(rows, specPath) {
  let lastReviewIdx = -1
  rows.forEach((row, i) => { if (row.stage === 'review' && row.spec === specPath) lastReviewIdx = i })
  const qualifying = rows.filter((row, i) => i > lastReviewIdx && row.stage === 'observe' && row.spec === specPath)
  if (!qualifying.length) return null
  return qualifying.reduce((best, row) =>
    !best || row.runAt > best.runAt || (row.runAt === best.runAt && row.ci === 'red') ? row : best, null)
}

module.exports = { readLedgerRows, qualifyingObservation }
