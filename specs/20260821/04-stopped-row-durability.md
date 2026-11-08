---
date: 2026-08-21
status: done
diff_base: fda882b1f33a55eae0b2acd0974875193a678745
open_markers: 0
tier: standard           # merge-back.sh (critical) is read, never edited; the driver is not on the Risk Tiers list. Worst failure: a stop row written to the fallback location (today's behavior, printed loudly) or a failed drain (rows remain visible via the union-read either way) — recoverable, never destructive, and the clean-root precondition is respected by construction (executed spike: gitignored paths are invisible to `git status --porcelain`).
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260820/07-review-driver.md"]
depended_on_by: []
brief: n/a
spiked: 2026-08-21
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260821-04-1, AC-20260821-04-2, AC-20260821-04-3, AC-20260821-04-4, AC-20260821-04-5, AC-20260821-04-6, AC-20260821-04-7, AC-20260821-04-8, AC-20260821-04-9, AC-20260821-04-10]
---

# Durable hard-stop rows — a worktree review's GATE_RED evidence survives an abandoned worktree

## Goal

Closes deferred ruling R3(1) of specs/20260820/07-review-driver.md. Today a review running
in a linked build worktree that hard-stops on `RED_BLOCKING` appends its `GATE_RED` ledger
row to the worktree's own `.claude/spec-runs.jsonl`; the row reaches the main root only if a
merge later lands. An abandoned worktree — or the `git worktree remove --force` remedy the
pipeline itself prints — destroys it permanently, so the stopped attempt is invisible to
`spec-status`, `replay --due`, and `/spec:escape`, violating the doctrine invariant "a
stopped attempt is never invisible". Done means: the hard-stop row is written durably at the
main root **at the moment of the stop**, without dirtying the main tree (writing it straight
into the tracked ledger was executed and failed — it trips `merge-back.sh`'s
`assert_clean_root`/`ff-only` preconditions, R3's recorded evidence), every existing ledger
reader sees it with zero changes, and a later successful close folds it into the tracked
ledger in the correct position.
