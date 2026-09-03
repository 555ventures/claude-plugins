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

This command is the review driver's direct entry point (`--via direct`, the default). The
`/spec:run` loop reaches the same driver with `--via loop` and runs the same DISPOSITIONS
protocol below on both entries — see `spec/commands/run.md`.

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
red leg and its remedy, naming the absolute path the row landed in; in a worktree that path is
the main root's gitignored stopped-ledger, so the evidence survives an abandoned or
force-removed worktree. A later invocation restarts at the leg run with a fresh manifest. A
third `fix-applied` lands `ESCALATE` — the fix loop is capped at 2 iterations, and a capped run
needs the user, not a fourth dispatch. The driver has already appended the escalate row — an
honestly-derived non-CLEAN verdict carrying `escalated: true` — at the moment of the refusal, and
prints the absolute path it landed in; ESCALATE names two exits: fresh dispositions
(`--fix-dispatched 0` covering the pool) close normally through the waive/reject route, or deleting
the `<spec>.review/` sidecar and manifests abandons the run to restart cold. A CLEAN close whose
replay window is due parks at
`REPLAY` until a measurement is on the record: the review is complete as a verdict and
unfinished as a checklist, and re-invocation re-prints the execution step.

When the driver prints `DONE`, report (rationale: core § Console Output Style). Assemble the
slots — `outcome`: ✅ `CLEAN — merged` (or the driver's one-line note when MERGE was skipped
because review ran on the originating branch); `warns`: one line naming the branch and
conclusion — "CI has not seen this commit; origin `<branch>`'s latest run: `<conclusion>`" —
when the ci leg's evidence-manifest row observed `sha-unseen` with a `branchConclusion` of
`failure`, `timed_out`, or `cancelled` (drop the slot otherwise; the row itself stays exit 0,
this is a report-only warning, never a finding); `next`: the driver's captured
`node "$(spec-paths spec-status)" --next`, printed verbatim — never a hand-applied mapping.
Run `node "$(spec-paths report-render)" --slots <file>` and print its output verbatim.

```report
✅ **CLEAN — merged**
⚠️ CI has not seen this commit; origin `main`'s latest run: `failure`    (only when the ci leg observed sha-unseen with a failing/timed-out/cancelled branch conclusion)
{spec-status --next, verbatim}
```

## Rules — the judgments this session holds

- **Reviewer dispatch (the REVIEWER step).** Dispatch **one**
  `Agent {subagent_type: 'spec:reviewer'}` (the plugin's read-only reviewer; its doctrine is
  `spec/agents/reviewer.md`) with the spec path, the diff base, the root the driver names (or
  its frozen worktree), the pipeline-rules path, and the evidence paths the driver's step
  prints. Blind to the build session — it gets no build narrative, only artifacts on disk.
  **Design legs** (specs with `design: true` or `design_source` only): alongside the reviewer,
  dispatch the component-manifest audit as a parallel Sonnet agent (`design/components.json`
  `authorJustification` entries — a missing justification or a near-duplicate of an existing
  entry is a finding). Non-UI specs skip it silently. When the host config declares
  `design.render`, also run `node "$(spec-paths render-gate)" --spec <spec> --out <evidence
  dir>` and hand its report path to the reviewer as evidence — this advisory run now carries
  the design rules genesis wrote as `renderCheck` entries against the built screens, in place
  of the Sonnet rule-checklist walk it replaced (shared § Design Canon: a rule a script can
  check is never checked by an LLM at runtime); when `design.render` is absent, print one skip
  line naming the key. This leg is advisory — never a `verdict.js` leg, and its findings never
  block the verdict on their own. Write the reviewer's structured return
  to the file the driver's step names: `{verdict: "CLEAN"|"REVIEWER_FAILED", survivors:
  [{severity, claim, file, line, impact, evidence}], killed: [{claim, file, line, evidence}],
  reviewerCount: 1, tokens: <n>}`, then mark
  `reviewer-returned --file <json>`.
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
- **Dispositions (the DISPOSITIONS step).** Dispatch **one** `Agent {subagent_type:
  'spec:disposer'}` with the paths the driver's step prints (the spec, the diff base, the root,
  the pipeline-rules path, the reviewer return, the manifest, and the evidence directory for
  this iteration). It has no memory of the build. For every `fix` recommendation in its return,
  dispatch Sonnet workers (routed via the host's `agentMap`) with no question — a `fix` is the
  conservative disposition, reversible and re-reviewed by the fix-delta pass. For every
  `waive`/`reject` recommendation, present it to the user via `AskUserQuestion` (≤4 per call,
  core § Question Style), the disposer's reason quoted verbatim, its recommendation first and
  labelled; record the user's answer as `final` with `overriddenBy: "user"` and
  `overrideReason` when it differs from the recommendation. The session never changes a
  recommendation on its own and never asks about a `fix` — it may attach `sessionNote` to an
  entry (informational; the driver ignores it). Once the worker returns and you mark
  `fix-applied`, the driver re-runs the fix-delta legs and a fix-delta reviewer pass itself.
  Waive/Reject rulings still land in the spec's Rationale with date + reason; only the user
  waives. `DISPOSER_FAILED` (agent died) is a failed dispatch, never a disposition —
  re-dispatch before marking.
- **The verdict word is derived by `verdict.js`, never asserted in prose** — the driver runs
  every verdict pass and prints its word; the session never asserts CLEAN itself.
  Never hand-write the word; a CLEAN row with non-zero `survived` records dispositioned
  findings, never ignored ones. Every pass's ledger line lands in `.claude/spec-runs.jsonl`,
  appended by the driver at STOPPED, ESCALATE, and CLOSE — the session never hand-appends a
  line. The exception is a worktree review's STOPPED or ESCALATE line: it lands durably in
  `.claude/spec-runs.stopped.jsonl` at the main root (gitignored, self-provisioned via git's
  `info/exclude` when the host lacks the ignore line), and is folded into the tracked ledger
  at close/merge. In-place reviews are unchanged.
- review-legs first runs the host's env preflight; an unset declared var stops the run before
  any leg — review-legs exits 2 with the unset variable and its provision command on stderr,
  appending no manifest rows, and the session provisions the variable and re-runs.
- **Close (the CLOSE step).** Apply the spec's Canonical Delta to `docs/canonical/{area}.md`.
  Fold the deviations sidecar if one exists: recurring-shaped deviations become one-line
  entries in the host rules' Gotchas section (tagged `[host]`/`[plugin]` by provenance;
  written as tag + rule + one owner citation — the spec path — never dates, people, hosts, versions, or prior behavior);
  one-offs go to the spec's Rationale; delete the sidecar. The driver enumerates every
  sidecar entry (numbered, first line, 120-char-bounded) into this step's printed
  instruction ahead of the fold, and refuses `--mark closed` (exit 2, remedy named) while
  the sidecar still exists on disk, or while the last persisted observation records a
  malformed — flush-left, count-invisible — line even after the file's deletion. After the
  deviations fold, run
  `node "$(spec-paths prose-cap)" --file <host pipelineRules> --section Gotchas --baseline
  <the review row's gotchas count>`; exit 1 means the section is over cap and no smaller than
  it was when the verdict ran — evict before the close commit, choosing one of exactly three
  fates per evicted entry: **delete** (wrong, dead-cited, or mechanized — the owning script's
  header keeps the history), **merge** (durable engineering truth →
  `docs/canonical/{area}.md`), or **mechanize** (a recurring class → a script per core §
  Incident Policy, and the prose dies). Record each eviction as one Rationale line in the
  spec under review. The cap is a **ratchet**, not a flag day: the driver records the count
  observed at verdict time on the review row (`gotchas`) and prints it in this step, and
  `--mark closed` refuses (exit 2) while an over-cap section has not ended the close strictly
  below that number — one net eviction per close satisfies it; a section at or under cap must
  simply stay there. Bulk pruning of a legacy over-cap section is separate host work (direct, gated by
  prose-cap), never this step's duty. **Dispose every
  `.claude/agent-memory/` file this spec's diff touched** — one stated fate each: carry, correct,
  or delete. Judge what each teaches, not that a worker wrote it; a memory attributing observed
  work to an unnamed "concurrent process", or concluding an assignment was already done and could
  be stood down from, is corrected or dropped, never carried. Nothing derives these files and no
  gate can see their effect, so an undisposed one becomes standing worker guidance by default.
  The disposal trigger widens: run `node "$(spec-paths memory-sweep)" --root <root> --diff
  <file listing the spec's changed paths>` and dispose the union of the diff-touched files
  above and the notes the sweep surfaces — the sweep is advisory, exiting 0 with or without
  findings and never feeding the verdict. A **carry** disposition now also writes
  `reviewed: YYYY-MM-DD` into the note's `metadata:` block, resetting its TTL.
  Adjudicate the driver's printed
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
  the directory the session stands in. After relocating, pass the driver the **worktree's
  absolute spec path** — it reads the spec from the path given, and the main root's copy is
  still `hardened` until the merge lands.
- **The due replay (the REPLAY step).** Once MERGE has concluded — merged back or skipped
  because review ran on the originating branch — the driver runs the replay harness's own
  dueness and selection checks itself and either lands `DONE` (not due, or nothing selectable,
  printing the harness's line verbatim) or prints the REPLAY execution step. When it prints
  that step, execute `spec/commands/replay.md`'s **Phases 1–5** in this session — in-session
  mutation authoring, blind reviewer dispatch, score, record, teardown — with the `--select`
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
