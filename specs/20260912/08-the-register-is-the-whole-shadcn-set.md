---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: []
depended_on_by: [specs/20260912/09-a-mock-may-not-invent.md]
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: 7ae10bda237df1c9a168175c49f2ca2710561700
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-08-1, AC-20260912-08-2, AC-20260912-08-3, AC-20260912-08-4, AC-20260912-08-5, AC-20260912-08-6, AC-20260912-08-7, AC-20260912-08-8]
---

# The register is the whole shadcn set

## Goal

The wireframe register claims to be shadcn's Neutral theme but carries eleven roles under
names shadcn does not use, one of which — `--muted` — means the opposite of what it means in
shadcn (a text colour here, a surface there). A client's theme pick therefore covers eight of
shadcn's eighteen colour roles, the other ten get invented at build time, and a theme copied
from any shadcn generator swaps text and background with no error anywhere. This spec makes
the register shadcn's Neutral register verbatim — shadcn's own role names, shadcn's own
values, fetched from the registry — re-bases the shared wireframe stylesheet onto those names,
re-draws the five primitives that drifted from the component they name, and ships the one
command that moves a host repo already holding a copy onto the new register without anyone
redrawing a screen. Done means: a theme candidate that re-values only the old eleven roles is
refused by name, and Hearwell's nine drawn screens render on the new register after one
command.
