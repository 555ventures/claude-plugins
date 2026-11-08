---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T2
area: spec-pipeline
design: false
breaking: false
depends_on: ["specs/20260816/01-gate-baseline-reconcile.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-02-1, AC-20260817-02-2, AC-20260817-02-3, AC-20260817-02-4, AC-20260817-02-5, AC-20260817-02-6]
---

# Pre-image concurrent-sanction subtraction — a mid-build declared pin never false-blocks Phase 4

## Goal

`/spec:build` Phase 4's suite pre-image check (`suite-baseline.js --check --pre`,
specs/20260814/03 D10) BLOCKs on `preNewFailing > 0` on the premise that a test failing now
but absent from the Phase 0 pre-image was broken by this build's diff. The pre-image binds to
a single instant and assumes exclusive repo access — but concurrent sessions in this repo are
normal (the semver-race Gotcha exists for exactly that). Observed 2026-08-17 during the build
of specs/20260816/03: a parallel session landed INTAKE JJ-20260817-01's two sanctioned-red TDD
pins (new test file + `.claude/suite-baseline.json` rows, committed as `f85d07a`) between the
snapshot (11:28:08) and Phase 4 (~11:35) — `preNewFailing=2`, a false BLOCK whose only honest
resolution was out-of-band forensics (restore the pre-change file, re-run, diff the output;
full write-up in specs/20260816/03-file-plan-table-scoped-parsing.deviations.md). Done means:
a row that is sanctioned in the declared baseline **but was not sanctioned when this build's
snapshot was taken** is subtracted from `preNewFailing` — loudly, one line per row plus a
count — so a mid-build declared pin is attributed to its declaration, never to this build's
diff; a pin this build's diff genuinely broke SHALL CONTINUE TO BLOCK; and a legacy pre-image
without the new field behaves byte-identically to today.
