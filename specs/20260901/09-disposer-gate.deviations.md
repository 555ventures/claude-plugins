# Deviations — 09-disposer-gate

- tests/review/disposer-gate.test.js's AC-20260901-09-6 test (the "disposer clause",
  distinct from the AC-20260901-09-6 assertions folded into review-driver.test.js's rewritten
  AC-20260901-02-4 test) does not literally reuse AC-20260901-09-3's own disposer return
  (fixDispatched: 2) to reach the close/escalate row the second half of AC-20260901-09-6 pins.
  AC-3's return routes the run through FIX (marks.pendingFix becomes true whenever any entry's
  final-or-recommended is "fix"), never straight to a close or escalate row within the single
  `--mark dispositions` invocation AC-3 exercises — reaching an escalate row from there would
  require driving two full fix-applied/reviewer-returned cycles to hit FIX_CAP, which tests
  no other property this spec names. The AC-6 test instead builds an equivalent, minimal
  one-survivor pool (waive recommended, overridden to reject by the user, zero fix-dispatched)
  that isolates the exact mechanism the AC's second clause is pinning — one recorded override,
  no fix cycle — and lands CLOSE directly within the one mark, where the checkpoint row is
  asserted. The observable property (checkpoint deep-equal {"outcome":"disposer","overrides":1}
  on the terminal ledger row of a run whose disposer mark recorded one override) is identical;
  only the path to a close-vs-escalate row differs from AC-3's own fixDispatched:2 shape.
- Base corrected at build Phase 0 (orchestrator, 2026-09-01): sibling 20260901/08 merged to
  main after this branch was cut at 1d2be06, so red-check refused the pre-image as impure
  (plugin.json, review.md, spec-review-driver.js already differed from `main`). Fast-forwarded
  the branch to main and pinned `build_base`/`diff_base` to 931c80c4756ce0e1ef36a2050b1577657bd8a54f —
  the true pre-image of this build — per host § Gotchas (moving-ref build_base in a chained
  sibling series). Consequence: D8's version target 7.54.0 is taken by sibling 08; the build
  bumps to 7.55.0 with the same changelog paragraph.
- File Plan widened at build REPAIR round 1 (orchestrator, 2026-09-01): the whole-suite gate
  reddened 12 tests outside this spec's test rows — tests/review/escalate-row.test.js (8),
  tests/review/stopped-row-durability.test.js (1), and two AC-20260820-07-2/-07-8 tests in
  tests/review/review-driver.test.js. Two root causes, both this spec's intended behavior:
  (a) fix-cycle setups call `--mark dispositions --fix-dispatched 1` on a one-survivor pool
  without `--file`, which D2 now refuses; (b) reproducibility re-runs rebuild verdict.js's
  argv from the ledger row and omit the `checkpoint` key D6 now writes on every review row,
  so the re-run row is no longer byte-equal. The spec's Rationale predicted these files stay
  green because they "assert fields, never a full review-row key set" — wrong for (b): the
  reproducibility asserts deep-equal the whole row. Per host § Gotchas (retired-form pins
  outside the File Plan are updated in place and retagged, never weakened, never left red),
  the two out-of-plan files were added to the File Plan as tests rows and the pins updated:
  setups now write a minimal disposer return and pass `--file`; re-runs pass the row's own
  `checkpoint` back as `--checkpoint <outcome>` [`--checkpoint-overrides <n>`]. Not asked of
  the user: the change is reversible, adds no promise, and JJ's 2026-09-01 ruling is fix
  without asking; the widening is surfaced in the build report for veto.
