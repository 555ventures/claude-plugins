---
date: 2026-08-25
diff_base: 47eb2cb54f66cfe7e97f2a2b05c2cbc30335fbfb
status: done
tier: critical           # removes a spec-paths key (key-set edit — critical trigger, precedent specs/20260823/01, specs/20260824/05)
area: genesis
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260825/02-genesis-consultant-discovery.md]
brief: 10
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260825-01-1, AC-20260825-01-2, AC-20260825-01-3, AC-20260825-01-4, AC-20260825-01-5, AC-20260825-01-6, AC-20260825-01-7]
---

# Genesis panel collapse: one proposer over the research fan-out

## Goal

Delete the genesis MoA panel (`wf-panel.js`: three blind Sonnet proposers plus a Fable
aggregator) and replace it with one proposer — the planning session itself — that reads the
research menus on disk and writes the decision record and ADRs directly. The research fan-out
(`wf-research.js`) is retained; a second perspective on a hard fork is a *partitioned-evidence*
research leg (a different dimension slice), never a second reader of the same brief. The
archetype registry in `genesis.md` shrinks to archetype → dimension keys — no named stacks in
doctrine. Done means: `wf-panel.js`, its `spec-paths` key, and its entrypoints row are gone; no
plugin file names a proposer, aggregator, or panel role; `genesis.md`'s registry table names no
product; the suite is green.
