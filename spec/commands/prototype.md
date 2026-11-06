---
description: A throwaway prototype the user argues with in chat; ends in a confirmed behaviour contract
argument-hint: <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>]
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/prototype.js $ARGUMENTS`. The prototype lives on
`proto/<stem>`, never merged; only `design/prototypes/<stem>/` on trunk carries forward.
Needs `prototype.url` (with `{port}`) and `bootCommand` in `.claude/spec.config.json`; nothing
else about the host's entry is assumed.

- **OPEN**: the driver makes the worktree, runs `setupCommand` and allocates one free port. Start
  the app in the background with the printed boot line (`cd <worktree> && export PORT=<port> && <bootCommand>`,
  so `bootCommand` may use `$PORT`), build the throwaway, mark `opened`
  (refused while nothing answers at the url).
- **ROUND**: with nothing answering, start the app as printed and re-run. Otherwise print
  `🎨 ready for pins — <url>` and end the turn. A literal `approve` marks `approved`. Anything
  else is one or more rulings: run the printed pin line for each, in the user's words
  (`--kind behaviour` for what the user does or sees, `look` for how it looks; `--route` the
  page; `--given` the production precondition in words, never a switch), change the app, commit
  on `proto/<stem>`, mark `round-done`. The same app is shown again next round.
- **APPROVED**: show the user every printed sentence, grouped by route. To change one,
  `prototype.js <stem> drop pN --why "<reason>"` and pin it again, then re-run. Only on the
  user's yes mark `contracted --confirmed`; a rejected commit (a hook) leaves APPROVED, fix it
  and mark again. With `prototype.picture` set, the app must answer: one reference picture per
  pinned route is taken, never a gate.
- **CONTRACTED**: the contract is committed on trunk and `/spec:plan` is queued. `drop` still
  amends a sentence here (it commits the change). Mark `closed` once the contract's specs are
  done: it refuses while a spec citing the stem is mid-run, and refuses unmerged work from OPEN,
  ROUND or APPROVED unless the user says to discard it (`closed --force`). A worktree that
  cannot be removed is reported with its remedy.
