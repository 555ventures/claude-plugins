---
date: 2026-09-08
status: implementing
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-08
open_markers: 0
build_base: main
diff_base: 62dc04594e3265fdd9a85be1617161a588389d7c
---

# One wire-register predicate

## Goal

Four checks across two scripts each ask a version of "does this page apply the gray wireframe
register as a stylesheet?", and all four hand-roll their own answer. The four answers disagree
on ten of twenty-four link forms, and two of them are outright wrong: a wireframe styled
through a CSS `@import` is refused as unstyled, and a wireframe whose gray links were deleted
but left behind in a comment passes as drawn. This spec makes the reading of a page's applied
stylesheets a single derivation under `spec/scripts/lib/`, moves all four checks onto it, and
pins that a fifth private spelling cannot appear. Done means: one module answers the question,
every call site keeps its own message, severity and gating, and the two defects above are gone.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/wire-register.js` is the single authority for reading which stylesheets a page applies. It exports `stylesheetTargets(html)` and `linksWireRegister(html)` and nothing else. `design-atlas.js` and `mocks-driver.js` import it; every private copy (`WIRE_LINK_RE`, `WIRE_SEGMENT_RE`, `attrValue`, `linksWireRegister`, the two `journey-drawn` substring regexes, the `does not link a tokens.css` regex) is deleted (AC-20260908-07-1, AC-20260908-07-8, AC-20260908-07-9) | The same predicate was hand-rolled four times and diverged four ways; `lib/base-derivation.js` is this repo's proven answer to exactly that story — one authority plus a pin banning a private spelling |
| D2 | `stylesheetTargets(html)` returns every URL the page applies as a stylesheet: a `<link>` whose `rel` value contains `stylesheet` (case-insensitive), in any attribute order, with a double-quoted, single-quoted or unquoted `href`, in a tag that may span lines; plus every CSS `@import` target in the forms `@import "…"`, `@import '…'`, `@import url(…)`, `@import url("…")`, `@import url('…')`. HTML comments are stripped before scanning. Nothing else is a target — a `<script src>`, an `<a href>`, plain prose, and a `<link>` whose `rel` is absent or does not contain `stylesheet` never appear. Return order is not part of the contract (AC-20260908-07-1) | Every consumer asks a membership question, so the honest primitive is the set of applied stylesheets; the four checks then differ only in which member they look for |
| D3 | `linksWireRegister(html)` is true exactly when some `stylesheetTargets(html)` entry matches `/(^|\/)wire\//` — `wire` must be a whole path segment, preceded by `/` or by the very start of the value, never a `\b` word boundary (AC-20260908-07-2) | `\b` treats `-`, `.` and `_` as boundaries, which is why `../my-wire/x.css` and `../v.wire/x.css` were read as the gray register |
| D4 | `design-atlas.js`'s register-after-theme rule calls `linksWireRegister(html)`. Everything around it is untouched: it still binds only on a labeled non-canon mock whose `data-status` is not `approved`, only once a `tokens.css` resolves by walk-up above the file, still splits `ratified` → violation and `sketch` → ⚠️ warn, and still prints the byte-identical message `<file>: links the wireframe register (wire/) after the theme pick — skin it in the picked theme (design/tokens.css)` (AC-20260908-07-3, AC-20260908-07-4, AC-20260908-07-9, AC-20260908-07-10) | The divergence is in the predicate only; the gating and the severity split are this call site's own product decision and stay its own |
| D5 | `mocks-driver.js`'s `composeViolations` calls `linksWireRegister(html)` and keeps its refusal literal `design/theme/<k>/kit.html links the wireframe register (wire/) — a candidate direction is the kit at production fidelity` byte-identical (AC-20260908-07-11) | This call site is already correct; the move must be observably a no-op for it |
| D6 | `journey-drawn`'s two "the wireframe must link the register" checks read `stylesheetTargets(html)` and require a target matching `/(^|\/)wire\/tokens\.css$/` and `/(^|\/)wire\/wire\.css$/` respectively, keeping both refusal literals (`<file>: does not link ../wire/tokens.css`, `<file>: does not link ../wire/wire.css`) byte-identical. A commented-out or prose mention of the path stops satisfying the check; a register applied through `@import` starts satisfying it (AC-20260908-07-5, AC-20260908-07-12) | A substring scan of the whole page let a wireframe that had lost its gray skin be marked drawn — the exact mirror of the bug this spec's other half fixes |
| D7 | `design-atlas.js`'s `does not link a tokens.css` rule reads `stylesheetTargets(html)` and requires a target whose final path segment is `tokens.css`, keeping the message literal `<file>: does not link a tokens.css` byte-identical. A page whose only token link is an `@import` stops being refused; a non-stylesheet `<link>` pointing at a `tokens.css` stops satisfying it (AC-20260908-07-6, AC-20260908-07-13) | Executed against the real entrypoint, this rule refuses a correctly-styled page today; it is the same predicate read a fifth way |
| D8 | A `<link>` carrying no `rel`, or a `rel` that does not contain `stylesheet` (`icon`, `preload`, `prefetch`), pointing into `wire/` is not a wire-register link — even though `design-atlas.js` flags it today (AC-20260908-07-2, AC-20260908-07-4) | The rule's promise is that the page no longer *renders* gray; a link the browser does not apply as a stylesheet changes no pixel |
| D9 | `tests/consistency/wire-register.test.js` pins the single authority two ways: no `.js` file under `spec/scripts/` other than `lib/wire-register.js` contains the source text `wire\/` (the regex-escaped separator every private spelling used), and both consumers `require('./lib/wire-register')` and call an export from it. Comments that need to discuss the rule spell it `wire/` unescaped, which the scan ignores (AC-20260908-07-7, AC-20260908-07-8) | Modelled on `tests/consistency/base-derivation.test.js`, which exists because the same ordering bug was fixed three times one consumer at a time; the pin makes a fifth spelling impossible rather than merely discouraged |
| D10 | The full twenty-four-form behaviour matrix lives in `tests/consistency/wire-register.test.js` as a direct `require` of the module; each call site carries a small representative end-to-end set instead of re-running the whole matrix through a spawned script (AC-20260908-07-1, AC-20260908-07-2) | Direct-require of a `lib/` module is established here (`base-derivation`, `spec-sections` consistency tests), and twenty-four extra script spawns would push a test file toward the 45s per-file budget for no added signal |
| D11 | Bump `spec/.claude-plugin/plugin.json` with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (AC-20260908-07-14) | Repo rule: every change under a plugin directory bumps that plugin's semver; the Decision names no version literal because concurrent sessions race the number |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/wire-register.js | CREATE | scripts | D1/D2/D3: the single authority — `stylesheetTargets(html)` and `linksWireRegister(html)`, node builtins only, header carrying usage, the owner citation, what it deliberately does not do, and `Exit codes: N/A` |
| spec/scripts/design-atlas.js | MODIFY | scripts | D4/D7: delete `WIRE_LINK_RE`, import the authority, call `linksWireRegister` in `themeAndNotesViolations` and `stylesheetTargets` in the `does not link a tokens.css` rule; update the file-header rule narration to match |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D5/D6: delete `WIRE_SEGMENT_RE`, `attrValue` and the local `linksWireRegister` plus the divergence comment above them, import the authority, and move `handleJourneyDrawn`'s two substring checks onto `stylesheetTargets` |
| tests/consistency/wire-register.test.js | CREATE | tests | AC-20260908-07-1, AC-20260908-07-2, AC-20260908-07-7, AC-20260908-07-8 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260908-07-3, AC-20260908-07-4, AC-20260908-07-6, AC-20260908-07-9, AC-20260908-07-10, AC-20260908-07-13 |
| tests/mocks/mocks-driver-wire.test.js | CREATE | tests | AC-20260908-07-5 |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260908-07-12 — retag the existing `journey-drawn` pin, no assertion weakened |
| tests/mocks/mocks-driver-theme.test.js | MODIFY | tests | AC-20260908-07-11 — retag the existing 11-refusing/9-composing table and rewrite the comment naming the now-moved symbols |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | AC-20260908-07-14 — bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`, never by hand |

## Contracts

```js
// spec/scripts/lib/wire-register.js
/**
 * Every URL the page applies as a stylesheet. HTML comments are stripped first.
 * Sources: <link> tags whose rel contains "stylesheet" (case-insensitive, any attribute
 * order, double-quoted / single-quoted / unquoted href, tag may span lines), and CSS
 * @import targets in the forms "…", '…', url(…), url("…"), url('…').
 * Never: <script src>, <a href>, prose, or a <link> with an absent or non-stylesheet rel.
 * Return order is not part of the contract.
 */
function stylesheetTargets(html) // -> string[]

/** True when some stylesheetTargets(html) entry has "wire" as a whole path segment. */
function linksWireRegister(html) // -> boolean

module.exports = { stylesheetTargets, linksWireRegister }
```

Consumers, after the move:

```js
// spec/scripts/design-atlas.js
const { stylesheetTargets, linksWireRegister } = require('./lib/wire-register')
// register-after-theme (D4): linksWireRegister(html)
// links-a-tokens-css   (D7): stylesheetTargets(html).some((t) => /(^|\/)tokens\.css$/.test(t))

// spec/scripts/mocks-driver.js
const { stylesheetTargets, linksWireRegister } = require('./lib/wire-register')
// composeViolations (D5): linksWireRegister(html)
// journey-drawn     (D6): stylesheetTargets(html).some((t) => /(^|\/)wire\/tokens\.css$/.test(t))
//                         stylesheetTargets(html).some((t) => /(^|\/)wire\/wire\.css$/.test(t))
```

## Behavior

The twenty-four-form matrix below is the executed pre-image (Assumption A4). `atlas` is
`design-atlas.js`'s `WIRE_LINK_RE` today, `theme` is `mocks-driver.js`'s `linksWireRegister`
today, `after` is `linksWireRegister` from the shared authority once this spec lands.

| Form | atlas | theme | after |
|------|-------|-------|-------|
| `<link rel="stylesheet" href="../../wire/tokens.css">` | true | true | true |
| `<link rel='stylesheet' href='../../wire/tokens.css'>` | false | true | true |
| `<link rel=stylesheet href=../../wire/tokens.css>` | false | true | true |
| `<style>@import "../../wire/tokens.css";</style>` | false | true | true |
| `<style>@import url(../../wire/tokens.css);</style>` | false | true | true |
| `<LINK REL="STYLESHEET" HREF="../../wire/tokens.css">` | false | true | true |
| `<link href="../../wire/tokens.css" rel="stylesheet">` | true | true | true |
| `<link rel="stylesheet" href="/wire/tokens.css">` | true | true | true |
| `<link rel="stylesheet" href="wire/tokens.css">` | true | true | true |
| `<link\n  rel="stylesheet"\n  href="../../wire/tokens.css">` | true | true | true |
| `<link href="../../wire/tokens.css">` (no `rel`) | true | false | false |
| `<link rel="icon" href="../../wire/favicon.png">` | true | false | false |
| `<link rel="preload" as="style" href="../../wire/tokens.css">` | true | false | false |
| `<link rel="stylesheet" href="../my-wire/x.css">` | true | false | false |
| `<link rel="stylesheet" href="../v.wire/x.css">` | true | false | false |
| `<link rel="stylesheet" href="../my_wire/x.css">` | false | false | false |
| `<link rel="stylesheet" href="../hardwire/x.css">` | false | false | false |
| `<link rel="stylesheet" href="../firewire/x.css">` | false | false | false |
| `<link rel="stylesheet" href="../wired/x.css">` | false | false | false |
| `<link rel="stylesheet" href="../wireframe/x.css">` | false | false | false |
| `<link rel="stylesheet" href="../rewire/x.css">` | false | false | false |
| `<!-- re-rendered from the gray wire/ register -->` | false | false | false |
| `<script src="../../wire/x.js"></script>` | false | false | false |
| `<a href="../../wire/tokens.css">x</a>` | false | false | false |

Two forms have no pre-image column because neither existing copy handles them, and both are
`false` after: `<!-- <link rel="stylesheet" href="../../wire/tokens.css"> -->` and
`<!-- @import "../../wire/tokens.css"; -->` — a commented-out link or import applies nothing.

The positive twins, same shape. `atlas-tokens` is `does not link a tokens.css`, `jd` is
`journey-drawn`'s pair; `true` means "the check is satisfied".

| Page | atlas-tokens now | jd now | atlas-tokens after | jd after |
|------|------------------|--------|--------------------|----------|
| canonical gray wireframe (two `rel="stylesheet"` links) | true | true | true | true |
| gray register applied only via `@import` | false | true | true | true |
| own `tokens.css` linked, gray register only mentioned in a comment | true | true | true | false |
| `<link rel="icon" href="tokens.css">` | true | false | false | false |
| no `tokens.css` at all | false | false | false | false |

Nothing else about either script moves. `design-atlas.js`'s walk-up resolution of
`design/tokens.css`, its `approved`-is-exempt rule, its `--matrix` never binding the
register rule, the unresolved-notes rule sharing the same severity split, and
`mocks-driver.js`'s ordering of `composeViolations` refusals are all outside this change.

## Acceptance Criteria

- **AC-20260908-07-1**: WHEN `stylesheetTargets(html)` is called on a page THE SYSTEM SHALL
  return every URL the page applies as a stylesheet and no other URL — `<link rel="stylesheet"
  href="../../wire/tokens.css">` → `["../../wire/tokens.css"]`; `<link rel='stylesheet'
  href='a.css'>` → `["a.css"]`; `<link rel=stylesheet href=b.css>` → `["b.css"]`;
  `<LINK REL="STYLESHEET" HREF="c.css">` → `["c.css"]`; `<link href="d.css" rel="stylesheet">`
  → `["d.css"]`; `<style>@import "e.css";</style>` → `["e.css"]`; `<style>@import url(f.css);
  </style>` → `["f.css"]`; `<style>@import url("g.css");</style>` → `["g.css"]`;
  `<link href="h.css">` → `[]`; `<link rel="icon" href="i.png">` → `[]`;
  `<script src="j.js"></script>` → `[]`; `<a href="k.css">x</a>` → `[]`;
  `<!-- <link rel="stylesheet" href="l.css"> -->` → `[]`; `<!-- @import "m.css"; -->` → `[]`
  → the `stylesheetTargets` table test in `tests/consistency/wire-register.test.js`
- **AC-20260908-07-2**: WHEN `linksWireRegister(html)` is called THE SYSTEM SHALL return true
  for every one of the ten refusing forms in the Behavior matrix and false for every one of the
  fourteen non-refusing forms, treating `wire` as a whole path segment only
  (`../../wire/tokens.css` → true, `/wire/tokens.css` → true, `wire/tokens.css` → true,
  `../my-wire/x.css` → false, `../v.wire/x.css` → false) and requiring a stylesheet `rel`
  (`<link rel="icon" href="../../wire/favicon.png">` → false, `<link
  href="../../wire/tokens.css">` → false) → the `linksWireRegister` table test in
  `tests/consistency/wire-register.test.js`
- **AC-20260908-07-3**: WHEN `design-atlas.js check` runs over a labeled mock stamped
  `data-status="ratified"` that applies the wireframe register through a single-quoted href, an
  unquoted href, a CSS `@import`, or an uppercase `<LINK>` tag, and a `design/tokens.css`
  resolves above it, THE SYSTEM SHALL report a violation whose text is
  `<file>: links the wireframe register (wire/) after the theme pick — skin it in the picked
  theme (design/tokens.css)` and exit non-zero → `tests/design-atlas.test.js`
- **AC-20260908-07-4**: WHEN `design-atlas.js check` runs over a labeled `ratified` mock with a
  `design/tokens.css` above it whose only `wire`-shaped links are `<link rel="stylesheet"
  href="../my-wire/x.css">`, `<link rel="stylesheet" href="../v.wire/x.css">`, `<link
  rel="icon" href="../wire/favicon.png">` or `<link href="../wire/tokens.css">` THE SYSTEM
  SHALL print no line containing `wireframe register`, neither warn nor violation
  → `tests/design-atlas.test.js`
- **AC-20260908-07-5**: WHEN `mocks-driver.js --mark journey-drawn` runs over a sketch mock
  whose only occurrence of the register path is a comment (`<!-- was ../wire/tokens.css -->`)
  THE SYSTEM SHALL exit 2 with `<file>: does not link ../wire/tokens.css`, and WHEN the mock
  applies the register through `<style>@import "../wire/tokens.css"; @import
  "../wire/wire.css";</style>` THE SYSTEM SHALL not refuse it on either register link
  → `tests/mocks/mocks-driver-wire.test.js`
- **AC-20260908-07-6**: WHEN `design-atlas.js check` runs over a labeled mock whose only token
  stylesheet is applied through `<style>@import "../wire/tokens.css";</style>` THE SYSTEM SHALL
  not report `does not link a tokens.css` → `tests/design-atlas.test.js`
- **AC-20260908-07-7**: WHEN the repository is scanned THE SYSTEM SHALL find the source text
  `wire\/` in no `.js` file under `spec/scripts/` other than `spec/scripts/lib/wire-register.js`
  → the private-spelling pin in `tests/consistency/wire-register.test.js`
- **AC-20260908-07-8**: WHEN `spec/scripts/design-atlas.js` and `spec/scripts/mocks-driver.js`
  are read THE SYSTEM SHALL find in each a `require('./lib/wire-register')` and at least one
  call to an export of that module → the consumer pin in
  `tests/consistency/wire-register.test.js`
- **AC-20260908-07-9**: WHEN `design-atlas.js check` runs over a `ratified` mock that links
  `../wire/wire.css` in a tree with no `design/tokens.css` anywhere above it THE SYSTEM SHALL
  CONTINUE TO exit 0 and print no wireframe-register line at all → the retagged
  `AC-20260907-06-11` test in `tests/design-atlas.test.js`
- **AC-20260908-07-10**: WHEN `design-atlas.js check` runs over a mock linking
  `../wire/wire.css` with a `design/tokens.css` above it THE SYSTEM SHALL CONTINUE TO report a
  violation at `data-status="ratified"`, a ⚠️ warn at `sketch`, and nothing at `approved` with
  or without `--matrix`, with the message never saying `after THEME` → the retagged
  `AC-20260907-06-7` test in `tests/design-atlas.test.js`
- **AC-20260908-07-11**: WHEN `mocks-driver.js theme compose --direction <k>` runs over a
  candidate kit page THE SYSTEM SHALL CONTINUE TO refuse all eleven wire-linking forms with the
  byte-identical message `links the wireframe register (wire/)` and compose cleanly for all
  nine control forms and the prose-only case → the retagged review-finding table test in
  `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260908-07-12**: WHEN `mocks-driver.js --mark journey-drawn` runs over the canonical
  wireframe fixture THE SYSTEM SHALL CONTINUE TO accept it, and SHALL CONTINUE TO refuse a mock
  that links no `wire/tokens.css` with `<file>: does not link ../wire/tokens.css`
  → the retagged `AC-20260902-07-6` test in `tests/mocks/mocks-driver.test.js`
- **AC-20260908-07-13**: WHEN `design-atlas.js check` runs over a labeled mock whose only link
  to a `tokens.css` is `<link rel="icon" href="tokens.css">` THE SYSTEM SHALL report
  `<file>: does not link a tokens.css` → `tests/design-atlas.test.js`
- **AC-20260908-07-14** `[oracle: gate]`: WHEN the branch changes files under `spec/` THE
  SYSTEM SHALL carry a `spec/.claude-plugin/plugin.json` version above the merge base, as
  `node scripts/plugin-bump.js --check` derives it

## Assumptions (escalation triggers)

- **A1**: `spec/scripts/lib/` is excluded from the entrypoint inventory, so a new module there
  needs no `spec-paths` key and no `spec/entrypoints.json` row. Executed:
  `tests/consistency/entrypoints.test.js` asserts the exclusion explicitly
  (`the inventory glob must exclude spec/scripts/lib/ — lib/ holds shared modules, not entry
  points`), and `spec/scripts/lib/shell-region.js`'s own header records the same rule.
  — **if false:** add the `spec-paths` key and the `entrypoints.json` row in this same spec, as
  two extra File Plan rows.
- **A2**: every `<link>` in this repository's fixtures and templates already carries
  `rel="stylesheet"`, so D7's tightening reddens no existing test. Executed:
  `grep -rhon '<link[^>]*>' tests/ spec/templates/ --include=*.js --include=*.html
  --include=*.md | sort -u` returns only `rel="stylesheet"` tags plus the deliberate
  single-quoted / unquoted / icon cases already written as test inputs; the bare `<link>` hits
  are regex source inside test files, not markup. — **if false:** the offending fixture gains
  `rel="stylesheet"` inside the test row that owns it, never a loosened predicate.
- **A3**: the per-file test budget has headroom for this change. Executed:
  `node --test --test-reporter=./scripts/test-file-budget-reporter.js
  --test-reporter-destination=stdout tests/design-atlas.test.js tests/mocks/mocks-driver.test.js
  tests/mocks/mocks-driver-theme.test.js` printed
  `__FILE_BUDGET_OK__ slowest tests/mocks/mocks-driver.test.js 17795ms of 45000ms`. D10 keeps
  the twenty-four-form matrix out of the spawning files for this reason. — **if false:** move
  the new end-to-end cases into a further sibling file; never delete a case to fit.
- **A4**: the pre-image matrix in Behavior is executed, not reasoned. Executed: a scratch script
  requiring both live predicates verbatim over all twenty-four forms printed
  `differing cases: 10`, with `atlas=false theme=true` on the single-quoted href, the unquoted
  href, both `@import` forms and the uppercase tag, and `atlas=true theme=false` on the
  rel-less link, the `icon` link, the `preload` link, `../my-wire/x.css` and `../v.wire/x.css`.
  — **if false:** re-run the matrix and amend Behavior before any test is written.
- **A5**: both positive-side defects reproduce through the real entrypoint, not only in a
  scratch regex. Executed: `node spec/scripts/design-atlas.js check <mock>` on a page whose only
  token link is `<style>@import "../wire/tokens.css";</style>` printed
  `CHECK FAIL (1 violation(s) across 1 file(s)): … does not link a tokens.css` and exited 1;
  and the same command on a `ratified` mock carrying `<link rel='stylesheet'
  href='../wire/tokens.css'>` with a `design/tokens.css` above it reported only an unrelated
  hygiene violation, never the wireframe-register line. — **if false:** the defect is narrower
  than stated; re-scope D6/D7 before building.
- **A6**: no consumer outside these two scripts asks this question. Executed:
  `grep -rn "WIRE_LINK_RE\|WIRE_SEGMENT_RE\|linksWireRegister\|attrValue" tests/ spec/ docs/`
  returns exactly one hit outside the two scripts — a comment in
  `tests/mocks/mocks-driver-theme.test.js`, already a File Plan row. — **if false:** the extra
  consumer gets its own File Plan row rather than a second private copy.

## Rationale

The four checks are not four rules; they are one rule written four times, and every rewrite
drifted. The history is on record: the theme-side copy was hardened three times during the
review of `specs/20260907/06`, and each hardening step fixed the previous step's new hole — a
whole-page substring scan that refused prose, then a "narrowing" to a double-quote-only regex
that silently *admitted* single-quoted, unquoted and `@import` links, then a widening that
over-matched `my-wire/`. The atlas-side copy was deliberately left on the original one-line
regex because it sat outside that spec's File Plan, and the comment left behind argues the two
checks never see the same candidate. That argument is true and beside the point: it explains
why deferring was safe, never why two rules are correct.

The mechanism is deliberately not a new one. `lib/base-derivation.js` and its consistency test
exist in this repo because the `build_base`/`diff_base` ordering bug was diagnosed and fixed
three times, one consumer at a time, each carrying its own spelling — the identical failure
shape. That module's answer was a single authority plus a pin that bans the private spelling
outright, and D1/D9 copy it rather than invent a gate. The pin's discriminator (the source text
`wire\/`, the escaped separator every private copy used) is narrow on purpose: an ordinary
comment spelling the path `wire/` is untouched, so the pin cannot false-fire on prose.

Two judgment calls are worth naming for a cold reader. First, scope: the ask was to unify the
two checkers that disagree, and this spec also moves the two mirror-image checks. Those two
carry executed defects of the same shape, they live in the two files already being edited, and
correcting an over-wide fix is one revert while a too-narrow one costs a second full cycle over
the same code. Second, D8: `design-atlas.js` today flags a `<link>` into `wire/` that carries
no `rel` at all, and after this change it will not. The rule's promise is that the page no
longer renders gray, and a link the browser never applies as a stylesheet renders nothing —
following the strict rule here is what makes "one predicate" true rather than "one predicate
plus an exception".

What to watch during execution: `design-atlas.js`'s `does not link a tokens.css` rule (D7) runs
over every file `check` sees, including canon and kit pages, so it is the one change with a
wide blast radius inside the existing suite. A2 records the executed evidence that every
in-repo fixture already satisfies the tightened form, but a red there is a real signal about a
fixture, never an invitation to loosen the predicate back. Lock-time collision closure listed
three literals hits (`WIRE_LINK_RE`, `WIRE_SEGMENT_RE`/`linksWireRegister`/`attrValue`) across
`design-atlas.js`, `mocks-driver.js` and `tests/mocks/mocks-driver-theme.test.js` — all three
are File Plan rows, so nothing is waived. Its `executes` tier named eleven further test files
that spawn one of the two scripts; every one was read against A2's link inventory and none
feeds a page whose classification moves under D6 or D7, so no fixture repair is planned.

## Canonical Delta

In `docs/canonical/design.md`, under **The mocks command**, extend the registers-are-link-
signatures paragraph:

> Registers are link signatures: a wireframe links `design/wire/tokens.css` + `wire.css`
> (copied from `spec/templates/mocks/` at `canon-written`), a composed direction screen links
> its direction's `tokens.css` and no `wire/` stylesheet. "Links" is one derivation for every
> check that asks — `spec/scripts/lib/wire-register.js` reads the stylesheets a page actually
> applies (`<link>` with a stylesheet `rel` in any quoting form or attribute order, plus CSS
> `@import`, comments stripped) and answers whether any of them has `wire` as a whole path
> segment. A `<link>` the browser does not apply as a stylesheet, and a path merely named like
> the register (`my-wire/`, `v.wire/`), are not the register; a register applied through
> `@import` is. No script outside that module spells the rule itself.
