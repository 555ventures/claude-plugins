---
date: 2026-08-27
status: done
tier: critical           # edits the genesis-state-gate.sh hook (process boundary) and spec/bin/spec-paths
area: genesis
design: false
breaking: false
depends_on: [specs/20260827/02-genesis-explore-state.md]
depended_on_by: [specs/20260827/04-genesis-conventions-handoff.md]
brief: 10a
diff_base: e62c54cfe603292479c9b81cadd7f6c3e4699b4e
spiked: 2026-08-27
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260827-03-1, AC-20260827-03-2, AC-20260827-03-3, AC-20260827-03-4, AC-20260827-03-5, AC-20260827-03-6, AC-20260827-03-7]
---

# Design becomes a driver state: ratify the pick inside `/spec:genesis`

## Goal

The design stage stops being a command. After the roadmap is written, the driver enters
`DESIGN`: the session ratifies the picked look — the winner's `tokens.css` verbatim as canon,
the one-page doctrine with every rejected direction in its Dissents, the promoted and
matrix-expanded signature screen, the base primitives and component vocabulary, and the
category-only `design-rules.json` — and the driver closes each step mechanically (file present,
prefix intact, `design-atlas.js check --matrix` and `components-check.js` green, rule enum
valid), prunes the losing candidates, and hands off to `/spec:init`.
`spec/commands/genesis-design.md` and its hook arm are deleted and the name is swept. Done
means: `/spec:genesis` runs the whole greenfield path to HANDOFF for a visual, a non-visual,
and a design-`skipped` archetype against synthetic hosts, the hook's init arm is byte-identical
in behavior, and the suite is green.
