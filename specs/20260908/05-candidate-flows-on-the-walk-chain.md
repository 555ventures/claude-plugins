---
date: 2026-09-08
status: superseded
superseded_by: "ADR-0013 — the client rehearses one journey at a time in a player; the flow pick is retired, D3a player mechanics carried forward"
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260907/07-mocks-retires-theme.md, specs/20260907/08-walk-critic.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-08
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-05-1, AC-20260908-05-2, AC-20260908-05-3, AC-20260908-05-4, AC-20260908-05-5, AC-20260908-05-6, AC-20260908-05-7, AC-20260908-05-8, AC-20260908-05-9, AC-20260908-05-13, AC-20260908-05-14, AC-20260908-05-12, AC-20260908-05-10, AC-20260908-05-11]
---

# Candidate flows on the walk chain: a journey that declares a fork is drawn 2–3 ways, picked as a whole on the atlas, and walked as the winner only

## Goal

specs/20260905/03 (superseded 2026-09-07 by ADR-0010) established that a journey, like a shape,
may be drawn as candidate flows and picked as a set on the page; its mechanics targeted a chain
that no longer exists. This spec re-plans those mechanics against `SEED → SHAPES → KIT →
WIREFRAMES → WALK → SIGNOFF → APPROVED` and narrows the premise to the journeys that earn it: a
journey whose seed entry **declares a structural fork** (a form as a page vs a sheet, a gate
before vs after the content, a list vs a single featured item) may be drawn 2–3 ways under
`design/variants/`; the driver opens a pick stop for it, promotes the winner into
`design/mocks/`, records the losers, counts the pick as the journey's approval so no second look
is asked, and hands the winner alone to WALK. A journey with no declared fork is drawn once,
exactly as today. Done means: a forked journey has a candidate home no existing walk mistakes
for its screens, one pick promotes and approves, the walk critic never sees a loser, and every
unforked journey behaves byte-identically to the pre-image.
