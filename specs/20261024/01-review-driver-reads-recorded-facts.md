---
date: 2026-10-24
status: done
build_base: main
tier: standard
area: review
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-24
diff_base: 0a44191f4e57fed0f75d2b29ba6ccfa174ec18ca
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261024-01-1, AC-20261024-01-2, AC-20261024-01-3, AC-20261024-01-4, AC-20261024-01-5, AC-20261024-01-6, AC-20261024-01-7, AC-20261024-01-8, AC-20261024-01-9, AC-20261024-01-10, AC-20261024-01-11, AC-20261024-01-12, AC-20261024-01-13, AC-20261024-01-14]
---

# Review driver reads recorded facts, never stand-ins

## Goal

The review driver decides from facts it already records, never from file counts, highest
numbers or sticky booleans. Today it infers "a fix round ran" from how many manifest files
exist, so the skip-extraction re-run (which also mints a manifest) prints a fix-delta step
naming files that do not exist and halves the fix budget; a fix round that introduces new
skipped tests never re-enters the skip step; an empty skip file is accepted against a gate
reporting 26 skips; and the skip reconciler maps a skipped test to its file's first cited AC
instead of its own. Done means: each of those decisions reads one recorded fact, with a
regression test per defect, and the existing pins keep passing.
