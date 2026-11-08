---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T3                 # rewrites wf-build.body.js through the codegen seam (named T3 trigger) — a defect here corrupts the TDD red-first evidence floor for every host
area: build-workflow
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260817/04-redcheck-sentinel-path-keying.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-03-1, AC-20260817-03-2, AC-20260817-03-3, AC-20260817-03-4, AC-20260817-03-5, AC-20260817-03-6, AC-20260817-03-7, AC-20260817-03-8, AC-20260817-03-9, AC-20260817-03-10, AC-20260817-03-11, AC-20260817-03-12, AC-20260817-03-13, AC-20260817-03-14]
---

# Red-check stop: token resume + evidence-priced per-file waiver

## Goal

A `tdd-red-check` stop currently has no honest exit. On `resumeFromRunId` the red-check
`agent()` call's prompt is a pure function of `testBatches` paths + gate commands (a
structural fact of the source, independently confirmed at adversarial check), so the
workflow journal cache replays the cached stop verdict even after the orchestrator has
fixed the test files' *content* — and the only lever the args contract offers is
`tdd: false`, an all-or-nothing, trace-free disarm of the red-first evidence floor.
Evidence: JJ-20260816-02 (open intake row, three sanctioned-failing pins) hit the lever
after load-attribution mismatches; an UpWell build on 2026-08-16 (run `wf_43fd35e6`,
relayed by JJ this session and verified against this repo's workflow source — not
ledgered here) burned two dead cycles on the cache-replay half specifically;
TRADOYO-20260813-01 is precedent for the lever-misuse pattern only (its proximate defect
was separately fixed at 6.65.0). Done means: (1) a reserved cache-bust token re-runs the
red-check on resume, (2) a per-file waiver with a mandatory evidence record replaces
`tdd: false` as the sanctioned exit when the check is wrong about a specific adjudicated
file, (3) disarming TDD entirely also costs an evidence record — mechanically, not by
doctrine request, (4) the run's terminal return and its durable ledger row both say
whether the floor was disarmed or any file waived, and (5) the three JJ-20260816-02 pins
go green and leave the suite baseline.
