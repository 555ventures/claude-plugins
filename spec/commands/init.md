---
description: Set this repo up for spec by detecting its test command and trunk and writing the config
argument-hint: "[notes about the repo]"
allowed-tools: Bash(node *), Read, Grep, Glob, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js`, with `$ARGUMENTS` as hints. `testCommand` is the
whole gate, lint and typecheck included. Ask only what the code can't answer: this session asks
the printed `questions` together in ONE AskUserQuestion, then answers with
`init.js --set key=value` (one `--set` per answer).
