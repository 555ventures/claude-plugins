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

Run the printed `▶ when done:` line as printed; each step accepts only its own verb.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief and model, wait
  for it, then mark `built`, `repaired` or `fixed` respectively.
- **REVIEW**: dispatch one `spec:reviewer` with the printed brief and model, then mark
  `reviewed --file <the printed findings path>`.
- **ESCALATE**: ask the printed question and mark `escalate <choice>`.
- **CONFLICTS**: ask the printed question; on `resolve`, fix each file by both sides' intent in
  the main checkout, leave it uncommitted, and mark `conflicts-resolved`.

As a fanout lane, when the driver prints `PENDING_QUESTION`, stop and return.
