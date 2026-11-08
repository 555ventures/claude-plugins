---
date: 2026-08-30
status: done
diff_base: 0a7f8efb359ef71b09543369f67ebd0046602b47
tier: standard
area: review-close
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260830/03-ci-leg-honest-absence.md"]
# brief: n/a — ad-hoc hardening from a salon-os host escape report (2026-08-30)
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260830-02-1, AC-20260830-02-2, AC-20260830-02-3, AC-20260830-02-4, AC-20260830-02-5]
---

# Close-time gate re-run — post-gate-written files stop escaping enforcement

## Goal

`/spec:review`'s CLOSE phase writes the canonical doc and folds Gotchas into the host's
rules file **after** the gate leg already ran over the diff, then commits — so the exact
files the pipeline itself writes bypass the host's deterministic rule enforcement (two
escapes recorded in salon-os, 2026-08-30). Done means: `--mark closed` re-runs the host's
resolved `gateCommand` over the committed close tree and refuses the mark while it is red,
so no review can close with the gate broken by its own close writes.
