---
description: Build stage direct entry — direct Sonnet worker dispatch per layer wave behind the deterministic gate, driver-stepped: spec-build-driver.js owns admission, wave derivation, gate resolution, red-check, the final gate, scope-reconcile, and the ledger row; this session holds test-author dispatch, per-wave worker dispatch, and repair; `/spec:run` is the loop that reaches this stage with `--via loop` and continues into review
argument-hint: <spec path>
---

# Spec Build: The Build Stage

`/spec:build <spec>` runs the build stage alone — a hardened spec to `implementing` and its
build to `DONE`. `spec-build-driver.js` owns this stage's sequencing — admission, wave
derivation, gate resolution, env preflight, red-check, the final gate, scope-reconcile, diff
counts, and the ledger row — executing every deterministic step itself and printing exactly
one step at a time for the judgments only this session can make. The spec is the contract; the
gate is deterministic; surprises go to the user with the spec's own language. `/spec:run` is
the loop that reaches this same driver with `--via loop` and, on `DONE`, continues straight
into the review stage in the same invocation — see `spec/commands/run.md`. Orchestrator and
workers: Sonnet.

**Setup:** run `spec-paths shared-for build` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first. Then run `spec-paths build-driver` once and keep the printed path — it is
`{driver}` below.

## Input

`$ARGUMENTS` — path to a hardened spec (or one already `implementing`, to resume). **Worktree
isolation is not build's concern** — run `/git:enter-worktree <spec>` first to build in
isolation; the driver never creates, enters, or leaves a worktree and never writes
`build_base`.

## Build stage — the build driver owns this part of the state machine

Loop until the driver prints `DONE`:

1. Run `node {driver} <spec path>`. It inspects on-disk state (frontmatter, the
   `<spec>.build/` sidecar, artifacts already on disk) and prints the **current step's
   instructions** — running deterministic work itself (admission, the `hardened →
   implementing` flip with the absent-only `diff_base` stamp, wave derivation from
   `layerGroups`, gate resolution, env preflight, red-check, the final gate, scope-reconcile,
   diff counts, the `stage:"build"` ledger row) — and printing only the steps that need this
   session's judgment: test-author dispatch, red attribution, per-wave worker dispatch, host
   integration, repair dispatch, and the checkpoint commit.
2. Execute exactly that step. Record it with `node {driver} <spec> --mark <mark> [args]` once
   the step is done — the driver verifies the step's artifacts before it advances; a missing
   or malformed artifact is refused (exit 2) with the remedy named, and the state is left
   unchanged.
3. Re-run the driver. It never trusts the sidecar alone — a mark whose artifact vanished is
   demanded again — so it always re-derives the true current step; never skip ahead of it or
   re-do a step it reports complete.

Re-entrancy is the driver's job: a fresh session, or this one resuming later, runs step 1 and
lands exactly where the last run left off. A red-expected file that passed
(`unsanctioned-green`) or a red run that never observed a purity-clean pre-image
(`redCheck: "skipped-resume"` on a no-sidecar resume) is diagnosed with the user before the
next mark, never laundered past. A fourth `repair-applied` parks the run at the terminal
`ESCALATE` state — the repair loop is capped at 3 rounds — and prints its two exits: edit the
tree and delete `<spec>.build/gate-cap` to re-arm one more round, or delete the whole sidecar
to restart cold.

## Worker Contract — every dispatch this session makes

Every worker prompt (test author, wave workers, repair dispatches) carries only: the spec
path (workers Read Decisions, Contracts, UI, and their own File Plan rows themselves), the
pipeline-rules path, and the worker's file list `{path, action}` — orchestrators pass paths,
never raw file contents (core § Model Placement). Every worker applies this contract:

- Apply the Decisions table verbatim — nobody overrides it; only this session adds entries,
  recording a user ruling.
- Never run git (core § Worker Git Ban) — no checkout/stash/restore/reset/clean/add/commit.
  This session owns all git and the checkpoint commit.
- Never query MCPs (core § MCP Policy); read-only/generated surfaces change only via their
  declared tool (core § Read-Only Surfaces).
- Return `blocked` naming the assumption instead of improvising on a genuine fork or scope
  change.
- Append forced-but-unblocking departures to the deviations sidecar
  (`<spec path minus .md>.deviations.md`) as one `- ` bullet per departure, continuations
  indented — flush-left prose is invisible to the ledger count and refused at review close.
  The sidecar is per-spec and shared by every worker in the build and by review's own fold:
  its first writer creates it under a spec-scoped header only (`# Deviations — <spec slug>`),
  never a layer or worker name.

**The WAVE step** names one worker per layer in the wave (`subagent_type` = the host
`agentMap` value for that layer's kind, `model: sonnet`) — spawn one `Agent` per layer and
**keep it**. **The REPAIR step** routes each failing file to the worker that owns its layer
via `SendMessage`, spawning fresh only when that worker is gone (a resumed session); the
counts (`--workers`, `--continued`/`--spawned`) land on the ledger row so continuation is
measurable. The test author and the reviewer stay fresh-context dispatches.

## `blocked` returns

Resolve against the spec's Rationale/Assumptions when the intent is clear; a genuine fork or
scope change goes to the user via `AskUserQuestion` with the consequence of each option
(core § Question Style). Write the ruling **into the spec's Decisions table**, then
re-dispatch that worker. A ruling that adds or changes an observable promise updates its
terminal-observable AC in the same spec edit. A gate failure implicating a file outside the
File Plan is never silently widened — ask: add to scope / file separately / pause. A gate
failure inside the File Plan routes to the owning worker per the Worker Contract above.
`AskUserQuestion` dismissed → STOP.

## Report

Every stop — a judgment step this session must make, or the terminal `DONE` — prints one
report (rationale: core § Console Output Style). Assemble the slots from the driver's state —
`outcome`: the stop's one-line state (✅ at `DONE`, ⚠️ when the run needed the user);
`bullets`: one line per escalation; `next`: the driver's captured
`node "$(spec-paths spec-status)" --next`, printed verbatim at `DONE` — never a hand-applied
command. Run `node "$(spec-paths report-render)" --slots <file>` and print its output
verbatim.

```report
✅ **DONE — hardened → implementing, gate green**

Next: /spec:review specs/20260817/01-example.md
```

If in a worktree, stay in it — this stage never relocates the session. Every ledger row lands
in `.claude/spec-runs.jsonl`, appended by the driver at each stop — this session never
hand-appends a line.

## Rules

- **Workers never run git.** This session owns all git and checkpoint commits.
- **Decisions table is authoritative** — nobody overrides it; only this session adds entries,
  recording a user ruling.
- **Workers never query MCPs** and read-only/generated surfaces change only via their
  declared tools.
- `AskUserQuestion` dismissed → STOP.
- **The driver never dispatches agents, writes the Decisions table, renders a report, or runs
  a git write** — those stay this session's, always.
