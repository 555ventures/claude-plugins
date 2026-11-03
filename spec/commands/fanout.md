---
description: Run several hardened specs' lanes from this one session — a deterministic driver plans the lanes, dispatches worktree-isolated sub-agents, relays their questions to you in one batch, merges each finished lane from the main root one at a time with the gate after each, and renders one report; driver-stepped and /clear-safe
argument-hint: "[<spec path>…] [--lanes N] [--include-fixes] [--override-serial] [--ask <key|all>]"
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
  dispatched when the lane it waits on has merged. With none, the queue's startable lanes go in one wave.
- `--lanes N` — cap on concurrent lanes (default 4).
- `--include-fixes` — red-CI and queued `/spec:fix` items become one serial fix group after the run lanes.
- `--override-serial` — admit shared-brief specs the queue held back (never a `depends on` hold).
- `--ask <key|all>` — repeatable, on the planning run: relay that `policy.stops` stop (`repairRound`,
  `buildEscalate`, `reviewEscalate`, `redFindings`) to you for this fan-out instead of the host's auto-pick.

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
- A refusal (exit 2) names its own remedy — print its stderr and do that.
- Non-goals: no `/spec:plan` lane (a spec must already be hardened), no automatic answers beyond the
  host's policy.stops.
