# 26 — The mock is the app: React + shadcn screens as the product's own source, a separate reviewer package, and the HTML atlas retired

Phase: P2 · Depends on: 22a (successor — premise changed via ADR-0028) · Primary workspaces:
spec/scripts/{mocks-driver,genesis-driver}.js, spec/scripts/lib/mock-cli.js, spec/templates/mock/,
spec/doctrine/{mocks,design}.md, spec/doctrine/stages/{stage-design,stage-review}.md,
spec/commands/{mocks,sketch,genesis,plan,init}.md, spec/bin/spec-paths, spec/skills/mock-authoring,
docs/canonical/design.md, tests · Risk: T3 (spec-paths keys and the grounding contract's
`design` block change; 83 files and ~27,000 lines are deleted; no host has data on the old path) ·
Design stage: no · Expected specs: 3

<!-- Minted 2026-09-14 by the planning session that locked specs/20260914/01–03, from JJ's
     ruling that no project ever used /spec:mocks and the 2026-09-13/14 React reviewer spike.
     The reviewer package itself (@555/mock-review) is planned in its own repository. -->

## Result

A greenfield product starts as a Vite + React + shadcn app whose screens, shells, project
components, records and journeys are the product's own source. `/spec:mocks` drives
SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED over that app, reading a separate reviewer
package's files through one versioned contract and printing one sweep per round: the component
inventory, the red notes and journeys resolved to file and line, and the check's failures.
Genesis, `/spec:sketch` and the run design stage read `design/approval.json` and the check's
JSON, never HTML. The HTML atlas, notes layer, client player, kit, wire register, render gate and
`/spec:atlas` no longer exist; the last commit carrying them is tagged `atlas-html-final`.

## Current state

`/spec:mocks` is a 2,683-line driver over gray HTML wireframes served by a 3,233-line atlas with
an injected notes layer, a client player and a render gate — 13,497 script lines and 8,390 test
lines, none used by any host (every host entered through `/spec:init`). Genesis reads
`design/mocks/status.json`, `seed.md`, `ledger.md` and the unresolved-note count; the run design
stage reads `design_source`, `.claude/design-coverage.json` and runs `render-gate.js`;
`/spec:sketch` and `/spec:atlas` build and serve the atlas. The provenance ledger
(`lib/mocks-ledger.js`, `design/mocks/ledger.md`) and the `surfaces` grammar (`lib/surfaces.js`)
are sound and stay. The spike proved the two load-bearing mechanics by execution (ADR-0028).

## Scope

1. **The contract and the driver** (spec 01) — `spec/templates/mock/contract.json` names the
   package, the contract version, the CLI verbs, the host file layout and the JSON shapes of
   `design/notes.json`, `design/approval.json`, `design/decisions.json`, `check --json` and
   `sweep --json`. `mocks-driver.js` is rewritten over the new states, reads those files through
   `lib/mock-cli.js` (spawns the package's CLI, refuses a contract mismatch), keeps the ledger
   verbs and marks verbatim, and prints the scaffold at SEED (`npx shadcn@4.21.0 init -t vite -b
   radix -p nova`, executed 2026-09-14). `/spec:mocks`, the mocks doctrine sections and a
   `mock-authoring` skill are rewritten to it. ADR-0028 binds: one artifact, four verbs, the
   ledger untouched.
2. **Genesis, run and sketch read the mock app** (spec 02) — genesis's BRIEF/ROADMAP/SKELETON
   preconditions read `design/approval.json` and `check --json`; the run design stage collapses
   to preflight → reconcile → look → stamp with `design_source` naming a screen file or
   `src/screens`, drift detected by the approval hash; `/spec:sketch` becomes the per-brief sweep
   loop with ratification recorded in `approval.json`; the grounding contract's `design` block
   becomes `{ "app": "<dir>" }`; `/spec:init` stops offering the frontend-design skill;
   `docs/canonical/design.md` is rewritten. ADR-0028 (b) binds genesis's inputs.
3. **The HTML atlas is retired** (spec 03) — every script, lib, test, template, fixture and
   this repo's own chrome mocks listed in the retirement inventory are deleted; spec-paths keys,
   entrypoints rows, `tests/helpers.js`'s serve harness and every coupled pin go with them;
   `/spec:atlas` is deleted; the pre-deletion commit is tagged `atlas-html-final`. ADR-0028 binds
   the deletion and the tag.

## Out of scope

- The reviewer package (`@555/mock-review`): its React code, tests and CLI implementation live
  in their own repository and brief. This brief fixes the contract it must satisfy, nothing more.
- Any migration of HTML mocks: none exist in any host.
- Non-React products: no design stage; the doctrine says so plainly.
- Changes to the provenance ledger grammar or `lib/surfaces.js`.

## Grounding

- docs/adr/0028-the-mock-is-the-app.md — the ruling and its consequences.
- docs/adr/0006-mocks-first-genesis.md — genesis still reads an approved product first
  (narrowed by ADR-0028 (b)).
- docs/adr/0026-a-note-is-a-conversation.md — the note thread model the reviewer carries
  forward (red / yellow / blue; a reply returns the turn).
- docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md — project notes still block
  `approved`.
- .claude/rules/spec-pipeline.md § Worker Rules — zero dependencies in this repo's scripts and
  tests; the reason the reviewer is a separate package.

## Open questions for planning

- None open at minting: the planning session that minted this brief resolved package location
  (separate repository), state list (KIT and SHAPES retired), CLI verbs, and deletion-with-tag
  in the same session. The npm scope of the package is an Assumption in spec 01.
