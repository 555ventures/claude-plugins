---
date: 2026-09-06
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260906/02-mocks-ends-at-wireframes.md]
depended_on_by: [specs/20260906/06-sketch-high-fidelity-and-critique.md]
brief: 22a
open_markers: 0
---

# Gray states on every wireframe: empty, loading and error declared as states, checked by presence at journey-drawn and journey-approved

## Goal

A wireframe shows the happy path and, as gray boxes behind `data-state-btn` switches, its empty, loading and error states. `design-atlas.js check --states` fails a labeled mock that declares none of them, and the mocks driver runs it at `journey-drawn` and `journey-approved`. A screen that truly has no such state says so on its root (`data-no-state="loading"`), which is a product statement the session must have asked. Presence only: no script judges what the error state says. Done means the CHI-2026 blind spots (error prevention, error recovery) are in front of the user at wireframe time, before any theme exists.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js check --states <file\|dir>…`: for every labeled non-canon mock, the set of declared states = the `data-state-btn` values in the file ∪ the comma-separated names in the root's `data-no-state` attribute; each of `empty`, `loading`, `error` missing from that set is one violation line `<file>: missing state(s) <a>, <b> — every wireframe carries its empty, loading and error states as gray boxes (data-state-btn), or declares data-no-state="<name>" on the root for a state the product truly lacks`; an unknown name in `data-no-state` is a violation naming it; without `--states` the check is byte-identical to today (AC-20260906-05-1, AC-20260906-05-2) | A static presence check is what a script can honestly do (core: a rule a script can check is never checked by an LLM at runtime); the opt-out is explicit and on the mock, where the reviewer sees it. Rejected: a render-rules kind — presence is visible in the source; the render inventory would only re-derive it. |
| D2 | `mocks-driver.js` runs `check --states` over the journey's top-level mocks at `journey-drawn` (after the existing per-label checks) and at `journey-approved` (before the render gate); a violation refuses the mark with exit 2, stderr = the check's lines plus `draw the missing states in the wireframe register, then re-mark`; `render-gate --mocks` captures each declared state as today, so the empty/loading/error frames join the matrix with no gate change (AC-20260906-05-3) | The states are found while drawing, judged while approving; the render gate already renders every declared state. |
| D3 | Doctrine, one home: `spec/doctrine/mocks.md` § Mocks: Authoring Rules gains the bullet **Every wireframe carries its states.** (the rule, the attribute grammar, the opt-out, "happy path alone is a finding"); `spec/commands/mocks.md`'s WIREFRAMES draw step points at it in one clause; the driver's "draw journey <j>" `Then:` gains `states: empty, loading, error on every screen (data-state-btn) — or data-no-state="<name>" with the product reason in the ledger`; `spec/doctrine/design.md` § Design Canon's marks list gains `data-no-state` (AC-20260906-05-4 pins the driver line; prose `[no-ac: review's citations-check and doctrine legs are the oracle]`) | The checkpoint contract prints the next action; doctrine holds the rule once. |
| D4 | Tests: `tests/mocks/mocks-driver-fixtures.js` `writeWireframe(dir, label, opts)` writes the three state buttons by default (`opts.states = ['empty','loading','error']`, `opts.states = []` to omit) so every existing driver test keeps passing under D2 (AC-20260906-05-3's negative arm uses `states: []`) | Fixture default changes are how the suite adopts a new precondition without a sweep. |
| D5 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.96.0) with the changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: `--states` flag, the states rule in `cmdCheck`, usage header line |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2: `check --states` at `journey-drawn` and `journey-approved`; D3 `Then:` line |
| spec/doctrine/mocks.md | MODIFY | doctrine | D3 bullet in § Mocks: Authoring Rules |
| spec/commands/mocks.md | MODIFY | doctrine | D3 one clause in the WIREFRAMES draw step |
| spec/doctrine/design.md | MODIFY | doctrine | D3 `data-no-state` in the marks list (§ Design Canon) |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D4 `writeWireframe` states default |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260906-05-1, AC-20260906-05-2 |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260906-05-3, AC-20260906-05-4 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D5 version bump + changelog entry |

## Contracts

```
design-atlas.js check [--matrix] [--states] <file|dir>…
  --states: labeled non-canon mocks must declare empty, loading, error via
            data-state-btn="<name>" (anywhere in the file) or data-no-state="<name>[,<name>]" on the root
  violation: <file>: missing state(s) empty, error — every wireframe carries its empty, loading and error states as gray boxes (data-state-btn), or declares data-no-state="<name>" on the root for a state the product truly lacks
  violation: <file>: data-no-state names unknown state "<x>" — one of empty, loading, error
Exit codes: unchanged (1 = violations, 2 = usage/IO)
```

## Behavior

The session draws `signin.html` with the happy path and three `data-state-btn` switches whose panels are gray boxes: `empty` (link already used), `loading` (resolving the invite), `error` (invite not found). `journey-drawn` passes. A static marketing landing with no loading state carries `data-no-state="loading"` and the ledger holds the product row that says why ("the landing is static; no fetch"). A screen drawn happy-path-only refuses at `journey-drawn` with the file and the missing names.

## Acceptance Criteria

- **AC-20260906-05-1**: WHEN `check --states` runs over a labeled mock declaring `data-state-btn="empty"`, `"loading"`, `"error"` THE SYSTEM SHALL print `CHECK PASS (1 file(s))` and exit 0; over a mock declaring only `data-state-btn="empty"` it SHALL exit 1 with a line `<file>: missing state(s) loading, error — every wireframe carries its empty, loading and error states` (order `empty, loading, error` filtered); over a mock with `data-no-state="loading,error"` and `data-state-btn="empty"` it SHALL pass; with `data-no-state="busy"` it SHALL exit 1 with a line containing `unknown state "busy"`; a shell canon file SHALL be exempt → `tests/design-atlas.test.js`
- **AC-20260906-05-2**: WHEN `check` runs without `--states` over the happy-path-only mock THE SYSTEM SHALL CONTINUE TO print `CHECK PASS (1 file(s))` (byte-identical output to today) → `tests/design-atlas.test.js`
- **AC-20260906-05-3**: WHEN `--mark journey-drawn --journey onboarding` runs with one screen written via `writeWireframe(dir, 'consent', {states: []})` THE SYSTEM SHALL exit 2 with stderr containing `consent.html: missing state(s) empty, loading, error` and `draw the missing states`, and `journeys.onboarding.drawn` stays null; WHEN every screen declares the three states THE SYSTEM SHALL CONTINUE TO accept `journey-drawn` and `journey-approved` (the fixture default) → `tests/mocks/mocks-driver.test.js`
- **AC-20260906-05-4**: WHEN the bare driver prints the "draw journey <j>" step THE SYSTEM SHALL print a `Then:` line containing `states: empty, loading, error on every screen` and `data-no-state` → `tests/mocks/mocks-driver.test.js`

## Assumptions (escalation triggers)

- A1: `cmdCheck` has a flag parser (`--matrix`) and a per-file loop where a new rule slots in — **verified by reading** design-atlas.js `cmdCheck` :237-329 (`--matrix` at :265). **if false:** add the flag parsing in the same row.
- A2: `writeWireframe` accepts an options object (`{stateBtn}`) — **verified by reading** fixtures :111. **if false:** add the parameter; every caller passes nothing.
- A3: `render-gate --mocks` captures every `data-state-btn` state (`extractStates`, render-gate.js :198-208, :239-241) — **verified by reading**; the empty/loading/error frames cost 3× captures per mock at approval. **if that is too slow on a host:** the fixture capture in tests is instant; the real cost is Chrome time at `journey-approved`, accepted.
- A4: The desktop-fill render rule (specs/20260905/05) runs on every captured state; an empty state with one centred sentence at ≥1024 wide may trip it. **if it does:** the mock's empty panel declares `data-narrow` per that spec's escape (the panel is the labeled root's child, so the root carries it) — build verifies on the fixture and records the outcome in Rationale.

## Rationale

**Why presence, not judgment.** JJ's trim (2026-09-06): scripts check what exists; whether a destructive control "names recovery" is taste, and a script pretending otherwise is worse than nothing. The critic in specs/20260906/06 and the user judge the content.

**Why an opt-out attribute.** Some screens have no loading state (a static page) or no empty state (a form). Forcing a fake gray box would be dishonest, and a silent skip would hide the decision. `data-no-state` on the root is visible in the source, in the atlas, and to the reviewer; the ledger row is where the product reason lives.

**Why at journey-drawn and not only at approval.** The session finds the states while drawing; refusing at the drawn mark means the user's first look already includes them. Approval re-runs it so a redrawn screen cannot lose a state.

**Fragile spots for build.** The fixture default flips every driver test to three-state mocks — run the mocks glob first and expect the render-gate fixture captures to see three states per mock (`render-gate` tests that count captures per mock must be re-read; they are in `tests/render/`, not touched by this spec, and use their own hosts).

## Canonical Delta

`docs/canonical/design.md` § Mock hygiene and marks: append "Every wireframe declares its empty, loading and error states (`data-state-btn`) or opts a state out on the root (`data-no-state="<name>"`) with the product reason in the ledger (specs/20260906/05); `design-atlas.js check --states` is the presence check, run by the mocks driver at `journey-drawn` and `journey-approved`; the render gate captures every declared state as before."
