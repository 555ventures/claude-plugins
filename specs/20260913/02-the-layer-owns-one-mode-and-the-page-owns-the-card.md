---
date: 2026-09-13
status: implementing
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260912/11-a-note-can-mark-an-area.md, specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-13
open_markers: 0
build_base: main
diff_base: e232a7eef4bff691d1e42935dfc3a3ec65fafe17
---

# The layer owns one mode and the page owns the card

## Goal

The region-note layer mounts two ways — standalone on a served mock page, and inside the
review page's board frames — and in both it has no owner for interaction state. A finished
drag never leaves drawing mode, so every press on the draft card's own textarea spawns a
throwaway rectangle; a box click rebuilds the whole box layer twice and pulses the box the
reviewer just clicked; the drag listens on `document`, so the layer's own chrome feeds its
own drawing loop. This spec replaces that core with one mode at a time, pointer capture on
the drawing surface, affordances derived from the mode in CSS, a keyed reconcile instead of a
rebuild, and a card the host page renders at full size beside a scaled board instead of
inside it. Done means a reviewer can draw, read, and act on a mark on a desktop board without
a stray rectangle, a double repaint, or 5px text — and real-browser tests hold it there.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One mode at a time.** The layer holds a single `mode` of `idle` \| `arming` \| `drawing` \| `composing`, mutually exclusive by construction, changed only through one `setMode(next)` function. `pointerup` on a real drag goes straight to `composing`; opening any card is `composing`; closing a card returns to `idle` (or to `arming` when a re-place was pending). The `marking` boolean, and the `dragStart`/`draftEl`/`dragIsTouch`/`touchStart` flags that today encode mode implicitly, are retired as mode carriers — the drag's own geometry stays, the mode does not live in it. (AC-20260913-02-1, AC-20260913-02-4, AC-20260913-02-5) | Entering composing IS leaving drawing, so no caller has to remember to turn drawing off — the exact omission that makes the draft card spawn rectangles today. Rejected: calling `setMarking(false)` at each exit point, which is the current shape and is one forgotten call away from the same defect. |
| D2 | **Pointer capture on the overlay, never `document`.** `pointerdown` binds on the overlay element; the handler calls `setPointerCapture(e.pointerId)` on that element and `pointermove`/`pointerup`/`pointercancel`/`lostpointercapture` all bind to the overlay too. The three `on(document, 'pointer*')` listeners are deleted. The uncommitted click-swallowing shield is deleted with them: capture already stops the mock underneath from seeing the drag. (AC-20260913-02-2) | Measured (A2): capture on the shadow-rooted overlay holds every move on that element through the board's CSS scale transform even as the pointer crosses other chrome, with the mock's own controls receiving nothing. Rejected: `closest()` guards on a document listener — a filter that must enumerate the layer's own chrome, and grows a hole each time the chrome does. |
| D3 | **Every way out of a drag is named.** `drawing` returns to `arming` on Escape, on `pointercancel`, and on a release whose box is under 12×12 (a click, not a box); it returns to `idle` only through `setMode`. `lostpointercapture` aborts a drag ONLY when no `pointerup` has been seen for that pointer id. (AC-20260913-02-4, AC-20260913-02-5) | Measured (A3): `lostpointercapture` fires on every normal release too (`lostCapture:1` alongside `ups:1`), so treating it as a cancel would discard every completed drag. |
| D4 | **Drag geometry clamps to the mock document.** Before `NotesAnchor.capture`, both corners clamp to `[0, documentElement.scrollWidth]` × `[0, documentElement.scrollHeight]` of the mock's own document. (AC-20260913-02-3) | Measured (A3): a drag released past the frame's edge produced a 1028×1028 box inside a 1440×900 page — a region no re-anchor pass can ever resolve. |
| D5 | **Affordances are derived, never written.** The overlay element carries `data-mode` and viewer.css derives from it: `idle` → `pointer-events:none`; `arming`/`drawing` → `pointer-events:auto`, `cursor:crosshair`, `touch-action:none`, and the 6%-ink scrim `design/chrome-mocks/notes.html` declares as `.device.marking .nl-overlay::before`. Every imperative `setStyle(overlayHost, {pointerEvents, cursor})` write is deleted. (AC-20260913-02-6) | One attribute assignment replaces four scattered style writes and the shield, and the approved prototype already states the rule in CSS. Measured (A1): the derivation resolves correctly inside the layer's shadow root. |
| D6 | **When framed, the card is built by the frame and placed by the page.** A framed layer builds its note card and its draft card with `window.parent.document.createElement`, then hands the element up as `window.parent.__rvCardOpen(cardEl, box, frameWin)`; the review page appends it to a per-board card host that sits outside `.rv-shot` and positions it in page pixels. `__rvCardClose(frameWin)` removes it. Unframed (a served mock page) is unchanged: the card renders in the layer's own overlay shadow root. There is exactly ONE card renderer. (AC-20260913-02-9, AC-20260913-02-10) | Measured (A4): a card built in the parent document and appended there computes the review page's own viewer.css (14px, 330px wide, real border token) while its handlers — closures inside the frame — still fire on a real dispatched click. Rejected: hoisting the whole overlay into the host (the layer must still serve a standalone mock page, and splitting the renderer means two renderers plus a scaling matrix); and a second card renderer in `review-page.js` (the same duplication with more surface). |
| D7 | **Card placement is flip-then-shift.** Beside the box on the side with room; flipped to the other flank when there is none; shifted along the cross axis to stay in the viewport; never overlapping the box's own rectangle. This one rule serves both the unframed overlay card and the host-placed card. `cardPosition`'s `Math.min(anchorRect.right + 12, innerWidth - 340)` clamp — which slides the card back over its own box near the right edge — and the uncommitted `placeClear()` are both retired by it. (AC-20260913-02-9) | The box is the reason the card is open; covering it is the one placement that cannot be right. These are the semantics Floating UI implements, hand-rolled here because this repo ships zero dependencies. |
| D8 | **Selection and reveal are separate, and the host page owns selection.** A box click emits an intent upward (`window.parent.__rvPick(id)`) and does not select locally; the host page's `select(id, opts)` is the one writer, and it pushes state down through `frame.__nlSelect(id, opts)`. Scroll-into-view and pulse fire only when `opts.reveal` is true, which the host sets only when the selection originated somewhere other than that box. `__nlFocus` is renamed `__nlSelect` to carry the changed contract. (AC-20260913-02-11, AC-20260913-02-12) | Today's box click runs `openNoteCard` → full repaint → `__rvPick` → `select` → `__nlFocus` → scroll + pulse + `openNoteCard` → full repaint, so one click costs two rebuilds and an animation on the box already under the cursor. Separating the effect from the state kills the loop with no guard flag. |
| D9 | **A data change reconciles; a view-state change toggles a class.** `renderOverlay` keeps an `id → element` Map and adds, updates and removes only what changed; `boxLayer.innerHTML = ''` is deleted. Selection toggles `.sel` on at most two boxes and `has-sel` on the overlay, and never re-enters `renderOverlay`. One delegated `click` listener on `boxLayer` dispatches by `data-id`, replacing the per-box `el.onclick`. (AC-20260913-02-7) | Rebuilding the layer to move one class is what the user sees as the whole screen flashing on a box click. |
| D10 | **The two view-state rules the prototype declares but the stylesheet never shipped.** viewer.css gains `.nl-overlay.has-sel .nl-region:not(.sel) { opacity: .45 }` and deletes the dead `.nl-region.dim` rule nothing ever sets. (AC-20260913-02-8) | `design/chrome-mocks/notes.html` dims the siblings off a `has-sel` class on the overlay; the shipped stylesheet instead carries a per-box `.dim` the layer never adds, so the treatment has never rendered. |
| D11 | **Reveal actually animates.** viewer.css gains the `pulse` keyframes and the `.nl-region.pulse` rule the prototype declares, inside a `prefers-reduced-motion: no-preference` guard. (AC-20260913-02-12) | `__nlFocus` has added a `.pulse` class since it shipped and viewer.css has no rule for it, so the one signal telling a reviewer WHICH box the rail row means has never drawn anything. |
| D12 | **Board frames stay pointer-live and the phone-sheet opt-out is dropped.** `.rv-shot iframe { pointer-events: auto }` stays (without it no drag and no box click reaches a framed layer at all). The uncommitted `.nl-overlay.nl-marks .nl-card` bottom-sheet opt-out, the `.nl-marks` class and the `marksOnly` branch in `cardPosition` are all deleted. (AC-20260913-02-9) | Under D6 no card ever renders inside a frame, so the phone breakpoint can never apply to a board and the opt-out has nothing left to except. |
| D13 | **The shared Chrome harness gains a drag.** `tests/mocks/chrome-harness.js` exports `drag(send, sessionId, from, to, opts)` — a real `Input.dispatchMouseEvent` press / N moves / release — so every interaction test drives the same pointer path a person does. Callers keep their own probes. (AC-20260913-02-2) | Four of this spec's tests need an identical drag; the host rules flag the third repetition as a duplication finding. |
| D14 | **The working tree's interaction hunks are superseded; its composer hunks are preserved apart from this spec.** Before the build, `spec/scripts/lib/notes-layer.browser.js`, `spec/scripts/lib/review.browser.js`, `spec/scripts/lib/review-page.js`, `spec/templates/mocks/viewer.css` and `design/chrome-mocks/review.html` are returned to HEAD. The whole pre-build tree is already captured at `~/.claude/spec-wip/claude-plugins-worktree-20260913.patch` (written 2026-09-13, outside the repo so no gitignore or out-of-plan path is involved), with the reason-chip half split out as `claude-plugins-reason-chips-part1.patch` beside it; the revert therefore cannot lose either half. This spec re-authors every interaction hunk from its own Decisions. `[no-ac: a pre-build tree state, not a shipped behavior]` | `red-check.js` refuses an impure pre-image, and the chip removal retires a locked promise (specs/20260906/03 D5) across five files — a design retirement that owes its own decision and its own amendment, not a silent ride-along. |
| D15 | **`design/chrome-mocks/review.html` is not edited.** D6 introduces no new class, token or treatment — the card is `.nl-card`, unchanged, moved from one document to another. `[no-ac: the mock's own text states it deliberately omits "the notes layer's own shadow-root UI" because it renders standalone, so the card's absence there is not a claim the card is absent from the page]` | A mock edit here would add nothing a reader could see and would spend a design-authorship round on a file that already rules on the marks register. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D1-D9, D12: the `setMode` machine; pointer capture and the overlay-bound drag handlers replacing the three `document` listeners and the shield; named cancellations; bounds clamping; `data-mode` writes replacing the imperative cursor/pointer-events styles; the keyed reconcile and one delegated click; `__rvCardOpen`/`__rvCardClose` when framed; `__nlFocus` → `__nlSelect(id, opts)`; flip-then-shift placement; `.nl-marks`/`marksOnly` card branches deleted |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D5, D10, D11, D12: `.nl-overlay[data-mode]` rules for pointer-events, crosshair, touch-action and the marking scrim; `.nl-overlay.has-sel .nl-region:not(.sel)`; `pulse` keyframes and `.nl-region.pulse` under `prefers-reduced-motion: no-preference`; `.nl-region.dim` and the `.nl-overlay.nl-marks .nl-card` sheet opt-out deleted; `.rv-shot iframe { pointer-events: auto }` kept. The `.nl-region` comment block's four-role sentence is preserved verbatim |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D6, D8: `select(id, opts)` becomes the one selection writer and passes `reveal` down through `__nlSelect`; `__rvPick` selects without revealing; `__rvCardOpen`/`__rvCardClose` place and remove a frame-built card in the board's card host |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D6: each board renders a `.rv-cardhost` element as a sibling of `.rv-shot` (never inside it, which clips); the `__nlFocus` reference in its own comment follows the rename |
| spec/scripts/design-atlas.js | MODIFY | scripts | D8: the `window.__nlFocus` reference in the frame-injection comment follows the rename — comment only, no behavior change |
| tests/mocks/chrome-harness.js | MODIFY | tests | D13: export `drag(send, sessionId, from, to, opts)` |
| tests/mocks/notes-layer-interaction.test.js | CREATE | tests | AC-20260913-02-1, AC-20260913-02-2, AC-20260913-02-3, AC-20260913-02-4, AC-20260913-02-5, AC-20260913-02-6, AC-20260913-02-7, AC-20260913-02-8 |
| tests/mocks/review-board-card.test.js | CREATE | tests | AC-20260913-02-9, AC-20260913-02-10, AC-20260913-02-11, AC-20260913-02-12 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

## Contracts

```js
// ---- the layer's own mode (spec/scripts/lib/notes-layer.browser.js) -------------------------
// Exactly one of these is true at any time. setMode(next) is the only writer.
//   'idle'      overlay inert; boxes still clickable
//   'arming'    mark mode on, waiting for a press; crosshair + scrim
//   'drawing'   a pointer is captured and a draft rectangle is live
//   'composing' a card (note or draft) is open; no drag can start
setMode(next)                       // writes overlay.dataset.mode, then reconciles

// ---- frame → host (same-origin direct call, never postMessage) ------------------------------
window.parent.__rvPick(id)                        // "this box was clicked" — select, never reveal
window.parent.__rvCardOpen(cardEl, box, frameWin) // "place this card beside this box"
window.parent.__rvCardClose(frameWin)             // "remove the card this frame owns"

// `box` is frame-local CSS pixels in the framed mock's own document coordinates, BEFORE the
// board's scale transform: { x: Number, y: Number, w: Number, h: Number }. The host converts
// with its own scale — the frame never learns it.

// ---- host → frame ---------------------------------------------------------------------------
frame.contentWindow.__nlSelect(id, opts)  // opts = { reveal: Boolean }; reveal scrolls + pulses
frame.contentWindow.__nlMark(on)          // unchanged name; now setMode('arming' | 'idle')
frame.contentWindow.__nlPins(on)          // unchanged

// __nlFocus(id) is RETIRED. Its two behaviors (select, reveal) are the two halves this spec
// separates; every caller passes its own `reveal`.
```

```css
/* ---- spec/templates/mocks/viewer.css: the mode-derived block --------------------------------- */
.nl-overlay { position: absolute; inset: 0; }
.nl-overlay[data-mode="idle"]      { pointer-events: none; }
.nl-overlay[data-mode="composing"] { pointer-events: none; }
.nl-overlay[data-mode="arming"],
.nl-overlay[data-mode="drawing"]   { pointer-events: auto; cursor: crosshair; touch-action: none; }
.nl-overlay[data-mode="arming"]::before,
.nl-overlay[data-mode="drawing"]::before {
  content: ""; position: absolute; inset: 0;
  background: color-mix(in srgb, var(--v-fg) 6%, transparent);
}
.nl-overlay.has-sel .nl-region:not(.sel) { opacity: .45; }
```

## Behavior

**Drawing, start to finish.** `__nlMark(true)` (the review page's `Mark an area`) or `m` on a
served page calls `setMode('arming')`. The overlay's `data-mode` flips, CSS turns on
pointer-events, the crosshair and the scrim. A `pointerdown` on the overlay captures the
pointer, creates the draft rectangle and calls `setMode('drawing')`. Moves update the draft.
A release clamps both corners to the mock document's own box (D4), and then: under 12×12 it
is a click — the draft is removed and mode returns to `arming`; otherwise the region is
captured, the draft removed, and mode goes to `composing`, which is what closes drawing. The
draft card opens in that mode, so no press inside it can start a second drag. Cancel and
Save both return to `idle`. A pending re-place returns to `arming` instead.

Touch is unchanged in substance: a `pointerType:'touch'` press starts the draft only after a
350ms hold with no movement past 8px, and a touch-originated drag skips the 12×12 floor. The
hold timer now lives beside the mode rather than standing in for it.

**A box click.** The delegated listener reads `data-id`, and on a framed board calls
`window.parent.__rvPick(id)`; the host's `select(id, { reveal: false })` marks the row,
focuses the board, switches the state tab, and calls `__nlSelect(id, { reveal: false })` back
down. The frame toggles `.sel` on the outgoing and incoming boxes, toggles `has-sel` on the
overlay, and opens the card. Nothing scrolls and nothing pulses — the box is under the
cursor. Unframed, there is no parent hook, so the click selects and opens locally by the same
path.

**A rail row click.** `select(id, { reveal: true })` scrolls the board into view and calls
`__nlSelect(id, { reveal: true })`; the frame scrolls the box into view and pulses it. The
one effect fires exactly where the reviewer cannot already see the box.

**The card, framed.** `openNoteCard` and `openDraftCard` build into `parent.document` and
hand the element to `__rvCardOpen`, which appends it to that board's `.rv-cardhost` — a
sibling of `.rv-shot`, because `.rv-shot` clips — and places it by D7 using the board's own
scale. Closing the card calls `__rvCardClose`. Unframed, both build into the overlay's shadow
root and place by the same D7 rule; below 640px the served page's existing bottom sheet still
wins, as it does today.

**Edge cases.** A drag that leaves the frame keeps its capture and still delivers its release
(A3), and D4's clamp is what makes the resulting box usable. A `pointercancel` (a system
gesture taking over) drops the draft and returns to `arming`. `lostpointercapture` after a
release is ordinary and is ignored. Hiding a board's marks (`__nlPins(false)`) while a card is
open closes the card — a card with no visible box has no anchor.

## Acceptance Criteria

- **AC-20260913-02-1** `[env: CHROME_BIN]`: WHEN a drag on a served mock page completes and its
  draft card opens, THE SYSTEM SHALL report the overlay's mode as `composing` and SHALL create
  no additional `.nl-draft` element for a press-and-release inside that card's own textarea
  (a press at the textarea's center → `.nl-draft` count 0, mode `composing`)
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-2** `[env: CHROME_BIN]`: WHEN a drag crosses one of the mock's own buttons
  between press and release, THE SYSTEM SHALL deliver every intervening `pointermove` to the
  overlay element itself and SHALL leave that button's click count at 0 (8 moves → 8 with
  `composedPath()[0] === overlay`, mock button clicks 0)
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-3** `[env: CHROME_BIN]`: WHEN a drag is released at coordinates beyond the
  mock document's own scroll box, THE SYSTEM SHALL capture a region whose right edge is at most
  `documentElement.scrollWidth` and whose bottom edge is at most `documentElement.scrollHeight`
  (press at 1200,800 on a 1440×900 page, release 400px past both → captured box `w` ≤ 240 and
  `h` ≤ 100, never the unclamped 1028×1028)
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-4** `[env: CHROME_BIN]`: WHEN Escape is pressed while a drag is live, THE
  SYSTEM SHALL remove the draft rectangle and report mode `arming`, not `idle` and not
  `drawing` (`.nl-draft` count 0, mode `arming`)
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-5** `[env: CHROME_BIN]`: WHEN a mouse drag is released less than 12px from
  its press point, THE SYSTEM SHALL create no region, open no card, and report mode `arming`
  (press 100,100 → release 106,106 → `.nl-region` count unchanged, no `.nl-card`, mode `arming`)
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-6** `[env: CHROME_BIN]`: WHEN the overlay's mode changes, THE SYSTEM SHALL
  derive its cursor and pointer-events from `data-mode` in the stylesheet alone (`idle` →
  computed `pointer-events: none` and cursor not `crosshair`; `arming` → computed
  `pointer-events: auto`, `cursor: crosshair`, `touch-action: none`), with no inline `cursor` or
  `pointer-events` style set on the overlay or its host by the layer script
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-7** `[env: CHROME_BIN]`: WHEN a box is clicked on a page painting three
  boxes, THE SYSTEM SHALL keep every box's DOM node identity across the click and SHALL move
  the selection by class alone (each of the 3 nodes `===` the node held before the click;
  clicked box has `sel`, the other two do not; overlay has `has-sel`)
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-8** `[env: CHROME_BIN]`: WHEN one box is selected, THE SYSTEM SHALL compute
  `opacity: 0.45` on every unselected sibling box and `opacity: 1` on the selected one
  → writes tests/mocks/notes-layer-interaction.test.js
- **AC-20260913-02-9** `[env: CHROME_BIN]`: WHEN a box is clicked on a review-page board whose
  frame is CSS-scaled below 1, THE SYSTEM SHALL render its card in the review page's own
  document at an unscaled `font-size` of 14px, outside `.rv-shot`, and positioned so the card's
  rectangle does not intersect the box's own rectangle (a 1440-wide board at scale 0.39 →
  computed card font-size `14px`, width ≥ 328px, and zero overlap with the box)
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-02-10** `[env: CHROME_BIN]`: WHEN a control inside that host-placed card is
  clicked with a real dispatched mouse event at its on-screen position, THE SYSTEM SHALL run
  the framed layer's own handler for it (`elementFromPoint` at the control's center returns the
  control, and the frame-side handler's call count goes 0 → 1)
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-02-11** `[env: CHROME_BIN]`: WHEN a box is clicked on a board, THE SYSTEM SHALL
  select that note's rail row and SHALL NOT apply the `pulse` class to the clicked box at any
  point in the 800ms after the click (row carries `data-selected`, box's `pulse` class observed
  false on every 50ms sample)
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-02-12** `[env: CHROME_BIN]`: WHEN a rail row is clicked, THE SYSTEM SHALL apply
  the `pulse` class to its box and that class SHALL resolve to a real animation (computed
  `animation-name` on the pulsing box is not `none`)
  → writes tests/mocks/review-board-card.test.js
- **AC-20260913-02-13** `[env: CHROME_BIN]`: WHEN an open box and an addressed box are painted
  on a served mock, THE SYSTEM SHALL CONTINUE TO resolve their badges to distinct role colors —
  open `rgb(220, 38, 38)`, addressed `rgb(217, 119, 6)` — and viewer.css SHALL CONTINUE TO
  describe the true four-role register in its `.nl-region` comment block
  → reuses tests/mocks/client-region.test.js :: AC-20260912-12-22
- **AC-20260913-02-14**: WHEN the layer is loaded on a served mock page, THE SYSTEM SHALL
  CONTINUE TO link viewer.css only inside its own shadow roots and SHALL CONTINUE TO emit
  `.nl-host-scoped` as its sole document-level rule
  → reuses tests/mocks/notes-layer-isolation.test.js :: notes layer:

## Assumptions (escalation triggers)

- A1: Mode-derived CSS resolves inside the layer's shadow root, so `data-mode` on the overlay
  is enough to drive cursor and pointer-events. **Executed 2026-09-13** (headless Chrome via
  `tests/mocks/chrome-harness.js`, shadow-rooted overlay in a scaled same-origin frame):
  `idle → {cursor:"auto", pe:"none"}`, `arming → {cursor:"crosshair", pe:"auto"}`.
  **If false:** keep one imperative style write for cursor only and derive the rest; never
  reinstate the shield.
- A2: `setPointerCapture` on a shadow-rooted overlay holds a drag through the board's CSS scale
  transform, and the mock underneath receives nothing. **Executed 2026-09-13:** `captured:true`,
  `moves:8`, `moveTargets:{overlay:8}`, `mockClicks:0`, `boxClicks:0`, `composedPath()[0] ===
  overlay`; a frame-local drag from (100,100) to (900,600) through a 0.389 scale produced
  `{x:100, y:100, w:800, h:500}` against an identical expected box. **If false:** STOP, ask the
  user — the whole D2/D3 core rests on it.
- A3: A drag leaving the frame still delivers `pointerup` to the capturing element, and
  `lostpointercapture` also fires on ordinary releases. **Executed 2026-09-13:** off-edge drag
  gave `ups:1, cancels:0, lostCapture:1`, raw box `1028.57 × 1028.57` inside a 1440×900
  document, clamped `240 × 100`. **If false:** if `pointerup` is ever missed, treat
  `lostpointercapture` with no prior `pointerup` as the completion path, not the abort path.
- A4: A card element built with `parent.document.createElement` and appended into the parent
  takes the parent's stylesheet, and its frame-side closures still fire on a real click.
  **Executed 2026-09-13:** `builtInParentDoc:true`, `adoptedOk:true`, computed
  `{fontPx:14, width:330, borderColor:"rgb(229, 229, 229)"}`, `hitIsButton:true`, and a
  dispatched click at the control's screen position took the frame's handler `0 → 1`.
  **If false:** have the frame emit `{id, box}` only and render the card from `review-page.js`,
  accepting a second renderer, and record the deviation.
- A5: The review page already links `/__notes/viewer.css` in its own head, so `.nl-card` styles
  a host-placed card with no new stylesheet. **Executed 2026-09-13:** `review-page.js`'s `head`
  string carries that link. **If false:** inject the link from `review-page.js` in the same row.
- A6: No test anywhere asserts on `__nlFocus`, `__rvPick`, `__nlMark`, `__nlPins`, `setMarking`,
  `crosshair`, `nl-draft`, `nl-marks` or `rv-shot`; only `tests/mocks/client-region.test.js`
  touches `nl-region`/`nl-overlay`/`nl-card`. **Executed 2026-09-13** (grep of each literal
  across `tests/`). This is a prediction, not an inventory. **If false:** the missed pin enters
  the File Plan as a fix row in the same batch and is updated in place, never weakened.
- A7: The build starts from a tree at HEAD for the five files D14 names. **If false:** stash or
  revert before Phase 0 — `red-check.js` refuses an impure pre-image, and the reason-chip hunks
  must survive as the queued patch, never be folded into this diff.

## Rationale

Three defects, one cause: nothing owned interaction state. The layer was written against a
`vm` shim with no layout and no real event dispatch, which is precisely why document-level
listeners and full repaints were the natural shape — neither is observable there — and why 318
passing tests saw none of it. So the fix is not three patches; it is an owner, plus tests that
run in a browser where the defects are visible at all.

D6 is the decision that changed during planning. The first draft kept the card inside the
frame. Reading the review page's scale formula killed that: a 1440 board renders at 0.42 in a
600px column and 0.24 in a narrow one, so a 14px card comes out at 5.8px and 3.4px. Hoisting
the whole overlay into the host was rejected — the same layer must still serve a standalone
mock page, and two renderers plus a scaling matrix is worse than the defect. The measured
middle is A4: the frame keeps the one renderer and builds into the parent's document; the host,
which alone knows the scale, does the placing. The owner's ruling settled what the card must
carry — conversation, reply, approve or reject, delete — and all of that already exists in the
card except Reply, which has a driver-only verb (`replyNote`) and no HTTP route. Reply is a
store-and-server landing unit, not an interaction one, so it is queued to land immediately
after this rather than widening this spec into two areas.

Two collision-closure literals hits are waived, neither a live consumer. `design/atlas/index.html`
carries `.nl-region.dim` and `.nl-overlay.nl-marks` because it is an untracked, generated atlas
render of viewer.css (`git status` reports the whole `design/atlas/` directory as untracked); it
regenerates from the stylesheet this spec edits and pins nothing. `design/chrome-mocks/notes.html`
carries `setMarking` as its own standalone prototype function — it toggles a `device` class inside
that file's own script and is unrelated to the layer symbol D1 retires; the prototype is this
spec's binding reference and is deliberately not edited. The three `executes` hits
(`review-browser.test.js`, `review-page.test.js`, `walk-page.test.js` all run `review-page.js` or
`review.browser.js`) were checked by hand: none of them spells `rv-shot`, counts a board's
children, or asserts the board's element set, so D6's additive `.rv-cardhost` sibling reddens
nothing.

What to watch: the keyed reconcile (D9) is where a rewrite most easily regresses — a stale
entry in the Map after a state-tab switch would paint a box for a note that no longer resolves.
The `has-sel`/`sel` toggles must never re-enter `renderOverlay`, or the round trip returns
wearing different clothes. And D14's tree cleanup must happen before Phase 0, not after.

## Canonical Delta

Append to `docs/canonical/design.md`, under the mocks-review surfaces:

> **The marks layer holds one mode at a time.** The region-note layer is in exactly one of
> `idle`, `arming`, `drawing` or `composing`, written only through `setMode`. Entering
> `composing` is how drawing ends, so no caller turns drawing off by hand. The drag binds on the
> overlay and holds the pointer with `setPointerCapture` — never on `document`, never behind a
> `closest()` guard, and never behind a click-swallowing shield: capture alone keeps the mock
> underneath inert. Drag geometry clamps to the mock document's own box before it is captured,
> because a region outside the document can never re-anchor.
>
> **Affordances are derived from the mode, not written.** The overlay carries `data-mode` and
> viewer.css derives cursor, pointer-events, touch-action and the marking scrim from it.
>
> **Geometry scales with the board; chrome does not.** A framed board's marks are painted by the
> frame's own layer and scale with it. The note card must not: the frame builds it in the host
> page's document and hands it up with the box's frame-local coordinates, and the host — which
> alone knows the board's scale — places it at full size beside the box, outside the clipping
> shot. There is one card renderer, wherever the card lands.
>
> **Selection is state and reveal is an effect.** The host page is the only writer of selection;
> the framed layer emits intents up and receives state down. Scrolling a box into view and
> pulsing it fire only when the selection came from somewhere other than that box, so clicking a
> box never animates the box under the cursor. A data change reconciles the box layer by id; a
> view-state change toggles one class. The layer is never rebuilt to move a highlight.
