---
description: Draw the product's journeys as gray wireframes and get them approved before genesis
model: sonnet
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/mocks.js`. It settles structure (screens, navigation,
content), not look or wording.

- Take the idea from `.claude/genesis/brief.md`, and ask for it only if that file is missing.
  Invent the sample data.
- Each journey is a job story ("When …, I want …, so I can …") with numbered beats, one of
  them an empty or first-run state.
- Service connected: print `🎨 ready for review — <link>` and end the turn. Otherwise end the
  turn on `approve all, or name the ones to change`.
