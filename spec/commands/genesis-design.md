---
description: Greenfield design genesis — research-driven UX/visual/voice canon for the project's archetype and audience, authored as the design doctrine + tokens + category-only enforcement rules that /spec:enforce later mechanizes
argument-hint: <project idea — same as architect>
---

# Genesis Design: Ratify the Pick, Author the Canon

The third greenfield stage. **Ratification mode (the v6 main path):** when `/spec:genesis-explore`
has recorded a pick (`.claude/genesis/design-pick.json`), the direction is already chosen and
judged on rendered candidates — this command **ratifies the winner's `tokens.css` verbatim as
canon** (no extraction, no re-authoring of values) and authors only what a mock cannot carry:
the one-page doctrine, the scheme mirror, the framework-native consumption surface, base
primitives, and `design-rules.json` (category-only enforcement intent that `/spec:enforce` turns
into actual lint/contracts). **Legacy mode:** with no pick on disk (a pre-explore genesis, or a
legacy `status.json` without the `explore` field), it runs the original direction interview +
decision record below. Either way — **one canon, not two**. Same interactive shape as architect:
the session owns `AskUserQuestion` and writes, and is itself the proposer over the research
fan-out.

**Intended model: Opus** (taste IS the work — the design-stage exception; shared invariants
§ Model Placement, which keeps genesis design-doctrine authoring an Opus seat).

**Setup:** run `spec-paths shared-for genesis-design` and read its output (the shared
invariants scoped to this command), then run `spec-paths shared-genesis` and
Read that too (the genesis-stage supplement — discovery interview, decision-record doctrine,
enforcement handoff). Also run
`spec-paths wf-research` once and keep the printed absolute path — it is the `scriptPath` for
the `Workflow` calls below. The state gate blocks this command until `architect: scaffold-complete`
AND `explore: picked`/`skipped` (legacy status files without an `explore` field pass with a
warning); also verify `.claude/genesis/stack-descriptor.json` exists.

## Input

`$ARGUMENTS` — the same project idea. The archetype, audience, and stack come from
`stack-descriptor.json`, not re-asked.

## Phase 0 — Re-entry, archetype check & mode resolution

1. Read `.claude/genesis/status.json` and `stack-descriptor.json`. Verify artifacts physically
   exist; resume from the last verified design phase.
2. **Design-applicability gate:** if the archetype's design stage is `none` (e.g. `backend-api`,
   `data-ml`), confirm with the user, set `status.design: skipped`, and STOP — `/spec:init` will
   write no `design` block. For `conversational-bot`/`cli-devtool` the canon is *voice/persona* or
   *TUI* guidelines (no visual token files); adapt Phase 4 accordingly.
3. **Mode resolution:** if `.claude/genesis/design-pick.json` exists AND the winner's candidate
   dir + `tokens.css` physically exist → **ratification mode**: skip Phases 1–3 entirely (the
   direction was researched, rendered, walked through, and picked in `/spec:genesis-explore`;
   re-interviewing it would re-litigate a made decision) and run Phase 4 in its ratification
   variant. Read the pick, the winner's files, and `docs/design/research-brief.md` first.
   Otherwise → **legacy mode**: Phases 1–4 as written.

## Phase 1 — Discovery interview (interactive)

Same adaptive, consultant-style posture as architect (genesis.md § Genesis: Discovery
Interview), narrowed to design: reflect back the design intent first, then follow the answer —
no probe cap. After every answer, rewrite `.claude/genesis/brief.md` and print its `## What I
think you're building` + `## Coverage` sections to the console verbatim; a correction is an
edit to the page, never a separate sign-off question.

1. **Reflect back.** Restate the design intent in your own words — the feeling, the audience,
   any references already named — and run one `AskUserQuestion` to confirm/correct.
2. **Taste direction — research-backed.** Run the **research-woven loop** (genesis.md § Genesis:
   Discovery Interview) on the visual-trend dimension: `wf-research` with `{stage: "design",
   dimensionKeys: ["visual-trend", ...], briefPath, contextPaths:
   [".claude/genesis/stack-descriptor.json", <prior interview-research/*.json>], verifyKeys: []}`
   (taste is not version-bearing → no Haiku pass). Present the current aesthetic/voice directions
   for this archetype + audience as the options — each description built as `tradeoff` ·
   `because` · `priced` · "current as of `<fetchedAt>`" — recommended-first and labeled
   "(Recommended)" with the menu's `why_recommended` as the stated reason; the user picks the
   feeling, references in vs. out.
3. **Research-assumption check — cold.** "has real user research been done?" If no, the
   doctrine records a *hypothesized* user model with explicit TODO stubs (no research gate for
   solo/MVP).
4. **Design non-goals — cold.** surfaces or states deliberately out of scope for v1, recorded
   into `## Non-goals` as they surface.

A thin taste answer earns one follow-up (which reference / which feeling) — depth is earned by
signal, never capped at a fixed round. Write each menu to
`.claude/genesis/interview-research/{dimension}.json` (stamp `fetchedAt`) and record the pick +
`sources` + `because`/`priced` to the brief's `## Picks`.

## Phase 2 — Decide (one proposer)

Select UX research-angle keys from the archetype + audience (e.g. `ui-ux-category`,
`competitive-teardown`, `accessibility`, and the locale bundle — `cultural-color`,
`locale-typography`, `locale-formatting` — for non-global audiences) and call `wf-research`
(`stage: "design"`) for each still-open dimension, passing `.claude/genesis/stack-descriptor.json`
in `contextPaths` so the menus stay within the chosen framework/component library. List the
design hard-to-reverse dimensions (component library, token tier count, accessibility baseline,
doctrine adjectives, navigation shell, layout system, color schemes — genesis.md § Genesis:
Hard-to-Reverse Dimensions) under `## Open Dimensions`, marked constrained/open. The session is
the proposer (genesis.md § Genesis: Decision Record (one proposer)): it reads each open
dimension's `interview-research/{dimension}.json` and writes the decision directly into that
dimension's ADR (`## Options considered` from the menu's ranked options, `## Decision` the pick);
a hard fork — two menu options within one rank of each other, or a user hesitation signal — is an
`AskUserQuestion` (options verbatim, `tradeoff` in each description, rank 1 first labeled
"(Recommended)" with `why_recommended` as the reason), and every non-picked ranked option, every
`is_minority` option, and every user rejection is recorded into the brief's decisions notes (they
become ADR `## Dissents`). Dismissed → STOP. A ruling that opens a deeper dimension starts a
**fresh** `wf-research` round scoped to only the new `dimensionKeys` (prior results via
`contextPaths`) before this loop resumes.

## Phase 4 — Author the canon (Opus)

**Ratification variant (pick on disk):** the winner already answers the taste questions —
Phase 4 changes shape at three points, everything else below applies unchanged:

- **Tokens are ratified, not authored.** Copy the winner's `tokens.css` verbatim to
  `design/tokens.css` (grafts already applied by explore). Walk the dimension ledger (4.2)
  *against that file*: a dimension the winner's tokens already answer is DECIDED with those
  roles; a dimension the candidate never exercised (e.g. the scheme mirror, motion roles) is
  decided now — authored as an *extension* of the winner's file, in its vocabulary, never a
  re-theme. The ratified file must satisfy every theme `design/targets.json` declares: a winner
  somehow missing its dark block gets one authored the same way (extension, harness-checked)
  before the lock — never a re-opened pick. The framework-native consumption surface (4.2's second half) is generated FROM
  `design/tokens.css` and must stay value-identical to it — name both paths in the doctrine.
- **Doctrine is distilled, not invented.** Source material: the winner's position brief
  (`design/explore/positions.md`), the pick's grafts/rejections, the research brief's admitted
  rules, and walkthrough findings. `## Dissents` MUST carry every `rejected[]` row from
  `design-pick.json` (candidate, reason, salvage) — a rejected direction is a recorded minority
  position.
- **Prune after lock.** Once `rules-locked` is committed, delete the non-winning
  `design/explore/r*-*/` dirs (salvage noted in the pick record survives in Dissents) and the
  throwaway `.claude/genesis/sketch.html` (genesis.md § Genesis: Discovery Interview, § Genesis:
  On-disk Handoff — a throwaway artifact, never durable); keep `positions.md`, the winner's dir
  having been promoted into `design/tokens.css` + `design/mocks/` (move its signature screens
  there, `data-status="approved"`).

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
   § Design Authoring Contracts, its "Grounded vs taste" rule): `grounded` (externally-anchored — contrast/a11y, legal/brand,
   destructive-action safety; binds even against an explicit mockup) or `taste` (aesthetic preference;
   yields to an explicit mockup). The tag is **authored here, not judged later** — it is what lets a
   mockup-driven `/spec:design` honor the mock without a doctrine-over-weighting reader silently
   overriding it. Default a ruling to `taste` unless it names an external anchor.
2. **Tokens — materialize every encodable dimension (visual archetypes only).** First walk the
   **dimension ledger** and record each row DECIDED (with token roles) or DEFERRED-with-reason (the
   reason recorded in doctrine `## Dissents`). Baseline ledger for a visual web archetype:
   - **color roles** — semantic consumer roles (not just palette primitives) + validated contrast pairs
   - **color schemes** — light / dark / system: decide now (token structure is hard to retrofit);
     DEFERRED is legal but must name the migration cost in its reason
   - **type scale** — named font-size roles, each pairing size + weight + tracking + line-height
     (e.g. `display/heading/body/label/eyebrow`); a restrained scale is still a scale, never an omission
   - **spacing rhythm** — the named spacing-scale steps
   - **layout system** — breakpoints, grid, container-width roles (the encodable half of the
     navigation-shell decision; the shell itself lands as a base primitive below)
   - **radii / elevation**
   - **focus ring** + **min target size**
   - **motion** — duration/easing roles (only if a motion system is in v1 scope; pair with a
     `prefers-reduced-motion` posture in doctrine when DECIDED)

   **Behavioral ledger (same DECIDED/DEFERRED discipline — these are what separate nice-looking
   from nice-to-use, and they are decided-once-or-drift-forever):**
   - **navigation shell** — sidebar / top-nav / tabs, routing hierarchy, page composition (lands
     as the `AppShell` base primitive + a doctrine posture, not as tokens)
   - **feedback patterns** — loading strategy (skeleton vs spinner), toast-vs-inline errors,
     optimistic-vs-pessimistic updates (doctrine postures + the `Toast` host primitive)
   - **form conventions** — validation timing (blur/submit), error placement, required-field
     marking (doctrine posture; encodable parts become structural rules)
   - **destructive-action pattern** — undo-window vs confirm-dialog, and when each applies
   - **iconography** — the icon set and sizing roles (a first spec picking one ad hoc is the
     same drift as a raw hex color)

   Write W3C-format token files covering every DECIDED row. **Also author the framework-native
   consumption surface** — the file components actually read (named in `tokensConsumed`; e.g. a
   Tailwind `@theme` block, a CSS `:root`, a JS theme object). Every DECIDED token family MUST be
   reachable there as a **named role a component can use without a literal** (`text-body`, not
   `text-[0.97rem]`). If the consumed form is build-generated from the W3C source, document and
   verify the build step. A family present in `tokens.json` but absent from the consumed surface is
   an undelivered token — its enforcement rule will have nothing to bind to. Name the token +
   consumed + doctrine paths so `/spec:init` and `/spec:design` can find them. Set
   `status.design: tokens-landed`.
3. **Base primitives — seed the standard structural set (visual archetypes only).** Scaffold a
   bounded standard set — the overlay shells **Sheet, Dialog, Popover, Drawer**, plus **AppShell**
   (the decided navigation shell: nav slots + content region, no feature content) and **Toast**
   (the feedback host the feedback-pattern ruling names) — plus a **barrel** (`index.*`)
   into the project's **base dir** (e.g. `src/components/base/`). Each overlay carries the backdrop +
   focus-trap + dismiss + portal contract authored to the doctrine and consuming token roles by name —
   no feature content. **Name the base dir, its barrel, and the import-only rule in the doctrine doc**
   (the same way token/consumed paths are named). This is the no-mockup analog of the mockup path's
   `containment`-driven extraction: base primitives are system foundation (the structural analog of
   tokens), seeded **once** here so the first overlay-bearing `/spec:design` **imports** rather than
   re-implements. The `base-primitive-containment` rule (Phase 4.4, from the template, category
   `structure`) makes import-only a build error. Seed **`design/components.json`** (shared §
   Design Authoring Contracts, component manifest) with the base primitives landed here — `name`, `purpose`,
   `props`, `mockRefs` — so the first `/spec:design` run starts its bind-vs-author decisions
   against a non-empty manifest. Headless/non-visual archetypes skip this item.
   **Also seed the component vocabulary:** for every building block the ratified direction /
   doctrine / winner mocks commit the product to — in ratification mode, sourced from the
   winner's position brief, doctrine rulings, and signature screens; in legacy mode, from the
   decision record + doctrine — add a **commitment entry** (`name`, `purpose`, `boundaries`) to the
   same manifest, visual archetypes only (shared § Design Authoring Contracts, component
   vocabulary). These are additional rows alongside the base-primitive entries, distinguished by
   absent `props`/`mockRefs`.
4. **Design rules** — write `.claude/genesis/design-rules.json` (template via `spec-paths templates`):
   each rule carries a `targetCategory` **enum only** (the design category set defined in
   genesis.md § Genesis: Enforcement Handoff), `appliesTo`/`exemptGlobs`, `severity`, `rationale`,
   and `grounding` (`grounded` | `taste`, per shared § Design Authoring Contracts, its "Grounded vs taste" rule — mechanizable closure rules
   like `no-raw-color` are `grounded`) — **never a tool name** (same section). `/spec:enforce` owns the category→enforcer selection, chosen
   at runtime per stack. **Closure check (binding):** every DECIDED token family from Phase 4.2 gets
   its matching "consume the role by name — no off-token literal" rule — `color → no-raw-color`
   (`color`), `type scale → no-off-scale-text` (`typography`), spacing → off-scale-spacing,
   `layout → no-off-scale-breakpoint` (`layout` — no raw media-query widths outside the
   breakpoint roles), etc. A
   DECIDED family with no consume-by-name rule is an authoring error: encodable ⇒ token **and**
   category, always.
5. **Commit** — first run `node "$(spec-paths components-check)" design/components.json`
   fail-closed on the vocabulary/base-primitive manifest item 3 just wrote (genesis validates a
   file it just authored — safe to gate, unlike the driver's advisory brownfield posture); fix
   any findings before proceeding. Then commit. Set `status.design: rules-locked`.

## Phase 5 — Report & hand off

Assemble the slots object (shared § Console Output Style — `report-render.js` is the sole
render authority; commands assemble slots and print its output verbatim):

- `outcome`: `✅ canon locked — {direction} ratified, {N} rules across {M} categories` when
  Phase 4 commits; `⚠️ {what needs the user}` when it stops short of a lock.
- `bullets`: `dimensions: {D} DECIDED (each token-family ↔ rule paired) · {K} DEFERRED —
  {one-phrase reasons}`; `designCatalog for /spec:init: {value, or none}`.
- `warns`: one `dissent recorded: {one-phrase summary}` entry per `## Dissents` row (drop the
  slot if none).
- `artifacts`: `{doctrine path}`, `{tokens path}`, `{consumed-surface path}` — one entry each.
- `next`: `{kind: 'command', text: '/spec:atlas (sweep + holistic review of the genesis mocks)
  → /spec:init — grounds the repo, then invokes /spec:enforce to generate enforcement from
  design-rules.json'}`.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim. Filled example (canon-locked arm):

```report
✅ **canon locked — dense-professional ratified, 14 rules across 5 categories**
- dimensions: 9 DECIDED (each token-family ↔ rule paired) · 2 DEFERRED — motion system out of v1 scope
- designCatalog for /spec:init: design/tokens.css
⚠️ dissent recorded: instrument direction rejected — too clinical for the target audience
📦 docs/design/doctrine.md
📦 design/tokens.css
📦 design/tokens-consumed.css

Next: /spec:atlas (sweep + holistic review of the genesis mocks) → /spec:init — grounds the repo, then invokes /spec:enforce to generate enforcement from design-rules.json
```

## Rules

- **Never Read `wf-research.js`.** Its `args` is the `stage: "design"` variant of the contract
  documented in `/spec:genesis-architect` Phase 1 — this command reuses it. Invoke it by
  `scriptPath` and act on its return; its source is never orchestrator context.
- One canon: this supersedes `/spec:init`'s greenfield design sketch; init reads this, never
  re-prompts adopt/craft when `design: rules-locked`.
- **Ratification never re-opens the pick.** A direction-level regret at this stage goes back to
  `/spec:genesis-explore` (a fresh round), never a silent re-theme of the winner's tokens.
- Design rules are category-only; tool selection is `/spec:enforce`'s job (runtime, per stack).
- **Encodable dimensions are closed:** every dimension that names values produces a token family
  AND a consume-by-name rule; doctrine carries posture, never values. A value in doctrine with no
  backing token is the defect this command guards against.
- Doctrine stays one page — promote generalizable taste, keep one-offs in the spec layer later.
- `AskUserQuestion` dismissed → STOP. Hard-to-reverse forks always go to the user.
- Explicit `model:` everywhere (Opus session/doctrine is the sole proposer — shared § Model
  Placement — Sonnet research).
