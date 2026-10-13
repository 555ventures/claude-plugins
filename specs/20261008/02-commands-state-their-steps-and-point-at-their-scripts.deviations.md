# Deviations — 02-commands-state-their-steps-and-point-at-their-scripts

- init.md spike reference unavailable: the worktree `agent-a8c877fb42f8a1f52` named in the
  spec no longer exists, so the Phase 1 profiling guidance, Phase 1.5 substrate detail, Phase 4
  content-bar paragraphs and Phase 6 justification were deleted from the fate-table text alone;
  Phase 6 keeps its precedence table, brownfield steps and refusals.
- Files were assembled by whole-file rewrite from the original text (deletions and joined
  continuation lines only, no new prose beyond pointer lines and one-line trims such as
  "Printed by `<driver>.js` at each state; never restated here."), not by in-place line deletes;
  a few sentences were trimmed mid-line, which rejoins the wrapped lines.
- Report example `report` code blocks were deleted in run, plan, release, replay, enforce,
  doctor, escape and init (slot names stay in prose); genesis keeps its example because the
  `- Chain:` bullet pin matches a line-initial `- Chain:` that only the example carries.
- genesis.md measures 83 lines by `wc -l` (84 by the test's split-based count) because
  `genesis-doctrine.test.js` counts `split('\n').length`, one more than the newline count.
- escape.md Steps 1, 3, 4 and 6 lost rationale clauses (confession-booth, friction and
  poisoning remarks) beyond strict D1 restatements; the file sits 28 lines under its 215 ceiling.
  Step 6's `doctrine` branch, the three eviction fates and the owner-citation rule are verbatim.
- replay.md Phase 1 steps 1, 4, 5 and 7 lost explanatory sentences (spec-path citations, the
  `--dir` fallback, the one-vs-two-file note for `self-consistent-polarity`); every pin anchor
  (setup-gate sentence, `--overlay {commit}`, `.worktreeinclude`, post-apply reconcile hook and
  failure arm, step 7 newly-red re-key, Phase 3 reconcile-path survivor rule) is intact.
- Measured read-load (own via split count + shared) for the orchestrator's BUDGET update:
  connect 70, doctor 323, enforce 376, escape 284, genesis 235, init 421, mocks 166, plan 228,
  prototype 195, queue 109, release 264, replay 288, run 227, status 115.
