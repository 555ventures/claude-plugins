---
date: 2026-09-13
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260912/11-a-note-can-mark-an-area.md, specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md]
depended_on_by: [specs/20260913/07-the-critic-is-out.md]
brief: n/a
spiked: 2026-09-13
open_markers: 0
build_base: main
diff_base: e232a7eef4bff691d1e42935dfc3a3ec65fafe17
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-02-1, AC-20260913-02-2, AC-20260913-02-3, AC-20260913-02-4, AC-20260913-02-5, AC-20260913-02-6, AC-20260913-02-7, AC-20260913-02-8, AC-20260913-02-9, AC-20260913-02-10, AC-20260913-02-11, AC-20260913-02-12, AC-20260913-02-13, AC-20260913-02-14]
---

# The layer owns one mode and the page owns the card

## Goal

The region-note layer mounts two ways — standalone on a served mock page, and inside the
review page's board frames — and in both it has no owner for interaction state. A finished
drag never leaves drawing mode, so every press on the draft card's own textarea spawns a
throwaway rectangle; a box click rebuilds the whole box layer twice and pulses the box the
reviewer just clicked; the drag listens on `document`, so the layer's own chrome feeds its
own drawing loop. This spec replaces that core with one mode at a time, pointer capture on
the drawing surface, affordances derived from the mode in CSS, a keyed reconcile instead of a
rebuild, and a card the host page renders at full size beside a scaled board instead of
inside it. Done means a reviewer can draw, read, and act on a mark on a desktop board without
a stray rectangle, a double repaint, or 5px text — and real-browser tests hold it there.
