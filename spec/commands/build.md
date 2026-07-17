---
description: Implement a hardened spec — Sonnet orchestrator and workers, Fable retainer consulted on surprises; small specs skip the workflow entirely
argument-hint: <spec path>
---

# Spec Build: Orchestrated Implementation

Implement a hardened spec. The orchestrator parses the File Plan into batches, invokes the
bundled `wf-build` workflow (Sonnet workers, deterministic control flow), resolves surprises
via the retainer + user, and resumes until green.

**Intended orchestrator model: Sonnet — all tiers.** Workers: Sonnet. Lookups: Haiku.
Surprises: the **Fable retainer** subagent (below; Opus fallback per the shared invariants'
model-fallback contract). The build needs no resident expensive model: the spec is the
contract, the gate is deterministic, and the only judgment that enters a build is the rare
surprise — which is exactly when the retainer is consulted. The retainer is the spec author's
proxy, so running it on the planning model is a feature (it proxies the author's intent; it
reviews nothing).

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

## Phase 1 — Run the build

**Fast path (no workflow).** If the File Plan parses to a **single implementation batch of
≤ 4 files** (plus at most one test batch), skip the Workflow tool entirely — multi-agent
fan-out is overhead a one-batch spec never repays:

1. TDD (if ACs exist): dispatch the test-author as one `Agent {subagent_type: <agentMap.tests>,
   model: "sonnet"}` (host agents resolve natively in-session — the doctrine-paths workaround
   is a workflow-registry problem, not yours), then run `{testCommand} <test files>` yourself
   and confirm every new test fails. A passing new test = the spec is wrong → `tdd-red-check`
   handling per Phase 2.
2. Dispatch the implementation batch as one `Agent {subagent_type: <agentMap kind>,
   model: "sonnet"}` — same grounding as any worker: Read the spec's Decisions / Contracts /
   UI / File Plan rows, pipeline rules § Worker Rules, blocked-on-fork, deviations sidecar
   (Phase 2), no git.
3. Run the resolved `gateCommand` yourself (Bash). On failure: max 2 repair dispatches to the
   same agent kind, then retainer, then user — same escalation ladder as Phase 2.
4. Ledger row (Phase 5) gets `"fastPath":true` and no `runId`.

Blocked returns, retainer consults, and everything else behave exactly as Phase 2 describes —
the fast path changes the execution vehicle, not the contract.

**Workflow path (everything else).** Invoke `Workflow {scriptPath: <spec-paths wf-build
output>, args: {specPath, tdd, testBatches, groups, resolutions: {}, agentMap, doctrinePaths,
deviationsPath, gate: {command, testCommand}, pipelineRulesPath}}`. Pass `args` as a real JSON
object (the script tolerates the harness's stringified delivery, but never double-encode it
yourself). `deviationsPath` is `<spec path minus .md>.deviations.md` — the sidecar workers
append forced-but-unblocking departures to (Phase 2).

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
| `blocked` | Per item: if resolvable within the spec's stated intent → consult the **retainer**; if a genuine fork or scope change → `AskUserQuestion`. Write the ruling **prose into the spec's Decisions table** (that is where the worker reads it). Then set `args.resolutions[batchId]` to a short **token** — a hash of the ruling text or a monotonic counter, **never the ruling prose itself** — which busts the journal cache for that batch only. Keep `resolutions` **cumulative** across resumes: dropping an entry reverts that batch's prompt and silently un-applies its ruling. Resume with `resumeFromRunId`. |
| `tdd-red-check` | Newly written tests pass before implementation — the spec is wrong somewhere. Surface the passing tests, fix spec or tests with the user, resume. |
| `out-of-scope-failure` | A gate failure implicates a file outside the File Plan. `AskUserQuestion`: add to scope (mini-batch) / file as a separate fix / pause the spec. Per Blast Radius Discipline — never silently widen. |
| `gate-exhausted` | Repair loop hit its cap. Consult the retainer with the failure output before escalating to the user. |
| `complete` | Proceed to Phase 3. |

**Retainer (Fable, seated as the plan author):** on the first surprise, spawn
`Agent {model: "fable"}` (if it returns unavailable, respawn `{model: "opus"}` — the shared
invariants' fallback contract) with the spec's Rationale + Assumptions sections, its
Decisions table, the divergence — and this role brief **verbatim**:

> You are the retainer for this build: the spec author's proxy, not a second implementer and
> not a reviewer. Every ruling derives from the spec's stated Rationale, Assumptions, and
> locked Decisions — never from implementation convenience; the cheapest diff is not an
> argument. Prefer the reading that preserves the spec's invariants and Blast Radius over the
> one that unblocks fastest. Rulings are short, declarative, and written to be pasted into the
> Decisions table verbatim. If the spec's intent is genuinely ambiguous, or any ruling would
> widen scope or contradict a locked Decision, reply `ESCALATE:` with the two branches of the
> fork stated neutrally — never guess the author's intent, and never soften an escalation into
> a provisional ruling.

On later surprises, continue the SAME agent via `SendMessage` — it accumulates context of
this run's weirdness, and its prompt cache makes follow-up consults cheap. Consults are
**surprise-driven only** — there is no mandatory checkpoint ritual (the v4 T3 diff checkpoint
returned PASS on 100% of measured runs: a gate that never blocks is spend, not signal; see
the scaffold ledger). Consult triggers: worker blocked on a stale assumption, gate failed
twice on the same batch, out-of-scope file, a change contradicting the approved design or a
locked Decision, plus any host-declared triggers (pipeline rules § Build).

Completed batches return from the workflow journal cache on resume — only changed work re-runs.

## Phase 3 — Host integration (orchestrator-only; never delegated, never inside the workflow)

Execute the orchestrator duties the host's pipeline rules § Build declares — e.g. codegen
regeneration, translation-catalog fills, migration generation and review, boot checks, public
surface/barrel verification. These are deliberately outside the workflow: they touch shared
or generated surfaces that parallel workers must never own. Where § Build marks a step as
high-risk (e.g. migration review), consult the retainer before the step executes — that is a
host-declared surprise trigger, not a checkpoint ritual.

## Phase 4 — Final gate

Run the resolved `gateCommand`. On failure: repair via Sonnet dispatches mapped to the owning
batch, max 3 rounds (detect → repair → verify); if a round leaves the failure set unchanged from
the prior round, consult the retainer immediately rather than dispatching another repair round.
After the ceiling or a stalled round, consult the retainer, then escalate to the user.

Checkpoint-commit after the gate is green (and after each earlier green phase if the run is long).

## Phase 5 — Report & handoff

**Run ledger (before the chat report):** append exactly ONE line to `.claude/spec-runs.jsonl`
(repo root; create on first append) — the repo-wide, committed, append-only run history:

```
{"ts":"<YYYY-MM-DD>","spec":"<repo-relative spec path>","stage":"build","tier":"<T1|T2|T3>","runId":"<wf_…>","fastPath":<bool>,"diff":{"files":<n>,"loc":<n>},"tokens":{"workflow":<n>,"phase4Repairs":[<n>,…]},"gate":{"phase4Rounds":<n>,"failureSetShrankEachRound":<bool>},"retainer":{"consults":<n>},"deviations":<n>}
```

`diff` comes from `git diff --shortstat <build_base>..HEAD` (files changed, insertions +
deletions summed as `loc`) — it's what makes token costs comparable across specs of different
sizes. `fastPath` marks a no-workflow build (`runId` omitted). `deviations` = line count of
the deviations sidecar (0 if absent) — `/spec:review` folds the sidecar's content at close. `phase4Repairs` entries are each repair agent's actual output-token count as the
harness reports it; if a count isn't visible, write `null` — **never `0`** (a zero reads as
"free repair" and silently poisons averages; a null is an honest, detectable gap). Fixed shape, counts/enums/paths only — **never prose, rulings, or pasted gate output**
(those live in the spec's Decisions table); a fat line is a bug. Append via
`printf '%s\n' '<json>' >> .claude/spec-runs.jsonl`. The next checkpoint/close commit picks it
up — never gitignore it; durable cost + verdict history is its whole point.

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
  (`{specPath, tdd, testBatches, groups, resolutions, agentMap, doctrinePaths, deviationsPath,
  gate, pipelineRulesPath}`); the return stages are enumerated in Phase 2. The workflow's internals —
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
- **Falsified embedded reference → orchestrator refreshes it first.** When a `blocked` return
  (or a gate failure) shows an embedded reference wrong against the installed version, the
  orchestrator re-runs the plan-time lookup the pipeline rules § Planning declares (e.g.
  Context7) and records the corrected reference in the Decisions table **before** any retainer
  consult. The no-MCP rule binds workers; its premise — references verified at plan time — is
  void the moment one falsifies. A retainer consult about vendor behavior without a fresh docs
  citation is a defect: it manufactures remedies by inference that thirty seconds of docs
  would refute.
- **Host integration steps are orchestrator-only** — never delegated into the workflow.
- **Resume over restart.** Blocked batches re-run via the `resolutions` salt; everything
  finished returns from cache. Never restart a run from scratch when a `runId` exists.
- `AskUserQuestion` dismissed → STOP.
