---
description: Design-stage doctrine — Design Canon, Authoring Contracts, Render Gate, and Atlas; fidelity is judged at the render (ADR-0002)
---

# Spec Pipeline: Design Doctrine

## Design Canon (mocks, tokens, harness)

The design stage runs only on hosts with a component catalog; it is tool-agnostic. The host
config's `design` block declares `tool`/`command`/`storyFormat`/`doctrine`/`render` (§ Render
gate, `grounding-contract.md`), optional `rulesManifest`/`atlasRoutes`/`gateCommand`,
legacy-tolerated unread `copyCatalogs`/`screenshot` (the render gate judges painted text, never
source copy or pixels). A UI-bearing spec on such a host defaults to `design: true`
frontmatter, routed through `/spec:design` between plan and build; the catalog and § Design
Render Gate gate UI **appearance**, TDD gates logic, **reachability is never exempt**
(`plan.md` Phase 2) — skipping design is the user's call, never the model's.

**Local mock canon (the `design/` dir).** Mocks are **repo files** — plain HTML on the repo's
own tokens, never an external-tool export:
- **`tokens.css`** — the mock-side consumption surface of the token canon, value-identical to
  the framework-native surface by construction.
- **`targets.json`** — the theme × viewport matrix owed. **One responsive mock per surface,
  never per-device/per-theme variants.** Direction iterates on the single most-constrained
  viewport, light theme; the full matrix is owed and confirmed only once approved —
  `approved` always means a human saw the whole matrix. Roadmap mocks confirm both at
  `/spec:sketch`'s exit — **`ratified` = `approved`, one stamp**.
- **`mocks/<label>.html`** — one screen per file, root `data-screen-label="<label>"`. IS the
  `design_source` — the render gate resolves it directly, no extraction. `data-status`:
  `sketch` (default) | `ratified` | `approved`.
- **`explore/`** — genesis explore-state candidates, pruned once locked; **`atlas/`** —
  generated output (§ Design Atlas), never hand-edited.

**Mock authority has a lifecycle — it expires at `built`.** Sketch → ratified → approved →
bound: the mock is authority, code is held to it. Once the claiming spec is `done`,
**authority inverts: shipped code is truth, the mock a historical contract allowed to go
stale** — displayed (the atlas `built` badge), never owed; re-sync is lazy, at the next design
touch. Litmus: a design-contract change goes to the mock first, else code only.

**Design harness.** Every mock-authoring pass declares the marks the gate reads —
`data-screen-label` (root), `data-status`, `data-state-btn="<state>"`, `data-contract="none"`
(non-contract subtree), `data-positioned` (data-placed children) — then runs
`design-atlas.js check` (`spec-paths design-atlas`) fail-closed, enforced at `ratified`/
`approved` or `--matrix`. **Render rules pass:** before direction approval, `render-rules.js`
(`spec-paths render-rules`) runs every design-rules-genesis rule carrying a `renderCheck`
(`target-size`, `cta-count`, `contrast`, `palette`) over the render inventory — a measured
number, never a walked checklist; an un-mechanized taste rule is advisory only. Every pass
also applies § Design Authoring Contracts' grounded-vs-taste rules; copy in mocks is the
contract code is later held to.

**Cross-spec consistency**, strongest first: token/theme files in code (a code-side
`off-token-color` rule wired by `/spec:enforce`; near-matches reuse, never fork the scale); the
design doctrine doc (taste tokens can't encode, binding like a locked Decision); the living
showcase catalog (composes every landed spec's surfaces, drift visible with zero tooling).

## Design Authoring Contracts

Consumed by `/spec:design` and `/spec:genesis-design`, authored against § Design Canon.
**Grounded vs taste (mock supremacy):** each ruling carries its **grounding**: `grounded`
(externally anchored — contrast/a11y, legal/brand, destructive-action safety) or `taste`
(aesthetic), **authored into the rule, not judged per conflict**; an untagged legacy ruling
defaults to `taste` unless it names an external anchor. **With a mockup as canon**, `taste`
**yields silently**; `grounded` **binds the value, not the intent** — snap values to what the
constraint permits, honor the mock's intent otherwise; a mock's **omission** is never evidence
against it. **With no mockup**, doctrine is canon; a contradicting note is a fork — **local
exception** or **doctrine change**, never silent override.

**Base primitives.** Overlay shells (Sheet/Dialog/Popover/Drawer), the **AppShell**, and the
**Toast host** are **system foundation** — created once behind a barrel (`base/index.*`), never
re-implemented per surface, never improvised. A mock needing an **absent** primitive surfaces
the nearest primitive and its coverage (author as foundation / reuse), **default-authoring
when no near-match exists**. The **`containment` tag** drives extraction — a containment
shell's `usedBy` is structurally ≤1. `/spec:enforce` mechanizes `base-primitive-containment`: a
hand-rolled overlay outside the base dir is a build error.

**Component manifest + author-justification gate.** Duplication is a *default* model failure —
prose is not enforcement. **`design/components.json`** (`name`, `purpose`, `props`, `mockRefs`,
plus `authorJustification` for `author` decisions) is extended at reconcile from each worker's
receipt, read at preflight before any bind-vs-author call. Every **`author` decision** must
return the **nearest manifest entry and why it fails** — absence is a gate failure (base
primitives, seeded directly by `/spec:genesis-design`, owe none) — verified by `/spec:review`'s
component-manifest check. Creating a component must cost strictly more than reusing one.

**Component vocabulary (commitment entries).** `/spec:genesis-design` also seeds
`design/components.json` with **commitment entries** — `name`, `purpose`, optional
`boundaries` — distinguished from a landed entry by having no `props`/`mockRefs` yet.
`spec/scripts/components-check.js` (`spec-paths components-check`) is the manifest's schema
authority (`name`+`purpose` required, `boundaries` an array when present, no duplicate
`name`s) — fail-closed at genesis-design's commit, advisory at `/spec:design` preflight.
Authoring dispatches read it as binding canon like tokens: bind/import or author to fulfil an
entry, never re-invent a lookalike; a `boundaries` contradiction is a fork, and `/spec:review`
treats commitment entries as first-class near-duplicate targets.

## Design Render Gate

`render-gate.js` is the deterministic fidelity judge — fidelity is measured **at the render**
(painted text, in-flow order, bound-region geometry), never by diffing source (ADR-0002).
Consumed by `/spec:design`'s render-gate step and `/spec:sketch`'s exit; states invariants
only, never the sequencing those commands own.

**Inputs.** The mock (`design_source`, read directly from disk), one story per declared state,
and the theme × viewport **targets matrix** when declared; `--mocks <mock>…` runs mock-only, no
component side, no ledger read. An unbound state (a declared `data-state-btn` with no
ledger-claimed story) is a precondition failure, never a comparison finding. **Findings and
tolerances** are owned by `render-gate.js`'s and `render-compare.js`'s own header comments —
read those, never restate the numbers here.

**Exclusions by mark.** `data-contract="none"` subtrees never enter comparison; out-of-flow and
screen-reader-only entries match by text presence only, exempt from the order check;
`data-positioned` children are exempt from geometry comparison. **Auto-excuse:** a matched
pair whose mock role is `button`/`text` and component role `link` is never a `role` finding.
**Render rules pass:** when `design.rulesManifest` is declared, every component inventory
(never the mock side, `--spec` mode) also runs `render-rules.js`; a rule finding fails the gate
like a fidelity finding — no manifest declared changes nothing else.

**Ledger binding.** `.claude/design-coverage.json` records, per mock path and screen label, the
bound `stories` (state → story id) plus `spec`/`at` — written as surfaces are authored, read as
the `--spec`-mode precondition (an unclaimed state STOPs, never silently skips) and by the
atlas/`/spec:sketch` to show what remains unbound. **Fail-closed:** no comparison target, a
missing owed matrix, or a non-zero capture command is never a pass — the gate STOPs naming the
failure; a capture failure is never green.

## Design Atlas

The whole-product design view — catching what per-screen review provably misses (cross-screen
incoherence, orphaned surfaces, drift). One derived artifact, `design/atlas/index.html`,
regenerated by **`design-atlas.js`** (`spec-paths design-atlas`) from `design/mocks/`, roadmap
briefs' `## Surfaces` blocks, `.claude/design-coverage.json`, and spec frontmatter — zero-token.

- **Journey view + status badges, derived never declared.** Briefs declare surfaces/edges in a
  fenced ` ```surfaces ` block — names and arrows only, pixels are the mocks'. Badges: `gap`
  (declared, no mock) · `sketch`/`ratified`/`approved` (`data-status`) · `bound` (ledger claim
  exists) · `built` (claiming spec `done`) · `orphan` (neither declared nor claimed). Unmocked
  declared surfaces render as **gap cards**.
- **`/spec:atlas`** regenerates the artifact and processes **annotations**, triaged by root
  cause before any edit: **mock-detail** (edit the mock) vs **product-understanding** (fix the
  owning brief's `surfaces` block first, cross-brief via an amendment ADR).
- **`/spec:sketch <brief>`** is the per-brief workbench whose exit coherence readout sets the
  brief's sketches to `ratified`; never required — `/spec:plan` warns on an unratified UI brief
  but never blocks.
- **Built surfaces join the atlas** when the host declares `design.atlasRoutes` (optional);
  absent, built status is a badge only.

## Workflows Encode Shape, Not Judgment

The plugin's `wf-build.js`, `wf-review.js`, `wf-enforce.js` (and genesis `wf-research.js`) own
ordering, schemas, retry caps, kill rules — deterministic control flow.
Judgment stays in the main loop. Design-stage component authoring is **direct dispatch**: a
warm Sonnet per surface authors against the mock behind the host gate and the render gate — no
workflow owns it, and taste (fork adjudication, iteration rulings, visual review) never enters
one. Never prompt-engineer findings into existence — an empty findings list is a valid outcome.
**No free text in `args`:** a workflow's `args` is a control channel — paths, ids, enums,
booleans, the host gate command only; prose lives on disk, Read there.

**On-disk handoff.** Every cross-stage handoff is a **file**, never conversation context — the
spec (Decisions, File Plan, Contracts) for the per-feature pipeline, genesis's own artifact
spine (`.claude/genesis/*` + `docs/adr/`) otherwise. Only *durable* handoffs live under
`specs/`; scratch intermediates go to the session scratchpad, never the tracked dir.
