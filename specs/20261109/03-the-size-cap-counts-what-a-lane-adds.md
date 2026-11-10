---
date: 2026-11-09
status: done
area: tests
depends_on: []
brief: n/a
architecture: true
breaking: false
text: 4003a0f791b7a7b10973fbd0c6f7db4a64e57ffe
acs: [AC-20261109-03-1, AC-20261109-03-2, AC-20261109-03-3]
---

# The size cap counts what a lane adds

## Goal

Replayed on 20261108/01's fourth build (run.js 39,003 bytes at its base, +982 from the lane, trunk +911 meanwhile, about 40,900 after the rebase), the size check passes with a warning. The next branch that grows run.js from there is red until it cuts.
