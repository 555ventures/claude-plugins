---
date: 2026-08-24
status: implementing
diff_base: ecec5570e8e06d069e2fd78fea88b8212093181d
tier: standard           # additive script + additive field on design-rules.json; render-gate.js gains a mode (not a critical-named surface); no contract edit
area: design-stage
design: false
breaking: false
depends_on: [specs/20260824/03-mock-states-hygiene.md]
depended_on_by: [specs/20260824/05-design-doctrine-cut.md]
brief: 08
open_markers: 0
---

# Design rules execute on the render

## Goal

Run the design rules genesis authored as falsifiable thresholds as a script over the render
inventory — CTA count, touch-target size, contrast, colors within the token palette — at
`/spec:sketch` exit (over the mock render) and inside the render gate (over the component
render), replacing the Sonnet rule-checklist walk in both places and in `/spec:review`'s
design leg. Done means: a rule carrying a `renderCheck` fails closed with a measured number
against its threshold, and a rule without one is reported as source-side, never silently
dropped.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-rules.json` entries gain an optional `renderCheck` object with a closed `kind` set: `target-size {min}`, `cta-count {max, tokens[]}`, `contrast {min, minLarge}`, `palette {}`; unknown `kind` is a manifest error (exit 2 naming the rule id); entries without `renderCheck` are counted once as `source-side=<n>` (AC-20260824-04-1, AC-20260824-04-6) | The manifest's `intent` is prose; a render check needs the number in a machine field; closed set so nothing is half-checked |
| D2 | `render-rules.js --rules <manifest> --inventory <json>… --tokens <tokens.css> [--json]` executes every `renderCheck` over each inventory: `target-size` — every interactive entry (`role ∈ button,link,textbox,combobox,checkbox,radio`) not `srOnly` must have `box.w ≥ min && box.h ≥ min`; `cta-count` — entries with `role: button` whose `background` resolves to one of `tokens[]` are counted per inventory, `> max` is a finding; `contrast` — every text entry's WCAG 2.x contrast ratio between `color` and `effectiveBackground` must be `≥ min` (`≥ minLarge` when `fontSize ≥ 24px`, or `≥ 18.66px` with `fontWeight ≥ 700`); `palette` — every entry's `color` and `effectiveBackground` must equal a resolved token color (AC-20260824-04-2, AC-20260824-04-3, AC-20260824-04-4, AC-20260824-04-5) | Brief Scope 4: the four checks the field's a11y baseline (WCAG 2.2 AA) and the anti-slop class name; each is a lookup or arithmetic over the inventory |
| D3 | Palette resolution parses `tokens.css` custom properties (`--name: <value>`) in every block; values in `#rgb/#rgba/#rrggbb/#rrggbbaa`, `rgb()/rgba()`, and one-level `var(--other)` references resolve to `rgb(r, g, b)`; the `[data-theme="dark"]` block's values join the palette (both themes are legal); anything else is reported once as `unresolvable --name <value>` (advisory, exit unaffected) (AC-20260824-04-5, AC-20260824-04-7) | Both hosts' `tokens.css` are hex-valued (read 2026-08-24); DTCG JSON emission (research note) is out of scope — the lookup works on the file that exists |
| D4 | `render-inventory.browser.js` gains `effectiveBackground` (the nearest ancestor-or-self computed `background-color` whose alpha is non-zero, else the document's) and `fontWeight`; `schemaVersion` stays 1 (additive keys) (AC-20260824-04-8) | Contrast is meaningless against `rgba(0,0,0,0)`; additive so spec 01's fixtures stay valid |
| D5 | `render-gate.js` runs `render-rules.js` over every component inventory after comparison when the host config declares `design.rulesManifest`; rule findings are printed under the cell as `rule <id> <kind> …` and fail the gate; no manifest → one line `rules: no design.rulesManifest declared — skipped`; a new mode `render-gate.js --mocks <mock>…` captures the mocks only (no ledger, no component URL, no comparison) and runs the rules over them (AC-20260824-04-9, AC-20260824-04-10) | One gate, one exit; sketch exit needs rules without stories |
| D6 | `/spec:sketch` exit runs `node "$(spec-paths render-gate)" --mocks <the brief's mocks>` after the expansion pass (spec 03 D3) and before the ratify question, replacing the Sonnet rule-checklist pass; `/spec:review`'s design legs drop the Sonnet rule-checklist walk (the advisory render-gate run from spec 01 D16 now carries the rules); the component-manifest audit stays [no-ac: prose; the script behavior is AC-9/10] | core § Rule Enforcement: rules a script can check are never checked by an LLM at runtime |
| D7 | The mock-side color-literal grep in `design-atlas.js check` stays (authoring-time hygiene); `/spec:enforce`'s source-side `color` category is untouched — the enforce inversion is brief 10's [no-ac: absence of change] | 📌 Auto-picked: the brief's "replacing the source-side hex grep" is honored at the gate (palette check on the render); the enforce-side grep is a different owner (veto anytime) |
| D8 | `spec/templates/design-rules.json` gains `renderCheck` on its examples (`min-target-size`-style `target-size {min: 44}`, a `cta-count {max: 1, tokens: ["--accent"]}` example, `contrast {min: 4.5, minLarge: 3}`, `palette {}` on `no-raw-color`); hosts add `renderCheck` to their own rules by hand — `/spec:doctor` warns nothing about it (out of scope, brief 11) [no-ac: template data; genesis authors from it] | The template is what greenfield copies; brownfield edits one field per rule |
| D9 | New-surface checklist: `spec-paths` key `render-rules` + usage line; `entrypoints.json` row (`render-rules.js` ← `spec/scripts/render-gate.js`); plugin.json bump to next free 7.34.x [no-ac: suite guards] | — |
| D10 | `spec/doctrine/genesis.md`'s rules paragraph drops its now-false claim that the checklist walk also runs **at review** (this build retired that walk) and states that a rule carrying a `renderCheck` is executed by `render-rules.js`, the checklist surviving only at the explore stage, which precedes `design-rules.json` and so has no manifest to execute [no-ac: prose] | JJ ruling 2026-08-25: the waiver covered explore's *use* of the walk, not a doctrine sentence asserting a behavior this spec deleted; brief 10 still owns adopting `render-gate --mocks` for explore candidates |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/render-rules.js | CREATE | scripts | Rule executor (D1–D3): manifest validation, palette resolution, four kinds, findings + `source-side=<n>` + `unresolvable` lines, `--json`, exit 0/1/2 |
| spec/scripts/render-gate.js | MODIFY | scripts | Rules pass per component inventory when `design.rulesManifest` is declared; skip line otherwise; `--mocks` mode (D5) |
| spec/scripts/render-inventory.browser.js | MODIFY | scripts | `effectiveBackground` + `fontWeight` per entry (D4) |
| spec/bin/spec-paths | MODIFY | scripts | Key `render-rules` + usage line |
| spec/entrypoints.json | MODIFY | scripts | Row for `render-rules.js` |
| spec/templates/design-rules.json | MODIFY | doctrine | `renderCheck` examples (D8) |
| spec/commands/sketch.md | MODIFY | doctrine | Exit: `render-gate --mocks` replaces the Sonnet rule-checklist pass (D6) |
| spec/commands/review.md | MODIFY | doctrine | Design legs: drop the Sonnet rule-checklist walk; the advisory render-gate run carries the rules (D6) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | REVIEWER step printed text: `two parallel Sonnet design-leg agents (rule-checklist + …)` → the manifest audit alone plus the render-gate run (D6) — text only |
| spec/doctrine/design.md | MODIFY | doctrine | § Design Canon harness paragraph: "rule-checklist pass" sentence → the render rules run (this paragraph only; spec 05 rewrites the file) |
| spec/doctrine/genesis.md | MODIFY | doctrine | Rules paragraph: drop the retired at-review checklist claim; name `render-rules.js` (D10) — this paragraph only |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.34.0, next-free rule) + changelog |
| tests/render/render-rules.test.js | CREATE | tests | AC-20260824-04-1, AC-20260824-04-2, AC-20260824-04-3, AC-20260824-04-4, AC-20260824-04-5, AC-20260824-04-6, AC-20260824-04-7 |
| tests/render/render-inventory.test.js | MODIFY | tests | AC-20260824-04-8 |
| tests/render/render-gate.test.js | MODIFY | tests | AC-20260824-04-9, AC-20260824-04-10 |
| tests/spec-paths.test.js | MODIFY | tests | Extend the key-set pin with `render-rules` |

## Contracts

`renderCheck` on a `design-rules.json` entry (additive; `schemaVersion` unchanged):

```jsonc
{ "id": "min-target-size", "intent": "…", "targetCategory": "density", "severity": "error",
  "renderCheck": { "kind": "target-size", "min": 44 } }
{ "id": "one-primary-cta", "targetCategory": "layout",
  "renderCheck": { "kind": "cta-count", "max": 1, "tokens": ["--accent", "--cta-bg"] } }
{ "id": "text-contrast-aa", "targetCategory": "a11y",
  "renderCheck": { "kind": "contrast", "min": 4.5, "minLarge": 3 } }
{ "id": "no-raw-color", "targetCategory": "color",
  "renderCheck": { "kind": "palette" } }
```

`render-rules.js` output:

```
rule min-target-size target-size "Tiny" 40.7×20px < 44px            (finding)
rule one-primary-cta cta-count 2 > 1 ("Primary action", "Save")       (finding)
rule text-contrast-aa contrast "Muted note" 4.48 < 4.5 (rgb(119, 119, 119) on rgb(255, 255, 255))
rule no-raw-color palette "Badge" color rgb(1, 2, 3) not in tokens.css
unresolvable --shadow 0 1px 2px rgba(0,0,0,.2)                         (advisory)
rules=<n> checked=<n> source-side=<n> findings=<n>
```

Exit 0 = no findings · 1 = findings · 2 = unreadable manifest/inventory/tokens or unknown
`kind` (stderr names the rule id and the remedy). Contrast: relative luminance per WCAG 2.x
(`sRGB → linear`, `L = 0.2126R + 0.7152G + 0.0722B`, ratio `(L1 + 0.05) / (L2 + 0.05)`),
rounded to 2 dp for the message, compared unrounded.

`render-gate.js --mocks <mock>… [--root <dir>] [--out <dir>] [--json]`: preconditions are
`design.render`, `targets.json`, and the mock files; captures each mock × state × theme ×
viewport, runs `render-rules` over each mock inventory when `design.rulesManifest` is
declared; no ledger read, no component capture; same sentinels and exit alphabet.

## Behavior

- Rule findings on the component side fail the render gate exactly like fidelity findings;
  on the mock side (sketch exit) they block ratification until the mock is fixed or the rule
  is amended — never excused per surface.
- A `severity: "warn"` rule prints its finding prefixed `⚠️` and does not affect the exit.

## Acceptance Criteria

- **AC-20260824-04-1**: WHEN the manifest carries a rule with `renderCheck.kind: "sparkle"`
  THE SYSTEM SHALL exit 2 naming that rule's `id` and the closed kind set → `render-rules.test.js`
- **AC-20260824-04-2**: WHEN an inventory has a `button` entry with box `40.7×20` and a rule
  `target-size {min: 44}` THE SYSTEM SHALL print `rule <id> target-size "Tiny" 40.7×20px <
  44px` and exit 1; a `44×44` button and a `1×1` `srOnly` link SHALL produce no finding →
  `render-rules.test.js`
- **AC-20260824-04-3**: WHEN two `button` entries have `background: rgb(34, 85, 204)`, tokens
  declare `--accent: #2255cc`, and the rule is `cta-count {max: 1, tokens: ["--accent"]}` THE
  SYSTEM SHALL print `cta-count 2 > 1` naming both texts and exit 1; one such button SHALL pass
  → `render-rules.test.js`
- **AC-20260824-04-4**: WHEN a text entry is `color: rgb(119, 119, 119)` on
  `effectiveBackground: rgb(255, 255, 255)` under `contrast {min: 4.5}` THE SYSTEM SHALL print
  `contrast "…" 4.48 < 4.5` and exit 1; `rgb(118, 118, 118)` on white (4.54) SHALL pass; a
  `fontSize: "24px"` entry at 3.2 with `minLarge: 3` SHALL pass → `render-rules.test.js`
- **AC-20260824-04-5**: WHEN tokens declare `--pos: #1a8f3a` and an entry's `color` is
  `rgb(26, 143, 58)` under `palette {}` THE SYSTEM SHALL pass; an entry `color: rgb(1, 2, 3)`
  SHALL print `palette "…" color rgb(1, 2, 3) not in tokens.css` and exit 1 → `render-rules.test.js`
- **AC-20260824-04-6**: WHEN the manifest has 3 rules of which 1 carries `renderCheck` THE
  SYSTEM SHALL print `rules=3 checked=1 source-side=2` → `render-rules.test.js`
- **AC-20260824-04-7**: WHEN tokens declare `--ink: #111` and `--text: var(--ink)` THE SYSTEM
  SHALL resolve `--text` to `rgb(17, 17, 17)`; WHEN tokens declare `--shadow: 0 1px 2px
  rgba(0,0,0,.2)` THE SYSTEM SHALL print `unresolvable --shadow …` once and leave the exit
  unaffected → `render-rules.test.js`
- **AC-20260824-04-8**: WHEN the walker meets a text element whose own `backgroundColor` is
  `rgba(0, 0, 0, 0)` under an ancestor with `rgb(16, 16, 16)` THE SYSTEM SHALL record
  `effectiveBackground: "rgb(16, 16, 16)"` and the element's `fontWeight` →
  `render-inventory.test.js`
- **AC-20260824-04-9**: WHEN the synthetic root declares `design.rulesManifest` with a
  `target-size {min: 44}` rule and the canned component inventory carries a `20×20` button THE
  SYSTEM SHALL print `rule … target-size` under that cell, `__RENDER_GATE_FAIL__`, exit 1; WHEN
  no `rulesManifest` is declared THE SYSTEM SHALL print `rules: no design.rulesManifest
  declared — skipped` and CONTINUE TO exit 0 on a clean comparison → `render-gate.test.js`
- **AC-20260824-04-10**: WHEN `render-gate.js --mocks <one mock>` runs with 2 themes × 3
  viewports and 1 state THE SYSTEM SHALL invoke the capture exactly 6 times, every `--url`
  matching the built-in server's mock origin, read no ledger, and exit 0 with
  `__RENDER_GATE_PASS__` when the rules pass → `render-gate.test.js`

## Assumptions (escalation triggers)

- A1 (arithmetic, not dependency-adjudicated): contrast(#777777, #ffffff) = 4.48:1 and
  contrast(#767676, #ffffff) = 4.54:1 (WCAG 2.x formula; the AA boundary pair the tests use) —
  **if false** by rounding in the implementation: compare unrounded, print 2 dp.
- A2: Both hosts' `.claude/genesis/design-rules.json` carry target-size and a11y rules
  (salon-os `min-target-size`, prax `target-size-floor`; read 2026-08-24) that a one-field
  edit makes executable — **if false:** the template examples are the only carriers.
- A3: Storybook story canvases paint a document background matching the theme (prax
  `data-scheme`, salon-os `globals=theme:`; spike-verified 2026-08-24) so
  `effectiveBackground` is never the transparent default on the component side — **if false:**
  the contrast check reports `unresolvable background` for that entry (advisory) rather than
  a false finding.

## Rationale

The rules genesis writes are already numeric; what was missing was a reader that is not a
model. Four kinds cover what the inventory can measure: size and count from boxes and roles,
contrast and palette from computed colors — which is why the walker gains an effective
background here rather than in spec 01 (spec 01's comparison never reads color). Palette
membership is a lookup against `tokens.css` because that file exists on both hosts today; the
DTCG JSON the research sweep recommends would make the same lookup format-neutral and is a
one-line note for genesis-design (brief 10), not this series. The Sonnet checklist walk goes
in all three places it lived (sketch exit, design gate, review leg) because a rule a script
checks is never checked by an LLM at runtime — the walk was the named downgrade.

Collision-closure at lock (2026-08-24): `likely` = `tests/consistency/entrypoints.test.js`
(exhaustive pin, no waive owed). Literals leg `rule-checklist`: `spec/commands/review.md` and
`spec/scripts/spec-review-driver.js` are rows; `spec/commands/design.md` is rewritten by spec
02 without a checklist step; `spec/commands/genesis-explore.md` and `spec/doctrine/genesis.md`
run the checklist over explore candidates before a direction pick — the genesis family is
brief 10's and is **waived** here (brief 10 should adopt `render-gate --mocks` for candidate
tiles; noted in the plan report). Narrowed at build (D10): the waiver covers explore's *use*
of the walk, not `genesis.md`'s sentence asserting the walk also runs **at review** — a
behavior this spec deletes — so that clause is corrected in scope.

Rejected: reading rule thresholds out of `intent` prose with a regex (fragile, and the model
that wrote the prose can write the field); per-surface rule excuses (a rule is amended or it
binds); moving `/spec:enforce`'s color grep (brief 10 owns the inversion).

## Canonical Delta

`docs/canonical/design.md` gains **Executable design rules (2026-08-24, specs/20260824/04)**:
`design-rules.json` entries may carry `renderCheck` (`target-size`, `cta-count`, `contrast`,
`palette`); `render-rules.js` executes them over render inventories with a palette resolved
from `tokens.css`; the render gate runs them on the component render when
`design.rulesManifest` is declared, `/spec:sketch` exit runs them on the mock render via
`render-gate --mocks`, and the Sonnet rule-checklist walk is retired from sketch, design, and
review.
