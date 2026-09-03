---
date: 2026-09-02
status: hardened
tier: critical             # genesis-state-gate.sh is a hook surface (pipeline rules § Risk Tiers); genesis-driver.js is the greenfield boot path
area: genesis
design: false
breaking: true             # the EXPLORE/DESIGN driver states and their marks are retired; legacy status.json files resume at BRIEF
depends_on: [specs/20260902/07-mocks-command-driver.md]
depended_on_by: [specs/20260902/11-brief-from-approved-set.md]
brief: 22
open_markers: 0
---

# Genesis shrinks: DISCOVERY hands off to `/spec:mocks`, BRIEF ratifies the approved set

## Goal

Genesis loses its design states. The driver's chain becomes DISCOVERY → BRIEF → MENUS →
[FINALISTS → RACE → PROBE → PICK] → DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF →
GROUNDED: DISCOVERY names the archetype and hands off to `/spec:mocks` (or to an existing
approved set); BRIEF is entered only when `design/mocks/status.json` is `APPROVED` with zero
open product rows and is where the design lock is ratified (doctrine, tokens from THEME,
category-only rules); EXPLORE's tile funnel, the tournament's `style-tile` probe, the separate
DESIGN state and the throwaway discovery sketch are retired. A legacy `status.json` past MENUS
resumes at BRIEF with its existing artifacts, no re-run forced. Done = the driver, hook,
doctrine, templates and tests carry none of the retired states, and a legacy fixture resumes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `deriveState` order: DISCOVERY → BRIEF → MENUS → tournament block → DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF → GROUNDED; the `EXPLORE` and `DESIGN` branches, `exploreResolved`, `tileSourcesFor`, `handleResearchDone/PositionsAuthored/TilesBuilt/TilesCulled/External`, `handleDoctrineDrafted/TokensLanded/RulesLocked`, `pruneDesignExplore`, and their `STEPS` entries are deleted; `--mark` refuses the eight retired marks by name with the remedy `run /spec:mocks` (AC-20260902-08-1, AC-20260902-08-2) | ADR-0006: the design stage leaves genesis; a retired mark must fail loudly, never fall through. |
| D2 | `discovery-done` additionally requires `- archetype: <registry key>` in `## Picks` (moved here from `menus-done`, which SHALL CONTINUE TO accept it when already present) and records `status.archetype`; the DISCOVERY step text ends with the hand-off: for a visual archetype `next: /spec:mocks` (or `--mark brief-written` once `design/mocks/status.json` is APPROVED), for a non-visual archetype `--mark brief-written` directly (AC-20260902-08-3) | The mocks seed already asked primary surface, so the archetype is a discovery fact; whether a mocks set is owed must be known before BRIEF, not after MENUS. |
| D3 | BRIEF precondition (visual archetypes): `design/mocks/status.json` exists with `state: "APPROVED"` and `gateVerdict(design/mocks/ledger.md)` is `open` (spec 06's lib, read directly); refused otherwise naming the state or the blocking rows and `run /spec:mocks` (AC-20260902-08-4) | The brief's gate verbatim: genesis decides nothing until the product has been shown, corrected and approved. |
| D4 | BRIEF ratification (`--mark brief-written`), tiered by archetype: `backend-api`/`data-ml` owe nothing beyond DISCOVERY (the mark records `design: "skipped"`); `conversational-bot`/`cli-devtool` owe `docs/design/doctrine.md` (≤120 lines, `## Dissents` non-empty) and `.claude/genesis/design-rules.json` passing the retained `designRulesCheck` (rules array, category enum, grounding enum; empty array allowed); visual archetypes owe both plus `## Dissents` naming every composed-but-unpicked direction from `design/mocks/status.json.directions` and `design/tokens.css` present (THEME wrote it); on success `status.marks.briefWritten`, `status.brief = {mocks: "design/mocks/status.json"\|null, legacy, ratifiedAt}`, and `status.design = "ratified"` (AC-20260902-08-5) | "Tokens exist from THEME; the lock is a ratification inside BRIEF" — the surviving closure checks of the old DESIGN state, relocated; the pick record is the mocks status now, not `design-pick.json`. |
| D5 | Components check relocates: `skeleton-landed` (visual archetypes) additionally requires `design/components.json` to exist and `components-check.js` to exit 0 (spec 11 makes SCAFFOLD extract it from the composed set; until then the session seeds it at SKELETON per the surviving doctrine) (AC-20260902-08-6) | The manifest is a skeleton artifact once the shell and inventory are extracted from mocks; nothing before SCAFFOLD can produce it honestly. |
| D6 | Legacy resume: a `status.json` with `marks.menusDone` and no `marks.briefWritten` derives BRIEF and its step text opens `legacy: explore/design artifacts accepted in place of a mocks set`; `--mark brief-written --legacy` skips D3 (never D4) and records `brief.legacy: true`; every downstream legacy mark stays valid so the run lands on its real next state after one mark (AC-20260902-08-7) | The brief: "resumes at BRIEF with its existing artifacts, no re-run forced" (Hearwell is exactly this shape). |
| D7 | Tournament: `style-tile` leaves `PROBE_TASKS` for every archetype; PROBE's expected task set and `probe-done` no longer look for tile entries; `.claude/genesis/sketch.html` is no longer authored at DISCOVERY nor pruned anywhere (AC-20260902-08-8) | The tile fold rendered one screen's look inside each finalist; the approved set now exists before any finalist, so there is nothing to fold. |
| D8 | `genesis-state-gate.sh`'s init arm: pass on `design` ∈ `ratified\|rules-locked\|skipped`; SHALL CONTINUE TO block on `doctrine-drafted\|tokens-landed` (legacy partial canon, message now says "re-run /spec:genesis to reach BRIEF"); note (never block) on `pending`, worded "the genesis BRIEF state has not ratified a design canon" (AC-20260902-08-9) | Hook surface, critical: retargeted in place, never weakened; legacy values keep their meaning. |
| D9 | Doctrine: `spec/doctrine/genesis.md` deletes `## Genesis: Explore State` and `## Genesis: Design State`, adds `## Genesis: Brief State` (D3/D4/D6 as contract prose), rewrites `## Genesis: State Machine` (new chain; `status.brief`; legacy rule), `## Genesis: Discovery Interview` (archetype at discovery; the seed hand-off; the throwaway sketch paragraph deleted), `## Genesis: Archetype Registry` (column renamed `Mocks set owed`), `## Genesis: Tournament of Scaffolds` (no tile fold), `## Genesis: Enforcement Handoff` (rules from BRIEF), `## Genesis: On-disk Handoff` (roster without explore/pick/positions; adds the `design/mocks/` workspace pointer); `## Genesis: Fresh UX Research` survives verbatim (spec 07 cites it) with its two `rules-locked`/explore sentences reworded to BRIEF/`/spec:mocks` (AC-20260902-08-10) | One doctrine home per fact; citations-check must stay MISS=0 across `spec/` after the section deletions. |
| D10 | `spec/commands/genesis.md` (≤120 lines): the loop is unchanged; the chain bullet becomes `Chain: /spec:mocks → /spec:genesis → /spec:enforce → /spec:plan docs/roadmap/01-*.md` (visual) or `/spec:genesis → /spec:enforce → /spec:plan …` (non-visual); the atlas-sweep link is dropped; `spec/commands/init.md`'s design-precedence branch adds `ratified` to the consume case (AC-20260902-08-11) | `/spec:atlas` stays the derived view (2026-08-31 ruling) — the whole-product picture now precedes genesis, so the sweep is no longer a scheduled stage. |
| D11 | Templates: `status.json` → `schemaVersion: 3` (drops `explore`, adds `brief: null`; `design` retained); `design-positions.md` and `design-pick.json` deleted; the driver reads v2 files as-is (missing keys default) and rewrites v3 on the next accepted mark (AC-20260902-08-1) | Retired artifacts leave with their state; legacy files must still load. |
| D12 | Tests: `tests/genesis/explore-states.test.js` and `tests/genesis/design-state.test.js` are deleted; `tests/genesis/brief-state.test.js` is created; `genesis-driver.test.js`, `tournament.test.js`, `conventions-handoff.test.js` (its data-ml fixtures gain the one `--mark brief-written` line the new chain requires before `menus-done`), `genesis-gate.test.js`, and `tests/consistency/genesis-doctrine.test.js` are retargeted in place (pins updated to the new enum, never weakened); a repo-wide `sweepRetiredLiteral` for `design-pick.json`, `positions.md`, `style-tile`, `tiles-culled`, `positions-authored` across `spec/`, `README.md`, `.claude-plugin/` with this spec's path as the citation waiver (AC-20260902-08-12) | The suite's own pattern for retired commands (AC-20260827-02-8, -03-7); the sweep is the reopen condition. |
| D13 | Version bump → 7.62.0 target; changelog names the retired states and the BRIEF gate | § Planning. `[no-ac: standing plugin-version pin]` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1–D7, D11: new chain, BRIEF state + mark, archetype at discovery, legacy resume, style-tile removal, components check at skeleton, retired marks refused |
| spec/scripts/genesis-state-gate.sh | MODIFY | scripts | D8: init arm accepts `ratified`; messages reworded (legacy values keep behavior) |
| spec/doctrine/genesis.md | MODIFY | doctrine | D9 |
| spec/commands/genesis.md | MODIFY | doctrine | D10 |
| spec/commands/init.md | MODIFY | doctrine | D10: `ratified` joins the consume branch; "genesis design state" wording → "genesis BRIEF state" |
| spec/templates/status.json | MODIFY | doctrine | D11: schemaVersion 3, `brief: null`, no `explore` |
| spec/templates/design-positions.md | DELETE | doctrine | D11 |
| spec/templates/design-pick.json | DELETE | doctrine | D11 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D13 |
| tests/genesis/brief-state.test.js | CREATE | tests | AC-20260902-08-3, AC-20260902-08-4, AC-20260902-08-5, AC-20260902-08-6, AC-20260902-08-7, AC-20260902-08-13, AC-20260902-08-14 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20260902-08-1, AC-20260902-08-2 (v3 status shape; retired marks refused; regression pins retagged) |
| tests/genesis/tournament.test.js | MODIFY | tests | AC-20260902-08-8, AC-20260902-08-15 (backend-api fixtures gain `--mark brief-written`; web-app style-tile cases rewritten) |
| tests/genesis/conventions-handoff.test.js | MODIFY | tests | D12: data-ml fixtures gain `--mark brief-written` before `menus-done`; assertions unchanged (retag with AC-20260902-08-2's continue clause) |
| tests/genesis-gate.test.js | MODIFY | tests | AC-20260902-08-9, AC-20260902-08-16 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260902-08-10, AC-20260902-08-11, AC-20260902-08-12, AC-20260902-08-17 |
| tests/genesis/explore-states.test.js | DELETE | tests | D12 |
| tests/genesis/design-state.test.js | DELETE | tests | D12 |

Seventeen rows (two are deletions, four are one-line fixture retargets the chain change
invalidates by construction — § Gotchas' exhaustive-pin class): one primary area, one build
run. `docs/canonical/*` and `README.md`'s genesis line are not rows — the canonical delta is
applied at review; README's chain line is spec 07's row (already landed).

Collision closure (lock, `collision-closure.js --literal design-pick positions.md style-tile
tiles-culled positions-authored research-done doctrine-drafted tokens-landed rules-locked`):
every `spec/`, `tests/genesis/`, `tests/genesis-gate.test.js`, `tests/consistency/genesis-doctrine.test.js`
hit is a row above. Waived, with reason: `docs/canonical/design.md` + `genesis.md` (the
Canonical Delta below, applied at review); `docs/roadmap/20-shell-composed-mocks.md` (brief
history — the sweep's waived prefix); `tests/consistency/red-fixture-coverage.test.js` (plants
`doctrine-drafted` and expects a block — D8 keeps that legacy behavior, so it stays green
untouched, A4); `spec/scripts/components-check.js` (header comment naming its old caller —
mentions only; the call site moves in D5, the comment is retargeted by spec 11's extraction
row, which edits the manifest contract); `spec/doctrine/design.md` (two sentences naming
`rules-locked` and the `positions.md`/`design-pick.json` grounding — spec 09's design.md row
rewrites both, and 09 builds after this spec in the same brief). `executes` hits:
`tests/genesis/conventions-handoff.test.js` → row above; `tests/consistency/entrypoints.test.js`
(hook path unchanged — green).

## Contracts

```jsonc
// .claude/genesis/status.json — schemaVersion 3 (template). v2 files load unchanged; rewritten as v3 on the next mark.
{ "schemaVersion": 3, "architect": "pending", "design": "pending", "archetype": null, "localeScope": null,
  "tournament": null, "brief": null,
  "stackDescriptorPath": ".claude/genesis/stack-descriptor.json",
  "designManifestPath": ".claude/genesis/design-rules.json",
  "gateCommand": null, "lastUpdated": null, "marks": {}, "menus": {}, "scaffold": null, "zeroDayGate": null, "handoff": null }
// brief (written by --mark brief-written):
//   { "mocks": "design/mocks/status.json" | null, "legacy": false|true, "ratifiedAt": "<ISO>" }
// design ∈ pending | ratified | skipped   (+ legacy-only: doctrine-drafted | tokens-landed | rules-locked)
```

Driver surface:

```
--mark discovery-done            # + `- archetype: <key>` required in ## Picks
--mark brief-written [--legacy]  # BRIEF: D3 precondition (skipped with --legacy) + D4 ratification
retired (exit 2, stderr names `run /spec:mocks`):
  research-done | positions-authored | tiles-built | tiles-culled | external | doctrine-drafted | tokens-landed | rules-locked
```

BRIEF step text (visual, fresh run):

```
## Step: brief — ratify the approved set into the design canon
Read only: design/mocks/seed.md, design/mocks/ledger.md, design/mocks/status.json, design/tokens.css, .claude/genesis/brief.md
Doctrine: spec/doctrine/genesis.md § Genesis: Brief State
mocks: APPROVED · journeys: 5 · directions composed: quiet, warm (picked: quiet) · open product rows: 0
Write docs/design/doctrine.md (one page, ## Dissents naming: warm) and .claude/genesis/design-rules.json, then:
  node <driver> --root <root> --mark brief-written
```

Legacy variant replaces the `mocks:` line with `legacy: explore/design artifacts accepted in
place of a mocks set (explore: picked, design: rules-locked)` and the `Then:` with
`--mark brief-written --legacy`. Non-visual variant omits `design/tokens.css` from `Read
only:` and the Dissents clause names `(none — no directions composed)`.

Hook (`genesis-state-gate.sh` init arm), exact behavior table:

| `design` value | exit | channel |
|---|---|---|
| `ratified`, `rules-locked`, `skipped` | 0 | silent |
| `doctrine-drafted`, `tokens-landed` | 2 | stderr: `… partial design canon (design: <value>) — re-run /spec:genesis to reach BRIEF and ratify it …` |
| `pending` / absent | 0 | stdout note: `Genesis note: … the genesis BRIEF state has not ratified a design canon (design: pending) …` |

## Behavior

- **DISCOVERY** step text is unchanged except: (1) the missing-archetype line `missing ##
  Picks line: - archetype: <key>` when absent; (2) the closing hand-off, visual archetype:
  `next: run /spec:mocks in this repo (seed → shapes → wireframes → theme → skin → review →
  approved), then --mark brief-written` — or, when `design/mocks/status.json` is already
  APPROVED, `an approved set exists — --mark brief-written`; non-visual: `--mark brief-written`
  (no set owed). The throwaway `sketch.html` instruction is gone.
- **BRIEF derivation:** `!marks.briefWritten` after `discoveryDone` → BRIEF, regardless of any
  later legacy marks (D6). `brief-written` refusals, in order: precondition (D3, unless
  `--legacy` or non-visual), doctrine file/line cap/Dissents, design-rules shape, tokens
  presence; each names the artifact and the remedy.
- **Dissents check:** every key of `design/mocks/status.json.directions` other than
  `status.theme` must appear as a substring in the `## Dissents` body; legacy runs with no
  mocks status use the old `design-pick.json` rejected list when that file exists, else no
  name is required.
- **MENUS onward:** unchanged, except the tournament's expected task set has no `style-tile`
  and the PROBE step prints no tile source line. `handleMenusDone` no longer writes
  `explore`; `handleRoadmapWritten` no longer writes `design` (BRIEF did) and hands to HANDOFF.
- **HANDOFF/GROUNDED:** unchanged; the driver's HANDOFF `Read only:` list still includes
  `design-rules.json` when present.
- **Legacy file loading:** `freshStatus()` has no `explore`; `loadStatus()` keeps unknown keys
  (`explore`, `exploreRecord`) from a v2 file untouched, so a legacy run's record survives
  for the BRIEF step text and nothing else reads it.
- **Retired marks:** the `default:` branch of `handleMark` lists the live marks only; a retired
  name hits a dedicated branch: `genesis-driver: mark "<m>" was retired with the genesis design
  states (specs/20260902/08) — the design stage is /spec:mocks; run it, then --mark
  brief-written`.

## Acceptance Criteria

- **AC-20260902-08-1**: WHEN the driver creates `status.json` on a cold root THE SYSTEM SHALL
  write `schemaVersion: 3` with `brief: null`, `design: "pending"`, and no `explore` key; WHEN
  it loads a v2 file carrying `explore: "picked"` THE SYSTEM SHALL keep that key in memory and
  on the next accepted mark rewrite the file as v3 still carrying `explore: "picked"` →
  `tests/genesis/genesis-driver.test.js`
- **AC-20260902-08-2**: WHEN `--mark tiles-culled` (or any of the eight retired marks) runs
  THE SYSTEM SHALL exit 2 with stderr naming the mark, `retired`, and `/spec:mocks`, and
  `deriveState` SHALL never print `EXPLORE` or `DESIGN` for any status shape (a v2 file with
  `explore: "pending"` and a visual archetype past MENUS derives BRIEF) →
  `tests/genesis/genesis-driver.test.js`
- **AC-20260902-08-3**: WHEN `--mark discovery-done` runs with every coverage key covered but
  no `- archetype:` line THE SYSTEM SHALL exit 2 naming `archetype` and the eight registry
  keys; with `- archetype: web-app` it SHALL record `status.archetype` and print a DISCOVERY→
  BRIEF checkpoint whose step text names `/spec:mocks`; with `- archetype: backend-api` the
  step text SHALL name `--mark brief-written` and not `/spec:mocks` →
  `tests/genesis/brief-state.test.js`
- **AC-20260902-08-4**: WHEN `--mark brief-written` runs for `web-app` with no
  `design/mocks/status.json` THE SYSTEM SHALL exit 2 naming that path and `run /spec:mocks`;
  with `state: "SKIN"` it SHALL exit 2 naming `SKIN`; with `state: "APPROVED"` but a ledger
  holding `| W4 | WIREFRAMES | product | c | invented | open | - | - | - |` it SHALL exit 2
  naming `W4` → `tests/genesis/brief-state.test.js`
- **AC-20260902-08-5**: WHEN the precondition holds and `docs/design/doctrine.md` is 121
  lines THE SYSTEM SHALL exit 2 naming the count; when its `## Dissents` omits the composed
  direction `warm` (status `directions: {quiet, warm}`, `theme: quiet`) it SHALL exit 2 naming
  `warm`; when `design-rules.json` carries `targetCategory: "tailwind"` it SHALL exit 2 naming
  the enum; when `design/tokens.css` is absent it SHALL exit 2 naming it; when all hold it SHALL
  record `marks.briefWritten`, `brief: {mocks: "design/mocks/status.json", legacy: false,
  ratifiedAt}`, `design: "ratified"`, and print `(BRIEF → MENUS)`; for `data-ml` it SHALL
  write `design: "skipped"` → `tests/genesis/brief-state.test.js`
- **AC-20260902-08-6**: WHEN `--mark skeleton-landed` runs for `web-app` with the probes and
  binding subset in place but no `design/components.json` THE SYSTEM SHALL exit 2 naming the
  file; with a manifest that duplicates a `name` it SHALL exit 2 carrying `components-check.js`'s
  own line → `tests/genesis/brief-state.test.js`
- **AC-20260902-08-7**: WHEN a v2 `status.json` has `marks.menusDone`, `marks.decided`,
  `architect: "scaffold-complete"`, `marks.roadmapWritten`, `explore: "picked"`, `design:
  "rules-locked"` and no `marks.briefWritten` THE SYSTEM SHALL derive BRIEF with a step text
  containing `legacy:` and `--legacy`; `--mark brief-written` without `--legacy` SHALL exit 2
  naming `design/mocks/status.json`; with `--legacy` and D4's artifacts it SHALL accept,
  record `brief.legacy: true`, and the next bare run SHALL derive HANDOFF (not MENUS or DECIDE)
  → `tests/genesis/brief-state.test.js`
- **AC-20260902-08-8**: WHEN the PROBE step prints for `web-app` THE SYSTEM SHALL list the
  archetype's tasks without `style-tile` and without a tile-source line, and `--mark
  probe-done` SHALL accept a `probe.json` that carries no tile entries →
  `tests/genesis/tournament.test.js`
- **AC-20260902-08-9**: WHEN `/spec:init` is prompted with `design: "ratified"` THE SYSTEM
  SHALL exit 0 silently; with `doctrine-drafted` or `tokens-landed` it SHALL exit 2 with
  stderr echoing the value and naming `BRIEF`; with no `design` it SHALL exit 0 printing a
  `Genesis note` that names `BRIEF` and never `genesis-design` → `tests/genesis-gate.test.js`
- **AC-20260902-08-10**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL carry a
  `## Genesis: Brief State` heading and neither `## Genesis: Explore State` nor `## Genesis:
  Design State`, and `citations-check.js` over `spec/` SHALL report `MISS=0` →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260902-08-11**: WHEN `spec/commands/genesis.md` is read THE SYSTEM SHALL be ≤120
  lines, contain the literal `/spec:mocks → /spec:genesis → /spec:enforce`, and not contain
  `/spec:atlas sweep`; `spec/commands/init.md` SHALL contain `ratified` within its design
  precedence list → `tests/consistency/genesis-doctrine.test.js`
- **AC-20260902-08-12**: WHEN the retired-literal sweep runs for `design-pick.json`,
  `positions.md`, `style-tile`, `tiles-culled`, `positions-authored` over `spec/`, `README.md`,
  and `.claude-plugin/` THE SYSTEM SHALL return zero offenders (citations of
  `specs/20260902/08-genesis-shrink-brief-state.md` and of the historical spec paths
  `specs/20260827/0[123]-*.md` waived; `specs/`, `docs/`, `.claude/spec-runs*` never swept),
  and `spec/templates/design-positions.md` / `design-pick.json` SHALL not exist →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260902-08-13**: WHEN `--mark menus-done` runs on a brief whose archetype line is
  already present THE SYSTEM SHALL CONTINUE TO accept it → `tests/genesis/brief-state.test.js`
- **AC-20260902-08-14**: WHEN `--mark skeleton-landed` runs for `web-app` with a valid
  `design/components.json` THE SYSTEM SHALL CONTINUE TO run the zero-day gate →
  `tests/genesis/brief-state.test.js`
- **AC-20260902-08-15**: WHEN `--mark probe-done` accepts a `probe.json` THE SYSTEM SHALL
  CONTINUE TO re-run gate + boot and write the benchmark → `tests/genesis/tournament.test.js`
- **AC-20260902-08-16**: WHEN `/spec:init` is prompted with `design: "rules-locked"` or
  `"skipped"` THE SYSTEM SHALL CONTINUE TO exit 0 → `tests/genesis-gate.test.js`
- **AC-20260902-08-17**: WHEN `spec-paths shared-for genesis` runs THE SYSTEM SHALL CONTINUE TO
  print its scoped sections → `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: The Explore agent's enumeration (this session) of superseded rows — 20260827/02 D1–D8,
  20260827/03 D1–D4/D9, 20260827/01 D6/D7, 20260825/04 D8/D15, 20260901/04 D7/D9/D10 — is what
  ADR-0006's `Applies to` now lists; those specs are `done` and are never edited. **if a
  worker finds a live surface one of them still binds:** it is a File Plan gap — return
  blocked naming the row, never edit a done spec.
- A2: `components-check.js` at `skeleton-landed` runs against a session-seeded manifest until
  spec 11's extraction lands, and only for visual archetypes — `conventions-handoff.test.js`'s
  data-ml fixtures never meet it. **if a host reaches SKELETON with no manifest:** the mark
  refuses naming the file; the SKELETON step text tells the session to seed commitment
  entries from `design/mocks/canon.md`'s primitives (spec 11 mechanizes exactly this).
- A3: `genesis-doctrine.test.js`'s existing `sweepRetiredLiteral` helper takes `{citations,
  waivedPaths, waivedPrefixes}` and is reusable for the five new literals. **if its signature
  changed:** extend it in place; never a second sweep implementation.
- A4: The hook fixture in `tests/consistency/red-fixture-coverage.test.js` plants `design:
  doctrine-drafted` and expects a block — D8 keeps that legacy behavior, so the fixture stays
  green untouched. **if the fixture is edited:** it is out of File Plan — reviewer waive line.
- A5: `/spec:doctor` and `init-gen.js` read no design-state enum (grep: init-gen has no
  reference; doctor's checks read `design.rulesManifest` presence only). **if false:** add
  the row at build (orchestrator duty), never silently.

## Rationale

The chain change is the whole point of the brief: genesis used to commit the framework,
scaffold, roadmap and design lock before the user had seen more than one themed screen. With
the approved set as BRIEF's precondition, everything genesis decides is decided about a
product the user has already corrected on screens. What survives from the old DESIGN state is
exactly the closure checks that were never about taste (doctrine length and Dissents, the
rules enum, the tokens file); the pick record moves from `design-pick.json` to the mocks
status, and the prune has nothing left to prune.

The archetype moves to discovery because BRIEF must know whether a set is owed, and because
the seed's primary-surface fact already answers it — asking it again at MENUS would be the
kind of duplicate the derive-don't-interview rule exists for. Legacy resume is one mark with
`--legacy`, not a migration: Hearwell's status is past ROADMAP with a locked design and must
land on HANDOFF after that one mark, never re-run MENUS.

This spec is `breaking: true` for the driver's mark vocabulary only; no host file format
changes except the additive v3 status. Rejected: keeping EXPLORE as an optional state (two
design paths is the inconsistency the brief measured), and mapping `rules-locked` →
`ratified` on load (rewriting a legacy value hides which path produced the canon).

Version and canonical: the plugin description's "in-driver taste-funnel explore state and
design-ratification state" phrase is replaced by "BRIEF ratifies the /spec:mocks approved set".

## Canonical Delta

`docs/canonical/genesis.md`: the two bullets for specs/20260827/02 (explore funnel) and
/03 (design lock) become one retirement bullet — the design stage left genesis for
`/spec:mocks` (specs/20260902/07); the driver chain is DISCOVERY → BRIEF → MENUS → tournament
→ DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF → GROUNDED; `discovery-done`
requires the archetype; BRIEF requires `design/mocks/status.json` APPROVED with an open
ledger gate and ratifies doctrine + category-only rules + THEME's tokens (`design:
"ratified"`); `style-tile` and the discovery sketch are retired; a legacy status past MENUS
resumes at BRIEF via `--mark brief-written --legacy`. `docs/canonical/design.md`: replace the
"Seeded by the genesis design state … at its `rules-locked` mark" sentences with "seeded at
SKELETON (checked by `components-check.js` at `skeleton-landed`)" and the `tokens-landed`
shell sentence with "the shell canon is extracted from the approved set at SCAFFOLD (spec 11)".
