---
description: Carry a hardened spec to done — the loop derives the next stage from disk and runs design (when due), then the build driver, then the review driver in sequence, each `--via loop`, stopping only for the judgments only this session can make; `/spec:design`, `/spec:build`, and `/spec:review` remain each stage's direct entry (`--via direct`)
argument-hint: <spec path>
---

# Spec Run: The Loop

`/spec:run <spec>` is the loop that finishes a feature after `/spec:plan`. Each invocation
derives the next stage from disk in the order below and executes it in-session, so one
command carries a spec from `hardened` to `done`. `spec-build-driver.js` and
`spec-review-driver.js` each own their own stage's sequencing — admission, wave/leg
derivation, gate resolution, the status flip, the final gate, and the ledger row — executing
every deterministic step themselves and printing exactly one step at a time for the judgments
only this session can make. The spec is the contract; the gate is deterministic; surprises go
to the user with the spec's own language. Orchestrator and workers: Sonnet.

**Setup:** run `spec-paths shared-for run` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first. Then run `spec-paths build-driver` once and keep the printed path — it is
`{driver}` below — and run `spec-paths review-driver` once and keep that printed path too —
it is `{review-driver}` below.

## Input

`$ARGUMENTS` — path to a spec at `hardened`, `implementing`, or `done` (to resume the loop or
a checkpoint). **Worktree isolation is not this loop's concern** — run
`/git:enter-worktree <spec>` first to build in isolation; the drivers never create, enter, or
leave a worktree and never write `build_base`.

## Routing — derived from disk, in this order

1. `status: hardened`, `design: true`, no `designed:` date, and the host config declares a
   `design` block → execute `spec/commands/design.md`'s steps unchanged in this session, then
   re-derive from step 1.
2. `hardened`, or `implementing` with no `<spec>.review/` sidecar and no `stage: "build"`
   ledger row for this spec → run the **build stage** below (`node {driver} <spec> --via loop`)
   to `DONE`. (A build row means build is already `DONE`; the driver refuses a re-run.)
3. `implementing` or `done` → run the **review stage** below
   (`node {review-driver} <spec> --via loop`) until it prints a judgment step or `DONE`.
4. `done` with no review sidecar → the review driver's own cold path prints `DONE` with
   `spec-status --next` — the loop's no-op resume.

This is `spec-status.js`'s own `deriveNext` order, restated rather than re-derived — never
skip a rung or guess ahead of what step 1 finds on disk.

## Design stage

Execute `spec/commands/design.md`'s steps unchanged in this session (its approvals are stops),
then re-derive from Routing step 1.

## Build stage

Run `node {driver} <spec> --via loop` per `spec/commands/build.md`'s Build stage Protocol,
Worker Contract, and `blocked` rules, which this loop follows unchanged — step, execute, mark,
re-run, dispatching workers exactly as that section describes. When the driver prints `DONE`,
print the advisory checkpoint —
`✅ checkpoint — build complete; safe to /clear and re-run /spec:run <spec>` — and continue
straight into the review stage below in this same invocation; legs and the reviewer dispatch
need no memory of the build's trade-offs, so clearing here is optional, never required.

## Review stage

Run `node {review-driver} <spec> --via loop` the same way, per `spec/commands/review.md`'s own
Protocol and Rules, which this loop follows unchanged for every judgment step (reviewer
dispatch, dispositions, close, merge strategy, replay). One place the loop stops that is
specific to `--via loop`:

- **No stop between the reviewer's return and dispositions.** Independence is the disposer —
  once the reviewer returns, the loop proceeds straight to DISPOSITIONS and dispatches
  `spec:disposer` per review.md's DISPOSITIONS rule, on the loop path exactly as on the direct
  path; there is nothing here for this session to gate.
- **Pre-merge (unchanged).** The review driver's existing relocation refusal is the pre-merge
  stop — never a forced `/clear`. `ExitWorktree(action="keep")` when this session entered via
  `EnterWorktree`, otherwise `cd` the main session to the driver-named root, then re-run the
  driver **against the worktree's absolute spec path** — the main root's copy of the spec is
  still `hardened` until the merge lands, and the driver reads the spec from the path it is
  given; the loop prints the driver's refusal as the step and nothing more.

## Report

Every stop of the loop — a checkpoint, a judgment step this session must make, or the
terminal `DONE` — prints one report (rationale: core § Console Output Style). Assemble the
slots from whichever driver's state produced the stop — `outcome`: the stop's one-line state
(✅ at a clean stop, ⚠️ when the run needed the user); `bullets`: one line per escalation;
`next`: the literal re-run command at a checkpoint (`/spec:run <spec>` — this same command
chains itself, the stage owns where it resumes) or `spec-status --next` verbatim once the
review driver's own DONE is reached. Run `node "$(spec-paths report-render)" --slots <file>`
and print its output verbatim.

```report
✅ **checkpoint — build complete; safe to /clear and re-run /spec:run <spec>**

Next: /spec:run specs/20260817/01-example.md
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
