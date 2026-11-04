#!/usr/bin/env node
'use strict'
// lib/observation.js — the shared ledger read over `.claude/spec-runs*.jsonl` (live + year
// archives) and the done-since-release derivation for the status footer. No CLI of its own.
// Owner: specs/20260805/03-done-unobserved-observation.md.
//
// sinceLastRelease() counts distinct specs closed CLEAN since the last CLEAN release row, never a
// raw row count (a fix round writes two review rows for one close).
//
// ceremonyMetrics() sums, over distinct specs with a CLEAN review row, the suite runs and the
// test:production line split the ledger records (specs/20261103/13 D15) — a number to read, never a guard.
//
// What it deliberately does NOT do: query CI, write ledger rows, or shape a render — callers
// render their own clauses.
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

// suiteRuns: review-row legs named suite/slow whose observed carries no `unavailable` key, plus each
// build row's gate.finalRounds when gate.postGate is true; closes/testLines/productionLines: review rows
// carrying `lines`. All over specs that have a CLEAN review row.
function ceremonyMetrics(rows) {
  const specs = new Set(rows.filter((r) => r.stage === 'review' && r.verdict === 'CLEAN').map((r) => r.spec))
  const m = { specs: specs.size, suiteRuns: 0, closes: 0, testLines: 0, productionLines: 0 }
  for (const r of rows) {
    if (!specs.has(r.spec)) continue
    if (r.stage === 'build' && r.gate && r.gate.postGate === true && typeof r.gate.finalRounds === 'number') {
      m.suiteRuns += r.gate.finalRounds
    } else if (r.stage === 'review') {
      for (const l of Array.isArray(r.legs) ? r.legs : []) {
        if (l && (l.leg === 'suite' || l.leg === 'slow') && !(l.observed && 'unavailable' in l.observed)) m.suiteRuns++
      }
      if (r.lines && typeof r.lines === 'object') {
        m.closes++
        m.testLines += Number(r.lines.tests) || 0
        m.productionLines += Number(r.lines.production) || 0
      }
    }
  }
  return m
}

module.exports = {
  readLedgerRows, sinceLastRelease, ceremonyMetrics,
}
