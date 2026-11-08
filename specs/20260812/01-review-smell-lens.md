---
date: 2026-08-12
status: done
diff_base: 6a09b2e9f4330fddebb7404ead2e08cf6901b599
risk: T3
open_markers: 0
area: spec-review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 04
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260812-01-1, AC-20260812-01-2, AC-20260812-01-3, AC-20260812-01-4, AC-20260812-01-5, AC-20260812-01-6, AC-20260812-01-7, AC-20260812-01-8]
---

# Review advisory smell lens: semantic duplication + error masking

## Goal

`wf-review` gains one dedicated advisory finding source — the **smell lens** — scoped to the
two research-backed AI-signature smell classes the deterministic ratchet layer
(specs/20260810/06) cannot see: *semantic* duplication (a diff symbol re-implementing a job an
existing repo symbol already does) and *error masking* (catch/fallback/default code that
converts a shape or contract bug into wrong-but-green behavior). Lens findings are advisory by
construction: they travel in their own return field, never enter the verification kill loop,
never affect the verdict word, and render in their own labeled report section where the user
accepts (→ durable dated row in `docs/audit/advisory-findings.md`) or dismisses (→ expires).
Done means: the lens runs on every full-scope review, its advisory-only property is pinned by
executed tests against `verdict.js`, and the reviewer doctrine sanctions the two classes as
lens output without reopening general taste review.
