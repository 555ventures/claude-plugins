---
description: A throwaway prototype the user pins notes on until approved; ends in a behaviour contract
argument-hint: <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>]
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/prototype.js $ARGUMENTS`. The prototype lives on
`proto/<stem>`, which is never merged. Only `design/prototypes/<stem>/` on trunk carries
forward.

- **ROUND**: on the first round, commit the printed dev-only overlay import on the prototype
  branch. Start the app and the pin endpoint in the background as printed, print
  `🎨 ready for pins — <url>`, and end the turn.
- **The reply**: a literal `approve` means mark `approved`. Anything else is a change: commit
  it on the prototype branch, then mark `round-done`.
- **CONTRACTED**: every pin becomes a sentence, and each behaviour pin gets one end-to-end
  test.
- Mark `closed` once the specs built from it are done.
