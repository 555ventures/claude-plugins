---
date: 2026-08-05
status: done
open_markers: 0
risk: T3
area: status
design: false
breaking: false
depends_on: [02-review-evidence-manifest.md]
depended_on_by: [04-intake-class-discipline.md]
brief: n/a
spiked: 2026-08-05
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260805-03-1, AC-20260805-03-2, AC-20260805-03-3, AC-20260805-03-4, AC-20260805-03-5, AC-20260805-03-6, AC-20260805-03-7, AC-20260805-03-8, AC-20260805-03-9, AC-20260805-03-10, AC-20260805-03-11]
---

# done-unobserved — the pipeline owns the post-verdict window

## Goal

Nothing owns the time between `/spec:review` flipping a spec to `done` and the first CI run
on the landed code — the window where the confirmed 2026-08 escape lived undetected for
days. This spec gives `done` a derived sub-state: a spec is **done-unobserved** until a CI
run *that verifiably contains the spec's close commit* is recorded in the run ledger. A new
`observe-ci.js` (built on spec 02's `ci-query.js`) performs the observation at the next
pipeline invocation (no daemon); `spec-status.js` derives and renders the sub-state; a red
observation turns the dashboard headline red and becomes the top `--next` pick — a
`/spec:escape` entry carrying its evidence, shaped for both humans and the autopilot
oracle. CI-less hosts resolve observations instantly and see zero noise. Done means: a
green dashboard can no longer coexist with a silently red run of the landed code — and the
mechanism can never stamp a spec green on evidence for code it doesn't contain.
