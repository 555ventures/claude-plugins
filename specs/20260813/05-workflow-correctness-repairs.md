---
date: 2026-08-13
status: done
diff_base: 4d476ffe8889698f3170d560141d80fb095b4d42
open_markers: 0
risk: T3
area: workflows
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260813/06-report-renderer.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-05-1, AC-20260813-05-2, AC-20260813-05-3, AC-20260813-05-4, AC-20260813-05-5, AC-20260813-05-6, AC-20260813-05-7, AC-20260813-05-8, AC-20260813-05-9, AC-20260813-05-10, AC-20260813-05-11, AC-20260813-05-12, AC-20260813-05-13, AC-20260813-05-15, AC-20260813-05-14]
---

# Workflow correctness repairs — gate placeholders, review emphasis, twin drift, trust boundaries

## Goal

Fix the workflow layer's live correctness defects found by the 2026-08-13 audit
(docs/audit/style-audit-2026-08-13.md, Class F) plus one the blind-spot pass found beyond
it: the design gate that can never pass on placeholder-using hosts, the review command's own
gate leg running the raw placeholder-bearing `gateCommand` (unconditional red on every
review of such hosts), the review coverage emphasis that never runs on single-reviewer
panels (the majority path), the unsentineled red-check, the wf-design/wf-build twin drift,
and the unguarded trust boundaries. Done means: every finding is either fixed with a pinning
test or explicitly rejected in Rationale, and the shared gate-repair machinery lives in
fragments so the twins cannot drift again.
