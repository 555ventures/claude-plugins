---
description: Shared invariants of the spec pipeline — reference document read by the other /spec commands (genesis + per-feature), not a workflow entry point
---

# Spec Pipeline: Shared Invariants

The full lifecycle of a project. An optional **genesis stage** for greenfield repos
(`/spec:genesis-architect` → `/spec:genesis-design`) decides *what to build with and how it should
look* and scaffolds a real repo; then the **per-feature pipeline** builds features inside those
decisions:

`/spec:genesis-architect` (stack + structure + scaffold) → `/spec:genesis-design` (UX/visual/voice
canon) → `/spec:init` (grounds the now-real repo: config, rules, agents; it ends by invoking
`/spec:enforce`) → `/spec:plan` (Fable) → `/spec:design` (optional, UI specs in design-capable
hosts) → `/spec:build` (Opus + `wf-build` workflow) → `/spec:review` (independent gate; on CLEAN
commits the close and merges the build branch back into its originating branch).

This document is read by every `/spec` command. The **§ Genesis** sections below apply only to the
two greenfield genesis commands; the rest apply to the per-feature pipeline. Where they share
doctrine (on-disk handoff, no-free-text args, model placement), one statement covers both. Genesis
is **greenfield-only**: pointed at a non-empty repo, `/spec:genesis-architect` stops and tells the
user to use `/spec:init` directly.

## Genesis: Discovery Interview (the intake posture)

Genesis Phase 1 intake is a **structured discovery interview**, not a form — both genesis stages run
it this way. The AI is the interviewer, the user is the client; questions ship as `AskUserQuestion`
batches (a BABOK *structured-interview / survey* hybrid), so open-conversation techniques don't
translate verbatim — their *intent* is preserved through structure:

- **Funnel shape (broad → narrow).** Vision and the job-to-be-done first, hard constraints and
  detail last — closed/narrowing questions sit at the tail so early framing isn't primed.
- **Lenses, coverage-auditable.** Every batch is tagged to one — **Product** (the job /
  outcome-not-output / success), **User** (audience, needs, locale), **Scope** (non-goals),
  **Architect** (archetype, NFR-style constraints, pre-decided pieces). Tagging makes coverage
  checkable; it does **not** add roles to ask staffing about.
- **Reflect back, twice.** Open with a restatement of the idea for confirm/correct (active
  listening); close with a read-back of the assembled brief for sign-off before any research runs
  (BABOK Requirements Validation). The confirmed restatement seeds the verbatim goal — anti-drift.
- **Probe thin / "Other" answers once.** A live "why?" (laddering / 5-Whys) can't be delivered
  closed, so pre-author the rungs: a thin or escape-hatch answer fires one focused follow-up batch
  of "why does that matter / which specifically" options. One probe round, never a recursion.
- **Escape hatch on every batch.** "Other / not sure" is the one open lane (and the tool's
  free-text channel) — it counters closed-set option bias and is the signal that triggers a probe.
  Phrase every option neutrally; no leading or double-barreled options.
- **Non-goals are recorded, not parked.** A Scope batch presents plausible adjacent features; the
  user marks each In / Later / Won't-this-time. Written exclusions focus the build — unwritten ones
  get assumed in.

**The woven loop (research-backed batches).** The interview is *not* "user provides everything, AI
summarizes." Batches are tagged **cold** (user-contextual — the problem, audience, taste,
non-goals; the session authors these) or **research-backed** (stack, framework, component library,
visual-trend — the option menu is researched **live** from the user's last answer). A
research-backed round:

1. The user's last answer opens one or more dimensions. The command calls **`wf-research`** (the
   light sibling of `wf-panel` — research agents only, **no proposers, no panel**) with `args` =
   paths/keys/booleans (`stage`, `dimensionKeys`, `briefPath`, `contextPaths`, `verifyKeys`). Batch
   every dimension one answer opens into a single parallel call.
2. It returns one **option menu per dimension** — 2–4 current options, ranked recommended-first,
   each with an honest tradeoff, a recency stamp grounded in sources, and an `is_minority` flag
   preserving any contrarian option (MAINTAINED DISSENT, mirrored from the panel).
3. The command writes each menu to `.claude/genesis/interview-research/{dimension}.json` (stamping
   `fetchedAt` itself — the workflow can't), then presents an `AskUserQuestion` built **from the
   menu**: options recommended-first, the tradeoff + "current as of `<fetchedAt>`" in each
   description, neutral phrasing, the escape hatch. The user reacts to an informed menu, never a
   blank field; the pick seeds the next round.

**Model placement in the loop:** **Sonnet** builds the menu (research + option synthesis);
**Haiku** verifies currency *only* on version-bearing dimensions (`verifyKeys` — stacks, libraries,
runtimes — where a stale stamp corrupts the choice), never on taste/UX; **Opus** (the session)
curates which 2–4 options ship, orders them, enforces neutral phrasing, and owns the write. This
holds the pipeline doctrine: Sonnet research, Haiku narrow lookup, Opus session/curation.

**Provenance.** Every shipped option's `sources` + `fetchedAt` live in
`interview-research/{dimension}.json`; the *picked* option's provenance is copied into the brief's
intake answers and flows into the ADR rationale/citations. A research call that returns nothing in
good time falls back to a model-knowledge menu stamped `unverified` — the loop never blocks.

**Discovery↔Panel bridge (no redundancy).** Split by reversibility: `wf-research` *elicits*
(today's options, so the user picks informed); `wf-panel` *adjudicates* the hard-to-reverse forks
(the MoA panel). A dimension settled in the woven loop is written **`constrained`** in
`## Open Dimensions` — the existing `runProposers: false` selective-skip signal — and its
`interview-research/*.json` is passed to the panel via `contextPaths` so research isn't repeated.
The panel may attach a `minority_position` to that dimension's ADR but never reopens it as a
`hard_fork`.

**Discovery is product / user / business / legal only — never organizational.** Team skill,
headcount, ownership, ops staffing are never asked: Claude is always the implementer. "Team skill"
(the real-world #1 stack driver) collapses to a silent default — favor boring, typed, testable
stacks Claude implements reliably — applied as a Phase-2 tiebreaker, not a question.

## Genesis: Session ↔ Workflow Loop (how interactivity mixes with the workflow)

`AskUserQuestion` **cannot run inside a workflow**. So the commands do not nest it — they
**interleave**: the command (session) owns every question and every file write; the `wf-panel`
workflow is a callable subroutine that does the deterministic batch work (research fan-out → panel)
and returns a decision package. One round:

1. Command writes/updates `.claude/genesis/brief.md`, derives the research + role + dimension keys.
2. Command invokes `wf-panel` (`Workflow` tool) with `args` = paths + keys + booleans.
3. Workflow returns the aggregator package; command writes `panel-results-{stage}.json`.
4. Command runs `AskUserQuestion` on the `hard_fork_list` (conflicting positions **verbatim**,
   `recommended_first` first), records rulings + every `minority_position` to disk.
5. If `research_gaps` remain, or the user's choice opens a deeper dimension, the command starts
   a **fresh** `wf-panel` round researching only the new angles (prior results passed via
   `contextPaths`). No reliance on workflow resume — fresh-call-per-round avoids brief-content
   cache staleness. Repeat until no open hard forks remain.

## Genesis: The MoA Panel (research-backed; do not "improve" into a debate)

The panel is a **Mixture-of-Agents**, deliberately *not* a multi-round debate:

- **Research fan-out** — parallel Sonnet agents, one per selected research-angle key, web-enabled.
- **Proposers** — exactly **3 Sonnet** agents, distinct role personas, **parallel, blind to each
  other, ZERO rebuttal rounds**. No Haiku proposers (a quality gap suppresses minority views in
  the aggregator). Cross-agent visibility causes conformity to begin at round 2 — so there is no
  round 2.
- **Aggregator** — one **Opus** agent → `decision_matrix`, `hard_fork_list`, `minority_positions`,
  `original_goal` (verbatim, anti-drift), `research_gaps`.

**Selective triggering.** A pre-panel Opus pass (in the command) classifies each hard-to-reverse
dimension as *constrained* (the user already specified it) or *open*. If **all** are constrained
and there are no hesitation signals, set `runProposers: false` — research still runs, the
aggregator validates the constrained choices and fills defaults, no proposer round. Research is
**not** skippable when open design/UX questions exist (latest practice and audience taste still
need researching even when the stack is fixed).

**MAINTAINED DISSENT.** A correct minority view must never be silently averaged away. Every ADR
and the design doctrine carry a `## Dissents` section that is non-empty or the literal
"None: all proposers agreed on {dimension}." The genesis state gate and `/spec:doctor` check
the section's **presence** (a grep, not a judgment).

## Genesis: Hard-to-Reverse Dimensions (always escalate via AskUserQuestion)

A two-proposer disagreement on any of these is a **mandatory** `AskUserQuestion` (verbatim,
recommended first), never synthesized away. Constrained ones (user already chose) skip proposers.

- **architect:** persistence model · rendering strategy · monorepo topology · primary
  language/runtime · auth approach · component library · deployment target.
- **design:** component library · token tier count · accessibility baseline · doctrine
  adjective conflicts (the core taste direction).

## Genesis: Archetype Registry (the master variable)

The project **archetype** conditions stack candidates, research angles, role personas, language
choice, and **whether/what kind of design stage runs**. Establish it (and the locale/audience
scope) first in architect intake. Locale composes *on top* of archetype (a Japanese mobile app
and a Japanese web app share locale angles, differ in surface). Illustrative — verify candidates
against current ecosystems at research time:

| Archetype | Candidate stacks / languages | Research angles (keys) | Design stage / catalog |
|---|---|---|---|
| `web-app` | Next/Remix/SvelteKit + API, TS | `frameworks` `ui-ux-category` `perf` `seo` | full · `storybook` |
| `mobile-app` | Flutter · RN/Expo · native Swift/Kotlin | `mobile-frameworks` `platform-hig` `app-store` `locale-typography` | full · `widgetbook`/platform |
| `conversational-bot` | Python/Node, LLM orchestration; channel or voice | `bot-frameworks` `conversation-ux` `channel-conventions` `prompt-persona` `safety` | voice/persona guidelines · `none` |
| `backend-api` | Go/Rust/Node/Python by perf needs | `api-frameworks` `api-ergonomics` `contract-design` | skipped (or API-doctrine) |
| `realtime-trading` | low-latency backend (Go/Rust) + data-dense web | `realtime-stack` `realtime-ux` `data-viz` `determinism` | full · `storybook` + density doctrine |
| `cli-devtool` | Go/Rust/Node | `cli-frameworks` `tui-conventions` | TUI doctrine · `none` |
| `data-ml` | Python | `ml-stack` `pipeline-orchestration` | skipped |
| `desktop-app` | Tauri/Electron/native | `desktop-frameworks` `desktop-hig` | full · `storybook`/platform |

When the design stage is `none`/`skipped` for an archetype, `/spec:genesis-design` records
`design: skipped` and `/spec:init` writes no `design` block.

## Genesis: Research-Angle & Role Menus

Research-angle and panel-role definitions live in the **brief** (the command expands the selected
keys into focus paragraphs there). `args` carries only the keys. Cross-cutting angles available to
any archetype: `scope-discipline` (what to include vs deliberately exclude), `competitive-teardown`,
`accessibility`, and the locale bundle (`i18n-rtl`, `locale-formatting`, `cultural-color`,
`locale-norms`) — switched on by the audience scope, not the archetype.

Role-persona menus (the command picks 3 per stage, archetype-relevant):
- **architect:** Backend-systems · Frontend-UI · Infra-DevOps · Cost/Pragmatism-skeptic ·
  Security · Mobile-first · Data-intensive.
- **design:** UX-researcher · Visual-brand · Accessibility-advocate · FE-implementation-pragmatist ·
  Target-audience-persona.

## Genesis: Enforcement Handoff to the spec pipeline

The split is **decide vs implement**: `/spec:genesis-design` *decides* and records design rules;
the spec pipeline *implements* them as actual lint/contracts/sweeps wired to the gate. One
enforcement brain, and it lives downstream — `/spec:enforce` (which `/spec:init` invokes at the
end of bootstrap). The contract:

- `design-rules.json` rules carry a `targetCategory` **enum only** — `color | i18n | structure |
  a11y | density` — **never a tool name.** `/spec:enforce` folds these into its language-neutral
  enforcement taxonomy and owns the single category→enforcer selection per detected stack, chosen
  at runtime (discover-against-live-sources then verify-it-runs), never from a hardcoded mapping.
  Where no mechanical enforcer fits the stack, the category becomes a Review-Check prose rule —
  never silently dropped. Category-only tagging is what keeps the handoff robust to a stack swap:
  an engine pre-tagged here would break the moment the stack changed.
- `/spec:doctor` warns when a design-rules category has **no enforcer** on the current stack (the
  early-detection benefit), and recommends `/spec:enforce` — without any plugin file naming a tool.

## Host Grounding

The pipeline is process; the repo supplies grounding. Two host files, both created by
`/spec:init` (run it once per repo before first use):

- **`.claude/spec.config.json`** — machine-readable knobs: `gateCommand`, `testCommand`,
  `setupCommand`, `patternsScript`, optional `driftScript`, optional `design` block
  (component-catalog stage — see § Design Stage), `layerGroups`, `agentMap` (+ optional
  `routing` hints), `pipelineRules`, the optional `enforcementManifest`/`rulesEnforcementHash`
  enforcement stamps (§ Rule Enforcement), plus the `contractHash`/`generatedBy` drift stamps
  (§ Grounding Drift).
- **The pipeline rules file** (path in `pipelineRules`, conventionally
  `.claude/rules/spec-pipeline.md`) — prose grounding by section: `Risk Tiers`, `Planning`,
  `Build`, `Worker Rules`, `Test Rules`, `Review Checks`.

Every command reads both at start. Repo differences live there — never as forks inside the
plugin's files. If either is missing, STOP and tell the user to run `/spec:init`.

`/spec:init` bootstraps these two files; `/spec:enforce` adds the deterministic rule-enforcement
layer (§ Rule Enforcement); `/spec:doctor` is the read-only drift check over both. The feature
pipeline (plan → design → build → review) runs on top of them.

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

`/spec:doctor` diagnoses and recommends — targeted user-approved patches, a full `/spec:init`
refresh when drift is structural, or a `/spec:enforce` re-run when the enforcement layer drifted.
Regeneration of the grounding layer belongs to `/spec:init`; regeneration of enforcement belongs
to `/spec:enforce`; the doctor never rewrites either wholesale.

## Rule Enforcement

A host's rules are enforced **deterministically**, in its `gateCommand` — not by an LLM at
runtime. The principle is stable and does not rot: *consistency requires determinism.* For any
rule a linter, arch-tool, or text/structural matcher CAN check, a runtime LLM check is a strict
downgrade — non-reproducible, brittle, false-confidence coverage. The only sanctioned runtime LLM
rule-check is `/spec:plan` reading a draft spec (prose has no CI, so reading is the only check).
The plugin neither depends on nor replicates a host's `/comply`.

`/spec:enforce` owns this. It classifies the host's rules into a **stable, language-neutral
category taxonomy** — `module-boundary | naming | forbidden-symbol | structural-pattern | datetime
| schema-validation | format` — and mechanizes each. **No plugin file ever names a specific
linter/formatter/arch-tool/hook-runner**: a named tool anchors the executing agent and goes stale
faster than the rules. Tool selection is **two-stage and runtime**: DISCOVER against live sources
with citations (never training memory), then VERIFY the tool installs and runs against THIS repo
before adopting it. Fallbacks, in order: the host's pattern-sweep harness (`patternsScript`) for
structural/textual clauses; a pipeline rules § Review Checks prose rule ONLY for genuine-judgment
clauses — never a silent drop.

The **judgment residue** is the small set that resists a deterministic check and stays with the
reviewer, layered OVER (never duplicating) the mechanical coverage: data-flow ordering, semantic
intent of parameters, naming tense, sentinel usage in control flow, cross-file N+1/batch reasoning,
"is this a sanctioned carve-out," and pure-process rules (review neutrality, model-routing) that
are not about source code at all. `/spec:enforce` records its choices + provenance in
`.claude/rules/enforcement.json` and stamps `rulesEnforcementHash`; `/spec:doctor` recomputes it.

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

### Genesis state machine

`.claude/genesis/status.json` (template via `spec-paths templates`). Owned by the genesis
commands; the `genesis-state-gate.sh` hook (UserPromptSubmit) enforces it coarsely at the command
boundary.

- `architect`: `pending → decisions-recorded → scaffold-complete`
- `design`: `pending → doctrine-drafted → tokens-landed → rules-locked` (or `skipped`)

`/spec:genesis-design` is blocked until `architect: scaffold-complete`. `/spec:init` is blocked
when the design canon is **partial** (`doctrine-drafted`/`tokens-landed`); it proceeds on
`rules-locked` or `skipped`, and is merely warned when design is still `pending`. **Re-entry
verifies the named artifacts physically exist — never trust the phase enum alone** (a phase can be
set while a side-effect was rolled back).

### Spec state machine

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
   § Design foundation — or, for greenfield repos seeded by the genesis stage, authored
   by `/spec:genesis-design` and merely extracted by `/spec:init`; the design rules it records
   in `.claude/genesis/design-rules.json` become gate-wired enforcement via `/spec:enforce`) —
   taste rulings tokens can't encode (dialog-vs-page habits, empty-state tone, density philosophy).
   Binding like a locked Decision; `/spec:design` reads it at preflight and promotes
   generalizable rulings into it at reconcile. `/spec:plan` respects it when speccing UI sections.
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
> Session-intent commands (`/spec:plan`, `/spec:design`, `/spec:init`, `/spec:genesis-*`) can't
> auto-fallback a model *you* pick at launch: while Fable is suspended, run those sessions on
> **Opus**. Remove this callout once Fable is reliably back.

**Fable judges; Opus conducts; Sonnet works; Haiku looks up.**

| Model | Role |
|---|---|
| Fable | Spec authoring, the `/spec:design` designer session, design forks, build-time surprise consultation (the retainer), T3 checkpoints |
| Opus | Build orchestration, gate triage, the genesis command sessions, the genesis pre-panel classification + aggregator + design-doctrine authoring |
| Sonnet | Implementation, tests, plan refuters, reviewers, finding refuters, design-stage plumbing (foundation files, catalog entries, spec reconcile), genesis research agents + the 3 panel proposers |
| Haiku | Lookups, searches, narrow reads, genesis currency checks |

- Every `Agent` call sets `model:` explicitly. Never inherit.
- **Design-stage exception:** in `/spec:design`, taste IS the work, so the work model is
  Fable — the designer session reads and writes component files itself, in coherence groups
  rather than maximal fan-out. The same exception covers `/spec:genesis-design`'s **doctrine
  authoring** (Fable→Opus while suspended): taste is the work there too, so the Opus session
  authors the doctrine directly rather than delegating to Sonnet. Everywhere else, Sonnet works
  and orchestrators never hold file contents.
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
`AskUserQuestion` STOPS the run — never invent the answer the user declined to give. (This holds
for genesis too: a dismissed genesis question STOPS the run; state is safely on disk, re-invoke
to continue. Genuine hard-to-reverse forks always go to the user — never silently decided.)

## Workflows Encode Shape, Not Judgment

The plugin's `wf-build.js` and `wf-review.js` (and the genesis `wf-panel.js` / `wf-research.js`)
own ordering, schemas, retry caps, and kill rules — deterministic control flow. Judgment (what's
blocked, what's waived, what escalates, what a finding means) stays in the main loop. Never add JS
branches that decide design questions, and never prompt-engineer findings into existence (no "empty
output = you missed something" framings — an empty findings list is always a valid outcome).

**No free text in `args`.** A workflow's `args` is a control channel — paths, ids, enums,
booleans, and the host gate command only. Never inline human/spec prose (per-file summaries,
batch notes, orchestrator rulings); its quotes and backslashes corrupt the args JSON against
the harness's version-inconsistent string-vs-object encoding. Prose lives on disk; the agent that
needs it Reads it there.

**On-disk handoff (the spine).** Every cross-stage handoff is a **file**, never conversation
context. A later session — a per-feature `/spec:build` resume, a `/spec:init` run, or a
re-invocation of a genesis command — was never in the originating conversation; it Reads files
only. For the per-feature pipeline that file is the **spec** (Decisions, File Plan, Contracts). For
genesis the artifacts live in `.claude/genesis/` (machine/transient) and `docs/adr/` (durable):

- **`.claude/genesis/brief.md`** — the project description + intake answers, plus three
  machine-keyed sections the workflow agents read: `## Research Angles` (key → focus),
  `## Panel Roles` (key → persona), `## Open Dimensions` (each marked hard-to-reverse or not). The
  command writes this; the workflow's `args` only ever carries the *keys*.
- **`.claude/genesis/status.json`** — the genesis state machine (§ State Machine).
- **`.claude/genesis/stack-descriptor.json`** — architect's output (template via `spec-paths templates`).
- **`.claude/genesis/design-rules.json`** — design's output: category-only enforcement rules.
- **`.claude/genesis/panel-results-{stage}.json`** — the aggregator's last decision package
  (written by the command from the workflow return value, **before** the AskUserQuestion round).
- **`.claude/genesis/interview-research/{dimension}.json`** — the woven-loop option menus.
- **`docs/adr/NNNN-*.md`** — architecture/design decision records (template via `spec-paths templates`).

## Worker Git Ban

Implementation workers never run git commands — no checkout/stash/restore/reset/clean/add/
commit. The orchestrator owns all git and checkpoint-commits after each green phase. A
repo-wide git op from one parallel worker destroys every sibling's uncommitted edits;
disjoint-file batching does not protect against it. (In genesis the session likewise owns all
git; commits happen at the phase boundaries the genesis commands define.)

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
