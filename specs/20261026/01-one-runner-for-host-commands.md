---
date: 2026-10-26
status: done
build_base: main
tier: critical
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-26
diff_base: 2bb7fa786dda570f9c6dccb701e2543292f6a794
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261026-01-1, AC-20261026-01-2, AC-20261026-01-3, AC-20261026-01-4, AC-20261026-01-6, AC-20261026-01-7, AC-20261026-01-8, AC-20261026-01-9, AC-20261026-01-10]
---

# One runner for host commands

## Goal

The plugin runs a host's own command strings (gate, test, e2e, boot, db, picture, scaffold) from
thirteen places, and each place builds the shell line its own way: some scrub the test-runner
context and some do not, values are spliced with three different quoting styles, and environment
values reach the command either as spawn env, a bare `VAR=x` prefix, or an `export` line. Every
host-shape defect since 2026-10-01 was found by a real host, never by this repo's suite, because
the suite runs one host shape and never executes a line a driver prints. This spec adds one
library — `lib/host-run.js` — that is the only place a host command is run or printed, moves every
site onto it, bans shell spawns anywhere else, and adds one workspace-shaped fixture host whose
printed boot line is actually executed. Done means a consistency test finds zero shell spawns
outside the library, the release e2e leg's `BASE_URL` reaches every command of a compound
`e2eCommand`, and a printed boot line of the form `cd apps/web && exec node server.mjs` answers
on its allocated port when run from a symlinked root.
