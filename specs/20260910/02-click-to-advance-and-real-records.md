---
date: 2026-09-10
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260910/03-client-journey-player.md, specs/20260910/06-real-records-and-two-dense-screens.md]
brief: 22a
open_markers: 0
diff_base: b62c89ad0651c65b7c110343f8c35b7a06457995
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-02-1, AC-20260910-02-2, AC-20260910-02-3, AC-20260910-02-4, AC-20260910-02-5, AC-20260910-02-6, AC-20260910-02-7]
---

# Every journey edge is a real control: `data-to` on the advancing element, refused at journey-drawn when missing, and a walk mode that reports where a click went

## Goal

ADR-0013 makes the client walk a journey by clicking the control that actually leads to the
next screen. Today a mock declares screens and states but nothing says which element goes
where, so no player can advance on a real click and no check can tell a drawn journey from a
pile of screens. This spec adds the declaration (`data-to="<label>"` on the advancing control),
refuses `journey-drawn` while any seed edge lacks one or any `data-to` names an undeclared
screen, and serves a mock in walk mode (`?walk`) so a click inside the frame reports "advanced
to X" or "missed on Y" to the page that embeds it. Done means a journey cannot be marked drawn
until it is clickable end to end, and a served mock can tell its embedder where a click went.
