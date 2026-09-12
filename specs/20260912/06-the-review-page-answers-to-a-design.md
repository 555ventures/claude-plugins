---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/review.html
breaking: false
depends_on: [specs/20260912/05-the-atlas-answers-to-a-design.md]
depended_on_by: [specs/20260912/07-a-whole-product-note-blocks-the-sign-off.md]
brief: n/a
build_base: main
spiked: 2026-09-12
open_markers: 0
---

# The review page answers to a design, and the page's own promises are pinned again

## Goal

The per-journey review page — the surface an owner actually reviews a product on — carries
**zero executing tests** in this tree. `tests/mocks/review-page.test.js` was deleted whole by the
2026-09-11 expiry sweep when specs/20260906/04 closed, and the vm harness written for
`review.browser.js` was orphaned in `tests/design-atlas.test.js` rather than deleted with it. On
2026-09-12 a full day of UI work landed on that page and `npm test` stayed green at 1112 passing,
because nothing on the page could go red. This spec closes that hole three ways: the page gains a
binding design artifact so a future edit answers to something; the behaviours the reviewer depends
on are pinned by tests that **outlive this spec's close**; and the one real divergence the day left
behind — the rail's "Whole project" count rendered as `0` by the server and silently repaired by the
browser — is fixed at the source. Done means: `design/chrome-mocks/review.html` exists and is cited,
the orphaned harness is a real helper with real tests on it, and specs/20260906/04's two contradicted
promises carry an amendment record instead of standing as text the code disagrees with.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design/chrome-mocks/review.html` is CREATED as a reference-only artifact, sibling in kind to `design/client-mocks/*.html` (specs/20260911/06 D18): a single static HTML file, never served and never shipped to a host, carrying the review page's chrome at the look the owner approved on 2026-09-12 — header bar, rail with the Screens list and the `Whole project` row, one artboard caption + state-tab row, the inspector's filter row, scope band, one open note row, one addressed note row with its two controls, and the composer. It is authored **from the shipped page**, with the Hearwell data replaced by the fixture names this spec's tests use (`j1`, screens `a`/`b`) — a faithful static of what was approved, never a re-design `[no-ac: a reference file, pinned by the AC-20260912-06-1..-4 renders that cite it]` | design.md § Design Canon already rules that plugin chrome is a designed surface, and 54 specs edited these pages with nothing to answer to. The client-mocks precedent is the only one in the repo that worked. **Authored from the build on purpose**: mock authority inverts at `built` (design.md § Design Canon), so a Fable re-authoring here would make an owner-approved page "wrong" against its own source on day one |
| D2 | This spec's frontmatter carries `design_source: design/chrome-mocks/review.html` and `design: false`, exactly as specs/20260912/01 and /02 do for the client mocks. The doctrine sentence that makes that citation binding is written by specs/20260912/05 D2, which this spec depends on; nothing about § Design Canon is edited here (AC-20260912-06-7) | This host declares no `design` block, so the design stage never runs here and `design_source` is the whole binding mechanism. One doctrine sentence names both chrome artifacts, so it is edited once, in the spec that lands first — two specs rewriting one paragraph is the collision the decomposition cap exists to prevent |
| D3 | `renderRail`'s project count is derived, not looked up in a map that can never hold it. `buildReviewPage` counts open project-scope items directly (`items.filter((n) => n.scope === 'project' && isOpen(n)).length`) and passes that as `projectOpen`; the `openByLabel.get(null)` lookup is deleted. The rendered `data-screen="__project"` count, and its `data-zero` presence, SHALL equal what `review.browser.js`'s `recount()` computes for the same items (AC-20260912-06-2) | Executed 2026-09-12: with one open note on `a` and two open project notes, the header renders `3 open items block approval` while the rail's project row renders `0`. `openByLabel` skips every non-`mock` note by construction, so the lookup is dead in every case. The browser repairs it on load, which is why nobody saw it — and which is exactly why a capture, a `?clean` render, or any server-side assertion reads the wrong number |
| D4 | The scope band states its scope in the DOM, not in CSS generated content. `viewer.css`'s `.rv-screenfilter::before { content: "Notes for"; … }` rule is deleted; `renderInspector` emits `<span class="rv-scopeband-label">Notes for</span>` inside `.rv-scopeband`, before the chip, and `review.browser.js`'s `setText(chip, name)` writes only the screen name. The label is hidden with the chip when no scope is set (AC-20260912-06-3) | A `::before` string is not in the accessibility tree, is not assertable from the served bytes, and is the reason the label ran into the screen name until a margin was added. The one rule that made this page's scope statement untestable |
| D5 | `parseFlatDom` moves out of `tests/design-atlas.test.js` into `tests/helpers.js` as an exported helper, unchanged except for one addition: `matchesCompound` also matches a bare `.class` compound (today only `[class="…"]` matches — verified by spike). The orphaned helpers the 2026-09-11 sweep left behind in `tests/design-atlas.test.js` are DELETED in the same row: `makeNotesLayerDom`, `evalNotesLayer`, `writeReviewSeed`, `writePicksJson`, `hashTree`, `loadShellRegion`, `writeKitFile`, `writeKitMock`, `kitCanonHtml`, `cssRuleBody`. Each is verified to have exactly one occurrence (its own definition) before deletion; `assertChromeTokenized` and `loadDesignAtlas` STAY — they have live callers (AC-20260912-06-6) | The harness the review page needs already exists and already parses today's markup (spike below); rewriting it would be inventing a second one. The sweep deleted `test()` bodies and left their scaffolding, so ten dead helpers sit in the one file a future author would copy from — deleting them at touch-time is core § Doctrine Authoring, not a sweep |
| D6 | Every criterion this spec writes except AC-20260912-06-6 and -7 is an opt-in `SHALL CONTINUE TO` pin, so its test survives expiry at close (specs/20260911/03). The pinned set is the page's load-bearing contract: the served route and its `?clean` arm, the rail/header count agreement, the scope band, the addressed-note controls, the breadcrumb link home, and the state-tab row for a many-state screen | specs/20260906/04's tests were not pinned and are gone; writing this spec's tests unpinned would put the page back to zero coverage the day it closes, which is the failure this spec exists to end. Pinned deliberately narrow — the skin is the design source's job, never a CSS literal in a test (the 7.89.0 mistake) |
| D7 | `docs/adr/0017-the-review-page-departs-from-its-spec.md` is CREATED, `Applies to:` **specs/20260906/04-journey-review-page.md** — two clauses and no others: (a) D5's breadcrumb literal `<product> / Mocks / <n> · <journey title>` becomes `<product> / <n> · <journey title>`, the product name a link to the atlas index; (b) AC-20260906-04-6's final clause — `Send` with scope `Whole project` posting `{scope:"project", screen:null …}` from this page's composer — is retired: the review composer always files against the focused screen, and a project-scope note is raised from the notes layer's own composer, which keeps its toggle (specs/20260906/03 D5, unchanged and verified intact). specs/20260906/04 gains one `Amended by: ADR-0017` line and is not rewritten `[no-ac: an accepted record plus its backlink — prose the review stage's citations-check reads; no script in this repo adjudicates ADR shape, by the standing "ADR Applies-to integrity: watch, not work" ruling (0/41 dangling measured 2026-09-08; build the checker at dangling-reference:3)]` | Both promises are shipped text the code now contradicts, and AC-20260906-04-6's test expired, so nothing is red and nothing would ever say so. ADR-0015 is the model: the locked spec gains a backlink, the record carries the account |
| D9 | **Five controls on this page are silently unstyled and get their register back.** `.rv button` is `(0,1,1)`; a bare `.rv-badge` / `.rv-addnote` / `.rv-fold` / `.rv-keyhint` / `.rv-strip` is `(0,1,0)`, so the generic rule wins every property they share — background, colour, padding, border, border-radius — whatever the source order. Each of the five gains the `.rv ` ancestor prefix that `.rv .rv-chipbtn` already carries for exactly this reason. In the same row and at the same touch: the duplicate second `.rv-tabs button:hover` declaration is deleted, `.rv-count[data-zero]` and `.rv-badge[data-zero]` are reconciled to one `border-color` (both `transparent` — the muted, retreating treatment the zero state is for), and the file-header comment's reference to `tests/mocks/viewer-tokens.test.js`, which exists nowhere in this tree, is corrected to name the live pin (AC-20260912-06-9) | The same defect class as the `.rv-chipbtn` bug found by looking on 2026-09-12, found five more times by measurement. Every one of them means the chrome mock cannot be honoured: the file says a badge is a warn-tinted pill and the browser paints a plain bordered button. A design source that the stylesheet silently overrides is not binding |
| D10 | **The composer's vestigial scope machinery is deleted.** `renderComposer` emits no `[data-rv="scope"]` (verified: zero occurrences), so `scopeMode` is permanently `'screen'`, its ternary at `send()` has one reachable arm, and the `[data-rv="scope"]` click wiring binds nothing. `setScope(mode, label)` becomes `setScopeLabel(label)`, `scopeMode` and the wiring go, and `viewer.css` loses `.rv-scope`, `.rv-scope button`, `.rv-scope button:first-child`, `.rv-scope button:nth-child(2)`, `.rv-scope .rv-scope-on` and the `:not(.rv-scope-on)` clause of the hover guard. Behavior is unchanged: a note still files against the focused screen (AC-20260912-06-10) | .claude memory rule "refactors delete the code and tests they retire". The 2026-09-12 session removed the toggle from the markup and left its state machine, its CSS and its event wiring behind — the shape that makes a later reader restore a control the page deliberately does not have |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: plugin-bump.js --check is the oracle]` | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| design/chrome-mocks/review.html | CREATE | doctrine | D1: the approved review-page chrome as a static reference file, fixture names, never served |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D3: project open count derived and passed to `renderRail`, dead `openByLabel.get(null)` lookup deleted; D4: `.rv-scopeband-label` emitted in `renderInspector` |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D4: `setText(chip, …)` writes the screen name only, the label hides and shows with it; D10: `scopeMode` and the `[data-rv="scope"]` wiring deleted, `setScope` becomes `setScopeLabel` |
| spec/templates/mocks/viewer.css | MODIFY | scripts | D4: `.rv-screenfilter::before` deleted, `.rv-scopeband-label` styled in its place; D9: five `.rv ` prefixes, duplicate hover line, `[data-zero]` reconciled, header reference corrected; D10: the `.rv-scope*` rules deleted |
| docs/adr/0017-the-review-page-departs-from-its-spec.md | CREATE | doctrine | D7: the amendment record, two Applies-to clauses |
| specs/20260906/04-journey-review-page.md | MODIFY | doctrine | D7: one `Amended by: ADR-0017` line, no rewrite |
| tests/helpers.js | MODIFY | tests | D5: `parseFlatDom` exported, bare `.class` compound supported |
| tests/design-atlas.test.js | MODIFY | tests | D5: the ten orphaned helpers deleted; `assertChromeTokenized` and `loadDesignAtlas` kept |
| tests/mocks/review-page.test.js | CREATE | tests | AC-20260912-06-1, -2, -3, -4, -5 |
| tests/mocks/review-browser.test.js | CREATE | tests | AC-20260912-06-6, -10, -11 |
| tests/mocks/review-chrome.test.js | CREATE | tests | AC-20260912-06-9 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 bump |

Orchestrator duty outside the table: before deleting each helper named in D5, run
`grep -c '<name>' tests/design-atlas.test.js` and confirm the count is `1` (its own definition). A
count above 1 means the sweep left a live caller — that helper stays and the deviation is recorded.

## Contracts

`tests/helpers.js` gains one export; nothing else in its surface changes.

```js
// parseFlatDom(html) -> { document, allNodes }
// A jsdom-free flat DOM over served chrome markup. Nodes expose: tagName, dataset,
// getAttribute/setAttribute/removeAttribute/hasAttribute, hidden (backed by the attribute),
// classList (add/remove/toggle/contains), textContent, addEventListener, closest,
// querySelector/querySelectorAll (compound selectors, descendant combinators only).
// No innerHTML parsing, no getBoundingClientRect, no MutationObserver — the same discipline
// review.browser.js's own header declares.
module.exports = { ROOT, SPEC, read, tmpdir, runNode, runBash, gitRepo, parseFlatDom }
```

## UI

The binding artifact is `design/chrome-mocks/review.html` (D1). This section states only what that
file must contain for the tests below to have something to assert against, and nothing about how it
looks — the file is the look.

- **Scope band** — one row, fixed height, inside the inspector between the filter row and the note
  rows. Contents in order: the words `Notes for`, then the screen name. When nothing is scoped, the
  whole row's contents are hidden and the row's height does not change.
- **Addressed note row** — a note whose status is `addressed` carries a two-button group:
  `Looks good` and `Still not right`. A note still waiting for the session carries no group.
- **Breadcrumb** — the product name, a link to the atlas index at `<prefix>/`, then the journey's
  number and title. No intermediate segment.
- **Rail** — the journeys list, the screens list with per-screen open counts, and, whenever the
  journey carries any project-scope item, a `Whole project` row carrying the open count of the items
  that belong to no screen.

**Three ways for every control this spec touches** (.claude/rules/spec-pipeline.md § Planning):

| Control | Sentence on success | Path back | Farthest artifact |
|---|---|---|---|
| `Looks good` on an addressed note (`[data-rv="accept"]`, rendered by `review-page.js`, posted by `review.browser.js` to `/__notes/resolve`) | the row leaves the Open filter and the header's open count drops by one | `Still not right` on the same row under the `All` filter, which POSTs `/__notes/reopen` | `design/mocks/notes.json` — the note's `status` becomes `resolved` |
| `Still not right` (`[data-rv="reopen"]` → `/__notes/reopen`) | the row returns to the Open filter and the count rises by one | `Looks good` on the same row | the same store row, `status` back to `open` |
| The breadcrumb product name (`a.rv-home`, rendered by `review-page.js`) | the atlas index for this product is on screen | the atlas card for any screen of this journey links back to `#board-<label>` on this page | none — navigation only |

## Behavior

`recount()` in `review.browser.js` already buckets an item with no `data-label` under `__project`
and repairs every rail count on load. D3 does not change it; it makes the server agree with it, so
that the first paint, a `?clean` render and a plugin-owned capture all carry the same numbers the
reviewer sees a moment later.

## Acceptance Criteria

- **AC-20260912-06-1**: WHEN `buildReviewPage` runs over a fixture declaring journey `j1` with
  screens `a` (states `empty`) and `b`, one open mock note on `a`, one `addressed` mock note on `b`
  whose `addressed.change` is `did it`, and one open project note THE SYSTEM SHALL CONTINUE TO
  return HTML in which exactly one `[data-rv="row"]` carries `[data-rv="note-actions"]` — the
  addressed one — holding exactly two buttons whose text is `Looks good` (`data-rv="accept"`) and
  `Still not right` (`data-rv="reopen"`), and the open row SHALL CONTINUE TO carry none
  → writes tests/mocks/review-page.test.js
- **AC-20260912-06-2**: WHEN that same fixture renders THE SYSTEM SHALL CONTINUE TO emit a rail row
  `[data-rv="count"][data-screen="__project"]` whose text is `1` and which carries no `data-zero`,
  and the header's approve-block title SHALL CONTINUE TO name the same total it counts (`2 open
  items block approval`); WHEN the fixture's project notes are both `resolved` THE SYSTEM SHALL
  CONTINUE TO emit that row with text `0` and `data-zero` present
  → writes tests/mocks/review-page.test.js
- **AC-20260912-06-3**: WHEN that same fixture renders THE SYSTEM SHALL CONTINUE TO emit inside
  `.rv-scopeband` an element carrying the literal text `Notes for` as DOM text, and
  `spec/templates/mocks/viewer.css` SHALL CONTINUE TO contain no `content: "Notes for"` declaration
  → writes tests/mocks/review-page.test.js
- **AC-20260912-06-4**: WHEN that same fixture renders with `prefix` `''` THE SYSTEM SHALL CONTINUE
  TO emit exactly one `a.rv-home` whose `href` is `/` and whose text is the seed's `product`, and
  the breadcrumb SHALL CONTINUE TO contain no `Mocks` segment
  → writes tests/mocks/review-page.test.js
- **AC-20260912-06-5**: WHEN screen `a` declares fourteen `data-state-btn` states THE SYSTEM SHALL
  CONTINUE TO render fifteen tabs (`happy` plus each declared state) inside one
  `[role="tablist"]`, each with its own iframe `src`, and `spec/templates/mocks/viewer.css`'s
  `.rv-tabs` rule SHALL CONTINUE TO declare `flex-wrap: wrap` and no `overflow: hidden`
  → writes tests/mocks/review-page.test.js
- **AC-20260912-06-6**: WHEN `review.browser.js` runs under `vm` over the AC-1 markup parsed by
  `tests/helpers.js`'s `parseFlatDom`, with a stubbed `fetch`, a `localStorage` holding the reviewer
  name, and a fake `IntersectionObserver` whose callback the test fires with screen `b` at ratio
  `1` THE SYSTEM SHALL move `data-focus` to `b`'s board and narrow the inspector to `b`'s rows
  (`a`'s row `hidden`); clicking `[data-rv="accept"]` SHALL issue `POST /__notes/resolve` with
  `{id, by}`; `grep -c` for each of `makeNotesLayerDom`, `evalNotesLayer`, `writeReviewSeed`,
  `writePicksJson`, `hashTree`, `loadShellRegion`, `writeKitFile`, `writeKitMock`, `kitCanonHtml`,
  `cssRuleBody` in `tests/design-atlas.test.js` SHALL return `0`
  → writes tests/mocks/review-browser.test.js
- **AC-20260912-06-7**: WHEN this spec's own frontmatter is read THE SYSTEM SHALL find
  `design_source: design/chrome-mocks/review.html`, and that file SHALL exist and contain the
  literals `data-rv="board"`, `data-screen="__project"` and `Looks good`
  → writes tests/mocks/review-page.test.js
- **AC-20260912-06-9** `[env: CHROME_BIN]`: WHEN the served review page for the AC-1 fixture is
  opened in headless Chrome THE SYSTEM SHALL CONTINUE TO report, for the screen badge
  (`.rv-badge` with a non-zero count), a computed `color` equal to the page's `--v-warn` role and a
  computed `background-color` that is not the page's `--v-bg`; and for `.rv-strip`, a computed
  `border-radius` of `0px` and a computed `border-left-width` of `1px`
  → writes tests/mocks/review-chrome.test.js
- **AC-20260912-06-10**: WHEN `spec/scripts/lib/review.browser.js` and
  `spec/templates/mocks/viewer.css` are read THE SYSTEM SHALL contain zero occurrences of
  `scopeMode`, `data-rv="scope"`, `.rv-scope` and `rv-scope-on`
  → writes tests/mocks/review-browser.test.js
- **AC-20260912-06-11**: WHEN `review.browser.js` runs under `vm` over the AC-1 markup with screen
  `b` focused and `Send` pressed with the text `hi` THE SYSTEM SHALL CONTINUE TO issue
  `POST /__notes/add` with `screen` `"b"` and `scope` `"mock"`
  → writes tests/mocks/review-browser.test.js

## Assumptions (escalation triggers)

- **A1**: `tests/design-atlas.test.js`'s orphaned `parseFlatDom` parses today's review-page markup
  and exposes what a test needs. **Executed 2026-09-12** (`node scratchpad/spike2.js`): lifted the
  shim into a `vm` context, ran `buildReviewPage` over the D1 fixture, and observed
  `rows parsed: 3 n1,n2,n3` · `boards: 2` · `note-actions: 1` · `a[class="rv-home"]: 1` ·
  `approve disabled attr: ''` · `classList support: object` · `dataset support: object` ·
  `hidden support: true`. One gap found and folded into D5: a bare `.rv-home` compound returns
  nothing, only `[class="rv-home"]` matches. **if false:** the shim is written fresh in
  `tests/helpers.js` against `review.browser.js`'s own header contract, same File Plan row.
- **A2**: The rail's project count is `0` for every non-empty project-note set. **Executed
  2026-09-12** (`node scratchpad/spike1.js`): one open note on `a` plus two open project notes
  rendered `PROJECT ROW: … data-zero>0<` against `BLOCK TITLE: 3 open items block approval`.
  **if false:** D3 becomes a no-op and AC-2 is re-pinned against whatever the server does emit.
- **A3**: Nothing in the tree tests the review page today, so no test needs rewriting. **Verified by
  grep**: `grep -rln 'buildReviewPage\|data-rv=' tests/` returns nothing. **if false:** every AC's
  disposition changes from `writes` to `rewrites` and the pre-image is read first.
- **A4**: specs/20260906/03 D5's notes-layer scope toggle is intact and is NOT touched by this spec.
  **Verified by reading** `notes-layer.browser.js` (`allowProjectToggle`, the `Whole project`
  button). **if false:** ADR-0017 gains a third Applies-to clause for that spec.
- **A6**: The five bare `.rv-*` utilities lose to `.rv button` by specificity arithmetic, not by
  source order — `(0,1,1)` beats `(0,1,0)` whichever comes last. **Verified by reading** the six
  declarations together (`viewer.css` `.rv button` and the five). The honest oracle is a rendered
  one, which is why AC-9 is a Chrome criterion rather than a selector-text assertion. **if false**
  (no Chrome anywhere the suite runs): AC-9 is dropped and D9 lands with the deletions only, the gap
  recorded in Rationale.
- **A7**: `renderComposer` emits no `[data-rv="scope"]`, so D10 removes no reachable behavior.
  **Verified by grep**: `grep -c 'data-rv="scope"' spec/scripts/lib/review-page.js` returns `0`.
  **if false:** D10 is dropped whole and the scope toggle is specified instead.

## Rationale

**Why this is not a "cosmetic" spec.** The 2026-09-12 session began as a reskin and ended having
found seven live defects, two of which could file a note against the wrong screen or show a number
that could not be reconciled with any other number on the page. It stayed green throughout. The
lesson is not that the changes were bad — they were verified by measurement against a live server —
it is that the page had no way to disagree with anyone. Tests and a design source are the two ways
it can.

**Why the mock is authored from the build, not before it.** design.md § Design Canon: mock authority
expires at `built`. The owner approved this page by looking at the running thing on 2026-09-12; the
artifact that preserves that approval is a faithful static of what was on screen. A fresh design
pass here would produce a file the approved build contradicts on day one, which is the opposite of
binding. The same rule is why D1 says "never served": a second copy of the page that could drift is
worse than none.

**Why the pins are narrow.** specs/20260907/09's 7.89.0 work pinned `.shot{max-height:var(--v-shot-max,260px)}`
as a CSS literal, and that literal is now the reason the atlas's real card height has to be set on a
different selector. A test that pins a number the design owns makes the design unable to change. The
pins here are all behavioural — a count agreeing with another count, a control existing on the row
that needs it, a link resolving somewhere — and the one CSS assertion (AC-5's `flex-wrap`) pins the
absence of clipping, which is a behaviour a fourteen-state screen depends on, not a look.

**Why a CSS specificity bug is a correctness bug here.** The whole point of D1's artifact is that
the page can be held to a file. A stylesheet in which `.rv button` quietly outranks five of the
page's own utility classes means the file and the page disagree by construction, and no amount of
looking at the mock will reconcile them. The one instance found by eye on 2026-09-12 was found
because a selected control went invisible; the other five were found by measuring, and produce no
symptom dramatic enough to notice — which is exactly why they survived.

**What this spec deliberately does not do.** It does not touch the approve gate's rule (specs/20260912/07),
it does not touch the atlas (specs/20260912/05), and it writes no test for the skin items in the
2026-09-12 inventory (A1, A2, B8, B18–B21, C28) — those are what the design source is for. Two findings from the same audit are deliberately left
to the queue rather than folded in: the identical specificity defect on the client player's
`.wk-home` and `.wk-more` (that surface binds to `design/client-mocks/*.html` and is a different
owner's look), and `viewer.css`'s `.v-*` primitive register, which has zero consumers anywhere in
the repo but is a locked promise of specs/20260902/09 D4 and so needs its own amendment.

## Canonical Delta

`docs/canonical/design.md` § The mocks command: append "Plugin chrome binds to a file: the atlas
index and the journey review page answer to `design/chrome-mocks/atlas.html` and
`design/chrome-mocks/review.html`, cited as `design_source` by any spec that edits them
(specs/20260912/05, /06). The review page's rail carries a `Whole project` row for the items that
belong to no screen, and the server renders the same counts the page re-derives on load."
