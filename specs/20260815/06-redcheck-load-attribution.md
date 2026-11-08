---
date: 2026-08-15
status: done
diff_base: 45a2eca0e3cf20c70ff996c830693edd67294398
open_markers: 0
risk: T3                 # rewrites wf-build.body.js through the codegen seam (named T3 trigger) — a defect here corrupts the TDD red-first evidence floor for every host
area: build-integrity
design: false
depends_on: ["specs/20260815/05-env-preflight.md"]
depended_on_by: ["specs/20260815/07-release-migrations-leg.md"]
breaking: false
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-06-1, AC-20260815-06-2, AC-20260815-06-3, AC-20260815-06-4, AC-20260815-06-5, AC-20260815-06-6, AC-20260815-06-7, AC-20260815-06-10, AC-20260815-06-8, AC-20260815-06-9, AC-20260815-06-11]
---

# Red-check load attribution: a file that never ran proves nothing

## Goal

wf-build's TDD red-check validates a new test by "fails before, passes after" — but a test
file whose import crashes at load time is "failing" while executing zero assertions, and a
spec's first act is overwhelmingly a new export, so the vacuous case is the *common* case.
Measured consequence (hearwell, INTAKE JJ-20260815-07): deleting the six words implementing a
spec's headline guarantee left 9/9 tests green through a two-reviewer CLEAN panel. Done means:
a red observation is **attributed** — "an assertion ran and failed" satisfies a red
expectation, "the file crashed before running anything" fails closed as unverified exactly
like every other uncertain path in `crossCheckSentinels()` — and the probe has a sanctioned,
tree-clean route (inert stubs) to *demonstrate* that a load-blocked carrier's assertions are
real. Compile-time-only carriers (the 20260813/10 deadlock class) stay classifiable red.
