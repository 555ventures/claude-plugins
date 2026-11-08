---
date: 2026-10-25
status: done
build_base: main
tier: standard
area: cross-cutting
breaking: true           # fleet-reader --json loses the `owed` key and --owed flag; commit-coverage loses two modes
depends_on: ["specs/20261025/01-the-commit-writes-the-escape-row.md"]
brief: n/a
open_markers: 0
diff_base: 84cf542ca6cda74cce6078d9f110b17b05fd17f7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261025-02-1, AC-20261025-02-13, AC-20261025-02-2, AC-20261025-02-3, AC-20261025-02-4, AC-20261025-02-5, AC-20261025-02-14, AC-20261025-02-6, AC-20261025-02-7, AC-20261025-02-8, AC-20261025-02-9, AC-20261025-02-10, AC-20261025-02-11, AC-20261025-02-15, AC-20261025-02-12]
---

# Readers keep only the surviving escape fields

## Goal

Sibling 01 slimmed the escape row to spec, files, review run, class, sha and via, and retired
the command that wrote the rest. This spec brings the readers in line: the fleet reader stops
counting fields no writer produces (`killedMatch`, `softMatch`, `preventedBy`, amendments, the
backfill work list) and drops the owed query that was built on `preventedBy`; commit coverage
keeps only the one derivation the commit uses; doctor, release and the Incident Policy's
materiality line describe the ledger as it now is; the last mentions of `/spec:escape` and the
dead fields leave `spec/` and `git/`. Done means a zero-hit grep for the retired names across
the plugin tree and a fleet reader whose escape block carries six keys.
