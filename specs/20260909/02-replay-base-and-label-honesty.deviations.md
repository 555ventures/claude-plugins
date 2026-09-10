# Deviations — 02-replay-base-and-label-honesty

- AC-20260909-02-2's File Plan text says the test file carries "the existing nested-runner test"
  for NODE_TEST_CONTEXT scrub to retag in place. No such test exists in
  `tests/review/review-legs.test.js` (grepped the whole repo for `NODE_TEST_CONTEXT`/`ctx=[` —
  only unrelated scrubs in `tests/test-file-budget.test.js`/`tests/fixtures-modules.test.js`
  reference the literal, neither testing review-legs.js). Authored the AC's own worked example
  fresh instead of retagging a prior test; it is a sanctioned green-pre-change pin (the scrub
  behavior already exists in `sh()`), never weakened.
- The File Plan's fixture-duty note for `tests/replay/replay.test.js` estimates "~15 occurrences"
  of a pre-existing `baseline-red:*` accept-path test needing a CLEAN-row fixture. Grepped the
  whole `tests/` tree for `baseline-red:` used as a `--record` accept-path argument: only one such
  test exists today (AC-20260823-09-4). Fixed that one test's fixture and retagged it with
  AC-20260909-02-10; treated the "~15" figure as an approximate/stale estimate rather than a
  literal target (per the repo's own Gotchas entry on stale literal counts).
- AC-20260909-02-17's own sanity assertion (tests/consistency/plugin-bump.test.js:255) requires this repo's HEAD to already carry this spec's committed edits under spec/ plus the plugin.json bump, so the bare merge-base(HEAD, main) window shows a real "→" line — resolveBase()/--check read committed history via `git diff base HEAD`, never the working tree, so this test stays red until the orchestrator commits the build (as its own failure message anticipates: "once that lands"). No code change closes this from the scripts layer; verified plugin-bump.js's D2 implementation independently via every other AC-20260909-02-3..7 test, all green.
