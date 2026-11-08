---
date: 2026-09-07
status: done
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-07
open_markers: 0
build_base: main
diff_base: 01f7fe5c7c49623140087b244851bbf0550e9b3b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-09-1, AC-20260907-09-2, AC-20260907-09-3, AC-20260907-09-4, AC-20260907-09-5, AC-20260907-09-6, AC-20260907-09-7, AC-20260907-09-8, AC-20260907-09-9, AC-20260907-09-10, AC-20260907-09-11, AC-20260907-09-12, AC-20260907-09-13, AC-20260907-09-14]
---

# The atlas gains an index, and a note names the screen it belongs to

## Goal

The design atlas is one long scroll with no map: on a sixty-screen project a reviewer
re-entering cold cannot see what exists without scrolling past all of it, and a note written
on one screen is invisible everywhere except that screen's own page. This spec adds two
things to `design-atlas.js`'s index page: a persistent screen index (a left sidebar with a
search box, one row per journey/screen/candidate, jumping to the card) and two-way note
navigation (the project panel lists every open note and a mock-scope row jumps to its screen's
lightbox; a mock page's notes strip links back to the project panel). Done means a reviewer
can answer "what is here?" and "which screen is this note about?" without scrolling, and a
host that renders a gallery or a journey review page sees no sidebar at all.
