---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks
breaking: false
depends_on: [specs/20260912/11-a-note-can-mark-an-area.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
build_base: main
open_markers: 0
diff_base: 851ede5aeb614417efb61b43ba46d18e8304120e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-12-1, AC-20260912-12-8, AC-20260912-12-2, AC-20260912-12-3, AC-20260912-12-4, AC-20260912-12-5, AC-20260912-12-6, AC-20260912-12-9, AC-20260912-12-10, AC-20260912-12-7, AC-20260912-12-11, AC-20260912-12-12, AC-20260912-12-13, AC-20260912-12-14, AC-20260912-12-15, AC-20260912-12-16, AC-20260912-12-17, AC-20260912-12-18, AC-20260912-12-19, AC-20260912-12-20, AC-20260912-12-21, AC-20260912-12-22, AC-20260912-12-23]
---

# The loop re-anchors, and everyone draws

## Goal

specs/20260912/11 lets the owner mark an area on a served mock page and gives every other surface an
honest `outdated` state. This spec closes the loop where the anchor most often breaks and extends the
mark to every place a note is read or written. When the session addresses a region note, the driver
re-anchors the box against the edited mock in headless Chrome before the note turns amber, so the
owner's return view shows the box on the changed content instead of a gray "outdated" row. On the
journey review page every marked area is painted on its board at all times — a numbered pin at the
box's corner — and selection runs both ways: a note row selects its box, a box selects its row, and
a box drawn on a state the board is not showing pulls that state's tab forward. The reviewer can
hide the marks to see the untouched design, and start a new one from the composer. The client mount
stores a region and the client walk page shows the same badges and footnotes; drawing works by touch
with a long-press; and the atlas index cards carry an open/needs-you count per screen. Done means: an
addressed region note reads `addressed.reanchored` on disk, a review-page row click selects its box
and a box click selects its row, a client-drawn note lands with its region, and the atlas shows the
counts.
