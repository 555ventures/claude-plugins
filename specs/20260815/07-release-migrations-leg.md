---
date: 2026-08-15
status: done
diff_base: 23fea7c8d6d2436bc1e5680db78aac867600edfd
open_markers: 0
risk: T3                 # edits spec/scripts/verdict.js — the sole derivation of the review/release verdict word (named T3 trigger) — plus the hash-stamped grounding contract
area: release-integrity
design: false
depends_on: ["specs/20260815/06-redcheck-load-attribution.md"]
depended_on_by: []
breaking: false
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-07-1, AC-20260815-07-2, AC-20260815-07-3, AC-20260815-07-4, AC-20260815-07-5, AC-20260815-07-6, AC-20260815-07-7, AC-20260815-07-8]
---

# Release migrations leg: applied-vs-journal is only meaningful after the deploy

## Goal

A release can currently go CLEAN while the deployed database is missing every table the
milestone shipped (observed: hearwell, four migrations behind, journal 6 vs applied 2 —
INTAKE JJ-20260815-09), because migrations are one prose noun in release.md's Phase 1
manifest: nothing requires the row, and it runs **pre-deploy**, where "journal matches
applied" can hold by coincidence on a host whose deploy never applies migrations at all. Done
means: a host that declares a migrations check gets it **run after deploy+ready** as a
first-class release leg whose absence derives UNVERIFIED and whose red derives GATE_RED
through the existing verdict machinery — no new checker — and a host with a detected
migrations directory can no longer *silently* omit the declaration. The check command is
host-declared, never invented by the plugin.
