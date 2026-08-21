# Deviations — specs/20260821/02-replay-review-phase.md (build 2026-08-21)

- Worker dispatch degraded: the `plugin-tests` test author returned twice with no file written
  (transcript truncated mid-research, zero edits), and the `gate-scripts` worker returned having
  written no line of `spec/scripts/spec-review-driver.js` at all. The orchestrator authored both
  test files and the driver row directly. The separation that matters is preserved in the load-
  bearing direction — the tests were authored and executed RED (all 10 pins failing on
  spec-contract assertions, setup preconditions passing) before a single line of the driver was
  written — but the "test author is a different agent from the code author" property does not
  hold for this build. `doctrine-author` completed its four files normally.
- Concurrent-edit collision on the doctrine rows: the orchestrator and the live `doctrine-author`
  worker edited `spec/commands/review.md` and `spec/commands/replay.md` in the same window (the
  worker's completion notification fired while it was still writing). The worker deduped, keeping
  one binding home per rule; the final files were verified to carry exactly one copy of each added
  block, and `tests/consistency/*.test.js` is green.
- D9 executed: `spec/entrypoints.json` needed no edit. 20260820/07 already landed
  `spec/scripts/replay.js`'s `entryPoints` as `["spec/commands/replay.md",
  "spec/scripts/spec-review-driver.js"]`, and no `spec/commands/review.md` edge for `replay.js`
  ever existed to drop. The File Plan row is a verified no-op, not a skipped one; the entry-point
  conformance suite is green.
- `printDoneNow()` now honours `--state` (printing the bare `DONE`) instead of writing its whole
  block and exiting. This is required by AC-20260821-02-1 and -5, which assert `--state` prints
  `DONE`, and it closes a 07-era wart where the two DONE fast paths ignored the flag. It is a
  behavioural addition no Decision names explicitly; recorded here rather than silently.
- AC-20260821-02-3's exit-1 arm ("due but no eligible CLEAN row in the window") is structurally
  unreachable from REPLAY: `doCloseWork()` appends this review's own CLEAN row with a `runId`
  moments before REPLAY runs, so `--select` always has a candidate. The reachable arm is `--select`
  failing to RESOLVE that candidate (exit 4). The driver treats ANY non-zero `--select` exit as
  "nothing measurable, conclude"; the test exercises the exit-4 path and its comment records why.
- Out-of-plan changes carried in this build's diff: `.claude/agent-memory/plugin-tests/MEMORY.md`
  and `.claude/agent-memory/plugin-tests/concurrent-worker-file-collision-select-tiebreak.md` —
  memory written by the dispatched test-author subagent, a harness side effect of dispatch rather
  than an edit this spec asked for. AUDITED after a Fable 5 consult flagged that the orchestrator
  had deleted one false memory while committing its twin: this entry carried the same false
  attribution ("a doctrine-author or another plugin-tests dispatch was live-editing") and the same
  deferral inference ("my own task was effectively subsumed; I did not re-add anything"). Its
  operational content is sound and its `--select` tie-break finding is load-bearing for future
  replay-fixture authors, so it was CORRECTED in place rather than deleted: attribution fixed to
  the orchestrator, the stand-down inference replaced with "report what you found and let the
  orchestrator adjudicate", and the recall `description` rewritten (it was the half most likely to
  be read in isolation).
- The `gate-scripts` worker, still live after its completion notification fired, read the driver
  file mid-way through the orchestrator's own patching, concluded "this row was already
  implemented", and wrote that as a standing agent memory
  (`.claude/agent-memory/gate-scripts/assigned-file-may-already-be-implemented.md`). The
  conclusion is false — it was reading a half-applied orchestrator patch, not a prior landing —
  and the lesson it encodes ("if an assigned MODIFY row already looks complete, do not
  re-implement") would teach future workers to skip real work. The memory and its index line were
  deleted rather than carried.

## Incident class (named once, for recurrence counting)

**`orchestrator-compensation-during-live-worker`.** Every worker pathology in this build is
downstream of ONE mechanism, and the first three bullets above describe its symptoms under three
different names. Naming it once here so a third recurrence is countable by grep rather than by
re-reading three sidecars.

The mechanism: the harness fired completion notifications for two workers while they were still
executing. The orchestrator, reading those as returns-with-no-work, began writing the same files
itself. From that moment the concurrency was REAL — orchestrator versus live worker, in a shared
tree that `/spec:build` deliberately does not isolate ("worktree isolation is not build's
concern"). The workers' "a concurrent process already landed this" conclusions were therefore
CORRECT observations with WRONG attribution; the orchestrator's own first account of the
incident ("there was no concurrent process") was itself wrong — it was the concurrent process.
That relocates the fix target: this is not "workers rationalize skipping work" (a prompting or
memory problem) but "the orchestrator must not write into a possibly-live worker's file set on a
notification alone" (a liveness/serialization problem, plausibly a harness defect to report
upstream rather than a pipeline defect at all).

Recorded reopen condition (grep-answerable, per core § Incident Policy): any agent memory or
worker return that attributes observed work to "a concurrent process"/"already implemented"
WITHOUT naming the commit or worker that landed it. Two artifacts from this session count as ONE
incident, honestly read; the class stands at one.

Pre-registered guard candidate, NOT built and NOT earned (recurrence count is 1, and neither
Generality nor Materiality can be filled today): a diff-scoped check that fails when a spec's
diff touches `.claude/agent-memory/` without a matching sidecar entry disposing each file —
an exit code wired where the class occurs, deliberately trippable, removable by a ledger count.
Sketched here so a third recurrence has a candidate to admit, not so one gets built now.

Open question for JJ, deliberately NOT actioned (core § Feedback Loop is doctrine; a doctrine
edit needs an explicit yes): § Feedback Loop states the pipeline improves "through artifacts —
never through anyone's memory" and enumerates its carriers — ledger, retained evidence, Gotchas —
each of which is either derived or passes through a review disposition. `.claude/agent-memory/`
is literally someone's memory, shapes future worker behaviour before any gate can observe the
effect, outlives the session that wrote it, and is the only such carrier with NO disposition
step. That is a contract coherence question, not an incident count — which is why it is left as
a question rather than a fix.
