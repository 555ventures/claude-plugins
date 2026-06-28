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

**Setup:** run `spec-paths shared` and Read that file, then run `spec-paths shared-genesis` and
Read that too (the genesis-stage supplement — discovery interview, panel doctrine, enforcement
handoff). Also run `spec-paths wf-panel` and
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

Same discovery posture as architect (genesis.md § Genesis: Discovery Interview), narrowed to design:
reflect back the design intent first, then batch broad → narrow, every batch lens-tagged and
escape-hatched, each marked **cold** or **research-backed**.

1. **[Brand lens] — research-backed.** taste / voice direction — run the **research-woven loop**
   (genesis.md § Genesis: Discovery Interview) on the visual-trend dimension: `wf-research` with
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

1. **Doctrine** — a **one-page** `docs/design/doctrine.md` carrying **taste-only** rulings: the
   *postures, habits, and judgments* that genuinely resist encoding — density philosophy,
   dialog-vs-page habits, empty-state tone, surface "feels-grown-from" rules, the load-bearing
   one-rule-above-all — plus the audience-specific *posture* (e.g. JP line-breaking habit, cultural
   color semantics) and a `## Dissents` section (required). **Doctrine never carries values.** Any
   sentence that names a size, step, ratio, weight, tracking, duration, or specific color is
   describing an **encodable** dimension and MUST be materialized as a token (Phase 4.2) + an
   enforcement rule (Phase 4.4) — doctrine may narrate the *why*, never be the value's only home. A
   value living only in prose is the defect this command guards against. (Corollary: "hierarchy from
   weight and space, not size jumps" is a *posture* — the size roles still ship; weight-led hierarchy
   is expressed *through* a restrained size/weight pairing, not by omitting the scale.) For non-visual
   archetypes this is voice/persona or TUI doctrine instead. **Tag every ruling's grounding** (shared
   § Grounded vs taste): `grounded` (externally-anchored — contrast/a11y, legal/brand,
   destructive-action safety; binds even against an explicit mockup) or `taste` (aesthetic preference;
   yields to an explicit mockup). The tag is **authored here, not judged later** — it is what lets a
   mockup-driven `/spec:design` honor the mock without a doctrine-over-weighting reader silently
   overriding it. Default a ruling to `taste` unless it names an external anchor.
2. **Tokens — materialize every encodable dimension (visual archetypes only).** First walk the
   **dimension ledger** and record each row DECIDED (with token roles) or DEFERRED-with-reason (the
   reason recorded in doctrine `## Dissents`). Baseline ledger for a visual web archetype:
   - **color roles** — semantic consumer roles (not just palette primitives) + validated contrast pairs
   - **type scale** — named font-size roles, each pairing size + weight + tracking + line-height
     (e.g. `display/heading/body/label/eyebrow`); a restrained scale is still a scale, never an omission
   - **spacing rhythm** — the named spacing-scale steps
   - **radii / elevation**
   - **focus ring** + **min target size**
   - **motion** — duration/easing roles (only if a motion system is in v1 scope)

   Write W3C-format token files covering every DECIDED row. **Also author the framework-native
   consumption surface** — the file components actually read (named in `tokensConsumed`; e.g. a
   Tailwind `@theme` block, a CSS `:root`, a JS theme object). Every DECIDED token family MUST be
   reachable there as a **named role a component can use without a literal** (`text-body`, not
   `text-[0.97rem]`). If the consumed form is build-generated from the W3C source, document and
   verify the build step. A family present in `tokens.json` but absent from the consumed surface is
   an undelivered token — its enforcement rule will have nothing to bind to. Name the token +
   consumed + doctrine paths so `/spec:init` and `/spec:design` can find them. Set
   `status.design: tokens-landed`.
3. **Base primitives — seed the standard overlay set (visual archetypes only).** Scaffold a bounded
   standard set of overlay shells — **Sheet, Dialog, Popover, Drawer** — plus a **barrel** (`index.*`)
   into the project's **base dir** (e.g. `src/components/base/`). Each carries the backdrop +
   focus-trap + dismiss + portal contract authored to the doctrine and consuming token roles by name —
   no feature content. **Name the base dir, its barrel, and the import-only rule in the doctrine doc**
   (the same way token/consumed paths are named). This is the no-mockup analog of the mockup path's
   `containment`-driven extraction: base primitives are system foundation (the structural analog of
   tokens), seeded **once** here so the first overlay-bearing `/spec:design` **imports** rather than
   re-implements. The `base-primitive-containment` rule (Phase 4.4, from the template, category
   `structure`) makes import-only a build error. Headless/non-visual archetypes skip this item.
4. **Design rules** — write `.claude/genesis/design-rules.json` (template via `spec-paths templates`):
   each rule carries a `targetCategory` **enum only** (the design category set defined in
   genesis.md § Genesis: Enforcement Handoff), `appliesTo`/`exemptGlobs`, `severity`, `rationale`,
   and `grounding` (`grounded` | `taste`, per shared § Grounded vs taste — mechanizable closure rules
   like `no-raw-color` are `grounded`) — **never a tool name** (same section). `/spec:enforce` owns the category→enforcer selection, chosen
   at runtime per stack. **Closure check (binding):** every DECIDED token family from Phase 4.2 gets
   its matching "consume the role by name — no off-token literal" rule — `color → no-raw-color`
   (`color`), `type scale → no-off-scale-text` (`typography`), spacing → off-scale-spacing, etc. A
   DECIDED family with no consume-by-name rule is an authoring error: encodable ⇒ token **and**
   category, always.
5. Commit. Set `status.design: rules-locked`.

## Phase 5 — Report & hand off

Report: design direction chosen, dissents recorded, doctrine + token + consumed-surface paths, the
**dimension ledger** (DECIDED vs DEFERRED-with-reason, and the token-family↔rule pairing for each
DECIDED row), design-rules count by category, `designCatalog` for `/spec:init`'s `design` block (or
`none`). **Next:** `/spec:init` —
it grounds the repo and ends by invoking `/spec:enforce`, which generates the enforcement
machinery from `design-rules.json` (plus the rest of the rule set).

## Rules

- **Never Read `wf-panel.js` or `wf-research.js`.** The `args` are `stage: "design"` variants of
  the contracts documented in `/spec:genesis-architect` (Phase 3 `wf-research`, Phase 4
  `wf-panel`) — this command reuses them ("Same loop as architect"). Invoke each by `scriptPath`
  and act on its return; their sources are never orchestrator context.
- One canon: this supersedes `/spec:init`'s greenfield design sketch; init reads this, never
  re-prompts adopt/craft when `design: rules-locked`.
- Design rules are category-only; tool selection is `/spec:enforce`'s job (runtime, per stack).
- **Encodable dimensions are closed:** every dimension that names values produces a token family
  AND a consume-by-name rule; doctrine carries posture, never values. A value in doctrine with no
  backing token is the defect this command guards against.
- Doctrine stays one page — promote generalizable taste, keep one-offs in the spec layer later.
- `AskUserQuestion` dismissed → STOP. Hard-to-reverse forks always go to the user.
- Explicit `model:` everywhere (Opus session/aggregator/doctrine, Sonnet research/proposers).
