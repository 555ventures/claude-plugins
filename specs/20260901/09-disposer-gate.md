---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/05-checkpoint-fail-closed.md"]
depended_on_by: ["specs/20260901/10-spec-run-command.md"]
brief: 18b
open_markers: 0
build_base: 931c80c4756ce0e1ef36a2050b1577657bd8a54f
diff_base: 931c80c4756ce0e1ef36a2050b1577657bd8a54f
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-09-1, AC-20260901-09-2, AC-20260901-09-3, AC-20260901-09-4, AC-20260901-09-5, AC-20260901-09-6, AC-20260901-09-7, AC-20260901-09-8, AC-20260901-09-9, AC-20260901-09-10, AC-20260901-09-11, AC-20260901-09-12, AC-20260901-09-13, AC-20260901-09-14]
---

# Independent dispositions — a fresh-context disposer replaces the session-change checkpoint

## Goal

The loop no longer parks after the reviewer returns. The property that park protected —
the mind dispositioning review findings has no memory of the build's trade-offs — moves to a
fresh-context `spec:disposer` agent (the reviewer's shape: read-only, paths only, the
session's model) whose return the review driver refuses to advance without. Fix
recommendations dispatch without a question; waive and reject recommendations go to the
user, because only the user waives. The mechanism applies to both review entries, so the
loop and `/spec:review` run one DISPOSITIONS protocol, and every review row records the
outcome and how many recommendations the user overrode. Done means: a fixture host's review
driver lands DISPOSITIONS directly after `reviewer-returned` on both entries, refuses
`--mark dispositions` on non-empty pools without a valid disposer return, accepts one that
covers every finding, and the close row says `checkpoint: {"outcome":"disposer","overrides":N}`.
