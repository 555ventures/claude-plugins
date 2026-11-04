---
description: Take one hardened spec through build, review and merge in its own worktree
argument-hint: <spec path> [--in-place]
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js $ARGUMENTS`. You dispatch agents; the driver opens
the worktree, gates, commits and merges. `--root <lane worktree>` (fanout) means that worktree
is the checkout, so the driver runs in place there. Run each `▶ when done:` line as printed.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief and model, wait
  for it, then mark `built`, `repaired` or `fixed` respectively.
- **REVIEW**: dispatch one `spec:reviewer` (it reads the uncommitted diff; commit follows
  review), then mark `reviewed --file <findings path>`. Relay advisories in the final report;
  never act on them.
- **ESCALATE**: ask the printed question and mark `escalate <choice>`.
- **CONFLICTS**: ask; on `resolve`, fix each file by both sides' intent in the main checkout,
  uncommitted, and mark `conflicts-resolved`.

As a lane, stop and return on `PENDING_QUESTION`.
