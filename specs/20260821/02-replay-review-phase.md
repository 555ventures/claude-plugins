---
date: 2026-08-21
status: done
diff_base: 496378b4d61c3976e324c3943e7c1b4934eef102
open_markers: 0
tier: standard           # no critical-trigger file gets a behavioral edit (verdict.js/review-legs.js untouched); worst failure is the driver refusing DONE after a completed merge — resumable, never destructive
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260820/07-review-driver.md"]
depended_on_by: []
brief: 14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260821-02-1, AC-20260821-02-2, AC-20260821-02-3, AC-20260821-02-4, AC-20260821-02-5, AC-20260821-02-6, AC-20260821-02-7, AC-20260821-02-8, AC-20260821-02-9, AC-20260821-02-10]
---

# Replay as a review-close phase: the driver's REPLAY state

## Goal

The reviewer-replay harness (specs/20260819/02) is the pipeline's only controlled-denominator
measurement of the one-reviewer bet, and it is advisory: review's CLEAN report prints
`reviewer replay due — run /spec:replay` and nothing runs it. Since the harness shipped
(2026-08-19) this repo alone went due at 5 reviews and skipped the reminder through 12+
reviews in ~48 hours — advisory visibility is empirically insufficient. This spec makes the
due replay part of review's own conclusion: the review driver (specs/20260820/07) gains a
REPLAY state between MERGE and DONE that runs the dueness/selection checks itself and refuses
to conclude the review until a replay outcome row exists — while never touching the already-
committed verdict. Done means: a CLEAN close with a due replay cannot reach DONE without a
recorded `stage:"replay"` ledger row, a not-due close passes through untouched, and
`/spec:replay` remains the manual and retry surface.
