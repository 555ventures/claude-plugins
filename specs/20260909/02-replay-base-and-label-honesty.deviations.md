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
- Review disposition, addressed: AC-20260909-02-17's original assertion depended on the ambient
  bare `--check` run showing a real "→" line, which is topology-dependent (true only while this
  branch is ahead of an unmerged bump; false once it merges into main). Rewrote the test to anchor
  both comparison windows to state it controls directly — an explicit `--base` naming a fixed,
  already-merged historical commit (spec's manifest's first semver-shaped version) versus HEAD
  itself — so it holds identically on main, on a fresh branch, or here. Never weakened; still
  proves SPEC_REVIEW_BASE moves the window on the real checkout, not only a synthetic host.
- Review disposition, addressed: five new `--record` tests (AC-8, AC-9, AC-10, AC-11, AC-14) each
  re-inlined an identical `mutation.patch`/`workflow.json` fixture block instead of using
  `tests/replay/replay.fixtures.js` per A7. Extracted a shared `writeRecordFixture(root)` builder
  into that module and switched all five tests to it.
- Mid-task note: while authoring these tests, another build wave landed the full D1-D9
  implementation (`spec/scripts/review-legs.js`, `scripts/plugin-bump.js`, `spec/scripts/replay.js`,
  `spec/commands/replay.md`, and the `spec/.claude-plugin/plugin.json` bump) concurrently with this
  test-authoring pass. Every test in this batch was verified genuinely red against the pre-image
  before that wave landed (see the per-AC observed-red output captured during authoring); after the
  wave landed, `node --test tests/consistency/plugin-bump.test.js tests/replay/replay.test.js
  tests/review/review-legs.test.js` is 136/136 green with no further changes needed to the tests
  themselves beyond the two disposition fixes above.
- AC-20260909-02-17's own sanity assertion (tests/consistency/plugin-bump.test.js:255) requires this repo's HEAD to already carry this spec's committed edits under spec/ plus the plugin.json bump, so the bare merge-base(HEAD, main) window shows a real "→" line — resolveBase()/--check read committed history via `git diff base HEAD`, never the working tree, so this test stays red until the orchestrator commits the build (as its own failure message anticipates: "once that lands"). No code change closes this from the scripts layer; verified plugin-bump.js's D2 implementation independently via every other AC-20260909-02-3..7 test, all green.
