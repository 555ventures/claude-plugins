---
date: 2026-09-11
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/05-what-the-journey-does-not-do.md, specs/20260911/01-the-page-waits-for-the-server.md]
depended_on_by: [specs/20260911/05-approval-is-bookkeeping.md]
brief: 22a
open_markers: 0
---

# The client loop: a journey's state follows the client's requests, the session picks up what the client left, and the served pages outlive every session

## Goal

Today the client player is a one-way form: the client walks, presses OK, leaves a note, and
nothing ever comes back to them — the player never shows that a note was addressed, has no
control to accept or reject a fix, has no place to say "a screen is missing", and doctrine tells
the session to stop the server at the end of every session. This spec turns it into the loop JJ
asked for: a journey's state is derived from the client's own requests (`changes requested` →
`fixed — please check` → `OK`, and a new request on an OK'd journey reopens it), the client
index carries a "something missing?" composer and a list of everything they asked for with its
status, the session's CLIENT step prints exactly what the client left and the one command that
answers each item, and the client server is the user's own long-lived process that no session
starts or stops. Done means a client can request, see the fix, request again, and OK — days
apart, across closed sessions — until the session approves.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/mocks-walk.js` exports `journeyState(walk, notes, labels)` → one of `unseen \| walking \| changes-requested \| fixed \| ok \| waived`, derived, never stored: `waived` when the record carries `waived`; else `changes-requested` when any client-origin non-question note (`originOf(n) === 'client'`, `n.kind !== 'question'`, `scope: 'mock'`, `screen` in `labels`) has `status: 'open'`; else `fixed` when any such note has `status: 'addressed'`; else `ok` when `confirmedAt` is set; else `walking` when `reached` is non-empty; else `unseen`. It also exports `unconfirmJourney(walk, { journey, at, cause })`: moves `{ confirmedAt, sentence }` into `journeys[j].history` (appended `{ confirmedAt, sentence, clearedAt: at, cause }`), nulls both, and is a no-op returning the same shape when the journey is not confirmed (AC-20260911-04-1) | The state the client sees and the state the session prints are one function of disk; an open request outranks a stale OK by construction |
| D2 | `design-atlas.js` client route: `POST /client/__notes/add` with `scope: 'mock'` whose `screen` belongs to a journey that is currently confirmed additionally runs `unconfirmJourney` (`cause: '<noteId>'`) in the same synchronous pass after the note write — the OK is taken back by the client's own new request. New `POST /client/__notes/reopen { id, text }` (client route only, non-client path 404): on an `addressed` client-origin note sets `status: 'open'`, appends `{ at, text, by: 'client', addressed: <the prior addressed object> }` to `note.thread` (created when absent), nulls `addressed`, stamps `lastClientAt`; 400 when the note is not client-origin or not `addressed` (naming its status), 400 on empty `text`, 404 unknown id. `POST /client/__walk/confirm` answers 409 `journey "<j>" has <n> request(s) still open or waiting for your check — answer them first` while `journeyState` is `changes-requested` or `fixed`, before the existing unanswered-guess check; a journey whose confirmation was taken back confirms again through the same route (the `already confirmed` 409 no longer applies once `confirmedAt` is null). `GET /client/index.html` passes `ready`: the set of journey names whose `status.journeys[<j>].walked` is set in `design/mocks/status.json` (absent file → empty set) (AC-20260911-04-2, AC-20260911-04-3, AC-20260911-04-4) | The route enforces the rule the page shows (spec 20260911/01's lesson): OK is impossible while a request is open, and a request reopens an OK |
| D3 | `lib/mocks-notes.js`: `addressNote(notes, id, { change, ledgerRow, capture, screen, journey })` stores `addressed.screen` / `addressed.journey` when given; `validateNotes` accepts `thread` (array) and the two pointer fields, rejecting a `thread` that is not an array. `PLAIN_REASONS` is unchanged (`missing-screen` already exists) (AC-20260911-04-5) | A "we added it" answer to a missing-screen request must point the client somewhere; the pointer is the only new fact |
| D4 | `lib/walk-page.js` `buildClientIndex({ seed, notes, ledger, walk, prefix, themeOpen, ready })`: each journey row (`<a data-cl="journey">` when `ready` has the journey, else a `<span data-cl="journey" data-ready="false">` with no `href`) carries `data-state="<journeyState>"` and renders the state text — `Not started`, `In progress`, `Changes requested (N)`, `Fixed — please check (N)`, `OK`, `Skipped`, or `Coming soon` for a not-ready journey; N counts the notes D1 counted. Below the list: `<form data-cl="ask">` ("Something missing?") with a textarea, two reason chips `<button data-cl="reason" data-value="missing-screen">A screen is missing</button>` / `data-value="other"` ("Something else"), and Send; then `<section data-cl="requests">` listing every client-origin non-question note (project and mock scope, newest first) as `<article data-cl="request" data-id data-status="open|addressed|resolved">` with its text, its screen when mock-scope, and a status line: open → `We'll look at this`; addressed → `Done: <addressed.change>` plus a link `See <journey title>` to `/client/walk/<j>.html` when `addressed.journey` or `addressed.screen` resolves to a journey, plus `<button data-cl="accept">Looks good</button>` and `<button data-cl="reopen">Still not right</button>` with a `<textarea data-cl="reopen-text">`; resolved → `Closed` (or `Closed — thank you` when `resolution: 'accepted'`). One `<p data-wk="msg" data-saved="Saved. We'll fix this and let you know here." data-failed="That did not save. Please try again." data-why="Please say what is missing first." hidden>` (AC-20260911-04-6) | The index is the client's inbox: everything they said, what we did about it, and one control each way |
| D5 | `buildWalkPage` gains, in the side panel above the note form, `<section data-wk="requests">` with one `<article data-wk="request" data-id data-label data-status hidden>` per client-origin non-question mock-scope note on the journey (all labels; `walk.browser.js` shows the current screen's), rendering the same status line, `Looks good now` (`data-wk="accept"`) / `Still not right` (`data-wk="reopen"` + `<textarea data-wk="reopen-text">`) pair on an addressed one. The approve section's lead reads by state: `fixed` → `We fixed what you asked. Check the screens marked Fixed, then confirm.`; `changes-requested` → `You asked for changes. We'll fix them and let you know.`; the confirm button carries `disabled` while `journeyState` is `changes-requested` or `fixed` (in addition to the existing marks/exclusions count), and the confirmed read-only render is used only when `confirmedAt` is set AND the state is `ok`. The msg slot gains `data-saved="Saved. We'll fix this and let you know here."` (AC-20260911-04-7) | The walk page is where a fix is checked against the screen it changed; the OK control obeys the same rule the route enforces |
| D6 | `lib/walk.browser.js`: on the index, the ask form posts `POST /client/__notes/add { scope:'project', reason, text, by:'client' }` (reason from the selected chip, default `other`) and on `ok` clears the textarea, shows `data-saved`, and inserts the new request article at the top of `[data-cl="requests"]` with status `open`; `accept` posts `POST /client/__notes/resolve { id, by:'client' }` and on `ok` sets the article's `data-status="resolved"` and status text `Closed — thank you`; `reopen` with empty text shows `data-why`, else posts `POST /client/__notes/reopen { id, text, by:'client' }` and on `ok` sets `data-status="open"` and `We'll look at this`. On the walk page the same three handlers drive `[data-wk="request"]`; the note form's `ok` additionally shows `data-saved` and appends a `request` article for the current screen; a request article is visible only when its `data-label` is the current screen. Every save acts only on `ok === true` (spec 20260911/01 D4's rule, unchanged); after an accept or reopen on the walk page the confirm button's disabled state is recomputed from the articles' statuses (any `open` or `addressed` on the journey → disabled) (AC-20260911-04-8, AC-20260911-04-9) | The three controls are the return leg; a receipt on every write ends the "did that save?" second click |
| D7 | `mocks-driver.js`: `client open --address <url> [--port <n>]` records `status.client = { address, port, openedAt }` — `port` from `--port`, else the address's own port when its host is `localhost` or `127.0.0.1`, else refused naming `--port <n>` (the server's local port, which the capture needs); the probe and the printed line are unchanged. `notes address` reads `--port` from `status.client.port` when the flag is absent (the flag still wins); a client-origin project-scope note is addressed when `--screen <label>` (a mock on disk) or `--journey <j>` (a seed journey) is given, stored on `addressed`, and refused otherwise naming both flags. The CLIENT step block prints, in order: `server: answering — <address>/client/index.html` or `server: NOT answering — start it in your own terminal and keep it running until approval: node <atlas> serve --root <root> --port <port>` (3 s probe of `<address>/client/__notes/list`, the same probe `client open` runs; `client: not opened — …` when `status.client` is absent, as today); one line per seed journey `<j>: <state>` where state prints as `not started`, `walking <n>/<total>`, `changes requested (<n>)`, `fixed — waiting for the client (<n>)`, `ok — "<sentence>"`, `skipped — <reason>`; then `📥 what the client left:` followed by one line per client-origin non-question note that is not `resolved`: `  <id> <open|addressed> · <screen|project> · "<text>"` and, for an open one, the exact next command on the following line (`notes address --id <id> --change "<what changed>"`, plus ` --screen <label>` hint for a project note); `  nothing new` when none. The `client notes: A open · B addressed …` counts line is retired. The session never starts or stops the client server while the state is CLIENT (AC-20260911-04-10, AC-20260911-04-11) | The pickup surface JJ asked for is the CLIENT step itself, derived from disk on every run; the server is the user's process, so the step checks it and names the command rather than owning it |
| D8 | `--reopen journey:<j>` additionally runs `unconfirmJourney` (`cause: 'reopen'`) on `walk.json` — a redrawn journey is a different journey to OK (AC-20260911-04-12) | Structural change asks for a fresh walk; a content fix does not (D1/D2) |
| D9 | `spec/doctrine/mocks.md`: § Mocks: Look and Serve's tracked-background-task sentence is narrowed to the authoring states, and a new sentence states that in CLIENT the server is the user's own process — started once in the user's terminal, kept running until `approved`, never started, stopped, or probed for liveness by any script except the CLIENT step's answering/not-answering line; § Mocks: Page Notes' "Only the client resolves a client note" paragraph names the two page controls (`Looks good` accepts an addressed note, `Still not right` reopens it with the client's text on `thread`) and the session's `--screen`/`--journey` answer to a project-scope request; § Mocks: Client Player gains a paragraph naming the six derived states and the rule that a request reopens an OK; § Mocks: State Machine's CLIENT sentence reads "closes when every journey is `ok` or waived …". `spec/commands/mocks.md` § Client review is rewritten as the pickup loop: run the driver, read `📥 what the client left`, answer each line with its printed command, re-run; the server sentence names the user's terminal. `spec/commands/mocks.md`'s look-rule sentence "stop it at sign-off or session end" gains "(authoring states only — the CLIENT server is the user's, § Mocks: Look and Serve)" (AC-20260911-04-13) | Doctrine binding homes; the "stop at session end" sentence is what made the loop impossible |
| D10 | `spec/templates/mocks/viewer.css` gains the `.wk-req*` / `.wk-ask*` register (request articles, status line, accept/reopen pair, the index composer, the `Coming soon` row), authored in-session under the `frontend-design` skill on the `--v-*` roles [no-ac: appearance] | Client-facing chrome is a designed surface (design.md) |
| D11 | Before `/spec:review` runs, the building session serves a scratch project advanced to CLIENT (the `client-loop` test's own fixture path) and prints one 🎨 look stop with the `/client/index.html` URL and one walk URL; JJ replies approve or change, and a `change` reply is a build fix, never a review waive. This host declares no `design` block, so `design: true` is inert here and the look stop is the design gate [no-ac: a printed stop, decided by JJ] | The § Planning rule: client-facing chrome is seen before review, not after |
| D12 | `tests/helpers.js` `serveAtlas(root, { port, script, env })` passes `env` to `spawn` when given (default unchanged) [no-ac: test harness seam — exercised by every AC in `tests/mocks/client-loop.test.js`] | The end-to-end test needs the stubbed screenshot on the server's PATH |
| D13 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D14 | Retired in this spec and deleted in the same build: the driver's `clientNoteCounts` and the `client notes: … open · … addressed` counts line (replaced by D7's lines), and the walk page's unconditional read-only confirmed render (D5). No test outside the File Plan pins either literal (grep at lock: zero hits in `tests/`) (AC-20260911-04-14) | Refactors delete what they retire (memory: refactor-deletes-dead-code-and-tests) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-walk.js | MODIFY | scripts | D1 `journeyState`, `unconfirmJourney`, `history` |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D3 `addressed.screen/journey`, `thread` validation |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2 reopen route, add-unconfirms, confirm 409 by state, index `ready` |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D4 index states/composer/requests; D5 walk requests, state-aware approve |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D6 ask/accept/reopen handlers, receipts, confirm recompute |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D7 `client open --port`, `notes address` defaults and `--screen/--journey`, CLIENT step pickup; D8 reopen unconfirms; D14 deletes `clientNoteCounts` |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D10 `.wk-req*` / `.wk-ask*` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D9 |
| spec/commands/mocks.md | MODIFY | doctrine | D9 § Client review as the pickup loop; look-rule sentence |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D13 bump |
| tests/helpers.js | MODIFY | tests | D12 `serveAtlas` `env` |
| tests/mocks/client-loop.test.js | CREATE | tests | AC-20260911-04-1, AC-20260911-04-10, AC-20260911-04-11, AC-20260911-04-12, AC-20260911-04-14 — the end-to-end loop, client-first, driver re-run between acts |
| tests/mocks/client-walk-route.test.js | MODIFY | tests | AC-20260911-04-2, AC-20260911-04-3, AC-20260911-04-4, AC-20260911-04-5 |
| tests/mocks/walk-page.test.js | MODIFY | tests | AC-20260911-04-6, AC-20260911-04-7, AC-20260911-04-8, AC-20260911-04-9 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260911-04-13 |

## Contracts

```js
journeyState(walk, notes, ['signin','invite','consent','session-live'])
// no record                                     → 'unseen'
// reached:['signin','invite']                   → 'walking'
// confirmedAt set, no client note on labels     → 'ok'
// confirmedAt set, N003 open on 'invite'        → 'changes-requested'   (open outranks the OK)
// N003 addressed, none open                     → 'fixed'
// waived: {…}                                   → 'waived'

unconfirmJourney(walk, { journey:'onboarding', at, cause:'N003' })
// → journeys.onboarding = { …, confirmedAt:null, sentence:null,
//     history:[{ confirmedAt:'2026-09-12T…', sentence:'Looks right', clearedAt:at, cause:'N003' }] }
```

```
POST /client/__notes/reopen  {id:'N003', text:'Still says Submit on mobile', by:'client'}
  → 200 note {status:'open', addressed:null, thread:[{at, text, by:'client', addressed:{…prior}}]}
  · 400 {error:'note "N003" is open — only an addressed note is reopened'}
  · 400 {error:'note "N004" is session-origin — the client route reopens only client-origin notes'}
  · 404 unknown id · POST /__notes/reopen (non-client) 404
POST /client/__walk/confirm  {journey, sentence}
  → 409 {error:'journey "onboarding" has 1 request(s) still open or waiting for your check — answer them first'}
GET  /client/index.html  → rows carry data-state="changes-requested" data-cl="journey"; a not-walked journey renders
     <span data-cl="journey" data-ready="false">…Coming soon</span>
```

```
$ mocks-driver.js --root . client open --address https://mac.tail.ts.net --port 4173
client: open — https://mac.tail.ts.net/client/index.html
$ mocks-driver.js --root .            # CLIENT step block, excerpt
server: answering — https://mac.tail.ts.net/client/index.html
onboarding: changes requested (1)
billing: ok — "Matches what I expected"
📥 what the client left:
  N003 open · invite · "The invite button should say Send, not Submit"
      notes address --id N003 --change "<what changed>"
  N005 open · project · "There is no password reset screen at all"
      notes address --id N005 --change "<what changed>" --screen <label> | --journey <j>
$ mocks-driver.js --root .            # server down
server: NOT answering — start it in your own terminal and keep it running until approval: node <atlas> serve --root <root> --port 4173
```

## UI

Client index (`/client/index.html`, English chrome, mocks untouched): the journey list with one
state word per row; below it the composer — "Something missing?", a textarea, two chips
("A screen is missing", "Something else"), Send — and "Your requests": each request with its
text, screen, and status; an addressed one shows "Done: <what we changed>", a "See <journey>"
link when we pointed it somewhere, and the pair "Looks good" / "Still not right" (with a text
box). Every write answers in the one status line: "Saved. We'll fix this and let you know here."
Walk page: the same request cards for the current screen sit above the note box; the approve
lead changes with the state; the OK button is disabled while a request is open or waiting for
their check. Rendered by `lib/walk-page.js`, driven by `lib/walk.browser.js`, posted to
`design-atlas.js`'s client route — every control named here has its file and its caller.

## Data Model

`design/mocks/walk.json`: `journeys[j]` gains optional `history: [{ confirmedAt, sentence,
clearedAt, cause }]`. `design/mocks/notes.json`: a note gains optional `thread: [{ at, text, by,
addressed }]` and `addressed` gains optional `screen` / `journey`. `design/mocks/status.json`:
`client` gains `port`. All additive; `validateNotes` accepts their absence.

## Behavior

The client opens the index and sees each journey's state in one word. They walk one, leave a
request on a screen, and see "Saved". If they had already pressed OK, the OK is taken back by
their own request and the row reads "Changes requested". Days later a session runs the driver:
the CLIENT step says whether the server is answering, lists each journey's state, and prints
what the client left with the one command per item. The session fixes the screen, runs that
command (the capture proves the screen changed), re-runs the driver, and the row now reads
"fixed — waiting for the client". The client returns: the changed screen shows "Done: …" with
"Looks good now" / "Still not right"; accepting closes the request, rejecting reopens it with
their words. Once nothing is open or waiting, the OK control is enabled again and they confirm.
"Something missing?" on the index is a project-scope request; the session answers it by adding
the screen or journey and addressing the note with `--screen` or `--journey`, so the client's
"Done" line links straight to it. A journey the session has not walked yet is listed as "Coming
soon" with no link. Approval stays the session's own mark (spec 20260911/05 makes it plain
bookkeeping); it still waits until every journey is `ok` or waived. The server is the user's:
started once in their terminal, exposed by them, stopped by them after approval.

## Acceptance Criteria

- **AC-20260911-04-1**: WHEN `journeyState` runs over the Contracts table's six inputs THE SYSTEM SHALL return `unseen`, `walking`, `ok`, `changes-requested`, `fixed`, `waived` respectively, an `open` client note outranking a set `confirmedAt`; WHEN `unconfirmJourney` runs on a confirmed journey THE SYSTEM SHALL null `confirmedAt`/`sentence` and append one `history` entry carrying both plus `clearedAt` and `cause`, and on an unconfirmed journey SHALL return the record unchanged with no `history` entry → `tests/mocks/client-loop.test.js`
- **AC-20260911-04-2**: WHEN `POST /client/__notes/reopen {id, text:'Still says Submit', by:'client'}` runs on an `addressed` client-origin note THE SYSTEM SHALL answer 200 with `status:'open'`, `addressed:null`, and `thread[0]` carrying `text`, `by:'client'`, and the prior `addressed` object; on an `open` note 400 naming `open`; on a session-origin note 400 naming `session-origin`; with empty `text` 400; on `N99` 404; `POST /__notes/reopen` off the client mount 404 → `tests/mocks/client-walk-route.test.js`
- **AC-20260911-04-3**: WHEN `POST /client/__notes/add {scope:'mock', screen:'invite', text, by:'client'}` runs while `onboarding` (declaring `invite`) is confirmed THE SYSTEM SHALL answer 201 and `walk.json` SHALL carry `onboarding.confirmedAt: null` with one `history` entry whose `cause` is the new note's id; a second such note SHALL append no second history entry → `tests/mocks/client-walk-route.test.js`
- **AC-20260911-04-4**: WHEN `POST /client/__walk/confirm {journey:'onboarding', sentence:'ok'}` runs with an `open` client note on `invite` THE SYSTEM SHALL answer 409 whose error contains `1 request(s) still open or waiting for your check`, writing nothing; with that note `addressed` the same 409; with it `resolved` and the journey's confirmation previously taken back THE SYSTEM SHALL answer 200 and set a fresh `confirmedAt` → `tests/mocks/client-walk-route.test.js`
- **AC-20260911-04-5**: WHEN `GET /client/index.html` runs with `status.json` marking only `onboarding` walked and the seed declaring `onboarding` and `billing` THE SYSTEM SHALL render `onboarding` as `<a data-cl="journey" …>` and `billing` as `<span data-cl="journey" data-ready="false">` containing `Coming soon` with no `href`; with no `status.json` both SHALL render as spans → `tests/mocks/client-walk-route.test.js`
- **AC-20260911-04-6**: WHEN `buildClientIndex` renders with `ready` holding every journey, a client mock note `N003` `open` on `invite`, a client project note `N005` `addressed` with `addressed.change:'Added the reset screen'` and `addressed.journey:'onboarding'`, and a client note `N006` `resolved` with `resolution:'accepted'` THE SYSTEM SHALL render the `onboarding` row with `data-state="changes-requested"` and text `Changes requested (1)`, `<form data-cl="ask">` with two `[data-cl="reason"]` chips (`missing-screen`, `other`), and `[data-cl="requests"]` carrying three `[data-cl="request"]` articles — `N005` first (newest) with `data-status="addressed"`, text `Done: Added the reset screen`, an `href="/client/walk/onboarding.html"` link, `[data-cl="accept"]`, `[data-cl="reopen"]` and `[data-cl="reopen-text"]`; `N003` with `We'll look at this` and no accept button; `N006` with `Closed — thank you`; and one `[data-wk="msg"][data-saved]` slot; a session-origin note SHALL NOT render → `tests/mocks/walk-page.test.js`
- **AC-20260911-04-7**: WHEN `buildWalkPage` renders `onboarding` with `N003` `addressed` on `invite` (`change:'Button now says Send'`) and no open note THE SYSTEM SHALL render `[data-wk="requests"]` with one `[data-wk="request"][data-id="N003"][data-label="invite"][data-status="addressed"]` carrying `Fixed: Button now says Send`, `[data-wk="accept"]` and `[data-wk="reopen"]`, the approve lead `We fixed what you asked. Check the screens marked Fixed, then confirm.`, and `[data-wk="confirm"][disabled]`; with `N003` `open` the lead SHALL read `You asked for changes. We'll fix them and let you know.`; with `N003` `resolved` and `confirmedAt` set THE SYSTEM SHALL render the read-only confirmed section; with `confirmedAt` set and `N003` `open` it SHALL NOT → `tests/mocks/walk-page.test.js`
- **AC-20260911-04-8**: WHEN, under the `vm` shim, the index's `[data-cl="ask"]` submits with text `No reset screen` and the `missing-screen` chip selected and the stubbed `fetch` resolves `ok:true` with `{id:'N007'}` THE SYSTEM SHALL have posted `/client/__notes/add` with body `{scope:'project', reason:'missing-screen', text:'No reset screen', by:'client'}`, cleared the textarea, set the msg slot to its `data-saved` text, and inserted `[data-cl="request"][data-id="N007"][data-status="open"]` first in `[data-cl="requests"]`; with `ok:false` THE SYSTEM SHALL keep the text, insert nothing, and show `data-failed` → `tests/mocks/walk-page.test.js`
- **AC-20260911-04-9**: WHEN, under the `vm` shim on the walk page, `[data-wk="accept"]` on `N003` is clicked and `fetch` resolves `ok:true` THE SYSTEM SHALL have posted `/client/__notes/resolve {id:'N003', by:'client'}`, set the article's `data-status="resolved"`, and removed `disabled` from `[data-wk="confirm"]` when no other request article is `open`/`addressed` and the marks/exclusions counts are zero; WHEN `[data-wk="reopen"]` is clicked with empty `[data-wk="reopen-text"]` THE SYSTEM SHALL post nothing and show `data-why`; with text `Still wrong` and `ok:true` it SHALL have posted `/client/__notes/reopen {id:'N003', text:'Still wrong', by:'client'}`, set `data-status="open"`, and kept `[data-wk="confirm"]` disabled → `tests/mocks/walk-page.test.js`
- **AC-20260911-04-10**: WHEN `client open --address http://127.0.0.1:<p>` runs against a served scratch project in CLIENT THE SYSTEM SHALL record `status.client.port` = `<p>`; with `--address https://mac.tail.ts.net` (probe stubbed to answer) and no `--port` it SHALL exit 2 naming `--port <n>`; WHEN the bare driver then runs THE SYSTEM SHALL print `server: answering — http://127.0.0.1:<p>/client/index.html`, one `<j>: <state>` line per seed journey, and `📥 what the client left:` followed by `  nothing new`; after the client posts a mock note on `invite` and a project note (via the served client route) the bare run SHALL print `onboarding: changes requested (1)`, one `  N… open · invite · "…"` line followed by `      notes address --id N… --change "<what changed>"`, and one `  N… open · project · "…"` line followed by a command carrying `--screen <label> | --journey <j>`; with the server stopped it SHALL print `server: NOT answering — start it in your own terminal and keep it running until approval: node ` and the serve command carrying `--port <p>` → `tests/mocks/client-loop.test.js`
- **AC-20260911-04-11**: WHEN `notes address --id <mockNote> --change "Button now says Send"` runs with no `--port` after `status.client.port` is recorded and the stubbed capture returns different bytes THE SYSTEM SHALL exit 0 printing `→ addressed` (the port came from `status.client`); WHEN `notes address --id <projectNote> --change "Added the reset screen"` runs without `--screen`/`--journey` THE SYSTEM SHALL exit 2 naming both flags; with `--journey onboarding` it SHALL exit 0 and the note SHALL carry `addressed.journey:'onboarding'`; the next bare run SHALL print `onboarding: fixed — waiting for the client (1)`; after the client posts `/client/__notes/resolve {id:<mockNote>}` and `/client/__walk/confirm` THE SYSTEM SHALL print `onboarding: ok — "<sentence>"` → `tests/mocks/client-loop.test.js`
- **AC-20260911-04-12**: WHEN `--reopen journey:onboarding` runs on a confirmed journey THE SYSTEM SHALL leave `walk.json` with `onboarding.confirmedAt: null` and one `history` entry with `cause:'reopen'`, and the next bare run's derived state SHALL be `WIREFRAMES` (existing cascade) → `tests/mocks/client-loop.test.js`
- **AC-20260911-04-13**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry, in § Mocks: Look and Serve, the literal `the user's own process` and, in § Mocks: Client Player, the six literals `changes-requested`, `fixed`, `ok`, `Still not right`, `Looks good`, and `reopens`; `spec/commands/mocks.md` SHALL carry `what the client left` and `authoring states only` → `tests/consistency/design-doctrine.test.js`
- **AC-20260911-04-14**: WHEN `grep -n "clientNoteCounts\|client notes: " spec/scripts/mocks-driver.js` runs THE SYSTEM SHALL print nothing (exit 1) — the counts line and its helper are deleted, not orphaned → `tests/mocks/client-loop.test.js`
- **AC-20260911-04-15**: WHEN `POST /client/__notes/add {scope:'mock', screen, text, by:'client'}` runs THE SYSTEM SHALL CONTINUE TO capture the before-frame first and answer 201 with `capture.before`, and `POST /client/__notes/resolve` on an `addressed` client note SHALL CONTINUE TO record `resolution:'accepted'` → `tests/mocks/client-walk-route.test.js`

## Assumptions (escalation triggers)

- A1: `~/.claude/hooks/block-dev-servers.js` does not block `node …/design-atlas.js serve …` — executed at lock: `printf '{"tool_input":{"command":"node \"$(spec-paths design-atlas)\" serve --root . --port 4173","run_in_background":false}}' | node ~/.claude/hooks/block-dev-servers.js` → exit 0, no output; `npx serve` → `BLOCKED … [exit 2]`. So the only thing stopping the server at session end is plugin doctrine (D9). **If false** (a future hook blocks it): the CLIENT step's printed command is for the user's own terminal, outside Claude Code, so the hook never sees it.
- A2: `tests/helpers.js`'s `serveAtlas` spawns with no `env` option (read at lock, lines 161–210) — D12 adds it; the in-process `withHandler` harness cannot run the capture (it spawns `npx` from the server process, which needs the stub on PATH), so the loop test uses `serveAtlas` with `stubNpxScreenshot`'s PATH. **If false** (an `env` seam already exists): drop the helpers row.
- A3: `status.journeys[<j>].walked` is the readiness signal for a client-visible journey (set by `--mark journey-walked`, cleared by `--reopen journey:<j>` / `walk:<j>`). **If false**: use `approved` instead and record the departure.
- A4: `confirmJourney` refuses when `confirmedAt` is set (read at lock), so a fresh OK after a taken-back confirmation works only because D2 nulls `confirmedAt` — no change to `confirmJourney`. **If false**: STOP, ask.
- A5: The scratch harness `scratchpad/loop.js` (this session) ran the whole chain client-first against the pre-image: closing screen `0` exclusions, `notes address` → `addressed` only with a changed capture, client list shows no close path, `--mark approved` exit 2 on open exclusion rows. `tests/mocks/client-loop.test.js` is that harness made a test; its pre-image runs red on AC-10 (no `server:` line) and AC-11 (`--port` required).
- A6: No test outside this File Plan spells `client notes: `, `clientNoteCounts`, `confirmedLead`, `data-cl="journey"` with a fixed attribute order, or `wk-approve` — grep at lock over `tests/`: `data-guesses` in `tests/mocks/walk-page.test.js` (in the File Plan), nothing else. **If false**: the hit's file enters the File Plan as a fix row, retagged, never weakened.

## Rationale

JJ's requirement, in his words: the client is the source of truth and content will change; the
client sees, touches, requests; Claude Code picks up what they left, fixes, shows again; repeat
until we approve. The client may act days later, so the served pages stay up while Claude Code
exits, and a new session invokes `/spec:mocks` and sees what the client left. Clients will say
"this screen is missing". And, on the OK button: pressing OK while asking for a change is a
contradiction — the state must follow the request, an OK'd journey must be reopenable by a new
request, and everything stays open until we stop the server.

Why the state is derived (D1) rather than stored: walk.json and notes.json already hold every
fact; a stored state would be a second derivation that drifts. Why a new request takes the OK
back (D2) instead of leaving it: JJ's rule — "OKじゃないじゃん、変更したいんだったら". Why the OK
is not cleared by our fix alone: a fix without a request does not exist in this loop (every fix
answers a note), and the state already reads `fixed` until the client checks. Why `Still not
right` reopens the same note rather than creating a new one: the thread keeps the history on one
id, and the pickup line stays one line. Why the server is the user's process (JJ's pick,
2026-09-11): the plugin's standing rule is no resident daemons; the user already exposes the
address themselves (ADR-0012); a session that started or stopped it would either orphan or kill
the client's link. Why `client open` records the port (D7): the capture proves a fix on
`127.0.0.1:<port>`, and a returning session has no other way to learn it.

Superseded by this spec: specs/20260907/10 D10's `client notes:` counts line (replaced by D7's
per-journey and pickup lines); specs/20260910/03 D5's "409 when already confirmed" now applies
only while `confirmedAt` is set; specs/20260910/05's Boundary "A confirmed journey is not
un-confirmed by the client" — it is, by the client's own request. Kept: spec 03 D7's approve gate
(every journey confirmed-or-waived, now `ok`-or-waived), spec 05's other Boundaries, and the
seven-day waivers. Deferred to q178 (the reversible journey): withdrawing an open request, un-
agreeing an exclusion, provenance lines. Sibling spec 20260911/05 makes approval bookkeeping and
lists exclusions from the first walk; it depends on this one and lands after it.

Collision closure at lock: this spec retires no literal a test outside its File Plan spells (A6);
the `already confirmed` 409 keeps its literal for the still-confirmed case. Executes-leg hits
outside the File Plan, each read and waived: `tests/design-atlas.test.js` (non-client routes only,
no client-route assertion), `tests/mocks/exclusions-route.test.js` (renders `buildWalkPage` with
no client note, so `journeyState` is never `changes-requested`/`fixed` and D5's extra `disabled`
never fires — fixed in the same build if it does), `tests/mocks/notes-layer-isolation.test.js`
(Chrome-gated, notes layer only), `tests/consistency/retired-flags.test.js` (flag scan, no client
surface).

## Canonical Delta

`docs/canonical/design.md` § The mocks command: the CLIENT state is a loop — a journey's state
is derived from the client's requests (`unseen | walking | changes-requested | fixed | ok |
waived`, `lib/mocks-walk.js journeyState`), a request on an OK'd journey takes the OK back into
`history`, the client accepts or reopens an addressed note on the page, the index carries a
"something missing?" composer and the client's request list, the CLIENT step prints `📥 what
the client left` with one command per item, and the client server is the user's own long-lived
process. § Exclusions: the sentence "The client-facing control for it is deliberately not shipped"
is unchanged (withdrawal stays q178).
