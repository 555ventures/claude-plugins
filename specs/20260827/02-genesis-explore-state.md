---
date: 2026-08-27
status: implementing
tier: critical           # edits the genesis-state-gate.sh hook (process boundary) and spec/bin/spec-paths
area: genesis
design: false
breaking: false
depends_on: [specs/20260827/01-genesis-tournament.md]
depended_on_by: [specs/20260827/03-genesis-design-state.md]
brief: 10a
spiked: 2026-08-27
diff_base: 0eb4ddf6dcf699cd7f3c8035ca2a65435075ed13
open_markers: 0
---

# Explore folds into the driver: tiles before the race, one gallery for stack × design

## Goal

The explore stage stops being a command. Its Round 0 — fresh UX research, position briefs,
starter tokens, Sonnet-built style tiles, the deterministic check, the gallery, the cull to two
— becomes driver states between `MENUS` and `FINALISTS`, so the two culled positions render
**inside each finalist's scaffold** with its real component library as the tournament's
`style-tile` task, and the user judges stack and look in one gallery. A design the user already
made (a Claude Design export or any local mock bundle) enters as an **external candidate** and
skips the funnel; the pick records stack and design together. `spec/commands/genesis-explore.md`
and its hook arm are deleted and the name is swept from every live surface. Done means: the
explore states run end-to-end against a synthetic host, the hook admits nothing it did not
before and blocks nothing new, and the suite is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New state `EXPLORE` between `MENUS` and `FINALISTS`, entered for **visual archetypes** `web-app`, `mobile-app`, `realtime-trading`, `desktop-app`; every other archetype has the driver write `explore: "skipped"` on the first derivation past `MENUS` and continue. Marks added (closed set): `research-done` · `positions-authored` · `tiles-built` · `tiles-culled` · `external --file <dir>`. `status.explore` values written by the driver: `research-done`, `positions-authored`, `tiles-built`, `tiles-culled`, `external`, `picked`, `skipped` (AC-20260827-02-1) | Brief 10a: Round 0 runs before the tournament as a driver state; the pick precedes the lock |
| D2 | `--mark research-done`: `docs/design/research-brief.md` exists, non-empty, with ≥1 `## ` heading; `design/targets.json` parses with non-empty `themes` and `viewports` arrays, each viewport `{name, width, height}`; refusal names the file or key. Explore's research menus go through the existing `--mark menu-written` (the driver runs `registry-check.js`) — no new currency path (AC-20260827-02-2) | The constraints floor and the matrix are the two artifacts the funnel binds to; currency stays one mechanism |
| D3 | `--mark positions-authored`: `design/explore/positions.md` has **6–8** `## Position: <kebab>` blocks, each carrying the seven labels `**Stance:**`, `**Rules cited:**`, `**Anti-defaults:**`, `**Reference direction:**`, `**Motion character:**`, `**Density & layout intent:**`, `**Starter tokens:**`; each `design/explore/r0-<kebab>/tokens.css` exists non-empty; the driver copies each to `.claude/genesis/explore/authored/<kebab>.css` (the additions-only baseline); refusal names the position and the missing label or file (AC-20260827-02-3) | A position missing a mandatory field is not built (`design-positions.md`); the on-disk baseline replaces the mid-stage commit the old command needed for its `git diff` |
| D4 | `--mark tiles-built`: each `design/explore/r0-<kebab>/tile.html` exists; the driver runs `design-atlas.js check design/explore/r0-<kebab>` per dir through `runChild` (exit ≠ 0 → refused naming the dir with the check's stdout); each current `tokens.css` `startsWith` its authored copy (a changed or removed authored line → refused naming the file: `builders append, never alter`); then runs `design-atlas.js gallery design/explore --out design/explore/gallery.html`; step text: open the gallery, cull to 2 in `## Cull record` (AC-20260827-02-3, AC-20260827-02-4) | Deterministic check before human eyes, always; the render → screenshot → session critique loop precedes this mark and is the session's (step text names it) |
| D5 | `--mark tiles-culled`: `positions.md`'s `## Cull record` carries a `- **<kebab>** — culled:` line for every position **except exactly two**; records `explore.finalists = [a, b]` (the two survivors, in position order) and `explore: "tiles-culled"`; zero, one, or ≥3 survivors → exit 2 naming the count (AC-20260827-02-4) | The cull is the user's; the record is the closure |
| D6 | `--mark external --file <dir>`: `<dir>` is under `design/explore/external/`, exists, and holds ≥1 `.html` file each carrying a `data-screen-label` attribute; `design/targets.json` as D2; `docs/design/research-brief.md` is **not** owed; records `explore.finalists = ["external/<name>"]`, `explore: "external"`; the research/positions/tiles marks are refused afterwards (`explore is external — no funnel`) (AC-20260827-02-5) | Brief 10a: a supplied design is one more candidate; no extraction script (`dc-extract` is gone) — the bundle's literals are what the design state authors from |
| D7 | Tile source derivation replaces spec 01 D6's sketch source: the `style-tile` task's tiles are `explore.finalists` — for a position, `design/explore/r0-<kebab>/tile.html` + its `tokens.css`; for an external candidate, the dir — one `probe.json` entry per tile keyed `tile: "<kebab>"` or `"external/<name>"`; `sketch.html` is never a tile source; `explore: skipped` → the `style-tile` task is dropped from the expected set (AC-20260827-02-6) | The two culled looks render in each finalist with its real component library — this is what dissolves the explore/architect boundary |
| D8 | `--mark picked` additionally, when `explore.finalists` is non-empty: `.claude/genesis/design-pick.json` parses; `winner` equals one tile source (`design/explore/r0-<kebab>` or `design/explore/external/<name>`); every other tile appears as `rejected[].candidate` with a non-empty `reason`; success writes `explore: "picked"` alongside spec 01's `tournament.winner`; an external candidate is the pick by construction (`winner` must equal it) (AC-20260827-02-6) | Stack × design are picked together; the pick record feeds the design state's Dissents |
| D9 | `spec/scripts/genesis-state-gate.sh`: the `/spec:genesis-explore*` pattern is removed from **both** `case` lists; the design arm's legacy `ABSENT` note and its block message no longer say `/spec:genesis-explore` (they say `the genesis explore state`); the header comment's explore line goes; everything else byte-identical — the init arm, the design arm's `picked|skipped` logic, `require_scaffold`'s messages (AC-20260827-02-7) | Critical hook surface; one arm removed, the others observed unchanged |
| D10 | `spec/commands/genesis-explore.md` is deleted (worker file deletion, no git); `spec/bin/spec-paths`: the `genesis-explore)` `shared-for` entry is removed and `genesis)` gains `Design Canon`; `spec/entrypoints.json`: the `spec/commands/genesis-explore.md` entry is dropped from the `design-atlas.js`, `registry-check.js`, `report-render.js`, and `wf-research.js` rows; the driver's HANDOFF `next:` becomes `/spec:genesis-design <idea>` when `designCatalog` is neither absent nor `"none"`, else `/spec:init` (AC-20260827-02-8) | New-surface checklist in reverse; `shared-for genesis` now serves the doctrine the explore seat read |
| D11 | Sweep — `genesis-explore` retired from every live surface: `spec/doctrine/core.md` line 8's chain (`/spec:genesis` → `/spec:genesis-design`); `spec/doctrine/design.md`'s `explore/` bullet (`genesis explore-state candidates`); `spec/scripts/design-atlas.js`'s targets comment; `README.md` (the greenfield block and the command table); `.claude-plugin/marketplace.json`'s description; `spec/doctrine/genesis.md` (the read-by line, the Archetype Registry sentence, § Fresh UX Research, § Explore Stage rewritten as `## Genesis: Explore State` — states, marks, external candidate, tile fold, what the driver checks vs what the session judges; the Round-1 prototypes and persona walkthroughs are **retired** (JJ 2026-08-27: the booted finalist is the interactive candidate); § State Machine; § On-disk Handoff); `spec/commands/genesis.md`'s chain bullet. `tests/consistency/genesis-doctrine.test.js` gains a standing repo-wide emptiness sweep for `genesis-explore` on the AC-20260825-04-9 pattern (same walk, its own justified waive-list) (AC-20260827-02-8) | One binding home for the command name; the repo-wide sweep is the correction the 20260825/04 review prescribed |
| D12 | Regression pins: the hook SHALL CONTINUE TO exit 2 for `/spec:genesis-design idea` at `explore: tiles-culled` and exit 0 at `picked`/`skipped`, exit 0 for `/spec:init` at `design: rules-locked`, and exit 0 with empty stderr for `/spec:genesis idea` at any state; `spec-paths shared-for genesis` SHALL CONTINUE TO emit `## Host Grounding`; the AC-20260825-04-7 `next:` pin is updated in place to `/spec:genesis-design`; spec 01's sketch-tile test is rewritten in place to reach PROBE through the external path (AC-20260827-02-7, AC-20260827-02-8) | A hook edit must be observed to change only what it names |
| D13 | Tests: `tests/genesis/explore-states.test.js` (new, real driver, synthetic hosts, tiles authored as minimal `tokens.css` + `tile.html` pairs that pass `design-atlas.js check` — Assumptions A1); `tests/genesis-gate.test.js` (explore-arm tests replaced by the inert pin; design/init pins tagged); `tests/consistency/genesis-doctrine.test.js` (AC-8; AC-20260825-04-9's `shared-for genesis-explore` pin retargeted to `genesis`; AC-20260825-03-9's file list drops the deleted command); edit-only rows for `tests/spec-paths.test.js`, `tests/consistency/red-fixture-coverage.test.js`, `tests/genesis/genesis-driver.test.js`, `tests/genesis/tournament.test.js` [no-ac: test-plumbing row] | Behavioral tests; colliding pins updated in place and retagged, never weakened |
| D14 | `spec/.claude-plugin/plugin.json` bumps to the next free 7.40.x with a changelog paragraph naming the explore states, the external candidate, the tile fold, the deleted command, and the hook arm [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1–D8, D10 HANDOFF next |
| spec/scripts/genesis-state-gate.sh | MODIFY | scripts | D9 |
| spec/scripts/design-atlas.js | MODIFY | scripts | D11 targets comment only |
| spec/bin/spec-paths | MODIFY | scripts | D10 shared-for map |
| spec/entrypoints.json | MODIFY | scripts | D10 rows |
| spec/commands/genesis-explore.md | DELETE | doctrine | D10 (the worker deletes the file; the close commit records it) |
| spec/commands/genesis.md | MODIFY | doctrine | D10/D11 chain bullet, HANDOFF `next` |
| spec/commands/genesis-design.md | MODIFY | doctrine | D11 its Setup/predecessor mentions of the explore command → "the genesis explore state" (the file itself is spec 03's deletion) |
| spec/templates/design-positions.md | MODIFY | doctrine | D11 the § citation `Genesis: Explore Stage` → `Genesis: Explore State` (citations-check) |
| spec/doctrine/genesis.md | MODIFY | doctrine | D11 |
| spec/doctrine/core.md | MODIFY | doctrine | D11 chain line |
| spec/doctrine/design.md | MODIFY | doctrine | D11 `explore/` bullet |
| README.md | MODIFY | other | D11 |
| .claude-plugin/marketplace.json | MODIFY | other | D11 |
| docs/canonical/genesis.md | MODIFY | other | D11 the Driver section's "`/spec:genesis-explore` and `/spec:genesis-design` follow after HANDOFF until brief 10a folds them in" → names the explore state and the still-separate design command (the Canonical Delta appends at review; this edit keeps the standing sweep green at build) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D14 |
| tests/genesis/explore-states.test.js | CREATE | tests | AC-20260827-02-1, AC-20260827-02-2, AC-20260827-02-3, AC-20260827-02-4, AC-20260827-02-5, AC-20260827-02-6 |
| tests/genesis-gate.test.js | MODIFY | tests | AC-20260827-02-7 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260827-02-8 |
| tests/spec-paths.test.js | MODIFY | tests | edit-only: the `shared-for genesis-explore` asserts retarget to `genesis` (Design Canon served) — no new AC |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | edit-only: the hook's red fixture plants `/spec:genesis-design` at `explore: pending` instead of the retired explore command — no new AC |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | edit-only: AC-20260825-04-7's `next:` literal → `/spec:genesis-design` (pin kept) — no new AC |
| tests/genesis/tournament.test.js | MODIFY | tests | edit-only: AC-20260827-01-5's sketch-tile case reaches PROBE through `--mark external` (pin kept) — no new AC |

Twenty-three rows against the ~15 guideline: ten are one-line literal edits the retired name
forces (D11) and four are edit-only test rows; splitting the sweep from the deletion would
leave the tree naming a dead command between siblings, which is the exact class this repo's
§ Gotchas records.

## Contracts

States after this spec: `DISCOVERY` → `MENUS` → [`EXPLORE`] → [`FINALISTS` → `RACE` → `PROBE`
→ `PICK`] → `DECIDE` → … → `HANDOFF`. EXPLORE's own progression is mark-driven:
`research-done` → `positions-authored` → `tiles-built` → `tiles-culled`, or `external`.

`status.explore` (string enum, hook-compatible: the design arm reads `picked|skipped`):
`pending` · `research-done` · `positions-authored` · `tiles-built` · `tiles-culled` ·
`external` · `picked` · `skipped`.

`status.exploreRecord` (driver-written, additive):

```json
{ "finalists": ["instrument", "dense-professional"], "authoredAt": "…", "culledAt": "…" }
```

(`explore.finalists` in the Decisions column means this record's `finalists`.)

`design-pick.json` at `picked` (template unchanged; the driver reads):

```json
{ "winner": "design/explore/r0-instrument",
  "rejected": [{ "candidate": "design/explore/r0-dense-professional", "reason": "…", "salvage": null }] }
```

`probe.json` style-tile entries after D7:

```json
{ "task": "style-tile", "tile": "instrument", "passed": true, "retries": 0, "tokens": 20440, "screenshot": ".claude/genesis/tournament/evidence/next-bun/style-tile.instrument.png" }
```

Step-text excerpt (EXPLORE, nothing marked yet):

```
## Step: research the constraints floor and declare the matrix
Read only: .claude/genesis/brief.md (## What I think you're building, ## Research Angles), .claude/genesis/stack-descriptor.json (absent — the stack is not decided yet; archetype from status.json)
Doctrine: spec/doctrine/genesis.md § Genesis: Explore State
funnel: write docs/design/research-brief.md (ux-research-brief.md template) and design/targets.json, then --mark research-done
external: a design you already have → --mark external --file design/explore/external/<name>
```

`genesis-state-gate.sh` arms after D9 (excerpt):

```bash
case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis"|/spec:genesis-design*|/spec:init*) ;;
  *) exit 0 ;;
esac
```

## Behavior

- `research-done` may be marked before or after the explore research menus; each menu still
  goes through `menu-written` (the driver runs the registry check).
- The render → screenshot → session critique loop for tiles runs **before** `tiles-built`; the
  step text says so and names the two-retries-then-drop rule; the driver never renders.
- A tile whose `design-atlas.js check` fails is named with the check's own output; the mark is
  refused as a whole (no partial gallery).
- `tiles-culled` with a cull record naming a position that has no `r0-` dir → exit 2 naming
  it.
- The external path may be marked at any point before `research-done`; after any funnel mark
  it is refused (`the funnel has started — finish it or delete design/explore/ and re-mark`).
- In `PROBE`, the tile sources are the two culled positions' `tile.html` + `tokens.css` paths
  (or the external dir); the worker renders them inside the finalist; the screenshot lands in
  `tournament/evidence/<name>/style-tile.<tile>.png` and the gallery gets one row per tile.
- `picked` writes `explore: picked` for both the funnel and the external path, so the (still
  separate, until spec 03) `/spec:genesis-design` command is admitted by the hook and runs its
  ratification mode unchanged.
- A prompt `/spec:genesis-explore …` now falls through the hook untouched (exit 0, no output);
  the command no longer exists.

## Acceptance Criteria

- **AC-20260827-02-1**: WHEN `--mark menus-done` is accepted with `- archetype: backend-api`
  THE SYSTEM SHALL print `state: FINALISTS` and `status.json` SHALL carry `explore: "skipped"`;
  WHEN the archetype is `web-app` THE SYSTEM SHALL print `state: EXPLORE` with a `Doctrine:`
  line naming `§ Genesis: Explore State` → `tests/genesis/explore-states.test.js`
- **AC-20260827-02-2**: WHEN `--mark research-done` runs with no `design/targets.json` THE
  SYSTEM SHALL exit 2 naming `design/targets.json`; WHEN `targets.json` has an empty
  `viewports` array THE SYSTEM SHALL exit 2 naming `viewports`; WHEN the brief has a `## `
  heading and targets are valid THE SYSTEM SHALL exit 0, write `explore: "research-done"`, and
  print the checkpoint `(EXPLORE → EXPLORE)` → `tests/genesis/explore-states.test.js`
- **AC-20260827-02-3**: WHEN `--mark positions-authored` runs with five positions THE SYSTEM
  SHALL exit 2 naming `6`; with a position lacking `**Motion character:**` → naming that
  position and the label; with six valid positions and their `tokens.css` files THE SYSTEM SHALL
  exit 0 and copy each to `.claude/genesis/explore/authored/<kebab>.css`; WHEN `--mark
  tiles-built` runs after one `tokens.css` had an authored line changed THE SYSTEM SHALL exit 2
  naming that file and `append`; WHEN a tile carries an off-token color THE SYSTEM SHALL exit 2
  naming its dir; WHEN every tile passes THE SYSTEM SHALL write `design/explore/gallery.html`
  and write `explore: "tiles-built"` → `tests/genesis/explore-states.test.js`
- **AC-20260827-02-4**: WHEN `--mark tiles-culled` runs with a cull record leaving three
  survivors THE SYSTEM SHALL exit 2 naming `3`; leaving two THE SYSTEM SHALL record
  `exploreRecord.finalists` as those two in position order, write `explore: "tiles-culled"`, and
  the next bare run SHALL print `state: FINALISTS` → `tests/genesis/explore-states.test.js`
- **AC-20260827-02-5**: WHEN `--mark external --file design/explore/external/mine` runs and the
  dir holds an `.html` with no `data-screen-label` THE SYSTEM SHALL exit 2 naming the file and
  `data-screen-label`; WHEN it holds a labelled screen and `targets.json` is valid THE SYSTEM
  SHALL exit 0 with no `docs/design/research-brief.md` present, record
  `exploreRecord.finalists === ["external/mine"]`, write `explore: "external"`, and a later
  `--mark research-done` SHALL exit 2 naming `external` → `tests/genesis/explore-states.test.js`
- **AC-20260827-02-6**: WHEN the PROBE step prints after a cull of `instrument` and
  `dense-professional` THE SYSTEM SHALL list `style-tile` with both `design/explore/r0-instrument/tile.html`
  and `design/explore/r0-dense-professional/tile.html` and SHALL NOT name `sketch.html`; WHEN
  `--mark probe-done` runs with a `style-tile` entry for only one tile THE SYSTEM SHALL exit 2
  naming the missing tile; WHEN `--mark picked` runs with no `design-pick.json` THE SYSTEM SHALL
  exit 2 naming it; with `winner: "design/explore/r0-instrument"` and `dense-professional` in
  `rejected[]` THE SYSTEM SHALL write `explore: "picked"` and `tournament.winner` →
  `tests/genesis/explore-states.test.js`
- **AC-20260827-02-7**: WHEN the hook receives `/spec:genesis-explore idea` with `architect:
  pending` THE SYSTEM SHALL exit 0 with empty stdout and stderr (no arm); and it SHALL CONTINUE
  TO exit 2 for `/spec:genesis-design idea` at `explore: tiles-culled`, exit 0 at `explore:
  picked` and `explore: skipped`, exit 0 for `/spec:init` at `design: rules-locked`, and exit 0
  with empty stderr for `/spec:genesis idea`; the design arm's block message SHALL NOT contain
  `genesis-explore` → `tests/genesis-gate.test.js`
- **AC-20260827-02-8**: WHEN `spec-paths shared-for genesis` runs THE SYSTEM SHALL emit
  `## Design Canon` and SHALL CONTINUE TO emit `## Host Grounding`; `spec-paths shared-for
  genesis-explore` SHALL fall back to the full doctrine (its map entry is gone — the output
  contains `## Design Render Gate`, which the scoped list never served); `spec/commands/genesis-explore.md`
  SHALL NOT exist; `spec/entrypoints.json` SHALL name it in no row; `spec/doctrine/genesis.md`
  SHALL contain `## Genesis: Explore State` and SHALL NOT contain `## Genesis: Explore Stage`;
  and no file in the repo outside the justified waive-list (this test file, the three sibling
  specs' dated headers in `tests/`, `spec/.claude-plugin/plugin.json`, `spec/scripts/genesis-driver.js`'s
  header, `spec/templates/grounding-contract.md`, and the `specs/`, `docs/roadmap/`, `docs/audit/`,
  `docs/adr/` prefixes — dated records) SHALL contain `genesis-explore` →
  `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- A1 (executed micro-spike 2026-08-27, S4): `design-atlas.js check <r0 dir>` exits 0 for a tile
  linking `./tokens.css` with a root `data-screen-label` and `var(--role)` colors, exits 1
  naming `does not link a tokens.css` and `off-token color literal` for a tile that breaks
  either; `design-atlas.js gallery <explore dir> --out <file>` exits 0 and writes the gallery —
  the fixtures in D13 are exactly that shape — **if false**: STOP.
- A2 (executed 2026-08-27, S6): `current.startsWith(authored)` is true for an appended
  `tokens.css` and false when an authored value changed — the additions-only carrier without
  git — **if false**: STOP.
- A3: the hook's design arm reads only `.explore` ∈ `picked|skipped` (read 2026-08-27, lines
  55–65); writing `external`/`tiles-built` into `status.explore` blocks `/spec:genesis-design`
  until `picked`, which is the intended order — **if false** (a hook test reddens): the driver's
  enum write is wrong, not the hook.
- A4: `wf-research`'s `stage: "explore"` contract is untouched — the explore research menus
  are ordinary `interview-research/<key>.json` files marked `menu-written` — **if false**: the
  driver follows the menu on disk; amend the step text, never fork the grammar.
- A5: `spec-paths shared-for <unknown>` falls back to both full docs (read 2026-08-27, the `*)`
  arm) — AC-8's fallback assertion depends on it — **if false**: assert exit 0 + non-empty
  output instead; never re-add the map entry.
- A6: `tests/consistency/red-fixture-coverage.test.js`'s `genesis-state-gate.sh` handler only
  needs *a* prompt the hook blocks at `architect: pending` — `/spec:genesis-design` at that
  state is blocked by `require_scaffold` byte-identically — **if false**: the whole-suite check
  names it; retarget the fixture, never the hook.

## Rationale

Brief 10 unit C's second half and the first half of unit D′: the tournament needs design tiles
before the stack pick, which is what dissolves the explore/architect boundary. After spec 01
the driver races finalists; after this spec it also owns the taste funnel's closure checks
(research brief + matrix present, six-to-eight complete positions, tiles that pass the
deterministic check on tokens the session authored and builders only extended, a cull that
leaves exactly two) and prints the judgment steps the old command narrated.

**Round 1 prototypes and persona walkthroughs are retired** (JJ, 2026-08-27, recommended and
taken): each finalist is booted with the two culled looks rendered in its real component
library — that *is* the interactive candidate. A throwaway-HTML prototype round would show the
user code that never touches the real stack, for one more round of attention. Salvage: the
research brief's behavioral archetypes still bind mock authoring later.

**External candidate** (derived, veto anytime): lives at `design/explore/external/<name>/`;
admission is location plus a root screen label per file; `targets.json` is still owed because
the matrix is a declaration, not research. The literals in the bundle are what the design
state authors tokens from — no extraction script (spec 20260824/05 deleted `dc-extract`).

**Row count** (20): see the File Plan note — the retired name forces seven one-line edits.

**Rejected:** keeping the explore command as a deprecated stub (two entry points, and the
hook would carry a dead arm); a `git diff` additions-only check (needs a mid-state commit;
`startsWith` against an on-disk copy is the same invariant with no git); rendering tiles in
the driver (the driver never renders — the session captures via the render MCP; no finalist
declares a capture command yet, so `render-gate --mocks` is not available at this point).

Collision-closure at lock (2026-08-27, `--literal genesis-explore --literal "Explore Stage"`,
`unplanned=22 likely=3`): paths leg `likely` — `tests/consistency/entrypoints.test.js`
(exhaustive live pin over `entrypoints.json` and the hook rows — the add/remove-a-member class,
caught at build, no waive owed per § Gotchas), `tests/consistency/genesis-doctrine.test.js` and
`tests/spec-paths.test.js` (File Plan rows). Literals leg — every hit is a File Plan row except:
`docs/adr/0001-design-authoring-local-first.md` (dated decision record — **waived**, and
`docs/adr/` joins the sweep's waived prefixes), `docs/audit/*`, `docs/roadmap/*` (waived by
location), `spec/.claude-plugin/plugin.json` (changelog — **waived**, in the sweep's list),
`spec/templates/grounding-contract.md` (hash — **waived** per specs/20260825/04 D14). Three
hits became rows rather than waives: `spec/commands/genesis-design.md` (still live until spec
03 — its predecessor line must not name a dead command), `spec/templates/design-positions.md`
(a `§ Genesis: Explore Stage` citation that `citations-check` would flag once the heading is
renamed), and `docs/canonical/genesis.md` (live reference; the 20260825/04 review established
that a canonical doc naming a dead command is a catch, not a waive — edited at build, appended
at review). The lowercase "explore stage" phrases in `docs/canonical/design.md` and the hook's
legacy-note comment are generic prose, not citations — **waived**. `SHALL CONTINUE TO` pins:
AC-7 (hook arms), AC-8 (shared-for genesis).

## Canonical Delta

Append to `docs/canonical/genesis.md` § *Driver (architect stage)*: *Since specs/20260827/02
the explore funnel is a driver state (`EXPLORE`, between `MENUS` and `FINALISTS`) for visual
archetypes: marks `research-done` (research brief + `design/targets.json`) → `positions-authored`
(6–8 complete position briefs, session-authored starter `tokens.css` snapshotted to
`.claude/genesis/explore/authored/`) → `tiles-built` (the driver runs `design-atlas.js check`
per tile, enforces additions-only tokens by prefix, builds the gallery) → `tiles-culled` (exactly
two survivors); or `external --file design/explore/external/<name>` for a supplied design (no
research owed). The two culled looks are the tournament's `style-tile` task, rendered inside
each finalist; `picked` records stack and design together (`design-pick.json`). Round-1
prototypes and persona walkthroughs are retired. `/spec:genesis-explore` is deleted and its hook
arm removed; `/spec:genesis-design` still follows HANDOFF until spec 03.*
