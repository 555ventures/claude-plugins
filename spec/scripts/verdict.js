#!/usr/bin/env node
'use strict'
// verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] [--fixDispatched N]
//   [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] [--run-id <id>]]
//   [--profile release [--milestone <string>] [--briefs N,N,...]] [--require <leg> ...]
//
// Incident (2026-08-05, spec review-evidence-manifest): /spec:review could print CLEAN with
// nothing executed — a zero-findings panel return WAS the CLEAN definition, and the "CLEAN
// requires ..." sentence was prose a model applied, never a value a script computed. This is
// the sole derivation: per-iteration evidence-manifest rows (one per executed Phase 0 leg) +
// the wf-review workflow return + disposition counts -> exactly one verdict word, first-match-
// wins (spec Decisions D2/D3). --profile release runs the same shape against release.md's
// legs (D7) — no --workflow, no dispositions, word restricted to CLEAN|GATE_RED|UNVERIFIED.
// The --ledger row is additive to review.md/release.md's documented templates: review's
// runId/smoke/testsSkipped/findings are derived here (D2 — smoke and testsSkipped come FROM
// manifest rows' pinned observed formats, never asserted); release's milestone/briefs are
// orchestrator-supplied identity flags and staging/e2e/journeys/substrate/production are
// derived from the release legs' observed strings.
//
// Incident (2026-08-13, spec gate-script-mechanics D3): review.md Phase 0 step 8 documents a
// pre-panel hard-stop invocation with no --workflow (none exists yet — the manifest alone
// already reaches GATE_RED), but this script treated --workflow as mandatory outside
// --profile release and exited 2, forcing every aborted review to hand-craft a stub workflow
// file. --workflow is now optional on the review profile too: without it, derivation is
// manifest-only and can reach UNVERIFIED or GATE_RED. A manifest that is green and complete
// with no --workflow is a usage error (exit 2 naming --workflow as the remedy) — a panel-less
// CLEAN must stay structurally unreachable. The no-workflow --ledger row is partial: it omits
// scope/tokens/findings/verify, which only a real workflow return can supply.
//
// What this deliberately does NOT do: read git/frontmatter itself (the orchestrator resolves
// --spec/--tier/--diff-loc/--iteration/--run-id/--milestone/--briefs and passes them in as
// mechanical flags), decide whether to run a leg, or retry/poll anything — it only reads
// evidence that already exists. A missing/unparseable release leg omits that row key rather
// than failing the ledger print — STOP-path rows are partial by nature.
//
// v7.0.0 (2026-08-17): the CLEAN-with-qualifier word and the sanctionedReds suffix are
// retired with the sanctioned-red baseline apparatus — gates are plainly green or red, and a
// structurally-absent leg observation (`unavailable`/`in-progress`) is recorded in the leg row
// and the ledger, never a distinct verdict word. `testsSkipped` stays the
// `{total, sanctioned, unsanctioned}` object (sanctioned = `[env:]`-declared skips).
//
// Incident (2026-08-15, spec release-migrations-leg D4): a release could read CLEAN while the
// deployed database was missing migrations the milestone shipped, because the migrations check
// was one prose noun in release.md's manifest — nothing required the row, and pre-deploy timing
// made a coincidental match indistinguishable from a real one. --require <leg> is repeatable:
// each occurrence appends <leg> to the active profile's required set and, on --profile release
// only, its blocking set too (on --profile review a --require'd leg joins required-only, so a
// mis-wired review invocation derives UNVERIFIED forever rather than silently gating nothing —
// a safe, loud failure, not an error). Duplicates (repeated flag, or a leg already built into
// the profile) are de-duplicated; the flag never removes or reorders a profile's built-in legs.
// This is the one accumulator flag — every other flag here is scalar-overwrite.
//
// Exit codes: 0 = derived CLEAN · 1 = derived other non-CLEAN word
// (still printed on stdout line 1) · 2 = usage error, missing/unreadable --manifest or
// --workflow file, a disposition contradiction (--waived + --rejected + --fixDispatched
// exceeds the workflow's survivor count), or (review profile, no --workflow) a manifest that
// derives green/complete — a panel-less CLEAN is undecidable without --workflow and must not
// print

const fs = require('fs')

function usage() {
  console.error('usage: verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] ' +
    '[--fixDispatched N] [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] ' +
    '[--run-id <id>]] [--profile release [--milestone <string>] [--briefs N,N,...]] [--require <leg> ...]')
}

let manifestPath = null, workflowPath = null, waived = 0, rejected = 0, fixDispatched = 0
let ledger = false, specArg = null, tier = null, diffLoc = null, iteration = null, profile = 'review'
let runId = null, milestone = null, briefsArg = null
const requireLegs = []
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
  else if (a === '--run-id') runId = argv[++i]
  else if (a === '--milestone') milestone = argv[++i]
  else if (a === '--briefs') briefsArg = argv[++i]
  else if (a === '--require') requireLegs.push(argv[++i])
  else { usage(); process.exit(2) }
}
if (!manifestPath) { usage(); process.exit(2) }
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
//
// specs/20260815/02-at-risk-pins.md D4: 'at-risk' joins REVIEW_LEGS as a required-but-non-
// blocking leg — an absent row derives UNVERIFIED (the same fail-closed presence rule below),
// a red row never derives GATE_RED (it stays out of REVIEW_BLOCKING; the finding is a review
// disposition, not a gate). Excluded
// from fix-delta's requiredLegs alongside 'reconcile' — the leg mirrors reconcile's standing
// exactly (both derive from the changed-set-vs-plan comparison scope skips).
//
// specs/20260817/07-promise-sweep-leg.md D4: 'promise-sweep' joins REVIEW_LEGS the same way —
// required-but-non-blocking (absent row -> UNVERIFIED, red row -> a disposition finding, never
// GATE_RED) — but unlike reconcile/at-risk it is required in BOTH scopes: it is excluded from
// neither scope's requiredLegs filter below, mirroring ac-matrix's standing exactly (the spec
// text may be amended during a fix pass, and the leg costs milliseconds).

const REVIEW_LEGS = ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep']
const REVIEW_BLOCKING = new Set(['gate', 'smoke', 'ci'])
const RELEASE_LEGS = ['deploy', 'ready', 'e2e', 'journeys', 'substrate', 'production', 'ci']

const requiredLegs = profile === 'release'
  ? [...RELEASE_LEGS]
  : ((workflow && workflow.scope === 'fix-delta')
      ? REVIEW_LEGS.filter(l => l !== 'reconcile' && l !== 'at-risk')
      : [...REVIEW_LEGS])
const blockingLegs = profile === 'release' ? new Set(RELEASE_LEGS) : new Set(REVIEW_BLOCKING)

// D4: --require <leg> widens the active profile's required set (and, release-only, its
// blocking set too) — never removes or reorders the built-ins above; duplicates collapse.
for (const leg of requireLegs) {
  if (!requiredLegs.includes(leg)) requiredLegs.push(leg)
  if (profile === 'release') blockingLegs.add(leg)
}

function legIsRed(leg) {
  const row = legRows.get(leg)
  if (leg === 'smoke') return row.exit !== 0 && row.exit !== 4 // exit 4 = sanctioned inert-green
  return row.exit !== 0
}

// ---- derivation: first match wins (D3) -----------------------------------------------------

function derive() {
  if (profile !== 'release' && workflow && workflow.verdict === 'REVIEWER_FAILED') return 'REVIEWER_FAILED'
  if (!manifestValid || requiredLegs.some(l => !legRows.has(l))) return 'UNVERIFIED'
  if ([...blockingLegs].some(legIsRed)) return 'GATE_RED'
  if (profile === 'release') return 'CLEAN'
  if (fixDispatched > 0) return 'FINDINGS' // a dispatched fix is non-terminal
  const undispositioned = survivors.length - waived - rejected - fixDispatched
  if (undispositioned > 0) return survivors.some(f => f.severity === 'hard') ? 'HARD_FINDINGS' : 'FINDINGS'
  return 'CLEAN'
}

const word = derive()
if (profile !== 'release' && !workflow && word !== 'UNVERIFIED' && word !== 'GATE_RED') {
  console.error('verdict.js: all legs green — the panel must run; pass --workflow <path to the wf-review return>')
  process.exit(2)
}
console.log(word)

// ---- ledger-row derivation helpers (D2: observed formats are pinned, so parse failures ------
// ---- degrade to 0/omitted rather than crashing the ledger print) --------------------------

function deriveSmoke(row) {
  if (!row) return undefined
  if (row.exit === 0) return row.observed // pinned: "pass" | "inert"
  if (row.exit === 4) return 'inert' // sanctioned inert-green
  return 'fail'
}

function deriveTestsSkipped(gateRow, skipReconcileRow) {
  const gm = gateRow && /^skips=(\d+) todos=(\d+)$/.exec(gateRow.observed || '')
  const total = gm ? Number(gm[1]) + Number(gm[2]) : 0
  const sm = skipReconcileRow && /^skipped=(\d+)(?: sanctioned=(\d+))?$/.exec(skipReconcileRow.observed || '')
  const sanctioned = sm && sm[2] !== undefined ? Number(sm[2]) : 0
  return { total, sanctioned, unsanctioned: Math.max(0, total - sanctioned) }
}

function parseCounts(row, keys) {
  if (!row) return undefined
  const re = new RegExp('^' + keys.map(k => `${k}=(\\d+)`).join(' ') + '$')
  const m = re.exec(row.observed || '')
  if (!m) return undefined
  const obj = {}
  keys.forEach((k, i) => { obj[k] = Number(m[i + 1]) })
  return obj
}

function deriveProduction(row) {
  if (!row) return undefined
  if (row.observed === 'verified' || row.observed === 'skipped' || row.observed === 'failed') return row.observed
  if (row.exit === 0) return 'verified'
  if (row.exit === 1) return 'failed'
  return undefined
}

if (ledger) {
  const legs = [...legRows.values()].map(({ leg, exit }) => ({ leg, exit }))
  const row = { ts: new Date().toISOString() }
  if (specArg) row.spec = specArg
  row.stage = profile === 'release' ? 'release' : 'review'
  if (tier) row.tier = tier
  if (profile !== 'release' && runId) row.runId = runId
  row.verdict = word
  if (profile === 'release') {
    if (milestone) row.milestone = milestone
    if (briefsArg) {
      const briefs = briefsArg.split(',').map(s => Number(s.trim())).filter(Number.isFinite)
      if (briefs.length) row.briefs = briefs
    }
    const deployRow = legRows.get('deploy'), readyRow = legRows.get('ready')
    if (deployRow && readyRow) row.staging = (deployRow.exit === 0 && readyRow.exit === 0) ? 'pass' : 'fail'
    const e2e = parseCounts(legRows.get('e2e'), ['passed', 'failed', 'skipped'])
    if (e2e) row.e2e = e2e
    const journeys = parseCounts(legRows.get('journeys'), ['walked', 'failed'])
    if (journeys) row.journeys = journeys
    const substrate = parseCounts(legRows.get('substrate'), ['checked', 'failed', 'inert'])
    if (substrate) row.substrate = substrate
    const production = deriveProduction(legRows.get('production'))
    if (production) row.production = production
    const ciRow = legRows.get('ci')
    if (ciRow && ciRow.observed) row.ci = ciRow.observed
    row.legs = legs
  } else {
    if (workflow) row.scope = workflow.scope
    if (iteration !== null) row.iteration = iteration
    if (diffLoc !== null) row.diff = { loc: diffLoc }
    const smoke = deriveSmoke(legRows.get('smoke'))
    if (smoke) row.smoke = smoke
    row.testsSkipped = deriveTestsSkipped(legRows.get('gate'), legRows.get('skip-reconcile'))
    row.legs = legs
    if (workflow) {
      row.tokens = typeof workflow.tokens === 'number' ? { workflow: workflow.tokens } : workflow.tokens
      row.findings = {
        survived: survivors.length,
        killed: Array.isArray(workflow.killed) ? workflow.killed.length : (Number(workflow.killed) || 0),
        waived,
        rejected,
        fixDispatched,
        reviewerCount: workflow.reviewerCount
      }
      row.verify = workflow.verify
    }
  }
  console.log(JSON.stringify(row))
}

process.exit(word === 'CLEAN' ? 0 : 1)
