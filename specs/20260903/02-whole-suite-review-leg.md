---
date: 2026-09-03
status: done
tier: critical             # verdict.js + review-legs.js + spec-review-driver.js are this repo's critical triggers (pipeline rules § Risk Tiers)
area: pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 55883225efa714d1cddecfe257c88cc27d50b19b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-02-1, AC-20260903-02-2, AC-20260903-02-3, AC-20260903-02-4, AC-20260903-02-5, AC-20260903-02-6, AC-20260903-02-7, AC-20260903-02-8, AC-20260903-02-9, AC-20260903-02-10, AC-20260903-02-11, AC-20260903-02-12, AC-20260903-02-13, AC-20260903-02-14, AC-20260903-02-15, AC-20260903-02-17, AC-20260903-02-16]
---

# Whole-suite review leg: review runs the host's whole test suite once, and CLEAN is unreachable while it is red

## Goal

Close the `scoped-gate-blind-spot` escape class at its one honest seam. Every gate in the
pipeline runs only the test globs derived from the spec's File Plan, and the at-risk leg only
finds outside tests that name a changed file — so a repo-wide scanner test (a narration sweep,
a tracked-text purity walk, an exhaustive live-file pin) that goes red because of the diff is
invisible to build and review alike and main goes red after merge. Review gains one blocking
leg, `suite`, that runs the host's bare `testCommand` from the repo root once per legs
iteration and writes a manifest row; `verdict.js` requires it in both scopes and derives
`GATE_RED` while it is red; the review driver's close-time re-run widens to the same command so
the files CLOSE itself writes are covered too. Build's scoped loops stay exactly as they are.
Done means: a red test outside every File Plan test directory, naming no changed file, hard-
stops review before any reviewer spend; every existing fixture manifest and synthetic host
keeps deriving the word it derives today with the row added in place; the canonical pipeline
doc no longer justifies never widening the gate by a red-baseline rationale v7 retired; and the
replay corpus carries the class's section so the fleet reader's corpus-gap line clears.
