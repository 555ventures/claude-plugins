# 30 — Genesis design stage: the design brief, the kit, and every journey rebuilt on the real stack

Phase: P2 · Depends on: 27 · Primary workspaces: spec/scripts/genesis-driver.js,
spec/commands/{genesis,mocks}.md, spec/doctrine/{genesis,design,mocks}.md,
spec/templates/{genesis-brief,roadmap-brief,mocks-seed}.md, spec/skills/ (design-brief), tests ·
Risk: T3 (genesis gains a stage and a JJ approval stop; the roadmap is derived after design
approval, not after wireframe approval; ADR-0006 is narrowed, ADR-0028 superseded) ·
Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030), rewritten the same day from the ratified list.
     Second in execution order (27 → 30 → 28): the kit must exist before any prototype.
     Three commands, two clocks: the wireframe command (client-paced, through walkthrough),
     genesis (our pace, one approval stop for JJ), the prototype command (per brief). Nothing
     here runs on the wireframe's stack; it runs on the product's. -->

## Result

Genesis starts from an approved wireframe journey set and, after the stack pick, runs a
**design stage** on the product's real stack. Fable writes the design brief: who uses this and
in what context; one jobs-to-be-done line per journey, journeys locked before any entity;
navigation as task-plus-frequency; the installed component catalog read in full; the
intent-to-pattern table; and the naming-convention table with one section per workspace
(code, schema, API routes, wire format at the boundary), each in the chosen stack's idiom.
Fable then authors the tokens, the shell and the intent-named composites with a fixture story
per state, sets up Storybook in the host, and every approved journey is rebuilt as a walkable
journey story (app shell + in-memory router + fixtures). Journey screens may be drawn by Sonnet
from the brief, only after the kit exists and all journeys in one session. Genesis stops for
JJ, who approves in Storybook; a PNG round to walkthrough is optional and never a gate. On
approval genesis derives the roadmap from the designed set. Journey stories are a genesis
artifact: frozen after approval and never gated later; the living showcase is the composites'
state stories. The wireframe stays what it was: a gray throwaway, never referenced after this
stage.

## Current state

Genesis (genesis-driver.js) reads `design/approval.json` and `check --json` at BRIEF and derives
the roadmap from the approved wireframe set (ADR-0006, narrowed by ADR-0028 (b)). `/spec:mocks`
is Sonnet by doctrine and reads each shadcn component's example only when it uses it; no step
reads the catalog whole, no step decides intent-to-pattern, no step writes naming conventions,
no persona or context reasoning exists beyond the seed's product sentence; screens import
`@/components/ui` primitives freely (measured drift: brief 27 § Current state). The user's
standing rule since 2026-09-11 is that Fable owns client-facing design; the mocks doctrine
contradicts it. Research 2026-09-24: JTBD lines and goal-first ordering are the convention
for agent-authored journeys; task-frequency IA is the antidote to list-detail-per-entity;
synthetic users are noise (two 2026 studies); Storybook journey stories via play functions +
memory router are current practice (Red Hat, 2026-04); no maintained flow addon exists.

## Scope

1. **The design brief** (spec 01) — a `design-brief` skill and a DESIGN state between STACK
   (menus) and ROADMAP in genesis-driver.js: inputs are the approved journey set (from
   `design/approval.json` today, from walkthrough's pulled approvals once brief 29 lands), the
   seed, the records and the installed catalog (shadcn's own skill and composition-tree docs
   where present); output is `docs/design/brief.md` (users and context, JTBD per journey, IA as
   task+frequency, catalog vocabulary used and excluded, the intent-to-pattern table, the
   naming-convention table per workspace) and the host's auto-loaded rule file updated from it
   (brief 27's contract). Model: Fable, printed by the driver. ADR-0030 (g) binds: journeys are
   locked in the brief before any entity section exists; the naming table is written here, in
   the stack's idiom, and brief 27's gates read it.
2. **The kit and the journey stories** (spec 02) — tokens, shell, intent-named composites with
   one fixture story per declared state, Storybook (preview-only build) in the host, and one
   journey story per approved journey walking every beat with fixtures; the driver's mark
   requires every approved journey to have a story whose steps equal the seed's beats. Model
   placement: kit by Fable; journey screens may be drawn by Sonnet after the kit exists, all
   journeys in one session, importing composites only (the primitive ban applies here first).
   Rendered on the product's stack, never the wireframe's. ADR-0030 (g) binds: journey stories
   are frozen after approval and not gated afterwards; composites' state stories are the
   living showcase and are gated by brief 27.
3. **The approval stop and the roadmap** (spec 03) — the driver enters AWAITING-DESIGN-APPROVAL
   with one verified Storybook URL for JJ (a look stop), optionally pushes a PNG round to
   walkthrough when brief 29's client is configured, and resumes on JJ's approval; ROADMAP
   then derives from the designed set; the wireframe's approval record is read one last time
   at DESIGN's entry and never after. Doctrine and the driver print "start a fresh session" at
   DESIGN's entry and at the journey-stories step.

## Out of scope

- Non-web stacks: the carrier is a Storybook static export; another stack satisfies the same
  three asks (design contract, a showcase, a deterministic diff) in its own way, in a later
  brief.
- Per-journey deferral inside the design stage and rubric calibration — cut by JJ on
  2026-09-24.
- A mechanical coverage check of approved beats against specs — rejected by JJ on 2026-09-24;
  completeness is his per-brief check.
- Client approval of the designed set — none; JJ approves. Screenshots reach the client through
  brief 29 as an optional round.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (b), (g), (i), the two-clocks ruling.
- docs/adr/0006-mocks-first-genesis.md — narrowed: genesis still reads an approved journey set
  first; the roadmap now derives from the designed set, after JJ's design approval.
- docs/adr/0028-the-mock-is-the-app.md — superseded by ADR-0030 (j); the wireframe's approval
  record is read at DESIGN's entry only, and the mock app retires with brief 29.
- docs/adr/0029-the-client-confirms-the-story.md — the beat hash carried by a journey approval.
- docs/roadmap/02-design-path-model-placement.md — amended: design authorship is Fable;
  journey screens may be drawn by Sonnet after the kit exists.
- docs/roadmap/27-design-canon-retirement.md § Scope 2–3 — the tables this stage authors and
  the gates that read them.
- Research notes 2026-09-24 (JTBD, task-frequency IA, journey stories, synthetic-user
  evidence) — copied under docs/spikes/ by spec 01.

## Open questions for planning

- Whether DESIGN's catalog read is a generated inventory file in the host (composition trees
  fetched once) or a live read each time. Default: generated once at DESIGN, refreshed by
  doctor when the kit changes.
- Whether the journey story's router is the host's real router in memory mode or a small
  story-only switch. Default: the real router in memory mode when it supports it.
- Whether Sonnet's one-session journey drawing is one session per product or one per batch of
  journeys when the set is large. Default: one per product; split only when context forces it.
