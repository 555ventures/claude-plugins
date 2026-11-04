---
description: Set this repo up for spec by detecting its test command and trunk and writing the config
argument-hint: "[notes about the repo]"
allowed-tools: Bash(node *), Read, Grep, Glob, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js`. Treat `$ARGUMENTS` as hints.

Fold the repo's lint and typecheck into `testCommand` so one command is the whole gate. Ask
only what the code can't answer, in one question round.
