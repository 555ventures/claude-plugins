---
date: 2026-09-08
status: done
build_base: main
tier: standard
area: scripts
design: false
breaking: false
depends_on: [specs/20260908/01-size-ratchet.md]
depended_on_by: [specs/20260908/04-duplicate-window-ratchet.md]
brief: n/a
open_markers: 0
spiked: 2026-09-08
diff_base: ba8b5ae5cf11fed2829cefa6a72dda8893373afe
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-02-1, AC-20260908-02-2, AC-20260908-02-3, AC-20260908-02-4, AC-20260908-02-5, AC-20260908-02-6, AC-20260908-02-7]
---

# Driver dedupe — one surfaces grammar in lib, genesis-driver on driver-io

## Goal

The ```surfaces line grammar (a bare label, an `a -> b` edge, a `#` comment) is parsed in
exactly one place, `spec/scripts/lib/surfaces.js`, and both `design-atlas.js` and
`genesis-driver.js` fold over it. `genesis-driver.js` stops carrying its own copies of the
synchronous stdout writer and the fail-closed child runner and uses `lib/driver-io.js` like
the review, build, and mocks drivers do. Behavior is unchanged: every existing genesis and
atlas test keeps passing, and the deduplicated drivers shrink, which the size baseline
records.
