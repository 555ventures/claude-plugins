---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: true
depends_on: ["specs/20260901/09-disposer-gate.md"]
depended_on_by: []
brief: 18b
open_markers: 0
build_base: main
diff_base: 7092cb9aa8700895619394bb93415728fa1c7ee2
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-10-1, AC-20260901-10-2, AC-20260901-10-3, AC-20260901-10-4, AC-20260901-10-5, AC-20260901-10-6, AC-20260901-10-7, AC-20260901-10-8]
---

# `/spec:run` is the loop; `/spec:build` is the build stage again

## Goal

The loop gets its own name and the three stages get symmetric direct entries. `/spec:run
<spec>` carries a spec from `hardened` to `done` — design when due, the build driver, the
review driver, each `--via loop` — stopping only for decisions. `/spec:build` returns to
being the build stage alone (`hardened|implementing`, `--via direct`), beside `/spec:design`
and `/spec:review`. The state gate, `spec-status --next`, `spec-paths shared-for`,
`entrypoints.json`, and every command, doctrine, README, and marketplace surface name the
loop by its name. Done means: the gate admits `/spec:run` on all three statuses and refuses
`/spec:build` on `done` again; `spec-status --next` prints `/spec:run @<spec>` for every spec
past `hardened`; `/spec:run` loads within the read-load budget; the entrypoints pin is green.
