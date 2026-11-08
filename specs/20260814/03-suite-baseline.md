---
date: 2026-08-14
status: done
diff_base: 4fd90683d604be55c9ed042045cdd7ed8ffb5177
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260814/01-ac-matrix-script.md", "specs/20260814/04-lock-signal-window.md"]
depended_on_by: ["specs/20260814/05-collision-closure.md"]
brief: 07
spiked: 2026-08-14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260814-03-1, AC-20260814-03-2, AC-20260814-03-3, AC-20260814-03-4, AC-20260814-03-5, AC-20260814-03-6, AC-20260814-03-7, AC-20260814-03-8, AC-20260814-03-9, AC-20260814-03-10, AC-20260814-03-11, AC-20260814-03-12, AC-20260814-03-14, AC-20260814-03-15, AC-20260814-03-16, AC-20260814-03-17, AC-20260814-03-13]
---

# suite-baseline.js — the sanctioned-red set becomes a checked-in, review-checked artifact

## Goal

The repo's expected-failing tests are folklore: prose plus a stale count in Test Rules, so a
full-suite run is unjudgeable, the pipeline gate had to be scoped, and a Decision that broke
five out-of-scope pins shipped through a green gate and a qualified-CLEAN review
(the 2026-08-14 escape on specs/20260813/10-host-capabilities.md). This spec declares the
set as `.claude/suite-baseline.json`, adds `spec/scripts/suite-baseline.js` (`--check` /
`--update`), and gives it two consumers: one **advisory** leg in review's Phase 0 — drift in
either direction becomes one mechanical finding — and one **blocking** check at the end of
`/spec:build` Phase 4, where a newly-broken test stops the build instead of shipping (D10,
amended 2026-08-14 on JJ's ruling after the third out-of-plan pin collision). Done = the
script's exec pins run green, the review.md leg line, the build.md consumer clause, and the
Test Rules pointer pins run green, and `verdict.js` provably derives the same word with or
without the new leg's row.
