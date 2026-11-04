---
description: Link this project to the hosted walkthrough review service used by /spec:mocks
argument-hint: "[--project <id>] [--name <text>] [--base-url <url>]"
allowed-tools: Bash(node *), Bash(npx walkthrough-cli *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/connect.js $ARGUMENTS` and show its output. It keeps
the token in the git-ignored `.claude/settings.local.json`, so never print it. Next is the
script's `next:` line, or `/spec:mocks` if it printed none.
