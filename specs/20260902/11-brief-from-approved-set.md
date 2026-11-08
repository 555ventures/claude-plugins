---
date: 2026-09-02
status: done
build_base: main
tier: critical             # spec-status.js is a frozen-API critical surface (pipeline rules § Risk Tiers)
area: genesis
design: false
breaking: false
depends_on: [specs/20260902/08-genesis-shrink-brief-state.md, specs/20260902/10-page-notes-review-loop.md]
depended_on_by: []
brief: 22
open_markers: 0
diff_base: 55883225efa714d1cddecfe257c88cc27d50b19b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-11-1, AC-20260902-11-2, AC-20260902-11-3, AC-20260902-11-4, AC-20260902-11-5, AC-20260902-11-6, AC-20260902-11-7, AC-20260902-11-8, AC-20260902-11-9, AC-20260902-11-10, AC-20260902-11-11, AC-20260902-11-12, AC-20260902-11-13]
---

# Brief from the approved set, roadmap from the journeys, shell and inventory extracted

## Goal

Genesis derives instead of guessing: BRIEF generates its content from the approved set and
the ledger (journeys, surfaces, personas, states, product facts) plus a non-UI coverage
checklist so screen-less facts are not dropped; ROADMAP decomposition derives from the seed's
journeys and every journey label lands in exactly one brief; SCAFFOLD/SKELETON extract the
shell canon and the component inventory from the composed set (brief 20's `shell adopt` and
drift check are the mechanism, fed from extraction); the framework menu is priced against the
seed's primary-surface and horizon rows; and the misunderstandings table becomes a pipeline
record with a `/spec:status` count line. Done = each derivation is a driver closure check
with a refusal that names the missing item.
