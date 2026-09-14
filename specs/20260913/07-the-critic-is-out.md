---
date: 2026-09-13
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md]
depended_on_by: [specs/20260913/05-a-note-is-a-conversation.md]
brief: n/a
supersedes: [specs/20260913/03-the-critic-stops-filing-notes.md, specs/20260913/04-only-a-person-starts-a-note.md]
open_markers: 0
diff_base: 26a222450f4e0c1047343a9256c87384136b30f2
---

# The critic is out

## Goal

The page-notes loop exists so a person can point at what they do not like on a mock. Two
producers write into that queue with no person involved. At the WALK state the driver dispatches
a critic agent per journey and records every finding as a `kind: "walk"` note the journey cannot
pass until the session closes it; while drawing, the session pins each inferred assumption to a
screen as a `kind: "question"` note the owner must answer before the journey approves. This spec
deletes both producers end to end — the WALK state, its mark, its reopen target and its agent;
the two ledger verbs that create a question, the answer route and every surface that renders or
counts one — and hides the question and walk notes an existing store already holds without
touching them on disk. It retires the composer's reason chips in the same stroke. Done means the
mocks chain runs WIREFRAMES → THEME with nothing between, every note the page shows or the
driver counts was typed by a person, and the only writer of an assumption row's status is the
human-run `ledger set`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **WALK leaves the state chain.** `deriveState` becomes SEED → SHAPES → KIT → WIREFRAMES → THEME → CLIENT → APPROVED: the `if (!allJourneysWalked()) return 'WALK'` disjunct, `allJourneysWalked`, `walkedCount`, `printWalkStep`, the `'WALK'` arm of the step dispatcher and `ensureJourneyRecord`'s `walked: null` seed go; `journeys[<j>].walked` is never written or read again (a host whose status file carries it keeps the key as inert data). `--reopen shapes` stops nulling each journey's `walked` and its printed `invalidated` list becomes `shape, canon, kit, journeys(all), approved(all)`. The `client open` refusal that says "once every journey is walked" says "once the theme is picked". (AC-20260913-07-1, AC-20260913-07-5) | A state whose only content was the critic's dispatch has nothing left to gate; a no-op pass-through would print a step nobody can act on. |
| D2 | **`--mark journey-walked` and its gate are deleted.** The `case 'journey-walked'` arm, `handleJourneyWalked` and `openWalkFindingsFor` go; `doMark`'s unknown-mark refusal enumerates exactly `seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, theme-picked, approved`. (AC-20260913-07-2) | The mark's only refusal was "a walk finding is still open", which cannot occur once nothing files one. |
| D3 | **`--reopen walk:<j>` is deleted; `--reopen journey:<j>` keeps the client's half.** The `walk:` branch goes and the refusal reads `--reopen must be journey:<j>, shapes, kit, or theme`. Inside the `journey:` branch the `st.walked = null` line and the `'walk:' + j` entry go; the `walkLib.unconfirmJourney` write on `walk.json` — the client taking back their own confirmation of a redrawn journey — stays exactly as it is. (AC-20260913-07-3, AC-20260913-07-4, AC-20260913-07-5) | Two unrelated features spelled `walk` meet in this one handler; deleting the wrong line lets a client's approval survive a redraw with no error. AC-4 pins `walk.json`'s contents, not the printed line. |
| D4 | **The critic agent and both dispatch sites are deleted.** `spec/agents/design-critic.md` is deleted. `spec/commands/mocks.md` loses its `## Walk (WALK state)` section, its THEME paragraph opens on journey approval instead of "Once every journey is walked", and its Rules line becomes `canon before screens, kit before wireframes`. `spec/commands/sketch.md`'s step 7 `Critique (fixed)` loses the `design-critic` dispatch and the `notes add --kind walk` recording sentence; its `check --states` and `render-gate --mocks` checks stay and the step keeps its position before the exit step. (AC-20260913-07-6) | Two commands dispatch the same agent; deleting one leaves the producer alive in the other. |
| D5 | **Nothing creates a question or a walk note.** `notes add` refuses any `--kind` or `--ledger-id` with `notes add: --kind and --ledger-id are retired — a note is what a person typed` (the driver reads flags positionally and never refuses an unknown one, so a silent ignore would file the note as plain). `ledger add` refuses `--screen` with `ledger add: --screen is retired — an assumption row is confirmed with ledger set, never pinned to a screen` before writing anything; `ledger ask` and `refuseUnaskable` are deleted and the subcommand refusal enumerates `add, set, catch, check, counts, derive`. In `lib/mocks-notes.js`, `addNote`'s `isQuestion` and `isWalk` branches, `LEDGER_ID_RE`, `WALK_REASONS` and its export go, `REASONS` collapses to `PLAIN_REASONS`; `KINDS` and `ORIGINS` keep `'question'` and `'walk'` as legacy-accept values with a one-line comment, and `validateNotes` accepts a legacy note of either kind with whatever `ledgerId`, `answer` or `reason` it carries (no format check on a value nothing produces). (AC-20260913-07-7, AC-20260913-07-8, AC-20260913-07-9) | These are the only callers that ever passed a `kind`; the server's `POST /__notes/add` already refuses a body carrying one. Narrowing the enums would invalidate an older store on read for a note nobody can create — a migration with no reader to pay it. |
| D6 | **The answer flow is deleted.** `POST /__notes/answer` (both mounts; a request falls through to the shared `/__notes/` 404), `answerQuestion`, `waiveNote`'s question branch and the driver's `notes waive` question branch and ledger writeback, `GET /__notes/list`'s ledger join and `joinQuestions`, `renderQuestionRow`, `isQuestion`, `rowOpen`'s `rv-q` class, the notes layer's `questionRow`, the driver's `questionLines` and `journeyQuestionCounts`, the header's answered/total progress bar (`rv-progress`, `rv-track`, `rv-fill`) with `recount`'s progress arithmetic, the question controls in `review.browser.js` (`answer`, `yes`/`no`/`later`, the `y`/`n` keys), `design-atlas.js`'s `/__notes/resolve` question pre-check (its message named the deleted route), and on the client's pages `isOpenQuestion`, `claimOf`, `renderMark`, the `wk-marks`/`wk-mark`/`wk-claim`/`wk-why`/`wk-left` block with `data-guesses`, and `walk.browser.js`'s marks block (`leftCount`, `updateLeft`, the yes/no handlers; `refreshNavDisabled` keys on open requests alone) are all deleted with their CSS. `resolveNote` keeps refusing a legacy question as `note "<id>" was not written by a person and cannot be resolved`. The inspector's `aria-label` becomes `Notes` and its empty-state copy `No open notes on this journey. Approve it when the screens look right.` (AC-20260913-07-10, AC-20260913-07-11, AC-20260913-07-19, AC-20260913-07-21, AC-20260913-07-24) | Every one of these exists only to render or close a question; the progress bar measures answered-over-asked and has no other meaning. The client player's marks posted into the same handler the session route deletes, so leaving them would leave live yes/no controls posting into a 404. |
| D7 | **No gate counts a question.** `unresolvedFor` judges every note it keeps by `status !== 'resolved'`; `requireNotesResolved` prints one refusal, `unresolved note(s)<where>: <ids> — the author resolves after a re-look`; `POST /client/__walk/confirm`'s unanswered-guess `409` is deleted and its open-request `409`, already-confirmed `409` and empty-sentence `400` are untouched. `requireGateOpen` (the ledger gate) is NOT touched: `ledger set --id <id> --status confirmed --tag said-by-user`, the remedy it already names, is the one writer of a row's status. (AC-20260913-07-12, AC-20260913-07-13, AC-20260913-07-20, AC-20260913-07-26) | A refusal that can never fire is a branch a reader reasons about forever. The two gates look alike; only the notes gate changes. |
| D8 | **A note a person did not type is never shown or counted.** `lib/mocks-notes.js` exports `authoredByPerson(n)`, true when `n.kind !== 'question' && n.kind !== 'walk'` — `kind: "note"` and an absent `kind` are both a person's note (nine test fixtures and the store's own header spell `kind: "note"`). Its call sites: `groupOpen`, `unresolvedFor`, `GET /__notes/list` on both mounts (the client mount's filter becomes `originOf(n) === 'client'` alone), the driver's `notes open` counts and listing, `lib/walk-page.js`'s two note collectors (they build the client's pages from `readNotes`, never through the list route), `lib/mocks-exclusions.js`'s `withdrawnNotNeededEntries` skip, `design-atlas.js`'s atlas card count, and `lib/review-page.js`'s item list. The two browser files cannot import the lib and inline the same two-clause predicate with a comment naming it. Nothing filters inside `readNotes` or `writeNotes`, so no read-modify-write path can drop a hidden note. (AC-20260913-07-14, AC-20260913-07-15, AC-20260913-07-21, AC-20260913-07-25) | The one real host holds thirteen question notes; they must vanish from the owner's page and the AI's sweep without a tool the owner never pointed at them deleting history. Rejected: `kind == null` — it hides every `kind: "note"` note and disarms the journey gate on them (silent wrong result). |
| D9 | **A client's recorded answer keeps its exclusion row.** `lib/mocks-exclusions.js`'s `invalidatedAnswerEntries` (derivation source (b): an answered-`no` question on an `invented` row) stays as a legacy reader, and `ledger counts`' `question · note · unlinked` provenance line stays. (AC-20260913-07-25) | `ledger derive` retires any active exclusion row whose source no longer derives, so deleting source (b) would retire rows a client already decided on the real host. Reading a stored answer is not producing a question. |
| D10 | **The composer's reason chips are retired; the badge still renders.** The `Missing screen / Wrong direction / Wrong words / Other` chip row goes from `review-page.js`'s `renderComposer`, `notes-layer.browser.js`'s `buildComposer` and `openDraftCard` (`onSave` drops its `reason` argument), `review.browser.js`'s `send()` stops posting `reason` and its chip wiring goes, and the `.nl-chips`/`.nl-chip`/`.nl-chip-on`/`.rv-chips`/`.rv-chipbtn`/`.rv-chip-on` rules (with the `:not(.rv-chip-on)` clauses on the `.rv button:hover` selectors) go from `viewer.css` and `design/chrome-mocks/review.html`. The freed height goes to the textarea: `rows="5"`, `min-height: 104px` on `.rv-composer textarea` and `.nl-card textarea`. `REASON_LABELS`, `PLAIN_REASONS` (legacy-accept) and the `.rv-chip` badge keep rendering `n.reason` on an existing note. (AC-20260913-07-17, AC-20260913-07-18) | A plain note's reason was stored and rendered and nothing downstream ever read it. The note's own words carry the why. |
| D11 | **One amendment ADR records both retirements.** `docs/adr/0023-the-critic-is-out.md` (CREATE) applies to `specs/20260907/08-walk-critic.md` (superseded whole), `specs/20260906/06-sketch-high-fidelity-and-critique.md` D3/D5, `docs/adr/0010-kit-walk-and-client-review.md`'s WALK clause, `specs/20260906/03-questions-on-the-wireframe.md` (superseded whole — its D5 locked the question row and the chip row together), `specs/20260906/04-journey-review-page.md` D5's question-inspector and progress clauses, `specs/20260912/06-the-review-page-answers-to-a-design.md`'s question-row rendering, and `docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md`'s refusal wording, which loses its `question or` clause. (AC-20260913-07-23) | Seven documents ratified these two producers; a reader of any one must find the retirement from it. |
| D12 | **The test harness skips the retired surfaces.** `advanceToJourneyWalked` is deleted from `tests/mocks/mocks-driver-fixtures.js` and `advanceToThemePicked` calls `advanceToJourneyApproved` directly; the dead import in `tests/mocks/wire-register.test.js` goes; `tests/design-atlas.test.js` loses its unreferenced `writeQuestionLedger`/`baseQuestion` helpers and their section comment; `tests/mocks/walk-page.test.js` loses the `AC-20260911-01-8` test and its `openQuestions` helper (a predecessor pin whose whole subject — a mark's yes button — this spec deletes). `[no-ac: test-harness plumbing; every AC below runs through the repaired chain]` | The fixture helper runs the real `--mark journey-walked` binary, so it is the one place the deletion reddens tests that are otherwise about theme and exclusions. A pin whose subject is gone is retired, never weakened. |
| D13 | **`noteLine`'s walk and critic tags go.** The `[walk: <reason>]` and `[critic: <reason>]` segments leave the driver's per-note line; id, status tag, author and text are unchanged. `[no-ac: unreachable once D8 hides every walk-kind note; AC-20260913-07-22 sweeps the literals]` | Two branches that can never be taken on the line the sweep prints most. |
| D14 | **The tracked atlas index is regenerated, not hand-edited.** `design/atlas/index.html` inlines `viewer.css`; after the stylesheet edit it is rewritten by `node spec/scripts/design-atlas.js build --root .` (byte-deterministic — verified A5) so it stops carrying the deleted rules. (AC-20260913-07-22) | The file is a build product; a hand edit drifts on the next build. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1: `deriveState`'s WALK disjunct, `allJourneysWalked`, `walkedCount`, `printWalkStep`, the WALK dispatch arm, `ensureJourneyRecord`'s `walked` seed, `--reopen shapes`' `walked`/`walk(all)` lines, the `client open` wording. D2: the `journey-walked` arm, `handleJourneyWalked`, `openWalkFindingsFor`, the mark enumeration. D3: the `walk:` reopen branch and refusal text; the `walked`/`walk:<j>` lines in `journey:` (the `unconfirmJourney` call stays). D5: `notes add`'s `--kind`/`--ledger-id` refusal; `ledger add --screen` refusal; `ledger ask`, `refuseUnaskable`, the subcommand enumeration. D6: `questionLines`, `journeyQuestionCounts`, `notes waive`'s question branch and `setStatus` writeback. D7: `requireNotesResolved` collapses to one refusal. D8: `notes open` filters through `authoredByPerson`. D13: `noteLine`'s two tags. Header comment and every WALK/critic/question comment brought current |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D5: `addNote`'s `isQuestion`/`isWalk` branches, `LEDGER_ID_RE`, `WALK_REASONS` and export, `REASONS = PLAIN_REASONS`, `validateNotes` legacy-accept. D6: `answerQuestion` and export, `waiveNote`'s question branch, `resolveNote`'s reworded refusal. D7: `unresolvedFor`'s `answer == null` branch. D8: `authoredByPerson` added and exported, applied in `groupOpen` and `unresolvedFor`; `KINDS`/`ORIGINS` comments |
| spec/scripts/design-atlas.js | MODIFY | scripts | D6: `POST /__notes/answer` deleted; `GET /__notes/list`'s `readLedgerRows`/`joinQuestions` join deleted; the `/__notes/resolve` question pre-check deleted. D7: `POST /client/__walk/confirm`'s unanswered-guess 409. D8: `GET /__notes/list` filters through `authoredByPerson` on both mounts; the atlas card count's `kind === 'question'` skip becomes the predicate. The `/__notes/add` kind/ledgerId body refusal stays |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D6: `joinQuestions` and export, `renderQuestionRow`, `isQuestion`, `rowOpen`'s `rv-q` class, the header progress bar, `aria-label` and empty-state copy. D8: items filter through `authoredByPerson`. D10: `renderComposer` loses the chip row, textarea `rows="5"`; `REASON_LABELS` and the `.rv-chip` badge stay |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D6: `answer`, the `yes`/`no`/`later` wiring, the `y`/`n` keys, `recount`'s progress arithmetic. D10: `send()` stops posting `reason`; the chip click wiring and `reason` variable go |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D6: `questionRow` and its call sites; `isOpenNote`'s question branch. D8: the row filters inline the two-clause predicate. D10: the chip rows in `buildComposer` and `openDraftCard`; `onSave` drops `reason`; `api('add', …)` bodies stop carrying `reason` |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D6: `isOpenQuestion`, `claimOf`, `renderMark`, the marks/left block, `data-guesses`, the `leftNone`/`leftOne`/`leftMany` strings. D8: both note collectors filter through `authoredByPerson` |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D6: the marks block (`leftCount`, `updateLeft`, `answered`, the yes/no handlers, the `/client/__notes/answer` post); `refreshNavDisabled` keys on open requests alone |
| spec/scripts/lib/mocks-exclusions.js | MODIFY | scripts | D8: `withdrawnNotNeededEntries`' `kind === 'question' \|\| kind === 'walk'` skip becomes `authoredByPerson`. D9: `invalidatedAnswerEntries` stays, its comment marked legacy-reader |
| spec/agents/design-critic.md | DELETE | doctrine | D4: the critic agent |
| spec/commands/mocks.md | MODIFY | doctrine | D4: the `## Walk (WALK state)` section, the THEME opener, the Rules line. D5: step 2's "pin every inferred product assumption (`ledger add … --screen`, or `ledger ask` …)" sentence |
| spec/commands/sketch.md | MODIFY | doctrine | D4: step 7 loses the `design-critic` dispatch and the `notes add --kind walk` recording sentence; keeps `check --states`, `render-gate --mocks` and its position |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1-D9: § Provenance Ledger's `step` example list drops `WALK`; § Mocks: State Machine's chain, the WALK paragraph, the `journey-walked` sentence, the reopen paragraph's `walked`/`walk:<j>` clauses, the "WIREFRAMES, WALK, THEME" serve sentence; § Mocks: Page Notes' `**Questions.**` and `**Walk findings.**` paragraphs, the question clauses in the project-notes and read-back paragraphs, the "question-back reply" and `ledger ask` mentions, the "optionally carrying `reason`" clause; the "every client-visible question" clause under CLIENT. The client-walk sentences (§ Mocks: Look and Serve's query token, § Mocks: Client Player) are NOT touched |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D6: `.nl-q*`, `.rv-correct`, `.rv-answered[data-verdict="no"]`, `.rv-progress`/`.rv-progress-text`/`.rv-track`/`.rv-fill` (their media and reduced-motion rules included), `.wk-marks`/`.wk-mark`/`.wk-claim`/`.wk-why`/`.wk-left`. D10: `.nl-chips`/`.nl-chip`/`.nl-chip-on`/`.nl-card .nl-chips`, `.rv-chips`/`.rv-chipbtn`/`.rv-chip-on` and the `:not(.rv-chip-on)` hover clauses; `.rv-composer textarea` and `.nl-card textarea` `min-height: 104px`. `.rv-claim`, `.rv-answered` and `.rv-chip` stay — the note row uses all three |
| design/chrome-mocks/review.html | MODIFY | other | D6/D10: the progress-bar markup and rules, the composer chip row and rules, textarea `rows="5"`/`min-height:104px`; `.rv-claim` stays (the note body) |
| design/atlas/index.html | MODIFY | other | D14: regenerated by `node spec/scripts/design-atlas.js build --root .` after `viewer.css` lands — never hand-edited |
| docs/adr/0023-the-critic-is-out.md | CREATE | other | D11: the amendment ADR — `Status: accepted`, `## Dissents`, `## Applies to` naming the seven documents |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D12: `advanceToJourneyWalked` deleted, `advanceToThemePicked` chains from `advanceToJourneyApproved`; WALK comments brought current |
| tests/mocks/wire-register.test.js | MODIFY | tests | D12: the dead `advanceToJourneyWalked` import |
| tests/design-atlas.test.js | MODIFY | tests | D12: the unreferenced `writeQuestionLedger`/`baseQuestion` helpers and their `specs/20260906/03` section comment deleted |
| tests/mocks/walk-state-retired.test.js | CREATE | tests | AC-20260913-07-1, AC-20260913-07-2, AC-20260913-07-3, AC-20260913-07-4, AC-20260913-07-5, AC-20260913-07-6, AC-20260913-07-7, AC-20260913-07-22, AC-20260913-07-23 |
| tests/mocks/human-authored-notes.test.js | CREATE | tests | AC-20260913-07-8, AC-20260913-07-9, AC-20260913-07-10, AC-20260913-07-12, AC-20260913-07-14, AC-20260913-07-15, AC-20260913-07-17, AC-20260913-07-18, AC-20260913-07-19, AC-20260913-07-20, AC-20260913-07-24 |
| tests/mocks/bounded-output-pins.test.js | MODIFY | tests | AC-20260913-07-11 — the pinned `notes open` shape loses its questions line |
| tests/mocks/walk-page.test.js | MODIFY | tests | AC-20260913-07-21 — the `AC-20260911-01-10` pin rewritten into its successor (the client's pages render no question at all); D12: the `AC-20260911-01-8` test and `openQuestions` deleted; `question()` stays as the legacy fixture AC-21 needs |
| tests/mocks/mocks-driver-notes-gate.test.js | MODIFY | tests | AC-20260913-07-13, AC-20260913-07-26 — the two existing `kind: "note"` gate pins retagged, assertions unchanged |
| tests/mocks/mocks-driver-exclusions.test.js | MODIFY | tests | AC-20260913-07-25 — the existing derive pin retagged, assertions unchanged |
| tests/mocks/client-walk-route.test.js | MODIFY | tests | AC-20260913-07-20 — the existing confirm pin retagged, assertions unchanged (the new 200-over-a-question case lives in human-authored-notes) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

**Orchestrator duty (outside the table).** Per this repo's amendment convention (ADR-0018's own
account: the amended document "gains a single `Amended by:` line and is not otherwise rewritten"),
append one `- Amended by: ADR-0023 — <one line>` header line to each of
`docs/adr/0010-kit-walk-and-client-review.md` (already carries an ADR-0012 line; append, never
replace), `docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md`,
`specs/20260907/08-walk-critic.md`, `specs/20260906/06-sketch-high-fidelity-and-critique.md`,
`specs/20260906/03-questions-on-the-wireframe.md`, `specs/20260906/04-journey-review-page.md`,
`specs/20260912/06-the-review-page-answers-to-a-design.md` and
`docs/roadmap/22a-mocks-is-wireframes.md` (whose file list names the deleted agent). No other text
in those eight files changes. These are the orchestrator's own edits, not a worker's — a worker's
file contract must not reach into a sibling spec's text.

## Contracts

The mocks state machine after this spec (`deriveState`, `spec/scripts/mocks-driver.js`):

```
SEED -> SHAPES -> KIT -> WIREFRAMES -> THEME -> CLIENT -> APPROVED
```

`doMark`'s accepted marks, verbatim, in the order the refusal prints them:

```
seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, theme-picked, approved
```

`doReopen`'s accepted targets and what each prints as `invalidated`:

```
--reopen must be journey:<j>, shapes, kit, or theme
journey:<j>  → approved, approved(all)            (+ walk.json: <j>'s client confirmation taken back)
shapes       → shape, canon, kit, journeys(all), approved(all)
kit          → kit, approved(all)
theme        → theme, approved(all)
```

`lib/mocks-notes.js` after this spec:

```js
// A note a person did not type is one a retired producer stamped with a kind. `kind: "note"`
// and an absent kind are both a person's note. The predicate is the one rule; the note itself
// is never filtered out of readNotes/writeNotes, so no read-modify-write path can erase history.
function authoredByPerson(n) { return n.kind !== 'question' && n.kind !== 'walk' }

const ORIGINS = ['walk', 'client', 'session']   // 'walk' is legacy-accept only; nothing produces it
const KINDS = ['note', 'question', 'walk']      // 'question' and 'walk' are legacy-accept only
const REASONS = PLAIN_REASONS                    // WALK_REASONS retired; no composer authors a reason
```

Exports removed: `answerQuestion`, `WALK_REASONS`. Export added: `authoredByPerson`.

CLI refusals, verbatim:

```
notes add: --kind and --ledger-id are retired — a note is what a person typed
ledger add: --screen is retired — an assumption row is confirmed with ledger set, never pinned to a screen
ledger: unknown subcommand "ask" — one of: add, set, catch, check, counts, derive
unknown mark "journey-walked" — one of: seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, theme-picked, approved
notes waive: only client-origin notes are waivable (note "<id>" is kind "<kind>", origin "<origin>")
unresolved note(s) on <j>: <ids> — the author resolves after a re-look
```

HTTP surface after this spec — `/__notes/*` in full, on both mounts:

```
GET  /__notes/notes.js | anchor.js | viewer.css
GET  /__notes/list?screen=<label>|*|**        # authoredByPerson notes only; the client mount adds origin === 'client'
POST /__notes/add | resolve | region | delete | reopen
```

`POST /__notes/answer` and `POST /client/__notes/answer` are gone; a request to either falls
through to the shared `/__notes/` 404.

## UI

`design/chrome-mocks/review.html` is edited by this spec and stays the binding reference for the
review page (`design_source` of specs/20260912/06).

**Inspector rows.** One row template remains, the note row: `rv-row rv-note`, the `.rv-claim`
body, the `.rv-chip` reason badge when the note carries one, the `.rv-answered` "Addressed: …"
line. The question row template (`rv-row rv-q`, its `I assumed` lead, its `Yes, that's right` /
`No, it's…` / `Later` controls, its `rv-correct` correction box and `data-verdict` line) is deleted
with its CSS. The inspector's `aria-label` is `Notes`; its empty state reads `No open notes on this
journey. Approve it when the screens look right.`

**Header.** Breadcrumb, pill and approve control unchanged. The progress bar
(`rv-progress` → `rv-track` → `rv-fill`) is deleted; nothing replaces it.

**Composer.** A textarea, a `Send` button and the `Mark an area` toggle. No chip row. The textarea
is `rows="5"` / `min-height: 104px` in both the review page's light DOM and the notes layer's
shadow root, so the two composers stay the same size.

**Client pages.** The walk page's guesses card (`wk-marks` / `wk-left`, "N things still to check")
is deleted; the index card loses `data-guesses`. Requests, exclusions and the confirm control are
unchanged.

## Data Model

`design/mocks/notes.json` — no note is rewritten, moved or deleted. A note carrying
`kind: "question"` (with its `ledgerId` and `answer`) or `kind: "walk"` stays on disk exactly as it
is and stops being listed, grouped, counted or gated on. A `kind: "note"` note is a person's note
and is unaffected. Measured by the superseded spec's lock (A1): the one real host holds thirteen
question notes, ten unanswered, zero walk notes, and twenty-one person-written notes.

`design/mocks/ledger.md` — unchanged in shape. Rows the answer route used to stamp
(`confirmed <date>` / `overridden <date>` / `waived <date>`) are now written only by `ledger set`.
Exclusion rows derived from a stored `no` answer (source (b)) keep deriving from the legacy note.

`.claude/mocks.status.json` — `journeys[<j>].walked` stops being written and read; an existing key
is inert.

## Behavior

A session in WIREFRAMES that marks its last journey approved derives THEME directly and the bare
step command prints the THEME step; there is no step block, agent dispatch or `notes add`
instruction between the two. `--mark journey-walked` and `--reopen walk:<j>` become unknown inputs,
refused by the existing enumeration messages with the retired name absent. A redraw still
invalidates the journey's approval, the product sign-off and the client's confirmation on
`walk.json`; it no longer touches a `walked` stamp.

Drawing a journey no longer pins anything. The session writes an assumption row with `ledger add`
as before; `--screen` on it is refused by name. `requireGateOpen` still refuses a sign-off while
the row is neither confirmed nor overridden, naming `ledger set` as it already does.

The review page, the mock page's notes layer, the client's pages and `notes open` render only
notes a person typed. On the real host that is twenty-one rows instead of thirty-four; the
inspector's `Needs you` count and the rail's per-screen counts fall with them. A legacy question
reached by id through `POST /__notes/resolve` is refused by `resolveNote`'s own message.

The client's pages change in two visible ways: the walk page no longer shows a guesses card, and
confirming a journey no longer checks for an unanswered guess. A client still cannot confirm twice,
still cannot confirm with an empty sentence, still cannot confirm over an open request, and still
sees and raises their own notes.

## Acceptance Criteria

- **AC-20260913-07-1**: WHEN every declared journey on a host is marked `journey-approved` THE
  SYSTEM SHALL derive the next state as `THEME` and print the THEME step block (the bare step
  command's output contains `THEME` and contains neither `WALK` as a whole uppercase word nor the
  string `design-critic`) → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-2**: WHEN `--mark journey-walked --journey j1` runs on any host THE SYSTEM SHALL
  exit 2 and print `unknown mark "journey-walked" — one of: seed-done, shape-picked, canon-written,
  kit-signed, journey-drawn, journey-approved, theme-picked, approved`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-3**: WHEN `--reopen walk:j1` runs THE SYSTEM SHALL exit 2 and print `--reopen
  must be journey:<j>, shapes, kit, or theme` → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-4**: WHEN `--reopen journey:j1` runs on a host whose `walk.json` records journey
  `j1` as confirmed by the client THE SYSTEM SHALL CONTINUE TO clear that journey's own approval,
  SHALL CONTINUE TO clear the product `approved` mark, and SHALL CONTINUE TO write `walk.json` with
  `j1`'s client confirmation taken back (`confirmedAt` null after the run)
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-5**: WHEN `--reopen journey:j1` runs THE SYSTEM SHALL print `↩ reopened
  journey:j1 — invalidated: approved, approved(all)`, and WHEN `--reopen shapes` runs THE SYSTEM
  SHALL print `↩ reopened shapes — invalidated: shape, canon, kit, journeys(all), approved(all)` —
  neither line containing `walk` → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-6**: WHEN the repository is walked THE SYSTEM SHALL contain no file at
  `spec/agents/design-critic.md`; `spec/commands/mocks.md` SHALL contain no heading whose text
  contains `Walk (WALK state)`; and `spec/commands/sketch.md` SHALL contain a step whose heading
  contains `Critique`, positioned before the step whose heading contains `Exit`, naming both
  `check --states` and `render-gate`, and naming neither `design-critic` nor `--kind walk`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-7**: WHEN `notes add --scope mock --screen a --state error --kind walk --reason
  dead-end-state --by walk-critic --text "x"` runs on a host whose screen `a` declares an `error`
  state THE SYSTEM SHALL exit 2, print `notes add: --kind and --ledger-id are retired — a note is
  what a person typed`, and SHALL NOT append a note to `design/mocks/notes.json`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-8**: WHEN `ledger add --id A9 --step WIREFRAMES --kind product --claim "the
  owner reviews weekly" --tag inferred --screen home` runs THE SYSTEM SHALL exit 2, print `ledger
  add: --screen is retired — an assumption row is confirmed with ledger set, never pinned to a
  screen`, and SHALL leave `design/mocks/ledger.md` and `design/mocks/notes.json` byte-identical
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-9**: WHEN `ledger ask --id A1 --screen home` runs THE SYSTEM SHALL exit 2 and
  print `ledger: unknown subcommand "ask" — one of: add, set, catch, check, counts, derive`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-10**: WHEN `POST /__notes/answer` or `POST /client/__notes/answer` is requested
  against a served host with a body naming an existing `kind: "question"` note THE SYSTEM SHALL
  respond `404` and SHALL leave `design/mocks/notes.json` byte-identical
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-11**: WHEN `notes open` runs on a store holding one open project note, two open
  mock notes, one addressed mock note and one open `kind: "question"` note THE SYSTEM SHALL print
  `📝 open notes: 4 (1 project · 3 mock) · addressed: 1` as its first line (the addressed note
  counts as not resolved, as today), the `project` block before any journey group, `⚠️ a project
  note is open — answer it (canon change or new directions) before any mock note` as the last line,
  and no line containing `❓` or the question's id anywhere in the output
  → rewrites tests/mocks/bounded-output-pins.test.js :: AC-20260912-14-9:
- **AC-20260913-07-12**: WHEN `--mark journey-approved --journey j1` runs on a host whose only note
  on `j1`'s screens is an unanswered `kind: "question"` note THE SYSTEM SHALL exit 0 with the mark
  accepted, and `design/mocks/notes.json` SHALL be byte-identical after the run
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-13**: WHEN `--mark journey-approved --journey onboarding` runs on a host whose
  screen carries one `kind: "note"` note that is not resolved THE SYSTEM SHALL CONTINUE TO exit 2
  naming that note's id → reuses tests/mocks/mocks-driver-notes-gate.test.js :: AC-20260912-07-6:
- **AC-20260913-07-14**: WHEN `notes open` runs on a store holding one person-written open note and
  one `kind: "question"` note THE SYSTEM SHALL print the person's note and SHALL NOT print the
  question's id or its text, and `design/mocks/notes.json` SHALL still contain both notes,
  byte-identical, after the run → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-15**: WHEN `GET /__notes/list?screen=**` is requested against a served store
  holding one note with no `kind`, one `kind: "note"` note, one `kind: "question"` note and one
  `kind: "walk"` note THE SYSTEM SHALL return a JSON array of exactly the two person-written ids;
  and WHEN `GET /client/__notes/list?screen=<label>` is requested over a client-origin note and a
  `kind: "question"` note on that label THE SYSTEM SHALL return only the client note's id
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-17**: WHEN the review page is rendered THE SYSTEM SHALL emit a composer whose
  textarea carries `rows="5"`, and the markup SHALL contain no occurrence of `rv-chipbtn`,
  `rv-chips` or `rv-chip-on` (`rv-chip`, matched with a boundary that treats `-` as part of the
  word, SHALL still occur when a note carries a `reason`)
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-18**: WHEN `POST /__notes/add` is requested with a body carrying `reason`
  THE SYSTEM SHALL CONTINUE TO store the note with that reason, and the rendered review page SHALL
  CONTINUE TO show its `REASON_LABELS` badge (`{"reason":"wrong-direction"}` → a row containing
  `Wrong direction`) → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-19**: WHEN the review page is rendered for a journey over a store holding one
  plain note and one `kind: "question"` note on its screens THE SYSTEM SHALL emit markup containing
  none of `rv-progress`, `rv-track`, `rv-fill`, `rv-correct`, `rv-q`, `data-kind="question"`, the
  question's id or its text, and whose inspector `aria-label` and empty-state text contain no
  `question`; and `spec/templates/mocks/viewer.css` SHALL declare no rule for any of `rv-progress`,
  `rv-track`, `rv-fill`, `rv-correct`, `rv-chips`, `rv-chipbtn`, `rv-chip-on`, `nl-chips`,
  `nl-chip`, `nl-chip-on`, `nl-q`, `wk-mark`, `wk-claim`, `wk-left`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-20**: WHEN `POST /client/__walk/confirm` is requested for a declared journey
  whose screen carries an unanswered `kind: "question"` note and no open request THE SYSTEM SHALL
  respond `200` with the journey confirmed → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-21**: WHEN the client index and a client walk page are built over a store
  holding one client-written note and one `kind: "question"` note anchored to the same journey
  THE SYSTEM SHALL render the client's note text and SHALL render none of the question's id, its
  text, `data-guesses`, `data-wk="mark"`, `data-wk="left"` or `wk-claim` on either page
  → rewrites tests/mocks/walk-page.test.js :: AC-20260911-01-10:
- **AC-20260913-07-22**: WHEN every tracked file under `spec/`, `tests/`, `scripts/` and `design/`
  except the test file performing this sweep is searched THE SYSTEM SHALL yield zero occurrences of
  each of `journey-walked`, `WALK_REASONS`, `openWalkFindingsFor`, `allJourneysWalked`,
  `walkedCount`, `printWalkStep`, `design-critic`, `walk-critic`, `walk(all)`, `answerQuestion`,
  `joinQuestions`, `renderQuestionRow`, `questionRow`, `questionLines`, `journeyQuestionCounts`,
  `refuseUnaskable`, `LEDGER_ID_RE`, `__notes/answer`, `isOpenQuestion`, `claimOf`, `renderMark`,
  `data-guesses`, `rv-progress`, `rv-track`, `rv-fill`, `rv-correct`, `rv-chips`, `rv-chipbtn`,
  `rv-chip-on`, `nl-chips`, `nl-chip`, `nl-chip-on`, `wk-mark`, `wk-claim`, `wk-left`, and of the
  uppercase word `WALK` — each matched with a boundary that treats `-` as part of the word
  (`/(?<![\w-])<literal>(?![\w-])/`, so `walk.json`, `walkLib`, `/client/walk/`,
  `advanceToJourneyWalked`, `.rv-chip`, `.nl-chip-on` beside `nl-chip`, and `WALK_REASONS` beside
  `WALK` are each judged on their own) → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-23**: WHEN `docs/adr/0023-the-critic-is-out.md` is read THE SYSTEM SHALL parse
  with `Status: accepted`, a non-empty `## Dissents` section, and an `## Applies to` section naming
  each of `specs/20260907/08-walk-critic.md`,
  `specs/20260906/06-sketch-high-fidelity-and-critique.md`,
  `docs/adr/0010-kit-walk-and-client-review.md`, `specs/20260906/03-questions-on-the-wireframe.md`,
  `specs/20260906/04-journey-review-page.md`,
  `specs/20260912/06-the-review-page-answers-to-a-design.md` and
  `docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-07-24**: WHEN `notes waive --id N1 --reason "silent"` runs on a host whose note
  `N1` is `kind: "question"` and whose client was opened eight days ago THE SYSTEM SHALL exit 2,
  print `notes waive: only client-origin notes are waivable`, and SHALL leave
  `design/mocks/notes.json` and `design/mocks/ledger.md` byte-identical
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-07-25**: WHEN `ledger derive` runs over two brief non-goals, one answered-`no`
  `kind: "question"` note on an `invented` row, one on an `inferred` row, one `kind: "note"`
  client withdrawal tagged `not-needed` and one tagged `mistake` THE SYSTEM SHALL CONTINUE TO
  derive `4 total · 4 new · 0 retired` and SHALL CONTINUE TO stay byte-idempotent on a second run
  → reuses tests/mocks/mocks-driver-exclusions.test.js :: AC-20260911-05-7:
- **AC-20260913-07-26**: WHEN `--mark approved` runs on a host carrying one open `kind: "note"`
  project note THE SYSTEM SHALL CONTINUE TO exit 2 with the project-note-open message, printed
  before any unresolved screen-scoped note it would also find
  → reuses tests/mocks/mocks-driver-notes-gate.test.js :: AC-20260912-07-4:

## Assumptions (escalation triggers)

- A1: **The one real host's question notes are exactly the session's and no person-written note
  carries a `kind` other than `"note"`.** Inherited from the superseded specs' locks of 2026-09-13
  (`/Users/jj/Projects/hearwell/design/mocks/notes.json`: 34 notes, `kind` grouped
  `{"question":13,"(absent)":21}`, author grouped `{"session":13,"anonymous":21}`, zero
  `kind:"walk"` / `origin:"walk"`); that path is not reachable from this machine, so it is not
  re-measured here. — **if false:** a person's note carrying some third `kind` would be hidden; the
  predicate is already the two-clause exclusion, so record the sighting and keep building.
- A2: **`requireGateOpen` has a live human path to close an assumption row without the answer
  route.** Read 2026-09-13: its refusal names `ledger set --id <id> --status confirmed --tag
  said-by-user`, and `ledger set` calls `mocks-ledger.js`'s `setStatus` directly. — **if false:**
  deleting the answer route would leave every assumption row blocking; STOP, ask the user.
- A3: **The driver never refuses an unknown flag.** Executed 2026-09-13: `grep -n "unknown flag"
  spec/scripts/mocks-driver.js` → no hits; `flagArg` (line 266) is a positional `indexOf` lookup.
  This is why D5 keeps an explicit refusal for `--kind`/`--ledger-id` and adds one for
  `--screen` instead of "deleting the flag". — **if false:** a generic refusal exists; keep D5's
  wording as the specific one and cite the generic in Rationale.
- A4: **The boundary regex AC-22 prescribes separates every hyphen-adjacent neighbour.**
  Executed 2026-09-13 (Node, scratch): twelve cases — `walk-critic` matches `--by walk-critic`
  and not `walk.json walkLib /client/walk/`; `journey-walked` not `advanceToJourneyWalked`;
  `nl-chip` matches `class="nl-btn nl-chip nl-chip-on"` and not `.nl-chip-on{`; `rv-chip` not
  `rv-chipbtn rv-chips` but yes `<span class="rv-chip"`; `WALK` matches `return "WALK"` and not
  `WALK_REASONS walkLib`; `__notes/answer` and `walk(all)` match their live spellings — all
  twelve as expected. — **if false:** fix the AC's boundary, never the code.
- A5: **`design-atlas.js build` regenerates `design/atlas/index.html` byte-deterministically.**
  Executed 2026-09-13: two consecutive `build --root . --out <scratch>` runs are `cmp`-identical;
  the tracked file differs from a fresh build by 117 lines, all inside the inlined stylesheet
  (the tracked copy predates the 02 revert). — **if false:** the row becomes a hand edit of the
  inlined CSS block only; record the deviation.
- A6: **No test pins the CSS rules or client-page markup this spec deletes except the ones in the
  File Plan.** Executed 2026-09-13: `git grep` over `tests/` for `rv-chip`, `nl-chip`,
  `rv-progress`, `rv-answered`, `wk-mark`, `wk-claim`, `data-wk="left"`, `data-guesses`,
  `__notes/answer`, `ledger ask`, `journey-walked`, `walk(all)`, `unanswered question`,
  `Every question`, `Questions and notes`, `--reopen must be`, `unknown mark`, `are waivable` hits
  only `tests/mocks/walk-page.test.js` (AC-20260911-01-8/-10), `tests/mocks/client-walk-route.test.js`
  (title prose only), `tests/mocks/bounded-output-pins.test.js`, `tests/mocks/mocks-driver-fixtures.js`
  and `tests/design-atlas.test.js` — every one a File Plan row. — **if false:** the hit's file
  enters the File Plan as a fix row in the same batch; a pin whose subject is gone is retired,
  never weakened.
- A7: **`0023` is the next free ADR number.** Executed 2026-09-13: `ls docs/adr/` tops out at
  `0022-a-mock-may-not-invent.md`. — **if false:** take the next free number and amend D11, the
  File Plan row, AC-23 and every `Amended by` backlink in the same build.
- A8: **`tests/mocks/walk-page.test.js`'s `AC-20260911-01-8` and `AC-20260911-01-10` are
  predecessor CONTINUE-TO pins whose whole subject this spec deletes** (a mark's yes button; a
  waived question's exclusion from `data-guesses`). Read 2026-09-13 at lines 463–482 and 485–508.
  — **if false:** a clause covers something besides questions; split it into its own CONTINUE-TO
  AC on the same file rather than keeping a false one.

## Rationale

This spec is the union of two hardened siblings (specs/20260913/03 and 04, now superseded) that
edited the same six files and told one story: the annotation queue is for a person to point at
what they do not like, so nothing but a person may write into it. The critic walk was the more
defensible producer — a fresh reader with no memory of authoring is a real substitute for user
testing — and it goes anyway, because the owner's rule is about authorship, not quality. The
ledger question was never a bad idea either; it goes because of where it put the result. Neither
loop is replaced here: under specs/20260913/05 the AI's voice in this system is a reply on a note a
person started. Merging them costs a File Plan of twenty-eight rows against the ≤15 guideline;
the user chose the merge with that trade named, and the work is one landing unit — every row is
a deletion or a predicate swap, and splitting by producer would have each half re-touching the
same driver, store, doctrine and stylesheet.

Four corrections to the superseded specs are load-bearing. (1) `authoredByPerson` is the
two-clause exclusion, not `kind == null`: `kind: "note"` is a valid value the store's own header
documents and nine test fixtures spell, and `kind == null` would have hidden every such note and
let `--mark journey-approved` pass over it — a silent wrong result. AC-13, AC-25 and AC-26 are
the pins that stand guard. (2) The driver never refuses an unknown flag (A3), so "delete the
`--kind` flag" would have silently filed a `--kind walk` invocation as a plain note; both retired
flags keep a refusal by name. (3) `rv-claim` and `rv-answered` are the note row's own body and
"Addressed:" line, so they stay; `rv-q` had no CSS rule to delete. (4) `ledger derive` retires an
active exclusion row whose source stops deriving, so deleting source (b) would have retired rows
a client already decided — the legacy reader stays (D9).

D3 is the one place to be careful: two unrelated features spelled `walk` meet in one handler,
and deleting the wrong line lets a client's approval survive a redraw with no error. AC-4 asserts
on `walk.json`'s contents. Everything under `lib/mocks-walk.js`, `walk-mode.browser.js`,
`walk.json`, `/client/walk/<j>.html` and `/__walk/*` is the client player and stays; the only
edits to `walk-page.js` and `walk.browser.js` are the guesses card and its yes/no posts, which
dispatched into the very handler D6 deletes.

D8 hides rather than migrates. Deleting thirteen notes out of a host's store is a destructive act
the owner did not ask for; rewriting them into plain notes would put thirteen rows the owner
never wrote back on the page. The predicate deliberately does not live inside `readNotes` —
every writer reads the whole array and writes it back, so a filter there would erase the hidden
notes on the next unrelated write. Adjacent and not touched: the notes layer's own delete guard
(`canDelete` keys on `n.kind == null`, so a `kind: "note"` note cannot be deleted from the card) —
a 05 concern, recorded there.

Adversarial checks, rejected: keeping WALK as a no-op state (prints a step nobody can act on;
the chain is derived fresh on every run, so a host mid-WALK simply derives THEME next); migrating
question notes into the thread as the AI's first message (a question is a reply to nothing, so it
would have to become a new note — the producer being deleted); pointing the retired flags at a
generic unknown-flag refusal (none exists, A3).

Collision closure at lock (nineteen retired literals over the paths and literals legs): every hit on a
live surface (`spec/`, `tests/`, `design/`) is a File Plan row; the 61 unplanned hits the sweep
printed are all under `.claude/worktrees/` (a stale worktree copy of the tree), `docs/` (the
canonical doc the Delta corrects, and ADR-0013's historical mention of `ledger ask`) or `specs/`
(the superseded and amended records) and are waived as a class — none is executable or tested.
The two `likely` hits (`tests/consistency/genesis-doctrine.test.js` on `mocks.md` and
`plugin.json`) owe nothing.

The zero-hit sweep (AC-22) covers `spec/`, `tests/`, `scripts/` and `design/` — the executable and
test surface this File Plan owns — and excludes only the file that performs it. `docs/canonical/design.md`
carries the retired names today and is corrected by the Canonical Delta at close; sweeping it at
build time would redden the gate against text the build may not write.

Build departures (folded from the deviations sidecar at close, 2026-09-14). (1) The File Plan row
retagging the client confirm pin in `tests/mocks/client-walk-route.test.js` as AC-20 was wrong:
AC-20 is a new promise owned by `human-authored-notes.test.js`, and its id on an unchanged green
pin tripped red-check's unsanctioned-green; the pin keeps its predecessor id only. (2) The
`reuses`/`rewrites` references resolve by test-title prefix, so the retagged titles lead with the
predecessor prefix and name the new id after it. (3) The retired predecessor pin
AC-20260911-01-8 was first kept "cited" by a comment in `walk-page.test.js`; review iteration 1
replaced that with a `[retired:]` tag on its bullet in specs/20260911/01. (4) Assertions on the
absence of AC-22's banned literals build them from fragments so the sweep never matches its own
checks. (5) AC-2's red was set up over a host at `journey-approved` so the pre-image failure is
the mark still working, not a missing journey. (6) Dead code left by D6's deletions went in the
same edit: `nextClientLedgerId` and the `setStatus`/`appendAssumption` imports in
`design-atlas.js`; `renderNavButton`'s `openCount` parameter, `STRINGS.yes/no/why` and `count()`
in `walk-page.js` — the confirm button's disabled rule is now the request state alone, matching
D7 server-side. (7) Review iteration 1 also added D5's missing half: `validateNotes` skips the
answer shape check on a legacy note, pinned by a D5 test. The eight ADR-0023 backlinks follow
each file's own `Amended by:` convention rather than the literal template in the File Plan.

## Canonical Delta

`docs/canonical/design.md`:

1. In the `/spec:mocks` paragraph, the chain reads `SEED → SHAPES → KIT → WIREFRAMES → THEME →
   CLIENT → APPROVED`; `--reopen` takes `journey:<j>|shapes|kit|theme`. Replace the sentences from
   "WALK sits between WIREFRAMES and THEME" through "nobody walked." with: "There is no critic pass
   between wireframes and theme: the design-review queue carries only what a person wrote. The
   marks the driver accepts are `seed-done`, `shape-picked`, `canon-written`, `kit-signed`,
   `journey-drawn`, `journey-approved`, `theme-picked` and `approved`; a redrawn journey still
   clears that journey's approval, the product sign-off, and the client's own confirmation of it
   on `walk.json`." In the following sentence, THEME "sits between WIREFRAMES and CLIENT".
2. In the journey look surface paragraph: "screens rail · artboards with state tabs · note
   inspector with `J K Esc \`"; the gate sentence reads "a journey's approval is blocked by open
   notes **on that journey's screens**".
3. In the notes paragraph: origins are `client|session`, "set by the route it arrived on
   (`/client/__notes/*` stamps `client`, `/__notes/*` stamps `session`)"; "`notes waive --id
   --reason` releases a client note after seven days of client silence."; the summarised read-back
   sentence loses "answered questions collapse to a count and" and "The questions block,".
4. Delete the `**Questions (specs/20260906/03).**` paragraph in full and add in its place:
   "**Only a person writes a note.** Every note in the store was typed by a person. Nothing in the
   pipeline creates one; a note carrying `kind: "question"` or `kind: "walk"` is a record left by a
   retired producer and is never listed, grouped, counted or gated on, though it stays on disk and
   a stored `no` answer still derives its exclusion row. A free-form note carries no reason the
   composer authored — an older note's `reason` still renders as a badge. The writer list is
   `readNotes`, `validateNotes`, `writeNotes`, `addNote`, `authoredByPerson`, `resolveNote`,
   `addressNote`, `replyNote`, `reopenNote`, `groupOpen`, `unresolvedFor`, `waiveNote`,
   `replaceRegion`, `deleteNote`; the routes are `GET /__notes/notes.js|anchor.js|viewer.css|list`
   and `POST /__notes/add|resolve|region|delete|reopen`."
5. In the client-player paragraph, delete the clause from "and `POST /client/__walk/confirm`
   independently refuses with `409`" through "over an open question."
6. In the `/spec:sketch` paragraph, the critique step is "the states-presence check and the
   render gate, every round" with the `design-critic` dispatch sentence deleted.
