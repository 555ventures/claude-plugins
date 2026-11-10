---
description: Drain the queue as parallel worktree lanes, each landed behind its own gate
argument-hint: "[--pick] [<spec path>…]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/fanout.js $ARGUMENTS`.

- **Bare (AUTO)**: the driver picks the batch (📌 Auto-picked) and asks nothing; mark `planned`. It takes every
  startable hardened spec, queued or not, in queue order (the queue is the file plus the fill: ADR-0044); a queued
  brief stands for its specs. A spec that must not run stays `draft`. A shared brief waits for its sibling
  (`shared brief NN`), and a brief dependency waits and ends the batch (`brief X depends on Y`, then
  `the batch stops before <stem>`). An unknown flag exits 2 (`fanout: unknown argument <flag>`). Every queued
  `type: fix` item is a lane after the specs — bound to a spec `fix-<stem>`, spec-less `fix-<slug>` — and its Agent
  call runs `/spec:fix --root <wt> …`, never `/spec:run`; the advisories a review queues drain this way, unattended.
  PLAN with nothing runnable lists every open item with why it needs you; drained means the queue is empty.
- **`--pick` (SELF-PICK)**: ask the printed checkbox question, then mark `picked` with one `--label` per ticked box.
  Only `picked` is taken there, and `--pick` over a saved batch exits 2 naming it and each lane's
  `--mark dismissed --lane <id> --discard`; it never resumes or removes the batch for you.
- A hardened spec with frontmatter `prototype:` is never a lane: LOOK needs the user's free-text reply and the app
  must outlive the agent. It waits with `stops at LOOK for you — /spec:run it`; a fix item bound to such a spec waits
  with its in-place `/spec:fix <spec> — <symptom>` line.
- **DISPATCH**: send every printed Agent call in one message and mark `dispatched`.
- **WAIT**: mark `returned --lane <id>` as each lane comes back. A lane ends at DONE in its own worktree, committed;
  fanout lands it as it returns, through the same path a solo run takes: the rebase onto trunk, the gate and the
  merge all happen in the lane's worktree, so trunk gets exactly the tree that was gated. Each mark prints what it did
  to each lane it touched: `lane N landed as <sha>`, or `lane N sent back — conflicts: …` / `lane N gate red after
  rebase: …` with that lane's Agent call. A sent-back lane resolves in its own worktree, gates and reviews inside one
  dispatch (mark `resent`), and lands when marked returned; a second conflict on the same trunk stops it for you.
- A lane that needs another spec ends `after` it: returned, it is held on its queue item (the queue's own `after`),
  and a later PLAN sends it out again on its kept worktree once that spec is done. A lane that picked `amend`, or stopped at a cap, is held
  the same way on its kept worktree (its run state is the hold, no queue `after`): PLAN waits it with `its lane
  waits for the amended spec — /spec:plan <spec>, then /spec:fanout` and sends it out again once the amended spec is
  locked on trunk; the lane resumes at GATE. A lane that stopped by a rule (a fix lane's cap, a dismissed question) keeps its
  worktree and waits until you remove it; its item is queued.
  `dismissed --lane <id>` drops a lane, `--discard` also removes its worktree and branch and prints the wip commit.
- **RELAY**: lane questions are printed by kind (`[assumption]`, `[decision]`, `[unmet]`), each in the agent's own
  words, recommended option first. Relay every one verbatim in one AskUserQuestion per RELAY (at most 4 per call),
  then run each printed `answered` line with the user's pick, or the printed `dismissed` line when the user dismissed
  it (the lane stops with the question queued as a decide item). The orchestrator never answers for the user.
- **MERGE**: whatever is left lands in batch order; a lane sent back is re-sent (mark `resent`).
- **Long marks**: every `returned` of a DONE lane may run a rebase, a gate and a merge: 600000 ms. A killed mark is
  resumed by re-running the driver without `--mark`. Builders run in parallel; only gates queue, at most
  `gateConcurrency` at once (default 2). Temp space: suites that write temp data fill a tmpfs with four lanes;
  export TMPDIR to a directory on a real disk before /spec:fanout (doctor prints the free space).
- **REPORT**: it lists what merged (with the gate reruns and slot waits lanes paid, summed in a `load:` line), every
  answered question with its text, and every line a lane's rules decided (📌).
  Mark `reported`, then end the turn and report; the user runs `/spec:fanout` again, after `/clear`. Never loop to the
  next batch in the same turn.
