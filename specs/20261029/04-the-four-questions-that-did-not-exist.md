---
date: 2026-10-29
status: done
build_base: main
tier: critical           # touches spec/scripts/verdict.js and spec/templates/grounding-contract.md (rules § Risk Tiers), spec/bin/spec-paths, and the review driver's prototype close
area: doctrine
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-29
diff_base: ff4eb9c15102f012eeeb80e79a648a9c0c43e0f7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-04-1, AC-20261029-04-2, AC-20261029-04-3, AC-20261029-04-4, AC-20261029-04-5, AC-20261029-04-6, AC-20261029-04-7, AC-20261029-04-8, AC-20261029-04-9]
---

# The four questions that did not exist

## Goal

The pipeline stops to ask the owner at the four places where a wrong silent default cannot be
undone, and nowhere else new: a commit that would stage a secret, a production verification that
failed with no rollback path, a critical-tier spec about to lock, and a prototype whose database
and branch are about to be deleted. Done means each of the four has one question with a
recommended default, each fires only when its trigger is present, and a run that never hits a
trigger sees no new prompt.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 1, 2, 3, 8.
