---
date: 2026-09-12
status: done
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/client-mocks/walk.html
breaking: false
depends_on: [specs/20260911/05-approval-is-bookkeeping.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 2328310df9f925ae538ac6e68dce360d8fae72a9
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-01-1, AC-20260912-01-2, AC-20260912-01-3, AC-20260912-01-4, AC-20260912-01-5, AC-20260912-01-6, AC-20260912-01-7, AC-20260912-01-8, AC-20260912-01-9, AC-20260912-01-10, AC-20260912-01-11]
---

# The exclusions card explains itself and remembers: a heading, the question, why each claim is on the list, and what the client answered

## Goal

The card the client answers at the end of a journey has never been designed. specs/20260910/05
retrofitted it into the side panel as a list of bare claims with one agree button whose label
carried the whole question; specs/20260911/05 replaced that label with `Correct` / `No — we need
this` and deleted the question with it. Today the card has no heading, no lead, no reason why any
claim is on the list, and no trace of what the client answered — `confirmed`, `overridden` and
never-answered all render as the same bare claim line, and the only in-session signal is both
buttons fading. This spec makes the card readable cold: it says what it is, poses the question,
tells the client why each row is there in their own words where the row came from them, and
states the answer back. Everything here is render and copy — no new route, no new ledger verb, no
new write. Done means a client meeting this card for the first time can answer it without asking
anyone what it means, and can reload the page and still see what they said.

The approved mock `design/client-mocks/walk.html` (JJ, 2026-09-12) is the binding reference for
every string and every state in this spec; where prose here and that file disagree, the file wins
and the disagreement is a defect in this spec.
