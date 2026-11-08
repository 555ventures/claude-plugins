---
date: 2026-08-24
status: done
tier: critical           # edits spec/templates/grounding-contract.md (contract hash stamped into every host) and spec/bin/spec-paths (key-set edit) — both named critical triggers in .claude/rules/spec-pipeline.md § Risk Tiers
area: design-stage
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260824/02-design-stage-on-render-gate.md, specs/20260824/04-render-rules.md]
brief: 08
spiked: 2026-08-24
diff_base: 11ab010188f3afb04a5b22d202e52c131bd17aa0
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260824-01-1, AC-20260824-01-2, AC-20260824-01-3, AC-20260824-01-4, AC-20260824-01-5, AC-20260824-01-6, AC-20260824-01-7, AC-20260824-01-8, AC-20260824-01-9, AC-20260824-01-10, AC-20260824-01-11, AC-20260824-01-12, AC-20260824-01-13]
---

# Render Gate — mock↔component fidelity judged at the render

## Goal

Ship the deterministic render gate ADR-0002 decides: one script that captures the mock render
and the component render across the host's declared theme × viewport matrix, compares
painted text, in-flow order, and bound-region geometry, and fails closed on divergence.
The plugin ships the in-page measuring script and the comparison; the host declares how a
URL becomes an inventory (`design.render` in its config). Pixels are not a signal and are
never computed. Done means: on a synthetic mock+component pair reproducing the eleven
measured divergences (headline at 56% height, docked action in-flow, static control → link),
the gate prints the named finding and exits 1, while every measured false-positive class
(`text-transform`, aria-label glyphs, out-of-flow chips, data-positioned chart chips, mock box
model, device frame, sr-only text) passes — and `/spec:review` runs it as an advisory
evidence leg on designed specs in hosts that declare a render path.
