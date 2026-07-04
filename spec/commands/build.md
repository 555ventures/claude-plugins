---
description: Implement a hardened spec via the wf-build workflow — Sonnet workers, Fable consultant on surprises
argument-hint: <spec path>
---

# Spec Build: Orchestrated Implementation

Implement a hardened spec. The orchestrator parses the File Plan into batches, invokes the
bundled `wf-build` workflow (Sonnet workers, deterministic control flow), resolves surprises
via the Fable consultant + user, and resumes until green.

**Intended orchestrator model: Opus** (Sonnet acceptable for small T2 builds). Workers: Sonnet.
Lookups: Haiku. Surprises and T3 checkpoints: Fable subagent.

**Setup:** run `spec-paths shared-for build` and read its output (the shared invariants scoped to this command). Read the host's
`.claude/spec.config.json` and its pipeline rules file (`pipelineRules`). If either is
missing, STOP: tell the user to run `/spec:init` first. Also run `spec-paths wf-build` once
and keep the printed absolute path — it is the `scriptPath` for the Workflow call below.

## Input

`$ARGUMENTS` — path to a hardened spec.

## Phase 0 — Preflight

1. **Frontmatter gate** (the `spec-state-gate` hook also enforces this): `status: hardened` →
   proceed; `implementing` → this is a resume (workflow caching makes it cheap — reuse the prior
   `runId` if known); anything else → STOP with the required command. In design-capable hosts
   (config `design` block, or legacy `storybook: true` — shared invariants § Design Stage):
   `design: true` without `designed:` → ask the user whether to run `/spec:design` first or
   skip it deliberately.

   **Worktree isolation is not build's concern.** Build runs the workflow in whatever cwd it is
   in. If the user ran `/git:enter-worktree <spec>` first, that cwd is the worktree; if not, it
   is the working tree (in place). Build neither creates, enters, nor re-enters a worktree, and
   never captures or writes `build_base`. To build in isolation, run `/git:enter-worktree`
   before this command (it is idempotent, so it is also the fresh-process re-entry mechanism).
2. **Parse the spec** (read it once):
   - File Plan table → batches: group rows by **Layer** (and by area where the host's
     pipeline rules § Build says so); order groups per the host's `layerGroups` — layers
     listed together in one group run as ONE parallel group (their file sets must be disjoint;
     if they are not, serialize). `tests` rows become test-author batches (Phase 1 of the
     workflow, before implementation). `other` rows and shared-by-definition files (the
     registration/wiring files pipeline rules § Build names) go in a final serial group.
     Each file in a batch is `{path, action}` **only** — never attach the File Plan `Summary`
     prose or batch `notes`. Planning stays the orchestrator's job (full conversation context);
     only the *payload* is lean. Workers recover per-file intent by reading the spec's File Plan
     Summary column themselves. Free text in `args` corrupts its JSON — prose lives in the spec.
   - **`designed:` set** (design-capable hosts) → UI-layer rows whose files already exist on disk
     are approved inputs: drop them from batches entirely; any wiring edits to those
     components belong to the final serial group.
   - `agentType` per batch: assign each File Plan row a batch kind using the host config's
     `routing` hints (or judgment from the `agentMap` kind names), then
     `agentType = agentMap[kind]`. Rows with no matching kind get `agentMap.default`
     (falling back to `general-purpose`). Never invent agent names — only the host's
     `agentMap` values are valid.
   - **Doctrine paths.** The workflow's agent registry resolves only built-in and plugin agent
     types — host `.claude/agents/*.md` are invisible to it. For every `agentMap` value that
     is a host-local agent, collect its file path into
     `doctrinePaths: {<name>: ".claude/agents/<name>.md"}`. The workflow dispatches that role on
     `general-purpose` and the worker READS the file for its doctrine — bodies travel as paths,
     not inline text (the `args` channel coordinates; the agents do the file I/O). Plugin/built-in
     names need no entry and dispatch natively.
   - Decisions table, Assumptions, host-specific frontmatter flags the pipeline rules § Build
     declares (e.g. `migration:`), AC list (TDD enabled iff ACs exist). In design-capable
     hosts, pure-UI rendering gets no TDD tests — the component catalog covers it; ACs are
     behavior.
3. **Resolve the gate.** Take `gateCommand` and `testCommand` from config; substitute
   `{testDirs}`/`{scopeDirs}` placeholders from the spec's File Plan dirs. Pass the
   `pipelineRules` path (config value) as `pipelineRulesPath` — workers read its
   `## Worker Rules` / `## Test Rules` sections themselves. The workflow *script* has no
   filesystem access, but the agents it spawns do, so host rules and doctrines travel as PATHS
   the workers read, never as inline blobs — `args` is a control channel of paths/ids/enums,
   not a data bus, so no prose ever enters it to corrupt its JSON.
4. Flip `status: hardened → implementing`. Build never writes `build_base` — that field is owned
   solely by `/git:enter-worktree`, which captures the originating branch before entering the
   worktree. If the build is in place, `build_base` is simply absent and `/spec:review`'s
   merge-back no-ops.

## Phase 1 — Run the workflow

Invoke `Workflow {scriptPath: <spec-paths wf-build output>, args: {specPath, tdd,
testBatches, groups, resolutions: {}, agentMap, doctrinePaths, gate: {command, testCommand},
pipelineRulesPath}}`. Pass `args` as a real JSON object (the script tolerates the harness's
stringified delivery, but never double-encode it yourself).

**Invariant — no free text in `args`.** `args` carries only paths, ids, enums, booleans, and
the host's gate command. Any prose — per-file intent, batch notes, orchestrator rulings — is
Read from the spec on disk by the agent that needs it, never inlined. Free text (quotes,
backslashes) corrupts the args JSON against the harness's version-inconsistent string-vs-object
encoding; that is the closed-alphabet guarantee that keeps the channel from breaking, not a size
budget. (`resolutions` is `{}` on first run; on resume each value is a ruling *token*, not the
ruling text — see Phase 2.)

**Shape of `groups`.** `groups` is an array of **waves**; each wave is an array of **batches**.
Even a single batch is double-bracketed (`[[{id,…}]]`) — never `[{…}]`, never `{id,…}`. Waves run
in order; batches in a wave run in parallel. When unsure, resolve toward **more waves** (serial),
never a fatter wave (parallel) — over-serializing only costs speed; over-parallelizing can violate
wave ordering. The workflow asserts this shape at init and fails loud with an indexed message
(`groups[i][j] …`) if it arrives malformed, so a misbuilt arg costs a cheap re-invoke, not a
silent crash.

Test-author separation is enforced by construction: test batches are authored in the workflow's
first phase by `agentMap.tests` workers that derive only from the spec; implementation workers
never write tests for code they implement.

## Phase 2 — Handle returns (loop until `stage: complete`)

| Return stage | Action |
|---|---|
| `blocked` | Per item: if resolvable within the spec's stated intent → consult the **Fable retainer**; if a genuine fork or scope change → `AskUserQuestion`. Write the ruling **prose into the spec's Decisions table** (that is where the worker reads it). Then set `args.resolutions[batchId]` to a short **token** — a hash of the ruling text or a monotonic counter, **never the ruling prose itself** — which busts the journal cache for that batch only. Keep `resolutions` **cumulative** across resumes: dropping an entry reverts that batch's prompt and silently un-applies its ruling. Resume with `resumeFromRunId`. |
| `tdd-red-check` | Newly written tests pass before implementation — the spec is wrong somewhere. Surface the passing tests, fix spec or tests with the user, resume. |
| `out-of-scope-failure` | A gate failure implicates a file outside the File Plan. `AskUserQuestion`: add to scope (mini-batch) / file as a separate fix / pause the spec. Per Blast Radius Discipline — never silently widen. |
| `gate-exhausted` | Repair loop hit its cap. Consult the Fable retainer with the failure output before escalating to the user. |
| `complete` | Proceed to Phase 3. |

**Fable retainer:** on the first surprise, spawn `Agent {model: "fable"}` (fall back to
`{model: "opus"}` if Fable is unavailable — see shared § Model Placement callout) with the spec's
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
batch, max 3 rounds (detect → repair → verify); if a round leaves the failure set unchanged from
the prior round, consult the retainer immediately rather than dispatching another repair round.
After the ceiling or a stalled round, consult the retainer, then escalate to the user.

**T3 checkpoint (mandatory):** any diff touching the host's declared high-risk surfaces
(pipeline rules § Risk Tiers / § Build) gets a Fable retainer review before reporting.

Checkpoint-commit after the gate is green (and after each earlier green phase if the run is long).

## Phase 5 — Report & handoff

Report: files (C/M/D), gate table, decisions applied vs escalated mid-run, consultant
consultations (count + topics), workflow `runId` (for any later resume), and token spend (every
workflow return carries `tokens` = output-token spend; report it per invocation — spend visibility
is how the pipeline's cost gets tuned instead of guessed). Status stays
`implementing` — only `/spec:review` flips `done`.

If in a worktree: **stay in it** — `/spec:review` runs there and merges back to the
originating branch on CLEAN (its Phase 4). Only `AskUserQuestion` (keep / discard +
`ExitWorktree`) if the user is abandoning the spec instead of proceeding to review.

Next: `/spec:review $ARGUMENTS`

## Rules

- **Never Read `wf-build.js`.** The complete `args` contract is specified in Phase 1
  (`{specPath, tdd, testBatches, groups, resolutions, agentMap, doctrinePaths, gate,
  pipelineRulesPath}`); the return stages are enumerated in Phase 2. The workflow's internals —
  batch execution, gate, repair loop, journal cache, resume — are the workflow's concern, not
  the orchestrator's. Invoke it (by `scriptPath`) and act on its returns; its source is never
  orchestrator context. "Read the workflow to understand the args contract" is the anti-pattern —
  the contract lives here, not there.
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
