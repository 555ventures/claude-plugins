---
description: Take one hardened spec through build, review and merge in its own worktree
argument-hint: <spec path> [--in-place]
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Edit, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js $ARGUMENTS`. You dispatch agents; the driver opens
the worktree, gates, commits and merges. Every `▶ when done:` line carries `--root`, the
checkout the driver works in (a lane's worktree under fanout); run it as printed.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief, mark `built`,
  `repaired` or `fixed`, then re-run the driver for the next step. A builder that replies a
  failure is a flake, timeout or test outside its diff changed nothing: mark `regate` (REPAIR,
  once per tree) to re-run the gate; `repaired` or `fixed` on an unchanged tree and unchanged builder run files (`evidence.md`, `fix.json`, `as-built.md`) is refused.
- **REVIEW**: dispatch one `spec:reviewer`, then mark `reviewed --file <findings path>`;
  a clean review runs through to DONE itself. Relay advisories in the final report; never act
  on them.
- **PIN_TESTS** (a spec with `prototype: <stem>`, after a clean review): start the app in the
  background with the printed boot line (`cd <worktree> && export PORT=<port> && <bootCommand>`,
  so `bootCommand` may use `$PORT`; with none set the driver refuses, naming `prototype.bootCommand`), then mark `pin-tested`; the driver runs the host's
  `prototype.e2eCommand` against it. Red is a REPAIR; green leaves the app running for LOOK.
- **LOOK**: print the url and the look lines, end the turn. A literal `close enough` → stop the
  app and mark `looked`; anything else → mark `look-failed --why "<the reply verbatim>"` (a FIX
  round with the reply as the symptom, then the same steps again).
- **ESCALATE**: ask the printed question and mark `escalate <label>` with the option picked
  (`keep|fix|amend` for a reviewer choice, `widen|separate|park` for a watched path, the
  planner's own labels for a false Assumption). You record the user's pick; you never choose.
- **CONFLICTS**: ask; on `resolve`, fix each file by both sides' intent in the main checkout
  and mark `conflicts-resolved`. A lane at **MERGE_READY** with a rebase in progress edits the
  conflicted files to both sides' intent, re-runs the driver, then stops.

`--fix "<symptom>"` with or without a spec: as a fanout lane (a queued `/spec:fix` item), or `--in-place`
in the session (`/spec:fix`). The brief is the symptom and the reproduce-first recipe, the builder writes
`fix.json`, the commit is `fix(<id>|<slug>): <symptom>`; the fix stop offers keep / revert / plan. An
`--in-place` fix on a spec closes the queued `type: fix` item with that spec and symptom when it finishes.
A `--fix` on a prototype spec is in place only, and it runs PIN_TESTS and LOOK too.

As a lane, stop and return on `PENDING_QUESTION`. A lane never edits its spec's Decisions or any
other spec. A build that needs another spec done first marks `waiting --on <spec>` (BUILD, REPAIR,
FIX or REVIEW) and stops. When a builder replies that a Decision cannot be honoured, mark `unmet --decision <id> --why <text>`;
when an Assumption with an `ask` arm proved false, mark `unmet --assumption <id> [--why <text>]`
(an Assumption with a written fallback is the builder's to apply). Both ask instead of editing, and
the driver, never a builder, writes the user's ruling into the Decisions table. A lane with a rebase in progress resolves it at any step: edit the
files, re-run the driver; it continues the rebase and prints the next step.
