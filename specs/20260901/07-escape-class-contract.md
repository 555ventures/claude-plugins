---
date: 2026-09-01
status: done
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260901/08-corpus-derivation-and-kill-match.md]
brief: 19
open_markers: 0
build_base: main
diff_base: 53da29e06b1fc3146cde390c4f135288bc68b93b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-07-1, AC-20260901-07-2, AC-20260901-07-3, AC-20260901-07-4, AC-20260901-07-5, AC-20260901-07-6, AC-20260901-07-7, AC-20260901-07-8, AC-20260901-07-9, AC-20260901-07-10, AC-20260901-07-11, AC-20260901-07-12, AC-20260901-07-13, AC-20260901-07-14, AC-20260901-07-17, AC-20260901-07-15, AC-20260901-07-16]
---

# Escape class contract — validated classes, append-only amendments, the joined count

## Goal

Every escape row carries either a validated defect class or an explicit reason it has none, and
the 24 historical rows across six repos become repairable without rewriting a byte: one
deterministic script owns escape-row validation and the ledger append, an append-only
`escape-class` amendment row fixes a historical row's class, and the fleet reader joins
amendments when it counts recurrences, lists the rows still needing a class, and flags
unvalidated rows as drift. `/spec:escape` classifies registry-first (existing fleet classes
before an invented id) and gains the one-time fleet-wide backfill mode. Done means the third-
recurrence rule in core § Incident Policy fires on the joined count, and the fleet reader's
`unclassedRows` is the one list the backfill run consumes.
