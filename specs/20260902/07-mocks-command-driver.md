---
date: 2026-09-02
status: done
build_base: main
tier: critical             # spec/bin/spec-paths gains keys and a shared-for list (pipeline rules § Risk Tiers)
area: mocks
design: false
breaking: false
depends_on: [specs/20260902/06-mocks-provenance-ledger.md]
depended_on_by: [specs/20260902/08-genesis-shrink-brief-state.md, specs/20260902/09-one-hand-wireframes-one-token-set.md]
brief: 22
open_markers: 0
spiked: 2026-09-02
diff_base: 1add289c6c7090ba7654a24cfb1ec549e4838113
---

# `/spec:mocks` — the standalone design command and its file-derived driver

## Goal

Ship the design stage as its own command: `/spec:mocks` loops `mocks-driver.js`, whose state
is derived on every invocation from `design/mocks/status.json` plus the artifacts on disk —
SEED → SHAPES → WIREFRAMES → THEME → SKIN → REVIEW → APPROVED — with the genesis checkpoint
contract verbatim and a sub-checkpoint per journey, per theme direction, per skinned and
reviewed journey, so no conversation ever holds more than one journey. Every advance runs the
provenance gate (spec 06). Everything works over SSH: static HTML on disk, a preview server
that prints its port-forward line, and the session's own look through headless Playwright to
a file. Done = a cold repo can be seeded, drawn, themed, skinned and approved through the
driver with every closure check executed, and `/clear` between any two marks loses nothing.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/mocks-driver.js` (`spec-paths mocks-driver`) derives the state on every run from `design/mocks/status.json` (schemaVersion 1) plus disk, prints exactly one step opening with `Read only:` and a `Doctrine:` line, and every accepted `--mark` ends with `✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks` preceded by the `📒 ledger:` counts line (AC-20260902-07-1, AC-20260902-07-2) | The genesis driver's shape verbatim (specs/20260825/04 D9's checkpoint contract): the reader already knows it, and it is what made the dry run survive several compactions. |
| D2 | States and closure checks: **SEED** (`seed-done`: `seed.md` sections, 13 fact keys → confirmed product rows, `design/targets.json` valid, `docs/design/research-brief.md` present) → **SHAPES** (`shape-picked --shape <kebab>`: the file exists under `design/shapes/`, a `shape` product row is `said-by-user`) → **WIREFRAMES** (`canon-written`; then per journey `journey-drawn` and `journey-approved`) → **THEME** (`direction-composed --direction <k>` ≥2, then `theme-picked --direction <k>`) → **SKIN** (`journey-skinned` per journey) → **REVIEW** (`review-opened --decider "<name>"`, then `journey-reviewed` per journey) → **APPROVED** (`approved`); every advancing mark first runs `gateVerdict` and refuses on `open:false` naming the rows (AC-20260902-07-3 … AC-20260902-07-10) | The brief's order and sub-checkpoints; each check is a closure on an artifact (a file, a heading, a label set, a row), never an opinion. |
| D3 | The 13 seed fact keys, closed: `primary-surface platforms-horizon tenancy offline realtime ai-in-loop residency payer day-one-integrations scale-outage vendor-limits retention legal-floor`; `seed.md ## Facts` maps each `- <key>: <ledger id>` to a `product` row whose status is `confirmed` (tag `said-by-user` or `ratified-doc`); `primary-surface` and `platforms-horizon` are printed first in the SEED step text (AC-20260902-07-3) | The brief's irreversible-fact list, with the two Hearwell-specific items generalized (audio retention → `retention`; emotion-inference → `legal-floor`, any regulation constraining a core mechanic). Primary surface + horizon before any screen is the framework lesson. |
| D4 | `design/mocks/seed.md` grammar: `## Product` (≥3 lines), `## Facts` (D3 lines), `## References` (`- <path or url> — <what to borrow>` or `- none`; a `design/mocks/references/` directory is listed automatically), `## Journeys` (each `### <journey-kebab>` with one persona line and one ```` ```surfaces ```` block in the roadmap-brief grammar), `## Dense screen` (`- <label>`, a label declared in a journey); template `spec/templates/mocks-seed.md` (AC-20260902-07-3) | Journeys must exist before the first screen and no roadmap exists yet; reusing the surfaces grammar lets the atlas render journeys from the seed today and derive briefs from them later (spec 11). |
| D5 | `design/mocks/canon.md` grammar: `## Shells`, `## Primitives` (`- **<name>** — <purpose>` bullets, ≥1), `## Rules`, `## Grounding` containing the literal `docs/design/research-brief.md` and the word `binding`; `canon-written` also requires `design/wire/tokens.css` and `design/wire/wire.css` to exist (copied from `spec/templates/mocks/` when absent) and refuses when any `design/mocks/*.html` already exists (canon first, one screen at a time) (AC-20260902-07-5) | M12: the research brief must be a driver-checked read before the first screen; M14/A7: a primitives inventory is what keeps one hand consistent across 27 screens. |
| D6 | Wireframe file contract: `design/mocks/<label>.html`, root `data-screen-label="<label>"` with the label declared in exactly one seed journey, `data-status="sketch"`, links `../wire/tokens.css` and `../wire/wire.css`, states as `data-state-btn` controls (before the root or under `data-contract="none"`), `design-atlas.js check <file>` exit 0; `journey-drawn --journey <j>` requires every label of that journey to exist under this contract and refuses naming the missing/failing labels (AC-20260902-07-6) | Spike: the existing harness rejects the dry run's files on three counts (no label, no `tokens.css` link, inline color literals); this contract is the smallest shape both the harness and the later `design_source` consumer accept. |
| D7 | `journey-approved --journey <j>` requires `journey-drawn` for that journey and the ledger gate open; it records `journeys[j].approved` (spec 10 adds the zero-open-notes condition) (AC-20260902-07-6) | Approval is the user's word after a look; the driver closes it on artifacts and the gate. |
| D8 | THEME opens with a **direction interview**: the step text tells the session to derive 2–3 candidate directions from the seed (product, audience, references) and ASK which to compose; the picks land as product row `theme-directions` (`said-by-user`). `direction-composed --direction <k>` requires `design/theme/<k>/tokens.css` + ≥3 `<label>.html` whose labels are approved wireframes including the seed's dense screen, each linking `tokens.css`, `design-atlas.js check design/theme/<k>` exit 0, and the `theme-directions` row to name `<k>`; `theme-picked --direction <k>` requires ≥2 composed directions, product row `theme` `said-by-user` whose `rejected` cell names every other composed direction, then copies `design/theme/<k>/tokens.css` → `design/tokens.css` (AC-20260902-07-7) | JJ's ruling this session: no fixed anchor directions — they depend on the product and audience, and the session should guess or ask; the older genesis asked, the current one went quiet. Recomposition on ≥3 approved screens incl. the dense one is the dry run's M14 rule. |
| D9 | `journey-skinned --journey <j>` requires every screen of that journey to link `../tokens.css` and to link no `wire/` stylesheet, `design-atlas.js check` exit 0, and no journey may be skinned before `theme-picked` (AC-20260902-07-8) | "One honest wireframe or the full theme, never a half-styled middle" — the link set is the deterministic signature of which register a screen is in. |
| D10 | `review-opened --decider "<name>"` records the named decider; `journey-reviewed --journey <j>` requires `journey-skinned` (spec 10 adds notes conditions); `approved` requires every journey reviewed, the gate open, every `design/mocks/*.html` stamped `data-status="approved"`, and `design-atlas.js check --matrix design/mocks` exit 0; the step text states the sign-off wording: approval of understanding, not of scope (AC-20260902-07-9, AC-20260902-07-10) | One named decider and an explicit approval state are the client-review findings; the matrix binds at approval per the design canon (out of scope to iterate it earlier). |
| D11 | Non-linear moves: `--reopen journey:<j>` clears that journey's `approved/skinned/reviewed` marks (and `approved`), `--reopen shapes` clears `shape` and every journey/theme/skin/review mark, `--reopen theme` clears `theme`, every `skinned/reviewed` mark and `approved`; each prints what it invalidated, appends to `status.reopens`, and deletes nothing on disk (AC-20260902-07-11) | The brief: re-open a journey after THEME, redo SHAPES after a project note — recorded, printed, never a restart. |
| D12 | SSH rule: `design-atlas.js serve [--root <r>] [--port <n>]` serves `<root>/design/` statically (no cache) and prints, first line, `serving http://localhost:<port>/atlas/index.html — remote: ssh -L <port>:localhost:<port> <host>`; the driver's own look is `mocks-driver.js look <label> [--state <s>] [--out <png>]`, which writes a sibling `.look-<label>.html` (the mock plus an inline script clicking `[data-state-btn="<s>"]` on load), captures it with `npx --no-install playwright screenshot --viewport-size=<w>,<h>` at the first declared viewport, and deletes the sibling; `mocks-driver.js look-probe` exits 0 when `npx --no-install playwright --version` exits 0 (AC-20260902-07-12, AC-20260902-07-13) | Spike: `npx --no-install playwright --version` → `Version 1.62.1`, and the screenshot subcommand wrote a PNG from a `file://` page; `require.resolve('playwright')` fails in this repo, so the CLI is the probe. |
| D13 | Reachability precondition: before printing SHAPES, WIREFRAMES, THEME, or SKIN the driver runs the look probe unless `status.look === "browser"`; a failed probe refuses (exit 2) naming `npx playwright install chromium`; `mocks-driver.js look-via <playwright\|browser>` records the session's declared path (`browser` = a browser MCP the command told the session to ToolSearch for) (AC-20260902-07-13) | The brief: refuse to start a screen-producing state when no look path is reachable; a browser MCP cannot be probed from a script, so it is declared and recorded. |
| D14 | Ledger subcommands on the driver — `ledger add --id --step --kind --claim --tag --status [--rejected] [--dependents] [--note]`, `ledger set --id --status [--tag]`, `ledger catch --id --what --step --cost [--note]`, `ledger check`, `ledger counts` — are the only writers of `design/mocks/ledger.md`; `ledger check` exits 0 open / 1 blocked (rows on stdout) / 2 grammar errors (AC-20260902-07-4) | Spec 06's lib is text-only; the driver is the single entrypoint (one `entrypoints.json` row) and the CLI the session actually types. |
| D15 | `design-atlas.js build` learns the mocks workspace: `parseSurfaces` also reads `design/mocks/seed.md`'s per-journey blocks (owner = `seed:<journey>`), sections are grouped per journey with the persona line, each mock card renders one frame per `data-state-btn` state (activated on load when served, same-origin), `design/shapes/*.html` render under a `shapes` section keyed by file, and `references/` is skipped by the html walk (AC-20260902-07-14) | The dry run's reviewable shape (all states side by side, journey by journey) as a derived view over canon-shaped files, so the mock files stay `design_source`-consumable. |
| D16 | `spec/commands/mocks.md` (≤120 lines): setup, the driver loop, the THEME interview rule, the SSH/look rule, the report; `spec-paths` gains `mocks-driver` and a `shared-for mocks` list (core: Host Grounding, Model Placement, Decisions, Question Style, Console Output Style, MCP Policy; design: Design Canon, Design Atlas) plus the `shared-mocks` supplement; `spec/doctrine/mocks.md` gains `## Mocks: State Machine`, `## Mocks: Seed`, `## Mocks: Checkpoint contract`, `## Mocks: Look and Serve`; `spec/entrypoints.json` gains the driver row (AC-20260902-07-15) | Pipeline rules § Planning new-surface checklist; read-load budget ≤500 (tests/consistency/read-load.test.js) — the driver prints the per-step doctrine so the command stays a shell. |
| D17 | Templates `spec/templates/mocks/wire-tokens.css` (flat gray register as `--bg --fg --muted --border --primary --primary-fg --ring --radius --font` roles on shadcn's zinc defaults) and `spec/templates/mocks/wire.css` (the dry run's class set, every color a `var(--role)`), copied by `canon-written` when absent (AC-20260902-07-5) | Spike: the harness flags inline hex; the flat register must carry every color as a role. Spec 09 pins these values equal to the viewer chrome's. |
| D18 | README gains the greenfield chain line `/spec:mocks → /spec:genesis → /spec:enforce → /spec:plan` and a `/spec:mocks` table row; version bump → 7.61.0 target with a changelog entry | Single root README (memory rule); § Planning version discipline. `[no-ac: prose; the version pin is tests/consistency/plugin-version.test.js]` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | CREATE | scripts | D1–D3, D5–D14: state derivation, marks, reopen, ledger subcommands, look/look-probe/look-via; `runChild`/`writeOut` from lib/driver-io.js |
| spec/scripts/design-atlas.js | MODIFY | scripts | D12 `serve`, D15 build (seed journeys, state frames, shapes section, references skipped) |
| spec/commands/mocks.md | CREATE | doctrine | D16: the command shell (≤120 lines) |
| spec/doctrine/mocks.md | MODIFY | doctrine | D16: four new sections after § Provenance Ledger |
| spec/bin/spec-paths | MODIFY | scripts | D16: `mocks-driver` key; `shared-for mocks` (core + design sections) ; usage line |
| spec/entrypoints.json | MODIFY | other | D16: `spec/scripts/mocks-driver.js` → `spec/commands/mocks.md` |
| spec/templates/mocks-seed.md | CREATE | doctrine | D4: the seed template with grammar comments and the 13 fact lines |
| spec/templates/mocks-canon.md | CREATE | doctrine | D5: canon template (four headings, grounding line pre-filled) |
| spec/templates/mocks/wire-tokens.css | CREATE | doctrine | D17 |
| spec/templates/mocks/wire.css | CREATE | doctrine | D17 |
| README.md | MODIFY | doctrine | D18 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D18 |
| tests/mocks/mocks-driver.test.js | CREATE | tests | AC-20260902-07-1 … AC-20260902-07-11, AC-20260902-07-13 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260902-07-12, AC-20260902-07-14 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260902-07-15 |

## Contracts

```jsonc
// design/mocks/status.json — schemaVersion 1, created by the driver on a cold root
{ "schemaVersion": 1, "state": "SEED",                 // state re-derived and re-stamped on every save (spec 06 D5 reads it)
  "marks": { "seedDone": null, "shapePicked": null, "canonWritten": null, "themePicked": null,
             "reviewOpened": null, "approved": null },   // ISO timestamps when set
  "shape": null, "theme": null, "decider": null, "look": "playwright",
  "journeys": { "<journey>": { "drawn": null, "approved": null, "skinned": null, "reviewed": null } },
  "directions": { "<kebab>": { "composed": "<ts>" } },
  "reopens": [ { "at": "<ts>", "target": "journey:<j>|shapes|theme", "invalidated": ["<mark>", …] } ],
  "lastUpdated": "<ts>" }
```

```
mocks-driver.js [--root <dir>] [--state]
mocks-driver.js --root <dir> --mark <mark> [--journey <j>] [--direction <k>] [--shape <k>] [--decider "<name>"]
mocks-driver.js --root <dir> --reopen journey:<j>|shapes|theme
mocks-driver.js --root <dir> ledger (add|set|catch|check|counts) [flags per D14]
mocks-driver.js --root <dir> look <label> [--state <s>] [--out <png>]      # default out: design/mocks/.looks/<label>[.<state>].png
mocks-driver.js --root <dir> look-probe | look-via <playwright|browser>
Exit codes: 0 step printed / mark accepted / gate open · 1 ledger check blocked · 2 refused mark, precondition, usage, dead child
```

Step-text skeleton (every state):

```
[mocks-driver] state: WIREFRAMES  root: <root>
(re-run this driver after completing the step; it verifies artifacts and prints the next one)

## Step: draw journey <j> — one screen at a time, canon first
Read only: design/mocks/seed.md (## Journeys › <j>), design/mocks/canon.md, docs/design/research-brief.md, design/mocks/ledger.md
Doctrine: spec/doctrine/mocks.md § Mocks: State Machine
journeys: 2/5 drawn · 1/5 approved · open product rows: 3 (W4 invented, O2 inferred, O5 invented)
Then:
  node <driver> --root <root> --mark journey-drawn --journey <j>
```

Accepted-mark tail (exact):

```
📒 ledger: 21 said-by-user · 8 ratified-doc · 32 inferred (30 open) · 5 invented (5 open) · 8 process · 13 catches

✅ checkpoint — mocks state saved (WIREFRAMES → WIREFRAMES); safe to /clear and re-run /spec:mocks
```

`design/mocks/seed.md` (template `spec/templates/mocks-seed.md`):

```markdown
# Seed — { product }

## Product
{ three sentences: what it is · who it is for · the one job it must do }

## Facts
<!-- one line per key, each naming a product row in ledger.md whose status is confirmed -->
- primary-surface: P1
- platforms-horizon: P2
- tenancy: P3
- offline: P4
- realtime: P5
- ai-in-loop: P6
- residency: P7
- payer: P8
- day-one-integrations: P9
- scale-outage: P10
- vendor-limits: P11
- retention: P12
- legal-floor: P13

## References
- none

## Journeys
### staff-interview
Mika (dispatch lead) is invited by her owner, consents, talks for twenty minutes, confirms three read-backs, and books the next topic.
```surfaces
signin -> invite
invite -> consent
consent -> session-live
```

## Dense screen
- session-live
```

`design-atlas.js serve` first stdout line, exact: `serving http://localhost:4173/atlas/index.html — remote: ssh -L 4173:localhost:4173 <host>` (port from `--port`, default 4173; `<host>` literal — the user substitutes). The server never caches (`cache-control: no-store`), serves `<root>/design/` only (path traversal → 404), exits on SIGINT/SIGTERM.

Look: `npx --no-install playwright screenshot --viewport-size=<w>,<h> file://<abs .look file> <out.png>`; `<w>,<h>` = `design/targets.json` viewports[0]; `--state <s>` injects `<script>document.addEventListener('DOMContentLoaded',function(){var b=document.querySelector('[data-state-btn="<s>"]');if(b)b.click()})</script>` before `</body>` (or at end); the `.look-*.html` sibling is deleted in a `finally`.

## Behavior

- **Cold root:** no `design/mocks/status.json` → the driver creates it (state SEED), creates
  `design/mocks/ledger.md` from `spec/templates/mocks-ledger.md` and `design/mocks/seed.md` from
  the seed template when absent, and prints SEED naming the templates as `Read only:` sources.
  The SEED step text tells the session to author `docs/design/research-brief.md` per
  genesis.md § Genesis: Fresh UX Research (the method lives there; the command names it) and to
  declare `design/targets.json` viewports most-constrained-first, `themes: ["light"]` unless
  the seed says otherwise.
- **Derivation order:** SEED (until `seedDone` and `seed-done`'s checks hold) → SHAPES (until
  `shape` names an existing `design/shapes/<k>.html`) → WIREFRAMES (until `canonWritten` and
  every seed journey is `approved`) → THEME (until `theme` is set) → SKIN (until every journey
  `skinned`) → REVIEW (until `reviewOpened` and every journey `reviewed`) → APPROVED (terminal;
  `--mark approved` accepted). A mark whose artifact vanished (a journey's screen deleted) is
  demanded again: the derivation re-checks files, never trusts the recorded mark alone. A seed
  journey added after WIREFRAMES began appears as `0/N drawn` and re-opens WIREFRAMES.
- **Gate at every advancing mark:** `seed-done`, `shape-picked`, `canon-written`,
  `journey-approved`, `theme-picked`, `journey-skinned`, `journey-reviewed`, `approved` run
  `gateVerdict`; blocked → exit 2 listing rows and the remedy `ledger set --id <id> --status
  confirmed --tag said-by-user` / `--status overridden`. `journey-drawn` and
  `direction-composed` run no gate (drawing is how questions get found).
- **Process rows are never asked:** the step text lists process rows under `calls I made:` and
  the counts line carries them as one bucket.
- **Seed check (`seed-done`):** `## Product` ≥3 non-blank lines; `## Facts` carries all 13
  keys, each id an existing `product` row with `status` `confirmed`; `## Journeys` ≥1 journey,
  each with a persona line and a surfaces block declaring ≥1 label; every label declared in
  exactly one journey; `## Dense screen` names a declared label; `design/targets.json` parses
  with non-empty `themes`/`viewports` (`{name,width,height}`); `docs/design/research-brief.md`
  exists, non-empty, ≥1 `## ` heading. Refusals name the missing key/label/file.
- **Shapes:** `design/shapes/<k>.html` files each carry `data-screen-label` equal to the dense
  screen (or any declared label) and `data-shape="<k>"`; `shape-picked` requires 2–3 files
  present and the named one among them, plus product row `shape` (`said-by-user`, `confirmed`)
  whose `rejected` cell names each other shape kebab.
- **Wireframes:** `journey-drawn` for a journey with labels `a b c` checks `design/mocks/a.html`
  … each under D6 and runs `design-atlas.js check` on those files; a passing journey records
  `drawn`. Drawing order and the "one screen at a time" rule are command prose.
- **Theme:** the THEME step prints the direction-interview instruction and the `Read only:`
  set (seed, canon, references dir listing, research brief); after `theme-directions` exists it
  prints the composed/uncomposed list. `theme-picked` copies tokens verbatim (byte-equal file).
- **Skin / Review / Approved:** per D9/D10. `approved`'s stamp check reads every
  `design/mocks/*.html` (top level, `.look-*` and `references/` excluded).
- **Reopen:** never deletes files; clears marks per D11; the next derivation lands on the
  earliest state whose marks are missing. Output: `↩ reopened journey:<j> — invalidated:
  approved, skinned, reviewed, approved(all)`.
- **`--state`:** read-only peek printing the derived state name; never writes status.json
  beyond cold-root creation, never runs the look probe.
- **Ledger subcommands** operate on `design/mocks/ledger.md` through spec 06's lib; `check`
  prints the counts line then either `gate: open` or `gate: blocked` + one row per line.

## Acceptance Criteria

- **AC-20260902-07-1**: WHEN the driver runs on a cold `--root` THE SYSTEM SHALL create
  `design/mocks/status.json` (`schemaVersion` 1, `state` `SEED`, every mark null,
  `look` `playwright`), `design/mocks/ledger.md` and `design/mocks/seed.md` from the templates,
  and print a step whose first two body lines are `## Step: seed …` and a `Read only:` line
  naming `design/mocks/seed.md` → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-2**: WHEN any mark is accepted THE SYSTEM SHALL print, as its last two
  non-blank lines, the `📒 ledger: …` counts line and
  `✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks`
  (e.g. `seed-done` on a valid seed → `(SEED → SHAPES)`), and `--state` SHALL print only the
  derived state name → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-3**: WHEN `--mark seed-done` runs with `## Facts` missing `payer` THE
  SYSTEM SHALL exit 2 naming `payer`; with `- payer: P8` where `P8` is `inferred open` it SHALL
  exit 2 naming `P8` and `confirmed`; with a label declared in two journeys it SHALL exit 2
  naming the label; with no `docs/design/research-brief.md` it SHALL exit 2 naming that path;
  and with every check satisfied it SHALL record `marks.seedDone` and advance to SHAPES →
  `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-4**: WHEN `ledger add --id W4 --step WIREFRAMES --kind product --claim "x"
  --tag invented --status open` runs THE SYSTEM SHALL append one row that re-parses, `ledger
  check` SHALL exit 1 printing the counts line and `gate: blocked` + `W4 invented open`,
  `ledger set --id W4 --status "confirmed 2026-09-02" --tag said-by-user` SHALL flip only that
  row, and `ledger check` SHALL then exit 0 with `gate: open`; `ledger catch --id M1 --what
  "…" --step SEED --cost "…"` SHALL append to the Misunderstandings table and raise the counts
  line's catches from 0 to 1 → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-5**: WHEN `--mark canon-written` runs without `## Grounding` containing
  `docs/design/research-brief.md` THE SYSTEM SHALL exit 2 naming the missing literal; when
  `design/mocks/a.html` already exists it SHALL exit 2 naming the file (canon first); when
  `design/wire/tokens.css` is absent it SHALL copy both templates into `design/wire/` and
  accept; the accepted mark SHALL record `marks.canonWritten` → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-6**: WHEN `--mark journey-drawn --journey j1` runs for a journey declaring
  `a b` and `design/mocks/b.html` is missing THE SYSTEM SHALL exit 2 naming `b`; when
  `a.html` carries `data-status="ratified"` or links no `wire/tokens.css` or contains `#999`
  it SHALL exit 2 carrying the failing label and `design-atlas.js check`'s own line; when both
  files conform it SHALL record `journeys.j1.drawn`; and `--mark journey-approved --journey
  j1` SHALL refuse before `drawn`, refuse on a blocked gate naming the rows, and otherwise
  record `journeys.j1.approved` → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-7**: WHEN `--mark direction-composed --direction quiet` runs with only two
  screens under `design/theme/quiet/` THE SYSTEM SHALL exit 2 naming the count and the dense
  screen requirement; with three approved labels including the dense screen, a `tokens.css`,
  and a `theme-directions` row naming `quiet` it SHALL record `directions.quiet.composed`;
  `--mark theme-picked --direction quiet` SHALL exit 2 while only one direction is composed,
  exit 2 when the `theme` row's `rejected` cell omits a composed direction (`warm`), and on
  acceptance SHALL write `design/tokens.css` byte-equal to `design/theme/quiet/tokens.css`
  and advance to SKIN → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-8**: WHEN `--mark journey-skinned --journey j1` runs before `theme-picked`
  THE SYSTEM SHALL exit 2; when `a.html` still links `../wire/wire.css` it SHALL exit 2 naming
  `a` and `wire/`; when every screen links `../tokens.css` and no `wire/` file it SHALL record
  `journeys.j1.skinned` → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-9**: WHEN `--mark journey-reviewed --journey j1` runs before
  `review-opened` THE SYSTEM SHALL exit 2 naming `review-opened --decider`; after
  `--mark review-opened --decider "Ren"` (recorded as `decider: "Ren"`) it SHALL record
  `journeys.j1.reviewed` → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-10**: WHEN `--mark approved` runs with one screen still
  `data-status="sketch"` THE SYSTEM SHALL exit 2 naming that file; when `check --matrix`
  fails it SHALL exit 2 carrying the check's own stdout; when every screen is `approved`,
  every journey `reviewed`, and the gate open it SHALL record `marks.approved`, stamp
  `state: "APPROVED"`, and a bare re-run SHALL print the terminal step with
  `next: /spec:genesis` → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-11**: WHEN `--reopen journey:j1` runs on an approved-and-skinned journey
  THE SYSTEM SHALL clear `journeys.j1.approved/skinned/reviewed` and `marks.approved`, append
  one `reopens` entry listing exactly those, print `↩ reopened journey:j1 — invalidated: …`,
  leave every file on disk byte-identical, and the next bare run SHALL derive WIREFRAMES;
  `--reopen theme` SHALL clear `theme`, every `skinned/reviewed` mark and `approved` and
  derive THEME → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-12**: WHEN `design-atlas.js serve --root <r> --port 4321` starts THE SYSTEM
  SHALL print first `serving http://localhost:4321/atlas/index.html — remote: ssh -L
  4321:localhost:4321 <host>`, serve `GET /mocks/a.html` with status 200, `cache-control:
  no-store` and the file's bytes, answer `GET /../package.json` with 404, and exit on SIGTERM
  (test runner: async `child_process.spawn` + `http.get`, never `runNode`) → `tests/design-atlas.test.js`
- **AC-20260902-07-13**: WHEN `look-probe` runs with `PATH` pointing at a stub `npx` that
  exits 1 THE SYSTEM SHALL exit 2 naming `npx playwright install chromium`, and a bare run at
  SHAPES SHALL refuse with the same message unless `status.look` is `browser`
  (`look-via browser` records it and the bare run then prints the step); with a stub `npx`
  that exits 0 and writes its argv to a file, `look a --state busy --out <png>` SHALL invoke
  `playwright screenshot --viewport-size=390,844 file://…/.look-a.html <png>`, and no
  `.look-a.html` SHALL remain afterwards → `tests/mocks/mocks-driver.test.js`
- **AC-20260902-07-14**: WHEN `design-atlas.js build` runs on a root whose `design/mocks/seed.md`
  declares journey `j1` with `a -> b` and `a.html` declares states `busy` and `empty` THE
  SYSTEM SHALL emit a section headed `j1` containing the persona line, two frames for `a`
  (`data-state="busy"`, `data-state="empty"`) and one for `b`, a `shapes` section for
  `design/shapes/*.html`, and SHALL NOT list any file under `design/mocks/references/`; a root
  with roadmap surfaces and no seed SHALL CONTINUE TO build byte-identically to today →
  `tests/design-atlas.test.js`
- **AC-20260902-07-15**: WHEN `spec-paths mocks-driver` runs THE SYSTEM SHALL print an
  absolute path ending in `spec/scripts/mocks-driver.js`; `spec-paths shared-for mocks` SHALL
  print the scoped header plus exactly the D16 sections (`## Design Canon`, `## Design Atlas`
  present; `## Design Render Gate` absent); and `/spec:mocks`'s read load (own file +
  shared-for) SHALL be ≤500 lines → `tests/spec-paths.test.js` (read-load: the standing
  `tests/consistency/read-load.test.js` picks the new command up automatically)

## Assumptions (escalation triggers)

- A1: Playwright CLI reachability (executed 2026-09-02, this machine): `npx --no-install
  playwright --version` → `Version 1.62.1`, exit 0; `npx --no-install playwright screenshot
  --viewport-size=390,844 file://…/spike.html spike.png` wrote a 4469-byte PNG;
  `node -e "require.resolve('playwright')"` exits 1 from this repo and from Hearwell — the npx
  CLI, not module resolution, is the probe. **if false on a host:** the probe refuses with the
  install remedy; `look-via browser` is the recorded alternative.
- A2: `design-atlas.js check` on a dry-run wireframe (executed): 3 violations — `no
  data-screen-label`, `does not link a tokens.css`, `8 off-token color literal(s) (#999…)` —
  so D6's contract (label, `wire/tokens.css` link, colors only in the linked css) is what
  makes wireframes pass at sketch level. **if a wireframe needs an inline color:** it goes
  into `wire/tokens.css` as a role; never a check exemption.
- A3: The `check` link regex `<link[^>]+tokens\.css` accepts `../wire/tokens.css` (substring
  match — read from source). **if false:** name the wire tokens file `tokens.css` under
  `design/wire/` — it already is; only the directory differs.
- A4: A same-origin iframe's `[data-state-btn]` can be clicked from the atlas page when
  served (render-inventory already clicks it in-page). **if false on file://:** frames show
  the default state and the state label only — degraded, never broken.
- A5: `docs/design/research-brief.md` is authored by the mocks session at SEED via the
  existing `wf-research` + genesis.md § Genesis: Fresh UX Research method; no script change
  is needed to invoke it from this command. **if the section moves:** spec 08 owns genesis.md
  and must keep the heading resolvable (citations-check).
- A6: One driver row in `spec/entrypoints.json` satisfies the entrypoint conformance suite
  (forward + reverse checks) — the same shape genesis-driver.js uses. **if the suite demands
  a second caller:** add `spec/doctrine/mocks.md` as an entry point, as design-atlas.js does.

## Rationale

The driver is a copy of the genesis driver's discipline, not of its states: derive from disk,
print one step, close on artifacts, checkpoint every mark. What is new is the granularity — a
mark per journey, per direction, per skinned and reviewed journey — because the dry run
compacted several times and only survived because the canon and the ledger lived on disk.
The seed keys are closed so the driver can refuse a missing one by name; the two
Hearwell-specific items were generalized rather than dropped because both caught real
misunderstandings (W10, W11).

THEME deliberately has no anchor directions: JJ's ruling in this session is that direction
depends on the product and audience and that the session should guess from the seed or ask —
so the driver checks a `theme-directions` row said by the user, never a fixed pair. The
side-by-side state view is derived from canon-shaped files instead of authored as frames
because the approved set must be consumable as `design_source` unchanged (Out of scope).

Registers are signatures: a wireframe links `wire/`, a skinned screen links `tokens.css`.
That is the cheapest deterministic test of "never a half-styled middle". `serve` lands here
rather than in spec 10 because the SSH rule is part of the command's first run; notes grow on
it later. Client access is the forwarded port only (JJ's pick): no export, no hosting.

Fragile: `theme-picked` copies tokens verbatim — a direction that edits `design/tokens.css`
directly afterwards is fine (product tokens are the host's from then on), but re-marking
`theme-picked` would overwrite it; the driver refuses a second `theme-picked` without
`--reopen theme`. Rejected: putting shapes/theme under `design/mocks/` (the atlas walk would
read them as surfaces).

Deviations folded at close (2026-09-02, review rv_0d5a90343171), both one-offs:
- D8 names `theme-directions` and `theme` product rows without pinning how the driver finds
  them — ledger ids are `^[A-Z]+\d+[a-z]?$`, so the test fixture carries the literal
  `theme-directions: <kebab>` / `theme: <kebab>` in the `claim` cell and the driver reads that
  shape; assertions are on driver behavior, not the row's exact form.
- D18's 7.61.0 target was already shipped by spec 06; the build bumped to 7.62.0 (the standing
  § Gotchas version-target rule).

## Canonical Delta

`docs/canonical/design.md` gains **The mocks command (specs/20260902/07)**: `/spec:mocks` is
the standalone design stage — `mocks-driver.js` derives SEED → SHAPES → WIREFRAMES → THEME →
SKIN → REVIEW → APPROVED from `design/mocks/status.json` plus disk, checkpoints every mark
(`✅ checkpoint — mocks state saved …`), gates every advance on the provenance ledger, and
records a sub-mark per journey, direction, skinned and reviewed journey; the 13 seed fact keys
are closed; wireframes link `design/wire/`, skinned screens link `design/tokens.css`; THEME
opens with a direction interview (no fixed anchors); `design-atlas.js serve` prints the
port-forward line and the driver's `look` captures through the Playwright CLI. Replace the
canonical genesis chain line with `/spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`.
