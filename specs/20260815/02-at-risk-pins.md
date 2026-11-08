---
date: 2026-08-15
status: done
diff_base: e3ebaa871c799cbf95d51f2f7287d32264edfae3
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260815/03-ac-matrix-fail-closed.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-02-1, AC-20260815-02-2, AC-20260815-02-3, AC-20260815-02-4, AC-20260815-02-5, AC-20260815-02-6, AC-20260815-02-7, AC-20260815-02-8, AC-20260815-02-9, AC-20260815-02-10, AC-20260815-02-11, AC-20260815-02-12, AC-20260815-02-14, AC-20260815-02-13, AC-20260815-02-15]
---

# At-risk pins — the scoped gate's compensating derivation

## Goal

A Decision that changes what a shared script returns reddens the suites that pinned the old
behavior — and because every gate is scoped to the spec's own File Plan test rows, neither the
build gate nor the review panel ever executes them (escape `wf_e1da0ea6-94c`: five pins, two
files, zero signal, found by hand 12 minutes after a CLEAN-with-qualifier; INTAKE
JJ-20260815-03). Scoping stays — it is deliberate and load-bearing (red-pin baseline, host
rules § Test Rules) — but it gains the compensating derivation it always owed: review
mechanically derives which test files elsewhere reference the changed source files, **runs
them**, and turns failures into ordinary review findings the session adjudicates
(JJ 2026-08-15 ruling: run, never list-only, never a pre-panel stop). Done = the derivation is
in `scope-reconcile.js` behind executable pins, review carries the `at-risk` leg as a required
full-scope manifest row, `tests/scoped-gate-behavior-collision.test.js` runs green, and
JJ-20260815-03 is stamped fixed.
