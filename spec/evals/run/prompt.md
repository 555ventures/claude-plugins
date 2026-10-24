---
description: /spec:run walks the build driver then the review driver to close on a one-function spec
tags: [heavy]
runs: 1
max_turns: 150
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent, AskUserQuestion, TodoWrite]
---
/spec:run specs/20260102/01-subtract-two-numbers.md --in-place
