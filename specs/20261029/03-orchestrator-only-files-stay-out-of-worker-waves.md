---
date: 2026-10-29
status: done
build_base: main
tier: critical
area: build
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-29
diff_base: a5b7078d127d4cc30ed5986a31595f96d93cd469
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-03-1, AC-20261029-03-2, AC-20261029-03-3, AC-20261029-03-4, AC-20261029-03-5, AC-20261029-03-6, AC-20261029-03-7]
---

# Orchestrator-only files stay out of worker waves

## Goal

A host can list the files that only the orchestrator may change. The build driver then keeps
those files out of every worker dispatch — in the wave steps and in the repair step — and
prints them as lines the orchestrator applies itself. Today the driver routes every File Plan
row by layer alone, so a file the host forbids workers to touch still lands in a worker's file
list (zubu-backend spec `specs/20261021/02-auth-middleware-real-401s.md`, review
`rv_5f5596b21c43`: a persistence worker edited `src/zubu/mappers.py`, a hard finding, fix commit
`c31f4e5`). Done means: a host that declares the list never sees one of its files in a worker's
batch, and a host that does not declare it builds exactly as today.
