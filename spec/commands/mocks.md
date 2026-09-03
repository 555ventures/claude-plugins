---
description: Standalone design-stage entry point, driver-stepped — mocks-driver.js derives state from design/mocks/status.json plus disk and prints the one step needing this session's judgment; loops SEED through APPROVED, checkpointing after every accepted mark so the run is /clear-safe
argument-hint: (no arguments — the driver derives everything from disk; SEED prompts for the product idea if the seed is blank)
---

# Mocks: The Driver-Stepped Design Entry Point

The standalone design-stage entry point, ahead of `/spec:genesis` and any roadmap. `mocks-driver.js`
(`spec-paths mocks-driver`) owns the state's sequencing — status derivation, ledger gating on
every advancing mark, journey/direction sub-marks, the look-reachability precondition — printing
exactly one step at a time for the judgment only this session can make. This command is a thin
shell: it names where each printed step's doctrine lives, runs the THEME interview and the
look/serve rule below, and assembles the APPROVED report; it never restates the driver's own
choreography.

**Intended model: Sonnet** (drawing and skinning screens one at a time; escalate to Opus only
for a genuinely hard-to-reverse product-facts fork).

**Setup:** run `spec-paths shared-for mocks` and read its output (the shared invariants scoped
to this command — Host Grounding, Model Placement, Decisions, Question Style, Console Output
Style, MCP Policy, plus Design Canon and Design Atlas); run `spec-paths shared-mocks` and read
it too — the mocks-stage supplement covers the provenance ledger, the state machine, the seed
grammar, the checkpoint contract, and the look/serve rule. Run `spec-paths mocks-driver` once
and keep the printed path as `{driver}`.

## Input

None required. A cold root has no `design/mocks/status.json`; the driver creates it at SEED
and the SEED step tells you to fill in `design/mocks/seed.md` from the seed of an idea the user
gives you, if it's not already clear from the repo.

## The driver loop

1. Run `node {driver} --root .`. It prints the current state and exactly one step, opening
   with a `Read only:` file list — never the whole `design/mocks/` directory.
2. Do that one step. Its printed `Doctrine:` line names the `## Mocks: …` section of
   `spec/doctrine/mocks.md` (or `## Design Canon` / `## Design Atlas` of `design.md`) governing
   the judgment.
3. Record it with the step's own printed `--mark …` line. The driver verifies the step's
   artifacts before advancing; a missing or failing one is refused and demanded again, naming
   what's missing.
4. Re-run `node {driver} --root .`. Repeat until it prints `APPROVED`.

A dismissed `AskUserQuestion` STOPS the run — never invent the declined answer; state is
already safe on disk. Every accepted mark ends with the ledger's counts line and
`✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks`:
the session may `/clear` after any checkpoint and re-invoke `/spec:mocks` cold — it re-derives
everything from disk, never from chat context.

## THEME interview rule

The THEME step opens with a direction interview, not a fixed menu: derive 2–3 candidate
directions from the seed's product, audience, and references, and `AskUserQuestion` which to
compose — never anchor on a stock pair (warm/cool, playful/serious). Record the picks as the
`theme-directions` product row the driver's step text names, then run `--mark
direction-composed --direction <k>` per direction once its tokens and ≥3 screens exist. Once
≥2 directions are composed, `--mark theme-picked --direction <k>` needs a `theme` row whose
`rejected` cell names every other composed direction — the user's stated reason for not
picking them, not a silent drop.

## SSH / look rule

Everything here works over a forwarded port: `design-atlas.js serve` (`spec-paths
design-atlas`) serves `design/` statically and prints the port-forward line first — hand the
user that line, never a different access path. Before SHAPES, WIREFRAMES, THEME, or SKIN the
driver itself runs the look-reachability probe; if it refuses, either fix the named remedy
(`npx playwright install chromium`) or, when a browser MCP is the session's real look path,
`ToolSearch` for the `claude-in-chrome` (or equivalent) tools and record `mocks-driver.js
look-via browser` before re-running. To actually look at a screen, use `mocks-driver.js look
<label> [--state <s>]` (writes a PNG under `design/mocks/.looks/`) or the browser MCP you
declared — never approve a journey or a direction on the HTML source alone.

## Report

Printed once the driver reaches `APPROVED`. Assemble the slots object (shared § Console Output
Style — `report-render.js` is the sole render authority):

- `outcome`: `✅ mocks approved — {N} journeys, theme "{direction}", decider {name}`.
- `bullets`: `{journey}: {M} screens` per journey; `theme: {direction} — rejected {others}`;
  `Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`.
- `warns`: one `catch: {what}` entry per ledger misunderstanding row logged this run (drop if
  none).
- `next`: `{kind: 'command', text: '/spec:genesis'}`.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim.

## Rules

- **Never restate the driver's derivation.** Read its printed step and doctrine citation; act
  on them. Re-deriving state by hand from `status.json` is the class of bug the driver exists
  to prevent.
- Canon before screens, screens before theme, theme before skin — the driver refuses out of
  order; this command never works around a refusal by editing `status.json`.
- `AskUserQuestion` dismissed → STOP; never invent the declined answer.
- The ledger (`design/mocks/ledger.md`) is written only through the driver's `ledger`
  subcommands — never hand-typed.
- Every `Agent`/workflow `model:` is explicit (shared § Model Placement).
