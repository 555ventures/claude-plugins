---
date: 2026-09-13
status: implementing
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/atlas.html
breaking: true
depends_on: [specs/20260913/05-a-note-is-a-conversation.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 1b922791e18ec9521ff302285c3b86eede272e35
---

# Every mock has a page you can mark

## Goal

Clicking a card on the atlas does one of two things. A screen that a journey declares opens that
journey's review page, where the owner can draw a box and write a note. Everything else — a shape
option, a screen no journey claims — opens a popup (the lightbox) with no notes at all. Every card
also carries an `open ↗` link to the raw mock file, a third surface the owner cannot mark. This
spec gives every card one destination: a screen page at `/screen/<label>.html` that shows that one
screen live, with its notes, the whole-project notes and the composer, built from the review
page's own parts. The lightbox and every `open ↗` link are deleted. Done means every card on the
atlas — screen or shape — opens a page where the owner can mark and write.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One new route: `GET /screen/<label>.html`.** `design-atlas.js` resolves the label to a file: the first `design/mocks/**/*.html` whose label is `<label>`, else the first `design/shapes/*.html` whose label is `<label>`, where a file's label is `labelOf(html) \|\| basename` — the rule `buildAtlas` already uses for mocks. Nothing found throws `unknown screen <label>`, which `serveBuiltHtml` answers as `404 text/plain`. A found file is handed to `lib/review-page.js`'s new `buildScreenPage({label, src, states, product, viewportWidth, viewportHeight, notes, prefix})`, where `src` is the file's path relative to `design/` (e.g. `mocks/a.html`, `shapes/one.html`), `states` is `statesOf(html)`, and product and viewport come from `seedForReview`. (AC-20260913-06-1, AC-20260913-06-3) | Shapes live outside `design/mocks/`, so the page frames the file where it is instead of assuming `/mocks/<label>.html`. |
| D2 | **The screen page is one board plus the inspector.** `buildScreenPage` renders: a header with a breadcrumb — the product name linking to the atlas (`<prefix>/`) and the label; one `renderBoard` for the screen with `focused` true and `total` 1; and `renderInspector` over the notes whose `scope` is `project`, or `mock` with `screen === label`, after the same filters `buildReviewPage` applies (`authoredByPerson`, and specs/20260913/05 D4's dropped-note filter). `renderBoard` accepts an optional `screen.src`; `frameSrc` builds `<prefix>/<src>?clean&notes=1[&state=<s>]` when it is given and today's `<prefix>/mocks/<label>.html?…` otherwise. `renderInspector` accepts an optional empty-state sentence; the screen page passes `No open notes on this screen.` The page has no journey rail and no approve control. Its body is `class="rv rv-screen"` and loads `/__review/review.js` like the review page. (AC-20260913-06-1, AC-20260913-06-2, AC-20260913-06-8) | Reusing the board, rows and composer keeps one implementation of each. `focused` true is what makes the composer file a mock note and makes `Mark an area` work on a page with no open note. |
| D3 | **Every card that frames a screen or a shape links to its screen page.** In `buildAtlas`, every mock card's frame is wrapped in `<a class="shotlink" href="/screen/<label>.html">` whether or not a journey owns it, replacing the `/review/<j>.html#board-<label>` form; every shape card's frame is wrapped the same way; and a compare-table cell whose candidate path starts `mocks/` or `shapes/` is wrapped the same way, its label resolved by D1's rule. Kit-stop cells and the `built` frame stay previews with no link. The column header's `Pick this` control is unchanged. (AC-20260913-06-4, AC-20260913-06-5) | The owner chose that shapes open a markable page too; while a shape pick is open, the shapes appear only as compare-table cells, so those cells need the same link. |
| D4 | **The lightbox and every `open ↗` link are deleted.** From `design-atlas.js`: the `LIGHTBOX` constant and both uses (`buildAtlas`, `cmdGallery`); the `#lb`/`#lbbar` CSS rules; `__lbList`, `__lbIx`, `__lbShow`, `__lbOpen`, `__lbClose`; the lightbox keydown handler, click-outside handler, `lbframe` load handler and the `if(!s.closest("a.shotlink"))` click binding; `__full` and the `open ↗` anchor that `UI_SCRIPT` appends to a card heading (the `.vp` size span it appends stays); the server-rendered `open ↗` anchors in `renderKitStop` and `renderCompareTable`. From `lib/stop-block.js`: the `__lbOpen`/`__lbClose` wrapper block in `PICKS_SCRIPT`. From `notes-layer.browser.js`: the `body.lb-open .nl-host{display:none}` clause of its host style (`.nl-host{pointer-events:none}` stays). `UI_SCRIPT`'s `__fit`, `__measure`, `__still`, `__fitAll` and the `.shot`/`.clip` clamp are not touched. A gallery card becomes a preview with no click. (AC-20260913-06-6) | A popup with no notes and a link to a file with no notes are the two surfaces the owner cannot mark. |
| D5 | **The project panel's jump pill is a link.** `notes-layer.browser.js`'s `mockAnchor` keeps its gate (the atlas has a card `#s-<screen>` containing an `iframe.frame`) and drops its `window.__lbOpen` condition; when the gate passes it renders `<a class="nl-anchor" href="<__base>/screen/<screen>.html">` with today's text, and otherwise today's `span.nl-anchor.plain`. (AC-20260913-06-7) | Without this, deleting `__lbOpen` would silently turn every pill into dead text. |
| D6 | **One amendment ADR.** `docs/adr/0027-every-mock-has-a-page-you-can-mark.md` (CREATE) applies to `specs/20260912/05-the-atlas-answers-to-a-design.md` D4 (the journey-owned/other card split and the lightbox kept for the rest) and `specs/20260905/01-picks-on-the-atlas-page.md` D3 (the lightbox bar's `Pick this` copy). (AC-20260913-06-9) | Both locked Decisions describe the arrangement this spec removes. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: the `/screen/<label>.html` route and its label → file resolution. D3: shotlinks on every mock card, every shape card, and mocks/shapes compare cells. D4: the lightbox, `__full`, the client and server `open ↗` anchors deleted; the fit/clamp code untouched |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D1/D2: `buildScreenPage` added and exported; `renderBoard`/`frameSrc` accept `screen.src`; `renderInspector` accepts an empty-state sentence |
| spec/scripts/lib/stop-block.js | MODIFY | scripts | D4: the `__lbOpen`/`__lbClose` wrapper block deleted from `PICKS_SCRIPT` |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D4: the `body.lb-open` clause deleted. D5: `mockAnchor` renders a link to the screen page |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D2: `.rv-screen .rv-main` and its folded variant drop the rail column. D5: the `.nl-anchor` comment stops describing `window.__lbOpen` and the lightbox |
| design/chrome-mocks/atlas.html | MODIFY | doctrine | D3/D4: cards are links to their screen page; the `open ↗` buttons and the lightbox comments removed |
| design/atlas/index.html | MODIFY | other | Regenerated with `node spec/scripts/design-atlas.js build --root .`; never hand-edited |
| spec/doctrine/design.md | MODIFY | doctrine | D5: § Design Atlas's "opens it in the lightbox" becomes "links to that screen's page"; D3: a card opens its screen page |
| docs/adr/0027-every-mock-has-a-page-you-can-mark.md | CREATE | doctrine | D6: the amendment ADR |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/mocks/screen-page.test.js | CREATE | tests | AC-20260913-06-1, -2, -3, -5, -6, -9 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260913-06-4 (rewrites the AC-20260912-05-2 card-link pin) |
| tests/mocks/notes-layer-navigation.test.js | MODIFY | tests | AC-20260913-06-7 |
| tests/mocks/review-browser.test.js | MODIFY | tests | AC-20260913-06-8 |

**Orchestrator duty (outside the table).** Append one `- Amended by: ADR-0027 — <one line>` header
line to each of `specs/20260912/05-the-atlas-answers-to-a-design.md` and
`specs/20260905/01-picks-on-the-atlas-page.md`. No other text in those files changes.

## Contracts

```
GET /screen/<label>.html   # 200: the screen page for a mock or a shape; 404 "unknown screen <label>"
GET /review/<j>.html       # unchanged
```

```js
// lib/review-page.js — export added
buildScreenPage({ label, src, states, product, viewportWidth, viewportHeight, notes, prefix }) // → html
// frameSrc with screen.src:  '<prefix>/shapes/one.html?clean&notes=1'  ('&state=<s>' on other tabs)
```

## UI

`design_source: design/chrome-mocks/atlas.html` (the card) is edited. The screen page has no mock of
its own: it is the review page's header breadcrumb, one board and the inspector, with the rail
column removed.

**The screen page** — built by `lib/review-page.js`'s `buildScreenPage`, served by `design-atlas.js`,
scripted by `review.browser.js`. Breadcrumb `<product> / <label>` · one board with its state tabs
and live notes layer · the inspector with `Needs you` / `Done` / `All`, this screen's rows, the
whole-project rows and the composer.

| control | sentence on success | path back | farthest artifact |
|---|---|---|---|
| an atlas card (screen, shape, or compare cell) | the screen page opens, showing that screen and its notes | the breadcrumb's product name, or the browser's Back | none — a navigation |
| the project panel's jump pill | the screen page opens | Back | none |

## Data Model

None. No stored field changes and nothing new is written.

## Behavior

The owner opens the atlas. Every screen card and every shape card is a link. Clicking one opens a
page with that screen live: they can switch its states, press `Mark an area` and drag a box, or type
a note in the composer, and its notes and the whole-project notes are listed beside it. While a
shape pick is open, each shape in the compare table is a link to the same kind of page, and the
column's `Pick this` still picks it. Nothing opens a popup, and no card offers a link to a raw file.

## Acceptance Criteria

- **AC-20260913-06-1**: WHEN `GET /screen/a.html`, `GET /screen/o.html` and `GET /screen/one.html`
  are requested against a served host where `design/mocks/a.html` is declared by a journey,
  `design/mocks/o.html` is declared by none, and `design/shapes/one.html` is a shape THE SYSTEM
  SHALL answer `200` each time with exactly one `[data-rv="board"]` carrying `data-focus`, one
  `[data-rv="composer"]`, no `data-rv="journey"` and no `data-rv="approve"`, and a first iframe
  whose `src` is `/mocks/a.html?clean&notes=1`, `/mocks/o.html?clean&notes=1` and
  `/shapes/one.html?clean&notes=1` respectively
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-2**: WHEN `GET /screen/a.html` is requested against a store holding a project
  note, a mock note on `a`, a region note on `a` and a mock note on `b` THE SYSTEM SHALL render a
  `[data-rv="row"]` for each of the first three and none for the note on `b`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-3**: WHEN `GET /screen/nope.html` is requested against a host with no mock or
  shape labelled `nope` THE SYSTEM SHALL answer `404` with a `text/plain` body `unknown screen nope`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-4**: WHEN the atlas is built over a host with journey-owned mock `a`, unclaimed
  mock `o` and shape `one` THE SYSTEM SHALL emit `<a class="shotlink" href="/screen/a.html"`,
  `<a class="shotlink" href="/screen/o.html"` and `<a class="shotlink" href="/screen/one.html"`,
  and no card link whose `href` contains `/review/`
  → rewrites tests/design-atlas.test.js :: AC-20260912-05-2:
- **AC-20260913-06-5**: WHEN the atlas is built with an open `shape-picked` stop whose candidates are
  `shapes/one.html` and `shapes/two.html` THE SYSTEM SHALL wrap those two compare cells in
  shotlinks to `/screen/one.html` and `/screen/two.html` and SHALL still render a
  `data-decide="pick"` button in each column header
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-6**: WHEN the atlas and the candidate gallery are built THE SYSTEM SHALL emit
  neither output containing `__lbOpen`, `__lbShow`, `id="lb"`, `__full` or `open ↗`; and
  `lib/stop-block.js`'s `PICKS_SCRIPT` and `notes-layer.browser.js`'s source SHALL contain no
  `__lbOpen` and no `lb-open`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-7**: WHEN the atlas's project panel renders a mock note on screen `a` and the page
  has a card `#s-a` holding an `iframe.frame` THE SYSTEM SHALL render its pill as an `A` element
  with class `nl-anchor` and an `href` ending `/screen/a.html`; and WHEN no such card exists THE
  SYSTEM SHALL render `span.nl-anchor.plain`
  → writes tests/mocks/notes-layer-navigation.test.js
- **AC-20260913-06-8**: WHEN `review.browser.js` runs on the screen page for `a` and the composer's
  `Send` is clicked with `hi` typed THE SYSTEM SHALL post to `/__notes/add` exactly once with
  `scope:"mock"`, `screen:"a"` and `text:"hi"`
  → writes tests/mocks/review-browser.test.js
- **AC-20260913-06-9**: WHEN `docs/adr/0027-every-mock-has-a-page-you-can-mark.md` is read THE SYSTEM
  SHALL find `Status: accepted`, a `## Dissents` section, and an `## Applies to` section naming
  `specs/20260912/05-the-atlas-answers-to-a-design.md` and
  `specs/20260905/01-picks-on-the-atlas-page.md`
  → writes tests/mocks/screen-page.test.js

## Assumptions (escalation triggers)

- A1: **A shape file served with `?clean&notes=1` gets the notes layer.** Read 2026-09-13:
  `design-atlas.js`'s static `design/` branch injects the notes layer for any `.html` under
  `design/` when `notes` is present, not only under `mocks/`. — **if false:** extend that injection
  to `design/shapes/` in the same batch; never frame a shape without it.
- A2: **The compare table's own `Pick this` works without the lightbox.** Read 2026-09-13:
  `renderCompareTable` renders a `data-decide="pick"` button per column header, separate from the
  lightbox bar's copy in `stop-block.js`. — **if false:** picking becomes unreachable; STOP and ask.
- A3: **`review.browser.js` runs on a page with no rail and no approve control.** Read 2026-09-13:
  its lookups go through null-safe `q`/`setText`/`setHidden`, `recount` guards the approve button,
  and the base-path regex yields `''` on `/screen/…`, which is the only mount `serve` uses. — **if
  false:** guard the throwing lookup in the same batch.
- A4: **Tests asserting the lightbox, `open ↗` or the `/review/` card link exist only in
  `tests/design-atlas.test.js`'s AC-20260912-05-2.** Grepped 2026-09-13 across `tests/` for `__lb`,
  `lb-open`, `#lb`, `lightbox`, `shotlink`, `href="/review/`, `__full` and `open ↗`: the only other
  hits are `notes-layer-navigation.test.js`'s `__lbOpen` stub (harmless once unread) and a comment in
  `notes-layer-isolation.test.js`. — **if false:** update that pin in the same batch; never weaken it.
- A5: **`0026` is the next free ADR number once specs/20260913/05 lands `0025`.** — **if false:** take
  the next free number and amend D6, the File Plan row, AC-20260913-06-9 and every backlink.
- A6: **A label names one file.** If a mock and a shape share a label, D1's order picks the mock. —
  **if false** (a real host has such a pair): the shape card links to the mock's page; record it and
  ask the owner, never add a second route.

## Rationale

This is a re-plan. The first lock predated specs/20260913/07 and the re-planned 05, and three of
its premises failed: the page it described would have 404'd every shape and every screen no
journey claims, while its atlas change linked them all; shapes are not in `design/mocks/`, so they
could not be framed the way it said; and two of its test pointers could never go red. The re-plan
also cut what was not needed for "every card opens a page you can mark": removing the review
page's approve control, the whole-repo retired-name sweep, a `?clean` variant of the new page, the
journey link in the breadcrumb, a design-mock edit for the page, and the `.nl-anchor.plain`
cleanup.

The owner chose, when asked, that shape cards open a markable page too. That is why D1 resolves
shapes and D3 links compare-table cells: while a shape pick is open, those cells are the only place
shapes appear.

Kit-stop cells stay previews because a kit candidate is a component sheet, not a screen, and no
one asked to mark it. The gallery (`design-atlas.js gallery`) writes a standalone file that is not
served; its cards simply stop opening the popup.

## Canonical Delta

`docs/canonical/design.md` § the journey look surface: replace "a journey-owned card's preview links
to that screen's board on the journey review page" with — "every card's preview, screen or shape,
links to that screen's own page, `/screen/<label>.html`: one board with its state tabs and live
notes layer, this screen's notes, the whole-project notes and the composer. There is no lightbox
and no link to a raw mock file; `lib/review-page.js` exports `buildScreenPage` beside
`buildReviewPage`." In § Picks, delete "and the index's bar hides while the lightbox is open
(`body.lb-open`)".
