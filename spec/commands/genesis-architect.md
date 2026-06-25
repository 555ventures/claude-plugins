---
description: Greenfield architecture genesis — research+panel-driven stack/structure decisions, recorded as ADRs, then scaffold the project and hand off to /spec:init
argument-hint: <project idea — what you want to build, for whom>
---

# Genesis Architect: Decide the Stack, Scaffold the Project

The first greenfield stage. Establishes the project **archetype** and **audience**, runs a
research-backed MoA panel over the hard-to-reverse architecture decisions, records them as ADRs,
and scaffolds a compiling skeleton with a runnable gate — so `/spec:init` has a real repo to
ground. Heavily interactive: the session owns every `AskUserQuestion` and every file write; the
`wf-panel` workflow does the parallel research + panel (see genesis.md § Genesis: Session ↔ Workflow Loop).

**Intended model: Opus** (the genesis judgment concentration point).

**Setup:** run `spec-paths shared` and Read that file (the shared invariants), then run
`spec-paths shared-genesis` and Read that too — the genesis-stage supplement covers the archetype
registry, panel doctrine, discovery interview, the genesis state machine and on-disk handoff. Also
run `spec-paths wf-panel` and `spec-paths wf-research` once and keep the printed absolute paths — they
are the `scriptPath` for the `Workflow` calls below. v1 is **greenfield-only**: if the target
directory already has a real codebase (source files beyond config/scaffold), STOP and tell the user
to run `/spec:init` directly — genesis is for new projects.

## Input

`$ARGUMENTS` — a free-form description of what to build and for whom. May be terse ("a trading
simulator", "a Japanese-market mobile app", "an AI support bot"); intake fills the gaps.

## Phase 0 — Re-entry

If `.claude/genesis/status.json` exists, read it and **verify the named artifacts physically
exist** (stack-descriptor, ADRs, scaffold dir, gate) — never trust the phase enum alone. Resume
from the last *verified* phase; report what was found and what is being resumed.

## Phase 1 — Discovery interview (interactive)

Run intake as a **structured discovery interview**, not a form (genesis.md § Genesis: Discovery
Interview): funnel-shaped (broad vision → narrow constraints), every `AskUserQuestion` batch
lens-tagged, neutrally worded, and carrying an **"Other / not sure"** escape hatch (your one open
lane).

0. **Reflect back first.** Restate `$ARGUMENTS` in your words — what you think is being built, for
   whom, the core job it does — and run one `AskUserQuestion` to confirm/correct *before* any
   elicitation. The confirmed restatement seeds the verbatim goal (anti-drift).

Then batch, broad → narrow — each batch tagged **cold** (user-contextual; the options are yours to
author) or **research-backed** (options built live by `wf-research`):

1. **[Product lens] — cold.** the job & success — the problem solved, and what success looks like in
   ~6 months as an **outcome** (a named behavior change, not a feature). Never embed a metric or
   solution in an option.
2. **[User lens] — cold.** audience & locale scope — global / region / single-country (+ primary
   locale), and the primary user's core need. Sets the locale research context for later batches.
3. **[Scope lens] — cold.** non-goals — present plausible adjacent features; the user marks each
   **In / Later / Won't-this-time**. Recorded exclusions are a focusing device, not a parking lot.
4. **[Architect lens] — archetype cold, the stack research-backed.** First settle the archetype
   (genesis.md § Genesis: Archetype Registry — web-app / mobile-app / conversational-bot / backend-api /
   realtime-trading / cli-devtool / data-ml / desktop-app; for `web-app` the FE/BE/fullstack split),
   hard constraints (must-use services, compliance, performance/budget targets — **never staffing**),
   and any pre-decided pieces — all structural and user-owned. Then run the **research-woven loop**
   over every still-open stack dimension the archetype opens (framework, persistence, component
   library, hosting, …): the options are the current menu, not your prior.

**Research-woven loop** (genesis.md § Genesis: Discovery Interview — the woven loop). For each open
dimension a prior answer opens:

1. Call `wf-research` (`Workflow {scriptPath: <spec-paths wf-research output>}`) with `args` =
   `{stage: "architect", dimensionKeys: [...], briefPath: ".claude/genesis/brief.md", contextPaths:
   [<prior interview-research/*.json>], verifyKeys: [<the version-bearing subset>]}` —
   paths/keys/booleans only. Batch all dimensions one answer opens into a single call.
2. On return, write each menu to `.claude/genesis/interview-research/{dimension}.json`, **stamping
   `fetchedAt`** yourself (the workflow can't — read the date via Bash `date`).
3. Present an `AskUserQuestion` built from the menu: 2–4 options recommended-first by `rank`, each
   option's `tradeoff` + recency in its description ("current as of `<fetchedAt>`"), neutral
   phrasing, the **"Other / not sure"** escape hatch. **Drop or demote** any option the Haiku pass
   marked `still_current: false`.
4. Record the pick **and its `sources`** to the brief, and mark that dimension **constrained** — it
   then skips the Phase-3 panel (genesis.md § Genesis: Discovery Interview — Discovery↔Panel bridge).

**Probe once.** When a batch returns "Other / not sure" or an answer is too thin to drive research,
fire **one** focused follow-up batch whose options are the pre-laddered "why does that matter /
which specifically" rungs for that pick. One probe round, never a recursion. If a research call
returns nothing in good time, fall back to a model-knowledge menu stamped `unverified` — never block
the interview.

**Read back for sign-off.** Assemble the answers into a short discovery brief and run a final
confirm `AskUserQuestion` (the read-back gate) before the Phase-3 panel runs. Write
`.claude/genesis/brief.md` incrementally as the interview proceeds and finalize it here: the goal
(verbatim from the confirmed restatement, for anti-drift), the intake answers, the recorded
non-goals, **each research-backed pick with its `sources` and `fetchedAt`**, and the three
machine-keyed sections — `## Research Angles`, `## Panel Roles`, `## Open Dimensions` — populated in
Phase 2. Initialize `.claude/genesis/status.json` (`architect: pending`, archetype, localeScope)
from `$(spec-paths templates)/status.json`.

**Discovery is product / user / business / legal only.** Team skill, headcount, ownership, ops
staffing are never asked — Claude is always the implementer, so "team skill" collapses to a silent
default (favor boring, typed, testable stacks Claude implements reliably; a Phase-2 tiebreaker, not
a question).

## Phase 2 — Derive the research plan (Opus pass)

From the archetype registry + audience scope:

- Select the **research-angle keys** (archetype angles + cross-cutting `scope-discipline`,
  `competitive-teardown`, `accessibility`, and the locale bundle if non-global). Expand each into
  a focus paragraph under `## Research Angles` in the brief.
- Select **3 proposer role keys** relevant to the archetype; write their personas under
  `## Panel Roles`.
- List the **hard-to-reverse dimensions** (shared list) under `## Open Dimensions`, each marked
  *constrained* (user pre-decided **or settled in the Phase-1 research-woven loop**) or *open*, and
  flagged hard-to-reverse. A dimension the user picked from a research-backed menu is constrained —
  the panel may add a `minority_position` to its ADR but never reopens it as a `hard_fork`.
- Pass the Phase-1 `.claude/genesis/interview-research/*.json` files to `wf-panel` via
  `contextPaths` so the panel's research agents build on them instead of re-fetching.
- **Selective panel:** if every hard-to-reverse dimension is constrained and there are no
  hesitation signals, set `runProposers: false` (research still runs). A well-researched interview
  makes this the common case.

## Phase 3 — Research + panel loop (session ↔ workflow)

Repeat until no open hard forks remain:

1. Invoke the `wf-panel` workflow (`Workflow {scriptPath: <spec-paths wf-panel output>}`) with
   `args`: `{stage: "architect", briefPath: ".claude/genesis/brief.md", researchKeys: [...],
   roleKeys: [...], runProposers: <bool>, contextPaths: [<prior panel-results + research>]}`.
   **`args` is paths/keys/booleans only** — never inline prose.
2. On return, write `.claude/genesis/panel-results-architect.json`.
3. `AskUserQuestion` on `hard_fork_list` — conflicting positions **verbatim**, `recommended_first`
   first. Record each ruling and **every `minority_position`** into the brief's decisions notes
   (they become ADR `## Dissents`). Dismissed → STOP.
4. If `research_gaps` remain or a ruling opens a deeper dimension, start a **fresh** round with
   only the new `researchKeys` (prior results via `contextPaths`).

## Phase A — Decide & commit (reversible)

1. Write `docs/adr/NNNN-*.md` per `$(spec-paths templates)/adr.md` for each hard-to-reverse
   decision — one reason per decision, `## Dissents` **required** (non-empty or the explicit "None"
   line).
2. Write `.claude/genesis/stack-descriptor.json` (template via `spec-paths templates`): archetype,
   localeScope, language, framework, packageManager, testRunner, linter, typechecker,
   componentLibrary, designCatalog, `enforceEngines`, the resolved **`gateCommand`**, the
   `scaffoldCommand`, and `decisionRecords`.
3. Commit (the session owns git). Set `status.architect: decisions-recorded`, stamp `lastUpdated`.

## Phase B — Scaffold & gate (irreversible, idempotent)

1. Run the `scaffoldCommand` (the chosen `create-*` tool) into the project root.
2. Run the **zero-day gate** — the descriptor's `gateCommand` (typecheck + lint, lint at
   `--max-warnings 0` where supported). Fix scaffold-level issues only; do not start feature work.
3. On green, commit. Set `status.architect: scaffold-complete`, write `gateCommand` into
   `status.json`. A failed Phase B re-runs Phase B only, against the committed decisions.

## Phase C — Report & hand off

Report: archetype + audience, decisions made (with ADR paths), dissents recorded, the resolved
gate command, scaffold result. **Next:** `/spec:genesis-design <same idea>` — or, for an archetype
whose design stage is `none` (backend-api, data-ml), note that design is skipped and the next step
is `/spec:init`.

## Rules

- **Never Read `wf-panel.js` or `wf-research.js`.** Both `args` contracts are in the phases that
  invoke them — `wf-research` `{stage, dimensionKeys, briefPath, contextPaths, verifyKeys}` and
  `wf-panel` `{stage, briefPath, researchKeys, roleKeys, runProposers, contextPaths}`. Invoke each
  by `scriptPath` and act on its return; their sources are never orchestrator context.
- Greenfield-only (v1): a populated repo → STOP, point to `/spec:init`.
- `AskUserQuestion` dismissed → STOP; never invent the declined answer.
- Hard-to-reverse forks always go to the user; never synthesized away.
- `args` to `wf-panel`/`wf-research` is a control channel — paths, enum keys, booleans only.
- Every `Agent`/workflow `model:` is explicit (Opus session/aggregator, Sonnet research/proposers).
