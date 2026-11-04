#!/usr/bin/env node
'use strict'
// verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] [--fixDispatched N]
//   [--escalated] [--via loop|direct] [--model <id>] [--sessionTokens <json-object|null>]
//   [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] [--run-id <id>]
//     [--retain <dir>] [--base-sha <40hex>] [--head-sha <40hex>] [--dirty]]
//   [--profile release [--milestone <string>] [--briefs N,N,...]] [--require <leg> ...]
//
// Owner: specs/20260820/06-typed-evidence-manifest.md
//
// The sole verdict derivation: per-iteration evidence-manifest rows (one per executed leg) + the
// reviewer workflow return + disposition counts -> exactly one verdict word, first-match-wins.
// --profile release runs the same shape against the release legs — no --workflow, no
// dispositions, word restricted to CLEAN|GATE_RED|UNVERIFIED; UNVERIFIED also when a required leg
// is unmeasured (lib/release-unmeasured.js). --ledger prints one ledger row; its derived fields
// come from the manifest rows' typed `observed` objects, never asserted.
//
// Manifest: every row's `observed` must be a non-null JSON object — any other shape invalidates
// the WHOLE manifest -> UNVERIFIED on both profiles. This script copies typed fields and performs
// no pattern match against any `observed` value. A red non-blocking row contributes its finding
// count (lib/leg-findings.js countLegFinding, floored at 1) to the same undispositioned pool as
// the reviewer's hard-severity survivors; a soft survivor never enters the pool. FINDINGS means
// `fixDispatched > 0`. An exit-0 gate row whose skips observation is the `pattern-no-match` enum
// also contributes 1 finding (never GATE_RED). A structurally-absent skip observation types
// `testsSkipped` as `{"unavailable":true}`, never a fabricated zero.
//
// Review pass scope (full | fix-delta) is derived from the manifest rows' `scope` carriers, never
// from the workflow; disagreeing or out-of-enum carriers invalidate the manifest. On UNVERIFIED
// one stderr line names the cause (`missing required legs: ...` or `manifest invalid: ...`).
// `suite` and `gate` are REVIEW_BLOCKING; `tests` is required but advisory.
//
// --workflow is optional on the review profile (the pre-panel hard stop): without it the
// derivation is manifest-only, and a green complete manifest is a usage error — a panel-less CLEAN
// stays unreachable. --require <leg> (repeatable, the one accumulator flag) adds a leg to the
// active profile's required set, and on --profile release to its blocking set too.
// --retain <dir> is required on the review profile whenever --ledger and --workflow are both
// present; it writes <dir>/<runId>.jsonl atomically (manifest legs + the parsed workflow return).
// --escalated marks a fix-cap escalation row (`escalated: true`, never a new word).
// --base-sha/--head-sha/--dirty copy the resolved commit range into the row's `diff` object;
// --via/--model/--checkpoint/--checkpoint-overrides/--sessionTokens add provenance keys. All of
// these are review-profile only.
//
// What this deliberately does NOT do: read git/frontmatter itself (the orchestrator resolves
// --spec/--tier/--diff-loc/--iteration/--run-id/--milestone/--briefs and passes them in), decide
// whether to run a leg, or retry/poll anything. A missing release leg omits that row key rather
// than failing the ledger print — STOP-path rows are partial by nature.
//
// Exit codes: 0 = derived CLEAN · 1 = derived other non-CLEAN word (still printed on stdout
// line 1) · 2 = usage error: a missing/unreadable --manifest or --workflow file; a disposition
// contradiction (--waived + --rejected + --fixDispatched exceeds hard survivors + leg findings);
// a green complete manifest with no --workflow; --retain misuse (with --profile release, without
// --ledger, or absent when --ledger + --workflow are present); --escalated with --fixDispatched > 0,
// with --profile release, or deriving CLEAN; a --base-sha/--head-sha value that is not 40
// lowercase hex, one without the other, equal to each other, --dirty without the pair, or either
// with --profile release (remedy: `git rev-parse --verify <ref>^{commit}`); a --via value other
// than loop/direct; --checkpoint outside disposer|empty|not-reached, --checkpoint-overrides
// without --checkpoint disposer or not a non-negative integer; --sessionTokens neither a JSON
// object nor null; any review-only flag with --profile release; a --briefs token that is not an NN or NNa id (stderr names the token). Each refusal names its flag.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
// The leg-finding count is shared with spec-review-driver.js's disposition tally — one derivation
// of the unit both callers count in (lib/leg-findings.js header carries the ruling).
const { countLegFinding } = require('./lib/leg-findings')
// One derivation of "this release leg measured nothing" shared with release-legs.js's summary.
const { unmeasuredReason } = require('./lib/release-unmeasured')
const { normBrief } = require('./lib/queue')

function usage() {
  console.error('usage: verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] ' +
    '[--fixDispatched N] [--escalated] [--via loop|direct] [--model <id>] ' +
    '[--sessionTokens <json-object|null>] ' +
    '[--checkpoint <disposer|empty|not-reached> [--checkpoint-overrides N]] ' +
    '[--ledger [--spec <path>] ' +
    '[--tier <T>] [--diff-loc N] [--iteration N] [--run-id <id>] [--retain <dir>] ' +
    '[--base-sha <40hex>] [--head-sha <40hex>] [--dirty]] ' +
    '[--profile release [--milestone <string>] [--briefs N,N,...]] [--require <leg> ...]')
}

let manifestPath = null, workflowPath = null, waived = 0, rejected = 0, fixDispatched = 0
let ledger = false, specArg = null, tier = null, diffLoc = null, iteration = null, profile = 'review'
let runId = null, milestone = null, briefsArg = null, retainDir = null, escalated = false
let baseShaArg = null, headShaArg = null, dirtyFlag = false
let viaArg = null, modelArg = null, sessionTokensArg = null
let checkpointArg = null, checkpointOverridesArg = null
const requireLegs = []
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--manifest') manifestPath = argv[++i]
  else if (a === '--workflow') workflowPath = argv[++i]
  else if (a === '--waived') waived = Number(argv[++i])
  else if (a === '--rejected') rejected = Number(argv[++i])
  else if (a === '--fixDispatched') fixDispatched = Number(argv[++i])
  else if (a === '--escalated') escalated = true
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
  else if (a === '--base-sha') baseShaArg = argv[++i]
  else if (a === '--head-sha') headShaArg = argv[++i]
  else if (a === '--dirty') dirtyFlag = true
  else if (a === '--via') viaArg = argv[++i]
  else if (a === '--model') modelArg = argv[++i]
  else if (a === '--sessionTokens') sessionTokensArg = argv[++i]
  else if (a === '--checkpoint') checkpointArg = argv[++i]
  else if (a === '--checkpoint-overrides') checkpointOverridesArg = argv[++i]
  else { usage(); process.exit(2) }
}
if (!manifestPath) { usage(); process.exit(2) }
// --briefs: NN or NNa ids only; the first other token (an empty one included) is a usage error.
let briefIds = null
if (briefsArg) {
  briefIds = []
  for (const raw of briefsArg.split(',')) {
    const tok = raw.trim()
    if (!/^\d+[A-Za-z]?$/.test(tok)) {
      console.error(`verdict.js: --briefs token "${tok}" is not a brief id — pass NN or NNa ids, comma-separated (e.g. --briefs 04,04a)`)
      process.exit(2)
    }
    briefIds.push(/^\d+$/.test(tok) ? Number(tok) : normBrief(tok))
  }
}
if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
  console.error('verdict.js: --waived/--rejected/--fixDispatched must be numbers')
  process.exit(2)
}

// ---- --escalated refusal matrix -------------------------------------------------------------
// Checked on flag presence, before any file is read; every refusal names its specific rule.

if (escalated && fixDispatched > 0) {
  console.error('verdict.js: --escalated with --fixDispatched > 0 — a capped run\'s dispatched fix ' +
    'never landed; pass --fixDispatched 0')
  process.exit(2)
}
if (escalated && profile === 'release') {
  console.error('verdict.js: --escalated is a review-profile fact — drop --escalated (or drop ' +
    '--profile release)')
  process.exit(2)
}

// ---- --via/--model refusal matrix -----------------------------------------------------------
// Checked before the --retain matrix so a via-usage error is never shadowed by a missing
// --retain. --via is enum-checked; --model is a free string.
if (viaArg !== null && viaArg !== 'loop' && viaArg !== 'direct') {
  console.error(`verdict.js: --via must be "loop" or "direct", got "${viaArg}"`)
  process.exit(2)
}
if (profile === 'release' && (viaArg !== null || modelArg !== null)) {
  console.error('verdict.js: --via/--model are not valid with --profile release — a release row ' +
    'carries no runId and no reviewer return, so via/model have nothing to key; drop --via/--model')
  process.exit(2)
}
let sessionTokens
if (sessionTokensArg !== null) {
  if (profile === 'release') {
    console.error('verdict.js: --sessionTokens is not valid with --profile release — a release row ' +
      'carries no session spend; drop --sessionTokens')
    process.exit(2)
  }
  let parsed
  try { parsed = JSON.parse(sessionTokensArg === undefined ? '' : sessionTokensArg) } catch { parsed = undefined }
  if (parsed === undefined || (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed)))) {
    console.error('verdict.js: --sessionTokens must be a JSON object or null — pass a JSON object or null')
    process.exit(2)
  }
  sessionTokens = parsed
}
const via = viaArg || 'direct'
const model = modelArg !== null ? modelArg : null

// ---- --checkpoint/--checkpoint-overrides refusal matrix -----------------------------------
// Checked on flag presence/value, before any file is read; valid with any --via value.
const CHECKPOINT_ENUM = new Set(['disposer', 'empty', 'not-reached'])
if (checkpointArg !== null && !CHECKPOINT_ENUM.has(checkpointArg)) {
  console.error(`verdict.js: --checkpoint must be one of disposer|empty|not-reached, got "${checkpointArg}"`)
  process.exit(2)
}
if (checkpointOverridesArg !== null && checkpointArg !== 'disposer') {
  console.error('verdict.js: --checkpoint-overrides requires --checkpoint disposer')
  process.exit(2)
}
let checkpointOverrides = null
if (checkpointOverridesArg !== null) {
  const n = Number(checkpointOverridesArg)
  if (!Number.isInteger(n) || n < 0) {
    console.error(`verdict.js: --checkpoint-overrides must be a non-negative integer, got "${checkpointOverridesArg}"`)
    process.exit(2)
  }
  checkpointOverrides = n
}
if (checkpointArg !== null && profile === 'release') {
  console.error('verdict.js: --checkpoint is not valid with --profile release — a release row ' +
    'carries no runId and no reviewer return, so a checkpoint outcome has nothing to key; drop --checkpoint')
  process.exit(2)
}

// ---- --retain requiredness matrix ----------------------------------------------------------
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

// ---- --base-sha/--head-sha/--dirty refusal matrix -------------------------------------------
// The 40-hex check is the whole validation: no ancestry, no repo access. Every branch names
// `git rev-parse --verify` as the remedy.
const SHA40_RE = /^[0-9a-f]{40}$/
if (profile === 'release' && (baseShaArg !== null || headShaArg !== null)) {
  console.error('verdict.js: --base-sha/--head-sha are not valid with --profile release — a ' +
    'release row describes a milestone, not a diff (git rev-parse --verify <ref>^{commit})')
  process.exit(2)
}
if (dirtyFlag && !(baseShaArg !== null && headShaArg !== null)) {
  console.error('verdict.js: --dirty requires --base-sha and --head-sha — pass all three ' +
    '(git rev-parse --verify <ref>^{commit} resolves the pair) or none')
  process.exit(2)
}
if ((baseShaArg !== null) !== (headShaArg !== null)) {
  console.error('verdict.js: --base-sha and --head-sha travel together — pass both ' +
    '(git rev-parse --verify <ref>^{commit}) or neither')
  process.exit(2)
}
if (baseShaArg !== null && headShaArg !== null) {
  const badSha = !SHA40_RE.test(baseShaArg) ? baseShaArg : (!SHA40_RE.test(headShaArg) ? headShaArg : null)
  if (badSha !== null) {
    console.error(`verdict.js: --base-sha/--head-sha must be a full 40-hex commit sha, got "${badSha}" ` +
      '— resolve it with git rev-parse --verify <ref>^{commit}')
    process.exit(2)
  }
  // Degenerate range: base === head would claim a verdict over an empty diff. The review driver
  // refuses this at base derivation too; this guards the durable row.
  if (baseShaArg === headShaArg) {
    console.error('verdict.js: --base-sha and --head-sha are the same commit ' +
      `(${baseShaArg.slice(0, 12)}) — a verdict row cannot describe an empty diff. The base ` +
      'likely names a moving ref that has caught up with HEAD; resolve the range against the ' +
      'commit the build started from (git rev-parse --verify <ref>^{commit})')
    process.exit(2)
  }
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
// The first row-parse failure is the cause printed on UNVERIFIED's stderr line.
let invalidCause = null
let lineNo = 0
for (const line of manifestRaw.split('\n')) {
  lineNo++
  if (!line.trim()) continue
  try {
    const row = JSON.parse(line)
    if (!row.leg || typeof row.exit !== 'number') throw new Error('missing leg/exit')
    // `observed` must be a non-null, non-array JSON object — any other shape invalidates the whole manifest.
    if (row.observed === null || typeof row.observed !== 'object' || Array.isArray(row.observed)) {
      throw new Error('observed must be a non-null JSON object')
    }
    legRows.set(row.leg, row)
  } catch {
    manifestValid = false
    if (invalidCause === null) invalidCause = 'row ' + lineNo + ' unparseable'
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
// The undispositioned pool counts hard-severity survivors only.
const hardSurvivors = survivors.filter((f) => f.severity === 'hard').length

// ---- pass scope: manifest-derived, never workflow.scope ------------------------------------
// Skipped on --profile release, where `scope` stays null.
const SCOPE_ENUM = new Set(['full', 'fix-delta'])
let scope = null
if (profile !== 'release') {
  const scopeValues = [...new Set([...legRows.values()]
    .filter(row => Object.prototype.hasOwnProperty.call(row, 'scope'))
    .map(row => row.scope))]
  if (scopeValues.length === 0) {
    scope = 'full'
  } else if (scopeValues.length > 1) {
    if (manifestValid) { manifestValid = false; invalidCause = 'scope values disagree: ' + scopeValues.join(', ') }
  } else if (!SCOPE_ENUM.has(scopeValues[0])) {
    if (manifestValid) { manifestValid = false; invalidCause = 'scope outside the enum: ' + JSON.stringify(scopeValues[0]) }
  } else {
    scope = scopeValues[0]
  }
}

// ---- required/blocking legs per profile ----------------------------------------------------
// 'at-risk' and 'reconcile' are required-but-non-blocking and excluded from fix-delta;
// 'promise-sweep' is required-but-non-blocking in both scopes.

// 'tests' is required in both scopes but advisory — never in REVIEW_BLOCKING.
const REVIEW_LEGS = ['gate', 'suite', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep', 'tests']
const REVIEW_BLOCKING = new Set(['gate', 'suite', 'smoke', 'ci'])
const RELEASE_LEGS = ['deploy', 'ready', 'e2e', 'journeys', 'substrate', 'production', 'ci']

const requiredLegs = profile === 'release'
  ? [...RELEASE_LEGS]
  : (scope === 'fix-delta'
      ? REVIEW_LEGS.filter(l => l !== 'reconcile' && l !== 'at-risk')
      : [...REVIEW_LEGS])
const blockingLegs = profile === 'release' ? new Set(RELEASE_LEGS) : new Set(REVIEW_BLOCKING)

// `slow` is blocking-if-present: a declared slow tier that is red derives
// GATE_RED, and a host that declares none has no row — never added to REVIEW_LEGS (required).
if (profile !== 'release' && legRows.has('slow')) blockingLegs.add('slow')

// --require <leg> widens the active profile's required set (and, release-only, its
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

// ---- leg-findings pool: every red non-blocking row adds its typed finding count (floored at
// ---- 1, lib/leg-findings.js) to the same undispositioned pool as reviewer survivors.

function computeLegFindings() {
  let total = 0
  for (const [leg, row] of legRows) {
    if (blockingLegs.has(leg)) continue
    if (legIsRed(leg)) total += countLegFinding(row)
  }
  // A narrow exception to the blocking-leg skip above: an exit-0 gate row whose skips observation
  // is "pattern-no-match" contributes 1 finding; "no-format-declared" contributes none.
  const gateRow = legRows.get('gate')
  const gateSkips = gateRow && gateRow.observed && gateRow.observed.skips
  if (gateRow && gateRow.exit === 0 && gateSkips && typeof gateSkips === 'object' &&
      gateSkips.unavailable === 'pattern-no-match') {
    total += 1
  }
  return total
}

const legFindings = computeLegFindings()

// ---- disposition-contradiction guard (narrowed to hard-only survivors): widens to
// ---- hardSurvivors + legFindings, never the whole survivors array ---------------------------

if (workflow && waived + rejected + fixDispatched > hardSurvivors + legFindings) {
  const total = waived + rejected + fixDispatched
  const pool = hardSurvivors + legFindings
  // The lead clause must be a true inequality for whichever flag drove the overflow; the
  // waived-overflow wording ("waived 2 > hard pool 1") stays exact.
  const lead = waived > pool
    ? `waived ${waived} > hard pool ${hardSurvivors}`
    : `total ${total} > hard pool ${hardSurvivors}`
  console.error(`verdict.js: ${lead} (--waived(${waived}) + ` +
    `--rejected(${rejected}) + --fixDispatched(${fixDispatched}) = ${total} exceeds the hard pool's ` +
    `${hardSurvivors} survivor(s) + the manifest's ${legFindings} legFindings, sum ${pool}) ` +
    '— dispositions cannot exceed what was actually found across both pools; recount before re-running')
  process.exit(2)
}

// ---- derivation: first match wins ------------------------------------------------------------

function derive() {
  if (profile !== 'release' && workflow && workflow.verdict === 'REVIEWER_FAILED') return 'REVIEWER_FAILED'
  if (!manifestValid || requiredLegs.some(l => !legRows.has(l))) return 'UNVERIFIED'
  if ([...blockingLegs].some(legIsRed)) return 'GATE_RED'
  if (profile === 'release') {
    // A required leg that measured nothing must not fall through to CLEAN; GATE_RED still outranks it.
    if (requiredLegs.some(l => unmeasuredReason(legRows.get(l)))) return 'UNVERIFIED'
    return 'CLEAN'
  }
  if (fixDispatched > 0) return 'FINDINGS' // a dispatched fix is non-terminal; the ONLY meaning FINDINGS carries (D2)
  // The pool is hard survivors + leg findings only — a soft survivor never contributes and
  // never blocks CLEAN.
  const undispositioned = (hardSurvivors + legFindings) - waived - rejected - fixDispatched
  if (undispositioned > 0) return 'HARD_FINDINGS'
  return 'CLEAN'
}

const word = derive()

// UNVERIFIED prints one stderr line naming its cause: `manifest invalid` for an unparseable row or
// scope violation, else the missing required legs (or, on release, the unmeasured reason).
if (word === 'UNVERIFIED') {
  const missingLegs = requiredLegs.filter(l => !legRows.has(l))
  // unmeasuredReason already carries the leg prefix (e.g. "ci:unavailable:no-adapter").
  const unmeasuredLegs = profile === 'release'
    ? requiredLegs.map(l => legRows.has(l) && unmeasuredReason(legRows.get(l))).filter(Boolean)
    : []
  const cause = !manifestValid
    ? 'manifest invalid: ' + (invalidCause || 'unparseable manifest')
    : missingLegs.length > 0
      ? 'missing required legs: ' + missingLegs.join(', ') +
        (profile === 'release' ? '' : ' (scope ' + scope + ')')
      : 'unmeasured required legs: ' + unmeasuredLegs.join(', ')
  console.error('verdict.js: UNVERIFIED — ' + cause)
}

// A derived CLEAN under --escalated is refused before anything prints: a red non-blocking leg
// going green between passes can shrink the pool enough for recorded waives to cover it.
if (escalated && word === 'CLEAN') {
  console.error('verdict.js: derived CLEAN under --escalated — evidence drifted since the ' +
    'dispositions pass; re-run dispositions against the current evidence')
  process.exit(2)
}

if (profile !== 'release' && !workflow && word !== 'UNVERIFIED' && word !== 'GATE_RED') {
  console.error('verdict.js: all legs green — the panel must run; pass --workflow <path to the wf-review return>')
  process.exit(2)
}
console.log(word)

// ---- ledger-row derivation helpers (observed shapes are pinned per leg, so a field that ----
// ---- is absent or off-shape degrades to 0/omitted rather than crashing the ledger print) -------

function deriveSmoke(row) {
  if (!row) return undefined
  if (row.exit === 0) return row.observed && row.observed.result // pinned: "pass" | "inert"
  if (row.exit === 4) return 'inert' // sanctioned inert-green
  return 'fail'
}

function deriveTestsSkipped(gateRow, skipReconcileRow) {
  const gateObserved = (gateRow && gateRow.observed) || {}
  // A structurally-absent observation is typed, never coerced to zero — checked before reading counts.
  if (gateObserved.unavailable !== undefined) return { unavailable: true }
  const skips = gateObserved.skips
  if (skips && typeof skips === 'object' && skips.unavailable !== undefined) return { unavailable: true }
  const total = (typeof skips === 'number' ? skips : 0) +
    (typeof gateObserved.todos === 'number' ? gateObserved.todos : 0)
  const skipReconcileObserved = (skipReconcileRow && skipReconcileRow.observed) || {}
  const sanctioned = typeof skipReconcileObserved.sanctioned === 'number' ? skipReconcileObserved.sanctioned : 0
  return { total, sanctioned, unsanctioned: Math.max(0, total - sanctioned) }
}

// ---- retention artifact, written atomically (temp file + rename) as one `.jsonl` line.
// ---- Never called on the release profile.

function writeRetainedArtifact(dir, artifactRunId, data) {
  fs.mkdirSync(dir, { recursive: true })
  const finalPath = path.join(dir, `${artifactRunId}.jsonl`)
  const tmpPath = path.join(dir, `.${artifactRunId}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify(data) + '\n')
  fs.renameSync(tmpPath, finalPath)
  return finalPath
}

if (ledger) {
  // observed is retained verbatim, never sliced.
  const ts = new Date().toISOString()
  const legs = [...legRows.values()].map(({ leg, exit, observed }) => ({ leg, exit, observed }))
  const row = { ts }
  if (specArg) row.spec = specArg
  row.stage = profile === 'release' ? 'release' : 'review'
  if (tier) row.tier = tier
  // via/model go immediately after tier, before runId (review profile only).
  if (profile !== 'release') {
    row.via = via
    row.model = model
  }
  // Review rows always carry runId — the passed --run-id verbatim, else generated here
  // ("rv_" + 12 lowercase hex via crypto.randomBytes) so the escape row always has a backlink.
  if (profile !== 'release') row.runId = runId || ('rv_' + crypto.randomBytes(6).toString('hex'))
  row.verdict = word
  // checkpoint goes immediately after verdict, before escalated — present only when passed.
  if (checkpointArg !== null) {
    row.checkpoint = checkpointArg === 'disposer'
      ? { outcome: checkpointArg, overrides: checkpointOverrides === null ? 0 : checkpointOverrides }
      : { outcome: checkpointArg }
  }
  // escalated is a typed row field, never a second verdict word (review profile only).
  if (escalated) row.escalated = true
  if (profile === 'release') {
    if (milestone) row.milestone = milestone
    if (briefIds && briefIds.length) row.briefs = briefIds
    const deployRow = legRows.get('deploy'), readyRow = legRows.get('ready')
    if (deployRow && readyRow) row.staging = (deployRow.exit === 0 && readyRow.exit === 0) ? 'pass' : 'fail'
    // A present leg row copies its observed object verbatim; an absent row (a STOP path) omits
    // the key.
    const e2eRow = legRows.get('e2e')
    if (e2eRow) row.e2e = e2eRow.observed
    const journeysRow = legRows.get('journeys')
    if (journeysRow) row.journeys = journeysRow.observed
    const substrateRow = legRows.get('substrate')
    if (substrateRow) row.substrate = substrateRow.observed
    const productionRow = legRows.get('production')
    if (productionRow) row.production = productionRow.observed && productionRow.observed.result
    // Present only when release-legs.js rollback ran; sits right after production in the row.
    const rollbackRow = legRows.get('rollback')
    if (rollbackRow) row.rollback = rollbackRow.observed && rollbackRow.observed.result
    const ciRow = legRows.get('ci')
    if (ciRow) row.ci = ciRow.observed
    row.legs = legs
  } else {
    // Scope is the manifest-derived value, present on every review row —
    // including a no-workflow hard-stop row, which never carried a scope of its own to read.
    row.scope = scope
    if (iteration !== null) row.iteration = iteration
    // diff key order is fixed: loc, base, head, dirty; no flags leave row.diff unset.
    let diffObj = null
    if (diffLoc !== null) diffObj = { loc: diffLoc }
    if (baseShaArg !== null && headShaArg !== null) {
      diffObj = diffObj || {}
      diffObj.base = baseShaArg
      diffObj.head = headShaArg
      diffObj.dirty = dirtyFlag
    }
    if (diffObj) row.diff = diffObj
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
        legFindings, // D4: the leg-findings pool's count, so a reader can tell CLEAN-because-zero-findings
                     // from CLEAN-because-dispositioned
                     // soft is appended last so every findings.* reader stays unchanged; survived is the total.
        soft: survivors.length - hardSurvivors
      }
      row.verify = workflow.verify
    }
  }
  if (sessionTokensArg !== null) row.sessionTokens = sessionTokens // LAST key, always
  console.log(JSON.stringify(row))

  // Retention is additive to the printed row above — it never changes row's shape or
  // adds a third stdout line. Reached only when profile !== 'release' (rejected earlier).
  if (retainDir) {
    const artifact = {
      runId: row.runId,
      ts,
      spec: specArg,
      tier,
      iteration,
      scope, // D4: manifest-derived (D2), equal to row.scope above — never workflow.scope
      verdict: word,
      dispositions: { waived, rejected, fixDispatched },
    }
    // diff goes after dispositions, only when the sha pair was passed (diff.loc alone stays row-only).
    if (baseShaArg !== null && headShaArg !== null) artifact.diff = row.diff
    artifact.legs = [...legRows.values()] // verbatim manifest rows — observed UNTRUNCATED (D1)
    artifact.reviewer = workflow // the --workflow file's parsed JSON verbatim, or null (D2)
    writeRetainedArtifact(retainDir, row.runId, artifact)
  }
}

process.exit(word === 'CLEAN' ? 0 : 1)
