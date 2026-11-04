---
description: Show, add to, or reorder the work queue
argument-hint: "[next|list|add|move|done|show] [args…]"
allowed-tools: Bash(node *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js $ARGUMENTS` (bare means `next`) and show its
output. The queue holds the user's intended order of specs, briefs and free-text items.
