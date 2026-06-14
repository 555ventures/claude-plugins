---
description: Shared invariants of the spec pipeline — reference document read by the other /spec commands, not a workflow entry point
---

# Spec Pipeline: Shared Invariants

Pipeline: `/spec:plan` (Fable) → `/spec:design` (optional, UI specs in design-capable hosts) →
`/spec:build` (Opus + `wf-spec-build` workflow) → `/spec:review` (independent gate; on CLEAN
commits the close and merges the build branch back into its originating branch).

## Host Grounding

The pipeline is process; the repo supplies grounding. Two host files, both created by
`/spec:init` (run it once per repo before first use):

- **`.claude/spec.config.json`** — machine-readable knobs: `gateCommand`, `testCommand`,
  `setupCommand`, `patternsScript`, optional `driftScript`, optional `design` block
  (component-catalog stage — see § Design Stage), `layerGroups`, `agentMap` (+ optional
  `routing` hints), `pipelineRules`, plus the `contractHash`/`generatedBy` drift stamps
  (§ Grounding Drift).
- **The pipeline rules file** (path in `pipelineRules`, conventionally
  `.claude/rules/spec-pipeline.md`) — prose grounding by section: `Risk Tiers`, `Planning`,
  `Build`, `Worker Rules`, `Test Rules`, `Review Checks`.

Every command reads both at start. Repo differences live there — never as forks inside the
plugin's files. If either is missing, STOP and tell the user to run `/spec:init`.

## Grounding Drift

The grounding layer goes stale two ways; **detection is mechanical, response is judgment.**

- **Plugin updated.** The contract itself is a file — the plugin's grounding-contract doc
  (`spec-paths contract`: required config keys, required rules sections, the canonical
  Worker Contract text). `/spec:init` stamps its hash (`spec-paths contract-hash`) into the
  config as `contractHash`, plus `generatedBy: "spec@<version>"` for provenance. The
  state-gate hook recomputes the hash on every pipeline command and injects a one-line
  warning on mismatch — a warning, never a block; stale grounding usually still runs. No
  bookkeeping: editing the contract file is what changes the hash, so detection is
  automatic by construction.
- **Codebase drifted.** Stale cited paths, commands, or conventions surface at build time as
  worker `blocked {kind: "stale-assumption"}` returns; `/spec:doctor` catches them earlier
  with a read-only sweep (config integrity, agent roster, contract-text match, cited-path
  existence, script execution).

`/spec:doctor` diagnoses and recommends — targeted user-approved patches, or a full
`/spec:init` refresh when drift is structural. Regeneration always belongs to `/spec:init`;
the doctor never rewrites the grounding layer wholesale.

## Pipeline Entry

The pipeline is opt-in heavy machinery, not the default path. The default is direct work: the
session explores, implements, and the host's `gateCommand` + its standards docs gate it. Enter
the pipeline only when the work needs at least one of:

1. **Delegation** — execution is large enough that Sonnet workers should do it while Fable only plans
2. **Durability** — scope spans sessions; the spec is the re-entrant state
3. **Gates** — T3 risk surfaces warrant refuters, independent review, and the state machine

Tiers set intensity inside the pipeline; these three criteria decide entry. A new product
surface (feature, domain, module) is a normal spec (usually a `depends_on` series) — there is
no separate pipeline for it.

## Risk Tiers

Applied mechanically at plan time; recorded as `risk:` in frontmatter. The concrete trigger
lists are host-specific — pipeline rules § Risk Tiers is authoritative. The shape:

- **T3** if ANY of the host's declared high-risk triggers (money paths, auth/permission logic,
  data migrations beyond pure-additive, contract surfaces consumed by 2+ areas, …).
- **T1** if ALL: single area; established pattern (covered by `docs/canonical/`, the host's
  standards docs, or an obvious codebase precedent); no cross-area contract change; no
  persisted-state/data migration. T1 = no spec, no pipeline — direct work gated by the host's
  `gateCommand`.
- **T2**: everything else. Enters the pipeline only when it needs delegation or durability
  (see Pipeline Entry) — otherwise direct work.

Mid-build evidence of a T3 trigger upgrades the tier immediately (note it in the spec; T3
checkpoints apply from that point).

Tier effects: refuters at plan (T2: 1, T3: 2) · reviewers at review (T2: 1, T3: 2) · refuters
per hard finding (always 2) · mandatory Fable checkpoints (T3 only; surfaces listed in
pipeline rules § Build).

## Decomposition

A spec must fit one `/spec:build` run: roughly ≤15 File Plan rows, one primary area (plus any
host-declared caps, e.g. at most one migration). Larger work splits into `##-` sibling specs
in the same date dir, sliced by **landing unit** — each spec independently leaves the system
green — never by layer. Order via `depends_on`; build and review slices in dependency order.

## State Machine

`draft → hardened → implementing → done`. Transitions owned by exactly one command each:
`/spec:plan` → `hardened`, `/spec:build` → `implementing`, `/spec:review` → `done`.
`/spec:design` never moves `status` — it sets the `designed:` date field only.
Enforced by the plugin's `spec-state-gate.sh` (UserPromptSubmit) — invoking `/spec:design`,
`/spec:build`, or `/spec:review` against a spec in the wrong state is blocked before the model
sees it.

## Design Stage (hosts with a component catalog)

The stage is tool-agnostic; the host config's `design` block declares the catalog:

```jsonc
"design": {
  "tool": "storybook",            // "storybook" (web) | "widgetbook" (Flutter) | any catalog
  "command": "bun storybook",     // launches the catalog for the user's iteration loop
  "storyFormat": "CSF3 stories",  // what stories-kind workers author — e.g. "Widgetbook @UseCase builders"
  "doctrine": "docs/design/doctrine.md",   // the design doctrine doc (see below)
  "screenshot": "bun storybook:screenshot" // OPTIONAL: renders entries to images → designer self-review
}
```

When the host config declares a `design` block, specs with a UI section default to
`design: true` frontmatter (set at plan time), which routes the spec through `/spec:design`
between plan and build: foundation files + stateless components + catalog entries, the user
actively iterates in the running catalog, and the spec is reconciled to the approved design
before build starts. Build then treats the approved components as done inputs — the catalog +
the user's eyes gate UI rendering; TDD gates logic. Skipping design on a `design: true` spec
is the user's call, not the model's. Hosts without a catalog never set the flag; the stage
simply never runs.

**Design canon (cross-spec consistency).** Design consistency rides the same rails as code
consistency — a repo artifact with a read-first / reconcile-after lifecycle, never any one
session's context. Three layers, strongest enforcement first:

1. **Token/theme files in code** — the design language itself, lint/gate-enforced where the
   host's tooling allows. Sessions extend the scale; they never fork it.
2. **The design doctrine doc** (`design.doctrine`, one page, bootstrapped by `/spec:init`
   § Design foundation) — taste rulings tokens can't encode (dialog-vs-page habits,
   empty-state tone, density philosophy). Binding like a locked Decision; `/spec:design`
   reads it at preflight and promotes generalizable rulings into it at reconcile.
   `/spec:plan` respects it when speccing UI sections.
3. **The living showcase catalog entry** (path named in the doctrine) — composes real
   surfaces from every landed spec; each design run extends it. Drift is visible to the
   user's eyes with zero tooling.

A note that contradicts the doctrine is a fork, not a tweak: the user rules **local
exception** (spec Decisions) or **doctrine change** (doc updated, older surfaces recorded as
a known gap) — never a silent override.

**Legacy keys:** host configs may still say `storybook: true` + `storybookCommand`, and older
specs may carry the `storybook:` frontmatter flag. Read these as
`design: {tool: "storybook", command: <storybookCommand>, storyFormat: "CSF3 stories"}` and
`design: true` respectively — same semantics, no behavioral difference.

## Model Placement

> ⚠️ **Fable→Opus auto-fallback (Fable suspended 2026-06).**
> Fable access is paused ([Mythos access change](https://www.anthropic.com/news/fable-mythos-access)).
> Wherever this doctrine assigns **Fable** as an `Agent {model: …}`, **try `"fable"` first; if
> it returns unavailable/suspended, fall back to `"opus"`** and continue. The literal strings
> stay `"fable"`, so this self-heals — when Fable is restored it is used again with **no edit**.
> Session-intent commands (`/spec:plan`, `/spec:design`, `/spec:init`) can't auto-fallback a
> model *you* pick at launch: while Fable is suspended, run those sessions on **Opus**. Remove
> this callout once Fable is reliably back.

**Fable judges; Opus conducts; Sonnet works; Haiku looks up.**

| Model | Role |
|---|---|
| Fable | Spec authoring, the `/spec:design` designer session, design forks, build-time surprise consultation (the retainer), T3 checkpoints |
| Opus | Build orchestration, gate triage |
| Sonnet | Implementation, tests, plan refuters, reviewers, finding refuters, design-stage plumbing (foundation files, catalog entries, spec reconcile) |
| Haiku | Lookups, searches, narrow reads |

- Every `Agent` call sets `model:` explicitly. Never inherit.
- **Design-stage exception:** in `/spec:design`, taste IS the work, so the work model is
  Fable — the designer session reads and writes component files itself, in coherence groups
  rather than maximal fan-out. Everywhere else, Sonnet works and orchestrators never hold
  file contents.
- **Reviews are never the planning model.** Cross-model independence beats capability — a
  same-model reviewer shares the blind spots that produced the bugs.
- **Fable retainer pattern:** spawn once on first surprise (`Agent {model: "fable"}`, falling
  back to `"opus"` if Fable is unavailable — see callout, with the spec's Rationale +
  Assumptions), continue via `SendMessage` thereafter — it accumulates this run's context
  across consultations.

## Escalation Contract (build)

Mechanical triggers — consult the retainer, don't grind:

1. Worker returns `blocked` (stale assumption or unlocked design fork)
2. Deterministic gate failed twice on the same batch
3. A failure implicates a file outside the spec's File Plan
4. A needed change contradicts the approved design (`designed:` set) or a locked Decision
5. Any host-declared trigger (pipeline rules § Build — e.g. migration head conflicts)

Response path: retainer consult → if a genuine fork or scope change remains → `AskUserQuestion`
→ ruling written into the spec's **Decisions** table → workflow resumed (`resumeFromRunId` +
`resolutions[batchId]` cache salt). Completed work returns from the journal cache.

## Decisions

The spec's Decisions table is authoritative. Workers apply it verbatim, never invent entries,
never override. An unlocked fork is a `blocked` return, not a guess. A dismissed
`AskUserQuestion` STOPS the run — never invent the answer the user declined to give.

## Workflows Encode Shape, Not Judgment

The plugin's `wf-spec-build.js` and `wf-spec-review.js` own ordering, schemas, retry caps, and
kill rules — deterministic control flow. Judgment (what's blocked, what's waived, what
escalates, what a finding means) stays in the main loop. Never add JS branches that decide
design questions, and never prompt-engineer findings into existence (no "empty output = you
missed something" framings — an empty findings list is always a valid outcome).

**No free text in `args`.** A workflow's `args` is a control channel — paths, ids, enums,
booleans, and the host gate command only. Never inline human/spec prose (per-file summaries,
batch notes, orchestrator rulings); its quotes and backslashes corrupt the args JSON against
the harness's version-inconsistent string-vs-object encoding. Prose lives in the spec on disk;
the agent that needs it Reads it there.

## Worker Git Ban

Implementation workers never run git commands — no checkout/stash/restore/reset/clean/add/
commit. The orchestrator owns all git and checkpoint-commits after each green phase. A
repo-wide git op from one parallel worker destroys every sibling's uncommitted edits;
disjoint-file batching does not protect against it.

## Read-Only Surfaces

Hosts declare generated/managed surfaces (and their sanctioned change routes) in pipeline
rules § Worker Rules — e.g. generated API clients, codegen outputs, lockfiles, translation
catalogs. Nobody edits them by hand, worker or orchestrator; changes go through the declared
tool. The pattern sweep and the reviewer both treat hand-edits to them as hard findings.

## MCP Policy

Pre-emptive at **plan/design** time: run the registry/library lookups the host's pipeline
rules § Planning declares (UI registries, Context7 for third-party API shapes) before
specifying surfaces that rely on them. Results are **embedded into the spec** (UI / Contracts
sections) — `/spec:build` workers never query MCPs; they work from the spec and return
`blocked` if an embedded reference proves wrong against the installed version.

## Canonical Docs Loop

`/spec:plan` reads `docs/canonical/{area}.md` during discovery; `/spec:review` applies the
spec's Canonical Delta on `done` (creating the file if needed). Every landed spec makes more
future work T1-shaped — this loop is what shrinks pipeline spend over time. Don't skip the
delta to save a minute.
