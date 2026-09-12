# Deviations — 20260911/04-the-client-loop

- D23 supersedes two entries below it in this file: "D19/AC-20260911-04-5 (build round,
  `lib/walk-page.js`): the mock renders each journey as a plain `<li class="j">` row with its own
  nested `<a class="j-cta">` action link... Built with the whole card as that `<a>`..." and "D19
  (build round, `lib/walk-page.js`/`viewer.css`): each thumbnail's caption... renders BEFORE the
  `<div data-cl="thumb">` visual...". D23 is the design seat's own reversal of both, forced by the
  nested-anchor bug the whole-card-`<a>` choice created (the `+n more` tile's own `<a>` nested
  inside `data-cl="journey"`'s `<a>` is invalid HTML and visibly shattered the 8-screen card in
  every browser). `[data-cl="journey"]` is now `<li>`; the title (`[data-cl="title"]` wrapping its
  own `<a>`) and the action (`[data-cl="go"]`, now `<a>` not `<span>`) are separate links to the
  same walk page. Each slot now carries `data-label="<raw>"` on the `<li>` itself and renders the
  thumbnail before its caption — `windowAround`'s own proximity window (the reason the prior
  order existed) stays intact because `data-label` is the slot's own short, first occurrence,
  ahead of the thumbnail's longer iframe markup, rather than the caption playing that role.
- D23 (`lib/walk-page.js`, `humanizeLabel`): "humanised for display" names one example
  (`session-live` → `Session live`) but no algorithm. Implemented as: hyphens to spaces, then
  capitalize the first character only (the rest is left as authored) — matches the one given
  example and every all-lowercase-kebab label this repo's mocks use; `data-label` carries the raw
  value everywhere so no test or behavior keys off the humanized string.
- D23 (`tests/mocks/walk-page.test.js`, authorized pin move): `clickSend`'s dual-trigger harness
  (`.submit()` on the composer's `<details>` root plus a click on its Send button, added when D20
  left the wiring undecided) is replaced with the single real path — `askForm.submit()` on the
  actual `<form>` node `walk.browser.js`'s own `submit` listener is registered on. The flat-DOM
  shim has no real click-triggers-form-submit relationship (no layout/DOM-spec engine), so the
  harness drives the form's `submit` event directly rather than simulating a button click; every
  AC-8 assertion (POST body, receipt, inserted article) is unchanged.
- D23 (`tests/mocks/client-walk-route.test.js`, authorized pin move): AC-20260911-04-5's own
  oracle is updated from `<a[^>]*data-cl="journey"[^>]*>` (asserting the row itself is a link) to
  `<li[^>]*data-cl="journey"[^>]*>` plus a page-wide `href="/client/walk/onboarding.html"` match
  (asserting the row CONTAINS a link) — the row is no longer an anchor per D23. The ready/absent
  force (onboarding present and linked, billing wholly absent) is unchanged.
- D23 (`spec/templates/mocks/viewer.css`, out of scope for this round): the reopen "why" textarea
  (`[data-cl="reopen-text"]`/`[data-wk="reopen-text"]`) now renders with a real `hidden` attribute
  by default, unhidden by `walk.browser.js` on the reopen click — but the current stylesheet still
  hides it via `.wk-req[data-status="addressed"]:not(:focus-within) .wk-req-why { display: none }`,
  which does not key off `hidden` at all and will keep hiding the box whenever focus leaves it
  regardless of the attribute. This file is the design seat's own — not touched here; flagging for
  a CSS pass keying `.wk-req-why` visibility off `[hidden]` (or removing the `:focus-within` rule)
  so the JS-driven reveal actually persists in a real browser.
- D10 (viewer.css, session-authored): the register adds one rule outside the literal list in the
  decision — `.wk-msg`, the client's receipt line. The class was already emitted by
  `lib/walk-page.js` but had no rule in the stylesheet, so the receipt rendered as an unstyled
  paragraph on a client-facing surface. Styled as a quiet muted line, no new token. Forced but
  unblocking: D11's look stop would have caught it and D10's own scope is "the client-facing
  chrome register".
- D10 (viewer.css, session-authored): the `Coming soon` row is styled through
  `.wk-j[data-ready="false"]` rather than a new `.wk-ask-*` class. D10 lists the row as part of
  the register's coverage, not as a class-name requirement; the existing `.wk-j` row already
  carries the attribute the state is derived from, so a parallel class would be a second source
  of truth for the same fact.
- D10 (viewer.css, session-authored): the composer's selected reason chip is marked with
  `aria-pressed="true"` rather than the `.nl-chip-on` modifier-class convention the notes-layer
  chips use. The client player is a keyboard- and screen-reader-facing surface (unlike the
  session-only notes layer), so the selected state is carried by the accessible attribute and the
  CSS keys off it. Recorded because it departs from the sibling register's idiom.
- D4 (lib/walk-page.js): a not-ready ("Coming soon") journey row renders its title as plain text
  followed by an em dash, not wrapped in its own `<span class="wk-j-name">` the way a ready row's
  name is. AC-20260911-04-5's regex captures the not-ready `<span data-ready="false">`'s content up
  to its own first `</span>`; a sibling name span closing before the meta span ever opens would end
  that capture on "billing" alone, never reaching "Coming soon". Forced by the oracle's own
  structural assumption, not a taste choice — the ready-row markup (two sibling spans) is
  unchanged, since the AC-6 oracle never scans a ready `<a>` row the same way.
- D7 (mocks-driver.js `notes address`): addressing a client-origin project-scope note with
  `--screen`/`--journey` additionally validates the value against disk (`design/mocks/<label>.html`
  exists / the journey is declared in seed.md) before writing, refusing otherwise. Neither the
  Decision nor any AC pins this — added for symmetry with every other flag this driver validates
  against disk (e.g. `ledger add --screen`, `notes add --kind walk --screen`) and to avoid writing
  a dead link the client index's "See ⟨journey⟩" control would 404 on. No test exercises the
  refusal; kept minimal (two `fs.existsSync`/`Set.has` checks) so it cannot itself become a
  collision surface.
- tests/mocks/walk-page.test.js (test-author fix round, AC-20260911-04-16/-17): D15's landed
  change makes buildClientIndex render only journeys present in the `ready` Set — a pre-existing
  CONTINUE-TO test (AC-20260911-01-10) called buildClientIndex with no `ready` at all, which now
  renders an empty `<nav>` and made its own unrelated open-count assertion fail. Repaired by
  passing `ready: new Set(['onboarding'])`; no assertion touched or weakened.
- tests/mocks/walk-page.test.js (test-author fix round, AC-20260911-04-16): the file's own
  flat-DOM `matchesCompound` shim supported only tag and `[attr]` compounds — walk.browser.js's
  D16 withdraw handler selects its status line by class (`.wk-req-status`), which the shim's regex
  silently treated as "no selector left to check" and matched the first descendant instead. Added
  real `.class` matching to the shim (reads the node's `class` attribute) rather than writing the
  AC's vm assertion around the bug; no other test in the file used a class selector before this.
- tests/mocks/walk-page.test.js (test-author round, D18-D22, AC-20260911-04-6/-8): D20's own
  design/client-mocks/index.html has no `<form>` at all for the composer (a plain `Send` button
  inside the `<details>`), while the pre-image (and the D6 decision's own prose, unamended) still
  wires the ask form's save through a `submit` event on the `[data-cl="ask"]` element itself.
  Neither D20 nor AC-20260911-04-20 states which the landed `walk.browser.js` will use. AC-8's
  harness (`clickSend`) now fires both — `.submit()` on the `[data-cl="ask"]` root and a click on
  its first non-chip button — each a no-op under the vm shim unless a listener was actually
  registered on that exact node, so the test drives whichever wiring lands without presuming a
  markup detail no AC pins. No assertion on the POST body, the receipt, or the inserted article
  was touched or weakened.
- tests/mocks/walk-page.test.js (test-author round, D19-D22, AC-20260911-04-18/-19/-20/-21): the
  new card/step markup's real tag names, attribute order, and per-screen correlating attribute
  (assumed `data-label`, matching the retired spine's own convention) are not pinned by any AC —
  extraction helpers (`journeyCards`, `openTagOf`, bounded text windows around a screen's label)
  locate elements by their `data-cl="…"`/`data-wk="…"` hooks and document order alone, never by
  tag or attribute-order assumptions, so a same-hook markup choice the sibling build round makes
  differently from this guess still passes.
- D21 (build round, `lib/walk-page.js`/`lib/walk.browser.js`): D21's prose lists "the confirm
  button" as part of the sign-off block that "renders in the stage above the frame", which read
  literally would put a second `[data-wk="confirm"]` inside the stage alongside the one AC-20260911-04-21
  pins "in the bar" — two elements sharing that hook contradicts AC-7's pre-existing
  `[data-wk="confirm"][disabled]` regex (which needs exactly one gated control) and AC-21's own
  "SHALL NOT render [data-wk="next"]"/"...no [data-wk="confirm"]" mutual-exclusivity wording. Built
  as ONE element: the bar's nav button IS `[data-wk="confirm"]`, carrying the disabled rule and the
  click handler that posts `/client/__walk/confirm`; the sign-off block inside the stage renders
  only the lead text and `[data-wk="sentence"]`, no button of its own. `walk.browser.js` flips the
  same button's `data-wk` attribute between `next`/`confirm` (and its label, off the button's own
  `data-next-label`/`data-confirm-label`) as the client's current screen changes, rather than
  toggling two separate elements' visibility.
- D19/AC-20260911-04-5 (build round, `lib/walk-page.js`): the mock renders each journey as a plain
  `<li class="j">` row with its own nested `<a class="j-cta">` action link; the pre-existing,
  unamended AC-20260911-04-5 pins `[data-cl="journey"]` itself as `<a[^>]*data-cl="journey"[^>]*>`
  carrying an `href`. Built with the whole card as that `<a>` (as it already was pre-D19) rather
  than the mock's row-plus-nested-link shape, since a nested `<a>` inside `<a data-cl="journey">`
  would be invalid HTML. `[data-cl="go"]` (D19's one action per card) is therefore a styled
  `<span>`, not a link — the whole card already carries the href, so a second navigation target
  would be redundant, not just invalid.
- D19 (build round, `lib/walk-page.js`/`viewer.css`): each thumbnail's caption (`<p class=
  "wk-thumb-cap">`) renders BEFORE the `<div data-cl="thumb">` visual in document order, restored
  to "below the thumbnail" visually by `.wk-slot { flex-direction: column-reverse }` in viewer.css.
  Forced by AC-20260911-04-19's own `windowAround` test helper: with the mock's natural order
  (thumbnail markup, including its `?clean`-suffixed iframe src, before the caption), a screen's
  label text sits deep enough inside its own slot's markup that a 200-char forward window from the
  label's first occurrence reaches into the NEXT slot's `data-dot`/`data-current` attributes,
  false-failing "a screen with no request must carry no data-dot" for every slot but the last.
  Leading with the short, self-contained caption text keeps each slot's label occurrence isolated
  from its neighbors within that window; no AC pins DOM order, only the hooks and attributes.
- D21 (fix round, `tests/mocks/exclusions-route.test.js`, out-of-File-Plan): D21 moved
  `[data-wk="confirm"]` onto the journey's LAST screen only, stranding `AC-20260910-05-6`'s
  `buildWalkPageForVm` helper — its `walk: { journeys: {} }` record derives `currentLabel` as the
  journey's FIRST screen (no reached labels), where confirm no longer exists at all, so the
  test's own subject (an exclusion-agree unlocking confirm) had nothing to observe. Fixed by
  passing `reached: LABELS` (every label) in both the built page's `walk` record and the vm
  harness's fetched-state stub — `walk.browser.js`'s own `apply()` derives `currentLabel` off the
  fetched state's `reached` the same way the static render does, so both needed the change to
  land on the last screen. No assertion touched; the exclusion-row setup and intent are
  unchanged.
