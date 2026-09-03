# Deviations — 08-genesis-shrink-brief-state

- D13's literal version target (7.62.0) was already taken by spec 07
  (specs/20260902/07-mocks-command-driver.md); bumped to the next free minor, 7.63.0, per
  rules § Gotchas' stale-version-target class. Recorded in the changelog's own deviation line
  (spec/.claude-plugin/plugin.json description).
- AC-20260902-08-12's repo-wide sweep bans `design-pick.json` as a literal in
  spec/scripts/genesis-driver.js with no waiver, so `--legacy`'s Dissents check
  (handleBriefWritten) drops the design-pick.json-backed per-candidate naming fallback
  entirely: under `--legacy` the check is D4's non-empty `## Dissents` only, per D6 ("explore/
  design artifacts accepted in place of a mocks set") and D4's own rationale ("the pick record
  is the mocks status now, not design-pick.json") — there is no pick record left for a legacy
  run to name candidates from. `designPickPath`, `readDesignPick`, and `candidateKebab` are
  deleted. Applied from the spec text directly (no fork).
