---
date: 2026-09-08
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-08
open_markers: 0
build_base: main
diff_base: 62dc04594e3265fdd9a85be1617161a588389d7c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-07-1, AC-20260908-07-2, AC-20260908-07-3, AC-20260908-07-4, AC-20260908-07-5, AC-20260908-07-6, AC-20260908-07-7, AC-20260908-07-8, AC-20260908-07-9, AC-20260908-07-10, AC-20260908-07-11, AC-20260908-07-12, AC-20260908-07-13, AC-20260908-07-14]
---

# One wire-register predicate

## Goal

Four checks across two scripts each ask a version of "does this page apply the gray wireframe
register as a stylesheet?", and all four hand-roll their own answer. The four answers disagree
on ten of twenty-four link forms, and two of them are outright wrong: a wireframe styled
through a CSS `@import` is refused as unstyled, and a wireframe whose gray links were deleted
but left behind in a comment passes as drawn. This spec makes the reading of a page's applied
stylesheets a single derivation under `spec/scripts/lib/`, moves all four checks onto it, and
pins that a fifth private spelling cannot appear. Done means: one module answers the question,
every call site keeps its own message, severity and gating, and the two defects above are gone.
