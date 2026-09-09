---
description: Standalone design-stage entry point, driver-stepped — mocks-driver.js derives state from design/mocks/status.json plus disk and prints the one step needing this session's judgment; loops SEED through APPROVED, checkpointing after every accepted mark so the run is /clear-safe
argument-hint: (no arguments — the driver derives everything from disk; SEED prompts for the product idea if the seed is blank)
---

# Mocks: The Driver-Stepped Design Entry Point

The standalone design-stage entry point, ahead of `/spec:genesis` and any roadmap.
`mocks-driver.js` (`spec-paths mocks-driver`) owns the state's sequencing, printing exactly one
step at a time for this session's judgment. A thin shell: it names where each step's doctrine
lives and assembles the APPROVED report. **Intended model: Sonnet** (Opus only for a
hard-to-reverse product-facts fork).

**Setup:** run `spec-paths shared-for mocks` and read its output; run `spec-paths shared-mocks
--section "Provenance Ledger|State Machine|Checkpoint contract"` too. Every other supplement
section loads one step at a time — each driver step's `Doctrine:` line names its section, its
`print:` slices exactly it. Run `spec-paths mocks-driver` once, keeping the path as `{driver}`.

**Input:** none required. A cold root has no `design/mocks/status.json`; the driver creates it
at SEED and tells you to fill `design/mocks/seed.md` from the user's idea, if not already clear.

## The driver loop

1. Run `node {driver} --root .`. It prints the state, one step (`Read only:` file list — never
   the whole `design/mocks/` dir), and a `Doctrine:` line naming the governing section.
2. Do that step and record it with the step's own printed `--mark …` line — verified before
   advancing; missing/failing artifacts are demanded again. While drawing a journey, pin every
   inferred product assumption as written (`ledger add … --screen <label>`, or `ledger ask`
   after — § Mocks: Page Notes, **Questions**). Draw empty/loading/error states with the happy
   path, or opt one out with its reason in the ledger (§ Mocks: Authoring Rules).
3. Re-run. Repeat until `APPROVED`.

A dismissed `AskUserQuestion` STOPS the run; state is already safe on disk. Every accepted mark
ends with the ledger's counts line and the driver's own checkpoint line — `/clear` any time
after; re-invoking cold re-derives everything from disk, never chat context.

## Kit (KIT state)

Before any screen: name the shared parts once, with a when-to-use line each. Copy the driver's
named starting page — `cp "$(spec-paths templates)"/mocks-kit.html design/kit/<name>.html` —
then draw the ten kit primitives (sheet, empty-state, table-row, card, form-field, option-group,
list-item, toolbar, banner, dialog) or better seed-suggested names, each
`data-kit-primitive="<key>"` with `data-purpose`, gray, never skinned. `stop open kit` opens an
approve stop, then `--mark kit-signed` once decided and `design-atlas.js check design/kit`
exits 0. After, every wireframe region instantiates a primitive (`data-kit="<key>"`) or carries
`data-bespoke="<key>: <difference>"` naming the difference (§ Mocks: Authoring Rules); `check`
prints the running kit/bespoke count, and `--mark journey-approved` refuses any region carrying
neither mark.

## THEME interview rule

The THEME step's own printed instruction is the interview: derive 2–3 candidate directions and
`AskUserQuestion` which to compose — never anchor on a stock pair. Record the picks as the
`theme-directions` row it names, then `--mark direction-composed --direction <k>` per direction
once its tokens and dense screen exist. The winner is picked on the served atlas page, not a
second question (§ Look rule): once ≥2 composed, `stop open theme` opens a pick stop and
`--mark theme-picked` accepts once decided (`rejected` = the others).

## Look rule

Before SHAPES, KIT, WIREFRAMES, THEME, or SIGNOFF the driver runs the look-reachability probe;
if it refuses, either fix the remedy (`npx playwright install chromium`) or, when a browser MCP
is the real look path, `ToolSearch` for `claude-in-chrome` and record `mocks-driver.js look-via
browser` before re-running. Look with `mocks-driver.js look <label> [--state <s>] [--port <n>]`
or the declared browser MCP — never approve on the HTML source alone.

**The user's look is a served atlas stop, never a question.** Before the first `stop open`, start
`node "$(spec-paths design-atlas)" serve --root . [--port <n>]` as a **tracked background task**
(`already serving` means reuse it); leave it running across this run's look stops and
stop it at sign-off or session end. Every step waiting on a human verdict runs `node {driver}
stop open <step>` (`shapes`|`journey:<j>`|`theme`|`signoff`); its stdout is the whole hand-off
— exactly two lines — then **end the turn** (shared § Design Atlas: look stops are never
questions):

    🎨 ready for review — <url>
    Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

(a pick stop — SHAPES, THEME — prints `Reply  ✅ pick <name>  — or —  ✏️ change <what looks
wrong>` instead). Decided on the served atlas page or, from chat, `node {driver} stop decide
<P…> --verdict approve|pick|change [--pick <group>] [--note <n>] --by chat` — never interpreted
directly. Next bare run reads the decided stop: `approve`/`pick` advances via its `--mark`
line; `change` starts a fresh round.

## Sign-off (SIGNOFF state)

The terminal look: one pass over `design/atlas/index.html`, every journey, gray, theme tokens
in place. No separate review loop — run `node {driver} notes open` on go and triage every note
into one bin: **mock detail** (`notes address --id <id> --change "<what changed>"`), **product understanding**
(a ledger row first, same call plus `--ledger <rowId>`), **question back**
(`notes reply --id <id> --text "<question>"`), or **propose to decline** (never decided here).
A canon-primitive note edits canon.md first, every dependent screen after; resolve only on the
page. The step prints its sign-off line, then `stop open signoff`; `decided approve` marks
`approved`, stamping every top-level mock `data-status="approved"`.

## Report

Printed once the driver reaches `APPROVED`. Assemble the slots (shared § Console Output Style):
`outcome` (`✅ mocks approved — {N} journeys, theme "{direction}", signed off by {name}`),
`bullets` (`{journey}: {M} screens` per journey; `theme: {direction} — rejected {others}`;
`Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`), `warns` (one `catch:
{what}` per ledger misunderstanding row, dropped if none), `next` (`{kind: 'command', text:
'/spec:genesis'}`). Run `node "$(spec-paths report-render)" --slots <file>`; print it verbatim.

## Rules

- **Never restate the driver's derivation** — read its printed step and act; re-deriving by
  hand from `status.json` is the bug class it exists to prevent, never worked around by editing
  that file to bypass a canon/kit/wireframe/sign-off ordering refusal.
- The ledger is written only through the driver's `ledger` subcommands, notes.json only through
  its `notes` subcommands or the served page — never hand-typed; every `Agent`/workflow
  `model:` is explicit (shared § Model Placement).
