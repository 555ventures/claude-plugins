---
date: 2026-08-13
status: done
diff_base: e73193298027348bfe497cf6a3bb17702103ba1d
open_markers: 0
risk: T2
area: doctrine-reports
design: false
breaking: false
depends_on: ["specs/20260813/06-report-renderer.md", "specs/20260813/06a-return-envelope-corrections.md"]
depended_on_by: ["specs/20260813/08-question-contract.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-07-1, AC-20260813-07-2, AC-20260813-07-3, AC-20260813-07-4, AC-20260813-07-5, AC-20260813-07-7, AC-20260813-07-6]
---

# Command report conformance — every command adopts the rendered skeleton, one test pins all of them

## Goal

Migrate every command's end-of-run report and failure path onto the spec-06 renderer and pin
the whole surface with one consistency test, closing audit Class A (8 of 16 spec commands
end off-contract, findings commands don't stage the fix, failure paths are ungoverned free
prose) and Class D2 (the git plugin is a contract-free zone). Done means: every non-exempt
command file carries a conforming ```report template + the renderer invocation, every STOP
path uses the shared two-line STOP shape, and the new test fails on any future drift.
