---
date: 2026-09-07
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260907/04-kit-canon-family.md, specs/20260907/05-genesis-drops-the-theme-gates.md, specs/20260907/06-theme-pick-moves-to-sketch.md]
depended_on_by: [specs/20260907/08-walk-critic.md]
brief: 22a
spiked: 2026-09-07
open_markers: 0
build_base: main
diff_base: ba8b5ae5cf11fed2829cefa6a72dda8893373afe
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-07-1, AC-20260907-07-2, AC-20260907-07-3, AC-20260907-07-4, AC-20260907-07-5, AC-20260907-07-6, AC-20260907-07-7, AC-20260907-07-8, AC-20260907-07-9, AC-20260907-07-10, AC-20260907-07-11, AC-20260907-07-12, AC-20260907-07-13, AC-20260907-07-14]
---

# `/spec:mocks` retires THEME: the state, its two marks, its stop and its reopen are deleted, and the chain ends `WIREFRAMES → SIGNOFF → APPROVED`

## Goal

`specs/20260907/06-theme-pick-moves-to-sketch.md` added the replacement producer — a
`theme state|compose|open|adopt` subcommand family on the mocks driver, outside the state
machine, plus `/spec:sketch`'s theme run — and deliberately left `/spec:mocks`'s `THEME` state
working byte-identically, so that commit had two theme producers and no gap. This spec removes
the old one. It is a **pure deletion: no new behaviour, no new surface, no new refusal**.
`deriveState` loses its `THEME` step, `direction-composed` and `theme-picked` lose their
handlers and their names in the unknown-mark literal, `stop open theme` and `--reopen theme`
lose their branches, `status.theme` / `marks.themePicked` / `status.directions` leave the
status schema, and both doctrine homes stop describing a state that no longer exists. Done means
a root whose canon is written and whose every journey is approved derives `SIGNOFF` directly and
signs off on gray wireframes with no theme anywhere on disk, while every other mark, refusal,
reopen, look stop and report line of `/spec:mocks` behaves exactly as it does today.
