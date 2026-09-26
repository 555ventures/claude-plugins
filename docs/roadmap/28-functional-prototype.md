# 28 — Functional prototype per brief: freeze the render, keep the data layer, delete the UI, rebuild against it

Phase: P2 · Depends on: 27, 30 · Primary workspaces: spec/commands/{prototype,run,plan}.md (new
prototype), spec/scripts/{prototype-driver,spec-build-driver,spec-review-driver}.js,
spec/scripts/lib/{freeze,pins}.js (new), git/commands/merge.md, spec/doctrine/stages/stage-build.md,
spec/templates/spec.md, tests · Risk: T2 (new command, new files under design/prototypes/;
run and merge gain one refusal each; a `harden/<brief>` branch enters the flow) ·
Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030), rewritten the same day from the ratified list. Third
     in execution order (27 → 30 → 28): a prototype applies the kit, so the kit must exist.
     Runs without the hosted service: pins land in a local file; brief 29 adds the PNG round
     as an optional second sink. The behaviour lane's rules live here. -->

## Result

`/spec:prototype <brief>` opens a throwaway worktree on `proto/<brief>` with a Neon dev branch,
runs the host app locally (exposed through Tailscale only when someone else must see it), and
iterates with the user across as many sessions as the brief needs: every round cold-starts
from disk, shows two or three variants where the session is unsure, and takes reactions as
notes (optional anchor = stable id; no anchor = screen note; screen, state, note, who, round)
written to `design/prototypes/<brief>/pins.json`. The prototype is **functional and on the
kit**: behaviour and data work, screens import composites only. On the user's approval the
driver **freezes**: refuses unless the kit gates are green, captures every route and declared
state with RefDiff (element tree + computed styles, by stable id), records the stable ids,
route names and state names as the contract, derives end-to-end tests from behavioural pins,
**exports the data and API layer** (schema, migrations, endpoints, their tests) to
`harden/<brief>`, then deletes the worktree and `proto/<brief>`. The build runs from main and
reads only the brief, the pins, the captures, the tests and `harden/<brief>`: the UI is rebuilt
and must pass the RefDiff gate route by route; the data and API layer is merged from
`harden/<brief>` and hardened in place through brief 27's naming and kit gates. `/spec:run`
refuses to start a build for a brief whose `proto/<brief>` still exists; `/git:merge` refuses
any `proto/*` branch. A behaviour-lane brief carries no plan document beyond the data/API
sub-plan.

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
workflows keep and harden, so the UI rebuild is a bet, guarded by the capture gate and measured
on the first two runs. The data-layer exception exists because a schema built twice is two
products (ADR-0030 option B, kept for that layer only).

## Scope

1. **The command and the pin overlay** (spec 01) — `prototype-driver.js` derives the step from
   `design/prototypes/<brief>/status.json` + disk: OPEN (worktree `proto/<brief>`, Neon dev
   branch through a host-declared script, local run) → ROUND n (variants, pins in, changes
   applied, round appended) → APPROVED → FROZEN → CLOSED. The overlay is one embeddable script
   the host app loads in development: tap an element, outline, note, numbered pin, batch send
   to a local endpoint the driver runs only during a round (no resident process). Stable ids
   come from the intent-named composites (brief 30) plus a dev-only source-location stamp; the
   React 19 mapping is spec 01's executed spike. ADR-0030 (e) binds: one note model, optional
   anchor; behavioural pins become tests.
2. **Freeze, export and the contract** (spec 02) — `lib/freeze.js`: refuse unless the host gate
   command is green on the prototype tree (so the capture is kit structure, never raw
   markup); RefDiff capture per route × state into `design/prototypes/<brief>/captures/`; a
   `contract.json` naming stable ids, routes, states and the pins marked `test`; derived
   Playwright tests under the host's e2e dir (red until the rebuild passes); the data/API
   export as `harden/<brief>` (paths declared by the host's config: schema, migrations, API,
   their tests) created **before** deletion; then worktree + `proto/<brief>` deletion and a
   ledger row. A prototype cannot freeze without a fixture per declared state. ADR-0030 (h)
   binds: nothing under `proto/<brief>` is read after CLOSED; `harden/<brief>` is the only
   survivor.
3. **The build reads the freeze** (spec 03) — the build driver's behaviour lane: input = brief +
   pins + captures + tests + contract + `harden/<brief>`; UI rebuilt from main; RefDiff gate
   route by route, a diff either accepted by the user at a look stop or sent back; the data/API
   sub-plan is a fenced block in the brief (schema, endpoints, migrations) merged from
   `harden/<brief>` and hardened with tests first, through the naming gate; `/spec:run`
   refuses while `proto/<brief>` exists; `/git:merge` refuses `proto/*`; the review stage's
   rubric gains the pattern-table citation. Measurement AC: the first two prototype runs record
   round count and post-rebuild diff count in the ledger.

## Out of scope

- The PNG round to walkthrough for client viewing — brief 29 (the overlay's sink gains a
  second target; the overlay itself does not change).
- Railway preview environments and SQLite — rejected by JJ on 2026-09-24: local run, one
  database engine.
- Discovery prototypes before a seed exists — outside the pipeline by ruling (2026-09-24):
  findings into the seed by hand, code discarded; the seed template gets one provenance line.
- Root-cause grouping of cascaded diffs — cut by JJ on 2026-09-24.
- Design decisions (tokens, kit, pattern table, naming table) — brief 30 owns them; a
  prototype applies them.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (d), (e), (h), and the rewrite-versus-harden
  ruling per layer.
- docs/adr/0028-the-mock-is-the-app.md — superseded; a prototype is a branch of the product,
  never a second app.
- .claude/rules/spec-pipeline.md § Worker Rules — the driver spawns RefDiff and Playwright in
  the host, never imports them.
- spec/doctrine/stages/stage-build.md — the build driver the behaviour lane extends.
- docs/spikes/20260923-design-retool/spike-structdiff.md, structsnap.mjs, structdiff.mjs —
  the structural diff evidence; the 2026-09-24 research notes (RefDiff, annotation tools,
  prototype-to-production handoff) — copied under docs/spikes/ by spec 01.

## Open questions for planning

- Neon dev branch per prototype: created by the driver through the Neon CLI, or declared by
  the host's own scripts. Default: the driver calls a host-declared script name from
  `.claude/spec.config.json`; no Neon-specific code in the plugin.
- Variants: separate routes in one worktree, or sibling worktrees. Default: routes; one
  worktree per brief.
- Which pins become tests: user marks at the round, or every behavioural pin by default.
  Default: every pin whose note names a behaviour; the user unmarks.
- The data/API export boundary: path globs in the host config, or the host's workspace
  layout. Default: globs in the config, verified by doctor.
