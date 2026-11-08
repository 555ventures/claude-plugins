---
date: 2026-09-08
status: done
build_base: main
tier: critical
area: release-evidence
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-08
open_markers: 0
diff_base: bace2b7b7493fd3ff268b97c148d153f59a15dd4
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-05-1, AC-20260908-05-2, AC-20260908-05-3, AC-20260908-05-4, AC-20260908-05-5, AC-20260908-05-6, AC-20260908-05-7, AC-20260908-05-8, AC-20260908-05-9, AC-20260908-05-10, AC-20260908-05-11, AC-20260908-05-12]
---

# Release e2e and journeys legs red on an unobserved run; one predicate, one home

## Goal

The release stage's e2e leg takes its green or red from the e2e command's own exit code, and
the counts it records (passed, failed, skipped) never force anything. A runner that exits 0
having executed zero tests, or whose declared count format never appears in its output,
therefore promotes a release on a suite that never ran. Review's at-risk and suite legs
already close this shape through one predicate landed by specs/20260907/03; release was never
given it. Done means: the e2e leg reds on an observed zero or an unmatched declared format,
the journeys leg reds when zero journeys were walked, the substrate leg is audited and left
alone with its reasons recorded, and the predicate plus the two count parsers it reads live in
exactly one shared module that both leg scripts import. The parser copy in release-legs.js
has already drifted from review's (first match versus last match, measured), which is the
evidence that a copy is not reuse.
