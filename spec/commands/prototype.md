---
description: A throwaway prototype the user argues with in chat; ends in a confirmed behaviour contract
argument-hint: <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>]
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/prototype.js $ARGUMENTS`. The prototype lives on
`proto/<stem>`, never merged; only `design/prototypes/<stem>/` on trunk carries forward.
Needs a `runtime` block in `.claude/spec.config.json`: `bootCommand` (no default), `readyCheck`,
`url`, optional `publicUrl`, `envCommand`, `readySeconds`, `stopCommand` (the command that stops an app its boot left
running, e.g. `docker compose down`). The driver owns the app (`lib/app.js`); the
session never starts or stops it, and no step prints a boot line. Also needs `prototype.e2eFile` and
`prototype.e2eCommand` (the pin tests). When any of `runtime.bootCommand`, `prototype.e2eFile`,
`prototype.e2eCommand` is missing, OPEN makes no worktree and prints one question: ask the user once
(AskUserQuestion, one question, free text per key), set the answers in `.claude/spec.config.json`, re-run.
`contracted` refuses while the pin-test pair is missing. A config still holding the old `prototype` boot keys
is refused: run `/spec:migrate`. Every step's header names the plugin version (`▶ OPEN · spec 8.4.0`); a
`⚠️ … restart Claude Code` line under it means this session runs an older plugin than the installed one.

- **OPEN**: the driver makes the worktree (the `.worktreeinclude` files, `setupCommand`), runs
  `runtime.envCommand` once, boots the app and waits for the ready check, then prints `app up at <url>`.
  Build the throwaway, mark `opened`.
- **ROUND**: the driver restarts a dead app first (a failure prints `⚠️ the app did not come up`: fix
  it, then re-run). Otherwise print `🎨 ready for pins — <url>` and end the turn. A literal `approve` marks `approved`. Anything
  else is one or more rulings: run the printed pin line for each, in the user's words
  (`--kind behaviour` for what the user does or sees, `look` for how it looks; `--route` the
  page; `--given` the production precondition in words, never a switch), change the app, commit
  on `proto/<stem>`, mark `round-done`. The same app is shown again next round. `round-done` refuses with
  no pin made this round or with uncommitted changes in the worktree; `approved` refuses over an app that
  is down (re-run to restart it), with no active pin, or with uncommitted changes.
- **APPROVED**: show the user every printed sentence, grouped by route. To change one,
  `prototype.js <stem> drop pN --why "<reason>"` and pin it again, then re-run. Only on the
  user's yes mark `contracted --confirmed`; a rejected commit (a hook) leaves APPROVED, fix it
  and mark again. With `prototype.picture` set, one reference picture per pinned route is taken
  from the running app, never a gate.
- **CONTRACTED**: the contract is committed on trunk and `/spec:plan` is queued. `drop` still
  amends a sentence here (it commits the change). The body prints the `closed` mark line inside its text,
  not as a next step: mark `closed` once the contract's specs are done: it stops the app (unless the first GATE of a spec citing the stem stopped it, which it does only when that app held the run's own url), refuses while a spec citing the stem is mid-run, and refuses unmerged work from OPEN,
  ROUND or APPROVED unless the user says to discard it (`closed --force`). A worktree that
  cannot be removed is reported with its remedy.
