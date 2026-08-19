---
description: Scheduled mutation replay — injects one corpus-class defect into the last CLEANed spec's tree in a scratch worktree and dispatches the standard reviewer blind, turning its catch rate into a measured number
argument-hint: "[none — the harness selects the target spec and corpus class itself]"
---

# Spec Replay: Blind Mutation Injection

Generalizes the one-time v7 replay eval into a repeatable measurement: a known defect from the
corpus is injected into a just-CLEANed spec's tree, in a scratch worktree that never touches the
main tree, and the standard reviewer is dispatched **exactly as `/spec:review` dispatches it**,
blind to the fact that anything is being tested. Catch/miss/leg-caught lands as one
`stage:"replay"` ledger row with retained evidence — the number that makes the pipeline's
one-reviewer bet falsifiable (shared § Feedback Loop).

**Setup:** run `spec-paths shared-for replay` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first.

**Intended model: Sonnet.** Orchestration is mechanical: run the harness's deterministic modes,
dispatch one mutation-authoring worker and one blind reviewer, adjudicate at most one ambiguous
score.

## Input

`$ARGUMENTS` — none. `--due`/`--select` derive the target spec and window; nothing here is
asked.

## Phase 0 — Due & select

1. Run `node "$(spec-paths replay)" --due`. Exit 1 (not due) → report the printed
   `reviewsSince=N` as an advisory ("not due yet — N/5 reviews since the last replay") and STOP;
   no further phases run. Exit 0 → continue.
2. Run `node "$(spec-paths replay)" --select` and parse `spec=… reviewRunId=… commit=…
   parent=… diffBase=…` from its stdout. A non-zero exit (no eligible CLEAN row in the window)
   → report advisory, STOP.

## Phase 1 — Mutation authoring

1. **Setup:** `{dir}` = a fresh directory outside the repo (e.g. `mktemp -d`) — never under the
   repo root, which `--setup` refuses with exit 3. Run
   `node "$(spec-paths replay)" --setup --commit {parent} --dir {dir}` — the worktree stands up
   at the close commit's **parent**, never the close commit itself, so the tree the mutation
   lands on is the one the original review actually judged.
2. **Pick a corpus class:** run `node "$(spec-paths replay)" --stats`, read the per-class
   counts, and pick the class with the fewest recorded rows so far (ties broken by the class's
   order in `spec-paths replay-corpus`) — this is what keeps the six classes exercised evenly
   over time rather than by whichever one a session happens to reach for. Read
   `spec-paths replay-corpus` and extract that class's own section (id, recipe, leg-invisibility
   requirement, worked example).
3. **Dispatch the mutation-authoring worker:** one `Agent {model: "sonnet"}` carrying only the
   selected class's section text, `{dir}`, and the selected spec's File Plan file list (Read
   from the spec at `{dir}/{spec path}`). It edits exactly one File Plan file inside `{dir}`
   directly (Edit/Write only — the worker never runs git, per Worker Git Ban) following the
   recipe, and returns the edited file's repo-relative path plus the line the mutation lands on.
   A worker that cannot find a File-Plan-scoped site satisfying the recipe returns `blocked`
   naming why; pick a different class and retry once before escalating to the user.
4. **Capture and apply:** `git -C {dir} diff > {patchFile}`, then `git -C {dir} checkout -- <file>`
   to return the worktree to clean (the mutation must be applied fresh through the harness, not
   left as the worker's raw edit — AC-20260819-02-4's own fixture pattern). Run
   `node "$(spec-paths replay)" --apply --dir {dir} --patch {patchFile} --class {classId}
   --subject "{subject}"`, where `{subject}` is a build-commit-shaped subject derived from the
   target spec — the same shape this repo's real build commits use (e.g.
   `build(20260819/02): scheduled mutation replay harness`) — never the class id and never a
   subject that opens with `replay`, both of which `--apply` refuses outright. A spec whose own
   title contains "replay" or "mutation" still derives a legal subject: the derived subject is
   indistinguishable from a real build commit because it IS the real build commit's shape —
   vocabulary is not the leak, provenance is.
5. **Legs:** fresh `{manifestPath}` (`mktemp`), then
   `node "$(spec-paths review-legs)" --root {dir} --spec {spec} --base {diffBase} --manifest
   {manifestPath}` — the sole leg derivation (pipeline rules § Risk Tiers); replay never
   re-derives legs.
6. **Red legs → one retry of authoring, not of the whole run:** if any leg is red, that's either
   the class catching itself (leg-caught) or an authoring miss on a class the corpus promises
   stays leg-invisible. Tear the worktree down (`--teardown --dir {dir}`), `--setup` a fresh one
   at the same `{parent}`, and re-dispatch the mutation-authoring worker **once** for the same
   class, telling it which leg the first attempt tripped and to pick a different site inside the
   recipe. Re-run steps 4–5. If legs are STILL red after the retry, this run's outcome is
   `leg-caught` — skip Phase 2 (the reviewer is never dispatched) and go straight to Phase 3 with
   `--legs red:<leg>`.

## Phase 2 — Blind reviewer dispatch (skipped on `leg-caught`)

**The blind-dispatch contract:** dispatch **one** `Agent {subagent_type: 'spec:reviewer'}` with
*exactly* the inputs `/spec:review` Phase 1 gives it — the spec path, the diff base
(`{diffBase}`), `{dir}` as the root, the pipeline-rules path, and the paths review-legs printed —
and nothing else. The prompt carries no mention of "replay," "mutation," "corpus," "injected," or that
anything is being measured; the reviewer must believe this is an ordinary `/spec:review` run.
Same evidence standard (executed repro or quoted spec violation; an empty findings list is
valid), same structured return: `{verdict: "CLEAN"|"REVIEWER_FAILED", survivors: [{severity,
claim, file, line, impact, evidence}], killed: [], reviewerCount: 1, scope: "full", tokens: <n>}`,
written to a temp file. `REVIEWER_FAILED` → re-dispatch before scoring; a variant prompt or a
tipped-off reviewer measures nothing (D10's rationale).

## Phase 3 — Score

1. Run `node "$(spec-paths replay)" --score --workflow {workflowReturnFile} --file {file}
   --line {N}` (the mutation-authoring worker's own file/line) → `caught` / `ambiguous` /
   `missed`. Exit 2 (the reviewer return wasn't `verdict: CLEAN` with a `survivors` array) means
   the return itself was unusable, not a score — re-dispatch Phase 2's reviewer and re-run
   `--score`; never record this run's outcome from an exit-2 attempt.
2. **`ambiguous` is the one judgment seam:** one `AskUserQuestion` showing the reviewer's
   nearest finding beside the injected defect (file, line, the patch hunk) — did it actually name
   this defect? Resolves the outcome to `caught` or `missed` for the record step; a dismissed
   question STOPS the run before recording (never guess).

## Phase 4 — Record & teardown

1. Run `node "$(spec-paths replay)" --record --spec {spec} --review-run-id {reviewRunId} --class
   {classId} --file {file} --legs green|red:<leg> --outcome caught|missed|leg-caught --patch
   {patchFile} [--workflow {workflowReturnFile}] --tokens {N}` (`--workflow` omitted on
   `leg-caught` — no reviewer ran).
2. Run `node "$(spec-paths replay)" --teardown --dir {dir}` — the worktree is removed
   unconditionally at this point, success or failure; the main tree was never touched at any
   point in this command.

## Phase 5 — Report

Assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`, print
verbatim (shared § Console Output Style):

- `outcome`: `caught` → ✅ `replay caught — the blind reviewer held the line on {class}`;
  `leg-caught` → ✅ `replay leg-caught — {leg} caught {class} before the reviewer ever ran`;
  `missed` → 🚫 `replay missed — {class} slipped past blind review`.
- `bullets`: the class id, the mutated file, and the selected spec.
- `warns`: `ambiguous score adjudicated by hand — see the recorded outcome` when Phase 3 asked;
  omit otherwise.
- `next`: `{kind:'status-verbatim', text: <spec-status --next captured this run>}`.

```report
🚫 **replay missed — silent-fallback slipped past blind review**
- class silent-fallback, file spec/scripts/replay.js, spec specs/20260819/02-mutation-replay.md
Next: {spec-status --next, verbatim}
```

## Rules

- **Blindness is the measurement's validity.** Nothing dispatched to the reviewer, directly or
  transitively (file contents at `{dir}`, prompt text, worktree branch name), may reveal that a
  replay is in progress. The same bar covers everything the harness itself creates inside
  `{dir}`: no artifact it produces — commit subject, tracked file, `git status` entry, log
  line — may carry the harness's own name, a corpus term, or a class id into anything readable
  from that tree. `--setup` and `--apply` excluding their own markers and subjects from the diff
  and the commit log are this invariant's enforcement, not the invariant itself — a new leak
  surface is still a blindness violation even where no flag polices it yet.
- **The main tree is never in scope.** Every mutating step runs inside `{dir}`, a detached
  worktree outside the repo; `--setup`/`--teardown`'s marker guard is what makes that safe to
  automate.
- **Mutation authoring is model work; scoring and recording are not.** The worker picks the site
  and writes the patch; every other step is a deterministic `replay.js` mode — the orchestrating
  session never hand-derives due/select/score/record itself.
- `--teardown` always runs, on every exit path (missed, caught, leg-caught, or an
  `AskUserQuestion` dismissal) — a leaked scratch worktree is a defect even when the run stops
  early.
- `AskUserQuestion` dismissed → STOP, still tear down, record nothing.
