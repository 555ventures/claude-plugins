---
date: 2026-09-12
status: implementing
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/client-mocks/walk.html
breaking: false
depends_on: [specs/20260911/05-approval-is-bookkeeping.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 2328310df9f925ae538ac6e68dce360d8fae72a9
---

# The exclusions card explains itself and remembers: a heading, the question, why each claim is on the list, and what the client answered

## Goal

The card the client answers at the end of a journey has never been designed. specs/20260910/05
retrofitted it into the side panel as a list of bare claims with one agree button whose label
carried the whole question; specs/20260911/05 replaced that label with `Correct` / `No — we need
this` and deleted the question with it. Today the card has no heading, no lead, no reason why any
claim is on the list, and no trace of what the client answered — `confirmed`, `overridden` and
never-answered all render as the same bare claim line, and the only in-session signal is both
buttons fading. This spec makes the card readable cold: it says what it is, poses the question,
tells the client why each row is there in their own words where the row came from them, and
states the answer back. Everything here is render and copy — no new route, no new ledger verb, no
new write. Done means a client meeting this card for the first time can answer it without asking
anyone what it means, and can reload the page and still see what they said.

The approved mock `design/client-mocks/walk.html` (JJ, 2026-09-12) is the binding reference for
every string and every state in this spec; where prose here and that file disagree, the file wins
and the disagreement is a defect in this spec.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `renderExclusions` emits a card head before the articles, rendered ONLY when `rows.length > 0` (the section already renders nothing otherwise): `<h2 class="wk-excl-h">` carrying `<n> things this product will not do` and `<p class="wk-excl-lead">` carrying `Each one is here for a reason. Say Correct if it should stay out, or tell us you need it. Anything you leave unanswered is recorded as not contested when the work is signed off.` The count word is spelled for 1–9 and a digit from 10, and the noun agrees: 1 → `One thing this product will not do`, 3 → `Three things this product will not do`, 10 → `10 things this product will not do`. Counts ALL rows the card shows, not only `open` ones (AC-20260912-01-1, AC-20260912-01-2) | The lead is what makes `Correct` answer something; JJ's ruling (2026-09-12) puts the silence warning before the client leaves the page, not only after sign-off |
| D2 | `renderExclusion` emits `<p class="wk-excl-from">` under the claim for the two rows whose claim this pipeline CONSTRUCTED from something the client said in other words, never an id and never the raw grammar: `answer: <noteId>` → `Because you told us, on <Screen>:` followed by `<p class="wk-excl-said">` carrying the note's answer text; `withdrawn: <noteId>` → `Because you took back your request on <Screen>.` followed by `<p class="wk-excl-said">` carrying the note's request text. A `non-goal:` row renders NO provenance line and no quote: its `note` cell is `'non-goal: ' + claim` — byte-identical to the claim already on screen (`nonGoalEntries`), so any sentence built from it repeats the claim verbatim, and nothing was inferred there to show. `<Screen>` is the note's `screen` label put through walk-page.js's existing `humanizeLabel` (first letter capitalised, hyphens to spaces — `session-live` → `Session live`), never a second renderer. `exclusionsForJourney` already resolves each anchored row's note by id but returns only the row; it now returns `{ row, note }` per entry so `renderExclusion` has the note without a new parameter, and `renderExclusions` maps over that shape. A row whose note names an unresolvable note id likewise renders the claim alone, never a placeholder (AC-20260912-01-3, AC-20260912-01-4) | Those two rows ask the client to confirm a sentence they never wrote — showing their original words beside our paraphrase is what makes the question answerable |
| D3 | A source-(b) row's claim carries the literal `not: ` prefix in the ledger (`not: a second insurer field`). `renderExclusion` strips that prefix and renders `We won't build: <claim>`; every other claim renders verbatim. The ledger cell is untouched (AC-20260912-01-5) | The raw `not:` prefix is internal grammar leaking onto a client's screen |
| D4 | `renderExclusion` sets `data-verdict` on the article server-side and emits `<p class="wk-excl-state">` in place of the buttons for every non-`open` row: `confirmed` → `data-verdict="agree"`, `You agreed. It stays out.`; `overridden` with `rejected` `client-needed` → `data-verdict="needed"`, `You need this. We'll treat it as a request and let you know here.`; `overridden` with any other `rejected` (a retired source — the client never touched it) → `data-verdict="dropped"`, `We've taken this off the list.` An `open` row renders no state line and no `data-verdict`, and keeps its two buttons (AC-20260912-01-6, AC-20260912-01-7) | The reload trace is the whole of defect 2; the retired-source row is a real third state and a bare claim there is the same defect |
| D5 | `walk.browser.js`'s exclusion handler stops disabling the buttons. On `ok` it does what the server does: sets `data-verdict` to the pressed verdict, and fills and unhides the row's own `<p class="wk-excl-state" hidden>` — shipped inside every `open` article by D4's renderer, its two texts carried on the section as `data-said-agree` / `data-said-needed` (activation, never fabrication — the same discipline as `wk-req-again`). CSS hides `.wk-verdicts` on an article carrying `data-verdict`, so the answered row matches its own reload render. The handler additionally shows the receipt in the existing msg slot: `Saved. You can change your answer until the work is signed off.` (AC-20260912-01-8, AC-20260912-01-9) | A row that changes shape only on reload reads as a failure; the in-session and reload renders must be the same markup |
| D6 | `spec/templates/mocks/viewer.css` gains exactly the rules the mock marks `NEW`, scoped under `.wk-excl*`: `.wk-excl-h`, `.wk-excl-lead`, `.wk-excl-from`, `.wk-excl-said`, `.wk-excl-state`, and `.wk-excl[data-verdict] .wk-verdicts { display: none; }`. No existing rule is edited, and `.wk-req-status` is never borrowed onto this card — it is grid-positioned by two other rules and works here only by accident (AC-20260912-01-10) | The card's own classes, so a later change to the requests grid cannot silently restyle this card |
| D7 | `spec/doctrine/mocks.md` § Mocks: Client Player's last-screen paragraph gains one sentence: the card states what it is, why each row is listed, and what the client answered, and an unanswered row says on the page that silence is recorded as not contested (AC-20260912-01-11) | Doctrine binding home |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D9 | OUT of this spec, deliberately, and named here so no worker invents them: the `Change answer` control, the `Put it back` control, the post-sign-off read-only render, and the confirm receipt. All four are specs/20260912/02's. The mock renders them in R3/R4/R5/R6; this spec's renders match the mock minus those four controls, which is not a mock mismatch [no-ac: a scope exclusion promises no behavior — its carrier is the sibling spec's own ACs] | The landing unit is comprehension; reversibility is the sibling's |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D1 card head, D2 provenance, D3 `not:` strip, D4 state line + `data-verdict` + hidden state stub, strings |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D5 activate the state line instead of disabling, msg receipt |
| spec/templates/mocks/viewer.css | MODIFY | other | D6 the six new `.wk-excl*` rules |
| spec/doctrine/mocks.md | MODIFY | doctrine | D7 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 bump |
| tests/mocks/walk-page.test.js | MODIFY | tests | AC-20260912-01-1 … -7, -10 |
| tests/mocks/exclusions-route.test.js | MODIFY | tests | AC-20260912-01-8, -9 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260912-01-11 |

## Contracts

```js
// buildWalkPage over a journey whose card shows three rows
'<section class="wk-exclusions" data-wk="exclusions" data-exclusions-open="1"' +
'  data-said-agree="You agreed. It stays out."' +
'  data-said-needed="You need this. We\'ll treat it as a request and let you know here." hidden>' +
'<h2 class="wk-excl-h">Three things this product will not do</h2>' +
'<p class="wk-excl-lead">Each one is here for a reason. …</p>' +
'<article class="wk-excl" data-wk="exclusion" data-id="E1" data-verdict="agree">' +
'  <p class="wk-excl-claim">SMS appointment reminders</p>' +
'  <p class="wk-excl-state">You agreed. It stays out.</p>' +   // non-goal row: no provenance line
'</article>' +
'<article class="wk-excl" data-wk="exclusion" data-id="E2">' +
'  <p class="wk-excl-claim">Letting patients invite themselves from the clinic website.</p>' +
'  <p class="wk-excl-from">Because you told us, on Invite:</p>' +
'  <p class="wk-excl-said">No — the front desk sends every invite.</p>' +
'  <div class="wk-verdicts"><button class="wk-v" data-wk="agree">Correct</button>' +
'  <button class="wk-v" data-wk="needed">No — we need this</button></div>' +
'  <p class="wk-excl-state" hidden></p>' +
'</article>'
```

```
claim 'not: a second insurer field'  → <p class="wk-excl-claim">We won't build: a second insurer field</p>
note  'non-goal: SMS appointment reminders'   (claim is the same string)
                                     → no wk-excl-from, no wk-excl-said — the claim alone
note  'withdrawn: N020' (screen session-live)
                                     → <p class="wk-excl-from">Because you took back your request on Session live.</p>
rows 1 → <h2>One thing this product will not do</h2>
rows 3 → <h2>Three things this product will not do</h2>
rows 10 → <h2>10 things this product will not do</h2>
```

## UI

`design/client-mocks/walk.html`, states R3 (unanswered) and R4 (answered), minus the
`Change answer` and `Put it back` controls, which are specs/20260912/02's (D9). R7's error
wording is untouched. The empty card renders nothing — no heading, no "none" line.

## Data Model

No change. `design/mocks/ledger.md`'s exclusion rows are read, never written, by every path here.

## Behavior

The client reaches the last screen and the card is now legible: a heading naming how many things
are on the list, a sentence posing the question and warning that silence counts as agreement at
sign-off, and under each claim one sentence saying where it came from — the project brief, or
the client's own words on a named screen, quoted. Pressing `Correct` or `No — we need this`
replaces the buttons on that row with a sentence stating the answer, and the message slot
confirms the save. Reloading the page renders exactly what the client left behind.

## Acceptance Criteria

- **AC-20260912-01-1**: WHEN `buildWalkPage` renders a card holding three rows THE SYSTEM SHALL emit, as the section's first two children, `<h2 class="wk-excl-h">Three things this product will not do</h2>` and a `<p class="wk-excl-lead">` whose text contains `recorded as not contested when the work is signed off`; with one row the heading SHALL read `One thing this product will not do` and with ten `10 things this product will not do`; the count SHALL include non-`open` rows → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-2**: WHEN `buildWalkPage` renders a journey with no exclusion rows THE SYSTEM SHALL emit no `wk-excl-h` and no `wk-excl-lead` anywhere on the page → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-3**: WHEN a row's note is `answer: N014` for a note on screen `invite` whose answer text is `No — the front desk sends every invite.` THE SYSTEM SHALL render `Because you told us, on Invite:` followed by a `wk-excl-said` carrying that text; WHEN it is `withdrawn: N020` for a note on screen `session-live` whose text is `Show the patient's mobile number.` THE SYSTEM SHALL render `Because you took back your request on Session live.` followed by a `wk-excl-said` carrying that text → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-4**: WHEN a row's note is `non-goal: SMS appointment reminders`, and WHEN a row's note names a note id that resolves to no note, THE SYSTEM SHALL in each case render that row's claim with no `wk-excl-from` and no `wk-excl-said` element, SHALL NOT render the id anywhere in the page, and SHALL NOT render the claim text twice inside the article → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-5**: WHEN a row's claim is `not: a second insurer field` THE SYSTEM SHALL render `We won't build: a second insurer field` as the claim text, and WHEN it is `Multi-currency billing` THE SYSTEM SHALL render it verbatim → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-6**: WHEN `buildWalkPage` renders a `confirmed` row, an `overridden` row whose `rejected` is `client-needed`, and an `overridden` row whose `rejected` is `-` THE SYSTEM SHALL give the three articles `data-verdict` `agree` / `needed` / `dropped` and a `wk-excl-state` reading `You agreed. It stays out.` / `You need this. We'll treat it as a request and let you know here.` / `We've taken this off the list.`, and SHALL render no `wk-verdicts` block inside any of them → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-7**: WHEN `buildWalkPage` renders an `open` row THE SYSTEM SHALL CONTINUE TO render its two `[data-wk="agree"]` / `[data-wk="needed"]` buttons and SHALL CONTINUE TO leave `[data-wk="confirm"]` without `disabled` whatever `data-exclusions-open` holds → rewrites tests/mocks/exclusions-route.test.js :: AC-20260911-05-5
- **AC-20260912-01-8**: WHEN `buildWalkPage` renders an `open` row THE SYSTEM SHALL emit inside it one `<p class="wk-excl-state" hidden></p>` and SHALL carry `data-said-agree` and `data-said-needed` on the `[data-wk="exclusions"]` section → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-01-9**: WHEN, under `vm`, `[data-wk="needed"]` is clicked with `fetch` resolving `ok:true` THE SYSTEM SHALL set the article's `data-verdict` to `needed`, unhide its `wk-excl-state` with the text `data-said-needed` carries, leave both buttons WITHOUT a `disabled` attribute, and write `Saved. You can change your answer until the work is signed off.` into `[data-wk="msg"]`; clicking `[data-wk="agree"]` SHALL use `data-said-agree` → writes tests/mocks/exclusions-route.test.js
- **AC-20260912-01-10**: WHEN `spec/templates/mocks/viewer.css` is read THE SYSTEM SHALL carry a rule for each of `.wk-excl-h`, `.wk-excl-lead`, `.wk-excl-from`, `.wk-excl-said`, `.wk-excl-state` and `.wk-excl[data-verdict] .wk-verdicts`, and SHALL NOT carry `.wk-excl` anywhere in a selector that also names `wk-req-status` → writes tests/mocks/walk-page.test.js
- **AC-20260912-01-11**: WHEN `spec/doctrine/mocks.md` § Mocks: Client Player is read THE SYSTEM SHALL carry `why each row is listed` and `recorded as not contested` → writes tests/consistency/design-doctrine.test.js

## Assumptions (escalation triggers)

- A1: `exclusionsForJourney` already receives `notes` and resolves an anchored row's note by id through its own `noteById` map, but pushes only the row — read at lock (walk-page.js, the `noteById` map and its `out.push(row)`). D2 therefore widens that function's return to `{ row, note }` rather than adding a parameter; both it and its only caller `renderExclusions` are in the same File Plan row. **If false**: thread `notes` into `renderExclusion` instead, same row.
- A2: `.wk-req-status` is grid-positioned (`grid-column: 2; grid-row: 2` at viewer.css:550, re-pinned by `.wk-side .wk-req-status` at 650 and by the ≤1180px block at 577), which is why D6 gives this card its own class rather than borrowing it — read at lock.
- A3: `humanizeLabel` (walk-page.js, used by `renderSteps`) already renders a screen label with its first word capitalised and hyphens as spaces, so D2's `<Screen>` calls it rather than introducing a second rendering — read at lock. **If false**: extract it in the same File Plan row and call it from both.
- A4: No test outside this File Plan asserts the exclusion article's markup. Grep at lock over `tests/`: `wk-excl` and `data-wk="exclusion"` appear in `tests/mocks/mocks-exclusions.test.js` (comments only) and `tests/mocks/exclusions-route.test.js` (in the File Plan). **If false**: the hit's file enters the File Plan as a fix row.
- A5: The section's own `hidden` and `.wk-exclusions:not(:has(.wk-excl))` both already hide an empty card, so D1's `rows.length > 0` guard is a belt beside them, not the only cover — read at lock.

## Rationale

The card was never designed. It arrived as a list inside another spec's panel and was relabelled
by a third, and each step left it less legible than the one before: specs/20260911/05 replaced the
one button whose label carried the whole question with two bare verbs, so the question vanished
entirely. Both the design seat and the independent reviewer raised it in that spec's review, where
it was recorded advisory and not fixed because `viewer.css` was outside that spec's File Plan.

JJ ruled on 2026-09-12, after reviewing the rendered mock, that an unanswered item must tell the
client on the page that silence is recorded as not contested — his reason: the client should meet
that fact while he can still act on a surprise, not in the statement of work. D1's lead carries it
before the client leaves the page and specs/20260912/02's read-only render repeats it after
sign-off.

The provenance line (D2) covers two of the three sources, and JJ's challenge on 2026-09-12 is why
it covers only two. A `non-goal:` row is a TRANSCRIPTION — `nonGoalEntries` sets the note to
`'non-goal: ' + claim`, the same string as the claim — so any sentence built from it repeats the
claim the client is already reading, and nothing was inferred there to disclose. It is deleted, not
shortened. The other two rows are CONSTRUCTIONS: an `answer:` row turns a description the client
gave ("the front desk sends every invite") into a contractual non-goal they never wrote ("letting
patients invite themselves"), and a `withdrawn:` row turns a cancelled request into a won't-build.
In both, the card asks the client to confirm our paraphrase, so it shows their original words beside
it. That is a readable defect on the card itself, checkable by reading the two strings side by side
— not a prediction about which button they press, which neither this session nor the design seat
has evidence for and which is deliberately NOT claimed here. Consulted design seat agreed and
abandoned its own three-case design (2026-09-12). The dated `exclusions.md` already carries each
row's source pointer (`- <claim> (<journey>, answer: N014)`); only the quoted words are absent from
it, and putting them there is a separate spec against that file, not this one.

`data-verdict` was already set by specs/20260911/05's handler and styled by nothing; D4/D5 make it
the real state carrier and make the in-session render equal to the reload render, which is the
defect the reviewer's second soft finding named.

D9 is deliberate: this spec is the comprehension half. The reversibility half — `Change answer`,
`Put it back`, the sign-off cut-off, and the confirm receipt — is specs/20260912/02, which is why
the approved mock shows controls this spec does not build. A worker finding that gap has found the
seam, not a defect.

## Canonical Delta

`docs/canonical/design.md` § Exclusions: the client's card carries a heading counting the rows, a
lead posing the question and stating that an unanswered row is recorded as not contested at
sign-off, one provenance sentence on each of the two rows whose claim this pipeline
constructed from something the client said in other words — their answer to a question, or a
request they took back — each carrying their original words quoted; a row transcribed straight from
the brief's non-goals carries none, because its source text is the claim itself. Every non-`open` row
carries a state line saying what the client answered, held by `data-verdict` ∈ `agree|needed|dropped`. The
in-session render after an answer is the same markup as the reload render. `design/client-mocks/walk.html`
is the binding reference for the card's states.
