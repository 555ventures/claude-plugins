---
date: 2026-09-26
status: done
build_base: design-retool
tier: critical
area: design
breaking: true
depends_on: [specs/20260926/01-the-approval-file-is-not-a-gate.md]
depended_on_by: [specs/20260926/03-gates-per-workspace.md]
brief: 27
open_markers: 0
diff_base: a4775a0078aecdc601309e697fcc457465946e09
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260926-02-1, AC-20260926-02-2, AC-20260926-02-3, AC-20260926-02-4, AC-20260926-02-5, AC-20260926-02-6, AC-20260926-02-7, AC-20260926-02-8, AC-20260926-02-9, AC-20260926-02-10, AC-20260926-02-11]
---

# The design contract is code

## Goal

A host with a UI stack carries its design contract as code, and the plugin verifies presence
mechanically: a token file, a kit directory of intent-named composite components, and one
auto-loaded rule file holding the intent-to-pattern table and the naming-convention table (one
section per layer: code, schema, routes, wire). `/spec:init` records where they are and seeds
the rule file from a template when absent; `/spec:doctor` runs one script that reports every
missing piece and every pattern row without its composite. `/spec:enforce` gains the
`kit-discipline` category those rules feed. No doctrine prose enforces any of it. Done means:
the check script exists with executed tests, the grounding contract defines the `design` block
in its new shape, this repo's own config is re-stamped, and the taxonomy carries the new
category in all three of its homes.
