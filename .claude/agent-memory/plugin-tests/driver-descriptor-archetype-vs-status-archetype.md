---
name: driver-descriptor-archetype-vs-status-archetype
description: genesis-driver.js test fixtures set TWO different "archetype" values — status.json's (from the brief's `## Picks` line, drives isVisualArchetype/isTournamentArchetype branching) and stack-descriptor.json's (a REQUIRED_DESCRIPTOR_KEYS field, cosmetic to deriveState()) — never assume writing one changes the other
metadata:
  type: feedback
  reviewed: 2026-08-29
---

`genesis-driver.js`'s `deriveState()` branches on `status.archetype` (set once, in
`handleMenusDone()`, from the brief's `## Picks` `- archetype: <key>` line) to decide
visual/tournament routing (EXPLORE, FINALISTS, DESIGN, etc.). `writeValidDecideArtifacts()`-style
test helpers (genesis-driver.test.js, design-state.test.js) ALSO write an `"archetype"` field
into `stack-descriptor.json` — but that field is only read for `REQUIRED_DESCRIPTOR_KEYS`
non-empty-string validation at `decided`; `deriveState()` never reads it.

genesis-driver.test.js's own `advanceToDecide(dir, archetype = 'data-ml')` helper deliberately
defaults `status.archetype` to the non-tournament, non-visual `data-ml`, while
`writeValidDecideArtifacts()` hardcodes `archetype: 'web-app'` into the descriptor — these are
NOT the same archetype and that's intentional (D15 orchestrator ruling, 2026-08-27): callers
that drive through SCAFFOLD/GATE/ROADMAP via `advanceToRoadmap()` stay on the FAST path
(`data-ml` skips EXPLORE and the tournament) regardless of the descriptor's own cosmetic
`archetype: 'web-app'` string.

**Why this matters when authoring a design-state test:** a test asserting `roadmap-written`
reaches `HANDOFF` (design: skipped) vs `DESIGN` (visual) must control `status.archetype` via the
brief's `## Picks` line, not via `writeValidDecideArtifacts`'s descriptor field — changing only
the descriptor's `archetype` string changes nothing about which state the driver reaches next.
Conversely, a fixture that needs a REAL `design/explore/r0-<kebab>` winner directory (to test a
`startsWith`-verbatim prefix rule) has no shortcut: `status.archetype` must be a VISUAL
archetype (`web-app`/`mobile-app`/`realtime-trading`/`desktop-app`), which forces the full
research-done → positions-authored → tiles-built → tiles-culled funnel (`external` has no
prefix rule at all) — `finalists-skipped` still works to skip the tournament's own race/probe
legs afterward, since FINALISTS/tournament routing is orthogonal to EXPLORE's own resolution.

**How to apply:** when a new driver-state test needs a specific `status.archetype` behavior,
trace it to the brief's `## Picks` `- archetype:` line (via `menus-done`), never to a
descriptor field written later at `decided` — and when it needs a real ratified-winner
directory, budget for the full internal tile funnel; there is no cheaper path to an `r0-*` dir
with real content.
