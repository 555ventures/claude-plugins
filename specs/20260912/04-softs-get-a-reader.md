---
date: 2026-09-12
status: done
tier: critical           # review-legs.js is a named critical trigger in .claude/rules/spec-pipeline.md § Risk Tiers — the sole leg deriver, "a bug here silently changes what every review observes"
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
build_base: main
spiked: 2026-09-12
open_markers: 0
diff_base: f0a9d25ad70dd113d1a5f9c6fac4ad2009df068e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-04-1, AC-20260912-04-2, AC-20260912-04-3, AC-20260912-04-4]
---

# Soft findings get a reader, and replay gets a measurement

## Goal

Two independent honesty repairs, both against evidence the pipeline already writes and never
reads back. First: `/spec:escape` learns `softMatch`, derived from the correlated review's
retained artifact exactly as `killedMatch` already is, so a real defect the reviewer saw and
filed as advisory reads as a floor miss rather than as a finding review never saw — the guard
specs/20260909/04-review-soft-floor.md owed when it moved soft findings out of the disposition
pool. Second: the reviewer-catch-rate harness is repaired. Replay's overlay deliberately
withholds `specs/` to keep the reviewer blind, so any spec whose review round amended its own
Decisions table replays against the pre-fix spec and the `promise-sweep` leg is red before the
mutation is even authored; that leg reads nothing but the spec text, so it can never observe a
planted defect and is skipped in a replay tree. Done means: an escape row can carry
`softMatch`, the fleet reader counts the `true` ones, and a replay against a spec amended at
review reaches a measurement instead of burning three leg runs and recording `setup-failed`.
