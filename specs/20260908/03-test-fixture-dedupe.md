---
date: 2026-09-08
status: done
tier: standard
area: tests
design: false
breaking: false
depends_on: [specs/20260908/01-size-ratchet.md]
build_base: main
depended_on_by: [specs/20260908/04-duplicate-window-ratchet.md]
brief: n/a
open_markers: 0
diff_base: 1aa5915554c1ad9417c7d016d8f8e300a62d438e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-03-1, AC-20260908-03-2, AC-20260908-03-3, AC-20260908-03-4, AC-20260908-03-5, AC-20260908-03-6, AC-20260908-03-7]
---

# Test fixture dedupe — four repeated host builders become fixtures modules

## Goal

Four families of near-identical test setup — the review-legs host builder (seven copies in
four files), the genesis discovery-brief writer (six copies in four files), the AC-matrix
harness (two byte-identical copies), and the replay overlay host (five copies in one file) —
each become one parameterized function in a sibling `*.fixtures.js` module, following the
shape `tests/review/review-driver.fixtures.js` and `tests/genesis/tournament.fixtures.js`
already use. Every test keeps its name and its assertions; the size baseline records the
shrink.
