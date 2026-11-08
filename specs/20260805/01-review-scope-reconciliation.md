---
date: 2026-08-05
status: done
open_markers: 0
risk: T3
area: review
design: false
breaking: false
depends_on: []
depended_on_by: [02-review-evidence-manifest.md]
brief: n/a
spiked: 2026-08-05
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260805-01-1, AC-20260805-01-2, AC-20260805-01-3, AC-20260805-01-4, AC-20260805-01-8, AC-20260805-01-5, AC-20260805-01-6, AC-20260805-01-7, AC-20260805-01-9]
---

# Review scope reconciliation — full diff, File Plan as prediction under test

## Goal

`/spec:review` currently diffs only the directories named in the spec's File Plan, so any
edit outside the plan is never seen by a reviewer — the structural gap behind the confirmed
2026-08 host escape (an out-of-plan `waitForExit` edit rode a CLEAN verdict into production).
This spec makes review diff the **whole** change and mechanically reconcile it against the
File Plan's prediction: out-of-plan files become findings AND get reviewed; planned-but-
untouched files become findings too. Done means: no file can change without either appearing
in the File Plan or surfacing as a disposition-requiring finding, enforced by a script, not
by reviewer diligence.
