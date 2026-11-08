---
date: 2026-08-30
diff_base: 83b9383619de1bf79f527d5b122fba4648be0f3b
status: done
tier: standard
area: collision-closure
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260830-01-1, AC-20260830-01-2, AC-20260830-01-3, AC-20260830-01-4, AC-20260830-01-5, AC-20260830-01-6, AC-20260830-01-7, AC-20260830-01-8, AC-20260830-01-9, AC-20260830-01-10]
---

# Collision-closure sees the tests that execute a script

## Goal

`collision-closure.js`'s paths leg exists to answer one question at plan lock: which tests
outside the File Plan will feel this spec's edits? Today it cannot see the strongest possible
answer — "this test *runs* the script you are changing" — because it matches File Plan paths
as literal substrings while this repo's test helpers spawn scripts by a root-stripped path
(`runNode('scripts/foo.js')`, never `spec/scripts/foo.js`). Measured 2026-08-30: 88 of 115
test→script execution edges (77%) are invisible to the leg. Done means: a test that names a
runnable File Plan target by its two-segment suffix is listed under a new `executes` tier, in
both the human listing and `--json`; the tier is advisory and owes the planner nothing; every
existing behavior of the sweep (exit codes, basename rejection, literals leg, proximity tiering
for prose targets) is pinned and survives; and the sweep's printed remedy stops contradicting
the repo's own 2026-08-24 ruling that `likely` hits owe no waive line.
