---
date: 2026-09-03
status: done
tier: critical           # edits spec-status.js (frozen --next/--json surface, .claude/rules/spec-pipeline.md § Risk Tiers) and changes the queue file's item vocabulary
area: session-queue
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260903/04-reports-write-the-queue.md, specs/20260903/05-status-diet.md]
brief: 24
open_markers: 0
diff_base: af5e0a08c786bb40ede5c2d23bca4c0dc0991ad0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-03-1, AC-20260903-03-2, AC-20260903-03-3, AC-20260903-03-4, AC-20260903-03-5, AC-20260903-03-6, AC-20260903-03-7, AC-20260903-03-8, AC-20260903-03-9, AC-20260903-03-10, AC-20260903-03-11, AC-20260903-03-12, AC-20260903-03-13]
---

# Pipeline queue mechanics — after-gates, spec items, placed-last, one reorder verb

## Goal

Turn the session queue from a list the user was supposed to maintain into the pipeline's own
memory for deferred work. An item can wait behind a spec or a brief (an **after-gate**) and
only becomes the pick once that target is done; an ad-hoc spec can be queued by path at any
position; a brief that lands on the roadmap is placed last with no mark, no notice and no
accept step; a brief or spec is queued at most once; and the verbs shrink to the five the
pipeline and a one-line veto need. Done means: `spec-queue add "/spec:plan @docs/roadmap/26-x.md"
--after-spec specs/20260903/04-y.md` is honored by `spec-status --next` on the day spec 04
closes and never before, `spec-queue add specs/20260903/06-hotfix.md --top` makes that
ad-hoc spec the Next line, and `queue-auto-placed` no longer exists.
