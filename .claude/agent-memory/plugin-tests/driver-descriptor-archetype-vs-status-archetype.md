---
name: driver-descriptor-archetype-vs-status-archetype
description: genesis-driver.js test fixtures set TWO different "archetype" values — status.json's (from the brief's `## Picks` line, drives isVisualArchetype/isTournamentArchetype branching) and stack-descriptor.json's (a REQUIRED_DESCRIPTOR_KEYS field, cosmetic to deriveState()) — never assume writing one changes the other
metadata:
  type: feedback
  reviewed: 2026-09-03
---

`genesis-driver.js`'s `deriveState()` branches on `status.archetype` (set once, in
`handleDiscoveryDone()`, from the brief's `## Picks` `- archetype: <key>` line — required there
since specs/20260902/08) to decide visual/tournament routing (BRIEF's owed set, FINALISTS, the
components check at SKELETON). `writeValidDecideArtifacts()`-style test helpers
(genesis-driver.test.js) ALSO write an `"archetype"` field into `stack-descriptor.json` — but
that field is only read for `REQUIRED_DESCRIPTOR_KEYS` non-empty-string validation at
`decided`; `deriveState()` never reads it.

genesis-driver.test.js's own `advanceToDecide(dir, archetype = 'data-ml')` helper deliberately
defaults `status.archetype` to the non-tournament, non-visual `data-ml`, while
`writeValidDecideArtifacts()` hardcodes `archetype: 'web-app'` into the descriptor — these are
NOT the same archetype and that's intentional (D15 orchestrator ruling, specs/20260827/04):
callers that drive through SCAFFOLD/GATE/ROADMAP via `advanceToRoadmap()` stay on the FAST path
(`data-ml` owes no mocks set at BRIEF and skips the tournament) regardless of the descriptor's
own cosmetic `archetype: 'web-app'` string.

**Why this matters when authoring a BRIEF-state test:** a test asserting `brief-written`
records `design: skipped` (non-visual) vs demands an APPROVED `design/mocks/status.json`
(visual) must control `status.archetype` via the brief's `## Picks` line at `discovery-done`,
not via `writeValidDecideArtifacts`'s descriptor field — changing only the descriptor's
`archetype` string changes nothing about which state the driver reaches next. A visual fixture
needs a real `design/mocks/status.json` at `APPROVED` plus `design/tokens.css` and a
`docs/design/doctrine.md` whose `## Dissents` names every unpicked direction
(tests/genesis/brief-state.test.js has the canonical fixture); the retired in-driver explore
funnel (specs/20260827/02, retired by specs/20260902/08) no longer exists as a path to any of it.

**How to apply:** when a new driver-state test needs a specific `status.archetype` behavior,
trace it to the brief's `## Picks` `- archetype:` line (via `discovery-done`), never to a
descriptor field written later at `decided` — and when it needs a visual archetype, budget for
the mocks-set fixture at BRIEF; there is no cheaper path.
