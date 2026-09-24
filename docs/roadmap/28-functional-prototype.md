# 28 — Functional prototype per brief: freeze the render, delete the code, rebuild against it

Phase: P2 · Depends on: 27 · Primary workspaces: spec/commands/{prototype,run,plan}.md (new
prototype), spec/scripts/{prototype-driver,spec-build-driver,spec-review-driver}.js,
spec/scripts/lib/{freeze,pins}.js (new), git/commands/merge.md, spec/doctrine/stages/stage-build.md,
spec/templates/spec.md, tests · Risk: T2 (new command, new files under design/prototypes/;
run and merge gain one refusal each) · Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030). Second of four. Runs without the hosted service:
     pins land in a local file; brief 29 swaps the sink. The behaviour lane's rules live here. -->

## Result

`/spec:prototype <brief>` opens a throwaway worktree on its own branch with a Neon database
branch, runs the host app locally, and iterates with the user across as many sessions as the
brief needs: every round cold-starts from disk, shows two or three variants where the session is
unsure, and takes reactions as element-pinned annotations (stable id, screen, state, note, who,
round) written to `design/prototypes/<brief>/pins.json`. On the user's approval the driver
**freezes**: captures every route and declared state with RefDiff (element tree + computed
styles, by stable id), records the stable ids, route names and state names as the contract,
derives end-to-end tests from pins, then deletes the worktree and the branch. The build then
runs from main and reads only the brief, the pins, the captures and the tests: UI is rebuilt
and must pass the RefDiff gate route by route; the data and API layer settled by the prototype
is hardened in place under a short structural sub-plan. `/spec:run` refuses to start a build
for a brief whose prototype branch still exists; `/git:merge` refuses any `proto/*` branch. A
behaviour brief carries no plan document beyond that sub-plan.

## Current state

Nothing in the plugin. The user already does this by hand: `salon-os` carries three dated
prototype worktrees (`salon-os-proto-20260915/17/23`) and a `spike/ux-prototype` branch beside
`main`. Measured 2026-09-23 on salon-os: a Playwright structural snapshot (bounding boxes + 27
computed properties per element, 155 elements) caught a one-step padding change and a one-token
colour change with zero noise across nine no-change runs, ~0.7 s per screen; elements matched by
tree position, which reordering breaks — RefDiff (MIT, CLI + library, matches by role, capture
adapters for live URLs and Storybook, `findings.json`) replaces that script. Research
2026-09-24: no tool turns pinned annotations into acceptance tests; no documented workflow
captures an approved prototype's render as the reference for a from-scratch rebuild; tracer-bullet
workflows keep and harden, so this is a bet, guarded by two gates, with harden-in-place as the
named fallback. Vibe Annotations (Chrome extension + localhost server) is the reference UX for
pins but is localhost-only and cannot run on a phone.

## Scope

1. **The command and the pin overlay** (spec 01) — `prototype-driver.js` derives the step from
   `design/prototypes/<brief>/status.json` + disk: OPEN (worktree `proto/<brief>`, Neon branch,
   local run) → ROUND n (variants, pins in, changes applied, round appended) → APPROVED →
   FROZEN → CLOSED. The overlay is one embeddable script the host app loads in development:
   tap an element, outline, note, numbered pin, batch send to a local endpoint the driver runs
   only during a round (no resident process). Stable ids come from the intent-named components
   (brief 27) plus a dev-only source-location stamp; the React 19 mapping is spec 01's executed
   spike. ADR-0030 (d) binds: pins are the only reaction record; prose notes are pins with no
   anchor and are flagged.
2. **Freeze and the contract** (spec 02) — `lib/freeze.js`: RefDiff capture per route × state
   into `design/prototypes/<brief>/captures/`, a `contract.json` naming stable ids, routes,
   states and the pins marked `test`, derived Playwright tests under the host's e2e dir (red
   until the rebuild passes), then worktree + branch deletion and a ledger row. A prototype
   cannot freeze without a fixture per declared state (the capture can only guard what
   rendered). ADR-0030 (e) binds: nothing under the prototype branch is read after CLOSED.
3. **The build reads the freeze** (spec 03) — the build driver's behaviour lane: input = brief +
   pins + captures + tests + contract; UI rebuilt from main; RefDiff gate route by route, a
   diff either accepted by the user at a look stop or sent back; the data/API sub-plan is a
   fenced block in the brief (schema, endpoints, migrations) hardened in place with tests
   first; `/spec:run` refuses while `proto/<brief>` exists; `/git:merge` refuses `proto/*`; the
   review stage's rubric gains the pattern-table citation. Measurement AC: the first two
   prototype runs record round count and post-rebuild diff count in the ledger; a switch to
   harden-in-place for UI is a one-line config, not a redesign.

## Out of scope

- Remote annotators, preview deployments, the hosted pin store — brief 29 (the overlay's sink
  changes from local file to service; the overlay itself does not).
- Discovery prototypes before a seed exists — outside the pipeline by ruling (2026-09-24): one
  written question, findings into the seed by hand, code discarded; the seed template gets one
  provenance line and nothing else.
- Root-cause grouping of cascaded diffs — deferred until a real diff is noisy.
- Design decisions (tokens, kit, pattern table) — brief 27 owns them; a prototype applies them.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (d), (e), and the rewrite-versus-harden ruling.
- docs/adr/0028-the-mock-is-the-app.md — the product's source is the app; a prototype is a
  branch of it, never a second app.
- .claude/rules/spec-pipeline.md § Worker Rules — the driver spawns RefDiff and Playwright in
  the host, never imports them.
- spec/doctrine/stages/stage-build.md — the build driver the behaviour lane extends.
- Spike reports 2026-09-23 (structural diff, token lint) and the 2026-09-24 research notes
  (RefDiff, annotation tools, prototype-to-production handoff) — copied under docs/spikes/ by
  spec 01.

## Open questions for planning

- Neon branch per prototype: created by the driver through the Neon CLI, or declared by the
  host's own scripts. Default: the driver calls a host-declared script name from
  `.claude/spec.config.json`; no Neon-specific code in the plugin.
- Variants: separate routes in one worktree, or sibling worktrees. Default: routes; one
  worktree per brief.
- Which pins become tests: user marks at the round, or every behavioural pin by default.
  Default: every pin whose note names a behaviour; the user unmarks.
