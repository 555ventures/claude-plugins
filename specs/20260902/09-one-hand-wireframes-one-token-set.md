---
date: 2026-09-02
status: done
build_base: main
tier: standard
area: mocks
design: false
breaking: false
depends_on: [specs/20260902/07-mocks-command-driver.md]
depended_on_by: [specs/20260902/10-page-notes-review-loop.md]
brief: 22
open_markers: 0
diff_base: cb7acb23cc3d497cf98b7b28617099c68ce14550
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-09-1, AC-20260902-09-2, AC-20260902-09-3, AC-20260902-09-4, AC-20260902-09-5, AC-20260902-09-6]
---

# One hand, canon-first wireframes, theme as recomposition, one token set

## Goal

Make the authorship rule and the visual registers binding across every design surface: every
mock — wireframe or themed — is authored and edited in-session, no `Agent` dispatch ever
writes a mock in `/spec:mocks`, `/spec:atlas`, or `/spec:sketch`; the wireframe rules and the
theme-as-recomposition rule from the dry run become doctrine the driver already checks; and
the tool chrome (atlas, galleries, preview toolbar, sketch workbench) and the wireframes share
one token set — shadcn's defaults as plain CSS — in two registers, full for chrome and flat
for wireframes, so the viewer, the atlas, the workbench and the notes layer stop looking like
four products. Done = the doctrine paragraph is replaced, the two commands cite it, the
chrome is rendered from `viewer.css`, and the wire tokens are pinned value-equal to it.
