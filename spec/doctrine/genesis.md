---
description: Genesis-stage supplement to the spec pipeline's shared invariants — read by the two greenfield genesis commands, not a workflow entry point
---

# Spec Pipeline: Genesis-Stage Supplement

Genesis-stage supplement — read by `/spec:genesis-architect` and `/spec:genesis-design` in
addition to `shared.md`.

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

- `design-rules.json` rules carry a `targetCategory` **enum only** — `color | typography | i18n |
  structure | a11y | density` — **never a tool name** — plus a `grounding` (`grounded` | `taste`, shared
  § Grounded vs taste; mechanizable closure rules are `grounded`), which records whether the rule binds
  against an explicit mockup or yields to it. `/spec:enforce` folds these into its language-neutral
  enforcement taxonomy and owns the single category→enforcer selection per detected stack, chosen
  at runtime (discover-against-live-sources then verify-it-runs), never from a hardcoded mapping.
  Where no mechanical enforcer fits the stack, the category becomes a Review-Check prose rule —
  never silently dropped. Category-only tagging is what keeps the handoff robust to a stack swap:
  an engine pre-tagged here would break the moment the stack changed.
- `/spec:doctor` warns when a design-rules category has **no enforcer** on the current stack (the
  early-detection benefit), and recommends `/spec:enforce` — without any plugin file naming a tool.

## Genesis: State Machine

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

## Genesis: On-disk Handoff (the genesis artifacts)

Genesis follows the same on-disk-handoff spine as the per-feature pipeline (shared § Workflows
Encode Shape): every cross-stage handoff is a **file**, never conversation context — a
re-invocation of a genesis command was never in the originating conversation; it Reads files only.
The genesis artifacts live in `.claude/genesis/` (machine/transient) and `docs/adr/` (durable):

- **`.claude/genesis/brief.md`** — the project description + intake answers, plus three
  machine-keyed sections the workflow agents read: `## Research Angles` (key → focus),
  `## Panel Roles` (key → persona), `## Open Dimensions` (each marked hard-to-reverse or not). The
  command writes this; the workflow's `args` only ever carries the *keys*.
- **`.claude/genesis/status.json`** — the genesis state machine (§ Genesis: State Machine).
- **`.claude/genesis/stack-descriptor.json`** — architect's output (template via `spec-paths templates`).
- **`.claude/genesis/design-rules.json`** — design's output: category-only enforcement rules.
- **`.claude/genesis/panel-results-{stage}.json`** — the aggregator's last decision package
  (written by the command from the workflow return value, **before** the AskUserQuestion round).
- **`.claude/genesis/interview-research/{dimension}.json`** — the woven-loop option menus.
- **`docs/adr/NNNN-*.md`** — architecture/design decision records (template via `spec-paths templates`).

## Genesis: Dismissed Questions

The shared Decisions rule (`shared.md` § Decisions) holds for genesis too: a dismissed genesis
`AskUserQuestion` STOPS the run — never invent the declined answer; state is safely on disk,
re-invoke to continue. Genuine hard-to-reverse forks always go to the user, never silently decided.
</content>
</invoke>
