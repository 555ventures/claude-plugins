---
date: 2026-09-10
status: done
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: [specs/20260910/02-click-to-advance-and-real-records.md, specs/20260907/10-client-review.md]
depended_on_by: [specs/20260910/04-theme-before-the-client-walk.md, specs/20260910/05-what-the-journey-does-not-do.md]
brief: 22a
open_markers: 0
build_base: main
diff_base: 360152d3860e82efa328bcf628442e1b0d61460e
---

# The client walks one journey at a time: a player advanced by the real control, the session's guesses marked on the screen, approve unlocked by reaching the end, one sentence at approve

## Goal

Every `/client/…` page 404s today; the draft that would have served the artboard grid there is
superseded by ADR-0013. This spec serves the client's surface: `/client/index.html` (the
journeys, how many guesses are still open on each, which are confirmed) and
`/client/walk/<j>.html` (one screen at a time in a frame, advanced by clicking the control
spec 02 declared, with the session's guesses for that screen beside it as 合ってる / 違う marks,
a free note box, the gray states reachable, and — only once the last screen was reached by
clicking through — an approve control that takes one typed sentence). Wrong clicks are logged
per screen for the session and never shown to the client. A 違う with a reason becomes a new
said-by-user row and the player shows how many guesses are still open. The terminal `approved`
mark refuses while any journey is neither confirmed by the client nor waived, and prints each
journey's sentence beside the waived count. Done means a person with the exposed address can
rehearse every journey and confirm it without a name, a role, or any page that is not the
journey.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/walk-page.js` exports two pure, byte-deterministic builders. `buildClientIndex({ seed, notes, ledger, walk, prefix, lang })` renders the product name and one `<a data-cl="journey" href="<prefix>/client/walk/<j>.html" data-guesses="<n>" data-confirmed="true|false">` per journey in seed order, `n` = open questions anchored to that journey's screens. `buildWalkPage({ seed, journey, notes, ledger, walk, prefix, lang, theme })` renders the player shell: `<iframe data-wk="frame">` (no `src` — the script sets it), `<nav data-wk="rail">` with one `<button data-wk="thumb" data-label="<l>">` per screen in seed order, `<span data-wk="pos">`, `<button data-wk="back">`/`<button data-wk="next">`, `<div data-wk="states">` (filled per screen by the script from `data-states` on the thumb), `<aside data-wk="marks">` with one `<article data-wk="mark" data-id="<noteId>" data-label="<l>" hidden>` per open question on the journey (claim text, `<button data-wk="yes">`, `<button data-wk="no">`, `<textarea data-wk="why">`), `<span data-wk="left" data-count="<n>">`, `<form data-wk="note">` posting a free note for the current screen, and `<section data-wk="approve" hidden>` with `<textarea data-wk="sentence">` and `<button data-wk="confirm">`; when `walk.journeys[j].confirmedAt` is set the approve section renders the sentence read-only instead. Every page carries `<meta name="notes-route" content="client">`, the viewer.css link, and `<script src="<prefix>/__walk/player.js">`. The rail's `data-states` per thumb is the mock's `data-state-btn` list (`statesOf`) (AC-20260910-03-1, AC-20260910-03-2) | One pure builder per page, the shape `review-page.js` established; the browser script owns every dynamic part so the builder stays byte-stable |
| D2 | Strings on the client pages come from one `STRINGS` table in `walk-page.js` keyed by `lang`, `ja` and `en`, `lang` read from `design/targets.json`'s optional `"lang"` (default `en`) [no-ac: appearance — covered by the D1 tests reading `data-wk` hooks, never copy] | JJ's clients read Japanese; the plugin is not Japan-only. A table, not a template fork |
| D3 | `spec/scripts/lib/walk.browser.js` (served verbatim at `GET /__walk/player.js`, `no-store`) drives the player: on load it fetches `<prefix>/client/__walk/state?journey=<j>`, sets the frame `src` to `<prefix>/mocks/<label>.html?clean&walk[&theme=<t>][&state=<s>]` for the current screen (the first, or the last reached on reload), shows that screen's marks, listens for `message` events from the frame: `{walk:'to'}` posts the event to `<prefix>/client/__walk/event` and moves to `to`; `{walk:'miss'}` posts the event and moves nowhere. The rail, back/next and arrow keys move without posting. `data-wk="states"` gets one button per declared state of the current screen; clicking one reloads the frame with `&state=<s>`; the happy state is the default. `[data-wk="approve"]` becomes visible only when `state.reached` contains the journey's last label (the server's record, so it survives reload); `[data-wk="confirm"]` is disabled while `[data-wk="left"]`'s count is above zero, with the count shown. Yes/No post `POST <prefix>/client/__notes/answer {id, verdict, text, by:'client'}`; the note form posts `POST <prefix>/client/__notes/add {scope:'mock', screen, state, text, by:'client'}`; confirm posts `POST <prefix>/client/__walk/confirm {journey, sentence}`. The client route never prompts for an author name (AC-20260910-03-3) | Walk-to-unlock is server-recorded so a refresh cannot skip it; the marks answer through the route ADR-0012 already governs |
| D4 | `spec/scripts/lib/mocks-walk.js` is the one writer of `design/mocks/walk.json`: `readWalk(root)`, `writeWalk(root, walk)` (tmp + rename, as `writeNotes`), `recordEvent(walk, {journey, from, to|target, at})` (a `to` appends to `journeys[j].reached` when absent; a `miss` appends `{at, from, target}` to `journeys[j].misses`; BOTH kinds stamp `journeys[j].lastEventAt` with `at` — a correct click is a client event, and `reached` carries bare labels with nowhere to record when they were reached), `confirmJourney(walk, {journey, sentence, at})` (refuses an empty sentence, refuses when the journey is already confirmed, records `confirmedAt` and `sentence`), `waiveJourney(walk, {journey, reason, by, now, openedAt})` (refuses before seven days since the later of `openedAt`, the journey's `lastEventAt` and its last recorded miss, records `waived: {at, reason, by}`), `isClosed(walk, j)` = confirmed or waived (AC-20260910-03-4) | Same one-writer pattern as notes and picks; the walk record is evidence, so it is its own file, never folded into `status.json` |
| D5 | `design-atlas.js` serves on the client mount: `GET /client/index.html`, `GET /client/walk/<j>.html` (404 with the declared journeys on an unknown one), `GET /client/__walk/state?journey=<j>` (the journey's walk record or `{reached:[], misses:[], confirmedAt:null, sentence:null}`), `POST /client/__walk/event` (400 on a malformed body or an unknown journey/label, 200 after `recordEvent`), `POST /client/__walk/confirm` (400 on an empty sentence or unknown journey, 409 when already confirmed, 200 with the record). `GET /__walk/player.js` serves `walk.browser.js`. Non-client `/__walk/*` writes are 404 — the walk record is written only from the client route. Every other `/client/…` path still 404s (AC-20260910-03-5) | The walk endpoints are client-only by construction, the same door ADR-0012 put on the notes |
| D6 | `POST /client/__notes/answer` with `verdict: "no"` and non-empty `text` additionally appends a ledger row `{step:'CLIENT', kind:'product', claim:<text>, tag:'said-by-user', status:'confirmed <today>', note:'corrects <rowId>'}` after the existing `overridden` write, in the same synchronous read→transform→write pass; the response carries `promoted: <newRowId>`. A `no` with empty text is still refused (existing rule). The non-client `/__notes/answer` CONTINUES TO write only the status (AC-20260910-03-6, AC-20260910-03-10) | The client's correction is a fact the client said; recording it as one is what makes the second round shorter |
| D7 | `mocks-driver.js`: `--mark approved` additionally refuses, before the ledger gate, when any seed journey is neither confirmed nor waived in `walk.json`: `journey "<j>" is not confirmed by the client — the client walks it to the end and confirms on /client/walk/<j>.html, or after seven days: client waive --journey <j> --reason "<r>"`. `client waive --journey <j> --reason <r>` calls `waiveJourney` with `openedAt = status.client.openedAt` (refusing with the days elapsed). `client log [--journey <j>]` prints, per journey, `confirmed <date> — "<sentence>"` or `open — reached <n>/<total>`, then every miss as `  <screen>: <target> (<n>×)` grouped and counted. The CLIENT step block prints one line per journey in the same form and the approval tail prints `client: <j> — "<sentence>"` per confirmed journey and `waived journeys: <n>` before the existing `waived: N` line (AC-20260910-03-7, AC-20260910-03-8) | The misses and the sentence are the two signals the pass exists to collect; they print where the session already looks |
| D8 | `spec/templates/mocks/viewer.css` gains the `.wk-*` register for the player (frame, rail, marks, approve), authored in-session under the `frontend-design` skill on the `--v-*` roles [no-ac: appearance] | Plugin chrome is a designed surface (design.md) |
| D9 | `spec/doctrine/mocks.md`: § Mocks: State Machine's CLIENT sentence becomes "the client player, exposed by the user, where the client walks each journey by its real controls, answers the session's guesses, raises notes and confirms with one sentence; closes when every journey is confirmed-or-waived, every client-visible question answered-or-waived and every client note resolved-or-waived"; § Mocks: Page Notes' client paragraph names the player as the client's page and the `by: 'client'` rule; a new § Mocks: Client Player names the pages, the walk record, walk-to-unlock and the promotion rule. `spec/commands/mocks.md` § Client review names the index URL, `client log`, `client waive` (AC-20260910-03-9) | Doctrine binding home |
| D10 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D11 | `size-baseline.json` is raised for `design-atlas.js`, `mocks-driver.js` and the `spec/scripts` tree by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/03-client-journey-player.md` [no-ac: the ratchet's live test is the oracle] | Both entry points sit at their ceilings |

Orchestrator duty: load the `frontend-design` skill before authoring `walk-page.js` markup or
the `.wk-*` register; both are authored in-session, never by a subagent.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/walk-page.js | CREATE | scripts | D1 `buildClientIndex`, `buildWalkPage`; D2 `STRINGS` |
| spec/scripts/lib/walk.browser.js | CREATE | scripts | D3 the player script |
| spec/scripts/lib/mocks-walk.js | CREATE | scripts | D4 one writer of `walk.json` |
| spec/scripts/design-atlas.js | MODIFY | scripts | D5 client pages + walk endpoints + `/__walk/player.js`; D6 answer promotion |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D7 approved gate, `client waive`, `client log`, CLIENT step + tail lines |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D8 `.wk-*` register |
| spec/doctrine/mocks.md | MODIFY | doctrine | D9 |
| spec/commands/mocks.md | MODIFY | doctrine | D9 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 bump |
| size-baseline.json | MODIFY | other | D11 raise, cited to this spec |
| dup-baseline.json | MODIFY | other | D7 fixture repair tightened two windows — `dup-windows.js --update` (a lowering, not a raise) |
| tests/mocks/walk-page.test.js | CREATE | tests | AC-20260910-03-1, AC-20260910-03-2, AC-20260910-03-3 |
| tests/mocks/mocks-walk.test.js | CREATE | tests | AC-20260910-03-4 |
| tests/mocks/client-walk-route.test.js | CREATE | tests | AC-20260910-03-5, AC-20260910-03-6, AC-20260910-03-10 |
| tests/mocks/mocks-driver-client-3.test.js | CREATE | tests | AC-20260910-03-7, AC-20260910-03-8 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260910-03-9 |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D7 fixture repair: `confirmEveryJourney` — every chain reaching APPROVED records the client confirmation first |
| tests/mocks/mocks-driver-2.test.js | MODIFY | tests | D7 fixture repair: two stale `approved` setups confirm the journey so each pins its own precondition |
| tests/mocks/mocks-driver-client-2.test.js | MODIFY | tests | D7 fixture repair: four stale `approved` setups confirm the journey |
| tests/mocks/mocks-driver-look-stops-2.test.js | MODIFY | tests | D7 fixture repair: the no-stop `approved` refusal setup confirms the journey |
| tests/mocks/mocks-driver-look-stops-4.test.js | MODIFY | tests | D7 fixture repair: the terminal-step setup confirms the journey |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | D7 fixture repair: the `approved` note-gate setup confirms the journey |

## Contracts

```jsonc
// design/mocks/walk.json — written only by lib/mocks-walk.js
{
  "journeys": {
    "onboarding": {
      "reached": ["signin", "invite"],                       // labels, in first-reached order
      "misses": [{ "at": "<ISO>", "from": "signin", "target": "button#help Need help?" }],
      "lastEventAt": null | "<ISO>",                     // the last client event of either kind — the waiver clock
      "confirmedAt": null | "<ISO>",
      "sentence": null | "招待を送って、同意をもらって、セッションを始めた",
      "waived": null | { "at": "<ISO>", "reason": "…", "by": "session" }
    }
  }
}
```

```
GET  /client/index.html
GET  /client/walk/<j>.html
GET  /client/__walk/state?journey=<j>            → 200 {reached, misses, confirmedAt, sentence, waived}
POST /client/__walk/event   {journey, walk:'to', from, to} | {journey, walk:'miss', from, target}
POST /client/__walk/confirm {journey, sentence}  → 200 record · 400 empty/unknown · 409 already confirmed
GET  /__walk/player.js                            → lib/walk.browser.js verbatim, no-store
POST /client/__notes/answer {id, verdict:'no', text} → 200 {…note, promoted:'<rowId>'}
```

```
mocks-driver.js --root <dir> client waive --journey <j> --reason "<r>"
mocks-driver.js --root <dir> client log [--journey <j>]
```

## Behavior

The client opens the index, sees the journeys and how many of the session's guesses are still
open on each, and opens one. The first screen fills the frame. A mark beside it says what the
session assumed on this screen; the client presses 合ってる or 違う, writing a reason if they
like. They click the control that leads onward — the frame reports the move, the player records
it and shows the next screen. A click on anything else is recorded as a miss with what was
clicked and the client sees nothing happen. Gray states are one click away and carry no marks.
When the last screen is reached the approve section appears; it stays disabled while guesses
are open, showing the count. The client writes one sentence about what they just did and
confirms. Reloading the page returns them to the last screen they reached; a confirmed journey
shows its sentence and no controls.

The session reads `client log` for the misses and the sentence, addresses notes as today, and
marks `approved` once every journey is confirmed or, after seven days of silence, waived.

## Acceptance Criteria

- **AC-20260910-03-1**: WHEN `buildClientIndex` runs over a two-journey seed with three open questions on `onboarding`'s screens, none on `billing`, and `walk.json` confirming `billing` THE SYSTEM SHALL render, byte-identically across two calls, exactly two `[data-cl="journey"]` anchors in seed order with `href="/client/walk/onboarding.html" data-guesses="3" data-confirmed="false"` and `href="/client/walk/billing.html" data-guesses="0" data-confirmed="true"`, the `notes-route` meta, and no `data-rv="board"` → `tests/mocks/walk-page.test.js`
- **AC-20260910-03-2**: WHEN `buildWalkPage` runs over `onboarding` (four screens, `signin` declaring `empty,error`) with two open questions on `signin` and one answered THE SYSTEM SHALL render one `[data-wk="frame"]` with no `src`, four `[data-wk="thumb"]` in seed order with `data-states="empty,error"` on `signin`'s, exactly two `[data-wk="mark"][data-label="signin"]` each carrying `data-wk="yes"`, `data-wk="no"` and `data-wk="why"`, `[data-wk="left"][data-count="2"]`, `[data-wk="approve"][hidden]` with `[data-wk="confirm"]`, and no author input; over a journey whose `walk.json` record carries `sentence` THE SYSTEM SHALL render the sentence text inside `[data-wk="approve"]` and no `[data-wk="confirm"]` → `tests/mocks/walk-page.test.js`
- **AC-20260910-03-3**: WHEN `walk.browser.js` runs under `vm` against the D1 markup with a stub `fetch` answering `state` as `{reached:['signin','invite'], …}` THE SYSTEM SHALL set the frame `src` to `/mocks/invite.html?clean&walk`, show only `[data-wk="mark"][data-label="invite"]`, keep `[data-wk="approve"]` hidden; on a `message` `{walk:'to', from:'invite', to:'consent'}` it SHALL `fetch` `POST /client/__walk/event` with that body and set the frame `src` to `/mocks/consent.html?clean&walk`; on `{walk:'miss', …}` it SHALL post the event and leave `src` unchanged; once `reached` contains the last label it SHALL unhide `[data-wk="approve"]` and, with `data-count="0"`, enable `[data-wk="confirm"]`; a `[data-wk="yes"]` click SHALL post `/client/__notes/answer` with `by:'client'` and no author prompt SHALL be called → `tests/mocks/walk-page.test.js`
- **AC-20260910-03-4**: WHEN `recordEvent` receives `{journey:'onboarding', walk:'to', from:'signin', to:'invite'}` twice over an empty walk THE SYSTEM SHALL leave `reached` as `['signin','invite']` (`from` and `to` each appended once, in that order, never duplicated); a `miss` SHALL append `{at, from, target}` to `misses` and leave `reached` unchanged; `confirmJourney` with `sentence: ''` SHALL throw naming the journey, with a sentence SHALL set `confirmedAt` and `sentence`, and a second confirm SHALL throw `already confirmed`; `waiveJourney` at six days since `openedAt` SHALL throw naming `6` and `7`, at seven SHALL set `waived` — `isClosed` true after either → `tests/mocks/mocks-walk.test.js`
- **AC-20260910-03-5**: WHEN the served handler receives `GET /client/index.html` THE SYSTEM SHALL answer 200 with the D1 index; `GET /client/walk/onboarding.html` 200 with the player and `GET /client/walk/nope.html` 404 naming `onboarding`; `GET /client/__walk/state?journey=onboarding` 200 `{reached:[],misses:[],confirmedAt:null,sentence:null,waived:null}` on a cold root; `POST /client/__walk/event` with `{journey:'onboarding', walk:'miss', from:'signin', target:'button#help'}` 200 and the miss on disk; `POST /client/__walk/confirm` with an empty sentence 400, with a sentence 200 and `confirmedAt` on disk, again 409; `POST /__walk/event` (non-client) 404; `GET /__walk/player.js` 200 byte-verbatim `walk.browser.js` with `no-store` → `tests/mocks/client-walk-route.test.js`
- **AC-20260910-03-6**: WHEN `POST /client/__notes/answer` receives `{id:'N003', verdict:'no', text:'配送先は3つまで', by:'client'}` over ledger row `W7` (`inferred`, `open`) THE SYSTEM SHALL answer 200 with `promoted` naming a new row id, and `ledger.md` SHALL carry `W7` as `overridden <today>` and the new row as `| CLIENT | product | 配送先は3つまで | said-by-user | confirmed <today> | - | - | corrects W7 |` → `tests/mocks/client-walk-route.test.js`
- **AC-20260910-03-7**: WHEN `--mark approved` runs with every other precondition met and `walk.json` absent THE SYSTEM SHALL exit 2 with stderr containing `journey "onboarding" is not confirmed by the client` and `client waive --journey onboarding`; with the journey confirmed it SHALL accept and stdout SHALL carry `client: onboarding — "<sentence>"` before `waived:`; with the journey waived it SHALL accept and carry `waived journeys: 1` → `tests/mocks/mocks-driver-client-3.test.js`
- **AC-20260910-03-8**: WHEN `client waive --journey onboarding --reason "no reply"` runs six days after `status.client.openedAt` THE SYSTEM SHALL exit 2 naming `6` day(s) and `7`; at seven days it SHALL exit 0 and `walk.json` SHALL carry `waived.reason` `"no reply"`; `client log` over a record with two misses on `signin` (same target) and one on `invite` SHALL print `open — reached 2/4`, `  signin: button#help Need help? (2×)` and `  invite: a Back (1×)` → `tests/mocks/mocks-driver-client-3.test.js`
- **AC-20260910-03-9**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry a `## Mocks: Client Player` heading, the literal `confirmed-or-waived` in § Mocks: State Machine's CLIENT sentence, and no `Client review is the same page` sentence; `spec/commands/mocks.md` § Client review SHALL carry `client log` and `client waive` → `tests/consistency/design-doctrine.test.js`
- **AC-20260910-03-10**: WHEN `POST /__notes/answer` (non-client) receives a `no` with text THE SYSTEM SHALL CONTINUE TO write only the row's `overridden` status and SHALL CONTINUE TO append no row → `tests/mocks/client-walk-route.test.js`

## Assumptions (escalation triggers)

- A1: The Chrome harness is not required: the player script is exercised under `vm` with a stub DOM, `fetch` and `postMessage` (the `review.browser.js` pattern in `tests/design-atlas.test.js`), and the routes are string/JSON tests over `createRequestHandler` — **if false:** the AC-3 test moves under the `[env: CHROME_BIN]` gate.
- A2: `appendAssumption` computes the next free id from the parsed ledger, so the promotion row never collides with `ledger add` ids — **if false** (a fixed prefix is required): use prefix `C` (client) with the next free number.
- A3: `status.client.openedAt` is the waiver clock's floor for a journey with no client event yet (a journey the client never opened is silent from `client open`) — **if false:** STOP, ask the user.
- A4: `viewer.css` stays under its size ceiling with the `.wk-*` register — **if false:** the register moves to `spec/templates/mocks/walk.css`, served at `/__walk/walk.css`.

## Rationale

The player is one frame plus a script because the mocks are already served pages; embedding
them keeps every existing rule (states, clean, the notes route) intact and lets spec 02's walk
mode do the reporting. Walk-to-unlock is stored server-side in `walk.json` rather than in the
page because a refreshed page must not restart the unlock, and because the record — reached
screens, misses, the sentence — is the evidence the session reads.

The approve control waits for zero open guesses because JJ chose "合ってる and 違う both" over
"違う only": silence on a mark would otherwise be indistinguishable from agreement, which is the
failure the marks exist to remove. The sentence is required and the name is not: JJ ruled no
identity on the client route (one contact, one exposed address), and one sentence is the
cheapest mismatch signal there is.

Promotion of a 違う into a said-by-user row happens on the client route only. The session's own
review page keeps today's behavior: the session correcting its own guess is not the client saying
something. The seven-day waiver reuses ADR-0012's clock and prints at approval like the note
waivers do, so an unconfirmed journey is visible on the record, never quietly passed.

Collision closure at lock: every `executes` hit on `design-atlas.js` and `mocks-driver.js` is
additive (new client routes, a new refusal at `approved` behind a new file) — the one existing
path whose precondition grows, `advanceToApproved` in the fixtures, is covered by spec 04's
fixture row (the series lands in order) and by this spec's AC-7 fixture writing `walk.json`
confirmed; `tests/mocks/mocks-driver-client.test.js` spells `/client/index.html` as the printed
`client open` line, which this spec keeps (mention, nothing owed).

Build record. Five one-offs, folded from the deviations sidecar at close. (1) The File Plan named
`tests/mocks/mocks-driver-client-2.test.js`, which specs/20260910/01 already owns — this spec took
the next free name, `-client-3`, and its File Plan row and AC-7/-8 pointers were amended to match.
(2) AC-20260910-03-5's worked example wrote the cold-root state response as `reached:['signin']`,
which contradicts D5's own stated default of an empty `reached` and has no mechanism anywhere in
D1-D11; the Decision won and the AC's literal was corrected. (3) A2 is false: `appendAssumption`
takes a caller-supplied id rather than deriving one, so the promotion row derives `C<n>` the way
`mocks-driver.js`'s `nextLedgerId` derives `P<n>` — A2's own stated remedy. (4) The AC-2 test's
mark-matching pattern could never match a content-bearing element, so its per-mark control
assertions were unreachable; the pattern was corrected, which strengthens the pin rather than
weakening it. (5) D7's refusal was first placed ahead of the notes gate, displacing four
pre-existing refusal messages; it now sits between `requireNotesResolved` and `requireGateOpen`,
literally before the ledger gate as D7 says, with every prior refusal keeping its precedence.

Review round. Two hard findings, both dispositioned fix on executed repros. The event route
validated only `to`, so an undeclared origin label entered the walk record with 200 — both kinds
now require `from` to be a declared label (`target` stays unvalidated, being a control selector).
`waiveJourney`'s clock scanned only `misses`, so a client walking a journey correctly left no
mark on it and could be waived mid-walk — D4 and the Contracts block gained `lastEventAt`, stamped
by both event kinds, and the clock takes the later of `openedAt`, `lastEventAt` and the miss scan
(kept, so records written before the fix still clock correctly). Four soft findings stand
recorded and unfixed: the player hides a mark optimistically before the server answers, both
pages hard-code `<html lang="en">` while rendering the `ja` strings, the HTTP test helpers reached
a third repetition, and this spec's `dup-baseline.json` File Plan row under-describes its own
change.

Rejected: a thumbnail rail of live frames (73 screens on one host — the rail is labels); a
per-screen confirm (fatigue, and the ledger already knows per screen); scoring the sentence
against the seed (the session reads it).

## Canonical Delta

`docs/canonical/design.md` § Mocks: the client route serves `/client/index.html` and
`/client/walk/<j>.html` (`lib/walk-page.js`, `lib/walk.browser.js`); the client advances by the
mock's `data-to` control, wrong clicks land in `design/mocks/walk.json` (`lib/mocks-walk.js`,
one writer), approve unlocks on reaching the last screen with zero open guesses and records one
sentence; a client's `no` with text promotes to a said-by-user row; `approved` refuses while any
journey is neither confirmed nor waived (`client waive`, seven days), and `client log` prints
misses and sentences. The served review page is the session's surface only.
