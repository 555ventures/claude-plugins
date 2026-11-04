---
description: Take one hardened spec through build, review and merge in its own worktree
argument-hint: <spec path> [--in-place]
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js $ARGUMENTS`. You dispatch agents; the driver opens
the worktree, gates, commits and merges.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief and model.
- **REVIEW**: dispatch one `spec:reviewer` with the printed brief and model, then mark
  `reviewed --file <the printed findings path>`.
- **ESCALATE**: ask the printed question and mark `escalate <choice>`.
- **CONFLICTS**: resolve each file by both sides' intent, then mark `conflicts-resolved`.

As a fanout lane, when the driver prints `PENDING_QUESTION`, stop and return.
