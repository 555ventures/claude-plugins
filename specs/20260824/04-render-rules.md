---
date: 2026-08-24
status: done
diff_base: ecec5570e8e06d069e2fd78fea88b8212093181d
tier: standard           # additive script + additive field on design-rules.json; render-gate.js gains a mode (not a critical-named surface); no contract edit
area: design-stage
design: false
breaking: false
depends_on: [specs/20260824/03-mock-states-hygiene.md]
depended_on_by: [specs/20260824/05-design-doctrine-cut.md]
brief: 08
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260824-04-1, AC-20260824-04-2, AC-20260824-04-3, AC-20260824-04-4, AC-20260824-04-5, AC-20260824-04-6, AC-20260824-04-7, AC-20260824-04-8, AC-20260824-04-9, AC-20260824-04-10]
---

# Design rules execute on the render

## Goal

Run the design rules genesis authored as falsifiable thresholds as a script over the render
inventory — CTA count, touch-target size, contrast, colors within the token palette — at
`/spec:sketch` exit (over the mock render) and inside the render gate (over the component
render), replacing the Sonnet rule-checklist walk in both places and in `/spec:review`'s
design leg. Done means: a rule carrying a `renderCheck` fails closed with a measured number
against its threshold, and a rule without one is reported as source-side, never silently
dropped.
