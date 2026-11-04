---
description: Run several hardened specs' lanes from this one session — a deterministic driver plans the lanes, dispatches worktree-isolated sub-agents, relays their questions to you in one batch, merges each finished lane from the main root one at a time with the gate after each, and renders one report; driver-stepped and /clear-safe
argument-hint: "[--pick]"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Bash(git:*), Read, Agent, SendMessage, AskUserQuestion
---

# Spec Fanout: One Session Runs the Lanes

`/spec:fanout` replaces the terminal-per-lane habit: this session is the parent, each lane is a
worktree-isolated sub-agent running `/spec:run` to its next stop, and you are asked once, in one batch.
The script derives and writes; you do the one judgment step it prints.

**Intended model: opus or fable.** Run `spec-paths shared-for fanout` and read what it prints.

## Input — `$ARGUMENTS`

- bare — AUTO: the driver derives the batch (the queue's startable specs in queue order, stopping before a dependency the batch cannot meet or a planning item), tables the pending queued fixes and red-CI rows as the fix group, prints one 📌 Auto-picked batch line, asks no question, and runs it to the end; the next bare run after --mark reported starts the next batch. A member blocked by a dependency or held back for a shared brief waits and is dispatched when the lane it waits on has merged.
- `--pick` — SELF-PICK: the driver prints the checkbox round (up to four boxes per question, four questions, plain-word labels) over the startable specs; ask it, then run `--mark picked` with one `--label` per ticked box. The pick passes the same boundary validation the bare run uses (brief dependencies, shared-brief holds, the queue-item boundary) — never a bypass.

## Run — the loop

1. Run from the main worktree root:
   `node "$(spec-paths fanout-driver)" --root . [--pick]`. A
   bare re-run resumes the one fan-out per repo after `/clear`.
2. Do **exactly the one step it prints**: dispatch
   (every printed `Agent {…}` block in one message, then the `--mark dispatched` lines), relay (the
   printed question block and the `SendMessage`), or merge (the printed lines, from the main root).
3. Run the `Then:` mark it prints, then repeat from 1 with the mark's output as the next step.
4. On a task notification for a lane, run `--mark returned --lane <id>` (add `--stopped "<reason>"`
   when the worker reports it is gone).
5. At REPORT, render the driver's slots through the printed `report-render` line and relay its output
   verbatim, then `--mark reported`.

## Rules

- Never answer a lane's question yourself — every question the driver relays is asked of the user; the
  only answers never relayed are the host's policy.stops auto-picks, printed by the lane's own driver.
- Never run a lane's driver except the MERGE step from the main root — the worker owns its lane's
  build and review drivers; you only follow the printed review-driver MERGE line.
- Workers never land on main: merge one lane at a time, in table order, never while a lane is `pending`; the driver's MERGE step runs merge-back's rebase-ff itself;
  a red main (MERGE_RED) stops the queue until `--mark gate-repaired` is green.
- Never edit `spec-fanout.json` or a lane's `.claude/pending-question.json` by hand; to change the lane
  set, delete the state file the driver names.
- Four lanes run at once — a resource constant, not a flag.
- the pending queued fixes and red-CI rows are tabled at PLAN as the fix group in both modes; a fix born of a member lane (its origin names the member, its batch is this run) joins the batch once that member merges; a fix whose after gate is unmet waits in the table until the gate is met; a fix born of a fix, and anything a /spec:plan queues, waits for the next batch and heads the REPORT; a fix whose text names files runs beside the run lanes it does not overlap, one whose text names none runs after them.
- Plan and fix work never touches the main checkout: a fix lane runs in its own worktree on fix/<queue_id> and lands only through the MERGE step with the gate after — the main-gate repair included — never by committing on main; no lane or planner leaves an untracked file in the main root (merge-back refuses a dirty root by design; a planner's scratch goes to the session scratchpad, core § On-Disk Handoff).
- A spec whose lane stopped in this run is never re-admitted — resume it by hand or start the next batch.
- A merge-ready lane lands before any new lane is dispatched.
- Lanes run in parallel whatever their File Plans share; the MERGE step rebases the lane onto main and fast-forwards it, a conflict sends the lane back to its worker to resolve by intent (the rebase stays in progress in its worktree) and it lands on the next pass, and a second conflict against the same main stops the lane for a person.
- A refusal (exit 2) names its own remedy — print its stderr and do that.
- Non-goals: no `/spec:plan` lane (a spec must already be hardened), no automatic answers beyond the
  host's policy.stops.
