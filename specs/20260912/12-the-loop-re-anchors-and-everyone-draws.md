---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks
breaking: false
depends_on: [specs/20260912/11-a-note-can-mark-an-area.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
build_base: main
open_markers: 0
diff_base: 851ede5aeb614417efb61b43ba46d18e8304120e
---

# The loop re-anchors, and everyone draws

## Goal

specs/20260912/11 lets the owner mark an area on a served mock page and gives every other surface an
honest `outdated` state. This spec closes the loop where the anchor most often breaks and extends the
mark to every place a note is read or written. When the session addresses a region note, the driver
re-anchors the box against the edited mock in headless Chrome before the note turns amber, so the
owner's return view shows the box on the changed content instead of a gray "outdated" row. On the
journey review page every marked area is painted on its board at all times — a numbered pin at the
box's corner — and selection runs both ways: a note row selects its box, a box selects its row, and
a box drawn on a state the board is not showing pulls that state's tab forward. The reviewer can
hide the marks to see the untouched design, and start a new one from the composer. The client mount
stores a region and the client walk page shows the same badges and footnotes; drawing works by touch
with a long-press; and the atlas index cards carry an open/needs-you count per screen. Done means: an
addressed region note reads `addressed.reanchored` on disk, a review-page row click selects its box
and a box click selects its row, a client-drawn note lands with its region, and the atlas shows the
counts.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **`notes address` re-anchors a region note.** In `mocks-driver.js`, when the found note carries `region`, the driver requires `--port` (the same fallback to `status.client.port` the client path uses) and calls `resolveRegion` (D2). Outcome `exact` or `children`: the region is REPLACED by a fresh `NotesAnchor.capture` over the resolved box (a new anchor for the edited markup) and `addressed.reanchored` = that mode; outcome `null`: the region is left as is and `addressed.reanchored` = `'lost'`, and the driver prints `notes address: <id> → addressed (box lost — the owner will be asked to re-place it)` on stdout, exit 0. `--port` missing on a region note → `die` naming the serve command, exactly like the client-origin refusal (AC-20260912-12-1, -2, -8) | Amber means "I changed it", and the change is what moves the anchor. Re-capturing over the resolved box turns a one-edit-old anchor into a current one, so the owner's `Needs you` view shows the box on the new content. A lost box is reported, never hidden and never guessed |
| D2 | **`client-capture.js` gains `resolveRegion({port, label, state, viewport, region})`** → `Promise<{mode:'exact'|'children'|null, region: <fresh region>|null}>`: opens the served mock at the given state in headless Chrome (the same boot `captureScreen` uses, same `CHROME_BIN` discovery), evaluates `NotesAnchor.resolve(root, region)` in the page and, when it resolves, `NotesAnchor.capture(root, box)` over the returned box; returns both. No screenshot is taken (AC-20260912-12-2) | One Chrome boot path, one discovery rule — the capture lib already owns "run a served mock headless"; adding a second launcher in the driver is the duplication the host rules flag |
| D3 (amended) | **The box is the note — the marks are always painted, and the row is the click target.** `review-page.js` renders a region note's `data-rv="row"` with `data-region="1"`, `data-state="<the state it was drawn on>"`, and the note id inside an orange `<span class="rv-pin">` where a whole-screen / whole-project row keeps its muted `<span class="rv-id">`; the note text leads in both and there is no other layout difference. The row itself is the click target (`.rv-row`, `cursor:pointer`, its left rule the selection accent — `data-selected`). There is NO `Show on the screen` control: `review-page.js` emits zero `button[data-rv="jump"]` and `review.browser.js` binds no `[data-rv="row"] [data-rv="jump"]` handler (the rail's `<select class="rv-jump" data-rv="jump">` screen picker is a different control and is unchanged). The boxes themselves keep being painted by the framed mock's own notes layer on every render, with no reveal step. `design/chrome-mocks/review.html` is the binding artifact and already carries this; workers read it and do not edit it (AC-20260912-12-3, -4) | The first cut made the owner ask for a box twice — once by drawing it, once by pressing a button to see it again. A mark that is always on the board is the note; a button to reveal it is a second thing to learn. Removing it also removes the only control on the row that was not the row |
| D4 (amended) | **The client mount stores a region.** `/client/__notes/add`'s `addClientMockNote` passes `region` through to `addNote` (the before-capture is unchanged); `/client/__notes/region` mirrors the session route with `origin` checks like the client's other verbs; `walk-page.js`'s note rows gain the badge and the two footnotes from specs/20260912/11 D8, and carry the outdated fact on a NEW `data-region="outdated"` attribute — never on `data-status`, which keeps meaning the note's own lifecycle status — set when the row's region is flagged `addressed.reanchored:'lost'` or the walk page cannot resolve it; the client's `Not needed` (withdraw) and reopen controls are unchanged. The client index page shows `N open` per journey as today (AC-20260912-12-5, -9, -10, -23) | Clients approve the journey preview; a client who cannot mark an area sends prose and the loop stays slow. The client's existing verbs already cover accept/withdraw/reopen, so only add and re-place are new. **Amended at build entry (2026-09-12):** `data-status` on `.wk-req` is load-bearing in two places an `outdated` value would silently break — viewer.css hides the action row on `resolved`, and `walk.browser.js`'s `refreshNavDisabled` counts only `open`/`addressed` rows as blocking, so an `outdated` row would stop blocking and the confirm button would enable with the request still unanswered. A separate attribute costs one selector and cannot unlock a sign-off |
| D5 | **Touch drawing and the focus hook in the layer.** `notes-layer.browser.js`: pointer events replace mouse events; a `pointerType:'touch'` press starts the draft only after a 350 ms hold without movement > 8 px (a scroll gesture never draws), the drag then follows the finger; `window.__nlFocus(id)` selects and pulses the box and opens its card; viewports under 640 px already render the card as a bottom sheet (specs/20260912/11 D6) (AC-20260912-12-4, -6) | Long-press is the one gesture that does not fight page scroll on a phone, and it is what every tool in the field uses |
| D6 | **The atlas index cards carry counts.** `design-atlas.js`'s derived index renders, on each screen card, `<span class="nl-card-count" data-open="N" data-needs="M">N open · M need you</span>` computed server-side from notes.json (open = status `open` non-question notes on that screen; needs = status `addressed`), omitted entirely when both are zero. The count is added to `design/chrome-mocks/atlas.html`, the atlas index’s binding artifact (design.md § Design Canon), by the planning session; workers read it and do not edit it (AC-20260912-12-7) | The owner opens the atlas first; a count is how they know which screen to open. Server-derived so a `?clean` render and the browser agree |
| D8 | **Selection is bidirectional, by direct same-origin call.** Row → box: `review.browser.js`'s `select(id, …)` focuses the row's board (`focusBoard`), switches that board's state tab to the row's `data-state` (D9), then calls `frame.contentWindow.__nlFocus(id)` on that board's visible `iframe[data-rv="frame"]`, retrying exactly once on the frame's `load` event if the frame has not loaded. Box → row: `notes-layer.browser.js`, when it is framed (`window.parent !== window`), calls `window.parent.__rvPick(id)` inside a `try` on a box click; `review.browser.js` defines `window.__rvPick = function (id) { … }` which scrolls that row into view and selects it. No postMessage in either direction, and no message listener on either side (AC-20260912-12-4, -11) | The frames are same-origin served mocks (A2, D16), so a direct function call is the whole bridge — a postMessage protocol would add a wire format, an origin check and an async hop to buy nothing. One exposed function per direction, both no-ops when the other side is absent |
| D9 | **A box belongs to the state tab it was drawn on.** `review-page.js` emits `data-state` on every region row (the note's own `state`, defaulting to `happy`) and, on each state tab, `<span class="rv-tabpin">N</span>` carrying the count of region notes drawn on that state — the span is absent entirely when the count is zero. `review.browser.js`'s `select(id, …)` reads the row's `data-state` and, when it differs from the board's `aria-selected="true"` tab, activates that tab (the existing tab mechanics: `aria-selected` moves, the matching frame unhides, the others hide) BEFORE calling `__nlFocus` (AC-20260912-12-12, -13) | One frame per state means a box only exists inside the frame for its own state, so selecting a note drawn on `error` while the board shows `happy` would otherwise focus nothing and look broken. The tab count is how the reviewer sees marks on a state they are not looking at |
| D10 | **A hide-marks toggle per board.** `review-page.js` emits, in each `.rv-cap`, `<button class="rv-pins" data-rv="pins" data-label="<label>" aria-pressed="true" title="Hide marks" aria-label="Hide marks">` (an eye glyph whose slash shows at `aria-pressed="false"`) and `data-pins="on"` on the `.rv-board`. `review.browser.js` flips both on click and calls `frame.contentWindow.__nlPins(false|true)` on every frame of that board — a function `notes-layer.browser.js` exposes that hides or shows its box layer. The toggle is per board and is not persisted (AC-20260912-12-14, -15) | The marks sit on top of the design, so the one question they make hard to answer is "what does the screen look like without them". An eye in the caption is the standard answer and costs one attribute |
| D11 | **`Mark an area` is the composer's entry into drawing.** `review-page.js` emits `<button type="button" class="rv-mark-area" data-rv="mark-area" title="Draw a box on the screen, then write the note">Mark an area</button>` beside `Send` in `.rv-composer .rv-actions` (a ghost action whose `::before` glyph is a dashed rectangle). `review.browser.js` calls `frame.contentWindow.__nlMark(true)` on the focused board's visible frame — `notes-layer.browser.js` exposes `window.__nlMark(on)` over its existing `setMarking`; the drag, the draft and the note itself stay entirely inside the frame's own layer, which posts to the mount it was served from, exactly as today (AC-20260912-12-16, -17) | Drawing already works inside the frame, but nothing on the review page said so — the reviewer had to find the frame's own bar. One ghost action beside Send names the gesture where the reviewer is already typing |
| D12 | **A mark is two parts, in the real layer.** `spec/templates/mocks/viewer.css`: `.nl-region` loses its solid border (`border:0`) and becomes a stroke-less highlighter tint over exactly the dragged area (`background: color-mix(in srgb, var(--c) 8%, transparent)`, `border-radius:2px`); a new `.nl-region::before` is the dashed frame held outside it — `inset:-6px`, `border:1.5px dashed color-mix(in srgb, var(--c) 65%, var(--v-bg))`, `border-radius:5px`, `box-shadow:0 0 0 3px color-mix(in srgb, var(--v-bg) 55%, transparent)`, `pointer-events:none`. `.nl-region.sel` deepens the tint (`17%`) and `.nl-region.sel::before` goes to `border-width:2px` at full `var(--c)` over a `26%` glow — a change of weight inside the annotation register, never back to a solid border. `.nl-region-badge` keeps riding the frame's corner. `.nl-region[data-status="outdated"]`'s existing dashed-border rule is retired with the border it modified (AC-20260912-12-18) | The thin solid outline read as a second card edge wherever it landed on a bordered element — the nesting defect the owner caught. A tint cannot nest inside anything because it has no stroke, and a dashed warn rule 6px outside the content exists nowhere else in the register, so it has no lookalike on any mock it is painted over |
| D13 | **The filter tabs say who is waiting.** `review-page.js`'s filter row reads `Needs you` / `Done` / `All`; the `data-filter` values stay `open` / `answered` / `all` and no filter predicate changes (AC-20260912-12-19) | An addressed note waits on the reviewer and is not "Open" in any sense they mean; `Needs you` is the only label that is true of every row under that tab. Renaming the values would break every consumer for no gain |
| D14 | **The caption count is inert.** `review-page.js` emits the board caption's count as `<span class="rv-badge" data-rv="badge" …>`, not a `<button>`, and `review.browser.js`'s `[data-rv="badge"]` click handler is deleted; `recount()`'s `[data-rv="badge"]` update is unchanged (a span takes the same attributes) (AC-20260912-12-19, -20) | It looked like the rail's link and did something else — it narrowed the panel to that screen, which scrolling the board already does. A number that is a number cannot mislead |
| D15 | **The scope band says what it filters, and offers the way out.** `review-page.js` emits `<span class="rv-scopeband-label">On screen</span><span class="rv-screenfilter" data-rv="screenfilter">…</span><span class="rv-scopeband-label">plus the whole project</span><button class="rv-allscreens" data-rv="allscreens">All screens</button>`. `review.browser.js`'s `applyFilter` matches that sentence: with a screen-label `screenFilter`, a row shows when its `data-label` matches OR it carries no `data-label` (a project-scope row); `__project` is unchanged; `All screens` clears `screenFilter` and re-applies. SUCCESS is the panel widening to every screen's rows; PATH BACK is scrolling to a board (`focusBoard` re-narrows); the farthest artifact it reaches is the reviewer's own reading of the list — it posts nothing (AC-20260912-12-19, -20) | The band showed a screen name under a bare `Notes for` and silently hid every whole-project note, so a reviewer answering screen by screen never saw the notes that block sign-off. Saying the scope out loud and giving it a way out costs one button |
| D16 | **The layer rides into a framed mock on its own opt-in flag.** `review-page.js`'s `frameSrc` requests `?clean&notes=1`; `design-atlas.js`'s mock route injects the notes-layer script only when the `notes` param is present, and `notes-layer.browser.js`'s own `location.search` guard checks the same flag. A bare `?clean` request — every other caller — still gets no layer at all, so the pinned isolation invariant is untouched (AC-20260912-12-21) | A2 was empirically false: `?clean` deliberately strips the layer, which is exactly what the screenshot path needs. Two independent flags let one caller ask for a clean chrome AND a live layer without widening `clean` for anybody else |
| D17 (owner ruling, 2026-09-13) | **A box keeps its state colour; the orange register is the review page's chrome only.** `notes-layer.browser.js`'s `colorFor` SHALL CONTINUE TO resolve specs/20260912/11 D9's four roles distinctly — `var(--v-danger)` open, `var(--v-warn)` addressed, `var(--v-ok)` resolved, `var(--v-muted)` outdated/withdrawn — and this spec amends none of them. The orange badge register D3 and the UI section describe binds the review page's own chrome (`.rv-pin`, `.rv-badge`, `.rv-tabpin`, the rail counts) and never the box tint or its frame, which track status. `spec/templates/mocks/viewer.css`'s `.nl-region` comment block SHALL keep describing that register truthfully (AC-20260912-12-22) | The build collapsed `open` onto `var(--v-warn)` to match the approved mock, which made an open box and an addressed one identical on every served mock. The box colour is the only cue that tells the owner, scanning a screen, which marks still need them; the mock's orange was a register choice for the numbered pin, and the pin can carry it without the box following. Ruled by the owner at the review stage's disposition step, recorded here rather than in a code comment |
| D7 | Plugin bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: `--check` in the gate is the oracle]` | Version discipline from .claude/rules/spec-pipeline.md § Planning |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 `notes address` re-anchor branch for region notes; `addressed.reanchored` |
| spec/scripts/lib/client-capture.js | MODIFY | scripts | D2 `resolveRegion` beside `captureScreen`, exported |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5 pointer events + long-press; `window.__nlFocus(id)`; D8 `window.parent.__rvPick(id)` on a box click when framed; D10 `window.__nlPins(on)`; D11 `window.__nlMark(on)`; D16 the `notes` flag in its own `location.search` guard |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D12 `.nl-region` two-part mark — stroke-less tint + `::before` dashed frame at `inset:-6px`; `.sel` changes weight inside the register; the `[data-status="outdated"]` dashed-border rule retires with the border |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D3 region row (`data-region`, `data-state`, `.rv-pin`), no `data-rv="jump"` button; D9 `.rv-tabpin` per state tab; D10 `.rv-pins` + `data-pins="on"`; D11 `.rv-mark-area`; D13 filter labels; D14 badge as `<span>`; D15 scope band + `All screens`; D16 `frameSrc` carries `&notes=1` |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D3 the jump handler is deleted; D8 `select()` → focus board/tab → `__nlFocus`, and `window.__rvPick(id)` for the box→row direction; D9 tab switch on select; D10 pins toggle → `__nlPins`; D11 mark-area → `__nlMark`; D14 the badge click handler is deleted; D15 `applyFilter` admits project rows + `All screens` clears the filter |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D4 badge, `data-region="outdated"`, footnotes on client note rows; disposed s1 (2026-09-13): the badge's `--c` custom property is set inline (`regionColorVar`), fixing the transparent-background defect the shipped `.nl-region-badge{background:var(--c)}` rule has no fallback for |
| spec/scripts/design-atlas.js | MODIFY | scripts | D4 client add passes `region`, `/client/__notes/region`; D6 index card counts; D16 the mock route injects the notes-layer script only when the `notes` param is present |
| design/chrome-mocks/review.html | MODIFY | doctrine | D3/D8–D15 the accepted marks design — always-painted two-part marks with numbered pins, one row layout, state-tab counts, the eye toggle, `Mark an area`, and the three page fixes. Landed by the planning session; workers read it and leave it |
| design/chrome-mocks/atlas.html | MODIFY | doctrine | D6 the `N open · M need you` count on a screen card — landed by the planning session; workers read it and leave it |
| tests/mocks/review-page.test.js | MODIFY | tests | AC-20260912-12-19 — the `AC-20260912-06-3` pin asserts the scope band carries `>Notes for<` as DOM text, the literal D15 retires. Updated in place to the new band sentence (`>On screen<` … `>plus the whole project<`) and retagged; its second half (viewer.css carries no `content: "Notes for"`) is unchanged and still true. Never weakened, never left red |
| tests/mocks/notes-reanchor.test.js | CREATE | tests | AC-20260912-12-1, -2, -8 (`-2 [env: CHROME_BIN]`) |
| tests/mocks/review-region.test.js | CREATE | tests | AC-20260912-12-3, -4, -11, -12, -13, -14, -15, -16, -17, -19, -20, -21 (`-4, -11, -13, -15, -17, -20 [env: CHROME_BIN]`) |
| tests/mocks/client-region.test.js | CREATE | tests | AC-20260912-12-5, -6 (`-6 [env: CHROME_BIN]`), -7, -9, -10, -18 (`-18 [env: CHROME_BIN]`), -22 (`-22 [env: CHROME_BIN]`), -23 |
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

// review-page.js (D3) — a region note's row: same layout as any other, the id in the pin
<article data-rv="row" data-id="N007" data-kind="note" data-status="addressed" data-region="1"
         data-label="a" data-state="happy" class="rv-row rv-note" …>
  <div class="rv-rowhead"><span class="rv-pin">N007</span>…</div><p class="rv-claim">…</p> …
// …and a whole-screen / whole-project row, unchanged: no data-region, no data-state, muted id
  <div class="rv-rowhead"><span class="rv-id">N003</span>…</div><p class="rv-claim">…</p> …
// No `button[data-rv="jump"]` is emitted anywhere (D3). The rail's screen picker keeps its own
// `<select class="rv-jump" aria-label="Jump to a screen" data-rv="jump">` — a different control.

// review-page.js (D9) — a state tab carrying marks, and one carrying none
<button role="tab" data-rv="tab" data-state="happy" aria-selected="true">happy<span class="rv-tabpin">1</span></button>
<button role="tab" data-rv="tab" data-state="empty" data-gray data-gray-first aria-selected="false">empty</button>

// review-page.js (D10/D14) — the caption: an inert count, then the eye
<section class="rv-board" data-rv="board" data-label="a" data-pins="on" …>
  <header class="rv-cap">…<span class="rv-badge" data-rv="badge" data-label="a" title="1 open on this screen">1</span>
    <button type="button" class="rv-addnote" data-rv="addnote" data-label="a">+ note</button>
    <button type="button" class="rv-pins" data-rv="pins" data-label="a" aria-pressed="true"
            title="Hide marks" aria-label="Hide marks">…</button>…

// review-page.js (D13/D15) — filters and the scope band
<button data-rv="filter" data-filter="open" aria-selected="true">Needs you<span class="rv-count" data-rv="open-count">3</span></button>
<button data-rv="filter" data-filter="answered">Done</button><button data-rv="filter" data-filter="all">All</button>
<div class="rv-scopeband"><span class="rv-scopeband-label">On screen</span>
  <span class="rv-screenfilter" data-rv="screenfilter">a</span>
  <span class="rv-scopeband-label">plus the whole project</span>
  <button type="button" class="rv-allscreens" data-rv="allscreens">All screens</button></div>

// review-page.js (D11) — the composer's ghost action, beside Send
<div class="rv-actions"><button type="submit" data-rv="send" class="rv-primary">Send</button><kbd>⌘</kbd><kbd>Enter</kbd>
  <button type="button" class="rv-mark-area" data-rv="mark-area"
          title="Draw a box on the screen, then write the note">Mark an area</button></div>

// review-page.js (D16) — a board frame's src
prefix + '/mocks/a.html?clean&notes=1' + (state ? '&state=' + state : '')

// notes-layer.browser.js — the bridges the framed layer exposes (D5/D8/D10/D11)
window.__nlFocus = function (id) { /* select + scrollIntoView + pulse + open card; no-op on unknown id */ }
window.__nlMark  = function (on) { /* setMarking(on) — mock scope only */ }
window.__nlPins  = function (on) { /* show/hide this frame's box layer */ }
// …and the one call it makes OUT, on a box click, same-origin and guarded (D8)
if (window.parent !== window) { try { window.parent.__rvPick(id) } catch (e) { /* no parent hook */ } }

// review.browser.js — the hook the frame calls (D8)
window.__rvPick = function (id) { /* scroll that row into view + select(id); no-op on unknown id */ }

// viewer.css (D12) — the mark, in two parts
.nl-region        { border: 0; border-radius: 2px; background: color-mix(in srgb, var(--c) 8%, transparent) }
.nl-region::before{ content:""; position:absolute; inset:-6px; border:1.5px dashed color-mix(in srgb, var(--c) 65%, var(--v-bg));
                    border-radius:5px; box-shadow:0 0 0 3px color-mix(in srgb, var(--v-bg) 55%, transparent); pointer-events:none }
.nl-region.sel    { background: color-mix(in srgb, var(--c) 17%, transparent) }
.nl-region.sel::before { border-width:2px; border-color: var(--c); box-shadow:0 0 0 3px color-mix(in srgb, var(--c) 26%, transparent) }

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

Binding artifacts: `design/chrome-mocks/review.html` for the review page (specs/20260912/06 D1 —
rewritten and approved by the owner on 2026-09-13; its header comment documents every element and
the ruling), and `design/chrome-mocks/notes.html` (specs/20260912/11 D10) for the served mock's own
layer — the phone frame in it shows the bottom-sheet card and the wrapped bar this spec's touch path
reaches.

What review.html depicts and this spec builds: marks painted on the boards at all times, each a
stroke-less tint under a dashed frame held 6px outside it with a numbered `.rv-pin` riding the
frame's top-left corner (the rail count, the caption `.rv-badge`, the `.rv-tabpin` and the pin are
one orange register); one row layout for every note, the text leading, the id demoted into the pin
on a region row and left as muted `.rv-id` otherwise; the `.rv-row` left rule as the selection
accent; `.rv-pins` (the eye) in each caption; `.rv-mark-area` (a dashed-rectangle glyph) beside
`Send`; `Needs you / Done / All`; and the self-describing scope band with `All screens`.

Two things in review.html are standalone-rendering scaffolding, not shipped markup: the
`.rv-marks` / `.rv-mark` layer (the shipped page's boxes are painted by the framed mock's own
`.nl-region` layer, which owes the same two-part treatment — D12) and its `data-state` attribute
(the shipped page has one frame per state, each already carrying `data-state`). The binding
carry-over from that layer is the register and the geometry, not the elements.

Also here: the client walk page's badge (`.nl-region-badge` reused from viewer.css); the atlas card count
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
- **Review page, row → box.** Clicking anywhere in a note row that is not a button or a text field
  selects it: the board focuses, the board's state tab switches to the row's `data-state` if it is
  not already showing, and the visible frame's `__nlFocus(id)` selects, scrolls to and pulses the
  box. If the frame has not loaded, the call is retried once on the frame's `load` event. Nothing is
  revealed — the box was already painted.
- **Review page, box → row.** Clicking a box inside a frame calls `window.parent.__rvPick(id)`,
  which scrolls that row into view and selects it. Unframed (the owner's own mock page), the layer
  finds no parent hook and the click just opens the card, as today.
- **Review page, hide marks.** The caption's eye flips `aria-pressed` and the board's `data-pins`,
  and hides the box layer in every frame of that board. Per board, not persisted.
- **Review page, Mark an area.** The composer's ghost action puts the focused board's visible frame
  into mark mode; the drag and the note happen inside that frame's own layer, which posts to the
  mount it was served from.
- **Review page, scope.** The band reads `On screen <name> plus the whole project`, and the panel
  shows exactly that: the focused screen's rows plus every project-scope row. `All screens` clears
  the narrowing; scrolling to a board re-applies it.
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
- **AC-20260912-12-3**: WHEN `review-page.js` renders a journey holding one region note on screen `a`
  (state `happy`) and one whole-project note THE SYSTEM SHALL emit the region note's row with
  `data-region="1"`, `data-state="happy"` and its id inside a `span.rv-pin`, emit the project note's
  row with no `data-region`, no `data-state` and its id inside a `span.rv-id`, and emit zero
  `button[data-rv="jump"]` in the whole document
  (amended by the owner's 2026-09-13 ruling — the superseded original required a `[data-rv="jump"]`
  button reading `Show on the screen` on every region row)
  → writes tests/mocks/review-region.test.js
- **AC-20260912-12-4** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome over a
  served journey holding a region note on the focused board's visible state THE SYSTEM SHALL paint
  that board's frame with `.nl-region[data-id=<id>]` before any click; and WHEN that note's row is
  then clicked on its `.rv-claim` text THE SYSTEM SHALL leave the row carrying `data-selected`, its
  board carrying `data-focus`, and the frame's `.nl-region[data-id=<id>]` carrying class `sel`
  (amended by the owner's 2026-09-13 ruling — the superseded original clicked the row's
  `Show on the screen` button and asserted only the board focus and the `sel` class)
  → writes tests/mocks/review-region.test.js
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
- **AC-20260912-12-11** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome and a
  `click` is dispatched on the framed mock's `.nl-region[data-id=<id>]` THE SYSTEM SHALL leave the
  parent page's `[data-rv="row"][data-id=<id>]` carrying `data-selected` and every other row carrying
  none → writes tests/mocks/review-region.test.js
- **AC-20260912-12-12**: WHEN `review-page.js` renders a screen declaring states `happy` and `error`
  with one region note drawn on `error` and none on `happy` THE SYSTEM SHALL emit that board's
  `error` tab carrying `<span class="rv-tabpin">1</span>` and its `happy` tab carrying no
  `.rv-tabpin` → writes tests/mocks/review-region.test.js
- **AC-20260912-12-13** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome with a
  board showing its `happy` tab and the row of a note whose `data-state` is `error` is clicked THE
  SYSTEM SHALL leave that board's `error` tab carrying `aria-selected="true"`, its `happy` tab
  carrying `aria-selected="false"`, and the `error` frame not `hidden` → writes
  tests/mocks/review-region.test.js
- **AC-20260912-12-14**: WHEN `review-page.js` renders a board THE SYSTEM SHALL emit that board with
  `data-pins="on"` and its caption with one `button.rv-pins[data-rv="pins"]` carrying
  `aria-pressed="true"` and `aria-label="Hide marks"` → writes tests/mocks/review-region.test.js
- **AC-20260912-12-15** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome and a
  board's `[data-rv="pins"]` is clicked THE SYSTEM SHALL leave that board carrying `data-pins="off"`
  and its `[data-rv="pins"]` carrying `aria-pressed="false"`, and leave that frame's
  `.nl-region[data-id=<id>]` not visible (zero client rects); WHEN it is clicked a second time THE
  SYSTEM SHALL restore `data-pins="on"`, `aria-pressed="true"` and the visible box → writes
  tests/mocks/review-region.test.js
- **AC-20260912-12-16**: WHEN `review-page.js` renders the composer THE SYSTEM SHALL emit exactly one
  `button.rv-mark-area[data-rv="mark-area"]` whose text is `Mark an area`, inside the same
  `.rv-actions` as `[data-rv="send"]` → writes tests/mocks/review-region.test.js
- **AC-20260912-12-17** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome and
  `[data-rv="mark-area"]` is clicked THE SYSTEM SHALL leave the focused board's visible frame in mark
  mode — that frame's notes-layer bar button reading `Marking · Esc to stop` — and leave every other
  board's frame not in mark mode → writes tests/mocks/review-region.test.js
- **AC-20260912-12-18** `[env: CHROME_BIN]`: WHEN a served mock carrying one region note is opened in
  headless Chrome THE SYSTEM SHALL compute, for that note's `.nl-region`, a border width of `0px` and
  a non-transparent background, and for its `::before` a `dashed` border style whose box is inset
  `-6px` on every side of the element's own box; WHEN the box carries class `sel` THE SYSTEM SHALL
  compute its `::before` border width as `2px` and its border style as `dashed` → writes
  tests/mocks/client-region.test.js
- **AC-20260912-12-19**: WHEN `review-page.js` renders a journey page THE SYSTEM SHALL emit the inspector's three
  `[data-rv="filter"]` buttons reading `Needs you`, `Done` and `All` while still carrying
  `data-filter` values `open`, `answered` and `all`; emit `[data-rv="badge"]` as a `span.rv-badge`
  with zero `button[data-rv="badge"]` in the document; and emit the scope band as
  `On screen` + `[data-rv="screenfilter"]` + `plus the whole project` + one
  `button[data-rv="allscreens"]` reading `All screens` → writes tests/mocks/review-region.test.js
- **AC-20260912-12-20** `[env: CHROME_BIN]`: WHEN the review page is opened in headless Chrome with
  board `a` focused, a note on screen `b` and a whole-project note THE SYSTEM SHALL leave the
  project-scope row visible and the screen-`b` row hidden; WHEN board `a`'s `[data-rv="badge"]` is
  clicked THE SYSTEM SHALL leave both of those rows' hidden state unchanged (the count is inert); and
  WHEN `[data-rv="allscreens"]` is clicked THE SYSTEM SHALL leave the screen-`b` row visible
  → writes tests/mocks/review-region.test.js
- **AC-20260912-12-21**: WHEN `review-page.js` renders a board THE SYSTEM SHALL emit each frame's
  `src` carrying both `clean` and `notes=1`; and WHEN `design-atlas.js`'s mock route is requested
  with `?clean&notes=1` THE SYSTEM SHALL serve markup containing the notes-layer script while the
  same route requested with `?clean` and no `notes` param SHALL serve markup containing none →
  writes tests/mocks/review-region.test.js
- **AC-20260912-12-22** `[env: CHROME_BIN]` (added at the review stage's second disposition round,
  2026-09-13 — D17 cited this AC before it existed, an orphan-decision `promise-sweep` finding):
  WHEN a served mock paints two region notes on the same state, one carrying status `open` and one
  `addressed`, THE SYSTEM SHALL CONTINUE TO resolve `notes-layer.browser.js`'s `colorFor` distinctly
  per specs/20260912/11 D9's four roles — `open` to `var(--v-danger)` and `addressed` to
  `var(--v-warn)`, each box's `.nl-region-badge` computing that literal background color — and
  `spec/templates/mocks/viewer.css`'s `.nl-region` comment block SHALL CONTINUE TO describe the same
  four-role register (`--v-danger` open, `--v-warn` addressed, `--v-ok` resolved, `--v-muted`
  outdated/withdrawn) truthfully (D17) → writes tests/mocks/client-region.test.js
- **AC-20260912-12-23** (added at the review stage's second disposition round, 2026-09-13 — D4
  promised both specs/20260912/11 D8 footnotes and only AC-9 pinned one): WHEN `walk-page.js`
  renders a client-origin request note whose region is flagged `addressed.reanchored:'children'`
  THE SYSTEM SHALL emit its `.wk-req` article carrying a `.nl-region-badge` and the D8
  fitted-to-content footnote text (`fitted to content on this size`), with `data-status` unchanged
  and no `data-region` attribute → writes tests/mocks/client-region.test.js

## Assumptions (escalation triggers)

- A1: `captureScreen`'s Chrome boot is reusable for an evaluate-only call (it renders the served page
  before screenshotting). **if false:** `resolveRegion` boots the same way with its own evaluate step,
  still inside `client-capture.js` — never a launcher in the driver.
- A2 (RESOLVED — FALSE as written, closed by D16, not escalated): The review page's frames are
  same-origin served mocks with the layer injected. The same-origin half held; the injected half did
  not — `frameSrc` requested `?clean`, and `design-atlas.js`'s `?clean` route plus
  `notes-layer.browser.js`'s own `location.search` guard deliberately inject no notes script at all
  (tests/mocks/notes-layer-isolation.test.js pins that). The "if false: STOP and ask for a
  postMessage design" remedy was not taken, because the premise that actually mattered — same
  origin — was true: the layer rides in on its own independent `&notes=1` flag instead, which is now
  D16, load-bearing product behavior rather than an assumption note. Every other caller still sends
  a bare `?clean` and still gets no layer, so the pinned isolation invariant is untouched.
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

The review page's half was re-decided mid-build. The first cut revealed a box on demand, behind a
`Show on the screen` button on every region row. The owner rejected it after a design consult: a
mark the reviewer drew is the note, and a control that shows you the thing you already made is a
second thing to learn — so the boxes are painted at all times, the whole row is the click target,
and selection runs both ways. The same consult found the treatment itself at fault: a thin solid
outline is indistinguishable from the design's own borders and visibly nests inside a bordered card,
so a mark is now a stroke-less tint under a dashed frame held outside it, and selection changes
weight inside that register instead of reaching for a solid edge.

Rejected: re-anchoring in the browser on the owner's next visit (it would mean the ledger holds a
stale anchor and every reader but Chrome sees `lost`); a second overlay on the review page (the
frames already carry the layer; a bridge function is the whole cost); a `Show on the screen` button
per row (the owner's ruling above); postMessage between page and frame (same origin — a wire format
and an async hop for nothing); drag-to-draw on touch without a hold (it fights scroll on every
phone); renaming the `data-filter` values along with the filter labels (every consumer breaks, no
reader gains).

Fragile: the headless resolve depends on the mock rendering at the driver's `captureViewport()`
width; a mock that reflows at that width differently from the owner's browser resolves in `children`
mode more often than expected — visible in the strip footnote, never wrong. Chrome-gated ACs skip
without `CHROME_BIN`; the route, render and driver-refusal ACs never skip.

**Build-time repairs, first pass.** A2's premise ("every artboard iframe already carries the
layer") was false as coded — `?clean` deliberately stripped it — so `frameSrc` gained the
independent `&notes=1` flag D16 records; the pinned isolation invariant never moved.
`notes-layer.browser.js`'s state handling carried two related bugs: the strip/overlay filters
compared a note's raw (often-null) `state` against a fallback-less `activeState`, and separately
that fallback defaulted to whichever state a screen declared first rather than to `'happy'` —
both fixed to match `mocks-notes.js`'s own `state || 'default'` convention and a `'happy'`
default when any state is declared, the second exposed only once AC-4/-11 ran against a real
served host. The touch-drag floor (the pre-existing 12×12px accidental-click guard) is skipped
for a touch-originated drag, since the 350 ms hold is itself the deliberate gesture and AC-6's
own fixture drags one axis only. The rail's screen-picker `<select>` carries a historical
`data-rv="jump"` that collided with AC-3's blanket ban on `button[data-rv="jump"]`; renamed to
`data-rv="screenjump"` rather than touch the test, since the Contracts block explicitly keeps the
select's attribute verbatim. AC-15's own test merges two Chrome-eval results with
`Object.assign`, and both carry a same-named `pinsAttr` key — the second write always wins, so
`result.pinsAttr` can never read `'off'` regardless of implementation; D10's toggle correctness
was verified via the test's own non-colliding fields instead, and the test itself left untouched
since it is not this worker's file.

**The owner's mid-build ruling.** The design consult that rejected D3 as locked and replaced it
with the always-painted marks (recorded above) also produced `tests/mocks/review-region.test.js`
authored against the superseded `Show on the screen` contract, rewritten to the new one by a
separate worker in the same build — D3's rewrite and AC-3/-4 are the record of what changed; the
test rewrite is the record of who caught it not matching.

**Review disposition, first round.** D17's ruling that a box keeps its state colour (never the
review page's orange) was under threat from the build's own earlier pass, which had collapsed
`open` onto `--v-warn` to match the approved mock's badge colour — `colorFor('open')` is restored
to `var(--v-danger)`; `viewer.css`'s comment block was never wrong, only the code had drifted
from it. `[data-rv="mark-area"]` gained its own `aria-pressed` state (flipped by
`review.browser.js`, styled in `viewer.css`) as mark mode's visible on-page signal, plus a
crosshair cursor on the overlay host while marking; the mark-mode Escape key needed one listener,
not two — the existing `case 'Escape':` switch already cleared row selection and board focus, so
mark mode's own exit is folded into that same case, prioritized while marking, rather than a
second listener that would have raced it and stripped focus on exit (which it did, on first try).
`.rv-scopeband`'s truncating `nowrap`/`ellipsis` is replaced with `flex-wrap`/`min-height` so the
scope sentence wraps rather than truncates, per D15. `walk-page.js` gained the missing
`reanchored:'children'` footnote and, with it, a fix for `.nl-region-badge` riding
`position:absolute` with no positioned ancestor inside a static `.wk-req` row — set
`position:static` there, the same fix `.nl-card-hd .nl-region-badge` already needed.
`tests/mocks/client-region.test.js` (AC-18) was written and executes against real headless
Chrome rather than skipping, since `CHROME_BIN` is available in this environment.

**Review disposition, second round.** AC-20260912-12-23 pins the `children`-flagged client row's
footnote and badge — D4 promised both of specs/20260912/11 D8's footnotes and only AC-9 pinned
one, caught by `grep -rn 'fitted to content' tests/` returning nothing. A whole-suite run
reddened once on `tests/release-legs/e2e-unobserved.test.js` (AC-20260908-05-5), a file this spec
touches nothing of; three isolated reruns of that leg and two full `npm test` runs were green
throughout, so it is recorded here as a pre-existing load-sensitive flake and queued rather than
fixed, per core § Session Execution.

## Canonical Delta

No `docs/canonical/design-mocks.md` exists. specs/20260912/11's doctrine paragraph and ADR-0019 are
the canonical record; this spec edits no doctrine.
