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
at SEED and tells you to fill `design/mocks/seed.md` from the user's idea, if not already clear
— ask the client for three real records per `## Records` entity into `records/<entity>.json`
(`seed-done` refuses without them).

## The driver loop

1. Run `node {driver} --root .` and read its printed step, `Read only:` file list, and
   `Doctrine:` line naming the governing section.
2. Do that step and record it with the step's own printed `--mark …` line — verified before
   advancing; missing/failing artifacts are demanded again. While drawing a journey, pin every
   inferred product assumption as written (`ledger add … --screen <label>`, or `ledger ask`
   after — § Mocks: Page Notes, **Questions**). Draw empty/loading/error states with the happy
   path, or opt one out with its reason in the ledger (§ Mocks: Authoring Rules). While drawing
   a WIREFRAMES screen, put `data-to="<label>"` on the control that actually leads to the next
   screen — the seed's edges are checked against it at `journey-drawn`, which refuses any edge
   with no such control (§ Mocks: Authoring Rules, **Every edge is a real control**); draw with
   the seed's `## Records` values, never placeholders (§ Mocks: Authoring Rules, **Screens
   carry the client's records**).
3. Re-run. Repeat until `APPROVED`.

Every authoring step block the driver prints carries the frontend-design skill line; act on it
before the first edit (§ Mocks: Authoring Rules — the one binding home).

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

## Look rule

Before SHAPES, KIT, WIREFRAMES, or CLIENT the driver runs the look-reachability probe; a
refusal fixes with `npx playwright install chromium` or, for a browser-MCP host, `ToolSearch`
`claude-in-chrome` and record `mocks-driver.js look-via browser`. Look with `mocks-driver.js
look <label> [--state <s>] [--port <n>]` or the declared browser MCP — never approve on source
alone.

**The user's look is a served atlas stop, never a question.** Before the first `stop open`, start `node "$(spec-paths design-atlas)" serve --root . [--port <n>]` as a **tracked background task** (`already serving` means reuse it); stop it at sign-off or session end (authoring states only — the CLIENT server is the user's, § Mocks: Look and Serve). Every step waiting on a human verdict runs `node {driver} stop open <step>` (`shapes`|`kit`|`journey:<j>`|`signoff`, CLIENT included); its stdout is the whole hand-off, then **end the turn** (shared § Design Atlas: look stops are never questions):

    🎨 ready for review — <url>
    Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

(a pick stop — SHAPES — offers `pick <name>` in place of `approve`). Decided on the served atlas page, or `node {driver} stop decide <P…> --verdict approve|pick|change [--pick <group>] [--note <n>] --by chat`; the next bare run reads the decision and advances via its `--mark`, or `change` starts a fresh round.

## Walk (WALK state)

For the first journey with no `walked`: dispatch `Agent {subagent_type: 'design-critic'}` once — mock paths in declared order plus the seed path, never file contents (shared § Model Placement) — fresh context; it returns findings `{screen, state, break, finding, severity}`, flow breaks only (§ Mocks: State Machine). Record each with `node {driver} notes add --scope mock --screen <label> --state <s> --kind walk --reason <break> --by walk-critic --text "<finding>"`, then `--mark journey-walked --journey <j>` — refused on an `open` finding, naming each id and `notes address --id <id> --change "<what changed>"`; empty findings walk straight to the mark. WALK opens no look stop or render/look probe — fix a finding through `--reopen walk:<j>` or `--reopen journey:<j>`, both landing on states that already carry the look machinery.

## Theme (THEME state)

Once every journey is walked, author two or three directions under `design/theme/<k>/` and run `theme compose`, `theme shortlist --directions <a,b[,c]>`, and `--mark theme-picked [--direction <k>]` — the driver's own printed steps carry the exact invocations and stop shape (§ Mocks: State Machine). Contract: the mark refuses an undecided stop or a disagreeing `--direction`; once adopted, every mock the client walks is served `?theme=<k>` while the session's own pages stay neutral; a host already past WALK with `design/tokens.css` byte-equal to a direction may skip the stop (the legacy path).

## Client review (CLIENT state)

The terminal step, and the one loop that runs across closed sessions: `client open --address <url> [--port <n>]` exposes the running serve in the user's own terminal (§ Mocks: Look and Serve; refused outside CLIENT, without `--address`, against a dead address, or a non-localhost address with no `--port`). Every re-run is a pickup, not a fresh read of chat: run `node {driver} --root .`, read `📥 what the client left`, answer each line with its printed command (`notes address --id <id> --change "<what changed>"` after fixing the screen — plus `--screen <label>` or `--journey <j>` for a project-scope one, `notes reply` for a question back), then re-run.
`notes waive --id <id> --reason "<r>"` releases one after seven days of silence. Only the client's page controls close a request (`Looks good` accepts, `Still not right` reopens with the client's text, § Mocks: Page Notes); a new request on an already-`ok` journey takes its confirmation back (§ Mocks: Client Player); `client log`/`client waive` are unchanged, and `--mark approved` refuses until every journey is `ok` or waived. An exclusion answer stays open to change until `--mark approved` runs — once the work is signed off the card is a dated, read-only record and the answer route refuses every write (§ Mocks: Client Player).
Then `stop open signoff`; `decided approve` runs `{driver} --mark approved`, which first runs `ledger derive`, then prints `waived: N` plus each reason, lists agreed and not-contested exclusions, writes `design/mocks/exclusions.md`, and stamps every top-level mock `data-status="approved"`.

## Report

Printed once the driver reaches `APPROVED`. Assemble the slots (shared § Console Output Style):
`outcome` (`✅ mocks approved — {N} journeys, signed off by {name}`),
`bullets` (`{journey}: {M} screens` per journey;
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
- **canon before screens, kit before wireframes, screens walked before sign-off.**
