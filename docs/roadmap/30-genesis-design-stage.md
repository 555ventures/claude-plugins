# 30 — Genesis design stage: the design brief, the kit, and every journey rebuilt on the real stack

Phase: P2 · Depends on: 27, 29 · Primary workspaces: spec/scripts/genesis-driver.js,
spec/commands/{genesis,mocks}.md, spec/doctrine/{genesis,design,mocks}.md,
spec/templates/{genesis-brief,roadmap-brief,mocks-seed}.md, spec/skills/ (design-brief), tests ·
Risk: T3 (genesis gains a stage and a client gate; the roadmap is derived after design
approval, not after wireframe approval; ADR-0006 and ADR-0028 (b) are narrowed) ·
Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030). Fourth of four. Three commands, two clocks: the
     wireframe command (client-paced), genesis (our pace, pausing at one client gate), the
     prototype command (per brief). Nothing here runs on the wireframe's stack; it runs on the
     product's. -->

## Result

Genesis starts from an approved wireframe set and, after the stack pick, runs a **design
stage** on the product's real stack: the strongest available model writes the design brief
(who uses this and in what context; one jobs-to-be-done line per journey, journeys locked before
any entity; navigation as task-plus-frequency; the installed component catalog read in full; the
intent-to-pattern table), then authors the tokens, the shell, the intent-named composites with a
fixture story per state, sets up Storybook in the host, and rebuilds every approved journey as
a walkable journey story (app shell + in-memory router + fixtures). The preview-only build is
pushed to walkthrough; genesis pauses. When the client's approvals are pulled, genesis resumes
and derives the roadmap from the designed set. The wireframe stays what it was: a gray,
throwaway comprehension pass in the mock app, never referenced after this stage. Model
placement: design brief and kit by Fable; journey screens may be drawn by Sonnet from the
brief.

## Current state

Genesis (genesis-driver.js) reads `design/approval.json` and `check --json` at BRIEF and derives
the roadmap from the approved wireframe set (ADR-0006, narrowed by ADR-0028 (b)). `/spec:mocks`
is Sonnet by doctrine and reads each shadcn component's example only when it uses it; no step
reads the catalog whole, no step decides intent-to-pattern, no persona or context reasoning
exists beyond the seed's product sentence; screens import `@/components/ui` primitives freely
(measured drift: brief 27 § Current state). The user's standing rule since 2026-09-11 is that
Fable owns client-facing design; the mocks doctrine contradicts it. Research 2026-09-24: JTBD
lines and goal-first ordering are the convention for agent-authored journeys; task-frequency
IA is the antidote to list-detail-per-entity; synthetic users are noise (two 2026 studies);
Storybook journey stories via play functions + memory router are current practice (Red Hat,
2026-04); no maintained flow addon exists.

## Scope

1. **The design brief** (spec 01) — a `design-brief` skill and a DESIGN state between STACK
   (menus) and ROADMAP in genesis-driver.js: inputs are the approved wireframe set, the seed,
   the records and the installed catalog (shadcn's own skill and composition-tree docs where
   present); output is `docs/design/brief.md` (users and context, JTBD per journey, IA as
   task+frequency, catalog vocabulary used and excluded, the intent-to-pattern table) and the
   host's auto-loaded design file updated from it (brief 27's contract). Model: the session's
   strongest, printed by the driver. ADR-0030 (g) binds: journeys are locked in the brief
   before any entity section exists.
2. **The kit and the journey stories** (spec 02) — tokens, shell, intent-named composites with
   one fixture story per declared state, Storybook (preview-only build) in the host, and one
   journey story per approved journey walking every beat with fixtures; the driver's mark
   requires every wireframe journey to have a story whose steps equal the seed's beats.
   Rendered on the product's stack, never the wireframe's. ADR-0030 (h) binds: every new screen
   thereafter is a story (the living showcase), and a shared-component change re-runs the
   baseline diff on every story.
3. **The client gate and the roadmap** (spec 03) — the driver pushes the build to walkthrough
   (brief 29's client), enters AWAITING-DESIGN-APPROVAL, and resumes only when pulled approvals
   cover every journey with a matching beat hash; ROADMAP then derives from the designed set;
   the wireframe's `design/approval.json` is read one last time at DESIGN's entry and never
   after. Doctrine and the driver print "start a fresh session" at DESIGN's entry and at the
   journey-stories step.

## Out of scope

- Non-web stacks: the carrier is a Storybook static export; a second stack's export is a
  later brief with one principle line here — the design contract, the showcase and a
  deterministic diff are what the plugin asks for; how is per stack.
- Per-journey deferral inside the design stage — add when a journey is actually far off.
- The design rubric's few-shot calibration — the reviewer gets the short rubric (brief 27);
  calibration waits for examples.
- json-render wireframes — watch (queue); the wireframe stays the mock app's TSX.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (g), (h), model placement, the two-clocks ruling.
- docs/adr/0006-mocks-first-genesis.md — narrowed: genesis still reads an approved product
  first; the roadmap now derives from the designed set, after a second client gate.
- docs/adr/0028-the-mock-is-the-app.md (b) — narrowed: the wireframe's approval record is
  read at DESIGN's entry only.
- docs/adr/0029-the-client-confirms-the-story.md — the beat hash, reused for design approval.
- docs/roadmap/02-design-path-model-placement.md — amended: design authorship is the strongest
  model, drawing may be Sonnet.
- Research notes 2026-09-24 (JTBD, task-frequency IA, journey stories, synthetic-user
  evidence) — copied under docs/spikes/ by spec 01.

## Open questions for planning

- Whether DESIGN's catalog read is a generated inventory file in the host (composition trees
  fetched once) or a live read each time. Default: generated once at DESIGN, refreshed by
  doctor when the kit changes.
- Whether the journey story's router is the host's real router in memory mode or a small
  story-only switch. Default: the real router in memory mode when it supports it.
