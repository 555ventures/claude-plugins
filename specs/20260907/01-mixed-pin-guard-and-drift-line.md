---
date: 2026-09-07
status: done
tier: standard
area: pipeline-gates
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260907/02-ac-drift-backfill.md]
brief: n/a
spiked: 2026-09-07
open_markers: 0
build_base: spec/20260907-01-02-03
diff_base: 59a2dedacfefca44483a3737d198715e19472c0c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-01-1, AC-20260907-01-2, AC-20260907-01-3, AC-20260907-01-4, AC-20260907-01-5, AC-20260907-01-6, AC-20260907-01-7, AC-20260907-01-8, AC-20260907-01-9, AC-20260907-01-10, AC-20260907-01-11, AC-20260907-01-12, AC-20260907-01-13]
---

# Mixed-pin guard (`pinShape`) at lock, build and review, plus the advisory AC-drift line at review close

## Goal

An acceptance criterion that carries both a new promise (`THE SYSTEM SHALL …`) and a
regression pin (`SHALL CONTINUE TO …`) in one bullet is read by build's red-check as a pin,
so the file that should prove the new promise red-first is sanctioned green and the promise
ships untested. Three build sessions found and split such bullets by hand
(specs/20260903/01 D16, specs/20260906/01, specs/20260906/04 AC-3/AC-8); the corpus spike
in Assumptions A1 shows the class is 51 bullets wide across 148 specs. Done means: one
predicate in `lib/spec-sections.js` classifies every AC bullet as `promise`, `pin`, or
`mixed`; `ac-matrix.js --lint` refuses a mixed bullet at `/spec:plan` lock; `red-check.js`
refuses it at build Phase 1 with a named split remedy instead of sanctioning the file; the
review's full `ac-matrix` run warns on it without reddening a leg. Separately, the review
driver's close step prints one advisory line with the repo's current AC-pin drift count so
drift is seen at the moment it is created rather than at the next doctor run (JJ ruling
2026-09-06: advisory, never a leg).
