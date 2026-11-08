---
date: 2026-11-04
status: done
tier: standard           # 📌 auto-picked (D0); the host's § Risk Tiers names verdict.js and review-legs.js — every AC carries a literal example so a mid-build upgrade costs nothing
area: gate-integrity
breaking: false
depends_on: [specs/20261103/12-one-suite-run-per-tree.md]
brief: n/a
spiked: 2026-11-04
open_markers: 0
diff_base: 15a0c61480e37b6a7c817471c055640e8bedb8b8
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261104-01-1, AC-20261104-01-2, AC-20261104-01-3, AC-20261104-01-4, AC-20261104-01-5, AC-20261104-01-6, AC-20261104-01-7, AC-20261104-01-8, AC-20261104-01-9, AC-20261104-01-10, AC-20261104-01-11, AC-20261104-01-12, AC-20261104-01-13]
---

# The legs seal the manifest

## Goal

The review evidence manifest (`<spec>.review/manifest-N.jsonl`) has two readers that disagree:
the review driver's disposition pool takes every red non-blocking row, while `verdict.js` keeps
only the last row per leg. Any leg script re-run by hand with `--manifest` pointing at the live
file appends rows nothing notices, and the two readers then deadlock `--mark dispositions`
(observed on 20261103/13 round 2: "2 dispositions exceed pool of 1" against "does not cover
leg:ac-matrix"). Done means one shared manifest reader for every script that reads a manifest, a
duplicate leg row surfacing as invalid evidence rather than being resolved by either reader, the
driver recording a digest of each manifest the moment its legs run wrote it and refusing every
later invocation on drift with a remedy that names the cause, and the reviewer and disposer
prompts telling those agents to re-run a leg only against a scratch copy.
