---
description: A throwaway prototype the user argues with in chat; ends in a confirmed behaviour contract
argument-hint: <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>]
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/prototype.js $ARGUMENTS`. The prototype lives on
`proto/<stem>`, never merged; only `design/prototypes/<stem>/` on trunk carries forward.
Needs a `runtime` block in `.claude/spec.config.json`: `bootCommand` (no default), `readyCheck`,
`url`, optional `publicUrl`, `envCommand`, `readySeconds`. The driver owns the app (`lib/app.js`); the
session never starts or stops it, and no step prints a boot line. Without `runtime.bootCommand` OPEN
refuses before it makes a worktree; a config still holding the old `prototype` boot keys is refused too:
run `/spec:migrate`.

- **OPEN**: the driver makes the worktree (the `.worktreeinclude` files, `setupCommand`), runs
  `runtime.envCommand` once, boots the app and waits for the ready check, then prints `app up at <url>`.
  Build the throwaway, mark `opened`.
- **ROUND**: the driver restarts a dead app first (a failure prints `⚠️ the app did not come up`: fix
  it, then re-run). Otherwise print `🎨 ready for pins — <url>` and end the turn. A literal `approve` marks `approved`. Anything
  else is one or more rulings: run the printed pin line for each, in the user's words
  (`--kind behaviour` for what the user does or sees, `look` for how it looks; `--route` the
  page; `--given` the production precondition in words, never a switch), change the app, commit
  on `proto/<stem>`, mark `round-done`. The same app is shown again next round.
- **APPROVED**: show the user every printed sentence, grouped by route. To change one,
  `prototype.js <stem> drop pN --why "<reason>"` and pin it again, then re-run. Only on the
  user's yes mark `contracted --confirmed`; a rejected commit (a hook) leaves APPROVED, fix it
  and mark again. With `prototype.picture` set, one reference picture per pinned route is taken
  from the running app, never a gate.
- **CONTRACTED**: the contract is committed on trunk and `/spec:plan` is queued. `drop` still
  amends a sentence here (it commits the change). Mark `closed` once the contract's specs are
  done: it stops the app (unless the first GATE of a spec citing the stem stopped it, which it does only when that app held the run's own url), refuses while a spec citing the stem is mid-run, and refuses unmerged work from OPEN,
  ROUND or APPROVED unless the user says to discard it (`closed --force`). A worktree that
  cannot be removed is reported with its remedy.
