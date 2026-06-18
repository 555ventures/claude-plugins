---
description: Greenfield design genesis — research+panel-driven UX/visual/voice canon for the project's archetype and audience, authored as the design doctrine + tokens + category-only enforcement rules that /spec:enforce later mechanizes
argument-hint: <project idea — same as architect>
---

# Genesis Design: Author the Design Canon

The second greenfield stage. Given the scaffolded project's archetype and audience, runs a
research-backed MoA panel over the design direction, then **authors the design canon** — the
one-page doctrine, the theme tokens, and `design-rules.json` (category-only enforcement intent
that `/spec:enforce` turns into actual lint/contracts). This IS the relocated, heavier greenfield branch
of `/spec:init`'s design foundation — **one canon, not two**. Same interactive shape as architect:
the session owns `AskUserQuestion` and writes; `wf-panel` does research + panel.

**Intended model: Opus** (taste IS the work — the design-stage exception; Fable→Opus while
suspended).

**Setup:** run `spec-paths shared` and Read that file. Also run `spec-paths wf-panel` and
`spec-paths wf-research` once and keep the printed absolute paths — they are the `scriptPath` for
the `Workflow` calls below. The state gate blocks this command until `architect: scaffold-complete`;
also verify `.claude/genesis/stack-descriptor.json` exists.

## Input

`$ARGUMENTS` — the same project idea. The archetype, audience, and stack come from
`stack-descriptor.json`, not re-asked.

## Phase 0 — Re-entry & archetype check

1. Read `.claude/genesis/status.json` and `stack-descriptor.json`. Verify artifacts physically
   exist; resume from the last verified design phase.
2. **Design-applicability gate:** if the archetype's design stage is `none` (e.g. `backend-api`,
   `data-ml`), confirm with the user, set `status.design: skipped`, and STOP — `/spec:init` will
   write no `design` block. For `conversational-bot`/`cli-devtool` the canon is *voice/persona* or
   *TUI* guidelines (no visual token files); adapt Phase 4 accordingly.

## Phase 1 — Discovery interview (interactive)

Same discovery posture as architect (shared § Genesis: Discovery Interview), narrowed to design:
reflect back the design intent first, then batch broad → narrow, every batch lens-tagged and
escape-hatched, each marked **cold** or **research-backed**.

1. **[Brand lens] — research-backed.** taste / voice direction — run the **research-woven loop**
   (shared § Genesis: Discovery Interview) on the visual-trend dimension: `wf-research` with
   `{stage: "design", dimensionKeys: ["visual-trend", ...], briefPath, contextPaths:
   [".claude/genesis/stack-descriptor.json", <prior interview-research/*.json>], verifyKeys: []}`
   (taste is not version-bearing → no Haiku pass). Present the current aesthetic/voice directions for
   this archetype + audience as the options, recommended-first, recency-stamped; the user picks the
   feeling, references in vs. out.
2. **[User lens] — cold.** a **research-assumption** check — "has real user research been done?" If
   no, the doctrine records a *hypothesized* user model with explicit TODO stubs (no research gate
   for solo/MVP).
3. **[Scope lens] — cold.** design non-goals — surfaces or states deliberately out of scope for v1.

Probe a thin taste answer with one pre-laddered follow-up (which reference / which feeling). Write
each menu to `.claude/genesis/interview-research/{dimension}.json` (stamp `fetchedAt`) and record
the pick + `sources` to the brief. Read back the design intent for sign-off, then finalize the brief.

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

1. Invoke `wf-panel` (`Workflow {scriptPath: <spec-paths wf-panel output>}`); write
   `.claude/genesis/panel-results-design.json`.
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
3. **Design rules** — write `.claude/genesis/design-rules.json` (template via `spec-paths templates`):
   each rule carries a `targetCategory` **enum only** (`color | i18n | structure | a11y | density`),
   `appliesTo`/`exemptGlobs`, `severity`, `rationale` — **never a tool name** (shared § Genesis:
   Enforcement Handoff). `/spec:enforce` owns the category→enforcer selection, chosen at runtime per
   stack.
4. Commit. Set `status.design: rules-locked`.

## Phase 5 — Report & hand off

Report: design direction chosen, dissents recorded, doctrine + token paths, design-rules count by
category, `designCatalog` for `/spec:init`'s `design` block (or `none`). **Next:** `/spec:init` —
it grounds the repo and ends by invoking `/spec:enforce`, which generates the enforcement
machinery from `design-rules.json` (plus the rest of the rule set).

## Rules

- One canon: this supersedes `/spec:init`'s greenfield design sketch; init reads this, never
  re-prompts adopt/craft when `design: rules-locked`.
- Design rules are category-only; tool selection is `/spec:enforce`'s job (runtime, per stack).
- Doctrine stays one page — promote generalizable taste, keep one-offs in the spec layer later.
- `AskUserQuestion` dismissed → STOP. Hard-to-reverse forks always go to the user.
- Explicit `model:` everywhere (Opus session/aggregator/doctrine, Sonnet research/proposers).
