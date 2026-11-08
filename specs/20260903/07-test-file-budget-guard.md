---
date: 2026-09-03
status: done
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: [specs/20260903/06-test-suite-critical-path.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 9796f9da2228f414ec630077ba3fff3c3de5dcfb
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-07-1, AC-20260903-07-2, AC-20260903-07-3, AC-20260903-07-4, AC-20260903-07-5, AC-20260903-07-6, AC-20260903-07-7]
---

# Per-file runtime budget: the suite goes red when one test file becomes the floor

## Goal

Sibling spec 06 splits the one test file whose serial runtime was the whole suite's wall
clock. Nothing stops the next file that grows past fifty exec-a-script tests from silently
becoming the floor again — the suite stays green, only slower, and nobody times it. This spec
makes that condition red: a `node:test` custom reporter sums each file's test durations and,
when any file exceeds a fixed budget, prints the file with a "split this file" remedy and
fails the run. It is wired into both spellings of the suite this repo runs — `npm test` (the
doctor's claim and JJ's hand runs) and the host `testCommand` (the review's `suite` leg, the
close-time re-run, red-check's per-file runs). Done means: a file over budget cannot pass the
`suite` leg, an under-budget suite is unchanged apart from one extra summary line, and the
reporter can never turn a failing run green.
