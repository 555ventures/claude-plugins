---
date: 2026-11-01
status: done
tier: critical
area: ledger
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-01
build_base: main
open_markers: 0
diff_base: 4644500a46bba8fa3899d08143ebb1811e5282cc
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-11-1, AC-20261101-11-2, AC-20261101-11-3, AC-20261101-11-4, AC-20261101-11-5, AC-20261101-11-6, AC-20261101-11-7, AC-20261101-11-8, AC-20261101-11-9, AC-20261101-11-10, AC-20261101-11-11, AC-20261101-11-12]
---

# A direction flip leaves a row

## Goal

When a decision upstream retires a spec or deletes code a done spec shipped, the pipeline
records nothing: the escape ledger is the one ground-truth signal the doctrine names, and
`fleet-reader` therefore counts the "direction flipped after work shipped" class at zero, so
core.md § Incident Policy can never earn a guard for the largest loss the 2026-11-01 audit found
(leak 1). Done means two events each append one escape row carrying a class and the superseding
id — a commit that flips a spec to `status: superseded`, and a review merge-back that deletes a
file a done spec's File Plan created — written through the one existing escape-row writer and
counted by `fleet-reader --json` under `escapes.byClass`. No doctrine paragraph, no refusal, no
threshold: rows only.
