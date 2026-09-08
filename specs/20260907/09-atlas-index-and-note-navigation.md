---
date: 2026-09-07
status: hardened
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-07
open_markers: 0
---

# The atlas gains an index, and a note names the screen it belongs to

## Goal

The design atlas is one long scroll with no map: on a sixty-screen project a reviewer
re-entering cold cannot see what exists without scrolling past all of it, and a note written
on one screen is invisible everywhere except that screen's own page. This spec adds two
things to `design-atlas.js`'s index page: a persistent screen index (a left sidebar with a
search box, one row per journey/screen/candidate, jumping to the card) and two-way note
navigation (the project panel lists every open note and a mock-scope row jumps to its screen's
lightbox; a mock page's notes strip links back to the project panel). Done means a reviewer
can answer "what is here?" and "which screen is this note about?" without scrolling, and a
host that renders a gallery or a journey review page sees no sidebar at all.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The index is a **persistent left sidebar**, not a drawer and not a command palette: `page()` gains the `#shell`/`#toc` CSS register, and **`buildAtlas` alone** emits `<div id="shell"><aside id="toc">…</aside><div id="main">…</div></div>` around the body it already composes. At `min-width:1200px` `#toc` is a `position:sticky; top:0; height:100vh; overflow:auto` grid column, always open, no persisted state; below 1200px it becomes a fixed overlay panel (`transform:translateX(-100%)`, `.open` → `translateX(0)`) over a scrim, toggled by one `Index` button in the existing `.bar` (`#tocbtn`, `display:none` at wide widths) and dismissed by the scrim, `Escape`, or activating a row (AC-20260907-09-1, AC-20260907-09-4) | The reviewer's first question after days away is "what is here now?", which a palette cannot answer because it assumes you already know what you are looking for; a sidebar answers it by existing. Rejected: a Cmd-K overlay, and a remembered collapsed state — one bad-moment collapse would hide the index forever. |
| D2 | The tree is one `.tocgroup[data-group="<section title>"]` per rendered section **in the page's own render order** (shapes, theme, then the sorted journey/brief sections), each opening with a `.tochead#th-<title>` carrying the section title and a `.count` pill, followed by one `.tocrow[data-label][data-st]` per surface — mocked cards and gap chips alike — containing a single status `<span class="dot ...">` and the label, and nothing else. A heading jumps to `#j-<title>` (a new `id` on the section's `<h2>`), a row to `#s-<label>` (the id cards and gap chips already carry), adding `.flash` for 1200 ms on arrival (AC-20260907-09-1, AC-20260907-09-3) | The index is a map, not a second dashboard: the card already carries the badges, and duplicating status text per row is the one way this addition makes the atlas worse. Row ids reuse what `buildAtlas` already emits, so nothing new has to be kept in sync. |
| D3 | Search (`#tocsearch`, placeholder `Search screens   /`) filters **in place**: a row stays visible when its label **or its group's title** contains the query as a case-insensitive substring, a group with no visible row is hidden, and a `.tocempty` line shows when nothing matches. `Enter` activates the first visible row; `/` focuses the box (and opens the overlay first when narrow). The query **never** filters the cards on the page (AC-20260907-09-2) | Matching the journey name is what keeps a hit legible — `staff-invite` found by typing `session` is only understandable because it lives in `staff-session`. One-directional coupling: two filter directions is where these become unpredictable. |
| D4 | **One filter model.** The `.bar`'s existing status chips narrow the index as well as the cards: `__filter` hides a `.tocrow` whose `data-st` is not the active status, combined with D3's query as a logical AND. The sidebar gets no status control of its own (AC-20260907-09-2) | The index and the page must never disagree about what exists; a second status control is a second answer to the same question. |
| D5 | The current section is the **last `.sect > h2` whose top is at or above `max(80, innerHeight * 0.25)`**, defaulting to the first heading when none is, recomputed on `scroll` (coalesced through one `requestAnimationFrame`) and once at load; the matching `.tochead` carries `.here`, which paints the same 4px `--v-primary` left border the section's own `h2` uses. Never per-screen (AC-20260907-09-6) | Executed 2026-09-07: an `IntersectionObserver` band (`rootMargin:'-10% 0px -80% 0px'`) marked **nothing** at four scroll positions — a heading jumped to lands above the band's top edge and never intersects — while the threshold rule marked correctly at all four plus the top of the page. Per-screen tracking over sixty cards flickers and answers a question ("where am I") the journey level already answers. |
| D6 | `/__notes/list` gains exactly one new value: **`screen=**` returns every note regardless of scope**, ledger-joined for question rows identically to the existing branches. `screen=*` and `screen=<label>` keep their present meaning byte-for-byte. The notes layer's `refresh()` requests `screen=**` when its declared scope is `project` (AC-20260907-09-7, AC-20260907-09-8) | Executed 2026-09-07 against a root holding one project note and one mock note: `screen=*` returned only the project note, so the panel genuinely cannot reach a mock note today. A new token rather than a redefinition keeps specs/20260906/03 D3's scope contract intact for every other caller. |
| D7 | The project panel lists **every open note, flat** (JJ 2026-09-07). A project-scope row renders exactly as today. A mock-scope row replaces the plain `<b>` id badge with a `.nl-anchor` control: a `<button>` labelled `<screen> · <state>` when the host document holds `#s-<screen>` **and** exposes `window.__lbOpen`, and an inert `<span class="nl-anchor plain">` labelled `<screen> · not drawn` otherwise. Activating the button calls `__lbOpen` on that card's `iframe.frame` — the atlas lightbox, never a navigation (AC-20260907-09-9, AC-20260907-09-10) | JJ's pick over a collapsed group: one place to see everything still open. Fable's pick for the target: the reviewer is already on the atlas, `Escape` returns them to the exact scroll position with the panel still open, and the lightbox's existing `open ↗` still reaches the served page. The inert form is what keeps a gap screen from rendering a dead control. |
| D8 | `buildAtlas` emits `<div id="nl-notes"></div>` as the **last element of `#main`**, and the notes layer mounts its project panel immediately after `#nl-notes` when that element exists (today's `rootEl || document.body` fallback is unchanged for every other project-scope page). The mock page's strip heading gains one right-aligned link, text `Project notes ↗`, `href` = `<base>/atlas/index.html#nl-notes`, which navigates in the same tab (AC-20260907-09-11, AC-20260907-09-12) | Without an explicit anchor the panel mounts after `<body>` and lands outside the two-column grid, full-width under both columns. One element serves as both the mount point and the hash target. Opening project notes *in place* on a mock would make the strip render a second scope and break the layer's one-panel-per-scope rule. |
| D9 | No custom "back" affordance in either direction, and **no deep link into a state** on the served mock page: browser back is the return path from the mock page, `Escape` from the lightbox (AC-20260907-09-13) | Fable's refusal: state-level deep linking couples the notes layer to mock internals it is deliberately isolated from, and the label-level jump already lands within one scroll of the state. |
| D10 | New chrome class names live in their existing homes: the `#shell`/`#toc`/`.tocgroup`/`.tochead`/`.tocrow`/`.tocempty`/`#tocbtn`/`#tocscrim` register is authored in `design-atlas.js`'s `page()` (where every other atlas-chrome rule already lives, emitted for pages that never use it); `.nl-anchor`, `.nl-anchor.plain` and `.nl-up` are authored in `spec/templates/mocks/viewer.css`, and `notes-layer.browser.js` emits only those names, never an invented sibling. No color literal anywhere — every value resolves to a `--v-*` role (AC-20260907-09-14) | The two-register split is the rule specs/20260902/09 D4 already set and specs/20260906/03 D5 already followed; this spec adds names to it rather than a third home. |
| D11 | Doctrine, one home each: `spec/doctrine/design.md` § Design Atlas gains one bullet for the index (`persistent at wide widths, an overlay below 1200px, search filters the index only, the status chips filter both`) and one for note navigation (`the project panel lists every open note; a screen note names its screen and opens it in the lightbox; the strip links back`), and points at § Design Canon for the chrome rule rather than restating it `[no-ac: prose contract; review's citations-check and doctrine legs are the oracle, the mechanisms are AC-20260907-09-1 and AC-20260907-09-9]` | § Doctrine Authoring: the page builder and the layer are the mechanism; prose points at them. The queue item's tool-surface rule names § Design Canon as the chrome rule's one binding home — pointing, never a second copy. |
| D12 | Bump `spec/.claude-plugin/plugin.json` to the next free minor — target **7.103.0**, because `specs/20260907/04` claims 7.98.0, `05-genesis-drops-the-theme-gates` claims 7.99.0, `06` claims 7.100.0, `07` claims 7.101.0 and `08` claims 7.102.0 — with the last-3-versions changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline; hardened-but-unbuilt siblings hold the numbers they claim. |

**Orchestrator duty (outside the File Plan table):** `page()`'s style string and `buildAtlas`'s
body composition are edited by the same worker in one pass — a sidebar emitted without its CSS
register (or vice versa) leaves the page visibly broken between waves. The notes-layer row and
the `viewer.css` row are likewise one pair: the layer must not emit `.nl-anchor` before
`viewer.css` declares it.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: `#shell`/`#toc` CSS in `page()` + the `#shell` wrapper and `<aside id="toc">` in `buildAtlas`; D2: the tree render + `id="j-<title>"` on section `<h2>`; D3/D4: search + `__filter` extended to `.tocrow`; D5: the current-section marker; D6: the `screen=**` branch in `/__notes/list`; D8: the `#nl-notes` anchor div |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D6: `refresh()` requests `screen=**` on project scope; D7: `.nl-anchor` row control (button vs inert span) calling `window.__lbOpen`; D8: mount after `#nl-notes` when present, and the `Project notes ↗` link in the strip heading |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D10: `.nl-anchor`, `.nl-anchor.plain`, `.nl-up` on `--v-*` roles only |
| spec/doctrine/design.md | MODIFY | doctrine | D11: two bullets in § Design Atlas, pointing at § Design Canon for the chrome rule |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D12: version → 7.103.0 + changelog entry |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260907-09-1, AC-20260907-09-5, AC-20260907-09-7, AC-20260907-09-8, AC-20260907-09-11, AC-20260907-09-14 |
| tests/design-atlas-index.test.js | CREATE | tests | AC-20260907-09-2, AC-20260907-09-3, AC-20260907-09-4, AC-20260907-09-6 |
| tests/mocks/notes-layer-navigation.test.js | CREATE | tests | AC-20260907-09-9, AC-20260907-09-10, AC-20260907-09-12, AC-20260907-09-13 |

## Contracts

```
GET /__notes/list?screen=<value>          (design-atlas.js `serve`)

  screen=<label>   → notes where scope === 'mock'    && screen === <label>   (unchanged)
  screen=*         → notes where scope === 'project'                          (unchanged)
  screen=**        → every note, no scope filter                              (NEW, D6)

  Question rows (kind === 'question') are ledger-joined identically in all three branches:
  claim/rejected/tag/status from design/mocks/ledger.md, or ledgerMissing:true when the row
  is gone. Response shape is otherwise the stored note record, unchanged.

  Literal: notes.json = [ {id:N1, scope:'project', screen:null},
                          {id:N2, scope:'mock', screen:'session-live', state:'listening'} ]
    screen=**            → [N1, N2]
    screen=*             → [N1]
    screen=session-live  → [N2]
```

```
Atlas index page skeleton (buildAtlas output, D1/D2/D8)

  <div id="shell">
    <aside id="toc">
      <p class="tochdr">Index</p>
      <input id="tocsearch" type="search">
      <nav id="toctree">
        <div class="tocgroup" data-group="<section title>">
          <div class="tochead" id="th-<section title>">…<span class="count">n</span></div>
          <button class="tocrow" data-label="<label>" data-st="<status>">
            <span class="dot <status>"></span><span class="lbl"><label></span>
          </button>…
        </div>…
        <p class="tocempty" hidden>No screen matches.</p>
      </nav>
    </aside>
    <div id="main"> …header, stops, graph, .bar, sections…  <div id="nl-notes"></div> </div>
  </div>
```

## UI

The sidebar is chrome, not a card: `background: var(--v-bg)`, a single
`border-right: 1px solid var(--v-border)`, **no shadow** at wide widths (the overlay form adds
`var(--v-shadow)` because it floats). Rows are plain buttons — `--v-fg` label, one `.dot` in
the status role colour already used by the `.bar` chips (`--v-danger` gap, `--v-warn` sketch,
`--v-ok` approved/built, `--v-ring` bound, `--v-muted` otherwise), `var(--v-muted-bg)` on
hover, `var(--v-radius)` corners. Headings are 11px uppercase `--v-muted` with `.06em` tracking
(the existing `.statelabel` treatment) and the existing `.count` pill; `.here` swaps the
heading's transparent 4px left border for `--v-primary` and its text to `--v-fg`. The width is
one token, `--toc-w: 264px`.

States: **default** (every row visible, first heading marked), **filtered** (rows and empty
groups hidden; `.tocempty` when nothing matches), **overlay open** (below 1200px: panel at
`translateX(0)`, scrim painted, `#tocbtn.on`), **overlay closed** (panel off-canvas, scrim
`display:none`). Focus is visible on every control (the page's existing `:focus-visible` ring);
the overlay's `transform` transition is `.18s ease` and is suppressed under
`prefers-reduced-motion: reduce`, which the page already honours.

`.nl-anchor` is a pill in the shape of the `<b>` id badge it replaces — 11px, `--v-border`
outline, `999px` radius — in `--v-primary` with a `--v-muted-bg` hover when it is a button, and
in `--v-muted` with `cursor:default` when inert. `.nl-up` is a 12px `--v-muted` link at the
right end of the strip heading, `--v-fg` and underlined on hover.

## Behavior

Arriving cold on a wide screen, the reviewer sees the sidebar already open with every journey
and screen listed and the first section marked current. Typing narrows the list; pressing
Enter jumps to the first remaining row and the card flashes its ring for just over a second.
Clicking a status chip narrows both the cards and the index together, so the two never
disagree. Scrolling moves the current-section marker down the index.

Below 1200px the sidebar is off-canvas. The `Index` button in the toolbar slides it in over a
scrim; picking a row closes it and scrolls; so does `Escape` or a click on the scrim. Whether
the page is in overlay mode is read from the toggle button's computed `display`, never from a
breakpoint value repeated in the script — the executed prototype showed the duplicated
breakpoint silently leaving the drawer open after a jump.

At the foot of the page the project panel now lists every open note. A note written about the
whole product reads as it always has. A note written on one screen shows that screen and state
as a pill; clicking it opens that screen in the same lightbox a card click opens, so `Escape`
returns to the same scroll position with the panel still open. When the note names a screen
that has no card — a gap, or a label that has since disappeared — the pill is plain grey text
saying the screen is not drawn, and clicks nothing. From a served mock page, one link in the
notes strip heading goes back to the atlas and lands on the panel.

## Acceptance Criteria

- **AC-20260907-09-1**: WHEN `buildAtlas` renders a root with at least one journey section THE
  SYSTEM SHALL emit `<div id="shell">` wrapping an `<aside id="toc">` and a `<div id="main">`,
  the aside containing one `.tocgroup[data-group]` per rendered section in the same order the
  sections are emitted and one `.tocrow[data-label][data-st]` per surface (a mocked label and a
  gap label alike), and SHALL emit `id="j-<section title>"` on each section's `<h2>` →
  `tests/design-atlas.test.js`
- **AC-20260907-09-2** `[env: CHROME_BIN]`: WHEN the served atlas is loaded and `session` is
  typed into `#tocsearch` THE SYSTEM SHALL leave visible exactly the rows whose `data-label` or
  whose group's `data-group` contains `session` (with a `staff-session` section holding
  `staff-invite`, `staff-invite` stays visible and an `owner-map` row in another section
  hides), SHALL hide every group with no visible row, and WHEN the `sketch` status chip is then
  clicked SHALL leave visible only the rows matching both → `tests/design-atlas-index.test.js`
- **AC-20260907-09-3** `[env: CHROME_BIN]`: WHEN a `.tocrow` for label `L` is activated THE
  SYSTEM SHALL scroll `#s-L` into view and add class `flash` to it, and WHEN `Enter` is pressed
  in a non-empty `#tocsearch` SHALL activate the first visible row →
  `tests/design-atlas-index.test.js`
- **AC-20260907-09-4** `[env: CHROME_BIN]`: WHEN the viewport is narrower than 1200px THE
  SYSTEM SHALL compute `#tocbtn` as displayed and `#toc` as `position:fixed` translated fully
  off-canvas, SHALL translate it to `0` and paint `#tocscrim` when `#tocbtn` is activated, and
  SHALL remove both when a `.tocrow` is activated, when `Escape` is pressed, or when the scrim
  is clicked → `tests/design-atlas-index.test.js`
- **AC-20260907-09-5**: WHEN `cmdGallery` renders a candidate gallery THE SYSTEM SHALL CONTINUE
  TO emit no `#toc`, no `#shell` and no `.tocrow` element → `tests/design-atlas.test.js`
- **AC-20260907-09-6** `[env: CHROME_BIN]`: WHEN the served atlas is scrolled so that the last
  section heading at or above `max(80, innerHeight * 0.25)` belongs to section `S` THE SYSTEM
  SHALL carry class `here` on `#th-S` and on no other `.tochead`, and WHEN the page is at
  scroll position 0 SHALL mark the first section's heading →
  `tests/design-atlas-index.test.js`
- **AC-20260907-09-7**: WHEN `GET /__notes/list?screen=**` is served against a root whose
  `design/mocks/notes.json` holds one `scope:"project"` note `N1` and one `scope:"mock"` note
  `N2` on screen `session-live` THE SYSTEM SHALL return both records (`[N1, N2]`), joining a
  question row against the ledger exactly as the other branches do →
  `tests/design-atlas.test.js`
- **AC-20260907-09-8**: WHEN `GET /__notes/list?screen=*` is served against that same root THE
  SYSTEM SHALL CONTINUE TO return only `[N1]`, and `?screen=session-live` only `[N2]` →
  `tests/design-atlas.test.js`
- **AC-20260907-09-9**: WHEN the notes layer renders the project panel for a note with
  `scope:"mock"`, `screen:"session-live"`, `state:"listening"` in a document holding
  `#s-session-live` and `window.__lbOpen` THE SYSTEM SHALL render a `button.nl-anchor` whose
  text is `session-live · listening`, and WHEN the document holds no `#s-session-live` SHALL
  render a non-interactive `span.nl-anchor.plain` whose text is `session-live · not drawn` →
  `tests/mocks/notes-layer-navigation.test.js`
- **AC-20260907-09-10** `[env: CHROME_BIN]`: WHEN that `button.nl-anchor` is activated on the
  served atlas THE SYSTEM SHALL open the lightbox (`#lb.on`) showing that screen's frame, and
  WHEN `Escape` is then pressed SHALL close it leaving the panel rendered and the page scroll
  position unchanged → `tests/mocks/notes-layer-navigation.test.js`
- **AC-20260907-09-11**: WHEN `buildAtlas` renders THE SYSTEM SHALL emit `<div id="nl-notes">`
  as the last element inside `#main` → `tests/design-atlas.test.js`
- **AC-20260907-09-12**: WHEN the notes layer initialises on a page declaring
  `<meta name="notes-scope" content="mock">` THE SYSTEM SHALL render exactly one `a.nl-up` in
  the strip heading whose text is `Project notes ↗` and whose `href` is
  `<base>/atlas/index.html#nl-notes` (`/atlas/index.html#nl-notes` with no mount prefix,
  `/p/demo/atlas/index.html#nl-notes` under a `/p/demo` mount), and WHEN it initialises on a
  page declaring scope `project` SHALL mount its panel immediately after `#nl-notes` when that
  element exists → `tests/mocks/notes-layer-navigation.test.js`
- **AC-20260907-09-13**: WHEN the notes layer renders any note row THE SYSTEM SHALL CONTINUE TO
  emit no control that navigates to a mock page state — no `?state=` href and no state-scoped
  deep link anywhere in the layer's source →
  `tests/mocks/notes-layer-navigation.test.js`
- **AC-20260907-09-14**: WHEN `page()`'s emitted stylesheet and `viewer.css` are read THE
  SYSTEM SHALL contain the selectors `#shell`, `#toc`, `.tocgroup`, `.tochead`, `.tocrow`,
  `.tocempty`, `#tocbtn`, `#tocscrim` (in `page()`) and `.nl-anchor`, `.nl-anchor.plain`,
  `.nl-up` (in `viewer.css`), and SHALL contain no color literal (`#rgb`, `#rrggbb`, `rgb(`,
  `hsl(`) in any rule this spec adds → `tests/design-atlas.test.js`

## Assumptions (escalation triggers)

- **A1** — Executed 2026-09-07 (micro-spike, scratch root, `design-atlas.js serve --port 4199`):
  `GET /__notes/list?screen=*` returned only the project note `N1`; `?screen=session-live`
  returned only the mock note `N2`. The atlas panel therefore cannot reach a mock note without
  D6's new branch. **If false:** drop D6 and read the existing list.
- **A2** — Executed 2026-09-07 (prototype `docs/spikes/23-atlas-index-nav`, served and driven in
  Chrome): the sidebar renders as a sticky grid column with no page overflow
  (`scrollWidth === clientWidth`); search narrowed rows to the 10 matching `session` including
  the cross-section `staff-invite`; the `sketch` chip plus that query narrowed to 4; a row
  activation scrolled and flashed the card; a panel anchor opened the lightbox on
  `session-live`; the strip link landed on the atlas at the notes panel. No console errors.
  **If false:** the observed prototype is the fallback design of record — re-derive from it
  rather than inventing.
- **A3** — Executed 2026-09-07 (negative claim): an `IntersectionObserver` with
  `rootMargin:'-10% 0px -80% 0px'` over `.sect > h2` marked **no** heading at four scroll
  positions (`{here: []}` each time); replacing it with D5's threshold rule marked
  `th-shapes`, `th-staff-session`, `th-dev-channel`, `th-operator-oversight` correctly at the
  same four positions and `th-shapes` at scroll 0. **If false:** mark the first heading only
  and drop the scroll listener — the highlight is a convenience, never a gate.
- **A4** — Executed 2026-09-07 (negative claim): with the breakpoint written twice, once in the
  CSS media query and once as a `matchMedia('(max-width:1199px)')` string in the script, a row
  activation left the overlay open (`{open: true}`); reading the toggle button's computed
  `display` instead closed it (`{open: false}`). D1's "read the CSS" wording is load-bearing.
  **If false:** STOP, ask the user — a second breakpoint source is the defect this pins.
- **A5** — The Chrome-executed ACs run in the same environment-gated harness
  `tests/mocks/notes-layer-isolation.test.js` already uses (CHROME_BIN, else the macOS bundle,
  else `google-chrome`/`chromium` on PATH), and that harness's page is **visible** to the
  renderer. **If false** (the harness page is hidden, where `requestAnimationFrame` and
  `scroll` never fire — observed in this session's CDP-attached background tab): call the
  marking and filtering entry points directly from the test instead of dispatching real scroll
  events, and keep the assertions on the resulting DOM state.
- **A6** — `specs/20260907/04-kit-canon-family.md` (hardened, unbuilt) also modifies
  `design-atlas.js`, in `cmdCheck`, `stopHome` and a new `#kit` page section — disjoint from
  this spec's `page()`, `buildAtlas` and `/__notes/list` edits. **If false** (the two land
  overlapping hunks): rebase this spec's build on the sibling's merge and re-run the gate; both
  are additive, neither retires the other's prose.

## Rationale

The queue item asked for two things that look separate and share one page. Both were
prototyped as clickable HTML before this spec existed, and the prototype is where the design
forks were closed — the sidebar form, the row content, the search semantics and the note
anchor were all observed working before being written down here, which is why the Decisions
read as narrow as they do.

The taste calls came from a Fable consult, on JJ's standing permission. Three of its rulings
are load-bearing and worth restating for a cold reader: a sidebar over a command palette
(a palette assumes you know what you are looking for, and the reviewer's actual first question
is what exists); the lightbox over a navigation for a note's screen (it preserves scroll
position and the panel, and the served page is still one click away); and its refusal to deep
link into a state, which would couple the notes layer to mock internals it is deliberately
isolated from. Its stated risk — that the sidebar grows into a second status dashboard — is
why D2 fixes the row content at one dot and a label, and why AC-20260907-09-1 pins the row
shape rather than only its presence.

Two executed findings changed the design after Fable's advice. The `IntersectionObserver`
Fable proposed for the current-section marker silently marks nothing, because a heading jumped
to lands above the band; the threshold rule in D5 is the observed replacement. And writing the
narrow breakpoint in both the stylesheet and the script left the overlay open after a jump —
D1 makes the script read the CSS, which is the kind of duplication that would otherwise
survive review because both halves look correct in isolation.

What to watch during execution: `page()`'s stylesheet is shared by the gallery and the journey
review page, so the sidebar's CSS ships everywhere while only `buildAtlas` emits the markup —
AC-20260907-09-5 is the pin that keeps that true. And the project panel mounts after an
explicit anchor now; a worker who drops `#nl-notes` will produce a panel that renders
full-width beneath both columns and a strip link that lands nowhere.

## Canonical Delta

`spec/doctrine/design.md` § Design Atlas gains two bullets after the existing
"**Built surfaces join the atlas**" bullet:

- **The index is part of the page.** `design/atlas/index.html` carries a screen index — one
  row per journey, screen and candidate, with a search box — persistent as a left column at
  wide widths and an overlay below 1200px. Search filters the index only; the page's status
  chips filter the index and the cards together, so the two never disagree. The index is a map,
  never a second status surface: one status dot and a label per row, the badges stay on the
  card.
- **A note names the screen it belongs to.** The atlas's project panel lists every open note;
  a note written on one screen shows that screen and state and opens it in the lightbox, or
  reads as plain text when the screen is not drawn. A served mock page's notes strip links back
  to that panel. There is no deep link into a state — the screen is the unit of navigation.

Chrome for all of it follows § Design Canon; no rule is restated here.
