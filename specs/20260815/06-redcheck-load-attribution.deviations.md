# Deviations — specs/20260815/06-redcheck-load-attribution.md

- **D8 version target 6.80.0 → 6.85.0** (A5 escape, orchestrator ruling at build 2026-08-17).
  HEAD already carried `spec@6.84.0`, so the spec's literal target was taken by a concurrent
  session. Bumped to the next free version per the host's version-bump-discipline gotcha; the
  changelog paragraph is unchanged in substance. D8 records the same ruling in the spec.
