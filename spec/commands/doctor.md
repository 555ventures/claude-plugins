---
description: Check this repo's spec setup for drift and print a remedy per problem
argument-hint: "[--fix]"
allowed-tools: Bash(node *), Read, Grep, Glob
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.js` and show its output. With `--fix`, list
every remedy it printed and apply them after the user says yes.
