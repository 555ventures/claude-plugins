---
description: Independent refutation-filtered review gate — flips spec to done, updates canonical docs, commits and merges back
argument-hint: <spec path>
---

# Spec Review: Independent Gate

Deterministic gates + one independent, refutation-filtered review covering **shape** (shortcuts,
shims, rule-bending) and **correctness** (matches spec, ACs covered, wiring complete) in a
single pass. On CLEAN: flips `status → done`, applies the spec's Canonical Delta, commits,
and merges the build branch back into its originating branch (Phase 4). This is the only
command that flips `done`.

**Orchestrator: Opus or Sonnet. Reviewers and refuters: Sonnet — never Fable.** Cross-model
independence from the planning author is the gate's value; capability is not.

**Setup:** run `spec-paths shared` and Read that file (shared invariants). Read the host's
`.claude/spec.config.json` and its pipeline rules file. If either is missing, STOP: tell the
user to run `/spec:init` first. Also run `spec-paths wf-spec-review` once and keep the printed
absolute path — it is the `scriptPath` for the Workflow call below.

## Input

`$ARGUMENTS` — path to a spec with `status: implementing` (or `done` for a re-run).

## Phase 0 — Preflight (parallel)

1. Determine the diff base: the originating branch if a `/spec:build` worktree is live,
   otherwise `main`.
2. Launch in parallel (background bash):
   - `DIFF_BASE={base} bash {patternsScript} {dirs from the spec's File Plan}` — the host's
     mechanical shortcut sweep (`patternsScript` from config)
   - the host's `gateCommand` — the deterministic gate
   - **if config declares `driftScript`**: `{driftScript} {spec path}` — the host's AC-drift
     checker
3. Read the spec once; extract File Plan dirs, AC list, tier, area.
4. **No `driftScript` only — AC coverage matrix (mechanical):** for each AC-ID in the spec,
   grep the File Plan's test paths for it. Any AC-ID with zero hits is an **uncovered AC** —
   an automatic `hard` finding that skips the refutation filter (it is a deterministic fact,
   not a reviewer claim). Computed before the reviewer panel runs.

## Phase 1 — Review workflow

Invoke `Workflow {scriptPath: <spec-paths wf-spec-review output>, args: {specPath, tier, base,
patterns: <sweep output>, hasDriftScript: <config declares driftScript>}}`.

What the script does (shape lives in the script, not here):
- **Reviewers:** T2 → 1, T3 → 2 (blind to each other, different emphases), running as the
  plugin's read-only `spec:spec-reviewer` agent. Each reads the spec, diffs against `base`,
  checks shape + correctness against the host's rule surfaces, returns structured findings.
  Neutral framing — an empty findings list is a valid outcome; nothing in the prompt
  manufactures findings.
- **Refutation filter:** per finding, refuters see the **claim only** (never the reviewer's
  reasoning). `hard` findings get 2 refuters and die only on 2/2 refutes; `medium`/`soft` get 1.
- Returns `{survivors, killed}`. Killed findings are reported, never silently dropped.

## Drift gate

Two modes, decided by host config:

- **`driftScript` declared** — its output is part of the verdict. For **uncovered ACs** (in
  spec, no test): add the missing tests (via `/spec:build` resume if the spec is mid-pipeline).
  For **orphaned ACs** (in test, no spec): the AC may have been removed — update the test
  docstring/name or remove the test. Re-run the script to verify.
- **No `driftScript`** — the Phase 0 grep matrix IS the drift gate: an AC-ID with zero test
  hits is an automatic `hard` finding, no refutation. The reviewer's AC ↔ test coverage check
  remains as the semantic backstop — a test that *names* an AC-ID but doesn't actually test
  the behavior is still a `hard` finding. (The workflow's reviewer prompt already calibrates
  this via `hasDriftScript`.)

## Phase 2 — Verdict

**CLEAN ⇔** the host's `gateCommand` green **AND** zero surviving `hard` findings **AND**
drift clean (whichever mode applies).

If survivors exist, present them with the pattern-sweep context, then `AskUserQuestion` per
finding group:
- **Fix** — dispatch Sonnet workers (routed via the host's `agentMap`, matching the build
  routing), then re-run Phase 1. Max 2 fix→re-review iterations; beyond that, escalate.
- **Waive** — record in the spec's Rationale section with date + reason. Only the user waives.
- **Reject** — the refuters missed; record the rejection reason the same way.

## Phase 3 — Close (on CLEAN)

1. Flip frontmatter `status: implementing → done`.
2. Apply the spec's **Canonical Delta** to `docs/canonical/{area}.md` (create the file from
   the delta if it doesn't exist yet).
3. **Close commit:** commit everything still uncommitted on the working branch — status flip,
   canonical docs, any review-fix dispatches. The orchestrator owns git; never `--no-verify`.
4. Report: gate table, findings (survived / killed / waived with reasons), drift result,
   canonical files updated.

Then proceed directly into Phase 4 — the user does not re-invoke anything.

## Phase 4 — Merge-back (on CLEAN, after the close commit)

Merges the working branch into the originating branch recorded by `/spec:build`. Skip with a
one-line note if the review ran directly on the originating branch — nothing to merge.

1. **Inspect (parallel, one message):** `git status` (working tree must be clean — if dirty,
   STOP and report), `git log --oneline {target}..{source}` (commits going in),
   `git diff --stat {target}...{source}` (files touched), `git merge-base {target} {source}`.
   Show the user a short summary — N commits, M files, touched paths. No full diffs.
2. **Strategy — `AskUserQuestion`, always** (strategy is a real fork): merge commit
   (`--no-ff`) / fast-forward only / squash / rebase then FF. Put the recommended option
   first, by commit count: 1 commit → fast-forward; 2–5 feature commits → merge commit;
   many small WIP commits → squash.
3. **Worktree sequence** (if the session is in a `/spec:build` worktree): call
   `ExitWorktree(action="keep")` **first** — it restores the session CWD to the main repo
   root without an unmerged-commit check; the target branch is already checked out there.
   Then merge from the root. Never `ExitWorktree(action="remove")` after merging — the
   harness still sees the branch as unmerged at that point. If the session was not entered
   via `EnterWorktree`, skip this and run git from the main repo root via `git -C`.
4. **Merge.** On conflicts: enumerate with `git status` + `git diff --diff-filter=U`; read
   **both sides** of every conflicted file and resolve on intent — never a blind
   `--ours`/`--theirs`, never a silent `merge --abort`. Non-trivial conflicts (logic on both
   sides, structural disagreement, deleted-vs-modified) get an `AskUserQuestion`: keep
   target / keep source / combine (describe the proposed combination). After resolving,
   `git add` each file, show a concise `git diff --cached` summary, then
   `git commit --no-edit` (or `-m` for squash).
5. **Cleanup & verify:** if a worktree was used, `git worktree remove {path}` and
   `git branch -d {source}` from the root (if the path is already gone, cleanup is done —
   confirm with `git worktree list`). Then `git log --oneline -3` + `git status` to confirm
   the merge landed on a clean tree.
6. **Never push.** Pushing remains an explicit user action.

## Rules

- Reviewers and refuters are **read-only** — fixes are always separate dispatches.
- Refuters see the claim only. The asymmetry is the filter; don't leak reviewer reasoning.
- Waivers come from the user only, recorded in the spec — never invented, never implied.
- Killed findings appear in the report. Silent drops void the filter's audit value.
- Deterministic gate failures are fixed before review findings are litigated — don't review a
  red build.
- Merge-back is part of CLEAN, not an extra ask — but strategy choice and non-trivial
  conflict resolutions always go through `AskUserQuestion`. Never `--no-verify`, never
  force-push, never push at all.
