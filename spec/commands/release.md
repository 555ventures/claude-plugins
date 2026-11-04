---
description: Deploy to staging, run checks against it, and promote to production on the user's yes
argument-hint: "[milestone note or version tag]"
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/release.js $ARGUMENTS`. If it refuses for a missing
`release` config key, ask for the value and save it. Promotion is irreversible: show what
staging showed and promote only on a yes.
