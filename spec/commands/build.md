---
description: Build stage direct entry — direct Sonnet worker dispatch per layer wave behind the deterministic gate, driver-stepped: spec-build-driver.js owns admission, wave derivation, gate resolution, red-check, the final gate, scope-reconcile, and the ledger row; this session holds test-author dispatch, per-wave worker dispatch, and repair; `/spec:run` is the loop that reaches this stage with `--via loop` and continues into review
argument-hint: <spec path>
---

# Spec Build: The Build Stage

`/spec:build <spec>` runs the build stage alone — a hardened spec to `implementing` and its
build to `DONE`. `spec-build-driver.js` owns this stage's sequencing — admission, wave
derivation, gate resolution, env preflight, red-check, the final gate, scope-reconcile, diff
counts, and the ledger row — executing every deterministic step itself and printing exactly one
step at a time for this session's judgments. `/spec:run` reaches this same driver with
`--via loop` and, on `DONE`, continues into review — see `spec/commands/run.md`. Orchestrator
and workers: Sonnet.

**Setup:** run `spec-paths shared-for build` and read its output. Read the host's
`.claude/spec.config.json` (pipeline rules load with that Read — path-scoped, never re-read).
Either missing → STOP: run `/spec:init` first. Run `spec-paths build-driver` once, keeping the
printed path as `{driver}`.

## Input

`$ARGUMENTS` — path to a hardened spec (or one already `implementing`, to resume). **Worktree
isolation is not build's concern** — run `/git:enter-worktree <spec>` first; the driver never
creates/enters/leaves a worktree, preferring its own stamped `diff_base` pin over `build_base`.

**A design-landed component is not stub residue.** `/spec:design` commits real components
before the build starts, so a non-tests `CREATE` row already in the pre-image is legitimate —
`red-attributed` refuses only paths that DIFFER from base; an already-tracked `CREATE` row
earns a WARN naming it, never a refusal or a hand-edit of the File Plan.

## Build stage — the build driver owns this part of the state machine

Loop until the driver prints `DONE`: run `node {driver} <spec path>`; execute exactly the
printed step; record it with `node {driver} <spec> --mark <mark> [args]`; re-run. The driver
verifies the step's artifacts before advancing (a missing or malformed one is refused, exit 2,
remedy named) and never trusts the sidecar alone, so it always re-derives the true step —
never skip ahead of it or re-do a step it reports complete. An incident this session observes
mid-build is recorded at any live step with `--mark incident --class <id>` (`class` from
`fleet-reader --json`'s `.escapes.registry`); the mark never moves the state.

A red-expected file that passed (`unsanctioned-green`), a carried AC mixing a promise with a
pin (`mixed-pin` — split the AC, re-run), or a red run recorded `redCheck: "skipped-resume"`
is diagnosed with the user before the next mark, never laundered past.

## Worker Contract — every dispatch this session makes

Every worker prompt carries only the spec path, the pipeline-rules path, and the worker's file
list — the driver prints these in each step body; orchestrators pass paths, never raw file
contents (core § Model Placement). Workers Read Decisions, Contracts, UI, and their own File
Plan rows themselves. Every worker applies this contract:

- Apply the Decisions table verbatim — nobody overrides it; only this session adds entries,
  recording a user ruling.
- Never run git (core § Worker Git Ban) — no checkout/stash/restore/reset/clean/add/commit.
  This session owns all git and the checkpoint commit.
- Never query MCPs (core § MCP Policy); read-only/generated surfaces change only via their
  declared tool (core § Read-Only Surfaces).
- Return `blocked` naming the assumption instead of improvising on a genuine fork or scope
  change.
- Append forced-but-unblocking departures to the deviations sidecar the driver's step prints
  as one `- ` bullet per departure, continuations indented — flush-left prose is invisible to
  the ledger count and refused at review close. Shared by every worker and review's own fold;
  its first writer creates it under a spec-scoped header only (`# Deviations — <spec slug>`).

The test author and reviewer stay fresh-context dispatches; wave/repair workers are named and
routed per the driver's own step (`--workers`/`--continued`/`--spawned` land on the ledger row).

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
report (core § Console Output Style). Assemble slots from the driver's state — `outcome` (✅ at
`DONE`, ⚠️ when the run needed the user), `bullets` (one line per escalation), `next` (the
driver's captured `node "$(spec-paths spec-status)" --next`, printed verbatim at `DONE`, never
hand-applied). Run `node "$(spec-paths report-render)" --slots <file>` and print it verbatim.

```report
✅ **DONE — hardened → implementing, gate green**

Next: /spec:review specs/20260817/01-example.md
```

If in a worktree, stay in it. Every ledger row lands in `.claude/spec-runs.jsonl`.

## Rules

- **The Worker Contract above is binding** (git ban, MCP ban, Decisions-table authority) on every
  dispatch. **The driver never dispatches agents, writes the Decisions table, renders a report, or
  runs a git write beyond the gate-time intent-to-add (ADR-0015)** — those stay this session's, always.
