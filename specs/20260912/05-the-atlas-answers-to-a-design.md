---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/atlas.html
breaking: false
depends_on: []
depended_on_by: [specs/20260912/06-the-review-page-answers-to-a-design.md]
brief: n/a
build_base: main
open_markers: 0
---

# The atlas answers to a design, and a screen appears on it once

## Goal

The design atlas — the page that shows a whole product's screens at a glance — has never had a
design source. Fifty-four specs have edited it and not one carried a `design_source`, so every
change to it has been an opinion with nothing to answer to, and on 2026-09-12 that finally produced
a page the owner called unusable. The same day's repair changed a promise no test was watching: the
atlas used to stack one full-size frame per declared state, which made a nine-state screen nine
screens tall, and it now renders one frame per screen with the state count in the card's meta line.
specs/20260902/07 D15 still promises the old shape. Done means: the atlas binds to
`design/chrome-mocks/atlas.html`, the doctrine sentence that calls plugin chrome "a designed
surface" names the artifacts it binds to, the frame-per-screen rule and the two navigation
behaviours the repair introduced are tested, and the contradicted promise carries an amendment
record instead of standing as text the code disagrees with.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design/chrome-mocks/atlas.html` is CREATED as a reference-only artifact, sibling in kind to `design/client-mocks/*.html` (specs/20260911/06 D18): one static HTML file, never served and never shipped to a host, carrying the atlas at the look the owner approved on 2026-09-12 — the header, the filter chips, the left rail, one journey section with three mock cards (one card showing the `· N states` meta line, one an orphan, one a gap chip), and the stops index. It is authored **from the shipped page** with fixture names in place of Hearwell's `[no-ac: a reference file, pinned by the AC-20260912-05-6 render that cites it]` | design.md § Design Canon already rules that plugin chrome is a designed surface; the rule has had no artifact for six days and 54 specs. Authored from the build because mock authority inverts at `built` (design.md § Design Canon) — a fresh design pass would make an owner-approved page wrong against its own source on day one |
| D2 | `spec/doctrine/design.md` § Design Canon's **"Plugin chrome is a designed surface"** sentence gains one clause naming the artifacts: "— the atlas index binds to `design/chrome-mocks/atlas.html` and the journey review page to `design/chrome-mocks/review.html`; a spec that edits either cites it as `design_source`." This spec and specs/20260912/06 each carry the matching frontmatter (AC-20260912-05-6) | A doctrine sentence with no named artifact is exactly the state that produced this problem. One home, one clause, both surfaces — the review page's own artifact lands in specs/20260912/06, which depends on this spec for the sentence |
| D3 | **One frame per screen, never one per state.** A mock card renders exactly one `<iframe>` regardless of how many `data-state-btn` states the mock declares, and the card's meta line carries `<n> states` when `n > 0` and omits the clause when the mock declares none. The per-state frames are not restored under any flag (AC-20260912-05-1) | The pre-2026-09-12 atlas stacked one full-size copy of the same document per state: nine states made one grid row nine screens tall and the page 9,945px. A card is a recognition surface — which screen is this, does it exist, what shape is it — and the state count answers "how many states" without paying nine screen-heights for it. The states themselves are reviewable one click away, on the journey review page, where each has its own tab |
| D4 | A mock card owned by a journey wraps its frame in `<a class="shotlink" href="/review/<journey>.html#board-<label>">`, and the lightbox binding skips any `.shot` inside a `.shotlink` (`if(!s.closest("a.shotlink"))`). Mocks with no declaring journey — shapes, compare candidates — keep the lightbox and get no link (AC-20260912-05-2) | The card's job is recognition; the decision about a screen is made on the review page. A lightbox that showed the same static frame bigger was a dead end the owner had to back out of, and the journey page was reachable only by guessing its URL |
| D5 | `?clean` suppresses the mock's own state switcher and nothing else: `CLEAN_STYLE` is `<style>[data-state-btn]{display:none!important}[data-contract="none"]:has(>[data-state-btn]){display:none!important}</style>`. The `:has(>…)` qualifier is load-bearing and SHALL NOT be widened: `data-contract="none"` also marks legitimate shell regions — an app header, a nav — and hiding those empties the frame (AC-20260912-05-3) | Wherever a host surface frames a mock, two state switchers stacked: the host's tabs and the mock's own buttons. The first fix hid every `data-contract="none"` subtree and erased the mock's app header, because that marker means "outside the screen contract", not "tooling". The qualifier is the whole correctness of the rule and is the thing a future edit will be tempted to simplify away |
| D6 | Three identifiers that nothing references are DELETED from `spec/scripts/design-atlas.js`, each verified at exactly one occurrence (its own definition) before removal: the function `stepLabelsOf`, the CSS rule `.gapcard`, and the CSS rule `.statelabel` (AC-20260912-05-5) | .claude memory rule "refactors delete the code and tests they retire". `stepLabelsOf` is residue of the compare-table work sitting uncommitted in the same file; the two CSS rules name markup no renderer emits |
| D7 | Four literal duplications inside `design-atlas.js` collapse onto the copy that already exists, no behavior change: (a) the file's own `esc` is deleted and `esc` is imported from `./lib/stop-block` alongside the three names it already imports — the imported one maps `null` to `''` where the local one produced the string `"null"`, and no call site passes `null` (verified at build before the swap); (b) `injectNotesScript` calls `insertBeforeBodyEnd` instead of repeating its find-last-`</body>` body; (c) the `parseLedger(...).assumptions` read-and-catch, byte-identical at two route sites, becomes one `readLedgerRows(rootAbs)` helper; (d) `/__notes/list`'s inline question-join is replaced by `reviewPageLib.joinQuestions`, already required by this file (AC-20260912-05-5) | Each is one copy of something this file already has, and each copy is a place a future fix lands in one of two spots. (a) is the only one with a behavioral edge, which is why it carries its own pre-swap check rather than a claim |
| D8 | `docs/adr/0016-a-screen-appears-on-the-atlas-once.md` is CREATED, `Applies to:` **specs/20260902/07-mocks-command-driver.md** — one clause and no others: D15's "each mock card renders one frame per `data-state-btn` state (activated on load when served, same-origin)" becomes "each mock card renders one frame per screen, with the declared state count in the card's meta line"; AC-20260902-07-14's "two frames for `a` (`data-state="busy"`, `data-state="empty"`) and one for `b`" becomes "one frame each for `a` and `b`, `a`'s card meta carrying `2 states`". Every other clause of D15 stands — the seed-journey grouping, the persona line, the `shapes` section, the `references/` skip. specs/20260902/07 gains one `Amended by: ADR-0016` line and is not rewritten `[no-ac: an accepted record plus its backlink — prose the review stage's citations-check reads; no script in this repo adjudicates ADR shape, by the standing "ADR Applies-to integrity: watch, not work" ruling (0/41 dangling measured 2026-09-08; build the checker at dangling-reference:3)]` | The promise is shipped text the code contradicts, and no test ever asserted it — a laundered AC, the fourth of its class on record. ADR-0015 is the model: the locked spec gains a backlink, the record carries the account of what changed and why |
| D9 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: plugin-bump.js --check is the oracle]` | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| design/chrome-mocks/atlas.html | CREATE | doctrine | D1: the approved atlas chrome as a static reference file, fixture names, never served |
| spec/doctrine/design.md | MODIFY | doctrine | D2: § Design Canon's plugin-chrome sentence names both chrome mocks as the binding artifacts |
| spec/scripts/design-atlas.js | MODIFY | scripts | D6 three deletions; D7 four de-duplications (a-d) |
| docs/adr/0016-a-screen-appears-on-the-atlas-once.md | CREATE | doctrine | D8: the amendment record, one Applies-to clause |
| specs/20260902/07-mocks-command-driver.md | MODIFY | doctrine | D8: one `Amended by: ADR-0016` line, no rewrite |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260912-05-1, -2, -3, -5, -6 |
| tests/mocks/atlas-card-height.test.js | CREATE | tests | AC-20260912-05-4 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D9 bump |

Orchestrator duties outside the table:
- Before each D6 deletion, run `grep -c '<name>' spec/ tests/ -r` and confirm exactly one hit (the
  definition). A second hit means it is live: that identifier stays and the deviation is recorded.
- Before D7(a), run `grep -n 'esc(null\|esc(undefined\|esc(.*|| null' spec/scripts/design-atlas.js`
  and confirm no call site can pass `null`. A hit means the swap changes rendered output: keep the
  local `esc` and record the waive.

## Contracts

No new exported surface. `design-atlas.js`'s module exports stay
`{ buildAtlas, page, frameTag, createRequestHandler }`, unchanged, and D7's imports grow the
existing `require('./lib/stop-block')` destructure by one name:

```js
const { renderApproveStop, PICKS_SCRIPT, stripPicksScript, esc } = require('./lib/stop-block')
```

## UI

The binding artifact is `design/chrome-mocks/atlas.html` (D1). This section states only what that
file must contain for the criteria below to have something to assert against.

- **Mock card** — the screen label as the heading, one preview frame, and a meta line reading
  `journey: <name>` (or `brief: <file>`, or `no declaring brief`), then `<n> states` when the mock
  declares any, then `spec: <path>` when a ledger row claims it, joined by ` · `. The preview of a
  journey-owned card is a link; the card also carries its own `open` button.
- **Cards in a row are the same height**, and every preview is the same height as every other
  preview, whatever the mock inside is.

**Three ways for every control this spec touches** (.claude/rules/spec-pipeline.md § Planning):

| Control | Sentence on success | Path back | Farthest artifact |
|---|---|---|---|
| A journey-owned card's preview (`a.shotlink`, rendered by `buildAtlas`) | the journey review page is on screen, scrolled to that screen's board | the review page's breadcrumb product name links to `<prefix>/` — the atlas index (specs/20260912/06 D7) | none — navigation only |
| A shape or compare candidate's preview (no link; the lightbox binding in `UI_SCRIPT`) | the frame opens over the page at full size | `Esc`, or a click on the backdrop | none — navigation only |

## Behavior

A mock declaring no states renders a meta line with no state clause at all, not `0 states`. A
journey-owned mock whose label contains characters needing encoding still produces a resolvable
link: both the journey name and the label are `encodeURIComponent`-ed into the `href`, and the
fragment is `#board-<label>` against the review page's own `id="board-<label>"`.

## Acceptance Criteria

- **AC-20260912-05-1**: WHEN `design-atlas.js build` runs on a root whose `design/mocks/seed.md`
  declares journey `j1` with `a -> b`, where `a.html` declares states `busy` and `empty` and
  `b.html` declares none THE SYSTEM SHALL CONTINUE TO emit a section headed `j1` containing the
  persona line and exactly one `<iframe>` for `a` and one for `b`; `a`'s card meta line SHALL
  CONTINUE TO contain `2 states` and `b`'s SHALL CONTINUE TO contain no `states` clause; a root
  with roadmap surfaces and no seed SHALL CONTINUE TO build byte-identically to today
  → rewrites tests/design-atlas.test.js :: build: a mock with no brief AND no claim is an orphan
- **AC-20260912-05-2**: WHEN that same build runs THE SYSTEM SHALL CONTINUE TO wrap `a`'s frame in
  `<a class="shotlink" href="/review/j1.html#board-a"` and `b`'s in the same shape for `b`, and
  SHALL CONTINUE TO wrap a `design/shapes/*.html` card's frame in no `shotlink` at all; the page's
  lightbox binding SHALL CONTINUE TO contain the literal `if(!s.closest("a.shotlink"))`
  → writes tests/design-atlas.test.js
- **AC-20260912-05-3**: WHEN `GET /mocks/a.html?clean` runs against a served fixture whose `a.html`
  carries both a `<header data-contract="none">` with no state buttons and a
  `<div data-contract="none">` wrapping its `[data-state-btn]` buttons THE SYSTEM SHALL CONTINUE TO
  return a body containing `[data-state-btn]{display:none!important}` and
  `[data-contract="none"]:has(>[data-state-btn]){display:none!important}`, and SHALL CONTINUE TO
  return the `<header data-contract="none">` markup intact; `GET /mocks/a.html` with no `clean`
  SHALL CONTINUE TO contain neither rule
  → writes tests/design-atlas.test.js
- **AC-20260912-05-4** `[env: CHROME_BIN]`: WHEN the built atlas for a root whose `j1` declares a
  390×844 mock and a 1280×2000 mock is opened in headless Chrome THE SYSTEM SHALL CONTINUE TO
  report an identical rendered `.shot` height for both cards, and an identical rendered `.card`
  height for two cards in the same grid row
  → writes tests/mocks/atlas-card-height.test.js
- **AC-20260912-05-5**: WHEN `spec/scripts/design-atlas.js` is read THE SYSTEM SHALL contain zero
  occurrences of `stepLabelsOf`, `gapcard` and `statelabel`, exactly one occurrence of
  `insertBeforeBodyEnd(` outside its own definition being reachable from `injectNotesScript`, and
  no second copy of the `parseLedger(` read-and-catch — `grep -c 'parseLedger(' ` SHALL return `1`
  → writes tests/design-atlas.test.js
- **AC-20260912-05-6**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL contain the literals
  `design/chrome-mocks/atlas.html` and `design/chrome-mocks/review.html` inside § Design Canon's
  plugin-chrome paragraph, and `design/chrome-mocks/atlas.html` SHALL exist and contain the literals
  `shotlink` and `states`
  → writes tests/design-atlas.test.js

## Assumptions (escalation triggers)

- **A1**: The uniform-preview behaviour is a rendered property, not a source property — the card's
  `.shot` clamp is `max-height: var(--v-shot-max, 260px)` with `.grid` setting `180px`, so only a
  real layout can say whether two cards match. **Verified by reading** `design-atlas.js`'s `page()`
  stylesheet (the `.grid` and `.shot` rules) and `tests/design-atlas.test.js`'s existing clamp pin.
  **if false** (no Chrome available in any environment the suite runs in): AC-4 is dropped and its
  promise is carried by the existing clamp pin, with the gap recorded in Rationale.
- **A2**: `stepLabelsOf`, `.gapcard` and `.statelabel` have no live consumer. **Verified by grep**
  across `spec/` and `tests/`: one hit each, the definition. **if false:** that identifier is kept
  and D6 shrinks; the AC's grep list shrinks with it.
- **A3**: No `design-atlas.js` call site passes `null`/`undefined` to `esc`, so D7(a)'s swap is
  output-identical. **Checked at plan time by reading** the call sites; re-checked at build by the
  orchestrator duty above, because the file is under concurrent edit. **if false:** the local `esc`
  stays and D7(a) is waived.
- **A4**: `spec/scripts/design-atlas.js` carries uncommitted compare-table work that is not part of
  the 2026-09-12 UI session (`stepLabelsOf` is its residue). That work is committed before this spec
  builds, so the build's diff is its own. **if false:** the orchestrator commits it first as its own
  commit, or this spec's `diff_base` is set past it.

## Rationale

**Why the design source is not its own spec.** A spec whose only deliverable is a file plus a
frontmatter line has an acceptance criterion that is green the moment the file exists and can never
go red for a drift of the page it claims to bind — a facade. The client-mocks precedent
(specs/20260911/06 D18) landed the artifact together with the rules that read it and the tests that
cite it, and that is the shape copied here: the artifact lands in the same spec as the behaviour it
binds, for the surface it binds.

**Why one frame per screen is the right rule and not a compromise.** The atlas answers "does this
screen exist, and roughly what is it" for an entire product at once. Nine copies of one document
answer that question nine times and cost nine screen-heights of scrolling to reach the next screen.
The states are a per-screen question, and the surface that asks it — the journey review page — gives
each state its own tab and its own frame. The count on the card is the pointer between the two.

**Why the `:has(>…)` qualifier gets its own criterion.** It looks like noise. It is the difference
between hiding a mock's tooling and erasing the mock's own header, and that mistake was made once
already on 2026-09-12 before it was caught by looking. A test that does not carry a legitimate
`data-contract="none"` region in its fixture cannot catch the regression, which is why AC-3 names
both shapes in one fixture.

**Collision closure for D6's three retired literals (waive).** `collision-closure.js --literal
stepLabelsOf --literal gapcard --literal statelabel` reports 19 unplanned hits. Every one is either
the definition itself in `spec/scripts/design-atlas.js` — a planned File Plan row — or a copy inside
`.claude/worktrees/agent-*/`, the stale scratch trees of unrelated in-flight sessions, which are not
part of this repo's tracked tree and are never built from. Nothing else in `spec/`, `tests/` or
`docs/` names any of the three: verified by `grep -rn ... --exclude-dir=worktrees`, one hit each.

**What this spec deliberately does not do.** It does not touch the review page (specs/20260912/06),
it does not change the approve gate (specs/20260912/07), and it writes no test for the 2026-09-12
skin changes — those are what the design source is for. It also leaves `viewer.css`'s `.v-*`
primitive register in place: the audit found it has zero consumers anywhere in the repo and is
conceptually duplicated by `page()`'s own hand-rolled `.card`/`.badge`/`.bar`, but that register is
a locked promise of specs/20260902/09 D4, so retiring it is a third amendment and belongs to its own
decision, queued rather than folded in here.

## Canonical Delta

`docs/canonical/design.md` § The mocks command: append "The atlas renders one frame per screen, with
the declared state count in the card's meta line (ADR-0016); a journey-owned card's preview links to
that screen's board on the journey review page. Plugin chrome binds to a file: the atlas index
answers to `design/chrome-mocks/atlas.html` and the journey review page to
`design/chrome-mocks/review.html`, cited as `design_source` by any spec that edits them."
