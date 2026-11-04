---
description: Greenfield only. Turn a product idea into a green scaffold with ADRs and a roadmap
argument-hint: <project idea — what, for whom>
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/genesis.js` with the idea in `$ARGUMENTS`.

- **DISCOVERY**: guess each product fact from the idea, then confirm in rounds of up to four:
  `confirm: <guess> (Recommended)`, `correct it`, `not applicable`. Product and business
  questions only.
- **MENUS**: dispatch one sonnet web-research agent per open dimension, in one message.
  Auto-pick a clear, free leader. Ask about ties and anything paid.
- **DECIDE**: write one ADR per hard-to-reverse choice from
  `${CLAUDE_PLUGIN_ROOT}/templates/adr.md`. Persistence, framework, auth and hosting are
  always the user's call.
- **ROADMAP**: write briefs from `templates/roadmap-brief.md` and `roadmap-overview.md`,
  sliced by what lands, not by layer. Brief 01 is one real record through the deployed path.
