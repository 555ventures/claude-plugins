'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, runNode, tmpdir } = require('../helpers')

// specs/20260814/03-suite-baseline.md (2026-08-15): the 2026-08-14 escape on
// specs/20260813/10-host-capabilities.md shipped through a green scoped gate and a
// qualified-CLEAN review because the sanctioned-red set was folklore — prose plus a stale
// count — so no reviewer or gate could see a Decision that broke five out-of-scope pins.
// This spec declares the set as `.claude/suite-baseline.json` and wires two consumers: an
// advisory `suite` leg in review.md Phase 0 (D5) and a pre-image-attributed blocking check
// in build.md Phase 4 (D10). Pins AC-20260814-03-9, -10, -11, -12 — the doctrine-prose and
// regression-pin half of the spec; the script itself is pinned in
// tests/suite-baseline/suite-baseline.test.js.

const reviewDoc = read('spec/commands/review.md')
const buildDoc = read('spec/commands/build.md')
const rulesDoc = read('.claude/rules/spec-pipeline.md')

function between(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.ok(start !== -1, `marker "${startMarker}" not found — doctrine section moved or was renamed`)
  const rest = src.slice(start)
  if (!endMarker) return rest
  const endRel = rest.indexOf(endMarker, startMarker.length)
  return endRel === -1 ? rest : rest.slice(0, endRel)
}

// AC-20260814-03-9: review.md Phase 0 step 3 lists the `suite` leg (background, recorded-not-
// required); step 8's findings-producing-legs enumeration gains `suite`; step 8's hard-stop
// trigger list continues to name only gate/smoke/ci (regression half of the same AC).
// specs/20260815/02-at-risk-pins.md D3 (AC-20260815-02-14): review.md step 8's findings-
// producing-legs sentence gains `at-risk` alongside `suite` — the never-a-step-8-pre-panel-stop
// clause stated where review.md declares which legs are non-blocking. Retargeted to the new
// byte-exact list below, never loosened into a partial/optional match.
test('AC-20260814-03-9 / AC-20260815-02-14: review.md Phase 0 gains a background suite leg, step 8\'s findings-producing list gains suite and at-risk, and the hard-stop trigger list continues to name only gate/smoke/ci', () => {
  const step3 = between(reviewDoc, '3. Launch in parallel', '## Phase 1')
  assert.match(step3, /spec-paths suite-baseline/,
    'Phase 0 step 3 must invoke the suite-baseline script via spec-paths — a literal plugin ' +
    'path breaks silently on install per this repo\'s own doctrine conventions')
  assert.match(step3, /leg `suite`/,
    'Phase 0 step 3 must name the manifest leg `suite` — without a named leg the review ' +
    'evidence manifest carries no row for the check and step 8 has nothing to read')
  assert.match(step3, /recorded.{0,20}not required|not a required leg|recorded but not required/i,
    'the suite leg must be documented as recorded-but-not-required (D5\'s advisory design, the ' +
    '`patterns` precedent) — an unqualified leg line reads as a required leg and risks tripping ' +
    'verdict.js\'s requiredLegs check by accident')

  const step8 = between(reviewDoc, '8. **Hard stop', '## Phase 1')
  assert.match(step8, /Findings-producing legs \(`reconcile`, `ac-matrix`, `skip-reconcile`, `suite`, `at-risk`\)/,
    'step 8\'s closing sentence enumerating findings-producing legs must gain `suite` and, per ' +
    'specs/20260815/02-at-risk-pins.md D3, `at-risk` (AC-20260815-02-14) — without both names ' +
    'the legs\' D5/D3-mandated advisory status is undocumented at the one place review.md states ' +
    'which legs never hard-stop; this stays a byte-exact pin, never loosened to a partial match')
  assert.match(step8, /If the `gate`,\s*\n?\s*`smoke`, or `ci` row is red/,
    'the hard-stop trigger list SHALL CONTINUE TO name only gate/smoke/ci — adding `suite` here ' +
    'would make the advisory leg block pre-panel spend, re-committing the exact escape this ' +
    'spec exists to fix (D9: verdict.js untouched, D5: advisory-only)')
})

// AC-20260814-03-10: verdict.js continues to derive the same word with a red `suite` row
// present as without it, and its source continues to exclude `suite` from REVIEW_LEGS and
// REVIEW_BLOCKING (D9: verdict.js is untouched by this spec — the whole safety argument for
// D5's advisory design is that the leg cannot move the verdict word, made mechanical here).
//
// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-9, self-application, CONTINUE TO):
// `at-risk` joins REVIEW_LEGS as a required-but-non-blocking leg (found by Phase 4's pre-image
// check as an in-flight File Plan row) — the six-leg manifests below gain the at-risk row so
// the CLEAN derivation this test pins keeps happening, and the REVIEW_LEGS regex is retargeted
// to the new byte-exact array below. Both changes are additive: the pin's own intent — that
// `suite` stays excluded from REVIEW_LEGS/REVIEW_BLOCKING — is asserted unchanged.
test('AC-20260814-03-10 (CONTINUE TO AC-20260815-02-9): verdict.js continues to derive CLEAN with or without a red suite leg row, and continues to exclude suite from REVIEW_LEGS/REVIEW_BLOCKING', () => {
  const dir = tmpdir('verdict-suite-leg')
  const sixGreen = [
    { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
    { leg: 'smoke', exit: 0, observed: 'pass' },
    { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
    { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0 oracle=0' },
    { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0 sanctioned=0' },
    { leg: 'ci', exit: 0, observed: 'conclusion=success' },
    { leg: 'at-risk', exit: 0, observed: 'files=0' }
  ]
  const withRedSuite = [...sixGreen, { leg: 'suite', exit: 1, observed: 'newFailing=1 fixedNotRemoved=0' }]

  const manifestPath = path.join(dir, 'manifest.jsonl')
  const manifestWithSuitePath = path.join(dir, 'manifest-suite.jsonl')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(manifestPath, sixGreen.map(r => JSON.stringify(r)).join('\n') + '\n')
  fs.writeFileSync(manifestWithSuitePath, withRedSuite.map(r => JSON.stringify(r)).join('\n') + '\n')
  fs.writeFileSync(workflowPath, JSON.stringify({ survivors: [] }))

  const without = runNode('scripts/verdict.js', ['--manifest', manifestPath, '--workflow', workflowPath])
  const withSuite = runNode('scripts/verdict.js', ['--manifest', manifestWithSuitePath, '--workflow', workflowPath])

  assert.strictEqual(without.status, 0, `six-green manifest without a suite row must exit 0: ${without.stderr}`)
  assert.strictEqual(without.stdout.trim(), 'CLEAN', 'six-green manifest without a suite row must derive CLEAN')
  assert.strictEqual(withSuite.status, 0,
    `adding a red suite row must not change verdict.js's exit code — an advisory leg that ` +
    `flips the exit status is blocking in fact, contradicting D5/D9: ${withSuite.stderr}`)
  assert.strictEqual(withSuite.stdout.trim(), 'CLEAN',
    'adding a red (exit:1) suite row to an otherwise six-green manifest must derive the same ' +
    'word, CLEAN — this is D8/D9\'s entire safety argument for entering suite as advisory: a ' +
    'changed word here means the leg silently became blocking')

  const verdictSrc = read('spec/scripts/verdict.js')
  assert.match(verdictSrc, /REVIEW_LEGS = \['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk'\]/,
    'verdict.js\'s REVIEW_LEGS array must continue to exclude `suite` verbatim — this spec adds ' +
    'no review leg to the required/blocking machinery (D9); the array is retargeted to the ' +
    'seven-leg byte-exact form (at-risk joined per specs/20260815/02-at-risk-pins.md D4) so this ' +
    'pin still matches the array it reads, with `suite` still absent from it')
  assert.match(verdictSrc, /REVIEW_BLOCKING = new Set\(\['gate', 'smoke', 'ci'\]\)/,
    'verdict.js\'s REVIEW_BLOCKING set must continue to exclude `suite` verbatim — D5\'s ' +
    'advisory design is impossible to verify if the blocking set ever gains this leg')
})

// AC-20260814-03-11: .claude/rules/spec-pipeline.md § Test Rules names the checked-in
// baseline as the sanctioned-failing-set authority and drops the stale hardcoded count.
test('AC-20260814-03-11: .claude/rules/spec-pipeline.md Test Rules names .claude/suite-baseline.json as the sanctioned-failing-set authority and drops the hardcoded pin count', () => {
  const testRules = between(rulesDoc, '## Test Rules', '## Review Checks')
  assert.match(testRules, /\.claude\/suite-baseline\.json/,
    'Test Rules must point at .claude/suite-baseline.json as the authoritative sanctioned-' +
    'failing set — D7\'s pointer, replacing the tacit prose-plus-stale-count baseline')
  assert.doesNotMatch(testRules, /11 as of 2026-08-01/,
    'the stale parenthetical count "(11 as of 2026-08-01)" must be deleted per D7 — a lying ' +
    'number is the tacit baseline made visible, and the artifact now replaces it')
})

// AC-20260814-03-12: build.md names the Phase 0 pre-image snapshot at the diff_base write
// (never on resume), the exactly-once Phase 4 --pre check after the gate is green, the
// four-way disposition literally, and Phase 0 step 3's gate resolution continues to carry no
// suite-baseline invocation (D9's surviving fence: the inner scoped-gate loop stays scoped).
test('AC-20260814-03-12: build.md states the Phase 0 pre-image snapshot, the exactly-once Phase 4 --pre check, the four-way disposition, and step 3\'s gate resolution stays free of suite-baseline', () => {
  const diffBaseWrite = between(buildDoc, 'write `diff_base:', '## Phase 1')
  assert.match(diffBaseWrite, /--snapshot/,
    'the diff_base-writing step must capture the pre-image via --snapshot — without it Phase ' +
    '4 has nothing to attribute this build\'s own breakage against')
  assert.match(diffBaseWrite, /\.claude\/spec-preimage\/\{specid\}\.json/,
    'the snapshot\'s --out path must be the literal .claude/spec-preimage/{specid}.json ' +
    'template — a different path silently breaks Phase 4\'s --pre lookup')
  assert.match(diffBaseWrite, /resume.{0,40}never re-snapshot|never re-snapshots|resumed build (never )?re-?snapshot/i,
    'build.md must state that a resumed build never re-snapshots — re-snapshotting mid-build ' +
    'would absorb this build\'s own red TDD tests into the pre-image and mask them at Phase 4')

  const phase4 = between(buildDoc, '## Phase 4', '## Phase 5')
  assert.match(phase4, /--check.*--pre|--pre.*--check/,
    'Phase 4 must invoke suite-baseline --check with --pre against the Phase 0 pre-image')
  assert.match(phase4, /exactly once/,
    'Phase 4\'s --pre check must run exactly once — the D9 fence keeps it out of the inner ' +
    'repair loops entirely, never a per-round re-check')
  assert.match(phase4, /preNewFailing/,
    'Phase 4 must name preNewFailing — the attribution axis that lets the check block only ' +
    'this build\'s own diff (D10)')
  assert.match(phase4, /BLOCK/,
    'a positive preNewFailing must BLOCK into the repair path — the whole point of D10\'s ' +
    'blocking consumer')
  assert.match(phase4, /pre-existing at Phase 0/,
    'newFailing with preNewFailing zero must WARN with the literal phrase "pre-existing at ' +
    'Phase 0" — arrived-broken drift must never enter the repair path (D10\'s attribution split)')
  assert.match(phase4, /fixedNotRemoved/,
    'Phase 4 must name fixedNotRemoved and its --update warn path (baseline hygiene, D10)')
  assert.match(phase4, /fallback/i,
    'exit 4 or a missing pre-image must WARN and fall back to blocking on baseline ' +
    'newFailing — never a fresh mid-build snapshot')
  // JJ-20260815-06 (review 2026-08-15 of specs/20260814/03): the fallback bullet said a
  // missing pre-image "warns and falls back" while its own last sentence routed exit 2 to
  // escalate — and suite-baseline.js exits 2, not 4, on an absent --pre path (AC-…-17 pins
  // that deliberately: the script must never silently degrade to a baseline-only compare).
  // Two contradictory prescriptions for one observable. The caller, not the script, owns the
  // fallback, so build.md must say to drop the flag.
  assert.match(phase4, /no `--pre` flag at all|without `--pre`|with no `--pre`/i,
    'build.md must state the missing-pre-image fallback as re-invoking --check with NO --pre ' +
    'flag — the script exits 2 on an absent --pre path, so doctrine that promises a fallback ' +
    'while also routing exit 2 to escalate leaves the orchestrator with two contradictory ' +
    'prescriptions for the same observable and it will pick one at random per session')

  const step3 = between(buildDoc, '3. **Resolve the gate.**', '4. Flip')
  assert.doesNotMatch(step3, /suite-baseline/,
    'Phase 0 step 3\'s gate resolution SHALL CONTINUE TO carry no suite-baseline invocation — ' +
    'D9\'s fence keeps the pre-image check out of the inner scoped-gate resolution entirely; a ' +
    'mention here means the check leaked into the loop this spec\'s Rationale explicitly guards')
})
