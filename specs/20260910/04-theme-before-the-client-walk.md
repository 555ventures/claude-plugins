---
date: 2026-09-10
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md, specs/20260910/06-real-records-and-two-dense-screens.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: 7fd991183eddfd79dc37d99789fca2afeca3a52c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-04-1, AC-20260910-04-2, AC-20260910-04-3, AC-20260910-04-4, AC-20260910-04-5, AC-20260910-04-6, AC-20260910-04-7, AC-20260910-04-8, AC-20260910-04-11, AC-20260910-04-9, AC-20260910-04-10]
---

# The theme is picked by the client before the walk: candidates on the two dense screens, the user's shortlist, one client pick, every walked screen served in the picked roles

## Goal

ADR-0013 returns the theme pick to `/spec:mocks`, between `WALK` and `CLIENT`, and gives the
pick to the client from a shortlist the user composed. Today the theme is authored at the first
`/spec:sketch` (after genesis and the roadmap) as the gray kit re-rendered per direction, picked
by the user on the atlas, and wireframes are never themed. This spec adds a `THEME` state:
the user authors directions under `design/theme/<kebab>/` as today, `theme shortlist` opens a
client pick stop whose candidates are the seed's two dense screens served in each direction's
roles, the client picks on `/client/theme.html`, `--mark theme-picked` adopts it (tokens copied,
ledger row, the same discipline `theme adopt` has), and from then on every mock the client walks
is served with `?theme=<kebab>`, which swaps the wire register's token file for the direction's.
The session's own pages stay neutral. Done means the client walks every journey in a look they
chose, and `/spec:sketch` finds the theme already picked.
