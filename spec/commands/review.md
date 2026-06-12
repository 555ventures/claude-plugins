---
description: Independent refutation-filtered review gate — flips spec to done and updates canonical docs
argument-hint: <spec path>
---

# Spec Review: Independent Gate

Deterministic gates + one independent, refutation-filtered review covering **shape** (shortcuts,
shims, rule-bending) and **correctness** (matches spec, ACs covered, wiring complete) in a
single pass. On CLEAN: flips `status → done` and applies the spec's Canonical Delta. This is
the only command that flips `done`.

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
- **No `driftScript`** — the reviewer's AC ↔ test coverage check IS the drift gate; treat a
  missing-test finding as `hard`. (The workflow's reviewer prompt already calibrates this via
  `hasDriftScript`.)

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
3. Report: gate table, findings (survived / killed / waived with reasons), drift result,
   canonical files updated.

## Rules

- Reviewers and refuters are **read-only** — fixes are always separate dispatches.
- Refuters see the claim only. The asymmetry is the filter; don't leak reviewer reasoning.
- Waivers come from the user only, recorded in the spec — never invented, never implied.
- Killed findings appear in the report. Silent drops void the filter's audit value.
- Deterministic gate failures are fixed before review findings are litigated — don't review a
  red build.
