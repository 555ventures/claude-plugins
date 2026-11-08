---
date: 2026-08-05
status: done
open_markers: 0
risk: T3
area: review
design: false
breaking: false
depends_on: [01-review-scope-reconciliation.md]
depended_on_by: [03-done-unobserved-observation.md]
brief: n/a
spiked: 2026-08-05
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260805-02-1, AC-20260805-02-2, AC-20260805-02-3, AC-20260805-02-4, AC-20260805-02-5, AC-20260805-02-6, AC-20260805-02-7, AC-20260805-02-8, AC-20260805-02-9, AC-20260805-02-10]
---

# Evidence manifest — the review verdict is derived, never asserted

## Goal

Today `/spec:review` can say CLEAN with nothing executed: a zero-findings panel returns
CLEAN from the workflow, and the CLEAN definition (review.md:153-156) is prose a model
applies, not a value a script computes. This spec makes every verdict a **derived value**:
Phase 0 legs append machine-readable rows to a per-iteration evidence manifest, a new
`verdict.js` derives the verdict word from manifest + workflow return + dispositions, and
the command may only print/ledger the word the script emitted. CLEAN-with-an-empty-manifest
becomes unrepresentable, and so does CLEAN-on-stale-evidence (each fix iteration re-executes
its legs into a fresh manifest). CI status becomes one manifest row backed by a shared
`ci-query.js` (red = hard stop, unavailable = note, never block). `/spec:release` adopts the
same derivation under a release profile. Done means: no path exists on which the verdict
word originates in model prose or in evidence older than the code it judges.
