---
date: 2026-09-10
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/02-click-to-advance-and-real-records.md]
depended_on_by: [specs/20260910/04-theme-before-the-client-walk.md]
brief: 22a
open_markers: 0
diff_base: 5291bb9bcb393e39dbc33782a0b3b6ff5c1c7f3e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-06-1, AC-20260910-06-2, AC-20260910-06-3, AC-20260910-06-4, AC-20260910-06-5, AC-20260910-06-6, AC-20260910-06-7]
---

# The seed names the client's real records and two dense screens; a journey drawn on placeholders is refused

## Goal

ADR-0013: placeholders hide domain misunderstanding — a client glides past "Acme" and stops at
their own customer with no surname. This spec makes the seed name the client's real records
(three per entity, in files the wireframes draw from), refuses `seed-done` without them, warns
per screen and refuses per journey at `journey-drawn` when nothing drawn carries a record, and
lets the seed name two dense screens instead of one — the pair every theme candidate is judged
on (spec 04). Done means no journey reaches the client on made-up data, and the theme pick has
its two screens.
