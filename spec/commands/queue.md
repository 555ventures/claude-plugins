---
description: Show, add to, or reorder the work queue
argument-hint: "[next|list|add [--top] [--type plan|prototype|fix|decide] [--after <NN|spec>]|move|done|show] [args…]"
allowed-tools: Bash(node *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js $ARGUMENTS` (bare means `next`; `add --top`
puts the item first; `add --type plan|prototype|fix|decide` sets what a prose item pastes as, default `plan`;
`add --after <NN|spec>` holds the item until that brief's specs are done or that spec is done) and show its
output. An item whose `--after` gate is unmet is skipped by `next` and listed with `⏳ after brief NN`.
A brief item is closed only by `done`: the driver never ticks it when the brief's last spec merges. `next` skips
a finished brief (every spec done, or superseded) and `list` ends its row with `✔ specs done — /spec:queue done NN`
(`⛔ superseded` for a superseded brief); the status screen raises a decide line to close it.
