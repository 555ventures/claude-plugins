---
date: 2026-08-27
status: done
tier: critical           # edits the genesis-state-gate.sh hook (process boundary) and spec/bin/spec-paths
area: genesis
design: false
breaking: false
depends_on: [specs/20260827/01-genesis-tournament.md]
depended_on_by: [specs/20260827/03-genesis-design-state.md]
brief: 10a
spiked: 2026-08-27
diff_base: 0eb4ddf6dcf699cd7f3c8035ca2a65435075ed13
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260827-02-1, AC-20260827-02-2, AC-20260827-02-3, AC-20260827-02-4, AC-20260827-02-5, AC-20260827-02-6, AC-20260827-02-7, AC-20260827-02-8]
---

# Explore folds into the driver: tiles before the race, one gallery for stack × design

## Goal

The explore stage stops being a command. Its Round 0 — fresh UX research, position briefs,
starter tokens, Sonnet-built style tiles, the deterministic check, the gallery, the cull to two
— becomes driver states between `MENUS` and `FINALISTS`, so the two culled positions render
**inside each finalist's scaffold** with its real component library as the tournament's
`style-tile` task, and the user judges stack and look in one gallery. A design the user already
made (a Claude Design export or any local mock bundle) enters as an **external candidate** and
skips the funnel; the pick records stack and design together. `spec/commands/genesis-explore.md`
and its hook arm are deleted and the name is swept from every live surface. Done means: the
explore states run end-to-end against a synthetic host, the hook admits nothing it did not
before and blocks nothing new, and the suite is green.
