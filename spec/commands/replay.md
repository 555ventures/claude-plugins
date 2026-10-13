---
description: Scheduled mutation replay — injects one corpus-class defect into the last CLEANed spec's tree in a scratch worktree and dispatches the standard reviewer blind, turning its catch rate into a measured number
argument-hint: "[none — the harness selects the target spec and corpus class itself]"
---

# Spec Replay: Blind Mutation Injection

A known defect from the corpus is injected into a just-CLEANed spec's tree, in a scratch
worktree that never touches the main tree, and the standard reviewer is dispatched **exactly as
the review stage dispatches it**, blind to the fact that anything is being tested. Catch/miss/
leg-caught lands as one `stage:"replay"` ledger row (shared § Feedback Loop).

**One entry point.** This command is the sole executor of Phases 1–5 below; dueness is
shared § Feedback Loop's policy. Run it whenever due, ad-hoc or as the retry after a
non-measurement outcome (`unresolved`/`setup-failed`). Phase 0's STOP-on-not-due is unchanged.

**Setup:** run `spec-paths shared-for replay` and read its output. Read the host's
`.claude/spec.config.json`. Either missing → STOP: run `/spec:init` first.

**Intended model: Sonnet** — mutation authoring included.

## Input

`$ARGUMENTS` — none.

## Phase 0 — Due & select

1. Run `node "$(spec-paths replay)" --due`. Exit 1 (not due) → report the printed
   `reviewsSince=N` as an advisory ("not due yet — N/5 reviews since the last replay") and STOP;
   no further phases run. Exit 0 → continue.
2. Run `node "$(spec-paths replay)" --select` and parse `spec=… reviewRunId=… commit=…
   parent=… diffBase=… baselineRed=… baselineLegs=…` from stdout: `{baselineRed}` is the row's
   pre-existing red legs (`none` all-green, `unknown` no `legs` array), `{baselineLegs}` every leg
   it recorded — step 7's attribution baseline. Exit 4 (row can't name its own bounds) → report
   the blockage, run `node "$(spec-paths replay)" --backfill-pins`, retry `--select` once; a
   second exit 4 or any other non-zero exit → report advisory, STOP.

## Phase 1 — Mutation authoring

1. **Setup:** run `node "$(spec-paths replay)" --setup --commit {parent} --overlay {commit} --spec
   {spec}` and read `{dir}` from `dir=` — `--overlay {commit}` materializes the judged range's true
   upper bound: a `diff.dirty:true` row's range completes at its close commit, so the bare parent
   under-states it when fix-worker edits rode that commit. Once registered, `--setup` copies
   `.worktreeinclude`-matched gitignored files into `{dir}` (`spec-paths worktree-include`) before
   the setup gate runs; no manifest leaves this unchanged. Exit 5 (post-overlay AC coverage
   fails) → `node "$(spec-paths replay)" --teardown --dir {dir}` then `node "$(spec-paths
   replay)" --record --spec {spec} --review-run-id {reviewRunId} --legs pristine-red:ac-matrix
   --outcome setup-failed` (no `--class`/`--patch`/`--workflow`), render Phase 5's
   `setup-failed` report, STOP — the harness stays due.
2. **Setup gate (D4):** read the host's `setupCommand` from `.claude/spec.config.json` and run it
   inside `{dir}` **without relocating the session** — a subshell or the tool's own directory
   flag, never a bare `cd` (Rules § The session never leaves the main root). Non-zero exit → run
   `node "$(spec-paths replay)" --record --spec {spec} --review-run-id {reviewRunId} --legs none
   --outcome setup-failed`, then `node "$(spec-paths replay)" --teardown --dir {dir}`, render
   Phase 5's `setup-failed` report, and STOP — the harness stays due (D5). Zero exit → `git -C
   {dir} checkout -- .` then `git -C {dir} clean -fd` — checkout alone cannot remove files
   `setupCommand` *creates*; order is load-bearing, checkout before clean — then continue to
   class selection.
3. **Pick a corpus class:** run `node "$(spec-paths replay)" --pick-class` and read `class=` from
   its stdout. Read `spec-paths replay-corpus` and extract that class's own section.
4. **Author the mutation (D2):** this session writes the mutation itself — Edit/Write into the
   File Plan files the selected class's recipe requires inside `{dir}`, guided only by the
   selected class's section text and the selected spec's File Plan file list (Read from the spec
   at `{dir}/{spec path}`). No authoring agent is dispatched. Edit/Write into
   `{dir}` passes the cross-worktree write guard via the `scratch-worktree` marker allow
   (`block-cross-worktree-writes.sh`); mutating files through Bash instead is a contract
   violation, treated as a failed authoring attempt, and git stays out of authoring entirely.
   No File-Plan-scoped site satisfying the recipe → note why, pick a different class, and
   retry once before escalating to the user.
5. **Capture and apply (D9):** capture the raw authoring edit with D9's own pinned-flags `git diff`
   (`-c core.quotePath=off -c diff.noprefix=false -c diff.mnemonicPrefix=false -c
   diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff --no-color > {patchFile}`), then
   `git -C {dir} checkout -- .` to return the worktree to clean. Run `node "$(spec-paths replay)"
   --apply --dir {dir} --patch {patchFile} --patch-out {patchOutFile} --class {classId}
   --subject "{subject}" --spec {spec}`, where `{patchOutFile}` is a fresh `mktemp` path outside
   `{dir}` and becomes the canonical patch every later phase reads instead of `{patchFile}`, and
   `{subject}` is a build-commit-shaped subject derived from the target spec — never the class id
   and never a subject opening with `replay`. **The post-apply reconcile:** `--apply` takes
   `--spec {spec}` and runs the host's declared post-apply reconcile (`replay.afterApply` in
   `.claude/spec.config.json`) inside `{dir}`, staging only the declared paths, and excludes
   those paths from `{patchOutFile}` so the reconcile never scores as part of the mutation. A host
   that declares none is unchanged. A refusal at the hook leaves the commit unmade and is
   recorded, never improvised: `--record --spec {spec} --review-run-id {reviewRunId} --legs none
   --outcome setup-failed` (no `--class`), then `--teardown --dir {dir}`, then Phase 5's
   `setup-failed` report with the hook's stderr where `setupCommand` would be named, then STOP.
6. **Legs:** fresh `{manifestPath}` (`mktemp`), then `node "$(spec-paths review-legs)" --root
   {dir} --spec {spec} --base {diffBase} --manifest {manifestPath} --replay` — the sole leg
   derivation; replay never re-derives legs.
7. **Red legs → attribute against the baseline, retry only what's newly-red:** for each red leg
   `L` in the manifest, attribute it against `{baselineRed}`/`{baselineLegs}` (step 2's tokens)
   in this order:
   1. `L == reconcile` → explained: a deterministic exemption — the mutation is File-Plan-confined
      by step 4's authoring contract, so reconcile redness can never be mutation-caused.
   2. `L ∈ {baselineRed}` → explained.
   3. Otherwise, if `L ∈ {baselineLegs}` → **newly red**: the mutation is the suspect. Tear the
      worktree down (`--teardown --dir {dir}`), `--setup` a fresh one at the same `{parent}` +
      `{commit}` overlay, and re-author the mutation **once** for the same class, avoiding the
      site whose edit tripped the leg. Re-run steps 5–6. If legs are STILL red after the retry,
      run the **pristine-baseline verification** before `leg-caught` is ever recorded: `git -C
      {dir} reset --hard HEAD^` drops exactly the mutation commit, then a fresh manifest and a
      fresh `node "$(spec-paths review-legs)"` run against the now-pristine tree. `L` green
      there → outcome `leg-caught` — skip Phase 2 and go straight to Phase 3 with
      `--legs red:<leg>`. `L` still red there → re-run **once more**, a **third** fresh manifest,
      same pristine tree; compare the same first failing line (the first `/^\s*(✖|not ok)\b/`
      line in `{outDir}/<leg>-output.txt` or `L`'s stderr, else the first non-empty stderr line)
      across both pristine runs. Same line twice is deterministic — a harness defect, never a
      user question: `--record --review-run-id {reviewRunId} --legs pristine-red:<L>[,<L>]
      --outcome setup-failed` (no `--class`/`--patch`/`--workflow`), copy all three manifests to
      `{root}/.claude/spec-runs/{runId}.manifests/` before `--teardown --dir {dir}`, render Phase
      5's `setup-failed` report naming `L`'s first failing line, STOP, and open a harness spec
      citing the manifests. Green, or a different failing line, is drift: fall through to rung 4's
      `AskUserQuestion` seam with all three manifests as evidence.
   4. Otherwise (`L ∉ {baselineLegs}`, or the baseline is `unknown`) → unattributable: one
      `AskUserQuestion` showing `L`'s failure output beside the recorded baseline — is this leg's
      redness pre-existing or caused by the mutation? "pre-existing" resolves it explained;
      "mutation-caused" resolves it newly-red, same as (3). A **dismissed** question resolves
      the run's outcome to `unresolved`, recorded via the `red:<leg>` arm — `--workflow` is
      never passed on that record — and teardown still runs.

   A run whose every red leg attributes to (1) or (2) proceeds to Phase 2 exactly as an
   all-green run does, and its Phase 4 record carries `--legs baseline-red:<L>[,<L>]`.

## Phase 2 — Blind reviewer dispatch (skipped on `leg-caught`)

**The blind-dispatch contract:** dispatch **one** `Agent {subagent_type: 'spec:reviewer'}` with
*exactly* the inputs the review stage's own REVIEWER step gives it — the spec path, the diff base
(`{diffBase}`), `{dir}` as the root, the pipeline-rules path, and the paths review-legs printed —
and nothing else; no mention of "replay," "mutation," "corpus," "injected," or that anything is
being measured. Same structured return: `{verdict: "CLEAN"|"REVIEWER_FAILED", survivors:
[{severity, claim, file, line, impact, evidence}], killed: [], reviewerCount: 1, tokens: <n>}`,
written to a temp file. `REVIEWER_FAILED` → re-dispatch before scoring.

## Phase 3 — Score

1. Run `node "$(spec-paths replay)" --score --workflow {workflowReturnFile} --patch
   {patchOutFile}` → `caught` / `ambiguous` / `missed`. Exit 2 covers two unusable-input cases:
   the reviewer return wasn't `verdict: CLEAN` with a `survivors` array (re-dispatch Phase 2's
   reviewer and re-run `--score`), or `{patchOutFile}` parsed to zero hunks (a harness defect —
   escalate). Neither case is a recordable outcome.
2. **`ambiguous` is the one judgment seam:** one `AskUserQuestion` showing the reviewer's nearest
   finding beside the injected defect (file, line, the patch hunk) — did it actually name this
   defect? Resolves the outcome to `caught` or `missed` for Phase 4. A dismissed question resolves
   the outcome to `unresolved` instead — the reviewer return still rides into the record step
   via `--workflow` — and Phase 4 still runs.
3. A survivor naming only a declared reconcile path (excluded from `{patchOutFile}` by step 5) is
   not a kill, so it adjudicates `missed`, never left `ambiguous`.

## Phase 4 — Record & teardown

1. Run `node "$(spec-paths replay)" --record --spec {spec} --review-run-id {reviewRunId} --legs
   green|baseline-red:<leg>[,<leg>]|red:<leg>|none --outcome
   caught|missed|leg-caught|unresolved|setup-failed [--class {classId}] [--patch {patchOutFile}]
   [--workflow {workflowReturnFile}] --tokens {N} --via manual` — `--record` refuses any flag
   combination it does not accept, naming the flag; `leg-caught` takes only a newly-red leg,
   `setup-failed` only `--legs none` or `pristine-red:<leg>[,<leg>]`.
2. Run `node "$(spec-paths replay)" --teardown --dir {dir}` — the worktree is removed
   unconditionally at this point, success or failure.

## Phase 5 — Report

Assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`, print
verbatim (shared § Console Output Style):

- `outcome`: `caught` → ✅ `replay caught — the blind reviewer held the line on {class}`;
  `leg-caught` → ✅ `replay leg-caught — {leg} caught {class} before the reviewer ever ran`;
  `missed` → 🚫 `replay missed — {class} slipped past blind review`; `unresolved` → ⚠️
  `replay unresolved — {class} needs a human adjudication`; `setup-failed` → 🚫 `replay
  setup-failed — the scratch copy could not be prepared`.
- `bullets`: the class id, the mutated file(s), and the selected spec; `unresolved` adds the
  retained `runId`; `setup-failed` names the selected spec plus whichever of the three sites
  recorded it: the failing `setupCommand` (step 2), the post-apply hook's stderr (step 5), or
  the pristine-red leg's first failing line (step 7 rung 3); `missed` adds `- {runId} — the
  plugin repo's fleet-reader --owed picks this row up`.
- `warns`: `ambiguous score adjudicated by hand — see the recorded outcome` when Phase 3 asked;
  omit otherwise.
- `next`: `{kind:'status-verbatim', text: <spec-status --next captured this run>}`.

## Rules

- **Blindness is the measurement's validity.** Nothing dispatched to the reviewer nor any artifact
  the harness creates inside `{dir}` (file contents, prompt, branch name, worktree **path**, marker
  filename, commit subject, `git status` entry) may reveal a replay is in progress.
- **The session never leaves the main root.** `{dir}` is reached only by naming it (`--dir
  {dir}`, `git -C {dir}`, a subshell), never by relocating the shell into it — a relocated shell
  writes the measurement row into the scratch worktree and loses it at teardown; `replay.js`'s
  `--root <path>` is the escape hatch for a caller that cannot honour this.
- `--teardown` always runs, on every exit path — a leaked scratch worktree is a defect even when
  the run stops early.
- `AskUserQuestion` dismissed → resolve the outcome to `unresolved` (D3), still record and tear down — never record nothing.
