---
description: Greenfield taste funnel — fresh per-project UX research, then locally-rendered candidate rounds (style tiles → interactive prototypes) the user judges in a browser; ends with the design pick that /spec:genesis-design ratifies
argument-hint: <project idea — same as architect>
---

# Genesis Explore: Research + Candidate Funnel + The Pick

The middle greenfield stage. Runs a **fresh UX research pass** for this project (never a frozen
principle list — genesis.md § Genesis: Fresh UX Research), then a **two-round rendered-candidate
funnel** (genesis.md § Genesis: Explore Stage), and ends with the user's design pick recorded to
`.claude/genesis/design-pick.json`. `/spec:genesis-design` then *ratifies* the winner instead of
inventing a direction. The pick precedes the lock — that is this command's whole reason to sit
before genesis-design.

**Intended model: Fable or Opus session** — this is the pipeline's roadmap-level taste seat
(shared § Model Placement): the session authors position briefs and judges critique rounds;
**Sonnet agents build every tile and prototype**; deterministic checks gate before any human
look.

**Setup:** run `spec-paths shared` and Read it; run `spec-paths shared-genesis` and Read it too.
Run `spec-paths wf-research` and `spec-paths design-atlas` once and keep the printed paths. The
state gate blocks this command until `architect: scaffold-complete`; also verify
`.claude/genesis/stack-descriptor.json` exists.

## Input

`$ARGUMENTS` — the same project idea. Archetype, audience, and stack come from
`stack-descriptor.json`, not re-asked.

## Phase 0 — Re-entry & applicability

1. Read `.claude/genesis/status.json`. If it has no `explore` field, add it (`"pending"`).
   Verify artifacts physically exist for whatever phase is claimed; resume there.
2. **Design-applicability gate:** if the archetype's design stage is `none`/`skipped`
   (genesis.md § Archetype Registry), confirm with the user, set `explore: skipped`, and STOP.
3. **Declare the target matrix:** if `design/targets.json` is missing, derive it from the
   archetype (web app → light+dark × mobile/tablet/desktop; mobile-first → drop desktop;
   desktop tool → desktop+tablet), confirm themes + viewports with the user in one
   `AskUserQuestion`, and write it from the `design-targets.json` template — viewports ordered
   **most-constrained first** (the first entry is the draft framing). The funnel runs
   **matrix-at-approval** (shared § Design Stage): every candidate is built and judged on the
   draft framing; only the picked winner pays the matrix bill.

## Phase 1 — Fresh UX research

1. Derive this project's UX dimension keys from archetype + audience + domain (e.g.
   `ux-psychology-current`, `ui-practice-current`, `domain-patterns`, `dark-pattern-law`,
   plus the locale bundle for non-global audiences). Invoke `wf-research`
   (`Workflow {scriptPath: <spec-paths wf-research output>}`) with `{stage: "explore",
   dimensionKeys, briefPath, contextPaths: [stack-descriptor, genesis brief], verifyKeys: []}` —
   paths/keys/booleans only, never prose.
2. Author `docs/design/research-brief.md` from the `ux-research-brief.md` template
   (`spec-paths templates`), holding every admitted principle to the method bar: falsifiable
   rule, evidence tier, archetype/screen conditions, `predicts:` observable, the ethics floor,
   anti-slop negations. The session curates; research content comes from the workflow return,
   cited. Any user-supplied seed principles enter as hypotheses to re-verify, never as
   pre-admitted rules.
3. Read the brief back for sign-off (the funnel binds to it) — presented as what it is: a
   **constraints floor, not a taste commitment**. The user has seen no visuals yet and cannot
   know what they want; the sign-off must never read as if it were asking for that. Mandatory
   framing for the AskUserQuestion:
   - **Lead with what happens next**: 6–8 rendered style tiles the user culls in a browser —
     the look-and-feel choosing happens there, not here. This gate only confirms the evidence
     rules all candidates will obey regardless of style.
   - **Present a digest, not the document**: rule counts by evidence tier, the 3–5 most
     behavior-shaping rules in plain language, and the ethics/legal floor — full text linked
     for the reader who wants it. A skim is a legitimate basis for approving; a wrong rule
     will also be visible in the tiles.
   - **State the real revision cost**: the brief stays editable at the tile cull, and an edit
     invalidates only candidates whose position leaned on a changed rule — never the whole
     round. Do not present sign-off as a point of no return.

   Set `explore: research-done`. Commit.

## Phase 2 — Round 0: style tiles

1. Pick the **signature screen** (the core-loop moment; confirm with the user in one
   AskUserQuestion if ambiguous) and author **6–8 position briefs** — each a genuinely distinct
   psychological/aesthetic stance (instrument / guide / ambient / dense-professional / …), each
   citing the research-brief rules it leans on and its anti-defaults. Position briefs are
   session-authored (the taste seat) and written to `design/explore/positions.md`.
2. Fan out **parallel Sonnet `Agent` calls, one per position** (a single message, all calls
   together; `model: "sonnet"` explicit). Each builds `design/explore/r0-<position>/` —
   `tokens.css` (its own, tokens-as-code from birth) + `tile.html` (root
   `data-screen-label`, links `./tokens.css`) — under the design harness (shared § Design
   Stage): author → `design-atlas.js check` → render/screenshot/critique when a browser is
   available. Tiles target the **draft framing only** — the most-constrained declared viewport,
   light theme (cheap by design; the matrix bill lands on the winner alone, after the pick). Agents receive **paths** (research brief, positions.md, stack descriptor), never
   inlined prose.
3. Gate every candidate: `node <design-atlas> check design/explore/r0-<position>` must pass
   (fail-closed; a failing tile goes back to its builder, max two retries, then it is dropped
   and the drop reported — never shown broken).
4. Build the comparison gallery: `node <design-atlas> gallery design/explore --out
   design/explore/gallery.html`, tell the user to open it (or serve it), and run the cull:
   `AskUserQuestion` (multiSelect) — **pick 2 finalists**. Record the cull + one-line reasons in
   `positions.md`. If seeing the tiles surfaced a research-brief correction, apply it now with
   **scoped invalidation**: rebuild only candidates whose position brief cites a changed rule
   (the two finalists, if affected), never the whole round. Set `explore: tiles-culled`. Commit.

## Phase 3 — Round 1: interactive prototypes

1. For each finalist, one Sonnet agent expands it into `design/explore/r1-<position>/` — the
   **signature screen set** (core loop, highest-consequence moment, first-run), one HTML file
   per screen, its `tokens.css` carried over, **interactive**: real state transitions, motion,
   loading/streaming feel (vanilla JS in-file; no framework) — still **draft framing only**
   (matrix-at-approval: the pick judges direction; the matrix is the winner's bill), plus one
   exception: a **minimal dark block** in each finalist's `tokens.css` and **one dark
   screenshot** of the signature screen, surfaced beside the gallery — dark can invalidate a
   palette, and at n=2 the insurance is nearly free (genesis.md § Explore Stage). Harness loop
   mandatory; session critiques each round (this is the Fable seat earning its keep). Before
   each finalist reaches the user, run the **rule-checklist pass** (shared § Design Stage): a
   Sonnet checker walks the research-brief's admitted rules against each screen, citing rule
   IDs; violations go back to the builder.
2. **Persona walkthroughs:** for each finalist, spawn walkthrough agents primed with the
   research brief's behavioral archetypes; each attempts the declared journeys cold against the
   prototype files and files friction findings to
   `design/explore/r1-<position>/walkthrough.md`. Surface the findings to the user alongside
   the gallery (`design-atlas.js gallery` over `design/explore` again).
3. **The pick:** `AskUserQuestion` — winner, then a follow-up for grafts ("anything from the
   other candidate to carry over?"). Write `.claude/genesis/design-pick.json` (template via
   `spec-paths templates`): `winner` (candidate dir), `grafts: [{from, what}]`,
   `rejected: [{candidate, reason, salvage}]` — rejection reasons verbatim from the user where
   given. Apply grafts to the winner's files now (Sonnet edits, harness-checked).
4. **Matrix expansion (winner only):** one Sonnet agent expands the winner across
   `design/targets.json` — media queries + viewport meta per screen, dark block in its
   `tokens.css` — gated by `node <design-atlas> check --matrix design/explore/r1-<winner>`;
   matrix screenshots (each viewport, both themes on the draft framing) critiqued by the
   session, then shown to the user for the **fast matrix confirm** (approval is two-step —
   shared § Design Stage; the user approved a direction, not sight-unseen adaptations of it).
   Mechanical fidelity work: it changes how the winner adapts, never what it is — a direction
   question surfacing here goes back to the user, not into the expansion. Set
   `explore: picked`. Commit.

## Phase 4 — Report & hand off

Report: research-brief path and rule counts by evidence tier, positions explored, the cull, the
pick + grafts, walkthrough finding counts. **Next:** `/spec:genesis-design` — it ratifies the
winner's `tokens.css` as canon and authors doctrine/rules around it; rejected candidates land in
its `## Dissents`.

## Rules

- **The session writes no candidate HTML.** It authors position briefs, critiques renders, and
  records rulings; Sonnet builds everything (shared § Model Placement).
- **Every candidate ships its own `tokens.css`** and consumes it by role — a tile with inline
  literals fails `design-atlas.js check`. Tokens-as-code from birth is what makes genesis-design
  ratification (not extraction) possible.
- **Divergence is the point of Round 0.** Two tiles that read as the same direction are a
  defect; kill one and re-brief before showing the user.
- **Deterministic check before human eyes, always** — never show an ungated candidate.
- **One responsive file per surface, never per-device or per-theme variants** — the matrix
  (`design/targets.json`) is rendered from one file: media queries for viewports, a tokens.css
  theme block for dark. Parallel mock files drift and are a check failure by construction.
- **Fresh research every project.** Never reuse another project's research brief or bake its
  rules into a position brief without re-verification; user seed principles are hypotheses.
- A Claude Design export the user supplies enters as one more candidate dir, same gates
  (genesis.md § Explore Stage escape hatch).
- `AskUserQuestion` dismissed → STOP (state is safely on disk; re-invoke to continue).
- Explicit `model:` on every `Agent` call. Workflow `args` = paths/keys/booleans only.
