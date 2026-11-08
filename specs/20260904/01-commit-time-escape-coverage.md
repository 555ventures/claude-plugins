---
date: 2026-09-04
status: done
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 25
open_markers: 0
diff_base: d542a092b9c0ffb9b86ae2c7aebb8e5fafa1532a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260904-01-1, AC-20260904-01-2, AC-20260904-01-3, AC-20260904-01-4, AC-20260904-01-5, AC-20260904-01-6, AC-20260904-01-7, AC-20260904-01-8, AC-20260904-01-9, AC-20260904-01-10, AC-20260904-01-11, AC-20260904-01-12, AC-20260904-01-13, AC-20260904-01-14]
---

# Commit-time escape coverage: one derivation, and an offer that reaches the fixes it misses

## Goal

Make the share of fix commits that record an escape row a number a script prints — per repo
and fleet-wide, population first — and move `/git:commit`'s escape offer onto that same
derivation so it fires on every fix-typed commit that touches a file a reviewed spec landed,
instead of depending on commit-message archaeology. Done means: `commit-coverage.js` ships
with a commit mode (the offer's oracle), a window mode (one repo's share), and a fleet mode
(every checkout on this machine, population from the fleet reader); `/git:commit` step 3 runs
the commit mode and offers on `offer: true`; no commit is ever blocked, no decline is
recorded, and the fleet reader is untouched.
