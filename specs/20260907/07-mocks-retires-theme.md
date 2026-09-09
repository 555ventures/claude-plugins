---
date: 2026-09-07
status: implementing
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260907/04-kit-canon-family.md, specs/20260907/05-genesis-drops-the-theme-gates.md, specs/20260907/06-theme-pick-moves-to-sketch.md]
depended_on_by: [specs/20260907/08-walk-critic.md]
brief: 22a
spiked: 2026-09-07
open_markers: 0
build_base: main
diff_base: ba8b5ae5cf11fed2829cefa6a72dda8893373afe
---

# `/spec:mocks` retires THEME: the state, its two marks, its stop and its reopen are deleted, and the chain ends `WIREFRAMES → SIGNOFF → APPROVED`

## Goal

`specs/20260907/06-theme-pick-moves-to-sketch.md` added the replacement producer — a
`theme state|compose|open|adopt` subcommand family on the mocks driver, outside the state
machine, plus `/spec:sketch`'s theme run — and deliberately left `/spec:mocks`'s `THEME` state
working byte-identically, so that commit had two theme producers and no gap. This spec removes
the old one. It is a **pure deletion: no new behaviour, no new surface, no new refusal**.
`deriveState` loses its `THEME` step, `direction-composed` and `theme-picked` lose their
handlers and their names in the unknown-mark literal, `stop open theme` and `--reopen theme`
lose their branches, `status.theme` / `marks.themePicked` / `status.directions` leave the
status schema, and both doctrine homes stop describing a state that no longer exists. Done means
a root whose canon is written and whose every journey is approved derives `SIGNOFF` directly and
signs off on gray wireframes with no theme anywhere on disk, while every other mark, refusal,
reopen, look stop and report line of `/spec:mocks` behaves exactly as it does today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete `deriveState()`'s `if (!status.theme) return 'THEME'` line. The derived chain becomes `SEED → SHAPES → KIT → WIREFRAMES → SIGNOFF → APPROVED` (KIT from `specs/20260907/04`), and the file-header comment's chain enumerations and the SKIN/REVIEW migration note are re-pointed at it. A root that derives `THEME` today derives `SIGNOFF` on its very next invocation, and a root that already picked a theme derives `SIGNOFF` exactly as it does today — nothing is migrated and nothing on disk is touched (AC-20260907-07-1) | The state's whole job was to produce `design/tokens.css`, and spec 06 moved that producer to `/spec:sketch`. Rejected: keeping `THEME` as a skippable state that passes when `design/tokens.css` happens to exist — a state that always passes reads as a gate and is not one, and it would re-couple sketch's output to the mocks state file. |
| D2 | `AUTHORING_STATES` becomes `new Set(['SHAPES', 'KIT', 'WIREFRAMES'])`; `doBareStep`'s `if (state === 'THEME') return printThemeStep()` line and the whole `printThemeStep()` function are deleted. `SIGNOFF`'s separate look-probe disjunct in `doBareStep` and its no-skill-line behaviour are byte-identical (AC-20260907-07-8, AC-20260907-07-14) | One constant feeds both the skill line and the look probe (spec 20260906/02 D8); a retired state must leave that set or the probe fires for a step nobody can reach. |
| D3 | Delete `handleDirectionComposed()` and `handleThemePicked()` whole, together with their two `doMark` switch cases. The unknown-mark refusal drops both names, going from nine live marks to seven: `unknown mark "<m>" — one of: seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, approved` (AC-20260907-07-2) | Both handlers exist only to serve the retired state; `handleThemePicked`'s body — the ledger discipline, the rejected-cell completeness check, the byte-for-byte token copy — was carried into `theme adopt` verbatim by spec 06 D4, so nothing is lost here. |
| D4 | Delete `buildThemeStopSpec()` and `buildStopSpec`'s `if (step === 'theme')` branch; the unknown-step refusal becomes `stop open: unknown step "<s>" — one of: shapes, kit, journey:<j>, signoff`. The stop **key** `theme-picked` is NOT retired: `design-atlas.js`'s `stopHome('theme-picked') → {type:'theme'}` route and its `#theme` compare-table section stay exactly as they are, because spec 06's `theme open` writes stops under that same key. `spec/scripts/design-atlas.js` is not touched by this spec (AC-20260907-07-3, AC-20260907-07-13) | The atlas never knew about the mocks state machine — it knows stop keys. Executed 2026-09-07 on a scratch copy with `THEME` fully removed from the driver: `tests/design-atlas.test.js` is 60/60 green, unmodified. |
| D5 | Delete `handleApproved()`'s opening precondition `if (!status.marks.themePicked) die('theme-picked first')`. Every other `approved` precondition is byte-identical — each declared seed journey approved, notes and questions resolved, the provenance gate open, a decided `approved` stop, and the render/matrix checks — and it is still the `approved` mark's own write that stamps every top-level mock `data-status="approved"` and records the decider from the stop's `by`. `printApprovedTerminal`'s heading loses its theme clause: `## Step: done — every journey approved, signed off by <decider>` (AC-20260907-07-5, AC-20260907-07-9, AC-20260907-07-12) | Sign-off is now the last gate of a wholly gray stage: `APPROVED` means "this is the product I understand", and the theme is a taste decision the next command makes. `SIGNOFF` itself survives untouched until `specs/20260907/09` replaces it with `CLIENT` — retiring it here would leave no human gate between wireframes and approval. |
| D6 | Delete the `--reopen theme` branch whole. `--reopen shapes` stops clearing `status.directions`, `status.theme` and `marks.themePicked`; its invalidated list becomes `['shape', 'canon', 'kit', 'journeys(all)', 'approved(all)']` (the `kit` entry is `specs/20260907/04` D10's, not this spec's). The refusal literal narrows from `--reopen must be journey:<j>, shapes, kit, or theme` to `--reopen must be journey:<j>, shapes, or kit` (AC-20260907-07-4, AC-20260907-07-6) | Re-picking a theme is now opening a fresh `theme open` stop and adopting again (spec 06 D5) — there is no mark to clear, so a reopen verb for it would clear nothing and lie about it. |
| D7 | `freshStatus()` drops `marks.themePicked` and the top-level `theme` and `directions` keys — a cold `status.json` carries `marks: { seedDone, shapePicked, canonWritten, kitSignedOff, approved }` and no theme field at all. `dropLegacyFields(merged)` gains `delete merged.marks.themePicked`, `delete merged.theme` and `delete merged.directions` beside the existing `reviewOpened` / `journeys[j].skinned` / `journeys[j].reviewed` deletions, so a host checkpointed under the old chain reads clean, derives clean, and stops writing the dead keys back on its next save (AC-20260907-07-7) | The file's own established migration idiom (spec 20260906/02 D1) applied to three more retired fields: read, discard in memory, never write back — no migration step, no version bump of `schemaVersion`, nothing deleted on disk. |
| D8 | Doctrine, one home — `spec/doctrine/mocks.md`: § Mocks: State Machine's fixed-order sentence drops `→ **THEME** (≥2 directions composed, one picked)` and its sub-mark sentence narrows to WIREFRAMES alone; the gated-mark list drops `theme-picked`; the no-gate sentence drops `direction-composed`, leaving `journey-drawn` as its only subject; the reopening paragraph drops the `--reopen theme` clause and gains nothing; § Mocks: Look and Serve's look-probe state list drops `THEME`; § Provenance Ledger's `step` vocabulary drops `THEME` from the live examples, adds `SKETCH` in its place, and names `THEME` beside `SKIN` and `REVIEW` in the retired-but-still-parsing clause; § Mocks: Authoring Rules' **"Theme = recompose, never repaint"** bullet is **deleted whole** (its successor home is `spec/doctrine/design.md` § Design Canon, written by spec 06 D8); and the wire-register bullet's exemption clause `— \`approved\` wireframes from \`/spec:mocks\` sign-off are exempt by design, since THEME already precedes SIGNOFF (specs/20260906/06 D1)` becomes `— \`approved\` wireframes from \`/spec:mocks\` sign-off are exempt by design, because the theme is picked after sign-off now, in \`/spec:sketch\`: an approved gray wireframe is the mocks stage's finished artifact, never a half-dressed screen (specs/20260907/07)` (AC-20260907-07-10) | § Doctrine Authoring: the driver is the mechanism and prose points at it — a state deleted in code and left standing in doctrine is exactly the two-homes defect this repo audits for. The exemption's *reason* inverts even though its *effect* does not: it used to cover a window that had closed, and now covers one that never opens until sketch runs. |
| D9 | Doctrine, one home — `spec/commands/mocks.md`: the `## THEME interview rule` **section heading and its interview paragraph are deleted whole** (successor: `spec/commands/sketch.md` § The run's Theme step, written by spec 06 D7), while that section's trailing generic paragraph — `Every authoring step block the driver prints carries the frontend-design skill line; act on it before the first edit (§ Mocks: Authoring Rules — the one binding home).` — survives verbatim, re-homed as the closing paragraph of `## The driver loop`; the opening blurb's `runs the THEME interview, the look rule, and the sign-off step below` becomes `runs the look rule and the sign-off step below`; § Look rule drops `THEME` from its probe-state list, from its `<step>` enumeration (leaving `shapes` \| `kit` \| `journey:<j>` \| `signoff`), from its human-verdict step list, and from its pick-stop parenthetical (leaving `a pick stop — SHAPES —`); § Sign-off's `every journey, gray, theme tokens already in place` becomes `every journey, gray`; § Report's `outcome` becomes `✅ mocks approved — {N} journeys, signed off by {name}` and its `theme: {direction} — rejected {others}` bullet is deleted. The Rules line is untouched — `specs/20260907/04` D11 already rewrites it to `canon before screens, kit before wireframes, screens before sign-off` (AC-20260907-07-11) | The command file is the session's read-once contract; a step it still narrates but the driver can never print is how a correct run gets talked into a wrong one. |
| D10 | `spec/scripts/render-gate.js`'s `--mocks` comment stops naming a stage that no longer exists: `before /spec:mocks's THEME stage copies a chosen tokens.css into design/ — so design/tokens.css can be absent` becomes `before any theme has been picked at all (the pick moved to /spec:sketch, which runs after mocks sign-off) — so design/tokens.css can be absent`. No code changes: the empty-tokens substitution, its default-manifest scoping and its host-manifest exclusion are byte-identical `[no-ac: comment-only edit with no observable surface; the file's existing tests are the regression oracle]` | The comment answers "why can tokens be missing here?", and after this spec the honest answer is stronger, not weaker — tokens are absent for the whole mocks stage, not just its first half. |
| D11 | Bump `spec/.claude-plugin/plugin.json` to the next free minor — target **7.101.0**, because `specs/20260907/04` claims 7.98.0, both hardened specs numbered `05` claim 7.99.0, and `specs/20260907/06` claims 7.100.0 — with the last-3-versions changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline; hardened-but-unbuilt siblings hold the numbers they claim. |
| D12 | **Build-time ruling (user, this build).** `tests/mocks/mocks-driver-theme.test.js` joins the File Plan for the single purpose of deleting `AC-20260907-06-10` whole — spec 06's CONTINUE-TO pin asserting `--mark direction-composed`, `--mark theme-picked`, `--reopen theme` and the derived `THEME` state all keep working. Every other test in that file is untouched, and the file's `advanceToDirectionComposed` import is dropped with the test that used it. No AC: the pin's subject is exactly what D1–D6 delete, so this spec's own AC-20260907-07-1/-2/-3/-6 are its successors `[no-ac: deletion of a superseded pin; the deleting spec's own ACs are the oracle]` | This is the pipeline-rules § Gotchas retired-literal class from the CONTINUE-TO direction: spec 06 deliberately pinned the behaviour it left standing, and the spec that retires that behaviour is the one that must retire its pin. Leaving it is a permanently red suite (§ Test Rules: gates are plainly green, no standing red pins); weakening it instead of deleting it would be the banned repair. |
| D13 | **Build-time ruling (extends D12's class, same build).** Two more live surfaces outside the File Plan assert literals D8 retires; both are updated in place, never weakened, never left red (pipeline rules § Gotchas, retired-literal class). (a) `tests/consistency/genesis-doctrine.test.js`'s `AC-20260902-09-3` drops `recompose` from its four-literal list and from its test name — that literal lived only inside the deleted `Theme = recompose, never repaint` bullet, so the rule it checked retires with the theme; its other three literals (`never a half-styled middle`, `dense screen first`, `gray until confirmed`), its heading assertion and its `shared-mocks` resolution assertion are byte-identical. (b) The six `[prior]` findings `comment-narration.js` reports against this build's own test-file comments are reworded to state the contract instead of what the code used to do `[no-ac: (a) narrows a superseded pin whose subject D8 deletes; (b) comment prose with no observable surface — comment-narration.js's standing zero-finding scan is the oracle]` | § Test Rules: gates are plainly green, no standing red pins. § Worker Rules bans prior-behaviour narration in comments outright, so a comment that explains a deletion by naming what used to be there is a defect the standing scan is built to catch. |
| D14 | **Build-time ruling (same class, review legs).** `specs/20260902/07-mocks-command-driver.md`'s `AC-20260902-07-7` loses its covering test with the `direction-composed` / `theme-picked` marks D3 deletes, so `ac-drift.js` reports it uncited. Its bullet gains `[retired: specs/20260907/07-mocks-retires-theme.md]` — the remedy `ac-drift.js` itself names — and nothing else in that spec is touched `[no-ac: retirement annotation on a superseded criterion; ac-drift.js's clean run is the oracle]` | A criterion whose subject a later spec deletes is retired, not uncovered; tagging some surviving test with the id would be the false-coverage repair the retired-marker exists to prevent. |

**Orchestrator duty (outside the File Plan table):** `tests/mocks/mocks-driver-fixtures.js` is the
single highest-leverage edit and must land first. Delete `advanceToDirectionComposed()` and
`advanceToThemePicked()` and their two `module.exports` entries; `advanceToApproved(dir)` calls
`advanceToJourneyApproved(dir)` where it called `advanceToThemePicked(dir)`; `writeThemeDirection()`
is deleted with them (its only callers are the two deleted helpers). `writeThemeKit()` — added by
spec 06 for `tests/mocks/mocks-driver-theme.test.js` — is **kept and untouched**. Run
`node --test 'tests/mocks/*.test.js'` after the fixture edit and before touching any other test
file, so the fixture chain is proved before nine files are edited against it. The per-file 45 s
budget (specs/20260903/07) applies: every file in this plan only ever loses arms, so no split is
expected — if one crosses the budget anyway, split it rather than trimming an assertion.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1: `deriveState`'s THEME step + header chain comments; D2: `AUTHORING_STATES`, `doBareStep`'s THEME branch, `printThemeStep`; D3: `handleDirectionComposed`, `handleThemePicked`, both `doMark` cases, the unknown-mark literal; D4: `buildThemeStopSpec`, the `stop open theme` branch, the unknown-step literal; D5: `handleApproved`'s theme precondition + `printApprovedTerminal`'s heading; D6: `--reopen theme`, the shapes-reopen theme clearing, the reopen literal; D7: `freshStatus` keys + `dropLegacyFields` |
| spec/scripts/render-gate.js | MODIFY | scripts | D10: the `--mocks` empty-tokens comment stops naming the retired THEME stage — comment only, no code change |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8: § Mocks: State Machine order sentence, sub-mark sentence, gated-mark list, no-gate sentence, reopen paragraph; § Mocks: Look and Serve probe-state list; § Provenance Ledger step vocabulary; § Mocks: Authoring Rules' "Theme = recompose, never repaint" bullet deleted and the wire-register exemption clause reworded |
| spec/commands/mocks.md | MODIFY | doctrine | D9: `## THEME interview rule` deleted with its skill paragraph re-homed under `## The driver loop`; opening blurb; § Look rule's four THEME mentions; § Sign-off's tokens clause; § Report's outcome and theme bullet |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11: version → 7.101.0 + changelog entry |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | Orchestrator duty: `advanceToDirectionComposed`, `advanceToThemePicked` and `writeThemeDirection` deleted with their exports; `advanceToApproved` re-chained onto `advanceToJourneyApproved`; `writeThemeKit` kept — no AC |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260907-07-7 |
| tests/mocks/mocks-driver-2.test.js | MODIFY | tests | AC-20260907-07-4, AC-20260907-07-5, AC-20260907-07-6, AC-20260907-07-9, AC-20260907-07-12; AC-20260906-02-7's `--reopen theme` test DELETED |
| tests/mocks/mocks-driver-3.test.js | MODIFY | tests | AC-20260907-07-1, AC-20260907-07-2; AC-20260906-02-3's and AC-20260906-02-4's tests DELETED |
| tests/mocks/mocks-driver-look-stops.test.js | MODIFY | tests | AC-20260907-07-3, AC-20260907-07-13; the theme halves of AC-20260905-02-10 and AC-20260905-02-13 deleted, their shapes halves kept |
| tests/mocks/mocks-driver-look-stops-2.test.js | MODIFY | tests | Fixture repair only (collision-closure `executes` hit): `advanceToThemePicked` → `advanceToJourneyApproved` — no AC |
| tests/mocks/mocks-driver-look-stops-3.test.js | MODIFY | tests | AC-20260906-04-9's `stop open theme` test DELETED and its file-header comment re-pointed — no AC |
| tests/mocks/mocks-driver-look-stops-4.test.js | MODIFY | tests | AC-20260907-07-8, AC-20260907-07-14; AC-20260906-02-8's THEME arm deleted, its WIREFRAMES and SIGNOFF arms kept |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | Fixture repair only (collision-closure `executes` hit): the file-local `advanceToThemePicked()` deleted, AC-20260902-10-6 re-chained onto `advanceToJourneyApproved` — no AC |
| specs/20260902/07-mocks-command-driver.md | MODIFY | doctrine | D14: `AC-20260902-07-7`'s bullet gains a `[retired: ...]` marker; nothing else in that spec touched — no AC |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D13(a): `AC-20260902-09-3` drops the `recompose` literal from its list and its test name; every other assertion byte-identical — no AC |
| tests/mocks/mocks-driver-theme.test.js | MODIFY | tests | D12: `AC-20260907-06-10`'s test DELETED whole with its `advanceToDirectionComposed` import; every other test in the file untouched — no AC |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260907-07-10, AC-20260907-07-11; plus fixture repair on AC-20260902-10-8 (`advanceToThemePicked` → `advanceToJourneyApproved`, and its name drops "with the theme picked") |

## Contracts

```
mocks-driver.js --root <dir>            (bare)
  derives: SEED -> SHAPES -> KIT -> WIREFRAMES -> SIGNOFF -> APPROVED
  NO LONGER derives: THEME

mocks-driver.js --root <dir> --mark <m>
  live marks: seed-done | shape-picked | canon-written | kit-signed | journey-drawn
              | journey-approved | approved
  RETIRED:    direction-composed, theme-picked
  -> 'unknown mark "<m>" — one of: seed-done, shape-picked, canon-written, kit-signed,
      journey-drawn, journey-approved, approved'

mocks-driver.js --root <dir> stop open <step>
  live steps: shapes | kit | journey:<j> | signoff
  RETIRED:    theme
  -> 'stop open: unknown step "<s>" — one of: shapes, kit, journey:<j>, signoff'
  UNCHANGED:  the stop KEY "theme-picked" (spec 06's `theme open` writes it; design-atlas.js
              renders its #theme section) — this spec retires the step, never the key

mocks-driver.js --root <dir> --reopen <target>
  live targets: journey:<j> | shapes | kit
  RETIRED:      theme
  -> '--reopen must be journey:<j>, shapes, or kit'
  --reopen shapes invalidated: ['shape', 'canon', 'kit', 'journeys(all)', 'approved(all)']

design/mocks/status.json (schemaVersion 1 — unchanged)
  marks: { seedDone, shapePicked, canonWritten, kitSignedOff, approved }
  top level: schemaVersion, state, shape, decider, look, journeys, reopens, lastUpdated
  REMOVED from freshStatus AND stripped on read by dropLegacyFields:
    marks.themePicked, theme, directions
```

## Behavior

A host mid-run is never migrated and never told to do anything. A root checkpointed at `THEME`
(canon written, every journey approved, `theme` null) prints the `SIGNOFF` step on its next
invocation and signs off on gray wireframes; the `design/theme/<k>/` directories it may already
have composed stay on disk, unread. A root that already picked a theme keeps its
`design/tokens.css`, derives `SIGNOFF` or `APPROVED` exactly as it does today, and hands that
token file straight to `/spec:sketch` — spec 06's `theme state` reads it as `picked` and sketch
skips its theme run. In both cases the first save after the upgrade drops the three dead keys and
leaves every other byte of `status.json` identical.

The one visible behaviour change for a correct run is the missing state: `--mark journey-approved`
on the last journey now advances to `SIGNOFF` instead of `THEME`, and the checkpoint tail prints
`(WIREFRAMES → SIGNOFF)`.

## Acceptance Criteria

- **AC-20260907-07-1**: WHEN `--state` runs on a root whose `marks.canonWritten` is set, whose
  `marks.kitSignedOff` is set and whose every declared seed journey is approved, with no
  `status.theme` and no `design/tokens.css` anywhere, THE SYSTEM SHALL print `SIGNOFF` and SHALL
  NOT print `THEME`; and WHEN the same root additionally carries `marks.approved` it SHALL print
  `APPROVED` → `tests/mocks/mocks-driver-3.test.js`
- **AC-20260907-07-2**: WHEN `--mark direction-composed --direction quiet` or `--mark theme-picked`
  runs THE SYSTEM SHALL exit 2 with a message containing `unknown mark` and the exact live list
  `seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, approved`,
  and SHALL NOT name `direction-composed` or `theme-picked` anywhere in that message →
  `tests/mocks/mocks-driver-3.test.js`
- **AC-20260907-07-3**: WHEN `stop open theme` runs on a root with two composed directions on disk
  THE SYSTEM SHALL exit 2 naming `unknown step "theme"` and the exact live list
  `shapes, kit, journey:<j>, signoff`, and SHALL NOT write a stop →
  `tests/mocks/mocks-driver-look-stops.test.js`
- **AC-20260907-07-4**: WHEN `--reopen theme` runs THE SYSTEM SHALL exit 2 with the exact literal
  `--reopen must be journey:<j>, shapes, or kit`, SHALL write nothing to `status.json`, and SHALL
  append no row to `status.reopens` → `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-07-5**: WHEN `--mark approved` runs on a root whose every declared journey is
  approved, whose notes and questions are resolved, whose provenance gate is open and whose
  `approved` stop is decided `approve`, with no `design/tokens.css` and no `status.theme` anywhere,
  THE SYSTEM SHALL exit 0, set `marks.approved` and `decider`, and SHALL NOT emit `theme-picked
  first` → `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-07-6**: WHEN `--reopen shapes` runs on an approved root THE SYSTEM SHALL print
  `↩ reopened shapes — invalidated: shape, canon, kit, journeys(all), approved(all)` — containing
  no `theme` token — and SHALL append that same `invalidated` array to `status.reopens` →
  `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-07-7**: WHEN the driver runs on a cold `--root` THE SYSTEM SHALL create a
  `status.json` whose `marks` object has exactly the keys `seedDone`, `shapePicked`,
  `canonWritten`, `kitSignedOff`, `approved`, each `null`, and which carries no `theme` and no
  `directions` key at top level; and WHEN it runs against a pre-existing `status.json` carrying
  `theme: "quiet"`, `marks.themePicked: "2026-09-01T00:00:00Z"` and `directions: {quiet:{}}`, the
  next save SHALL write a `status.json` carrying none of those three keys → `tests/mocks/mocks-driver.test.js`
- **AC-20260907-07-8**: WHEN the bare driver runs on a root reached through `advanceToJourneyApproved`
  with a fake `claude` on PATH reporting the `frontend-design` skill installed THE SYSTEM SHALL
  print `state: SIGNOFF` and SHALL NOT print `🎨 Load the \`frontend-design\` skill` →
  `tests/mocks/mocks-driver-look-stops-4.test.js`
- **AC-20260907-07-9**: WHEN the bare driver runs on an `APPROVED` root THE SYSTEM SHALL print a
  step heading matching `## Step: done — every journey approved, signed off by <decider>` that
  contains no `theme` substring, followed by `next: /spec:genesis` →
  `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-07-10**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL contain no
  occurrence of `THEME` outside the § Provenance Ledger clause naming retired step names, no
  occurrence of `theme-picked`, `direction-composed` or `--reopen theme`, no bullet titled
  `Theme = recompose, never repaint`, and SHALL name `SEED`, `SHAPES`, `KIT`, `WIREFRAMES`,
  `SIGNOFF`, `APPROVED` in that order within its § Mocks: State Machine order sentence →
  `tests/consistency/design-doctrine.test.js`
- **AC-20260907-07-11**: WHEN `spec/commands/mocks.md` is read THE SYSTEM SHALL contain no
  `## THEME interview rule` heading and no `THEME` occurrence anywhere, SHALL still contain the
  literal `Every authoring step block the driver prints carries the frontend-design skill line`,
  SHALL name the step enumeration `shapes` \| `kit` \| `journey:<j>` \| `signoff`, and its Report
  section SHALL name `✅ mocks approved — {N} journeys, signed off by {name}` with no
  `theme: {direction}` bullet → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-07-12**: WHEN `--mark approved` runs with no decided `approved` stop, or with an
  unresolved project or journey note, or while a declared seed journey is unapproved, THE SYSTEM
  SHALL CONTINUE TO refuse with exit 2 naming the stop remedy, the offending note ids, or the
  unapproved journey respectively — the theme precondition's removal narrows nothing else →
  `tests/mocks/mocks-driver-2.test.js` and `tests/mocks/mocks-notes.test.js`
- **AC-20260907-07-13**: WHEN `stop open shapes` runs on a root with two composed directions on
  disk THE SYSTEM SHALL CONTINUE TO write one `pick` stop keyed `shape-picked` with one candidate
  group per shape → `tests/mocks/mocks-driver-look-stops.test.js`
- **AC-20260907-07-14**: WHEN the bare driver runs on a root reached through
  `advanceToJourneyApproved` and the look probe fails THE SYSTEM SHALL CONTINUE TO exit 2 naming
  `npx playwright install chromium` → `tests/mocks/mocks-driver-look-stops-4.test.js`

## Assumptions (escalation triggers)

- A1: `specs/20260907/06` has landed, so `theme state|compose|open|adopt` and `/spec:sketch`'s
  theme run already exist when this spec deletes the mocks producer. **If false:** STOP — building
  07 before 06 leaves a repo with no theme producer at all, which is the one ordering this series
  cannot survive. The `depends_on` chain and the queue's `--after-spec` stamp both encode it.
- A2: `specs/20260907/05` has landed, so no genesis code path reads `design/mocks/status.json`'s
  `theme` or `directions` keys. Executed 2026-09-07: `grep -rn "status\.theme\|marks\.themePicked\|\.directions" spec/scripts/ scripts/` returns exactly two hits outside `mocks-driver.js`, both in
  `genesis-driver.js` (lines 802 and 2056) and both inside blocks spec 05 D2 and D4 delete.
  **If false:** add `spec/scripts/genesis-driver.js` as a File Plan row and delete those two reads
  here instead, taking spec 05's D2/D4 rationale verbatim.
- A3: the deletion reddens exactly eighteen test arms across nine files, and no test outside this
  File Plan fails. Executed 2026-09-07 on a scratch copy of HEAD with the D1–D7 deletions applied:
  `node --test 'tests/mocks/*.test.js'` → 70 tests, 53 pass, 17 fail across eight files;
  `tests/consistency/design-doctrine.test.js` → 9 tests, 8 pass, 1 fail (`AC-20260902-10-8`);
  the whole suite → 1237 tests, 1214 pass, 23 fail, of which exactly 18 are the arms named in
  this File Plan and the other 5 are the scratch copy's own artifact (every one of them a
  `git ls-files` / `git check-ignore` probe that cannot run outside a work tree). `tests/design-atlas.test.js`
  → 60/60 green unmodified, and `tests/genesis/brief-state.test.js` → 11/11 green unmodified.
  **If false:** a newly-red file outside this File Plan is a missed row — add it and re-run the
  fixture chain before continuing.
- A4: `tests/genesis/brief-state.test.js`'s `writeMocksStatus(notApproved, { state: 'THEME' })`
  fixture keeps passing, because the genesis driver reads the recorded `state` string verbatim and
  never re-derives it. Executed 2026-09-07 against the patched scratch copy: 11/11 green. Its
  assert message still enumerates the pre-04 chain, which is stale prose in a passing test and is
  queued for `specs/20260907/09`, which rewrites that same sentence when `SIGNOFF` becomes
  `CLIENT`. **If false** (the file reddens): add it as a File Plan row and retarget the fixture to
  `SIGNOFF`.
- A5: `spec/templates/mocks/wire.css` and `spec/templates/mocks/wire-tokens.css` carry comment
  prose naming `THEME` and are deliberately NOT edited here: `wire-tokens.css` is the byte-compare
  basis spec 06's `theme state` uses to detect the gray register, so churning it for a comment
  would move a comparison target for no behavioural gain. **If false** (a doctrine or citations leg
  flags the stale comments): reword both comments in a follow-up, never inside this spec's commit.

## Rationale

This is the contract half of an expand/contract migration whose expand half is
`specs/20260907/06`. The pair exists because the whole theme move measured about eighteen File
Plan rows — a third over the decomposition cap — with nine test files rippling from one shared
fixture chain. Splitting it puts every new surface in 06 and every deletion here, so this spec
introduces no design decision at all: every ruling below is "what does removing this leave
behind?", not "what should replace it?".

Three judgment calls are worth naming. First, the stop **key** `theme-picked` survives while the
stop **step** `theme` dies. That looks inconsistent until you see that the atlas is keyed on
decisions, not on states — and the executed check (design-atlas 60/60 green with `THEME` fully
removed) confirms the atlas never depended on the mocks chain. Second, the retired status fields
are stripped on read rather than migrated, reusing the file's own idiom from the SKIN/REVIEW
retirement; a migration step would need its own tests and its own failure mode for a change that
nothing on disk depends on. Third, `SIGNOFF` deliberately survives. It is the only human gate
between a drawn wireframe and `APPROVED`, and `specs/20260907/09` replaces it with `CLIENT`;
retiring both in one spec would leave a window where the mocks stage approves itself.

Five whole test arms are **deleted, never inverted in place**: `AC-20260906-02-3`
(direction-composed), `AC-20260906-02-4` / `AC-20260902-07-7` (theme-picked refusals),
`AC-20260906-02-7` (`--reopen theme`), `AC-20260906-04-9` (`stop open theme` keeps the atlas URL),
and the THEME arm of `AC-20260906-02-8` (the THEME step block prints the skill line). Two more are
partially trimmed — `AC-20260905-02-10` and `AC-20260905-02-13` each assert on shapes **and** theme
picks, and only their theme halves go. Inverting a retired arm into "…now refuses" would leave a
test whose name promises coverage of a behaviour that no longer exists; the replacement coverage
lives in AC-20260907-07-2, -3 and -4, which assert the refusals directly. `AC-20260902-07-7`'s
coverage dies with the behaviour it described, which is the honest outcome for a retired promise;
`AC-20260906-04-9`'s intent — a non-journey stop keeps the atlas URL — is carried forward by spec
06's `AC-20260907-06-4`, which pins exactly that for the new `theme open`.

Collision closure ran over six retired literal stems (`direction-composed`, `theme-picked`,
`--reopen theme`, `stop open theme`, `Theme = recompose, never repaint`, `THEME interview`) and
returned 21 distinct literals-leg files: 15 are planned rows, and 6 are **waived**. Three are dated
records that must keep describing the chain as it stood when they were written —
`docs/adr/0008-mocks-is-wireframes.md`, `docs/adr/0010-kit-walk-and-client-review.md` and
`docs/roadmap/22a-mocks-is-wireframes.md`. One, `docs/canonical/design.md`, is this spec's
Canonical Delta and is applied by `/spec:review` on CLEAN, never as a File Plan row. The last two —
`spec/scripts/design-atlas.js` and `tests/design-atlas.test.js` — hit on the stop key
`theme-picked`, which D4 deliberately keeps alive for spec 06's `theme open`; executed evidence
that they owe nothing is `tests/design-atlas.test.js` at 60/60 green against the fully-deleted
driver. The `executes` leg named 11 further test files that spawn one of the changed scripts; the
whole-suite run above shows none of them reddens, so no fixture repair is owed outside this plan.

What to watch during execution: the fixture chain. Nine of the ten test-layer rows change only
because `advanceToThemePicked` disappears, so proving the fixture edit alone before touching
anything else is the difference between one mechanical pass and nine independent debugging
sessions.

## Canonical Delta

`docs/canonical/design.md` — § the mocks driver's chain paragraph:

> `/spec:mocks` (`mocks-driver.js`, `spec-paths mocks-driver`) derives
> `SEED → SHAPES → KIT → WIREFRAMES → SIGNOFF → APPROVED` from `design/mocks/status.json` plus the
> artifacts on disk, and prints exactly one step per invocation. THEME is retired
> (specs/20260907/07): the whole mocks stage is gray, the theme is picked on `/spec:sketch`'s first
> run against the signed-off kit (specs/20260907/06), and `design/tokens.css` on disk — never a
> mark and never a status field — is the one signal that a theme exists. `SIGNOFF` is the mocks
> stage's single human gate and the `approved` mark stamps every top-level mock
> `data-status="approved"`; a mock approved by `/spec:mocks` is therefore always a gray wireframe,
> and the atlas's wire-register rule exempts it by design.

Delete the sentences describing THEME's direction interview, its dense-screen composition rule and
its `direction-composed` / `theme-picked` marks (`docs/canonical/design.md` lines describing
"THEME composes each direction on the seed's dense screen" and "THEME opens with a direction
interview"), and the § tokens sentence `Product tokens exist only from THEME and chrome never
adopts them.` becomes `Product tokens exist only from the sketch theme pick and chrome never adopts
them.`
