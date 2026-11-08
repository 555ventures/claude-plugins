---
date: 2026-11-01
status: done
tier: critical
area: review-legs
breaking: false
depends_on: []
brief: n/a
open_markers: 0
build_base: main
spiked: 2026-11-01
diff_base: 2d51850e3b5a6458fedbe722038399246aba49a5
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-05-1, AC-20261101-05-2, AC-20261101-05-3, AC-20261101-05-4, AC-20261101-05-5, AC-20261101-05-6, AC-20261101-05-7, AC-20261101-05-8, AC-20261101-05-9, AC-20261101-05-10]
---

# The gate that ran the suite is the suite

## Goal

The review stage was built for a scoped gate: `gateCommand` carries `{testDirs}`, so the gate
runs the spec's own test directories and the `suite` leg is the one observation of the whole
tree. Nothing makes a host scope its gate, and the two hosts measured this week do not — their
gate ends in the bare test command — so one green review runs the full suite in the gate leg,
again in the suite leg, and twice more at `--mark closed`. On a 7-to-20-minute suite that is the
difference between a review that takes minutes and one that takes an hour, and no leg records
how long it took. Done means a gate that demonstrably ran the whole suite is reused as the suite
leg (in review-legs and at close), a scoped gate behaves exactly as today, and every legs run
writes wall-clock milliseconds per leg so a slow leg is visible without a profiler.
