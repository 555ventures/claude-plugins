---
description: Show, add to, or reorder the work queue
argument-hint: "[next|list|add [--top]|move|done|show] [args…]"
allowed-tools: Bash(node *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js $ARGUMENTS` (bare means `next`; `add --top`
puts the item first) and show its output.
