---
date: 2026-08-24
status: hardened
tier: standard           # additive checks in design-atlas.js (not a critical-named surface), sketch.md prose, one doctrine paragraph
area: design-stage
design: false
breaking: false
depends_on: [specs/20260824/02-design-stage-on-render-gate.md]
depended_on_by: [specs/20260824/04-render-rules.md]
brief: 08
open_markers: 0
---

# Mock states, hygiene, and the sketch-exit matrix

## Goal

Make mocks render-gate-ready at the moment they are ratified: the harness check gains the
hygiene rules each measured false-positive class needs (`border-box` reset, declared
line-heights, no device frame, state controls outside the contract), states and non-contract
regions are declared in the mock with the vocabulary the gate reads, and the matrix expansion
moves to `/spec:sketch`'s exit so **ratified = approved, one stamp**. Done means: a mock that
passes `design-atlas.js check` at `ratified` carries nothing the gate would misread as a
component defect.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js check` gains four hygiene checks, bound at `data-status` `ratified` or `approved` (or under `--matrix`), free at `sketch`: (a) a universal `box-sizing: border-box` rule exists in the file's own `<style>`; (b) every CSS block in the file's own `<style>` that declares `font-size` also declares `line-height`; (c) the rule(s) matching the `[data-screen-label]` root's class declare neither `border` nor `border-radius`; (d) every `data-state-btn` element sits either before the root's opening tag in the file or inside an element carrying `data-contract="none"` (AC-20260824-03-1, AC-20260824-03-2, AC-20260824-03-3, AC-20260824-03-4) | prax D5/D8 (content-box, 2 px), D4/salon-os D5 (undeclared line-height, up to 13% dh), prax D9a (1 px frame on 100% of pairs), salon-os deltas (state-switcher scaffolding excused 6 times) |
| D2 | `ratified` and `approved` are equivalent for every check: the matrix checks (viewport meta, dark block) and the hygiene checks bind at either stamp (AC-20260824-03-5) | Brief Scope 3: ratified = approved, one stamp; the atlas keeps both badge names (ratified = roadmap-level, approved = standalone-spec-level provenance) |
| D3 | `/spec:sketch` exit: after the coherence readout and before the ratification question, the session runs the **expansion pass** on each of the brief's `sketch` mocks (media queries + the tokens dark block, one responsive file), runs `check --matrix`, renders the matrix screenshots (each viewport; each theme on the draft framing) for the fast confirm, and only then asks to ratify; on yes the stamp is `data-status="ratified"` [no-ac: prose sequencing; the check's matrix enforcement at `ratified` is AC-5] | The design stage no longer expands (spec 02); the roadmap-level look is where the matrix is cheapest to confirm |
| D4 | Vocabulary the mock declares, documented in the harness paragraph of design.md § Design Canon: `data-screen-label` (root; one per file), `data-status`, `data-state-btn="<state>"` (state controls, outside the root), `data-contract="none"` (non-contract subtree: device chrome, proto strips, annotations), `data-positioned` (a container whose children are placed from data — chart plots, timelines) [no-ac: doctrine paragraph; the reader is spec 01's walker, pinned by AC-20260824-01-13] | One binding home for the marks the gate reads; the roadmap-brief template's `regionRef` comment is corrected to this vocabulary |
| D5 | The hygiene checks parse the mock's own `<style>` blocks with the same regex discipline the existing color-literal check uses (no CSS parser, no dependency); a `<style>` with unbalanced braces is a violation naming the file, never a silent skip (AC-20260824-03-6) | Worker Rules: zero dependencies; fail-closed on unparseable input |
| D6 | New-surface checklist: plugin.json bump to next free 7.33.x with changelog [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | `cmdCheck`: four hygiene checks (D1, D5) bound at `ratified\|approved\|--matrix`; `statusOf` consumers treat `ratified` as `approved` (D2); header comment updated |
| spec/commands/sketch.md | MODIFY | doctrine | Exit step 6: expansion pass + `check --matrix` + matrix screenshots before the ratify question (D3); a one-line pointer to the mark vocabulary (D4) |
| spec/doctrine/design.md | MODIFY | doctrine | § Design Canon harness paragraph: the mark vocabulary (D4) and "matrix at sketch exit; ratified = approved" replacing "matrix-at-approval at `/spec:design` promotion" — this paragraph only (spec 05 rewrites the file) |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | `surfaces` block comment: labels are `data-screen-label` anchors (drop `regionRef`) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.33.0, next-free rule) + changelog paragraph |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260824-03-1, AC-20260824-03-2, AC-20260824-03-3, AC-20260824-03-4, AC-20260824-03-5, AC-20260824-03-6 |

## Contracts

Violation lines (one per hit, `check` exit 1):

```
<file>: no universal box-sizing: border-box rule — bordered elements measure 2px larger than the component's border-box
<file>: <n> CSS block(s) declare font-size without line-height (first: .detail-card__label) — undeclared leading is up to 13% height error the gate cannot see
<file>: root rule .screen declares border/border-radius — a device frame shifts every measured box by the frame width
<file>: data-state-btn control inside the [data-screen-label] root without a data-contract="none" ancestor — state switchers are tooling, never contract
<file>: unbalanced braces in <style> — fix the stylesheet before ratifying
```

Checks (a)–(d) run only when `statusOf(html) ∈ {ratified, approved}` or `--matrix` is passed;
`sketch` mocks pass free. Check (c) locates the root's `class` attribute values and matches
rules whose selector list contains `.<class>` as a whole token.

## Behavior

- Existing host mocks: salon-os mocks carry `box-sizing: border-box` and declared leadings
  (read 2026-08-24, `app-shell.html`, `vault.html`); prax mocks were measured without the reset
  (spike D5) — prax's ratified mocks will fail check (a) until edited, which is the point:
  the check is red on a real false-positive source, and the fix is one CSS line per file.
- `check` at `sketch` is unchanged in every respect (labels, tokens link, color literals).

## Acceptance Criteria

- **AC-20260824-03-1**: WHEN a `ratified` mock's `<style>` has no `box-sizing: border-box`
  rule THE SYSTEM SHALL print the border-box violation and exit 1; WHEN the same file carries
  `* { box-sizing: border-box; }` THE SYSTEM SHALL not print it → `tests/design-atlas.test.js`
- **AC-20260824-03-2**: WHEN a `ratified` mock's `<style>` contains `.label { font-size: 12px; }`
  and no `line-height` in that block THE SYSTEM SHALL print `1 CSS block(s) declare font-size
  without line-height (first: .label)`; WHEN the block is `.label { font-size: 12px;
  line-height: 1.4; }` THE SYSTEM SHALL not print it → `tests/design-atlas.test.js`
- **AC-20260824-03-3**: WHEN the `[data-screen-label]` root has `class="screen"` and the style
  has `.screen { border: 1px solid var(--border); border-radius: 36px; }` THE SYSTEM SHALL
  print the device-frame violation naming `.screen`; WHEN `.screen` declares neither THE SYSTEM
  SHALL not print it → `tests/design-atlas.test.js`
- **AC-20260824-03-4**: WHEN a `<button data-state-btn="empty">` appears after the root's
  opening tag with no `data-contract="none"` ancestor THE SYSTEM SHALL print the state-control
  violation; WHEN it appears before the root's opening tag, or inside
  `<div data-contract="none">…</div>`, THE SYSTEM SHALL not print it → `tests/design-atlas.test.js`
- **AC-20260824-03-5**: WHEN a mock is `data-status="ratified"` with `targets.json` declaring
  two viewports and dark, and the file has no `<meta name="viewport">` THE SYSTEM SHALL print
  the viewport-meta violation exactly as it does for `approved` (the existing matrix pin
  extended); WHEN the same file is `data-status="sketch"` THE SYSTEM SHALL print no hygiene or
  matrix violation → `tests/design-atlas.test.js`
- **AC-20260824-03-6**: WHEN a `ratified` mock's `<style>` has unbalanced braces (`.a {
  color: var(--x);`) THE SYSTEM SHALL print the unbalanced-braces violation and exit 1 →
  `tests/design-atlas.test.js`

## Assumptions (escalation triggers)

- A1: `design-atlas.js`'s `statusOf` reads the first `data-status` in the file (read
  2026-08-24) and the root carries it — **if false** (status on a non-root element): scope the
  regex to the root's opening tag in the same build.
- A2: No dependency-adjudicated claim: the checks are regexes over the mock's own text (the
  file is DATA, per the harness rule); rendering claims are spec 01's spike.
- A3: The two hosts' `sketch.md` invocations happen in-session (no automation reads the exit
  sequence) — **if false:** none needed; the step order is prose.

## Rationale

Every hygiene rule is one measured false-positive class turned into a check the author sees
before ratifying, so the render gate's `dh 15%` floor — set entirely by undeclared
line-heights on the mock side — can tighten later from data rather than from taste. The
state-control rule codifies what salon-os already does (the proto strip sits outside the root
"on purpose"); the `data-contract="none"` escape lets a mock keep annotations inside the frame
without them entering the contract. Moving the matrix to sketch exit is a consequence of spec
02: the design stage no longer authors mocks, so the only place a human looks at a mock before
it binds is the sketch ratification — one stamp, one confirm. `ratified` keeps its name
(atlas badge, doctrine provenance) and gains `approved`'s enforcement; renaming it would touch
the atlas, its tests, and every host mock for no product change.

Collision-closure at lock (2026-08-24): zero `likely` hits. Literals leg: `regionRef` hits
live in files spec 02 rewrites/deletes (`spec/commands/design.md`, the driver, dc-extract,
fidelity-check, skeletons-check and their tests) or spec 05 rewrites (`spec/doctrine/design.md`)
plus this spec's template row; `matrix-at-approval` mentions in `spec/doctrine/genesis.md` and
`spec/commands/genesis-explore.md` describe the explore stage's draft-on-one-framing economy,
which this spec does not change (genesis prose is brief 10's) — **waived**; `design-atlas.js`'s
own comment is updated in its row.

Rejected: a real CSS parser (dependency); rendering the mock to detect frames or leading
(that is the gate's job, downstream); a `data-positioned` static check (undetectable without
layout — the walker records it, the author declares it, the doctrine says where).

## Canonical Delta

`docs/canonical/design.md` gains **Mock hygiene and marks (2026-08-24, specs/20260824/03)**:
at `ratified`/`approved`, `design-atlas.js check` enforces `border-box`, declared
line-heights, no root frame, and state controls outside the contract, plus the matrix rules;
the mark vocabulary is `data-screen-label`, `data-status`, `data-state-btn`,
`data-contract="none"`, `data-positioned`; the matrix expansion runs at `/spec:sketch` exit
and `ratified` equals `approved` for every consumer.
