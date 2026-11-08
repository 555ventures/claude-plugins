---
date: 2026-09-07
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 22a
spiked: 2026-09-07
open_markers: 0
diff_base: e4013c065d4512c8b016e4154133e56ebf588c01
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-04-1, AC-20260907-04-2, AC-20260907-04-3, AC-20260907-04-4, AC-20260907-04-5, AC-20260907-04-6, AC-20260907-04-7, AC-20260907-04-8, AC-20260907-04-9, AC-20260907-04-10, AC-20260907-04-11, AC-20260907-04-12, AC-20260907-04-13, AC-20260907-04-14, AC-20260907-04-15, AC-20260907-04-16, AC-20260907-04-17, AC-20260907-04-18]
---

# The kit: shared primitives are named before any screen and bound at journey approval

## Goal

`/spec:mocks` gains a `KIT` state between `SHAPES` and `WIREFRAMES` that writes a
`design/kit/` canon family — a sibling of `design/shell/` under the same marks, the same
checker and the same walk-up resolution, never a third parallel concept. It names every
shared primitive once, in every state, with a when-to-use line; it is gray, signed off like a
wireframe, and handed to every wireframe authoring step first. Once it exists, a labeled
mock's content regions must each be a kit instance or carry an explicit bespoke mark naming
the primitive it is *not* and the one structural difference preventing reuse; the counts print
on every check, and `journey-approved` refuses on an unmarked region. Done means a host with
no `design/kit/` behaves byte-identically to today, and a host with one cannot approve a
journey whose screens quietly invent a primitive the kit already names.
