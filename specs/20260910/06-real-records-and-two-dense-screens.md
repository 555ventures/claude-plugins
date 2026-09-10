---
date: 2026-09-10
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/02-click-to-advance-and-real-records.md]
depended_on_by: [specs/20260910/04-theme-before-the-client-walk.md]
brief: 22a
open_markers: 0
---

# The seed names the client's real records and two dense screens; a journey drawn on placeholders is refused

## Goal

ADR-0013: placeholders hide domain misunderstanding — a client glides past "Acme" and stops at
their own customer with no surname. This spec makes the seed name the client's real records
(three per entity, in files the wireframes draw from), refuses `seed-done` without them, warns
per screen and refuses per journey at `journey-drawn` when nothing drawn carries a record, and
lets the seed name two dense screens instead of one — the pair every theme candidate is judged
on (spec 04). Done means no journey reaches the client on made-up data, and the theme pick has
its two screens.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The seed's `## Dense screen` section becomes `## Dense screens`: one or two `- <label>` lines, each a label declared in a journey; the template ships two placeholders. The singular heading with one line CONTINUES TO parse. `parseDenseScreens` returns the array; `seed-done` refuses zero lines, more than two, or an undeclared label; SHAPES accepts a shape file whose label is any dense screen (AC-20260910-06-1, AC-20260910-06-5) | ADR-0013: the theme is judged on two dense screens; hosts already past SEED keep their singular section |
| D2 | The seed gains `## Records` after `## References`: one `- <entity>: records/<entity>.json` line per entity, the path relative to `design/mocks/`, each file a JSON array of at least three objects. `seed-done` refuses a missing section, a `- none` line, a path that does not exist or does not parse as a JSON array, and an array shorter than three, naming the entity and the remedy `ask the client for three real <entity> records and save them as design/mocks/records/<entity>.json` (AC-20260910-06-2) | The seed is where facts are established, so the records are established there; `- none` would be the first thing typed |
| D3 | `lib/mock-seed-checks.js` gains `recordValues(records)` (every string value of length ≥ 3 in any record object, nested objects and arrays walked, numbers stringified, deduplicated) and `recordHits(values, html)` (the values the HTML contains). `journey-drawn` prints `⚠️ <label>: carries none of the client's records` for every screen with zero hits and refuses when every screen of the journey has zero hits: `journey "<j>": no screen carries a value from design/mocks/records/*.json — draw with the client's own data, then re-mark`. The check runs after spec 02's edge check (AC-20260910-06-3) | A settings screen legitimately shows no record; a whole journey with none is drawn on placeholders. Per-screen warn, per-journey refuse |
| D4 | `spec/templates/mocks-seed.md` carries both sections with grammar comments; `spec/doctrine/mocks.md` § Mocks: Seed names the six sections in order (Product · Facts · References · Records · Journeys · Dense screens) and both grammars, § Mocks: Authoring Rules gains **Screens carry the client's records**; `spec/commands/mocks.md`'s SEED step names the records ask and its WIREFRAMES step tells the session to draw with them (AC-20260910-06-4) | Doctrine binding homes |
| D5 | Fixture repair: `writeSeed` and `writeShortSeed` gain `## Records` (`- customer: records/customer.json`) and write a three-record `records/customer.json`; `writeWireframe` puts one record value (`Aoi Tanaka`) in the mock body; every test that writes an inline seed and marks `seed-done`, or an inline mock and marks `journey-drawn` expecting acceptance, gains the section and a record value (AC-20260910-06-6, AC-20260910-06-7) | The collision closure's fixture repair, planned now; never a weakened gate |
| D6 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D7 | `size-baseline.json` is raised for `spec/scripts/mocks-driver.js` and the `spec/scripts` tree by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/06-real-records-and-two-dense-screens.md` [no-ac: the ratchet's live test is the oracle] | The driver sits at its ceiling |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mock-seed-checks.js | MODIFY | scripts | D3 `recordValues`, `recordHits` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 `parseDenseScreens`, seed-done, SHAPES; D2 `## Records` at seed-done; D3 warn/refuse at journey-drawn |
| spec/templates/mocks-seed.md | MODIFY | doctrine | D4 `## Dense screens`, `## Records` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D4 seed grammar, authoring rule |
| spec/commands/mocks.md | MODIFY | doctrine | D4 SEED and WIREFRAMES lines |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6 bump |
| size-baseline.json | MODIFY | other | D7 raise |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D5 seeds gain Records + file; `writeWireframe` carries a record value |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | D5 inline seed gains `## Records`; inline mocks carry a record value |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | D5 inline mocks carry a record value |
| tests/mocks/mocks-driver-4.test.js | MODIFY | tests | D5 inline mocks carry a record value |
| tests/mocks/mocks-driver-look-stops.test.js | MODIFY | tests | D5 inline mocks carry a record value |
| tests/mocks/mocks-driver-look-stops-2.test.js | MODIFY | tests | D5 inline mocks carry a record value |
| tests/mocks/mocks-driver-wire.test.js | MODIFY | tests | D5 inline mocks that expect acceptance carry a record value |
| tests/consistency/wire-register.test.js | MODIFY | tests | D5 inline mocks that expect acceptance carry a record value |
| tests/mocks/mocks-driver-seed-2.test.js | CREATE | tests | AC-20260910-06-1, AC-20260910-06-2, AC-20260910-06-3, AC-20260910-06-5, AC-20260910-06-6, AC-20260910-06-7 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260910-06-4 |

## Contracts

```md
## Records
<!-- One `- <entity>: records/<entity>.json` line per entity the product handles; each file a
     JSON array of at least three of the client's REAL records (the awkward ones: the customer
     with no surname, the order with three delivery addresses). Wireframes draw these values. -->
- customer: records/customer.json
- booking: records/booking.json

## Dense screens
<!-- One or two labels already declared in a journey — the screens every theme candidate is
     judged on. -->
- session-live
- roster
```

```json
// design/mocks/records/customer.json
[
  { "name": "Aoi Tanaka", "phone": "090-1234-5678", "visits": 14 },
  { "name": "Ren", "phone": "", "visits": 1 },
  { "name": "Sato Hana", "phone": "080-0000-1111", "visits": 3 }
]
```

```js
recordValues([{ name: 'Aoi Tanaka', tags: ['vip'], visits: 14, note: { by: 'Ren' } }])
// → ['Aoi Tanaka', 'vip', 'Ren']        ('14' is two characters: never a candidate)
recordHits(['Aoi Tanaka', 'vip', 'Ren'], '<td>Aoi Tanaka</td>')  // → ['Aoi Tanaka']
```

## Behavior

At SEED the session asks the client for three real records per entity and saves them beside the
seed; `seed-done` will not close without them. Drawing a journey, the session uses those values
on the screens. `journey-drawn` warns for each screen that shows none of them and refuses a
journey where no screen does. The two dense screens are the ones spec 04 will render in every
theme candidate.

## Acceptance Criteria

- **AC-20260910-06-1**: WHEN the seed carries `## Dense screens` with `- session-live` and `- roster` (both declared) THE SYSTEM SHALL accept `seed-done`; with three lines, or `- nowhere`, it SHALL exit 2 naming `## Dense screens` and the offending count or label; `--mark shape-picked` SHALL accept a shape file labeled `roster` (the second dense screen) → `tests/mocks/mocks-driver-seed-2.test.js`
- **AC-20260910-06-2**: WHEN the seed has no `## Records` section, or carries `- none`, or names `records/customer.json` that is missing, not a JSON array, or holds two objects THE SYSTEM SHALL refuse `seed-done` (exit 2) with stderr naming `customer` and `ask the client for three real customer records`; with a three-object file it SHALL accept → `tests/mocks/mocks-driver-seed-2.test.js`
- **AC-20260910-06-3**: WHEN `recordValues` runs over `[{name:'Aoi Tanaka', tags:['vip'], visits:14, note:{by:'Ren'}}]` THE SYSTEM SHALL return `['Aoi Tanaka','vip','Ren']` and `recordHits` of those against `<td>Aoi Tanaka</td><span>14</span>` SHALL return `['Aoi Tanaka']`; WHEN `journey-drawn` runs over a journey whose screens carry no record value THE SYSTEM SHALL exit 2 with stderr `journey "onboarding": no screen carries a value from design/mocks/records/*.json`, while a journey with one hit on one screen SHALL accept and print `⚠️ invite: carries none of the client's records` for a screen without → `tests/mocks/mocks-driver-seed-2.test.js`
- **AC-20260910-06-4**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry, under `## Mocks: Authoring Rules`, the bold rule name `Screens carry the client's records`, and under `## Mocks: Seed` the literals `## Dense screens` and `## Records`; `spec/templates/mocks-seed.md` SHALL carry both headings; `spec/commands/mocks.md` SHALL carry `records/` → `tests/consistency/design-doctrine.test.js`
- **AC-20260910-06-5**: WHEN a legacy seed carries the singular `## Dense screen` with one declared label and a `## Records` section THE SYSTEM SHALL CONTINUE TO accept `seed-done` and SHALL CONTINUE TO accept `shape-picked` for a shape labeled with that screen → `tests/mocks/mocks-driver-seed-2.test.js`
- **AC-20260910-06-6**: WHEN `writeSeed(dir)` runs THE SYSTEM SHALL write `design/mocks/records/customer.json` with three objects and a seed carrying `- customer: records/customer.json` → `tests/mocks/mocks-driver-seed-2.test.js`
- **AC-20260910-06-7**: WHEN the fixtures' `advanceToJourneyApproved` runs THE SYSTEM SHALL CONTINUE TO accept every mark on the way → `tests/mocks/mocks-driver-seed-2.test.js`

## Assumptions (escalation triggers)

- A1: The seven test files in the File Plan are every non-fixture caller that marks `seed-done` over an inline seed or `journey-drawn`/later over an inline mock expecting acceptance (grepped at plan) — **if false:** add the section/value to that test's inline fixture in the same batch; never weaken the gate.
- A2: `tests/mocks/mocks-driver-walk.test.js` anchors a second-journey insertion on the literal `## Dense screen` (a prefix of the plural heading) — the fixtures keep writing the plural heading, whose prefix still matches, so that test is untouched — **if false:** add it as a fixture-edit row.
- A3: Genesis reads the seed only for journeys and facts (`parseSeedJourneys`, the 13 keys) and never the dense-screen or records sections — **if false:** STOP, ask the user.

## Rationale

Records are established at SEED because that is the one state where facts are collected, and the
three-record floor is the smallest set that reliably contains one awkward record. The hit check is
deliberately weak (substring of any string value): it catches a journey drawn on "Acme" without
demanding that every screen be a table. It warns per screen so a settings screen is not forced to
carry fake data.

Two dense screens replace one because ADR-0013 judges theme candidates on the pair; the singular
heading keeps parsing so no host re-seeds. `## Records` is required, not optional, on the new
grammar: JJ's clients are existing businesses with data. Legacy hosts already marked past SEED are
untouched — `deriveState` reads marks.

Collision closure at lock (literal `Dense screen`): `tests/design-atlas.test.js`,
`tests/genesis/genesis-driver.test.js` and `tests/genesis/brief-state.test.js` write seeds with the
singular heading and never mark `seed-done` (the atlas and genesis read journeys only, and the
singular heading keeps parsing) — mentions, nothing owed; `tests/mocks/mocks-driver-walk.test.js`
anchors on the singular heading as a prefix (A2); the remaining hits are File Plan rows.

This spec is the second half of what was one draft with specs/20260910/02; it was split because
each half repairs the same fixture family for a different reason, and one spec carrying both
sweeps overran the build cap.

## Canonical Delta

`docs/canonical/design.md` § Mocks: the seed's six sections are Product · Facts · References ·
Records (`- <entity>: records/<entity>.json`, three real records each, refused at `seed-done`) ·
Journeys · Dense screens (one or two labels; the singular heading still parses). `journey-drawn`
warns per screen carrying no record value and refuses a journey where none does
(`lib/mock-seed-checks.js` `recordValues`/`recordHits`).
