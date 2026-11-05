---
description: Drain the queue as parallel worktree lanes, merged in order behind the gate
argument-hint: "[--pick] [<spec path>…]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/fanout.js $ARGUMENTS`.

- **Bare (AUTO)**: the driver picks the batch (📌 Auto-picked) and asks nothing; mark `planned`.
- **`--pick` (SELF-PICK)**: ask the printed checkbox question, then mark `picked` with one `--label` per ticked box.
- **DISPATCH**: send every printed Agent call in one message and mark `dispatched`.
- **WAIT**: mark `returned --lane <id>` as each lane comes back; a MERGE_READY lane lands as it
  returns, while the others are still building. A PARKED or AMENDED lane is dismissed by it, and a
  lane that marked `waiting --on` becomes waiting. A lane whose rebase conflicts is re-sent (mark
  `resent`): it resolves the conflict, continues the rebase, gates and reviews inside that one
  dispatch, and lands when marked returned. A lane that needs another spec done first: mark
  `waiting --lane <id> --on <spec>`; PLAN re-picks it once that spec is done, on a rebased worktree.
  A stopped or waiting lane keeps its work in a `wip(spec):` commit.
- **RELAY**: ask every lane question in one batch, then run each printed `answered` line, or the
  printed `waiting` line when the lane stopped for a dependency.
- **MERGE**: whatever is left lands in batch order; a lane whose rebase onto trunk conflicts goes
  back; send its printed Agent call, mark `resent`. **MERGE_RED**: repair the trunk gate, commit,
  mark `gate-repaired`.
- **Long marks**: every `returned` of a MERGE_READY lane may run a rebase, fast-forward and trunk
  gate: 600000 ms. So do the marks that end RELAY or MERGE_RED (a four-lane batch took 4m38s on a
  2-minute gate). A killed mark is resumed by re-running the driver without `--mark`.
- **REPORT**: mark `reported` and continue until the queue drains; never ask "continue?".
