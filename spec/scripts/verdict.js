#!/usr/bin/env node
'use strict'
// verdict.js --manifest <path> --workflow <path> [--waived N] [--rejected N] [--fixDispatched N]
//   [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N]] [--profile release]
//
// Incident (2026-08-05, spec review-evidence-manifest): /spec:review could print CLEAN with
// nothing executed — a zero-findings panel return WAS the CLEAN definition, and the "CLEAN
// requires ..." sentence was prose a model applied, never a value a script computed. This is
// the sole derivation: per-iteration evidence-manifest rows (one per executed Phase 0 leg) +
// the wf-review workflow return + disposition counts -> exactly one verdict word, first-match-
// wins (spec Decisions D2/D3). --profile release runs the same shape against release.md's
// legs (D7) — no --workflow, no dispositions, word restricted to CLEAN|GATE_RED|UNVERIFIED.
//
// What this deliberately does NOT do: read git/frontmatter itself (the orchestrator resolves
// --spec/--tier/--diff-loc/--iteration and passes them in as mechanical flags), decide whether
// to run a leg, or retry/poll anything — it only reads evidence that already exists.
//
// Exit codes: 0 = derived CLEAN · 1 = derived non-CLEAN word (still printed on stdout line 1) ·
// 2 = usage error, missing/unreadable --manifest or --workflow file, or a disposition
// contradiction (--waived + --rejected + --fixDispatched exceeds the workflow's survivor count)

const fs = require('fs')

function usage() {
  console.error('usage: verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] ' +
    '[--fixDispatched N] [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N]] [--profile release]')
}

let manifestPath = null, workflowPath = null, waived = 0, rejected = 0, fixDispatched = 0
let ledger = false, specArg = null, tier = null, diffLoc = null, iteration = null, profile = 'review'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--manifest') manifestPath = argv[++i]
  else if (a === '--workflow') workflowPath = argv[++i]
  else if (a === '--waived') waived = Number(argv[++i])
  else if (a === '--rejected') rejected = Number(argv[++i])
  else if (a === '--fixDispatched') fixDispatched = Number(argv[++i])
  else if (a === '--ledger') ledger = true
  else if (a === '--spec') specArg = argv[++i]
  else if (a === '--tier') tier = argv[++i]
  else if (a === '--diff-loc') diffLoc = Number(argv[++i])
  else if (a === '--iteration') iteration = Number(argv[++i])
  else if (a === '--profile') profile = argv[++i]
  else { usage(); process.exit(2) }
}
if (!manifestPath || (profile !== 'release' && !workflowPath)) { usage(); process.exit(2) }
if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
  console.error('verdict.js: --waived/--rejected/--fixDispatched must be numbers')
  process.exit(2)
}

// ---- manifest: JSONL rows, one per leg; last-in-file wins, insertion order preserved ------

let manifestRaw
try {
  manifestRaw = fs.readFileSync(manifestPath, 'utf8')
} catch (e) {
  console.error(`verdict.js: cannot read --manifest ${manifestPath} — confirm the evidence manifest was created: ${e.message}`)
  process.exit(2)
}
const legRows = new Map()
let manifestValid = true
for (const line of manifestRaw.split('\n')) {
  if (!line.trim()) continue
  try {
    const row = JSON.parse(line)
    if (!row.leg || typeof row.exit !== 'number') throw new Error('missing leg/exit')
    legRows.set(row.leg, row)
  } catch {
    manifestValid = false
  }
}

// ---- workflow return (absent under --profile release) -------------------------------------

let workflow = null
if (workflowPath) {
  try {
    workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
  } catch (e) {
    console.error(`verdict.js: cannot read/parse --workflow ${workflowPath} — the orchestrator must write ` +
      `the wf-review return object to this path before calling verdict.js: ${e.message}`)
    process.exit(2)
  }
}

const survivors = workflow && Array.isArray(workflow.survivors) ? workflow.survivors : []
if (workflow && waived + rejected + fixDispatched > survivors.length) {
  console.error(`verdict.js: --waived(${waived}) + --rejected(${rejected}) + --fixDispatched(${fixDispatched}) ` +
    `= ${waived + rejected + fixDispatched} exceeds the workflow file's ${survivors.length} survivors — ` +
    'dispositions cannot exceed what the panel actually found; recount before re-running')
  process.exit(2)
}

// ---- required/blocking legs per profile (D3/D7) --------------------------------------------

const REVIEW_LEGS = ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci']
const REVIEW_BLOCKING = new Set(['gate', 'smoke', 'ci'])
const RELEASE_LEGS = ['deploy', 'ready', 'e2e', 'journeys', 'substrate', 'production']

const requiredLegs = profile === 'release'
  ? RELEASE_LEGS
  : (workflow.scope === 'fix-delta' ? REVIEW_LEGS.filter(l => l !== 'reconcile') : REVIEW_LEGS)
const blockingLegs = profile === 'release' ? new Set(RELEASE_LEGS) : REVIEW_BLOCKING

function legIsRed(leg) {
  const row = legRows.get(leg)
  if (leg === 'smoke') return row.exit !== 0 && row.exit !== 4 // exit 4 = sanctioned inert-green
  return row.exit !== 0
}

// ---- derivation: first match wins (D3) -----------------------------------------------------

function derive() {
  if (profile !== 'release' && workflow.verdict === 'REVIEWER_FAILED') return 'REVIEWER_FAILED'
  if (!manifestValid || requiredLegs.some(l => !legRows.has(l))) return 'UNVERIFIED'
  if ([...blockingLegs].some(legIsRed)) return 'GATE_RED'
  if (profile === 'release') return 'CLEAN'
  if (fixDispatched > 0) return 'FINDINGS' // a dispatched fix is non-terminal
  const undispositioned = survivors.length - waived - rejected - fixDispatched
  if (undispositioned > 0) return survivors.some(f => f.severity === 'hard') ? 'HARD_FINDINGS' : 'FINDINGS'
  return 'CLEAN'
}

const word = derive()
console.log(word)

if (ledger) {
  const legs = [...legRows.values()].map(({ leg, exit }) => ({ leg, exit }))
  const row = { ts: new Date().toISOString() }
  if (specArg) row.spec = specArg
  if (tier) row.tier = tier
  if (diffLoc !== null) row.diff = { loc: diffLoc }
  if (iteration !== null) row.iteration = iteration
  if (profile === 'release') {
    row.stage = 'release'
  } else {
    row.stage = 'review'
    row.scope = workflow.scope
    row.survived = survivors.length
    row.killed = workflow.killed
    row.waived = waived
    row.rejected = rejected
    row.fixDispatched = fixDispatched
    row.reviewerCount = workflow.reviewerCount
    row.verify = workflow.verify
    row.tokens = workflow.tokens
  }
  row.verdict = word
  row.legs = legs
  console.log(JSON.stringify(row))
}

process.exit(word === 'CLEAN' ? 0 : 1)
