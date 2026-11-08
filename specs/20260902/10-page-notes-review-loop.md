---
date: 2026-09-02
status: done
build_base: main
tier: standard
area: mocks
design: false
breaking: false
depends_on: [specs/20260902/09-one-hand-wireframes-one-token-set.md]
depended_on_by: [specs/20260902/11-brief-from-approved-set.md]
brief: 22
open_markers: 0
diff_base: c68d4d17147233f0b31db30ead9bd2f59ba7dac2
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-10-1, AC-20260902-10-2, AC-20260902-10-3, AC-20260902-10-4, AC-20260902-10-5, AC-20260902-10-6, AC-20260902-10-7, AC-20260902-10-8, AC-20260902-10-9, AC-20260902-10-10]
---

# Review loop: page notes at two scopes, batch triage, author resolves

## Goal

Feedback is written on the served pages and stored beside the mocks, never in chat and never
in mock markup: `design-atlas.js serve` injects a notes layer at serve time (`?clean` removes
it for capture) and exposes add/list/resolve endpoints writing `design/mocks/notes.json`. A
note is anchored to a screen + state (mock scope) or to the project (project scope), never to
an element. The loop is batch: notes accumulate in a sitting, the user says go, the driver
prints the open notes grouped by scope → journey → screen → state, the session triages each
into four bins and prints them, the user says go or overrides, the session redraws, records
what changed under each note, and marks it addressed; the author resolves after a re-look.
Any open project note blocks all mock-note work. Zero open notes on a journey is that
journey's approval mark. Client review is the same loop with the named decider. Done = the
layer runs from the spike's shape on the shared tokens, the driver's approval marks read
notes.json, and the loop is the command's review step.
