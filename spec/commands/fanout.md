---
description: Drain the queue as parallel worktree lanes, merged in order behind the gate
argument-hint: "[<spec path>…]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/fanout.js $ARGUMENTS`.

- **PLAN, DISPATCH**: mark `planned`, then send every printed Agent call in one message and
  mark `dispatched`.
- **WAIT**: mark `returned --lane <id>` as each lane comes back; a PARKED or AMENDED lane is
  dismissed by it. The last lane's mark runs the merges, so read the MERGE output there.
- **RELAY**: ask every lane question in one batch, then run each printed `answered` line.
- **MERGE** conflicts: resolve, commit, mark `merged`. **MERGE_RED**: repair the trunk gate,
  commit, mark `gate-repaired`. These are the only stops.
- **REPORT**: mark `reported` and continue until the queue drains; never ask "continue?".
