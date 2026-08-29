---
description: Greenfield genesis entry point, driver-stepped — genesis-driver.js derives state from status.json plus on-disk artifacts and prints the one step needing this session's judgment; loops DISCOVERY through HANDOFF, checkpointing after every accepted mark so the run is /clear-safe
argument-hint: <project idea — what you want to build, for whom>
---

# Genesis: The Driver-Stepped Entry Point

The sole greenfield entry point. `genesis-driver.js` (`spec-paths genesis-driver`) owns the
architect stage's sequencing — status initialization, the coverage-audit gate, the registry
check per menu, the decision-record closure check, the scaffold command, the zero-day gate, the
roadmap closure check — executing every deterministic step itself and printing exactly one step
at a time for the judgment only this session can make. This command is a thin shell: it names
where each printed step's doctrine lives and assembles the HANDOFF report; it never restates
the driver's own choreography.

**Intended model: Opus** (the genesis judgment concentration point).

**Setup:** run `spec-paths shared-for genesis` and read its output (the shared invariants
scoped to this command); run `spec-paths shared-genesis` and Read it too — the genesis-stage
supplement covers the archetype registry, the decision-record doctrine, discovery interview,
the state machine, and the on-disk handoff. Run `spec-paths genesis-driver` once and keep the
printed absolute path as `{driver}`; run `spec-paths wf-research` once and keep its path as
`{scriptPath}` — it is what the MENUS step's research call is invoked by.

**Greenfield-only.** If the target directory already holds a real codebase (source files
beyond config/scaffold), STOP and tell the user to run `/spec:init` directly — this is a
judgment about "a real codebase," not a file count, so it stays in this command rather than
the driver.

## Input

`$ARGUMENTS` — a free-form description of what to build and for whom. May be terse; the
DISCOVERY step fills the gaps.

## The driver loop

1. Run `node {driver} --root .`. It prints the current state and exactly one step, opening
   with a `Read only:` file list — never the whole `.claude/genesis/` directory.
2. Do that one step. Its printed `Doctrine:` line names the section of `spec/doctrine/genesis.md`
   governing the judgment.
3. Record it with the step's own printed `--mark …` line. The driver verifies the step's
   artifacts before advancing; a missing or malformed one is refused and demanded again.
4. Re-run `node {driver} --root .`. Repeat until it prints `HANDOFF`.

A dismissed `AskUserQuestion` STOPS the run — never invent the declined answer; state is
already safe on disk. Every accepted mark prints `✅ checkpoint — genesis state saved
(<prev> → <next>); safe to /clear and re-run /spec:genesis` as its last line: the session may
`/clear` after any checkpoint and re-invoke `/spec:genesis` cold — it re-derives everything
from disk, never from chat context.

## HANDOFF report

Assemble the slots object (shared § Console Output Style — `report-render.js` is the sole
render authority; commands assemble slots and print its output verbatim):

- `outcome`: `✅ architected — scaffold green, {N} ADRs, roadmap of {M} briefs`.
- `bullets`: `{archetype} for {audience}; gate: {resolved gate command}`; one
  `{decision made — ADR path}` entry per decision; a `Chain: /spec:genesis →
  /spec:atlas sweep + your holistic atlas review → /spec:init → /spec:enforce →
  /spec:plan docs/roadmap/01-*.md` entry, rendered above the close so the whole sequence is
  visible before the one recommended next step. For an archetype whose design stage is `none`
  (design written `skipped`) the chain bullet drops the atlas link: `Chain: /spec:genesis →
  /spec:init → /spec:enforce → /spec:plan docs/roadmap/01-*.md`.
- `warns`: one `dissent recorded: {one-phrase summary}` entry per dissent (drop if none).
- `next`: `{kind: 'command', text: '/spec:init'}` — every archetype; design is ratified inside
  this same driver run (`DESIGN` state, spec/doctrine/genesis.md § Genesis: Design State), so
  HANDOFF always points at `/spec:init` next.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim. Filled example:

```report
✅ **architected — scaffold green, 3 ADRs, roadmap of 6 briefs**
- web-app for solo creators; gate: npm run typecheck && npm run lint && npm test
- framework: Next.js 15 (App Router) — docs/adr/0001-framework.md
- persistence: Postgres via Neon — docs/adr/0002-persistence.md
- Chain: /spec:genesis → /spec:atlas sweep + your holistic atlas review → /spec:init → /spec:enforce → /spec:plan docs/roadmap/01-*.md
⚠️ dissent recorded: SQLite rejected — no managed backup story for a solo operator

Next: /spec:init
```

## Rules

- **Never Read `wf-research.js`.** Its `args` contract is `{stage, dimensionKeys, briefPath,
  contextPaths}` (genesis.md § Genesis: Discovery Interview) — invoke it by `scriptPath` and
  act on its return; its source is never orchestrator context.
- **Never run the currency check by hand.** Writing a menu file and marking it
  `--mark menu-written --file <f>` is the whole step: the driver runs the registry check itself
  and records its exit. A second hand-run would re-probe registries the driver already resolved
  and write a currency stamp nothing recorded.
- Greenfield-only: a populated repo → STOP, point to `/spec:init`.
- `AskUserQuestion` dismissed → STOP; never invent the declined answer.
- Hard-to-reverse forks always go to the user; never synthesized away.
- `args` to `wf-research` is a control channel — paths, enum keys, booleans only.
- Every `Agent`/workflow `model:` is explicit (Opus session is the sole proposer — shared §
  Model Placement — Sonnet research).
