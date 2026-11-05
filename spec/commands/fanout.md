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
- **WAIT**: mark `returned --lane <id>` as each lane comes back; a PARKED or AMENDED lane is
  dismissed by it. A lane back from a resolved rebase is re-sent here (mark `resent`) to gate
  and review its resolution. The last lane's mark runs the merges; re-run the driver to read the result.
- **RELAY**: ask every lane question in one batch, then run each printed `answered` line.
- **MERGE**: a lane whose rebase onto trunk conflicts goes back; send its printed Agent call,
  mark `resent`. **MERGE_RED**: repair the trunk gate, commit, mark `gate-repaired`.
- **Long marks**: the mark that ends WAIT, RELAY or MERGE_RED runs every rebase, fast-forward and trunk
  gate for the batch in one process; run it with a Bash timeout of 600000 ms (a four-lane batch took
  4m38s on a 2-minute gate). A killed mark is resumed by re-running the driver without `--mark`.
- **REPORT**: mark `reported` and continue until the queue drains; never ask "continue?".
