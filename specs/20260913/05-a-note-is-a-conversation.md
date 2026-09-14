---
date: 2026-09-13
status: implementing
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/notes.html
breaking: true
depends_on: [specs/20260913/07-the-critic-is-out.md]
depended_on_by: [specs/20260913/06-every-mock-has-a-page-you-can-mark.md]
brief: n/a
open_markers: 0
diff_base: 27306bd260416fc7c7e085a30311e52f1fe54aaf
---

# A note is a conversation

## Goal

A note already stores a conversation — every reply is appended to its `thread` — but the owner
cannot hold one. The review page's `Still not right` button posts no words, so the server refuses
it and the page swallows the refusal: that control has never worked. The note card shows only the
person's side of the thread, never what the session answered. A person can reply only to a note
the session has already addressed. Approve and Reject write identical records on the owner's
route, so a rejected note cannot be hidden. The box, its badge, the row and its pin each colour a
note by a different rule. And `notes open` lists notes the session already answered, so a fresh
session re-reads its own words. This spec makes the owner able to reply as often as they like,
shows both sides of the thread, makes Reject final and hidden, colours every per-note surface by
whose turn it is, and lists for the session only the notes waiting on it. It also closes the two
gaps specs/20260913/02 left: the `Mark an area` button stays pressed after marking ends, and a
note card stays open after its board switches state tab. Done means the owner can keep writing on
a note until they approve or reject it, and the colour says whose turn it is.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One derivation of whose turn it is.** `lib/mocks-notes.js` exports `turnOf(n)`: `'dropped'` when `status === 'resolved' && resolution === 'withdrawn'`; `'done'` for every other `resolved` note (a missing `resolution`, `'accepted'` and `'waived'` alike — no special case); `'you'` when `n.addressed` or a legacy `n.reply` is present; `'session'` otherwise. `status` stays the one persisted field; the turn is derived on every read and never stored. `notes-layer.browser.js` and `review.browser.js` cannot import the lib, so `notes-layer.browser.js` inlines the same four-clause function with a comment naming `lib/mocks-notes.js` as its home, the way it already inlines `authoredByPerson`. (AC-20260913-05-1) | One expression over data already on disk: no migration, no timestamps. A waived client note is simply finished — nothing new is built for it. |
| D2 | **A person may reply to any note that is not resolved, as often as they like.** The session mount of `POST /__notes/reopen` (design-atlas.js) replaces its `target.status !== 'addressed'` refusal with `target.status === 'resolved'` → `400 {"error":"a resolved note takes no reply"}`; the empty-text refusal stays, unchanged. `reopenNote` folds a legacy `reply` into the appended thread entry before nulling it: the entry's `addressed` is the prior `addressed` object when present, else `{ change: <prior reply> }` when a `reply` string is present, else `null`; the note's `reply` is then set to `null`. The client mount of `/__notes/reopen` is untouched. (AC-20260913-05-2, AC-20260913-05-3) | The route's addressed-only rule is what made a second complaint impossible; the fold keeps the seven legacy session replies in the thread instead of erasing them. |
| D3 | **The session has one verb.** The `notes reply` subcommand, `replyNote` and its export are deleted; `notes address --id --change` is how the session answers, whether it fixed something or asks a question back. `mocks-driver.js`'s `notes` refusal enumerates `open, add, address, waive`; the `notes address` unchanged-screen refusal and the header comments stop naming `notes reply`. The "question back" instruction in `spec/commands/sketch.md`, `spec/commands/atlas.md` and `spec/commands/mocks.md` becomes `notes address --id <id> --change "<question>"`, and its "status stays open" clause becomes "the note becomes the author's turn". A stored `reply` is only ever read (D1, D6) and folded (D2). (AC-20260913-05-4) | Two verbs for "the session said something" was the duplication; the `reply` field has no reader of its value outside this spec's own read. |
| D4 | **Approve and Reject are told apart, and Reject is final.** The session mount of `POST /__notes/resolve` requires `verdict` ∈ `accepted`, `withdrawn` and otherwise answers `400 {"error":"verdict must be one of accepted, withdrawn"}` before writing; `resolveNote` gains `opts.verdict`, written to `resolution` when given. The client mount keeps deriving `resolution` from prior status exactly as today. A `dropped` note (D1) is removed from the session mount's `GET /__notes/list` response and from the review page's rows; it stays on disk. There is no path back from Reject — by design, the note is not wanted. (AC-20260913-05-5, AC-20260913-05-6) | The owner's route never wrote a resolution, so "rejected" could not be hidden. The client route already records both values and is left alone. |
| D5 | **Every per-note surface is coloured by turn.** `session` → `var(--v-danger)`, `you` → `var(--v-warn)`, `done` → `var(--v-ok)`. The surfaces are exactly: the region box and its badge on a mock page, the note card's header badge, the review page row's left border, and the row's `.rv-pin`. `notes-layer.browser.js`'s `colorFor` takes a role (`session`/`you`/`done`/`outdated`), where `outdated` is today's derived lost-anchor case and keeps `var(--v-muted)` with no box drawn; the badge glyph keeps today's class names and viewer.css glyph rules, which the client's `lib/walk-page.js` also emits: a role maps to a class as `session` → `open`, `you` → `addressed`, `done` → `resolved`, `outdated` → `outdated`. `review-page.js`'s `rowOpen` emits `data-turn` in place of `data-status`; viewer.css keys the row border and `.rv-pin` on it. Count chips (`.rv-count`, `.rv-badge`, `.rv-tabpin`, `.nl-card-count`) are not per-note and keep their colours. `review.browser.js`'s `isOpenRow` reads `data-turn` ∈ `session`, `you`, so the `Needs you` filter, row movement, the rail counts and the approve gate keep today's membership. This reverses the chrome half of `specs/20260912/12` D17 for the row and its pin only. (AC-20260913-05-7, AC-20260913-05-8) | The owner's complaint was the same note in different colours; a count is not a note and has no single turn. |
| D6 | **Both sides of the thread are shown.** The note card (`notes-layer.browser.js`'s `buildCardChrome`) renders, oldest first: the note's text; for each thread entry, its `addressed.change` as a session message when present, then its own text; then the note's current `addressed.change`, or its legacy `reply`, as the newest session message. The card's controls on a note whose status is `open` or `addressed` are one `Reply` textarea with a `Reply` button (posts `reopen {id, text, by}`, empty text focuses the box and posts nothing), `Approve` (the existing 5-second `deferPost` toast, `Approved`, then `resolve {verdict:"accepted"}`) and `Reject` (same toast, `Rejected`, `verdict:"withdrawn"`). The card's `Resolve`, `Accept`, reject-only `Send back` box and the `…` menu's `Withdraw` item are deleted; the `…` menu keeps `Re-place the box` and `Delete` and is not rendered when it would be empty. The box-layer `a` key and the strip row's `Resolve` button post `verdict:"accepted"`. The review page row replaces its status line with the newest message — `Addressed: <change>` or `Session: <reply>` on a `you` note, `You: <text> · waiting for the session` when a `session` note's thread is non-empty, today's waiting line otherwise — and on every `session` or `you` row carries `Reply` (unhides a server-rendered, hidden `[data-rv="reply-box"]` holding `[data-rv="reply-text"]` and `[data-rv="reply-send"]`), `Approve` (`[data-rv="accept"]`) and `Reject` (`[data-rv="reject"]`). The row posts immediately and reloads, as today; no toast is added to the row. (AC-20260913-05-3, AC-20260913-05-9, AC-20260913-05-10, AC-20260913-05-17) | The card already renders the thread and already has the toast; this adds the missing session side and one reply box, and deletes the controls that duplicated Reply and Reject. |
| D7 | **`notes open` lists only what waits on the session.** `cmdNotesOpen` filters its listing to `turnOf(n) === 'session'` before `groupOpen`; the counts line above it is computed exactly as today. `noteLine` drops the `↳ changed:` continuation and, when the note's thread is non-empty, appends `   ↳ <by>: <newest thread entry's text>`. The atlas index card's `nl-card-count` counts `open` from turn `session` and `needs` from turn `you` in place of status. (AC-20260913-05-11, AC-20260913-05-12) | A note the session answered is the owner's to read; listing it again is the re-read the owner asked to stop. The card count used status and so miscounted a legacy reply. |
| D8 | **The `Mark an area` button unpresses whenever marking ends inside the frame.** A framed notes layer's `setMode` calls `window.parent.__rvMarkOff(window)` (guarded in `try`) whenever it enters `idle`. `review.browser.js` defines `__rvMarkOff(win)`: when `markingFrame` is the frame whose `contentWindow` is `win`, it sets `markingFrame = null` and `aria-pressed="false"` on the button. (AC-20260913-05-13) | Today only the page's own button and Escape unpress it; the frame's Escape, Save, Discard and card close all leave it looking pressed. |
| D9 | **Switching a board's state tab closes that board's open card.** The notes layer exposes `window.__nlCloseCard()`, which runs `closeCard()` when `mode === 'composing'` and does nothing otherwise. `review.browser.js`'s `switchTab`, before it hides the outgoing frame, calls that frame's `__nlCloseCard` (guarded in `try`). (AC-20260913-05-14) | The card belongs to the frame being hidden; closing it through the frame's own path also clears the page's card host and returns the frame to idle. |
| D10 | **One amendment ADR.** `docs/adr/0025-a-note-is-a-conversation.md` (CREATE) applies to `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md` D17 (its chrome half, for the row and `.rv-pin` only; the box half stands), `specs/20260902/10-page-notes-review-loop.md` D4 (the `reply` verb and field), and `specs/20260912/06-the-review-page-answers-to-a-design.md`'s row controls and fixed-orange row/pin. (AC-20260913-05-15) | D17 reads as current and is pinned by an executed test; reversing half of it silently would leave the record contradicting the code. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D1: `turnOf` added and exported. D2: `reopenNote` folds a legacy `reply` into the thread entry's `addressed` and nulls `reply`. D3: `replyNote` and its export deleted. D4: `resolveNote` writes `opts.verdict` to `resolution` when given |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3: `notes reply` subcommand, its import, header lines and refusal mentions deleted. D7: `cmdNotesOpen` lists only turn `session`; `noteLine` loses `↳ changed:` and gains the newest-reply continuation |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2: session `/__notes/reopen` refuses only a resolved note. D4: session `/__notes/resolve` requires `verdict`; session `/__notes/list` drops `dropped` notes. D7: `nl-card-count` counts by turn |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D1: inline `turnOf`. D5: `colorFor` and the glyph class take a role. D6: card thread shows session messages; Reply box, Approve and Reject replace Resolve/Accept/Send back/Withdraw; `a` key and strip Resolve post `accepted`. D8: `setMode('idle')` calls `__rvMarkOff`. D9: `__nlCloseCard` |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D4: rows drop `dropped` notes. D5: `rowOpen` emits `data-turn`, not `data-status`. D6: the row's newest-message line, hidden reply box, and `Reply`/`Approve`/`Reject` on every `session`/`you` row |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D5: `isOpenRow` reads `data-turn`. D6: `Reply` unhides the reply box, `reply-send` posts `reopen {id, by, text}`, `accept`/`reject` post `resolve` with a verdict. D8: `__rvMarkOff`. D9: `switchTab` calls the outgoing frame's `__nlCloseCard` |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D5: `.rv-row` border and `.rv-pin` background keyed on `data-turn`; glyph rules unchanged; the `.nl-region` comment block describes the turn register and the role → glyph-class map. D6: the row's reply box |
| design/atlas/index.html | MODIFY | other | Regenerated with `node spec/scripts/design-atlas.js build --root .` after the viewer.css edit (it inlines the stylesheet); never hand-edited |
| design/chrome-mocks/notes.html | MODIFY | doctrine | D5/D6: `STATUS_COLOR` becomes the turn map; the card's Reject is final and `showReject`'s Send back box is removed |
| design/chrome-mocks/review.html | MODIFY | doctrine | D5/D6: rows carry `data-turn`; the row status line and `Reply`/`Approve`/`Reject` controls |
| docs/adr/0025-a-note-is-a-conversation.md | CREATE | doctrine | D10: the amendment ADR |
| spec/commands/sketch.md | MODIFY | doctrine | D3: "Question back" names `notes address --change "<question>"`, not `notes reply` |
| spec/commands/atlas.md | MODIFY | doctrine | D3: the same "question back" instruction |
| spec/commands/mocks.md | MODIFY | doctrine | D3: the client-loop line's "`notes reply` for a question back" names `notes address` instead |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1–D7: the "Status is a three-step queue" paragraph becomes the turn rule, Reject is final, `notes reply` is gone, and the read-back paragraph says `notes open` lists only turn `session` |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/mocks/note-conversation.test.js | CREATE | tests | AC-20260913-05-1, -2, -4, -5, -6, -9, -11, -12, -15 |
| tests/mocks/review-browser.test.js | MODIFY | tests | AC-20260913-05-3, AC-20260913-05-10 |
| tests/mocks/review-page.test.js | MODIFY | tests | AC-20260913-05-8 (rewrites the AC-20260912-06-1 row-controls pin) |
| tests/mocks/client-region.test.js | MODIFY | tests | AC-20260913-05-7 (rewrites the AC-20260912-12-22 colour pin to the turn register) |
| tests/mocks/review-board-card.test.js | MODIFY | tests | AC-20260913-05-13, AC-20260913-05-14, AC-20260913-05-17 |

**Orchestrator duty (outside the table).** Append one `- Amended by: ADR-0025 — <one line>`
header line to each of `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md`,
`specs/20260902/10-page-notes-review-loop.md` and
`specs/20260912/06-the-review-page-answers-to-a-design.md`. No other text in those files changes.

## Contracts

```js
// lib/mocks-notes.js — the one derivation (D1)
function turnOf(n) {
  if (n.status === 'resolved') return n.resolution === 'withdrawn' ? 'dropped' : 'done'
  return (n.addressed || n.reply) ? 'you' : 'session'
}
// Export added: turnOf. Export removed: replyNote.

// reopenNote's appended entry (D2)
{ at, text, by, addressed: priorAddressed || (priorReply ? { change: priorReply } : null) }
// then: status 'open', addressed null, reply null, resolution null, withdrawReason null
```

```
turn      colour            per-note surfaces
session   var(--v-danger)   box · box badge · card badge · row border · row pin
you       var(--v-warn)     same
done      var(--v-ok)       same
dropped   —                 not listed on the session mount, not rendered on the review page
outdated  var(--v-muted)    badge only, no box (unchanged; a lost anchor, not a turn)
```

HTTP, session mount only (the client mount is unchanged):

```
POST /__notes/reopen  { id, by, text }      # 400 "a resolved note takes no reply"; text required
POST /__notes/resolve { id, by, verdict }   # verdict: "accepted" | "withdrawn", else 400
GET  /__notes/list                          # omits notes whose turn is 'dropped'
```

CLI:

```
notes open      # lists only notes whose turn is 'session'; counts line unchanged
                # a note with replies: "<id> [open] <by> · <text>   ↳ <by>: <newest reply>"
notes reply     # deleted — refuses as an unknown subcommand
```

## UI

`design_source: design/chrome-mocks/notes.html` (the card) and `design/chrome-mocks/review.html`
(the row) are both edited and stay the binding references.

**The note card** — rendered by `notes-layer.browser.js`'s `buildCardChrome`, posted by its own
`api()`. Header badge in the turn colour · the thread oldest first with the session's messages
included · on an `open` or `addressed` note: a `Reply` box and button, `Approve`, `Reject` · the
`…` menu with `Re-place the box` (outdated) and `Delete` (an untouched note), hidden when empty.

**The review row** — rendered by `review-page.js`'s `renderNoteRow`, posted by `review.browser.js`.
Pin and border in the turn colour · the note's text · the newest-message line · on a `session` or
`you` row: `Reply`, `Approve`, `Reject`.

| control | sentence on success | path back | farthest artifact |
|---|---|---|---|
| `Reply` (card or row) | card: re-renders with your words as the newest message; row: the page reloads with `You: <text> · waiting for the session` | reply again | `design/mocks/notes.json` `thread` |
| `Approve` | card: `Approved` toast with `Undo` for five seconds (existing); row: the page reloads with the note under `Done` | none needed — the card's Undo window; after that it is approved | `resolution: "accepted"`; can unblock `--mark journey-approved` |
| `Reject` | card: `Rejected` toast with `Undo` for five seconds (existing); row: the page reloads without the note | none — final by design (D4) | `resolution: "withdrawn"`; can unblock `--mark journey-approved` |
| `Mark an area` (D8) | the button shows unpressed the moment marking ends | press it again | none |

## Data Model

`design/mocks/notes.json` — no migration runs and no note is rewritten except by the actions
above. `reply` is never written again; a stored one is read (D1, D6) and moved into the thread on
the next reply (D2). `resolution` is written on every session-mount resolve from now on; a note
resolved before this spec carries none and reads as `done`.

## Behavior

The owner opens a screen. A red box is waiting on the session, an amber box is waiting on them, a
green box is approved; the row and its pin use the same colour. They click a box: the card shows
the whole exchange, both sides, with a reply box. They type and send; the note turns red. They can
do this as often as they like. When satisfied they press Approve and it turns green. If they do
not want the note, Reject removes it from every page they use.

While marking an area, the `Mark an area` button stays pressed; the moment they save, discard or
press Escape inside the screen, it unpresses. Switching the board to another state closes the card.

The session runs `notes open` and sees only the notes waiting on it, each with the owner's newest
reply.

## Acceptance Criteria

- **AC-20260913-05-1**: WHEN `turnOf` is called THE SYSTEM SHALL return `'session'` for
  `{status:'open'}`, `'you'` for `{status:'open', reply:'x'}`, `'you'` for
  `{status:'addressed', addressed:{change:'x'}}`, `'done'` for `{status:'resolved'}`, `'done'` for
  `{status:'resolved', resolution:'waived'}` and `'dropped'` for
  `{status:'resolved', resolution:'withdrawn'}`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-2**: WHEN the session mount receives `POST /__notes/reopen {id, by, text:"still wrong"}`
  for an `open` note, then again for the same note, and then for a `resolved` note THE SYSTEM SHALL
  answer `200`, `200`, then `400` with `a resolved note takes no reply`; the first note SHALL end
  `status:"open"` with a two-entry `thread`; and a note carrying `{status:"open", reply:"we changed it"}`
  reopened the same way SHALL end with `reply:null` and its new entry's `addressed` equal to
  `{"change":"we changed it"}`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-3**: WHEN the review page's `Reply` control is clicked on a row and
  `[data-rv="reply-send"]` is clicked with `still wrong` in `[data-rv="reply-text"]` THE SYSTEM
  SHALL post to `/__notes/reopen` exactly once with a body whose `text` is `still wrong`, and WHEN
  `[data-rv="reply-send"]` is clicked with an empty box THE SYSTEM SHALL post nothing
  → writes tests/mocks/review-browser.test.js
- **AC-20260913-05-4**: WHEN `notes reply --id N001 --text "x"` runs THE SYSTEM SHALL exit 2 with
  a refusal whose subcommand list is `open, add, address, waive`; and WHEN every tracked file under
  `spec/` is searched THE SYSTEM SHALL find no occurrence of `replyNote` or `notes reply`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-5**: WHEN the session mount receives `POST /__notes/resolve` with
  `verdict:"accepted"` for one note and `verdict:"withdrawn"` for another THE SYSTEM SHALL write
  `resolution:"accepted"` and `resolution:"withdrawn"` respectively; and a body with no `verdict`, or
  `verdict:"maybe"`, SHALL answer `400` with `verdict must be one of accepted, withdrawn` and leave
  `design/mocks/notes.json` byte-identical
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-6**: WHEN a store holds one `{status:"resolved", resolution:"withdrawn"}` mock
  note and one `open` mock note on the same screen THE SYSTEM SHALL return only the open note from
  the session mount's `GET /__notes/list?screen=**`, and the review page SHALL render exactly one
  `[data-rv="row"]`, for the open note
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-7** `[env: CHROME_BIN]`: WHEN a served mock page paints region boxes for a
  `session` note, a `you` note and a `done` note THE SYSTEM SHALL compute their badge backgrounds as
  `rgb(220, 38, 38)`, `rgb(217, 119, 6)` and the page's own computed `var(--v-ok)` respectively, and
  viewer.css's `.nl-region` comment block SHALL name the register `--v-danger session, --v-warn you,
  --v-ok done, --v-muted outdated`
  → rewrites tests/mocks/client-region.test.js :: AC-20260912-12-22,
- **AC-20260913-05-8**: WHEN the review page renders an `open` note, an `addressed` note and a
  `resolved` note THE SYSTEM SHALL emit `data-turn="session"`, `data-turn="you"` and
  `data-turn="done"` on their rows, no `data-status` on any `[data-rv="row"]`, and on each of the
  first two rows exactly three controls reading `Reply`, `Approve`, `Reject`, and none on the third
  → rewrites tests/mocks/review-page.test.js :: AC-20260912-06-1:
- **AC-20260913-05-9**: WHEN the review page renders a note `{status:"addressed", addressed:{change:"moved the button"}}`,
  a note `{status:"open", reply:"which button?"}`, and a note `{status:"open", thread:[{text:"bigger", by:"jj"}]}`
  THE SYSTEM SHALL show `Addressed: moved the button`, `Session: which button?` and
  `You: bigger · waiting for the session` on those rows respectively
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-10**: WHEN a row's `[data-rv="accept"]` and another row's `[data-rv="reject"]`
  are clicked on the review page THE SYSTEM SHALL post to `/__notes/resolve` bodies carrying
  `verdict:"accepted"` and `verdict:"withdrawn"` respectively
  → writes tests/mocks/review-browser.test.js
- **AC-20260913-05-11**: WHEN `notes open` runs on a store holding an `open` note, an `addressed`
  note, an `open` note carrying `reply`, and an `open` note whose thread's newest entry is
  `{text:"bigger", by:"jj"}` THE SYSTEM SHALL list exactly two note lines — the plain open note and
  the threaded one, the latter ending `   ↳ jj: bigger` — and its output SHALL contain no
  `↳ changed:`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-12**: WHEN the atlas index is built over a screen holding one `open` note and one
  `{status:"open", reply:"x"}` note THE SYSTEM SHALL emit that screen's `nl-card-count` with
  `data-open="1"` and `data-needs="1"`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-13** `[env: CHROME_BIN]`: WHEN the review page's `Mark an area` button is
  pressed, a box is drawn on the focused board, and the draft card is discarded THE SYSTEM SHALL
  show the button with `aria-pressed="false"`
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-05-14** `[env: CHROME_BIN]`: WHEN a note card is open on a board and that board's
  other state tab is clicked THE SYSTEM SHALL leave the board's `[data-rv="cardhost"]` empty
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-05-15**: WHEN `docs/adr/0025-a-note-is-a-conversation.md` is read THE SYSTEM SHALL
  find `Status: accepted`, a `## Dissents` section, and an `## Applies to` section naming
  `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md`,
  `specs/20260902/10-page-notes-review-loop.md` and
  `specs/20260912/06-the-review-page-answers-to-a-design.md`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-17** `[env: CHROME_BIN]`: WHEN the box of a note
  `{status:"addressed", text:"too small", thread:[{text:"still small", by:"jj", addressed:{change:"made it 14px"}}], addressed:{change:"made it 16px"}}`
  is clicked on a review board THE SYSTEM SHALL render a card whose messages read, in order,
  `too small`, `made it 14px`, `still small`, `made it 16px`; whose buttons include `Reply`,
  `Approve` and `Reject`; and which contains no button reading `Resolve`, `Accept`, `Send back` or
  `Withdraw`
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-05-16**: WHEN `POST /client/__notes/resolve` is sent for an addressed client note
  with no `verdict` THE SYSTEM SHALL CONTINUE TO record `resolution:'accepted'`
  → reuses tests/mocks/client-walk-route.test.js :: AC-20260911-06-15:

## Assumptions (escalation triggers)

- A1: **The addressed-only reply refusal lives in the route, not the lib.** Read 2026-09-13:
  `reopenNote` has no precondition; the session mount of `/__notes/reopen` in `design-atlas.js`
  refuses `target.status !== 'addressed'`, and the client mount carries its own. — **if false:** a
  second copy exists; change it the same way and record the deviation.
- A2: **The row's `Still not right` control has never worked.** Read 2026-09-13:
  `review.browser.js`'s `closeNote` posts `{id, by}` with no `text`, the route answers 400 on empty
  text, and the `.catch()` discards it. The original lock executed the same 400 against a served
  page. — **if false:** the control reached the server by another path; keep the reply box anyway.
- A3: **No stored note carries both `reply` and `addressed`.** Measured 2026-09-13 on the owner's
  host store (7 `reply` only, 14 `addressed` only, 0 both; not present on this machine). — **if
  false:** D2's fold keeps `addressed` and drops the `reply` text for that note; STOP and ask before
  building, since that loses a message.
- A4: **No test posts to the session mount's `/__notes/resolve` without a verdict, and none pins
  the card's `Resolve`/`Accept`/`Withdraw`/`Send back` labels or the status glyph classes.** Grepped
  2026-09-13 across `tests/`: zero hits (the resolve callers found are all on the client mount). —
  **if false:** add the verdict or the new label to that test in the same batch; never weaken it.
- A5: **`0025` is the next free ADR number.** `docs/adr/` ends at `0024-the-critic-is-out.md` on
  2026-09-13. — **if false:** take the next free number and amend D10, the File Plan row,
  AC-20260913-05-15 and every backlink in the same build.
- A6: **The Chrome harness can drive both gap checks.** `tests/mocks/review-board-card.test.js`
  already opens a served review page, dispatches real drags and clicks, and reads the card host;
  `/usr/bin/chromium` is on this machine. — **if false:** the two ACs skip under
  `[env: CHROME_BIN]` as sanctioned; never replace them with a source grep.

## Rationale

This is a re-plan. The first lock of this spec predated specs/20260913/07, which removed the
critic, question notes and reason chips and touched 13 of the files this spec edits; several of
its premises no longer held (the reply refusal it deleted was in the route, not the lib; the card
it described had more controls than it named; its `turnOf` ignored `waived`; one of its test
pointers stopped resolving). The re-plan also dropped what the owner judged over-built: `notes
show`, a `+<n> earlier` counter, a colour rule for count chips, any way back from Reject, and any
handling for a client who goes quiet. What remains is the smallest set that makes the conversation
work and the colours agree.

`waived` falls under `done` without a clause of its own because nothing new should happen for a
silent client. Reject hides and does not delete: deleting would need a new write path and is not
what the owner asked for. The card keeps its existing Undo toast because it is already built; the
row gets no toast because adding one is new machinery.

The client's own pages and routes are untouched: the client reopen and resolve routes keep their
rules, and `lib/walk-page.js`'s request rows keep their own colours. AC-20260913-05-16 pins the one
client behaviour the resolve change could most easily break.

`kind:"note"` notes still cannot be deleted from the card (`canDelete` keys on `kind == null`), and
the notes layer's own strip filter and bar counter still read `status`. Both are left as they are:
no production writer stamps `kind:"note"`, and the strip is not a surface the owner raised.

Lock-time collision sweep: `lib/walk-page.js` emits the same `nl-region-glyph` status classes on
the client's pages, so D5 maps roles onto those classes instead of renaming them; three command
files told the session to use `notes reply` and are in the File Plan. `docs/canonical/design.md`
also names `replyNote` and is corrected by the Canonical Delta at close, which is why
AC-20260913-05-4 searches `spec/` only.

The File Plan has 21 rows, over the usual 15. It is not split: every row edits the same note loop,
and splitting would create two specs editing the same files — the reason specs 03 and 04 were
merged into 07.

## Canonical Delta

`docs/canonical/design.md` § Page notes: replace "The loop is asymmetric: the session addresses
(`open → addressed`, with the change and an optional ledger row recorded under the note) and
replies; the author resolves on the page after a re-look; no driver subcommand resolves" with —
"The loop is a conversation. The session answers with `notes address` (a fix or a question back)
and the note becomes the author's turn; the author replies on the page as often as they like and
the note becomes the session's turn again; the author ends it with Approve (`resolution:
"accepted"`) or Reject (`resolution: "withdrawn"`, final, hidden from the owner's pages and kept on
disk). `turnOf(n)` in `lib/mocks-notes.js` derives the turn — `session` red, `you` amber, `done`
green — and every per-note surface (box, badge, card, row, pin) uses it; count chips keep their
own colours. `notes open` lists only the notes whose turn is the session's." Remove `reply` from
the driver verb list and `replyNote` from both writer lists; add `turnOf`.
