---
date: 2026-08-19
status: done
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260819/02-mutation-replay.md]
open_markers: 0
diff_base: 0474ac30657515ab82569452ada920e5983a8909
brief: 14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260819-01-1, AC-20260819-01-2, AC-20260819-01-3, AC-20260819-01-4, AC-20260819-01-5, AC-20260819-01-6, AC-20260819-01-7]
---

# Reviewer evidence retention, a plan trace, and the ground-truth standing

## Goal

Make reviewer conduct auditable after the fact and give the plan stage a ledger presence.
After this spec: every authoritative review verdict persists the reviewer's full structured
return (survivors, killed, executed repro evidence) as a durable artifact keyed by the
ledger row's `runId`; `/spec:escape` reads that artifact to derive `killedMatch` instead of
relying on user memory; every spec lock appends a `stage:"plan"` ledger row of executed
facts; and core.md names the two ground-truth signals (escape ledger, replay catch-rate)
that self-reported review quality is subordinate to. Done = retention demonstrated by
executed tests; the doctrine edits landed and reviewer-verified.
