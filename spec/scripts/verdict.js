#!/usr/bin/env node
'use strict'
// verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] [--fixDispatched N]
//   [--escalated] [--via loop|direct] [--model <id>]
//   [--ledger [--spec <path>] [--tier <T>] [--diff-loc N] [--iteration N] [--run-id <id>]
//     [--retain <dir>] [--base-sha <40hex>] [--head-sha <40hex>] [--dirty]]
//   [--profile release [--milestone <string>] [--briefs N,N,...]] [--require <leg> ...]
//
// Incident (spec review-evidence-manifest): /spec:review could print CLEAN with
// nothing executed — a zero-findings panel return WAS the CLEAN definition, and the "CLEAN
// requires ..." sentence was prose a model applied, never a value a script computed. This is
// the sole derivation: per-iteration evidence-manifest rows (one per executed Phase 0 leg) +
// the wf-review workflow return + disposition counts -> exactly one verdict word, first-match-
// wins (spec Decisions D2/D3). --profile release runs the same shape against release.md's
// legs (D7) — no --workflow, no dispositions, word restricted to CLEAN|GATE_RED|UNVERIFIED.
// The --ledger row is additive to review.md/release.md's documented templates: review's
// runId/smoke/testsSkipped/findings are derived here (D2 — smoke and testsSkipped come FROM
// manifest rows' typed observed fields, never asserted); release's milestone/briefs are
// orchestrator-supplied identity flags and staging/e2e/journeys/substrate/production/ci are
// derived from the release legs' typed observed objects.
//
// Incident (spec gate-script-mechanics D3): review.md Phase 0 step 8 documents a
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
// The CLEAN-with-qualifier word and the sanctionedReds suffix are
// retired with the sanctioned-red baseline apparatus — gates are plainly green or red, and a
// structurally-absent leg observation (a typed `{"unavailable":...}` field, or an `in-progress`
// status) is recorded in the leg row and the ledger, never a distinct verdict word.
// `testsSkipped` stays the `{total, sanctioned, unsanctioned}` object (sanctioned = `[env:]`-
// declared skips).
//
// Incident (spec ledger-truth, Fable retainer consult on v7's first full
// pipeline run): a red findings leg (reconcile/ac-matrix/skip-reconcile/promise-sweep/at-risk)
// could derive CLEAN with zero reviewer survivors and zero dispositions — the sole verdict
// arithmetic counted workflow.survivors only, never the deterministic legs that v7 moved
// findings into. Every red non-blocking manifest row now contributes a finding count read off
// its typed observed field (floored at 1) to the SAME undispositioned pool as reviewer
// survivors (D1/D2), the disposition-contradiction guard widens to that pool's sum (D3),
// ledger leg rows retain `observed` in both profiles so a structurally-absent observation stays
// distinguishable from a pass (D4), and review rows always carry `runId` — the orchestrator's
// --run-id verbatim, else `rv_` + 12 lowercase hex generated here (D5) — so /spec:escape has a
// backlink on every row, not a conditional one.
//
// Incident (spec release-migrations-leg D4): a release could read CLEAN while the
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
// Incident (spec review-evidence-retention, brief 14): the reviewer was the one
// pipeline component whose work was argued, not executed-and-retained — the wf-review return
// lived only in a mktemp file review.md's own Phase 3 hygiene sweep deleted, and the ledger row
// kept truncated observations and counts, nothing repro-able. --retain <dir> is now REQUIRED on
// the review profile whenever both --ledger and --workflow are present (absent -> exit 2 naming
// --retain .claude/spec-runs as the remedy, before any verdict word prints, D1) and writes
// <dir>/<runId>.json atomically (temp file + rename) — the manifest legs with `observed`
// verbatim plus the --workflow file's parsed JSON verbatim (survivors/killed with their
// executed repro evidence intact). A no-workflow --ledger row (the Phase 0 hard-stop)
// stays retain-optional; passed anyway, the artifact's `reviewer` is null (D2). --retain on
// --profile release is a usage error (D3) — a release row carries no runId and no reviewer
// return, so accepting the flag would mint an artifact nothing can ever key or read. --retain
// without --ledger is the same usage error — retention with no row has no runId to key (D1's
// Contracts requiredness matrix). The stdout/ledger contracts stay byte-unchanged (D4): the
// artifact write adds no third stdout line and no eighth `findings` key — the retained file is
// the full-fidelity home, the printed row stays the summary.
//
// Incident (spec review-observation-truth.md D2-D4): a gate
// row whose skip observation was structurally unparseable silently decayed to
// `testsSkipped: {total:0,...}` and a CLEAN verdict — a fabricated zero-skip measurement no run
// ever made, violating specs/20260820/03-review-observation-truth.md's never-assumed-zero rule. `deriveTestsSkipped` types
// any structurally-absent gate observation (the whole-row unavailable alternative, or the
// skips-slot's own unavailable alternative) as exactly `{"unavailable":true}` (D2), never the
// `{total,sanctioned,unsanctioned}` shape (unchanged for a parseable numeric skips-and-todos
// pair). An exit-0 gate row whose skips observation is the drift enum (a declared pattern that
// simply did not match, distinct from the host declaring no pattern at all) additionally
// contributes 1 finding to the leg-findings pool (D3) — a narrow, deliberate special case inside
// `computeLegFindings`, which otherwise skips every blocking leg (gate included) entirely; this
// does not lift that skip. The sibling declared-none enum (honest standing config, not drift)
// raises no finding. `legIsRed`/`GATE_RED` derivation stays exit-code-only and untouched (D4) —
// the D3 finding rides the leg-findings pool alone and never derives GATE_RED.
//
// specs/20260820/06-typed-evidence-manifest.md (D1/D3/D4/D11, brief 16's second
// move): every manifest row's `observed` field is now a typed JSON object, and this script's
// packed-string parser is deleted, not hardened — it becomes a copier of typed fields, never a
// second parser of what an emitter already typed. D1: ANY row whose `observed` is not a
// non-null JSON object (a bare string, a number, null, or an array) makes the WHOLE manifest
// invalid -> UNVERIFIED, on BOTH profiles — there is no compat window, since a typed-looking or
// gibberish string observed both silently decayed to a fabricated measurement on the pre-image
// parser (spike A/A2). D3: `countLegFinding` reads each red leg's finding count directly
// off its own typed field (reconcile's out-of-plan count, ac-matrix's uncovered count,
// skip-reconcile's skipped count minus its sanctioned count, promise-sweep's orphan count),
// floored at 1 when the field is absent or non-numeric — every regex-based extraction this file
// once ran is deleted outright; this script performs no pattern match against ANY
// `observed` value. The release ledger's e2e/journeys/substrate/ci keys now copy the
// corresponding leg's `observed` object VERBATIM — a present row always yields a present key,
// whatever shape its object holds — and production is simply its observed row's `result` field;
// this script is a pure copier for those keys now, never a second validator of what an emitter
// should have written (spike C's silent key omission on an unparseable release leg becomes
// structurally impossible). D2/D11: free-text fields are bounded at the emitter, never here — an
// `observed` object is never sliced (slicing a JSON object corrupts it), only a string field
// inside one.
//
// specs/20260822/01-escalate-ledger-row.md (D1-D4): a review that burns its fix loop
// to the cap was writing zero ledger rows — the driver's only two append points (hard-stop, CLEAN
// close) never reach the cap refusal. `--escalated` marks a review-profile pass as a fix-cap
// escalation: the row gains `escalated: true` (D1 — never a new verdict word; the escalation fact
// is a typed row field, the word itself stays whatever the evidence honestly derives). Refused
// (exit 2, before any manifest/workflow file I/O, same flag-presence-first pattern as the
// --retain matrix) with `--fixDispatched > 0` (D2 — a capped run's dispatched fix never landed;
// crediting it would fabricate disposition coverage) or with `--profile release` (D3 — a release
// row carries no runId/reviewer return for `escalated` to key). Refused (exit 2, AFTER
// derivation, no verdict word and no ledger line printed) when the derived word is CLEAN (D4 —
// spike S1 Case B: a red non-blocking leg going green between the dispositions pass and the
// escalate pass can shrink the recomputed pool enough for recorded waives to cover it; a
// self-contradictory CLEAN+escalated:true row in the one file that must never wrongly say CLEAN
// is the worst possible output, so this is a correctness guard, not belt-and-braces).
//
// specs/20260824/06-review-range-identity.md (D1-D3): no review row named the code it
// judged — 0 of 118 rows on record carried a commit range, only `diff.loc`. --base-sha/--head-sha
// (review profile only) copy the caller's resolved base/HEAD verbatim into the printed row's
// `diff` object (key order fixed: loc, base, head, dirty — loc omitted with no --diff-loc) and the
// retained artifact's top-level `diff` (inserted immediately after `dispositions`); --dirty marks
// uncommitted tracked edits at pass time. Refused (exit 2, arg-parse time, before the manifest is
// even read, no verdict word or ledger line printed) on a value that is not exactly 40 lowercase
// hex characters, one flag without the other, --dirty without the pair, or either flag with
// --profile release (a release row carries no diff at all) — every refusal names the resolution
// remedy `git rev-parse --verify <ref>^{commit}` (D2: a symbolic or abbreviated ref landing in a
// durable row is the replay moving-ref defect, rv_387d84a3b424, reintroduced). The 40-hex check is
// the whole validation — no ancestry, no repo access — so this stays a pure function of its flags.
//
// specs/20260901/02-run-provenance.md (D3, brief 18): review rows are ledger-
// answerable only when they name which command shape produced them. --via <loop|direct> (default
// "direct" when absent) and --model <id> (default null) are review-profile-only flags; the row
// gains `via` then `model` immediately after `tier`, before `runId`. --via is enum-checked
// (anything but loop/direct exits 2, naming --via specifically) because the fleet query (brief 19)
// reads it; --model is a free string with no enum, since the transcript format that supplies it
// is internal and version-unstable. Both flags exit 2 with --profile release — a release row
// carries no runId/reviewer return for either to key.
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
// required-evidence-retention flag; message names --retain .claude/spec-runs as the remedy),
// --escalated passed with --fixDispatched > 0 (message names "dispatched fix never landed"),
// --escalated passed with --profile release (message names "drop --escalated"), or --escalated
// whose derivation reaches CLEAN (message names "derived CLEAN under --escalated" — evidence
// drift; no verdict word or ledger line is printed), or (D1-D3, specs/20260824/06-review-range-
// identity.md, checked at arg-parse time before the manifest is read, no verdict word or ledger
// line printed) a --base-sha/--head-sha value that is not exactly 40 lowercase hex characters, one
// of the pair passed without the other, --dirty passed without the pair, or either flag passed
// with --profile release — every one of these names `git rev-parse --verify <ref>^{commit}` as the
// remedy, or (specs/20260901/02-run-provenance.md D3, checked at arg-parse time before the manifest
// is read, no verdict word or ledger line printed) a --via value other than "loop"/"direct", or
// either --via or --model passed with --profile release — the message names --via specifically
// (never the generic unknown-flag usage line) so a caller can tell the two refusals apart, or
// (specs/20260901/09-disposer-gate.md D5, checked at arg-parse time before the manifest is read,
// no verdict word or ledger line printed, message names --checkpoint specifically) a --checkpoint
// value outside disposer|empty|not-reached, --checkpoint-reason passed at all (retired), a
// --checkpoint-overrides passed without --checkpoint disposer or not a non-negative integer, or
// --checkpoint passed with --profile release
//
// specs/20260901/05-checkpoint-fail-closed.md (D3, brief 18a) — SUPERSEDED by
// specs/20260901/09-disposer-gate.md (D5, brief 18b): the session-change CHECKPOINT
// (cleared|stamp-appeared|overridden|not-reached) is retired along with --checkpoint-reason.
// --checkpoint <disposer|empty|not-reached> and --checkpoint-overrides <N> (a non-negative
// integer, valid only with --checkpoint disposer; --checkpoint disposer without it defaults to
// 0) are review-profile-only flags, now valid with --via loop, --via direct, and --via absent
// alike (the checkpoint is not a loop-only fact — independence is the disposer agent on
// both entries). The row gains a `checkpoint` key immediately after `verdict` (before
// `escalated`) — `{"outcome":"disposer","overrides":N}`, `{"outcome":"empty"}`, or
// `{"outcome":"not-reached"}`. Absent flags leave the row byte-identical to today (no checkpoint
// key at all). Refused (exit 2, arg-parse time, before the manifest is read, no verdict word or
// ledger line printed, message names --checkpoint specifically): a --checkpoint value outside the
// new enum (cleared/stamp-appeared/overridden included), --checkpoint-reason passed at all (the
// message says it is retired), --checkpoint-overrides passed without --checkpoint disposer,
// --checkpoint-overrides not a non-negative integer, or --checkpoint passed with --profile
// release (no runId to key).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function usage() {
  console.error('usage: verdict.js --manifest <path> [--workflow <path>] [--waived N] [--rejected N] ' +
    '[--fixDispatched N] [--escalated] [--via loop|direct] [--model <id>] ' +
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
let viaArg = null, modelArg = null
let checkpointArg = null, checkpointReasonArg = null, checkpointOverridesArg = null
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
  else if (a === '--checkpoint') checkpointArg = argv[++i]
  else if (a === '--checkpoint-reason') checkpointReasonArg = argv[++i]
  else if (a === '--checkpoint-overrides') checkpointOverridesArg = argv[++i]
  else { usage(); process.exit(2) }
}
if (!manifestPath) { usage(); process.exit(2) }
if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
  console.error('verdict.js: --waived/--rejected/--fixDispatched must be numbers')
  process.exit(2)
}

// ---- --escalated refusal matrix (D2/D3, specs/20260822/01-escalate-ledger-row.md) ------------
// Checked purely on flag presence, before the manifest/workflow files are even read — the exact
// flag-presence-first pattern the --retain matrix below already uses, for the same reason (a
// misuse fails loudly and immediately rather than after paying for file I/O). The pre-image
// rejects --escalated as an unknown flag via the generic usage() fallback above, which ALSO exits
// 2 — every refusal here names the specific rule so a test can never pass vacuously against that
// fallback (spike S3).

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

// ---- --via/--model refusal matrix (D3, specs/20260901/02-run-provenance.md) ------------------
// Checked purely on flag presence/value, before the manifest/workflow files are even read (ahead
// of the --retain matrix below, since a via-usage error must be distinguishable from a missing
// --retain rather than being shadowed by it). --via is enum-checked (the fleet query in sibling
// 03 reads it); --model is a free string with no enum since the transcript format that supplies
// it is internal and version-unstable. Every refusal names --via specifically so it can never be
// confused with the generic unknown-flag usage line.
if (viaArg !== null && viaArg !== 'loop' && viaArg !== 'direct') {
  console.error(`verdict.js: --via must be "loop" or "direct", got "${viaArg}"`)
  process.exit(2)
}
if (profile === 'release' && (viaArg !== null || modelArg !== null)) {
  console.error('verdict.js: --via/--model are not valid with --profile release — a release row ' +
    'carries no runId and no reviewer return, so via/model have nothing to key; drop --via/--model')
  process.exit(2)
}
const via = viaArg || 'direct'
const model = modelArg !== null ? modelArg : null

// ---- --checkpoint/--checkpoint-overrides refusal matrix (D5, specs/20260901/09-disposer-gate.md)
// -------------------------------------------------------------------------------------------------
// Checked purely on flag presence/value, before the manifest/workflow files are even read (same
// flag-presence-first pattern as every other matrix in this file), so a malformed or contextually
// invalid checkpoint outcome can never reach the ledger. Every refusal names --checkpoint
// specifically so it is never confused with the generic unknown-flag usage line. The session-
// change enum (cleared|stamp-appeared|overridden) and --checkpoint-reason are retired — independence
// is now the disposer agent, dispatched on both --via loop and --via direct alike, so --checkpoint
// is not refused for a non-loop --via.
const CHECKPOINT_ENUM = new Set(['disposer', 'empty', 'not-reached'])
if (checkpointArg !== null && !CHECKPOINT_ENUM.has(checkpointArg)) {
  console.error(`verdict.js: --checkpoint must be one of disposer|empty|not-reached, got "${checkpointArg}"`)
  process.exit(2)
}
if (checkpointReasonArg !== null) {
  console.error('verdict.js: --checkpoint-reason is retired (specs/20260901/09-disposer-gate.md, ' +
    'ADR-0005) — drop it; --checkpoint no longer carries a reason')
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

// ---- --base-sha/--head-sha/--dirty refusal matrix (D1-D3, specs/20260824/06-review-range-
// identity.md) ---------------------------------------------------------------------------------
// Checked purely on flag presence/shape, before the manifest/workflow files are even read — the
// same flag-presence-first pattern as the --escalated/--retain matrices above. A symbolic or
// abbreviated ref landing in a durable ledger row is the replay moving-ref defect (rv_387d84a3b424)
// reintroduced, so the 40-hex check is the whole validation: no ancestry, no repo access, a pure
// function of the flag values themselves. Every branch names `git rev-parse --verify` as the
// remedy (D2's blanket requirement) — the release-profile message below extends the Contracts
// table's illustrative text with that phrase, verbatim as a prefix, to satisfy that requirement
// (logged as a deviation).
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
  // Degenerate range (spec 20260901/01 review): base === head means the row would
  // claim a verdict over an empty diff. The shape check above cannot see this — rv_31224a17550e
  // recorded base === head with two well-formed shas and passed. spec-review-driver.js refuses the
  // same condition at base-derivation time; this is the second backstop, guarding the row that
  // becomes the durable record, so a caller deriving its own range cannot append one either. Still
  // a pure function of the flag values: no ancestry check, no repo access.
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
for (const line of manifestRaw.split('\n')) {
  if (!line.trim()) continue
  try {
    const row = JSON.parse(line)
    if (!row.leg || typeof row.exit !== 'number') throw new Error('missing leg/exit')
    // D1: `observed` must be a non-null JSON object — arrays are not objects for this purpose.
    // ANY other shape (string, number, null, array) makes the WHOLE manifest invalid, never a
    // silently misread row (spike A: a typed-looking or gibberish string observed both decayed
    // to a fabricated zero/CLEAN on the pre-image parser).
    if (row.observed === null || typeof row.observed !== 'object' || Array.isArray(row.observed)) {
      throw new Error('observed must be a non-null JSON object')
    }
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

// ---- leg-findings pool (D1/D2): every red non-blocking manifest row contributes a finding -----
// ---- count read off its own typed observed field to the SAME undispositioned pool as reviewer -
// ---- survivors, floored at 1 (a red row can never contribute 0 — an absent/non-numeric field ---
// ---- must fail closed, not silently disappear). specs/20260820/06-typed-evidence-manifest.md ---
// ---- D3: this reads typed fields directly now — no leg's finding count is pattern-matched -----
// ---- out of a string any more. -----------------------------------------------------------------

function countLegFinding(row) {
  const observed = (row && row.observed) || {}
  let n = NaN
  if (row && row.leg === 'reconcile') {
    n = observed.outOfPlan
  } else if (row && row.leg === 'ac-matrix') {
    n = observed.uncovered
  } else if (row && row.leg === 'skip-reconcile') {
    if (typeof observed.skipped === 'number') {
      n = observed.skipped - (typeof observed.sanctioned === 'number' ? observed.sanctioned : 0)
    }
  } else if (row && row.leg === 'promise-sweep') {
    n = observed.orphans
  }
  // any other red non-blocking leg (at-risk, drift, patterns) or an absent/non-numeric field floors to 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function computeLegFindings() {
  let total = 0
  for (const [leg, row] of legRows) {
    if (blockingLegs.has(leg)) continue
    if (legIsRed(leg)) total += countLegFinding(row)
  }
  // D3 (specs/20260820/03-review-observation-truth.md), keyed on the typed enum per
  // specs/20260820/06-typed-evidence-manifest.md D4: gate is a blocking leg and is skipped by
  // the loop above like every other blocking leg — this is a deliberate, narrow addition, not a
  // lifting of that skip. An exit-0 gate row whose skips observation is the drift enum
  // (observed.skips.unavailable === "pattern-no-match") still contributes 1 finding, so a run
  // whose skip observation went unparseable pages itself instead of decaying silently over five
  // runs (dead-man's-switch, no cross-run state). The sibling declared-none enum
  // ("no-format-declared") is honest standing config and must key on nothing here.
  const gateRow = legRows.get('gate')
  const gateSkips = gateRow && gateRow.observed && gateRow.observed.skips
  if (gateRow && gateRow.exit === 0 && gateSkips && typeof gateSkips === 'object' &&
      gateSkips.unavailable === 'pattern-no-match') {
    total += 1
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

// D4 (load-bearing guard, specs/20260822/01-escalate-ledger-row.md): a derived CLEAN under
// --escalated is refused BEFORE anything prints — spike S1 Case B falsified "CLEAN is
// arithmetically unreachable at --fixDispatched 0": a red non-blocking leg going green between
// the dispositions pass and this escalate pass shrinks the recomputed pool enough for the
// recorded waives to cover it. A self-contradictory CLEAN+escalated:true row in the one file that
// must never wrongly say CLEAN would be the worst possible output, so this checks before the
// verdict word or the ledger line is ever printed.
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

// ---- ledger-row derivation helpers (D2: observed shapes are pinned per leg, so a field that ----
// ---- is absent or off-shape degrades to 0/omitted rather than crashing the ledger print) -------

function deriveSmoke(row) {
  if (!row) return undefined
  if (row.exit === 0) return row.observed && row.observed.result // pinned: "pass" | "inert"
  if (row.exit === 4) return 'inert' // sanctioned inert-green
  return 'fail'
}

function deriveTestsSkipped(gateRow, skipReconcileRow) {
  const gateObserved = (gateRow && gateRow.observed) || {}
  // D2/D4: a structurally-absent observation is typed, never coerced to a fabricated zero — this
  // check runs BEFORE reading skips/todos as numbers, covering both the whole-row unavailable
  // alternative (no gate ran at all) and the skips-slot's own unavailable alternative.
  if (gateObserved.unavailable !== undefined) return { unavailable: true }
  const skips = gateObserved.skips
  if (skips && typeof skips === 'object' && skips.unavailable !== undefined) return { unavailable: true }
  const total = (typeof skips === 'number' ? skips : 0) +
    (typeof gateObserved.todos === 'number' ? gateObserved.todos : 0)
  const skipReconcileObserved = (skipReconcileRow && skipReconcileRow.observed) || {}
  const sanctioned = typeof skipReconcileObserved.sanctioned === 'number' ? skipReconcileObserved.sanctioned : 0
  return { total, sanctioned, unsanctioned: Math.max(0, total - sanctioned) }
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
  // D4/D11: observed is retained VERBATIM (never sliced — a JSON object is never sliced, the
  // 120-char bound lives on emitters' string fields) in both profiles — a structurally-absent
  // observation ("unavailable") must stay byte-distinguishable from a real pass forever.
  const ts = new Date().toISOString()
  const legs = [...legRows.values()].map(({ leg, exit, observed }) => ({ leg, exit, observed }))
  const row = { ts }
  if (specArg) row.spec = specArg
  row.stage = profile === 'release' ? 'release' : 'review'
  if (tier) row.tier = tier
  // D3 (specs/20260901/02-run-provenance.md): via/model are inserted immediately after tier,
  // before runId — review profile only (the refusal matrix above makes profile === 'release'
  // with either flag unreachable, so this never fires on a release row).
  if (profile !== 'release') {
    row.via = via
    row.model = model
  }
  // D5: review rows always carry runId — the passed --run-id verbatim, else generated here
  // ("rv_" + 12 lowercase hex via crypto.randomBytes) so /spec:escape always has a backlink.
  if (profile !== 'release') row.runId = runId || ('rv_' + crypto.randomBytes(6).toString('hex'))
  row.verdict = word
  // D5 (specs/20260901/09-disposer-gate.md): checkpoint is inserted immediately after verdict,
  // before escalated — sibling 02's AC-20260901-02-3 pins the first seven keys and
  // AC-20260901-09-12 pins byte-identity when provenance flags are absent, both untouched since
  // this key is present ONLY when --checkpoint was passed (review-profile only; valid with any
  // --via value now).
  if (checkpointArg !== null) {
    row.checkpoint = checkpointArg === 'disposer'
      ? { outcome: checkpointArg, overrides: checkpointOverrides === null ? 0 : checkpointOverrides }
      : { outcome: checkpointArg }
  }
  // D1: the escalation fact is a typed row field, never a second verdict word — `escalated` is
  // only ever set on the review profile (the D3 refusal above makes profile === 'release'
  // unreachable here).
  if (escalated) row.escalated = true
  if (profile === 'release') {
    if (milestone) row.milestone = milestone
    if (briefsArg) {
      const briefs = briefsArg.split(',').map(s => Number(s.trim())).filter(Number.isFinite)
      if (briefs.length) row.briefs = briefs
    }
    const deployRow = legRows.get('deploy'), readyRow = legRows.get('ready')
    if (deployRow && readyRow) row.staging = (deployRow.exit === 0 && readyRow.exit === 0) ? 'pass' : 'fail'
    // D3: a present leg row copies its observed object into the ledger VERBATIM — a present row
    // always yields a present key, whatever shape its object holds; a genuinely ABSENT row (never
    // ran, e.g. a STOP path) omits the key entirely. This script is a copier now, never a second
    // validator of what an emitter should have written.
    const e2eRow = legRows.get('e2e')
    if (e2eRow) row.e2e = e2eRow.observed
    const journeysRow = legRows.get('journeys')
    if (journeysRow) row.journeys = journeysRow.observed
    const substrateRow = legRows.get('substrate')
    if (substrateRow) row.substrate = substrateRow.observed
    const productionRow = legRows.get('production')
    if (productionRow) row.production = productionRow.observed && productionRow.observed.result
    const ciRow = legRows.get('ci')
    if (ciRow) row.ci = ciRow.observed
    row.legs = legs
  } else {
    if (workflow) row.scope = workflow.scope
    if (iteration !== null) row.iteration = iteration
    // D1/D3: diff's key order is fixed loc, base, head, dirty — loc is assigned first (when
    // present) so a subsequent base/head/dirty assignment never reorders it; neither flag set
    // leaves row.diff unset entirely (byte-identical to today's row).
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
    }
    // D3/D9: diff is inserted immediately after dispositions, equal to the printed row's diff
    // object verbatim — but ONLY when the sha pair was passed. diff.loc alone is a ledger-row-only
    // field (today's shape) and must never be promoted onto the artifact by itself.
    if (baseShaArg !== null && headShaArg !== null) artifact.diff = row.diff
    artifact.legs = [...legRows.values()] // verbatim manifest rows — observed UNTRUNCATED (D1)
    artifact.reviewer = workflow // the --workflow file's parsed JSON verbatim, or null (D2)
    writeRetainedArtifact(retainDir, row.runId, artifact)
  }
}

process.exit(word === 'CLEAN' ? 0 : 1)
