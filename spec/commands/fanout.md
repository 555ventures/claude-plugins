---
description: Drain the queue as parallel worktree lanes, merged in order behind the gate
argument-hint: "[<spec path>…]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/fanout.js $ARGUMENTS`.

- **DISPATCH**: send all printed lanes in one message. Each is an Agent call with subagent
  `claude`, the orchestrator seat's model, working directory `.claude/worktrees/spec-<stem>`,
  and prompt `/spec:run <spec>`.
- **RELAY**: ask every waiting lane question in one batch, then mark `answered --lane <id>`
  for each.
- **MERGE_RED**: repair the trunk gate, then mark `gate-repaired`.
- **REPORT**: run the driver again for the next batch. Keep going until the queue is empty or
  the user is needed. Don't end on a "continue?" question.
