---
date: 2026-08-16
status: done
diff_base: f85d07a  # corrected at build close: a concurrent session committed JJ-20260817-01 between Phase 0's capture (c467bc3) and this build's commit; f85d07a is the true pre-image of this spec's diff
open_markers: 0
risk: T3                 # contract surface consumed by 4 gate scripts, two of them T3-listed sole derivations (spec-status.js, scope-reconcile.js)
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a               # escape-driven defect fix (host-reported, Salon OS 2026-08-17); no roadmap brief warranted
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260816-03-1, AC-20260816-03-2, AC-20260816-03-3, AC-20260816-03-4, AC-20260816-03-6, AC-20260816-03-5]
---

# File Plan parser: table-scoped header binding

## Goal

`parseFilePlanRows` in `spec/scripts/lib/file-plan.js` resolves Action/Layer column indices
section-wide after its walk, so the last header row in the `## File Plan` section wins for
every accumulated row. A second table under a `###` subheading whose header starts with
`Path` (observed in the wild: a "Landed at design stage" status table, 555ventures/salon-os
spec 20260816/02) clobbers the mapping — every row returns `layer: null`, `ac-matrix.js`
finds zero tests-layer rows, and review hard-blocks on false uncovered-ac findings with no
host-side workaround. Done means: header indices are bound per-table by one shared
table-aware walker used by both `parseFilePlan` and `parseFilePlanRows`, return shapes
unchanged, and the two-table repro parses correctly end-to-end through `ac-matrix.js`.
