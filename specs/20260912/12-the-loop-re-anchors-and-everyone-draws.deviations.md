# Deviations — 12-the-loop-re-anchors-and-everyone-draws

- D3/A2's premise ("every artboard iframe is the served mock … with the layer injected") was
  false as coded: `lib/review-page.js`'s `frameSrc` requests `?clean`, and design-atlas.js's
  `?clean` route (plus notes-layer.browser.js's own `location.search` guard) deliberately injects
  no notes script at all (tests/mocks/notes-layer-isolation.test.js's pin). Rather than escalate
  A2's "if false: STOP" (a postMessage redesign would have been a much larger change than the
  Decision anticipates), `frameSrc` now appends a second, independent flag (`&notes=1`) design-
  atlas.js's mock route and notes-layer.browser.js's own guard both check for — a bare `?clean`
  request (every other caller) still carries no layer at all, so the pinned isolation invariant is
  untouched. This is the mechanism D3's Rationale assumed already existed.
- `notes-layer.browser.js`'s `renderOverlay`/strip-row filters compared a note's raw `state` field
  (often `null`, per mocks-notes.js's own `body.state || null` storage convention) against
  `activeState` (which defaults to the string `'default'` on a screen with no `data-state-btn`).
  Fixed both comparisons to `(n.state || 'default') !== activeState`, matching the same fallback
  `lib/mocks-notes.js`'s `groupOpen` already uses — without it, a region note with no explicit
  state (this spec's own review/client fixtures) never resolves a box on a stateless screen at
  all, which would have made AC-20260912-12-4 unfixable.
- D5's touch drag: the pre-existing 12×12px accidental-click floor (mouse only, filters a bare
  click with w=h=0) is skipped for a touch-originated drag — the 350ms hold is itself the
  deliberate gesture, and AC-20260912-12-6's own fixture drags along one axis only (a 200px
  vertical move, 0px horizontal), which the floor would otherwise reject.
- **Owner ruling, 2026-09-13, mid-build.** After a design consult on the review page, the owner
  rejected D3 as locked — the `Show on the screen` button that revealed a region note's box on
  demand — and accepted the design now recorded in `design/chrome-mocks/review.html` (rewritten and
  approved in the same pass; its header comment block is the ruling's own record). The accepted
  design: marked boxes painted on the middle-column boards at all times with a numbered pin badge in
  the rail/tab orange register; no reveal control at all, the whole note row being the click target
  and its left rule the selection accent; selection bidirectional by direct same-origin call in both
  directions; a box belonging to the state tab it was drawn on, so selecting it switches that tab; a
  per-board hide-marks eye; a `Mark an area` ghost action in the composer; one row layout for marked
  and unmarked notes, differing only by the pin; and a two-part mark treatment — stroke-less
  highlighter tint plus a dashed frame 6px outside it — that the real drawing layer
  (`notes-layer.browser.js` / `viewer.css`'s `.nl-region`) must carry, replacing the thin solid
  outline whose nesting defect the owner caught. Three page fixes landed with it: filter tabs reading
  `Needs you / Done / All` (the `data-filter` values `open|answered|all` unchanged), an inert
  `<span class="rv-badge">` caption count in place of a button, and a self-describing scope band
  ("On screen a, plus the whole project") with an `All screens` action.
  In consequence D3 was rewritten, D8–D16 were added, AC-20260912-12-3 and -4 were rewritten (the
  superseded text is kept as an indented sub-line under each, never as a struck-through bullet), and
  AC-20260912-12-11 through -21 were added. `tests/mocks/review-region.test.js` was authored against
  the superseded contract and is rewritten to match by a separate worker. No frontmatter field and no
  version target changed.
- D3 (amended) implementation: the rail's own screen-picker `<select>` carried `data-rv="jump"`
  before this build (a historical accident — a different control from the retired per-row jump
  button, disambiguated only by container-scoped selectors in review.browser.js). AC-3's own pin
  in `tests/mocks/review-region.test.js` queries a blanket `document.querySelectorAll('[data-rv=
  "jump"]')` (no tag scope) for zero anywhere on the page, which the rail select would otherwise
  still trip even with the row's jump button correctly removed. Renamed the select's attribute to
  `data-rv="screenjump"` (class `.rv-jump` and its `change` behavior unchanged) rather than touch
  the test, since AC-20260912-12-3's own prose scopes the ban to `button[data-rv="jump"]` and the
  spec's Contracts block explicitly keeps the rail select's `data-rv="jump"` verbatim — the test's
  broader selector and the Contracts block disagree on this one point, and the rename is the
  smaller, purely cosmetic reconciliation.
- notes-layer.browser.js's `activeState` initial fallback was `stateButtons[0]`'s own value (the
  FIRST declared `data-state-btn` name) whenever a screen declared any state at all — wrong for
  the frame representing the page's un-clicked base render (review-page.js's own "happy" tab,
  D9), which a screen declaring only e.g. "error" would otherwise misreport as already being on
  "error" before any click. AC-20260912-12-4/-11 (an unclicked "happy" frame must already paint a
  region note stored with `state:"happy"`) exposed this — fixed the fallback to `'happy'` when the
  screen declares any state, `'default'` unchanged when it declares none (the pinned
  notes-layer-navigation.test.js case). Pre-existing bug, not introduced by D8/D9, but blocking
  their own ACs against a real served host.
- AC-20260912-12-15's own test (`tests/mocks/review-region.test.js`) merges two Chrome-eval
  results with `Object.assign({}, afterOff, afterOn, …)`; both results carry a same-named
  `pinsAttr` key, so the merged `result.pinsAttr` always reads the SECOND (afterOn) value — the
  `assert.strictEqual(result.pinsAttr, 'off', …)` line can never pass regardless of implementation
  correctness. Verified the underlying D10 behavior is correct via the test's own non-colliding
  fields: `ariaOff:'false'`/`rectsOff:0` after the first click, `ariaOn:'true'`/`rectsOn:1` after
  the second — the eye toggle flips `data-pins`/`aria-pressed` and hides/restores the box exactly
  as D10 requires. Left the test untouched (not this worker's file to edit) and reported the
  defect rather than papering over it; AC-15 remains red on this one assertion until a
  tests-layer fix renames one of the two colliding keys.
