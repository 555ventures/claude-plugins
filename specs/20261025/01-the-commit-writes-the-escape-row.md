---
date: 2026-10-25
status: done
build_base: main
tier: critical           # spec-status.js's frozen --json action set changes (host rules § Risk Tiers)
area: cross-cutting
breaking: true           # the /spec:escape command is deleted; the escape row loses six fields
depends_on: []
brief: n/a
open_markers: 0
diff_base: 571def24b747360c067fd705c25dbd33d3d37744
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261025-01-1, AC-20261025-01-2, AC-20261025-01-3, AC-20261025-01-4, AC-20261025-01-5, AC-20261025-01-6, AC-20261025-01-7, AC-20261025-01-8, AC-20261025-01-14, AC-20261025-01-15, AC-20261025-01-9, AC-20261025-01-10, AC-20261025-01-11, AC-20261025-01-12, AC-20261025-01-13]
---

# The commit writes the escape row; /spec:escape retires

## Goal

An escape row is the only record that a CLEAN review verdict was wrong, and today it is written
by a separate command behind a yes/no offer at commit time; the walkthrough host has one row
across about 111 runs, so the record is not being kept. After this spec, a fix commit that
touches lines a reviewed spec landed records the escape row itself, with no offer and at most
one question (the defect class); `/spec:escape`, its six derived fields (`foundBy`, `severity`,
`killedMatch`, `softMatch`, `preventedBy`, `unclassedReason`), its amendment and backfill
modes, and its Gotchas write are deleted. Done means: `/git:commit` step 3 appends the slim
row through `escape-row.js --append`, every reader of the escape ledger still runs, and no
command, doctrine or status line names `/spec:escape`.
