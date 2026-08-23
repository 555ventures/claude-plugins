---
description: Implement a hardened spec — direct Sonnet worker dispatch per layer wave behind the deterministic gate
argument-hint: <spec path>
---

# Spec Build

Implement a hardened spec: resolve the gate, author tests red-first, dispatch one worker
agent per layer wave, gate, ship. Orchestrator and workers: Sonnet. The spec is the
contract; the gate is deterministic; surprises go to the user with the spec's own language.

**Setup:** run `spec-paths shared-for build` and read its output. Read the host's
`.claude/spec.config.json` and its `pipelineRules` file. Either missing → STOP: run
`/spec:init` first.

## Input

`$ARGUMENTS` — path to a hardened spec.

## Phase 0 — Preflight

1. **State:** `status: hardened` → proceed; `implementing` → resume (skip already-landed
   File Plan rows by inspecting the diff); anything else → STOP with the required command.
   `design: true` without `designed:` (design-capable hosts) → ask whether to run
   `/spec:design` first. **Worktree isolation is not build's concern** — run
   `/git:enter-worktree <spec>` first to build in isolation; build never creates, enters,
   or leaves one and never writes `build_base`.
2. **Parse the spec once.** File Plan rows → waves by **Layer**, ordered per the host's
   `layerGroups` (layers listed together in one group form ONE wave; their file sets must
   be disjoint or the wave splits). `tests` rows form the test-author dispatch (Phase 1);
   `other` rows and shared registration/wiring files form a final serial wave.
3. **Resolve the gate.** Substitute `{testDirs}`/`{scopeDirs}` in `gateCommand` from the
   spec's File Plan test rows, **resolved to the form the host's runner actually executes**
   — for `node --test` the glob form (`node --test 'tests/<dir>/*.test.js'`; a bare
   directory silently runs nothing or errors). Also resolve `typecheckCommand` when the
   host exposes a standalone typecheck leg; the red-check treats a file red if it fails
   **either** leg. Then run `node "$(spec-paths env-preflight)" --root {root}` — exit 1 is
   a provisioning STOP: print its output verbatim and stop; an unprovisioned environment
   must never enter a repair loop (the gate cannot distinguish wrong code from a missing
   variable, and repair dispatches structurally cannot fix the second).
4. **Flip `status: hardened → implementing`**, and in the same edit write
   `diff_base: <git rev-parse HEAD>` into frontmatter when no `build_base` exists (an
   in-place build) — `/spec:review` recovers its diff base from the spec file, never from
   conversation context.

## Phase 1 — Tests first (when ACs exist)

Dispatch the test author: one `Agent {subagent_type: <agentMap.tests>, model: sonnet}` with
the spec path and pipeline-rules path — it derives tests from the spec alone.
Implementation workers never write tests for code they implement.

**Red-check (executed, one observation per verdict):** run
`node "$(spec-paths red-check)" --spec {spec path} --root {root} --base {build_base or
diff_base}` — it resolves the spec's own expectation (a `SHALL CONTINUE TO` pin or a valid
`[pre-green:]` tag sanctions green; everything else expects red), executes `{testCommand}
<file>` (plus the `typecheckCommand` leg when declared) once per tests-layer file, and
reads exit codes only. For a design-stage pre-landed component's test (design-capable
hosts only), pass `--expect-green <path>` per such file — an orchestrator-derived,
per-invocation sanction, printed as a warning naming the flag and the path.

Dispositions:
- **exit 0** — every file matched its expectation; proceed. The script proves the file's
  colour only, never that the failure is attributable to the spec's contract — a
  red-expected file that fails by crashing on loading a module the File Plan's CREATE rows
  name is not yet demonstrated red (the script deliberately does not distinguish crash-red
  from assert-red): stub the missing module inert, re-run, confirm the file's assertions
  now execute and fail, then delete the stub.
- **exit 1, `unsanctioned-green`** — a red-expected file passed: the spec is wrong
  somewhere. Diagnose (stale assumption, wrong target, behavior already exists,
  mis-classified pin) and confirm with the user before proceeding.
- **exit 1, `broken-pin`** — a sanctioned-green file failed. Diagnose the drift; never
  weaken the carrier.
- **exit 1, `missing-test-file`** — a non-DELETE tests-layer File Plan path does not exist
  on disk; the script probes existence before invoking the runner and never fakes a
  satisfied red expectation. Author the missing file.
- **exit 1, `invalid-pre-green`** — an AC bullet's `[pre-green:]` reason is outside the
  closed enum, so it sanctions nothing and the file stays red-expected. Fix the tag to a
  valid enum member (`fallback-rejection` | `absence-invariant` | `predicate-in-test`).
- **exit 2** — a refusal (usage, config, or pre-image purity), never a findings result:
  print the remedy verbatim and stop.

## Phase 2 — Implementation waves

For each wave, in `layerGroups` order: dispatch **one worker `Agent` per layer in the wave**
(`subagent_type` = the host `agentMap` value for that layer's kind, `model: sonnet`),
in parallel within the wave. Each worker prompt carries only:

- the spec path (workers Read Decisions, Contracts, UI, and their own File Plan rows
  themselves), the pipeline-rules path, and the worker's file list `{path, action}`;
- the **Worker Contract** block from the host's grounding layer (pipeline rules § Worker
  Rules): apply Decisions verbatim, never run git, never query MCPs, read-only surfaces
  stay read-only, return `blocked` naming the assumption instead of improvising, append
  forced-but-unblocking departures to the deviations sidecar
  (`<spec path minus .md>.deviations.md`) as one `- ` bullet per departure, continuations
  indented — flush-left prose is invisible to the ledger count and refused at review close.

On a `blocked` return: resolve it against the spec's Rationale/Assumptions when the intent
is clear; a genuine fork or scope change goes to the user via `AskUserQuestion` with the
consequence of each option. Write the ruling **into the spec's Decisions table** (that is
where workers read it), then re-dispatch that worker. A ruling that adds or changes an
observable promise updates its terminal-observable AC in the same spec edit. A gate failure
implicating a file outside the File Plan is never silently widened — ask: add to scope /
file separately / pause.

## Phase 3 — Host integration (orchestrator-only)

Execute the orchestrator duties the host's pipeline rules § Build declares (codegen
regeneration, migrations, catalog fills, wiring checks) — these touch shared or generated
surfaces parallel workers must never own. When a worker reports an embedded reference wrong
against the installed version, re-run the plan-time lookup (e.g. Context7) and record the
corrected reference in Decisions before dispatching a fix.

## Phase 4 — Final gate

Run the resolved `gateCommand`. On failure: repair via Sonnet dispatches mapped to the
owning wave, max 3 rounds (detect → repair → verify); a round that leaves the failure set
unchanged escalates to the user immediately. Then run
`node "$(spec-paths scope-reconcile)" --root {root} --base {build_base or diff_base} --spec
{spec path} --json` (advisory, never blocks): non-empty `outOfPlan` prints
`⚠️ out-of-plan: {list}`; non-empty `atRisk` prints `⚠️ {N} at-risk pins outside this
spec's gate — review will run them`. Checkpoint-commit once the gate is green.

## Phase 5 — Report & handoff

Append exactly ONE line to `.claude/spec-runs.jsonl` (repo root; create on first append):

```
{"ts":"<ISO-8601>","spec":"<repo-relative spec path>","stage":"build","tier":"<standard|critical>","diff":{"files":<n>,"loc":<n>},"gate":{"finalRounds":<n>},"deviations":<n>}
```

`diff` from `git diff --shortstat {base}..HEAD` — `loc` = insertions + deletions (the same
sum review's {diffLoc} uses); `deviations` = sidecar entry count (lines matching `^- `; 0 if
absent). Counts/enums/paths only — never prose or pasted gate output (rulings live in the
spec's Decisions table).

Report — assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`,
print verbatim. `outcome`: ✅ `build green — {N} files, gate passed` (⚠️ when the run needs
the user); `bullets`: one line per escalation; `next`: `/spec:review {spec path}`.

```report
✅ **build green — 6 files, gate passed**

Next: /spec:review specs/20260817/01-example.md
```

Status stays `implementing` — only `/spec:review` flips `done`. If in a worktree, stay in
it: review runs there and merges back on CLEAN.

## Rules

- **Workers never run git.** The orchestrator owns all git and checkpoint commits.
- **Decisions table is authoritative** — nobody overrides it; only the orchestrator adds
  entries, recording a user ruling.
- **Workers never query MCPs** and read-only/generated surfaces change only via their
  declared tools.
- `AskUserQuestion` dismissed → STOP.
