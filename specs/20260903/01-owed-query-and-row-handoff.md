---
date: 2026-09-03
status: done
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 23
open_markers: 0
build_base: main
diff_base: 841b3de18b61ec869fd560e27f4b3b4c1f51267f
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-01-1, AC-20260903-01-2, AC-20260903-01-3, AC-20260903-01-4, AC-20260903-01-5, AC-20260903-01-6, AC-20260903-01-7, AC-20260903-01-8, AC-20260903-01-9, AC-20260903-01-10, AC-20260903-01-11, AC-20260903-01-12, AC-20260903-01-13, AC-20260903-01-14, AC-20260903-01-15, AC-20260903-01-16, AC-20260903-01-17]
---

# Owed query and row-as-handoff: hosts emit rows, the plugin reads them

## Goal

Close the open edge of the feedback loop without adding state. A host session that meets a
plugin defect records the ledger row it already knows how to write and its report ends with
the row's key — no handoff prompt is composed. In the plugin repo, one fleet-reader query
(`--owed`) lists every plugin-blaming row across this machine's checkouts — plugin-blaming
escape rows, missed replay rows, and unstamped findings in the legacy `docs/spec-feedback/`
briefs — grouped by class with the joined recurrence count, a pointer to the response
core § Incident Policy admits at that count, and a fixed-status derived from whether a
plugin spec or test already cites the row's key. Replay rows gain the same `via` provenance
build and review rows carry, so the manual retry path becomes a ledger count. Done means:
the three deliverables ship behind executed tests, every existing fleet-reader/replay/escape
pin stays exhaustive (updated in place, never loosened), and nothing stores state between runs.
