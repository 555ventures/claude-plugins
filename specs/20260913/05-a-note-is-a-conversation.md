---
date: 2026-09-13
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/notes.html
breaking: true
depends_on: [specs/20260913/04-only-a-person-starts-a-note.md]
depended_on_by: [specs/20260913/06-every-mock-has-a-page-you-can-mark.md]
brief: n/a
open_markers: 0
---

# A note is a conversation

## Goal

A note is already a conversation in the store and nowhere else. Every note carries a `thread`
array, the server route that appends to it already demands the person say what is still wrong,
and the mock page's card already renders the whole exchange — but the review page's own
`Still not right` button posts the click without the words, so the server refuses it and the
page swallows the error; a second, dead `reply` field carries seven of this host's messages
with no reader anywhere; approving and rejecting a note write byte-identical records, so
"rejected" cannot be hidden; and the page's rows, pins and tabs use a fixed orange that never
tracks state, so an answered note and an unanswered one look the same. This spec makes the
thread the whole conversation, gives both sides an unlimited turn, makes approve and reject
distinguishable and terminal, puts one colour register on every surface, and cuts the AI's
sweep to the messages it has not read. Done means the owner can keep writing on a note until
they are satisfied, the colour tells them whose turn it is at a glance, and no message is ever
read into a session twice.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Whoever spoke last owns the other's turn.** `lib/mocks-notes.js` exports one derivation and every surface reads it: `turnOf(n)` returns `'dropped'` when `status === 'resolved' && resolution === 'withdrawn'`, `'done'` when `status === 'resolved'`, `'you'` when the session has spoken since the person did (`n.addressed` or a legacy `n.reply` is present), and `'session'` otherwise. `status` stays the persisted field and the writers keep it true; nothing else derives a state. (AC-20260913-05-1) | Four words for four situations, computed from what is already on disk, with no migration and no timestamps — measured (A1), the legacy `reply` half of the expression classifies the five open notes the AI answered and the owner never came back to, which are the owner's turn and which today read as the AI's. |
| D2 | **A person replies as often as they like, and a reply always hands the turn back.** `POST /__notes/reopen` accepts a note in ANY status (the `status !== 'addressed'` refusal is deleted; the non-empty-text refusal stays), appends `{at, text, by, addressed}` to `thread`, sets `status: 'open'` and nulls `addressed`, `reply`, `resolution` and `withdrawReason`. The review page's `Still not right` control sends the person's text — today it posts `{id, by}` with no text, the route answers `400`, and `review.browser.js`'s own `.catch()` discards it, so the control has never once worked (A2, executed). (AC-20260913-05-2, AC-20260913-05-3, AC-20260913-05-9) | One rule covers the first complaint, the tenth, and taking back an approval: the person's words are always the last word and always leave the note waiting on the session. Rejected: a separate `reply` route beside `reopen` — two verbs that append to the same array and set the same status. |
| D3 | **The session has one verb.** `notes reply`, `replyNote` and the `reply` field's writer are deleted; `notes address --id --change` is the only way the session speaks, whether it fixed something or is asking a follow-up question, and it sets `status: 'addressed'` as it already does. A legacy `reply` string is READ as the session's message — `turnOf` counts it (D1) and the card and row render it as the newest session message — and is never written again. (AC-20260913-05-4, AC-20260913-05-5) | Measured (A3): `replyNote` has zero readers anywhere in the repo and no note in the real host carries both a `reply` and an `addressed`, so the field is dead on the write side and unambiguous on the read side. Two verbs for "the session said something" is the duplication the owner keeps naming. |
| D4 | **Approve and Reject are the only terminal actions, and they are told apart.** `POST /__notes/resolve` on the session route takes `verdict: 'accepted' \| 'withdrawn'` and writes `resolution` accordingly — today it writes neither, so the two are byte-identical records (A4, executed). A `'withdrawn'` note is hidden everywhere the owner looks: no box, no inspector row, no rail count, no tab pin, no `notes open` line. It stays on disk. Only a person may call either; the session has no route or verb that resolves, which is unchanged. (AC-20260913-05-6, AC-20260913-05-7) | "Green is approved, rejected just disappears" is not expressible today because the store cannot tell the two apart; the client's own route has recorded `accepted`/`withdrawn` since it shipped, so this is one route catching up to its sibling, not a new concept. |
| D5 | **One colour register, on every surface, derived from `turnOf`.** `'session'` → `var(--v-danger)`, `'you'` → `var(--v-warn)`, `'done'` → `var(--v-ok)`, `'dropped'` → not rendered. `notes-layer.browser.js`'s `colorFor` takes a turn instead of a status. `review-page.js`'s `rowOpen` emits `data-turn="session\|you\|done"` (its `data-status`, which folded `addressed` into `open`, is retired), and viewer.css's `.rv-row`, `.rv-pin`, `.rv-badge` and `.rv-tabpin` key on it instead of carrying a fixed `var(--v-warn)`. A COUNT badge follows the rule the atlas card already ships (`.nl-card-count`): `var(--v-warn)` when at least one of its notes needs the person, `var(--v-danger)` otherwise, absent at zero. The client's own request rows (`.wk-req[data-status="open|addressed|resolved"]`, rendered by `lib/walk-page.js`, whose comment says it mirrors `colorFor`) are OUT OF SCOPE and keep their existing register — a different audience reading their own requests on their own pages — and no worker touches that file under this spec. This reverses the chrome half of `specs/20260912/12` D17; that ruling's box half — a box tracks its own state and never the chrome's flat orange — is what this spec extends to the chrome, not what it overturns. (AC-20260913-05-8, AC-20260913-05-10, AC-20260913-05-11) | The owner's report is that the same note is a different colour in three places. One derivation with one mapping is the only arrangement that cannot drift, and the count rule is not invented here — it is already shipped and approved one file over. |
| D6 | **`outdated` is not a fourth state.** A region whose anchor no longer resolves keeps today's `var(--v-muted)` box and its `Re-place the box` action, and its card and its inspector row keep showing the note's own turn colour. No token, class or enum value is added for it. `[no-ac: an absence-of-change ruling; AC-20260913-05-8's register assertion goes red if a fourth colour is introduced]` | Settled with the owner: a lost anchor is "we cannot draw this any more", not a fifth thing to learn. Muting the box is the existing treatment for exactly that and already ships. |
| D7 | **The card and the row carry the conversation.** The notes-layer card renders the thread (it already does) and gains a `Reply` textarea and button on every non-terminal note, replacing the reject-only `Send back` box. The review page's inspector row shows the newest message, a `+<n> earlier` count when the thread is longer, and three controls — `Reply`, `Approve`, `Reject`. `design/chrome-mocks/notes.html` and `design/chrome-mocks/review.html` are edited to carry the same, and stay the binding design sources. (AC-20260913-05-9, AC-20260913-05-12) | The conversation exists and the owner cannot see or join it from the page they actually use. The card is not rebuilt — specs/20260913/02 D6 already re-homed it and it already renders `n.thread`. |
| D8 | **Every message is read exactly once.** `notes open` lists only notes where `turnOf(n) === 'session'`; it prints, per note, the id, the author and the newest message, plus ` (+<n> earlier)` when the thread holds more, and the `↳ changed:` continuation is deleted. `notes show --id <id>` (new) prints one note's whole thread oldest-first for a session that deliberately needs its history. `NOTE_LIST_CAP = 20` is unchanged. (AC-20260913-05-13, AC-20260913-05-14, AC-20260913-05-15) | Measured (A5): today's sweep on the real host is 64 lines / 10,300 bytes, of which 34% is the session re-reading its own prior message on notes that are now the owner's turn; after this rule the same host prints 2 notes. A fresh session remembers nothing, so `notes show` is what keeps "read once" honest rather than lossy. |
| D9 | **One amendment ADR.** `docs/adr/0025-a-note-is-a-conversation.md` (CREATE) applies to `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md` D17 (the chrome half only, reversed — recorded as the owner's own reversal of their own 2026-09-13 ruling, with the box half restated as still standing), `specs/20260902/10-page-notes-review-loop.md` D4 (the `reply` verb and field), and `specs/20260912/06-the-review-page-answers-to-a-design.md`'s fixed-orange row/pin/tab register. (AC-20260913-05-16) | D17 is a same-day owner ruling recorded at a review-stage disposition step and pinned by an executed test; reversing it silently would leave the tree contradicting a document that reads as current. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D1: `turnOf` added and exported. D2: `reopenNote` drops its status precondition and nulls `reply`/`resolution`/`withdrawReason`. D3: `replyNote` and its export deleted; `reply` stays a readable legacy field. D4: `resolveNote` takes an explicit `verdict` on both routes and always writes `resolution`; `groupOpen` and `unresolvedFor` drop `'dropped'` notes |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3: the `notes reply` subcommand deleted. D8: `cmdNotesOpen` filters on `turnOf(n) === 'session'`; `noteLine` prints the newest message and `(+<n> earlier)` and loses `↳ changed:`; `notes show --id <id>` added; `pickupLinesFor` filters the same way |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2: `POST /__notes/reopen`'s session arm loses its `status !== 'addressed'` refusal and keeps the non-empty-text one. D4: `POST /__notes/resolve` takes and validates `verdict`. D4: `GET /__notes/list` drops `'dropped'` notes |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5: `colorFor` takes a turn; `regionInfo` returns it. D6: the outdated box and its Re-place action unchanged. D7: the card's reject-only `Send back` box becomes a `Reply` box present on every non-terminal note; `Accept`/`Reject` post an explicit verdict |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D5: `rowOpen` emits `data-turn`, `data-status` retired; the rail and tab counts derive their colour from whether any note needs the person. D7: the row renders the newest message, `+<n> earlier`, and `Reply`/`Approve`/`Reject` |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D2: the reply control sends the person's text to `/__notes/reopen` (today it posts no text and the refusal is swallowed). D4: `Approve`/`Reject` post an explicit verdict. D5: `recount` re-derives counts and their colour from `data-turn` |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D5: `.rv-row`, `.rv-pin`, `.rv-badge`, `.rv-tabpin` key on `data-turn` instead of a fixed `var(--v-warn)`; the `.nl-region` comment block is rewritten to describe the turn register truthfully. D7: the card's reply box and the row's `+<n> earlier` line |
| design/chrome-mocks/notes.html | MODIFY | doctrine | D7: the card's `Reply` box on every non-terminal note; `Reject` becomes the terminal hide and a `Send back` reply is the reply box; the prototype's `STATUS_COLOR` map becomes the turn map |
| design/chrome-mocks/review.html | MODIFY | doctrine | D5/D7: the row's turn colours, the newest-message line, `+<n> earlier`, and the three row controls |
| docs/adr/0025-a-note-is-a-conversation.md | CREATE | doctrine | D9: the amendment ADR |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1-D8: the page-notes paragraph's asymmetric-loop sentence, the `reply` verb, the resolve verdict, the turn register, and the `notes open` summarisation rule |
| tests/mocks/note-conversation.test.js | CREATE | tests | AC-20260913-05-1, AC-20260913-05-2, AC-20260913-05-4, AC-20260913-05-5, AC-20260913-05-6, AC-20260913-05-7, AC-20260913-05-11, AC-20260913-05-13, AC-20260913-05-14, AC-20260913-05-15, AC-20260913-05-16 |
| tests/mocks/client-region.test.js | MODIFY | tests | AC-20260913-05-8 — the executed four-role colour check, extended to every role and re-pointed at the turn register (closes q259) |
| tests/mocks/review-chrome.test.js | MODIFY | tests | AC-20260913-05-10 — the screen badge's colour now answers "does this need me" |
| tests/mocks/review-page.test.js | MODIFY | tests | AC-20260913-05-12 — the row's newest message, `+<n> earlier` and three controls |
| tests/mocks/review-browser.test.js | MODIFY | tests | AC-20260913-05-3, AC-20260913-05-9 — the reply control carries text; the counts re-derive from `data-turn` |
| tests/mocks/client-walk-route.test.js | MODIFY | tests | D4: the client route's own `resolution: 'accepted'` pin, retagged to the shared verdict contract |
| tests/mocks/walk-page.test.js | MODIFY | tests | D4: the client index's withdrawn/waived sentences, unchanged in substance, re-pointed at the explicit verdict |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

**Orchestrator duty (outside the table).** Append one `- Amended by: ADR-0025 — <one line>`
header line to each of `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md`,
`specs/20260902/10-page-notes-review-loop.md` and
`specs/20260912/06-the-review-page-answers-to-a-design.md`. No other text in those three files
changes.

## Contracts

```js
// lib/mocks-notes.js — the one derivation every surface reads.
// 'session' waiting on the AI · 'you' waiting on the person · 'done' approved · 'dropped' rejected
function turnOf(n) {
  if (n.status === 'resolved') return n.resolution === 'withdrawn' ? 'dropped' : 'done'
  return (n.addressed || n.reply) ? 'you' : 'session'
}
```

Exports removed: `replyNote`. Export added: `turnOf`.

```
turn      colour token      where it shows
session   var(--v-danger)   box tint · box badge · row border · pin · tab pin
you       var(--v-warn)     the same four
done      var(--v-ok)       the same four
dropped   —                 not rendered anywhere

count badge   var(--v-warn) when any note under it is turn 'you'
              var(--v-danger) otherwise · absent at zero
```

HTTP, changed bodies only:

```
POST /__notes/reopen  { id, by, text }             # text required; any prior status accepted
POST /__notes/resolve { id, by, verdict }          # verdict: "accepted" | "withdrawn"
```

CLI, changed verbs only:

```
notes address --id <id> --change "<what changed, or what I am asking>" [--ledger <row>] [--port <n>]
notes show --id <id>        # one note's whole thread, oldest first
notes open                  # only notes whose turn is the session's
# `notes reply` is deleted
```

## UI

`design_source: design/chrome-mocks/notes.html` (the note card) and
`design/chrome-mocks/review.html` (the inspector row) are both edited by this spec and stay the
binding references.

**The note card** (notes layer, shadow root; rendered by `notes-layer.browser.js`'s
`openNoteCard`, posted by its own `api()` helper). Header badge in the turn colour · the thread,
oldest first, the person's messages and the session's distinguished as today · a `Reply`
textarea and button on every non-terminal note · `Approve` and `Reject` on a note whose turn is
`you` · the `…` menu keeping `Re-place the box` on an outdated note and `Delete` on an
untouched one.

**The inspector row** (review page, light DOM; rendered by `review-page.js`'s `renderNoteRow`,
posted by `review.browser.js`). The note's own words · the newest message beneath them ·
`+<n> earlier` when the thread holds more · `Reply`, `Approve`, `Reject`.

**The three controls, specified three ways** (pipeline rules § Planning):

| control | the sentence on success | the path back | farthest artifact reached |
|---|---|---|---|
| `Reply` | the card re-renders with your words as the newest message and the note turns red — `Sent to the session` | reply again, or approve or reject the note | `design/mocks/notes.json`'s `thread` array — no dated or contractual artifact |
| `Approve` | `Approved <id>` with an `Undo` for five seconds | after the undo window, `Reply` un-approves the note and hands it back to the session (D2 accepts any prior status) | the note's `resolution: "accepted"`; a journey's approval gate counts unresolved notes, so this can unblock `--mark journey-approved` |
| `Reject` | `Rejected <id> — it stays in the file` with an `Undo` for five seconds | after the undo window, `Reply` brings it back (same rule); the record is never erased | the note's `resolution: "withdrawn"`; same gate consequence as Approve |

**Empty state.** An inspector filtered to `Needs you` with nothing waiting shows the existing
empty state; no new copy is authored.

## Data Model

`design/mocks/notes.json` — no note is rewritten, moved or deleted by this spec, and no
migration runs.

- `thread` becomes the whole conversation. Its element shape is unchanged:
  `{ at, text, by, addressed? }`.
- `reply` stops being written. The seven notes on the real host that carry one keep it, and it
  is read as the session's newest message (D3). Measured (A3): no note anywhere carries both a
  `reply` and an `addressed`, so no ordering is ambiguous.
- `resolution` is written on every session-route resolve from now on. Notes resolved before this
  spec carry none; `turnOf` reads a missing `resolution` as `'done'`, which is what the five
  already-resolved notes on the real host are.
- `status` is unchanged in shape and stays the persisted field; `turnOf` is derived on every
  read and never stored.

## Behavior

The owner opens a screen. A red box is one the session has not answered; an amber box is one
where the session answered and is waiting on them; a green box is approved; a rejected one is
not drawn at all. The same three colours carry the inspector row, its pin, and the state tab's
count, and a screen's count badge is amber exactly when something on it needs them.

They click a box. The card shows the whole exchange oldest-first with a reply box under it.
They type and send: their words become the newest message, the note turns red, and the session
owns the turn. They can do this as many times as they like; nothing caps a thread and nothing
refuses a second reply.

When they are satisfied they press `Approve` and the note turns green. If they decide the note
was wrong, `Reject` and it disappears from every surface — still on disk, still recoverable by
replying to it, never shown again unless they do.

The session runs `notes open`. It gets only the notes where the turn is its own, one line each,
carrying the newest message it has not read. A note it replied to or fixed is not in that list
and stays out of it until the owner writes again. When it needs one note's history it asks for
that note by id.

## Acceptance Criteria

- **AC-20260913-05-1**: WHEN `turnOf` is called THE SYSTEM SHALL return `'session'` for
  `{status:'open'}`, `'you'` for `{status:'open', addressed:{change:'x'}}`, `'you'` for
  `{status:'open', reply:'x'}`, `'you'` for `{status:'addressed', addressed:{change:'x'}}`,
  `'done'` for `{status:'resolved'}`, `'done'` for `{status:'resolved', resolution:'accepted'}`
  and `'dropped'` for `{status:'resolved', resolution:'withdrawn'}`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-2**: WHEN `POST /__notes/reopen {id, by, text:"still wrong"}` is requested
  against a note whose status is `open`, then again against the same note, then against a note
  whose status is `resolved` THE SYSTEM SHALL answer `200` each time, leave each note
  `status:"open"` with `addressed`, `reply`, `resolution` and `withdrawReason` all null, and
  grow that note's `thread` by exactly one entry per call
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-3**: WHEN the review page's reply control is clicked with text in its box
  THE SYSTEM SHALL post a body carrying a non-empty `text` field to `/__notes/reopen`
  → rewrites tests/mocks/review-browser.test.js :: AC-20260912-06-11:
- **AC-20260913-05-4**: WHEN `notes reply --id N001 --text "x"` runs THE SYSTEM SHALL exit 2
  with a refusal naming the accepted `notes` subcommands, which SHALL NOT include `reply`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-5**: WHEN a note carrying `{status:'open', reply:'we changed it'}` and no
  `addressed` is rendered THE SYSTEM SHALL show `we changed it` as its newest message, and
  `design/mocks/notes.json` SHALL still carry that note's `reply` string, byte-identical, after
  the render
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-6**: WHEN `POST /__notes/resolve {id, by, verdict:"accepted"}` and
  `POST /__notes/resolve {id, by, verdict:"withdrawn"}` are each requested against a note THE
  SYSTEM SHALL write `resolution:"accepted"` and `resolution:"withdrawn"` respectively, and a
  body carrying no `verdict` or an unrecognised one SHALL answer `400` naming both accepted
  values
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-7**: WHEN a store holds one `resolution:"withdrawn"` note and one open note
  THE SYSTEM SHALL return only the open note from `GET /__notes/list?screen=**`, print only the
  open note from `notes open`, and count only the open note in the review page's rail
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-8** `[env: CHROME_BIN]`: WHEN a served mock page paints its region boxes THE
  SYSTEM SHALL resolve each turn to a distinct colour — `session` → `rgb(220, 38, 38)`,
  `you` → `rgb(217, 119, 6)`, `done` → `rgb(22, 163, 74)` — SHALL draw no box for a `dropped`
  note, and SHALL use exactly these three tokens, no fourth, for a box whose anchor no longer
  resolves (which keeps `rgb(115, 115, 115)`, the existing muted treatment, and is not a turn)
  → rewrites tests/mocks/client-region.test.js :: AC-20260912-12-22:
- **AC-20260913-05-9**: WHEN a note whose turn is `you` is rendered in the review page's
  inspector THE SYSTEM SHALL emit a reply control, an approve control and a reject control on
  that row, and clicking approve SHALL post `verdict:"accepted"`
  → rewrites tests/mocks/review-browser.test.js :: q241: resolving
- **AC-20260913-05-10** `[env: CHROME_BIN]`: WHEN a screen carries at least one note whose turn
  is `you` THE SYSTEM SHALL paint that screen's rail badge in `var(--v-warn)`; WHEN its notes
  are all turn `session` THE SYSTEM SHALL paint it `var(--v-danger)`; WHEN it carries none THE
  SYSTEM SHALL render no badge
  → rewrites tests/mocks/review-chrome.test.js :: AC-20260912-06-9,
- **AC-20260913-05-11**: WHEN the review page is rendered THE SYSTEM SHALL emit each note row
  with a `data-turn` attribute of `session`, `you` or `done`, and SHALL emit no `data-status`
  attribute on a note row
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-12**: WHEN a note whose thread holds three messages is rendered in the
  inspector THE SYSTEM SHALL show the newest message's text and the literal `+2 earlier`, and
  WHEN a note's thread is empty THE SYSTEM SHALL show no `earlier` count at all
  → rewrites tests/mocks/review-page.test.js :: AC-20260912-06-1
- **AC-20260913-05-13**: WHEN `notes open` runs on a store holding one note whose turn is
  `session`, one whose turn is `you`, one `done` and one `dropped` THE SYSTEM SHALL print
  exactly one note line, for the `session` one, and its output SHALL contain no occurrence of
  `↳ changed:`
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-14**: WHEN `notes open` prints a note whose thread holds four messages THE
  SYSTEM SHALL print that note's newest message text followed by ` (+3 earlier)`, and WHEN it
  prints a note with an empty thread THE SYSTEM SHALL print the note's own text with no
  `earlier` suffix
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-15**: WHEN `notes show --id N001` runs THE SYSTEM SHALL print that note's own
  text first and then every thread entry oldest-first, one per line, each naming its author
  → writes tests/mocks/note-conversation.test.js
- **AC-20260913-05-16**: WHEN every tracked file under `spec/`, `tests/`, `scripts/` and
  `design/` is searched THE SYSTEM SHALL yield zero occurrences of `replyNote` or of the
  driver subcommand literal `notes reply`; and `docs/adr/0025-a-note-is-a-conversation.md` SHALL
  parse with `Status: accepted`, a non-empty `## Dissents` section, and an `## Applies to`
  section naming `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md`
  → writes tests/mocks/note-conversation.test.js

## Assumptions (escalation triggers)

- A1: **The legacy half of `turnOf` classifies real data correctly.** Executed 2026-09-13 over
  `/Users/jj/Projects/hearwell/design/mocks/notes.json`: of the 21 person-written notes, 14
  carry an `addressed`, 5 carry a `reply` with `status:"open"`, 2 are resolved and 2 are
  untouched — so `turnOf` puts 17 on the owner, 2 on the session and 2 done, which matches what
  a reader of those notes would say. — **if false:** a note is classified onto the wrong side
  and the owner sees a colour that lies; STOP, ask the user before changing the expression.
- A2: **The review page's reject control has never worked.** Executed 2026-09-13 against a real
  `design-atlas.js serve` on a one-note fixture: `POST /__notes/reopen {id, by}` → `400
  {"error":"say what is still wrong — text must be non-empty"}`; the same body with
  `text:"still wrong"` → `200`, `status` `addressed`→`open`, thread grown by one entry carrying
  the prior `addressed` object. `review.browser.js`'s `closeNote` posts `{id, by}` and swallows
  the rejection in a comment-only `.catch()`. — **if false:** the control works by some path
  not read here; keep the text field anyway, since D2 needs the words.
- A3: **`reply` is dead on the write side and unambiguous on the read side.** Executed
  2026-09-13: a repo-wide search finds no reader of `.reply`'s value outside fixture literals
  carrying `reply: null`; over the real host, notes carrying both `addressed` and `reply` = 0,
  `reply` only = 7, `addressed` only = 14. — **if false:** a note with both needs an order the
  data cannot supply; render `addressed` last (it is the only one with a timestamp) and record
  the deviation.
- A4: **Approve and Reject are byte-identical today on the session route.** Executed
  2026-09-13 against `resolveNote` directly: resolving an `addressed` note and an `open` note
  with no options both yield `{status:"resolved", resolution:absent, withdrawReason:absent}`;
  the same two calls with `viaClient:true` yield `accepted` and `withdrawn`. — **if false:**
  some caller already passes a verdict; reuse it rather than adding a parameter.
- A5: **The sweep's measured baseline and its measured result.** Executed 2026-09-13:
  `notes open` on the real host prints 64 lines / 10,300 bytes for 34 notes, of which the
  questions block is 25 lines / 3,908 bytes (deleted by specs/20260913/04) and the
  `↳ changed:` continuations are 3,474 bytes across 12 notes (34% of the whole). Applying D8's
  filter to the 21 person-written notes leaves 2 notes on the session's turn, 17 on the
  owner's, 2 done. — **if false:** the filter is keeping more than intended; the numbers are
  evidence for the Decision, not a promise, so record the real figure and continue.
- A6: **`0025` is the next free ADR number once 03's `0023` and 04's `0024` land.** — **if
  false:** take the next free number and amend D9, the File Plan row, AC-20260913-05-16 and
  every backlink in the same build.

## Rationale

Almost everything this spec promises is already in the tree; what is missing is one wire, one
parameter and one register. The thread exists, is append-only, and is already rendered by the
mock page's card and by the client's own pages. The route that appends to it already insists the
person say what is wrong. What has never existed is a way to reach it from the review page —
the control is there, posts the click without the words, and the refusal is discarded by a
`.catch()` with a comment in it. That is why the owner's recollection that "Reply already
exists" and my own reading that it did not were both right about different halves.

D1 is the load-bearing choice. A derived turn, rather than a fourth persisted status, means no
migration, no timestamps on the legacy replies (which have none), and one expression every
surface reads. It also makes the register honest: the colour answers "whose turn is it", which
is the question the owner actually asked, rather than "what status word is stored", which is
the question the page answers today and gets wrong by folding `addressed` into `open`.

D4 exists because the store physically cannot express what the owner asked for. A4 measured
that approving and rejecting write identical records on the session route while the client's
route has recorded the difference since it shipped — so hiding rejected notes is not a new
concept to design, it is one route catching up.

D5 reverses half of a ruling made the same day. The box half of D17 — that a box tracks its own
state rather than the chrome's flat orange — is correct and is exactly what this spec extends;
what reverses is the other half, that the chrome may keep a fixed orange that tracks nothing.
Recording that in an ADR rather than quietly editing matters because D17 is pinned by an
executed test and reads as current.

Adversarial check, rejected: a reviewer could argue `turnOf` should be persisted so a store is
readable without the library. Rejected — a derived value that is also stored is a value that can
disagree with itself, and this exact class of drift is what made an addressed note and an open
note the same colour in the first place.

Two lock-time sweep results are recorded here rather than fixed. `data-status` is not a retired
literal and is deliberately absent from AC-20260913-05-16's ban list: the same attribute name
carries a mock's own `data-status="ratified|approved"` on 30-odd files that have nothing to do
with notes, so AC-20260913-05-11 bans it only on a note row and a worker must not widen that to
a repo-wide sweep. `lib/walk-page.js` mentions `colorFor` in a comment and keeps a parallel
register for the client's own request rows; D5 states explicitly that it is out of scope, so the
hit is a recorded waive, not a gap.

The zero-hit sweep (AC-20260913-05-16) covers `spec/`, `tests/`, `scripts/` and `design/` — the
executable and test surface this spec's File Plan owns. The retired names in
`docs/canonical/design.md` are corrected by the Canonical Delta below, which the review
stage applies at close; sweeping that file at build time would redden the gate against text
the build is not allowed to write.

## Canonical Delta

`docs/canonical/design.md` § Page notes: replace "The loop is asymmetric: the session addresses
(`open → addressed`, with the change and an optional ledger row recorded under the note) and
replies; the author resolves on the page after a re-look; no driver subcommand resolves" with —
"The loop is a conversation with one rule: whoever speaks last hands the turn to the other. The
session speaks with `notes address` (its one verb — a fix or a follow-up question, recorded
under the note with an optional ledger row) and the note becomes the author's turn; the author
replies on the page as often as they like and the note becomes the session's turn again; only
the author ends it, with Approve (`resolution: "accepted"`, green) or Reject
(`resolution: "withdrawn"`, hidden from every surface and kept on disk). No driver subcommand
resolves and the session has no route that does. `turnOf(n)` in `lib/mocks-notes.js` is the one
derivation of that state — `session` red, `you` amber, `done` green, `dropped` not drawn — and
every surface reads it: the box, its badge, the inspector row, its pin and the state tab's
count. A count badge is amber exactly when one of its notes needs the author. A region whose
anchor no longer resolves keeps the existing muted box and its Re-place action and is not a
fourth state. `reply` is retired as a verb and a field; a stored one is read as the session's
message and never written again." In the same section, replace the `notes open` summarisation
sentence with — "`notes open` lists only the notes whose turn is the session's, one line each
carrying the newest message plus `(+<n> earlier)`; a note the session has answered leaves the
list until the author writes again, so every message is read exactly once. `notes show --id
<id>` prints one note's whole thread for a session that needs its history." Update the writer
list: `replyNote` out, `turnOf` in.
