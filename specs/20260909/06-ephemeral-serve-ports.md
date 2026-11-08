---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260909/07-hang-bound-and-port-check.md]
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: 29cb1f457090582d4e4bf7f0fafdf00a039d8a2a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-06-1, AC-20260909-06-2, AC-20260909-06-3, AC-20260909-06-4, AC-20260909-06-5, AC-20260909-06-6, AC-20260909-06-7, AC-20260909-06-8]
---

# Every test-bound port is ephemeral

## Goal

No test in this repo chooses a port number. `design-atlas.js serve --port 0` binds an ephemeral
port and prints the bound one in its banner; `tests/helpers.js` exports one `freePort()` and one
`serveAtlas()` that spawns the real serve child on `--port 0` and resolves with the port it
announced; the three private `freePort` copies and the three private serve harnesses are
re-pointed to those two helpers; every pid-derived or random port literal in tests is deleted.
Done means: `grep -rnE "[0-9]{4,5} *\+ *\(?(process\.pid|Math\.random)" tests/` returns nothing,
and two serve-backed test files run concurrently without sharing a port window.
