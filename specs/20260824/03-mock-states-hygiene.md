---
date: 2026-08-24
diff_base: 5670f33863eda2f9d33c2433b4377c2f9eb8750b
status: done
tier: standard           # additive checks in design-atlas.js (not a critical-named surface), sketch.md prose, one doctrine paragraph
area: design-stage
design: false
breaking: false
depends_on: [specs/20260824/02-design-stage-on-render-gate.md]
depended_on_by: [specs/20260824/04-render-rules.md]
brief: 08
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260824-03-1, AC-20260824-03-2, AC-20260824-03-3, AC-20260824-03-4, AC-20260824-03-5, AC-20260824-03-6]
---

# Mock states, hygiene, and the sketch-exit matrix

## Goal

Make mocks render-gate-ready at the moment they are ratified: the harness check gains the
hygiene rules each measured false-positive class needs (`border-box` reset, declared
line-heights, no device frame, state controls outside the contract), states and non-contract
regions are declared in the mock with the vocabulary the gate reads, and the matrix expansion
moves to `/spec:sketch`'s exit so **ratified = approved, one stamp**. Done means: a mock that
passes `design-atlas.js check` at `ratified` carries nothing the gate would misread as a
component defect.
