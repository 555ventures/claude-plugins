---
date: 2026-08-07
status: implementing
open_markers: 0
risk: T2
area: genesis-explore
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Explore taste channels — tokens-as-code authorship, positions template, unconditional Round 0 critique

## Goal

Fix the amateur-design failure mode in `/spec:genesis-explore`: Fable's taste currently
reaches Sonnet builders only through a 3-ingredient prose position brief, and the one
high-bandwidth channel (critique of renders) is conditional on browser availability in the
round where the look is born. After this spec: the session authors each position's starter
`tokens.css` (taste travels as code), position briefs follow a template with mandatory
execution-level fields, and explore requires a render capability up front — Round 0 tiles are
always rendered, screenshotted, and session-critiqued before the user sees them.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The session (taste seat) authors each position's **starter `tokens.css`** — palette recipe, type pairing + scale, spacing rhythm, radii, shadow/elevation language — written to `design/explore/r0-<position>/tokens.css` **before** the builder fan-out; Sonnet builders consume it and may **append missing role tokens but never change an authored value**. | Tokens are already the canonical taste carrier ("the winner's tokens ARE the canon"); prose paraphrase was the lossy step. Rejected: teaching Sonnet craft via a doctrine essay (advisory prose, violated by definition). |
| D2 | "The session writes no candidate HTML" stays verbatim — tokens.css is not HTML; the model-placement rule is amended to: Fable authors position briefs **and starter tokens.css**, Sonnet builds every tile/prototype HTML. | Preserves the placement economics while moving micro-decisions to the qualified model. |
| D3 | New template `spec/templates/design-positions.md`: per-position mandatory fields — position name, psychological stance, cited research-brief rule IDs, anti-defaults, **named reference direction** (e.g. "Linear's density, Stripe's restraint"), **motion character**, density/layout intent, and the starter-tokens pointer. `positions.md` is authored FROM this template (`spec-paths templates`); a position missing a mandatory field is not built. | No template existed; the 3-ingredient floor produced under-specified briefs. Rejected: spec-level prose checklist inside genesis-explore.md only (templates are the repo's sanctioned field-contract carrier). |
| D4 | **Render-capability precondition (hard block):** genesis-explore Setup verifies a browser/screenshot capability (Claude-in-Chrome tools or Playwright MCP) and STOPs with the remedy ("connect Chrome or enable the Playwright MCP, then re-invoke") when none exists. Round 0's loop drops "when a browser is available": every tile runs render → screenshot → session critique with fix-or-kill (same max-two-retries-then-drop as the deterministic gate) before the gallery. | Ungated-by-eye tiles were the incident; silent degradation recreates it. User-confirmed hard block over warn-and-proceed. |
| D5 | `shared.md` § Design Canon's harness clause ("skipped with an explicit note when no such capability exists") is **unchanged** — the unconditional requirement is an explore-local override stated in genesis-explore.md and genesis.md § Genesis: Explore Stage. | Atlas sweeps and /spec:design in headless hosts must still degrade gracefully; only explore births a look from nothing. |
| D6 | Enforcement carriers: pinning tests in `tests/model-placement.test.js` (extended, AC-tagged); new blocking doctrine claims carry `<!-- enforcedBy: tests/model-placement.test.js -->` markers; `claims-baseline.json` re-stamped via `node "$(spec-paths claims-lint)" --update-baseline`. The ledger's **existing** "Render→screenshot→critique loop" row (scaffold-ledger.md:50, kind `advisory`) is **amended, not duplicated**: its stated PROMOTE condition ("if evidence shows blind-authored mocks measurably worse") has now fired — the 2026-08-07 amateur-tiles incident — so the row splits by scope: **gate in explore** (capability precondition + refuse candidate presentation without a recorded loop), advisory elsewhere (matches D5). | Refuter findings 1–2: a new ADVISORY row for a hard-STOP mechanism contradicts the ledger's kind semantics AND leaves the existing row self-contradictory; amending the existing row is its own designed promote path. |
| D8 | Deterministic carrier for D1's never-alter rule: the session **commits** positions.md + all starter `tokens.css` files before the builder fan-out (`explore: positions-authored`); at the critique step it runs `git diff <that commit> -- 'design/explore/r0-*/tokens.css'` and requires **additions only** — any changed or deleted authored line is a builder violation, sent back with the diff (counts against the two retries). | Refuter finding 3: `design-atlas.js check` never diffs token content, so the rule had no mechanical carrier; a git diff needs no script change and the commit doubles as re-entry state. |
| D7 | Version bump: spec plugin `6.45.0 → 6.46.0`, description updated (the de facto changelog). | Behavior change; repo convention. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/genesis-explore.md | MODIFY | doctrine | Setup: render-capability precondition (D4). Phase 2: session authors starter tokens.css per position before fan-out (D1); positions.md authored from the design-positions template (D3); step 2 loop loses the browser conditional — unconditional render/screenshot/critique with fix-or-kill (D4). Rules: builder never alters authored token values (D1); template-mandatory fields (D3). enforcedBy markers per D6. |
| spec/doctrine/genesis.md | MODIFY | doctrine | § Genesis: Explore Stage — position-brief content list gains the template's mandatory fields (D3); Round 0 paragraph: session-authored starter tokens.css (D1) and mandatory critique leg (D4); model-placement sentence amended per D2. enforcedBy markers per D6. |
| spec/templates/design-positions.md | CREATE | doctrine | The positions template (D3): file header (signature screen, research-brief pointer, cull record section) + per-position block with the mandatory fields, each with a one-line authoring hint. |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | AMEND the existing "Render→screenshot→critique loop" row (D6): kind `advisory → gate (explore) / advisory (elsewhere)`; justification gains the dated 2026-08-07 amateur-tiles incident as the fired promote evidence; promote/retire rewritten — PROMOTE the remaining advisory scopes if atlas/design show the same delta; RETIRE the explore gate back to advisory if two genesis runs show the block firing spuriously (capability present but undetected). |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | Re-stamp via `node "$(spec-paths claims-lint)" --update-baseline` after all doctrine edits (D6) — same batch, last step. |
| tests/model-placement.test.js | MODIFY | tests | AC-20260807-05-1 … AC-20260807-05-6 (extend the existing genesis-explore test + add new ones; regression pin AC-5 tags the existing "writes no candidate HTML" assertion). |
| spec/.claude-plugin/plugin.json | MODIFY | other | Bump to 6.46.0; description mentions explore taste-channel hardening (D7). |

## Contracts

`spec/templates/design-positions.md` — per-position mandatory field names (headings/labels,
exact strings the pinning test greps):

```markdown
## Position: {kebab-name}
- **Stance:** {psychological/aesthetic stance in one sentence}
- **Rules cited:** {research-brief rule IDs this position leans on}
- **Anti-defaults:** {the defaults this position refuses}
- **Reference direction:** {named real-world product/direction, e.g. "Linear density, Stripe restraint"}
- **Motion character:** {how movement/transitions feel — e.g. "instant, no easing theater"}
- **Density & layout intent:** {draft-framing layout stance}
- **Starter tokens:** design/explore/r0-{kebab-name}/tokens.css (session-authored — builders extend, never alter)
```

File header carries: signature screen name, `docs/design/research-brief.md` pointer, and a
`## Cull record` section (moved from freehand prose — the cull + one-line reasons already
required by Phase 2 step 4 land there).

## Behavior

- **Setup (genesis-explore.md):** after the existing `spec-paths` reads, one new precondition:
  verify a render capability — Claude-in-Chrome MCP tools or Playwright MCP reachable (probe
  via ToolSearch/tool availability, not by opening a page). Absent → STOP with the remedy
  line; state is untouched, re-invoke resumes.
- **Phase 2 order change:** (1) pick signature screen; (2) author positions.md from the
  template; (3) **author each position's starter tokens.css** (session, ~40 lines each — this
  is the taste transfer); (4) **commit** positions.md + starter tokens (D8, the
  `explore: positions-authored` state — doubles as re-entry point); (5) fan out Sonnet
  builders, prompts now pointing at the position's existing tokens.css ("consume by role;
  append missing role tokens; never change an authored value"); (6) deterministic gate; (7)
  **unconditional** render → screenshot → session critique per tile, plus the D8 diff check
  (`git diff <positions-authored> -- 'design/explore/r0-*/tokens.css'` must be additions
  only), fix-or-kill (builder fixes, max two retries, then drop + report); (8) gallery + cull
  (cull recorded in positions.md § Cull record).
- **Round 1 (Phase 3):** already "harness loop mandatory" — gains only the explicit note that
  the critique leg is never skippable in explore (capability guaranteed by Setup).
- Divergence rule unchanged; two tiles reading as one direction is still a kill — the starter
  tokens make divergence checkable earlier (two near-identical palettes = re-brief before any
  build spend).

## Acceptance Criteria

- **AC-20260807-05-1**: WHEN `spec/commands/genesis-explore.md` is read THE SYSTEM SHALL state
  that the session authors each position's starter `tokens.css` before the builder fan-out and
  that builders never change an authored token value (regex pins on "starter" + "never change
  an authored" phrasing) → extended test in tests/model-placement.test.js
- **AC-20260807-05-2**: WHEN genesis-explore.md Phase 2 is read THE SYSTEM SHALL contain no
  browser-availability conditional (`doesNotMatch /when a browser is\s+available/`) and SHALL
  contain an unconditional render→screenshot→critique leg → tests/model-placement.test.js
- **AC-20260807-05-3**: WHEN genesis-explore.md Setup is read THE SYSTEM SHALL declare the
  render-capability precondition with a STOP + remedy naming Chrome/Playwright →
  tests/model-placement.test.js
- **AC-20260807-05-4**: WHEN `spec/templates/design-positions.md` is read THE SYSTEM SHALL
  contain all seven mandatory field labels from Contracts (literal: `**Stance:**`,
  `**Rules cited:**`, `**Anti-defaults:**`, `**Reference direction:**`, `**Motion
  character:**`, `**Density & layout intent:**`, `**Starter tokens:**`) →
  tests/model-placement.test.js
- **AC-20260807-05-5**: WHEN genesis-explore.md Rules are read THE SYSTEM SHALL CONTINUE TO
  state "The session writes no candidate HTML" → existing assertion in
  tests/model-placement.test.js:106, tagged with this AC-ID (green pre-change — regression pin)
- **AC-20260807-05-6**: WHEN `spec/doctrine/genesis.md` § Genesis: Explore Stage is read THE
  SYSTEM SHALL name the session as author of position briefs AND starter tokens.css, and
  Sonnet as builder of tile/prototype HTML → tests/model-placement.test.js
- **AC-20260807-05-7**: WHEN genesis-explore.md Phase 2 is read THE SYSTEM SHALL require the
  pre-fan-out commit of starter tokens and the additions-only `git diff` check against it
  (regex pins on "additions only" + the diff-vs-commit phrasing) → tests/model-placement.test.js

## Assumptions (escalation triggers)

- A1: No existing test pins the "when a browser is available" phrasing (verified:
  `grep -rn "browser is" tests/` → no hits) — **if false:** update that pin in the same
  File Plan row pair, never weaken it silently.
- A2: `node "$(spec-paths claims-lint)" --check` currently passes on main; the re-stamp is the
  last doctrine-batch step — **if false:** STOP, the tree is already claims-dirty; report
  before stamping over someone else's drift.
- A3: `design-atlas.js` needs no change — it already enforces token consumption by role;
  authorship is a doctrine-level contract — **if false** (a check hard-codes tile authorship
  assumptions): escalate; scripts are out of this spec's scope.
- A4: The new `explore: positions-authored` state value needs no gate change — verified:
  `genesis-state-gate.sh:56` allowlists `picked|skipped` for genesis-design, so any new
  mid-flight value blocks correctly — **if false:** the gate is a T3 hook surface; STOP,
  out of scope.
- A5: The claims grammar accepts `enforcedBy` markers on command files
  (`spec/commands/*.md`), not only doctrine files — **if false:** carry the claims via
  genesis.md only and cite genesis-explore.md lines from there.

## Rationale

The incident: explore tiles read as amateur work. Root cause traced in-session (2026-08-07):
Fable's taste crossed to Sonnet builders only as a short prose stance (no template, no
execution detail — no type scale, spacing rhythm, palette recipe), and Round 0's critique leg
— the one channel where taste transfers losslessly — was conditional on a browser being
available, in exactly the round where the look is born. Deterministic gates check mechanics
(labels, token linkage, no literals), not craft, so nothing failed "looks amateur."

The fix widens Fable's channels instead of teaching Sonnet taste: tokens-as-code in (D1 — the
pipeline already treats tokens as the canonical taste artifact; authoring them at the seat
that has taste is the holistic move), a field contract on the prose that remains (D3), and an
unconditional review loop out (D4). A separate "amateur tells" craft-doctrine file was
rejected as additive advisory prose — doctrine that never became a token, template field, or
gate is advisory by the pipeline's own definition.

Adversarial check (1 refuter, all findings fixed, none rejected): (1–2) the first draft
registered a new ADVISORY ledger row for a hard-blocking mechanism while the ledger already
carried the render-loop as an advisory row with a promote condition this incident satisfies —
resolved by amending that row (D6) instead; (3) D1's never-alter rule had no deterministic
carrier (`design-atlas.js check` never diffs token content) — resolved by D8's
commit-then-additions-only-diff, which needs no script change. Refuter also executed
`claims-lint --check` (clean, 19 files / 5185 lines) and confirmed A1/A2/A5 (claims-lint's
corpus includes `spec/commands`) and the AC-5 line citation.

D5 keeps the shared harness clause intact deliberately: atlas gap-sweeps and /spec:design run
in hosts where headless degradation is legitimate; explore is the only stage that creates a
look from nothing, so the hard requirement is scoped there. Fragile spot to watch: the
Setup capability probe must not open pages or create tabs (side effects before consent);
probe tool availability only.

## Canonical Delta

None — this repo keeps no docs/canonical/. The doctrine files edited ARE the canon; the
plugin.json description line is the changelog surface.
