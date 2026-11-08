---
date: 2026-09-09
status: done
build_base: main
tier: standard           # driver + doctrine only; verdict.js and every other named critical surface untouched
area: review
design: false
breaking: false
depends_on: [specs/20260909/04-review-soft-floor.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: f65750a7e58218ba80634219dff6eb4a97172e27
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-05-1, AC-20260909-05-2, AC-20260909-05-3, AC-20260909-05-4, AC-20260909-05-5, AC-20260909-05-6]
---

# The fix-delta reviewer pass reviews the fix, not the range again

## Goal

After a fix lands, the second and later reviewer passes review only the files the fix touched:
the driver snapshots the working tree when the reviewer returns and again when the fix is
marked applied, writes the changed-file list to the sidecar, and prints a REVIEWER step that
names that list, the prior reviewer return and the prior disposer return. The reviewer's
contract for that pass is: re-verify every finding routed to fix, report hard regressions inside
the listed files, and open nothing outside them. Done means: iteration 2's step text carries the
delta list, a fix that changed nothing is refused before any legs run, and a reviewer handed
the list cannot legitimately re-open the full range.
