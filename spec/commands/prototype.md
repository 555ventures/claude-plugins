---
description: A throwaway prototype the user pins notes on until approved; ends in a behaviour contract
argument-hint: <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>]
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/prototype.js $ARGUMENTS`. The prototype lives on
`proto/<stem>`, never merged; only `design/prototypes/<stem>/` on trunk carries forward.

- **ROUND**: print `🎨 ready for pins — <url>` and end the turn. A literal `approve` means
  mark `approved`; anything else is a change to commit on the prototype branch, then mark
  `round-done`.
- Mark `closed` once the specs built from the contract are done.
