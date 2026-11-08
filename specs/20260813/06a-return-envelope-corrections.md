---
date: 2026-08-14
status: done
diff_base: 58ac2a2c6a470059f2108c3908458dea6e0f59f3
open_markers: 0
risk: T3
area: report-surface
design: false
breaking: false
depends_on: ["specs/20260813/06-report-renderer.md"]
depended_on_by: ["specs/20260813/07-command-report-conformance.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-06a-1, AC-20260813-06a-2, AC-20260813-06a-3, AC-20260813-06a-4, AC-20260813-06a-5, AC-20260813-06a-6]
---

# Return-envelope corrections — repeal the runId echo, single-source GATE, minority-preserving research cap

## Goal

Correct three defects spec 06 landed in the workflow return envelopes, before spec 07 builds
19 command reports on top of them: (1) the `runId` echo is built on a false premise — a
workflow script cannot know its own run id, so every envelope now carries a provenance field
that is always `undefined`; (2) spec 06's GATE-schema loosening was applied to wf-build only,
so the twin gate schemas (whose shared loop lives in one fragment precisely to prevent drift)
now disagree; (3) the wf-research option cap cuts purely by rank, which can silently discard
a minority option the research prompt explicitly orders preserved, and records cuts with no
dimension attribution. Done means: no workflow return names `runId`, the orchestrator remains
the sole provenance stamp-point, `const GATE` has exactly one definition (in the fragment,
beside its sole reader), and the research cap is minority-preserving with dimension-attributed
`alsoConsidered` — all pinned by the amended test file.
