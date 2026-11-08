---
date: 2026-08-23
status: done
tier: standard
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
brief: n/a
# pinned at build close 2026-08-23 from the moving ref `main`, which advanced 3x during this
# build (spec 02's merge + two ledger promotions). This sha is the true pre-image: everything
# in 4b8c837..HEAD is this spec's own work. See the semver-race / stale-diff_base gotchas.
build_base: 4b8c83797b8816e20a920ca0d3e5bb925ae8bd63
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-03-1, AC-20260823-03-2, AC-20260823-03-3, AC-20260823-03-4, AC-20260823-03-5, AC-20260823-03-6, AC-20260823-03-7, AC-20260823-03-8, AC-20260823-03-9, AC-20260823-03-10, AC-20260823-03-11, AC-20260823-03-12, AC-20260823-03-13, AC-20260823-03-14, AC-20260823-03-15, AC-20260823-03-16, AC-20260823-03-17]
---

# Silent-drop hardening: loud trailing-tag rejection, frontmatter comment strip, ledger repair, D8 archaeology

## Goal

Three verified defects from the 2026-08-21..23 upwell host incident, one bundle. (1) The
AC-tag parser's bare-only trailing rule (escape rv_640c582f4902) refuses a backticked
trailing tag **silently**, so a host that writes genuine declarations backticked sees them
misreported as `uncovered-ac` / `unsanctioned-skip` / `unsanctioned-green` with no hint of
the real cause — the refusal must become a loud, remedy-naming hard finding exactly where it
bites. (2) The two drivers' frontmatter reader captures YAML inline comments; seven live
review ledger rows carry a whole sentence inside `tier` — strip comments and repair the
rows. (3) specs/20260821/03 D8's post-land archaeology (escape rows for the four
prefix-collision-laundered ACs) never ran — execute it here. Done means: every refused
trailing tag that changes a verdict names itself and its remedy, ledger `tier` fields are
enum-clean (past and future), and the four escape rows exist.
