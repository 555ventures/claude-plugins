---
description: Standalone design-stage entry point, driver-stepped — mocks-driver.js derives state from design/mocks/status.json plus disk and prints the one step needing this session's judgment; loops SEED through APPROVED, checkpointing after every accepted mark so the run is /clear-safe
argument-hint: (no arguments — the driver derives everything from disk; SEED prompts for the product idea if the seed is blank)
---

# Mocks: The Driver-Stepped Design Entry Point

The standalone design-stage entry point, ahead of `/spec:genesis` and any roadmap. `/spec:mocks`
drives a real Vite + React + shadcn app through a separate reviewer package
(`@555-ventures/mock-review`), never a static HTML wireframe. `mocks-driver.js` (`spec-paths
mocks-driver`) owns the state's sequencing, printing exactly one step at a time for this
session's judgment. A thin shell: it names where each step's doctrine lives and assembles the
APPROVED report. **Intended model: Sonnet** (Opus only for a hard-to-reverse product-facts
fork).

**Setup:** run `spec-paths shared-for mocks` and read its output; run `spec-paths shared-mocks
--section "Provenance Ledger|State Machine|Checkpoint contract"` too. Every other supplement
section loads one step at a time — each driver step's `Doctrine:` line names its section, its
`print:` slices exactly it. Run `spec-paths mocks-driver` once, keeping the path as `{driver}`.

**Input:** none required. A cold root has no `design/mocks/status.json`; the driver creates it
at SEED and tells you to fill `design/mocks/seed.md` from the user's idea, if not already
clear. Never ask the user for record data — invent it, awkward cases included, from the seed's
own Product sentence and anything under `design/mocks/references/`.

## The driver loop

1. Run `node {driver} --root .` and read its printed step, `Read only:` file list, and
   `Doctrine:` line naming the governing section.
2. Do that step and record it with the step's own printed `--mark …` line — verified before
   advancing; a missing or failing artifact is demanded again.
3. Re-run. Repeat until `APPROVED`.

Every SHELL, SCREENS or THEME step block carries `Skill: mock-authoring — load it before the
first edit` (spec/skills/mock-authoring/SKILL.md); load it before touching a screen, component
or shell. SEED, CLIENT and APPROVED never carry that line.

## SEED

The driver prints, in order, `Read only: design/mocks/seed.md`, the scaffold command
(`npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s`), `cd app && npm i -D
@555-ventures/mock-review`, and one `cp` line per template file landing `mock.config.ts`, `src/journeys.ts`
and the two starting examples under `app/design/examples/`. Write each seed `## Records` entity
by hand as `app/src/records/<entity>.ts`, then run `node {driver} --root . --mark seed-done`.

## SHELL

`check --json` must report `ok: true` and at least one shell with a non-empty `examples` export
before `--mark shell-drawn` records — there is no separate human stop here; the first journey's
own approval in SCREENS is the shell's approval too.

## SCREENS

One journey at a time, in the seed's own order. Draw the journey's screens and shell wiring,
then loop: run `npx mock-review sweep`, act on the queue top to bottom (journey requests first,
then notes grouped by file), answer each with `npx mock-review answer`, run `npx mock-review
check`, and re-sweep until it prints one line. Then `node {driver} --root . --mark
journey-drawn --journey <j>` and, once every screen and the journey's own conversation are
approved on the served page, `--mark journey-approved --journey <j>`. A journey added to the
seed mid-SCREENS reopens the state rather than letting it silently complete.

## THEME

Author two or three `src/themes/<k>.css` candidates, wait for the pick recorded on the served
page (`approval.theme`), set `theme: "<k>"` in `app/mock.config.ts`, then `node {driver} --root
. --mark theme-picked`.

## CLIENT

`npx mock-review serve` is the user's own process here, started once in their terminal. `client
open` prints the client's URL (`<serve.url>/?client=<config.client.token>`); the client walks
the app, raises notes and confirms each journey. Answer client notes the way you answer any
other (`npx mock-review answer`), `client waive --journey <j> --reason <r>` releases a journey
with no client, and `node {driver} --root . --mark approved` records once every journey is `ok`
or waived and nothing is open.

## Report

Printed once the driver reaches `APPROVED`. Assemble the slots (shared § Console Output Style):
`outcome` (`✅ mocks approved — {N} journeys, signed off by {name}`), `bullets` (`{journey}: {M}
screens` per journey; `Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`), `warns`
(one `catch: {what}` per ledger misunderstanding row, dropped if none), `next` (`{kind:
'command', text: '/spec:genesis'}`). Run `node "$(spec-paths report-render)" --slots <file>`;
print it verbatim.

## Rules

- **Never restate the driver's derivation** — read its printed step and act; re-deriving by
  hand from `status.json` is the bug class it exists to prevent, never worked around by editing
  that file to bypass a mark's ordering refusal.
- The ledger is written only through the driver's `ledger` subcommands — never hand-typed; every
  `Agent`/workflow `model:` is explicit (shared § Model Placement).
- The driver never calls the reviewer package directly for structure — `check --json`,
  `notes.json` and `approval.json` are the only three files a mark reads; the sweep is read by
  the session, never by a mark.
