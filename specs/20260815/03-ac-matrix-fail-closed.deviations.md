# Deviations — specs/20260815/03-ac-matrix-fail-closed.md

Forced-but-unblocking departures taken during build. `/spec:review` folds these into its
findings at close.

- **D6 version target 6.79.0 was stale; landed at 6.82.0.** HEAD already carried 6.81.0 when
  the batch ran (concurrent sessions race the same semver — the version-bump-discipline
  Gotcha in `.claude/rules/spec-pipeline.md`). The doctrine batch bumped to the next free
  number and INTAKE rows JJ-20260815-01/-02 were stamped `fixed@6.82.0` to match. The spec's
  literal number is a target, not a pin.
- **`.claude/suite-baseline.json` updated out-of-plan (2 rows removed).** The two intake pins
  this spec closes were sanctioned-failing baseline rows; Phase 4's pre-image check reported
  `fixedNotRemoved=2` with the `--update` remedy, which by D10's contract rides the landing
  batch. `preNewFailing=0` and `newFailing=0` — nothing else in the suite moved.
- **`spec/commands/review.md` re-wrapped one line after the D4 edit.** The doctrine edit left
  a ~150-char line where the file wraps at ~95; re-wrapped to the file's convention. Line
  count moved by +1, so `spec/doctrine/claims-baseline.json` was re-stamped in the same
  commit (D6's own requirement).
