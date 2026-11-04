---
description: Take one hardened spec through build, review and merge in its own worktree
argument-hint: <spec path> [--in-place]
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js $ARGUMENTS`. You dispatch agents; the driver
gates, commits and merges.

- **OPEN** isolates the spec in its own worktree on `spec/<stem>`. It works in place for
  `--in-place`, for `worktreePerSpec: false`, or when this session already sits in the spec's
  worktree, and prints which as a 📌 line.
- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief and model, in the
  worktree.
- **REVIEW**: dispatch one `spec:reviewer` with the printed brief and model, then mark
  `reviewed --file <the findings path>`.
- **ESCALATE**: ask the user the printed question and mark their choice.
- **MERGE**: resolve any conflicts by intent, then mark `conflicts-resolved`.

As a fanout lane you never ask the user. Write the question to
`.claude/pending-question.json`, print `PENDING_QUESTION`, and stop.
