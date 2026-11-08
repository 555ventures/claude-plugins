---
date: 2026-08-07
status: done
open_markers: 0
risk: T2
area: spec-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260807-03-1, AC-20260807-03-2, AC-20260807-03-3]
---

# Spec-pipeline de-bloat: dead flag, stale comments, prose dedupe, release retire condition

## Goal

Close out the spec-plugin half of the 2026-08-07 over-engineering audit: delete the
zero-consumer `--json` flag from `observe-ci.js`, correct the stale `pending`-era comments in
`lib/observation.js`, dedupe the triply-stated autopilot SDK-import exception to one home, and
register the user-ruled retire condition for `verdict.js`'s never-run release profile instead
of deleting it. Done = the flag is gone, every touched comment states the live contract, the
exception sentence has exactly one full statement, and the ledger row schedules the release
profile's expiry. Net lines down, no new mechanisms.
