---
date: 2026-09-12
status: done
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/notes.html
breaking: false
depends_on: []
depended_on_by: [specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md]
brief: n/a
spiked: 2026-09-12
open_markers: 0
diff_base: 6fc70704bf04298ab68087b714000f7344493b5c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-11-1, AC-20260912-11-2, AC-20260912-11-3, AC-20260912-11-4, AC-20260912-11-5, AC-20260912-11-6, AC-20260912-11-7, AC-20260912-11-8, AC-20260912-11-9, AC-20260912-11-10, AC-20260912-11-11, AC-20260912-11-12, AC-20260912-11-13, AC-20260912-11-14, AC-20260912-11-15]
---

# A note can mark an area

## Goal

A mock-page note today is anchored to a whole screen plus a state, so "the button in the header is
wrong" lives as prose and the reader re-finds the spot each time. After this spec the owner can drag
a rectangle over any area of a served mock — several elements, part of one, or a whole section — and
leave the note on it. The rectangle is drawn as a colored overlay by the notes layer, never as mock
markup, in the color of the note's status (red open, amber addressed, green resolved, gray dashed
outdated), and it lands on the same content at every viewport width because it is stored as a
fraction of the smallest element that contains it, with the covered children as the fallback when
that element's layout reflows. Done means: on a served mock page the owner draws, saves, reopens,
accepts, rejects with a reason, re-places an outdated box, and deletes or withdraws — all through one
card beside the box; the ledger carries a validated `region` field; the doctrine that said "never an
element" is replaced by an amendment ADR; and `design/chrome-mocks/notes.html` is the binding
reference for how it looks.
