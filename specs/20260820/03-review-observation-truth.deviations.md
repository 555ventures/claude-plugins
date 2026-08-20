# Deviations — specs/20260820/03-review-observation-truth.md

Forced-but-unblocking departures recorded during build (2026-08-20).

- AC-20260820-03-10 could not be demonstrated red pre-implementation and was not artificially
  reddened. The AC pins the producer→consumer pair on the *parseable* gate-observed branch
  (`skips=N todos=M` → `testsSkipped.total`), which D2's own Contracts block declares
  byte-unchanged ("parseable `skips=N todos=M` rows keep the existing `{total,sanctioned,
  unsanctioned}` object shape unchanged"). It is therefore a green-carrier regression pin in
  substance — the same shape as a `SHALL CONTINUE TO` AC — even though its text is not phrased
  that way. Kept as the correct post-implementation assertion per the standing vacuous-AC
  Gotcha (`.claude/rules/spec-pipeline.md` § Gotchas, the specs/20260819/01 third-occurrence
  entry); its sibling AC-20260820-03-11, which pins the unmatched-pattern branch this spec
  actually changes, did go red and now passes. No contract was weakened and no red was invented.
