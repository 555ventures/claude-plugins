---
date: 2026-09-07
build_base: main
status: done
tier: standard
area: genesis
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 22a
spiked: 2026-09-07
open_markers: 0
diff_base: a607cf6a543ad20c94f953b4d32cf8588c2588e8
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-05-1, AC-20260907-05-2, AC-20260907-05-3, AC-20260907-05-4, AC-20260907-05-5, AC-20260907-05-6, AC-20260907-05-7, AC-20260907-05-8, AC-20260907-05-9]
---

# Genesis stops requiring a theme: BRIEF ratifies the design canon without `tokens.css` or direction dissents

## Goal

`/spec:genesis`'s `BRIEF` state refuses `--mark brief-written` for a visual archetype unless
`design/tokens.css` exists and unless `docs/design/doctrine.md ## Dissents` names every
composed-but-unpicked direction from `design/mocks/status.json.directions`. Both preconditions
assume the theme is picked inside `/spec:mocks`. Brief 22a as amended (ADR-0010) moves the theme
pick into `/spec:sketch`, which runs **after** genesis — so under the new chain neither artifact
exists when BRIEF runs and genesis could never ratify a visual host again. This spec removes
exactly those two preconditions, re-points the prose and step text that name them, and leaves
every other BRIEF check byte-identical. Done means a visual run with no `design/tokens.css`,
whose `## Dissents` names no theme direction, ratifies and checkpoints `BRIEF → MENUS`, while
the doctrine cap, the empty-Dissents refusal, the design-rules schema, the mocks-APPROVED
precondition, the ledger gate and the `## Journeys`/`## Non-UI Coverage` checks all still
refuse exactly as they do today.
