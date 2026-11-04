---
description: One-time upgrade of a repo set up by spec v7 to v8's files and config
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate.js`. It changes nothing and prints the plan.
Show the plan and ask the user once whether to apply it. On a yes, run
`node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate.js --apply`.
