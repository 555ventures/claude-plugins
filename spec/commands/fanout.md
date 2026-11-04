---
description: Drain the queue as parallel worktree lanes, merged in order behind the gate
argument-hint: "[<spec path>…]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/fanout.js $ARGUMENTS`.

- **DISPATCH**: send every printed lane in one message: an Agent call with subagent `claude`,
  the orchestrator seat's model, and prompt `/spec:run <spec> --root <lane worktree>`.
- **WAIT**: mark `returned --lane <id>` as each lane comes back. A lane that ended PARKED or
  AMENDED is dismissed by that mark and reported as parked; do nothing else for it.
- **RELAY**: ask every lane question in one batch, then run each lane's printed
  `answered --lane <id> --label <label>` line.
- **MERGE_RED**: repair the trunk gate, commit, mark `gate-repaired`.
- **REPORT**: mark `reported` and keep going until the queue is drained. Never end on a
  "continue?" question.
