#!/usr/bin/env node
'use strict'
// verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] [--fixDispatched N]
//   [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] [--run-id <id>]]
//   [--profile release [--milestone <string>] [--briefs N,N,...]]
//
// Incident (2026-08-05, spec review-evidence-manifest): /spec:review could print CLEAN with
// nothing executed — a zero-findings panel return WAS the CLEAN definition, and the "CLEAN
// requires ..." sentence was prose a model applied, never a value a script computed. This is
// the sole derivation: per-iteration evidence-manifest rows (one per executed Phase 0 leg) +
// the wf-review workflow return + disposition counts -> exactly one verdict word, first-match-
// wins (spec Decisions D2/D3). --profile release runs the same shape against release.md's
// legs (D7) — no --workflow, no dispositions, word restricted to
// CLEAN|CLEAN-with-qualifier|GATE_RED|UNVERIFIED (D3).
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
// Incident (2026-08-13, spec durable-verification-qualifiers D2/D3): the ledger's
// `testsSkipped` count and the release word both silently dropped a qualifier that only ever
// lived in console scrollback — sanctioned (`[env:]`-declared) skips were indistinguishable
// from unsanctioned ones, and a release whose `ci` leg structurally never delivered a verdict
// (`unavailable`/`in-progress`) printed a plain `CLEAN` identical to one with a real green CI
// run. `testsSkipped` is now always an object `{total, sanctioned, unsanctioned}` (D2); the
// release profile now derives the distinct CLEAN-family word `CLEAN-with-qualifier` when `ci`
// is structurally absent (D3) — it exits 0 and gates nothing extra, so the final exit check is
// a CLEAN-family prefix test rather than an exact match.
//
// Incident (2026-08-13, spec host-capabilities D4): `CLEAN-with-qualifier` existed only in the
// release branch above — the review branch fell straight through disposition counting to plain
// `CLEAN`, silently swallowing an honest `unavailable` `ci` leg (host declares no forge adapter)
// or an `unavailable` `gate` leg (host declares no skip-report format, spec 10 D3) the exact
// moment those two new honest sources started landing. The review branch now checks the same two
// legs once the disposition count would otherwise reach plain CLEAN, deriving
// `CLEAN-with-qualifier` instead — same word, same CLEAN-family exit semantics as the release
// branch. A `CLEAN-with-qualifier`-eligible leg never blocks: gate/ci both stay in
// `REVIEW_BLOCKING`, so a truly red gate or ci leg is caught by the GATE_RED branch above and
// never reaches this check.
//
// Exit codes: 0 = derived CLEAN or CLEAN-with-qualifier · 1 = derived other non-CLEAN word
// (still printed on stdout line 1) · 2 = usage error, missing/unreadable --manifest or
// --workflow file, a disposition contradiction (--waived + --rejected + --fixDispatched
// exceeds the workflow's survivor count), or (review profile, no --workflow) a manifest that
// derives green/complete — a panel-less CLEAN is undecidable without --workflow and must not
// print

const fs = require('fs')

function usage() {
  console.error('usage: verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] ' +
    '[--fixDispatched N] [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] ' +
    '[--run-id <id>]] [--profile release [--milestone <string>] [--briefs N,N,...]]')
}

let manifestPath = null, workflowPath = null, waived = 0, rejected = 0, fixDispatched = 0
let ledger = false, specArg = null, tier = null, diffLoc = null, iteration = null, profile = 'review'
let runId = null, milestone = null, briefsArg = null
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

const REVIEW_LEGS = ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci']
const REVIEW_BLOCKING = new Set(['gate', 'smoke', 'ci'])
const RELEASE_LEGS = ['deploy', 'ready', 'e2e', 'journeys', 'substrate', 'production', 'ci']

const requiredLegs = profile === 'release'
  ? RELEASE_LEGS
  : ((workflow && workflow.scope === 'fix-delta') ? REVIEW_LEGS.filter(l => l !== 'reconcile') : REVIEW_LEGS)
const blockingLegs = profile === 'release' ? new Set(RELEASE_LEGS) : REVIEW_BLOCKING

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
  if (profile === 'release') {
    const ci = legRows.get('ci')
    const unresolved = ci && /^(unavailable|in-progress)$/.test(ci.observed || '')
    // release.md's ci enum is {conclusion=<value>, unavailable, in-progress} —
    // 'unavailable-transient' is review-profile-only vocabulary, deliberately absent here.
    return unresolved ? 'CLEAN-with-qualifier' : 'CLEAN'
  }
  if (fixDispatched > 0) return 'FINDINGS' // a dispatched fix is non-terminal
  const undispositioned = survivors.length - waived - rejected - fixDispatched
  if (undispositioned > 0) return survivors.some(f => f.severity === 'hard') ? 'HARD_FINDINGS' : 'FINDINGS'
  // D4: the disposition branch reached CLEAN — before printing it, check the two legs that can
  // carry an honest `unavailable` observation without being red (ci: no forge adapter to consult;
  // gate: no skip-report format declared, spec 10 D3). Prefix match, not exact — review's ci
  // vocabulary includes `unavailable-transient` (retryable gh failure) alongside plain
  // `unavailable`/`in-progress`, and the skip-unavailable sentence is a whole clause.
  const legUnavailable = (leg) => {
    const row = legRows.get(leg)
    return !!row && /^(unavailable|in-progress)/.test(row.observed || '')
  }
  if (legUnavailable('ci') || legUnavailable('gate')) return 'CLEAN-with-qualifier'
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

process.exit(word.startsWith('CLEAN') ? 0 : 1)
