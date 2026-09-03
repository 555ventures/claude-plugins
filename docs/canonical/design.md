# Design — canonical decisions

*Retired 2026-08-24 (specs/20260824/05): the source-grep fidelity gate, `dc-extract`, the
`.design/` sidecar, skeleton binding maps, delta rows, the Fable retainer, the vision
consult, the exit fidelity review, and `copyCatalogs` as a required key.*

## Component vocabulary (2026-08-10, specs/20260810/01-design-path-model-placement.md)

The product's committed building blocks live as **commitment entries** in
`design/components.json` (`name`, `purpose`, `boundaries`) — the same manifest that holds
landed components; absence of `props`/`mockRefs` is what marks an entry as commitment-only.
Seeded at SKELETON (checked by `components-check.js` at `skeleton-landed`,
specs/20260902/08). Validated by `components-check.js` (spec-paths key `components-check`):
**fail-closed** at genesis `skeleton-landed`, **advisory** at the design driver's preflight (brownfield
files may predate the canonical shape; the legacy `{"components": [...]}` wrapper is tolerated
with a warning).
Consumed as binding canon by `wf-design` workers via the `componentManifestPath` arg — a
named block is bound or authored to fulfil its entry, never re-invented as a lookalike, and
a `boundaries` contradiction is a fork (`blocked`), same standing as a token-value
contradiction. `/spec:review`'s component-manifest check includes commitment entries in its
near-duplicate comparison, and an `author` decision fulfilling a commitment entry cites it
as its justification.

## Design stage (2026-08-24, specs/20260824/02)

`/spec:design` is a six-step command body, not a driver: **preflight** → **author** →
**host gate** → **render gate** → **your look** (blocking) → **reconcile + `designed:`**.
Step position is derived from disk on every invocation — there is no state file, no
`.design/` sidecar lifecycle, and no workflow. Authoring is direct Sonnet dispatch, one
warm worker per surface with the mock HTML in context and `design/components.json` as
canon; the mock IS the binding map, so the skeleton paraphrase hop and its checker are
gone. The story bound to a mock state renders exactly the values the mock illustrates for
that state (a story exercising extra branches is a separate, unbound story), and the
render gate is the drift detector for that rule. Story ids land in the coverage ledger's
claims. The user's Storybook look is kept and blocking after both gates are green — the
gates measure what a human cannot overlay, not the reverse. Retired with the driver:
`spec-design-driver.js`, `wf-design.js`, `skeletons-check.js`, the Haiku match pass, the
Fable retainer, the vision consult, and the `ITERATE` catalog loop.

## Sketch-tier authorship and the shell canon (2026-09-01, specs/20260901/04)

Sketch-tier authorship is a planning-seat duty for both `/spec:atlas`'s gap sweep and
`/spec:sketch`'s scoped sweep (ADR-0003, superseding specs/20260810/01 D8): the session authors
the journey-central set in-session (≤5, at least one per declared journey); one sequential
`Agent {model: "fable"}` dispatch (Opus fallback) authors the overflow with those paths as
exemplars, never one agent per surface; Sonnet takes mechanical edits only. Every author reads
the picked position brief (`design/explore/positions.md`, the `design-pick.json` winner's
section) ahead of tokens, and the report names the position and the author split. Single
doctrine home: design.md § Design Atlas.

Coherence is a shell artifact: `design/shell/<name>.html` (root `data-shell-canon`, named
`data-slot`s, an empty content slot, non-content slots `data-contract="none"`) plus a linked
`design/shell/<name>.css`. Page mocks declare `data-shell="<name>"` or `"none"`, own only the
content slot's inner HTML and an optional `data-active`, and carry the chrome as a
`data-shell-region` element that `design-atlas.js shell sync` rewrites from canon (built mocks
skipped unless named). `check` binds a shell family once `design/shell/` exists — undeclared,
unknown name, region drift (named to the slot), own `<nav>`/`<header>` in content, missing css
link — as violations at `ratified`/`approved`/`--matrix` and warns at `sketch`.
`shell adopt` (plan table, then `--apply`) migrates pre-shell mocks. The shell canon is
extracted from the approved set at SCAFFOLD (spec 11); genesis authors `AppShell` from it and
`/spec:design`'s worker envelope carries `shell`.

## Render gate (2026-08-24, specs/20260824/01)

Fidelity between a mock and its component is judged at the render by `render-gate.js`
(`spec-paths render-gate`): the host's `design.render.capture` command turns a URL into an
inventory using the plugin's `render-inventory.browser.js` (painted text, roles, boxes,
`srOnly`/`fixed`/`outOfFlow`/`dataPositioned` flags); `render-compare.js` matches painted
text by LCS over in-flow entries, reports `text-missing`/`text-extra`/`order`/`role`/
`positioning`/`geometry` findings with tolerances `{dx 1%, dw 1%, dh 15%}` and `dyRel`
disabled, auto-excuses static-control→link with a `📌` line, and never computes pixels.
Story ids per mock state live in `.claude/design-coverage.json` claims (`stories`). The
matrix is `design/targets.json`, fail-closed when absent. `/spec:review` runs the gate as an
advisory evidence leg on designed specs when `design.render` is declared.

## Mock hygiene and marks (2026-08-24, specs/20260824/03)

At `ratified`/`approved` (equivalent for every consumer), `design-atlas.js check` enforces a
universal `border-box` reset, a declared `line-height` wherever a block declares `font-size`,
no `border`/`border-radius` on the `[data-screen-label]` root, and state controls placed
outside the contract — plus the matrix rules (viewport meta, dark block). The mark vocabulary
a mock declares is `data-screen-label` (root, one per file), `data-status`,
`data-state-btn="<state>"`, `data-contract="none"` (non-contract subtree), and
`data-positioned` (children placed from data). The matrix expansion runs at `/spec:sketch`
exit — expand, `check --matrix`, render the matrix screenshots, then ratify — so ratification
is the single stamp that makes a mock render-gate-ready.

## Executable design rules (2026-08-24, specs/20260824/04)

`design-rules.json` entries may carry a `renderCheck` object with a closed `kind` set —
`target-size {min}`, `cta-count {max, tokens[]}`, `contrast {min, minLarge}`, `palette {}`;
an unknown kind is a manifest error, and entries without one are counted as `source-side=<n>`,
never silently dropped. `render-rules.js` (`spec-paths render-rules`) executes them over render
inventories against a palette resolved from `tokens.css` (hex / `rgb()` / one-level `var()`,
both the light and `[data-theme="dark"]` blocks; anything else is one advisory `unresolvable`
line). `render-inventory.browser.js` supplies `effectiveBackground` (nearest non-transparent
ancestor-or-self background) and `fontWeight` at `schemaVersion` 1. `render-gate.js` runs the
rules over every component inventory when the host declares `design.rulesManifest` — findings
print under the cell and fail the gate; no manifest prints one skip line — and its
`--mocks <mock>…` mode captures mocks only (no ledger, no comparison) so `/spec:sketch` exit
runs the same rules over the mock render. The Sonnet rule-checklist walk is retired from sketch
exit, the design gate, and `/spec:review`'s design leg; the checklist survives only at the
explore stage, which precedes `design-rules.json` and so has no manifest to execute.

## Provenance ledger (2026-09-02, specs/20260902/06)

The mocks ledger, `design/mocks/ledger.md`, is a markdown file with fixed-word columns parsed
by `spec/scripts/lib/mocks-ledger.js` (`parseLedger`, `gateVerdict`, `countsLine`,
`appendAssumption`, `appendCatch`, `setStatus`; grammar in `spec/doctrine/mocks.md`, resolved
via `spec-paths shared-mocks`; empty ledger at `spec/templates/mocks-ledger.md`). Two tables:
Assumptions (`id · step · kind · claim · tag · status · rejected · dependents · note`) and
Misunderstandings (`id · what · step · cost · note`). Every enum cell is one fixed word — tag
`said-by-user|ratified-doc|inferred|invented`, status `open|confirmed|overridden|decided`
(+ optional ISO date), kind `product|process` — and free text lives only in `claim`,
`rejected`, and `note`. A product row that is `invented` (not `overridden`) or `inferred` +
`open` blocks every advance; `ratified-doc` rows and every `process` row never block and are
counted on the fixed `📒 ledger:` line. A ledger that does not parse never opens a gate. The
lib is the one writer of rows: edits rewrite only the touched row and leave every other byte
identical; a literal pipe inside a cell is written `\|`.

## The mocks command (2026-09-02, specs/20260902/07)

`/spec:mocks` is the standalone design stage. `spec/scripts/mocks-driver.js` (`spec-paths
mocks-driver`) derives SEED → SHAPES → WIREFRAMES → THEME → SKIN → REVIEW → APPROVED from
`design/mocks/status.json` (schemaVersion 1) plus the artifacts on disk, prints exactly one step
(`Read only:` + `Doctrine:` lines), checkpoints every accepted mark (`✅ checkpoint — mocks state
saved (<prev> → <next>); safe to /clear and re-run /spec:mocks`, preceded by the `📒 ledger:`
counts line), gates every advance on the provenance ledger (`gateVerdict`, refusing on
`open:false` and naming the rows), and records a sub-mark per journey (`journey-drawn`,
`journey-approved`, `journey-skinned`, `journey-reviewed`), per theme direction
(`direction-composed`), and `--reopen journey:<j>|shapes|theme` (recorded, printed, nothing
deleted). The 13 seed fact keys are closed (`primary-surface platforms-horizon tenancy offline
realtime ai-in-loop residency payer day-one-integrations scale-outage vendor-limits retention
legal-floor`), each mapped in `seed.md ## Facts` to a confirmed `product` ledger row. Registers
are link signatures: a wireframe links `design/wire/tokens.css` + `wire.css` (copied from
`spec/templates/mocks/` at `canon-written`), a skinned screen links `design/tokens.css` and no
`wire/` stylesheet; `theme-picked` copies the chosen `design/theme/<k>/tokens.css` into place.
THEME opens with a direction interview — 2–3 candidate directions derived from the seed and
asked, never fixed anchors — recorded as the `theme-directions` product row. The driver's
`ledger add|set|catch|check|counts` subcommands are the only writers of `design/mocks/ledger.md`.
SSH rule: `design-atlas.js serve` serves `design/` statically and prints
`serving http://localhost:<port>/atlas/index.html — remote: ssh -L <port>:localhost:<port> <host>`;
the driver's own look is `mocks-driver.js look <label> [--state <s>]` through the Playwright
CLI (`look-probe` gates every screen-producing state unless `look-via browser` was declared).
`design-atlas.js build` renders seed journeys (owner `seed:<journey>`), one frame per
`data-state-btn` state, a `shapes` section, and skips `references/`. Greenfield chain:
`/spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`.
