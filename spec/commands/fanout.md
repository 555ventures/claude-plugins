---
description: Run several hardened specs' lanes from this one session — a deterministic driver plans the lanes, dispatches worktree-isolated sub-agents, relays their questions to you in one batch, merges each finished lane from the main root one at a time with the gate after each, and renders one report; driver-stepped and /clear-safe
argument-hint: "[<spec path>…] [--batch <ids|all>] [--include-fixes] [--override-serial] [--ask <key|all>]"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Bash(git:*), Read, Agent, SendMessage, AskUserQuestion
---

# Spec Fanout: One Session Runs the Lanes

`/spec:fanout` replaces the terminal-per-lane habit: this session is the parent, each lane is a
worktree-isolated sub-agent running `/spec:run` to its next stop, and you are asked once, in one batch.
The script derives and writes; you do the one judgment step it prints.

**Intended model: opus or fable.** Run `spec-paths shared-for fanout` and read what it prints.

## Input — `$ARGUMENTS`

- `<spec path>…` — run exactly these specs, in the order given; each becomes a `--spec <path>` flag on
  the driver line. A member blocked by a dependency or held back for a shared brief waits and is
  dispatched when the lane it waits on has merged. With none, the driver derives the batch — the queue's startable specs in order, stopping before a spec that touches a pipeline self-surface (policy.fanout.selfSurfaces), a critical spec sharing a § Risk Tiers file with an unmerged lane, a dependency the batch cannot meet, or a planning item — prints it as one 📌 Auto-picked batch line, and runs it to the end; the next bare run after --mark reported starts the next batch.
- `--batch <ids|all>` — the veto of the derived batch; ids are spec stems or paths.
- `--include-fixes` — pre-existing red-CI and queued `/spec:fix` items become one serial fix group after the run lanes (fixes born of the batch join without the flag); a fix whose after gate is unmet waits in the table until the gate is met.
- `--override-serial` — admit shared-brief specs the queue held back (never a `depends on` hold).
- `--ask <key|all>` — repeatable, on the planning run: relay that `policy.stops` stop (`repairRound`,
  `buildEscalate`, `reviewEscalate`, `redFindings`, `rejectWithEvidence`) to you for this fan-out instead of the host's auto-pick.

## Run — the loop

1. Run from the main worktree root:
   `node "$(spec-paths fanout-driver)" --root . <flags>` (positional spec paths as `--spec` flags). A
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
  only answers never relayed are the host's policy.stops auto-picks, printed by the lane's own driver
  (--ask <key> relays them for one run).
- Never run a lane's driver except the MERGE step from the main root — the worker owns its lane's
  build and review drivers; you only follow the printed review-driver MERGE line.
- Workers never land on main: merge one lane at a time, in table order, never while a lane is `pending`;
  a red main (MERGE_RED) stops the queue until `--mark gate-repaired` is green.
- Never edit `spec-fanout.json` or a lane's `.claude/pending-question.json` by hand; to change the lane
  set, delete the state file the driver names.
- Four lanes run at once — a resource constant, not a flag.
- A fix born of a member lane (its origin names the member, its batch is this run) joins the batch once that member merges; --include-fixes adds the fixes that existed before the run; a fix whose after gate is unmet waits in the table until the gate is met; a fix born of a fix, and anything a /spec:plan queues, waits for the next batch and heads the REPORT; a fix whose text names files runs beside the run lanes it does not overlap, one whose text names none runs after them.
- Plan and fix work never touches the main checkout: a fix lane runs in its own worktree on fix/<queue_id> and lands only through the MERGE step with the gate after — the main-gate repair included — never by committing on main; no lane or planner leaves an untracked file in the main root (merge-back refuses a dirty root by design; a planner's scratch goes to the session scratchpad, core § On-Disk Handoff).
- A spec whose lane stopped in this run is never re-admitted — resume it by hand or start the next batch.
- A merge-ready lane lands before any new lane is dispatched.
- Two briefless specs that share only policy.fanout.overlapExempt paths run in parallel.
- A refusal (exit 2) names its own remedy — print its stderr and do that.
- Non-goals: no `/spec:plan` lane (a spec must already be hardened), no automatic answers beyond the
  host's policy.stops.
