# Deviations — 02-session-tokens-on-ledger-rows

- AC-7's test observes the close row's `sessionTokens` last key (the effect of the argv) rather than
  the verdict.js argv itself: the review driver spawns verdict.js by absolute `process.execPath`
  path with no env override, so no test seam captures the argv without a scripts change outside
  the File Plan. The row observation is strictly end-to-end and exercises the same `viaModelArgs`
  path; the second clause (sidecar without `tokensAtStart` → `null`) is kept.
- spec-review-driver.js: after `row.tests = testsRow` the close path re-appends `sessionTokens` so it stays the LAST key (the driver adds `gotchas`/`tests` to verdict.js's line after the fact; Contracts pins sessionTokens last). Additional `usageDelta` helper exported from lib/session-stamp.js (shared by build and review drivers, same null rules as D2/D4).
