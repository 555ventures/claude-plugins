---
date: 2026-08-27
status: hardened
tier: critical           # edits the genesis-state-gate.sh hook (process boundary) and spec/bin/spec-paths
area: genesis
design: false
breaking: false
depends_on: [specs/20260827/02-genesis-explore-state.md]
depended_on_by: [specs/20260827/04-genesis-conventions-handoff.md]
brief: 10a
spiked: 2026-08-27
open_markers: 0
---

# Design becomes a driver state: ratify the pick inside `/spec:genesis`

## Goal

The design stage stops being a command. After the roadmap is written, the driver enters
`DESIGN`: the session ratifies the picked look — the winner's `tokens.css` verbatim as canon,
the one-page doctrine with every rejected direction in its Dissents, the promoted and
matrix-expanded signature screen, the base primitives and component vocabulary, and the
category-only `design-rules.json` — and the driver closes each step mechanically (file present,
prefix intact, `design-atlas.js check --matrix` and `components-check.js` green, rule enum
valid), prunes the losing candidates, and hands off to `/spec:init`.
`spec/commands/genesis-design.md` and its hook arm are deleted and the name is swept. Done
means: `/spec:genesis` runs the whole greenfield path to HANDOFF for a visual, a non-visual,
and a design-`skipped` archetype against synthetic hosts, the hook's init arm is byte-identical
in behavior, and the suite is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New state `DESIGN` between `ROADMAP` and `HANDOFF`. Archetypes `backend-api` and `data-ml` never enter it: the driver writes `design: "skipped"` on the first derivation past `ROADMAP`. Non-visual archetypes (`conversational-bot`, `cli-devtool`) take marks `doctrine-drafted` → `rules-locked`; visual archetypes (`web-app`, `mobile-app`, `realtime-trading`, `desktop-app`) take `doctrine-drafted` → `tokens-landed` → `rules-locked`. Marks added (closed set): `doctrine-drafted` · `tokens-landed` · `rules-locked` (AC-20260827-03-1) | Same applicability gate as the old command's Phase 0; the enum values the init hook arm reads are unchanged |
| D2 | `--mark doctrine-drafted`: `docs/design/doctrine.md` exists, ≤ 120 lines, with a `## Dissents` heading followed by ≥1 non-blank line; when `.claude/genesis/design-pick.json` exists, the basename of every `rejected[].candidate` appears in the Dissents body; refusal names the file, the line count, or the missing candidate; success writes `design: "doctrine-drafted"` (AC-20260827-03-2) | Doctrine stays one page; a rejected direction is a recorded minority position, never deleted work |
| D3 | `--mark tokens-landed` (visual only; refused for non-visual with `no tokens step for <archetype>`): `design/tokens.css` exists; when the pick's `winner` is a `design/explore/r0-<kebab>` dir, `design/tokens.css` `startsWith` that dir's `tokens.css` (ratified verbatim, extension only) — an external winner has no prefix rule; `design/mocks/` holds ≥1 `.html` with `data-status="approved"`; the driver runs `design-atlas.js check --matrix design/mocks` through `runChild` (exit ≠ 0 → refused with the check's stdout); `design/components.json` exists; success writes `design: "tokens-landed"` (AC-20260827-03-3) | Tokens are ratified, not authored; the winner's signature screen is promoted to `design/mocks/` and expanded across `targets.json` before approval — `check --matrix` is the deterministic carrier |
| D4 | `--mark rules-locked`: `.claude/genesis/design-rules.json` parses with a `rules` array; every rule carries `id` (string), `targetCategory` ∈ `color|typography|i18n|structure|a11y|density|layout`, `grounding` ∈ `grounded|taste`, `severity` (string), `appliesTo` (array); non-visual archetypes may carry an empty `rules` array; visual: the driver runs `components-check.js design/components.json` through `runChild` (exit ≠ 0 → refused with its stdout); then **prune**: delete every `design/explore/r0-*` dir except the winner's, every `design/explore/external/*` dir except the winner's, `design/explore/gallery.html`, `.claude/genesis/sketch.html`, and `.claude/genesis/explore/authored/`; success writes `design: "rules-locked"` and advances to `HANDOFF` (AC-20260827-03-4) | Category-only rules are `/spec:enforce`'s input; the prune the old command performed after lock is now a driver act, so it cannot be forgotten |
| D5 | HANDOFF `next:` is `/spec:init` for every archetype; `spec/commands/genesis.md`'s chain bullet becomes `Chain: /spec:genesis → /spec:atlas sweep + your holistic atlas review → /spec:init → /spec:enforce → /spec:plan docs/roadmap/01-*.md` (design-`skipped` archetypes drop the atlas link) and its `next` slot is `{kind: 'command', text: '/spec:init'}`; the driver's `nextCommandLine()` loses its catalog branch (AC-20260827-03-5) | Design is inside genesis now; the atlas's scheduled appearance moves to "after `/spec:genesis`" |
| D6 | `spec/scripts/genesis-state-gate.sh`: the `/spec:genesis-design*` pattern is removed from both `case` lists and the now-callerless `require_scaffold` function is deleted; the init arm's two messages replace `/spec:genesis-design` with `the genesis design state (re-run /spec:genesis)`; the header comment names only the init arm; the init arm's exit codes per `design` value are byte-identical (AC-20260827-03-6) | Critical hook surface; the init arm is the only gate left and is observed unchanged |
| D7 | `spec/commands/genesis-design.md` is deleted (worker file deletion, no git); `spec/bin/spec-paths`: the `genesis-design)` `shared-for` entry is removed and `genesis)` gains `Design Authoring Contracts`; `spec/entrypoints.json`: the `spec/commands/genesis-design.md` entry is dropped from the `components-check.js`, `registry-check.js`, `report-render.js`, and `wf-research.js` rows (AC-20260827-03-7) | New-surface checklist in reverse |
| D8 | Sweep — `genesis-design` retired from every live surface: `spec/doctrine/design.md` (§ Design Authoring Contracts' consumer line, the base-primitives and component-vocabulary sentences, `components-check`'s "fail-closed at genesis-design's commit" → "at the genesis design state's `rules-locked` mark"); `spec/commands/init.md` (the genesis-precedence block's four arms name `the genesis design state` and `re-run /spec:genesis` as the finisher; the Phase 7 report line likewise); `spec/commands/atlas.md` (two "after genesis-design" sentences → "after `/spec:genesis`"); `spec/templates/design-positions.md`'s cull-record comment; `spec/scripts/components-check.js`'s callers comment; `README.md`; `.claude-plugin/marketplace.json`; `spec/doctrine/core.md` line 8's chain (`/spec:genesis` alone); `spec/doctrine/genesis.md` (read-by line, § Archetype Registry's skipped sentence, § Discovery Interview's sketch-prune sentence, § Enforcement Handoff, § State Machine, § On-disk Handoff, and a new `## Genesis: Design State` carrying the ratification variant of the old Phase 4 — tokens ratified not authored, doctrine distilled, the dimension + behavioral ledgers, base primitives + component vocabulary, the design-rules closure check, the prune — moved verbatim where it was prose, never re-authored); `spec/commands/genesis.md`. `tests/consistency/genesis-doctrine.test.js` gains a standing repo-wide emptiness sweep for `genesis-design` on the AC-20260825-04-9 pattern (AC-20260827-03-7) | One binding home for the name; the doctrine the command carried moves, it does not die |
| D9 | Regression pins: the hook SHALL CONTINUE TO exit 2 for `/spec:init` at `design: doctrine-drafted` and `tokens-landed`, exit 0 at `rules-locked` and `skipped`, exit 0 with a note at `pending`, and exit 0 with empty stderr for `/spec:genesis idea`; `spec-paths shared-for genesis` SHALL CONTINUE TO emit `## Design Canon` and `## Host Grounding`; AC-20260825-04-7's `next:` pin is updated in place to `/spec:init` for both `designCatalog` values (AC-20260827-03-6, AC-20260827-03-7) | A hook edit must be observed to change only what it names |
| D10 | Tests: `tests/genesis/design-state.test.js` (new, real driver, synthetic hosts reaching ROADMAP through fake commands, minimal `tokens.css`/mock/components/rules fixtures — Assumptions A1–A3); `tests/genesis-gate.test.js` (design-arm tests replaced by the inert pin; init pins tagged); `tests/consistency/genesis-doctrine.test.js` (AC-7; AC-20260825-01-4, -02-1, -02-3, -03-9 file lists and the sketch-prune sentence retargeted in place, pins kept); edit-only rows for `tests/spec-paths.test.js`, `tests/consistency/red-fixture-coverage.test.js`, `tests/genesis/genesis-driver.test.js` [no-ac: test-plumbing row] | Behavioral tests; colliding pins updated in place, never weakened |
| D11 | `spec/.claude-plugin/plugin.json` bumps to the next free 7.40.x with a changelog paragraph naming the design state, the prune, the deleted command, and the hook arm [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1–D5 |
| spec/scripts/genesis-state-gate.sh | MODIFY | scripts | D6 |
| spec/scripts/components-check.js | MODIFY | scripts | D8 callers comment only |
| spec/bin/spec-paths | MODIFY | scripts | D7 shared-for map |
| spec/entrypoints.json | MODIFY | scripts | D7 rows |
| spec/commands/genesis-design.md | DELETE | doctrine | D7 (the worker deletes the file; the close commit records it) |
| spec/commands/genesis.md | MODIFY | doctrine | D5 chain + next; D8 |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8 (`## Genesis: Design State` + sweep) |
| spec/doctrine/core.md | MODIFY | doctrine | D8 chain line |
| spec/doctrine/design.md | MODIFY | doctrine | D8 four mentions |
| spec/commands/init.md | MODIFY | doctrine | D8 precedence block + report line |
| spec/commands/atlas.md | MODIFY | doctrine | D8 two sentences |
| spec/templates/design-positions.md | MODIFY | doctrine | D8 comment |
| README.md | MODIFY | other | D8 |
| .claude-plugin/marketplace.json | MODIFY | other | D8 |
| docs/canonical/genesis.md | MODIFY | other | D8 the Driver section's remaining `/spec:genesis-design` sentence → the design state (the Canonical Delta appends at review; this edit keeps the standing sweep green at build) |
| docs/canonical/design.md | MODIFY | other | D8 the Component vocabulary paragraph's `/spec:genesis-design` Phase 4.3 citation → the genesis design state's `rules-locked` mark |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11 |
| tests/genesis/design-state.test.js | CREATE | tests | AC-20260827-03-1, AC-20260827-03-2, AC-20260827-03-3, AC-20260827-03-4, AC-20260827-03-5 |
| tests/genesis-gate.test.js | MODIFY | tests | AC-20260827-03-6 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260827-03-7 |
| tests/spec-paths.test.js | MODIFY | tests | edit-only: the `shared-for genesis-design` asserts retarget to `genesis` (Design Authoring Contracts served) — no new AC |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | edit-only: the hook's red fixture plants `/spec:init` at `design: doctrine-drafted` — no new AC |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | edit-only: AC-20260825-04-7's `next:` literals → `/spec:init` for both catalogs (pin kept) — no new AC |

Twenty-four rows against the ~15 guideline: eleven are one-line or one-paragraph literal edits
the retired name forces (D8) and three are edit-only test rows; the same reasoning as spec 02
applies — the name dies in one landing unit or the tree lies between siblings.

## Contracts

States after this spec: … → `ROADMAP` → [`DESIGN`] → `HANDOFF`. DESIGN's progression is
mark-driven: `doctrine-drafted` → [`tokens-landed`] → `rules-locked`.

`status.design` (string enum, unchanged values — the init hook arm reads it): `pending` ·
`doctrine-drafted` · `tokens-landed` · `rules-locked` · `skipped`.

Design-rules shape the driver validates (template `spec/templates/design-rules.json`,
unchanged): each `rules[]` entry `{id, targetCategory, appliesTo[], severity, grounding, …}`.

Step-text excerpt (DESIGN, visual, nothing marked):

```
## Step: ratify the pick — doctrine first
Read only: .claude/genesis/design-pick.json, design/explore/positions.md, docs/design/research-brief.md, <winner dir>/tokens.css
Doctrine: spec/doctrine/genesis.md § Genesis: Design State
Then:
  node …/genesis-driver.js --root <root> --mark doctrine-drafted
```

`genesis-state-gate.sh` after D6 (whole gate, excerpt):

```bash
case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis"|/spec:init*) ;;
  *) exit 0 ;;
esac
case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis") exit 0 ;;
esac
# … init arm unchanged: rules-locked|skipped → 0; doctrine-drafted|tokens-landed → 2; else note + 0
```

## Behavior

- `design: skipped` is written by the driver, never marked, and only for `backend-api`/`data-ml`.
- The old command's legacy mode (no pick on disk) does not exist in the driver: a visual
  archetype always reaches `DESIGN` with `explore: picked` (spec 02 guarantees the pick before
  `DECIDE`); a `status.json` predating spec 02 with no `exploreRecord` → the DESIGN step says
  so and names `design/explore/` as the place to drop a candidate and re-run from `EXPLORE`
  (the driver re-derives `EXPLORE` when `explore` is not `picked`/`skipped` for a visual
  archetype).
- The matrix expansion (media queries per declared viewport, the dark block) is Sonnet work
  the DESIGN step names; the driver's `check --matrix` is the gate; the session's screenshots
  and the user's fast matrix confirm precede `tokens-landed`.
- Prune happens on the accepted `rules-locked` mark, after the components check — a refused
  mark deletes nothing.
- A prompt `/spec:genesis-design …` falls through the hook untouched; the command no longer
  exists.

## Acceptance Criteria

- **AC-20260827-03-1**: WHEN the bare run passes `roadmap-written` with archetype `backend-api`
  THE SYSTEM SHALL print `state: HANDOFF` and `status.json` SHALL carry `design: "skipped"`;
  with `web-app` THE SYSTEM SHALL print `state: DESIGN` with a `Doctrine:` line naming
  `§ Genesis: Design State`; with `cli-devtool` `--mark tokens-landed` SHALL exit 2 naming
  `cli-devtool` and `no tokens step` → `tests/genesis/design-state.test.js`
- **AC-20260827-03-2**: WHEN `--mark doctrine-drafted` runs with a 130-line doctrine THE
  SYSTEM SHALL exit 2 naming `130`; with an empty `## Dissents` → naming `Dissents`; with a
  `design-pick.json` rejecting `r0-dense-professional` and a Dissents body not naming
  `dense-professional` → naming it; WHEN all hold THE SYSTEM SHALL write
  `design: "doctrine-drafted"` and print the checkpoint `(DESIGN → DESIGN)` →
  `tests/genesis/design-state.test.js`
- **AC-20260827-03-3**: WHEN `--mark tokens-landed` runs with `design/tokens.css` not starting
  with the winner's `tokens.css` THE SYSTEM SHALL exit 2 naming `design/tokens.css` and
  `verbatim`; with no approved mock in `design/mocks/` → naming `data-status="approved"`; with
  a mock failing `check --matrix` (no viewport meta) → naming `design/mocks` with the check
  output; WHEN the ratified file, an approved matrix-clean mock, and `design/components.json`
  are present THE SYSTEM SHALL write `design: "tokens-landed"` → `tests/genesis/design-state.test.js`
- **AC-20260827-03-4**: WHEN `--mark rules-locked` runs with a rule whose `targetCategory` is
  `engine` THE SYSTEM SHALL exit 2 naming `engine` and the seven categories; with a duplicate
  component `name` in `components.json` THE SYSTEM SHALL exit 2 carrying `components-check`'s
  output; WHEN valid THE SYSTEM SHALL write `design: "rules-locked"`, delete
  `design/explore/r0-dense-professional/`, `design/explore/gallery.html`,
  `.claude/genesis/sketch.html`, and `.claude/genesis/explore/authored/`, keep
  `design/explore/r0-instrument/` and `design/explore/positions.md`, and the next bare run SHALL
  print `state: HANDOFF` → `tests/genesis/design-state.test.js`
- **AC-20260827-03-5**: WHEN HANDOFF prints for `designCatalog: "storybook"` and for
  `designCatalog: "none"` THE SYSTEM SHALL print `next: /spec:init` in both and SHALL NOT print
  `genesis-design`; `spec/commands/genesis.md`'s chain bullet SHALL contain
  `/spec:genesis → /spec:atlas` and SHALL NOT contain `genesis-explore` or `genesis-design` →
  `tests/genesis/design-state.test.js`
- **AC-20260827-03-6**: WHEN the hook receives `/spec:genesis-design idea` at `explore:
  tiles-culled` THE SYSTEM SHALL exit 0 with empty stdout and stderr (no arm); and it SHALL
  CONTINUE TO exit 2 for `/spec:init` at `design: doctrine-drafted` and `tokens-landed`, exit 0
  at `rules-locked` and `skipped`, exit 0 with stdout matching `/Genesis note/` at `pending`, and
  exit 0 with empty stderr for `/spec:genesis idea`; the init arm's messages SHALL NOT contain
  `genesis-design` → `tests/genesis-gate.test.js`
- **AC-20260827-03-7**: WHEN `spec-paths shared-for genesis` runs THE SYSTEM SHALL emit
  `## Design Authoring Contracts` and SHALL CONTINUE TO emit `## Design Canon` and `## Host
  Grounding`; `spec/commands/genesis-design.md` SHALL NOT exist; `spec/entrypoints.json` SHALL
  name it in no row; `spec/doctrine/genesis.md` SHALL contain `## Genesis: Design State`; and
  no file in the repo outside the justified waive-list (this test file, the sibling specs'
  dated headers in `tests/`, `spec/.claude-plugin/plugin.json`, `spec/scripts/genesis-driver.js`'s
  header, `spec/templates/grounding-contract.md`, and the `specs/`, `docs/roadmap/`,
  `docs/audit/`, `docs/adr/` prefixes — dated records) SHALL contain `genesis-design` →
  `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- A1 (executed micro-spike 2026-08-27, S4): `design-atlas.js check` accepts a directory and
  reports per-file violations with exit 1; `--matrix` with a `design/targets.json` present
  additionally requires the viewport meta and the dark tokens block (header comment, read
  2026-08-27) — the AC-3 fixture's failing mock omits the viewport meta — **if false** (the
  matrix check is keyed differently): the fixture follows the script's header; never a
  weakened assertion.
- A2: `components-check.js` exits non-zero on a duplicate `name` and 0 on a valid manifest
  (`docs/canonical/design.md`, Component vocabulary) — **if false**: the AC-4 fixture breaks a
  different documented rule; never a bypass.
- A3 (executed 2026-08-27, S6): `startsWith` is the ratified-verbatim carrier — **if false**:
  STOP.
- A4: the hook's init arm (lines 68–81, read 2026-08-27) reads `.design` only — removing the
  design arm and `require_scaffold` cannot change its exits — **if false** (a gate test
  reddens): the edit removed more than it names; restore, never re-add an arm.
- A5: no other plugin file cites `## Genesis: Explore Stage` after spec 02 (spec 02's
  sweep) and none cites a `genesis-design.md` phase by number (executed 2026-08-27:
  `git grep -n "genesis-design.md Phase\|Phase 4\.[0-9]" spec/` → `spec/doctrine/design.md`
  line 80 "seeded directly by `/spec:genesis-design`" carries no phase number; `docs/canonical/design.md`
  "Phase 4.3"/"Phase 4.5" are canonical history, waived by the Canonical Delta's own edit) —
  **if false**: add the row; never a stale reference.

## Rationale

The second half of brief 10 unit D′: with explore folded (spec 02) the only command left
outside the driver was the design lock, and its ratification mode is almost entirely closure
checks — file present, tokens verbatim, dissents complete, rules category-valid, manifest
valid — which is exactly what the driver exists to own. The judgment (distilling doctrine,
authoring the extension tokens, the ledgers, seeding primitives and vocabulary) stays the
session's and is named per step; the prune, which the old command performed after its own
lock and which a session could forget, is now an act of the accepted mark.

The old command's **legacy mode** (direction interview with no pick) is not carried: after
spec 02 a visual archetype cannot reach `DECIDE` without a pick, and a pre-spec-02
`status.json` re-derives `EXPLORE` (Behavior). Fewer paths, one canon.

**Ordering** (design after the roadmap, before handoff): the roadmap decomposition is written
"while the interview, decision, and ADR context is still hot" and the design canon consumes the
pick, which predates the decision record — either order is coherent; roadmap-first keeps the
existing `ROADMAP → HANDOFF` pins and the atlas's "after genesis, before the first UI brief"
appearance intact.

**Row count** (22): see the File Plan note.

**Rejected:** keeping `genesis-design.md` as a brownfield-only command (init's greenfield
adopt/craft path already covers a repo without a genesis canon); moving the design state before
`DECIDE` (the descriptor's `designCatalog` is written at `DECIDE` and the canon's consumed
surface depends on the chosen framework); a `design: external` enum value (the hook reads
`design`, and an external pick ratifies exactly like a funnel winner — same marks).

Collision-closure at lock (2026-08-27, `--literal genesis-design --literal require_scaffold`,
`unplanned=22 likely=3`): paths leg `likely` — `tests/consistency/entrypoints.test.js`
(exhaustive live pin, add/remove-a-member class, caught at build, no waive owed),
`tests/consistency/genesis-doctrine.test.js` and `tests/spec-paths.test.js` (rows). Literals
leg — every hit is a File Plan row except: `spec/commands/genesis-explore.md` (deleted by spec
02 before this builds), `docs/audit/*`, `docs/roadmap/*` (waived by location),
`spec/.claude-plugin/plugin.json` (changelog — **waived**), `spec/templates/grounding-contract.md`
(hash — **waived** per specs/20260825/04 D14; its line 131 still says
`/spec:genesis-architect` + `/spec:genesis-design` and will until a genuine contract edit).
`docs/canonical/genesis.md` and `docs/canonical/design.md` became rows, not waives (live
reference — edited at build, appended at review). `require_scaffold` is defined and called only
inside the hook, and named in `tests/genesis-gate.test.js` (row). The `tests/spec-paths.test.js`
AC-20260824-05-3 message text "genesis-design keeps this section unchanged" is a comment on a
design-command assertion, updated in place. `SHALL CONTINUE TO` pins: AC-6 (init arm), AC-7
(shared-for genesis).

## Canonical Delta

Append to `docs/canonical/genesis.md` § *Driver (architect stage)* (and retitle that section
*Driver (the whole greenfield path)*): *Since specs/20260827/03 the design lock is a driver
state (`DESIGN`, between `ROADMAP` and `HANDOFF`): marks `doctrine-drafted` (one-page doctrine,
Dissents carrying every rejected direction) → `tokens-landed` (visual only: `design/tokens.css`
starts with the winner's file verbatim, an approved matrix-expanded mock passes `design-atlas.js
check --matrix`, `design/components.json` exists) → `rules-locked` (`design-rules.json`
category/grounding enums valid, `components-check.js` green, then the driver prunes the losing
candidates, the gallery, the sketch, and the authored-tokens snapshot). `backend-api`/`data-ml`
are written `design: skipped`; non-visual archetypes skip the tokens mark. HANDOFF always hands
to `/spec:init`. `/spec:genesis-design` is deleted, its hook arm removed; the genesis hook now
gates only `/spec:init` on a partial canon.* In `docs/canonical/design.md`, replace the two
`/spec:genesis-design` citations (Component vocabulary "Seeded by `/spec:genesis-design` Phase
4.3", "fail-closed at genesis's commit step") with "seeded by the genesis design state
(specs/20260827/03) at its `rules-locked` mark".
