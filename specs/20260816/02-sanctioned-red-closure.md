---
date: 2026-08-16
status: done
diff_base: 097e2c1480be65ed3f507bccc4805245c167b798
open_markers: 0
risk: T3                 # touches verdict.js (sole-derivation surface, host T3 trigger)
area: spec-pipeline
design: false
breaking: false
depends_on: ["specs/20260816/01-gate-baseline-reconcile.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260816-02-1, AC-20260816-02-2, AC-20260816-02-3, AC-20260816-02-4, AC-20260816-02-5, AC-20260816-02-6, AC-20260816-02-7, AC-20260816-02-8]
---

# Sanctioned-red closure — at-risk adjudication, durable qualifier, intake JJ-20260816-03

## Goal

specs/20260816/01 lands the gate/baseline wrapper (`suite-baseline.js --gate`) at the gate
resolution seam. This sibling closes the rest of INTAKE JJ-20260816-03's surface, which 01
(planned before the intake row existed) does not cover: the review `at-risk` leg still
hand-waives sanctioned-red failures per review (paid on 4 of the last 4 full-scope reviews,
4/10 toward the leg's false noise-retirement); a green-by-subtraction gate is invisible in the
durable run ledger (legs rows carry name+exit only — 01's own D8 retire falsifier is
underivable as specced); and § Test Rules still states the falsified "scoped gate runs are
pin-free" premise. Done means: the at-risk leg adjudicates via the same wrapper, a
sanctioned-only green derives `CLEAN-with-qualifier` and records `sanctionedReds` in the
ledger's legs row, the premise is rewritten, and JJ-20260816-03's four pins are green with
their baseline rows removed and the intake row closed.
