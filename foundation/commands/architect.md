---
description: Greenfield architecture genesis — research+panel-driven stack/structure decisions, recorded as ADRs, then scaffold the project and hand off to /spec:init
argument-hint: <project idea — what you want to build, for whom>
---

# Foundation Architect: Decide the Stack, Scaffold the Project

The first greenfield stage. Establishes the project **archetype** and **audience**, runs a
research-backed MoA panel over the hard-to-reverse architecture decisions, records them as ADRs,
and scaffolds a compiling skeleton with a runnable gate — so `/spec:init` has a real repo to
ground. Heavily interactive: the session owns every `AskUserQuestion` and every file write; the
`wf-foundation` workflow does the parallel research + panel (see shared § Session ↔ Workflow Loop).

**Intended model: Opus** (the genesis judgment concentration point).

**Setup:** Read this plugin's `commands/shared.md` (the foundation invariants — archetype
registry, panel doctrine, on-disk handoff, state machine). v1 is **greenfield-only**: if the
target directory already has a real codebase (source files beyond config/scaffold), STOP and tell
the user to run `/spec:init` directly — foundation genesis is for new projects.

## Input

`$ARGUMENTS` — a free-form description of what to build and for whom. May be terse ("a trading
simulator", "a Japanese-market mobile app", "an AI support bot"); intake fills the gaps.

## Phase 0 — Re-entry

If `foundation/status.json` exists, read it and **verify the named artifacts physically exist**
(stack-descriptor, ADRs, scaffold dir, gate) — never trust the phase enum alone. Resume from the
last *verified* phase; report what was found and what is being resumed.

## Phase 1 — Intake (interactive)

`AskUserQuestion`, batched, with informed options — establish what only the user can answer:

1. **Archetype** (shared § Archetype Registry) — web-app / mobile-app / conversational-bot /
   backend-api / realtime-trading / cli-devtool / data-ml / desktop-app. For `web-app`, also the
   FE/BE/fullstack split.
2. **Audience / locale scope** — global / region / single-country (+ primary locale). This drives
   the locale research bundle and theme taste downstream.
3. **Goals & hard constraints** — non-negotiables (existing team skills, must-use services,
   compliance, performance targets, budget).
4. **Pre-decided pieces** — anything the user already fixed (a known framework, language, host).

Write `foundation/brief.md`: the goal (verbatim, for anti-drift), the intake answers, and the
three machine-keyed sections — `## Research Angles`, `## Panel Roles`, `## Open Dimensions` —
populated in Phase 2. Initialize `foundation/status.json` (`architect: pending`, archetype,
localeScope) from `templates/status.json`.

## Phase 2 — Derive the research plan (Opus pass)

From the archetype registry + audience scope:

- Select the **research-angle keys** (archetype angles + cross-cutting `scope-discipline`,
  `competitive-teardown`, `accessibility`, and the locale bundle if non-global). Expand each into
  a focus paragraph under `## Research Angles` in the brief.
- Select **3 proposer role keys** relevant to the archetype; write their personas under
  `## Panel Roles`.
- List the **hard-to-reverse dimensions** (shared list) under `## Open Dimensions`, each marked
  *constrained* (user pre-decided in Phase 1) or *open*, and flagged hard-to-reverse.
- **Selective panel:** if every hard-to-reverse dimension is constrained and there are no
  hesitation signals, set `runProposers: false` (research still runs).

## Phase 3 — Research + panel loop (session ↔ workflow)

Repeat until no open hard forks remain:

1. Invoke the `wf-foundation` workflow (`Workflow` tool, `name: "wf-foundation"`) with `args`:
   `{stage: "architect", briefPath: "foundation/brief.md", researchKeys: [...], roleKeys: [...],
   runProposers: <bool>, contextPaths: [<prior panel-results + research>]}`. **`args` is
   paths/keys/booleans only** — never inline prose.
2. On return, write `foundation/panel-results-architect.json`.
3. `AskUserQuestion` on `hard_fork_list` — conflicting positions **verbatim**, `recommended_first`
   first. Record each ruling and **every `minority_position`** into the brief's decisions notes
   (they become ADR `## Dissents`). Dismissed → STOP.
4. If `research_gaps` remain or a ruling opens a deeper dimension, start a **fresh** round with
   only the new `researchKeys` (prior results via `contextPaths`).

## Phase A — Decide & commit (reversible)

1. Write `docs/adr/NNNN-*.md` per `templates/adr.md` for each hard-to-reverse decision — one
   reason per decision, `## Dissents` **required** (non-empty or the explicit "None" line).
2. Write `foundation/stack-descriptor.json` (template in `templates/`): archetype, localeScope,
   language, framework, packageManager, testRunner, linter, typechecker, componentLibrary,
   designCatalog, `enforceEngines`, the resolved **`gateCommand`**, the `scaffoldCommand`, and
   `decisionRecords`.
3. Commit (the session owns git). Set `status.architect: decisions-recorded`, stamp `lastUpdated`.

## Phase B — Scaffold & gate (irreversible, idempotent)

1. Run the `scaffoldCommand` (the chosen `create-*` tool) into the project root.
2. Run the **zero-day gate** — the descriptor's `gateCommand` (typecheck + lint, lint at
   `--max-warnings 0` where supported). Fix scaffold-level issues only; do not start feature work.
3. On green, commit. Set `status.architect: scaffold-complete`, write `gateCommand` into
   `status.json`. A failed Phase B re-runs Phase B only, against the committed decisions.

## Phase C — Report & hand off

Report: archetype + audience, decisions made (with ADR paths), dissents recorded, the resolved
gate command, scaffold result. **Next:** `/foundation:design <same idea>` — or, for an archetype
whose design stage is `none` (backend-api, data-ml), note that design is skipped and the next step
is `/spec:init`.

## Rules

- Greenfield-only (v1): a populated repo → STOP, point to `/spec:init`.
- `AskUserQuestion` dismissed → STOP; never invent the declined answer.
- Hard-to-reverse forks always go to the user; never synthesized away.
- `args` to `wf-foundation` is a control channel — paths, enum keys, booleans only.
- Every `Agent`/workflow `model:` is explicit (Opus session/aggregator, Sonnet research/proposers).
