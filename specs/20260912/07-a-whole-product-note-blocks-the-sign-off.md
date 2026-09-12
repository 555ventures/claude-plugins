---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/review.html
breaking: true
depends_on: [specs/20260912/06-the-review-page-answers-to-a-design.md]
depended_on_by: []
brief: n/a
build_base: main
open_markers: 0
---

# A whole-product note blocks the sign-off, not every journey

## Goal

A note filed against the whole product — "the navigation is wrong everywhere", raised from the notes
layer's own composer — currently blocks the approval of **every journey**, on the page and at the
command line alike. On a real project (Hearwell, 2026-09-12) four such notes made all five journeys
unapprovable regardless of whether any of them had anything to do with the note, and the only way
forward was to resolve a product-wide question before any per-journey review could close. The owner
ruled on 2026-09-12: a whole-product note blocks the **final sign-off**, and each journey approves on
its own screens' notes alone. Done means the page, the driver and the doctrine all say that, the page
tells the owner what is still waiting when a journey is clean but the product is not, and the locked
decision this overturns carries an amendment record.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The page's approve gate counts this journey's screen-scoped items only.** `renderHeader`'s `openAll` becomes `items.filter((n) => n.scope === 'mock' && isOpen(n)).length`; the disabled title's wording (`<k> open item(s) block approval`) is unchanged, and it now names a number that is always about this journey. Project-scope rows still render in the inspector and still count in the header's open total and the rail's `Whole project` row — they are visible everywhere, they simply no longer disable this button (AC-20260912-07-1) | The owner's ruling. A journey's approval is a statement about that journey's screens; a product-wide doubt is a statement about the product, and the product has its own sign-off |
| D2 | **`review.browser.js`'s re-derivation matches.** `recount()` keeps `openTotal` as it is (every open row, which is what the header total and the rail counts are), and gates the approve button on a second counter, `openScoped` — rows carrying a `data-label`. The disabled title is built from `openScoped` (AC-20260912-07-1) | The browser recomputes the gate on every answer; if it recomputed the old rule the button would re-disable itself one keystroke after the server enabled it |
| D3 | **When the journey is clean but the product is not, the page says so.** With an open stop, zero open scoped items and one or more open project items, `renderHeader` renders, inside the approve block and after the enabled control, `<p class="rv-projwait" data-rv="projwait"><n> whole-product note(s) still block sign-off</p>`; `review.browser.js`'s `recount()` shows and hides it on the same two counters. With no open project items the element is absent from the served bytes entirely (AC-20260912-07-2) | .claude/rules/spec-pipeline.md § Planning: a control whose only success signal is the control enabling has no sentence. Approving a journey while the product is still blocked is a real state, and an owner who is not told will meet the refusal later, at sign-off, with no memory of why |
| D4 | **The driver's project-note refusal moves to the sign-off.** `mocks-driver.js`'s `requireNotesResolved(labels, journeyName)` loses its leading open-project check; that check becomes `requireProjectNotesResolved()`, with the message unchanged byte-for-byte (`project note(s) open: <ids> — answer the project note first`), called from `handleApproved()` only — immediately before its existing `requireNotesResolved(allDeclaredLabels(), null)`, preserving today's ordering and message precedence at that mark. `handleJourneyApproved` calls `requireNotesResolved` alone (AC-20260912-07-3, AC-20260912-07-4) | The page must never enable a button the command line then refuses. The `approved` mark already gathers every other product-wide precondition — every journey approved, every client walk closed, the render gate, the matrix check — and this belongs beside them |
| D5 | `docs/adr/0018-a-whole-product-note-blocks-the-sign-off.md` is CREATED with two `Applies to:` clauses: (a) **specs/20260902/10-page-notes-review-loop.md** D5 and AC-20260902-10-6 — "`journey-approved` … refuse while any project note is not `resolved` (naming it first)" is narrowed to "`approved` refuses while any project note is not `resolved`"; `approved`'s own rule and the per-journey unresolved-note rule are unchanged; (b) **specs/20260906/04-journey-review-page.md** D5 — "disabled with title `<k> open item(s) block approval` while any question is unanswered or any note unresolved" is narrowed to "…while any question or note **on this journey's screens** is unanswered or unresolved". Each amended spec gains one `Amended by: ADR-0018` line and neither is rewritten `[no-ac: an accepted record plus its backlink — prose the review stage's citations-check reads; no script in this repo adjudicates ADR shape, by the standing "ADR Applies-to integrity: watch, not work" ruling (0/41 dangling measured 2026-09-08; build the checker at dangling-reference:3)]` | Both are locked decisions in closed specs, one of them with its own AC. ADR-0015 is the model. specs/20260906/04 will then carry two `Amended by` lines (ADR-0017 from specs/20260912/06, ADR-0018 from here) — the precedent is ADR-0010's own backlink set |
| D6 | `design/chrome-mocks/review.html` (created by specs/20260912/06 D1) gains the D3 line in its approve block, so the binding artifact still shows what the page renders `[no-ac: a reference file; the served rendering is pinned by AC-20260912-07-2]` | design.md § Design Canon: the mock is the design. A spec that adds a visible element to a bound surface and leaves the artifact behind re-opens the gap specs/20260912/05 and /06 exist to close — this row is the first proof the binding actually works |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: plugin-bump.js --check is the oracle]` | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/review-page.js | MODIFY | scripts | D1 `openAll` scoped to this journey's mock items; D3 the `rv-projwait` line |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D2 `openScoped` gates the button; D3 shows and hides the line |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D4 `requireProjectNotesResolved` split out, called from `handleApproved` only |
| spec/templates/mocks/viewer.css | MODIFY | scripts | D3 `.rv-projwait` styled on the muted/warn register, no new token |
| design/chrome-mocks/review.html | MODIFY | doctrine | D6 the approve block carries the D3 line |
| docs/adr/0018-a-whole-product-note-blocks-the-sign-off.md | CREATE | doctrine | D5 the amendment record, two Applies-to clauses |
| specs/20260902/10-page-notes-review-loop.md | MODIFY | doctrine | D5 one `Amended by: ADR-0018` line, no rewrite |
| specs/20260906/04-journey-review-page.md | MODIFY | doctrine | D5 one `Amended by: ADR-0018` line, no rewrite |
| tests/mocks/review-page.test.js | MODIFY | tests | AC-20260912-07-1, -2 |
| tests/mocks/mocks-driver-notes-gate.test.js | CREATE | tests | AC-20260912-07-3, -4, -6 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 bump |

## Contracts

`mocks-driver.js` gains one internal function; no CLI surface, flag or message text changes.

```js
// Unchanged signature, minus its leading project sweep.
function requireNotesResolved(labels, journeyName) { /* questions, then plain notes, on `labels` */ }

// The sweep, now its own gate. Message byte-identical to the one it was carved out of.
// Called by handleApproved() only.
function requireProjectNotesResolved() {
  const open = notesOrEmpty().filter((n) => n.scope === 'project' && n.status !== 'resolved')
  if (open.length) die('project note(s) open: ' + open.map((n) => n.id).join(', ') + ' — answer the project note first')
}
```

## UI

The binding artifact is `design/chrome-mocks/review.html` (specs/20260912/06 D1), updated by D6.

- **Approve block, journey clean, product not** — the `Approve journey` button is enabled, and
  directly beneath it one muted line: `2 whole-product notes still block sign-off`.
- **Approve block, journey not clean** — unchanged from today: the button is disabled and its title
  names the count of this journey's open items.
- **Approve block, everything clean** — unchanged: the enabled button alone, no line.

**Three ways for the control this spec changes** (.claude/rules/spec-pipeline.md § Planning):

| Control | Sentence on success | Path back | Farthest artifact |
|---|---|---|---|
| `Approve journey` (`[data-rv="approve"]`, rendered by `review-page.js`, posted by the stop's decide script to `/__picks/decide`) | the stop renders its decided line in place of the buttons, and the header pill reads approved | `--reopen journey:<j>` at the command line clears the mark and re-opens the stop (specs/20260902/07 D11) | `design/mocks/status.json` — the journey's `approved` timestamp, and `design/mocks/picks.json` — the stop's decision |
| The `rv-projwait` line (`review-page.js`, no control — a statement) | n/a — it disappears when the last project note is resolved | the inspector's `Whole project` rail row lists exactly those notes | `design/mocks/notes.json` — the project-scope rows |

## Behavior

A journey whose own screens are clean can now be approved while product-wide notes are open, and
`--mark approved` will still refuse until they are answered, naming them by id in the message it has
always used. The order of refusals at `approved` is unchanged: project notes first, then unanswered
questions, then unresolved notes, then the client-walk and gate checks.

## Acceptance Criteria

- **AC-20260912-07-1**: WHEN `buildReviewPage` runs over a fixture whose journey `j1` has every
  screen-scoped item resolved and two open project notes, with an open `journey-approved:j1` stop
  THE SYSTEM SHALL render `[data-rv="approve"]` with no `disabled` attribute; WHEN the same fixture
  carries one open note on screen `a` it SHALL render it `disabled` with title
  `1 open item blocks approval`; and WHEN `review.browser.js` runs under `vm` over the first
  markup THE SYSTEM SHALL leave the button enabled after `recount()`
  → writes tests/mocks/review-page.test.js
- **AC-20260912-07-2**: WHEN that first fixture renders THE SYSTEM SHALL emit exactly one
  `[data-rv="projwait"]` whose text is `2 whole-product notes still block sign-off`; WHEN the two
  project notes are `resolved` THE SYSTEM SHALL emit no `[data-rv="projwait"]` at all; WHEN the
  journey also carries one open note on `a` THE SYSTEM SHALL emit none either
  → writes tests/mocks/review-page.test.js
- **AC-20260912-07-3**: WHEN `mocks-driver.js --mark journey-approved --journey j1` runs on a
  fixture whose `j1` screens carry no unresolved note and whose store carries one open project note
  `N005` THE SYSTEM SHALL exit 0 and record the journey approved
  → writes tests/mocks/mocks-driver-notes-gate.test.js
- **AC-20260912-07-6**: WHEN `mocks-driver.js --mark journey-approved --journey j1` runs on a
  fixture carrying an unresolved note `N001` on a screen of `j1` THE SYSTEM SHALL CONTINUE TO exit
  2 with `unresolved note(s) on j1: N001`
  → writes tests/mocks/mocks-driver-notes-gate.test.js
- **AC-20260912-07-4**: WHEN `mocks-driver.js --mark approved` runs on a fixture with every journey
  approved, every journey confirmed by the client, and one open project note `N005` THE SYSTEM
  SHALL CONTINUE TO exit 2 with `project note(s) open: N005 — answer the project note first`, and
  SHALL CONTINUE TO print it before any unanswered-question or unresolved-note line
  → writes tests/mocks/mocks-driver-notes-gate.test.js

## Assumptions (escalation triggers)

- **A1**: The page and the driver enforce the same rule today, so changing one alone would put them
  in disagreement. **Verified by reading**: `review-page.js`'s `openAll` counts every open item
  including project scope, and `mocks-driver.js`'s `requireNotesResolved` dies on any open project
  note before its per-journey checks, called from both `handleJourneyApproved` and `handleApproved`.
  **if false:** whichever side already scopes correctly is left alone and its Decision is dropped.
- **A2**: `journey-skinned` and `journey-reviewed`, which specs/20260902/10 D5 also named, are
  retired marks with no call site. **Verified by reading** the driver's mark dispatch, whose list is
  `seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved,
  journey-walked, theme-picked, approved`. **if false:** ADR-0018 clause (a) names them too and
  each gains the same narrowing.
- **A3**: AC-20260902-10-6's test does not exist in this tree, so nothing needs rewriting for the
  driver half. **Verified by grep**: `tests/mocks/mocks-notes.test.js` is absent (retired by the
  2026-09-11 expiry sweep) and `grep -rn 'answer the project note first' tests/` returns nothing.
  **if false:** AC-3's disposition becomes `rewrites` against that file.
- **A4**: specs/20260912/06 has landed, so `tests/mocks/review-page.test.js` and
  `design/chrome-mocks/review.html` exist for this spec to modify. Enforced by `depends_on`.
  **if 06 has not landed:** this spec does not build; the state gate refuses.

## Rationale

**Why this is `breaking: true`.** A host mid-review whose product-wide note is open will find that
journeys it could not approve yesterday can be approved today. Nothing is lost — the note still
blocks the sign-off that ends the stage — but the sequence a host can follow changes, and that is
what the flag is for.

**Why the rule the owner chose is the coherent one, not merely the convenient one.** A project-scope
note belongs to no screen; the store has no journey on it, by the locked contract of
specs/20260902/10. So "block only the journey it was raised on" is not implementable, and the real
choice was between blocking everything and blocking the one thing that is itself about the whole
product. The sign-off is the mark that means "the product's screens are agreed", which is exactly
the scope of the note.

**Why the page gains a line rather than staying silent.** The old rule was at least legible: the
button was disabled and said why. The new rule enables a button while a refusal still waits at the
end of the stage. Without D3 the owner meets that refusal days later with nothing on screen having
ever mentioned it — trading one bad surprise for a worse one.

**Why the mock is edited in the same spec.** This is the first change to a surface that now binds to
a design artifact. Landing the element without updating the artifact would prove the binding
decorative on the very first use.

## Canonical Delta

`docs/canonical/design.md` § The mocks command: replace "the approve control mirrors the on-disk
gate (disabled while any question or note is open)" with "the approve control mirrors the on-disk
gate: a journey's approval is blocked by open questions and notes **on that journey's screens**, and
a whole-product note blocks the final `approved` sign-off instead of every journey (ADR-0018); when
a journey is clean and product-wide notes remain, the page says how many still block sign-off."
