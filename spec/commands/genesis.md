---
description: Greenfield genesis entry point, driver-stepped — genesis-driver.js derives state from status.json plus on-disk artifacts and prints the one step needing this session's judgment; loops DISCOVERY through HANDOFF, checkpointing after every accepted mark so the run is /clear-safe
argument-hint: <project idea — what you want to build, for whom>
---

# Genesis: The Driver-Stepped Entry Point

The sole greenfield entry point. Printed by `genesis-driver.js` (`spec-paths genesis-driver`) at
each state; never restated here.

**Intended model: Opus** (the genesis judgment concentration point).

**Setup:** run `spec-paths shared-for genesis` and read its output; run `spec-paths
shared-genesis --section "State Machine|On-disk Handoff"` and read that too. Every other
supplement section is loaded one step at a time. Run `spec-paths genesis-driver` once and keep
the printed absolute path as `{driver}`; run `spec-paths wf-research` once and keep its path as
`{scriptPath}` — it is what the MENUS step's research call is invoked by.

**Greenfield-only.** If the target directory already holds a real codebase (source files
beyond config/scaffold), STOP and tell the user to run `/spec:init` directly.

## Input

`$ARGUMENTS` — a free-form description of what to build and for whom.

## The driver loop

1. Run `node {driver} --root .`. It prints the current state and exactly one step, opening
   with a `Read only:` file list.
2. Do that one step. Its printed `Doctrine:` line names the section of `spec/doctrine/genesis.md`
   governing the judgment.
3. Record it with the step's own printed `--mark …` line.
4. Re-run `node {driver} --root .`. Repeat until it prints `GROUNDED` — `HANDOFF` is itself one
   of the loop's steps (author `.claude/genesis/init-profile.json`, then `--mark
   profile-written`), not the stop condition.

Every accepted mark prints `✅ checkpoint — genesis state saved (<prev> → <next>); safe to /clear and re-run /spec:genesis` as its last line.

A visual archetype on a Storybook stack stops once more, at `DESIGN_BRIEF` between the green
gate and `ROADMAP` (spec/doctrine/genesis.md § Genesis: Design Stage). Design steps print a
`Session:` line naming a fresh session and a model; every design step names Fable, and a session already on Fable works in place.
**A step naming Fable stops before its work unless this session runs on Fable** (no script can see the active
model — the check is the session's alone): print `/clear`, `/model fable`, re-run `/spec:genesis`, end the turn. To refresh a stale catalog by hand: `node "$(spec-paths catalog-inventory)" --root . --out docs/design/catalog.md`.

## HANDOFF report

Printed once the driver reaches `GROUNDED`. Assemble the slots object (shared § Console Output
Style):

- `outcome`: `✅ architected + grounded — scaffold green, {N} ADRs, {P} convention probes,
  roadmap of {M} briefs`.
- `bullets`: `{archetype} for {audience}; gate: {resolved gate command}`; one
  `{decision made — ADR path}` entry per decision; `designed set: {J} journeys approved <date>`
  when `docs/design/approval.json` exists; a chain entry. For an archetype that owed a mocks
  set (§ Genesis: Archetype Registry): `Chain: /spec:mocks → /spec:genesis → /spec:enforce →
  /spec:plan docs/roadmap/01-*.md`. For one that owed no set (`design` written `skipped` or
  non-visual): `Chain: /spec:genesis → /spec:enforce → /spec:plan docs/roadmap/01-*.md`.
- `warns`: one `dissent recorded: {one-phrase summary}` entry per dissent (drop if none).
- `next`: `{kind: 'command', text: '/spec:enforce'}` — every archetype.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim. Filled example:

```report
✅ **architected + grounded — scaffold green, 3 ADRs, 5 convention probes, roadmap of 6 briefs**
- framework: Next.js 15 (App Router) — docs/adr/0001-framework.md
- Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan docs/roadmap/01-*.md
⚠️ dissent recorded: SQLite rejected — no managed backup story for a solo operator

Next: /spec:enforce
```

## Rules

- **Never Read `wf-research.js`.** Its `args` contract is `{stage, dimensionKeys, briefPath,
  contextPaths}` (genesis.md § Genesis: Discovery Interview) — invoke it by `scriptPath`.
- **Never run the currency check by hand.** Writing a menu file and marking it
  `--mark menu-written --file <f>` is the whole step.
- Hard-to-reverse forks always go to the user; never synthesized away.
- Every `Agent`/workflow `model:` is explicit (shared § Model Placement).
- **BRIEF derives, never guesses.** On a fresh mocks-set run, write `## Journeys` and
  `## Non-UI Coverage` from `design/mocks/seed.md` and the confirmed ledger rows the step
  prints (spec/doctrine/genesis.md § Genesis: Brief State).
