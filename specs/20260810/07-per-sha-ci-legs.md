---
date: 2026-08-10
status: done
risk: T3                 # touches verdict.js — the sole review/release verdict derivation (pipeline rules § Risk Tiers)
area: cross-cutting
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a               # incident-driven (Prax stale-CI review stop, 2026-08-10); no roadmap brief warranted
spiked: 2026-08-10
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-07-1, AC-20260810-07-2, AC-20260810-07-3, AC-20260810-07-4, AC-20260810-07-5, AC-20260810-07-6, AC-20260810-07-7, AC-20260810-07-8, AC-20260810-07-9, AC-20260810-07-10, AC-20260810-07-11, AC-20260810-07-12]
---

# Per-SHA CI legs: review stops blocking on stale runs; release gains the authoritative CI check

## Goal

`/spec:review`'s `ci` leg currently asks GitHub for the **latest run on the branch**, so a red
run attached to a stale pre-spec commit hard-stops a review of unpushed work and forces
mid-review push-and-wait cycles (Prax incident, 2026-08-10). After this spec: a review blocks
on CI **only when a completed red run exists for the exact commit under review**; everything
else (stale run, unpushed work, in-progress, no CI) records informationally and never blocks.
`/spec:release` gains the authoritative CI leg on the release SHA, and `/spec:doctor` gains a
check that the host's CI workflow invokes the configured `gateCommand` — the single-source-of-
truth rule that prevents local-green/CI-red drift at the root. Done means: no review can ever
be stopped by CI evidence about a different commit, and a red run on the exact reviewed or
released commit still blocks exactly as before.
