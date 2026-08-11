'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260805/02-review-evidence-manifest.md D6/D7: review.md's CLEAN-definition prose
// (the old "CLEAN ⇔ ..." sentence) and its ad hoc verdict assembly are REPLACED by a manifest
// lifecycle (fresh mktemp per iteration, legs re-run each fix-delta pass) feeding verdict.js —
// including on the pre-panel hard-stop path, so a stopped attempt still leaves a GATE_RED
// ledger row. release.md adopts the same derivation under `--profile release`, wired on BOTH
// the fail-fast STOP path and the Phase 4 success path. These are doctrine regex pins over the
// prose; verdict.js's own derivation behavior is pinned in verdict.test.js.

const reviewMd = read('spec/commands/review.md')
const releaseMd = read('spec/commands/release.md')
const scaffoldLedger = read('spec/doctrine/scaffold-ledger.md')

// specs/20260810/07-per-sha-ci-legs.md (2026-08-10, Prax stale-CI-review incident): D2 re-keys
// review.md's ci leg from --branch (a question whose answer can be about any commit) to
// --commit fed by `git -C {root} rev-parse HEAD` (always {root}, never {frozenRoot} — executed
// evidence comes from the tree that ships); D4 grows release.md's required-legs list to seven
// legs including `ci`, RELEASE_LEGS's new authoritative member. These tests pin both doctrine
// edits by regex over the prose.

test('AC-20260805-02-6: review.md builds a fresh per-iteration evidence manifest and re-runs its legs each fix-delta iteration', () => {
  assert.match(reviewMd, /manifestPath/,
    'review.md must name a manifestPath (the per-iteration evidence manifest) — without it there is no ' +
    'file for Phase 0 legs to append their rows into: ' + '(not found)')
  assert.match(reviewMd, /mktemp/,
    'the manifest must be created via a fresh mktemp path, matching patternsPath\'s existing pattern — a ' +
    'reused path is exactly how stale evidence rode a fix-delta CLEAN into production')
  assert.match(reviewMd, /(fresh|new)[\s\S]{0,60}manifest|manifest[\s\S]{0,60}(fresh|new)/i,
    'the doctrine must say the manifest is fresh/new per iteration — never reused across iterations')
  assert.match(reviewMd, /(re-run|rerun|re-execute)[\s\S]{0,200}(gate|smoke|ac-matrix|skip-reconcile|ci)/i,
    'on each fix-delta iteration the orchestrator must RE-RUN gate/smoke/ac-matrix/skip-reconcile/ci into ' +
    'the new manifest (D1) — otherwise a fix-delta CLEAN can ride pre-fix leg rows, the exact hole a refuter demonstrated')
})

test('AC-20260805-02-6: review.md hard-stops before the panel on a red blocking leg and still ledgers the GATE_RED row', () => {
  assert.match(reviewMd, /(hard.?stop|hard stop)[\s\S]{0,300}(before|prior to)[\s\S]{0,60}(panel|wf-review|workflow)/i,
    'a red gate/smoke/ci row must hard-stop BEFORE the wf-review panel is dispatched — panel spend must not ' +
    'be incurred on a red substrate')
  assert.match(reviewMd, /GATE_RED/,
    'the hard-stop path must name GATE_RED — the derived word an evidence-missing workflow file would ' +
    'still reach via verdict.js')
  assert.match(reviewMd, /(stop|stopped)[\s\S]{0,300}(ledger|verdict\.js --ledger|append)/i,
    'the stop path must still run verdict.js --ledger and append its row — a stopped attempt must never be ' +
    'invisible to doctor\'s correlations or the observation derivation (D6)')
})

test('AC-20260805-02-6: review.md prints the verdict word verbatim and gates the Phase 3 close on verdict.js exit 0', () => {
  assert.match(reviewMd, /verdict\.js/,
    'review.md must invoke verdict.js — without it nothing in the doctrine computes the verdict word it prints')
  assert.match(reviewMd, /verbatim/i,
    'the printed word and the appended ledger row must be quoted verbatim from verdict.js\'s output — a ' +
    'model paraphrasing the word reopens the exact "prose, not a derived value" hole this spec closes')
  assert.match(reviewMd, /exit 0[\s\S]{0,150}(gate|gates|require|required)[\s\S]{0,60}(close|Phase 3)/i,
    'the Phase 3 close step must be gated on verdict.js exiting 0 — making the close path mechanically ' +
    'unreachable on any other exit code')
})

test('AC-20260805-02-6: review.md no longer defines CLEAN independently of verdict.js', () => {
  assert.doesNotMatch(reviewMd, /CLEAN ⇔/,
    'the old free-standing "CLEAN ⇔ gateCommand green AND boot smoke leg green AND ... " sentence must be ' +
    'deleted — it was a second, independent assertion of the CLEAN definition, exactly the seam this spec closes')
  // D6: the smoke-leg requirement and the "never write CLEAN on a survived-non-zero row" invariant are
  // updated in place, not deleted — the underlying requirement must still be findable in the new prose.
  assert.match(reviewMd, /boot smoke leg green/i,
    'the smoke-leg requirement (previously pinned inside the retired CLEAN ⇔ sentence) must still be present ' +
    'in the new wording — D6 updates this pin in place, it does not delete the requirement')
  assert.match(reviewMd, /never write `CLEAN` on a row whose\s*\n?`survived` is non-zero/,
    'the "never write CLEAN on a row whose survived is non-zero" invariant must still be present in the new ' +
    'wording — D6 updates this pin in place, it does not delete the requirement')
})

test('AC-20260805-02-7: release.md wires verdict.js --profile release --ledger on both the STOP path and Phase 4', () => {
  const hits = [...releaseMd.matchAll(/verdict\.js --profile release --ledger/g)]
  assert.ok(hits.length >= 2,
    'verdict.js --profile release --ledger must be quoted as the verdict origin on BOTH the fail-fast STOP ' +
    'path and the Phase 4 success path (D7) — found ' + hits.length + ' occurrence(s), so at least one path ' +
    'still has a second, independent verdict origin: ' + '(release.md)')
})

// specs/20260807/03-spec-pipeline-debloat.md D2: the user ruled the release profile stays
// (release.md is a live consumer in every host, and scaffold-ledger's own Verdict-derivation
// row forbids a stage verdict with no script origin), but the never-run profile gets a dated,
// checkable retire trigger instead of silent indefinite retention.
test('AC-20260807-03-3: scaffold-ledger.md\'s "Release stage executed checks" row names a retire condition triggered by zero stage:"release" ledger rows across two consecutive quarters', () => {
  const rowMatch = scaffoldLedger.match(/^\| Release stage executed checks.*\|$/m)
  assert.ok(rowMatch,
    'the "Release stage executed checks" row must still exist in scaffold-ledger.md — D2 amends this row in place, it must not be deleted or renamed: ' + '(not found)')
  const row = rowMatch[0]
  assert.match(row, /two consecutive quarters/i,
    'the row\'s promote/retire condition must name "two consecutive quarters" as the observation window (D2) — without a dated window the retire condition is not checkable, the exact defect this ledger\'s own authoring contract forbids')
  assert.match(row, /zero[\s\S]{0,60}stage:"release"|stage:"release"[\s\S]{0,60}zero/i,
    'the retire condition must name zero stage:"release" ledger rows as the trigger — without it the row does not actually schedule verdict.js\'s release profile\'s expiry, D2\'s whole point')
  assert.match(row, /verdict\.js/,
    'the retire condition must name verdict.js\'s release profile as what gets deleted when the trigger fires (together with its 7 exec pins and release.md\'s wiring, D2) — otherwise the row is a generic reminder, not the specific expiry D2 registers')
})

test('AC-20260805-02-7 / AC-20260810-07-9: release.md names verdict.js\'s required legs, including production AND ci, as one enumerated list', () => {
  assert.match(releaseMd, /required legs?[\s\S]{0,200}deploy[\s\S]{0,60}ready[\s\S]{0,60}e2e[\s\S]{0,60}journeys[\s\S]{0,60}substrate[\s\S]{0,60}production[\s\S]{0,60}(`ci`|\bci\b)/i,
    'release.md must state the release profile\'s required legs (D4/D7) — deploy, ready, e2e, journeys, ' +
    'substrate, production, ci — as one explicit enumerated list with ci appended after production ' +
    '(AC-20260810-07-9: matched as `ci` with backticks or as the standalone word "ci", never a bare 2-char ' +
    '"ci" substring any prose word containing those letters would satisfy); scattered mentions of the same ' +
    'words elsewhere in the doc do not establish that ci is actually a required leg')
})

test('AC-20260810-07-10: review.md\'s ci-leg bullet keys ci-query.js on --commit fed by rev-parse HEAD and never mentions --branch', () => {
  const idx = reviewMd.indexOf('ci-query')
  assert.notStrictEqual(idx, -1,
    'review.md must still reference ci-query.js in its ci-leg bullet — without it there is no invocation to ' +
    'pin at all: (ci-query not found in review.md)')
  const nextBullet = reviewMd.indexOf('\n   - ', idx)
  const bullet = reviewMd.slice(idx, nextBullet === -1 ? idx + 500 : nextBullet)
  assert.match(bullet, /--commit\b/,
    'the ci-leg bullet must invoke ci-query.js with --commit (D2: keyed on the reviewed commit, not the ' +
    'branch) — without it review reverts to asking about "the branch\'s latest run," recreating the Prax ' +
    'stale-CI incident: ' + JSON.stringify(bullet))
  assert.match(bullet, /rev-parse HEAD\b/,
    'the --commit value must be fed by `git -C {root} rev-parse HEAD` (D2: always {root}, never ' +
    '{frozenRoot} — executed evidence comes from the tree that ships) — without it the commit key is not ' +
    'provably the reviewed HEAD: ' + JSON.stringify(bullet))
  assert.doesNotMatch(bullet, /--branch\b/,
    'the ci-leg bullet must not mention --branch anywhere — a leftover --branch invocation would silently ' +
    're-key on the branch\'s latest run again, the exact defect D2 fixes: ' + JSON.stringify(bullet))
})
