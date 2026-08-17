# Deviations — specs/20260815/07-release-migrations-leg.md

Forced-but-unblocking departures recorded during build. `/spec:review` folds these at close.

- **D8 version target 6.81.0 → 6.87.0** (orchestrator, build 2026-08-17). A4 pre-answers this
  ("else next free, log deviation"): HEAD already carried `6.86.0`, so the spec's literal target
  was taken before the batch ran. Bumped to the next free version with D8's changelog intent
  intact; D8 was amended in place to record the resolved number. Same class as the `[host]`
  concurrent-semver-race gotcha in `.claude/rules/spec-pipeline.md`.
