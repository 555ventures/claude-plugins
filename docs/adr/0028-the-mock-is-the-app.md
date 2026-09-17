# 0028. The mock is the app

- Status: accepted
- Date: 2026-09-14
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (docs/roadmap/26-react-mock-system.md; the 2026-09-13/14 spike under
  `.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/react-mocks` and its sibling
  `prototypes/mock-review`)
- Applies to: (a) 22a-mocks-is-wireframes — superseded in premise: the gray HTML wireframe,
  its kit canon, the wire register, the atlas, the notes layer, the client player and the
  render gate are all retired; brief 26 is the successor. (b) 22-mocks-first-genesis — narrowed:
  genesis still reads an approved product before writing briefs, but it reads the mock app's
  approval record and journey graph, never `status.json` marks or `data-*` attributes.
  (c) 20-shell-composed-mocks — superseded: the shell is a React component every screen
  imports, and no region sync exists. (d) 08-design-thinning — superseded: fidelity is no
  longer judged at a render of two artifacts, because there is one artifact.
- Amended by: ADR-0029 — the state chain drops CLIENT; the client's walk and confirm happen
  during SCREENS, bound to a hash of the seed's beats.

## Context

Since ADR-0001 the design stage has authored HTML mocks and then measured the real app against
them: a wire register, a kit canon, a shell region byte-synced into every page, a notes layer
injected into served files, a client player, and a render gate comparing captured inventories.
The plugin's own scripts for this are 13,497 lines plus 8,390 lines of tests — 35% of the
plugin — and every one of them exists to keep two artifacts in agreement: the picture and the
product. Three ADRs (0002, 0007, 0016) and eleven specs since 2026-09-05 are repairs to that seam.

JJ's ruling (2026-09-14): no project has ever used `/spec:mocks`; the brownfield hosts came in
through `/spec:init`. There is nothing to migrate, and no user of the HTML flow to keep. The
spike this week rebuilt the reviewer as a React + shadcn app around React + shadcn screens, and
proved two things by execution: a reviewer package added as a dev dependency and mounted only in
development leaves zero reviewer code in the production bundle while every screen ships; and a
component inventory read by react-docgen-typescript prints every project component's props on
one line in under a second. The seam disappears when the mock is the app's own source.

Two constraints shape where the code lives. This repo's scripts and tests are dependency-free by
rule (a non-builtin import anywhere is a hard finding), its gate is `node --test`, and a plugin
reaches a host by being copied into a versioned cache — so a React package inside the plugin
directory would be installed into every host through a path that changes on every plugin
update. The reviewer therefore lives in its own repository and reaches a host app through npm
like any other dev dependency; this plugin owns only the contract between them.

## Options considered

- **A. Keep the HTML system and add a React export.** Rejected: it keeps the seam and adds a
  third artifact.
- **B. React screens, reviewer as a directory of this repo under its own gate.** Rejected on
  distribution: the plugin cache path is not a stable dependency target, and every rule in this
  repo would need a carve-out around one directory.
- **C. React screens as the product's own `src/`, reviewer as a separate package, this plugin
  owns the contract, the driver, the scaffold, the doctrine and the deletion.** Chosen.

## Decision

Option C. The mock app IS the product's own Vite + React + shadcn source: screens under
`src/screens`, project components under `src/components`, shells under `src/shells`, journeys in
`src/journeys.ts`, records under `src/records`. The reviewer is a separate package
(`@555/mock-review`, its own repository) mounted only in development. It owns the review page,
`design/notes.json` and `design/approval.json`, and a CLI with four verbs — `contract`, `sweep`,
`answer`, `check` — plus `serve`. This plugin's `mocks-driver.js` owns the state machine
(SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED), the provenance ledger, and every mark; it
reads the reviewer's files against a versioned contract (`spec/templates/mock/contract.json`)
and refuses a CLI whose contract version differs. Genesis and the run design stage read
`design/approval.json` and `mock-review check --json`, never HTML. The atlas, the notes layer,
the client player, the kit, the wire register, the render gate and `/spec:atlas` are deleted,
and the last commit carrying them is tagged `atlas-html-final`.

The single most important reason: one artifact needs no fidelity gate. Everything the plugin
built to keep the mock and the product in agreement is unnecessary when they are the same files.

## Consequences

- Design output is the first commit of the product, not a reference for it; the design stage
  stops authoring components from mocks and only binds spec ACs to screen states.
- Claude's context per review round drops to a sweep printout (inventory, red items, one screen
  file) instead of a doctrine load plus a served-page read-back.
- Reuse is enforced by the layer lint and the docgen inventory, not by a kit sign-off; KIT is
  retired because stock shadcn is the kit.
- This model fits web products built in React only. A native or backend-only product gets no
  design stage — stated plainly, never bent.
- Two repositories co-evolve behind one contract version; skew is a refusal with a remedy, never
  silent.
- The plugin loses 35% of its script surface and the tests that pinned it; the provenance ledger
  and the `surfaces` grammar survive unchanged.

## Applies to

- 22a-mocks-is-wireframes — superseded (premise changed); successor brief 26.
- 22-mocks-first-genesis — narrowed: genesis reads the approval record and the journey graph.
- 20-shell-composed-mocks — superseded: the shell is a component.
- 08-design-thinning — superseded: no render-time fidelity judgment.

## Dissents

- **Keep the reviewer in this repository under its own gate.** Rejected for distribution and
  rule friction (Options B); recorded because contract co-evolution in one repo is a real
  benefit given up, mitigated by the contract version check.
- **Storybook as the catalog and state runner.** Rejected: it brings its own build, chrome and
  addon model; the notes, journeys and approval flow would live as addons fighting it, and the
  catalog it would replace is a hundred lines.
