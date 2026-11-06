---
description: Drain the queue as parallel worktree lanes, merged in order behind the gate
argument-hint: "[--pick] [<spec path>…]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/fanout.js $ARGUMENTS`.

- **Bare (AUTO)**: the driver picks the batch (📌 Auto-picked) and asks nothing; mark `planned`. A queued
  `/spec:fix …` item is a fix lane: with a spec path `fix-<stem>`, without one `fix-<slug>`; both are picked
  after the runnable specs. A lane that ends `NEEDS_PLAN` queued `/spec:plan` and is reported.
- **`--pick` (SELF-PICK)**: ask the printed checkbox question, then mark `picked` with one `--label` per ticked box.
- **DISPATCH**: send every printed Agent call in one message and mark `dispatched`.
- **WAIT**: mark `returned --lane <id>` as each lane comes back; a MERGE_READY lane
  lands as it returns, also while another lane is sent-back or resolving a rebase (the resolver is
  rebased again, and gated, when it lands). Every mark prints, under the checkpoint,
  what it did to each lane it touched: `lane N landed as <sha>`, `lane N sent back — conflicts: …` or
  `lane N gate red after rebase: …` with that lane's Agent call to re-send, or `lane N held — trunk gate is red`.
  A PARKED, AMENDED or NEEDS_PLAN lane is dismissed by it, and a
  lane that marked `waiting --on` becomes waiting. A lane whose rebase conflicts is re-sent (mark
  `resent`): it resolves the conflict, continues the rebase, gates and reviews inside that one
  dispatch, and lands when marked returned. The re-send dispatch is followed by the lane list, which shows
  what every other lane is doing. A lane that needs another spec done first: mark
  `waiting --lane <id> --on <spec>`; PLAN re-picks it once that spec is done, on a rebased worktree.
  A stopped or waiting lane keeps its work in a `wip(spec):` commit. `dismissed --lane <id> --discard`
  removes the worktree and branch and prints the wip sha; `dismissed` is also accepted at DISPATCH,
  MERGE_RED and REPORT; `returned` is accepted at MERGE_RED too: a lane that comes back while the trunk is red
  is held (`lane N held — trunk gate is red`) and lands when `gate-repaired` is marked.
- **RELAY**: the questions are printed grouped by kind (`[assumption]`, `[decision]`, `[unmet]`,
  `[scope]`, `[spec-edit]`, `[escalate]`, `[conflict]`), recommended option first. Relay every lane
  question verbatim in one AskUserQuestion per RELAY (at most 4 per call), then run each printed
  `answered` line with the user's pick, or the printed `waiting` line when the lane stopped for a
  dependency. The orchestrator never answers for the user; only `📌 Auto-picked` lines are unrelayed.
- **MERGE**: whatever is left lands in batch order; a lane whose rebase onto trunk conflicts goes
  back; send its printed Agent call, mark `resent`. **MERGE_RED**: repair the trunk gate, commit,
  mark `gate-repaired` (a flaky failure needs no commit: re-run it as it is). A lane whose base is
  older than trunk is gated on the rebased tree before it lands; red sends it back (mark `resent`).
- **Long marks**: every `returned` of a MERGE_READY lane may run a rebase, fast-forward and trunk
  gate: 600000 ms. So do the marks that end RELAY or MERGE_RED (a four-lane batch took 4m38s on a
  2-minute gate). A killed mark is resumed by re-running the driver without `--mark`.
  Builders still run in parallel; only gates queue, at most `gateConcurrency` at once (default 2).
  Temp space: suites that write temp data fill a tmpfs with four lanes; export TMPDIR to a
  directory on a real disk before /spec:fanout (doctor prints the free space).
- **REPORT**: mark `reported`, then end the turn and report; the user runs `/spec:fanout` again, after
  `/clear`. Never loop to the next batch in the same turn.
