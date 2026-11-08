---
date: 2026-08-10
status: done
risk: T3                 # edits spec/templates/grounding-contract.md (hash-stamped into every host) and spec/bin/spec-paths (new key) — both T3 triggers per pipeline rules § Risk Tiers
area: cross-cutting
design: false
breaking: false
depends_on: [20260810/08-command-conflict-fixes]   # overlapping files: review.md, release.md, doctor.md, init.md, genesis-design.md
depended_on_by: [20260810/10-drift-duplicate-reconcile]
brief: n/a               # audit-driven fix wave (command-surface audit 2026-08-10), slice 2 of 3
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-09-1, AC-20260810-09-2, AC-20260810-09-3, AC-20260810-09-4, AC-20260810-09-5, AC-20260810-09-6, AC-20260810-09-7, AC-20260810-09-8, AC-20260810-09-9, AC-20260810-09-10, AC-20260810-09-11, AC-20260810-09-12]
---

# Stale-reference sweep: retired mechanisms, dead citations, and the checker that keeps them dead

## Goal

Slice 2 of the 2026-08-10 command-surface audit fix wave: twelve findings where doctrine
references mechanisms that were retired, scripts that behave differently, or `§` headings
that don't exist — each one misdirects a fresh session that takes the text at face value.
This spec deletes or corrects every one, and lands a small deterministic checker
(`citations-check.js`, advisory doctor check 20) so the `§`-citation class — six instances
in this audit alone — can never silently accumulate again. Done means a fresh session
following any corrected passage reaches a mechanism that actually exists.
