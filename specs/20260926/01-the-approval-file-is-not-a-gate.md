---
date: 2026-09-26
status: done
tier: critical
area: design
breaking: true
depends_on: []
build_base: design-retool
depended_on_by: [specs/20260926/02-the-design-contract-is-code.md, specs/20260926/03-gates-per-workspace.md]
brief: 27
open_markers: 0
diff_base: f4aa18c824fe28e60238ab9714284e9180e0abb0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260926-01-1, AC-20260926-01-2, AC-20260926-01-3, AC-20260926-01-4, AC-20260926-01-5, AC-20260926-01-6, AC-20260926-01-7, AC-20260926-01-8]
---

# The approval file is not a gate

## Goal

The design canon gate between plan and build leaves the pipeline. `/spec:sketch`, the design
stage `/spec:run` used to route through, the `design_source` and `designed:` frontmatter
fields, and every plan, run, build, review and status check that read `design/approval.json`
are deleted; `/spec:mocks` and genesis keep writing and reading that file until briefs 29 and 30
retire them. The three lanes a change can travel — direct to main, prototype, plan first —
are written once, in the plugin's own Pipeline Entry doctrine. Done means: no plugin file, test,
canonical doc or README names the retired command, stage or fields; a `design: true` spec builds
without a `designed:` stamp; the status dashboard derives nothing from design fields.
