---
date: 2026-09-03
status: done
tier: standard
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260903/07-test-file-budget-guard.md]
brief: n/a
open_markers: 0
diff_base: 9880ad962a0c295dd45381840e2eaa068fd230a9
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-06-1]
---

# Test suite critical path: split the three serial review-driver files

## Goal

`npm test` takes 85–90 s, and the pipeline runs it twice per spec (the blocking `suite` review
leg and the close-time re-run), so every spec waits about three minutes on a suite whose
CPU work is spread over 18 cores. One file, `tests/review/review-driver.test.js`, takes
94.6 s on its own: `node:test` runs files in parallel but the tests inside one file serially,
so that file's serial runtime IS the whole suite's wall clock. This spec splits that file and
the two next-worst (`escalate-row.test.js` 25.8 s, `disposer-gate.test.js` 18.0 s) into
sibling files grouped by owning AC family, moving every test verbatim. Done means: the same
tests run from more files, nothing asserted changes, and the suite's critical path drops from
~95 s to the low teens (the next floor is `smoke-shutdown-behavior` at 14.4 s, real `sleep`
polls, inherent). The durable guard against the trap re-forming is sibling spec 07.
