---
date: 2026-09-12
status: done
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/notes.html
breaking: false
depends_on: []
depended_on_by: [specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md]
brief: n/a
spiked: 2026-09-12
open_markers: 0
diff_base: 6fc70704bf04298ab68087b714000f7344493b5c
---

# A note can mark an area

## Goal

A mock-page note today is anchored to a whole screen plus a state, so "the button in the header is
wrong" lives as prose and the reader re-finds the spot each time. After this spec the owner can drag
a rectangle over any area of a served mock — several elements, part of one, or a whole section — and
leave the note on it. The rectangle is drawn as a colored overlay by the notes layer, never as mock
markup, in the color of the note's status (red open, amber addressed, green resolved, gray dashed
outdated), and it lands on the same content at every viewport width because it is stored as a
fraction of the smallest element that contains it, with the covered children as the fallback when
that element's layout reflows. Done means: on a served mock page the owner draws, saves, reopens,
accepts, rejects with a reason, re-places an outdated box, and deletes or withdraws — all through one
card beside the box; the ledger carries a validated `region` field; the doctrine that said "never an
element" is replaced by an amendment ADR; and `design/chrome-mocks/notes.html` is the binding
reference for how it looks.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The anchor is a pure module.** `spec/scripts/lib/notes-anchor.browser.js` exports (as a global `NotesAnchor` in the browser, and as `module.exports` when `module` exists) two functions over the DOM interface only — `capture(root, box)` and `resolve(root, region)` — and nothing else: no fetch, no rendering, no status. `capture` picks the smallest descendant of `root` whose rect fully contains `box` (`root` itself when none does), and returns the Contracts `region` shape. `resolve` returns `{mode:'exact', box}` when the anchor element is found, its text snippet still matches, and its layout signature matches (same `arrangement` and aspect ratio within `0.75..1.33` of `layout.aspect`); `{mode:'children', box}` (the union of the touched children's rects, padded 4px) when the element is found but the signature changed and at least one touched child resolves; `null` otherwise (AC-20260912-11-1, -2, -3) | The prototype measured all three modes in Chromium: a two-card box switched to `children` when the row became a column; the headline box switched on the aspect check alone; a moved path resolved `null`. Fractions alone slice through reflowed text, covered-element lists alone cannot express "half a block" — the hybrid is the only scheme that survived both, and it matches the one documented implementation in the field (SitePing's %-of-anchor box) |
| D2 | **`region` is an optional, validated note field.** `addNote` copies `body.region` onto the note when present and throws when it is malformed; `validateNotes` checks the shape on every note that carries one (Contracts). A note without `region` is exactly today's screen+state note — no migration, no default. `region` is accepted only on `scope:"mock"` notes; a project-scope body carrying one is refused (AC-20260912-11-4, -5) | The validator already follows "additive and optional, present-value-must-be-valid" for `origin`/`thread`/`withdrawReason`; the micro-spike showed `addNote` silently DROPS an unknown `region` today (A2), so acceptance must be explicit, never assumed |
| D3 | **Serve exposes the anchor and three verbs.** `design-atlas.js`'s serve: `GET /__notes/anchor.js` returns `notes-anchor.browser.js` verbatim (like `notes.js`); `injectNotesScript` emits the anchor tag BEFORE the notes tag; `POST /__notes/add` passes `region` through to `addNote`; `POST /__notes/region {id, region, by}` replaces the region on an `open` or `addressed` note and appends `{at, by, text:"re-placed the box"}` to `thread` (400 on `resolved`, 404 unknown); `POST /__notes/delete {id, by}` removes an `open`, `kind`-less note whose `thread` is empty (400 otherwise); `POST /__notes/reopen {id, text, by}` on the SESSION mount (today client-only) calls `reopenNote` on an `addressed` note (400 when `text` is empty or status is not `addressed`). The client mount is untouched here (specs/20260912/12 D4) (AC-20260912-11-6, -7, -8, -9) | Re-place, delete and the owner's reject-with-reason are the three card controls with no route today; each reuses an existing lib function or a two-line array filter, and each names its refusal so the card can show it. Delete is narrow on purpose: a note anyone has answered is history, and history is withdrawn (D6), never erased |
| D4 | **The layer gains a third shadow host: the overlay.** `notes-layer.browser.js` mounts a full-page `position:absolute; inset:0; pointer-events:none` host over the mock root (`.nl-host` like the other two, viewer.css linked inside), paints one `.nl-region` box per note whose `region` resolves on the ACTIVE state, with `data-status` = the display status (`outdated` when `resolve` returns `null` and the note is not resolved; else the note's own status) and a `.nl-region-badge` pill (`<span class="nl-region-glyph {status}">` + id). Resolved boxes are hidden unless "Show resolved" is on. Re-paint runs on state-button click and on `resize`. The mock's own markup and styles are never touched — the isolation invariant holds byte-for-byte (AC-20260912-11-10, -11, -12) | Boxes are chrome; the isolation test is the contract that lets this layer exist on every host's mocks. A separate host keeps the overlay's pointer rules from leaking into the bar and strip |
| D5 | **Drawing is a mode.** The bar gains a `Mark area` toggle (key `M`; label `Marking · Esc to stop` while on). While on, the overlay host takes `pointer-events:auto` and a crosshair, a drag paints a `.nl-draft` rectangle with a size readout, release below 12×12 px does nothing, and release otherwise calls `NotesAnchor.capture` and opens the composer card (D7) beside the box with a `draft` note in memory — nothing is posted until Save. Esc cancels a drag, then closes the card, then leaves the mode. The first time the mode is entered in a browser a one-line hint shows (`Drag over anything to leave a note`), stored under `nl-hint-seen` in localStorage (AC-20260912-11-10) | The owner approved the toggle on the prototype (2026-09-12) and it is the cheaper option to reverse: a plain-drag layer must arbitrate with the mock's own scroll and selection, a mode never does |
| D6 | **One card per note, beside its box.** Click a box or its strip row → a `.nl-card` (328px, right of the box when there is room, else left; on viewports narrower than 640px a bottom sheet) showing the badge, reason chip, author, the thread (note text first, then `thread` entries, the session's marked with `.nl-card-me`), and controls by status: `open` → `Resolve`; `addressed` → `Reject`, `Accept`; every status → an overflow menu with `Re-place the box` (only when `outdated`) and `Delete` (when D3's delete precondition holds) else `Withdraw`. `Accept` = `POST /__notes/resolve`; `Reject` reveals a one-line reason field and posts `/__notes/reopen` (a blank reason keeps the field focused, posts nothing); `Withdraw` = `/__notes/resolve` with the note's prior status `open` (the existing `withdrawn` derivation); `Delete` = `/__notes/delete`. Delete, Withdraw, Resolve and Accept show a 5-second `Undo` toast and POST only when the toast expires or is dismissed — Undo cancels the post. Keys on a focused box: Enter opens, `A` accepts, `R` rejects, Esc closes (AC-20260912-11-13, -14) | The research verdict: undo beats confirm, resolve rights stay with the author, and a rejection without a reason is what leaves the next fix blind. Deferring the POST is the whole undo implementation — no server undo, no new state |
| D7 | **The composer at the box.** The D5 card variant for a draft: the four plain reason chips (`Other` selected), a textarea with focus, `Discard` (drops the draft, no post) and `Save note` (posts `/__notes/add {scope:'mock', screen, state, text, by, reason, region}`; Enter saves, Shift+Enter newlines). The strip's existing `+ Note on this state` composer stays for screen-level notes and posts no region (AC-20260912-11-10) | Focus already in the field and a default chip are the two things that make a comment tool feel fast; the screen-level composer keeps working for "this whole state is wrong" |
| D8 | **The strip learns status.** Each `.n` row gains the same badge pill as its box and a `data-status`; the header gains a segmented filter `Needs you` (addressed) · `Open` · `All` · `Resolved`, default `Needs you`, stored under `nl-filter`; hovering a row pulses its box, clicking a row scrolls to the box and opens the card. An outdated row's `<small>` opens with `Outdated — the area it marked is gone.`; a row whose box resolved in `children` mode appends `· fitted to content on this size`. The bar's `N open` badge becomes `N open · M need you` (AC-20260912-11-11) | "Needs you" as the return view is the single biggest usability win the research found, and the two footnotes are how the owner learns the anchor's honesty without reading a spec |
| D9 | **Colors and glyphs come from the register.** `viewer.css` gains the `.nl-region`, `.nl-region-badge`, `.nl-region-glyph`, `.nl-draft`, `.nl-card*`, `.nl-seg`, `.nl-toast` rules, written on `var(--v-danger)` (open), `var(--v-warn)` (addressed), `var(--v-ok)` (resolved), `var(--v-muted)` (outdated/withdrawn) via a per-box `--c`; each glyph is a shape as well as a color — hollow ring open, half-filled addressed, filled resolved, dashed ring outdated. No literal color outside `:host,:root`. The rules are authored from `design/chrome-mocks/notes.html` (D10) `[no-ac: appearance is design-stage exempt; reachability is pinned by AC-20260912-11-10/-11]` | Color alone fails one reader in twelve; the register is the only place a color may live (design.md § Design Canon) |
| D10 | **`design/chrome-mocks/notes.html` is the binding reference**, landed by the planning session from the owner-approved prototype (2026-09-12) — a self-contained static page carrying a fake booking screen, the bar, the overlay with one box per display status, the card in both variants, the strip, and a desktop/phone switch. `spec/doctrine/design.md` § Design Canon's plugin-chrome sentence gains `, and the notes layer to design/chrome-mocks/notes.html` inside its existing artifact clause. Workers read it and do not edit it (AC-20260912-11-15) | The same mechanism specs/20260912/05 and /06 gave the atlas and the review page; a layer with no artifact is how 54 specs drifted |
| D11 | **Doctrine reverses one paragraph.** `spec/doctrine/mocks.md` § Mocks: Page Notes' `**Two scopes, never an element.**` paragraph is REPLACED by `**Two scopes, and a note may mark an area.**` — screen+state or project as before, plus an optional `region` on a mock-scope note: the box as fractions of its smallest containing element with the covered children as the reflow fallback, drawn by the layer, never by the mock, and shown as `outdated` (never moved, never guessed) when it no longer resolves. `docs/adr/0020-a-note-can-mark-an-area.md` records the reversal (Applies to specs/20260902/10 D3's anchor clause and its Rationale sentence); specs/20260902/10 gains the `Amended by` backlink (AC-20260912-11-15) | The old rule's stated reason — "brittle across redraws" — is exactly what D1's `outdated` state answers: a lost anchor degrades visibly instead of pointing wrong. Reversing a recorded decision needs a record, not a quiet edit (docs/roadmap amendment rule) |
| D12 | Plugin bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: `--check` in the gate is the oracle]` | Version discipline from .claude/rules/spec-pipeline.md § Planning |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/notes-anchor.browser.js | CREATE | scripts | D1 pure `capture`/`resolve`; browser global + CommonJS export; header cites this spec |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D4 overlay host + boxes; D5 mark mode + draft; D6 card + undo toast + keys; D7 composer at the box; D8 strip badges, filter, footnotes, bar counter |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D2 `region` accepted by `addNote` (mock scope only), validated by `validateNotes`; new `replaceRegion(notes, id, region, by)` and `deleteNote(notes, id)` primitives with the D3 preconditions |
| spec/scripts/design-atlas.js | MODIFY | scripts | D3 `GET /__notes/anchor.js`, anchor tag injected before `notes.js`, `region` passthrough on add, `POST /__notes/region`, `POST /__notes/delete`, session-mount `POST /__notes/reopen` |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D9 region/badge/glyph/draft/card/seg/toast rules on the register, authored from design/chrome-mocks/notes.html |
| design/chrome-mocks/notes.html | CREATE | doctrine | D10 the approved prototype as the binding reference — landed by the planning session; workers leave it |
| spec/doctrine/design.md | MODIFY | doctrine | D10 § Design Canon plugin-chrome sentence names `design/chrome-mocks/notes.html` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D11 § Mocks: Page Notes paragraph replaced |
| docs/adr/0020-a-note-can-mark-an-area.md | CREATE | doctrine | D11 amendment ADR — Applies to specs/20260902/10 D3 anchor clause + Rationale sentence |
| specs/20260902/10-page-notes-review-loop.md | MODIFY | doctrine | D11 `Amended by: docs/adr/0020-a-note-can-mark-an-area.md` backlink under D3 |
| tests/mocks/notes-anchor.test.js | CREATE | tests | AC-20260912-11-1, -2, -3 — fake-DOM fixtures over the DOM interface `capture`/`resolve` read |
| tests/mocks/notes-region-store.test.js | CREATE | tests | AC-20260912-11-4, -5, -6, -7, -8, -9 — lib + served routes |
| tests/mocks/notes-layer-region.test.js | CREATE | tests | AC-20260912-11-10, -11, -13, -14 `[env: CHROME_BIN]` via tests/mocks/chrome-harness.js |
| tests/mocks/notes-region-doctrine.test.js | CREATE | tests | AC-20260912-11-15 — the doctrine/ADR/backlink/reference-file literals |
| tests/mocks/notes-layer-isolation.test.js | MODIFY | tests | AC-20260912-11-12 — the executed pin's host count becomes 3 (its static pin is untouched) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D12 bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |

Orchestrator duty (outside the table): `tests/mocks/notes-layer-navigation.test.js` builds a stub DOM; if the overlay's `window.addEventListener('resize', …)` throws on its `win` stub, add a no-op `addEventListener` to that stub in the same batch — a fixture repair, never a change to what it asserts.

## Contracts

```js
// notes.json — one mock-scope note, region optional (D2). Everything above `region` is today's shape.
{
  id: 'N007', scope: 'mock', screen: 'booking', state: 'default',
  text: 'These two clinics read the same.', by: 'JJ', at: '2026-09-12T…', status: 'open',
  addressed: null, reply: null, resolvedBy: null, resolvedAt: null, reason: 'wrong-words', origin: 'session',
  region: {
    drawnAt: { w: 1180 },                                  // integer px, the mock root's width at draw time
    anchor: { path: [4], tag: 'section', snippet: 'Riverside clinic Next slot today, 3:40 pm Northg' },
    //        path = child indices from the [data-screen-label] root; snippet = first 40 chars of textContent, whitespace-collapsed
    frac: { x: 0.34, y: 0.01, w: 0.66, h: 0.97 },          // the drawn box as fractions of anchor's rect; each in [0,1] (w,h > 0)
    layout: { arrangement: 'row', aspect: 3.42 },          // arrangement ∈ 'single'|'row'|'col'|'grid'; aspect = w/h of the anchor rect, > 0
    touched: [{ i: 1, snippet: 'Northgate clinic Next slot tomorrow, 9:10 am' }, { i: 2, snippet: 'Home visit Available Thursdays' }],
    //        direct children of anchor whose rect intersected the box, by index; may be empty
  },
}

// validateNotes (D2) — one error string per problem, same style as the existing ones:
//   'note "N007": region is allowed only on scope "mock" (field "region")'
//   'note "N007": region.anchor.path must be an array of non-negative integers (field "region.anchor.path")'
//   'note "N007": region.frac.{x,y,w,h} must be numbers in [0,1] with w,h > 0 (field "region.frac")'
//   'note "N007": region.layout.arrangement must be one of single|row|col|grid (field "region.layout.arrangement")'
//   'note "N007": region.touched must be an array of {i:integer>=0, snippet:string} (field "region.touched")'
//   'note "N007": region.drawnAt.w must be a positive integer (field "region.drawnAt.w")'
// addNote throws the same messages (minus the `note "…": ` prefix) — never stores a malformed region.

// mocks-notes.js additions (D3)
replaceRegion(notes, id, region, by) // → {notes, note}; throws 'no note with id', 'region can be re-placed only on an open or addressed note (status "resolved")', or a validation message
deleteNote(notes, id)                // → {notes}; throws 'no note with id', 'only an open plain note nobody has replied to can be deleted — withdraw it instead'

// notes-anchor.browser.js (D1) — DOM interface consumed: el.children, el.parentNode, el.textContent, el.tagName,
// el.getBoundingClientRect(), root.querySelectorAll('*'). Nothing else. Node tests feed fake objects.
NotesAnchor.capture(root, {x, y, w, h})            // box in root-relative px → region (above)
NotesAnchor.resolve(root, region)                  // → {mode:'exact'|'children', box:{x,y,w,h}} | null
// resolve rules, in order: path walks to an element else null; snippet (when non-empty) must equal else null;
// anchor rect area 0 → null; signature = arrangement(el) === region.layout.arrangement && (aspect/region.layout.aspect) in (0.75, 1.33)
// signature true, or touched empty → exact; else children whose index exists → union+4px pad; none exist → null.
// arrangement(el): <2 children → 'single'; all child tops within 4px → 'row'; all lefts within 4px → 'col'; else 'grid'.

// HTTP (D3), session mount; JSON in, JSON out
GET  /__notes/anchor.js                      → 200 text/javascript, the file verbatim
POST /__notes/add     {…, region?}           → 201 note | 400 {error}
POST /__notes/region  {id, region, by}       → 200 note | 400 {error} | 404 {error}
POST /__notes/delete  {id, by}               → 200 {deleted: id} | 400 {error} | 404 {error}
POST /__notes/reopen  {id, text, by}         → 200 note | 400 {error: 'a note is rejected only while addressed'} | 400 {error: 'say what is still wrong — text must be non-empty'} | 404
// injectNotesScript output order: <meta notes-scope> <script src=…/__notes/anchor.js> <script src=…/__notes/notes.js>
```

## UI

The binding artifact is `design/chrome-mocks/notes.html` (D10). This section states only what the
layer must reach, not how it looks.

- **Bar** (existing `.nl-bar`): counter `N open · M need you` with two colored dots; `Mark area` toggle
  (`.nl-btn`, `.nl-btn.on` while marking, text `Marking · Esc to stop`); `Show resolved`/`Hide resolved`;
  the author button. Hint `.nl-hint` once per browser.
- **Overlay** (new `.nl-host` sibling, `.nl-overlay`): `.nl-region[data-id][data-status]` boxes with
  `--c`; `.nl-region.sel` when its card is open, siblings at reduced opacity; `.nl-region[data-status="outdated"]`
  dashed; `.nl-region-badge` pill with `.nl-region-glyph.{open|addressed|resolved|outdated}` + id; boxes
  are focusable (`tabindex=0`), smaller boxes stack above larger ones. `.nl-draft` while dragging with a
  `.nl-draft-size` readout.
- **Card** (`.nl-card`, mounted inside the overlay host): header band (badge, reason chip, author);
  `.nl-card-outdated` notice when outdated; thread (`.nl-card-msg`, `.nl-card-me`);
  action row per D6; `.nl-card-menu` overflow opening upward; `.nl-card-why` reject reason block.
  Draft variant per D7 with `.nl-chips`. Empty states: a draft with an empty textarea keeps focus on
  Save. (The reply textarea and its empty-field focus rule were withdrawn at review close — no
  Contracts verb posts a reply; see Rationale.)
- **Strip** (existing `.nl-strip`): rows gain the badge and `data-status`; `.nl-seg` filter with four
  buttons `aria-pressed`; empty text `Nothing waiting on you here.` (Needs you) or `No notes on this
  state yet. Drag over anything to add one.`
- **Toast** (`.nl-toast`, fixed bottom-center): text + `Undo`; 5 s.
- **Phone** (< 640px): the bar wraps under the state row; the card is a bottom sheet.

## Data Model

`design/mocks/notes.json` rows gain the optional `region` object (Contracts). Existing rows are
unaffected: a note with no `region` is a screen+state note and renders as today. No migration.
Status enum unchanged; `outdated` is DERIVED in the browser from `resolve() === null`, never written.

## Behavior

- **Draw → save.** Mark area on → drag → release (≥ 12×12) → `capture` → card with draft → Save posts
  `/__notes/add` with `region` → `refresh()` → the box paints red with its id. Discard/Esc drops the
  draft; nothing is posted.
- **Repaint.** `render()` resolves every visible note's region against the mock root on each call;
  `resize` and state clicks call it. A note whose state is not the active one paints no box.
- **Outdated.** `resolve() === null` on a non-resolved note → no box, strip row `data-status="outdated"`,
  card shows the notice and offers `Re-place the box`: it enters mark mode with the note pending; the
  next completed drag posts `/__notes/region` for that note instead of opening a draft.
- **Accept / Reject / Resolve / Withdraw / Delete** per D6; each of these shows the toast first and
  posts on expiry; Undo cancels and re-renders. A server 4xx after the toast re-renders from
  `/__notes/list` and shows the server's `error` text in a second toast (no undo).
- **Keyboard.** `M` toggles marking (ignored while a textarea/input has focus); Esc: drag → card →
  mode; Tab reaches boxes in DOM order; Enter opens; `A`/`R` on a focused addressed box.
- **Questions and walk notes** never carry a region (their creators are the driver and the critic);
  their rows and controls are unchanged.
- **Client mount** (`/client/…`): unchanged in this spec — its `/__notes/add` ignores `region`
  (the field is dropped, never refused) so a client page built before specs/20260912/12 keeps working.

## Acceptance Criteria

- **AC-20260912-11-1**: WHEN `capture(root, box)` runs over a fake DOM where `root` holds a `section`
  (rect 0,0,1000,300) with three children at x = 0/340/680 (each 320 wide, 300 tall) and `box` =
  `{x:330,y:4,w:660,h:290}` THE SYSTEM SHALL return `anchor.path` = `[0]` (the section, the smallest
  containing element), `frac` = `{x:0.33,y:0.0133…,w:0.66,h:0.9666…}` (each within 1e-6),
  `layout.arrangement` = `'row'`, `layout.aspect` = `3.333…`, `touched` = indices `[1, 2]` with their
  snippets, and `drawnAt.w` = `1000` → writes tests/mocks/notes-anchor.test.js
- **AC-20260912-11-2**: WHEN `resolve(root, region)` runs with the AC-1 region against (a) the same fake
  DOM THE SYSTEM SHALL return `mode:'exact'` with `box` = `{x:330,y:4,w:660,h:290}` (each within 1e-6);
  and against (b) the same section reflowed to 360 wide with its children stacked at y = 0/310/620
  (each 360×300) THE SYSTEM SHALL return `mode:'children'` with `box` = `{x:-4,y:306,w:368,h:618}`
  (the union of children 1 and 2, padded 4) → writes tests/mocks/notes-anchor.test.js
- **AC-20260912-11-3**: WHEN `resolve` runs with a region whose `anchor.path` walks off the tree
  (`[0, 9]`), OR whose `anchor.snippet` differs from the found element's snippet, OR whose anchor
  element has a zero-area rect THE SYSTEM SHALL return `null` in each case → writes tests/mocks/notes-anchor.test.js
- **AC-20260912-11-4**: WHEN `addNote` receives a mock-scope body carrying the Contracts `region` THE
  SYSTEM SHALL store it verbatim on the note (deep-equal); WHEN the body is project-scope with a
  `region` THE SYSTEM SHALL throw a message containing `region is allowed only on scope "mock"`; WHEN
  `region.frac.w` is `0` THE SYSTEM SHALL throw a message containing `region.frac` → writes tests/mocks/notes-region-store.test.js
- **AC-20260912-11-5**: WHEN `validateNotes` runs over a note whose `region.anchor.path` is `"4"` (a
  string) THE SYSTEM SHALL report exactly one error naming `field "region.anchor.path"`; WHEN the note
  has no `region` THE SYSTEM SHALL report no error → writes tests/mocks/notes-region-store.test.js
- **AC-20260912-11-6**: WHEN a served mock page is fetched THE SYSTEM SHALL include
  `<script src="/__notes/anchor.js">` before `<script src="/__notes/notes.js">` in the body, `GET
  /__notes/anchor.js` SHALL answer 200 with the anchor file's bytes, and `POST /__notes/add` with a
  `region` SHALL answer 201 with the note carrying that region and write it to notes.json → writes tests/mocks/notes-region-store.test.js
- **AC-20260912-11-7**: WHEN `POST /__notes/region {id, region, by}` targets an open note THE SYSTEM
  SHALL answer 200, store the new region, and append a thread entry with `text` = `re-placed the box`
  and the given `by`; WHEN it targets a resolved note THE SYSTEM SHALL answer 400 with an `error`
  containing `re-placed only on an open or addressed note`; unknown id → 404 → writes tests/mocks/notes-region-store.test.js
- **AC-20260912-11-8**: WHEN `POST /__notes/delete {id}` targets an open plain note with an empty
  `thread` THE SYSTEM SHALL answer 200 `{deleted:id}` and the note is gone from notes.json; WHEN the
  note is `addressed`, or carries a `kind`, or has a non-empty `thread` THE SYSTEM SHALL answer 400 with
  an `error` containing `withdraw it instead` and change nothing → writes tests/mocks/notes-region-store.test.js
- **AC-20260912-11-9**: WHEN `POST /__notes/reopen {id, text:"still wrong", by}` on the session mount
  targets an `addressed` note THE SYSTEM SHALL answer 200 with `status` = `open` and the prior
  `addressed` object plus the text threaded (as `reopenNote` does for the client); WHEN `text` is
  empty THE SYSTEM SHALL answer 400 `say what is still wrong — text must be non-empty`; WHEN the note
  is `open` THE SYSTEM SHALL answer 400 `a note is rejected only while addressed` → writes tests/mocks/notes-region-store.test.js
- **AC-20260912-11-10** `[env: CHROME_BIN]`: WHEN a served mock (fixture: a root with a three-card row)
  is opened in headless Chrome, `Mark area` is clicked, and a pointer drag from (330,4) to (990,294)
  root-relative is dispatched THE SYSTEM SHALL open a `.nl-card` containing a focused textarea and a
  `Save note` button; and WHEN `Save note` is clicked with text `two cards` THE SYSTEM SHALL post
  `/__notes/add` whose stored note carries `region.touched` of length 2, and after refresh render a
  `.nl-region[data-status="open"]` whose `data-id` equals the new id → writes tests/mocks/notes-layer-region.test.js
- **AC-20260912-11-11** `[env: CHROME_BIN]`: WHEN notes.json holds (a) a region note on state
  `default` whose `anchor.path` no longer resolves and (b) a region note on state `error` THE SYSTEM
  SHALL, on the default state, render zero `.nl-region` for (a) and a strip row
  `[data-id=(a)][data-status="outdated"]` whose text contains `Outdated`, and zero `.nl-region` for (b);
  and after clicking the `error` state button SHALL render one `.nl-region` for (b) → writes tests/mocks/notes-layer-region.test.js
- **AC-20260912-11-12** `[env: CHROME_BIN]`: WHEN a served dark mock is rendered with and without the
  layer THE SYSTEM SHALL compute identical styles on every mock element and carry exactly three
  `.nl-host` elements (bar, strip, overlay) with `?clean` carrying zero → rewrites tests/mocks/notes-layer-isolation.test.js :: notes layer (executed,
- **AC-20260912-11-13** `[env: CHROME_BIN]`: WHEN the card of an `addressed` region note is opened and
  `Accept` is clicked THE SYSTEM SHALL show a `.nl-toast` with an `Undo` button and NOT post within 1 s;
  WHEN `Undo` is clicked THE SYSTEM SHALL leave notes.json unchanged and the box `data-status="addressed"`;
  WHEN instead the toast is left for 5.5 s THE SYSTEM SHALL have posted `/__notes/resolve` and the note
  reads `status:"resolved"` on disk → writes tests/mocks/notes-layer-region.test.js
- **AC-20260912-11-14** `[env: CHROME_BIN]`: WHEN `Reject` is clicked on an `addressed` note's card and
  `Send back` is clicked with the reason field empty THE SYSTEM SHALL post nothing and keep the field
  focused; WHEN the field holds `wrong clinic` THE SYSTEM SHALL post `/__notes/reopen` and the note
  reads `status:"open"` with `wrong clinic` in `thread` → writes tests/mocks/notes-layer-region.test.js
- **AC-20260912-11-15**: WHEN the tree is read THE SYSTEM SHALL have `spec/doctrine/mocks.md`
  containing `and a note may mark an area` and NOT containing `never an element`; `spec/doctrine/design.md`
  containing `design/chrome-mocks/notes.html`; `docs/adr/0020-a-note-can-mark-an-area.md` existing with
  `Applies to: specs/20260902/10-page-notes-review-loop.md`; `specs/20260902/10-page-notes-review-loop.md`
  containing `Amended by: docs/adr/0020-a-note-can-mark-an-area.md`; and `design/chrome-mocks/notes.html`
  existing and containing `nl-region` → writes tests/mocks/notes-region-doctrine.test.js

## Assumptions (escalation triggers)

- A1: `validateNotes` does not whitelist fields — executed 2026-09-12:
  `validateNotes([{…valid, region:{path:[1]}}])` → `{"errors":[]}`. So D2's validation is additive
  and no existing note fails it. **if false:** STOP, the store rejects existing ledgers.
- A2: `addNote` DROPS an unknown `region` today (negative claim) — executed 2026-09-12:
  `"region" in addNote([], {…, region:{…}}).note` → `false`. D2's copy-on-present is therefore a real
  change, and AC-4 goes red on the pre-image. **if false:** the AC still holds; note it.
- A3: The hybrid anchor resolves as D1 states in Chromium — executed 2026-09-12 in the prototype
  (`design/chrome-mocks/notes.html`, Playwright Chromium 1400×1000 → 390 wide): two-card box
  `children 356×424`, headline box `exact` at desktop and `children` on the phone after the aspect
  check, moved-path box `null`. **if false:** STOP, ask the user — the anchor rule is the product.
- A4: `color-mix()` and `pointer-events` on a shadow-hosted overlay behave in the harness's headless
  Chrome as they did in Playwright's Chromium (same engine family, 2026 builds). **if false:** the
  tint falls back to a pre-mixed `rgba` per status inside viewer.css; the pointer rules have no fallback — STOP.
- A5: `reopenNote` needs no change to serve the session mount (it mutates only; the route validates).
  **if false:** extend it behind the same preconditions; never a second reopen implementation.
- A6: The isolation test's static pin (`notes layer:` prefix) still passes with a third `.nl-host` and
  the `hostStyle` rule unchanged; its executed pin asserts `hosts === 2` today (read at lock) and is
  rewritten to 3 by AC-12. **if false:** the overlay host is mis-mounted — fix the layer, never
  the pin.
- A7: `.claude/worktrees/*` copies of `spec/doctrine/mocks.md` and specs/20260902/10 still carry
  `never an element` — stale pipeline worktrees, not live surfaces; the collision sweep's hits there
  are waived. **if false** (a worktree is live): it re-syncs from main on its own merge-back.

## Rationale

The owner asked for rectangles, not element pins — "sometimes the area is not a single element" —
and for the same mark to land on the same content on a phone. Those two asks conflict under every
naive scheme: a pixel box drawn at desktop lands nowhere on a phone; a list of covered elements
cannot express half a block; a single selector orphans on the first markup edit. The scheme in D1 is
the one the prototype proved: the rectangle is the truth, the smallest containing element is the
ruler, fractions give the exact shape wherever the layout is unchanged, and the covered children give
a tight outline wherever it reflowed. Where even that fails, the note says `outdated` and offers
re-place; it never floats to a wrong spot, which is the failure the old "never an element" rule was
written against (docs/adr/0020).

Two alternatives were rejected. Plain drag with no mode: it must arbitrate with the mock's own scroll
and text selection on every host mock, and the owner approved the toggle. A server-side undo: the
5-second deferred POST gives the same experience with no new state and no new route.

Scope was cut on purpose. The driver's re-anchor at `notes address` (the moment the session's own
edit most often breaks an anchor), the review page's rows, the client pages, touch drawing and the
atlas badges are specs/20260912/12 — this spec leaves the system green with a complete mock-page loop
and an honest `outdated` state in the meantime.

Fragile: the anchor's `snippet` equality is strict — a one-character copy edit on the anchor element
flips a box to outdated. That is the conservative side (visible, re-placeable) and specs/20260912/12's
re-anchor is the fix at the source. The Chrome-gated tests skip without `CHROME_BIN` per § Test Rules;
the anchor module's Node tests over a fake DOM never skip.

**Deviations folded at close (2026-09-12).** Five departures, all one-offs — none recurring-shaped
enough to earn a Gotchas line, and two of them are recurrences of classes § Gotchas already records:

- **The ADR took number 0020, not the 0019 D11 locked.** A concurrent session (specs/20260912/07)
  landed 0019 first. Took the next free number and amended all six mentions in the same build. A
  recurrence of the ADR-filename race § Gotchas already carries; no new entry.
- **D6's reply field never had a route, and was withdrawn rather than given one.** The Contracts
  HTTP block names exactly add/region/delete/reopen/resolve/answer, and D3's rationale names
  re-place, delete and reject-with-reason as the three routeless controls a card needs. The build
  shipped a Reply control that cleared the textarea and posted nothing; review found it, and the
  disposer's binding closure was removal, not a fourth verb — that belongs to an amendment or to
  specs/20260912/12. D6 and the UI section are amended above to match what shipped. The underlying
  class — a Decision naming a control whose route no Contract carries — is the by-ID-never-by-clause
  hole § Gotchas already records against `promise-sweep`.
- **The approved prototype and this spec disagreed on class names.** `design/chrome-mocks/notes.html`
  landed spelling its overlay classes `.nl-box` / `.nl-badge` / `.g`, while D9, the UI section, the
  Contracts block and AC-20260912-11-15 all pin `.nl-region` / `.nl-region-badge` /
  `.nl-region-glyph` — a lock-time self-contradiction no leg could see, since each half is
  individually satisfiable. The doctrine worker correctly refused to edit the reference (D10 tells
  workers to leave it) and returned blocked. Resolved by the orchestrator renaming the three classes
  in the prototype and proving the file byte-identical modulo those names, so nothing approved by eye
  changed. Loosening the AC was rejected: it would leave the binding reference permanently
  mis-naming the feature it exists to bind. At lock, diff a design source's own class names against
  the spec that cites it.
- **Six render defects survived a green 1,148-test suite.** Every card control and the undo toast
  were unreachable by a real pointer (the overlay host's `pointer-events:none` was overridden for
  boxes only); the id pill painted transparent outside a box; the host was `position:fixed` against
  D4's locked `absolute`, so boxes drifted by the scroll offset on any mock taller than the viewport;
  the card never became a bottom sheet under 640px because inline positioning beat the media rule;
  and two D8 strip clauses were never built. The tests missed all of them because they drive controls
  with `element.click()`, which bypasses hit-testing. This is the § Gotchas entry about a
  client-facing page's defects living in the render, recurring on a new surface — the fix pass and
  the fix-delta review both verified with real CDP pointer input, a scrolled 3,088px page and a
  390px render instead.
- **Test expiry removed this spec's four new test files at close** (18 cases), per the opt-in pin
  policy. The layer's fixed defects therefore carry no regression pin; queued.

## Canonical Delta

No `docs/canonical/design-mocks.md` exists in this repo. The doctrine paragraph in D11 and the ADR
are the canonical record.
