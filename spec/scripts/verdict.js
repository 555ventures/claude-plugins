#!/usr/bin/env node
'use strict'
// verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] [--fixDispatched N]
//   [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] [--run-id <id>]
//     [--retain <dir>]]
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
// Incident (2026-08-18, spec ledger-truth, 2026-08-18 Fable retainer consult on v7's first full
// pipeline run): a red findings leg (reconcile/ac-matrix/skip-reconcile/promise-sweep/at-risk)
// could derive CLEAN with zero reviewer survivors and zero dispositions — the sole verdict
// arithmetic counted workflow.survivors only, never the deterministic legs that v7 moved
// findings into. Every red non-blocking manifest row now contributes a parsed finding count
// (pinned observed grammars, floored at 1) to the SAME undispositioned pool as reviewer
// survivors (D1/D2), the disposition-contradiction guard widens to that pool's sum (D3),
// ledger leg rows retain `observed` in both profiles so a structurally-absent observation stays
// distinguishable from a pass (D4), and review rows always carry `runId` — the orchestrator's
// --run-id verbatim, else `rv_` + 12 lowercase hex generated here (D5) — so /spec:escape has a
// backlink on every row, not a conditional one.
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
// Incident (2026-08-19, spec review-evidence-retention, brief 14): the reviewer was the one
// pipeline component whose work was argued, not executed-and-retained — the wf-review return
// lived only in a mktemp file review.md's own Phase 3 hygiene sweep deleted, and the ledger row
// kept truncated observations and counts, nothing repro-able. --retain <dir> is now REQUIRED on
// the review profile whenever both --ledger and --workflow are present (absent -> exit 2 naming
// --retain .claude/spec-runs as the remedy, before any verdict word prints, D1) and writes
// <dir>/<runId>.json atomically (temp file + rename) — the manifest legs with `observed`
// UNTRUNCATED plus the --workflow file's parsed JSON verbatim (survivors/killed with their
// executed repro evidence intact). A no-workflow --ledger row (the 2026-08-13 Phase 0 hard-stop)
// stays retain-optional; passed anyway, the artifact's `reviewer` is null (D2). --retain on
// --profile release is a usage error (D3) — a release row carries no runId and no reviewer
// return, so accepting the flag would mint an artifact nothing can ever key or read. --retain
// without --ledger is the same usage error — retention with no row has no runId to key (D1's
// Contracts requiredness matrix). The stdout/ledger contracts stay byte-unchanged (D4): the
// artifact write adds no third stdout line and no eighth `findings` key — the retained file is
// the full-fidelity home, the printed row stays the summary.
//
// Exit codes: 0 = derived CLEAN · 1 = derived other non-CLEAN word
// (still printed on stdout line 1) · 2 = usage error, missing/unreadable --manifest or
// --workflow file, a disposition contradiction (--waived + --rejected + --fixDispatched
// exceeds the workflow's survivor count PLUS the manifest's leg-finding count — the guard spans
// both pools per D1-D3, specs/20260818/01-ledger-truth.md), (review profile, no --workflow) a
// manifest that derives green/complete — a panel-less CLEAN is undecidable without --workflow
// and must not print, --retain passed with --profile release (D3 — release rows carry no runId
// to key an artifact by), --retain passed without --ledger (retention with no row has no runId
// to key), or (review profile, --ledger + --workflow both present) --retain absent (D1 — the
// required-evidence-retention flag; message names --retain .claude/spec-runs as the remedy)

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function usage() {
  console.error('usage: verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] ' +
    '[--fixDispatched N] [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] ' +
    '[--run-id <id>] [--retain <dir>]] [--profile release [--milestone <string>] [--briefs N,N,...]] ' +
    '[--require <leg> ...]')
}

let manifestPath = null, workflowPath = null, waived = 0, rejected = 0, fixDispatched = 0
let ledger = false, specArg = null, tier = null, diffLoc = null, iteration = null, profile = 'review'
let runId = null, milestone = null, briefsArg = null, retainDir = null
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
  else if (a === '--retain') retainDir = argv[++i]
  else { usage(); process.exit(2) }
}
if (!manifestPath) { usage(); process.exit(2) }
if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
  console.error('verdict.js: --waived/--rejected/--fixDispatched must be numbers')
  process.exit(2)
}

// ---- --retain requiredness matrix (D1-D3, specs/20260819/01-review-evidence-retention.md) ----
// Checked purely on flag presence, before the manifest/workflow files are even read, so a
// misuse fails loudly and immediately rather than after paying for file I/O.

if (retainDir && profile === 'release') {
  console.error('verdict.js: --retain is not valid with --profile release — a release row carries ' +
    'no runId and no reviewer return, so an artifact here has nothing to key or read; drop --retain')
  process.exit(2)
}
if (retainDir && !ledger) {
  console.error('verdict.js: --retain requires --ledger — retention with no ledger row has no runId ' +
    'to key an artifact by; add --ledger or drop --retain')
  process.exit(2)
}
if (ledger && workflowPath && profile !== 'release' && !retainDir) {
  console.error('verdict.js: authoritative review rows (--ledger + --workflow) must retain evidence ' +
    '— add --retain .claude/spec-runs')
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

// ---- leg-findings pool (D1/D2): every red non-blocking manifest row contributes its parsed ----
// ---- finding count to the SAME undispositioned pool as reviewer survivors. Count grammar is --
// ---- parsed from the leg's pinned observed format and floored at 1 (a red row can never -------
// ---- contribute 0 — a format drift must fail closed, not silently disappear).------------------

function countLegFinding(row) {
  const observed = (row && row.observed) || ''
  let n = NaN
  if (row && row.leg === 'reconcile') {
    const m = /outOfPlan=(\d+)/.exec(observed)
    if (m) n = Number(m[1])
  } else if (row && row.leg === 'ac-matrix') {
    const m = /uncovered=(\d+)/.exec(observed)
    if (m) n = Number(m[1])
  } else if (row && row.leg === 'skip-reconcile') {
    const m = /^skipped=(\d+)(?: sanctioned=(\d+))?/.exec(observed)
    if (m) n = Number(m[1]) - (m[2] !== undefined ? Number(m[2]) : 0)
  } else if (row && row.leg === 'promise-sweep') {
    const m = /orphans=(\d+)/.exec(observed)
    if (m) n = Number(m[1])
  }
  // any other red non-blocking leg (at-risk, drift, patterns) or an unparseable observed floors to 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function computeLegFindings() {
  let total = 0
  for (const [leg, row] of legRows) {
    if (blockingLegs.has(leg)) continue
    if (legIsRed(leg)) total += countLegFinding(row)
  }
  return total
}

const legFindings = computeLegFindings()

// ---- disposition-contradiction guard (D3): widens to survivors + legFindings ----------------

if (workflow && waived + rejected + fixDispatched > survivors.length + legFindings) {
  const total = waived + rejected + fixDispatched
  console.error(`verdict.js: --waived(${waived}) + --rejected(${rejected}) + --fixDispatched(${fixDispatched}) ` +
    `= ${total} exceeds the workflow file's ${survivors.length} survivors + the manifest's ${legFindings} ` +
    `legFindings (sum ${survivors.length + legFindings}) — dispositions cannot exceed what was actually found ` +
    'across both pools; recount before re-running')
  process.exit(2)
}

// ---- derivation: first match wins (D1/D3) ----------------------------------------------------

function derive() {
  if (profile !== 'release' && workflow && workflow.verdict === 'REVIEWER_FAILED') return 'REVIEWER_FAILED'
  if (!manifestValid || requiredLegs.some(l => !legRows.has(l))) return 'UNVERIFIED'
  if ([...blockingLegs].some(legIsRed)) return 'GATE_RED'
  if (profile === 'release') return 'CLEAN'
  if (fixDispatched > 0) return 'FINDINGS' // a dispatched fix is non-terminal
  const undispositioned = (survivors.length + legFindings) - waived - rejected - fixDispatched
  if (undispositioned > 0) {
    // leg findings are always hard (deterministic contract violations); survivors fall back to severity
    return (legFindings > 0 || survivors.some(f => f.severity === 'hard')) ? 'HARD_FINDINGS' : 'FINDINGS'
  }
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

// ---- retention artifact (D1/D2, specs/20260819/01-review-evidence-retention.md): the full-
// ---- fidelity home for a review run, written atomically (temp file + rename) so a reader never
// ---- observes a partial file. Never called on the release profile (rejected above, D3).

function writeRetainedArtifact(dir, artifactRunId, data) {
  fs.mkdirSync(dir, { recursive: true })
  const finalPath = path.join(dir, `${artifactRunId}.json`)
  const tmpPath = path.join(dir, `.${artifactRunId}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(tmpPath, finalPath)
  return finalPath
}

if (ledger) {
  // D4: observed is retained (sliced to 120 chars) in both profiles — a structurally-absent
  // observation ("unavailable") must stay byte-distinguishable from a real pass forever.
  const ts = new Date().toISOString()
  const legs = [...legRows.values()].map(({ leg, exit, observed }) => ({
    leg, exit, observed: typeof observed === 'string' ? observed.slice(0, 120) : observed,
  }))
  const row = { ts }
  if (specArg) row.spec = specArg
  row.stage = profile === 'release' ? 'release' : 'review'
  if (tier) row.tier = tier
  // D5: review rows always carry runId — the passed --run-id verbatim, else generated here
  // ("rv_" + 12 lowercase hex via crypto.randomBytes) so /spec:escape always has a backlink.
  if (profile !== 'release') row.runId = runId || ('rv_' + crypto.randomBytes(6).toString('hex'))
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
        reviewerCount: workflow.reviewerCount,
        legFindings // D4: the leg-findings pool's count, so a reader can tell CLEAN-because-zero-findings
                    // from CLEAN-because-dispositioned
      }
      row.verify = workflow.verify
    }
  }
  console.log(JSON.stringify(row))

  // D1/D2: retention is additive to the printed row above — it never changes row's shape or
  // adds a third stdout line (D4). Reached only when profile !== 'release' (rejected earlier, D3).
  if (retainDir) {
    const artifact = {
      runId: row.runId,
      ts,
      spec: specArg,
      tier,
      iteration,
      scope: workflow ? workflow.scope : null,
      verdict: word,
      dispositions: { waived, rejected, fixDispatched },
      legs: [...legRows.values()], // verbatim manifest rows — observed UNTRUNCATED (D1)
      reviewer: workflow, // the --workflow file's parsed JSON verbatim, or null (D2)
    }
    writeRetainedArtifact(retainDir, row.runId, artifact)
  }
}

process.exit(word === 'CLEAN' ? 0 : 1)
