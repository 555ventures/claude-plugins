---
date: 2026-08-31
status: implementing
diff_base: e082b9d3fe809d7651de9a8b64f4d58238075c1d
tier: standard
area: design-render
design: false
breaking: false
depends_on: []
depended_on_by: []
# brief: n/a — defect-fix successor to the brief 08 render-gate series (specs/20260824/01..05),
# which is closed on the roadmap; re-stamping brief 08 would falsely reopen its derived status.
spiked: 2026-08-31
open_markers: 0
---

# Viewport adaptation as a rendered rule (no-overflow + line-length)

## Goal

The design pipeline's "matrix checks" never verify that a mock actually adapts at the
declared viewports: `design-atlas.js check --matrix` greps for a viewport meta tag and a dark
tokens block, and no `renderCheck` kind measures geometry against the viewport — so a
phone-only mock ratifies clean and the render gate later misattributes its non-adaptation to
components (prax, spec 20260823/11: 50–88 geometry findings per surface). Done means: a mock
that scrolls or clips horizontally at any declared viewport cell fails `render-gate --mocks`
at `/spec:sketch`'s exit through the existing rules pass — no new wiring, no new command
surface — and the static atlas checks stop overclaiming.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `render-rules.js`'s closed `renderCheck.kind` set gains `no-overflow` and `line-length`; the set stays closed and an unknown kind still exits 2 naming the full set (AC-20260831-02-2, AC-20260831-02-7) | Amends specs/20260824/04 D1's member list, not its refusal contract; rejected: a host-extensible kind registry (half-checked is worse than a refusal, per the original D1) |
| D2 | `no-overflow` is a union predicate: page `scrollWidth > clientWidth + 1` OR any non-exempt entry's `box.x + box.w > clientWidth + 1` (AC-20260831-02-2, AC-20260831-02-3) | Executed Chromium spike: `overflow-x: hidden` masks `scrollWidth` entirely (390 reported, content at 900) while `getBoundingClientRect` still reports the true edge — a single-leg check is evadable by one CSS line, this repo's measured entry-point-guard failure class |
| D3 | The entry leg exempts `fixed`, `outOfFlow`, `dataPositioned`, and `srOnly` entries (AC-20260831-02-4) | Mirrors render-compare's own geometry exemptions; a clipped positioned decoration is the author's assertion, a clipped in-flow entry is invisible content; executed spike: fixed elements never inflate `scrollWidth`, so neither leg sees them |
| D4 | `render-inventory.browser.js` adds a top-level `page: { scrollWidth, clientWidth }` block, read guarded from `document.scrollingElement || document.documentElement`, `null` values when unavailable; `schemaVersion` stays 1 (AC-20260831-02-1) | Additive keys kept schemaVersion 1 in specs/20260824/04 D4 (`effectiveBackground`); a version bump would force every consumer to fork on it for no read change |
| D5 | A viewport-geometry rule run over an inventory with no usable `page` block emits a fail-closed finding at the rule's own severity naming re-capture — never a silent pass (AC-20260831-02-5) | Fail-closed is the render-gate family invariant ("a capture failure is never green"); a silent skip on a stale inventory is exactly the laundering this spec exists to close |
| D6 | `line-length` ships `severity: "warn"` in the template: fires only at cells with `clientWidth >= minViewport`, flags an entry only when BOTH estimated line length `box.w / (0.5 × fontSize)` exceeds `maxCh` AND the entry's text is longer than `maxCh` characters (AC-20260831-02-6) | JJ ruling this session: signal at zero blocking risk (a host promotes it by editing one severity field); the double condition kills the short-label-in-wide-box false-positive class |
| D7 | No baseline machinery: the new kinds bind at the next ratification pass like every other rule; pre-existing ratified corpora are untouched until their next design touch [no-ac: process ruling — deliberate absence of a surface; nothing to test] | JJ ruling this session; baseline need measured once, in one host (core § Incident Policy admission bar unmet); a host can sweep manually with `render-gate --mocks` today |
| D8 | Thresholds live in the host-authored rules manifest (`design-rules.json` `renderCheck` fields), never in `targets.json` (AC-20260831-02-8) | `targets.json` declares the matrix, the manifest declares every existing threshold; the prax proposal's load-bearing intent is "host-declared, never plugin-hardcoded", which the manifest already satisfies with zero new plumbing |
| D9 | `design-atlas.js`'s viewport-meta/dark-block checks are re-described (comments + doctrine) as static matrix *preconditions*; rendered adaptation is named as `render-gate --mocks`'s job at sketch exit [no-ac: comment/prose-only edit, no behavioral surface] | The check's "matrix checks" label is the measured overclaim; the checks themselves stay (cheap, real preconditions) — deleting them would trade an overclaim for a coverage loss |
| D10 | Zero wiring changes: `/spec:sketch` exit's existing `render-gate --mocks` call is the enforcement point — its rules pass already blocks ratification on any non-warn finding [no-ac: deliberate no-op; enforcement is AC-2's finding riding the existing blocking path] | render-gate `--mocks` mode already captures every theme × viewport cell and shells to render-rules per cell (specs/20260824/04 D5); new machinery would duplicate a live rail |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/render-inventory.browser.js | MODIFY | scripts | Guarded top-level `page: { scrollWidth, clientWidth }` capture (D4); header comment gains the D4-style addendum block |
| spec/scripts/render-rules.js | MODIFY | scripts | `no-overflow` + `line-length` kinds (D1/D2/D3/D6), CLOSED_KINDS + die-message update, fail-closed missing-page finding (D5) |
| spec/templates/design-rules.json | MODIFY | doctrine | Add `no-overflow` rule (severity error, grounded) and `line-length` rule (severity warn, `maxCh` 90, `minViewport` 768) |
| spec/doctrine/design.md | MODIFY | doctrine | § Design Canon "Render rules pass" kind list gains the two kinds; one sentence naming rendered adaptation as the matrix verification, static atlas checks as preconditions (D9) |
| spec/scripts/design-atlas.js | MODIFY | scripts | Comment-only (D9): usage header + matrix-check block comment stop claiming adaptation verification |
| tests/render/render-inventory.test.js | MODIFY | tests | AC-20260831-02-1 |
| tests/render/render-rules.test.js | MODIFY | tests | AC-20260831-02-2, AC-20260831-02-3, AC-20260831-02-4, AC-20260831-02-5, AC-20260831-02-6, AC-20260831-02-7, AC-20260831-02-8 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.46.0 — next free at build time per Gotchas) + changelog paragraph |

## Contracts

Inventory document (additive, `schemaVersion` stays 1):

```js
{
  schemaVersion: 1,
  theme, state, root,
  page: {                 // NEW (D4) — read from document.scrollingElement || document.documentElement,
    scrollWidth: 900,     //   each field null when the surface is unavailable (guarded lookups,
    clientWidth: 390      //   same discipline as every optional lookup in this file)
  },
  entries: [ … ]          // unchanged
}
```

Manifest rule shapes (host-authored, D8):

```json
{ "id": "no-mock-overflow", "severity": "error", "grounding": "grounded",
  "renderCheck": { "kind": "no-overflow" } }

{ "id": "line-length", "severity": "warn", "grounding": "taste",
  "renderCheck": { "kind": "line-length", "maxCh": 90, "minViewport": 768 } }
```

`no-overflow` (D2/D3) — per inventory document, both legs, fixed 1px rounding slack (2dp boxes
vs integer clientWidth — a slack constant owned by this check, not a host threshold):

- page leg: `page.scrollWidth > page.clientWidth + 1` → finding
  `rule <id> no-overflow page scrolls horizontally: scrollWidth 900 > 390`
- entry leg: any entry with `!fixed && !outOfFlow && !dataPositioned && !srOnly` and
  `box.x + box.w > page.clientWidth + 1` → finding per entry
  `rule <id> no-overflow "<label>" right edge 900 > 390`
- `page` block missing or either field non-numeric (D5) → finding
  `rule <id> no-overflow inventory has no page geometry (theme <theme> state <state>) — re-capture with the current render-inventory.browser.js`

`line-length` (D6) — per inventory document; skips the whole document silently when
`page.clientWidth < minViewport` (that is the declared gate, not a missing-data case; a missing
`page` block is D5's finding, same as no-overflow); flags an entry when
`e.text.length > maxCh` AND `e.box.w / (0.5 * parseFloat(e.fontSize)) > maxCh`
(entries with no text, no box, or no parsable fontSize are skipped):
`rule <id> line-length "<first 40 chars…>" ~150ch > 90ch at 1200px`

Literal example (D6): `box.w` 1200, `fontSize` "16px" → 1200 / 8 = 150 estimated ch → fires
against `maxCh` 90 when the text itself is longer than 90 characters; the same box holding the
28-character text "Short heading in a wide hero" never fires.

## Behavior

Nothing changes in any command flow (D10). `/spec:sketch` step 6 already runs
`render-gate --mocks <sketch mocks>` before the ratification question, and render-gate
`--mocks` mode already captures every theme × viewport cell from `targets.json` and runs
`render-rules.js` over each cell's mock inventory, folding findings into the blocking verdict.
Once a host's manifest carries a `no-overflow` rule, a mock that only works at the phone
viewport produces findings in every wider cell and ratification blocks until the mock adapts —
the exact escape path prax measured. `line-length` findings print with the existing `⚠️`
warn-severity prefix and never block (D6). Hosts without a `design.rulesManifest`, and
manifests without the new rules, behave byte-identically to today.

## Acceptance Criteria

- **AC-20260831-02-1**: WHEN the capture expression walks a page whose scrolling element
  reports `scrollWidth` 900 and `clientWidth` 390 THE SYSTEM SHALL return
  `page: { scrollWidth: 900, clientWidth: 390 }` at the document's top level, and WHEN the
  evaluation context exposes no scrolling-element metrics THE SYSTEM SHALL return
  `page: { scrollWidth: null, clientWidth: null }` rather than throwing → stub-DOM tests in
  tests/render/render-inventory.test.js
- **AC-20260831-02-2**: WHEN a `no-overflow` rule runs over an inventory with
  `page: { scrollWidth: 900, clientWidth: 390 }` THE SYSTEM SHALL exit 1 with a finding
  carrying the rule id, the kind, and both numbers (`scrollWidth 900 > 390`) → test in
  tests/render/render-rules.test.js
- **AC-20260831-02-3**: WHEN `page.scrollWidth` equals `clientWidth` (390 = 390, the
  `overflow-x: hidden` masking case) but an in-flow entry has `box: { x: 0, w: 900 }` THE
  SYSTEM SHALL still emit a finding naming that entry's label and right edge (`900 > 390`) →
  test in tests/render/render-rules.test.js
- **AC-20260831-02-4**: WHEN every entry beyond `clientWidth` carries `fixed`, `outOfFlow`,
  `dataPositioned`, or `srOnly` and `page.scrollWidth` ≤ `clientWidth + 1` THE SYSTEM SHALL
  emit no `no-overflow` finding and exit 0 → test in tests/render/render-rules.test.js
- **AC-20260831-02-5**: WHEN a `no-overflow` rule runs over an inventory document with no
  `page` block THE SYSTEM SHALL exit 1 with a finding naming re-capture with the current
  render-inventory.browser.js — never exit 0 → test in tests/render/render-rules.test.js
- **AC-20260831-02-6**: WHEN a `line-length` rule (`maxCh` 90, `minViewport` 768) runs over an
  inventory with `page.clientWidth` 1200 containing an entry with `box.w` 1200, `fontSize`
  "16px" (→ 150 estimated ch), and text longer than 90 characters THE SYSTEM SHALL emit its
  finding (⚠️-prefixed under `severity: "warn"`, exit 0 when it is the only finding), and the
  same entry with 28-character text SHALL produce no finding; WHEN `page.clientWidth` is 390
  (< `minViewport`) THE SYSTEM SHALL emit no line-length finding at all → tests in
  tests/render/render-rules.test.js
- **AC-20260831-02-7**: WHEN a manifest rule declares `renderCheck.kind` "sparkle" THE SYSTEM
  SHALL CONTINUE TO exit 2 naming the offending rule's id, with the printed closed set now
  including `no-overflow` and `line-length` → existing AC-20260824-04-1 test extended in place
  in tests/render/render-rules.test.js
- **AC-20260831-02-8**: WHEN render-rules.js runs with the shipped
  spec/templates/design-rules.json as `--rules` over an empty inventory THE SYSTEM SHALL exit 0
  (the template's new rows are valid under the extended closed set) → test in
  tests/render/render-rules.test.js

## Assumptions (escalation triggers)

- A1: `getBoundingClientRect` reports an in-flow element's true extent even when
  `overflow-x: hidden` clips it — **executed** (Chromium via Playwright, 2026-08-31: page with
  `html,body{overflow-x:hidden}` + 900px child at 390px viewport → `scrollWidth` 390,
  `clientWidth` 390, child `rect.right` 900). **If false** in a host's engine: the entry leg
  loses only the masked case there; the page leg still catches unmasked overflow.
- A2: real host capture contexts expose `document.scrollingElement || document.documentElement`
  with numeric `scrollWidth`/`clientWidth` — **executed** for Chromium (same spike: overflow
  page → 900/390; adapted page → 390/390). **If false**: D4's guarded read yields nulls and
  D5's fail-closed finding names re-capture — never a silent pass.
- A3: `fixed` elements never inflate `scrollWidth` — **executed** (same spike: a
  `position:fixed; left:2000px; width:300px` element left `scrollWidth` at 900, not 2300) —
  grounds D3's exemption set. **If false** for some engine: a spurious page-leg finding names
  its numbers; the mock author marks the element or fixes it — fail-closed, not fail-open.
- A4: the pre-image refuses the new kind — **executed** (2026-08-31, scratch manifest with
  `kind: "no-overflow"` against installed render-rules.js → exit 2, stderr naming the rule and
  the four-kind closed set) — every new-kind AC is red before build by construction. **If
  false**: STOP, the closed-set contract has drifted; re-read specs/20260824/04 D1.
- A5: `render-gate` regenerates every inventory per run (fresh capture per cell into `--out`),
  so a stale pre-D4 inventory can only meet the new kinds via a manual `render-rules.js`
  invocation — **if false**: D5 already covers the stale document with a blocking finding.

## Rationale

The prax escape (spec 20260823/11) established that the doctrine invariant "`approved` means a
human saw the whole matrix" had no mechanical floor: the only machine checks tied to the
matrix were two static regexes, and no `renderCheck` kind relates any measurement to the
viewport. The fix deliberately rides rails specs/20260824/01+04 already built — render-gate
`--mocks` captures per cell and blocks ratification on rule findings — so the whole spec is
two rule kinds, one capture field, and honesty edits. `brief: n/a` because the brief 08 series
is closed on the roadmap and a `brief: 08` stamp would re-derive it as in-progress; no new
roadmap brief is owed for a single-spec defect fix (recorded per plan lock step 2).

Fragile spots for build: the browser expression must keep its zero-Node, guarded-lookup
discipline (the stub-DOM test's surface is the contract — extend the stub with
`scrollingElement`, don't reach for APIs outside it); the entry leg's exemption test (AC-4)
must construct entries that would fire absent the flags, or it proves nothing; `line-length`'s
document-level `minViewport` skip is silent by design (a declared gate, not missing data — do
not emit a skip finding for it). Adding two members to the kind list touches the
AC-20260824-04-1 test's loop and design.md's kind list — both are in the File Plan; per the
measured 2026-08-24 ruling, no further lock-time closure is owed for exhaustive-pin membership
growth. Collision-closure literals leg (run at lock over "matrix checks" and the four-kind
list): `spec/scripts/design-atlas.js` and `spec/scripts/render-rules.js` are File Plan rows;
`tests/design-atlas.test.js` is **waived** — its hits are test *names* and assert *messages*
describing the viewport-meta check's binding behavior (AC-20260824-03-5), which D9 preserves
verbatim; D9 edits only design-atlas.js comments, never the output or binding those tests
execute. Executes-leg read: `tests/render/render-gate.test.js` drives capture via fixture
scripts writing canned inventories, so the D4 capture change cannot alter what it observes —
no fixture repair owed. Rejected alternatives: viewport passed as a render-rules flag (`--viewport`) instead
of captured (breaks standalone invocation and makes the inventory non-self-describing);
thresholds in `targets.json` (D8); shrink-only baseline support (D7, JJ ruling);
`content-measure` as a blocking rule (JJ ruling — warn-only until its false-positive rate is
observed in a real host).

## Canonical Delta

None — this repo keeps no docs/canonical/design-render.md; doctrine (design.md) is edited
directly in the File Plan.
