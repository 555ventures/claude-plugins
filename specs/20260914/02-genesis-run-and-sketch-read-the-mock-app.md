---
date: 2026-09-14
status: done
tier: critical
area: design
design: false
breaking: true
build_base: main
depends_on: [specs/20260914/01-the-mock-contract-and-the-driver.md]
depended_on_by: [specs/20260914/03-the-html-atlas-is-retired.md]
brief: 26
open_markers: 0
diff_base: 1d564a46b691fcf773fdf1325c429baa6a9a360c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260914-02-1, AC-20260914-02-2, AC-20260914-02-3, AC-20260914-02-4, AC-20260914-02-5, AC-20260914-02-13, AC-20260914-02-6, AC-20260914-02-7, AC-20260914-02-14, AC-20260914-02-8, AC-20260914-02-9, AC-20260914-02-10, AC-20260914-02-11, AC-20260914-02-15, AC-20260914-02-16, AC-20260914-02-12]
---

# Genesis, run and sketch read the mock app

## Goal

Every consumer of the design stage's output reads the mock app, never HTML. Genesis derives the
frontend framework from the mock app, skips the scaffold race for it, and lands the day-zero
skeleton on `mock-review check`. The run design stage collapses to preflight → reconcile → look
→ stamp, with `design_source` naming screen files and drift detected by the approval hash.
`/spec:sketch` becomes the per-brief sweep loop whose ratification is the approval record. The
grounding contract's `design` block becomes `{ "app": "<dir>" }`, `/spec:init` stops offering
the frontend-design skill, and the shared design doctrine describes one artifact. Done means:
`stage-design.md`, `stage-review.md`, `sketch.md`, `plan.md`, `genesis.md` and `design.md` name
none of `render-gate`, `design-coverage.json`, `components.json`, `data-status`, `design-atlas`
or `storyFormat`; genesis's SKELETON precondition executes `mock-review check --json`; the
contract hash is restamped. The HTML scripts still exist until spec 03; nothing here calls them.
