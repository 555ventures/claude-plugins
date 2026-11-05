---
description: Where the work stands and what to run next
argument-hint: "[NN] [--all]"
allowed-tools: Bash(node *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/status.js $ARGUMENTS` and show its output as printed. `--all` adds what is not startable yet and the hygiene list; a brief number `NN` reports whether that brief's dependencies are built (exit 1 when not).
