---
date: 2026-09-05
status: hardened
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260905/02-design-review-hub-and-look-stops.md]
brief: n/a
---

# Picks on the atlas page: candidate groups as a first-class atlas concept, decided on the page, read from disk

## Goal

Every pick stage of the mocks flow — shapes (2–3 candidates), theme directions, and
per-surface variants inside one journey — is a look followed by a decision, and today the
decision is typed: a terminal question after the look, or a chat reply the session interprets.
The served atlas already shows the candidates; it must also take the decision. Done means:
a **look stop** is an on-disk record of candidate groups (`design/mocks/picks.json`, one
validated writer), the served atlas lists every open stop at the top and renders each one **in place**, in the
section its screens already live in, as a compare table — one row per step, one column per
candidate, full cards — with an exclusive one-click **Pick this** per candidate group (one
winner, the rest auto-rejected, re-pickable until the session picks it up) and an optional
why-line after the pick, or **Approve** / **Change** with a note for a single-flow stop; the
control posts to the notes server, which writes the decision to `picks.json`; the notes layer
shows project notes only on the atlas index and per-mock notes only on a mock page, never both
bars at once, and the index's bar hides while the lightbox is open; and `design-atlas.js` exposes its atlas builder
and request handler for the hub spec 02 mounts. Spec 02 opens stops from the pipeline and reads
the decisions back; this spec makes the page able to take them.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/mocks-picks.js` is the sole reader/writer of `design/mocks/picks.json` (`readPicks`, `writePicks`, `validatePicks`, `openStop`, `decideStop`, `consumeStop`, `pending`); a stop is `{id:'P001', kind:'pick'\|'approve', key, title, question, candidates:[{group, label, path}], url, openedAt, status:'open'\|'decided'\|'consumed'\|'superseded', decision:null\|{verdict:'pick'\|'approve'\|'change', pick, note, by, at}}`; `openStop` supersedes any earlier `open`/`decided` stop with the same `key`; for kind `pick` the pick targets are the distinct `group` values (a group is one flow: its screens in candidate order), for kind `approve` `group` is null on every candidate; `decideStop` on an `open` stop records the decision, on a `decided` stop **replaces** it and pushes the earlier decision onto `previous: []` (re-pick until the session consumes), and refuses a `consumed` stop (`already consumed`), a `superseded` stop (`superseded`), a `pick` not among the targets, a `change` with an empty note, and any verdict not allowed by the kind (`pick` stops take `pick`\|`change`, `approve` stops take `approve`\|`change`); the why-line on a pick is optional and may arrive on a later re-decide (AC-20260905-01-1, AC-20260905-01-2) | Same posture as `mocks-notes.js`: one writer, both the HTTP layer and the driver call it; a group being a flow is what makes "one journey with N variants" and "one theme direction with its screens" the same shape as "one shape file". Re-pick-until-consumed: a second look that changes the user's mind must not be stuck behind a session round-trip (prototype ruling 2026-09-05). |
| D2 | `createRequestHandler(root, { prefix })` in `design-atlas.js` is the per-root request handler extracted from `cmdServe` — `/__notes/*`, the on-request atlas index, static `design/` with notes injection — plus two new routes: `GET /__picks/list` (non-superseded stops as JSON) and `POST /__picks/decide` body `{id, verdict, pick?, note?, by}` → `decideStop` (200 decided stop, also on a re-decide · 400 reason · 404 unknown id · 409 consumed or superseded); every matched path is compared after stripping `prefix` and the injected notes tag is `<meta name="notes-scope" content="project">` on the derived index / `content="mock"` on every static `.html`, followed on the next line by `<script src="${prefix}/__notes/notes.js"></script>` — the page declares its notes scope, the layer never guesses it; `cmdServe` calls it with `prefix:''`; the script runs its CLI dispatch only under `require.main === module` and exports `{ buildAtlas, page, frameTag, createRequestHandler }` (AC-20260905-01-3, AC-20260905-01-4, AC-20260905-01-5, AC-20260905-01-11) | One handler, two mounts (serve today, the hub in spec 02) so nothing drifts; the decision endpoint is the notes server's because that is the process already writing this project's review state. Spike A2: requiring the script today runs its CLI and exits 2, hence the guard. |
| D3 | `buildAtlas` reads `picks.json` and (a) emits, before every other section, `<section id="stops">` — `## Waiting for your look`: one line per `open` stop (title · kind) linking `#stop-<id>`, then `## Decided — waiting for the session`: one line per `decided` stop (title · verdict · pick · by) — links and text only, never a frame; (b) renders each open or decided stop **in place** in its owning section, derived from the key grammar `<mark>[:<journey>]`: `shape-picked` → the shapes section (the compare table replaces the plain candidate cards), `theme-picked` → a `theme` section emitted right after shapes, `journey-approved:<j>` \| `journey-reviewed:<j>` \| `variants:<j>` → the `<j>` journey section, `approved` → the page header, any other key → a standalone block right after `#stops`; (c) a `pick` stop is a **compare table** `<div class="cmp" id="stop-<id>" data-kind="pick" data-id="<id>">`: one sticky column header per group `<div class="chead" data-group="<g>">` (group name, `candidate` badge, `<button data-decide="pick" data-group="<g>">Pick this</button>`), then one `<div class="step">step n · <label></div>` row per distinct label in candidate order spanning every column, holding one full `.card` per group (label, `.vp` W×H, `open ↗` link to the un-`?clean` path, the frame via `frameTag`) or `<div class="card empty"></div>` when that group lacks the label; columns are one per group at the first declared viewport and stack one per row when the widest declared viewport is selected; (d) an `approve` stop is `<div class="stop" id="stop-<id>" data-kind="approve" data-id="<id>">` in the owning section's header row — `<button data-decide="approve">Approve</button>`, `<textarea name="note-<id>">`, `<button data-decide="change">Change</button>`, no frames (the section's own cards are the screens); (e) a `decided` stop renders the same block with the picked group's header `chead picked` (badge `picked`, button text `Picked`) and the others `chead rejected` (badge `rejected`, button text `Pick this instead`), plus `<input name="why-<id>" placeholder="why this one — optional">` and `<button data-decide="why">Save</button>`; an approve stop decided `approve` shows `Approved by <by>`, decided `change` shows the note; a `consumed` or `superseded` stop and an absent `picks.json` render nothing (no `#stops`, no `.cmp`, the plain cards as today). Build output stays byte-identical across runs (AC-20260905-01-6, AC-20260905-01-7, AC-20260905-01-8) | Candidates are an atlas concept, not a separate block: the decision is taken where the screens already are, and the step-by-step table is the only layout in which one screen of a flow can be compared against the same screen of another (prototype ruling 2026-09-05: a strip of thumbnails is unreviewable). Rejected: a standalone compare page; a top block re-rendering frames the sections already show. |
| D4 | The atlas page's inline script derives its endpoint base from `location.pathname` (a match of `^/p/[^/]+` is the base, else `''`), takes `by` from `localStorage` key `nl-author` (the notes layer's key) or a prompt, and posts to `base + '/__picks/decide'` **one click at a time**: `data-decide="pick"` → `{id, verdict:'pick', pick:<data-group>, by}` immediately (no radio, no confirm); `data-decide="why"` → the same verdict and pick plus `note` from `why-<id>`; `Pick this instead` is the same `pick` post for the other group; `data-decide="approve"` → `{id, verdict:'approve', by}`; `data-decide="change"` → `{id, verdict:'change', note, by}` with a client-side non-empty check; on 200 it re-renders that block as D3(e) from the returned stop; on 409 it shows `already picked up by the session`; on 400 the reason inline; when the fetch fails (a `file://` open) it shows `open the served atlas to decide`; opening the lightbox toggles `lb-open` on `<body>`; a lightbox opened from a card inside a `.cmp` flips with ‹ › between the same step's other candidates and shows a `Pick this` button in its bar that triggers the same pick post for that card's group; `?clean` suppresses the script exactly as it suppresses the notes layer (AC-20260905-01-9) | The pick is one click where the look happened, the reason comes after (a why-line before the click is friction the prototype rejected); the file:// case degrades to a message, never a silent no-op. |
| D5 | `lib/notes-layer.browser.js` derives its endpoint base by the same `location.pathname` rule (D4) for every `/__notes/…` fetch and the stylesheet link, and renders **one scope per page, declared by the page**: it reads `<meta name="notes-scope">` — `project` → the project-notes panel and a bar with `+ Project note` only (no mock strip); `mock` → the mock-notes strip and a bar with `+ Note on this state` only (no project panel, no `+ Project note`); meta absent → `mock` when a `[data-screen-label]` root exists, else `project` — never scope-by-first-`[data-screen-label]` alone, because the atlas index carries that attribute on every state frame wrapper (A6); its injected CSS hides its bar and panel under `body.lb-open`, so while the lightbox is open the only visible bar is the framed mock's own (AC-20260905-01-10, AC-20260905-01-11) | The 2026-09-05 screenshot: two `+ Project note` bars stacked in the lightbox; a screen is where mock notes belong and the atlas is where project notes belong, and the server already knows which page it is serving. The base rule is a pure path-string rule, testable under `vm` (A3). |
| D6 | `spec/doctrine/mocks.md` § Mocks: Page Notes gains a paragraph **Picks** — the stop record, the two kinds, the groups-are-flows rule, decide-in-place as a compare table, re-pick until consumed, `picks.json`'s one writer, and the one-scope-per-page rule declared by `notes-scope`; `spec/entrypoints.json` gains a row for `lib/mocks-picks.js`; bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.82.0; 7.81.0 is an uncommitted direct patch today) with the changelog entry `[no-ac: review's version-bump check is the oracle]` (AC-20260905-01-12) | New-surface checklist; the doctrine paragraph is what `spec-paths shared-mocks` hands the next session. |
| D7 | Nothing in this spec writes `status.json`, `ledger.md`, `notes.json`, or any mock; `picks.json` is written only by `mocks-picks.js` and read by `buildAtlas` on every request `[no-ac: absence invariant — AC-20260905-01-8's untouched-file-set assertion covers the writer, and buildAtlas's byte-identical assertion covers the read]` | The page is a viewer plus one decision writer; the pipeline's state stays the driver's (spec 02). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-picks.js | CREATE | scripts | D1: sole reader/writer of `design/mocks/picks.json` + pure transforms; header names the shape, what it does NOT do (no fs beyond its file, no status/ledger/notes); library, no exit codes |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2/D3/D4: `require.main` guard + exports; `createRequestHandler(root,{prefix})` extracted from `cmdServe` with `/__picks/list` + `/__picks/decide`; `buildAtlas` renders the two stop sections + inline decide script; header updated |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5: base from `location.pathname`; one scope per page |
| spec/doctrine/mocks.md | MODIFY | doctrine | D6: **Picks** paragraph under § Mocks: Page Notes |
| spec/entrypoints.json | MODIFY | scripts | D6: row for `spec/scripts/lib/mocks-picks.js` (entry point `spec/scripts/design-atlas.js`) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6: version bump + changelog entry |
| tests/mocks/mocks-picks.test.js | CREATE | tests | AC-20260905-01-1, AC-20260905-01-2 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260905-01-3, AC-20260905-01-4, AC-20260905-01-5, AC-20260905-01-6, AC-20260905-01-7, AC-20260905-01-8, AC-20260905-01-9, AC-20260905-01-10, AC-20260905-01-11, AC-20260905-01-12 — the two existing `serve` tests retagged as pins (AC-11) |

## Contracts

```
design/mocks/picks.json   (lib/mocks-picks.js is the only writer)
  [{"id":"P001","kind":"pick"|"approve","key":"shape-picked",
    "title":"pick a shape","question":null|"<one line>",
    "candidates":[{"group":"card-first"|null,"label":"session-live","path":"shapes/card-first.html"}],
    "url":null|"<absolute url>"          (spec 02's `stop open` fills it; null when opened via the lib),
    "openedAt":"<ISO>","status":"open"|"decided"|"consumed"|"superseded",
    "decision":null|{"verdict":"pick"|"approve"|"change","pick":null|"<group>",
                     "note":null|"<text>","by":"<who>","at":"<ISO>"},
    "previous":[ …earlier decision objects, oldest first… ]}]
  ids P001-style, assigned by openStop; candidate paths are relative to <root>/design/

lib/mocks-picks.js
  readPicks(root) → []                       ([] on ENOENT)
  writePicks(root, stops)
  validatePicks(stops) → {errors:[string]}   (id shape, kind enum, status enum, key non-empty,
                                              candidates non-empty, pick stops: every candidate has a
                                              group; approve stops: every group null; duplicate id)
  openStop(stops, {kind, key, title, question?, candidates, url?}) → {stops, stop}
  decideStop(stops, id, {verdict, pick?, note?, by}) → {stops, stop}   open → decided; decided → replaced
                                              (prior decision appended to previous); throws on refusal (D1)
  consumeStop(stops, id) → {stops, stop}     decided → consumed; throws otherwise
  pending(stops) → {open:[…], decided:[…]}   non-superseded, non-consumed, each sorted openedAt desc

design-atlas.js exports (CLI dispatch only when require.main === module)
  buildAtlas(root, out) → {html, count, summary, out}
  page(title, bodyHtml, extraHead='') → html
  frameTag(src, w, h) → html
  createRequestHandler(root, {prefix=''}) → (req, res) => void
    <prefix>/, <prefix>/atlas/, <prefix>/atlas/index.html   derived atlas (notes tag unless ?clean)
    <prefix>/__notes/{notes.js,viewer.css,list,add,resolve}  unchanged
    <prefix>/__picks/list          GET  200 json: pending stops (open + decided)
    <prefix>/__picks/decide        POST {id,verdict,pick?,note?,by}
                                   200 decided stop (first decision or re-decide) · 400 {error} · 404 {error}
                                   409 {error, stop} (consumed or superseded)
    <prefix>/<static under design/>   html gets `<meta name="notes-scope" content="mock">` + the
                                   `<script src="<prefix>/__notes/notes.js">` tag unless ?clean;
                                   the derived index gets content="project" + the same tag
    every response: cache-control: no-store

atlas markup (D3), inside page():
  <section id="stops"><h2>Waiting for your look</h2>
    <ol><li><a href="#stop-P001">pick a shape</a> · pick</li><li><a href="#stop-P002">approve journey j1</a> · approve</li></ol>
    <h2>Decided — waiting for the session</h2><ol><li><a href="#stop-P003">pick a theme</a> · pick ocean · jj</li></ol>
  </section>
  … <section class="sect" id="shapes"> … 
    <div class="cmp" id="stop-P001" data-kind="pick" data-id="P001" style="--cols:2">
      <div class="chead" data-group="card-first"><span class="num">1</span>card-first <span class="badge candidate">candidate</span>
        <button data-decide="pick" data-group="card-first">Pick this</button></div>
      <div class="chead" data-group="orb-hero"> … </div>
      <div class="step">step 1 · session-live</div>
      <div class="card"><h3>session-live<span class="vp">390×844</span><a class="open" href="../shapes/card-first.html" target="_blank">open ↗</a></h3>{frameTag ../shapes/card-first.html}</div>
      <div class="card"> … orb-hero … </div>
    </div>
  … <section class="sect"><h2>j1 …</h2>
    <div class="stop" id="stop-P002" data-kind="approve" data-id="P002">
      <button data-decide="approve">Approve</button>
      <textarea name="note-P002"></textarea><button data-decide="change">Change</button>
    </div> … the journey's own cards …
  decided pick stop (D3e): <div class="chead picked" …><span class="badge picked">picked</span><button …>Picked</button></div>
    <div class="chead rejected" …><span class="badge rejected">rejected</span><button …>Pick this instead</button></div>
    <input name="why-P003" placeholder="why this one — optional"><button data-decide="why">Save</button>
```

## Behavior

**Stop lifecycle on this side.** A stop is opened by a caller of the lib (spec 02's `stop
open`; tests here). The served atlas shows it while `open`; the page's decision makes it
`decided`; a second decision while still `decided` replaces the first (the earlier one is kept
under `previous`), so the user can change their mind after another look; spec 02's driver makes
it `consumed` when the mark accepts it, and from then on the page answers 409. A new `openStop`
with the same key supersedes the old one, so a redraw after a change decision always yields a
fresh block.

**Decide in place.** The top `#stops` section is an index of links only. A stop's block sits in
the section whose screens it is about (key grammar in D3b), so the shapes section IS the shape
pick, the `j1` section carries the approve control for `journey-approved:j1`, and a theme stop
brings its own `theme` section. Spec 03 adds the `variants:<j>` key with the same rule.

**Compare table.** Rows are steps (distinct labels in candidate order), columns are groups; the
same screen of every candidate sits side by side at full card size, and the pick lives in the
sticky column header so it stays visible while scrolling the steps. In the lightbox ‹ › walk the
same step across candidates and the bar offers the same pick.

**Groups are flows.** A shape stop has one screen per group; a theme stop has each direction's
screens under that direction's group; a variant stop inside a journey has the same screen label
under two groups with different paths. The page renders a group as one row of frames in
candidate order, with one radio per group — picking a group rejects the others by construction,
which is what spec 02's driver turns into the ledger's `rejected` cell.

**Serving under a prefix.** Request paths are compared after removing `prefix`. The atlas's own
frame links are already relative (`../mocks/x.html`), so they resolve under any mount; the two
scripts (notes layer, decide script) compute their base from the page path. Under today's
`serve` the base is `''` and nothing changes for existing users.

**One scope per page.** The server stamps `<meta name="notes-scope">` on every page it serves
(`mock` for a static `.html`, `project` for the derived index) and the layer obeys it. On
`/mocks/a.html` the layer shows the screen's strip and a bar with `+ Note on this state`; on
`/atlas/index.html` it shows the project panel and a bar with `+ Project note`. While the
lightbox is open the index's bar and panel are hidden (`body.lb-open`), so the framed mock's
own bar is the only one on screen.

**Serve regression.** `design-atlas.js serve` keeps its banner, `already serving` reuse,
loopback bind, `?clean` bytes, traversal 404, and SIGTERM exit — pinned by the existing tests
retagged with AC-11.

## Acceptance Criteria

- **AC-20260905-01-1**: WHEN `openStop([], {kind:'pick', key:'shape-picked', title:'pick a shape', candidates:[{group:'a',label:'x',path:'shapes/a.html'},{group:'b',label:'x',path:'shapes/b.html'}]})` runs THE SYSTEM SHALL return stop `P001` with `status:'open'`, `decision:null`, `url:null`, an ISO `openedAt`; a second `openStop` with the same key returns `P002` and marks `P001` `superseded`; `decideStop(stops,'P002',{verdict:'pick', pick:'b', by:'jj'})` succeeds with `note:null` and `previous:[]`; `decideStop(…,{verdict:'pick', pick:'z', …})` throws naming the targets `a, b`; `decideStop(…,{verdict:'approve', …})` on a pick stop throws naming the kind; `decideStop` again on the decided stop with `{verdict:'pick', pick:'a', note:'reads faster', by:'jj'}` succeeds with `decision.pick === 'a'`, `decision.note === 'reads faster'`, and `previous.length === 1` holding the `b` decision; `consumeStop` moves `decided → consumed` and throws on an open stop; `decideStop` on the consumed stop throws `already consumed` and on `P001` throws `superseded`; `pending` lists open before decided, each newest first → `tests/mocks/mocks-picks.test.js`
- **AC-20260905-01-2**: WHEN `openStop([], {kind:'approve', key:'journey-approved:j', title:'approve journey j', candidates:[{group:null,label:'a',path:'mocks/a.html'}]})` is decided `{verdict:'change', note:'', by:'jj'}` THE SYSTEM SHALL throw naming `note`; with `{verdict:'change', note:'too dense', by:'jj'}` it records the note; `validatePicks` returns one error each for id `X1`, kind `maybe`, status `done`, empty candidates, a pick stop with a null-group candidate, an approve stop with a non-null group, and a duplicate id → `tests/mocks/mocks-picks.test.js`
- **AC-20260905-01-3**: WHEN a Node process runs `require('<plugin>/scripts/design-atlas.js')` with `process.argv` = `[node, x, 'nonsense']` THE SYSTEM SHALL return normally (no exit, nothing on stderr) exposing `buildAtlas`, `page`, `frameTag`, `createRequestHandler` as functions → `tests/design-atlas.test.js`
- **AC-20260905-01-4**: WHEN `createRequestHandler(root, {prefix:'/p/demo'})` is mounted on a test `http.createServer` over a root holding `design/mocks/a.html` (`<html><body data-screen-label="a">hi</body></html>`) THE SYSTEM SHALL answer `GET /p/demo/mocks/a.html` 200 with a body ending `<meta name="notes-scope" content="mock">\n<script src="/p/demo/__notes/notes.js"></script>\n</body></html>`, `GET /p/demo/mocks/a.html?clean` with the exact file bytes, `GET /p/demo/__notes/notes.js` 200 `text/javascript`, `GET /p/demo/atlas/index.html` 200 text/html containing `<meta name="notes-scope" content="project">` followed by the same script tag, and `GET /p/demo/../package.json` 404 → `tests/design-atlas.test.js`
- **AC-20260905-01-5**: WHEN the handler (prefix `''`) serves a root whose `picks.json` holds open stop `P001` (pick, groups `a`,`b`) THE SYSTEM SHALL answer `GET /__picks/list` 200 with a JSON array containing `P001`; `POST /__picks/decide {"id":"P001","verdict":"pick","pick":"b","by":"jj"}` 200 with `status:"decided"` and rewrite `picks.json` accordingly; `{"id":"P001","verdict":"pick","pick":"a","note":"why","by":"jj"}` 200 with `decision.pick:"a"`, `decision.note:"why"`, `previous.length:1`; after `consumeStop` through the lib the same POST answers 409; `{"id":"P001","verdict":"change","by":"jj"}` (no note) 400 naming `note`; `{"id":"P999",…}` 404; a non-JSON body 400 → `tests/design-atlas.test.js`
- **AC-20260905-01-6**: WHEN `buildAtlas` runs over a root whose `picks.json` holds an open `pick` stop `P001` (key `shape-picked`, title `pick a shape`, groups `card-first` → `shapes/card-first.html`, `orb-hero` → `shapes/orb-hero.html`, both files present with `data-screen-label="session-live"`) and an open `approve` stop `P002` (key `journey-approved:j1`, candidates `mocks/a.html`, `mocks/b.html`, seed journey `j1` declaring `a -> b`) THE SYSTEM SHALL emit a `<section id="stops">` before the first `class="sect"` section containing `href="#stop-P001"` and `href="#stop-P002"` and no `<iframe`; inside the shapes section a `class="cmp" id="stop-P001" data-kind="pick"` element with exactly two `class="chead"` elements (`data-group="card-first"`, `data-group="orb-hero"`), exactly two `data-decide="pick"` buttons, one `class="step"` row containing `session-live`, exactly one `<iframe` whose `src` ends `shapes/card-first.html?clean` and one ending `shapes/orb-hero.html?clean` (the plain shape cards of today are not emitted for a shape under an open stop), each frame inside a `class="card"` element carrying an `open ↗` link to the same path without `?clean`; and inside the `j1` section a `class="stop" id="stop-P002" data-kind="approve"` element with one `data-decide="approve"` button, one `name="note-P002"` textarea, one `data-decide="change"` button, and no `<iframe` inside that element → `tests/design-atlas.test.js`
- **AC-20260905-01-7**: WHEN a `pick` stop with key `theme-picked` has candidates `{group:'ocean',label:'signin'}`, `{group:'ocean',label:'home'}`, `{group:'ember',label:'signin'}` THE SYSTEM SHALL emit a section with `id="theme"` after the shapes section holding one `.cmp` with exactly two `class="chead"` elements (`ocean`, `ember`), two `class="step"` rows (`signin` before `home`), three `<iframe`s, and one `class="card empty"` cell (ember's `home`); a stop with an unknown key `x-y` renders as a block right after `#stops`; WHEN the same stop is `decided` `{verdict:'pick', pick:'ocean', by:'jj'}` THE SYSTEM SHALL render `class="chead picked"` for `ocean` with the text `Picked`, `class="chead rejected"` for `ember` with the text `Pick this instead`, one `name="why-<id>"` input and one `data-decide="why"` button, and list the stop under `Decided — waiting for the session` with `ocean` and `jj`; WHEN the stop is `consumed`, or `picks.json` is absent, THE SYSTEM SHALL emit neither `id="stops"` nor any `class="cmp"` and the shapes section's plain cards exactly as before → `tests/design-atlas.test.js`
- **AC-20260905-01-8**: WHEN `buildAtlas` runs twice over the same root with an open stop THE SYSTEM SHALL CONTINUE TO produce byte-identical output (AC-20260902-09-6's assertion extended to a root with `picks.json`), and after a `POST /__picks/decide` the file list and every other file's bytes under `<root>/design/` are unchanged except `design/mocks/picks.json` → `tests/design-atlas.test.js`
- **AC-20260905-01-9**: WHEN the served atlas body (no `?clean`) is inspected THE SYSTEM SHALL contain an inline script that references `/__picks/decide`, derives its base with the regex `^/p/[^/]+`, reads `localStorage` key `nl-author`, posts on `data-decide` clicks with the verdicts `pick`, `approve`, `change` and a `why` re-post carrying `note`, contains the literals `open the served atlas to decide`, `already picked up by the session`, `Pick this instead`, and `lb-open`; with `?clean` the body contains no `__picks` reference and no `lb-open` → `tests/design-atlas.test.js`
- **AC-20260905-01-10**: WHEN `lib/notes-layer.browser.js` is evaluated in a Node `vm` context with stub `location.pathname` `/p/hearwell/mocks/a.html`, a stub `document` whose `querySelector('meta[name="notes-scope"]')` returns an element with `content` `mock` and whose `querySelector('[data-screen-label]')` returns an element labelled `a`, recording created elements, and a stub `fetch` recording URLs THE SYSTEM SHALL fetch `/p/hearwell/__notes/list?screen=a` and NOT `…screen=*`, link `/p/hearwell/__notes/viewer.css`, create no element with class `nl-proj`, and create no button whose text is `+ Project note`; with `location.pathname` `/atlas/index.html`, meta content `project`, and `querySelector('[data-screen-label]')` STILL returning an element (the atlas index carries the attribute on its frame wrappers) it fetches `/__notes/list?screen=*` only, links `/__notes/viewer.css`, and creates no element with class `nl-strip`; with no meta and a screen root it behaves as `mock`; and the CSS text it injects contains a rule selector starting `body.lb-open` that hides `.nl-bar` → `tests/design-atlas.test.js`
- **AC-20260905-01-11**: WHEN `design-atlas.js serve --root R --port P` runs THE SYSTEM SHALL CONTINUE TO print `serving http://localhost:P/atlas/index.html — remote: ssh -L P:localhost:P <host>` first, serve `GET /mocks/a.html?clean` as exact bytes with `cache-control: no-store`, inject the notes tag on `GET /mocks/a.html`, answer traversal 404, bind `127.0.0.1` only, exit 0 on SIGTERM, and print `already serving` on a busy port → the existing `serve` tests in `tests/design-atlas.test.js`, retagged
- **AC-20260905-01-12**: WHEN `spec/doctrine/mocks.md` and `spec/entrypoints.json` are read THE SYSTEM SHALL show under `## Mocks: Page Notes` a paragraph containing `picks.json`, `Pick this`, `one scope per page`, `notes-scope`, `compare table`, and `mocks-picks.js`, and an entrypoints row for `spec/scripts/lib/mocks-picks.js` → `tests/design-atlas.test.js`

## Assumptions (escalation triggers)

- A1: The atlas's frame `src` values are relative (`path.relative(outDir, mock.file)`) — read 2026-09-05 in `buildAtlas`; only the notes tag is absolute. **if false:** `buildAtlas` gains a `basePath` option; a build-time deviation, no new Decision.
- A2: `require('design-atlas.js')` today executes the CLI dispatch — executed 2026-09-05: `node -e "require('…/design-atlas.js')"` printed `[design-atlas] usage: design-atlas.js <check|gallery|build|shell|serve> …` and exited 2. **if false:** D2's guard is a no-op; proceed.
- A3: No headless browser is installed in this repo — executed 2026-09-05: `npx --no-install playwright --version` → `npx canceled due to missing packages`. So D4/D5's base rule is a path-string rule tested under `vm`. **if false:** keep the rule; a browser test may be added, never required.
- A4: `tests/design-atlas.test.js` already stands up `serve` through a `withServe` helper with a `finally` kill (read 2026-09-05) — new handler tests mount `createRequestHandler` in-process on `http.createServer` and need no child. **if false:** reuse `withServe`.
- A6: `buildAtlas` emits `data-screen-label` on every `.framewrap` state wrapper of the atlas index (read 2026-09-05, the D15 state-frame block) — so a layer that classified the page by the first `[data-screen-label]` would call the index a mock page; D5's declared scope is the fix. **if false:** keep the declared scope anyway (deterministic beats inference); the fallback branch covers `file://` opens.
- A5: 7.81.0 is taken by an uncommitted direct patch on main today; the build bumps to the next free version and records the deviation (§ Gotchas). **if false:** bump to 7.82.0 as targeted.

## Rationale

The user's 2026-09-05 ruling reframed the earlier "review hub" item: candidates are an atlas
concept, the pick happens on the page with a radio per candidate group, and the decision lands
in `picks.json` for the driver to read. This spec is that page-side half, deliberately mountable
under today's per-project `serve` so it is useful before the hub (spec 02) exists.

**Why a radio, not a star.** One winner, the rest rejected by construction — that is exactly
what the ledger's `rejected` cell needs, and it removes the "did you mean to reject the other
one" interview.

**Why groups are flows.** Shapes, theme directions, and per-surface variants differ only in how
many screens one option carries. One shape (`group` = option, `candidates` = its screens in
order) covers all three without a per-stage renderer.

**Why the decision endpoint is the notes server's.** The process serving this project's
pages is already the one writing its review state (`notes.json`); the hub mounts the same
handler under a prefix, so the endpoint works in both places with no second implementation.

**Why one scope per page, declared by the server.** The screenshot that prompted the item
showed two `+ Project note` bars stacked inside the lightbox. A screen is where mock notes
belong; the atlas is where project notes belong. Inferring the scope from the first
`[data-screen-label]` in the document misreads the atlas index (A6); the server knows which
page it serves and says so in one meta tag. Hiding the index's bar while the lightbox is open
finishes the job: the framed mock's own bar is the one the user sees.

**Why in place, as a compare table, one click.** Amended 2026-09-05 after a clickable
prototype: the first draft rendered every stop as a block at the top with each flow's screens in
a strip of thumbnails, and the user could not review a screen inside a flow. The table (rows =
steps, columns = candidates, full cards with `open ↗`) is the only layout where the same
screen of two flows is compared directly; putting the block in the section its screens already
live in removes the duplicate frames; the radio-then-button pair became one click with the
why-line after it; and a decision stays re-pickable until the session consumes it, because a
second look that changes one's mind must not wait on a session round-trip.

**Collision closure.** The `executes` leg named `tests/design-shell.test.js` (it runs the
`shell` subcommands through the CLI): D2's main guard keeps every CLI path byte-identical, so no
fixture repair is owed; the build's whole-suite check adjudicates.

**Collision closure, amendment 2026-09-05** (`unplanned=14 likely=5`, literals
`Waiting for your look`, `already decided`). The first literal hits only `design-atlas.js`
(a File Plan row); the second hits `docs/roadmap/02`, `docs/roadmap/10`, and
`tests/genesis/genesis-driver.test.js`, all genesis-driver prose about its own refusals, not this
lib's message — waived. The `executes` set is unchanged from the first lock.

**Fragile.** The atlas inline script and the notes layer each carry the same base-derivation
regex; a change to the hub's mount shape must touch both (spec 02 pins the mount as `/p/<name>`).

## Canonical Delta

`docs/canonical/design.md` "Page notes" section gains a paragraph **Picks (specs/20260905/01)**:
a look stop is a record in `design/mocks/picks.json` (one writer, `lib/mocks-picks.js`) of
candidate groups — a group is one flow, its screens in order; the served atlas lists open
stops at the top and renders each in place in the section its screens live in, a pick stop as a
compare table (one row per step, one column per candidate, full cards) with a one-click
Pick-this per group and an optional why-line after it, an approve stop as Approve / Change with
a note; the decision posts to the notes server's `/__picks/decide` and lands in `picks.json`,
re-pickable until the mocks driver consumes it. The notes layer shows one scope per page,
declared by the server's `notes-scope` meta: project notes on the atlas index, mock notes on a
screen, and the index's bar hides while the lightbox is open. The
`design-atlas.js` script exports `buildAtlas`, `page`, `frameTag`, `createRequestHandler` and
runs its CLI only as a main module.
