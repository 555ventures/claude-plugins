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
`.claude/spec.config.json` (its pipeline rules load with that Read — path-scoped, never
re-read). Either missing → STOP: run `/spec:init` first. Then run `spec-paths review-driver`
once and keep the printed path — it is `{driver}` below.

## Input

`$ARGUMENTS` — path to a spec with `status: implementing`. A spec that already closed
(`status: done`) is refused (exit 2) — `/spec:escape` records a defect that escaped a review
that already passed.

This command is the review driver's direct entry point (`--via direct`, the default). The
`/spec:run` loop reaches the same driver with `--via loop` and runs the same DISPOSITIONS
protocol below on both entries — see `spec/commands/run.md`.

## Protocol — the driver owns the state machine

Loop until the driver prints `DONE`: run `node {driver} <spec path>`; execute exactly the
printed step; record it with `node {driver} <spec> --mark <mark>`; re-run. The driver verifies
the step's artifacts before advancing (a missing or malformed one is refused, exit 2, repair
named) and never trusts a sidecar mark alone, so it always re-derives the true current step —
never skip ahead of it or re-do a step it reports complete. Base derivation prefers the pin
before the ref: `diff_base` → `build_base` → `merge-base HEAD main|master`.

`STOPPED` (a `RED_BLOCKING` gate failure) and `ESCALATE` (a third `fix-applied`, cap 2) are
terminal states the driver's own printed step names in full — remedy and exits included; read
that text, never guess one. Every pass's ledger line lands in `.claude/spec-runs.jsonl`,
appended by the driver, never hand-appended. A CLEAN close whose replay window is due parks at
`REPLAY` until a measurement lands (the due-replay Rules bullet below).

When the driver prints `DONE`, report (core § Console Output Style) from slots it captured —
`outcome` (✅ `CLEAN — merged`, or its one-line MERGE-skip note), `warns` (its CI-unseen line
when present, dropped otherwise — report-only, never a finding), `queued` (one line per queued
follow-up, omitted when none), `next` (its captured `node "$(spec-paths spec-status)" --next`,
verbatim, never hand-applied). Run `node "$(spec-paths report-render)" --slots <file>` and
print it verbatim.

```report
✅ **CLEAN — merged**
⚠️ CI has not seen this commit; origin `main`'s latest run: `failure`    (only when the ci leg observed sha-unseen with a failing/timed-out/cancelled branch conclusion)
{spec-status --next, verbatim}
```

## Rules — the judgments this session holds

- **Reviewer dispatch (the REVIEWER step).** Dispatch **one** `Agent {subagent_type:
  'spec:reviewer'}` (read-only; doctrine `spec/agents/reviewer.md`) with the spec path, diff
  base, root (or frozen worktree), pipeline-rules path, and the evidence paths the driver's
  step prints — blind to the build session, artifacts on disk only. **Design legs** (specs
  with `design: true`/`design_source`): alongside it, dispatch the component-manifest audit
  (`design/components.json` `authorJustification` — missing or near-duplicate is a finding;
  advisory, never blocking; non-UI specs skip it silently); when `design.render` is declared
  also run `node "$(spec-paths render-gate)" --spec <spec> --out <evidence dir>` and hand its
  report to the reviewer as evidence (shared § Design Canon: a rule a script can check is never
  checked by an LLM at runtime), else print one skip line naming the key. Write the reviewer's
  structured return to the file the driver names, then mark `reviewer-returned --file <json>`.
  `REVIEWER_FAILED` is a failed run, never CLEAN — re-dispatch before marking. It may
  create/delete its own repro file; fixes are always separate dispatches, no execution side
  effects on shared stateful substrates.
- **The evidence standard is executed, not argued:** every non-soft finding carries a repro
  the reviewer actually ran, or the exact spec lines (Decision/AC) the diff violates with the
  hunk quoted — neither present returns `advisory`; an empty findings list is valid. No
  finding dies by argument — dismissed only on executed contrary evidence, a quoted spec
  sanction, or a demonstrated miscitation, presented to the user, never silently.
- **Dispositions (the DISPOSITIONS step).** Dispatch **one** `Agent {subagent_type:
  'spec:disposer'}` with the paths the driver's step prints; no memory of the build. Every
  `fix` recommendation dispatches a Sonnet worker (via `agentMap`) with no question —
  reversible, re-reviewed by the fix-delta pass once you mark `fix-applied`. Every
  `waive`/`reject` goes to the user via `AskUserQuestion` (≤4 per call, core § Question
  Style), the disposer's reason quoted and its recommendation first; record the answer as
  `final`, `overriddenBy: "user"` + `overrideReason` when it differs. The session never
  changes a recommendation or asks about a `fix`; it may attach `sessionNote` (informational).
  Waive/Reject land in the spec's Rationale with date + reason; only the user waives.
  `DISPOSER_FAILED` is a failed dispatch, never a disposition — re-dispatch before marking.
- **The verdict word is derived by `verdict.js`, never asserted in prose** — the driver runs
  every verdict pass and prints its word. Never hand-write the word; a CLEAN row with non-zero
  `survived` records dispositioned findings, never ignored ones. review-legs runs the host's
  env preflight first; an unset declared var stops
  the run before any leg (exit 2, provision command named, no manifest rows) — provision it
  and re-run.
- **Close (the CLOSE step).** Apply the spec's Canonical Delta to `docs/canonical/{area}.md`.
  Fold the deviations sidecar: recurring-shaped entries become one-line Gotchas entries
  (tagged `[host]`/`[plugin]`; tag + rule + one owner citation — never dates, people, hosts, versions, or prior behavior);
  one-offs go to the spec's Rationale; delete the sidecar. Queue
  any follow-up the fold or the Rationale surfaces, never leave it narrated: `node
  "$(spec-paths spec-queue)" add …`, listed under the DONE report's `queued` slot. Follow the
  driver's printed sidecar listing and hygiene listing before marking `closed`; after the
  fold, run `node "$(spec-paths prose-cap)" --file <host pipelineRules> --section Gotchas
  --baseline <the review row's gotchas count>` — exit 1 means evict before the close commit,
  choosing one of exactly three fates per entry: **delete** (wrong, dead-cited, or
  mechanized), **merge** (durable truth → `docs/canonical/{area}.md`), or **mechanize** (a
  recurring class → a script per core § Incident Policy) — record each eviction as one
  Rationale line; the ratchet only tightens, never a flag day. **Dispose every
  `.claude/agent-memory/` file this spec's diff touched** (carry, correct, or delete, judged on
  what it teaches, never on who wrote it — an unnamed "concurrent process" attribution or a
  stood-down claim is corrected or dropped) plus what `node "$(spec-paths memory-sweep)"
  --root <root> --diff <files>` surfaces; a **carry** stamps `reviewed: YYYY-MM-DD`. Commit
  everything still uncommitted per the driver's printed instruction for what the close commit
  includes. Never `--no-verify`.
- **Merge strategy and non-trivial conflicts always go through `AskUserQuestion`** (the MERGE
  step) — the driver runs `merge-back` inspect and prints its `RECOMMEND` line, but the choice
  (merge-commit / ff-only / squash / rebase-ff) is this session's call, `RECOMMEND` first.
  Resolve conflicts by intent; a non-trivial conflict is always `AskUserQuestion`, never a
  mechanical pick. Relocate before marking `merge-strategy` — `ExitWorktree(action="keep")` if
  entered via `EnterWorktree`, else `cd` to the driver-named root — then pass the driver the
  **worktree's absolute spec path**. Never push; that is an explicit user action.
- **The due replay (the REPLAY step).** Once MERGE has concluded, the driver runs the replay
  harness's own dueness/selection checks and either lands `DONE` or prints the REPLAY
  execution step; when it does, execute `spec/commands/replay.md`'s **Phases 1–5** in this
  session with the `--select` values it inlined — those phases live in `replay.md` alone,
  never restated here. The ambiguous-score adjudication (`AskUserQuestion`) happens with the
  user present. Return with `node {driver} <spec> --mark replay-recorded` — any recorded
  outcome concludes the review; `unresolved`/`setup-failed` leaves the harness due for the
  NEXT review. `/spec:replay` stays the manual and retry surface.
