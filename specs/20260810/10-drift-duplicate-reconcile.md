---
date: 2026-08-10
status: done
diff_base: a33476f3586b571faa1bfccc6d00d59fad6c3b24
risk: T3                 # touches spec/scripts/spec-state-gate.sh (hook surface — T3 trigger per pipeline rules § Risk Tiers), header/claim text only
area: cross-cutting
design: false
breaking: false
depends_on: [20260810/09-stale-reference-sweep]   # overlapping files: shared.md, review.md, release.md, build.md
depended_on_by: []
brief: n/a               # audit-driven fix wave (command-surface audit 2026-08-10), slice 3 of 3
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-10-1, AC-20260810-10-2, AC-20260810-10-3, AC-20260810-10-4, AC-20260810-10-5, AC-20260810-10-6, AC-20260810-10-7, AC-20260810-10-8]
---

# Drift-duplicate reconcile: restated rules that now disagree with their originals

## Goal

Slice 3 of the 2026-08-10 command-surface audit fix wave: ten places where a rule was
restated and the copies have drifted into disagreement — within one file, across a
command/agent pair, or between a hook's claim and its behavior. Per shared.md § Doctrine
Authoring, sanctioned duplication is fine; *disagreeing* duplication is the defect. After
this spec each drifted pair has exactly one full statement (the home) and the other site
either cites it or is deleted. Done means no two passages state the same rule with different
consequences.
