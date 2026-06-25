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
user to run `/spec:init` first. Also run `spec-paths wf-review` once and keep the printed
absolute path — it is the `scriptPath` for the Workflow call below.

## Input

`$ARGUMENTS` — path to a spec with `status: implementing` (or `done` for a re-run).

## Phase 0 — Preflight (parallel)

1. Determine the diff base `{target}` (the originating branch the build started from) by
   reading `build_base:` from the spec frontmatter — `/git:enter-worktree` wrote it there so a fresh
   review session recovers it from disk, never from conversation context. If `build_base` is
   absent (the spec was built before this field existed), fall back to
   `git -C {root} rev-parse --abbrev-ref HEAD` (the root working tree's current branch). The
   fallback is safe and self-checking: `{mergeBack} inspect` and `assert_target_checked_out`
   require `{target}` to equal root HEAD, so a wrong guess fails loudly at merge-back rather
   than diffing/merging silently against the wrong branch.
2. Launch in parallel (background bash):
   - `DIFF_BASE={base} bash {patternsScript} {dirs from the spec's File Plan} > {patternsPath}`
     — the host's mechanical shortcut sweep (`patternsScript` from config), redirected to a
     temp file (`patternsPath` = a fresh `mktemp` path); keep the absolute path for the
     workflow call. The reviewers read it rather than receiving the output inline, which keeps
     `args` a small control channel.
   - the host's `gateCommand` — the deterministic gate
   - **if config declares `driftScript`**: `{driftScript} {spec path}` — the host's AC-drift
     checker
3. Read the spec once; extract File Plan dirs, AC list, tier, area.
4. **No `driftScript` only — AC coverage matrix (mechanical):** for each AC-ID in the spec,
   grep the File Plan's test paths for it. Any AC-ID with zero hits is an **uncovered AC** —
   an automatic `hard` finding that skips the refutation filter (it is a deterministic fact,
   not a reviewer claim). Computed before the reviewer panel runs.

## Phase 1 — Review workflow

Invoke `Workflow {scriptPath: <spec-paths wf-review output>, args: {specPath, tier, base,
patternsPath: <temp file from Phase 0>, hasDriftScript: <config declares driftScript>}}`.

What the script does (shape lives in the script, not here):
- **Reviewers:** T2 → 1, T3 → 2 (blind to each other, different emphases), running as the
  plugin's read-only `spec:reviewer` agent. Each reads the spec, diffs against `base`,
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

Run `spec-paths merge-back` once and keep the printed path — it is `{mergeBack}`, a
deterministic helper for the git mechanics.

`{root}` is the absolute path to the **project root** — the repo's main working tree, e.g.
`/Users/you/Projects/app`. It is **NOT** your home directory (`$HOME`, `~`) and **NOT** the
filesystem root (`/`). Get the exact value, don't guess it: run
`{mergeBack} root --worktree {worktree}` (or just `{mergeBack} root` from inside the worktree)
and use the absolute path it prints verbatim. `{target}` is the originating branch recovered in
Phase 0 step 1 (`build_base` from the spec, else root HEAD) — not an in-session given; `{source}`
the build branch; `{worktree}` the worktree path (omit `--worktree` if no worktree was used).

1. **Inspect:** `{mergeBack} inspect --root {root} --target {target} --source {source}`. It
   STOPs (exit 2) if the root tree is dirty. Show the user its summary — N commits, M files,
   its `RECOMMEND` line. No full diffs.
2. **Strategy — `AskUserQuestion`, always** (strategy is a real fork): merge-commit /
   ff-only / squash / rebase-ff. Put the `inspect` `RECOMMEND` option first.
3. **Relocate to root FIRST — this is the fix for the session landing in `$HOME`.** A
   subprocess cannot move the session CWD; only these can, so do one of them *before* any
   worktree removal:
   - If **this session** entered the worktree via `EnterWorktree`: call
     `ExitWorktree(action="keep")` — restores session CWD to {root}, leaves worktree + branch
     intact, no unmerged-commit check. Never `ExitWorktree(action="remove")` after merging —
     the harness still sees the branch as unmerged then.
   - Otherwise (worktree predates this session — `ExitWorktree` would be a no-op): `cd` in the
     **main** session to the **absolute `{root}` path** printed by `{mergeBack} root`. It
     persists, and unlike a no-op `ExitWorktree` it actually moves the session out of the
     worktree. Use the full path — **never a bare `cd`** (that goes to `$HOME` and *is* the
     `~/` bug), never `cd ~`, never `cd /`. Do **not** narrate this as "exiting the worktree" —
     you are relocating the session to the project root, not unwinding harness state.
   The merge itself runs via `git -C {root}` regardless, but the relocate is what stops
   `cleanup` from deleting the directory you are standing in.
4. **Merge:** `{mergeBack} merge --root {root} --target {target} --source {source} --strategy {choice} [--worktree {worktree}]`.
   - exit 0 → merged.
   - exit 3 → **conflicts** (merge, or a rebase-ff rebase). Resolve by intent: read **both
     sides** of every conflicted file — never a blind `--ours`/`--theirs`, never a silent
     `merge --abort`. Non-trivial conflicts (logic on both sides, structural disagreement,
     deleted-vs-modified) get an `AskUserQuestion`: keep target / keep source / combine
     (describe it). Then `git -C {root} add` each, show a concise `git -C {root} diff --cached`
     summary, and `git -C {root} commit --no-edit`. (For a rebase-ff rebase, resolve in
     `{worktree}`, `git -C {worktree} rebase --continue`, then re-run the `merge` step.)
   - exit 2 → precondition failure (e.g. ff-only on diverged branches); report and re-ask
     strategy.
5. **Cleanup:** `{mergeBack} cleanup --root {root} --source {source} [--worktree {worktree}]`.
   It removes the worktree and deletes `{source}` from {root}. **exit 4 means you skipped the
   relocate in step 3** — the session is still inside the worktree; do step 3, then re-run
   cleanup. (Already-gone worktree path → it prunes and treats cleanup as done.)
6. **Verify:** `{mergeBack} verify --root {root}` — confirms the merge landed on a clean tree
   with the worktree gone.
7. **Never push.** Pushing remains an explicit user action.

## Rules

- **Never Read `wf-review.js`.** The complete `args` contract is in Phase 1 (`{specPath, tier,
  base, patternsPath, hasDriftScript}`) and the return shape is `{survivors, killed}`. The
  reviewer/refuter fan-out, the refutation filter, and all control flow are the workflow's
  concern — its shape lives in the script, not in orchestrator context. Invoke it (by
  `scriptPath`) and act on its return.
- Reviewers and refuters are **read-only** — fixes are always separate dispatches.
- Refuters see the claim only. The asymmetry is the filter; don't leak reviewer reasoning.
- Waivers come from the user only, recorded in the spec — never invented, never implied.
- Killed findings appear in the report. Silent drops void the filter's audit value.
- Deterministic gate failures are fixed before review findings are litigated — don't review a
  red build.
- Merge-back is part of CLEAN, not an extra ask — but strategy choice and non-trivial
  conflict resolutions always go through `AskUserQuestion`. Never `--no-verify`, never
  force-push, never push at all.
- Relocate the session to {root} (Phase 4 step 3) **before** cleanup — always. The
  `merge-back.sh cleanup` exit 4 is a hard backstop, not a substitute: a worktree removed
  while the session sits inside it strands the session in `$HOME`.
