---
description: Deploy to staging, run checks against it, and promote to production on the user's yes
argument-hint: "[milestone note or version tag]"
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/release.js $ARGUMENTS`. The note is recorded, never
parsed. Only the user starts a release, so no report suggests one.

If a `release` config key the driver needs is empty, ask for it and save it. Promotion is
irreversible: show what staging showed and promote only on a yes.
