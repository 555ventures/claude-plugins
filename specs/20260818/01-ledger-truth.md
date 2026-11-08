---
date: 2026-08-18
status: done
diff_base: 6839e10c90edf35ad8293ece19f26631f7e88ff4
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260818-01-1, AC-20260818-01-2, AC-20260818-01-3, AC-20260818-01-4, AC-20260818-01-5, AC-20260818-01-6, AC-20260818-01-7, AC-20260818-01-8, AC-20260818-01-9, AC-20260818-01-10]
---

# Ledger truth: verdict.js fails closed on leg findings, ledger rows stay legible

## Goal

Close the four review-accounting defects found by the 2026-08-18 Fable retainer consult on
v7's first full pipeline run. After this spec: `verdict.js` can never derive `CLEAN` while a
findings leg's red row sits undispositioned; ledger leg rows keep their `observed` string so
"CI passed" and "no CI exists" are distinguishable forever; every review ledger row carries a
`runId` so `/spec:escape` can correlate an escape back to the review that missed it; and the
build row's two counts (`deviations`, `diff.loc`) mean what their names say. Done = all four
demonstrated by executed tests and the colliding prior pins updated in place.
