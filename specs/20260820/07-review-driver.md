---
date: 2026-08-20
status: done
diff_base: 730a2bc2725f5bc1485cac4fc13c41be21856374
open_markers: 0
tier: critical
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260820/06-typed-evidence-manifest.md"]
depended_on_by: []
brief: 16
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-07-1, AC-20260820-07-2, AC-20260820-07-3, AC-20260820-07-4, AC-20260820-07-5, AC-20260820-07-6, AC-20260820-07-7, AC-20260820-07-8, AC-20260820-07-9, AC-20260820-07-10, AC-20260820-07-11, AC-20260820-07-12, AC-20260820-07-13, AC-20260820-07-14, AC-20260820-07-15, AC-20260820-07-16]
---

# Review Driver — the review stage becomes a stepped program; review.md becomes the judgment shell

## Goal

The review stage gets what design already has: one deterministic driver
(`spec-review-driver.js`, the `spec-design-driver.js` pattern) that owns the stage's
sequencing — legs, all three verdict passes, ledger appends, the status flip, the
merge-back sequence — executing every subprocess-able step itself and printing exactly one
step at a time for the judgments only a session can make (reviewer dispatch, finding
dispositions, canonical-delta application, merge strategy). Today the session hand-performs
~14 choreography steps from prose around `review-legs.js`; procedural hallucination —
skipping or fabricating a required step while reporting success — is the measured largest
agent-failure class (38.5%, agenticrail.nz 2026-08-08), and a driver-owned sequence
structurally eliminates it rather than auditing for it. Done means: no review step can be
silently skipped (the driver refuses to advance past unverified artifacts), `review.md`
shrinks to a thin shell — invoke the driver, host the judgment conversations — and the
judgment points stay first-class: the driver names which judgment is due and hands over the
evidence paths, never the answer.
