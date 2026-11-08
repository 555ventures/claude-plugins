---
date: 2026-08-13
status: done
diff_base: 607085137519e2a7ee1e0e398a92ac90d2550a5b
open_markers: 0
risk: T3
area: report-surface
design: false
breaking: false
depends_on: ["specs/20260813/05-workflow-correctness-repairs.md"]
depended_on_by: ["specs/20260813/06a-return-envelope-corrections.md", "specs/20260813/07-command-report-conformance.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-06-1, AC-20260813-06-2, AC-20260813-06-3, AC-20260813-06-4, AC-20260813-06-5, AC-20260813-06-6, AC-20260813-06-7, AC-20260813-06-8, AC-20260813-06-9, AC-20260813-06-10, AC-20260813-06-11]
---

# Report renderer — one script owns the console skeleton; workflow returns carry its slots

## Goal

Give the console-output contract its first deterministic carrier: a renderer script that is
the sole authority on the end-of-run report skeleton (the spec-status precedent — the render
lives in a script, the model never restyles), and extend the workflow return schemas so
every slot the skeleton needs arrives as data instead of being freehanded at report time.
Done means: the renderer exists behind a `spec-paths` key with exec tests, shared.md
§ Console Output Style delegates the render to it, and the six workflow bodies return the
fields the audit found missing (impact, exhaustion cause, degradation flags). Command-side
adoption is spec 07.
