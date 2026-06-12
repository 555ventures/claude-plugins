---
description: Implement a hardened spec via the wf-spec-build workflow — Sonnet workers, Fable consultant on surprises
argument-hint: <spec path>
---

# Spec Build: Orchestrated Implementation

Implement a hardened spec. The orchestrator parses the File Plan into batches, invokes the
bundled `wf-spec-build` workflow (Sonnet workers, deterministic control flow), resolves surprises
via the Fable consultant + user, and resumes until green.

**Intended orchestrator model: Opus** (Sonnet acceptable for small T2 builds). Workers: Sonnet.
Lookups: Haiku. Surprises and T3 checkpoints: Fable subagent.

**Setup:** run `spec-paths shared` and Read that file (shared invariants). Read the host's
`.claude/spec.config.json` and its pipeline rules file (`pipelineRules`). If either is
missing, STOP: tell the user to run `/spec:init` first. Also run `spec-paths wf-spec-build` once
and keep the printed absolute path — it is the `scriptPath` for the Workflow call below.

## Input

`$ARGUMENTS` — path to a hardened spec.

## Phase 0 — Preflight

1. **Frontmatter gate** (the `spec-state-gate` hook also enforces this): `status: hardened` →
   proceed; `implementing` → this is a resume (workflow caching makes it cheap — reuse the prior
   `runId` if known); anything else → STOP with the required command. In Storybook hosts:
   `storybook: true` without `designed:` → ask the user whether to run `/spec:design` first or
   skip it deliberately.
2. **Workspace.** `AskUserQuestion`: isolated worktree (recommended for parallel work) or in
   place. If worktree: `EnterWorktree`, then the host's `setupCommand` (from config) once at
   the root. Record the originating branch for merge-back.
3. **Parse the spec** (read it once):
   - File Plan table → batches: group rows by **Layer** (and by area where the host's
     pipeline rules § Build says so); order groups per the host's `layerGroups` — layers
     listed together in one group run as ONE parallel group (their file sets must be disjoint;
     if they are not, serialize). `tests` rows become test-author batches (Phase 1 of the
     workflow, before implementation). `other` rows and shared-by-definition files (the
     registration/wiring files pipeline rules § Build names) go in a final serial group.
   - **`designed:` set** (Storybook hosts) → UI-layer rows whose files already exist on disk
     are approved inputs: drop them from batches entirely; any wiring edits to those
     components belong to the final serial group.
   - `agentType` per batch: assign each File Plan row a batch kind using the host config's
     `routing` hints (or judgment from the `agentMap` kind names), then
     `agentType = agentMap[kind]`. Rows with no matching kind get `agentMap.default`
     (falling back to `general-purpose`). Never invent agent names — only the host's
     `agentMap` values are valid.
   - Decisions table, Assumptions, host-specific frontmatter flags the pipeline rules § Build
     declares (e.g. `migration:`), AC list (TDD enabled iff ACs exist). In Storybook hosts,
     pure-UI rendering gets no TDD tests — Storybook covers it; ACs are behavior.
4. **Resolve the gate.** Take `gateCommand` and `testCommand` from config; substitute
   `{testDirs}`/`{scopeDirs}` placeholders from the spec's File Plan dirs. Read the pipeline
   rules file and extract § Worker Rules and § Test Rules verbatim (empty strings if absent) —
   the workflow has no filesystem access, so everything host-specific travels through `args`.
5. Flip `status: hardened → implementing`.

## Phase 1 — Run the workflow

Invoke `Workflow {scriptPath: <spec-paths wf-spec-build output>, args: {specPath, tier, tdd,
testBatches, groups, resolutions: {}, agentMap, gate: {command, testCommand}, workerRules,
testRules}}`.

Test-author separation is enforced by construction: test batches are authored in the workflow's
first phase by `agentMap.tests` workers that derive only from the spec; implementation workers
never write tests for code they implement.

## Phase 2 — Handle returns (loop until `stage: complete`)

| Return stage | Action |
|---|---|
| `blocked` | Per item: if resolvable within the spec's stated intent → consult the **Fable retainer**; if a genuine fork or scope change → `AskUserQuestion`. Write the outcome into the spec's Decisions table, add it to `args.resolutions[batchId]` (this busts the journal cache for that batch only), resume with `resumeFromRunId`. |
| `tdd-red-check` | Newly written tests pass before implementation — the spec is wrong somewhere. Surface the passing tests, fix spec or tests with the user, resume. |
| `out-of-scope-failure` | A gate failure implicates a file outside the File Plan. `AskUserQuestion`: add to scope (mini-batch) / file as a separate fix / pause the spec. Per Blast Radius Discipline — never silently widen. |
| `gate-exhausted` | Repair loop hit its cap. Consult the Fable retainer with the failure output before escalating to the user. |
| `complete` | Proceed to Phase 3. |

**Fable retainer:** on the first surprise, spawn `Agent {model: "fable"}` with the spec's
Rationale + Assumptions sections and the divergence; on later surprises, continue the SAME agent
via `SendMessage` — it accumulates context of this run's weirdness. Mandatory consult triggers:
worker blocked on a stale assumption, gate failed twice on the same batch, out-of-scope file,
a change contradicting the approved design or a locked Decision, plus any host-declared
triggers (pipeline rules § Build).

Completed batches return from the workflow journal cache on resume — only changed work re-runs.

## Phase 3 — Host integration (orchestrator-only; never delegated, never inside the workflow)

Execute the orchestrator duties the host's pipeline rules § Build declares — e.g. codegen
regeneration, translation-catalog fills, migration generation and review, boot checks, public
surface/barrel verification. These are deliberately outside the workflow: they touch shared
or generated surfaces that parallel workers must never own. Where § Build marks a step as a
T3 checkpoint (e.g. migration review), the Fable retainer reviews before the step executes.

## Phase 4 — Final gate

Run the resolved `gateCommand`. On failure: repair via Sonnet dispatches mapped to the owning
batch, max 3 rounds (detect → repair → verify), then consult the retainer, then escalate to
the user.

**T3 checkpoint (mandatory):** any diff touching the host's declared high-risk surfaces
(pipeline rules § Risk Tiers / § Build) gets a Fable retainer review before reporting.

Checkpoint-commit after the gate is green (and after each earlier green phase if the run is long).

## Phase 5 — Report & handoff

Report: files (C/M/D), gate table, decisions applied vs escalated mid-run, consultant
consultations (count + topics), workflow `runId` (for any later resume). Status stays
`implementing` — only `/spec:review` flips `done`.

If in a worktree: `AskUserQuestion` merge-back / keep / discard, then `ExitWorktree` accordingly.

Next: `/spec:review $ARGUMENTS`

## Rules

- **Workers never run git.** Any git command in a worker prompt response is a defect. The
  orchestrator owns all git and checkpoint-commits after green phases. (Hard-learned: a
  worker's repo-wide `git checkout .` once destroyed sibling workers' uncommitted edits.)
- **Decisions table is authoritative.** Nobody overrides it; nobody invents entries except the
  orchestrator recording a user/consultant ruling.
- **Read-only surfaces stay read-only** (pipeline rules § Worker Rules) — generated/managed
  files change only via their declared tools.
- **Workers never query MCPs** — they build from the spec's embedded references and return
  `blocked` if one proves wrong against the installed version.
- **Host integration steps are orchestrator-only** — never delegated into the workflow.
- **Resume over restart.** Blocked batches re-run via the `resolutions` salt; everything
  finished returns from cache. Never restart a run from scratch when a `runId` exists.
- `AskUserQuestion` dismissed → STOP.
