---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/client-mocks/walk.html
breaking: false
depends_on: [specs/20260912/01-the-card-explains-itself.md]
depended_on_by: []
brief: n/a
open_markers: 0
---

# An answer is the client's until sign-off: change it, put a taken-back request back, and see every write land

## Goal

The client player is a one-way ratchet. An exclusion answer cannot be changed; a request taken
back with `Never mind` becomes a non-goal on a contractual list with no explanation and no
inverse; confirming a journey shows nothing at all, so a second click reads as a failure. And the
answer route has no sign-off gate, so a client can still flip a row after `--mark approved` has
written the dated `design/mocks/exclusions.md` — the ledger and the snapshot a statement of work
cites silently diverge. This spec closes all four: an answer is the client's to change until the
work is signed off and read-only after it, a taken-back request can be put back, and every client
write answers back. Done means nothing the client does on the player is irreversible before
sign-off, nothing they do after it can contradict the dated file, and no client write looks like
it failed.

sibling specs/20260912/01 ships the card's heading, lead, provenance lines and answered-state
sentences; this spec adds the controls beside them. The approved mock
`design/client-mocks/walk.html` (JJ, 2026-09-12) is the binding reference — R4 for `Change
answer`, R5 for the read-only render, R6 for the confirm receipt, R3 and `index.html` for `Put it
back`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/mocks-exclusions.js`'s `setExclusionVerdict` accepts a third verdict, `reconsider`: it sets the row's status back to `open` and clears its `rejected` cell to `-`. `deriveExclusions`'s `client-needed` block is unaffected — a reconsidered row no longer carries `client-needed`, so a live source neither re-adds nor reopens it beyond the `open` it already is (AC-20260912-02-1) | The inverse has to clear the flag that made the answer final, or the next derive and the client disagree |
| D2 | `POST /client/__walk/exclusion` accepts `verdict: 'reconsider'` alongside `agree`/`needed`, answering `200 {id, status:'open', rejected:null}`; any other verdict still 400s, and its error now names all three (AC-20260912-02-2, AC-20260912-02-3) | One route, one verb set |
| D3 | **The sign-off cut-off.** `GET /client/walk/<j>.html` reads `design/mocks/status.json`'s `marks.approved` on every request (the same fresh-read shape the theme already uses). When it is set: the walk page's exclusions section carries `data-recorded="<the approved date>"`, `buildWalkPage` renders NO `wk-verdicts`, NO `Change answer` and NO `Put it back` on any exclusion row, and the lead reads `Recorded on <date> when the work was signed off. If anything here is a surprise, tell us in the note above.` in place of specs/20260912/01 D1's question lead. `POST /client/__walk/exclusion` refuses every verdict with `409 {error: 'the work was signed off on <date> — this list is now a record; tell us in the note box and we will come back to you'}`. The page never renders a control the 409 would refuse, so the refusal is a backstop a client never meets (AC-20260912-02-4, AC-20260912-02-5, AC-20260912-02-6) | `exclusions.md` is dated and never rewritten in place; a client editing it after the fact is the ledger diverging from a contract |
| D4 | Before sign-off, every non-`open` exclusion row renders one `<button class="wk-excl-change" data-wk="reconsider">Change answer</button>` after its state line. `walk.browser.js` posts `{id, verdict:'reconsider'}`; on `ok` it returns the row to its open shape in place — removes `data-verdict`, hides the state line, reveals `wk-verdicts` — and writes `Saved. You can change your answer until the work is signed off.` into the msg slot. A `dropped` row (an `overridden` row the client never touched) gets NO `Change answer`: there is nothing of theirs to change (AC-20260912-02-7, AC-20260912-02-8) | JJ's ruling (2026-09-12): unlimited take-back before sign-off, none after; the control is one click and its own receipt |
| D5 | **Put it back.** `POST /client/__notes/reopen` gains one arm: a client-origin note whose `status` is `resolved` and whose `resolution` is `withdrawn` is accepted with NO text (today the route refuses any status but `addressed` and refuses empty text). `reopenNote` restores `status: 'open'` unchanged. Nothing new is written to the ledger: the note leaving `withdrawn` removes the derived row's source, so the next `materialize` on the walk-page GET retires that exclusion row by the derivation that already ships (AC-20260912-02-9, AC-20260912-02-10) | The inverse of `Never mind` is the note going back, not a new ledger verb |
| D6 | A `withdrawn` client-origin request renders `<button class="wk-excl-put" data-wk="putback">Put it back</button>` in two places: on the walk page's request card and on the client index's closed list, both with the sentence `You took this back — it's on the list of things we will not build.` The exclusion row derived from that note ALSO carries `Put it back` inline after its provenance line (specs/20260912/01 D2's `Because you took back your request on <Screen>.`). All three post the same `reopen`; on `ok` the row returns to its open request shape and the msg slot reads `Saved. That's back on your list.` `viewer.css` gains `.wk-req[data-status="resolved"][data-resolution="withdrawn"] .wk-req-acts { display: flex; }` — the only rule that un-hides a resolved row's actions (AC-20260912-02-11, AC-20260912-02-12, AC-20260912-02-15) | JJ's ruling (2026-09-12): a taken-back request still reaches the won't-build list, but says why it is there and offers a way back |
| D7 | **Confirm answers back.** `walk.browser.js`'s confirm handler, on `ok`, swaps the sign-off block to its confirmed render in place (the same markup the server renders for an already-confirmed journey), removes the confirm control from the bar leaving `Back`, and writes `Confirmed — thank you. You can still change an answer on this page until the work is signed off.` into the msg slot. No reload is required to see any of it (AC-20260912-02-13) | The one client write with no receipt at all; the second click currently reads "that did not save" |
| D8 | `spec/doctrine/mocks.md` § Mocks: Client Player gains the cut-off sentence (an exclusion answer is the client's to change until `approved`, read-only and dated after it) and loses specs/20260911/06's `only un-agreeing a confirmed exclusion and provenance lines stay unshipped (q178)`; `spec/commands/mocks.md` § Client review gains one clause naming the cut-off (AC-20260912-02-14) | The retired sentence is false the moment this lands |
| D9 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D10 | NOT in scope, named so no worker reaches for it: any change to `--mark approved`, to `exclusions.md`'s content or format, to the roadmap parking-lot fence, or any re-open of an approved journey. A client who wants a change after sign-off uses the note box, and the session decides whether that becomes a `--reopen` — the existing loop, untouched [no-ac: a scope exclusion promises no behavior; AC-20260912-02-4 pins that the refused write leaves the ledger byte-identical] | The snapshot boundary is the point; moving it would defeat D3 |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-exclusions.js | MODIFY | scripts | D1 `reconsider` verdict clears status + `rejected` |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D5 `reopenNote` accepts the withdrawn put-back (no text) |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2 route verb, D3 sign-off read + 409, D5 reopen arm |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D3 read-only render + `data-recorded` lead, D4 `Change answer`, D6 `Put it back` in three places |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D4 reconsider handler, D6 putback handler, D7 confirm receipt |
| spec/templates/mocks/viewer.css | MODIFY | other | D4/D6 control rules, D3 read-only rules, the resolved-actions override |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8 |
| spec/commands/mocks.md | MODIFY | doctrine | D8 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 bump |
| tests/mocks/mocks-exclusions.test.js | MODIFY | tests | AC-20260912-02-1 |
| tests/mocks/exclusions-route.test.js | MODIFY | tests | AC-20260912-02-2 … -8 |
| tests/mocks/client-walk-route.test.js | MODIFY | tests | AC-20260912-02-9, -10 |
| tests/mocks/walk-page.test.js | MODIFY | tests | AC-20260912-02-11, -12, -13, -15 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260912-02-14 |

## Contracts

```
POST /client/__walk/exclusion {id:'E2', verdict:'reconsider'}   → 200 {id:'E2', status:'open', rejected:null}
POST /client/__walk/exclusion {id:'E2', verdict:'maybe'}        → 400 {error:'verdict must be agree, needed or reconsider'}
POST /client/__walk/exclusion {id:'E2', verdict:'agree'}        → 409 {error:'the work was signed off on 2026-09-12 — this list is now a record; tell us in the note box and we will come back to you'}   # once status.json marks.approved is set
POST /client/__notes/reopen   {id:'N020', by:'client'}          → 200   # note is resolved/withdrawn, client-origin, no text required
POST /client/__notes/reopen   {id:'N020', by:'client'}          → 400 {error:'note "N020" is open — only an addressed note is reopened'}   # unchanged for every other status
```

```html
<!-- before sign-off, an answered row -->
<article class="wk-excl" data-wk="exclusion" data-id="E1" data-verdict="agree">
  <p class="wk-excl-claim">…</p><p class="wk-excl-from">…</p>
  <p class="wk-excl-state">You agreed. It stays out.</p>
  <button class="wk-excl-change" data-wk="reconsider">Change answer</button>
</article>

<!-- after sign-off -->
<section class="wk-exclusions" data-wk="exclusions" data-recorded="2026-09-12" hidden>
  <h2 class="wk-excl-h">Three things this product will not do</h2>
  <p class="wk-excl-lead">Recorded on 2026-09-12 when the work was signed off. If anything here is a surprise, tell us in the note above.</p>
  <article class="wk-excl" data-wk="exclusion" data-id="E3" data-verdict="none">
    <p class="wk-excl-claim">…</p>
    <p class="wk-excl-state">You did not answer, so this was recorded as not contested. It stays out.</p>
  </article>
</section>
```

## UI

`design/client-mocks/walk.html`: R4 (`Change answer` on each answered row, receipt in the msg
slot), R5 (read-only, dated lead, the unanswered row stating it was recorded as not contested, no
buttons and no `Put it back`), R6 (confirm swapped in place, bar showing `Back` only), R3 and the
just-withdrawn request card (`Put it back` inline). `design/client-mocks/index.html`: the closed
list's taken-back row with `Put it back`.

## Data Model

No new file and no new column. An exclusion row's `status` gains no value — `reconsider` returns
it to the existing `open`, and clears `rejected` to `-`. A note's existing
`status: resolved` / `resolution: withdrawn` pair is what D5 reads.

## Behavior

Before the work is signed off, every answer on the card is provisional: an answered row offers
`Change answer`, which puts it back to its two buttons on the spot. A request the client took back
says where it went and offers `Put it back` on the request card, on the index's closed list, and
on the exclusion row it produced; putting it back reopens the note, and the next time the page
loads, the derived exclusion row is gone by the derivation that already ships. Confirming a
journey now says so immediately instead of looking like it failed.

Once the session marks the work approved, the card becomes a record: it shows the date, states
each outcome including the ones the client never answered, and offers no control at all. The route
refuses a verdict with the same sentence the page shows, so a stale tab cannot write past the
snapshot. A client who wants something changed after that uses the note box, and the session
decides whether it reopens the journey — the loop that already exists.

## Acceptance Criteria

- **AC-20260912-02-1**: WHEN `setExclusionVerdict(text, 'E2', 'reconsider', '2026-09-12')` runs over a ledger whose `E2` is `overridden 2026-09-12` with `rejected` `client-needed` THE SYSTEM SHALL return text whose `E2` row reads status `open` and `rejected` `-`, and WHEN `materialize` then runs over that text with the source still live THE SYSTEM SHALL return it byte-identical with `{added:0, reopened:0}` → writes tests/mocks/mocks-exclusions.test.js
- **AC-20260912-02-2**: WHEN `POST /client/__walk/exclusion {id:'E2', verdict:'reconsider'}` runs before sign-off THE SYSTEM SHALL answer 200 with `status:'open'` and `rejected:null`, and `ledger.md`'s `E2` row SHALL carry both → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-02-3**: WHEN `POST /client/__walk/exclusion {id:'E2', verdict:'maybe'}` runs THE SYSTEM SHALL answer 400 with an error naming `agree`, `needed` and `reconsider` → rewrites tests/mocks/exclusions-route.test.js :: AC-20260911-05-4
- **AC-20260912-02-4**: WHEN `design/mocks/status.json` carries `marks.approved` dated `2026-09-12` and `POST /client/__walk/exclusion {id:'E2', verdict:'agree'}` runs THE SYSTEM SHALL answer 409 with an error containing `the work was signed off on 2026-09-12`, and `ledger.md` SHALL be byte-identical afterwards → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-02-5**: WHEN `buildWalkPage` renders with `approved` set THE SYSTEM SHALL give `[data-wk="exclusions"]` `data-recorded="2026-09-12"`, render a lead containing `Recorded on 2026-09-12 when the work was signed off`, and render no `[data-wk="agree"]`, `[data-wk="needed"]`, `[data-wk="reconsider"]` or `[data-wk="putback"]` anywhere inside the section → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-02-6**: WHEN `buildWalkPage` renders with `approved` set and a row is still `open` THE SYSTEM SHALL render its state line as `You did not answer, so this was recorded as not contested. It stays out.` and give its article `data-verdict="none"` → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-02-7**: WHEN `buildWalkPage` renders, before sign-off, a `confirmed` row, an `overridden`+`client-needed` row and an `overridden` row whose `rejected` is `-` THE SYSTEM SHALL render `[data-wk="reconsider"]` inside the first two and NOT inside the third → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-02-8**: WHEN, under `vm`, `[data-wk="reconsider"]` is clicked with `fetch` resolving `ok:true` THE SYSTEM SHALL have posted `{id, verdict:'reconsider'}`, removed the article's `data-verdict`, hidden its `wk-excl-state`, left its `wk-verdicts` visible, and written `Saved. You can change your answer until the work is signed off.` into `[data-wk="msg"]` → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-02-9**: WHEN `POST /client/__notes/reopen {id:'N020', by:'client'}` runs with no text against a client-origin note whose `status` is `resolved` and `resolution` `withdrawn` THE SYSTEM SHALL answer 200 and the note SHALL read `status: open`; WHEN the walk page is then requested THE SYSTEM SHALL leave no exclusion row anchored `withdrawn: N020` in `ledger.md` in a non-`overridden` status → writes tests/mocks/client-walk-route.test.js
- **AC-20260912-02-10**: WHEN `POST /client/__notes/reopen` runs against an `open` client-origin note THE SYSTEM SHALL CONTINUE TO answer 400 naming `only an addressed note is reopened`, and against an `addressed` note with empty text THE SYSTEM SHALL CONTINUE TO answer 400 naming `reopen text must be non-empty` → writes tests/mocks/client-walk-route.test.js
- **AC-20260912-02-11**: WHEN `buildWalkPage` and `buildClientIndex` render a client-origin note whose `status` is `resolved` and `resolution` `withdrawn` THE SYSTEM SHALL render `[data-wk="putback"]` and the sentence `You took this back — it's on the list of things we will not build.` in each, and the exclusion row anchored to that note SHALL also carry a `[data-wk="putback"]` after its `wk-excl-from` line → writes tests/mocks/walk-page.test.js
- **AC-20260912-02-12**: WHEN `spec/templates/mocks/viewer.css` is read THE SYSTEM SHALL carry a `.wk-req[data-status="resolved"][data-resolution="withdrawn"] .wk-req-acts` rule whose `display` is `flex` → writes tests/mocks/walk-page.test.js
- **AC-20260912-02-15**: WHEN `spec/templates/mocks/viewer.css` is read THE SYSTEM SHALL CONTINUE TO carry a `.wk-req[data-status="resolved"] .wk-req-acts` rule whose `display` is `none` — every other resolved request keeps its actions hidden → writes tests/mocks/walk-page.test.js
- **AC-20260912-02-13**: WHEN, under `vm`, `[data-wk="confirm"]` is clicked with `fetch` resolving `ok:true` THE SYSTEM SHALL replace the sign-off block with the confirmed render, leave no `[data-wk="confirm"]` in the bar, and write `Confirmed — thank you. You can still change an answer on this page until the work is signed off.` into `[data-wk="msg"]` → writes tests/mocks/walk-page.test.js
- **AC-20260912-02-14**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry `until the work is signed off` in § Mocks: Client Player and SHALL NOT carry `only un-agreeing a confirmed exclusion` anywhere; `spec/commands/mocks.md` SHALL carry `signed off` in § Client review → writes tests/consistency/design-doctrine.test.js

## Assumptions (escalation triggers)

- A1: `POST /client/__notes/reopen` today refuses any note whose `status` is not `addressed` (400, `only an addressed note is reopened`) and refuses empty text — read at lock in `design-atlas.js`. D5 adds one arm before those two guards and leaves both otherwise intact; AC-20260912-02-10 pins that.
- A2: `.wk-req[data-status="resolved"] .wk-req-acts { display: none; }` exists at viewer.css:564, so a withdrawn row's `Put it back` needs D6's more specific override or it renders hidden — read at lock. **If false**: drop the override rule from D6 and say so in the deviations sidecar.
- A3: `design-atlas.js` already reads `design/mocks/status.json` fresh per request for the theme, so D3's `marks.approved` read needs no new plumbing — read at lock. **If false**: add the read beside the theme's in the same File Plan row.
- A4: `reopenNote` sets `status: 'open'` and appends a thread entry regardless of the prior status, so D5 needs no change to the lib beyond accepting the withdrawn case — read at lock (`mocks-notes.js`, `reopenNote`). **If false**: the lib row already exists in the File Plan; widen it there.
- A5: The confirmed sign-off render D7 swaps in already exists server-side (`renderSignoff`'s confirmed branch, specs/20260911/06 D21), so the handler reuses that markup rather than inventing a second one. **If false**: STOP, ask — a second confirmed render is a divergence, not an implementation detail.
- A6: `materialize` retires a row whose source is gone by setting it `overridden <today>`, so D5's put-back needs no new retire path — read at lock (`lib/mocks-exclusions.js`, `deriveExclusions`'s `retire` set). AC-20260912-02-9 asserts the observable, not the mechanism.

## Rationale

JJ asked for the proper fix rather than the narrow one (2026-09-12) after the exclusions card
reached him with no question and no answer. The scope came from the queued item q178 ("the
client's reversible journey"), reduced to what specs/20260911/06 had not already shipped: request
take-back, the ask-form receipt and the reopen memory all landed there, so what remained was the
exclusions card, the confirm receipt, and the put-back inverse.

Two client-relationship calls were JJ's, both answered after reviewing the rendered mock:

- An unanswered row tells the client, in plain words, that silence was recorded as not contested.
  His reason: the client should learn it while he can still act on a surprise, not in the
  statement of work. specs/20260912/01's lead carries it before sign-off; D3's read-only lead and
  AC-20260912-02-6's state line carry it after.
- `Never mind` keeps meaning a real non-goal — the item still reaches the won't-build list — but
  every row says why it is there and offers a way back (D6). The alternative, dropping it
  silently, loses the record that the client once asked for it, which resurfaces later as "why
  wasn't this built?".

The sign-off cut-off (D3) is the shape the whole spec hangs on, and it was not in q178: the
reviewing design seat found that `/client/__walk/exclusion` has no gate on `marks.approved` at
all, so a client can flip a row after `exclusions.md` is written and the ledger silently diverges
from the dated file a statement of work cites. Approval is the snapshot boundary — that is what
"dated, never rewritten in place" means — so the answer is unlimited change before it and none
after, with the note box as the documented path for a late change. `--reopen journey:<j>` already
clears `approved` and cascades, so a genuine late change re-approves and writes a new dated file;
nothing here touches that (D10).

This spec is the second of two. specs/20260912/01 ships the card's heading, lead, provenance lines
and state sentences; this one adds every control beside them. Neither is useful alone to a reader,
but each leaves the system green on its own, which is the slice the decomposition cap asks for.

Collision closure at lock (literals `only un-agreeing a confirmed exclusion`, `stay unshipped`).
Every hit read and waived, none entering the File Plan: `docs/canonical/design.md`'s sentence
reserving un-agreement and provenance lines to a future spec is this spec's own Canonical Delta
target, applied by `/spec:review` at close and deliberately phrased without the retired words (the
host § Gotchas entry on a Delta re-reddening the retired-name sweep at the close commit);
`specs/20260911/06-the-client-loop.md` is a closed spec doc under the sweep's waived prefixes; the
remaining hits are stale copies inside a sibling's `.claude/worktrees/` checkout, not this tree.
The `likely`/`mentions` tier owes no waive line. No test asserts either literal.

## Canonical Delta

`docs/canonical/design.md` § Exclusions: an exclusion answer is the client's to change until the
session marks the work approved — an answered row carries `Change answer`, which posts
`verdict: 'reconsider'` and returns the row to `open` with its `rejected` cell cleared. Once
`design/mocks/status.json` carries `marks.approved`, the card is a dated record: it renders the
approval date, states every outcome including an unanswered row's ("recorded as not contested"),
renders no control, and `POST /client/__walk/exclusion` answers 409 naming the date and pointing
at the note box. A client-origin request resolved `withdrawn` carries `Put it back` on the walk
page, on the client index's closed list, and on the exclusion row it produced; the put-back
reopens the note, and the next `materialize` retires the derived row by the existing derivation.
Confirming a journey swaps the sign-off block to its confirmed render in place and answers in the
message slot. The sentence reserving un-agreement and provenance lines to a later spec is deleted:
both ship here.
