---
date: 2026-10-24
status: done
build_base: main
tier: critical
area: feedback-loop
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 0a44191f4e57fed0f75d2b29ba6ccfa174ec18ca
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261024-05-1, AC-20261024-05-2, AC-20261024-05-3, AC-20261024-05-4, AC-20261024-05-5, AC-20261024-05-6, AC-20261024-05-7, AC-20261024-05-8, AC-20261024-05-9, AC-20261024-05-10, AC-20261024-05-11, AC-20261024-05-12]
---

# Replay retired

## Goal

Mutation replay measured the reviewer's catch-rate by injecting a known defect into a
reviewed tree. It ran 38 times, last on 2026-09-14; 335 reviews have landed since the
harness was built and none in the last 40 days used it. It holds 6,755 lines across a
script, a corpus library, a command, a doctrine file and five test files, plus a dueness
footer and fleet queries. This spec removes it as one unit, leaves the escape ledger as the
pipeline's one ground-truth signal, and records the decision in an ADR. The prototype
REPLAY step of the build stage is a different feature and is untouched.
