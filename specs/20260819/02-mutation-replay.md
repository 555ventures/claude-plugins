---
date: 2026-08-19
status: done
tier: standard
area: review
design: false
breaking: false
depends_on: [specs/20260819/01-review-evidence-retention.md]
depended_on_by: []
open_markers: 0
diff_base: fe096c335ee22bd4dfffa0d7ed91bedb74fd7443
brief: 14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260819-02-1, AC-20260819-02-2, AC-20260819-02-3, AC-20260819-02-4, AC-20260819-02-5, AC-20260819-02-6, AC-20260819-02-7, AC-20260819-02-8, AC-20260819-02-9, AC-20260819-02-10, AC-20260819-02-11]
---

# Scheduled mutation replay: the reviewer's catch-rate becomes a measured number

## Goal

Generalize the one-time v7 replay eval (docs/audit/v7-replay-eval.md) and the ad-hoc
2026-08-18 consult injection into a scheduled, deterministic harness: every 5th review, a
known defect from a typed corpus is injected into a just-CLEANed spec's tree in a scratch
worktree, the standard reviewer is dispatched blind, and catch/miss lands as a
`stage:"replay"` ledger row. Done = the harness's mechanics are pinned by executed tests,
the corpus ships with 6 classes aimed at measured blind spots, the cadence is core.md
policy, and `replay.js --stats` prints a catch-rate — the number that makes v7's
one-reviewer bet falsifiable.
