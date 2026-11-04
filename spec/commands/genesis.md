---
description: Greenfield only. Turn a product idea into a green scaffold with ADRs and a roadmap
argument-hint: <project idea — what, for whom>
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/genesis.js $ARGUMENTS`.

- **DISCOVERY**: guess each product fact from the idea, then confirm in rounds of up to four:
  `confirm: <guess> (Recommended)`, `correct it`, `not applicable`. Product questions only.
- **MENUS**: auto-pick a clear, free leader; ask about ties and anything paid.
- **DECIDE**: persistence, framework, auth and hosting are always the user's call.
- **ROADMAP**: slice briefs by what lands, not by layer.
