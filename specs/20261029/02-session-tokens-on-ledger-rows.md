---
date: 2026-10-29
status: done
open_markers: 0
tier: critical           # touches spec/scripts/verdict.js (rules § Risk Tiers: sole verdict derivation)
area: provenance
breaking: false
depends_on: [specs/20261029/01-model-placement-refresh.md]
brief: n/a
build_base: main
diff_base: 10b44102054967fe9ceebf0a37734d68327e0914
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-02-1, AC-20261029-02-2, AC-20261029-02-3, AC-20261029-02-4, AC-20261029-02-5, AC-20261029-02-6, AC-20261029-02-7]
---

# Session token usage on build and review ledger rows

## Goal

Build and review ledger rows record how many tokens the orchestrating session spent during that
stage, read from the same transcript `sessionModel()` already reads, so the cost of a model or
effort change can be measured from the ledger instead of estimated. The field is a per-stage
delta of the session's own usage, deduplicated by message id, named `sessionTokens` so nobody
mistakes it for a total that includes subagents. Done means a build row and a review row carry
the field with the four token counters and a turn count, every pre-existing field keeps its
value and position, and every failure to read degrades to `null`, never an error.
