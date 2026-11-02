# Deviations — 11-a-direction-flip-leaves-a-row
- AC-20261101-11-10 (tests/review/merge-supersession-rows.test.js) is a negative pin (no row, no supersession line) and passes on the pre-image; AC-9 in the same file is the red counterpart. AC-8 is red today only via the validator rejecting via:"review" (drift census inShape 1), not byClass.
- AC-20261101-11-9's test pinned `sha` to the final HEAD, which conflicted with D4's "append as finishMerge's first action".
  The orchestrator kept D4 verbatim (append before evidence promotion, so the row lands inside the ledger commit and `sha` is the squash commit)
  and tightened the test to the commit that deleted the file plus a clean-ledger assertion.
- The `--merge` rows omit `stage` (AC-5 deepStrictEqual shape); the driver adds `stage:"escape"` when appending.
- `--by` for `--merge` is the spec path relative to the build worktree, not `specRel` (which carries `.claude/worktrees/...`).
