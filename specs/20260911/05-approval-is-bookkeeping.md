---
date: 2026-09-11
status: draft
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260911/04-the-client-loop.md]
depended_on_by: []
brief: 22a
---

# Approval is bookkeeping: exclusions reach the client from their first walk, the client can say "we do need this", and an item the client never answered lands in the parking lot as not contested

## Goal

specs/20260910/05 made `--mark approved` refuse while any derived exclusion row is `open`, and
made the rows exist only after `ledger derive` or that same mark — so on the ordinary order
(client walks first) the closing screen lists nothing, the client confirms, and approval then
refuses with a "stamp it yourself" remedy while `exclusions.md` is never written. JJ's ruling:
approval is the session's own bookkeeping, not a gate on the client's consent to our rows, and
an item the client never pressed lands in the roadmap's parking lot marked not contested. This
spec materializes exclusion rows the moment the client can see them, gives the closing screen a
"No — we need this" answer beside "Correct", deletes the approval refusal, writes the dated file
under two headings, and fences both agreed and not-contested items in the roadmap. Done means a
client who skips the closing screen never blocks approval and never silently unfences a
non-goal.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/mocks-exclusions.js` gains `materialize({ text, brief, notes, seedJourneys, today })` → `{ text, total, added, retired, reopened }`: the pure ledger-text transform `mocks-driver.js`'s `deriveAndAppendExclusions` performs today (append `add` as `open` rows with the next `E<n>` id, set `reopen` rows `open`, set `retire` rows `overridden <today>`), moved verbatim with `nextExclusionId`; `deriveExclusions` additionally never returns in `reopen` a row whose `rejected` cell is `client-needed` (the client's D4 answer is final for the derivation). `mocks-driver.js` deletes `deriveAndAppendExclusions` and `nextExclusionId` and calls the lib from `ledger derive`, `client open`, and `--mark approved`; `client open` runs it before recording `status.client` (AC-20260911-05-1, AC-20260911-05-2, AC-20260911-05-11) | One writer of the derived rows, callable from the server too; the driver keeps no second copy |
| D2 | `design-atlas.js` client route: `GET /client/walk/<j>.html` runs `materialize` over the current brief/notes/ledger before building the page and writes `ledger.md` only when `added + retired + reopened > 0` — the client's closing screen lists every exclusion the moment it can be derived, on the client's first walk, without any session command (AC-20260911-05-3) | The rows must exist before the client reaches the last screen, on the ordinary order |
| D3 | `POST /client/__walk/exclusion { id, verdict }`: `verdict: 'agree'` (the default when absent — spec 20260910/05 D5's caller shape keeps working) sets `confirmed <today>` as today; `verdict: 'needed'` sets `overridden <today>` and the row's `rejected` cell to `client-needed`; any other verdict 400 naming both. `buildWalkPage` renders each open exclusion with two buttons, `<button data-wk="agree">Correct</button>` and `<button data-wk="needed">No — we need this</button>`, and `walk.browser.js` posts the verdict of the pressed one; on `ok` the article gets `data-verdict="agree|needed"` and both buttons disable. `[data-wk="confirm"]` is NO LONGER held disabled by the open-exclusion count (spec 20260910/05 D5's gate is superseded; `data-exclusions-open` stays rendered for the count) — the closing screen asks, it does not block (AC-20260911-05-4, AC-20260911-05-5, AC-20260911-05-12) | An agree-only control cannot record disagreement; a client who skips the list is "not contested", not blocked |
| D4 | `--mark approved` no longer refuses on `open` exclusion rows: the block that lists them and exits 2 is deleted; after the mark's existing gates the tail prints `📦 design/mocks/exclusions.md — <a> agreed · <n> not contested` and `writeExclusionsFile` writes the title line, then `## Agreed by the client` with one `- <claim> (<journey|project>, <source>)` line per `confirmed` row, then `## Not contested` with the same line form per `open` row (each heading present even when empty, with `- none`); `overridden` rows never appear. specs/20260910/05 D4's refusal sentence and its `ledger set --id <id> --status confirmed` remedy are retired and deleted (AC-20260911-05-6, AC-20260911-05-7) | JJ's ruling: approval is bookkeeping; the dated file still says exactly what the client agreed and what they left unanswered |
| D5 | `genesis-driver.js`: `confirmedExclusionRows` becomes `fencedExclusionRows` — every `exclusion` row whose status is `confirmed` or `open` — used by both the `roadmap-written` parking-lot requirement (an `open` row's claim must appear verbatim under `## Parking lot` exactly as a confirmed one must; the refusal reads `exclusion "<claim>" (<id>, not contested) is not in the parking lot — …` for an open row) and the BRIEF step's count line, which prints `<a> agreed · <n> not contested`; `overridden` rows (a client's `needed`, or a retired source) are never required (AC-20260911-05-8) | JJ's pick (2026-09-11): an item the client did not dispute is fenced from the roadmap, marked not contested |
| D6 | `spec/doctrine/mocks.md` § Mocks: Client Player's last-screen paragraph: rows are materialized on the client's walk page, the client answers `Correct` or `No — we need this` (the latter sets the row `overridden`, `rejected: client-needed`, and is never re-derived), the confirm control no longer waits on them, and `approved` "lists what the client did not answer as not contested and never refuses on it"; `spec/doctrine/genesis.md` § Genesis: Roadmap Decomposition's parking-lot paragraph reads "every `confirmed` or `open` exclusion row … agreed or not contested"; `spec/commands/mocks.md` § Client review's approval sentence drops "refuses on any `open` exclusion row" for "lists agreed and not-contested exclusions" (AC-20260911-05-9) | Doctrine binding homes for the three superseded sentences |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D8 | Retired and deleted in the same build: `mocks-driver.js`'s `deriveAndAppendExclusions`, `nextExclusionId`, the approve refusal block and its `is not confirmed — the client confirms it on the last screen` sentence; `walk.browser.js`'s `exclOpen`-gated branch of `updateLeft`; `tests/mocks/mocks-driver-exclusions.test.js`'s AC-20260910-05-4 assertion of exit 2 + `ledger set --id E2 --status confirmed` (rewritten under AC-20260911-05-6, never left red); `tests/mocks/exclusions-route.test.js`'s AC-20260910-05-6 assertion that confirm stays disabled while `data-exclusions-open` is above zero (rewritten under AC-20260911-05-5) (AC-20260911-05-10) | Refactors delete what they retire (memory: refactor-deletes-dead-code-and-tests) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-exclusions.js | MODIFY | scripts | D1 `materialize`, `nextExclusionId` moved in, `client-needed` never reopened |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 call the lib (delete the two functions); D4 delete the refusal, two-heading file, tail line |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2 walk-page GET materializes; D3 verdict on `/client/__walk/exclusion` |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D3 `needed` button; confirm no longer gated by exclusions |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D3 verdict posts, `data-verdict`; D8 delete the `exclOpen` gate |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D5 `fencedExclusionRows`, not-contested refusal and count |
| spec/doctrine/mocks.md | MODIFY | doctrine | D6 |
| spec/doctrine/genesis.md | MODIFY | doctrine | D6 |
| spec/commands/mocks.md | MODIFY | doctrine | D6 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 bump |
| tests/mocks/mocks-exclusions.test.js | MODIFY | tests | AC-20260911-05-1, AC-20260911-05-2, AC-20260911-05-11 |
| tests/mocks/mocks-driver-exclusions.test.js | MODIFY | tests | AC-20260911-05-6, AC-20260911-05-7, AC-20260911-05-10 (AC-20260910-05-4's refusal half rewritten) |
| tests/mocks/exclusions-route.test.js | MODIFY | tests | AC-20260911-05-3, AC-20260911-05-4, AC-20260911-05-5, AC-20260911-05-12 (AC-20260910-05-6's gate half rewritten) |
| tests/genesis/roadmap-parking-lot.test.js | MODIFY | tests | AC-20260911-05-8 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260911-05-9 |

## Contracts

```js
materialize({ text: ledgerText, brief, notes, seedJourneys, today: '2026-09-12' })
// → { text: <ledger with E1..En appended/updated>, total: 3, added: 2, retired: 0, reopened: 0 }
// a row with rejected === 'client-needed' stays overridden even when its source is live
```

```
POST /client/__walk/exclusion {id:'E2'}                    → 200 {id:'E2', status:'confirmed 2026-09-12'}   (agree, default)
POST /client/__walk/exclusion {id:'E2', verdict:'needed'}  → 200 {id:'E2', status:'overridden 2026-09-12', rejected:'client-needed'}
POST /client/__walk/exclusion {id:'E2', verdict:'maybe'}   → 400 {error:'verdict must be agree or needed'}
GET  /client/walk/onboarding.html   # first request after a brief with two non-goals: ledger gains E1, E2; page lists both
```

```md
# Exclusions — Hearwell — approved 2026-09-12

## Agreed by the client
- SMS reminders (project, non-goal: SMS reminders)

## Not contested
- Multi-currency (project, non-goal: Multi-currency)
```

```
$ mocks-driver.js --root . --mark approved      # tail, excerpt
📦 design/mocks/exclusions.md — 1 agreed · 1 not contested
$ genesis-driver.js --root . --mark roadmap-written
genesis-driver: exclusion "Multi-currency" (E2, not contested) is not in the parking lot — add it under ## Parking lot, then re-mark
```

## UI

The closing screen's list is unchanged in shape; each open item now offers "Correct" and "No —
we need this" side by side, the pressed one disables both, and the OK control no longer waits
on the list. Rendered by `lib/walk-page.js`, driven by `lib/walk.browser.js`, posted to
`design-atlas.js`'s `/client/__walk/exclusion`.

## Data Model

`design/mocks/ledger.md`: an exclusion row's `rejected` cell may carry `client-needed`. No new
files; `exclusions.md` gains two `##` headings under its title line.

## Behavior

The client opens a journey; the server derives the exclusion rows on that request, so the last
screen lists them the first time anyone looks. Each is answered "Correct" or "No — we need
this", or left alone. The client confirms the journey regardless (spec 04's request rule still
applies). At approval the session's mark derives once more, never refuses on the list, prints
how many were agreed and how many not contested, and writes the dated file under two headings.
When genesis writes the roadmap, every agreed and every not-contested claim must sit in the
parking lot; a "we need this" answer is overridden, never re-derived, and is fenced nowhere —
it is a feature the client asked for, which the session records the ordinary way.

## Acceptance Criteria

- **AC-20260911-05-1**: WHEN `materialize` runs over a ledger with no exclusion rows, a brief with `- SMS reminders — Later` and `- Multi-currency — Won't-this-time`, and `today:'2026-09-12'` THE SYSTEM SHALL return `text` carrying `E1` and `E2` as `open` with `note` `non-goal: SMS reminders` / `non-goal: Multi-currency` and counts `{total:2, added:2, retired:0, reopened:0}`; a second run over that `text` SHALL return it byte-identical with `added:0`; WHEN `deriveExclusions` runs over a ledger whose `E2` is `overridden 2026-09-12` with `rejected` `client-needed` and a brief still listing `Multi-currency` THE SYSTEM SHALL return no `reopen` and no `add` for it → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260911-05-2**: WHEN `grep -n "function deriveAndAppendExclusions\|function nextExclusionId" spec/scripts/mocks-driver.js` runs THE SYSTEM SHALL print nothing (exit 1) → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260911-05-11**: WHEN `ledger derive` runs over the AC-1 inputs THE SYSTEM SHALL CONTINUE TO print `📒 exclusions: <n> total · <new> new · <r> retired` → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260911-05-3**: WHEN `GET /client/walk/onboarding.html` runs on a project whose ledger carries no exclusion rows and whose brief lists two non-goals THE SYSTEM SHALL answer 200 with two `[data-wk="exclusion"]` articles and `ledger.md` SHALL then carry `E1` and `E2`; a second GET SHALL leave `ledger.md` byte-identical → `tests/mocks/exclusions-route.test.js`
- **AC-20260911-05-4**: WHEN `POST /client/__walk/exclusion {id:'E2', verdict:'needed'}` runs THE SYSTEM SHALL answer 200 with `status:'overridden <today>'` and `rejected:'client-needed'`, and `ledger.md`'s `E2` row SHALL carry both; with `verdict:'maybe'` 400 whose error names `agree` and `needed` → `tests/mocks/exclusions-route.test.js`
- **AC-20260911-05-12**: WHEN `POST /client/__walk/exclusion {id:'E1'}` runs with no verdict THE SYSTEM SHALL CONTINUE TO set `confirmed <today>` and answer 200 → `tests/mocks/exclusions-route.test.js`
- **AC-20260911-05-5**: WHEN `buildWalkPage` renders an open exclusion THE SYSTEM SHALL render `[data-wk="agree"]` and `[data-wk="needed"]` inside its article and `[data-wk="confirm"]` without `disabled` when the marks count is zero, whatever `data-exclusions-open` holds; under `vm`, clicking `[data-wk="needed"]` with `fetch` resolving `ok:true` SHALL have posted `{id, verdict:'needed'}`, set `data-verdict="needed"` on the article, and disabled both buttons; clicking `[data-wk="agree"]` SHALL post `{id, verdict:'agree'}` → `tests/mocks/exclusions-route.test.js`
- **AC-20260911-05-6**: WHEN `--mark approved` runs with `E1` `confirmed` and `E2` `open` and every other gate satisfied THE SYSTEM SHALL exit 0, print `📦 design/mocks/exclusions.md — 1 agreed · 1 not contested`, and write `design/mocks/exclusions.md` whose lines are the title, a blank, `## Agreed by the client`, `- SMS reminders (project, non-goal: SMS reminders)`, a blank, `## Not contested`, `- Multi-currency (project, non-goal: Multi-currency)`; with no open row the second section SHALL read `- none` → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260911-05-7**: WHEN `ledger derive` runs over the AC-20260910-05-2 inputs THE SYSTEM SHALL CONTINUE TO append rows once and print `📒 exclusions: 4 total · 4 new`, and a second run SHALL CONTINUE TO leave `ledger.md` byte-identical → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260911-05-8**: WHEN `--mark roadmap-written` runs with `E2` `open` ("Multi-currency") absent from `## Parking lot` THE SYSTEM SHALL exit 2 with stderr containing `exclusion "Multi-currency" (E2, not contested) is not in the parking lot`; with `- Multi-currency` under the heading it SHALL accept; an `overridden` row with `rejected` `client-needed` SHALL never be required; the BRIEF step SHALL print `1 agreed · 1 not contested` → `tests/genesis/roadmap-parking-lot.test.js`
- **AC-20260911-05-9**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry `not contested` and `we need this` in § Mocks: Client Player and SHALL NOT carry `refuses on any that are still` anywhere; `spec/doctrine/genesis.md` § Genesis: Roadmap Decomposition SHALL carry `not contested`; `spec/commands/mocks.md` SHALL carry `not-contested` and SHALL NOT carry `refuses on any` → `tests/consistency/design-doctrine.test.js`
- **AC-20260911-05-10**: WHEN `grep -n "is not confirmed — the client confirms it\|ledger set --id ' + row.id + ' --status confirmed" spec/scripts/mocks-driver.js` and `grep -n "exclOpen > 0" spec/scripts/lib/walk.browser.js` run THE SYSTEM SHALL print nothing (exit 1) — the refusal and the page gate are deleted, not dead → `tests/mocks/mocks-driver-exclusions.test.js`

## Assumptions (escalation triggers)

- A1: `journeyForExclusionRow` (driver) and `exclusionsForJourney` (walk-page) both key on the `note` grammar, so moving materialization to the server changes no anchoring — read at lock. **If false**: anchor through the lib and record the departure.
- A2: `parseLedger` accepts a free-text `rejected` cell (`client-needed`) on an exclusion row — the column is already free text for product rows. **If false**: STOP, ask.
- A3: The scratch run of `scratchpad/journey.js` and `scratchpad/loop.js` (this session) observed the pre-image: closing screen `0` items before any derive, `--mark approved` exit 2 on `E1`/`E2`, `exclusions.md NOT WRITTEN`. AC-3 and AC-6 are red on the pre-image by that observation.
- A4: No test outside this File Plan spells `is not confirmed`, `data-exclusions-open`, `exclAgree`, or `ledger set --id E` — grep at lock: `tests/mocks/mocks-driver-exclusions.test.js` and `tests/mocks/exclusions-route.test.js` only, both in the File Plan; `refuses on any` appears in `spec/doctrine/mocks.md`, `spec/commands/mocks.md`, `docs/canonical/design.md` (the Delta) and no test. **If false**: the hit's file enters the File Plan as a fix row.
- A5: `genesis-driver.js`'s BRIEF count line is the only other reader of `confirmedExclusionRows` (grep at lock: two call sites, lines ~1649 and ~2016). **If false**: rename every caller in the same row.

## Rationale

JJ's ruling on 2026-09-11: approval is developer bookkeeping inside `/spec:mocks`; the client's
consent to our rows is asked, never demanded; an item the client did not answer goes to the
parking lot marked not contested. The 20260910/05 refusal made the client's silence block the
session while the very rows it refused on were invisible to the client — the first walk happened
before any derive. Deriving on the walk-page request (D2) fixes the order once; moving the
transform into the lib (D1) is what lets the server and the driver share it without a second
copy. "No — we need this" (D3) exists because an agree-only control cannot record a disagreement,
and a disagreement must be final for the derivation or the next `derive` re-adds the row the
client just rejected — hence `rejected: client-needed` blocks `reopen`. The roadmap fence (D5)
widens to open rows because the alternative — silently unfencing a non-goal whenever the client
skips the list — is exactly the "where is X?" spec 05 was written to prevent.

Superseded: specs/20260910/05 D4 (the refusal and its remedy), D5's confirm-disabled-while-open
gate, and its Boundary "The client has no control in this spec" for the exclusion list;
specs/20260906/02 D5's `approved` gate enumeration loses the exclusion clause spec 05 added.
Kept: spec 05 D1/D2/D6/D7's shapes, the `agree` caller shape (default verdict), and the dated,
never-rewritten file. The walk-critic fourth source (q161) and un-agree after agreeing (q178)
stay queued.

Collision closure at lock (literals `is not confirmed`, `data-exclusions-open`, `refuses on
any`): every test hit is in the File Plan and rewritten under this spec's ACs, never weakened;
`docs/canonical/design.md`'s two sentences are replaced by the Canonical Delta at review.

## Canonical Delta

`docs/canonical/design.md` § Exclusions: rows are materialized on the client's walk-page request
(`lib/mocks-exclusions.js materialize`, also run by `ledger derive`, `client open`, and
`approved`); the closing screen offers `Correct` and `No — we need this` (the latter sets
`overridden` with `rejected: client-needed`, never re-derived) and no longer holds the confirm
control; `--mark approved` never refuses on an exclusion row and writes `exclusions.md` under
`## Agreed by the client` and `## Not contested`; `roadmap-written` requires every `confirmed`
or `open` row's claim in the parking lot, an open one named "not contested". The sentence "refuses
on any still open" is deleted.
