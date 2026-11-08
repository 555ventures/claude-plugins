---
date: 2026-09-06
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260906/02-mocks-ends-at-wireframes.md]
depended_on_by: [specs/20260906/06-sketch-high-fidelity-and-critique.md]
brief: 22a
open_markers: 0
diff_base: 0dbf31103b04780b87ff6f24eb2636007bb1a17b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260906-05-1, AC-20260906-05-2, AC-20260906-05-3, AC-20260906-05-5, AC-20260906-05-4, AC-20260906-05-6]
---

# Gray states on every wireframe: empty, loading and error declared as states, checked by presence at journey-drawn and journey-approved

## Goal

A wireframe shows the happy path and, as gray boxes behind `data-state-btn` switches, its empty, loading and error states. `design-atlas.js check --states` fails a labeled mock that declares none of them, and the mocks driver runs it at `journey-drawn` and `journey-approved`. A screen that truly has no such state says so on its root (`data-no-state="loading"`), which is a product statement the session must have asked. Presence only: no script judges what the error state says. Done means the CHI-2026 blind spots (error prevention, error recovery) are in front of the user at wireframe time, before any theme exists.
