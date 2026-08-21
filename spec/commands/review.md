---
description: Independent execution-verified review gate, driver-stepped — spec-review-driver.js owns legs, verdict, ledger, and merge-back sequencing; this session holds reviewer dispatch, dispositions, and merge strategy; flips spec to done, updates canonical docs, commits and merges back
argument-hint: <spec path>
---

# Spec Review: Independent Gate

`spec-review-driver.js` owns the review stage's sequencing — base derivation, legs, all three
`verdict.js` passes, both ledger appends, the `implementing → done` flip, and the merge-back
sequence — executing every deterministic step itself and printing exactly one step at a time
for the judgments only this session can make. This is the only command that flips `done`;
judgment on survivors (fix / waive / reject) happens in this session with the user — the
reviewer reports, never adjudicates.

**Setup:** run `spec-paths shared-for review` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first. Then run `spec-paths review-driver` once and keep the printed path — it
is `{driver}` below.

## Input

`$ARGUMENTS` — path to a spec with `status: implementing`. A spec that already closed
(`status: done`) is refused (exit 2) — `/spec:escape` records a defect that escaped a review
that already passed.

## Protocol — the driver owns the state machine

Loop until the driver prints `DONE`:

1. Run `node {driver} <spec path>`. It inspects on-disk state (frontmatter, the
   `<spec>.review/` sidecar, artifacts already on disk) and prints the **current step's
   instructions** — running deterministic work itself (base derivation —
   `build_base` → `diff_base` → `merge-base HEAD main|master` —, the per-iteration manifest,
   `review-legs.js`, diffLoc, every `verdict.js` pass, both ledger appends, the `done` flip,
   `merge-back`'s inspect/merge/cleanup/verify sequence, the REPLAY state's own
   `replay --due`/`--select` checks, the `spec-status --next` capture) and printing only the
   steps that need this session's judgment: reviewer + design-leg dispatch, dispositions, the
   Canonical Delta + deviations fold, the close commit, merge strategy, conflict resolution,
   and — on a due REPLAY — the replay execution phases.
2. Execute exactly that step. Record it with `node {driver} <spec> --mark <mark>` once the
   step is done — the driver verifies the step's artifacts before it advances; a missing or
   malformed artifact is refused (exit 2) with the repair named, and the state is left
   unchanged.
3. Re-run the driver. It never trusts a sidecar mark alone — a mark whose artifact vanished is
   demanded again — so it always re-derives the true current step; never skip ahead of it or
   re-do a step it reports complete.

Re-entrancy is the driver's job: a fresh session, or this one resuming later, runs step 1 and
lands exactly where the last run left off. A `RED_BLOCKING` gate failure lands the terminal
state `STOPPED` — the driver has already appended the `GATE_RED` ledger line and printed the
red leg and its remedy; a later invocation restarts at the leg run with a fresh manifest. A
third `fix-applied` lands `ESCALATE` — the fix loop is capped at 2 iterations, and a capped run
needs the user, not a fourth dispatch. A CLEAN close whose replay window is due parks at
`REPLAY` until a measurement is on the record: the review is complete as a verdict and
unfinished as a checklist, and re-invocation re-prints the execution step.

When the driver prints `DONE`, report (rationale: core § Console Output Style). Assemble the
slots — `outcome`: ✅ `CLEAN — merged` (or the driver's one-line note when MERGE was skipped
because review ran on the originating branch); `next`: the driver's captured
`node "$(spec-paths spec-status)" --next`, printed verbatim — never a hand-applied mapping.
Run `node "$(spec-paths report-render)" --slots <file>` and print its output verbatim.

```report
✅ **CLEAN — merged**
{spec-status --next, verbatim}
```

## Rules — the judgments this session holds

- **Reviewer dispatch (the REVIEWER step).** Dispatch **one**
  `Agent {subagent_type: 'spec:reviewer'}` (the plugin's read-only reviewer; its doctrine is
  `spec/agents/reviewer.md`) with the spec path, the diff base, the root the driver names (or
  its frozen worktree), the pipeline-rules path, and the evidence paths the driver's step
  prints. Blind to the build session — it gets no build narrative, only artifacts on disk.
  **Design legs** (specs with `design: true` or `design_source` only): alongside the reviewer,
  dispatch the two design checks as parallel Sonnet agents — the rule-checklist walk
  (`docs/design/research-brief.md` rule IDs against the built screens; skip with a note when
  no brief exists) and the component-manifest audit (`design/components.json`
  `authorJustification` entries — a missing justification or a near-duplicate of an existing
  entry is a finding). Non-UI specs skip both silently. Write the reviewer's structured return
  to the file the driver's step names: `{verdict: "CLEAN"|"REVIEWER_FAILED", survivors:
  [{severity, claim, file, line, impact, evidence}], killed: [], reviewerCount: 1, scope:
  "full"|"fix-delta", tokens: <n>}`, then mark `reviewer-returned --file <json>`.
  `REVIEWER_FAILED` (agent died) is a failed run, never CLEAN — re-dispatch before marking.
- **The reviewer is read-only**; it may create and delete its own repro file — fixes are always
  separate dispatches; no execution side effects on shared stateful substrates.
- **The evidence standard is executed, not argued:** every non-soft finding must carry a repro
  the reviewer actually ran — the command and its observed output — or the exact spec lines
  (Decision/AC) the diff violates with the violating hunk quoted. A finding with neither is
  returned as `advisory`. An empty findings list is a valid outcome; nothing may manufacture
  findings.
- **No finding dies by argument.** A finding is dismissed only on executed contrary evidence, a
  quoted spec sanction, or a demonstrated miscitation — presented to the user, never silently.
- **Dispositions (the DISPOSITIONS step).** Present survivors and leg findings with the spec
  lines their disposition hinges on quoted verbatim, and recommend the evidence-implied
  disposition; then `AskUserQuestion` per finding group (≤4 per call, core § Question Style):
  - **Fix** — dispatch Sonnet workers (routed via the host's `agentMap`), mark
    `dispositions --fix-dispatched N`; once the worker returns and you mark `fix-applied`, the
    driver re-runs the fix-delta legs and a fix-delta reviewer pass itself.
  - **Waive** / **Reject** — recorded in the spec's Rationale with date + reason; only the user
    waives.
- **The verdict word is derived by `verdict.js`, never asserted in prose** — the driver runs
  every verdict pass and prints its word; the session never asserts CLEAN itself.
  Never hand-write the word; a CLEAN row with non-zero `survived` records dispositioned
  findings, never ignored ones. Every pass's ledger line lands in `.claude/spec-runs.jsonl`,
  appended by the driver at STOPPED and CLOSE — the session never hand-appends a line.
- review-legs first runs the host's env preflight; an unset declared var stops the run before
  any leg — review-legs exits 2 with the unset variable and its provision command on stderr,
  appending no manifest rows, and the session provisions the variable and re-runs.
- **Close (the CLOSE step).** Apply the spec's Canonical Delta to `docs/canonical/{area}.md`.
  Fold the deviations sidecar if one exists: recurring-shaped deviations become one-line
  entries in the host rules' Gotchas section (tagged `[host]`/`[plugin]` by provenance);
  one-offs go to the spec's Rationale; delete the sidecar. Adjudicate the driver's printed
  hygiene listing — everything it doesn't mark EXPECTED is a stray to explain or clean before
  marking `closed`; never blind-`git add -A` past an unadjudicated path. Commit everything
  still uncommitted on the working branch, following the driver's printed instruction for what
  the close commit includes — a worktree review's close commit excludes
  `.claude/spec-runs.jsonl` and `.claude/spec-runs/` (promoted to the main root once the merge
  lands); an in-place review's close commit rides them as before. Never `--no-verify`.
- **Merge strategy and non-trivial conflicts always go through `AskUserQuestion`** (the MERGE
  step) — the driver runs `merge-back` inspect and prints its `RECOMMEND` line, but the choice
  (merge-commit / ff-only / squash / rebase-ff) is this session's call, `RECOMMEND` first.
  Resolve conflicts by intent: read both sides; a non-trivial conflict is always
  `AskUserQuestion`, never a mechanical pick.
- **Relocate before marking `merge-strategy`.** `ExitWorktree(action="keep")` when this session
  entered via `EnterWorktree`; otherwise `cd` the main session to the driver-named root — a
  subprocess cannot move the session CWD, and the driver refuses the mark (exit 2, relocate
  instruction) while it is inherited inside the build worktree, since cleanup must never delete
  the directory the session stands in.
- **The due replay (the REPLAY step).** Once MERGE has concluded — merged back or skipped
  because review ran on the originating branch — the driver runs the replay harness's own
  dueness and selection checks itself and either lands `DONE` (not due, or nothing selectable,
  printing the harness's line verbatim) or prints the REPLAY execution step. When it prints
  that step, execute `spec/commands/replay.md`'s **Phases 1–5** in this session — mutation
  authoring worker, blind reviewer dispatch, score, record, teardown — with the `--select`
  values the driver inlined (spec, reviewRunId, commit, parent, diffBase); Phase 0 is the
  driver's own entry work and is never repeated. Those phases live in `replay.md` alone —
  never restate them here. The ambiguous-score adjudication (`AskUserQuestion`) happens in this
  same session; the user is present at a review close. Return with
  `node {driver} <spec> --mark replay-recorded`. **Any** recorded outcome concludes the review;
  a non-measurement outcome (`unresolved`/`setup-failed`) leaves the harness due, so the NEXT
  review retries rather than this one. REPLAY never re-derives, re-opens, or gates the verdict —
  CLOSE is committed and MERGE has concluded before it runs, and a `missed` outcome changes the
  replay ledger and nothing else. `/spec:replay` stays the manual and retry surface.
- **Never push.** Pushing is an explicit user action, never part of this command.
