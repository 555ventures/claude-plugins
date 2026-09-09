# Deviations — 03-test-fixture-dedupe

- tests/ac-matrix/ac-matrix.fixtures.js: `findings(res)` is lifted byte-identical from the two
  owning files (returns the whole parsed `{findings, warnings, observed}` object, as every one
  of the 13 existing call sites in owning-spec-env.test.js/qualified-skip-mapping.test.js relies
  on via `out.findings`/`out.warnings`/`out.observed`); the spec's Contracts line `findings(res):
  object[]` was a mis-transcription of that byte-identical shape, not a design change (the array
  promise lands on `.findings`, not on `findings()`'s own return). Flagged this instead of
  rewriting 13 assertions to satisfy a literal `Array.isArray` reading (D6 forbids assertion
  changes); tests/fixtures-modules.test.js's AC-20260908-03-4 was subsequently corrected
  elsewhere to assert on `parsed.findings` instead, and now passes. `node --test
  'tests/ac-matrix/**/*.test.js'` is 54/54 green; `node --test tests/fixtures-modules.test.js`
  is 5/5 green.
- tests/fixtures-modules.test.js's AC-20260908-03-6 (D5 "registers zero tests") spawns
  `node --test <fixtures-file>` via `spawnSync` with no `env` override, inheriting the CURRENT
  process's environment. When fixtures-modules.test.js itself runs under `node --test` (its own
  invocation, or as part of the `tests/**/*.test.js` glob `npm test` uses), Node has already set
  `NODE_TEST_CONTEXT=child-v8`/`NODE_TEST_WORKER_ID` on that process; the inherited grandchild
  then prints "node:test run() is being called recursively within a test file. skipping running
  files." instead of the real TAP subtest line, for EVERY fixtures module regardless of content
  — verified empirically both for tests/review/review-legs.fixtures.js (this batch's file, zero
  test() calls, passes cleanly at `node --test tests/review/review-legs.fixtures.js` in isolation)
  and for the pre-existing tests/genesis/tournament.fixtures.js under the same
  `NODE_TEST_CONTEXT=child-v8` env forced manually. This is an environment-inheritance bug in the
  guard test's own spawnSync call (needs `env: {...process.env, NODE_TEST_CONTEXT: undefined}` or
  similar), not a defect in any fixtures module's shape; tests/fixtures-modules.test.js is out of
  this batch's scope to edit.
- tests/genesis/tournament.fixtures.js exceeded its size ceiling once it absorbed the five
  `writeBrief` copies' parameterization (11447 > 10688). Raised via the ratchet's own sanctioned
  route, `node scripts/size-ratchet.js --root . --raise tests/genesis/tournament.fixtures.js
  --to 11447 --cite specs/20260908/03-test-fixture-dedupe.md`, rather than shrinking the shared
  module back toward the duplication this spec exists to remove.
- D2 says brief-state.test.js / genesis-driver.test.js "drop" their local `writeBriefWithSections`
  and `writeVisualBrief`. Both survive as thin wrappers that build an `extraSections` string and
  delegate to the shared `writeBrief`, because each has a bespoke parameter shape
  (`{archetype, journeysBody, nonUiBody, extraPicks}` / the `briefJourneysSectionFor` +
  `briefNonUiSectionFor` pair) used only by its own file. Dropping them outright would have
  required rewriting their call sites' arguments, which D6 forbids. The duplicated template body
  — the part this spec targets — is gone from both.
- tests/ac-matrix/ac-matrix.fixtures.js's `baseHost` is the one non-byte-identical lift: it
  returns `{specPath, root, manifestPath}` (and writes an empty manifest) where both originals
  returned a bare spec-path string. The spec's own Contracts block specifies that shape, so this
  is the spec's instruction rather than worker invention; the 10 call sites adapted by
  destructuring, with no assertion changed.
- tests/fixtures-modules.test.js needed two orchestrator repairs after its authoring dispatch,
  both bugs in the guard test itself rather than in any fixtures module: (1) its AC-6 child run
  inherited `NODE_TEST_CONTEXT`, so under `node --test` Node refused to recurse and the check
  reported on its own recursion guard for every module — fixed by stripping the variable from the
  child env; (2) its AC-4 run omitted `--json`, so `findings` could not parse stdout — fixed by
  passing `--json` the way all 13 existing call sites do.
- D7's ordering produces a FALSE baseline, and the "all tight" line this log first recorded was
  that false green. `size-ratchet.js` inventories the tracked-file list, so the four files this
  spec CREATES (three fixtures modules + the guard test, 17,596 bytes) were invisible to the
  `--update` D7 schedules "after the last worker returns, before the final gate" — they were not
  staged yet. The recorded `tests` tree total came out 17,596 bytes too low and the ratchet
  reported the tree tight when it was not. The build gate did not catch it either, because
  `gateCommand` is `{testDirs}`-scoped and the live ratchet check lives in `tests/consistency/`,
  outside the changed directories. Review's full-suite leg caught it (tree-over by 17,465 after
  a later 131-byte edit). A `--update` scheduled before the CREATE rows are tracked can only
  ever record a too-low tree ceiling — for any spec with a CREATE row, not just this one.
- The spec's Goal says "the size baseline records the shrink". It records a GROWTH. Measured
  against this spec's own `diff_base` (1aa5915, `tests` = 3,440,148), the final tree is
  3,448,737: net +8,589 bytes. Decomposed: the ten consumer files shrank 9,766; the three new
  fixtures modules cost 7,108; tournament.fixtures.js grew 759; the guard test
  tests/fixtures-modules.test.js, which the spec's own AC-2..-7 require, costs 10,488. The
  extraction alone is therefore a real but modest shrink (-1,899 bytes); the guard test is the
  whole of the growth. Recorded as a cited tree raise to 3,448,737 (user ruled at review time,
  with a second opinion confirming the raise is unavoidable — a full trim of the guard test's
  comments wins only ~3,000 bytes and still lands over the old ceiling).
- D1's File Plan row for tests/review/review-legs.test.js reads "four `makeHost*` + `SPEC_BODY`
  -> fixtures calls", and A1 cites four copy sites in that file including pre-image lines
  610-629. The build left two of them behind: `SPEC_BODY` stayed a hand literal byte-identical
  to `reviewLegsSpecBody()`'s defaults, and `makeSuiteCountHost` (pre-image 610-629) stayed a
  fifth full copy of the skeleton differing only in config. Both were converted at review time,
  recovering 923 bytes; tests/review/*.test.js is 239/239 green and all 21 test names in the
  file are byte-identical to the pre-image. The remaining local builders
  (`makeSuiteBlindSpotHost`, `makeAtRiskHost`, `makeVerdictCapableAtRiskHost`, and the
  smoke-wave / at-risk-argv pair) genuinely need a file committed in the BASE commit, which the
  shared builder's `extraFiles` writes only into the implement commit — correctly kept under A1.
  Three of them share that exact need, so a `baseFiles` parameter would clear A1's "never a
  parameter nobody else uses" bar and win roughly 1.7 KB more; that changes D1's published
  contract, so it belongs to a follow-up rather than this spec.

## D10 red evidence — the pre-extraction run, transcribed

`specs/20260908/03-test-fixture-dedupe.build/` is gitignored, so the live log D10 names does not
survive the merge. The run is transcribed here, in a committed file, so D10's claim stays
falsifiable afterwards.

Command, executed in the spec worktree with `tests/fixtures-modules.test.js` authored and NO
fixtures module created or modified (the untouched pre-image):

    node --test tests/fixtures-modules.test.js

Result: `tests 5 · pass 0 · fail 5 · skipped 0`. Every one of the five failed:

    ✖ AC-20260908-03-2: makeReviewLegsHost writes extraFiles only into the HEAD commit, leaving
      the base commit without them, alongside the shared src/foo.js and spec skeleton
    ✖ AC-20260908-03-3: writeBrief writes extraSections before ## Picks, and keeps writing
      today's template with no ## Journeys section when extraSections is omitted
    ✖ AC-20260908-03-4: baseHost(tmpdir()) returns a spec file that exists and a manifest
      run(...) can read, with findings(...) yielding an array
    ✖ AC-20260908-03-5: setupOverlayHost returns two distinct commit shas whose close sha's
      git show --name-only lists exactly the closeFiles keys
    ✖ AC-20260908-03-6: none of the four fixtures modules register a test() when node --test
      loads them directly, and none is named *.test.js so the suite glob never executes them

Failure causes at that point: review-legs.fixtures.js, ac-matrix.fixtures.js and
replay.fixtures.js did not exist (AC-2, -4, -5); `writeBrief` had no `extraSections` parameter,
so the assertion failed on content rather than on a missing module (AC-3); AC-6 asserts every
one of the four modules exists before checking its test registrations, and three did not.

Two of these test names differ from their final form: AC-3 was later split into AC-3 and AC-7
(D9), and AC-4's wording was corrected to the real `findings` return shape (D8). Both edits
came after this run and neither weakened an assertion.

## Review-finding pass (three `fix`-dispositioned findings)

- Fix 1 (commitFiles dedupe) and Fix 3 (header rewrites) applied cleanly. Fix 2 (`label:
  'brief-state.test.js'` added to the four `writeBrief` call sites at brief-state.test.js:597,
  714, 730, 836) grew `tests/genesis/brief-state.test.js` from 61798 to 61918 bytes, which
  `node scripts/size-ratchet.js --root .` now reports as `over` (61918 > 61798) rather than
  `stale`. An `over` finding blocks `--update` outright (it refuses to write while any tracked
  path is over its ceiling) and this worker's contract forbids raising a ceiling on its own
  judgment. Left unresolved for the orchestrator: either cite this spec (or the finding pass)
  in `node scripts/size-ratchet.js --root . --raise tests/genesis/brief-state.test.js --to
  61918 --cite specs/20260908/03-test-fixture-dedupe.md`, then run `--update` for the five
  now-stale paths it also reported (`tournament.fixtures.js`, `replay.fixtures.js`,
  `replay.test.js`, `review-legs.fixtures.js`, and the `tests` tree total).
- The review-finding pass's `label:` additions pushed tests/genesis/brief-state.test.js 120 bytes
  over the ceiling THIS spec's own earlier `--update` had set (61,798). That ceiling was
  over-tight: the pre-spec ceiling at diff_base 1aa5915 was 62,262, and the file's final size is
  61,918 — 344 bytes BELOW where it started. The cited raise to 61,918 therefore restores
  headroom this spec created and then partially spent; it loosens nothing relative to the
  pre-image. Recorded rather than left implicit because a raise row reads as a loosening unless
  the pre-image number sits beside it. Whole-tree ratchet: 259 files, 4 trees, all tight.
