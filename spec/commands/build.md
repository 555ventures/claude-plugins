---
description: Carry a hardened spec to done — the outer loop derives the next stage from disk and runs design (when due), then the build driver, then the review driver in sequence, each `--via loop`; direct Sonnet worker dispatch per layer wave behind the deterministic gate, driver-stepped — spec-build-driver.js and spec-review-driver.js each own their own sequencing; this session holds every judgment step and the pre-merge checkpoint
argument-hint: <spec path>
---

# Spec Build: The Loop

`/spec:build <spec>` is the loop that finishes a feature after `/spec:plan`. Each invocation
derives the next stage from disk in the order below and executes it in-session, so one
command carries a spec from `hardened` to `done`. `spec-build-driver.js` and
`spec-review-driver.js` each own their own stage's sequencing — admission, wave/leg
derivation, gate resolution, the status flip, the final gate, and the ledger row — executing
every deterministic step themselves and printing exactly one step at a time for the judgments
only this session can make. The spec is the contract; the gate is deterministic; surprises go
to the user with the spec's own language. Orchestrator and workers: Sonnet.

**Setup:** run `spec-paths shared-for build` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first. Then run `spec-paths build-driver` once and keep the printed path — it is
`{driver}` below — and run `spec-paths review-driver` once and keep that printed path too —
it is `{review-driver}` below.

## Input

`$ARGUMENTS` — path to a hardened spec (or one already `implementing` or `done`, to resume the
loop or a checkpoint). **Worktree isolation is not build's concern** — run
`/git:enter-worktree <spec>` first to build in isolation; the drivers never create, enter, or
leave a worktree and never write `build_base`.

## Routing — derived from disk, in this order

1. `status: hardened`, `design: true`, no `designed:` date, and the host config declares a
   `design` block → execute `spec/commands/design.md`'s steps unchanged in this session, then
   re-derive from step 1.
2. `hardened`, or `implementing` with no `<spec>.review/` sidecar → run the **build stage**
   below (`node {driver} <spec> --via loop`) to `DONE`.
3. `implementing` or `done` → run the **review stage** below
   (`node {review-driver} <spec> --via loop`) until it prints a judgment step or `DONE`.
4. `done` with no review sidecar → the review driver's own cold path prints `DONE` with
   `spec-status --next` — the loop's no-op resume.

This is `spec-status.js`'s own `deriveNext` order, restated rather than re-derived — never
skip a rung or guess ahead of what step 1 finds on disk.

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

When the build driver prints `DONE`, print the advisory checkpoint —
`✅ checkpoint — build complete; safe to /clear and re-run /spec:build <spec>` — and continue
straight into the review stage below in this same invocation; legs and the reviewer dispatch
need no memory of the build's trade-offs, so clearing here is optional, never required.

## Review stage — the review driver owns this part of the state machine

Run `node {review-driver} <spec> --via loop` the same way: step, execute, mark, re-run, per
`spec/commands/review.md`'s own Protocol and Rules, which this loop follows unchanged for
every judgment step (reviewer dispatch, dispositions, close, merge strategy, replay). One
place the loop stops that is specific to `--via loop`:

- **No stop between the reviewer's return and dispositions.** Independence is the disposer —
  once the reviewer returns, the loop proceeds straight to DISPOSITIONS and dispatches
  `spec:disposer` per review.md's DISPOSITIONS rule, on the loop path exactly as on the direct
  path; there is nothing here for this session to gate.
- **Pre-merge (unchanged).** The review driver's existing relocation refusal is the pre-merge
  stop — never a forced `/clear`. `ExitWorktree(action="keep")` when this session entered via
  `EnterWorktree`, otherwise `cd` the main session to the driver-named root, then re-run; the
  loop prints the driver's refusal as the step and nothing more.

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

Every stop of the loop — a checkpoint, a judgment step this session must make, or the
terminal `DONE` — prints one report (rationale: core § Console Output Style). Assemble the
slots from whichever driver's state produced the stop — `outcome`: the stop's one-line state
(✅ at a clean stop, ⚠️ when the run needed the user); `bullets`: one line per escalation;
`next`: the literal re-run command at a checkpoint (`/spec:build <spec>` — this same command
chains itself, the stage owns where it resumes) or `spec-status --next` verbatim once the
review driver's own DONE is reached. Run `node "$(spec-paths report-render)" --slots <file>`
and print its output verbatim.

```report
✅ **checkpoint — build complete; safe to /clear and re-run /spec:build <spec>**

Next: /spec:build specs/20260817/01-example.md
```

If in a worktree, stay in it until the pre-merge stop relocates the session — merge-back runs
outside the worktree and merges on CLEAN. Every ledger row lands in `.claude/spec-runs.jsonl`,
appended by the driver at each stop — this session never hand-appends a line.

## Rules

- **Workers never run git.** This session owns all git and checkpoint commits.
- **Decisions table is authoritative** — nobody overrides it; only this session adds entries,
  recording a user ruling.
- **Workers never query MCPs** and read-only/generated surfaces change only via their
  declared tools.
- `AskUserQuestion` dismissed → STOP.
- **The driver never dispatches agents, writes the Decisions table, renders a report, or runs
  a git write** — those stay this session's, always.
