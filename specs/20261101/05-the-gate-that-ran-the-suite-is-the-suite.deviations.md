# Deviations — 05-the-gate-that-ran-the-suite-is-the-suite

- tests/review/review-legs-gate-reuse.test.js: the stub-gate counter is written to an absolute
  path in a separate tmpdir() instead of `<host>/counter` — a counter inside the fixture repo is
  an untracked file and would reconcile as out-of-plan. The counted invariant is unchanged.
- spec/.claude-plugin/plugin.json: the existing description carried a doubled "7.295.0 — 7.295.0 — " prefix that made plugin-bump refuse (4 changelog entries); collapsed it to one prefix before running --bump.
- spec/scripts/review-legs.js: the `skip-reconcile` timings.json entry is always `0` and `ac-matrix`
  carries the whole ac-matrix.js spawn's wall-clock, because ac-matrix.js appends both rows from one
  process and review-legs cannot split them; `promise-sweep` gets its own spawn time.
