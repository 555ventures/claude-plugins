---
description: Standalone design-stage entry point, driver-stepped — the wireframe command over the walkthrough service: mocks-driver.js derives SEED, SCREENS or APPROVED from design/mocks/status.json plus the seed and prints the one step needing this session's judgment; checkpoints after every accepted mark so the run is /clear-safe
argument-hint: (no arguments — the driver derives everything from disk; SEED prompts for the product idea if the seed is blank)
---

# Mocks: The Driver-Stepped Design Entry Point

The standalone design-stage entry point, ahead of `/spec:genesis` and any roadmap. Printed by `mocks-driver.js` at each state;
never restated here. **Intended model: Sonnet** (Opus only for a hard-to-reverse product-facts fork).

**Setup:** run `spec-paths shared-for mocks` and read its output; run `spec-paths shared-mocks
--section "Provenance Ledger|State Machine|Checkpoint contract"` too.
Run `spec-paths mocks-driver` once, keeping the path as `{driver}`.

**Input:** none required; the driver creates `design/mocks/status.json` at SEED. Never ask the
user for sample data — invent it, awkward cases included.

## The driver loop

1. Run `node {driver} --root .` and read its printed step and `Read only:` file list.
2. Do that step and record it with the step's own printed `--mark …` line.
3. Re-run. Repeat until `APPROVED`.

Every draw step carries `Skill: mock-authoring — load it before the first edit`
(spec/skills/mock-authoring/SKILL.md).

## SEED

Write `design/mocks/seed.md` from the user's idea — the product sentences and one journey block
per journey — then run `node {driver} --root . --mark seed-done`.

## SCREENS

One journey at a time, in the seed's own order. Copy the journey's beats verbatim into the
screen files — one file per `screen` and `screen@state` the beats name. Service mode: `--mark
journey-drawn --journey <j>` checks the files; once every journey is drawn, `round push` sends
everything and prints the link — print `🎨 ready for review — <link>` and end the turn. Later
`round pull` prints what waits: edit the screen file or the seed's beats for each item, answer
with `node "$(spec-paths walkthrough)" reply --note <id> --text-file <file>`, push again. When
the pull shows the journey confirmed on the current story, `--mark journey-approved --journey
<j>`; an absent client is `--waive --reason <r>`. Terminal mode: show the printed persona and
sentences exactly, end the turn, and on the user's literal `approve` run `--mark
journey-approved --journey <j>`. After the last journey, `round pull` then `--mark approved`
(§ Mocks: Confirmation).

## Report

Printed once the driver reaches `APPROVED`. Assemble the slots (shared § Console Output Style):
`outcome` (`✅ wireframe approved — {N} journeys`), `bullets` (`{journey}: {M} screens` per
journey; `Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`), `warns` (one
`catch: {what}` per ledger misunderstanding row, dropped if none), `next` (`{kind: 'command',
text: '/spec:genesis'}`). Run `node "$(spec-paths report-render)" --slots <file>`; print it
verbatim.

## Rules

- The ledger is written only through the driver's `ledger` subcommands — never hand-typed.
- The token is never printed or written; the driver reaches the service only through
  `walkthrough.js`.
