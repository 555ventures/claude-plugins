# Deviations — 02-tests-have-a-ceiling

- tests/review/promise-sweep.test.js, tests/ac-matrix/ac-matrix.test.js, and
  tests/review/legs-verdict-pair.test.js were left untouched. A8's nine-file inventory named all
  three, but none of them feeds a hand-built, full-required-leg manifest literal directly to
  verdict.js the way the other eight D10 files do: promise-sweep.test.js and ac-matrix.test.js
  exercise their own scripts' single-leg append behavior only (never a 9/10-leg CLEAN/GATE_RED/
  HARD_FINDINGS derivation), and legs-verdict-pair.test.js derives every manifest it feeds to
  verdict.js from a REAL review-legs.js execution against a synthetic host — both scripts evolve
  together in the scripts wave, so its CLEAN/GATE_RED assertions stay correct with no test-layer
  edit. No assertion in any of the three needed a ceiling row added.
- tests/review/review-legs.test.js and tests/review/review-driver.test.js: the File Plan tags
  their rows AC-20260911-02-12 (D10, "green pre-image by design"), but the specific pins named —
  the required-leg presence loops at review-legs.test.js:201 and review-driver.test.js:53 — derive
  their expectation from a REAL execution of review-legs.js against a synthetic host, not a
  hand-built manifest literal. Unlike the SIX_GREEN-style fixtures in the other eight files (where
  verdict.js merely needs to ignore an extra unknown row per A7), these two loops assert that
  review-legs.js itself EMITS a "ceiling" row — new behavior review-legs.js does not implement
  pre-image. Adding "ceiling" to both loops is therefore genuinely RED pre-image (the same class
  as every historical addition of at-risk/promise-sweep/suite to these same two loops), not a
  green-pre-image D10 continuity pin. Both edits are tagged AC-20260911-02-5 (also noting the D10
  citation) and will read green once review-legs.js's wave lands, matching the historical pattern
  those loops already carry in their own accumulated retag comments.
- review-legs.js's `ceiling` leg now shells out to `test-ceiling.js --json` (D8 names
  review-legs.js as an entry point of test-ceiling.js; Rationale: "Both call the one script;
  neither re-derives the count"), replacing a repair-cycle regression that called
  `lib/test-scan.js`'s `countCases()` directly. A fourth row shape follows from the CLI's own
  exit-2 contract (D3: an unreadable/invalid `.claude/test-ceiling.json` is a loud stop, never a
  silent pass) that the D4 Contracts block does not enumerate — only the two-shape green/
  unavailable pair is listed there:
  `{"leg":"ceiling","exit":1,"observed":{"invalid":".claude/test-ceiling.json","detail":"<CLI
  stderr, bounded 120 chars>"}}`. Without this row a malformed ceiling file would read as the
  CLI's own exit-2 usage error surfacing as review-legs.js exit 2 (a hard stop before any manifest
  row), or, if swallowed, as a silent green `no-ceiling-file` row — either way the malformed-file
  case must never derive CLEAN, so it is folded into the leg's own blocking-red space instead.
- spec/entrypoints.json: removed the `spec/scripts/lib/test-scan.js` row a prior worker added per
  a literal reading of D8 ("`lib/test-scan.js` (`test-ceiling.js`)"). The pre-existing inventory
  invariant pinned by tests/consistency/entrypoints.test.js (AC-20260820-04-1: "every executable
  in spec/scripts/*.js|*.sh ... excluding spec/scripts/lib/") wins — `spec/scripts/lib/` files are
  shared modules, not entry-point executables, and own no manifest row regardless of how many
  scripts import them.
- spec/.claude-plugin/plugin.json: D8′ prescribes bumping via
  `plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`, but a prior (pre-amendment)
  worker already ran that bump to 7.142.0 with a changelog paragraph describing the now-retired
  ceiling/hook/gate design. The amendment forbids a double-bump (the version number stays
  7.142.0) and forbids re-describing retired surfaces, but `plugin-bump.js` has no amend mode —
  `--bump` unconditionally increments MINOR and would produce 7.143.0. Reading the script
  (scripts/plugin-bump.js) confirmed no flag rewrites only the changelog text for the current
  version. The changelog string for 7.142.0 was therefore hand-edited in place — version and
  every other field left byte-identical — to describe what actually ships per this spec's
  Amendment/Canonical Delta: one scanner (`lib/test-scan.js`), `test-count.js` reporting the
  count with no red arm, and an advisory `tests` review leg required in `REVIEW_LEGS` but absent
  from every blocking set. Verified after the edit: `node scripts/plugin-bump.js --check` passes
  and the file remains valid JSON. Follow-up: the paragraph originally named `test-count.js` and
  `lib/test-scan.js`; per the Amendment's second paragraph (`node --test`'s default discovery
  matched `**/test-*.js` and executed the CLI as a test file), both scripts were renamed to
  `count-tests.js` and `lib/scan-test-calls.js`. The changelog paragraph was hand-edited again,
  in place, to name the shipped filenames — substance unchanged (one scanner as the single
  definition of a test case, the CLI reporting the count with no red arm, the advisory `tests`
  leg absent from every blocking set). Re-verified: `node scripts/plugin-bump.js --check` passes
  and the file remains valid JSON.
- Amendment landing (2026-09-11, scripts layer): the entries above describe the pre-amendment
  (wider, "ceiling") implementation and are superseded by this bullet, kept for history rather
  than rewritten. Per D1′/D3′/D4′/D8′, `spec/scripts/test-ceiling.js` was renamed (`mv`, no git)
  to `spec/scripts/test-count.js` and its whole `.claude/test-ceiling.json` read/compare/exit-1
  arm was deleted — the file is now exactly the D3′ Contracts block: `--root <r> [--json]`,
  prints `tests: <count> cases` or `{"count":N}`, exit 0 always except exit 2 on a usage error or
  an unreadable root. `review-legs.js`'s `ceiling` leg became `tests`: it now always appends
  `{"leg":"tests","exit":0,"observed":{"count":N}}` (dropping the prior four-shape
  green/unavailable/over/invalid derivation entirely, since there is nothing left to derive from)
  and was removed from `BLOCKING`. `verdict.js`'s `REVIEW_LEGS` gained `tests` in place of
  `ceiling`, and `REVIEW_BLOCKING` no longer contains it. `spec/bin/spec-paths`'s `test-ceiling`
  key and usage-line token were renamed to `test-count`. `spec/entrypoints.json`'s row was
  renamed to `spec/scripts/test-count.js` with its `entryPoints` narrowed to
  `spec/scripts/review-legs.js` only (`spec-build-driver.js` is reverted and no longer calls it,
  per the orchestrator's pre-reversion of the build driver/hooks). This makes the fourth deviation
  bullet above (the invalid-ceiling-file row shape) and the entrypoints.json
  `spec/scripts/lib/test-scan.js`-exclusion bullet above fully moot for the shipped tree — there
  is no ceiling file left to be invalid, and `lib/test-scan.js` still correctly has no row.
  `tests/consistency/*.test.js` and `tests/review/*.test.js` were run for verification only (not
  edited — they belong to the sibling `tests` worker): the consistency suite is fully green
  (137/137), and the three review-suite failures observed
  (`tests/review/escalate-row.test.js`, `tests/review/review-legs.test.js`,
  `tests/review/spec-review-driver.test.js`) are fixture manifests still hard-coding the retired
  `ceiling` leg name — exactly the D10′ file set that worker owns mid-flight, confirmed by
  `review-legs.js`'s own real-execution tests already showing a `tests` row in the emitted
  manifest.
- Repair round 1 (second amendment, forced by the build's final gate): `test-count.js` and
  `lib/test-scan.js` were renamed to `count-tests.js` and `lib/scan-test-calls.js` (plain `mv`,
  no git) per the amended D2/D3′/D4′/D8′ — `node --test`'s default path-less discovery matches
  `**/test-*.js` anywhere under the repo root, so the CLI was itself being discovered and run as
  a test file, its own argv handling exiting non-zero under the runner. Updated: the `require` in
  `count-tests.js`, the quoted-path invocation literal and every prose reference in
  `review-legs.js`, `spec/bin/spec-paths`'s key (`count-tests` → `scripts/count-tests.js`, usage
  line), and `spec/entrypoints.json`'s row (`spec/scripts/count-tests.js`, entry point
  `review-legs.js` only). Both files' headers renamed their self-references and note the naming
  rule (no `test-*`-prefixed executable). `node --test --test-timeout=45000 --test-force-exit`
  with no path argument (the exact default-discovery run that caught the original collision) now
  discovers and executes no `spec/scripts/**` file — 1047/1048 pass; the one failure
  (`tests/consistency/dependency-free.test.js`) reads a hard-coded `spec/scripts/lib/test-scan.js`
  path, a sibling `tests`-worker file outside this layer's File Plan, not touched here.
- `tests` layer worker (D10′ file set + the two new AC files): deleted `tests/ceiling/test-ceiling.test.js`
  and `tests/ceiling/ceiling-gates.test.js`, replaced by `tests/ceiling/test-count.test.js` (AC-1,
  AC-2, AC-4, AC-11 against `test-count.js`, exec-only, no ceiling-file assertions) and
  `tests/ceiling/tests-leg.test.js` (AC-5, AC-6 against `review-legs.js`'s `tests` leg and
  `verdict.js`'s advisory derivation, plus source-shape pins that `BLOCKING`/`REVIEW_BLOCKING`
  never contain `"tests"`). Retagged the D10′ green-row literal from
  `{"leg":"ceiling","exit":0,"observed":{"count":1,"max":900}}` to
  `{"leg":"tests","exit":0,"observed":{"count":1}}` (no `max` key, per the amended Contracts
  block) across the six named files (`verdict.test.js` x2, `verdict-gatered-no-workflow.test.js`
  x2, `provenance.test.js`, `escalate-row.test.js` x2) — every retag confirmed green pre-image by
  the same executed-check discipline the deviations above already used (an unknown extra green
  row is ignored by the pre-image `verdict.js`). Updated the required-leg lists in
  `review-legs.test.js` and `review-driver.test.js` from `ceiling` to `tests`. In
  `red-fixture-coverage.test.js`: renamed `legCeiling`/its `LEG_HANDLERS` entry to `legTests` —
  since the `tests` leg has no red arm by design, its handler proves engagement via an exact
  planted count (3 real cases → `observed.count:3`, exit 0) rather than a planted violation going
  red; deleted `hookBlockCeilingWrites` and its `HOOK_HANDLERS` entry entirely, since
  `block-ceiling-writes.sh` no longer exists and `hooks.json` no longer references it. Full
  `npm test` run: 1048/1048 green, no collateral breakage in any sibling-owned file.
- `tests` layer, repair round 1 (naming collision with `node --test`'s default `test-*` discovery):
  renamed `tests/ceiling/test-count.test.js` → `tests/ceiling/count-tests.test.js` (plain `mv`),
  and updated every reference to `test-count.js`/`test-count`/`test-scan.js`/`lib/test-scan`
  across `tests/ceiling/count-tests.test.js` and `tests/ceiling/tests-leg.test.js` to
  `count-tests.js`/`lib/scan-test-calls.js` (paths under test, `require()` calls, assert
  messages, and test names). Grepped all of `tests/` — no other file I own referenced the old
  names. Full default-discovery run (`node --test --test-timeout=45000 --test-force-exit`, no
  path) confirms neither `spec/scripts/count-tests.js` nor `spec/scripts/lib/scan-test-calls.js`
  is discovered as a test file. Five unrelated failures remain in that full run, none in files I
  own or touched: `tests/consistency/dependency-free.test.js` and
  `tests/consistency/entrypoints.test.js` ENOENT/dangling-key on the old
  `spec/scripts/lib/test-scan.js` / `spec/scripts/test-count.js` / spec-paths key `test-count`
  (the scripts worker's rename mid-flight — git's tracked-file index and `spec/entrypoints.json`/
  `spec/bin/spec-paths` have not caught up yet) and one pre-existing, unmodified
  `tests/release-legs/e2e-unobserved.test.js` failure unrelated to this spec. My own scoped run
  (`tests/ceiling`, `tests/review`, `tests/consistency/red-fixture-coverage.test.js`,
  `tests/provenance`, `tests/verdict-gatered-no-workflow.test.js`) is 297/297 green.
