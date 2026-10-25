# Deviations — 03-critical-tier-enforces-its-own-rules

- AC 2 fixture: verdict.js cannot print HARD_FINDINGS from a manifest holding only the skip-reconcile rows plus a gate row (missing required legs derive UNVERIFIED; without --workflow a non-UNVERIFIED word exits 2). The test appends the other required legs green/inert and passes a clean --workflow plus --retain; the asserted verdict and testsSkipped are unchanged (tests/ac-matrix/critical-tier.test.js).
- AC 6 and AC 4 are green on the pre-image (absence/continue-to pins), AC 6 included, since the missing-literal arm does not exist yet.
