---
date: 2026-08-24
status: done
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 354e2c1c6e236518b3d9fc7e4191e9cbc8507e24
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260824-06-1, AC-20260824-06-2, AC-20260824-06-3, AC-20260824-06-4, AC-20260824-06-5, AC-20260824-06-6, AC-20260824-06-7, AC-20260824-06-8, AC-20260824-06-9, AC-20260824-06-10, AC-20260824-06-11, AC-20260824-06-12]
---

# Review range identity — every review row names the code it judged

## Goal

A review ledger row records the verdict word but not the code the verdict was rendered on: no
row in the 118 on record carries a commit range (only `diff.loc`), and the reconcile leg
reduces its out-of-plan files to an integer at emission, so a CLEAN row cannot be traced to
the commits it covered or the files it found off-plan. After this lands, every review row
`verdict.js` prints — hard-stop, escalate, and close — carries the resolved base sha, the
HEAD sha at the moment of that pass, and whether the working tree was dirty, and the reconcile
leg's manifest row carries the out-of-plan paths beside the count. The retained per-run
artifact carries the same. Historical rows are never rewritten; readers already tolerate rows
that predate a field, and continue to. Done means `/spec:escape`'s runId backlink lands on a
row that names a range, and a review's out-of-plan paths survive in the ledger rather than only
in reviewer prose.
