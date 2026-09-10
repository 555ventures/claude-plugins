---
date: 2026-09-10
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md]
depended_on_by: []
brief: 22a
open_markers: 0
---

# What the journey does not do: exclusion rows derived from decisions already made, rendered on the last screen, in the roadmap's parking lot, and as a versioned appendix

## Goal

A client who confirms a journey has confirmed what is on the screens; nothing tells them what
was deliberately left out, so the first "where is X?" arrives after launch. ADR-0013 names the
fix: exclusions are a derived ledger row kind, never typed by hand, accumulated from decisions
the pipeline already records — a discovery non-goal marked Later or Won't-this-time, a client's
違う on a row the session invented, a client note withdrawn as not needed. This spec adds the
kind, the derivation, and its three renders: the closing screen of each journey in the player
("what this journey does not do", confirmed with one button), the roadmap parking lot genesis
writes (every exclusion must appear there or `roadmap-written` refuses), and
`design/mocks/exclusions.md`, regenerated at `approved` and stamped with the approval date so a
statement of work can cite it by date. Done means nothing left out is left unsaid.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/mocks-ledger.js` `KINDS` gains `exclusion`. An exclusion row's `tag` is always `said-by-user`, its `status` `confirmed <date>` or `open`, its `note` names its source: `non-goal: <brief line>`, `answer: <noteId>`, or `withdrawn: <noteId>`. `gateVerdict` never blocks on an exclusion row; `countsLine` gains ` · <E> exclusions` after `process`; `ledger add --kind exclusion` is refused: `exclusion rows are derived — run ledger derive` (AC-20260910-05-1) | Derived, never hand-authored (ADR-0013); a fixed `note` grammar is what makes the derivation idempotent |
| D2 | `lib/mocks-exclusions.js` exports `deriveExclusions({ brief, notes, ledger, seedJourneys })` — pure — returning `[{claim, source, screen|null, journey|null}]`: (a) every `## Non-goals` line of `brief` (the genesis brief text, or `null`) tagged `Later` or `Won't-this-time`, claim = the line minus its tag, `screen: null`; (b) every question note answered `no` whose ledger row is `invented`, claim = `not: <row claim>`, screen = the note's screen; (c) every client-origin note with `resolution: "withdrawn"` and `withdrawReason: "not-needed"`, claim = the note text, screen = the note's screen. `journey` is the seed journey declaring the screen. Each entry's `source` is the D1 `note` string. Existing exclusion rows are matched by `note`, so re-deriving adds only what is new (AC-20260910-05-2) | Three sources, all already on disk; matching by source is the idempotence key |
| D3 | `POST /client/__notes/resolve` on the client route accepts an optional `reason` for a withdraw: `not-needed | fixed-elsewhere | mistake`, stored as `withdrawReason` on the note (`validateNotes` accepts the enum, rejects any other value); the player's note rows offer the three when withdrawing, `not-needed` first (AC-20260910-05-3) | The withdraw reason is the one new fact the client supplies; it is the cheapest of the three sources |
| D4 | `mocks-driver.js ledger derive` materializes `deriveExclusions` into `ledger.md` (append missing rows, `status: open`) and prints `📒 exclusions: <n> total · <new> new`. `--mark approved` runs it before its gates, then refuses on any `open` exclusion row (the player's last screen, D5, is where the client confirms them): `exclusion <id> ("<claim>") is not confirmed — the client confirms it on the last screen of <j>, or: ledger set --id <id> --status confirmed` (AC-20260910-05-4) | The rows exist before the client's last screen; confirmation is theirs, with the session's override printed as the remedy |
| D5 | The player's last screen: when the current screen is the journey's last label, `buildWalkPage` renders `<section data-wk="exclusions">` listing every exclusion row anchored to the journey plus every unanchored one (source `non-goal:`) under a project heading, each `<article data-wk="exclusion" data-id>` with the claim and one `<button data-wk="agree">` ("この画面では、これはやりません — 合ってる？" / "This journey does not do this — correct?"); agree posts `POST /client/__walk/exclusion {id}` which sets the row `confirmed <today>` (the client route's one ledger write besides answers). `[data-wk="confirm"]` (spec 03) additionally stays disabled while any listed exclusion is `open`, the count shown (AC-20260910-05-5, AC-20260910-05-6) | The render Fable named first; project-wide exclusions show on every journey because the client walks one at a time |
| D6 | `genesis-driver.js`'s `--mark roadmap-written` additionally requires every confirmed exclusion row's claim to appear verbatim as a bullet under `docs/roadmap/00-overview.md`'s `## Parking lot` heading, refusing by claim: `exclusion "<claim>" (E3) is not in the parking lot — add it under ## Parking lot, then re-mark`; the BRIEF step's read-only list gains the exclusion count (AC-20260910-05-7, AC-20260910-05-10) | The second render: what the client confirmed as out lands where briefs are fenced from it |
| D7 | `--mark approved` writes `design/mocks/exclusions.md` from the confirmed exclusion rows: a title line `# Exclusions — <product> — approved <YYYY-MM-DD>`, one `- <claim> (<journey or project>, <source>)` line each, regenerated on every `approved`; the approval tail prints `📦 design/mocks/exclusions.md — <n> exclusions` (AC-20260910-05-8) | The third render, versioned by the approval date, is what a statement of work cites |
| D8 | `spec/doctrine/mocks.md` § Provenance Ledger names the `exclusion` kind and its `note` grammar; § Mocks: Client Player names the last-screen confirm; `spec/doctrine/genesis.md` § Genesis: Roadmap names the parking-lot requirement; `spec/commands/mocks.md` names `ledger derive` and the exclusions file (AC-20260910-05-9) | Doctrine binding homes |
| D9 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D10 | `size-baseline.json` is raised for `mocks-driver.js`, `design-atlas.js`, `genesis-driver.js` and the `spec/scripts` tree by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/05-what-the-journey-does-not-do.md` [no-ac: the ratchet's live test is the oracle] | Entry points at their ceilings |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-ledger.js | MODIFY | scripts | D1 `exclusion` kind, counts line |
| spec/scripts/lib/mocks-exclusions.js | CREATE | scripts | D2 `deriveExclusions` |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D3 `withdrawReason` enum on validate/resolve |
| spec/scripts/design-atlas.js | MODIFY | scripts | D3 reason on client resolve; D5 `/client/__walk/exclusion` |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D5 exclusions section, withdraw reasons |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D5 agree posts, confirm gating |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 refusal; D4 `ledger derive`, approved gate; D7 `exclusions.md` |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D6 parking-lot requirement |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8 |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8 |
| spec/commands/mocks.md | MODIFY | doctrine | D8 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 bump |
| size-baseline.json | MODIFY | other | D10 raise |
| tests/mocks/mocks-exclusions.test.js | CREATE | tests | AC-20260910-05-1, AC-20260910-05-2, AC-20260910-05-3 |
| tests/mocks/mocks-ledger.test.js | MODIFY | tests | the `allowed: product|process` message pin updated to the widened enum, retagged AC-20260910-05-1 |
| tests/mocks/exclusions-route.test.js | CREATE | tests | AC-20260910-05-5, AC-20260910-05-6 |
| tests/mocks/mocks-driver-exclusions.test.js | CREATE | tests | AC-20260910-05-4, AC-20260910-05-8 |
| tests/genesis/roadmap-parking-lot.test.js | CREATE | tests | AC-20260910-05-7, AC-20260910-05-10 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260910-05-9 |

## Contracts

```
| id | step   | kind      | claim                          | tag          | status               | rejected | dependents | note            |
| E1 | CLIENT | exclusion | SMS reminders                  | said-by-user | confirmed 2026-09-12 | -        | -          | non-goal: Later |
| E2 | CLIENT | exclusion | not: a second insurer field    | said-by-user | open                 | -        | -          | answer: N014    |
| E3 | CLIENT | exclusion | export bookings to CSV         | said-by-user | confirmed 2026-09-12 | -        | -          | withdrawn: N020 |
```

```js
deriveExclusions({ brief, notes, ledger, seedJourneys })
// → [{ claim:'SMS reminders', source:'non-goal: Later', screen:null, journey:null },
//    { claim:'not: a second insurer field', source:'answer: N014', screen:'intake', journey:'onboarding' }]
```

```
POST /client/__notes/resolve   {id, reason:'not-needed'|'fixed-elsewhere'|'mistake'}   # withdraw only
POST /client/__walk/exclusion  {id}   → 200 {id, status:'confirmed <today>'} · 404 unknown · 400 not an exclusion
mocks-driver.js --root <dir> ledger derive
```

```md
# Exclusions — Hearwell — approved 2026-09-12
- SMS reminders (project, non-goal: Later)
- not: a second insurer field (onboarding, answer: N014)
```

## Behavior

Nothing new is typed. As discovery, answers and withdrawals accumulate, `ledger derive` (run by
the session at any time and by `approved` automatically) turns them into exclusion rows. When the
client reaches a journey's last screen the player lists what that journey and the product will
not do, each with one button; the approve control waits until every listed item is agreed. At
`approved` the confirmed set is written to `exclusions.md` with the approval date. When genesis
writes the roadmap, every confirmed exclusion has to be in the overview's parking lot or the
mark refuses — the briefs are fenced from them by the same mechanism that fences the discovery
non-goals today.

## Acceptance Criteria

- **AC-20260910-05-1**: WHEN `parseLedger` reads a row with `kind` `exclusion`, `tag` `said-by-user`, `status` `open` THE SYSTEM SHALL accept it, `gateVerdict` SHALL report `open: true` with it present, `countsLine` SHALL end in ` · 1 exclusions` (e.g. `📒 ledger: 2 said-by-user · 0 ratified-doc · 0 inferred (0 open) · 0 invented (0 open) · 0 process · 0 catches · 1 exclusions`), and `ledger add --kind exclusion …` SHALL exit 2 naming `ledger derive` → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260910-05-2**: WHEN `deriveExclusions` runs over a brief with `- SMS reminders — Later`, `- Multi-currency — Won't-this-time`, `- Bookings — In`, a `no`-answered question on `invented` row `W9` ("a second insurer field") anchored to `intake`, a `no`-answered question on an `inferred` row, a client note `N020` withdrawn `not-needed` on `roster`, and a client note withdrawn `mistake` THE SYSTEM SHALL return exactly three entries: `{claim:'SMS reminders', source:'non-goal: Later', screen:null}`, `{claim:'Multi-currency', source:'non-goal: Won't-this-time', screen:null}` … and `{claim:'not: a second insurer field', source:'answer: <noteId>', screen:'intake', journey:'onboarding'}`, `{claim:'<N020 text>', source:'withdrawn: N020', screen:'roster', journey:'<its journey>'}` (four in total), and with a ledger already carrying `note` `answer: <noteId>` SHALL omit that one → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260910-05-3**: WHEN `POST /client/__notes/resolve {id, reason:'not-needed'}` runs on an `open` client note THE SYSTEM SHALL store `resolution: "withdrawn"` and `withdrawReason: "not-needed"`; with `reason:'later'` it SHALL answer 400 naming the three values; `validateNotes` SHALL reject `withdrawReason: "later"` naming the field → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260910-05-4**: WHEN `ledger derive` runs over the AC-2 inputs THE SYSTEM SHALL append the new rows with ids `E1…` and print `📒 exclusions: 4 total · 4 new`, and a second run SHALL print `4 total · 0 new` with `ledger.md` byte-identical; WHEN `--mark approved` runs with `E2` `open` THE SYSTEM SHALL exit 2 with stderr containing `exclusion E2 ("not: a second insurer field") is not confirmed` and `ledger set --id E2 --status confirmed` → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260910-05-5**: WHEN `buildWalkPage` renders `onboarding` with `E1` (project) and `E2` (anchored to `intake`, an `onboarding` screen) and `E3` (anchored to `roster`, a `billing` screen) THE SYSTEM SHALL render `[data-wk="exclusions"]` carrying `[data-wk="exclusion"][data-id="E1"]` and `[data-id="E2"]`, not `E3`, each with `[data-wk="agree"]`, and `data-exclusions-open="2"` on the section; a confirmed row SHALL render no agree button → `tests/mocks/exclusions-route.test.js`
- **AC-20260910-05-6**: WHEN `POST /client/__walk/exclusion {id:'E2'}` runs THE SYSTEM SHALL answer 200 and `ledger.md` SHALL carry `E2` as `confirmed <today>`; with `{id:'W7'}` (not an exclusion) 400; with `{id:'E9'}` 404; `POST /__walk/exclusion` (non-client) 404; under `vm` the player SHALL keep `[data-wk="confirm"]` disabled while `data-exclusions-open` is above zero and enable it after an agree lowers it to zero with `data-count="0"` → `tests/mocks/exclusions-route.test.js`
- **AC-20260910-05-7**: WHEN `--mark roadmap-written` runs with a confirmed exclusion `E1` ("SMS reminders") absent from `docs/roadmap/00-overview.md`'s `## Parking lot` THE SYSTEM SHALL exit 2 with stderr `exclusion "SMS reminders" (E1) is not in the parking lot`, and with `- SMS reminders` under that heading it SHALL accept → `tests/genesis/roadmap-parking-lot.test.js`
- **AC-20260910-05-10**: WHEN `--mark roadmap-written` runs with no exclusion rows in the ledger THE SYSTEM SHALL CONTINUE TO run the existing journey-placement checks and accept a roadmap that passes them → `tests/genesis/roadmap-parking-lot.test.js`
- **AC-20260910-05-8**: WHEN `--mark approved` accepts with two confirmed exclusions THE SYSTEM SHALL write `design/mocks/exclusions.md` whose first line is `# Exclusions — <product> — approved <today>` followed by one `- <claim> (<journey|project>, <source>)` line each, and print `📦 design/mocks/exclusions.md — 2 exclusions` → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260910-05-9**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry the literal `exclusion` in § Provenance Ledger's kind sentence and `ledger derive` in § Mocks: Client Player; `spec/doctrine/genesis.md` SHALL carry `Parking lot` beside `exclusion` in § Genesis: Roadmap; `spec/commands/mocks.md` SHALL carry `exclusions.md` → `tests/consistency/design-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: `.claude/genesis/brief.md` may not exist when mocks runs (a host that ran mocks first) — `deriveExclusions` takes `brief: null` and source (a) yields nothing; the parking-lot check (D6) still holds at roadmap time because `ledger derive` re-runs at `approved` and genesis BRIEF follows `approved` — **if false** (genesis DISCOVERY always precedes mocks): nothing changes; the null branch is dead but harmless.
- A2: Adding a value to `KINDS` does not break `parseLedger` (spec 20260906/03's spike showed a new COLUMN breaks it; a new cell VALUE is validated by `KINDS.includes`) — **if false:** STOP, ask the user.
- A3: `genesis-driver.js`'s `roadmap-written` handler already parses `00-overview.md` (it runs `journeyPlacementCheck` over the roadmap dir) so the parking-lot section is reachable without a new reader — **if false:** add a `parkingLotOf(text)` helper in `lib/surfaces.js`.
- A4: The roadmap overview template carries `## Parking lot (deferred ideas — not scope, not backlog)`; the heading match is prefix `## Parking lot` — **if false:** STOP, ask the user.

## Rationale

Exclusions are derived because a typed exclusion list is the first thing that goes stale and the
last thing anyone reads; every source here is a decision the pipeline already recorded, so the
list is true by construction. The three sources are the ones that exist today: discovery
non-goals (genesis), the client striking an invented guess (spec 03's marks), and a client
withdrawing a note as not needed (this spec's one new fact, a three-value reason). A walk-critic
finding closed as out of scope — Fable's fourth source — has no closure vocabulary today and is
left for a later spec rather than inventing one here.

Three renders, one source: the player's last screen is where the client meets them, the parking
lot is where briefs are fenced from them, and the dated file is what a contract can point at.
Without the third the confirmation is social; without the second the next brief re-invents the
feature. The client confirms exclusions with one button each because ADR-0013 rejected per-screen
confirmation but these are per-journey and few, and silence on an exclusion is exactly the
"where is X?" this spec exists to prevent.

Collision closure at lock (literals `product|process`, `Parking lot`): `tests/mocks/mocks-ledger.test.js`
pins the kind error message `allowed: product|process`, which D1 widens to `product|process|exclusion`
— that pin is updated in place under AC-20260910-05-1 and the file is added as a File Plan row;
`tests/genesis/brief-state.test.js` and `tests/spec-status.test.js` execute `mocks-ledger.js`
through the genesis BRIEF precondition on fixtures with no exclusion rows, so nothing they observe
changes; the roadmap-overview template's `## Parking lot` heading is read, never edited.

Rejected: a `## Exclusions` section in every roadmap brief (24 briefs, one list — the parking lot
already exists for this); an SOW template (this repo has no SOW concept; the file is the hook).

## Canonical Delta

`docs/canonical/design.md` § Provenance Ledger: `kind` is `product | process | exclusion`; exclusion
rows are derived by `ledger derive` (`lib/mocks-exclusions.js`) from discovery non-goals, `no` on
invented rows, and `not-needed` withdrawals, confirmed by the client on the journey's last screen,
required in the roadmap parking lot at `roadmap-written`, and written to `design/mocks/exclusions.md`
at `approved`. § Mocks: client withdrawals carry `withdrawReason`.
