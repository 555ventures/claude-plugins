---
description: Independent execution-verified review gate — flips spec to done, updates canonical docs, commits and merges back
argument-hint: <spec path>
---

# Spec Review: Independent Gate

Deterministic legs + one independent, fresh-context, execution-grounded reviewer. On CLEAN:
flips `status → done`, applies the spec's Canonical Delta, commits, and merges the build
branch back. This is the only command that flips `done`. Judgment on survivors (fix /
waive / reject) happens in this session with the user — the reviewer reports, never
adjudicates.

**Setup:** run `spec-paths shared-for review` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first.

## Input

`$ARGUMENTS` — path to a spec with `status: implementing` (or `done` for a re-run).

## Phase 0 — Deterministic legs

1. **Diff base**, from spec frontmatter: `build_base` (worktree build) → `diff_base`
   (in-place build) → current branch name (legacy fallback; merge-back self-checks it).
   `{root}` = the working tree under review (`git rev-parse --show-toplevel`).
   **Frozen-base check:** derive the spec's last commit
   (`git log -1 --format=%H -- {spec path} <File Plan paths>`); if HEAD has moved past it,
   later specs' files would pollute this diff — review reads/diffs in a detached worktree
   at that commit (`git worktree add --detach`) while every executed leg still runs at
   `{root}` (executed evidence comes from the tree that ships); remove the worktree after
   the reviewer returns. If the spec's own File Plan files differ between that commit and
   HEAD, review at HEAD and attribute foreign hunks to their owning specs.
2. **Run the legs:** `{manifestPath}` = fresh `mktemp` (never reused across iterations —
   stale evidence must be unrepresentable), then
   `node "$(spec-paths review-legs)" --root {root} --spec {spec path} --base {base}
   --manifest {manifestPath}`. It runs reconcile, the resolved gate, smoke, ci, at-risk,
   ac-matrix + skip-reconcile, and promise-sweep in parallel, appends one JSONL row per leg,
   and prints the red/green summary — print it. If the gate row reports skips > 0, extract the
   skipped test names from the printed gate-output file into a file and re-run with
   `--skips <file>` (fresh manifest) so the skip reconciliation can attribute them.
3. **Hard stop on `RED_BLOCKING`** (exit 1 — gate/smoke/ci red): do not dispatch the
   reviewer on a red substrate. Still run `node "$(spec-paths verdict)" --manifest
   {manifestPath} --ledger --spec {spec path} --tier {tier} --diff-loc {diffLoc}
   --iteration <n>` (no `--workflow` — the manifest alone derives `GATE_RED`) and append
   its ledger line **verbatim** to `.claude/spec-runs.jsonl` — a stopped attempt is never
   invisible. Report the red leg and its remedy; stop.

   ```report
   🚫 **{leg} failed — {plain consequence}**
   Next: {named remedy}
   ```

4. `{diffLoc}` = insertions + deletions from `git diff --shortstat {base}`.

## Phase 1 — Reviewer (one, fresh-context, execution-grounded)

Dispatch **one** `Agent {subagent_type: 'spec:reviewer'}` (the plugin's read-only reviewer;
its doctrine is `spec/agents/reviewer.md`) with: the spec path, the diff base, `{root}`
(or the frozen worktree for reading), the pipeline-rules path, and the paths review-legs
printed (reconcile.json, patterns output). Blind to the build session — it gets no build
narrative, only artifacts on disk.

**The evidence standard is executed, not argued:** every non-soft finding must carry a
repro the reviewer actually ran — the command and its observed output — or the exact spec
lines (Decision/AC) the diff violates with the violating hunk quoted. A finding with
neither is returned as `advisory`. An empty findings list is a valid outcome; nothing may
manufacture findings.

**Design legs (specs with `design: true` or `design_source` only):** alongside the
reviewer, dispatch the two design checks as parallel Sonnet agents — the rule-checklist
walk (`docs/design/research-brief.md` rule IDs against the built screens; skip with a note
when no brief exists) and the component-manifest audit (`design/components.json`
`authorJustification` entries — a missing justification or a near-duplicate of an existing
entry is a finding). Their findings enter Phase 2 like any other. Non-UI specs skip both
silently.

Write the reviewer's structured return to a temp file:
`{verdict: "CLEAN"|"REVIEWER_FAILED", survivors: [{severity, claim, file, line, impact,
evidence}], killed: [], reviewerCount: 1, scope: "full"|"fix-delta", tokens: <n>}`.
`REVIEWER_FAILED` (agent died) is a failed run, never a CLEAN — re-dispatch before any
verdict is read.

## Phase 2 — Verdict & dispositions

**The verdict word is derived by `verdict.js`, never asserted in prose.** Run
`node "$(spec-paths verdict)" --manifest {manifestPath} --workflow <return file>` to decide
whether survivors need presenting. Present survivors with the spec lines their disposition
hinges on quoted verbatim, and recommend the evidence-implied disposition; then
`AskUserQuestion` per finding group (≤4 per call):

- **Fix** — dispatch Sonnet workers (routed via the host's `agentMap`). Then re-review:
  fresh `{manifestPath}`, re-run `node "$(spec-paths review-legs)" … --fix-delta`
  (re-executes gate/smoke/ci/ac-matrix in full — a fix pass re-asserts executed state,
  never inherits it), and dispatch a fix-delta reviewer pass over only the fix diff plus
  the prior findings. Max 2 fix→re-review iterations; beyond that, escalate.
- **Waive** / **Reject** — recorded in the spec's Rationale with date + reason; only the
  user waives.

**Authoritative pass:** re-run verdict.js with the real
`--waived/--rejected/--fixDispatched` counts plus `--ledger --retain .claude/spec-runs
--spec {spec path} --tier {tier} --diff-loc {diffLoc} --iteration <n>` — every
authoritative pass retains its full-fidelity evidence artifact at
`.claude/spec-runs/<runId>.json`, fix-delta iterations included, each under its own
iteration's runId; print line 1 (the verdict word) verbatim and append line 2 verbatim to
`.claude/spec-runs.jsonl`. Never hand-write the word; a CLEAN row with non-zero `survived`
records dispositioned findings, never ignored ones. Exit 0 gates Phase 3.

## Phase 3 — Close (on CLEAN)

1. Flip `status: implementing → done`.
2. Apply the spec's **Canonical Delta** to `docs/canonical/{area}.md`. Fold the deviations
   sidecar if one exists: recurring-shaped deviations become one-line entries in the host
   rules' **Gotchas** section (tagged `[host]`/`[plugin]` by provenance); one-offs go to
   the spec's Rationale; delete the sidecar.
3. **Hygiene sweep:** `git status --porcelain --untracked-files=all`; adjudicate every
   unexpected path (reviewer scratch files deleted, legitimate strays explained).
   `.claude/spec-runs/*.json` written by this run's authoritative pass(es) are EXPECTED
   artifacts, not reviewer scratch — they ride the close commit and merge back with the
   branch; never delete them. Never blind-`git add -A` past an unadjudicated path.
4. **Close commit** — everything still uncommitted on the working branch. Never
   `--no-verify`.
5. **Report** (render via report-render, print verbatim): `outcome` ✅ `CLEAN — merged` /
   🚫 `{N} hard findings — build must fix`; `bullets`: one plain line per survivor;
   `warns`: waived findings, plus (CLEAN only) `🧪 reviewer replay due — run /spec:replay`
   when `node "$(spec-paths replay)" --due` exits 0 — advisory, never blocking a CLEAN;
   `next`: on CLEAN `{kind:'none', reason:'merge-back runs next'}`, on non-CLEAN
   `/spec:build {spec path}`.

   ```report
   ✅ **CLEAN — merged**
   - {surviving finding: what breaks, where}
   ⚠️ waived: {finding — one-phrase reason}
   ⚠️ 🧪 reviewer replay due — run /spec:replay
   Next: nothing needs you — merge-back runs next
   ```

## Phase 4 — Merge-back (on CLEAN, after the close commit)

Skip steps 1–5 with a one-line note when the review ran directly on the originating branch.
Run `spec-paths merge-back` once; the printed path is `{mergeBack}` (exit alphabet in its
header: 3 = conflicts, 4 = CWD-inside-worktree refusal). Resolve `{mainRoot}` via
`{mergeBack} root [--worktree {worktree}]` — never `$HOME` or `/`.

1. `{mergeBack} inspect --root {mainRoot} --target {target} --source {source}` — STOPs on a
   dirty root tree; show its `RECOMMEND` line.
2. Strategy — `AskUserQuestion`, always (merge-commit / ff-only / squash / rebase-ff),
   `RECOMMEND` first.
3. **Relocate FIRST:** `ExitWorktree(action="keep")` when this session entered via
   EnterWorktree; otherwise `cd` the main session to the absolute `{mainRoot}` — a
   subprocess cannot move the session CWD, and cleanup must never delete the directory the
   session stands in.
4. `{mergeBack} merge … --strategy {choice}`. Exit 3: resolve conflicts by intent (read
   both sides; non-trivial → `AskUserQuestion`), then commit. Exit 2: precondition failure
   — re-ask strategy.
5. `{mergeBack} cleanup …` (exit 4 → do step 3, re-run), then `{mergeBack} verify --root
   {mainRoot}`.
6. **Never push.** Pushing is an explicit user action.

**Next pointer (every CLEAN close):** capture
`node "$(spec-paths spec-status)" --root {mainRoot} --next` verbatim and render it as the
closing report (`{kind:'status-verbatim'}`) — the script is the only source of the "what
now" suggestion.

```report
✅ **CLEAN — merged**
{spec-status --next, verbatim}
```

## Rules

- The reviewer is **read-only**; it may create and delete its own repro file — fixes are
  always separate dispatches; no execution side effects on shared stateful substrates.
- **No finding dies by argument.** A finding is dismissed only on executed contrary
  evidence, a quoted spec sanction, or a demonstrated miscitation — presented to the user,
  never silently.
- Deterministic leg failures are fixed before findings are litigated — don't review a red
  build.
- Merge-back is part of CLEAN — strategy and non-trivial conflicts always go through
  `AskUserQuestion`.
