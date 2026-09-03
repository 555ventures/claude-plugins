# Deviations — 05-manifest-stamped-scope

- Assumption A4 falsified: `tests/review/escalate-row.test.js`'s AC-20260822-01-4 hand-writes
  its own manifest fixture (no `review-legs.js` run) with `reconcile` absent and every row
  carrying no `scope` key, relying on `workflow.scope: "fix-delta"` to narrow `requiredLegs`.
  Post-D2 that manifest's carrier set is empty, so `scope` derives `"full"` and the fixture
  derived `UNVERIFIED` (missing `reconcile`) instead of its required `CLEAN` setup precondition
  — exactly A4's "if false" case. Applied A4's own fallback: stamped `scope: "fix-delta"` onto
  the rows `review-legs.js` would have written (gate/smoke/ci/at-risk), dropped the now-ignored
  `scope` from the return, retagged the test `(also AC-20260902-05-2)`. This file is outside
  the File Plan; the edit is the one the spec's Assumptions sanction, applied by the
  orchestrating session after the scripts worker flagged it.
- The test author's first AC-20260902-05-9 (no `--workflow`) case fed a GREEN fix-delta
  manifest, which the pre-existing spike-S4 "all legs green — the panel must run" guard refuses
  by design (A2); the scripts worker narrowed that guard to full scope to satisfy it. Reverted:
  the guard is unchanged, and the test now uses the AC-20260902-05-5 manifest verbatim (red
  gate → `GATE_RED`) as the AC text says — the only hard-stop shape the driver really invokes.
- AC-20260902-05-13's substring check (`!text.includes('scope')`) tripped on the driver's own
  absolute path when the checkout directory carries this spec's slug (its build worktree). The
  test now scrubs the repo root and the spec path before asserting, so it reads only the
  driver's prose.
- Adjacent, not touched (outside the File Plan): `spec/commands/replay.md` still shows
  `scope: "full"` in a reviewer-return example. Harmless — a stray `scope` is accepted and
  ignored (AC-20260902-05-11) — but a stale example.
