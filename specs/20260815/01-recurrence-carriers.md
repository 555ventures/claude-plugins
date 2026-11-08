---
date: 2026-08-15
status: done
diff_base: 2b8dd3b0d8b378c425efe5135d759c9f92076150
open_markers: 0
risk: T3
area: authoring-integrity
design: false
breaking: false
depends_on: ["specs/20260814/05-collision-closure.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-01-1, AC-20260815-01-2, AC-20260815-01-3, AC-20260815-01-4, AC-20260815-01-5, AC-20260815-01-6, AC-20260815-01-7, AC-20260815-01-8, AC-20260815-01-9, AC-20260815-01-10, AC-20260815-01-11, AC-20260815-01-12, AC-20260815-01-13, AC-20260815-01-14, AC-20260815-01-15]
---

# Recurrence carriers — two ledgered classes stop depending on authoring-time memory

## Goal

Two defect classes the pipeline detects correctly, records durably, and then re-commits
anyway — because the record's only enforcement is a model remembering it at authoring time —
get deterministic carriers. (1) Review's advisory-smell capture drops its keep/drop
`AskUserQuestion` (a fork review.md itself declares consequence-free, which the question-style
judge therefore correctly blocks — three rewordings bounced 2026-08-15) in favor of
derive-and-announce through a new `advisory-append.js` that appends, dedupes, and 📌-announces
mechanically. (2) The private-config-read class (four ledgered rows in
`docs/audit/advisory-findings.md`; census at plan time found **four live offenders**, two never
ledgered) is paid down — `lib/host-config.js` gains the strict-read variant its own advisory
row prescribed, all four call sites swap to the lib — and pinned closed by a suite test that
reddens on any future private read. Done = the append script's exec pins run green, the
review.md and scaffold-ledger pins run green, the closure pin runs green with zero offenders,
and every retargeted pin (`keep`/`drop`, `{M} accepted`, spec-paths key set) is updated in
place, never weakened.
