---
date: 2026-09-02
status: hardened
tier: standard
area: mocks
design: false
breaking: false
depends_on: [specs/20260902/09-one-hand-wireframes-one-token-set.md]
depended_on_by: [specs/20260902/11-brief-from-approved-set.md]
brief: 22
open_markers: 0
---

# Review loop: page notes at two scopes, batch triage, author resolves

## Goal

Feedback is written on the served pages and stored beside the mocks, never in chat and never
in mock markup: `design-atlas.js serve` injects a notes layer at serve time (`?clean` removes
it for capture) and exposes add/list/resolve endpoints writing `design/mocks/notes.json`. A
note is anchored to a screen + state (mock scope) or to the project (project scope), never to
an element. The loop is batch: notes accumulate in a sitting, the user says go, the driver
prints the open notes grouped by scope → journey → screen → state, the session triages each
into four bins and prints them, the user says go or overrides, the session redraws, records
what changed under each note, and marks it addressed; the author resolves after a re-look.
Any open project note blocks all mock-note work. Zero open notes on a journey is that
journey's approval mark. Client review is the same loop with the named decider. Done = the
layer runs from the spike's shape on the shared tokens, the driver's approval marks read
notes.json, and the loop is the command's review step.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design/mocks/notes.json` is a JSON array of notes `{id, scope: "mock"\|"project", screen, state, text, by, at, status: "open"\|"addressed"\|"resolved", addressed: {at, change, ledgerRow}\|null, reply: string\|null, resolvedBy, resolvedAt}`; `screen`/`state` are null for project scope; ids are `N001`-style, monotonic; validated and written only through `spec/scripts/lib/mocks-notes.js` (AC-20260902-10-1) | The spike's shape plus the two fields the loop needs (`addressed`, `reply`); one lib writer, like the ledger. |
| D2 | `design-atlas.js serve` (spec 07) grows: every served `.html` gets `<script src="/__notes/notes.js"></script>` appended before `</body>` (or at end) unless the request carries `?clean`; endpoints `GET /__notes/notes.js`, `GET /__notes/viewer.css`, `GET /__notes/list?screen=<label>\|*`, `POST /__notes/add {scope, screen, state, text, by}`, `POST /__notes/resolve {id, by}`; `address`/`reply` are driver-only (file writes), never HTTP (AC-20260902-10-2, AC-20260902-10-3) | The spike proved injection-at-serve keeps mock files untouched; the session's own actions go through the driver so they are recorded, never spoofed from a page. |
| D3 | The layer (`spec/scripts/lib/notes-layer.browser.js`, served verbatim): reads the root `data-screen-label` and the `data-state-btn` names; tracks the active state (last clicked button, else the first declared, else `default`); renders a fixed toolbar (open count, `+ Project note`, show resolved, author name), a project-notes box, and one note strip for the active state; the author name is asked once per browser and kept in `localStorage` (`nl-author`); every visual on `viewer.css`'s `--v-*` roles (AC-20260902-10-4) | Per-state, per-project, never per-element (spike rulings); the name prompt makes client and decider notes distinguishable without accounts (brief: no auth). |
| D4 | Driver subcommands: `notes open` prints open notes grouped `project → journey → screen → state` with ids (journey derived from `seed.md`), `notes address --id --change "<what changed>" [--ledger <rowId>]` sets `addressed`, `notes reply --id --text "<question back>"` sets `reply` (status stays open); the session never resolves (no subcommand exists) (AC-20260902-10-5) | The brief's loop verbatim; the missing resolve subcommand is the mechanism for "the author resolves". |
| D5 | Marks read notes: `journey-approved`, `journey-skinned`, `journey-reviewed` refuse while any project note is not `resolved` (naming it first), or while any note on that journey's screens is not `resolved` (naming them); `approved` refuses while any note anywhere is not `resolved` (AC-20260902-10-6) | "Any open project note blocks mock-note work"; "zero open notes on a journey is that journey's approval mark"; `addressed` is not `resolved`. |
| D6 | Triage bins are a closed set printed by the session in the command's loop — `mock detail` (redraw), `product understanding` (ledger row first; a product-kind row is one confirm question), `question back` (`notes reply`), `propose to decline` (never declined by the session; the named decider decides) — and a note that hits a canon primitive changes `canon.md` first, every dependent screen after (AC-20260902-10-7, command prose) | The atlas triage extended by the dry run's two extra bins; the canon-first rule is how one note stays one change. |
| D7 | Client review is the same loop with `review-opened --decider` recorded (spec 07); the step text prints the sign-off wording: `Approval means "this is the product I understand" — the written brief, not these screens, holds scope` (AC-20260902-10-8) | Research: sign-off is on understanding; the polished-prototype pre-commits-scope risk is answered by the split, not by lowering fidelity. |
| D8 | `spec/commands/atlas.md` and `spec/commands/sketch.md` route their annotation loops through `design-atlas.js serve` + `notes open` (the "local annotation MCP" discovery clause is deleted); the atlas triage (mock-detail / product-understanding) stays and gains the two bins (AC-20260902-10-9) | One feedback mechanism for every design surface; the MCP-discovery clause was an assumption nothing ever exercised. |
| D9 | Fixture `tests/fixtures/mocks-notes/notes.sample.json` = the spike's four real notes re-keyed to D1 (`page` → `screen: "session-live"`, `frame` → `state`) (AC-20260902-10-1) | Realistic multi-note input, from the user's own review. |
| D10 | Version bump → 7.64.0 target; changelog names the notes layer and the approval marks | § Planning. `[no-ac: standing plugin-version pin]` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-notes.js | CREATE | scripts | D1: `readNotes`, `validateNotes`, `writeNotes`, `addNote`, `resolveNote`, `addressNote`, `replyNote`, `groupOpen(notes, seed)`, `unresolvedFor(notes, labels)` |
| spec/scripts/lib/notes-layer.browser.js | CREATE | scripts | D3: the served browser script (from the spike, re-based on viewer tokens, state-aware) |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2: serve injection, `?clean`, the five endpoints, `viewer.css` served |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D4/D5: `notes` subcommands; note conditions on the four marks; review step sign-off line |
| spec/commands/mocks.md | MODIFY | doctrine | D6/D7: the review loop steps and the triage bins (≤120 lines) |
| spec/doctrine/mocks.md | MODIFY | doctrine | `## Mocks: Page Notes` — scopes, statuses, who resolves, project-first rule |
| spec/commands/atlas.md | MODIFY | doctrine | D8 |
| spec/commands/sketch.md | MODIFY | doctrine | D8 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 |
| tests/fixtures/mocks-notes/notes.sample.json | CREATE | tests | D9 |
| tests/mocks/mocks-notes.test.js | CREATE | tests | AC-20260902-10-1, AC-20260902-10-5, AC-20260902-10-6, AC-20260902-10-10 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260902-10-2, AC-20260902-10-3, AC-20260902-10-4 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260902-10-7, AC-20260902-10-8, AC-20260902-10-9 |

## Contracts

```jsonc
// design/mocks/notes.json — array; ids monotonic N001…; written only by lib/mocks-notes.js
[{ "id": "N004", "scope": "mock", "screen": "session-live", "state": "read-back pending",
   "text": "I think Approve, Correct, Reject, Unsure is not UI/UX friendly...", "by": "JJ",
   "at": "2026-09-02T20:11:36.153Z", "status": "open",
   "addressed": null, "reply": null, "resolvedBy": null, "resolvedAt": null },
 { "id": "N005", "scope": "project", "screen": null, "state": null,
   "text": "The direction is wrong — too much chrome for a phone-first product.", "by": "Ren",
   "at": "…", "status": "open", "addressed": null, "reply": null, "resolvedBy": null, "resolvedAt": null }]
// status transitions: open → addressed (driver `notes address`) → resolved (page Resolve, by the author)
//                     open → resolved (author withdraws)   ·   reply never changes status
```

HTTP (all JSON; server binds `localhost` only):

```
GET  /__notes/notes.js            text/javascript  (lib/notes-layer.browser.js verbatim)
GET  /__notes/viewer.css          text/css         (spec/templates/mocks/viewer.css verbatim)
GET  /__notes/list?screen=<label> → notes whose screen === label   ;  ?screen=*  → project-scope notes
POST /__notes/add     {scope, screen, state, text, by}   → 201 the note (id/at/status assigned; text/by non-empty; scope enum; mock scope requires screen)
POST /__notes/resolve {id, by}                          → 200 the note (status resolved, resolvedBy/At) | 404
any other /__notes/* → 404; a malformed body → 400 {error}
Injection: every `text/html` response not carrying `?clean` gets `\n<script src="/__notes/notes.js"></script>\n` before the last `</body>` (appended when absent).
```

`notes open` output (exact shape):

```
📝 open notes: 3 (1 project · 2 mock) · addressed: 1
project
  N005 [open] Ren · The direction is wrong — too much chrome for a phone-first product.
staff-interview
  session-live
    read-back pending
      N004 [open] JJ · I think Approve, Correct, Reject, Unsure is not UI/UX friendly...
      N006 [addressed → M15] JJ · Four equal buttons…   ↳ changed: verdict row is now two buttons + "more"
⚠️ a project note is open — answer it (canon change or new directions) before any mock note
```

Mark refusals (D5), exact prefixes: `project note(s) open: N005 — answer the project note first` ·
`unresolved note(s) on staff-interview: N004, N006 — the author resolves after a re-look`.

## Behavior

- **Sitting → go:** nothing happens live; the layer only writes notes. When the user says go
  (or `/spec:mocks` is re-invoked), the command runs `notes open`, then the session prints
  each note with its bin and waits for go/override before touching a file.
- **Redraw:** per note — a canon primitive hit edits `canon.md` and every dependent screen
  first; the screen edit follows; then `notes address --id N004 --change "…" [--ledger W12]`
  writes the change (and the ledger row when the note was product understanding). The page
  shows the change text under the note with `addressed`.
- **Resolve:** only from the page (`Resolve` button, `by` = the browser's author name);
  `notes.json` never gets `resolved` from the driver. The layer hides resolved notes unless
  "show resolved" is on.
- **Project scope:** written from the toolbar on any page, shown on every page; the driver's
  `notes open` prints them first and appends the ⚠️ line while any is unresolved.
- **`?clean`:** the injection is skipped; nothing else changes — the driver's `look` and the
  render gate's capture append `?clean` when they capture through the server (the driver's
  file-based look never hits the server).
- **Author identity:** first note in a browser prompts `Your name (shown on your notes)`;
  stored in `localStorage.nl-author`; the toolbar shows it and lets the user change it.
- **Journey derivation:** `groupOpen(notes, seed)` maps `screen` → journey via `seed.md`;
  a note on a label no journey declares groups under `unassigned`.
- **Client review:** identical; the decider's notes are ordinary notes with their name;
  "propose to decline" bins print `→ decider: <name>` and never change status.

## Acceptance Criteria

- **AC-20260902-10-1**: WHEN `validateNotes` reads `tests/fixtures/mocks-notes/notes.sample.json`
  THE SYSTEM SHALL return four notes with zero errors (`N004` → `{scope:'mock',
  screen:'session-live', state:'read-back pending', status:'open'}`), and a note with
  `scope: "mock"` and `screen: null`, or a duplicate id, or `status: "done"` SHALL each
  produce one error naming the id and field → `tests/mocks/mocks-notes.test.js`
- **AC-20260902-10-2**: WHEN the server serves `GET /mocks/a.html` THE SYSTEM SHALL end the
  body with `<script src="/__notes/notes.js"></script>` before `</body>`, `GET
  /mocks/a.html?clean` SHALL return the file's exact bytes, and `GET /__notes/notes.js` SHALL
  return the lib file's bytes as `text/javascript` (async spawn runner + `http.get`) →
  `tests/design-atlas.test.js`
- **AC-20260902-10-3**: WHEN `POST /__notes/add` receives `{scope:"mock", screen:"a",
  state:"busy", text:"x", by:"JJ"}` THE SYSTEM SHALL respond 201 with `id: "N001"`, write it
  to `design/mocks/notes.json`, `GET /__notes/list?screen=a` SHALL return it, `POST
  /__notes/resolve {id:"N001", by:"JJ"}` SHALL return status `resolved` with `resolvedBy:
  "JJ"`, `POST /__notes/add` with `text: ""` SHALL respond 400, and `GET /__notes/nope` SHALL
  respond 404 → `tests/design-atlas.test.js`
- **AC-20260902-10-4**: WHEN `lib/notes-layer.browser.js` is read THE SYSTEM SHALL contain
  the literals `data-screen-label`, `data-state-btn`, `nl-author`, `clean`, `var(--v-`, and no
  `#[0-9a-f]{3,8}` color literal, and `GET /__notes/viewer.css` SHALL return the template
  bytes → `tests/design-atlas.test.js`
- **AC-20260902-10-5**: WHEN `notes open` runs on the fixture plus one project note THE
  SYSTEM SHALL print the project note first, group `N004` under the journey declaring
  `session-live` and its state, and end with the ⚠️ project-note line; `notes address --id
  N004 --change "two buttons" --ledger W12` SHALL set `status: "addressed"` and `addressed:
  {change:"two buttons", ledgerRow:"W12"}`; `notes reply --id N004 --text "…"` SHALL set
  `reply` and leave status unchanged; and no `notes resolve` subcommand SHALL exist (exit 2
  naming the page as the only resolve path) → `tests/mocks/mocks-notes.test.js`
- **AC-20260902-10-6**: WHEN `--mark journey-approved --journey j1` runs with an unresolved
  project note THE SYSTEM SHALL exit 2 with `project note(s) open: N005`; with only an
  `addressed` note on `a` (a screen of j1) it SHALL exit 2 with `unresolved note(s) on j1:
  N001`; `journey-skinned`, `journey-reviewed`, and `approved` SHALL apply the same rule
  (approved: any unresolved note anywhere) → `tests/mocks/mocks-notes.test.js`
- **AC-20260902-10-7**: WHEN `spec/commands/mocks.md` is read THE SYSTEM SHALL name the four
  bins as literals `mock detail`, `product understanding`, `question back`, `propose to
  decline`, and contain `canon.md first` → `tests/consistency/design-doctrine.test.js`
- **AC-20260902-10-8**: WHEN the driver prints the REVIEW step THE SYSTEM SHALL include the
  literal `the written brief, not these screens, holds scope` and the recorded decider's name →
  `tests/consistency/design-doctrine.test.js` (exec: driver step text on a fixture at REVIEW)
- **AC-20260902-10-9**: WHEN `spec/commands/atlas.md` and `spec/commands/sketch.md` are read
  THE SYSTEM SHALL find `notes open` in each and neither `annotation MCP` nor `Vibe
  Annotations`; `spec/doctrine/mocks.md` SHALL carry `## Mocks: Page Notes`; and
  `citations-check.js` over `spec/` SHALL report `MISS=0` → `tests/consistency/design-doctrine.test.js`
- **AC-20260902-10-10**: WHEN `--mark journey-approved --journey j1` runs with every note
  `resolved` THE SYSTEM SHALL CONTINUE TO accept → `tests/mocks/mocks-notes.test.js`

## Assumptions (escalation triggers)

- A1: The spike (`docs/spikes/22-notes-layer/server.js` + `notes.js`, executed 2026-09-02
  with the user in a browser; `notes.sample.json` holds the real notes) is the shape: serve-time
  injection, per-state strip, project box, JSON beside the server. **if a browser blocks the
  inline prompt:** the name field lives in the toolbar instead (same storage key).
- A2: In-process `http.createServer` + `runNode` deadlocks (§ Gotchas, spawnSync); every
  serve test uses an async `child_process.spawn` runner and `http` requests. **if a worker
  reaches for runNode:** the test hangs to timeout — that is the gotcha, not flakiness.
- A3: `localStorage` is available on `http://localhost` pages. **if a client browser blocks
  it:** the layer falls back to asking per session (in-memory), never to a hard-coded name.
- A4: `seed.md` exists whenever notes exist (the driver created it at SEED). **if a
  brownfield repo serves mocks with no seed:** journeys group as `unassigned`; nothing blocks.

## Rationale

The spike answered the mechanism questions: injection at serve time keeps mock files pure,
notes belong to a state or to the project (never an element — the dry run's catches were all
state-level), and the session read the user's notes from the file without the screen
entering the conversation. What this spec adds is the loop's asymmetry: the session addresses,
the author resolves, and a project note outranks every mock note. Those are the rules that
make the review a queue with reasons (the field's "capture rejection reasons as data"
finding) rather than a chat.

`address`/`reply` are driver-only on purpose: an HTTP endpoint anyone on the forwarded port
can hit must not be able to mark the session's work done. Client review needs no second
mechanism: the decider is a recorded name and the sign-off wording is printed by the driver.

Rejected: element anchors (brittle across redraws, and the dry run never needed one); a
notes-in-chat fallback (it is the thing being replaced); auto-resolving addressed notes
after N days (the author's re-look is the evidence).

Collision closure (lock, `--literal 'annotation MCP' --literal 'Vibe Annotations'`): both
literal hits (`spec/commands/atlas.md`, `spec/commands/sketch.md`) are rows. `executes` hit
`tests/design-shell.test.js` (runs design-atlas.js): `serve` is a new subcommand and the
injection touches served responses only; shell sync/adopt/check are untouched — green.
`likely`/`mentions` hits on `plugin.json` owe nothing.

## Canonical Delta

`docs/canonical/design.md` gains **Page notes (specs/20260902/10)**: feedback on mocks is
written on served pages via `design-atlas.js serve`'s injected notes layer (`?clean` for
capture), stored in `design/mocks/notes.json` at two scopes (mock state, project), written
only through `lib/mocks-notes.js`; the session addresses and replies through the driver, the
author resolves on the page; project notes block all mock-note marks; zero unresolved notes on
a journey is its approval; `/spec:atlas` and `/spec:sketch` use the same loop. The annotation
MCP clause is retired.
