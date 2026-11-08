---
date: 2026-08-23
status: done
diff_base: ce6488c9b8c8d63a551c4f7469ef982cf548d101
tier: standard
area: review-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 13
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-07-1, AC-20260823-07-2, AC-20260823-07-3, AC-20260823-07-4, AC-20260823-07-5, AC-20260823-07-6, AC-20260823-07-7]
---

# Deviations Sidecar Backstop — mechanized shape + fold enforcement

## Goal

The deviations sidecar (`<spec minus .md>.deviations.md`) is today pure convention: build
sessions append departure entries by hand, review folds and deletes the file by hand, and
nothing catches a fold that never ran or an entry written in a shape the ledger count cannot
see. This spec gives the existing convention deterministic teeth inside the review driver's
existing machinery: the driver observes and validates the sidecar whenever it derives state,
enumerates every entry into the printed CLOSE step, and refuses `--mark closed` while the
sidecar still exists on disk or while its last observation recorded shape-invalid lines.
Done means: a skipped fold or a count-invisible entry is a driver refusal with a printed
remedy, not a silent loss — with zero new legs, agents, scripts, or ledger fields.
