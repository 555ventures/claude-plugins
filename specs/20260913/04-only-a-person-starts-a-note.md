---
date: 2026-09-13
status: hardened
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260913/03-the-critic-stops-filing-notes.md]
depended_on_by: [specs/20260913/05-a-note-is-a-conversation.md]
brief: n/a
open_markers: 0
---

# Only a person starts a note

## Goal

The second and last producer that writes into the annotation queue with no person involved is
the ledger question: while drawing a journey the session pins each inferred product assumption
to a screen as a `kind: "question"` note, and the owner opens their review page to find rows
they never wrote, with the journey blocked until each is answered. This spec deletes that
producer end to end — the two CLI verbs that create one, the answer route and its ledger
writeback, every surface that renders a question row, and every gate that counts one — and
hides the ones an existing store already holds. It retires the composer's reason chips in the
same stroke, the other half of the same locked Decision: a note is what the person wrote, not a
value the system offered them first. Done means every note in the queue was typed by a person,
and the only writer of an assumption row's status is the human-run `ledger set`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Nothing creates a question.** `ledger add`'s `--screen` flag and the whole `ledger ask` subcommand are deleted, along with `refuseUnaskable`. `ledger add` without `--screen` is unchanged and still appends an assumption row. `addNote`'s `isQuestion` branch, the `ledgerId` field and its `LEDGER_ID_RE` validation go with them. (AC-20260913-04-1, AC-20260913-04-2) | These two verbs are the only callers that ever passed `kind: "question"`; both the driver's `notes add` and the server's `POST /__notes/add` already refuse the kind outright, so deleting them closes the surface completely. |
| D2 | **The answer flow is deleted.** `POST /__notes/answer`, `answerQuestion`, `waiveNote`'s question branch and its ledger writeback, `GET /__notes/list`'s ledger join, `joinQuestions`, `renderQuestionRow`, `isQuestion`, the notes layer's `questionRow`, the driver's `questionLines` and `journeyQuestionCounts`, the client pages' `isOpenQuestion`, `questionClaim` and open-guess count in `lib/walk-page.js`, `lib/mocks-exclusions.js`'s `invalidatedAnswerEntries` (derivation source (b), an answered-`no` question on an `invented` row), and the review page's answered/total progress bar (`rv-progress`, `rv-track`, `rv-fill`) are all deleted, with their CSS. `notes waive` survives for a client note's seven-day silence. (AC-20260913-04-3, AC-20260913-04-4, AC-20260913-04-11) | Every one of these exists only to render or close a question. The progress bar measures answered-over-asked and has no other meaning once nothing asks. |
| D3 | **No gate counts a question.** `unresolvedFor` drops its `n.answer == null` branch and judges every note by `status !== 'resolved'`. `requireNotesResolved` stops splitting its refusal into a question half and a note half and prints one message. `POST /client/__walk/confirm`'s unanswered-question `409` refusal is deleted; its already-confirmed `409` and empty-sentence `400` are untouched. (AC-20260913-04-5, AC-20260913-04-6, AC-20260913-04-12) | A refusal that can never fire is a branch a reader has to reason about forever. The ledger gate is a separate mechanism and is NOT touched: `requireGateOpen` still blocks on a row that is neither confirmed nor overridden, and `ledger set --id <id> --status confirmed --tag said-by-user` — the remedy that refusal already names — remains its one writer. |
| D4 | **A note a person did not type is never shown or counted.** `lib/mocks-notes.js` gains one exported predicate, `authoredByPerson(n)`, true when `n.kind == null`. Its six call sites are `groupOpen`, `unresolvedFor`, `GET /__notes/list`, the driver's open-notes counts line, and `lib/walk-page.js`'s two note collectors — which build the client's own pages from `readNotes` directly, never through the list route, so the predicate must reach them or the client keeps seeing the session's guesses. The note stays on disk, byte-unchanged — nothing filters inside `readNotes` or `writeNotes`, so no read-modify-write path can drop it. (AC-20260913-04-7, AC-20260913-04-8, AC-20260913-04-14) | Measured (A1): the one real host holds 13 of these. They must vanish from the owner's page and the AI's sweep, and they must not be deleted by a tool the owner did not point at them. Rejected: filtering in `readNotes` — every writer reads first, so the next write would erase them silently. |
| D5 | **The composer's reason chips are retired; the badge still renders.** The `Missing screen / Wrong direction / Wrong words / Other` chip row is deleted from both composers (`review-page.js`'s `renderComposer`, `notes-layer.browser.js`'s `buildComposer` and `openDraftCard`), the `reason` field stops being posted by `review.browser.js`'s `send()`, and the `.nl-chips`/`.nl-chip`/`.nl-chip-on`/`.rv-chips`/`.rv-chipbtn`/`.rv-chip-on` register is deleted from `viewer.css` and from `design/chrome-mocks/review.html`. The freed height goes to the textarea (`rows="5"`, `min-height: 104px`). `REASON_LABELS` and the `.rv-chip` badge keep rendering `n.reason` on an existing note, and `PLAIN_REASONS` stays a legacy-accept value set. (AC-20260913-04-9, AC-20260913-04-10) | A plain note's reason was written, stored and rendered and nothing downstream ever read it — no filter, no grouping, no routing (Rationale). The note's own words carry the why. This change is already authored in the working tree and saved at `~/.claude/spec-wip/claude-plugins-reason-chips-part1.patch`; specs/20260913/02 D14 reverts the tree before its build, so it is re-authored here from this Decision. |
| D6 | **One amendment ADR records both retirements.** `docs/adr/0024-only-a-person-starts-a-note.md` (CREATE) applies to `specs/20260906/03-questions-on-the-wireframe.md` (superseded whole — D5 locked the question row AND the chip row in one Decision, which is why they retire together), `specs/20260906/04-journey-review-page.md` D5's question-inspector and progress clauses, `specs/20260912/06-the-review-page-answers-to-a-design.md`'s question-row rendering, and `docs/adr/0019`'s refusal wording, which loses its `question or` clause. (AC-20260913-04-13) | Producer 1 has no founding ADR of its own — its authority is a spec doc cited pervasively in code comments — so the amendment must name the spec directly or a reader of it never learns the promise was withdrawn. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1: `ledger add --screen`, `ledger ask`, `refuseUnaskable`. D2: `questionLines`, `journeyQuestionCounts`, `notes waive`'s question branch and its `setStatus` writeback. D3: `requireNotesResolved`'s question/plain split collapses to one refusal. D4: the open-notes counts line filters through `authoredByPerson` |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D1: `addNote`'s `isQuestion` branch, `ledgerId`, `LEDGER_ID_RE`. D2: `answerQuestion` and its export, `waiveNote`'s question branch. D3: `unresolvedFor`'s `answer == null` branch. D4: `authoredByPerson` added and exported, applied in `groupOpen` and `unresolvedFor`; `KINDS` keeps `'question'` as legacy-accept with a comment |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2: `POST /__notes/answer` deleted; `GET /__notes/list`'s `readLedgerRows`/`joinQuestions` join deleted. D3: `POST /client/__walk/confirm`'s unanswered-question 409. D4: `GET /__notes/list` filters through `authoredByPerson`. The `/__notes/add` kind refusal, the `/__notes/resolve` question refusal and the atlas card badge's `kind === 'question'` exclusion are deleted as unreachable |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D2: `renderQuestionRow`, `isQuestion`, `joinQuestions` and the header's answered/total progress bar deleted. D5: `renderComposer` loses the chip row and the textarea takes `rows="5"`; `REASON_LABELS` and the `.rv-chip` badge stay |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D2: the question-row controls (`yes`/`no`/`later`) and `recount`'s progress recomputation deleted. D5: `send()` stops posting `reason` and the chip click wiring is deleted |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D2: `questionRow` and its call sites deleted. D5: the chip rows in `buildComposer` and `openDraftCard`; `onSave` drops its reason argument |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D2: the question-row and progress-bar rules (`.rv-q`, `.rv-claim`, `.rv-answered`, `.rv-correct`, `.rv-progress`, `.rv-track`, `.rv-fill`, the notes layer's question chrome). D5: `.nl-chips`, `.nl-chip`, `.nl-chip-on`, `.rv-chips`, `.rv-chipbtn`, `.rv-chip-on` deleted; `.nl-card textarea` and `.rv-composer textarea` take `min-height: 104px` |
| design/chrome-mocks/review.html | MODIFY | doctrine | D2/D5: the question-row and progress-bar markup and the composer's chip row deleted from the binding design source, textarea `rows="5"` / `min-height:104px`; `design_source` for this spec's UI section |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1-D5: the `**Questions.**` paragraph deleted; the gate sentence loses its question clause; the free-form-note reason sentence deleted |
| spec/commands/mocks.md | MODIFY | doctrine | D1: the "pin every inferred product assumption" instruction under drawing, and the `notes reply for a question back` line |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D2: `isOpenQuestion`, `questionClaim` and the open-guess count deleted. D4: both note collectors filter through `authoredByPerson`, replacing their `kind !== 'question'` tests — this file builds the client's pages straight from `readNotes`, never through the list route |
| spec/scripts/lib/mocks-exclusions.js | MODIFY | scripts | D2: `invalidatedAnswerEntries` (derivation source (b) — an answered-`no` question on an `invented` row) deleted with its doc comment. D4: the `kind === 'question' \|\| kind === 'walk'` skip becomes `authoredByPerson` |
| docs/adr/0024-only-a-person-starts-a-note.md | CREATE | doctrine | D6: the amendment ADR |
| tests/mocks/human-authored-notes.test.js | CREATE | tests | AC-20260913-04-1, AC-20260913-04-2, AC-20260913-04-3, AC-20260913-04-5, AC-20260913-04-7, AC-20260913-04-8, AC-20260913-04-9, AC-20260913-04-10, AC-20260913-04-11, AC-20260913-04-13 |
| tests/mocks/bounded-output-pins.test.js | MODIFY | tests | AC-20260913-04-4 — the pinned `notes open` shape loses its questions line |
| tests/mocks/mocks-driver-exclusions.test.js | MODIFY | tests | AC-20260913-04-6 — the derivation fixture's two `kind:'question'` notes become the plain client notes the derivation actually reads |
| tests/mocks/client-walk-route.test.js | MODIFY | tests | AC-20260913-04-12 — the confirm route's refusal set, minus the question clause |
| tests/mocks/walk-page.test.js | MODIFY | tests | AC-20260913-04-14 — the predecessor CONTINUE-TO pin whose whole subject is a question note (`AC-20260911-01-10`) is replaced by its true successor: the client's pages render no question at all. The file's other tests are untouched |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

**Orchestrator duty (outside the table).** Per this repo's amendment convention (ADR-0018's own
account: the amended document "gains a single `Amended by:` line and is not otherwise
rewritten"), append one `- Amended by: ADR-0024 — <one line>` header line to each of
`docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md`,
`specs/20260906/03-questions-on-the-wireframe.md`,
`specs/20260906/04-journey-review-page.md` and
`specs/20260912/06-the-review-page-answers-to-a-design.md`. No other text in those four files
changes.

## Contracts

`lib/mocks-notes.js` after this spec:

```js
// A note the system wrote is one no person typed: `kind` was only ever set by a producer.
// The predicate is the one rule; the note itself is never filtered out of readNotes/writeNotes,
// so no read-modify-write path can erase a store's history.
function authoredByPerson(n) { return n.kind == null }

const KINDS = ['note', 'question', 'walk']   // 'question' and 'walk' are legacy-accept only
const PLAIN_REASONS = [...]                  // legacy-accept only; no composer authors one
```

Exports removed: `answerQuestion`. Export added: `authoredByPerson`.

HTTP surface after this spec — `/__notes/*` in full:

```
GET  /__notes/notes.js | anchor.js | viewer.css
GET  /__notes/list?screen=<label>|*|**
POST /__notes/add | resolve | region | delete | reopen
```

`POST /__notes/answer` is gone; a request to it falls through to the shared `/__notes/` 404.

CLI surface after this spec:

```
ledger add --text <t> [--tag <tag>]        # --screen deleted
ledger set --id <id> --status <s> [--tag]  # unchanged — the one writer of a row's status
ledger derive | counts                      # unchanged
notes add | address | reply | waive | open  # `notes ask` never existed; `ledger ask` deleted
```

## UI

`design_source: design/chrome-mocks/review.html` (approved 2026-09-13) is edited by this spec
and stays the binding reference.

**Inspector rows.** One row template remains, the note row. The question row template
(`rv-row rv-q`, its `I assumed` / `A fresh reader asked` lead, its `rv-claim` claim line, its
`Yes, that's right` / `No, it's…` / `Later` controls and its `You confirmed` / `You corrected:`
answered line) is deleted with its CSS.

**Header.** The breadcrumb, the pill and the approve control are unchanged. The progress bar
(`rv-progress` → `rv-track` → `rv-fill`) is deleted; nothing replaces it, because the count it
showed was answered-questions-over-asked.

**Composer.** A textarea, a `Send` button and the `Mark an area` toggle. No chip row. The
textarea is `rows="5"` and `min-height: 104px` in both the review page's light DOM and the notes
layer's shadow root, so the two composers stay the same size.

**Empty states.** A screen whose only notes were questions now renders the inspector's existing
empty state rather than a row; no new copy is authored.

## Data Model

`design/mocks/notes.json` — no note is rewritten, moved or deleted. A note carrying
`kind: "question"` (with its `ledgerId` and `answer`) stays on disk exactly as it is and stops
being listed, grouped, counted or gated on. Measured (A1): the one real host holds 13 such
notes, 10 of them unanswered, and 21 person-written notes that are unaffected.

`design/mocks/ledger.md` — unchanged in shape. Rows whose status was previously written by the
answer route (`confirmed <date>` / `overridden <date>` / `waived <date>`) are now written only
by `ledger set`, which already exists and is already the remedy `requireGateOpen`'s refusal
names.

## Behavior

Drawing a journey no longer pins anything. The session writes an assumption row with
`ledger add` as before; nobody is asked to confirm it on a screen, and `requireGateOpen` still
refuses a sign-off while the row is neither confirmed nor overridden, naming `ledger set` as it
already does.

The review page and the mock page render only notes a person typed. On the one real host that
is 21 rows instead of 34, and the inspector's `Needs you` count and the rail's per-screen counts
fall with them.

The client's own pages are unchanged apart from one refusal that can no longer fire: confirming
a journey no longer checks for an unanswered question, because none can exist. A client still
cannot confirm a journey twice, still cannot confirm with an empty sentence, and still sees and
raises their own notes.

## Acceptance Criteria

- **AC-20260913-04-1**: WHEN `ledger add --text "the owner reviews weekly" --screen home` runs
  THE SYSTEM SHALL exit 2 with a refusal naming `--screen` as an unknown flag, and SHALL NOT
  append a note to `design/mocks/notes.json`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-2**: WHEN `ledger ask --id A1 --screen home` runs THE SYSTEM SHALL exit 2
  with a refusal naming the accepted `ledger` subcommands, which SHALL NOT include `ask`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-3**: WHEN `POST /__notes/answer` is requested against a served host with a
  body naming any existing note THE SYSTEM SHALL respond `404` and SHALL NOT write
  `design/mocks/notes.json`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-4**: WHEN `notes open` runs on a store holding one open project note, two
  open mock notes and one addressed mock note THE SYSTEM SHALL print the counts line
  `📝 open notes: 3 (1 project · 2 mock) · addressed: 1` as its first line, the project block
  before any journey group, and `⚠️ a project note is open — answer it (canon change or new
  directions) before any mock note` as the last line — with no `❓ questions:` line anywhere in
  the output
  → rewrites tests/mocks/bounded-output-pins.test.js :: AC-20260912-14-9:
- **AC-20260913-04-5**: WHEN `--mark journey-approved --journey j1` runs on a host whose screen
  `a` carries one `status: "addressed"` note THE SYSTEM SHALL exit 2 with a single refusal
  naming that note's id and the resolve remedy, and the message SHALL NOT contain the word
  `question`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-6**: WHEN `ledger derive` runs THE SYSTEM SHALL CONTINUE TO append one row
  per non-goal, one per invented-row "no", and one per not-needed withdrawal, excluding an
  inferred-row no and a mistake withdrawal, and SHALL CONTINUE TO stay byte-idempotent on a
  second run
  → rewrites tests/mocks/mocks-driver-exclusions.test.js :: AC-20260911-05-7:
- **AC-20260913-04-7**: WHEN `notes open` runs on a store holding one person-written open note
  and one `kind: "question"` note THE SYSTEM SHALL print the person's note and SHALL NOT print
  the question's id or its text, and `design/mocks/notes.json` SHALL still contain both notes,
  byte-identical, after the run
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-8**: WHEN `GET /__notes/list?screen=**` is requested against a served store
  holding one person-written note and one `kind: "question"` note THE SYSTEM SHALL return a
  JSON array of length 1 carrying only the person-written note's id
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-9**: WHEN the review page is rendered THE SYSTEM SHALL emit a composer whose
  textarea carries `rows="5"`, and the page's markup SHALL contain no occurrence of
  `rv-chipbtn`, `rv-chips` or `rv-chip-on` (`rv-chip`, the badge on an existing note, is
  matched with a boundary that treats `-` as part of the word and SHALL still occur when a note
  carries a `reason`)
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-10**: WHEN `POST /__notes/add` is requested with a body carrying a `reason`
  field THE SYSTEM SHALL store the note with that reason and the rendered row SHALL show its
  `REASON_LABELS` badge, so an older store keeps displaying
  (`{"reason":"wrong-direction"}` → a row containing `Wrong direction`)
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-11**: WHEN the review page is rendered for a journey THE SYSTEM SHALL emit
  markup containing none of `rv-progress`, `rv-track`, `rv-fill`, `rv-claim`, `rv-correct` or
  `rv-q`, and `spec/templates/mocks/viewer.css` SHALL declare no rule for any of them
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-12**: WHEN `POST /client/__walk/confirm` is requested for a declared journey
  THE SYSTEM SHALL CONTINUE TO respond `400` to an empty sentence, `200` to a real one
  (a Japanese sentence included), and `409` to an already-confirmed journey
  → rewrites tests/mocks/client-walk-route.test.js :: AC-20260911-01-9:
- **AC-20260913-04-13**: WHEN every tracked file under `spec/`, `tests/`, `scripts/` and
  `design/` is searched THE SYSTEM SHALL yield zero occurrences of each of
  `answerQuestion`, `joinQuestions`, `renderQuestionRow`, `questionRow`, `questionLines`,
  `journeyQuestionCounts`, `refuseUnaskable`, `ledgerId`, `LEDGER_ID_RE` and `__notes/answer`;
  and `docs/adr/0024-only-a-person-starts-a-note.md` SHALL parse with `Status: accepted`, a
  non-empty `## Dissents` section, and an `## Applies to` section naming
  `specs/20260906/03-questions-on-the-wireframe.md`
  → writes tests/mocks/human-authored-notes.test.js
- **AC-20260913-04-14**: WHEN the client index and a client walk page are built over a store
  holding one client-written note and one `kind: "question"` note anchored to the same journey
  THE SYSTEM SHALL render the client's note and SHALL render neither the question's id nor its
  text nor any open-guess count on either page
  → rewrites tests/mocks/walk-page.test.js :: AC-20260911-01-10:

## Assumptions (escalation triggers)

- A1: **The one real host holds 13 question notes and 21 person-written ones, and D4 hides
  exactly the 13.** Executed 2026-09-13 over
  `/Users/jj/Projects/hearwell/design/mocks/notes.json`: 34 notes, grouped by kind
  `{"question":13,"(absent)":21}`, by author `{"session":13,"anonymous":21}` — the two
  partitions coincide exactly, so `kind == null` and "a person typed it" are the same set in
  real data. Of the 13, 10 carry no answer. — **if false:** a person-written note carrying a
  `kind` would be hidden; add `by` to the predicate and re-measure before the build continues.
- A2: **`requireGateOpen` has a live human path to close an assumption row without the answer
  route.** Read 2026-09-13: its own refusal names
  `ledger set --id <id> --status confirmed --tag said-by-user`, and `ledger set` is a shipped
  subcommand calling `mocks-ledger.js`'s `setStatus` directly. — **if false:** deleting the
  answer route would leave every assumption row permanently blocking; STOP, ask the user.
- A3: **`tests/mocks/walk-page.test.js`'s `AC-20260911-01-10` is a predecessor CONTINUE-TO pin
  whose whole subject this spec deletes.** Its title is `a question note carrying
  answer.verdict: "waived" CONTINUES TO be excluded from the open count buildClientIndex and
  buildWalkPage render`; no literal this spec retires appears in its own File Plan.
  — **if false:** it covers something besides questions; keep it and retag, never weaken. It is
  rewritten rather than deleted because AC-20260913-04-14 is its true successor on the same
  surface: the client's pages render no question at all.
- A6: **`lib/walk-page.js` and `lib/mocks-exclusions.js` read `notes.json` directly.** Found by
  the lock-time collision sweep on the literal `ledgerId`, which named both files outside the
  File Plan's first draft: `walk-page.js` filters `kind !== 'question'` in two collectors and
  joins `note.ledgerId` against the ledger to render a guess's claim; `mocks-exclusions.js`
  derives an exclusion row from an answered-`no` question. Both are now File Plan rows.
  — **if false:** a third direct reader exists; grep `readNotes(` across `spec/scripts/lib/`
  before the build and add it.
- A4: **`0024` is the next free ADR number once spec 03's `0023` lands.** — **if false:** a
  sibling claimed it; take the next free number and amend D6, the File Plan row,
  AC-20260913-04-13 and every backlink in the same build.
- A5: **The chip removal is recoverable if the tree revert loses it.** The authored patch is at
  `~/.claude/spec-wip/claude-plugins-reason-chips-part1.patch` (the review.html +
  review-page.js + review.browser.js half); the viewer.css and notes-layer.browser.js half is
  mixed into `claude-plugins-worktree-20260913.patch` beside it. Both files verified present
  2026-09-13. — **if false:** re-author from D5, which states the change in full.

## Rationale

Producer 1 is the older and more entangled of the two. It was never a bad idea: pinning "I
assumed you meant X" to the screen it affects is the cheapest way to get an assumption
confirmed by the person who knows. It is deleted because of where it put the result. The
annotation queue is the owner's own list of things they do not like; filling it with the
system's own questions makes it a list the owner must clear, and the owner said plainly that a
note is something a human writes. The confirmation loop is not replaced by a different
mechanism in this spec — under specs/20260913/05 the AI asks its follow-up as a reply on a note
a person started, which is the shape the owner explicitly blessed.

D3 is where a careless read could do damage. Two separate gates look like each other: the
*notes* gate (`requireNotesResolved`) counts open notes, and the *ledger* gate
(`requireGateOpen`) counts unconfirmed assumption rows. Only the first is touched. A2 measured
that the second already has its own human-run writer, so deleting the answer route costs the
ledger nothing; had it not, deleting it would have left every assumption row blocking sign-off
forever with no way out — which is why A2 escalates rather than falls back.

D4 chooses to hide rather than migrate. Deleting 13 notes out of a host's store is a
destructive act the owner did not ask for, and rewriting them into plain notes would put
thirteen rows the owner never wrote back on the page — the exact thing being fixed. Hiding
leaves the history on disk and off the screen. The predicate deliberately does not live inside
`readNotes`: every writer in this codebase reads the whole array, mutates and writes it back, so
a filter there would erase the hidden notes on the next unrelated write.

D5 rides here rather than in its own spec because the promise it retires is the same one:
specs/20260906/03 D5 locked the question row and the reason chip row in a single Decision, so
one amendment covers both, and splitting them would leave that Decision half-retired with no
document saying so.

Adversarial check, rejected: a reviewer could ask for the question notes to be migrated into the
thread as the AI's first message, so nothing is lost. Rejected — a question is not a reply to
anything, so there is no note for it to join; it would have to become a new note, which is the
producer this spec exists to delete.

The zero-hit sweep (AC-20260913-04-13) covers `spec/`, `tests/`, `scripts/` and `design/` — the
executable and test surface this spec's File Plan owns. The retired names in
`docs/canonical/design.md` are corrected by the Canonical Delta below, which the review
stage applies at close; sweeping that file at build time would redden the gate against text
the build is not allowed to write.

## Canonical Delta

`docs/canonical/design.md` § Page notes: delete the `**Questions (specs/20260906/03).**`
paragraph in full. In the gate sentence, replace "`approved` refuses while any project note is
unresolved or any note anywhere is unresolved; `journey-approved` refuses only while any note on
that journey's own screens is unresolved" — unchanged in substance, with the question clause and
the "question-aware notes gate runs ahead of the generic ledger gate" sentence removed. In the
notes paragraph, replace the writer list with `readNotes`, `validateNotes`, `writeNotes`,
`addNote`, `authoredByPerson`, `resolveNote`, `addressNote`, `replyNote`, `reopenNote`,
`groupOpen`, `unresolvedFor`, `waiveNote`, `replaceRegion`, `deleteNote`, and the exposed routes
with `GET /__notes/notes.js|anchor.js|viewer.css|list?screen=<label>` and
`POST /__notes/add|resolve|region|delete|reopen`. Add: "Every note in the store was typed by a
person. Nothing in the pipeline creates one; a note carrying a `kind` is a record left by a
retired producer and is never listed, grouped, counted or gated on, though it stays on disk. A
free-form note carries no reason the composer authored — an older note's `reason` still renders
as a badge." In § the journey look surface, delete "question inspector answered in place with
`J K Y N Esc \`" and the "blocked by open questions and" clause. Delete the sentence "`notes
waive --id --reason` releases a client note or a question after seven days of client silence (a
question's ledger row becomes `waived <date>`; the note's `answer.verdict` is `waived`)" and
replace with "`notes waive --id --reason` releases a client note after seven days of client
silence." Delete from the client-player paragraph the clause "and `POST /client/__walk/confirm`
independently refuses with `409` while any question anchored to the journey's screens is
unanswered, so a stale tab or a player script that failed to load cannot record an approval over
an open question."
