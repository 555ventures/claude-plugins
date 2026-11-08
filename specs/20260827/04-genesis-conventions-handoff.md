---
date: 2026-08-27
status: done
tier: standard           # driver + templates + doctrine; no hook, no contract edit; init-gen.js is invoked, not edited
area: genesis
design: false
breaking: false
depends_on: [specs/20260827/03-genesis-design-state.md]
depended_on_by: []
brief: 10a
diff_base: 42be1a43a753881a65c9276335669c1bc960d814
spiked: 2026-08-27
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260827-04-1, AC-20260827-04-2, AC-20260827-04-3, AC-20260827-04-4, AC-20260827-04-5, AC-20260827-04-6]
---

# Conventions first, genesis is init: the probe suite and the grounded handoff

## Goal

The primary artifact of the decision record becomes **what agents read and gates run**, not
ADRs: at `DECIDE` the session records every ops-conventions row in
`.claude/genesis/conventions.json` (DECIDED or DEFERRED-with-reason, checker-enforceable rows
naming their probe test), and at `SKELETON` it lands the **conventions probe suite** in the host's
own test tree plus a ≤150-line `CLAUDE.md`/`AGENTS.md` carrying the binding subset — so the
zero-day gate that follows executes the conventions forever. Then greenfield genesis **is**
init: the `HANDOFF` step has the session author the init profile from the descriptor, the
conventions, and the design canon, and the driver runs `init-gen.js generate` itself, landing
the repo grounded with `/spec:enforce` as the next command; `/spec:init` stays the brownfield
entry and the regeneration owner. Done means: the two closures and the generate run are
observed on synthetic hosts, a grounded host carries a stamped config, and the suite is green.
