'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260810/07-per-sha-ci-legs.md (D3/D4, 2026-08-10, Prax stale-CI-review incident): ci
// stays a REVIEW_BLOCKING leg (a completed red run on the exact reviewed commit must still
// derive GATE_RED), and RELEASE_LEGS grows to include `ci` — release gains the authoritative
// per-SHA CI check the review leg's re-key (D2) intentionally does not carry across to
// unpushed/stale-branch evidence. This file's release-profile tests below are updated in place
// per the spec's refuter-demonstrated fixture regression (a six-leg release fixture goes stale
// the moment RELEASE_LEGS grows to seven).
//
// v7.0.0 (2026-08-17): CLEAN-with-qualifier and the sanctionedReds suffix are retired with the
// sanctioned-red baseline apparatus — the verdict enum is CLEAN|FINDINGS|HARD_FINDINGS|
// REVIEWER_FAILED|UNVERIFIED|GATE_RED, an `unavailable` observation leg derives plain CLEAN
// (recorded in the leg row, never a distinct word). Ledger legs rows are NO LONGER {leg,exit}
// only — specs/20260818/01-ledger-truth.md below widens them to {leg,exit,observed}.
//
// specs/20260818/01-ledger-truth.md (D1-D7, 2026-08-18, Fable retainer consult on v7's first
// full pipeline run): a red findings leg (reconcile/ac-matrix/skip-reconcile/promise-sweep/
// at-risk/drift/patterns) now contributes to the SAME undispositioned pool as reviewer
// survivors — legFindings = Σ over red non-blocking manifest rows, parsed by the pinned
// observed grammar and floored at 1 — so CLEAN is unreachable while any leg finding sits
// undispositioned (previously a red findings leg with zero survivors and zero dispositions
// derived CLEAN, a demonstrated fail-open). The disposition-contradiction guard widens to
// `waived+rejected+fixDispatched <= survivors+legFindings`. Ledger legs rows keep `observed`
// (sliced to 120 chars) in both profiles, review rows always carry `runId` (passed verbatim
// via --run-id, else generated `rv_`+12hex), and the review row's findings object gains
// `legFindings`. Five prior pins collided and are updated in place below, retagged
// AC-20260818-01-6 .. -01-10 (never weakened, never left red): the {leg,exit}-only legs-shape
// assert, AC-20260805-02-5's omit-the-runId-key half (superseded — split into
// AC-20260818-01-7/-01-8), AC-20260815-02-7's red-at-risk-derives-CLEAN-for-free half, and
// AC-20260817-07-12 / AC-20260805-02-3's waive-the-survivor-alone-suffices halves.
//
// specs/20260805/02-review-evidence-manifest.md (D1-D3): today /spec:review can say CLEAN with
// nothing executed — a zero-findings panel returns CLEAN from the workflow, and the CLEAN
// definition is prose a model applies, not a value a script computes. verdict.js makes the
// verdict word a DERIVED value: a fresh per-iteration manifest of executed-leg rows +
// the workflow's return + disposition counts feed one derivation (D3's first-match-wins
// order). This file pins verdict.js's derivation contract directly by execution; review.md's
// wiring of the script is pinned in verdict-doctrine.test.js.
//
// specs/20260820/03-review-observation-truth.md (D2-D4, D6, 2026-08-20, Salon OS field report):
// a gate row whose `observed` is unparseable by the pinned "skips=N todos=M" grammar was
// silently decaying to `testsSkipped: {total:0,...}` and a CLEAN verdict — a fabricated
// zero-skip measurement no run ever made, violating UPWELL-20260716-02's never-assumed-zero
// rule. `deriveTestsSkipped` now types any `observed` starting with "unavailable" as exactly
// `{"unavailable":true}` (D2); a gate row whose observed is EXACTLY
// "unavailable — skip format did not match gate output" (exit 0) additionally contributes 1 leg
// finding to the undispositioned pool (D3, a deliberate special case — gate is otherwise a
// blocking leg and blocking legs are excluded from `computeLegFindings`, per this spec's own
// Rationale) so drift pages the run it occurs on; the sibling declared-none variant
// ("unavailable — host runner declares no skip format") raises no finding — honest standing
// config, not drift. `legIsRed`/GATE_RED derivation stays exit-code-only (D4), untouched by
// either variant. New tests below key on the exact did-not-match literal so none of SIX_GREEN's
// ~30 other reuses redden (Fragile Spots).
//
// specs/20260819/01-review-evidence-retention.md (D1-D4, D9, 2026-08-19, brief 14 — the
// reviewer's return lived only in a mktemp file the Phase 3 hygiene sweep deleted): verdict.js
// gains --retain <dir>, REQUIRED on the review profile whenever both --ledger and --workflow are
// passed, writing <dir>/<runId>.json with the manifest legs' observed UNTRUNCATED and the
// workflow's reviewer return verbatim — the full-fidelity home the ledger row's 120-char slice
// only summarizes. No-workflow --ledger rows (Phase 0 hard-stops) stay retain-optional
// (reviewer: null when passed); --profile release rejects the flag as a usage error (no runId to
// key an artifact by). D9 threads --retain <tmpdir> through every pre-existing review-profile
// --ledger+--workflow invocation below in place, per the standing colliding-pin Gotcha — none
// retagged, none weakened, none left red.

const SCRIPT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

function writeWorkflow(dir, obj) {
  const p = path.join(dir, 'workflow.json')
  fs.writeFileSync(p, JSON.stringify(obj))
  return p
}

// specs/20260813/10-host-capabilities.md D4: the ci row carries a real `conclusion=` observation,
// not `unavailable`. Every test below that reuses this fixture pins a subject OTHER than the
// qualifier word (leg presence, disposition counting, ledger row shape) and states "every leg is
// green" — since D4, an `unavailable` ci leg is no longer a plain-CLEAN input, so leaving it here
// would silently turn all of them into qualifier tests asserting the wrong subject. The
// unavailable-ci case has its own dedicated pin below.
//
// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-9, self-application): `at-risk` joins
// REVIEW_LEGS as a required-but-non-blocking leg, and this spec's own adversarial pass named
// this fixture as one of the four suites its own required-leg extension would redden. The row is
// added here so every existing test below that reuses SIX_GREEN CONTINUES TO derive the same
// verdict words and ledger fields it already asserts — the fixture gains the row, the assertions
// stay unweakened.
//
// specs/20260817/07-promise-sweep-leg.md D4 (AC-20260817-07-11, AC-20260817-07-12): 'promise-
// sweep' joins REVIEW_LEGS as required-but-non-blocking in BOTH scopes (unlike reconcile/
// at-risk, never filtered out on fix-delta) — mirroring ac-matrix's standing exactly. The row is
// added here so every existing test below that reuses SIX_GREEN CONTINUES TO derive the same
// verdict words it already asserts (A2's executed redden spike named this file as one of the
// three suites the extension reds).
const SIX_GREEN = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 4, observed: 'inert' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
  { leg: 'at-risk', exit: 0, observed: 'files=0' },
  { leg: 'promise-sweep', exit: 0, observed: 'rows=1 carried=1 sanctioned=0 orphans=0' },
]

// The same six legs with ci structurally unobservable — the qualifier fixture (D4).
const SIX_GREEN_CI_UNAVAILABLE = SIX_GREEN.map(
  r => (r.leg === 'ci' ? { leg: 'ci', exit: 0, observed: 'unavailable' } : r))

function cleanWorkflow(survivors) {
  return {
    verdict: 'CLEAN',
    survivors: survivors || [],
    killed: 0,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0,
      miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1,
    scope: 'full',
    tokens: { workflow: 100 },
  }
}

const VERDICT_WORDS = /^(CLEAN|FINDINGS|HARD_FINDINGS|REVIEWER_FAILED|UNVERIFIED|GATE_RED)$/

test('AC-20260805-02-1: a manifest missing required legs derives UNVERIFIED and exits 1, never CLEAN', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'a manifest carrying only the gate leg is missing smoke/reconcile/ac-matrix/skip-reconcile/ci — ' +
    'the run has no evidence those legs ever executed, so the derivation must be UNVERIFIED, never CLEAN, ' +
    'even though the workflow return itself is zero-findings CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260805-02-2 / AC-20260813-03-10 (regression pin: --workflow-present derivation stays byte-unchanged by the D3 no-workflow relax) / AC-20260816-02-8 (no sanctionedReds suffix anywhere continues to derive plain CLEAN): six green legs (smoke exit 4 counts green-inert) with a CLEAN workflow return derive CLEAN and exit 0', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'every required leg is present and green (smoke exit 4 is the sanctioned inert-green case) and the ' +
    'workflow returned zero survivors — the derivation must reach CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'derived CLEAN must exit 0: ' + r.stderr)
})

test('AC-20260805-02-3 / AC-20260810-07-8: a red ci leg derives GATE_RED and exits 1 even with a CLEAN workflow return (review profile CONTINUES to block on ci per D3)', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 1, observed: 'conclusion=failure' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'ci is a blocking leg (D3) — a red ci row must override an otherwise-CLEAN workflow return: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'GATE_RED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

// v7.0.0 retag: the SUBSTANCE — an unavailable ci leg must never BLOCK, since exit 0 satisfies
// the leg requirement — survives byte-for-byte. The qualifier word is retired: an unavailable
// observation derives plain CLEAN with the observation recorded in the leg row.
test('AC-20260813-10-8 (retag of AC-20260813-02-8): a review-profile run whose ci leg is observed unavailable derives plain CLEAN and exit 0 — the leg never blocks the close', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN_CI_UNAVAILABLE)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'v7: ci "unavailable" (no CI to consult) derives plain CLEAN — the qualifier word is retired and the ' +
    'observation lives in the leg row: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'the retained substance of AC-20260813-02-8: an unavailable ci leg is exit 0 and satisfies the ci leg ' +
    'requirement, so it must never block the close — a non-zero exit here would make every no-CI host ' +
    'unable to ever close a review: ' + r.stderr)
})

// specs/20260818/01-ledger-truth.md D7 retag: the surviving half (ac-matrix's non-zero exit
// counts as executed-green leg presence) continues; the fail-open half (waiving only the
// reviewer survivor was enough to reach CLEAN while the ac-matrix leg finding itself sat
// undispositioned) is the defect D1-D3 close, so the fixture's disposition count is updated
// in place — never weakened, never left red.
test('AC-20260818-01-10 (retag of AC-20260805-02-3): a red ac-matrix leg finding coexisting with a reviewer survivor requires dispositions covering both pools before CLEAN — waiving only the survivor still derives HARD_FINDINGS', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'ac-matrix' ? { leg: 'ac-matrix', exit: 1, observed: 'uncovered=1' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-20260805-02-99' }]))
  const partial = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(partial.stdout.split('\n')[0], 'HARD_FINDINGS',
    'D1/D2: ac-matrix\'s "uncovered=1" observed must parse to 1 leg finding — waiving only the 1 reviewer ' +
    'survivor leaves that leg finding undispositioned, so the derivation must stay HARD_FINDINGS ' +
    '(legFindings>0 makes it hard even though the survivor itself is soft), never the CLEAN the pre-D1 ' +
    'survivors-only arithmetic wrongly reached: ' + partial.stdout + ' / ' + partial.stderr)
  const full = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '2'])
  assert.strictEqual(full.stdout.split('\n')[0], 'CLEAN',
    'ac-matrix is a findings-producing leg (D3) — its non-zero exit still counts as executed-green for leg ' +
    'presence, and waiving both the survivor and the leg finding (2 total) must reach CLEAN, not get stuck ' +
    'unable to ever return to CLEAN: ' + full.stdout + ' / ' + full.stderr)
  assert.strictEqual(full.status, 0, 'CLEAN reached via full disposition of both pools must exit 0: ' + full.stderr)
})

test('AC-20260805-02-4: undispositioned survivors of medium+soft severity derive FINDINGS', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'medium', id: 'AC-a' }, { severity: 'soft', id: 'AC-b' }, { severity: 'medium', id: 'AC-c' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'FINDINGS',
    '3 survivors, 1 waived, and no hard severity among them — undispositioned medium/soft findings must ' +
    'derive FINDINGS, never CLEAN and never the harder HARD_FINDINGS word: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'FINDINGS is a non-CLEAN word and must still exit 1: ' + r.stderr)
})

test('AC-20260805-02-4: undispositioned survivors including a hard severity derive HARD_FINDINGS', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'hard', id: 'AC-a' }, { severity: 'medium', id: 'AC-b' }, { severity: 'soft', id: 'AC-c' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'HARD_FINDINGS',
    'a hard-severity survivor among the undispositioned set must derive the stronger HARD_FINDINGS word, ' +
    'not the FINDINGS word medium/soft alone would get: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-4: a non-zero fixDispatched derives FINDINGS even when it equals the survivor count, because a dispatched fix is non-terminal', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-a' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--fixDispatched', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'FINDINGS',
    'fixDispatched fully accounting for the one survivor must NOT derive CLEAN — a dispatched fix is ' +
    'non-terminal by design (D3): CLEAN is only reachable from the NEXT iteration\'s fresh derivation: ' +
    r.stdout + ' / ' + r.stderr)
})

// specs/20260818/01-ledger-truth.md D7 retag: the surviving half (legs mirror the manifest,
// in order, with leg+exit intact) continues; the {leg,exit}-only SHAPE is the defect D4
// closes — the assert widens to per-row {leg,exit,observed} equality, never weakened.
test('AC-20260818-01-6 (retag of AC-20260805-02-5/AC-20260816-02-8\'s legs-shape pin): --ledger prints a row whose verdict matches line 1 and whose legs mirror the manifest\'s leg+exit+observed rows exactly, in order', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--retain', dir,
    '--spec', 'specs/20260805/02-review-evidence-manifest.md', '--tier', 'T2',
    '--diff-loc', '42', '--iteration', '1'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN', 'line 1 must still be the bare verdict word: ' + r.stdout + ' / ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must print a parseable JSON row on line 2, never prose: ' + r.stdout)
  assert.strictEqual(row.verdict, 'CLEAN',
    'the ledger row\'s verdict field must equal the word printed on line 1 — a mismatch means the ledger ' +
    'and the console can disagree about what happened: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.legs, SIX_GREEN,
    'D4: the row\'s legs must mirror the manifest\'s leg+exit+observed rows exactly, in order — the ' +
    '{leg,exit}-only shape this pin used to assert is retired, since it strips the observed string that ' +
    'makes "CI passed" distinguishable from "no CI exists": ' + JSON.stringify(row.legs))
})

// 2026-08-06 review-fix findings (prev-findings.json): verdict.js's --ledger row was missing
// runId/smoke/testsSkipped entirely and flattened the disposition counts, contradicting D2's
// "smoke and testsSkipped are derived FROM manifest rows" and review.md:229's documented
// runId/findings-nested shape; the release profile's row carried only {ts,stage,verdict,legs},
// contradicting release.md:127's milestone/briefs/staging/e2e/journeys/substrate/production
// template. These tests pin the corrected contract by execution so a future regression fails
// npm test instead of shipping silently behind doctrine-text-only pins (as run-ledger.test.js's
// existing checks did here).

// specs/20260818/01-ledger-truth.md D7 retag: AC-20260805-02-5's omit-the-key half is
// superseded by D5 — all five v7 review rows read runId:null in practice because the flag
// rides choreography review.md never performs, so an omitted key is not a safe default. The
// passed-flag-wins half continues (AC-20260818-01-8, below); the omit half is replaced, never
// left red, by the generation contract (AC-20260818-01-7).
test('AC-20260818-01-7: --ledger generates row.runId matching ^rv_[0-9a-f]{12}$ when --run-id is not passed, distinct per invocation', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const first = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--retain', dir, '--spec', 'x.md', '--tier', 'T2', '--diff-loc', '1', '--iteration', '1'])
  const rowFirst = JSON.parse(first.stdout.trim().split('\n')[1])
  assert.ok(typeof rowFirst.runId === 'string' && /^rv_[0-9a-f]{12}$/.test(rowFirst.runId),
    'D5: when --run-id is absent, verdict.js must generate its own review-row id ("rv_" + 12 lowercase hex ' +
    'chars via crypto.randomBytes) rather than omit the key — an omitted key was AC-20260805-02-5\'s old ' +
    'contract, superseded because /spec:escape needs a real backlink on every row, not a conditional one: ' +
    JSON.stringify(rowFirst))
  const second = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--retain', dir, '--spec', 'x.md', '--tier', 'T2', '--diff-loc', '1', '--iteration', '1'])
  const rowSecond = JSON.parse(second.stdout.trim().split('\n')[1])
  assert.ok(typeof rowSecond.runId === 'string' && /^rv_[0-9a-f]{12}$/.test(rowSecond.runId),
    'the second invocation\'s generated runId must also match the pinned shape: ' + JSON.stringify(rowSecond))
  assert.notStrictEqual(rowFirst.runId, rowSecond.runId,
    'two separate invocations on the identical fixture must generate two DISTINCT runIds — a constant or ' +
    'input-derived id would collide two different review runs onto one /spec:escape backlink: ' +
    rowFirst.runId + ' vs ' + rowSecond.runId)
})

test('AC-20260818-01-8 (retag of AC-20260805-02-5\'s surviving half): --ledger CONTINUES TO write a passed --run-id verbatim, winning over generation', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const withFlag = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--retain', dir, '--spec', 'x.md', '--tier', 'T2', '--diff-loc', '1', '--iteration', '1',
    '--run-id', 'wf_abc123'])
  const rowWith = JSON.parse(withFlag.stdout.trim().split('\n')[1])
  assert.strictEqual(rowWith.runId, 'wf_abc123',
    'D5: a passed --run-id must win verbatim over generation — the orchestrator passes --run-id so ' +
    '/spec:escape can later point reviewRunId back at this exact review invocation (review.md: "runId is ' +
    'the Workflow invocation\'s run id") — a mismatch or generated-override value breaks that backlink: ' +
    JSON.stringify(rowWith))
})

test('AC-20260805-02-5: --ledger derives row.smoke from the manifest smoke row exit code, never from prose', () => {
  const dir = tmpdir('verdict')
  const workflow = writeWorkflow(dir, cleanWorkflow([]))

  const passRows = SIX_GREEN.map(r => (r.leg === 'smoke' ? { leg: 'smoke', exit: 0, observed: 'pass' } : r))
  const passManifest = writeManifest(dir, passRows)
  const passRun = runNode(SCRIPT, ['--manifest', passManifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const passRow = JSON.parse(passRun.stdout.trim().split('\n')[1])
  assert.strictEqual(passRow.smoke, 'pass',
    'a smoke row with exit 0 and observed "pass" must derive row.smoke "pass" — D2 requires smoke be ' +
    'derived FROM the manifest row, not hardcoded: ' + JSON.stringify(passRow))

  const inertManifest = writeManifest(dir, SIX_GREEN) // smoke row: exit 4, observed "inert"
  const inertRun = runNode(SCRIPT, ['--manifest', inertManifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const inertRow = JSON.parse(inertRun.stdout.trim().split('\n')[1])
  assert.strictEqual(inertRow.smoke, 'inert',
    'a smoke row with exit 4 (the sanctioned inert-green case) must derive row.smoke "inert" regardless of ' +
    'its observed text — exit 4 is the authority, per D3\'s "exit 4 = inert counts green": ' +
    JSON.stringify(inertRow))

  const failRows = SIX_GREEN.map(r => (r.leg === 'smoke' ? { leg: 'smoke', exit: 2, observed: 'boot-crash' } : r))
  const failManifest = writeManifest(dir, failRows)
  const failRun = runNode(SCRIPT, ['--manifest', failManifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const failRow = JSON.parse(failRun.stdout.trim().split('\n')[1])
  assert.strictEqual(failRow.smoke, 'fail',
    'a smoke row with a non-0, non-4 exit must derive row.smoke "fail" — the row must still print (GATE_RED ' +
    'is a non-CLEAN word, not a reason to withhold the ledger row) so the failure is visible in the ledger ' +
    'history, not just on stderr: ' + JSON.stringify(failRow))
})

test('AC-20260813-02-7 (updates AC-20260805-02-5) / AC-20260816-01-7 (CONTINUES TO hold post-D6) / AC-20260820-03-4 (CONTINUES TO hold post-D2\'s typed-unavailable branch): --ledger derives row.testsSkipped.total as skips+todos from the gate row\'s pinned "skips=N todos=M" observed format — the total-summing claim survives the D2 object-shape change, the D6 suffix-tolerance change, and specs/20260820/03\'s new unavailable-observed branch, which is a disjoint regex arm and must never perturb the matched-format case', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate' ? { leg: 'gate', exit: 0, observed: 'skips=2 todos=1' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.strictEqual(typeof row.testsSkipped, 'object',
    'D2 makes row.testsSkipped an object ({total,sanctioned,unsanctioned}) always — a bare number here means ' +
    'the scalar shape survived and downstream consumers still cannot tell a sanctioned skip run from an ' +
    'unsanctioned one: ' + JSON.stringify(row))
  assert.strictEqual(row.testsSkipped.total, 3,
    'D2 pins the gate leg\'s observed format as "skips=N todos=M" specifically so testsSkipped.total can be ' +
    'summed from it (a skip is not a pass) — skips=2 todos=1 must derive total 3, not 2 or 1 alone: ' +
    JSON.stringify(row))
})

test('AC-20260820-03-3: a gate row observed "unavailable — skip format did not match gate output" (exit 0) derives ledger row.testsSkipped as exactly {"unavailable":true}, never a fabricated zero total', () => {
  const dir = tmpdir('verdict-skip-unavailable')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 0, observed: 'unavailable — skip format did not match gate output' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const lines = r.stdout.trim().split('\n')
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'D2: --ledger must still print a parseable ledger row on line 2 for an unavailable-skip-format gate ' +
    'observation: ' + r.stdout + ' / ' + r.stderr)
  assert.deepStrictEqual(row.testsSkipped, { unavailable: true },
    'D2: a gate observed starting with "unavailable" must derive row.testsSkipped as exactly ' +
    '{"unavailable":true} — the pre-D2 arithmetic (deriveTestsSkipped regexing ' +
    '"^skips=(\\d+) todos=(\\d+)$") silently falls through to {"total":0,"sanctioned":0,"unsanctioned":0} on ' +
    'this input, fabricating a zero-skip measurement no run ever made (A1, the Salon OS field report defect): ' +
    JSON.stringify(row))
})

test('AC-20260820-03-5: an all-green manifest whose gate row observed is "unavailable — skip format did not match gate output" (exit 0) derives HARD_FINDINGS, never CLEAN, even with a zero-survivor zero-disposition workflow return', () => {
  const dir = tmpdir('verdict-skip-unavailable-finding')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 0, observed: 'unavailable — skip format did not match gate output' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'HARD_FINDINGS',
    'D3: an unmatched skip-format observation is drift, not honest config, and must page the same run it ' +
    'occurs on (dead-man\'s-switch, never a consecutive-miss counter) — every other leg is green and the ' +
    'workflow returned zero-survivor CLEAN, so any word other than HARD_FINDINGS here means the silent-decay ' +
    'defect A1 demonstrated on this exact manifest (CLEAN + testsSkipped.total:0) is still live: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'HARD_FINDINGS must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260820-03-6: an all-green manifest whose gate row observed is "unavailable — host runner declares no skip format" (exit 0) derives CLEAN, with ledger row.testsSkipped typed {"unavailable":true} — declared-none is sanctioned, never a finding', () => {
  const dir = tmpdir('verdict-skip-declared-none')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 0, observed: 'unavailable — host runner declares no skip format' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'D3: a host that declares no skip format at all is honest standing config, not drift — only the ' +
    'unmatched-pattern variant pages; this exact observed string must derive CLEAN with zero dispositions ' +
    'needed: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'CLEAN must exit 0: ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'D2: --ledger must still print a parseable ledger row on line 2: ' + r.stdout)
  assert.deepStrictEqual(row.testsSkipped, { unavailable: true },
    'D2: this observed string also starts with "unavailable" so testsSkipped must be typed ' +
    '{"unavailable":true}, never a fabricated zero total, matching the drift variant\'s shape even though ' +
    'this row raises no finding of its own: ' + JSON.stringify(row))
})

// specs/20260816/01-gate-baseline-reconcile.md D10 (retainer ruling, 2026-08-17, tdd-red-check
// consult): AC-20260816-01-12 is a sanctioned-green regression pin, standalone (never folded
// onto AC-8's testsSkipped-total test, which pins a different observable — see D10's rationale).
// The verdict word derives from leg exit codes alone (derive()/legIsRed reads row.exit, never
// row.observed), so a gate row's "sanctionedReds=<K>" suffix must never perturb it — this test
// is specified to already pass, and its falsifiability is demonstrated in-line by mutating the
// same fixture's gate exit to 1 and asserting the word flips to GATE_RED (D10: verified by
// mutation, never by weakening).
test('AC-20260816-01-12 / AC-20260820-03-12 (CONTINUES TO hold — D4: gate-leg verdict derivation stays exit-code-only, the D3 skip-observation finding rides the leg-findings pool and never derives GATE_RED): a green-by-subtraction gate row (exit:0, observed "skips=0 todos=0 sanctionedReds=21") with all other legs green and a clean workflow return derives a CLEAN-family word, never GATE_RED — the terminal observable of the spec\'s chain', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 0, observed: 'skips=0 todos=0 sanctionedReds=21' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.match(r.stdout.split('\n')[0], /^CLEAN/,
    'a gate leg that went green by sanctioned-baseline subtraction is still exit:0 — derive()/legIsRed reads ' +
    'only the exit code, never the observed string, so a review that closed via suite-baseline.js --gate must ' +
    'still reach a CLEAN-family verdict, not be misread as red because its observed text names 21 sanctioned ' +
    'reds: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'a CLEAN-family word here must exit 0: ' + r.stderr)

  const redRows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 1, observed: 'skips=0 todos=0 sanctionedReds=21' } : r))
  const redManifest = writeManifest(dir, redRows)
  const rRed = runNode(SCRIPT, ['--manifest', redManifest, '--workflow', workflow])
  assert.strictEqual(rRed.stdout.split('\n')[0], 'GATE_RED',
    'falsifiability check (D10): the exact same sanctionedReds=21 observed text with the gate row\'s exit ' +
    'flipped to 1 must derive GATE_RED — proving the pin above is actually sensitive to the gate leg\'s exit ' +
    'code and is not a vacuously-true assertion: ' + rRed.stdout + ' / ' + rRed.stderr)
})

test('AC-20260813-02-1: --ledger derives row.testsSkipped as {total,sanctioned,unsanctioned} from the gate row\'s skips+todos and the skip-reconcile row\'s "skipped=K sanctioned=S" observed format', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => {
    if (r.leg === 'gate') return { leg: 'gate', exit: 0, observed: 'skips=2 todos=1' }
    if (r.leg === 'skip-reconcile') return { leg: 'skip-reconcile', exit: 0, observed: 'skipped=3 sanctioned=2' }
    return r
  })
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.deepStrictEqual(row.testsSkipped, { total: 3, sanctioned: 2, unsanctioned: 1 },
    'D2: gate "skips=2 todos=1" (total 3) joined with skip-reconcile "skipped=3 sanctioned=2" (sanctioned 2) ' +
    'must derive {"total":3,"sanctioned":2,"unsanctioned":1} — without this split, hearwell\'s testsSkipped:5 ' +
    'incident (identical count for 5 declared-sanctioned skips and 5 undeclared ones) is unfixed: ' +
    JSON.stringify(row))
})

test('AC-20260813-02-2: a legacy skip-reconcile "skipped=K" observed (no sanctioned= term) derives sanctioned:0 — undeclared skips are unsanctioned by construction, never silently sanctioned', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => {
    if (r.leg === 'gate') return { leg: 'gate', exit: 0, observed: 'skips=2 todos=1' }
    if (r.leg === 'skip-reconcile') return { leg: 'skip-reconcile', exit: 0, observed: 'skipped=2' }
    return r
  })
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.deepStrictEqual(row.testsSkipped, { total: 3, sanctioned: 0, unsanctioned: 3 },
    'D2: a legacy skip-reconcile row carrying only "skipped=2" (no sanctioned= term) must derive sanctioned:0 ' +
    '— the conservative reading is that an undeclared skip is unsanctioned by definition, never silently ' +
    'treated as sanctioned just because an older manifest shape produced it: ' + JSON.stringify(row))
})

// specs/20260818/01-ledger-truth.md D8 (build-time addendum to D7, found by the red gate
// 2026-08-18 — a sixth colliding pin this pass's own collision sweep missed): the surviving
// half (counts nested under `findings`, never flat at top level) continues; the exhaustive
// six-key `deepStrictEqual` is the defect — D4 adds a seventh key (`legFindings`) to
// `row.findings`, so the old six-key object is no longer what the script emits. Updated in
// place and retagged to AC-20260818-01-2, never weakened to a subset/partial match.
test('AC-20260818-01-2 (retag of AC-20260805-02-8): the review ledger row nests survived/killed/waived/rejected/fixDispatched/reviewerCount/legFindings under findings and carries none of them flat at the top level', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-a' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir, '--waived', '1'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.ok(row.findings && typeof row.findings === 'object',
    'the disposition counts must be nested under a findings object per review.md\'s documented ledger-row ' +
    'template — a flat row is a schema shape a consumer reading row.findings.killed cannot parse: ' +
    JSON.stringify(row))
  assert.deepStrictEqual(row.findings, {
    survived: 1, killed: 0, waived: 1, rejected: 0, fixDispatched: 0, reviewerCount: 1, legFindings: 0,
  }, 'D4: row.findings must carry exactly the SEVEN disposition/finding counts with their derived values ' +
    '(all legs green in this fixture, so legFindings:0) — a mismatch means either escape.md\'s ' +
    '"findings.killed" backlink reads the wrong number, or a reader of the ledger row cannot tell ' +
    'CLEAN-because-zero-leg-findings from CLEAN-because-some-were-waived: ' + JSON.stringify(row.findings))
  for (const flatKey of ['survived', 'killed', 'waived', 'rejected', 'fixDispatched', 'reviewerCount', 'legFindings']) {
    assert.ok(!(flatKey in row),
      `row.${flatKey} must not also exist flat at the top level once nested under findings — carrying both ` +
      'shapes at once is not what "additive" (Contracts: "ledger row (additive)") means, and a consumer ' +
      'reading the old flat field would silently see stale/duplicate data: ' + JSON.stringify(row))
  }
})

// 2026-08-06 review-fix: real wf-review returns workflow.killed as an ARRAY of killed-finding
// objects (not the plain count cleanWorkflow()'s stub used above) and workflow.tokens as a
// plain number — two shapes verdict.js's --ledger row was passing through unnormalized instead
// of converting to the documented review.md:229 template (findings.killed = a count,
// tokens = {"workflow":<n>}). This test pins the corrected normalization by execution.
test('AC-20260805-02-8: --ledger normalizes an array-shaped workflow.killed to its length and a numeric workflow.tokens to {workflow:<n>}', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflowObj = cleanWorkflow([{ severity: 'soft', id: 'AC-a' }])
  workflowObj.killed = [{ file: 'x' }, { file: 'y' }]
  workflowObj.tokens = 777
  const workflow = writeWorkflow(dir, workflowObj)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir, '--waived', '1'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.strictEqual(row.findings.killed, 2,
    'workflow.killed arriving as an array of killed-finding objects must be normalized to its LENGTH under ' +
    'row.findings.killed, not passed through as an array — an array here breaks escape.md\'s ' +
    '"findings.killed>0" correlation and doctor\'s jq numeric comparison against this field: ' +
    JSON.stringify(row.findings))
  assert.deepStrictEqual(row.tokens, { workflow: 777 },
    'workflow.tokens arriving as a plain number must be normalized to the documented {"workflow":<n>} object ' +
    'shape, not passed through as a bare number — a bare number here makes the ledger\'s tokens accounting ' +
    'unparseable against review.md:229\'s schema: ' + JSON.stringify(row))
})

// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-6 .. -02-8): `at-risk` joins
// REVIEW_LEGS as a required-but-non-blocking full-scope leg, mirroring the fail-closed presence
// rule the ci/gate oracle legs already establish, and mirroring `reconcile`'s standing on the
// blocking question. This fixture predates the at-risk row (unlike SIX_GREEN above, which now
// carries it) so these three tests can isolate at-risk's own presence/absence/redness.
//
// specs/20260817/07-promise-sweep-leg.md D4 (retarget, deviation logged in this spec's
// deviations sidecar): `promise-sweep` joins REVIEW_LEGS required in BOTH scopes, unlike
// `at-risk`/`reconcile` which the fix-delta filter excludes — so under fix-delta scope this
// fixture (minus `reconcile`) collapses to the exact same row set AC-20260817-07-11's fix-delta
// fixture uses, and AC-20260817-07-11 pins that exact set as UNVERIFIED when promise-sweep is
// absent. AC-20260815-02-8 below asserts CLEAN for that identical row set — the two claims are
// mutually exclusive by construction, not a judgment call (verified: filtering this fixture the
// same way AC-20260815-02-8 does yields ["gate","smoke","ac-matrix","skip-reconcile","ci"],
// byte-identical to AC-20260817-07-11's fix-delta manifest). The row is added here, mirroring
// SIX_GREEN's own retarget, so AC-20260815-02-6/-7/-8 keep meaning "every OTHER leg genuinely
// passed" instead of silently asserting a claim D4 makes structurally false.
const SIX_LEGS_NO_AT_RISK = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 4, observed: 'inert' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
  { leg: 'promise-sweep', exit: 0, observed: 'rows=1 carried=1 sanctioned=0 orphans=0' },
]

test('AC-20260815-02-6: a full-scope review manifest missing the at-risk row derives UNVERIFIED, never CLEAN, even with all six legacy legs green and a CLEAN workflow return', () => {
  const dir = tmpdir('verdict-at-risk-missing')
  const manifest = writeManifest(dir, SIX_LEGS_NO_AT_RISK)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D4 makes at-risk a required full-scope leg via the same fail-closed presence rule the ' +
    'other REVIEW_LEGS entries already carry — a manifest missing it must derive UNVERIFIED even ' +
    'though all six legacy legs are green and the workflow returned zero-survivor CLEAN, or a ' +
    'review could close CLEAN having never run the compensating derivation at all: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

// specs/20260818/01-ledger-truth.md D7 retag: the surviving half (at-risk never derives
// GATE_RED — it stays non-blocking) continues; the fail-open half (a red at-risk leg with
// zero survivors and zero dispositions reached CLEAN for free) is the defect D1-D3 close, so
// the fixture now needs a waive before CLEAN — updated in place, never weakened, never left red.
test('AC-20260818-01-9 (retag of AC-20260815-02-7): a red at-risk leg CONTINUES TO never derive GATE_RED, but now needs its leg finding waived before CLEAN is reachable', () => {
  const dir = tmpdir('verdict-at-risk-red')
  const rows = [...SIX_LEGS_NO_AT_RISK, { leg: 'at-risk', exit: 1, observed: 'files=2' }]
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const undispositioned = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.notStrictEqual(undispositioned.stdout.split('\n')[0], 'GATE_RED',
    'D4: at-risk does NOT join REVIEW_BLOCKING — a red at-risk leg must never derive GATE_RED, matching ' +
    'reconcile\'s exit-3 standing (the finding flows to Phase 2 dispositions instead), never a hard gate ' +
    'stop: ' + undispositioned.stdout + ' / ' + undispositioned.stderr)
  assert.strictEqual(undispositioned.stdout.split('\n')[0], 'HARD_FINDINGS',
    'D1: a red at-risk row ("files=2", unparseable by D2\'s named grammars) contributes 1 leg finding floored ' +
    'at 1, which now sits undispositioned alongside zero survivors and zero dispositions — the derivation ' +
    'must be HARD_FINDINGS, not the silent CLEAN the 2026-08-18 Fable consult demonstrated fails open: ' +
    undispositioned.stdout)
  const waived = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.match(waived.stdout.split('\n')[0], /^CLEAN/,
    'the same red at-risk leg (files=2) with its one leg finding waived must reach a CLEAN-family word at ' +
    'exit 0 — at-risk stays non-blocking but is no longer free to skip disposition entirely: ' +
    waived.stdout + ' / ' + waived.stderr)
  assert.strictEqual(waived.status, 0,
    'a CLEAN-family word reached via a dispositioned non-blocking red at-risk leg must exit 0, or a red-but-' +
    'non-blocking leg would still make the review mechanically unclosable: ' + waived.stderr)
})

// The manifest below (fix-delta scope, missing both reconcile and at-risk) already derives CLEAN
// on pre-D4 code, since `at-risk` does not exist in today's REVIEW_LEGS at all — there is no
// manifest-only construction that makes this AC red on unimplemented code without at-risk first
// entering REVIEW_LEGS. Logged per host rules' conservative-deviation clause (this AC's shape is
// a regression continuity guard, not a reachable red-first case): 02-at-risk-pins.deviations.md.
test('AC-20260815-02-8: on scope fix-delta, a manifest lacking both reconcile and at-risk rows still derives from the remaining required legs', () => {
  const dir = tmpdir('verdict-at-risk-fixdelta')
  const rows = SIX_LEGS_NO_AT_RISK.filter(r => r.leg !== 'reconcile')
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, { ...cleanWorkflow([]), scope: 'fix-delta' })
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'D4: the fix-delta filter excludes both reconcile and at-risk from requiredLegs — a manifest ' +
    'missing both rows must still derive CLEAN from the remaining five green legs, never ' +
    'UNVERIFIED for a leg fix-delta scope never had to run: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'CLEAN must exit 0: ' + r.stderr)
})

// specs/20260817/07-promise-sweep-leg.md D4 (AC-20260817-07-11, AC-20260817-07-12): isolates the
// promise-sweep row's own presence/redness the same way SIX_LEGS_NO_AT_RISK isolates at-risk's.
const EIGHT_LEGS_NO_PROMISE_SWEEP = SIX_GREEN.filter(r => r.leg !== 'promise-sweep')

test('AC-20260817-07-11: a full-scope manifest missing the promise-sweep row derives UNVERIFIED, never CLEAN, even with every other leg green and a CLEAN workflow return', () => {
  const dir = tmpdir('verdict-promise-sweep-missing-full')
  const manifest = writeManifest(dir, EIGHT_LEGS_NO_PROMISE_SWEEP)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D4 makes promise-sweep a required full-scope leg via the same fail-closed presence rule the other ' +
    'REVIEW_LEGS entries already carry — a manifest missing it must derive UNVERIFIED even though every ' +
    'other leg is green and the workflow returned zero-survivor CLEAN, or a review could close CLEAN ' +
    'having never run the leg that closes the v7 replay eval\'s one measured miss class: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260817-07-11 (fix-delta scope): a fix-delta manifest missing the promise-sweep row also derives UNVERIFIED — the leg is excluded from neither scope\'s required set', () => {
  const dir = tmpdir('verdict-promise-sweep-missing-fixdelta')
  const rows = EIGHT_LEGS_NO_PROMISE_SWEEP.filter(r => r.leg !== 'reconcile' && r.leg !== 'at-risk')
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, { ...cleanWorkflow([]), scope: 'fix-delta' })
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D4: promise-sweep is required in BOTH scopes, unlike reconcile/at-risk which fix-delta filters out of ' +
    'requiredLegs — a fix-delta manifest missing the promise-sweep row must still derive UNVERIFIED, never ' +
    'CLEAN from the remaining green legs alone: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

// specs/20260818/01-ledger-truth.md D7 retag: the surviving half (promise-sweep's non-zero
// exit counts as executed-green leg presence, and it never derives GATE_RED) continues; the
// fail-open half (waiving only the reviewer survivor was enough to reach CLEAN while the
// promise-sweep leg finding itself sat undispositioned) is the defect D1-D3 close — updated in
// place, never weakened, never left red.
test('AC-20260818-01-10 (retag of AC-20260817-07-12): a red promise-sweep leg finding coexisting with a reviewer survivor requires dispositions covering both pools before CLEAN — waiving only the survivor still derives HARD_FINDINGS', () => {
  const dir = tmpdir('verdict-promise-sweep-red')
  const rows = SIX_GREEN.map(r => (r.leg === 'promise-sweep'
    ? { leg: 'promise-sweep', exit: 1, observed: 'rows=1 carried=0 sanctioned=0 orphans=1' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'hard', id: 'D1' }]))
  const partial = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(partial.stdout.split('\n')[0], 'HARD_FINDINGS',
    'D1/D3: 1 reviewer survivor + 1 promise-sweep leg finding (orphans=1) is a pool of 2 — waiving only 1 ' +
    'covers just the survivor and leaves the leg finding undispositioned, so the derivation must stay ' +
    'HARD_FINDINGS, not the CLEAN the pre-D1 survivors-only arithmetic wrongly reached: ' +
    partial.stdout + ' / ' + partial.stderr)
  const full = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '2'])
  assert.strictEqual(full.stdout.split('\n')[0], 'CLEAN',
    'D4: promise-sweep is a findings-producing leg like ac-matrix (mirror of its standing) — its non-zero ' +
    'exit still counts as executed-green for leg presence, and waiving both the survivor and the leg ' +
    'finding (2 total) must reach CLEAN, never stick at GATE_RED since the leg never joins REVIEW_BLOCKING: ' +
    full.stdout + ' / ' + full.stderr)
  assert.strictEqual(full.status, 0, 'CLEAN reached via full disposition of both pools must exit 0: ' + full.stderr)
})

const RELEASE_SIX_LEGS = [
  { leg: 'deploy', exit: 0, observed: 'ok' },
  { leg: 'ready', exit: 0, observed: 'ok' },
  { leg: 'e2e', exit: 0, observed: 'passed=10 failed=0 skipped=2' },
  { leg: 'journeys', exit: 0, observed: 'walked=5 failed=0' },
  { leg: 'substrate', exit: 0, observed: 'checked=8 failed=0 inert=1' },
  { leg: 'production', exit: 0, observed: 'verified' },
]
const RELEASE_SEVEN_LEGS = [
  ...RELEASE_SIX_LEGS,
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
]

test('AC-20260813-02-5 (AC-20260805-02-8 / AC-20260810-07-5, byte-identical per D5): --profile release --ledger with --milestone/--briefs and all seven green legs incl. ci observed conclusion=success derives plain CLEAN (never CLEAN-with-qualifier) matching release.md\'s template', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, RELEASE_SEVEN_LEGS)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.2.3', '--briefs', '12,13'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'seven green release legs (deploy/ready/e2e/journeys/substrate/production/ci) must derive CLEAN — a wrong ' +
    'word here means the row assertions below are exercising a path release.md never actually reaches: ' +
    r.stdout + ' / ' + r.stderr)
  const row = JSON.parse(lines[1])
  assert.strictEqual(row.milestone, 'v1.2.3',
    'row.milestone must carry the --milestone flag verbatim — release.md\'s template documents it as the ' +
    'tag/briefs-range identity of the release: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.briefs, [12, 13],
    'row.briefs must parse the comma-int --briefs flag into a numeric array, matching release.md\'s ' +
    '"briefs":[<NN>,…] template: ' + JSON.stringify(row))
  assert.strictEqual(row.staging, 'pass',
    'row.staging must be "pass" when both deploy and ready legs are exit 0 — release.md gates promotion on ' +
    'this derived value: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.e2e, { passed: 10, failed: 0, skipped: 2 },
    'row.e2e must parse the e2e leg\'s "passed=N failed=N skipped=N" observed string into the documented ' +
    'object shape: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.journeys, { walked: 5, failed: 0 },
    'row.journeys must parse the journeys leg\'s "walked=N failed=N" observed string: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.substrate, { checked: 8, failed: 0, inert: 1 },
    'row.substrate must parse the substrate leg\'s "checked=N failed=N inert=N" observed string: ' +
    JSON.stringify(row))
  assert.strictEqual(row.production, 'verified',
    'row.production must read the production leg\'s observed enum value directly when it is one of ' +
    'verified|skipped|failed: ' + JSON.stringify(row))
  assert.strictEqual(row.ci, 'conclusion=success',
    'row.ci must carry the ci leg\'s observed string verbatim (AC-20260810-07-5) — the release ledger row ' +
    'gains a "ci" field per D4/Contracts once ci joins RELEASE_LEGS, and this six-leg fixture regresses to ' +
    'UNVERIFIED the moment that happens (refuter-demonstrated) unless the ci row is present here: ' +
    JSON.stringify(row))
})

test('AC-20260813-02-4 (v7 retag): --profile release with six green legs and a ci row observed "unavailable" (exit 0, structurally-absent verdict) derives plain CLEAN, records the observation in row.ci, and exits 0', () => {
  const dir = tmpdir('verdict')
  const rows = RELEASE_SEVEN_LEGS.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 0, observed: 'unavailable' } : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.2.3', '--briefs', '12,13'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'v7: the qualifier word is retired — a release whose ci leg observed is "unavailable" derives plain ' +
    'CLEAN; the structurally-absent observation stays durable in row.ci, never a distinct verdict word: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'CLEAN must exit 0: ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must still print a parseable JSON row on line 2: ' + r.stdout)
  assert.strictEqual(row.ci, 'unavailable',
    'row.ci must record the unavailable observation — with the qualifier word retired this field is the ' +
    'only durable carrier of "CI never delivered a verdict on this commit": ' + JSON.stringify(row))
})

test('AC-20260810-07-6: --profile release with the other six legs green but NO ci row derives UNVERIFIED and exits 1', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, RELEASE_SIX_LEGS)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'RELEASE_LEGS must include `ci` (D4/Contracts: "RELEASE_LEGS becomes [...,\'ci\']") — a manifest missing ' +
    'the ci row is missing a required leg and must derive UNVERIFIED, never CLEAN, even though the other six ' +
    'legs are all green: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so promotion is mechanically unreachable: ' + r.stderr)
})

test('AC-20260810-07-7: --profile release with a red ci row (exit 1) derives GATE_RED and exits 1', () => {
  const dir = tmpdir('verdict')
  const rows = RELEASE_SEVEN_LEGS.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 1, observed: 'conclusion=failure' } : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'ci must be a blocking release leg (D4: RELEASE_LEGS is "all release legs blocking, unchanged rule") — a ' +
    'completed red run on the release commit must derive GATE_RED even with the other six legs green: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'GATE_RED must exit 1 so promotion is mechanically unreachable: ' + r.stderr)
})

test('AC-20260805-02-8: a partial release manifest (STOP path) still prints a ledger row, omitting missing or unparseable leg keys instead of failing', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, [
    { leg: 'deploy', exit: 0, observed: 'ok' },
    { leg: 'ready', exit: 0, observed: 'ok' },
    { leg: 'e2e', exit: 0, observed: 'not-the-pinned-format' }, // present but unparseable
    // journeys/substrate/production never ran — the STOP fired before them
  ])
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.2.3', '--briefs', '7'])
  const lines = r.stdout.trim().split('\n')
  assert.notStrictEqual(lines[0], 'CLEAN',
    'a release manifest missing required legs (journeys/substrate/production never executed) must never ' +
    'derive CLEAN — that would ledger a promotion as clean evidence it never gathered: ' + r.stdout)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'even on a STOP path (D7: "the STOP path appends the red row") the row must still print as parseable ' +
    'JSON on line 2 — a STOP that fails to ledger is invisible to doctor\'s correlations: ' + r.stdout)
  assert.strictEqual(row.milestone, 'v1.2.3', 'identity flags must survive onto a STOP-path row too: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.briefs, [7], 'identity flags must survive onto a STOP-path row too: ' + JSON.stringify(row))
  assert.strictEqual(row.staging, 'pass',
    'staging is derivable from the deploy+ready rows that DID execute, so it must still be present even ' +
    'though later legs did not run: ' + JSON.stringify(row))
  assert.ok(!('e2e' in row),
    'the e2e leg\'s observed string does not match the pinned "passed=N failed=N skipped=N" format — the ' +
    'row must omit row.e2e rather than print nulls/NaNs that a consumer would read as real zero counts: ' +
    JSON.stringify(row))
  for (const missingKey of ['journeys', 'substrate', 'production']) {
    assert.ok(!(missingKey in row),
      `the ${missingKey} leg never ran on this STOP path, so row.${missingKey} must be omitted entirely — ` +
      'a fabricated value would misreport a leg that was never executed: ' + JSON.stringify(row))
  }
})

test('AC-20260805-02-9: dispositions exceeding the workflow file\'s survivor count exit 2 without printing a verdict word', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'soft', id: 'AC-a' }, { severity: 'soft', id: 'AC-b' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '3'])
  assert.strictEqual(r.status, 2,
    'waived(3) alone already exceeds the workflow file\'s 2 survivors — a contradictory disposition count ' +
    'must exit 2 (usage/contradictory inputs), never silently pick a verdict: ' + r.stdout + ' / ' + r.stderr)
  assert.ok(!VERDICT_WORDS.test(r.stdout.split('\n')[0] || ''),
    'no verdict word may be printed on a contradictory-input run — printing one anyway would let a caller ' +
    'read stdout without checking the exit code and get a fabricated verdict: ' + JSON.stringify(r.stdout))
  assert.ok(r.stderr.length > 0, 'the contradiction must be named on stderr so the remedy is discoverable: (empty stderr)')
})

// --- specs/20260818/01-ledger-truth.md: AC-20260818-01-1 .. -01-5 (D1-D3) ---
// New coverage for the leg-findings pool D1-D3 introduce: a red findings leg's parsed count now
// joins reviewer survivors in the same undispositioned pool, and CLEAN is unreachable until
// dispositions cover both. (AC-20260818-01-6 .. -01-10 are retags of prior pins, updated in
// place above at their original locations — legs-shape widen, runId generation split,
// at-risk/promise-sweep/ac-matrix waive-both-pools.)

test('AC-20260818-01-1: a red findings leg with zero survivors and zero dispositions derives HARD_FINDINGS and exits 1, never CLEAN', () => {
  const dir = tmpdir('verdict-legfindings')
  const rows = SIX_GREEN.map(r => (r.leg === 'promise-sweep'
    ? { leg: 'promise-sweep', exit: 1, observed: 'rows=9 carried=5 sanctioned=2 orphans=2' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'HARD_FINDINGS',
    'D1: a red promise-sweep row (orphans=2) with every other leg green, zero reviewer survivors, and zero ' +
    'dispositions must derive HARD_FINDINGS — the 2026-08-18 Fable consult demonstrated the pre-D1 ' +
    'arithmetic derived CLEAN here instead, a fail-open that let orphaned Decisions close a review ' +
    'unnoticed: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'HARD_FINDINGS must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260818-01-2: the same red-findings-leg manifest reaches CLEAN once its leg findings are fully dispositioned, and the ledger row records the leg-finding count', () => {
  const dir = tmpdir('verdict-legfindings')
  const rows = SIX_GREEN.map(r => (r.leg === 'promise-sweep'
    ? { leg: 'promise-sweep', exit: 1, observed: 'rows=9 carried=5 sanctioned=2 orphans=2' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '2', '--ledger', '--retain', dir])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'D2: promise-sweep\'s "orphans=2" observed must parse to exactly 2 leg findings, so waiving 2 fully ' +
    'disposition the pool and reach CLEAN — an off-by-one in the count grammar would leave this stuck at ' +
    'HARD_FINDINGS or wrongly reach CLEAN with 1 orphan still uncovered: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'CLEAN must exit 0: ' + r.stderr)
  const row = JSON.parse(lines[1])
  assert.strictEqual(row.findings.waived, 2,
    'the ledger row must record the actual waived count passed: ' + JSON.stringify(row.findings))
  assert.strictEqual(row.findings.legFindings, 2,
    'D4: the review row\'s findings object must carry legFindings:2 — without this field a reader of the ' +
    'ledger row cannot tell CLEAN-because-zero-findings from CLEAN-because-2-waived: ' +
    JSON.stringify(row.findings))
})

test('AC-20260818-01-3: a red leg\'s contribution to legFindings is parsed from its pinned observed format and floored at 1', () => {
  const dir = tmpdir('verdict-count-grammar')
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const cases = [
    { leg: 'reconcile', row: { leg: 'reconcile', exit: 3, observed: 'outOfPlan=3' }, expected: 3 },
    { leg: 'skip-reconcile', row: { leg: 'skip-reconcile', exit: 1, observed: 'skipped=3 sanctioned=2' }, expected: 1 },
    { leg: 'at-risk', row: { leg: 'at-risk', exit: 1, observed: 'files=2' }, expected: 1 },
    { leg: 'promise-sweep', row: { leg: 'promise-sweep', exit: 1, observed: 'garbled' }, expected: 1 },
  ]
  for (const c of cases) {
    const rows = SIX_GREEN.map(r => (r.leg === c.leg ? c.row : r))
    const manifest = writeManifest(dir, rows)
    const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', dir])
    const row = JSON.parse(r.stdout.trim().split('\n')[1])
    assert.strictEqual(row.findings.legFindings, c.expected,
      `D2: a red ${c.leg} row observed "${c.row.observed}" must parse to legFindings:${c.expected} — a ` +
      'wrong count under- or over-disposition the pool relative to the actual number of contract ' +
      'violations the row asserts: ' + JSON.stringify(row.findings))
  }
})

test('AC-20260818-01-4: dispositions exceeding survivors+legFindings exit 2 naming both pools, but exceeding survivors alone (not the sum) still proceeds', () => {
  const dir = tmpdir('verdict-guard')
  const workflow = writeWorkflow(dir, cleanWorkflow([]))

  // All legs green, zero survivors, zero legFindings: --waived 1 exceeds the sum (0+0=0).
  const cleanManifest = writeManifest(dir, SIX_GREEN)
  const over = runNode(SCRIPT, ['--manifest', cleanManifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(over.status, 2,
    'D3: waived(1) exceeds survivors(0)+legFindings(0)=0 — the widened guard must still exit 2 on a ' +
    'contradictory disposition count: ' + over.stdout + ' / ' + over.stderr)
  assert.match(over.stderr, /surviv/i,
    'D3: the contradiction message must name the survivors pool so the remedy is discoverable: ' + over.stderr)
  assert.match(over.stderr, /legFindings/i,
    'D3: the contradiction message must ALSO name the legFindings pool — the guard now spans two pools, and ' +
    'a message naming only survivors would mislead a reader chasing a leg-finding-caused contradiction: ' +
    over.stderr)

  // promise-sweep red (orphans=2, legFindings=2), zero survivors: --waived 2 exceeds survivors(0) alone but
  // not the sum (0+2=2) — must proceed, not exit 2.
  const legRows = SIX_GREEN.map(r => (r.leg === 'promise-sweep'
    ? { leg: 'promise-sweep', exit: 1, observed: 'rows=9 carried=5 sanctioned=2 orphans=2' } : r))
  const legManifest = writeManifest(dir, legRows)
  const proceeds = runNode(SCRIPT, ['--manifest', legManifest, '--workflow', workflow, '--waived', '2'])
  assert.strictEqual(proceeds.stdout.split('\n')[0], 'CLEAN',
    'D3: waived(2) exceeds survivors(0) alone but not survivors+legFindings(0+2=2) — this must PROCEED to a ' +
    'verdict, not exit 2, or the ratified waive path for leg findings (D1\'s rejected-alternative: making ' +
    'findings legs blocking would break it) would be structurally unreachable: ' +
    proceeds.stdout + ' / ' + proceeds.stderr)
  assert.strictEqual(proceeds.status, 0, 'the proceeding case must exit 0 at CLEAN: ' + proceeds.stderr)
})

test('AC-20260818-01-5: --ledger retains each leg\'s observed string in the row, byte-distinguishing a real observation from a structurally-absent one', () => {
  const dir = tmpdir('verdict-observed')
  const workflow = writeWorkflow(dir, cleanWorkflow([]))

  const passManifest = writeManifest(dir, SIX_GREEN)
  const passRun = runNode(SCRIPT, ['--manifest', passManifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const passRow = JSON.parse(passRun.stdout.trim().split('\n')[1])
  const passCi = passRow.legs.find(l => l.leg === 'ci')
  assert.strictEqual(passCi.observed, 'conclusion=success',
    'D4: a real CI observation must survive into the ledger row verbatim — stripping it (the pre-D4 shape) ' +
    'makes "CI passed" indistinguishable from "no CI exists": ' + JSON.stringify(passCi))

  const unavailManifest = writeManifest(dir, SIX_GREEN_CI_UNAVAILABLE)
  const unavailRun = runNode(SCRIPT, ['--manifest', unavailManifest, '--workflow', workflow, '--ledger', '--retain', dir])
  const unavailRow = JSON.parse(unavailRun.stdout.trim().split('\n')[1])
  const unavailCi = unavailRow.legs.find(l => l.leg === 'ci')
  assert.strictEqual(unavailCi.observed, 'unavailable',
    'D4: a structurally-absent CI observation must ALSO survive into the ledger row, distinct from ' +
    '"conclusion=success" — the two rows above must be byte-distinguishable at row.legs, which is the ' +
    'whole point of retaining observed: ' + JSON.stringify(unavailCi))
  assert.notStrictEqual(passCi.observed, unavailCi.observed,
    'a pass and a structurally-absent observation must never collapse to the same ledger string: ' +
    passCi.observed + ' vs ' + unavailCi.observed)
})

// --- specs/20260819/01-review-evidence-retention.md: AC-20260819-01-1 .. -01-7 (D1-D4) ---
// AC-1/-6/-7 share one fixture (a 300-char leg observed string plus a survivor carrying an
// `evidence` string) so the byte-untruncated artifact and the byte-unchanged stdout/ledger
// contracts are pinned against the exact same input, per the spec's own AC-6/-7 text ("e.g. the
// AC-1 fixture's row"). The leg elongated is promise-sweep, left exit:0 (green) so its observed
// content never feeds legFindings parsing (that grammar only applies to a RED leg, AC-20260818-
// 01-3) and the derivation stays reachable to CLEAN via the one waived survivor.

const LONG_OBSERVED = 'o'.repeat(300)

function retentionFixture(dir) {
  const rows = SIX_GREEN.map(r => (r.leg === 'promise-sweep'
    ? { leg: 'promise-sweep', exit: 0, observed: LONG_OBSERVED } : r))
  const manifest = writeManifest(dir, rows)
  const workflowObj = cleanWorkflow([
    { severity: 'soft', id: 'AC-20260819-01-x', evidence: 'e'.repeat(40) + '-repro-transcript' },
  ])
  const workflow = writeWorkflow(dir, workflowObj)
  return { manifest, workflow, rows, workflowObj }
}

test('AC-20260819-01-1: the review profile with --ledger, --workflow, and --retain <dir> writes <dir>/<runId>.json carrying the derived verdict, dispositions, every manifest leg row with observed untruncated, and the workflow return verbatim', () => {
  const dir = tmpdir('verdict-retain')
  const retainDir = path.join(dir, 'spec-runs')
  const { manifest, workflow, rows, workflowObj } = retentionFixture(dir)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', retainDir,
    '--waived', '1', '--spec', 'specs/20260819/01-review-evidence-retention.md', '--tier', 'critical',
    '--diff-loc', '10', '--iteration', '1'])
  assert.strictEqual(r.status, 0,
    'D1: a fully-dispositioned retained review run must exit 0, not fail merely because --retain is now the ' +
    'required flag: ' + r.stdout + ' / ' + r.stderr)
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  const artifactPath = path.join(retainDir, row.runId + '.json')
  assert.ok(fs.existsSync(artifactPath),
    'D1: a --retain invocation must write <dir>/<runId>.json keyed by the ledger row\'s own runId — no ' +
    'artifact at that path means /spec:escape has nothing to read: ' + artifactPath)
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  assert.strictEqual(artifact.verdict, row.verdict,
    'the artifact\'s verdict must equal the ledger row\'s derived verdict — a mismatch means the two records ' +
    'of the same run disagree about what happened: ' + JSON.stringify(artifact))
  assert.deepStrictEqual(artifact.dispositions, { waived: 1, rejected: 0, fixDispatched: 0 },
    'the artifact must carry a dispositions object reflecting the counts this invocation actually passed: ' +
    JSON.stringify(artifact.dispositions))
  assert.deepStrictEqual(artifact.legs, rows,
    'D1: the artifact\'s legs must mirror the manifest rows exactly, including the untruncated 300-char ' +
    'observed string on the promise-sweep leg — the ledger row\'s 120-char slice is a summary and the ' +
    'artifact is the full-fidelity home retention exists to provide: ' + JSON.stringify(artifact.legs))
  assert.strictEqual(artifact.reviewer.survivors[0].evidence, workflowObj.survivors[0].evidence,
    'the artifact\'s reviewer block must carry the workflow file\'s survivors verbatim, including the ' +
    'evidence string byte-for-byte — a lossy copy here defeats /spec:escape\'s derivation of killedMatch ' +
    'from the retained artifact: ' + JSON.stringify(artifact.reviewer))
})

test('AC-20260819-01-2: the review profile with --ledger and --workflow but no --retain exits 2 naming --retain .claude/spec-runs as the remedy and prints no verdict word', () => {
  const dir = tmpdir('verdict-retain-missing')
  const { manifest, workflow } = retentionFixture(dir)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--waived', '1'])
  assert.strictEqual(r.status, 2,
    'D1: an authoritative review invocation (--ledger + --workflow) with no --retain must exit 2 — the flag ' +
    'is REQUIRED here so a review that forgets retention fails loudly at verdict time instead of succeeding ' +
    'amnesiac: ' + r.stdout + ' / ' + r.stderr)
  assert.match(r.stderr, /--retain \.claude\/spec-runs/,
    'D1: the error must name the exact flag and the canonical remedy path — a vague message leaves the fix ' +
    'undiscoverable, contradicting the host\'s "error messages name the remedy command" rule: ' + r.stderr)
  assert.ok(!VERDICT_WORDS.test((r.stdout.split('\n')[0] || '').trim()),
    'no verdict word may print on the missing---retain usage error — a caller reading stdout without ' +
    'checking the exit code must not see a fabricated verdict: ' + JSON.stringify(r.stdout))
})

test('AC-20260819-01-3: retention names the artifact by the row\'s runId — a passed --run-id verbatim, or the generated rv_ id — and creates the --retain directory when it does not yet exist', () => {
  const dir = tmpdir('verdict-retain-mkdir')
  const { manifest, workflow } = retentionFixture(dir)
  const retainDir = path.join(dir, 'nested', 'spec-runs')
  assert.ok(!fs.existsSync(retainDir),
    'the fixture must not pre-create the --retain directory, or this test cannot prove verdict.js creates ' +
    'it on demand: ' + retainDir)

  const withRunId = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--retain', retainDir, '--waived', '1', '--run-id', 'wf_abc123'])
  assert.strictEqual(withRunId.status, 0,
    'D1/D3: a fully-dispositioned retained run against a not-yet-existing --retain directory must still ' +
    'exit 0: ' + withRunId.stdout + ' / ' + withRunId.stderr)
  assert.ok(fs.existsSync(path.join(retainDir, 'wf_abc123.json')),
    'D1: a passed --run-id must name the artifact <dir>/wf_abc123.json, and the directory must have been ' +
    'created since it did not exist before this run: ' + retainDir)

  const generated = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--retain', retainDir, '--waived', '1'])
  const row = JSON.parse(generated.stdout.trim().split('\n')[1])
  assert.match(row.runId, /^rv_[0-9a-f]{12}$/,
    'without --run-id the row\'s runId must still be the D5-generated rv_ id: ' + JSON.stringify(row))
  assert.ok(fs.existsSync(path.join(retainDir, row.runId + '.json')),
    'D1: the generated-runId case must name the artifact by the row\'s OWN generated runId, equal to the ' +
    'filename actually written — a mismatch breaks the derivable <dir>/<runId>.json path the Contracts ' +
    'block documents: ' + retainDir)
})

test('AC-20260819-01-4: --ledger without --workflow (the hard-stop row) does not require --retain, and when --retain is passed anyway the artifact is written with reviewer null and the manifest legs verbatim', () => {
  const dir = tmpdir('verdict-retain-hardstop')
  const gateRedRows = SIX_GREEN.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 1, observed: 'conclusion=failure' } : r))
  const manifest = writeManifest(dir, gateRedRows)

  const noRetain = runNode(SCRIPT, ['--manifest', manifest, '--ledger'])
  assert.strictEqual(noRetain.stdout.split('\n')[0], 'GATE_RED',
    'the fixture\'s red ci leg must still derive GATE_RED with no --workflow present, establishing this as ' +
    'the Phase 0 hard-stop shape D2 describes: ' + noRetain.stdout + ' / ' + noRetain.stderr)
  assert.strictEqual(noRetain.status, 1,
    'D2: a no-workflow --ledger invocation (the Phase 0 hard-stop row) must exit 1 for GATE_RED, never the 2 ' +
    'a missing-required-flag usage error would produce — requiring --retain here would block the stop-path ' +
    'row 20260813 D3 exists to keep: ' + noRetain.stderr)

  const retainDir = path.join(dir, 'spec-runs')
  const withRetain = runNode(SCRIPT, ['--manifest', manifest, '--ledger', '--retain', retainDir])
  assert.strictEqual(withRetain.status, 1, 'GATE_RED with --retain passed anyway must still exit 1: ' + withRetain.stderr)
  const row = JSON.parse(withRetain.stdout.trim().split('\n')[1])
  const artifactPath = path.join(retainDir, row.runId + '.json')
  assert.ok(fs.existsSync(artifactPath),
    'D2: --retain passed on a no-workflow invocation must still write the artifact — manifest-only legs are ' +
    'worth retaining too: ' + artifactPath)
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  assert.strictEqual(artifact.reviewer, null,
    'D2: with no --workflow file, the artifact\'s reviewer field must be null, never fabricated or omitted ' +
    '— a fabricated reviewer block would misreport a review that never ran: ' + JSON.stringify(artifact))
  assert.deepStrictEqual(artifact.legs, gateRedRows,
    'D2: the manifest legs must still be written verbatim into the artifact even with no reviewer present: ' +
    JSON.stringify(artifact.legs))
})

// Vacuity note (same class as the standing Gotcha for specs/20260817/07's AC-20260817-07-12 /
// specs/20260815/02's AC-20260815-02-7): pre-implementation, verdict.js's arg parser does not
// recognize --retain on ANY profile, so it already exits 2 with a generic "usage: verdict.js…"
// message on this invocation — this AC is vacuously true on current code for the wrong reason
// (unknown-flag rejection, not D3's release-specific "no runId to key an artifact by" rejection).
// AC-20260819-01-2's requiredness-message pin is the companion that actually reddens for the
// --retain parsing mechanism; this assertion is kept unweakened as the correct terminal contract
// (status 2, no artifact) and becomes a genuine pin once D1's --retain parsing exists and D3's
// release branch is reachable behind it.
test('AC-20260819-01-5: --profile release with --retain is a usage error, exit 2, and no artifact is ever written', () => {
  const dir = tmpdir('verdict-retain-release')
  const manifest = writeManifest(dir, RELEASE_SEVEN_LEGS)
  const retainDir = path.join(dir, 'spec-runs')
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger', '--retain', retainDir,
    '--milestone', 'v1.2.3', '--briefs', '12,13'])
  assert.strictEqual(r.status, 2,
    'D3: --retain on the release profile must be a usage error — release rows carry no runId and no ' +
    'reviewer return, so accepting the flag would mint an artifact nothing can ever key or read: ' +
    r.stdout + ' / ' + r.stderr)
  assert.ok(!fs.existsSync(retainDir) || fs.readdirSync(retainDir).length === 0,
    'D3: a rejected --retain on the release profile must never write an artifact — a stray file here would ' +
    'be evidence keyed by a runId the release row never carries: ' + retainDir)
})

test('AC-20260819-01-6: --ledger CONTINUES TO truncate each leg\'s observed at 120 chars in the printed row and carry exactly the seven findings keys — retention adds no new ledger key', () => {
  const dir = tmpdir('verdict-retain-truncate')
  const retainDir = path.join(dir, 'spec-runs')
  const { manifest, workflow } = retentionFixture(dir)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', retainDir,
    '--waived', '1'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  const promiseSweepLeg = row.legs.find(l => l.leg === 'promise-sweep')
  assert.strictEqual(promiseSweepLeg.observed.length, 120,
    'D4: retention must not change the printed ledger row\'s existing 120-char observed slice — a 300-char ' +
    'source observed must still print truncated to 120, with the full string living only in the retained ' +
    'artifact (AC-1): got ' + promiseSweepLeg.observed.length + ' chars')
  assert.strictEqual(Object.keys(row.findings).length, 7,
    'D4: retention adds no new ledger key — row.findings must still carry exactly its seven documented keys ' +
    '(survived/killed/waived/rejected/fixDispatched/reviewerCount/legFindings), never an eighth for the ' +
    'artifact path or retain directory: ' + JSON.stringify(row.findings))
})

test('AC-20260819-01-7: retention CONTINUES TO print exactly the verdict word as stdout line 1 and the ledger row as stdout line 2 with nothing after', () => {
  const dir = tmpdir('verdict-retain-stdout-shape')
  const retainDir = path.join(dir, 'spec-runs')
  const { manifest, workflow } = retentionFixture(dir)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--retain', retainDir,
    '--waived', '1'])
  assert.strictEqual(r.stdout.trim().split('\n').length, 2,
    'D4: a successful retained review invocation must still print exactly two stdout lines (verdict word, ' +
    'ledger row) — a third line (e.g. an artifact-path confirmation) would break every consumer that ' +
    'indexes stdout lines [0]/[1] only (A1: "all 19 --ledger pin sites split and index [0]/[1] only"): ' +
    JSON.stringify(r.stdout))
  assert.match(r.stdout.trim().split('\n')[0], VERDICT_WORDS,
    'line 1 must still be a bare verdict word, never prose or a path: ' + JSON.stringify(r.stdout))
})
