---
date: 2026-09-03
status: done
tier: standard           # report-render.js + command/doctrine prose; no critical-trigger surface (spec-status.js untouched)
area: session-queue
design: false
breaking: false
depends_on: [specs/20260903/03-pipeline-queue-mechanics.md]
depended_on_by: []
brief: 24
open_markers: 0
diff_base: 09e8486f6114b795bf5e0b1ff667b57ca54a640e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-04-1, AC-20260903-04-2, AC-20260903-04-3]
---

# Reports write the queue — deferred work is an item, never a sentence

## Goal

Make the pipeline keep its own promises. Every command whose report would say "after X,
do Y" or "this new work goes first" writes that as a queue item **before** the report
renders, and the report shows what it wrote under a `queued` slot. The user reads
`/spec:status`; the Next line is right cold because nothing was left in prose. Done means:
`report-render.js` renders a `queued` slot, and the plan, review, escape, and shared
close-the-loop doctrine each name the exact `spec-queue add …` write they owe.
