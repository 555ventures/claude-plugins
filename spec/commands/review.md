---
description: Independent execution-verified review gate — flips spec to done, updates canonical docs, commits and merges back
argument-hint: <spec path>
---

# Spec Review: Independent Gate

Deterministic gates + one independent, execution-verified review covering **shape** (shortcuts,
shims, rule-bending) and **correctness** (matches spec, ACs covered, wiring complete) in a
single pass. On CLEAN: flips `status → done`, applies the spec's Canonical Delta, commits,
and merges the build branch back into its originating branch (Phase 4). This is the only
command that flips `done`.

**Orchestrator: Sonnet. Reviewers and verifiers: Sonnet — never Fable.** Cross-model
independence from the planning author is the gate's value; capability is not. Judgment on
survivors (fix / waive / reject) happens in this session with the user — the workflow never
adjudicates (the kill-grounding standard lives in Rules).

**Setup:** run `spec-paths shared-for review` and read its output (the shared invariants scoped to this command). Read the host's
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
   - the host's `gateCommand` — the deterministic gate. **Capture the runner's skip/todo
     counts** from its output (every mainstream runner prints them) — they feed the
     skipped-test reconciliation in step 4.
   - `bash $(spec-paths smoke)` — the **boot smoke leg** (shared invariants § Runtime
     Verification). Exit 0 = boot observed ready; exit 4 = runtime declared inert (sanctioned,
     note it in the verdict); any other exit is an automatic **hard finding** — including
     exit 3, "the host gives review no way to boot," which is a grounding-layer defect, not a
     skippable check. This leg is deterministic; no reviewer adjudicates it.
   - **if config declares `driftScript`**: `{driftScript} {spec path}` — the host's AC-drift
     checker
3. Read the spec once; extract File Plan dirs, AC list, tier, area. Compute `{diffLoc}` =
   insertions + deletions from `git diff --shortstat {base}` — it scales the reviewer panel
   (a small diff never pays a 2-reviewer panel, whatever the tier).
4. **No `driftScript` only — AC coverage matrix (mechanical):** for each AC-ID in the spec,
   grep the File Plan's test paths for it. Any AC-ID with zero hits is an **uncovered AC** —
   an automatic `hard` finding that skips the refutation filter (it is a deterministic fact,
   not a reviewer claim). Computed before the reviewer panel runs.
5. **Skipped-test reconciliation (mechanical, both drift modes):** the matrix counts
   **executed** tests, never collected ones — a skip is not a pass. If the gate run reported
   skipped/todo tests, map each skipped test back to its AC-IDs (grep the skipped file/test
   names). An AC whose mapped test **skipped** is an automatic `hard` finding — identical in
   standing to an uncovered AC — **unless** the AC carries an explicit environment-gating
   declaration in the spec (`[env: VAR_NAME]` on the AC line). A declared env-gated AC that
   skipped is reported as a **warning naming the un-run environment** in the verdict — never
   silent green. (Ground truth: UpWell 2026-07 — a test holding a defect real pg-boss rejects
   with a throw sat `describe.skipIf`-skipped through two CLEAN verdicts because the matrix
   reconciled against collected tests.)

## Phase 1 — Review workflow

Invoke `Workflow {scriptPath: <spec-paths wf-review output>, args: {specPath, tier, base,
scope: "full", prevFindingsPath: "", diffLoc: <from Phase 0>,
patternsPath: <temp file from Phase 0>, hasDriftScript: <config declares driftScript>,
reproCommand: <config testCommand, or "">}}`. (`testCommand` is the host's test-runner
prefix — the verifier agents append their repro file path to it; when absent, pass `""`
and they discover the runner themselves.)

What the script does (shape lives in the script, not here):
- **Reviewers:** 1 by default; 2 only for T3 with `diffLoc ≥ 300` (blind to each other,
  different emphases), running as the plugin's read-only `spec:reviewer` agent. Each reads
  the spec, diffs against `base`, checks shape + correctness against the host's rule
  surfaces, returns structured findings. Neutral framing — an empty findings list is a valid
  outcome; nothing in the prompt manufactures findings.
- **Verification (execution-grounded):** every non-soft finding gets one Sonnet verifier.
  A finding dies ONLY on grounded evidence: `NOT_DEMONSTRABLE` (a good-faith minimal repro
  fails to exhibit an executable claim), `SANCTIONED` (a spec Decision/design approval quoted
  verbatim), or `MISCITED` (the cited location plainly doesn't say what the claim asserts —
  actual content quoted). `DEMONSTRATED` findings survive with repro evidence — the strongest
  fix candidates. `NOT_EXECUTABLE` claims (naming, layering, structure) survive flagged
  `unverifiable` for THIS session to adjudicate. A crashed verifier or a cap-skipped finding
  survives visibly flagged — fail-closed, never a silent kill or a silent confirm. `soft`
  findings skip verification and pass through as `advisory`.
- Returns `{verdict, survivors, killed, verify, reviewerCount, scope, tokens}` where `verify =
  {verified, demonstrated, killedByExecution, sanctioned, miscited, unverifiable, failed,
  capSkipped}`.
  **`verdict: "REVIEWER_FAILED"` means a reviewer agent died — that is a failed RUN, never a
  CLEAN: re-invoke the workflow (journal cache makes it cheap) before any verdict is read.**
  `tokens` is the workflow's output-token spend — carry it into the Phase 3 report. If
  `verify.failed` or `verify.capSkipped` is non-zero, those survivors stand unverified — say
  so in the verdict presentation.

## Design-compliance legs (UI-bearing specs only)

When the spec has `design: true` or a `design_source`, the panel carries two additional checks
(both exist because authoring sessions don't remember; checkers with lists do — full doctrine
in shared.md § Design Stage, deliberately outside this command's scoped read):

- **Rule-checklist leg:** one reviewer walks `docs/design/research-brief.md`'s admitted rules
  (falsifiable by construction) against the spec's built screens/bound mocks, citing rule IDs —
  "UX-7: max one primary CTA; this screen has three" is a finding; "feels off" is not.
- **Component-manifest leg:** every `author` decision in the run's binding maps is verified
  against `design/components.json` — a missing nearest-entry justification is a `hard` finding;
  a justification whose named nearest entry actually covers the need, or a new entry that
  near-duplicates an existing one (name/purpose comparison), is a finding with the reuse named.

Both legs skip silently on specs with no UI surface — never nag a backend diff about design.

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

**CLEAN ⇔** the host's `gateCommand` green **AND** the boot smoke leg green (or declared
inert) **AND** zero surviving `hard` findings (including the mechanical ones: uncovered ACs,
non-declared skipped-test ACs, a failed or impossible smoke) **AND** drift clean (whichever
mode applies).

**Run ledger (every review run, any verdict):** append exactly ONE line to
`.claude/spec-runs.jsonl` (repo root; create on first append) — **after** the survivor
dispositions below are resolved, so the row records how each finding actually ended (a
`SURVIVORS` row whose survivors were then all waived is otherwise indistinguishable from an
unresolved one):

```
{"ts":"<YYYY-MM-DD>","spec":"<repo-relative spec path>","stage":"review","tier":"<T1|T2|T3>","runId":"<wf_…>","verdict":"<CLEAN|SURVIVORS|REVIEWER_FAILED>","scope":"<full|fix-delta>","iteration":<n>,"diff":{"loc":<n>},"smoke":"<pass|fail|inert>","testsSkipped":<n>,"tokens":{"workflow":<n>},"findings":{"survived":<n>,"killed":<n>,"waived":<n>,"rejected":<n>,"fixDispatched":<n>,"reviewerCount":<n>},"verify":{"verified":<n>,"demonstrated":<n>,"killedByExecution":<n>,"sanctioned":<n>,"miscited":<n>,"unverifiable":<n>,"failed":<n>,"capSkipped":<n>}}
```

`verdict` is the workflow's verdict (pre-disposition) — **never write `CLEAN` on a row whose
`survived` is non-zero**; `waived`/`rejected`/`fixDispatched` record what the user then did
with the survivors. Fixed shape, counts/enums only — never finding text or prose (disposition
*reasons* land in the spec's Rationale). One line per Phase-1 invocation, so fix→re-review
iterations each leave a row — that history is what calibrates the verification layer over
time. `runId` is the Workflow invocation's run id: when a defect later surfaces in code this
review passed, `/spec:escape` records a row pointing back at it — the ground truth behind
every CLEAN.

If survivors exist, present them with the pattern-sweep context, grouped by verification
status: `demonstrated` first (a verifier *reproduced the defect by execution* — show the
`evidence`; rejecting one means overriding a reproduced failure), then `unverifiable`
(structural claims no repro can decide — this session adjudicates them on the cited rule),
then `advisory` (soft), then any `verifier-failed`/`cap-skipped` (unverified — say so). With
each survivor, **quote the spec lines its disposition hinges on** — the Decision, Assumption,
or AC text the finding claims was violated (already in hand from Phase 0; quote verbatim,
recommend nothing). The recurring disposition call is "over-strict spec text vs. actual code
defect," and it must be made against the author's recorded intent, not recalled intent. Then
`AskUserQuestion` per finding group:
- **Fix** — dispatch Sonnet workers (routed via the host's `agentMap`, matching the build
  routing). Then re-review **incrementally**: write the surviving findings to a temp JSON
  file, and re-invoke the workflow with `scope: "fix-delta"`, `prevFindingsPath: <that file>`,
  and `base: <the commit the just-reviewed diff ended at>` — one reviewer reads only the fix
  diff and the prior findings, never the whole codebase again. Pay a `scope: "full"` re-review
  only if the fixes touched files outside the prior finding set. Max 2 fix→re-review
  iterations; beyond that, escalate.
- **Waive** — record in the spec's Rationale section with date + reason. Only the user
  waives — never invented, never implied.
- **Reject** — the finding is wrong anyway; record the rejection reason the same way.

## Phase 3 — Close (on CLEAN)

1. Flip frontmatter `status: implementing → done`.
2. Apply the spec's **Canonical Delta** to `docs/canonical/{area}.md` (create the file from
   the delta if it doesn't exist yet).
   **Deviation fold-in:** if a `<spec>.deviations.md` sidecar exists (build workers log forced
   departures from the plan there), read it now. A deviation that will recur on future specs
   (a wrong assumption about the codebase, a convention the spec template didn't know) becomes
   a one-line entry in the host rules' **Gotchas** section, citing this spec and tagged
   `[host]` or `[plugin]` by provenance (a plugin-template gap is `[plugin]` — `/spec:doctor`
   rolls those up as the upstream bug list) — that is the territory correcting the map.
   One-off deviations just get absorbed into the spec's Rationale. Delete the sidecar after
   folding.
3. **Close commit:** commit everything still uncommitted on the working branch — status flip,
   canonical docs, any review-fix dispatches. The orchestrator owns git; never `--no-verify`.
4. Report — console style (§ Console Output Style): one verdict line first
   (`✅ CLEAN — merged` / `🚫 N hard findings — build must fix`), then each surviving
   finding as one plain-language line (what breaks, where), then anything ⚠️ waived with
   its one-phrase reason. Kill lists, full gate tables, and drift detail go to the ledger
   row, not the console — print paths.

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
7. **Never push, never force-push.** Pushing remains an explicit user action.

## Rules

- **Never Read `wf-review.js`.** The complete `args` contract is in Phase 1 (`{specPath, tier,
  base, scope, prevFindingsPath, diffLoc, patternsPath, hasDriftScript, reproCommand}`) and
  the return shape is `{verdict, survivors, killed, verify, reviewerCount, scope, tokens}`.
  The reviewer/verifier fan-out and all control flow are the workflow's concern — its shape
  lives in the script, not in orchestrator context. Invoke it (by `scriptPath`) and act on
  its return.
- Reviewers are **read-only**; verifiers create only their own repro file and delete it —
  fixes are always separate dispatches.
- **No finding dies by argument.** Kills carry grounded evidence (failed repro / quoted
  sanction / quoted miscitation) — that grounding is the workflow's contract; never litigate
  a survivor away in-session without the same standard.
- Killed findings appear in the report with their evidence. Silent drops void the gate's
  audit value.
- Deterministic gate failures are fixed before review findings are litigated — don't review a
  red build.
- Merge-back is part of CLEAN, not an extra ask — but strategy choice and non-trivial
  conflict resolutions always go through `AskUserQuestion` (git discipline — never push,
  never `--no-verify`, relocate before cleanup — lives in the Phase 3/4 steps).
