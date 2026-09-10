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

**Two entry points, one executor.** `/spec:review`'s driver invokes Phases 1–5 below itself when
the harness reports a replay is due — its REPLAY state refuses to conclude the review until an
outcome is recorded. This command remains the **manual surface**: ad-hoc measurement, and the
retry after a non-measurement outcome (`unresolved`/`setup-failed`), which leaves the harness
due. Phase 0's STOP-on-not-due is unchanged here.

**Setup:** run `spec-paths shared-for replay` and read its output. Read the host's
`.claude/spec.config.json` (pipeline rules load with that Read — path-scoped). Either missing →
STOP: run `/spec:init` first.

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
   worktree up at `--commit` (the parent), then re-applies the close commit's non-meta content as
   one build-shaped commit, leaving the three review-outcome surfaces at the parent version (Rules
   § Blindness). `--setup` derives `{dir}` from `{spec}` (a build-shaped name under
   `<root>/.claude/worktrees/`, random-suffixed so it coexists with the spec's own build
   worktree) and self-provisions the host's ignore line when missing, so the worktree stays
   invisible to `git status` in the main tree — doctrine names how the path is derived, never a
   path a session could copy (Rules § Blindness). `--dir <path>` is the manual out-of-repo
   fallback for when no `{spec}` is available; it wins verbatim over derivation when both are
   given, and is refused with exit 3 when its basename opens with `replay` (case-insensitive) —
   the remedy is to omit `--dir` and pass `--spec` so the harness derives a build-shaped name
   instead. An in-repo `--dir` that resolves outside `.claude/worktrees/` keeps its own exit-3
   refusal unchanged. Once registered, `--setup` calls the shared owner
   (`spec-paths worktree-include`) to copy the host's `.worktreeinclude`-matched gitignored files
   into `{dir}` before the setup gate below ever runs; a host with no manifest is unchanged.
2. **Setup gate (D4):** read the host's `setupCommand` from `.claude/spec.config.json` and run it
   inside `{dir}` **without relocating the session** — a subshell or the tool's own directory
   flag, never a bare `cd` (Rules § The session never leaves the main root). Non-zero exit → run
   `node "$(spec-paths replay)" --record --spec {spec} --review-run-id {reviewRunId} --legs none
   --outcome setup-failed`, then `node "$(spec-paths replay)" --teardown --dir {dir}`, render
   Phase 5's `setup-failed` report, and STOP — the harness stays due (D5). Zero exit → `git -C
   {dir} checkout -- .` then `git -C {dir} clean -fd` — checkout alone cannot remove files
   `setupCommand` *creates* (specs/20260820/02-replay-scratch-write-access.md D4); order is
   load-bearing, checkout before clean — then continue to class selection.
3. **Pick a corpus class:** run `node "$(spec-paths replay)" --pick-class` and read `class=` from
   its stdout — the script owns selection (fewest measurement rows, derived classes breaking ties
   first) so this step never re-derives it. A class whose corpus section says it does not apply to
   this host ("pick another") is declared once, by id, in `.claude/spec.config.json` →
   `replay.inapplicableClasses`; the picker skips those and prints them as `skipped=`. Read
   `spec-paths replay-corpus` and extract that class's own section (id, recipe, leg-invisibility
   requirement, worked example).
4. **Author the mutation (D2):** this session writes the mutation itself — Edit/Write into the
   File Plan files the selected class's recipe requires inside `{dir}`, guided only by the
   selected class's section text and the selected spec's File Plan file list (Read from the spec
   at `{dir}/{spec path}`). No authoring agent is dispatched: blindness is a property of Phase
   2's reviewer dispatch, never of who wrote the patch, and a dispatch whose prompt describes
   authoring a defect is exactly what a host's unattended permission layer may refuse
   (specs/20260819/02-mutation-replay.md). One File Plan file for every class except
   `self-consistent-polarity`, whose recipe binds a matched guard-and-assertion pair spanning
   whichever File Plan files its two sites live in: two files on a stack that keeps tests apart
   from code, or one file on a stack that co-locates them (Rust `#[cfg(test)] mod tests`, Elixir,
   doctests) — no line numbers, D9's canonical patch carries the positions. Edit/Write into
   `{dir}` passes the cross-worktree write guard via the `scratch-worktree` marker allow
   (`block-cross-worktree-writes.sh`); mutating files through Bash instead is a contract
   violation, treated as a failed authoring attempt, and git stays out of authoring entirely — the
   first git the mutation meets is step 5's pinned capture. No File-Plan-scoped site satisfying
   the recipe → note why, pick a different class, and retry once before escalating to the user.
5. **Capture and apply (D9):** capture the raw authoring edit with the same pinned flags D9's
   re-emission uses —
   `git -C {dir} -c core.quotePath=off -c diff.noprefix=false -c diff.mnemonicPrefix=false
   -c diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff --no-color > {patchFile}` —
   then `git -C {dir} checkout -- .` to return the worktree to clean (the mutation must be
   applied fresh through the harness, not left as the raw session edit — AC-20260819-02-4's own
   fixture pattern; the retry in step 7 repeats this same pinned capture). Run
   `node "$(spec-paths replay)" --apply --dir {dir} --patch {patchFile} --patch-out {patchOutFile}
   --class {classId} --subject "{subject}" --spec {spec}`, where `{patchOutFile}` is a fresh `mktemp` path
   outside `{dir}` (which `--apply` refuses with exit 3) and becomes the canonical patch every
   later phase reads instead of `{patchFile}`, and `{subject}` is a build-commit-shaped subject
   derived from the target spec — the same shape this repo's real build commits use (e.g.
   `build(20260819/02): scheduled mutation replay harness`) — never the class id and never a
   subject that opens with `replay`, both of which `--apply` refuses outright. A spec whose own
   title contains "replay" or "mutation" still derives a legal subject — indistinguishable from a
   real build commit because it IS one; vocabulary is not the leak, provenance is.
   **`--spec {spec}` and the post-apply reconcile:** `--apply` always takes `--spec {spec}` and,
   between `git apply --index` and the commit, runs the host's declared post-apply reconcile
   (`replay.afterApply` in `.claude/spec.config.json`, read from the main root) inside `{dir}`,
   `{spec}` substituted into the declared command. It stages only the paths declared — never the
   whole dirty tree — so the commit carries the same derived-artifact reconciliation a real build
   commit carries, and excludes those declared paths from `{patchOutFile}` so the reconcile never
   scores as part of the mutation. A host that declares no `replay.afterApply` is unchanged:
   `--apply` behaves byte-for-byte as today. A refusal at the hook (nonzero command exit, an undeclared path
   newly dirtied, a `--spec` failing its shape check, a malformed `afterApply` block, or the hook
   changing or removing a file the mutation patch itself touches (D14)) leaves the
   commit unmade and is recorded, never improvised: `--record --spec {spec} --review-run-id
   {reviewRunId} --legs none --outcome setup-failed` (no `--class` — nothing was measured), then
   `--teardown --dir {dir}`, then Phase 5's `setup-failed` report with the hook's stderr in the
   bullet that would otherwise name `setupCommand`, then STOP — the harness stays due.
6. **Legs:** fresh `{manifestPath}` (`mktemp`), then `node "$(spec-paths review-legs)" --root
   {dir} --spec {spec} --base {diffBase} --manifest {manifestPath}` — the sole leg derivation
   (pipeline rules § Risk Tiers); replay never re-derives legs.
7. **Red legs → attribute against the baseline, retry only what's newly-red:** for each red leg
   `L` in the manifest, attribute it against `{baselineRed}`/`{baselineLegs}` (step 2's tokens)
   in this order:
   1. `L == reconcile` → explained: a deterministic exemption, not a judgment call — the mutation
      is File-Plan-confined by step 4's authoring contract and reconcile redness is definitionally
      about a path *outside* the File Plan, so it can never be mutation-caused. (A canonical patch
      naming an out-of-plan file is a failed authoring attempt under step 4's rule instead; this
      exemption never applies there.)
   2. `L ∈ {baselineRed}` → explained. The review that closed this target already recorded `L`
      red for a sanctioned, pre-existing reason.
   3. Otherwise, if `L ∈ {baselineLegs}` → **newly red**: `L` was green at the reviewed run and is
      red now, so the mutation is the suspect — either the class catching itself (leg-caught) or
      an authoring miss on a class the corpus promises stays leg-invisible. Tear the worktree down
      (`--teardown --dir {dir}`), `--setup` a fresh one at the same `{parent}` + `{commit}`
      overlay, and re-author the mutation **once** for the same class, avoiding the site whose
      edit tripped the leg — a different site inside the same recipe. Re-run steps 5–6. If legs
      are STILL red after the retry, run the **pristine-baseline verification** before
      `leg-caught` is ever recorded: `git -C {dir} reset --hard HEAD^` drops exactly the mutation
      commit (the overlay commit, or the parent when none exists, remains), then a fresh manifest
      and a fresh `node "$(spec-paths review-legs)"` run against the now-pristine tree. `L` green
      there → outcome `leg-caught` — skip Phase 2 (the reviewer never dispatches) and go straight
      to Phase 3 with `--legs red:<leg>` (the newly-red meaning, never baseline-red). `L` still
      red there → not mutation-caused (environment drift): fall through to rung 4's
      `AskUserQuestion` seam with both manifests as evidence — never record `leg-caught` from an
      unverified still-red result.
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
and nothing else; no mention of "replay," "mutation," "corpus," "injected," or that anything is
being measured, so the reviewer believes this is an ordinary `/spec:review` run. Same evidence
standard (executed repro or quoted spec violation; an empty findings list is valid), same
structured return: `{verdict: "CLEAN"|"REVIEWER_FAILED", survivors: [{severity, claim, file, line,
impact, evidence}], killed: [], reviewerCount: 1, tokens: <n>}`, written to a temp file.
`REVIEWER_FAILED` → re-dispatch before scoring; a variant prompt or a tipped-off reviewer measures
nothing (D10's rationale).

## Phase 3 — Score

1. Run `node "$(spec-paths replay)" --score --workflow {workflowReturnFile} --patch
   {patchOutFile}` (D1: the mutation's own hunk positions, never a remembered line —
   `{patchOutFile}` is `--apply`'s canonical re-emission, never `{patchFile}`) → `caught` /
   `ambiguous` / `missed`. Exit 2 covers two unusable-input cases: the reviewer return wasn't
   `verdict: CLEAN` with a `survivors` array (re-dispatch Phase 2's reviewer and re-run `--score`;
   never record this run's outcome from that attempt), or `{patchOutFile}` parsed to zero hunks (a
   harness defect, not a score — escalate). Neither case is a recordable outcome.
2. **`ambiguous` is the one judgment seam:** one `AskUserQuestion` showing the reviewer's nearest
   finding beside the injected defect (file, line, the patch hunk) — did it actually name this
   defect? Resolves the outcome to `caught` or `missed` for Phase 4. A dismissed question resolves
   the outcome to `unresolved` instead (D3) — the reviewer return still rides into the record step
   via `--workflow`, never discarded — and Phase 4 still runs: the run is never silent.
3. A survivor naming only a declared reconcile path (excluded from `{patchOutFile}` by step 5) is
   not a kill — the reviewer spent its finding on commit shape, not the planted defect — so it
   adjudicates `missed`, never left `ambiguous`.

## Phase 4 — Record & teardown

1. Run `node "$(spec-paths replay)" --record --spec {spec} --review-run-id {reviewRunId} --legs
   green|baseline-red:<leg>[,<leg>]|red:<leg>|none --outcome
   caught|missed|leg-caught|unresolved|setup-failed [--class {classId}] [--patch {patchOutFile}]
   [--workflow {workflowReturnFile}] --tokens {N} --via driver|manual` — `--via driver` when this
   run's target came from the review driver's REPLAY step, `--via manual` when Phase 0 ran here
   (the manual surface). D2/D3's restated validation matrix:

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
   evidence never produced. `leg-caught` keeps `red:<leg>`, newly-red only, `--patch` required,
   `--workflow` still not required. `setup-failed` is recorded and torn down at two sites, both
   inside Phase 1 (step 2's setup-gate refusal, step 5's post-apply reconcile-hook refusal) —
   neither one reaches this phase.
2. Run `node "$(spec-paths replay)" --teardown --dir {dir}` — the worktree is removed
   unconditionally at this point, success or failure; the main tree was never touched at any
   point in this command.

## Phase 5 — Report

Assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`, print
verbatim (shared § Console Output Style):

- `outcome`: `caught` → ✅ `replay caught — the blind reviewer held the line on {class}`;
  `leg-caught` → ✅ `replay leg-caught — {leg} caught {class} before the reviewer ever ran`;
  `missed` → 🚫 `replay missed — {class} slipped past blind review`; `unresolved` → ⚠️
  `replay unresolved — {class} needs a human adjudication`; `setup-failed` → 🚫 `replay
  setup-failed — the scratch copy could not be prepared`.
- `bullets`: the class id, the mutated file(s), and the selected spec; `unresolved` adds the
  retained `runId`; `setup-failed` never had a class or a mutated file — its bullets name the
  failing `setupCommand` and the selected spec instead; `missed` adds `- {runId} — the plugin
  repo's fleet-reader --owed picks this row up; no handoff prompt is composed here`.
- `warns`: `ambiguous score adjudicated by hand — see the recorded outcome` when Phase 3 asked;
  omit otherwise.
- `next`: `{kind:'status-verbatim', text: <spec-status --next captured this run>}`.

```report
🚫 **replay missed — silent-fallback slipped past blind review**
- class silent-fallback, file spec/scripts/replay.js, spec specs/20260819/02-mutation-replay.md
Next: {spec-status --next, verbatim}
```

## Rules

- **Blindness is the measurement's validity.** Nothing dispatched to the reviewer nor any
  artifact the harness creates inside `{dir}` (file contents, prompt, branch name, worktree
  **path**, marker filename, commit subject, `git status` entry) may reveal a replay is in
  progress — a new leak surface is still a violation even unpoliced. The worktree path is
  spec-derived and the marker neutrally named `scratch-worktree`
  (specs/20260826/01-replay-scratch-path-blindness.md); the three review-outcome meta prefixes
  (`specs/`, `.claude/`, `docs/canonical/`) never enter the tree except `.claude/agent-memory/`
  (specs/20260831/01-replay-range-materialization.md).
- **The main tree is never in scope.** Every mutating step runs inside `{dir}`, a detached
  worktree isolated by three mechanisms together — the worktree itself, the ignore line
  `--setup` self-provisions when missing, and the `--setup`/`--teardown` marker guard.
- **The session never leaves the main root.** `{dir}` is reached only by naming it (`--dir
  {dir}`, `git -C {dir}`, a subshell), never by relocating the shell into it — a relocated shell
  writes the measurement row into the scratch worktree and loses it at teardown; `replay.js`'s
  `--root <path>` is the escape hatch for a caller that cannot honour this
  (specs/20260827/01-genesis-tournament.md, review).
- **Mutation authoring is model work; scoring and recording are not.** The session picks the site
  and writes the patch itself (step 4 — never a dispatched agent, never a scripted transform: site
  selection is semantic); every other step is a deterministic `replay.js` mode — the session never
  hand-derives due/select/score/record itself.
- `--teardown` always runs, on every exit path (missed, caught, leg-caught, or an
  `AskUserQuestion` dismissal) — a leaked scratch worktree is a defect even when the run stops early.
- `AskUserQuestion` dismissed → resolve the outcome to `unresolved` (D3), still record and tear down — never record nothing.
