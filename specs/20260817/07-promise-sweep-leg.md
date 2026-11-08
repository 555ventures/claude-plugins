---
date: 2026-08-17
status: done
diff_base: d5fdcc63ff0e5c85c6729eb44a3956469f0ef8c2
tier: critical           # edits verdict.js + review-legs.js — both named critical triggers in host rules § Risk Tiers
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 09
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-07-1, AC-20260817-07-2, AC-20260817-07-3, AC-20260817-07-4, AC-20260817-07-5, AC-20260817-07-6, AC-20260817-07-7, AC-20260817-07-8, AC-20260817-07-9, AC-20260817-07-10, AC-20260817-07-11, AC-20260817-07-12, AC-20260817-07-13, AC-20260817-07-14, AC-20260817-07-15]
---

# Promise-sweep leg: every Decision row names its carrier

## Goal

The v7 replay eval measured the single reviewer's one systematic miss class: spec Decisions
that promise behavior nothing implements — no test fails, so nothing points at them (all
five measured misses were Decisions-table rows). This spec retires the prose response
(reviewer diligence) with a deterministic leg: a new `promise-sweep.js` enumerates every
Decisions-table row and requires each to name a carrier — an AC-ID from the same spec
(whose test the existing ac-matrix leg already forces to exist and execute) — or an
explicit `[no-ac: <reason>]` sanction. Orphans are hard findings on the review disposition
flow; the same script runs advisory at plan lock so orphans die at authoring time. Done
means: the leg runs in every review (`review-legs.js`), its absence fails the verdict
closed (`verdict.js`), reviewer.md's prose sweep shrinks to the semantic half, and core.md
records the critical-tier ruling — scoped non-redundant legs, never a second general
reviewer.
