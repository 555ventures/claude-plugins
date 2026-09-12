---
description: Carry a hardened spec to done — opens the spec's own git worktree by default, then the loop derives the next stage from disk and runs design (when due), then the build driver, then the review driver in sequence, stopping only for the judgments only this session can make; `--in-place` opts out of isolation
argument-hint: <spec path>
---

# Spec Run: The Loop

`/spec:run <spec>` is the loop that finishes a feature after `/spec:plan`. Each invocation
derives the next stage from disk in the order below and executes it in-session, so one command
carries a spec from `hardened` to `done`. `spec-build-driver.js` and `spec-review-driver.js`
each own their own stage's sequencing, printing exactly one step at a time for this session's
judgments. Orchestrator and workers: Sonnet.

**Setup:** run `spec-paths shared-for run` and read its output. Read the host's
`.claude/spec.config.json` (pipeline rules load with that Read — path-scoped, never re-read).
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
- `status:` past `hardened` AND `{worktree}` absent from `git worktree list --porcelain` → skip.
  An in-flight build keeps its marks in an untracked `<spec>.build/` sidecar and its workers'
  output uncommitted; `git worktree add` carries neither, so a new worktree would restart the
  build against an empty tree while the half-built work stays behind. This fires on a `/clear`
  resume too.

A worktree that cannot be created is a **hard stop** — never a fall back to in place. When the
failure text is `create: run from the main working tree`, the session is inside a different
spec's worktree: stop and say to exit that worktree first. Any other failure: stop, print the
error, and name `--in-place` as the deliberate opt-out.

The render server must run from `{worktree}` — the design stage's render gate adopts a server
by port, not by root, so one left running at the main root would capture the wrong tree.

## Routing — derived from disk, in this order

1. `status: hardened`, `design: true`, no `designed:` date, and the host config declares a
   `design` block → execute `spec/doctrine/stages/stage-design.md`'s steps unchanged in this
   session, then re-derive from step 1.
2. `hardened`, or `implementing` with no `<spec>.review/` sidecar and no `stage: "build"`
   ledger row for this spec → run the **build stage** below (`node {driver} <spec> --via loop`)
   to `DONE`. (A build row means build is already `DONE`; the driver refuses a re-run.)
3. `implementing` or `done` → run the **review stage** below
   (`node {review-driver} <spec> --via loop`) until it prints a judgment step or `DONE`.
4. `done` with no review sidecar → the review driver's own cold path prints `DONE` with
   `spec-status --next` — the loop's no-op resume.

This is `spec-status.js`'s own `deriveNext` order, restated — never skip a rung.

## Design stage

Execute `spec/doctrine/stages/stage-design.md`'s steps unchanged, with one substitution: in
place of its Setup's `spec-paths shared-for design` run `spec-paths shared-for run-design` —
`shared-for run` already carries the rest. Its look (Step 5) is a printed stop that ends the
turn — `approve` continues stage-design.md's Step 6 next turn, then re-derive from Routing
step 1.

## Build stage

Run `node {driver} <spec> --via loop` per `spec/doctrine/stages/stage-build.md`'s Build stage,
Worker Contract, and `blocked` rules, unchanged; skip its own `spec-paths shared-for build`
line — `shared-for run` already carries every section it lists. When the driver prints `DONE`,
print the advisory checkpoint — `✅ checkpoint — build complete; safe to /clear and re-run
/spec:run <spec>` — and continue straight into the review stage; clearing here is optional,
never required.

## Review stage

Run `node {review-driver} <spec> --via loop` the same way, per
`spec/doctrine/stages/stage-review.md`'s own Protocol and Rules, unchanged for every judgment
step. Skip its own `spec-paths shared-for review` line for the same reason as build's:

- **No stop between the reviewer's return and dispositions** — the loop proceeds straight to
  DISPOSITIONS; nothing here gates.
- **Pre-merge.** stage-review.md's own Relocate-before-marking rule (§ Rules, the MERGE
  bullet) is the pre-merge stop — never a forced `/clear`.

## Report

Every stop of the loop — a checkpoint, a judgment step, or the terminal `DONE` — prints one
report (core § Console Output Style); a look stop's printed block replaces the report (shared
§ Design Atlas). Assemble slots from whichever driver's state produced the stop — `outcome`
(✅/⚠️), `bullets` (one line per escalation), `next` (the literal re-run command at a
checkpoint, or `spec-status --next` verbatim at the review driver's own `DONE`). Run `node
"$(spec-paths report-render)" --slots <file>` and print it verbatim.

```report
✅ **checkpoint — build complete; safe to /clear and re-run /spec:run <spec>**

Next: /spec:run specs/20260817/01-example.md
```

If in a worktree, stay in it until the pre-merge stop relocates the session — merge-back runs
outside the worktree and merges on CLEAN.

## Rules

stage-build.md's and stage-review.md's own § Rules sections apply verbatim on the loop path.
