---
date: 2026-09-13
status: done
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/atlas.html
breaking: true
depends_on: [specs/20260913/05-a-note-is-a-conversation.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 1b922791e18ec9521ff302285c3b86eede272e35
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-06-1, AC-20260913-06-2, AC-20260913-06-3, AC-20260913-06-4, AC-20260913-06-5, AC-20260913-06-6, AC-20260913-06-7, AC-20260913-06-8, AC-20260913-06-9]
---

# Every mock has a page you can mark

## Goal

Clicking a card on the atlas does one of two things. A screen that a journey declares opens that
journey's review page, where the owner can draw a box and write a note. Everything else — a shape
option, a screen no journey claims — opens a popup (the lightbox) with no notes at all. Every card
also carries an `open ↗` link to the raw mock file, a third surface the owner cannot mark. This
spec gives every card one destination: a screen page at `/screen/<label>.html` that shows that one
screen live, with its notes, the whole-project notes and the composer, built from the review
page's own parts. The lightbox and every `open ↗` link are deleted. Done means every card on the
atlas — screen or shape — opens a page where the owner can mark and write.
