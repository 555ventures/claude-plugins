---
date: 2026-09-13
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/review.html
breaking: true
depends_on: [specs/20260913/05-a-note-is-a-conversation.md]
depended_on_by: []
brief: n/a
open_markers: 0
---

# Every mock has a page you can mark

## Goal

Clicking a mock on the atlas does one of two things depending on an accident of ownership: a
screen a journey declares navigates to that journey's review page, where the owner can draw a
box and write a note; anything else — a shape candidate, an orphan, a theme variant — opens a
modal that has no notes layer, no composer and no way to mark anything, and every card also
carries an `open ↗` link to the raw mock file, which is a third, equally unmarkable surface.
This spec gives every mock one page: a screen detail page built from the review page's own
components, carrying the four things the owner asked for — this screen's notes, the notes that
mark an area on it, the whole-product notes, and colour — and nothing else. The modal is
deleted, the atlas stops offering a link to a bare mock file, and the review page loses an
approve control the atlas already renders for the same stop. Done means every card on the atlas
goes to a page where the owner can mark and write, and no surface in the product shows a mock
the owner cannot annotate.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One new route: `GET /screen/<label>.html`.** `lib/review-page.js` gains `buildScreenPage({root, label, prefix, seed, notes, clean})` beside `buildReviewPage`, sharing `renderBoard`, `renderInspector`, `renderNoteRow`, `renderComposer` and `rowOpen` unchanged — one implementation of every component, two page shells. An unknown label throws `unknown screen <label> — declared: <list>`, which `serveBuiltHtml` already turns into a `404` carrying that text. (AC-20260913-06-1, AC-20260913-06-7) | The components are the part the owner likes and the part that must not fork; the page shell is the only thing that differs. Rejected: making `buildReviewPage` accept a screen instead of a journey — the journey page's rail, breadcrumb and stop lookup are all keyed on a journey, so one function would grow a mode flag through every branch. |
| D2 | **The detail page carries exactly four things.** (a) one board for this screen with its state tabs and its notes layer, (b) the notes on this screen, (c) the notes that mark an area on it, shown as the same rows with their pins, (d) the whole-project notes; plus the composer that writes to (b)/(c)/(d) and a breadcrumb. It renders NO approve control, NO progress bar and NO journey rail. (AC-20260913-06-2, AC-20260913-06-3) | The owner's words: what they need is this screen, what is marked on it, the project notes, and a colour that tells them the state — and explicitly nothing else. |
| D3 | **Every card on the atlas links to it.** `buildAtlas` wraps EVERY mock card's frame in `<a class="shotlink" href="/screen/<label>.html">`, journey-owned or not; the journey-specific `href="/review/<j>.html#board-<label>"` form is retired. `UI_SCRIPT`'s per-card `open ↗` anchor and the `__full()` helper that builds its bare-mock URL are deleted. (AC-20260913-06-4, AC-20260913-06-5) | The owner's complaint, verbatim: the atlas sends them to `/shapes/call-captions.html`, a page they cannot mark. One destination for every card is the only arrangement with no second-class mock. |
| D4 | **The lightbox is deleted.** The `LIGHTBOX` markup constant, the `#lb`/`#lbbar`/`#lbtitle`/`#lbopen`/`#lbframe` CSS block, `__lbList`, `__lbIx`, `__lbShow`, `__lbOpen`, `__lbClose`, the document `keydown` handler, the click-outside handler, the `lbframe` load handler and the `if(!s.closest("a.shotlink"))` click binding all go, from both `buildAtlas` and `cmdGallery`. `UI_SCRIPT`'s `__fit`, `__measure`, `__still`, `__fitAll` and the `.shot`/`.clip` height-clamp machinery are NOT touched. `lib/stop-block.js`'s `__lbOpen`/`__lbClose` monkey-patch is deleted with them; a compare-table cell becomes a non-clickable preview and the candidate is picked with the column header's own `Pick this` control, which is unchanged. (AC-20260913-06-6, AC-20260913-06-8) | The modal has no notes layer, so every click on it was a click away from the thing the owner came to do. The pick control is not lost: `design-atlas.js`'s compare table renders its own per-group button in the sticky column header, and the lightbox bar's copy was a duplicate. |
| D5 | **The note's jump pill becomes a link.** `notes-layer.browser.js`'s `mockAnchor` stops branching on `typeof window.__lbOpen`; it always renders an anchor to `<prefix>/screen/<label>.html`. The inert `span.nl-anchor.plain` fallback and the `.nl-anchor.plain` rule are deleted. (AC-20260913-06-9) | This pill is how the atlas's project-notes panel points at the screen a note is about. Deleting `__lbOpen` without this change would silently turn every one of them into dead text — the exact class of defect the host's own gotcha list calls out, since no test covers the absent branch. |
| D6 | **The bare mock route stays; every link a person can follow to it goes.** `design-atlas.js`'s static `design/` branch is untouched — the detail page's own board and the review page's boards both fetch `/mocks/<label>.html?clean&notes=1` through it, and the render gate and the capture path depend on it. What is deleted is the atlas's `open ↗` anchor (D3) and the lightbox's `open ↗` (D4). `[no-ac: an absence-of-change ruling; AC-20260913-06-1 and AC-20260913-06-2 both fail if the static branch stops serving a mock into the detail page's frame]` | "Delete the standalone mock page" is not literally possible: it is not a route of its own, it is the file server every framed mock is fetched through. The honest version of the owner's ask is that nothing offers them a link to it. |
| D7 | **The review page loses its approve control.** `review-page.js`'s `journey-approved:<j>` stop lookup, its `renderApproveStop` call, the `rv-nostop` line, `rv-projwait` and `projwaitText`, and the `PICKS_SCRIPT` injection are deleted; the header keeps its breadcrumb and pill. The journey rail, the boards and the inspector are unchanged. (AC-20260913-06-10) | Measured (A2): the atlas already renders the identical control, from the same `renderApproveStop` and the same stop key, inside that journey's own section — so this is one of two copies of one control, and the owner asked for the page to carry four things. |
| D8 | **One amendment ADR.** `docs/adr/0026-every-mock-has-a-page-you-can-mark.md` (CREATE) applies to `specs/20260912/05-the-atlas-answers-to-a-design.md` D4 (the journey-owned/journey-less card split and the lightbox binding that skips shotlinked frames), `specs/20260906/04-journey-review-page.md` D5 (the approve control on the page), and `specs/20260905/01-picks-on-the-atlas-page.md` D3 (the lightbox bar's `Pick this`). (AC-20260913-06-11) | Three locked Decisions describe the two-destination arrangement this spec collapses, and one of them is pinned by an executed test that asserts the skip-binding's literal source text. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: the `GET /screen/<label>.html` route. D3: every card's `shotlink` wrapper and the retired `open ↗`/`__full()`. D4: `LIGHTBOX`, the `#lb*` CSS block and every `__lb*` function and handler in `UI_SCRIPT`, from both `buildAtlas` and `cmdGallery`; the measure/scale/clamp code is preserved verbatim |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D1/D2: `buildScreenPage` added and exported, reusing every existing component renderer; its shell carries the board, the inspector, the composer and a breadcrumb and nothing else. D7: the approve-stop lookup, `renderApproveStop` call, `rv-nostop`, `rv-projwait`, `projwaitText` and the `PICKS_SCRIPT` injection deleted |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D1: the page script runs on both shells — every `q`/`qa` lookup that assumes a rail or an approve control guards on its absence. D7: `recount`'s approve-button and `projwait` syncing deleted |
| spec/scripts/lib/stop-block.js | MODIFY | scripts | D4: the `__lbOpen`/`__lbClose` monkey-patch block deleted from `PICKS_SCRIPT`; `renderApproveStop` and the decide POST are unchanged |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5: `mockAnchor` always renders an anchor to the screen page; the `window.__lbOpen` branch and the inert fallback deleted |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D2: the detail page's shell rules, reusing the `.rv-*` register. D4: nothing to delete here (the lightbox CSS is inline in `design-atlas.js`) except the orphaned `.v-lightbox-backdrop`. D5: the `.nl-anchor.plain` rule deleted. D7: `.rv-nostop`, `.rv-projwait`, `.rv-control` rules deleted |
| design/chrome-mocks/atlas.html | MODIFY | doctrine | D3/D4: every card is a link to its screen page; the lightbox is gone from the binding atlas design source |
| design/chrome-mocks/review.html | MODIFY | doctrine | D2/D7: the approve block and the whole-product waiting line removed; the detail page's shell added as a second example in the same file, so one design source carries both shells |
| spec/doctrine/design.md | MODIFY | doctrine | D4: the § Design Atlas sentence describing the lightbox as how a card opens |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1-D7: the page-notes and atlas paragraphs — one destination per card, the screen page, the lightbox and the bare-mock link retired, approval living on the atlas |
| docs/adr/0026-every-mock-has-a-page-you-can-mark.md | CREATE | doctrine | D8: the amendment ADR |
| tests/mocks/screen-page.test.js | CREATE | tests | AC-20260913-06-1, AC-20260913-06-2, AC-20260913-06-3, AC-20260913-06-6, AC-20260913-06-7, AC-20260913-06-9, AC-20260913-06-10, AC-20260913-06-11 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260913-06-4, AC-20260913-06-5, AC-20260913-06-8 — the card-link pin, which today asserts the journey/no-journey split and the skip-binding's literal source |
| tests/mocks/notes-layer-navigation.test.js | MODIFY | tests | D5: the `window.__lbOpen` stub and the two-branch expectation replaced by the single anchor |
| tests/mocks/review-page.test.js | MODIFY | tests | AC-20260913-06-10 — the approve-control and whole-product-waiting tests, whose subject this spec deletes |
| tests/mocks/review-browser.test.js | MODIFY | tests | D7: the `rv-projwait` recount tests, whose subject this spec deletes |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

**Orchestrator duty (outside the table).** Append one `- Amended by: ADR-0026 — <one line>`
header line to each of `specs/20260912/05-the-atlas-answers-to-a-design.md`,
`specs/20260906/04-journey-review-page.md` and
`specs/20260905/01-picks-on-the-atlas-page.md`. No other text in those three files changes.

## Contracts

```
GET /screen/<label>.html           # the mock detail page — any declared screen, journey or not
GET /screen/<label>.html?clean     # same, without the page script (the existing ?clean rule)
GET /review/<journey>.html         # unchanged, minus its approve control
GET /mocks/<label>.html?clean&notes=1   # unchanged — what both pages' boards fetch
```

`lib/review-page.js` exports, after this spec:

```js
module.exports = { buildReviewPage, buildScreenPage, /* …existing helpers, unchanged… */ }
```

`buildScreenPage({ root, label, prefix, seed, notes, clean })` — throws
`'unknown screen ' + label + ' — declared: ' + names.join(', ')` when the label is not among the
screens `seed` declares.

Retired identifiers: `LIGHTBOX`, `__lbList`, `__lbIx`, `__lbShow`, `__lbOpen`, `__lbClose`,
`__full`, `rv-nostop`, `rv-projwait`, `projwaitText`, `v-lightbox-backdrop`, `nl-anchor plain`.

## UI

`design_source: design/chrome-mocks/review.html`, which this spec edits to carry both shells,
and `design/chrome-mocks/atlas.html` for the card link. Both stay the binding references.

**The screen page, top to bottom.** A breadcrumb — `<product> / <label>`, the product name a
link to the atlas index, and, when the screen belongs to a journey, that journey's name a link
to its review page. One board: the screen's caption, its state tabs with their region-note
counts, and the framed mock with its notes layer live. The inspector beside it: the `Needs you`
/ `Done` / `All` filters, the rows for this screen's notes and its marked-region notes, a
`Whole project` band with the project notes under it, and the composer.

**Nothing else renders.** No approve button, no `Waiting for the session to open a look` line,
no progress bar, no journeys list, no screens list.

**The atlas card.** The whole preview is the link. There is no `open ↗`, no hover cursor change
to `zoom-in`, and no modal. A compare-table cell inside a pick stop is a preview only; its
column header's `Pick this` is unchanged and is how a candidate is chosen.

**The control specified three ways** (pipeline rules § Planning) — the one control this spec
adds is the card link itself:

| control | the sentence on success | the path back | farthest artifact reached |
|---|---|---|---|
| an atlas card | the screen page opens, showing that screen and every note on it | the breadcrumb's product name returns to the atlas; the browser's own Back does too | none — a navigation writes nothing |

## Data Model

None. This spec adds no field, changes no stored shape and writes nothing to
`design/mocks/notes.json`, `picks.json` or `mocks.status.json`.

## Behavior

The owner opens the atlas. Every card — a journey's screen, a shape candidate, an orphan — is a
link to that screen's own page. Clicking one lands on a page where the mock is live in its
frame, its state tabs work, they can drag a box on it, and every note on that screen plus every
whole-product note is listed beside it in the colours specs/20260913/05 defines.

Nothing opens a modal any more, and no card offers a link to the raw mock file. A journey's
review page is still there, reached from a screen page's breadcrumb or the atlas's journey
heading, and still shows that journey's screens together — it just no longer carries an approve
button, because the atlas renders that same control for that same stop in that journey's own
section.

A project note in the atlas's own notes panel still points at the screen it is about; that pill
is now an ordinary link to the screen page rather than a button that opened the modal.

## Acceptance Criteria

- **AC-20260913-06-1**: WHEN `GET /screen/a.html` is requested against a served host whose
  `seed.md` declares screen `a` under a journey, and against one whose screen `a` belongs to no
  journey, THE SYSTEM SHALL answer `200` in both cases with a page containing one
  `[data-rv="board"]` for `a`, one iframe whose `src` contains `/mocks/a.html?clean&notes=1`,
  and one `[data-rv="composer"]`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-2**: WHEN `GET /screen/a.html` is requested THE SYSTEM SHALL return markup
  containing a `Whole project` band and a row for every project-scope note, a row for every note
  on screen `a` including those carrying a region, and no row for a note on any other screen
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-3**: WHEN `GET /screen/a.html` is requested THE SYSTEM SHALL return markup
  containing none of `data-rv="approve"`, `data-rv="change"`, `rv-nostop`, `rv-projwait`,
  `rv-progress` or `rv-journeys`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-4**: WHEN the atlas index is built over a host with one journey-owned screen
  `a` and one journey-less shapes candidate `s` THE SYSTEM SHALL wrap both previews in
  `<a class="shotlink" href="/screen/a.html">` and `<a class="shotlink" href="/screen/s.html">`
  respectively, and SHALL emit no `href` containing `/review/` on any card
  → rewrites tests/design-atlas.test.js :: AC-20260912-05-2:
- **AC-20260913-06-5**: WHEN the atlas index is built THE SYSTEM SHALL emit no anchor whose text
  is `open ↗` and no occurrence of the literal `__full`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-6**: WHEN the atlas index and the candidate gallery are built THE SYSTEM
  SHALL each contain zero occurrences of `__lbOpen`, `__lbClose`, `__lbShow`, `__lbList`,
  `__lbIx`, `id="lb"`, `id="lbbar"` or `id="lbframe"`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-7**: WHEN `GET /screen/nope.html` is requested against a host declaring only
  screen `a` THE SYSTEM SHALL answer `404` with a `text/plain` body reading
  `unknown screen nope — declared: a`
  → writes tests/mocks/screen-page.test.js
- **AC-20260913-06-8**: WHEN the atlas index is built THE SYSTEM SHALL CONTINUE TO clamp a card
  preview to one fixed height — the `.shot` rule carrying `max-height:var(--v-shot-max,260px)`,
  the `.shot.clip::after` fade, and the `s.classList.toggle("clip",full>cap)` toggle all present
  → rewrites tests/design-atlas.test.js :: atlas card previews clamp
- **AC-20260913-06-9**: WHEN the atlas index's project-notes panel renders a mock-scope note
  whose screen is drawn THE SYSTEM SHALL render its jump pill as an anchor whose `href` ends
  `/screen/<label>.html`, and SHALL render no element carrying both `nl-anchor` and `plain`
  → rewrites tests/mocks/notes-layer-navigation.test.js :: D7′(a)
- **AC-20260913-06-10**: WHEN `GET /review/j1.html` is requested THE SYSTEM SHALL return markup
  containing a `[data-rv="rail"]` journeys list and containing none of `data-rv="approve"`,
  `rv-nostop` or `rv-projwait`
  → rewrites tests/mocks/review-page.test.js :: q241: with the
- **AC-20260913-06-11**: WHEN every tracked file under `spec/`, `tests/`, `scripts/` and
  `design/` is searched THE SYSTEM SHALL yield zero occurrences of each of `LIGHTBOX`,
  `__lbShow`, `__lbOpen`, `__lbClose`, `__lbList`, `__lbIx`, `__full`, `rv-nostop`,
  `rv-projwait`, `projwaitText` and `v-lightbox-backdrop`, each matched with a boundary that
  treats `-` as part of the word; and `docs/adr/0026-every-mock-has-a-page-you-can-mark.md`
  SHALL parse with `Status: accepted`, a non-empty `## Dissents` section, and an
  `## Applies to` section naming `specs/20260912/05-the-atlas-answers-to-a-design.md`
  → writes tests/mocks/screen-page.test.js

## Assumptions (escalation triggers)

- A1: **Deleting `window.__lbOpen` would silently break the project panel's jump pill, and no
  test covers the absent branch.** Read 2026-09-13: `notes-layer.browser.js`'s `mockAnchor`
  renders a live `button.nl-anchor` only when `typeof window.__lbOpen === 'function'` and an
  inert `span.nl-anchor.plain` otherwise; `tests/mocks/notes-layer-navigation.test.js` stubs
  `__lbOpen` locally, so the test passes either way while the served page degrades. D5 is the
  fix. — **if false:** the pill has another live route; keep the anchor anyway, since the
  screen page is a better destination than the modal.
- A2: **The approve control D7 deletes is one of two copies of the same control.**
  Read 2026-09-13: `design-atlas.js`'s `stopHome` matches `/^journey-approved:(.+)$/` and
  renders that stop through `renderStop` → `renderApproveStop` inside that journey's own atlas
  section, from the same `lib/stop-block.js` and the same `picks.json` key that
  `review-page.js` looks up. — **if false:** deleting it leaves a journey with no approve
  surface; STOP, ask the user before removing it.
- A3: **A compare-table cell has a `Pick this` control outside the lightbox.** Read
  2026-09-13: `design-atlas.js`'s `renderCompareTable` renders a per-column button reading
  `Pick this` / `Picked` / `Pick this instead` in the sticky column header, independent of
  `stop-block.js`'s lightbox-bar copy. — **if false:** picking becomes unreachable once the
  modal goes; add the header button in the same batch rather than keeping the modal.
- A4: **`UI_SCRIPT` carries load-bearing non-lightbox code that must survive verbatim.** It
  defines `__fit`, `__measure`, `__still` and `__fitAll`, which scale and pause every card
  iframe, and the `.shot`/`.clip` clamp whose literal source text is pinned by
  `tests/design-atlas.test.js`'s card-height test. — **if false:** the pin reddens on a diff
  that looks like a deletion of unrelated code; restore the clamp verbatim, never retag the
  pin.
- A5: **`0026` is the next free ADR number once 03's `0023`, 04's `0024` and 05's `0025`
  land.** — **if false:** take the next free number and amend D8, the File Plan row,
  AC-20260913-06-11 and every backlink in the same build.

## Rationale

The two-destination arrangement was never designed; it is a migration that stopped halfway.
`specs/20260912/05` D4 routed journey-owned cards to the review page and deliberately left the
lightbox in place for everything else, which is why the skip-binding
`if(!s.closest("a.shotlink"))` exists at all: it is the seam between the new destination and the
old one. Finishing the migration means the seam goes with it.

D6 is the correction to how this work was described. "Delete the standalone mock page route" is
not something the code can do — there is no such route. A bare mock is served by the generic
static `design/` branch, and both the review page's boards and this spec's new screen page fetch
their mocks through it with `?clean&notes=1`. The owner's actual complaint is that the atlas
hands them a link to it; that link is what this spec deletes.

D5 is the trap. The lightbox's `__lbOpen` is not confined to the modal: the notes layer probes
for it to decide whether a project note's jump pill is a button or dead text, and the only test
that touches that code stubs the function locally, so it passes whether or not the real page
defines it. Deleting the modal without D5 would leave every pill inert with a fully green suite
— the host's own gotcha list names this class (a class a page emits with nothing behind it), and
this is the same shape one layer up.

D7 removes a control rather than moving one. A2 measured that the atlas already renders the
identical approve block, from the same module and the same stop key, in the journey's own
section — so the review page's copy is the second of two, and the page the owner asked for
carries four things.

Adversarial check, rejected: a reviewer could argue the screen page and the journey review page
should be one page with a mode flag, since they share every component. Rejected — the journey
page's breadcrumb, rail and stop lookup are all keyed on a journey that a screen page does not
have, so a single function would carry that flag through every branch; two shells over one set
of components is the arrangement with no flag at all.

Four lock-time sweep hits are recorded as waives rather than File Plan rows.
`docs/canonical/design.md` is corrected by the Canonical Delta at review close.
`docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md` names `rv-projwait` in its own
historical account and is never rewritten — the amendment convention adds a backlink line
instead. `docs/spikes/23-atlas-index-nav/index.html` is a dated spike artifact, not live
surface. `design/atlas/index.html` is an untracked build product of a previous atlas run sitting
in the working tree; it is not tracked, so it is outside every sweep this repo runs, and it is
queued separately for a gitignore entry rather than fixed here.

The zero-hit sweep (AC-20260913-06-11) covers `spec/`, `tests/`, `scripts/` and `design/` — the
executable and test surface this spec's File Plan owns. The retired names in
`docs/canonical/design.md` are corrected by the Canonical Delta below, which the review
stage applies at close; sweeping that file at build time would redden the gate against text
the build is not allowed to write.

## Canonical Delta

`docs/canonical/design.md` § the journey look surface: replace "The atlas renders one frame per
screen, with the declared state count in the card's meta line (ADR-0016); a journey-owned card's
preview links to that screen's board on the journey review page" with — "The atlas renders one
frame per screen, with the declared state count in the card's meta line (ADR-0016). Every card's
preview is a link to that screen's own page, `/screen/<label>.html`, whether or not a journey
declares it: one board with its state tabs and its live notes layer, this screen's notes, the
notes that mark an area on it, the whole-product notes and the composer — and nothing else. No
card links to a bare mock file and there is no lightbox; `lib/review-page.js` exports
`buildScreenPage` beside `buildReviewPage` and both shells render the same components. The
journey review page `/review/<j>.html` keeps its rail and boards and no longer carries an
approve control: a journey's `journey-approved:<j>` stop renders on the atlas, in that journey's
own section, which is where approval happens." In § Picks, delete "and the index's bar hides
while the lightbox is open (`body.lb-open`)" and change "The served atlas lists open stops at
the top (`#stops`, links only)" to keep its text with the compare table's own `Pick this`
described as the one pick control.
