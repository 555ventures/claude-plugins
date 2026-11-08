---
date: 2026-09-13
status: done
tier: critical
area: review-status
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
build_base: main
diff_base: 27306bd260416fc7c7e085a30311e52f1fe54aaf
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-09-1, AC-20260913-09-2, AC-20260913-09-3, AC-20260913-09-4, AC-20260913-09-5, AC-20260913-09-6, AC-20260913-09-7, AC-20260913-09-8, AC-20260913-09-9, AC-20260913-09-10]
---

# The tool shows, never interrupts

## Goal

The review driver parks a CLEAN close at `REPLAY` every fifth review and refuses to conclude
until a reviewer replay is recorded. The owner's finding: a block is bypassed anyway, and the
surprise interrupt mid-delivery is the actual cost. The other finding from two failed products:
nobody could see how long it had been since anything was observed in production. This spec
removes the `REPLAY` state and its mark from the driver, moves the dueness derivation into the
shared ledger library, and gives the dashboard footer two ignorable clauses: how many specs have
closed since the last release, and whether a replay is due. Done means a review that has merged
prints `DONE`, `/spec:replay` is the only executor, and `/spec:status` shows the two counts every
time without ever blocking anything.
