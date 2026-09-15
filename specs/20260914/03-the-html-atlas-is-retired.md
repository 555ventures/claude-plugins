---
date: 2026-09-14
status: draft
tier: critical
area: design
design: false
breaking: true
depends_on: [specs/20260914/01-the-mock-contract-and-the-driver.md, specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md]
depended_on_by: []
brief: 26
---

# The HTML atlas is retired

## Goal

Every script, library, test, template, fixture and chrome mock of the HTML design system is
deleted, together with `/spec:atlas`, the spec-paths keys and entrypoints rows that named them,
and the test harness that served them. The commit before the deletion is tagged
`atlas-html-final`. Done means: the retired-literal sweep over the plugin, the README and the
canonical docs finds nothing; the whole suite is green with 83 fewer files; the provenance
ledger and the `surfaces` grammar still load; `docs/canonical/design.md` describes one
artifact.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The eight top-level scripts (`design-atlas.js`, `render-gate.js`, `render-rules.js`, `render-capture.js`, `render-compare.js`, `render-inventory.browser.js`, `components-check.js`, `design-ac-reconcile.js`) and the eighteen libraries under `spec/scripts/lib/` listed in the File Plan are deleted outright — never stubbed, never left as a refusing shim. `lib/mocks-ledger.js`, `lib/surfaces.js`, `port-check.js` and `env-preflight.js` stay. (AC-20260914-03-4, AC-20260914-03-6) | A shim would be a third artifact; specs 01 and 02 already removed every caller. |
| D2 | `spec/bin/spec-paths` drops the keys `design-atlas`, `components-check`, `render-gate`, `render-capture`, `render-compare`, `render-inventory`, `render-rules`, `design-ac-reconcile` and the `atlas` case of `shared-for`; the usage line names none of them. A retired key exits 1 with the generic usage line, exactly as `design-hub` does today. (AC-20260914-03-1, AC-20260914-03-5) | A wrong key breaks commands silently; a removed key must fail loudly. |
| D3 | `spec/entrypoints.json` drops the rows of every deleted script and removes `spec/commands/atlas.md` from every `entryPoints` list it appears in (`mocks-driver.js`, `report-render.js`, and any other); `spec/doctrine/stages/stage-design.md` and `spec/commands/sketch.md` stay as entry points where they still invoke the script. (AC-20260914-03-2, AC-20260914-03-8) | The manifest is the inventory the consistency suite trusts. |
| D4 | `spec/commands/atlas.md` is deleted; `README.md`, `spec/.claude-plugin/plugin.json`'s description and `spec/doctrine/core.md` (§ Model Placement's "atlas direction rounds") stop naming `/spec:atlas`; the reviewer's Screens and Journeys tabs are the product map. (AC-20260914-03-4) | The map is the served app now. |
| D5 | `tests/helpers.js` drops `serveAtlas`, `withHandler`, `getJson`/`postJson` when no survivor uses them, and the `lib/client-capture` require; every test file under `tests/mocks/`, `tests/render/`, `tests/design-atlas.test.js`, `tests/design-atlas-index.test.js`, `tests/design-ac-reconcile.test.js`, `tests/mocks/chrome-harness.js` and `tests/fixtures/mocks-notes/` is deleted, except the spec 01 files (`mock-app-fixtures.js`, `mock-cli.test.js`, `mock-contract.test.js`, `mock-driver-states.test.js`, `mock-driver-ledger.test.js`) which stay. `tests/consistency/retired-flags.test.js` loses its three render-gate / design-atlas cases and keeps the registry-check and promise-sweep ones. (AC-20260914-03-3, AC-20260914-03-6) | A pin whose subject is gone is retired, never weakened into passing. |
| D6 | The retired-literal sweep: no file under `spec/`, `README.md` or `docs/canonical/` contains `design-atlas`, `/spec:atlas`, `render-gate`, `render-capture`, `notes-layer`, `walk.json`, `picks.json`, `data-screen-label`, `data-status`, `mocks-kit`, `wire.css`, `viewer.css`, `client-capture`, `design-coverage`, `components-check`, `design-ac-reconcile` (word-boundary matched, `[\w-]` on both sides, so `data-status` never matches `approval-status`); `specs/`, `docs/adr/`, `docs/roadmap/`, `docs/audit/`, `docs/spikes/` and this spec are exempt as history. (AC-20260914-03-4) | The same discipline every retirement here has used; the boundary rule is the tenth gotcha's lesson. |
| D7 | `design/atlas/`, `design/chrome-mocks/`, `design/client-mocks/` and `docs/spikes/23-atlas-index-nav/` are deleted; `spec/templates/mocks-kit.html`, `spec/templates/mocks/` (whole directory), `spec/templates/mocks-canon.md`, `spec/templates/design-rules.json`, `spec/templates/design-targets.json` are deleted; `spec/templates/mocks-ledger.md` and `mocks-seed.md` stay. (AC-20260914-03-6) | This repo's own chrome mocks were the design source of pages that no longer exist. |
| D8 | `docs/canonical/design.md` is rewritten to spec 02's Canonical Delta (one artifact; the design stage's four steps; sketch's sweep loop; genesis and the mock app) and `docs/canonical/scripts.md` drops the deleted scripts' rows and adds `lib/mock-cli.js`; both are File Plan rows here because the delete and the rewrite must land in one commit. [no-ac: docs; AC-20260914-03-4 pins the literals] | The canonical doc must not describe deleted code for even one commit. |
| D9 | Before the deletion commit the orchestrator runs `git tag atlas-html-final <the build's diff_base sha>` and pushes the tag with the merge-back; the tag is the only surviving reference to the HTML system. [no-ac: git operation; the orchestrator duty line below] | Git keeps the old system; main carries one model. |
| D10 | `lib/mocks-ledger.js` and `lib/surfaces.js` load and behave unchanged; the 🧭 misunderstandings line in `spec-status.js` continues to print. (AC-20260914-03-7) | The two survivors are pinned so the delete cannot take them by accident. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | DELETE | scripts | D1 |
| spec/scripts/render-gate.js | DELETE | scripts | D1 |
| spec/scripts/render-rules.js | DELETE | scripts | D1 |
| spec/scripts/render-capture.js | DELETE | scripts | D1 |
| spec/scripts/render-compare.js | DELETE | scripts | D1 |
| spec/scripts/render-inventory.browser.js | DELETE | scripts | D1 |
| spec/scripts/components-check.js | DELETE | scripts | D1 |
| spec/scripts/design-ac-reconcile.js | DELETE | scripts | D1 |
| spec/scripts/lib/notes-layer.browser.js | DELETE | scripts | D1 |
| spec/scripts/lib/walk-page.js | DELETE | scripts | D1 |
| spec/scripts/lib/review.browser.js | DELETE | scripts | D1 |
| spec/scripts/lib/walk.browser.js | DELETE | scripts | D1 |
| spec/scripts/lib/shell-region.js | DELETE | scripts | D1 |
| spec/scripts/lib/mocks-notes.js | DELETE | scripts | D1 |
| spec/scripts/lib/review-page.js | DELETE | scripts | D1 |
| spec/scripts/lib/mock-seed-checks.js | DELETE | scripts | D1 |
| spec/scripts/lib/mocks-exclusions.js | DELETE | scripts | D1 (spec 01 A4) |
| spec/scripts/lib/client-capture.js | DELETE | scripts | D1 |
| spec/scripts/lib/mocks-picks.js | DELETE | scripts | D1 |
| spec/scripts/lib/notes-anchor.browser.js | DELETE | scripts | D1 |
| spec/scripts/lib/mocks-walk.js | DELETE | scripts | D1 |
| spec/scripts/lib/stop-block.js | DELETE | scripts | D1 |
| spec/scripts/lib/kit-layers.js | DELETE | scripts | D1 |
| spec/scripts/lib/wire-register.js | DELETE | scripts | D1 |
| spec/scripts/lib/wire-roles.js | DELETE | scripts | D1 |
| spec/scripts/lib/walk-mode.browser.js | DELETE | scripts | D1 |
| spec/bin/spec-paths | MODIFY | scripts | D2 |
| spec/entrypoints.json | MODIFY | other | D3 |
| spec/commands/atlas.md | DELETE | doctrine | D4 |
| spec/doctrine/core.md | MODIFY | doctrine | D4: § Model Placement wording |
| README.md | MODIFY | other | D4 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D4 description; `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| spec/templates/mocks-kit.html | DELETE | doctrine | D7 |
| spec/templates/mocks/* | DELETE | doctrine | D7 (viewer.css, wire.css, wire-tokens.css, project.css) |
| spec/templates/mocks-canon.md | DELETE | doctrine | D7 |
| spec/templates/design-rules.json | DELETE | doctrine | D7 |
| spec/templates/design-targets.json | DELETE | doctrine | D7 |
| design/atlas/index.html | DELETE | other | D7 |
| design/chrome-mocks/* | DELETE | other | D7 |
| design/client-mocks/* | DELETE | other | D7 |
| docs/spikes/23-atlas-index-nav/* | DELETE | other | D7 |
| docs/canonical/design.md | MODIFY | other | D8 rewrite |
| docs/canonical/scripts.md | MODIFY | other | D8 rows |
| tests/helpers.js | MODIFY | tests | D5 |
| tests/mocks/atlas-card-height.test.js | DELETE | tests | D5 |
| tests/mocks/client-region.test.js | DELETE | tests | D5 |
| tests/mocks/client-walk-route.test.js | DELETE | tests | D5 |
| tests/mocks/exclusions-route.test.js | DELETE | tests | D5 |
| tests/mocks/kit-layers.test.js | DELETE | tests | D5 |
| tests/mocks/mocks-exclusions.test.js | DELETE | tests | D5 |
| tests/mocks/notes-layer-interaction.test.js | DELETE | tests | D5 |
| tests/mocks/notes-layer-isolation.test.js | DELETE | tests | D5 |
| tests/mocks/notes-layer-navigation.test.js | DELETE | tests | D5 |
| tests/mocks/notes-reanchor.test.js | DELETE | tests | D5 |
| tests/mocks/review-board-card.test.js | DELETE | tests | D5 |
| tests/mocks/review-browser.test.js | DELETE | tests | D5 |
| tests/mocks/review-chrome.test.js | DELETE | tests | D5 |
| tests/mocks/review-page.test.js | DELETE | tests | D5 |
| tests/mocks/screen-page-phone.test.js | DELETE | tests | D5 |
| tests/mocks/screen-page.test.js | DELETE | tests | D5 |
| tests/mocks/walk-page.test.js | DELETE | tests | D5 |
| tests/mocks/wire-register.test.js | DELETE | tests | D5 |
| tests/mocks/chrome-harness.js | DELETE | tests | D5 |
| tests/render/render-gate.test.js | DELETE | tests | D5 |
| tests/render/render-compare.test.js | DELETE | tests | D5 |
| tests/render/render-rules.test.js | DELETE | tests | D5 |
| tests/design-atlas.test.js | DELETE | tests | D5 |
| tests/design-atlas-index.test.js | DELETE | tests | D5 |
| tests/design-ac-reconcile.test.js | DELETE | tests | D5 |
| tests/fixtures/mocks-notes/notes.sample.json | DELETE | tests | D5 |
| tests/consistency/retired-flags.test.js | MODIFY | tests | D5: three cases removed |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260914-03-1 (rewrite), AC-20260914-03-5 (reuse) |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20260914-03-2 (rewrite) |
| tests/consistency/atlas-retired.test.js | CREATE | tests | AC-20260914-03-3, AC-20260914-03-4, AC-20260914-03-6 |
| tests/spec-status.test.js | MODIFY | tests | AC-20260914-03-7 (reuse, tag only) |

Orchestrator duties (outside the table): `git tag atlas-html-final <diff_base>` before the
deletion commit (D9); `node scripts/plugin-bump.js --check` green after the bump;
`node "$(spec-paths citations-check)"` green.

## Contracts

None new. Retired spec-paths keys: `design-atlas`, `components-check`, `render-gate`,
`render-capture`, `render-compare`, `render-inventory`, `render-rules`, `design-ac-reconcile`;
retired `shared-for` command: `atlas`.

## Behavior

Deletion is one batch: scripts, libs, tests, templates, chrome mocks and manifest edits land in
a single commit so no intermediate tree has a manifest row for a missing file or a test for a
missing script. `tests/consistency/dependency-free.test.js` and `entrypoints.test.js` are the
gate's own proof that nothing dangles.

## Acceptance Criteria

- **AC-20260914-03-1**: WHEN `spec-paths render-capture` (and each of the other seven retired keys) runs THE SYSTEM SHALL exit 1 with the generic usage line on stderr naming none of the eight keys → rewrites tests/spec-paths.test.js :: AC-20260905-06-10: spec-paths render-capture prints
- **AC-20260914-03-2**: WHEN `spec/entrypoints.json` is read THE SYSTEM SHALL carry no row whose key is one of the eight deleted scripts and no `entryPoints` entry equal to `spec/commands/atlas.md` → rewrites tests/consistency/entrypoints.test.js :: AC-20260905-06-10
- **AC-20260914-03-8**: WHEN the manifest inventory check runs over the post-deletion tree THE SYSTEM SHALL CONTINUE TO pass in both directions (every executable has a row, every row names an existing file) → reuses tests/consistency/entrypoints.test.js :: AC-20260820-04-1:
- **AC-20260914-03-3**: WHEN `tests/helpers.js` is required THE SYSTEM SHALL export neither `serveAtlas` nor `withHandler` and its source SHALL contain no `client-capture` → writes tests/consistency/atlas-retired.test.js
- **AC-20260914-03-4**: WHEN every file under `spec/`, `README.md` and `docs/canonical/` is scanned with the D6 boundary regex THE SYSTEM SHALL report zero occurrences of each D6 literal (e.g. `spec/commands/mocks.md` containing `design-atlas.js check` → one finding naming the file and literal; the post-change tree → none) → writes tests/consistency/atlas-retired.test.js
- **AC-20260914-03-5**: WHEN `spec-paths shared-mocks` runs THE SYSTEM SHALL CONTINUE TO resolve to `spec/doctrine/mocks.md` carrying a `## Provenance Ledger` heading → reuses tests/spec-paths.test.js :: AC-20260902-06-9
- **AC-20260914-03-6**: WHEN the repository tree is listed THE SYSTEM SHALL contain none of the paths the File Plan marks DELETE (a checked list of 68 paths) and SHALL still contain `spec/scripts/lib/mocks-ledger.js`, `spec/scripts/lib/surfaces.js`, `spec/templates/mocks-ledger.md`, `spec/templates/mocks-seed.md`, `spec/templates/mock/contract.json` → writes tests/consistency/atlas-retired.test.js
- **AC-20260914-03-7**: WHEN `spec-status.js` runs on a root whose `design/mocks/ledger.md` carries catches THE SYSTEM SHALL CONTINUE TO print the 🧭 misunderstandings line → reuses tests/spec-status.test.js :: AC-20260902-11-6

## Assumptions (escalation triggers)

- A1: After specs 01 and 02 land, no file outside the File Plan requires any deleted script or lib (grep 2026-09-14 of `require(` across `spec/scripts` and `tests/`: the only survivors touching the set are `tests/helpers.js` and `genesis-driver.js`, both rewired by 02/03). — **if false:** the requiring file is a fix row in the same batch; never a shim.
- A2: `tests/consistency/read-load.test.js`'s roster derives the command list from `spec/commands/*.md`, so deleting `atlas.md` needs no roster edit. — **if false:** remove `atlas` from its table in the same batch.
- A3: The retired-literal sweep's exemption list matches the existing sweep's `waivedPrefixes` (`specs/`, `docs/roadmap/`, `docs/audit/`, `docs/adr/`) plus `docs/spikes/`; `docs/canonical/` is deliberately NOT exempt (pipeline rules § Gotchas, last entry). — **if false:** never widen the exemption; fix the doc.
- A4: 68 DELETE rows: 8 scripts + 18 libs + 1 command + 8 templates (mocks/ counted as 4) + 6 chrome mocks + 4 spike files + 22 test files + 1 fixture — the checked list AC-6 pins is generated from this File Plan at build. — **if false:** the list is corrected to the tree; the count is not a contract.

## Rationale

This spec is the deletion the first two made safe. It is a separate landing unit because a
tree with the new driver and the old atlas is green, while a tree with neither is not, and
because a 68-file delete reviewed together with a driver rewrite would hide either. Every
decision here is mechanical except the literal sweep, which is the guard that the next
session's memory or a doctrine paragraph cannot resurrect a deleted script by name. The tag
replaces every argument for keeping a parallel directory: the history is one checkout away.

Rejected: keeping `lib/mocks-exclusions.js` (spec 01 retired its only caller); keeping the
render family behind a flag (a flag is a shim); a two-commit delete (scripts first, tests
second) — an intermediate tree with orphan tests is exactly what the consistency suite refuses.

The File Plan exceeds the decomposition cap by row count; every row above the cap is a DELETE
with no authored content, and one batch is the only shape in which the consistency suite can
stay green (Behavior).

## Canonical Delta

`docs/canonical/scripts.md`: the rows for the eight deleted scripts are removed; the note that
`design-atlas.js` folds the `surfaces` grammar is rewritten to name `genesis-driver.js` alone.
`docs/canonical/design.md`: as spec 02's delta, landed here as a file row (D8).
`docs/canonical/pipeline.md`: any mention of `/spec:atlas` in the command roster is removed.
