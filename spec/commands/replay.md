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

**Two entry points, one executor.** `/spec:review`'s driver invokes Phases 1–5 below itself
when the harness reports a replay is due — its REPLAY state refuses to conclude the review
until an outcome is recorded for the selected target. This command remains the **manual
surface**: ad-hoc measurement, and the retry after a non-measurement outcome
(`unresolved`/`setup-failed`), which leaves the harness due. Phase 0's STOP-on-not-due is
unchanged here.

**Setup:** run `spec-paths shared-for replay` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first.

**Intended model: Sonnet** — and the placement covers mutation authoring itself, not just
orchestration: run the harness's deterministic modes, author one mutation in-session, dispatch
one blind reviewer, adjudicate at most one ambiguous score.

## Input

`$ARGUMENTS` — none. `--due`/`--select` derive the target spec and window; nothing here is
asked.

## Phase 0 — Due & select

1. Run `node "$(spec-paths replay)" --due`. Exit 1 (not due) → report the printed
   `reviewsSince=N` as an advisory ("not due yet — N/5 reviews since the last replay") and STOP;
   no further phases run. Exit 0 → continue.
2. Run `node "$(spec-paths replay)" --select` and parse `spec=… reviewRunId=… commit=…
   parent=… diffBase=… baselineRed=… baselineLegs=…` from its stdout — `{baselineRed}` names the
   selected review row's own pre-existing red legs (`none` when it closed all-green,
   `unknown` when the row carries no `legs` array); `{baselineLegs}` names every leg the row
   recorded (`unknown` exactly when `{baselineRed}` is). Both are step 7's attribution baseline —
   zero extra leg runs. A non-zero exit (no eligible CLEAN row in the window) → report advisory,
   STOP.

## Phase 1 — Mutation authoring

1. **Setup:** run `node "$(spec-paths replay)" --setup --commit {parent} --overlay {commit} --spec
   {spec}` and read `{dir}` from the `dir=` value it prints — `--overlay {commit}` materializes
   the judged range's true upper bound: a `diff.dirty:true` row's judged range is completed by
   the close commit that follows it (range-identity spec 20260824/06 D3/D7), so the bare parent
   under-states the range whenever fix-worker edits rode that close commit. `--setup` stands the
   worktree up at `--commit` (the parent) and then re-applies the close commit's non-meta content
   as one build-shaped commit, leaving the three review-outcome surfaces (`specs/`, `.claude/`,
   `docs/canonical/`) at the parent version — the mutation still lands on the same blind tree this
   command has always used, just materialized out to the close commit instead of truncated at its
   parent. `--setup` derives `{dir}` itself from `{spec}` (a
   build-shaped name under `<root>/.claude/worktrees/`, random-suffixed so it coexists with the
   spec's own build worktree if one is still registered) and self-provisions the host's ignore
   line when it's missing, so the worktree stays invisible to `git status` in the main tree.
   Doctrine names how the path is derived, never a path a session could copy — that is exactly
   the leak this command's Rules § Blindness now closes. `--dir <path>` is the manual
   out-of-repo fallback (e.g. `mktemp -d`) for when no `{spec}` is available to derive from; it
   wins verbatim over derivation when both are given, and it is refused with exit 3 when its
   basename opens with `replay` (case-insensitive) — the remedy is to omit `--dir` and pass
   `--spec` so the harness derives a build-shaped name instead. An in-repo `--dir` that resolves
   outside `.claude/worktrees/` keeps its own exit-3 refusal unchanged.
2. **Setup gate (D4):** read the host's `setupCommand` from `.claude/spec.config.json` and run
   it inside `{dir}` **without relocating the session** — a subshell (`(cd {dir} && <setupCommand>)`)
   or the tool's own directory flag, never a bare `cd`, since a session shell that stays inside
   `{dir}` silently redirects every later cwd-defaulted harness step into the tree teardown is
   about to delete (Rules § The session never leaves the main root). Non-zero exit → run `node "$(spec-paths replay)" --record --spec {spec}
   --review-run-id {reviewRunId} --legs none --outcome setup-failed`, then
   `node "$(spec-paths replay)" --teardown --dir {dir}`, render Phase 5's `setup-failed` report,
   and STOP — no class is picked, no patch is authored, nothing was measured, and the harness
   stays due (D5: a non-measurement row never resets the clock). Zero exit → restore tracked
   files inside `{dir}` (`git -C {dir} checkout -- .`) so nothing `setupCommand` wrote — a
   rewritten lockfile, generated code — reaches the tree the legs and the blind reviewer read
   (D10), then run `git -C {dir} clean -fd` — `git checkout -- .` alone restores tracked files
   but cannot remove files `setupCommand` *creates* (the 2026-08-20 first live run left an
   untracked root `package-lock.json` that would have polluted the blind reviewer's tree), and
   `clean -fd` cannot touch the `scratch-worktree` marker, which lives in the worktree's private
   git dir outside the working tree — order is load-bearing: checkout first, then clean — then
   continue to class selection.
3. **Pick a corpus class:** run `node "$(spec-paths replay)" --pick-class` and read `class=` from
   its stdout — the script owns selection (fewest measurement rows, derived classes breaking ties
   first) so this step never re-derives it. Read `spec-paths replay-corpus` and extract that
   class's own section (id, recipe, leg-invisibility requirement, worked example).
4. **Author the mutation (D2):** this session writes the mutation itself — Edit/Write into the
   File Plan files the selected class's recipe requires inside `{dir}`, guided only by the
   selected class's section text and the selected spec's File Plan file list (Read from the spec
   at `{dir}/{spec path}`). No authoring agent is dispatched: blindness is a property of Phase
   2's reviewer dispatch, never of who wrote the patch, and a dispatch whose prompt describes
   authoring a defect is exactly what a host's unattended permission layer may refuse (salon-os
   2026-08-31, three refusals; the /private/tmp Edit/Write denial of 2026-08-23 was the same
   layer one level down). One File Plan file for every class except `self-consistent-polarity`,
   whose recipe binds a matched guard-and-assertion pair that spans whichever File Plan files its
   two sites actually live in: two files on a stack that keeps tests apart from code, or one file
   on a stack that co-locates them (Rust `#[cfg(test)] mod tests`, Elixir, doctests). Note no
   line numbers anywhere; D9's canonical patch carries the positions. The session's Edit/Write
   into `{dir}` passes the cross-worktree write guard via the `scratch-worktree` marker allow
   (`block-cross-worktree-writes.sh`); mutating files through Bash instead remains a contract
   violation, treated as a failed authoring attempt rather than an improvisation, and git stays
   out of authoring entirely — the first git the mutation meets is step 5's pinned capture. No
   File-Plan-scoped site satisfying the recipe → note why, pick a different class, and retry
   once before escalating to the user.
5. **Capture and apply (D9):** capture the raw authoring edit with the same pinned flags D9's
   re-emission uses —
   `git -C {dir} -c core.quotePath=off -c diff.noprefix=false -c diff.mnemonicPrefix=false
   -c diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff --no-color > {patchFile}` —
   then `git -C {dir} checkout -- .` to return the worktree to clean (the mutation must be
   applied fresh through the harness, not left as the raw session edit — AC-20260819-02-4's own
   fixture pattern; the retry in step 7 repeats this same pinned capture). Run
   `node "$(spec-paths replay)" --apply --dir {dir} --patch {patchFile} --patch-out {patchOutFile}
   --class {classId} --subject "{subject}"`, where `{patchOutFile}` is a fresh `mktemp` path
   outside `{dir}` (which `--apply` refuses with exit 3) and becomes the canonical patch every
   later phase reads instead of `{patchFile}`, and `{subject}` is a build-commit-shaped subject
   derived from the target spec — the same shape this repo's real build commits use (e.g.
   `build(20260819/02): scheduled mutation replay harness`) — never the class id and never a
   subject that opens with `replay`, both of which `--apply` refuses outright. A spec whose own
   title contains "replay" or "mutation" still derives a legal subject: the derived subject is
   indistinguishable from a real build commit because it IS the real build commit's shape —
   vocabulary is not the leak, provenance is.
6. **Legs:** fresh `{manifestPath}` (`mktemp`), then
   `node "$(spec-paths review-legs)" --root {dir} --spec {spec} --base {diffBase} --manifest
   {manifestPath}` — the sole leg derivation (pipeline rules § Risk Tiers); replay never
   re-derives legs.
7. **Red legs → attribute against the baseline, retry only what's newly-red:** for each red leg
   `L` in the manifest, attribute it against `{baselineRed}`/`{baselineLegs}` (step 2's tokens)
   in this order:
   1. `L == reconcile` → explained. This is a deterministic exemption, not a judgment call: the
      mutation is File-Plan-confined by step 4's authoring contract, and reconcile redness is
      definitionally about a path *outside* the File Plan — so it can never be mutation-caused.
      (A canonical patch that names an out-of-plan file is a failed authoring attempt under step
      4's existing rule; this exemption never applies to that case — that failure is handled
      there, not here.)
   2. `L ∈ {baselineRed}` → explained. The review that closed this target already recorded `L`
      red for a sanctioned, pre-existing reason.
   3. Otherwise, if `L ∈ {baselineLegs}` → **newly red**: `L` was green at the original review and
      is red now, so the mutation is the suspect — either the class catching itself (leg-caught)
      or an authoring miss on a class the corpus promises stays leg-invisible. Tear the worktree
      down (`--teardown --dir {dir}`), `--setup` a fresh one at the same `{parent}` +
      `{commit}` overlay, and re-author the mutation **once** for the same class, avoiding the
      site whose edit tripped the leg — a different site inside the same recipe. Re-run steps 5–6.
      If legs are STILL red after the retry, run the **pristine-baseline verification** before
      `leg-caught` is ever recorded: `git -C {dir} reset --hard HEAD^` — this drops exactly the
      mutation commit (the overlay commit, or the parent when no overlay commit exists, remains)
      — then a fresh manifest (a new `{manifestPath}`) and a fresh `node
      "$(spec-paths review-legs)"` run against the now-pristine tree. `L` green on the pristine
      baseline → this run's outcome is
      `leg-caught` — skip Phase 2 (the reviewer is never dispatched) and go straight to Phase 3
      with `--legs red:<leg>` (the newly-red meaning, never the baseline-red one). `L` still red
      on the pristine baseline → not mutation-caused (environment drift, not the mutation): fall
      through to rung 4's `AskUserQuestion` seam, presenting both the mutated-tree manifest and
      the pristine-tree manifest as evidence — never record `leg-caught` from an unverified
      still-red result.
   4. Otherwise (`L ∉ {baselineLegs}`, or the baseline is `unknown`) → unattributable: one
      `AskUserQuestion` showing `L`'s failure output beside the recorded baseline — is this leg's
      redness pre-existing or caused by the mutation? "pre-existing" resolves it explained, same
      as (1)/(2) above. "mutation-caused" resolves it newly-red, same as (3) — retry once, then
      `leg-caught` if still red after the retry. A **dismissed** question resolves the run's
      outcome to `unresolved`, recorded via D3's workflow-refusing `red:<leg>` arm — `--workflow`
      is never passed on that record, since the reviewer never ran — and teardown still runs.

   A run whose every red leg attributes to (1) or (2) is fully explained: it proceeds to Phase 2
   exactly as an all-green run does, and its Phase 4 record carries `--legs baseline-red:<L>[,<L>]`
   in place of `green`.

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

1. Run `node "$(spec-paths replay)" --score --workflow {workflowReturnFile}
   --patch {patchOutFile}` (D1: the mutation's own hunk positions, never a remembered
   line — `{patchOutFile}` is `--apply`'s canonical re-emission, never `{patchFile}`) →
   `caught` / `ambiguous` / `missed`. Exit 2 covers two distinct unusable-input cases: the
   reviewer return wasn't `verdict: CLEAN` with a `survivors` array (re-dispatch Phase 2's
   reviewer and re-run `--score`; never record this run's outcome from that attempt), or
   `{patchOutFile}` parsed to zero hunks (a harness defect, not a score — escalate). Neither
   case is a recordable outcome.
2. **`ambiguous` is the one judgment seam:** one `AskUserQuestion` showing the reviewer's
   nearest finding beside the injected defect (file, line, the patch hunk) — did it actually name
   this defect? Resolves the outcome to `caught` or `missed` for Phase 4. A dismissed question
   resolves the outcome to `unresolved` instead (D3) — the reviewer return still rides into the
   record step via `--workflow`, never discarded — and Phase 4 still runs: the run is never
   silent.

## Phase 4 — Record & teardown

1. Run `node "$(spec-paths replay)" --record --spec {spec} --review-run-id {reviewRunId}
   --legs green|baseline-red:<leg>[,<leg>]|red:<leg>|none --outcome
   caught|missed|leg-caught|unresolved|setup-failed [--class {classId}] [--patch {patchOutFile}]
   [--workflow {workflowReturnFile}] --tokens {N}` — D2/D3's restated validation matrix:

   | `--outcome` | `--legs` accepted | `--patch` | `--workflow` |
   |---|---|---|---|
   | caught / missed | `green` \| `baseline-red:<leg>[,<leg>]` | required | required |
   | unresolved | `green` \| `baseline-red:<leg>[,<leg>]` | required | required |
   | unresolved | `red:<leg>` | required | **refused** |
   | leg-caught | `red:<leg>` (newly-red only — doctrine-enforced) | required | not required (unchanged) |
   | setup-failed | `none` | refused | refused |

   `caught`/`missed` and Phase 3's `unresolved` (the reviewer ran) accept `green` or step 7's
   explained-red case, `baseline-red:<leg>[,<leg>]`, and require `--patch` + `--workflow`. Step
   7's dismissed-question `unresolved` (the reviewer never ran) instead carries `red:<leg>`,
   requires `--patch`, and **refuses** `--workflow` — passing it there would fabricate reviewer
   evidence that was never produced. `leg-caught` keeps `red:<leg>`, newly-red only, requiring
   `--patch` with `--workflow` still not required. `setup-failed` is recorded and torn down in
   Phase 1 step 2 — it never reaches this phase.
2. Run `node "$(spec-paths replay)" --teardown --dir {dir}` — the worktree is removed
   unconditionally at this point, success or failure; the main tree was never touched at any
   point in this command.

## Phase 5 — Report

Assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`, print
verbatim (shared § Console Output Style):

- `outcome`: `caught` → ✅ `replay caught — the blind reviewer held the line on {class}`;
  `leg-caught` → ✅ `replay leg-caught — {leg} caught {class} before the reviewer ever ran`;
  `missed` → 🚫 `replay missed — {class} slipped past blind review`; `unresolved` → ⚠️
  `replay unresolved — {class} needs a human adjudication`; `setup-failed` → 🚫
  `replay setup-failed — the scratch copy could not be prepared`.
- `bullets`: the class id, the mutated file(s), and the selected spec; `unresolved` adds the
  retained `runId` for later adjudication; `setup-failed` never had a class or a mutated file —
  its bullets name the failing `setupCommand` and the selected spec instead.
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
  transitively (file contents at `{dir}`, prompt text, worktree branch name, the worktree
  **path** handed to the reviewer as its root, the marker filename in the tree's private git
  dir), may reveal that a replay is in progress. The same bar covers everything the harness
  itself creates inside `{dir}`: no artifact it produces — commit subject, tracked file, `git
  status` entry, log line — may carry the harness's own name, a corpus term, or a class id into
  anything readable from that tree. `--setup` and `--apply` excluding their own markers and
  subjects from the diff and the commit log are this invariant's enforcement, not the invariant
  itself — a new leak surface is still a blindness violation even where no flag polices it yet.
  The path and the marker were the two surfaces that bit on 2026-08-26
  (specs/20260826/01-replay-scratch-path-blindness.md): `--setup` now derives the path from the
  target spec instead of a doctrine example a session could copy, and the marker carries the
  neutral name `scratch-worktree`. The `--overlay` materialization (specs/20260831/01) is bound
  by the same invariant from the other direction: the three meta prefixes (`specs/`, `.claude/`,
  `docs/canonical/`) — where a close commit records the review's own outcome (status flip,
  ledger row, canonical delta) — never enter the tree at all, so the "already reviewed" signal
  those paths would carry stays out of what the blind reviewer can read.
- **The main tree is never in scope.** Every mutating step runs inside `{dir}`, a detached
  worktree isolated by three mechanisms together — the worktree itself, the ignore line
  `--setup` self-provisions when the host lacks it, and the `--setup`/`--teardown` marker guard
  in its private git dir — never by living outside the repo, which is now only the manual
  fallback's isolation story.
- **The session never leaves the main root.** Every step of this command runs with the session's
  working directory in the repo whose ledger the run belongs to; `{dir}` is reached only by
  naming it (`--dir {dir}`, `git -C {dir}`, a subshell), never by relocating the shell into it.
  `replay.js` takes `--root <path>` for a caller that cannot honour this — the ledger-reading and
  ledger-appending modes (`--due`, `--select`, `--setup`, `--record`, `--stats`, `--teardown`)
  otherwise resolve the repo from the current directory, so a relocated shell writes the
  measurement row into the scratch worktree and loses it at teardown (observed 2026-08-27,
  review of specs/20260827/01).
- **Mutation authoring is model work; scoring and recording are not.** The session picks the
  site and writes the patch itself (step 4 — never a dispatched agent, never a scripted
  transform: site selection is semantic); every other step is a deterministic `replay.js` mode —
  the session never hand-derives due/select/score/record itself.
- `--teardown` always runs, on every exit path (missed, caught, leg-caught, or an
  `AskUserQuestion` dismissal) — a leaked scratch worktree is a defect even when the run stops
  early.
- `AskUserQuestion` dismissed → resolve the outcome to `unresolved` (D3), still record and tear
  down — never record nothing.
