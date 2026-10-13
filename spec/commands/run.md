---
description: Carry a hardened spec to done — opens the spec's own git worktree by default, then the loop derives the next stage from disk and runs the build driver, then the review driver in sequence, stopping only for the judgments only this session can make; `--in-place` opts out of isolation
argument-hint: <spec path>
---

# Spec Run: The Loop

`/spec:run <spec>` is the loop that finishes a feature after `/spec:plan`. Each invocation
derives the next stage from disk in the order below and executes it in-session, so one command
carries a spec from `hardened` to `done`. Orchestrator and workers: Sonnet.

**Setup:** run `spec-paths shared-for run` and read its output. Read the host's
`.claude/spec.config.json`.
Either missing → STOP: run `/spec:init` first. Then run `spec-paths build-driver` once (keep
the path — `{driver}` below) and `spec-paths review-driver` once (`{review-driver}` below).

## Input

`$ARGUMENTS` — path to a spec at `hardened`, `implementing`, or `done` (to resume the loop or
a checkpoint). `--in-place` is the deliberate opt-out from Step 0's isolation, running the loop
on the current branch; by default the loop opens the spec's own worktree itself before anything
else runs. The drivers never create, enter, or leave a worktree themselves.

## Step 0 — Isolate

Unless `--in-place`, the loop runs in the spec's own worktree. Execute
`git/commands/enter-worktree.md`'s Steps 1–3 against `$ARGUMENTS` in this session, and do not
print its report — its `Next: nothing needs you` line is wrong mid-loop. Two skips, both
derived, each printed as one line:

- `--in-place` → skip.
- `status:` past `hardened` AND `{worktree}` absent from `git worktree list --porcelain` AND no
  `refs/heads/{source}` branch → skip (the build really ran in place; an existing branch is a
  parked worktree build, which Step 3 re-attaches).

A worktree that cannot be created is a **hard stop** — never a fall back to in place. When the
failure text is `create: run from the main working tree`, the session is inside a different
spec's worktree: stop and say to exit that worktree first. Any other failure: stop, print the
error, and name `--in-place` as the deliberate opt-out.

## Routing — derived from disk, in this order

1. `hardened`, or `implementing` with no `<spec>.review/` sidecar and no `stage: "build"`
   ledger row for this spec → run the **build stage** below (`node {driver} <spec> --via loop`)
   to `DONE`.
2. `implementing` or `done` → run the **review stage** below
   (`node {review-driver} <spec> --via loop`) until it prints a judgment step or `DONE`.
3. `done` with no review sidecar → the review driver's own cold path prints `DONE`.

Order: `spec-status.js` `deriveNext` — never skip a rung.

## Build stage

Run `node {driver} <spec> --via loop` per `spec/doctrine/stages/stage-build.md`'s Build stage,
Worker Contract, and `blocked` rules, unchanged; skip its own `spec-paths shared-for build`
line — `shared-for run` already carries every section it lists. When the driver prints `DONE`,
print the advisory checkpoint — `✅ checkpoint — build complete; safe to /clear and re-run
/spec:run <spec>` — and continue straight into the review stage.

## Review stage

Run `node {review-driver} <spec> --via loop` the same way, per
`spec/doctrine/stages/stage-review.md`'s own Protocol and Rules, unchanged for every judgment
step. Skip its own `spec-paths shared-for review` line for the same reason as build's.

## Report

Every stop prints one report. Assemble slots from whichever driver's state produced the stop —
`outcome` (✅/⚠️), `bullets` (one line per escalation), `next` (the literal re-run command at a
checkpoint, or `spec-status --next` verbatim at the review driver's own `DONE`). Run `node
"$(spec-paths report-render)" --slots <file>` and print it verbatim.

## Rules

stage-build.md's and stage-review.md's own § Rules sections apply verbatim on the loop path.
