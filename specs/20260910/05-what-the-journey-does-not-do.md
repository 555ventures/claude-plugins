---
date: 2026-09-10
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: d6f994a63950ef59827959f939f1e675adeabdc3
---

# What the journey does not do: exclusion rows derived from decisions already made, rendered on the last screen, in the roadmap's parking lot, and as a versioned appendix

## Goal

A client who confirms a journey has confirmed what is on the screens; nothing tells them what
was deliberately left out, so the first "where is X?" arrives after launch. ADR-0013 names the
fix: exclusions are a derived ledger row kind, never typed by hand, accumulated from decisions
the pipeline already records — a discovery non-goal marked Later or Won't-this-time, a client's
"that's not right" on a row the session invented, a client note withdrawn as not needed. This spec adds the
kind, the derivation, and its three renders: the closing screen of each journey in the player
("what this journey does not do", confirmed with one button), the roadmap parking lot genesis
writes (every exclusion must appear there or `roadmap-written` refuses), and
`design/mocks/exclusions.md`, regenerated at `approved` and stamped with the approval date so a
statement of work can cite it by date. Done means nothing left out is left unsaid.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/mocks-ledger.js` `KINDS` gains `exclusion`. An exclusion row's `tag` is always `said-by-user`, its `status` `confirmed <date>`, `open`, or `overridden <date>` (D4's retired state), its `note` names its source: `non-goal: <brief line>`, `answer: <noteId>`, or `withdrawn: <noteId>`. `gateVerdict` never blocks on an exclusion row; `countsLine` gains ` · <E> exclusions` after `process`; `ledger add --kind exclusion` is refused: `exclusion rows are derived — run ledger derive` (AC-20260910-05-1) | Derived, never hand-authored (ADR-0013); a fixed `note` grammar is what makes the derivation idempotent |
| D2 | `lib/mocks-exclusions.js` exports `deriveExclusions({ brief, notes, ledger, seedJourneys })` — pure — returning `{add, retire, reopen}` (below), where each `add` entry is `{claim, source, screen|null, journey|null}` derived as: (a) every `## Non-goals` line of `brief` (the genesis brief text, or `null`) tagged `Later` or `Won't-this-time`, claim = the line minus its tag, `screen: null`; (b) every question note answered `no` whose ledger row is `invented`, claim = `not: <row claim>`, screen = the note's screen; (c) every client-origin note with `resolution: "withdrawn"` and `withdrawReason: "not-needed"`, claim = the note text, screen = the note's screen. `journey` is the seed journey declaring the screen. Each entry's `source` is the D1 `note` string. `deriveExclusions` returns `{add, retire, reopen}`: `add` is every derived entry whose `source` matches no NON-`overridden` exclusion row's `note`; `retire` is every existing non-`overridden` row whose `note` matches no derived entry — its source decision was undone (a non-goal retagged `In` or deleted, an answer changed, a withdrawal reversed); `reopen` is every `overridden` row whose source is live again, returned as the existing row so it is revived in place rather than appended as a second row with the same `note` (`exclusionsForJourney` renders every row for a journey with no status filter, so a duplicate would show the client the same claim twice). A row's identity is its `note`, so the `non-goal:` source carries the BRIEF LINE, never the tag — one shared `non-goal: Later` key makes every non-goal after the first invisible to the derivation forever (AC-20260910-05-2, AC-20260910-05-12) | Three sources, all already on disk; matching by source is the idempotence key |
| D3 | `POST /client/__notes/resolve` on the client route accepts an optional `reason` for a withdraw: `not-needed | fixed-elsewhere | mistake`, stored as `withdrawReason` on the note (`validateNotes` accepts the enum, rejects any other value) (AC-20260910-05-3). NO client control ships here. The player has no list of the client's own notes and no way to take one back, and building one at review produced a one-click, no-receipt, no-inverse write landing in a dated contractual file — strictly worse than a missing feature. The route, the enum and the validator land as the API; the reversible client journey (take-back with put-back, success receipts, un-agree, provenance lines) is its own spec WITH a design stage, so the flow is seen before it is built. Source (c) therefore has a live derivation and no input channel until then | The withdraw reason is the one new fact the client supplies; the surface to supply it on needs designing, not retrofitting mid-review |
| D4 | `mocks-driver.js ledger derive` materializes `deriveExclusions` into `ledger.md` — appends `add` as `status: open`, sets each `reopen` row back to `open`, and sets each `retire` row `overridden <today>` via `setStatus` (never deletes: the `note` cell is the audit trail) — and prints `📒 exclusions: <n> total · <new> new · <r> retired`. `--mark approved` runs it before its gates, then refuses on any `open` exclusion row (the player's last screen, D5, is where the client confirms them): `exclusion <id> ("<claim>") is not confirmed — the client confirms it on the last screen of <j>, or: ledger set --id <id> --status confirmed` (AC-20260910-05-4) | The rows exist before the client's last screen; confirmation is theirs, with the session's override printed as the remedy |
| D5 | The player's last screen: when the current screen is the journey's last label, `buildWalkPage` renders `<section data-wk="exclusions">` listing every exclusion row anchored to the journey plus every unanchored one (source `non-goal:`) under a project heading, each `<article data-wk="exclusion" data-id>` with the claim and one `<button data-wk="agree">` ("This journey does not do this — correct?" — English only, per specs/20260911/01-the-page-waits-for-the-server.md D1, which retires the player's two-language chrome; never a ja/en pair); agree posts `POST /client/__walk/exclusion {id}` which sets the row `confirmed <today>` (the client route's one ledger write besides answers). `[data-wk="confirm"]` (spec 03) additionally stays disabled while any listed exclusion is `open`, the count shown (AC-20260910-05-5, AC-20260910-05-6) | The render Fable named first; project-wide exclusions show on every journey because the client walks one at a time |
| D6 | `genesis-driver.js`'s `--mark roadmap-written` additionally requires every confirmed exclusion row's claim to appear verbatim as a bullet under `docs/roadmap/00-overview.md`'s `## Parking lot` heading, refusing by claim: `exclusion "<claim>" (E3) is not in the parking lot — add it under ## Parking lot, then re-mark`; the BRIEF step's read-only list gains the exclusion count (AC-20260910-05-7, AC-20260910-05-10) | The second render: what the client confirmed as out lands where briefs are fenced from it |
| D7 | `--mark approved` writes `design/mocks/exclusions.md` from the confirmed exclusion rows: a title line `# Exclusions — <product> — approved <YYYY-MM-DD>`, one `- <claim> (<journey or project>, <source>)` line each, regenerated on every `approved`; the approval tail prints `📦 design/mocks/exclusions.md — <n> exclusions` (AC-20260910-05-8) | The third render, versioned by the approval date, is what a statement of work cites |
| D8 | `spec/doctrine/mocks.md` § Provenance Ledger names the `exclusion` kind and its `note` grammar; § Mocks: Client Player names the last-screen confirm; `spec/doctrine/genesis.md` § Genesis: Roadmap names the parking-lot requirement; `spec/commands/mocks.md` names `ledger derive` and the exclusions file (AC-20260910-05-9) | Doctrine binding homes |
| D9 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D10 | VOID at build time — `scripts/size-ratchet.js` and `size-baseline.json` were deleted by the direct batch `d6f994a` ("retire the self-policing size tooling"), which landed after this spec locked. No ratchet exists to raise; the `size-baseline.json` File Plan row is struck with it [no-ac: the Decision is void — the ratchet it cites was deleted before this build started, so there is no behavior left to observe] | The oracle this Decision cited no longer exists |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-ledger.js | MODIFY | scripts | D1 `exclusion` kind, counts line |
| spec/scripts/lib/mocks-exclusions.js | CREATE | scripts | D2 `deriveExclusions` |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D3 `withdrawReason` enum on validate/resolve |
| spec/scripts/design-atlas.js | MODIFY | scripts | D3 reason on client resolve; D5 `/client/__walk/exclusion` |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D5 exclusions section (rendered `hidden`, revealed on the journey's last label) |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D5 agree posts, confirm gating, last-screen reveal |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 refusal; D4 `ledger derive`, approved gate; D7 `exclusions.md` |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D6 parking-lot requirement |
| spec/templates/mocks-ledger.md | MODIFY | doctrine | D1 — the grammar comment's `kind product|process` widened with the new kind (added at build: the retired test pin was this literal's other home) |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8 |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8 |
| spec/commands/mocks.md | MODIFY | doctrine | D8 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 bump |
| tests/mocks/mocks-exclusions.test.js | CREATE | tests | AC-20260910-05-1, AC-20260910-05-2, AC-20260910-05-3 |
| tests/mocks/exclusions-route.test.js | CREATE | tests | AC-20260910-05-5, AC-20260910-05-6 |
| tests/mocks/mocks-driver-exclusions.test.js | CREATE | tests | AC-20260910-05-4, AC-20260910-05-8 |
| tests/genesis/roadmap-parking-lot.test.js | CREATE | tests | AC-20260910-05-7, AC-20260910-05-10 |
| tests/consistency/design-doctrine.test.js | CREATE | tests | AC-20260910-05-9 |

## Contracts

```
| id | step   | kind      | claim                          | tag          | status               | rejected | dependents | note            |
| E1 | CLIENT | exclusion | SMS reminders                  | said-by-user | confirmed 2026-09-12 | -        | -          | non-goal: SMS reminders |
| E2 | CLIENT | exclusion | not: a second insurer field    | said-by-user | open                 | -        | -          | answer: N014    |
| E3 | CLIENT | exclusion | export bookings to CSV         | said-by-user | confirmed 2026-09-12 | -        | -          | withdrawn: N020 |
```

```js
deriveExclusions({ brief, notes, ledger, seedJourneys })
// → { add: [{ claim:'SMS reminders', source:'non-goal: SMS reminders', screen:null, journey:null },
//             { claim:'not: a second insurer field', source:'answer: N014', screen:'intake', journey:'onboarding' }],
//     retire: [/* live rows whose source decision was undone */],
//     reopen: [/* overridden rows whose source is live again, revived in place */] }
```

```
POST /client/__notes/resolve   {id, reason:'not-needed'|'fixed-elsewhere'|'mistake'}   # withdraw only
POST /client/__walk/exclusion  {id}   → 200 {id, status:'confirmed <today>'} · 404 unknown · 400 not an exclusion
mocks-driver.js --root <dir> ledger derive   # appends new rows, retires rows whose source is gone
```

```md
# Exclusions — Hearwell — approved 2026-09-12
- SMS reminders (project, non-goal: SMS reminders)
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
- **AC-20260910-05-2**: WHEN `deriveExclusions` runs over a brief with `- SMS reminders — Later`, `- Multi-currency — Won't-this-time`, `- Bookings — In`, a `no`-answered question on `invented` row `W9` ("a second insurer field") anchored to `intake`, a `no`-answered question on an `inferred` row, a client note `N020` withdrawn `not-needed` on `roster`, and a client note withdrawn `mistake` THE SYSTEM SHALL return exactly three entries: `{claim:'SMS reminders', source:'non-goal: SMS reminders', screen:null}`, `{claim:'Multi-currency', source:'non-goal: Multi-currency', screen:null}` … and `{claim:'not: a second insurer field', source:'answer: <noteId>', screen:'intake', journey:'onboarding'}`, `{claim:'<N020 text>', source:'withdrawn: N020', screen:'roster', journey:'<its journey>'}` (four in total), and with a ledger already carrying `note` `answer: <noteId>` SHALL omit that one → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260910-05-3**: WHEN `POST /client/__notes/resolve {id, reason:'not-needed'}` runs on an `open` client note THE SYSTEM SHALL store `resolution: "withdrawn"` and `withdrawReason: "not-needed"`; with `reason:'later'` it SHALL answer 400 naming the three values; `validateNotes` SHALL reject `withdrawReason: "later"` naming the field → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260910-05-4**: WHEN `ledger derive` runs over the AC-2 inputs THE SYSTEM SHALL append the new rows with ids `E1…` and print `📒 exclusions: 4 total · 4 new`, and a second run SHALL print `4 total · 0 new` with `ledger.md` byte-identical; WHEN `--mark approved` runs with `E2` `open` THE SYSTEM SHALL exit 2 with stderr containing `exclusion E2 ("not: a second insurer field") is not confirmed` and `ledger set --id E2 --status confirmed` → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260910-05-5**: WHEN `buildWalkPage` renders `onboarding` with `E1` (project) and `E2` (anchored to `intake`, an `onboarding` screen) and `E3` (anchored to `roster`, a `billing` screen) THE SYSTEM SHALL render `[data-wk="exclusions"]` carrying `[data-wk="exclusion"][data-id="E1"]` and `[data-id="E2"]`, not `E3`, each with `[data-wk="agree"]`, and `data-exclusions-open="2"` on the section; a confirmed row SHALL render no agree button → `tests/mocks/exclusions-route.test.js`
- **AC-20260910-05-6**: WHEN `POST /client/__walk/exclusion {id:'E2'}` runs THE SYSTEM SHALL answer 200 and `ledger.md` SHALL carry `E2` as `confirmed <today>`; with `{id:'W7'}` (not an exclusion) 400; with `{id:'E9'}` 404; `POST /__walk/exclusion` (non-client) 404; under `vm` the player SHALL keep `[data-wk="confirm"]` disabled while `data-exclusions-open` is above zero and enable it after an agree lowers it to zero with `data-count="0"` → `tests/mocks/exclusions-route.test.js`
- **AC-20260910-05-7**: WHEN `--mark roadmap-written` runs with a confirmed exclusion `E1` ("SMS reminders") absent from `docs/roadmap/00-overview.md`'s `## Parking lot` THE SYSTEM SHALL exit 2 with stderr `exclusion "SMS reminders" (E1) is not in the parking lot`, and with `- SMS reminders` under that heading it SHALL accept → `tests/genesis/roadmap-parking-lot.test.js`
- **AC-20260910-05-10**: WHEN `--mark roadmap-written` runs with no exclusion rows in the ledger THE SYSTEM SHALL CONTINUE TO run the existing journey-placement checks and accept a roadmap that passes them → `tests/genesis/roadmap-parking-lot.test.js`
- **AC-20260910-05-8**: WHEN `--mark approved` accepts with two confirmed exclusions THE SYSTEM SHALL write `design/mocks/exclusions.md` whose first line is `# Exclusions — <product> — approved <today>` followed by one `- <claim> (<journey|project>, <source>)` line each, and print `📦 design/mocks/exclusions.md — 2 exclusions` → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260910-05-12**: WHEN `deriveExclusions` runs over a brief whose `## Non-goals` carries `- SMS reminders — Later`, `- Multi-currency — Later` and `- Offline mode — Later` THE SYSTEM SHALL return three `add` entries whose `source` values are all DISTINCT (`non-goal: SMS reminders`, `non-goal: Multi-currency`, `non-goal: Offline mode`); WHEN it runs again against a ledger carrying those three rows and a brief that has gained `- Patient portal — Later` THE SYSTEM SHALL return exactly one `add` entry, `non-goal: Patient portal`, and no `retire` — a shared `non-goal: <tag>` key silently drops every non-goal after the first, which is the feature's own promise failing with no message → `tests/mocks/mocks-exclusions.test.js`
- **AC-20260910-05-13**: WHEN `deriveExclusions` runs against a ledger carrying exclusion row `E1` (`note: non-goal: SMS reminders`) and a brief whose `## Non-goals` no longer lists that line THE SYSTEM SHALL return `E1` in `retire`; WHEN `ledger derive` runs over that input THE SYSTEM SHALL set `E1` to `overridden <today>` in `ledger.md`, leave its `claim` and `note` cells untouched, and print `📒 exclusions: 1 total · 0 new · 1 retired`; a retired row SHALL NOT block `--mark approved` and SHALL NOT appear in `design/mocks/exclusions.md` → `tests/mocks/mocks-driver-exclusions.test.js`
- **AC-20260910-05-9**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry the literal `exclusion` in § Provenance Ledger's kind sentence and `ledger derive` in § Mocks: Client Player; `spec/doctrine/genesis.md` SHALL carry `Parking lot` beside `exclusion` in § Genesis: Roadmap; `spec/commands/mocks.md` SHALL carry `exclusions.md` → `tests/consistency/design-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: `.claude/genesis/brief.md` may not exist when mocks runs (a host that ran mocks first) — `deriveExclusions` takes `brief: null` and source (a) yields nothing; the parking-lot check (D6) still holds at roadmap time because `ledger derive` re-runs at `approved` and genesis BRIEF follows `approved` — **if false** (genesis DISCOVERY always precedes mocks): nothing changes; the null branch is dead but harmless.
- A2: Adding a value to `KINDS` does not break `parseLedger` (spec 20260906/03's spike showed a new COLUMN breaks it; a new cell VALUE is validated by `KINDS.includes`) — **if false:** STOP, ask the user.
- A3: `genesis-driver.js`'s `roadmap-written` handler already parses `00-overview.md` (it runs `journeyPlacementCheck` over the roadmap dir) so the parking-lot section is reachable without a new reader — **if false:** add a `parkingLotOf(text)` helper in `lib/surfaces.js`.
- A4: The roadmap overview template carries `## Parking lot (deferred ideas — not scope, not backlog)`; the heading match is prefix `## Parking lot` — **if false:** STOP, ask the user.

## Boundaries (deliberate, so the next reader does not rediscover them as bugs)

- **The client has no control in this spec.** Exclusions reach the client from two sources — discovery non-goals, and the client striking a row the session invented. The third, a client retracting their own request, has a live derivation and no input channel; its control is its own spec with a design stage (D3).
- **A mark's `no` is final for the walk.** ADR-0013 makes it a `said-by-user` row the moment it is given; un-answering is not a route, it is an ADR question.
- **A confirmed journey is not un-confirmed by the client.** The session reopens it.
- **`exclusions.md` is a snapshot dated by its approval.** A row retired after approval is visible only at the next `approved` run; the file is never rewritten in place.
- **No identity on the client route.** Two tabs are one client, last write wins, repeat writes are idempotent 200s.
- **The client player gives no success receipt anywhere** — its status slot carries two sentences, both failures. That includes D5's own agree button, whose only success signal is the button disabling; this spec adds one receipt-less control to a player that already had four. Fixing the silence for all of them is the reversible-journey spec's job, not a per-control patch here.

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

Collision closure at lock (literals `product|process`, `Parking lot`): the `allowed: product|process`
pin lived in `tests/mocks/mocks-ledger.test.js`, which the direct batch `d6f994a` deleted after this
spec locked — the only surviving spellings of the literal are `mocks-ledger.js`'s own header comment
and `spec/templates/mocks-ledger.md`, both widened by D1's owning worker, so the File Plan row for
the retired test is struck; `tests/genesis/brief-state.test.js` and `tests/spec-status.test.js` executed `mocks-ledger.js`
through the genesis BRIEF precondition on fixtures with no exclusion rows, so nothing they observe
changes; the roadmap-overview template's `## Parking lot` heading is read, never edited.

Rejected: a `## Exclusions` section in every roadmap brief (24 briefs, one list — the parking lot
already exists for this); an SOW template (this repo has no SOW concept; the file is the hook).

### What this build had to depart from, and why

A direct batch landed the day after this spec locked and deleted four files the File Plan named:
the byte-size ratchet and its baseline (D10, now void — its `[no-ac]` oracle no longer exists),
`tests/mocks/mocks-ledger.test.js` (whose only job here was updating a kind-enum error pin that
went with it), and `tests/consistency/design-doctrine.test.js` (recreated rather than modified,
carrying only this spec's pins). `spec/templates/mocks-ledger.md` was added to the File Plan as
the surviving second home of the widened enum literal.

D3's client half was the expensive lesson. Its clause — "the player's note rows offer the three
when withdrawing" — assumed a note list and a resolve control the player never had; the client
route it calls has had no browser caller since it shipped. A first fix put the reasons in the
notes layer, which is injected only into pages served without `?clean` and so is never in the
player at all; a second built the control properly and was withdrawn on review, because a
one-click, no-receipt, no-inverse write by the least technical person in the loop, landing in a
dated file a statement of work cites, is worse than a missing feature. The route, the enum and
the validator ship as the API; the reversible client journey is its own spec, with a design stage,
so the flow is seen before it is built. Two things made this invisible until a human pressed the
button: AC-20260910-05-3 asserted the route but never the control, so `promise-sweep` counted D3
carried; and the Contracts block plus AC-20260910-05-2 spelled the derived non-goal key as the
TAG while D1 said the LINE, so the build followed the example, shipped a collision that made every
non-goal after the first silently underivable, and pinned it with a passing test. Both classes are
folded into the host's Gotchas.

Smaller departures: `deriveExclusions`'s `seedJourneys` shape was taken from `parseSeedJourneys`'s
existing return; exclusion anchoring reuses the `note` grammar rather than a new parameter; the
parking-lot check runs on a non-visual genesis host because D6 states no archetype gate; and
per-screen visibility of the exclusions list is the browser script's job, since `buildWalkPage` is
one stateless render for the whole journey.

## Canonical Delta

`docs/canonical/design.md` § Provenance Ledger: `kind` is `product | process | exclusion`; exclusion
rows are derived by `ledger derive` (`lib/mocks-exclusions.js`) from discovery non-goals, `no` on
invented rows, and `not-needed` withdrawals, confirmed by the client on the journey's last screen,
required in the roadmap parking lot at `roadmap-written`, and written to `design/mocks/exclusions.md`
at `approved`. § Mocks: client withdrawals carry `withdrawReason`.
