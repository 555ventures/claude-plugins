---
date: 2026-09-11
status: done
tier: critical
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260911/03-tests-expire-at-close.md]
brief: n/a
open_markers: 0
build_base: main
diff_base: 1e2836182d08684ddeb4cc836c3d8ad13a51a38e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260911-02-1, AC-20260911-02-2, AC-20260911-02-4, AC-20260911-02-5, AC-20260911-02-6, AC-20260911-02-10, AC-20260911-02-11, AC-20260911-02-12]
---

# The test count is instrumented

## Goal

A repo's test-case count becomes a derived, recorded number instead of an unmeasured one. One
scanner (`lib/scan-test-calls.js`) is the single definition of "a test case"; one CLI reports the
count; the review writes it to the evidence manifest as an advisory row, so growth per closed
spec is readable from the ledger. There is no limit, no gate and no hook — the count is
measurement, never a verdict. Done means: the scanner and its CLI exist, the review leg records
the count and can never redden a verdict, and `spec/test-ceiling.json` is gone.
