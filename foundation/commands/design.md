---
description: Greenfield design genesis — research+panel-driven UX/visual/voice canon for the project's archetype and audience, authored as the design doctrine + tokens + category-only enforcement rules that /spec:init implements
argument-hint: <project idea — same as architect>
---

# Foundation Design: Author the Design Canon

The second greenfield stage. Given the scaffolded project's archetype and audience, runs a
research-backed MoA panel over the design direction, then **authors the design canon** — the
one-page doctrine, the theme tokens, and `design-rules.json` (category-only enforcement intent
that `/spec:init` turns into actual lint/hooks). This IS the relocated, heavier greenfield branch
of `/spec:init`'s design foundation — **one canon, not two**. Same interactive shape as architect:
the session owns `AskUserQuestion` and writes; `wf-foundation` does research + panel.

**Intended model: Opus** (taste IS the work — the design-stage exception; Fable→Opus while
suspended).

**Setup:** Read this plugin's `commands/shared.md`. The state gate blocks this command until
`architect: scaffold-complete`; also verify `foundation/stack-descriptor.json` exists.

## Input

`$ARGUMENTS` — the same project idea. The archetype, audience, and stack come from
`stack-descriptor.json`, not re-asked.

## Phase 0 — Re-entry & archetype check

1. Read `foundation/status.json` and `stack-descriptor.json`. Verify artifacts physically exist;
   resume from the last verified design phase.
2. **Design-applicability gate:** if the archetype's design stage is `none` (e.g. `backend-api`,
   `data-ml`), confirm with the user, set `status.design: skipped`, and STOP — `/spec:init` will
   write no `design` block. For `conversational-bot`/`cli-devtool` the canon is *voice/persona* or
   *TUI* guidelines (no visual token files); adapt Phase 4 accordingly.

## Phase 1 — Intake (interactive)

`AskUserQuestion`, batched: design-specific goals, brand/taste direction, and a **research
assumption** check — "has real user research been done?" If no, the doctrine records a
*hypothesized* user model with explicit TODO stubs (no research gate for solo/MVP). Append to
`foundation/brief.md`.

## Phase 2 — Derive the research plan (Opus pass)

Select UX research-angle keys from the archetype + audience (e.g. `ui-ux-category`,
`competitive-teardown`, `accessibility`, and the locale bundle — `cultural-color`,
`locale-typography`, `locale-formatting` — for non-global audiences). Pick **3 design role keys**
(UX-researcher / Visual-brand / Accessibility-advocate / FE-implementation-pragmatist /
Target-audience-persona). List the design hard-to-reverse dimensions (component library, token
tier count, accessibility baseline, doctrine adjectives) under `## Open Dimensions`, marked
constrained/open. Selective: `runProposers: false` only if all are constrained.

## Phase 3 — Research + panel loop (session ↔ workflow)

Same loop as architect Phase 3, `stage: "design"`, passing the stack-descriptor in `contextPaths`
so proposers stay within the chosen framework/component library:

1. Invoke `wf-foundation`; write `foundation/panel-results-design.json`.
2. `AskUserQuestion` on `hard_fork_list` (verbatim, recommended first); record rulings + every
   `minority_position`. Dismissed → STOP.
3. Fresh round on remaining `research_gaps` / newly-opened dimensions.

## Phase 4 — Author the canon (Opus)

Author directly (taste exception — not delegated to Sonnet):

1. **Doctrine** — a **one-page** `docs/design/doctrine.md`: the taste rulings tokens can't encode
   (type scale, spacing rhythm, color roles, density philosophy, dialog-vs-page habits, empty-state
   tone), the audience-specific calls (e.g. JP typography/line-breaking, cultural color semantics),
   and a `## Dissents` section (required). For non-visual archetypes this is voice/persona or TUI
   doctrine instead.
2. **Tokens** — W3C-format theme token files (visual archetypes only): include accessibility-as-
   tokens (validated contrast pairs, a focus-ring token, min target size). Name the token + doctrine
   paths so `/spec:init` and `/spec:design` can find them. Set `status.design: tokens-landed`.
3. **Design rules** — write `foundation/design-rules.json` (template in `templates/`): each rule
   carries a `targetCategory` **enum only** (`color | i18n | structure | a11y | density`),
   `appliesTo`/`exemptGlobs`, `severity`, `rationale` — **never a tool name** (shared § Enforcement
   Handoff). `/spec:init` owns the category→tool mapping.
4. Commit. Set `status.design: rules-locked`.

## Phase 5 — Report & hand off

Report: design direction chosen, dissents recorded, doctrine + token paths, design-rules count by
category, `designCatalog` for `/spec:init`'s `design` block (or `none`). **Next:** `/spec:init` —
it grounds the repo and generates the enforcement machinery from `design-rules.json`.

## Rules

- One canon: this supersedes `/spec:init`'s greenfield design sketch; init reads this, never
  re-prompts adopt/craft when `design: rules-locked`.
- Design rules are category-only; tool selection is `/spec:init`'s job.
- Doctrine stays one page — promote generalizable taste, keep one-offs in the spec layer later.
- `AskUserQuestion` dismissed → STOP. Hard-to-reverse forks always go to the user.
- Explicit `model:` everywhere (Opus session/aggregator/doctrine, Sonnet research/proposers).
