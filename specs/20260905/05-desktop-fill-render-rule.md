---
date: 2026-09-05
status: done
tier: standard
area: design-render
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260905/06-plugin-owned-capture-at-approval.md]
brief: n/a
spiked: 2026-09-05
open_markers: 0
diff_base: 234301e30c975d26abb065ed30cc124cdefc6697
---

# Desktop fill as a rendered rule (`desktop-fill` + `data-narrow`)

## Goal

A mock whose content stays at phone width on the widest declared viewport passes every
rendered check today: `no-overflow` sees nothing past the edge and `line-length` sees only
short lines. Hearwell's client shell is the measured case — a 430px column centred at 1440px,
26–28% of the viewport on 15 of 31 mocks, ratifiable clean; JJ's ruling 2026-09-05: "it should
be responsive". Done means: `render-rules.js` gains a `desktop-fill` check kind that measures
how much of the viewport a mock's in-flow content spans at wide cells and fails a phone-width
column unless the mock's root declares `data-narrow`; the shipped rules template carries the
rule; and the canon template asks each shell what it does at every declared viewport before
the first screen is drawn. Where the rule *runs* for hosts with no capture command is the
sibling spec 06's job — this spec lands the measurement and the doctrine, green on its own.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `render-rules.js`'s closed `renderCheck.kind` set gains `desktop-fill`; the set stays closed and an unknown kind still exits 2 naming the full seven-member set (AC-20260905-05-1, AC-20260905-05-7) | Amends specs/20260824/04 D1's member list the way specs/20260831/02 D1 did, never its refusal contract |
| D2 | The measurand is **content span**, not root width: over every entry with a `box` and none of `fixed`/`outOfFlow`/`dataPositioned`/`srOnly`, `span = max(box.x + box.w) − min(box.x)`; `fraction = span / page.clientWidth` (AC-20260905-05-1, AC-20260905-05-2) | Executed spike (Assumptions A1): Hearwell's `data-screen-label` root is `body`-wide (1440 of 1440) — the 430px column is the shell region inside it, so the queue payload's "root width" would pass the exact case it targets; content span needs no new geometry in the inventory |
| D3 | The check is viewport-gated like `line-length`: runs only on documents with `page.clientWidth >= minViewport` (template 1024), silently skipping narrower cells; a document with no usable `page` block emits the D5-of-spec-02 fail-closed re-capture finding (AC-20260905-05-2, AC-20260905-05-4) | Thresholds live in the manifest (specs/20260831/02 D8); render-rules never reads `targets.json`, so "the widest declared viewport" is expressed as a manifest gate the host sets from its own matrix |
| D4 | Template threshold `minFraction: 0.5`, not the payload's ~0.6 (AC-20260905-05-8) | Executed calibration over all 31 Hearwell mocks at 1440 (A2): phone-column mocks 26–28%, every real desktop surface 59% or more — 0.6 would trip five terminal-window screens at 59%; 0.5 sits mid-gap with margin both ways |
| D5 | A finding fires when `fraction < minFraction` AND the inventory's top-level `narrow` is not `true`; the finding line carries span, clientWidth, both percentages, and the two remedies (widen the layout, or declare `data-narrow`) (AC-20260905-05-1, AC-20260905-05-3) | The escape hatch is a declared mark on the mock, the same family as `data-positioned`/`data-contract` — the author's assertion, visible in the file, never a per-surface excuse at gate time; Hearwell's `console-signin` (a centred sign-in card, 27%) is the legitimate narrow case |
| D6 | `render-inventory.browser.js` adds a top-level `narrow: <boolean>` read via the labeled root's `hasAttribute('data-narrow')` (false when no labeled root or no attribute); `schemaVersion` stays 1 (AC-20260905-05-5) | The rule reads only the inventory; `hasAttribute` is inside the stub-DOM surface the file is written against (AC-20260824-01-13); additive keys kept schemaVersion 1 in specs/20260824/04 D4 and specs/20260831/02 D4 |
| D7 | A document at or above `minViewport` with zero measurable entries emits a fail-closed finding naming the empty measurement, never a silent pass (AC-20260905-05-6) | Render-family invariant: a capture that measured nothing is never green; a mock whose every entry is fixed or out of flow has no in-flow content to fill a desktop with, which is exactly the question |
| D8 | `spec/templates/mocks-canon.md` § Shells gains the sentence JJ approved 2026-09-05 verbatim: "For each shell, state what it does at every viewport in `design/targets.json` — how the content area uses a wide screen (columns, rails, a wider measure), or, if the shell is deliberately a narrow column at every width, say so and mark its mocks `data-narrow`." (AC-20260905-05-9) | JJ ruling: full sentence, not the shorter clause — a cold canon author needs to know what "responsive" means here; the upstream fix that catches the mistake before the first screen exists |
| D9 | `data-narrow` joins the declared-mark vocabulary in design.md § Design Canon and sketch.md step 6's mark list; design.md's kind list gains `desktop-fill` [no-ac: doctrine prose — the AC-20260824-05-2 160-line cap on design.md is the mechanical check; content is reviewed by the doctrine leg] | The marks a mock may declare are documented in one place (design.md) and checked at sketch exit; an undocumented mark is an oral tradition |
| D10 | No enforcement-point change in this spec: the rule rides `render-gate --mocks` wherever it already runs (`/spec:sketch` exit on hosts declaring a capture command); binding it for mocks-first hosts with no capture command is specs/20260905/06 [no-ac: deliberate no-op; slicing by landing unit] | This spec is green and useful alone (prax/salon-os/upwell sketch flows); spec 06 overturns an ADR ruling and carries its own risk, so it lands separately with `depends_on` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/render-rules.js | MODIFY | scripts | `desktop-fill` kind (D2/D3/D4/D5/D7): CLOSED_KINDS + die message, `checkDesktopFill`, header addendum |
| spec/scripts/render-inventory.browser.js | MODIFY | scripts | Top-level `narrow` from the labeled root's `data-narrow` (D6); header addendum |
| spec/templates/design-rules.json | MODIFY | doctrine | Add `desktop-fill` rule (severity error, grounded, `minFraction` 0.5, `minViewport` 1024) |
| spec/templates/mocks-canon.md | MODIFY | doctrine | § Shells gains D8's sentence inside the existing brace prompt |
| spec/doctrine/design.md | MODIFY | doctrine | § Design Canon: kind list gains `desktop-fill`; mark vocabulary gains `data-narrow` (deliberately-narrow root) — net ≤ +2 lines, file stays ≤ 160 |
| spec/commands/sketch.md | MODIFY | doctrine | Step 6's declared-mark list gains `data-narrow` |
| tests/render/render-rules.test.js | MODIFY | tests | AC-20260905-05-1, AC-20260905-05-2, AC-20260905-05-3, AC-20260905-05-4, AC-20260905-05-6, AC-20260905-05-7, AC-20260905-05-8 |
| tests/render/render-inventory.test.js | MODIFY | tests | AC-20260905-05-5 |
| tests/design-template.test.js | CREATE | tests | AC-20260905-05-9 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.87.0 — next free at build time per Gotchas) + changelog paragraph |

## Contracts

Inventory document (additive, `schemaVersion` stays 1):

```js
{
  schemaVersion: 1,
  theme, state, root,
  narrow: false,          // NEW (D6) — true iff the labeled root hasAttribute('data-narrow');
                          //   false when no labeled root (body walk) or no attribute
  page: { scrollWidth, clientWidth },
  entries: [ … ]
}
```

Manifest rule shape (host-authored; template row):

```json
{ "id": "desktop-fill", "severity": "error", "grounding": "grounded",
  "intent": "At wide viewports a mock's content must use the screen — no phone-width column centred on a desktop unless the root declares data-narrow.",
  "targetCategory": "layout",
  "renderCheck": { "kind": "desktop-fill", "minFraction": 0.5, "minViewport": 1024 } }
```

`desktop-fill` (D2–D7) — per inventory document:

- `page` block missing or either field non-numeric → the existing fail-closed finding
  `rule <id> desktop-fill inventory has no page geometry (theme <theme> state <state>) — re-capture with the current render-inventory.browser.js`
- `page.clientWidth < minViewport` → silent skip (declared gate, never a finding)
- measurable = entries with a `box` and `!fixed && !outOfFlow && !dataPositioned && !srOnly`;
  zero measurable → `rule <id> desktop-fill no in-flow entries to measure at <clientWidth>px`
- `span = max(x + w) − min(x)`, `fraction = span / clientWidth`; when
  `fraction < minFraction && doc.narrow !== true` →
  `rule <id> desktop-fill content spans 396px of 1440px (28% < 50%) — widen the layout for this viewport or declare data-narrow on the root`
  (percentages `Math.round(fraction * 100)` and `Math.round(minFraction * 100)`; px values
  `Math.round`)

Literal examples (D2/D4/D5): entries at `x: 522, w: 396` and `x: 522, w: 200`, clientWidth
1440 → span 396, 28% → fires against 0.5. The same document with `narrow: true` → no finding.
Entries at `x: 141, w: 1157`, clientWidth 1440 → 80% → passes. An entry at `x: 2000, w: 300`
with `fixed: true` is excluded from both min and max.

Canon template § Shells (D8) — the brace prompt becomes:

```
{ The app shell(s) this product needs, if any — persistent chrome around a content slot (nav,
header, tab bar). Name each shell and what it always shows; "none" is a legitimate answer for
a single-surface product. For each shell, state what it does at every viewport in
`design/targets.json` — how the content area uses a wide screen (columns, rails, a wider
measure), or, if the shell is deliberately a narrow column at every width, say so and mark its
mocks `data-narrow`. }
```

## Behavior

Nothing changes in any command flow (D10). Hosts whose manifest carries the template's new
row see, at `/spec:sketch` exit, one finding per wide cell whose content stays narrow; a
`sketch` mock that is a deliberate narrow column (a sign-in card, a receipt) gets
`data-narrow` on its labeled root and passes. Cells below `minViewport` never fire, so a
mobile-only `targets.json` never sees the rule. Hosts without a manifest, and manifests
without the row, behave byte-identically to today. The canon template's new sentence
changes what `/spec:mocks` asks the author at CANON — nothing mechanical reads it in this
spec.

## Acceptance Criteria

- **AC-20260905-05-1**: WHEN a `desktop-fill` rule (`minFraction` 0.5, `minViewport` 1024)
  runs over an inventory with `page: { scrollWidth: 1440, clientWidth: 1440 }`, `narrow:
  false`, and in-flow entries at `x: 522, w: 396` and `x: 522, w: 200` THE SYSTEM SHALL exit 1
  with the finding `rule desktop-fill desktop-fill content spans 396px of 1440px (28% < 50%)`
  naming both remedies (`widen`, `data-narrow`) → test in tests/render/render-rules.test.js
- **AC-20260905-05-2**: WHEN the same rule runs over a document with `page.clientWidth` 390
  (< `minViewport`) THE SYSTEM SHALL emit no desktop-fill finding and exit 0, and WHEN it runs
  over a 1440-wide document whose in-flow entries span `x: 141 … 1298` (80%) THE SYSTEM SHALL
  emit no finding → tests in tests/render/render-rules.test.js
- **AC-20260905-05-3**: WHEN the AC-1 document carries `narrow: true` THE SYSTEM SHALL emit
  no desktop-fill finding and exit 0 → test in tests/render/render-rules.test.js
- **AC-20260905-05-4**: WHEN a `desktop-fill` rule runs over an inventory document with no
  `page` block THE SYSTEM SHALL exit 1 with a finding naming re-capture with the current
  render-inventory.browser.js — never exit 0 → test in tests/render/render-rules.test.js
- **AC-20260905-05-5**: WHEN the capture expression walks a page whose labeled root carries
  `data-narrow` THE SYSTEM SHALL return top-level `narrow: true`; WHEN the root carries no
  such attribute, or no element carries `data-screen-label`, THE SYSTEM SHALL return
  `narrow: false` → stub-DOM tests in tests/render/render-inventory.test.js
- **AC-20260905-05-6**: WHEN a `desktop-fill` rule runs over a 1440-wide document whose only
  entries are `fixed: true` or `outOfFlow: true` (zero measurable) THE SYSTEM SHALL exit 1 with
  a finding containing `no in-flow entries to measure at 1440px` → test in
  tests/render/render-rules.test.js
- **AC-20260905-05-7**: WHEN a manifest rule declares `renderCheck.kind` "sparkle" THE SYSTEM
  SHALL CONTINUE TO exit 2 naming the offending rule's id, with the printed closed set now
  including `desktop-fill` → existing AC-20260824-04-1/AC-20260831-02-7 test extended in place
  in tests/render/render-rules.test.js
- **AC-20260905-05-8**: WHEN render-rules.js runs with the shipped
  spec/templates/design-rules.json as `--rules` over an empty inventory THE SYSTEM SHALL
  CONTINUE TO exit 0, and the parsed template SHALL contain a rule whose `renderCheck` is
  `{ kind: "desktop-fill", minFraction: 0.5, minViewport: 1024 }` with `severity: "error"` →
  existing AC-20260831-02-8 test extended in place in tests/render/render-rules.test.js
- **AC-20260905-05-9**: WHEN spec/templates/mocks-canon.md is read THE SYSTEM SHALL contain,
  inside the § Shells section, the literal phrase `at every viewport in` and the literal
  token `data-narrow` → test in tests/design-template.test.js (a file read of the shipped
  template — the template is a shipped artifact and its content is the deliverable)

## Assumptions (escalation triggers)

- A1: the `data-screen-label` root is not the element that carries the narrow layout —
  **executed** (2026-09-05, headless Chrome via DevTools over `design-atlas.js serve` on
  Hearwell, `mocks/my-sessions.html` at 1440×900: root `rootW` 1440, `data-shell-region`
  width 430, `page` 1440/1440, in-flow entries' max right edge 903). **If false** in some host
  (root itself narrow): D2's span measure is unaffected — it never reads the root's box.
- A2: content span separates the classes with margin — **executed** (same session, all 31
  Hearwell mocks at 1440: client-shell mocks 26–28%, `console-signin` 27%, `dev-*` terminal
  screens 59–60%, `console-account` 62%, console/oversight screens 81%). **If false** for a
  host whose desktop surfaces legitimately sit near 50%: the host lowers `minFraction` in its
  own manifest (D3/specs/20260831/02 D8) — no plugin change.
- A3: the pre-image refuses the new kind — **executed** (2026-09-05, scratch manifest with
  `kind: "desktop-fill"` against installed render-rules.js → exit 2, stderr naming the rule
  and the six-kind closed set). **If false**: STOP, the closed-set contract has drifted.
- A4: `hasAttribute` on the labeled root is within the capture contract's stub-DOM surface
  (AC-20260824-01-13 guarantees `hasAttribute`) — **verified by reading** render-inventory
  .browser.js's own `hasAttr` helper, already used on the same root for `data-screen-label`.
  **If false**: STOP — the stub surface is a frozen contract.
- A5: design.md is at 156 lines against the 160-line cap (AC-20260824-05-2) — **executed**
  (`wc -l`). D9's edits are worded inline (kind list + one mark clause); **if** the build
  cannot land them within the cap, compress the existing § Design Canon sentences without
  dropping a claim, as specs/20260831/02 did — never raise the cap.

## Rationale

The queue payload (written at the Hearwell look stop) named the measurand as the labeled
root's rendered width. The first executed spike falsified that: Hearwell's roots are
`body`-wide, the column is a child. Content span — the horizontal extent of the in-flow
entries the inventory already carries — is the honest measure of "does the content use the
screen", needs no new geometry, and is what the calibration was run on. The threshold moved
from the payload's ~0.6 to 0.5 on that calibration: five Hearwell terminal-window screens sit
at 59%, and a rule that trips a full-screen terminal frame is a false positive JJ would waive
on sight. `minViewport` 1024 (not 768) because 768 is a tablet where a single column is often
right; the template's own desktop target is 1280.

`data-narrow` is a declared mark, not a manifest exemption list, for the same reason
`data-positioned` is: the assertion lives in the file the author edits, next to the thing it
excuses, and `shell sync` carries it. The canon sentence is the upstream half — JJ's ruling
2026-09-05 chose the full wording over a shorter clause.

Fragile spots for build: the AC-6 zero-measurable finding must fire only at or above
`minViewport` (below it the document is skipped before measuring); the AC-2 80% fixture must
be built from entries that would trip a root-width reading if that were the measurand (it is
not — the test proves span); the `narrow` capture must stay a guarded `hasAttr` read on
`labeledRoot`, never `document.querySelector`. Collision-closure literals leg (run at lock
over "no-overflow/line-length" as the kind list): `spec/scripts/design-atlas.js`'s header
comment and matrix-check comment name the two kinds as "the" adaptation kinds — **waived**,
comment-only, still true (both kinds still exist; this spec adds a third, not a rename);
`docs/canonical/design.md`'s kind list is updated by the Canonical Delta. Executes-leg read:
`tests/render/render-gate.test.js` drives capture via fixture scripts writing canned
inventories with no `narrow` key — `doc.narrow !== true` treats absence as false, so no
fixture repair is owed in this spec (spec 06 repairs the one fixture its default manifest
reaches).

Rejected: measuring root width (falsified, A1); a `targets.json`-read inside render-rules to
find the widest viewport (D8 of spec 02 keeps thresholds in the manifest; `minViewport` is
the same shape `line-length` already uses); severity `warn` (JJ ruled "it should be
responsive" — a warn would have passed Hearwell again); binding for capture-less hosts in
this spec (spec 06, own ADR, own risk).

Build deviations (folded at review close, both one-offs): D9's "kind list gains `desktop-fill`"
met a design.md that carried no explicit renderCheck kind list, so the Render rules pass sentence
gained one clause naming the kind instead of a new list. The +2 net lines that clause and the
`data-narrow` mark cost pushed two commands' read-load budgets over by exactly two lines on the
whole-suite review leg (`/spec:design` 502 > 500, `/spec:init` 972 > 970); per A5 the same
paragraph was compressed back to net +0 (156 lines), no claim dropped, never a raised cap. Review
pass 1 also surfaced that a `desktop-fill` manifest row with a missing or non-numeric threshold
passed validation and measured nothing (exit 0); it is now refused at validation (exit 2, rule id,
field, expected shape, remedy) — scoped to this kind only; `line-length` keeps its prior shape.
Canonical Delta note: docs/canonical/design.md had never received `no-overflow`/`line-length`
into its kind sentence, so the Delta landed those two names beside `desktop-fill`; the mark
vocabulary lives in that doc's § Mock hygiene and marks, not a "Shell-composed mocks" section.

## Canonical Delta

In docs/canonical/design.md § Executable design rules, the closed `kind` set sentence gains
`desktop-fill {minFraction, minViewport}` after `line-length` with one clause: "measures the
in-flow content span against `page.clientWidth` at cells at or above `minViewport`, failing a
phone-width column unless the mock's root declares `data-narrow` (inventory top-level
`narrow`)". In § Shell-composed mocks' mark vocabulary sentence, add `data-narrow` (a
deliberately narrow root at every width). Append one line: "The canon template's § Shells
asks what each shell does at every declared viewport (specs/20260905/05 D8)."
