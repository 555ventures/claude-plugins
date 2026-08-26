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

**Setup:** run `spec-paths shared-for genesis-explore` and read its output (the shared
invariants scoped to this command); run `spec-paths shared-genesis` and Read it too.
Run `spec-paths wf-research` and `spec-paths design-atlas` once and keep the printed paths. The
state gate blocks this command until `architect: scaffold-complete`; also verify
`.claude/genesis/stack-descriptor.json` exists.

**Render-capability precondition:** probe for a reachable render/screenshot capability —
Claude-in-Chrome MCP tools or a Playwright MCP, or an equivalent scriptable browser-capture
tool — via tool availability (`ToolSearch` or equivalent), never by opening a page or creating
a tab. No scriptable browser-capture capability reachable: STOP, telling the user to connect Chrome (Claude-in-Chrome) or enable the Playwright MCP, then re-invoke. <!-- enforcedBy: tests/model-placement.test.js -->
State is untouched by the probe; re-invoking after connecting
resumes here. This is an explore-local hard requirement (genesis.md § Genesis: Explore Stage) —
atlas sweeps and `/spec:design` still degrade gracefully with a note when headless.

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
   **matrix-at-approval** (shared § Design Canon): every candidate is built and judged on the
   draft framing; only the picked winner pays the matrix bill.

## Phase 1 — Fresh UX research

1. Derive this project's UX dimension keys from archetype + audience + domain (e.g.
   `ux-psychology-current`, `ui-practice-current`, `domain-patterns`, `dark-pattern-law`,
   plus the locale bundle for non-global audiences). Invoke `wf-research`
   (`Workflow {scriptPath: <spec-paths wf-research output>}`) with `{stage: "explore",
   dimensionKeys, briefPath, contextPaths: [stack-descriptor, genesis brief]}` —
   paths/keys/booleans only, never prose. Then run
   `node "$(spec-paths registry-check)" --menu <file> --write` for each menu written (a UX
   dimension typically carries `packages: []` and stamps `unverified` with no request made).
   Exit 1 → print one `📌 dropped for currency: "<label>" — <registry>:<name>@<version> not on
   the registry` line per dropped option; exit 3 → print `⚠️ registries unreachable — menu
   stamped unverified, continuing`; exit 2 → re-run the research round for that dimension —
   never present a malformed menu. The resulting `AskUserQuestion` (where used) is built from
   the rewritten menu file.
2. Author `docs/design/research-brief.md` from the `ux-research-brief.md` template
   (`spec-paths templates`), holding every admitted principle to the method bar: falsifiable
   rule, evidence tier, archetype/screen conditions, `predicts:` observable, the ethics floor,
   anti-slop negations. The session curates; research content comes from the workflow return,
   cited — each admitted rule's rationale carries its research menu's `why_recommended` line as
   the reason it was ranked highest for this project. Any user-supplied seed principles enter as
   hypotheses to re-verify, never as pre-admitted rules.
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
   AskUserQuestion if ambiguous).
2. Author `design/explore/positions.md` from the `design-positions.md` template
   (`spec-paths templates`) — **6–8 position briefs**, each a genuinely distinct
   psychological/aesthetic stance (instrument / guide / ambient / dense-professional / …). A
   position missing any of the template's mandatory fields (stance, rules cited, anti-defaults,
   reference direction, motion character, density & layout intent, starter-tokens pointer) is
   not built. Position briefs are session-authored (the taste seat).
3. **Author each position's starter `tokens.css`** (session, the taste-transfer step — palette
   recipe, type pairing + scale, spacing rhythm, radii, shadow/elevation language, ~40 lines
   each), written to `design/explore/r0-<position>/tokens.css` **before** the builder fan-out.
4. **Commit** `positions.md` + every starter `tokens.css` (`explore: positions-authored`) — this
   commit is the D8 baseline the additions-only diff check (step 7) runs against, and doubles as
   the re-entry point.
5. Fan out **parallel Sonnet `Agent` calls, one per position** (a single message, all calls
   together; `model: "sonnet"` explicit). Each builds `design/explore/r0-<position>/tile.html`
   (root `data-screen-label`, links `./tokens.css`) against its position's already-existing
   starter `tokens.css`: **consume by role; append missing role tokens; never change an
   authored value.** Tiles target the **draft framing only** — the most-constrained declared
   viewport, light theme (cheap by design; the matrix bill lands on the winner alone, after the
   pick). Agents receive **paths** (research brief, positions.md, the position's tokens.css,
   stack descriptor), never inlined prose.
6. Gate every candidate: `node <design-atlas> check design/explore/r0-<position>` must pass
   (fail-closed; a failing tile goes back to its builder, max two retries, then it is dropped
   and the drop reported — never shown broken).
7. **Unconditional render → screenshot → session critique**, per tile, every time (no browser-
   availability conditional — Setup already guaranteed the capability): fix-or-kill, same
   max-two-retries-then-drop as step 6. Alongside the critique, run the D8 carrier: `git diff
   <positions-authored commit> -- 'design/explore/r0-*/tokens.css'` must be **additions only**
   — any changed or deleted authored line is a builder violation, sent back with the diff
   (counts against the two retries).
8. Build the comparison gallery: `node <design-atlas> gallery design/explore --out
   design/explore/gallery.html`, tell the user to open it (or serve it), and run the cull:
   `AskUserQuestion` (multiSelect) — **pick 2 finalists**. Record the cull + one-line reasons in
   `positions.md`'s `## Cull record` section. If seeing the tiles surfaced a research-brief
   correction, apply it now with **scoped invalidation**: rebuild only candidates whose
   position brief cites a changed rule (the two finalists, if affected), never the whole round.
   Set `explore: tiles-culled`. Commit.

## Phase 3 — Round 1: interactive prototypes

1. For each finalist, one Sonnet agent expands it into `design/explore/r1-<position>/` — the
   **signature screen set** (core loop, highest-consequence moment, first-run), one HTML file
   per screen, its `tokens.css` carried over, **interactive**: real state transitions, motion,
   loading/streaming feel (vanilla JS in-file; no framework) — still **draft framing only**
   (matrix-at-approval: the pick judges direction; the matrix is the winner's bill), plus one
   exception: a **minimal dark block** in each finalist's `tokens.css` and **one dark
   screenshot** of the signature screen, surfaced beside the gallery — dark can invalidate a
   palette, and at n=2 the insurance is nearly free (genesis.md § Explore Stage). Harness loop
   mandatory; session critiques each round (this is the Fable seat earning its keep). The
   critique leg is never skippable in explore — Setup's render-capability precondition
   guarantees it, so there is no degraded/headless path here. Before
   each finalist reaches the user, run the **rule-checklist pass** (shared § Design Canon): a
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
   shared § Design Canon; the user approved a direction, not sight-unseen adaptations of it).
   Mechanical fidelity work: it changes how the winner adapts, never what it is — a direction
   question surfacing here goes back to the user, not into the expansion. Set
   `explore: picked`. Commit.

## Phase 4 — Report & hand off

Assemble the slots object (shared § Console Output Style — `report-render.js` is the sole
render authority; commands assemble slots and print its output verbatim):

- `outcome`: `✅ picked — {position} wins, {N} grafts applied, matrix confirmed`.
- `bullets`: `explored {positions}; culled {culled}; walkthrough: {finding counts}`.
- `artifacts`: `{research-brief path} — {rule counts by evidence tier}`.
- `next`: `{kind: 'command', text: "/spec:genesis-design — ratifies the winner's tokens.css as
  canon; rejected candidates land in its ## Dissents"}`.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim. Filled example:

```report
✅ **picked — dense-professional wins, 2 grafts applied, matrix confirmed**
- explored instrument, guide, ambient, dense-professional; culled to dense-professional, instrument; walkthrough: 3 friction findings, 0 blockers
📦 docs/design/research-brief.md — 12 grounded, 4 taste

Next: /spec:genesis-design — ratifies the winner's tokens.css as canon; rejected candidates land in its ## Dissents
```

## Rules

- **The session writes no candidate HTML.** It authors position briefs, starter `tokens.css`,
  critiques renders, and records rulings; Sonnet builds everything (shared § Model Placement).
- **Every candidate ships its own `tokens.css`, session-authored for Round 0** — Sonnet builders
  consume it by role and may append missing role tokens but must never change an authored
  value (the D8 additions-only `git diff` check is the deterministic carrier, Phase 2 step 7).
  A tile with inline literals fails `design-atlas.js check`. Tokens-as-code from birth is what
  makes genesis-design ratification (not extraction) possible.
- **A position brief missing a mandatory `design-positions.md` field is not built** — the
  template's seven fields (stance, rules cited, anti-defaults, reference direction, motion
  character, density & layout intent, starter tokens) are the execution-level floor.
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
