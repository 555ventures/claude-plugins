---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks
breaking: false
depends_on: [specs/20260912/11-a-note-can-mark-an-area.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
---

# The loop re-anchors, and everyone draws

## Goal

specs/20260912/11 lets the owner mark an area on a served mock page and gives every other surface an
honest `outdated` state. This spec closes the loop where the anchor most often breaks and extends the
mark to every place a note is read or written. When the session addresses a region note, the driver
re-anchors the box against the edited mock in headless Chrome before the note turns amber, so the
owner's return view shows the box on the changed content instead of a gray "outdated" row. The
journey review page's rows jump to their boxes inside the framed mock; the client mount stores a
region and the client walk page shows the same badges and footnotes; drawing works by touch with a
long-press; and the atlas index cards carry an open/needs-you count per screen. Done means: an
addressed region note reads `addressed.reanchored` on disk, a review-page row click focuses its box,
a client-drawn note lands with its region, and the atlas shows the counts.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **`notes address` re-anchors a region note.** In `mocks-driver.js`, when the found note carries `region`, the driver requires `--port` (the same fallback to `status.client.port` the client path uses) and calls `resolveRegion` (D2). Outcome `exact` or `children`: the region is REPLACED by a fresh `NotesAnchor.capture` over the resolved box (a new anchor for the edited markup) and `addressed.reanchored` = that mode; outcome `null`: the region is left as is and `addressed.reanchored` = `'lost'`, and the driver prints `notes address: <id> → addressed (box lost — the owner will be asked to re-place it)` on stdout, exit 0. `--port` missing on a region note → `die` naming the serve command, exactly like the client-origin refusal (AC-20260912-12-1, -2, -8) | Amber means "I changed it", and the change is what moves the anchor. Re-capturing over the resolved box turns a one-edit-old anchor into a current one, so the owner's `Needs you` view shows the box on the new content. A lost box is reported, never hidden and never guessed |
| D2 | **`client-capture.js` gains `resolveRegion({port, label, state, viewport, region})`** → `Promise<{mode:'exact'|'children'|null, region: <fresh region>|null}>`: opens the served mock at the given state in headless Chrome (the same boot `captureScreen` uses, same `CHROME_BIN` discovery), evaluates `NotesAnchor.resolve(root, region)` in the page and, when it resolves, `NotesAnchor.capture(root, box)` over the returned box; returns both. No screenshot is taken (AC-20260912-12-2) | One Chrome boot path, one discovery rule — the capture lib already owns "run a served mock headless"; adding a second launcher in the driver is the duplication the host rules flag |
| D3 | **The review page's rows jump to their boxes.** `review-page.js` renders a `data-rv="row"` for a region note with `data-region="1"` and a `<button data-rv="jump">Show on the screen</button>` inside the row; `review.browser.js` handles the click: it focuses the row's screen board and state tab (the existing focus mechanics), then calls `frame.contentWindow.__nlFocus(id)` on that board's visible `iframe[data-rv="frame"]` — a function `notes-layer.browser.js` exposes (D5) that selects the box, scrolls it into view and pulses it. The page's own composer stays screen-level (drawing happens inside the frame's bar, which is the served mock's own layer). The button is added to `design/chrome-mocks/review.html`, the review page's binding artifact (design.md § Design Canon), by the planning session; workers read it and do not edit it (AC-20260912-12-3, -4) | The frames are same-origin served mocks and already carry the layer, so the review page needs a pointer into them, not a second overlay. One function on the layer is the whole bridge |
| D4 (amended) | **The client mount stores a region.** `/client/__notes/add`'s `addClientMockNote` passes `region` through to `addNote` (the before-capture is unchanged); `/client/__notes/region` mirrors the session route with `origin` checks like the client's other verbs; `walk-page.js`'s note rows gain the badge and the two footnotes from specs/20260912/11 D8, and carry the outdated fact on a NEW `data-region="outdated"` attribute — never on `data-status`, which keeps meaning the note's own lifecycle status — set when the row's region is flagged `addressed.reanchored:'lost'` or the walk page cannot resolve it; the client's `Not needed` (withdraw) and reopen controls are unchanged. The client index page shows `N open` per journey as today (AC-20260912-12-5, -9, -10) | Clients approve the journey preview; a client who cannot mark an area sends prose and the loop stays slow. The client's existing verbs already cover accept/withdraw/reopen, so only add and re-place are new. **Amended at build entry (2026-09-12):** `data-status` on `.wk-req` is load-bearing in two places an `outdated` value would silently break — viewer.css hides the action row on `resolved`, and `walk.browser.js`'s `refreshNavDisabled` counts only `open`/`addressed` rows as blocking, so an `outdated` row would stop blocking and the confirm button would enable with the request still unanswered. A separate attribute costs one selector and cannot unlock a sign-off |
| D5 | **Touch drawing and the focus hook in the layer.** `notes-layer.browser.js`: pointer events replace mouse events; a `pointerType:'touch'` press starts the draft only after a 350 ms hold without movement > 8 px (a scroll gesture never draws), the drag then follows the finger; `window.__nlFocus(id)` selects and pulses the box and opens its card; viewports under 640 px already render the card as a bottom sheet (specs/20260912/11 D6) (AC-20260912-12-6) | Long-press is the one gesture that does not fight page scroll on a phone, and it is what every tool in the field uses |
| D6 | **The atlas index cards carry counts.** `design-atlas.js`'s derived index renders, on each screen card, `<span class="nl-card-count" data-open="N" data-needs="M">N open · M need you</span>` computed server-side from notes.json (open = status `open` non-question notes on that screen; needs = status `addressed`), omitted entirely when both are zero. The count is added to `design/chrome-mocks/atlas.html`, the atlas index’s binding artifact (design.md § Design Canon), by the planning session; workers read it and do not edit it (AC-20260912-12-7) | The owner opens the atlas first; a count is how they know which screen to open. Server-derived so a `?clean` render and the browser agree |
| D7 | Plugin bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: `--check` in the gate is the oracle]` | Version discipline from .claude/rules/spec-pipeline.md § Planning |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 `notes address` re-anchor branch for region notes; `addressed.reanchored` |
| spec/scripts/lib/client-capture.js | MODIFY | scripts | D2 `resolveRegion` beside `captureScreen`, exported |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5 pointer events + long-press; `window.__nlFocus(id)` |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D3 `data-region` + `data-rv="jump"` on region rows |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D3 jump handler → focus board/tab → `frame.contentWindow.__nlFocus` |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D4 badge, `data-status`, footnotes on client note rows |
| spec/scripts/design-atlas.js | MODIFY | scripts | D4 client add passes `region`, `/client/__notes/region`; D6 index card counts |
| design/chrome-mocks/review.html | MODIFY | doctrine | D3 the `Show on the screen` button on a region row — landed by the planning session; workers read it and leave it |
| design/chrome-mocks/atlas.html | MODIFY | doctrine | D6 the `N open · M need you` count on a screen card — landed by the planning session; workers read it and leave it |
| tests/mocks/notes-reanchor.test.js | CREATE | tests | AC-20260912-12-1, -2, -8 (`-2 [env: CHROME_BIN]`) |
| tests/mocks/review-region.test.js | CREATE | tests | AC-20260912-12-3, -4 (`-4 [env: CHROME_BIN]`) |
| tests/mocks/client-region.test.js | CREATE | tests | AC-20260912-12-5, -6 (`-6 [env: CHROME_BIN]`), -7, -9, -10 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |

## Contracts

```js
// notes.json — after `notes address` on a region note (D1)
addressed: { at, change, ledgerRow, reanchored: 'exact' | 'children' | 'lost' }
// region: replaced by a fresh capture when reanchored ∈ exact|children; untouched when 'lost'

// client-capture.js (D2)
resolveRegion({ port, label, state, viewport, region })
  // → Promise<{ mode: 'exact'|'children'|null, region: object|null }>
  // rejects with the same errors captureScreen does (no Chrome found, page did not load)

// review-page.js (D3) — a region note's row
<article data-rv="row" data-id="N007" data-kind="note" data-status="addressed" data-region="1" …>
  … <button type="button" data-rv="jump">Show on the screen</button> …
// notes-layer.browser.js (D5)
window.__nlFocus = function (id) { /* select + scrollIntoView + pulse + open card; no-op on unknown id */ }

// HTTP (D4), client mount
POST /client/__notes/add    {…, region?}   → 201 (unchanged otherwise)
POST /client/__notes/region {id, region}   → 200 | 400 'a client re-places only a client note' | 404

// walk-page.js (D4 amended) — a client request row whose region no longer resolves
<article class="wk-req" data-cl="request" data-id="N007" data-status="open" data-region="outdated" …>
  … <span class="nl-region-badge">…</span> …
// `data-status` keeps the note's own lifecycle status — viewer.css's action-row rules and
// walk.browser.js's `refreshNavDisabled` blocking count both read it, and neither learns a new value.

// design-atlas.js index (D6)
<span class="nl-card-count" data-open="2" data-needs="1">2 open · 1 need you</span>   // absent when 0/0
```

## UI

Binding artifact: `design/chrome-mocks/notes.html` (specs/20260912/11 D10) — the phone frame in it
shows the bottom-sheet card and the wrapped bar this spec's touch path reaches. Additions here:
the review page row's `Show on the screen` button (`.rv-jump`, a `.rv` button like the row's others);
the client walk page's badge (`.nl-region-badge` reused from viewer.css); the atlas card count
(`.nl-card-count`, muted text behind one status dot — amber when `data-needs` is non-zero, else red.
Two dots cannot be rendered: D6’s contract fixes the span’s content as one flat text node, so CSS has
only `::before`/`::after` and neither can sit in front of the second number).

## Data Model

`addressed.reanchored` is a new optional field on the existing `addressed` object; absent on every
note addressed before this spec and on every non-region note. No migration.

## Behavior

- **Address.** `notes address --id N007 --change "…" [--port]` → region note → resolve in Chrome →
  fresh capture or `lost` → status `addressed` → stdout line. Non-region notes: byte-identical to
  today's path (a CONTINUE-TO pin covers it).
- **Review page.** Row click behaviour is unchanged; the new button inside the row focuses the board
  and tab, then focuses the box in the frame. If the frame has not loaded, the call is retried once on
  the frame's `load` event.
- **Client walk.** A client draws inside the framed mock (the served page's own layer, mark mode); the
  layer posts to the mount it was served from, so `/client/__notes/add` receives the region and runs
  the before-capture as today.
- **Touch.** Hold 350 ms without moving → draft starts under the finger → drag → release → card as a
  bottom sheet. Moving before 350 ms is a scroll; nothing is drawn.
- **Atlas.** Counts are derived on every index render from notes.json; a `?clean` render carries them too.

## Acceptance Criteria

- **AC-20260912-12-1**: WHEN `mocks-driver.js notes address --id <region note> --change "x"` runs with
  no `--port` and no `status.client.port` THE SYSTEM SHALL exit non-zero with stderr containing
  `requires --port` and leave notes.json unchanged → writes tests/mocks/notes-reanchor.test.js
- **AC-20260912-12-8**: WHEN `notes address` runs on a NON-region session note THE SYSTEM SHALL
  CONTINUE TO address it with no Chrome launched and an `addressed` object carrying no `reanchored`
  field → writes tests/mocks/notes-reanchor.test.js
- **AC-20260912-12-2** `[env: CHROME_BIN]`: WHEN a served fixture mock's markup is edited so the
  region's anchor element keeps its snippet but the row becomes a column, and `notes address --port`
  runs THE SYSTEM SHALL write `addressed.reanchored` = `children` and a `region` whose
  `layout.arrangement` = `col`; WHEN the anchor element is removed instead THE SYSTEM SHALL write
  `reanchored` = `lost`, leave `region` byte-identical, print `box lost` on stdout, and exit 0 → writes tests/mocks/notes-reanchor.test.js
- **AC-20260912-12-3**: WHEN `review-page.js` renders a region note THE SYSTEM SHALL emit its row with
  `data-region="1"` and a `[data-rv="jump"]` button whose text is `Show on the screen`; a non-region
  note's row SHALL carry neither → writes tests/mocks/review-region.test.js
- **AC-20260912-12-4** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome and a
  region row's `Show on the screen` is clicked THE SYSTEM SHALL leave that row's board focused and the
  framed mock's `.nl-region[data-id=<id>]` carrying class `sel` → writes tests/mocks/review-region.test.js
- **AC-20260912-12-5**: WHEN `POST /client/__notes/add` carries a mock-scope body with a valid `region`
  THE SYSTEM SHALL answer 201 with the note carrying `origin:"client"` and that region; WHEN
  `POST /client/__notes/region` targets a session-origin note THE SYSTEM SHALL answer 400 with `error`
  containing `only a client note` → writes tests/mocks/client-region.test.js
- **AC-20260912-12-6** `[env: CHROME_BIN]`: WHEN a `pointerType:"touch"` pointerdown is dispatched on
  the served mock in mark mode and released after 100 ms THE SYSTEM SHALL create no draft; WHEN it is
  held 400 ms, moved 200 px and released THE SYSTEM SHALL open the composer card → writes tests/mocks/client-region.test.js
- **AC-20260912-12-9**: WHEN `walk-page.js` renders a client-origin request note whose region is
  flagged `addressed.reanchored:'lost'` THE SYSTEM SHALL emit its `.wk-req` article carrying
  `data-region="outdated"`, a `.nl-region-badge`, and the specs/20260912/11 D8 outdated footnote text,
  with `data-status` still carrying the note’s own status; a note whose region resolves SHALL carry
  no `data-region` → writes tests/mocks/client-region.test.js
- **AC-20260912-12-10**: WHEN `walk.browser.js`’s `refreshNavDisabled` runs over a walk page whose
  only `[data-wk="request"]` article carries `data-region="outdated"` and `data-status="open"` THE
  SYSTEM SHALL CONTINUE TO leave the journey’s confirm button `disabled` → writes tests/mocks/client-region.test.js
- **AC-20260912-12-7**: WHEN the atlas index is derived with notes.json holding two `open` and one
  `addressed` note on screen `a` and none on screen `b` THE SYSTEM SHALL render `a`'s card with
  `<span class="nl-card-count" data-open="2" data-needs="1">2 open · 1 need you</span>` and `b`'s card
  with no `.nl-card-count` → writes tests/mocks/client-region.test.js

## Assumptions (escalation triggers)

- A1: `captureScreen`'s Chrome boot is reusable for an evaluate-only call (it renders the served page
  before screenshotting). **if false:** `resolveRegion` boots the same way with its own evaluate step,
  still inside `client-capture.js` — never a launcher in the driver.
- A2: The review page's frames are same-origin served mocks with the layer injected (review-page.js
  header: "every artboard iframe is the served mock"). **if false:** STOP — D3's bridge needs a
  postMessage design; ask the user.
- A3: The client walk page frames the served mock the same way, so the layer (and its mark mode) is
  already present for the client. **if false:** D4's drawing half is cut to the client mount's route
  and rows only; note it in the spec and queue the client-frame work.
- A4: specs/20260912/11 landed `__nlFocus`'s prerequisites (the `sel` class, the pulse, the card
  opener) as browser functions the hook can call. **if false:** implement them inside the hook.

## Rationale

This spec is the second half of one design, split by landing unit: specs/20260912/11 leaves a
complete, honest mock-page loop; this one makes the loop self-healing at the moment it most often
breaks and carries the mark to the review page, the client, the phone and the atlas. Re-anchor is
first because the owner's own words — "when I highlight on desktop it should be exactly where it
highlights on any other device" — fail most visibly not across devices but across my own edits: the
change that earns the amber badge is the change that moves the box. Re-capturing over the resolved
box makes the anchor one edit old at most.

Rejected: re-anchoring in the browser on the owner's next visit (it would mean the ledger holds a
stale anchor and every reader but Chrome sees `lost`); a second overlay on the review page (the
frames already carry the layer; a bridge function is the whole cost); drag-to-draw on touch without a
hold (it fights scroll on every phone).

Fragile: the headless resolve depends on the mock rendering at the driver's `captureViewport()`
width; a mock that reflows at that width differently from the owner's browser resolves in `children`
mode more often than expected — visible in the strip footnote, never wrong. Chrome-gated ACs skip
without `CHROME_BIN`; the route, render and driver-refusal ACs never skip.

## Canonical Delta

No `docs/canonical/design-mocks.md` exists. specs/20260912/11's doctrine paragraph and ADR-0019 are
the canonical record; this spec edits no doctrine.
