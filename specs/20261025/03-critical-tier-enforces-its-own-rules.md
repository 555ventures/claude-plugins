---
date: 2026-10-25
status: done
build_base: main
open_markers: 0
tier: standard
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
diff_base: 6db3b1f65953c367b85768dc4faae2340d5682f7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261025-03-1, AC-20261025-03-2, AC-20261025-03-3, AC-20261025-03-4, AC-20261025-03-5, AC-20261025-03-6, AC-20261025-03-7, AC-20261025-03-8]
---

# Critical tier enforces its own rules

## Goal

Core doctrine already says two things about a `tier: critical` spec that no gate checks: every
AC carries a literal example, and a skipped test is not a pass. A host ran a critical spec whose
definition of done rested on `[env:]`-gated end-to-end tests; the skip gate sanctioned the skip
on the tag alone, the review returned CLEAN, and the tests exposed a wrong assumption only after
merge. This spec makes the two rules mechanical where they already live: `ac-matrix.js`'s
skip-reconcile leg treats a critical spec's own env-gated skip as a hard finding, and its `--lint`
refuses to lock a critical AC with no backticked literal. Standard tier is byte-unchanged. Done
means both refusals are observed from the script and the doctrine sentences name them.
