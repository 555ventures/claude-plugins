---
date: 2026-10-24
status: done
tier: standard
area: genesis
breaking: false
depends_on: [specs/20261024/01-review-driver-reads-recorded-facts.md]
brief: n/a
open_markers: 0
build_base: main
diff_base: 72068eda9c517330f39320c3cf6360a26a88ffb4
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261024-02-1, AC-20261024-02-2, AC-20261024-02-3, AC-20261024-02-4, AC-20261024-02-5, AC-20261024-02-6]
---

# Genesis reads its marks, and a consistency test bans stand-ins in every driver

## Goal

The genesis driver's MENUS gate advances on a menu file's presence even when the recorded
registry check never ran, and its design-stage states re-check artifact files behind marks
that were only set after those files were verified. Both read a stand-in for a fact the
driver already records. This spec makes those decisions read the record, and adds the
consistency test that keeps every driver's `deriveState()` free of file-count and
file-presence calls, so the class fixed by 20261024/01 cannot return silently.
