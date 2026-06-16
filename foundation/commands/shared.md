---
description: Shared invariants of the foundation genesis pipeline — reference document read by /foundation:architect and /foundation:design, not a command entry point
---

# Foundation Pipeline: Shared Invariants

Two greenfield genesis stages that run **before** the spec pipeline, for a brand-new project:

`/foundation:architect` (stack + structure + scaffold) → `/foundation:design` (UX/visual/voice
canon + design rules) → `/spec:init` (grounds the now-real repo: config, rules, agents; it ends by
invoking `/spec:enforce`, which mechanizes the design rules + the rest of the rule set into
gate-wired enforcement) → normal `/spec:plan` loop.

The foundation pipeline decides **what to build with and how it should look**; the spec pipeline
builds features inside those decisions. v1 is **greenfield-only**: pointed at a non-empty repo,
`/foundation:architect` stops and tells the user to use `/spec:init` directly.

## On-Disk-Only Invariant (the spine)

Every cross-stage handoff is a **file**, never conversation context. A later `/spec:init`
session — or a re-invocation of either command — was never in the panel conversation; it Reads
files only. The artifacts in `foundation/` (and `docs/adr/`):

- **`foundation/brief.md`** — the project description + intake answers, plus three machine-keyed
  sections the workflow agents read: `## Research Angles` (key → focus), `## Panel Roles`
  (key → persona), `## Open Dimensions` (each marked hard-to-reverse or not). The command writes
  this; the workflow's `args` only ever carries the *keys*.
- **`foundation/status.json`** — the state machine (see § State Machine).
- **`foundation/stack-descriptor.json`** — architect's output (template: `templates/`).
- **`foundation/design-rules.json`** — design's output: category-only enforcement rules.
- **`foundation/panel-results-{stage}.json`** — the aggregator's last decision package
  (written by the command from the workflow return value, **before** the AskUserQuestion round).
- **`docs/adr/NNNN-*.md`** — architecture/design decision records (template: `templates/adr.md`).

This mirrors the spec pipeline's hard-won "no free text in args" lesson: `args` is a control
channel (paths/enum-keys/booleans); all prose lives on disk.

## Session ↔ Workflow Loop (how interactivity mixes with the workflow)

`AskUserQuestion` **cannot run inside a workflow**. So the commands do not nest it — they
**interleave**: the command (session) owns every question and every file write; the
`wf-foundation` workflow is a callable subroutine that does the deterministic batch work
(research fan-out → panel) and returns a decision package. One round:

1. Command writes/updates `foundation/brief.md`, derives the research + role + dimension keys.
2. Command invokes `wf-foundation` (`Workflow` tool) with `args` = paths + keys + booleans.
3. Workflow returns the aggregator package; command writes `panel-results-{stage}.json`.
4. Command runs `AskUserQuestion` on the `hard_fork_list` (conflicting positions **verbatim**,
   `recommended_first` first), records rulings + every `minority_position` to disk.
5. If `research_gaps` remain, or the user's choice opens a deeper dimension, the command starts
   a **fresh** `wf-foundation` round researching only the new angles (prior results passed via
   `contextPaths`). No reliance on workflow resume — fresh-call-per-round avoids brief-content
   cache staleness. Repeat until no open hard forks remain.

## The MoA Panel (research-backed; do not "improve" into a debate)

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
"None: all proposers agreed on {dimension}." The foundation state gate and `/spec:doctor` check
the section's **presence** (a grep, not a judgment).

## Hard-to-Reverse Dimensions (always escalate via AskUserQuestion)

A two-proposer disagreement on any of these is a **mandatory** `AskUserQuestion` (verbatim,
recommended first), never synthesized away. Constrained ones (user already chose) skip proposers.

- **architect:** persistence model · rendering strategy · monorepo topology · primary
  language/runtime · auth approach · component library · deployment target.
- **design:** component library · token tier count · accessibility baseline · doctrine
  adjective conflicts (the core taste direction).

## Archetype Registry (the master variable)

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

When the design stage is `none`/`skipped` for an archetype, `/foundation:design` records
`design: skipped` and `/spec:init` writes no `design` block.

## Research-Angle & Role Menus

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

## State Machine

`foundation/status.json` (template in `templates/`). Owned by the commands; the
`foundation-state-gate.sh` hook (UserPromptSubmit) enforces it coarsely at the command boundary.

- `architect`: `pending → decisions-recorded → scaffold-complete`
- `design`: `pending → doctrine-drafted → tokens-landed → rules-locked` (or `skipped`)

`/foundation:design` is blocked until `architect: scaffold-complete`. `/spec:init` is blocked when
the design canon is **partial** (`doctrine-drafted`/`tokens-landed`); it proceeds on `rules-locked`
or `skipped`, and is merely warned when design is still `pending`. **Re-entry verifies the named
artifacts physically exist — never trust the phase enum alone** (a phase can be set while a
side-effect was rolled back).

## Enforcement Handoff to the spec pipeline

The split is **decide vs implement**: `/foundation:design` *decides* and records design rules;
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

## Model Placement

Same doctrine as the spec pipeline (Fable suspended 2026-06 → use Opus where Fable is named):

- **Opus** — the command sessions themselves, the pre-panel classification, the aggregator, and
  the design **doctrine authoring** (taste IS the work — the design-stage exception, Fable→Opus).
- **Sonnet** — research agents and the 3 proposers.
- **Haiku** — narrow lookups only.

Every `Agent`/`agent()` call sets `model:` explicitly; never inherit.

## Rules

- `AskUserQuestion` dismissed → STOP the run; state is safely on disk, re-invoke to continue.
  Never invent the answer the user declined to give.
- Genuine hard-to-reverse forks go to the user — never silently decided.
- The session owns all git; commits happen at the phase boundaries the commands define.
- v1 is greenfield-only — existing-repo genesis is out of scope.
