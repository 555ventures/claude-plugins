# Deviations — 02-close-gate-rerun (tests layer)

- AC-20260830-02-5's File Plan row named `tests/spec-paths.test.js` as the version/changelog
  pin, conditional on "only if the pin actually lives here." Verified by grep: it does not —
  `tests/spec-paths.test.js` never reads `plugin.json`. The honest oracle is
  `tests/consistency/plugin-version.test.js` (semver-shape, monotonic-bump-past-a-floor, and
  changelog-run-shape pins, all generic — none of them name this spec or its 7.39.0 target).
  No edit was made there either: the AC's own text says the existing tests are the oracle and a
  new duplicate pin would be a second derivation, and the existing generic assertions already
  validate whatever version/changelog paragraph the build worker writes with zero spec-specific
  changes needed. `spec/.claude-plugin/plugin.json` is already at 7.41.0 at test-authoring time
  (2026-08-30, concurrent-session semver race per this repo's own Gotcha on D6's literal target),
  confirming the existing floor-based pin (> 7.11.0) needs no adjustment for this spec either.

- The File Plan assigned `tests/review/deviations-backstop.test.js`,
  `tests/review/merge-reentry.test.js`, and `tests/review/stopped-row-durability.test.js` as
  fixture-repair rows: give every synthetic host reaching `--mark closed` a green `gateCommand`
  so the new close-time gate re-run (D1) does not redden them. Verified by reading every host
  builder in all three files: each one already sets `gateCommand: 'node --test {testDirs}'`
  with a matching File Plan test row (`tests/foo.test.js`) whose `src/foo.js` genuinely returns
  42 for every fixture that actually invokes `--mark closed` (fixtures using `gateFails: true`
  stop at STOPPED, before REVIEWER, and never reach `--mark closed` at all). This command must
  already exit 0 to reach REVIEWER via review-legs.js's own gate leg in the first place, and the
  tree is unchanged between that leg run and the close-mark invocation in every case (only the
  spec file's own status flip and, in two files, an unrelated seeded ledger/dirty-root file are
  touched) — so the same command re-run at close is a deterministic re-run against an unchanged
  tree and must still exit 0. No edit was made to any of the three files. Confirmed empirically:
  ran `npm test` after the review-driver.test.js/review-legs.test.js edits below — all pre-
  existing tests in these three files (and the whole suite) stayed green; only the two new
  AC-20260830-02-1/-4 tests are red, as required for a red-phase TDD change with no
  implementation yet written.

- D6 named 7.39.0 as the version-bump target for `spec/.claude-plugin/plugin.json`. Stale by
  build time — observed HEAD already at 7.41.0 (concurrent-session semver race, this repo's
  own `[host]` Gotcha: "the spec's literal number is a target, not a pin"). Bumped to the next
  free version, 7.42.0, with the changelog paragraph naming this spec and dropping the oldest
  (7.40.2) so the run stays at exactly three (7.42.0, 7.41.0, 7.40.3).
