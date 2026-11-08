---
date: 2026-10-29
status: done
build_base: main
tier: standard           # touches decision-lint.js, two lib parsers, four doctrine files and tests — none is a rules § Risk Tiers surface (no spec-paths key, no grounding-contract edit, no verdict.js/spec-status.js edit)
area: doctrine
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-31
diff_base: cc203196fb9f38af3feeb03534afa822e73e1f23
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-05-1, AC-20261029-05-2, AC-20261029-05-3, AC-20261029-05-4, AC-20261029-05-5, AC-20261029-05-6, AC-20261029-05-7]
---

# Structural triggers at plan time: breaking changes, new dependencies, persisted-data changes

## Goal

Three kinds of change that a product owner expects to hear about before they land get a reader
in the plan stage: a spec marked `breaking: true`, a File Plan that adds or changes a dependency,
and a non-empty Data Model that touches persisted rows. None of them adds a question by default;
each is read at lock by the lint that already runs there, and only the critical-tier path
(a persisted-data change, or a dependency row on an already-critical spec) rides the existing
lock confirmation. Done means `breaking:` has a consumer at lock and at release, a
manifest-or-lockfile row prints what it adds and must name its packages, and a non-empty Data
Model forces `tier: critical` and must say whether existing rows are affected.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 5, 6, 7.
