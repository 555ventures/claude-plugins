---
description: Standalone design-stage entry point, driver-stepped — mocks-driver.js derives state from design/mocks/status.json plus disk and prints the one step needing this session's judgment; loops SEED through APPROVED, checkpointing after every accepted mark so the run is /clear-safe
argument-hint: (no arguments — the driver derives everything from disk; SEED prompts for the product idea if the seed is blank)
---

# Mocks: The Driver-Stepped Design Entry Point

The standalone design-stage entry point, ahead of `/spec:genesis` and any roadmap.
`mocks-driver.js` (`spec-paths mocks-driver`) owns the state's sequencing — status derivation,
ledger gating on every advancing mark, journey/direction sub-marks, the look-reachability
precondition — printing exactly one step at a time for the judgment only this session can make.
This command is a thin shell: it names where each step's doctrine lives, runs the THEME
interview, the look rule, and the sign-off step below, and assembles the APPROVED report.

**Intended model: Sonnet** (drawing screens one at a time; escalate to Opus only for a
genuinely hard-to-reverse product-facts fork).

**Setup:** run `spec-paths shared-for mocks` and read its output (Host Grounding, Model
Placement, Decisions, Question Style, Console Output Style, MCP Policy, Design Canon, Design
Atlas); run `spec-paths shared-mocks` and read it too — the ledger, the state machine, the seed
grammar, the checkpoint contract, the look rule, and page notes. Run `spec-paths
mocks-driver` once and keep the printed path as `{driver}`.

## Input

None required. A cold root has no `design/mocks/status.json`; the driver creates it at SEED and
the SEED step tells you to fill in `design/mocks/seed.md` from the user's idea, if it's not
already clear from the repo.

## The driver loop

1. Run `node {driver} --root .`. It prints the current state and exactly one step, opening
   with a `Read only:` file list — never the whole `design/mocks/` directory.
2. Do that one step. Its printed `Doctrine:` line names the `## Mocks: …` section of
   `spec/doctrine/mocks.md` (or `## Design Canon` / `## Design Atlas` of `design.md`) governing
   the judgment.
3. Record it with the step's own printed `--mark …` line. The driver verifies the step's
   artifacts before advancing; a missing or failing one is refused and demanded again. While
   drawing a journey, pin every inferred or invented product assumption as it is written
   (`ledger add … --screen <label>`, or `ledger ask` after the fact) — § Mocks: Page Notes,
   **Questions** is the one binding home for how it is authored, answered, and gated. Draw every
   screen's empty, loading, and error states alongside the happy path, or opt one out on the
   root with its product reason in the ledger — § Mocks: Authoring Rules is the one binding
   home for the rule and its grammar.
4. Re-run `node {driver} --root .`. Repeat until it prints `APPROVED`.

A dismissed `AskUserQuestion` STOPS the run — never invent the declined answer; state is
already safe on disk. Every accepted mark ends with the ledger's counts line and
`✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks`: the
session may `/clear` after any checkpoint and re-invoke cold — it re-derives everything from
disk, never chat context.

## Kit (KIT state)

Before any screen: name the shared parts once, in every state, with a when-to-use line. The
driver's step names the starting page; copy it yourself — `cp "$(spec-paths templates)"/mocks-kit.html
design/kit/<name>.html` — then edit it in place: draw the ten kit primitives (sheet, empty-state, table-row, card,
form-field, option-group, list-item, toolbar, banner, dialog) or better names the seed's
product suggests, each `data-kit-primitive="<key>"` with its `data-purpose` when-to-use line,
gray on `wire/tokens.css`, never skinned. Look at it the same way a wireframe is looked at:
`stop open kit` opens an approve stop framing the page itself, then `--mark kit-signed` accepts
once it is decided and `design-atlas.js check design/kit` exits 0.

Once the kit is signed off, every wireframe authoring step is handed the kit page first: a
labeled mock's content regions each instantiate a primitive (`data-kit="<key>"`) or carry an
explicit `data-bespoke="<key>: <difference>"` naming the primitive it is not and the one
structural difference preventing reuse (§ Mocks: Authoring Rules — the one binding home for the
rule and its grammar). `check` prints the running `ⓘ <label>: <n> kit, <m> bespoke` count on
every run, and `--mark journey-approved` refuses on any region carrying neither mark.

## THEME interview rule

The THEME step opens with a direction interview, not a fixed menu: derive 2–3 candidate
directions from the seed's product, audience, and references, and `AskUserQuestion` which to
compose — never anchor on a stock pair (warm/cool, playful/serious). Record the picks as the
`theme-directions` product row the driver's step text names, then run `--mark direction-composed
--direction <k>` per direction once its tokens and the seed's dense screen exist (a second
screen at most). The interview asks only which directions to compose — the winner is picked on
the served atlas page, not by a second question (§ Look rule): once ≥2 directions are composed,
`stop open theme` opens a pick stop and `--mark theme-picked` accepts once it is decided,
appending the `theme` row itself (`rejected` = the other directions).

Every authoring step block the driver prints carries the `frontend-design` skill line; act on it
before the first edit (§ Mocks: Authoring Rules — the one binding home).

## Look rule

Before SHAPES, KIT, WIREFRAMES, THEME, or SIGNOFF the driver runs the look-reachability probe; if it
refuses, either fix the remedy (`npx playwright install chromium`) or, when a browser MCP is the
real look path, `ToolSearch` for `claude-in-chrome` (or equivalent) and record `mocks-driver.js
look-via browser` before re-running. To look at a screen, use `mocks-driver.js look <label>
[--state <s>] [--port <n>]` or the declared browser MCP — never approve on the HTML source alone.

**The user's look is a served atlas stop, never a question.** Before the first `stop open` of
this run, start `node "$(spec-paths design-atlas)" serve --root . [--port <n>]` as a
**tracked background task** (its first stdout line carries the URL; `already serving` means a previous
session's server is still up — reuse it); leave it running across this run's look stops and stop
the task at sign-off or when the session ends — this is the session's own tool and is never
printed to the user. Every step waiting on a human verdict — SHAPES, `journey-approved`, THEME,
`approved` — runs `node {driver} stop open <step>` (`<step>` = `shapes` |
`journey:<j>` | `theme` | `signoff`); its stdout is the whole hand-off — exactly
two lines — then **end the turn** (shared § Design Atlas: look stops are never questions). No
server command, no file paths, no list of screen names:

    🎨 ready for review — <url>
    Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

(a pick stop — SHAPES, THEME — prints `Reply  ✅ pick <name>  — or —  ✏️ change <what looks
wrong>` as its second line instead). The decision is taken on the served atlas page or, from
chat, recorded with `node {driver} stop decide <P…> --verdict approve|pick|change [--pick
<group>] [--note <n>] --by chat` — never interpreted directly by this session. On the next bare
run the driver reads the decided stop off disk: `approve`/`pick` advances with the mark's own
`--mark …` line; `change` starts a fresh round — address the note, then `stop open <step>`
again.

## Sign-off (SIGNOFF state)

The terminal look: one pass over `design/atlas/index.html`, every journey, gray, theme tokens
already in place. There is no separate review loop — feedback on the served pages is the same
notes layer as every earlier state: run `node {driver} notes open` on go (or re-invoke
`/spec:mocks`) and triage every note into one bin: **mock detail** (redraw, `notes address --id
<id> --change "<what changed>"`), **product understanding** (a ledger row first, same address
call plus `--ledger <rowId>`), **question back** (`notes reply --id <id> --text "<question>"`),
or **propose to decline** (never decided here — print it for whoever signs off). A
canon-primitive note edits canon.md first, every dependent screen after; resolve happens only on
the page, never a `notes resolve` subcommand. The step prints the fixed sign-off line,
`Approval means "this is the product I understand" — the written brief, not these screens, holds
scope`, then `stop open signoff`. On `decided approve`, `--mark approved` stamps every top-level
mock `data-status="approved"` and records the stop's own decider.

## Report

Printed once the driver reaches `APPROVED`. Assemble the slots object (shared § Console Output
Style — `report-render.js` is the sole render authority):

- `outcome`: `✅ mocks approved — {N} journeys, theme "{direction}", signed off by {name}`.
- `bullets`: `{journey}: {M} screens` per journey; `theme: {direction} — rejected {others}`;
  `Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`.
- `warns`: one `catch: {what}` entry per ledger misunderstanding row logged this run (drop if none).
- `next`: `{kind: 'command', text: '/spec:genesis'}`.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim.

## Rules

- **Never restate the driver's derivation.** Read its printed step and doctrine citation; act
  on them — re-deriving state by hand from `status.json` is the class of bug the driver exists
  to prevent.
- Canon before screens, kit before wireframes, screens before sign-off — the driver refuses out of
  order; this command never works around a refusal by editing `status.json`.
- `AskUserQuestion` dismissed → STOP; never invent the declined answer.
- The ledger is written only through the driver's `ledger` subcommands, notes.json only
  through its `notes` subcommands or the served page — never hand-typed.
- Every `Agent`/workflow `model:` is explicit (shared § Model Placement).
