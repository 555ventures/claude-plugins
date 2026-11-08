---
date: 2026-09-07
status: done
tier: standard
area: pipeline-gates
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-07
open_markers: 0
build_base: spec/20260907-01-02-03
diff_base: c3477e5f46a442cc7b730c02c873ee306984fcd3
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-02-1, AC-20260907-02-2]
---

# AC-drift backfill: retire or tag the 41 uncited criteria, then hold this repo at zero

## Goal

`ac-drift.js` (doctor check 17, specs/20260906/01) reports 41 acceptance criteria across 13
done specs that no test cites and no sanction covers. Every row was classified at plan time
(Assumptions A1): 38 describe surfaces a later spec or ruling deleted, 1 is covered by two
tests whose titles carry a suffixed id the full-token rule does not count, and 2 pin a
plugin changelog line that the last-3-versions rotation has since rolled off. Done means: each
bullet carries the `[retired: <path>]` provenance that retired it or the test carries the bare
id; `ac-drift --root .` prints zero findings on this repo; and one standing test in this
repo's suite keeps it at zero (JJ ruling 2026-09-07 — this repo blocks on drift; every other
host keeps the advisory doctor check and the advisory review-close line from
specs/20260907/01).
