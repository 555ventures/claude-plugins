---
date: 2026-09-06
status: hardened
tier: standard
area: design-sketch
design: false
breaking: false
depends_on: [specs/20260906/03-questions-on-the-wireframe.md, specs/20260906/05-gray-states-on-every-wireframe.md]
depended_on_by: []
brief: 22a
open_markers: 0
---

# Sketch owns high fidelity per brief in the picked theme, argues each surface's UX, and closes with a fixed critique pass

## Goal

`/spec:sketch <brief>` is where a surface becomes production fidelity: every mock the brief declares is authored or reworked in the picked theme (`design/tokens.css`, the shell canon), each surface's UI/UX is argued individually in the brief, and before the exit stop a fixed critique pass runs — the render rules, the states check, and one fresh-context critic whose findings land as page notes tagged with the four blind spots models share (error prevention, error recovery, help and documentation, efficiency of use). A mock still linking the wireframe register after the theme exists is a violation at ratification. Done means sketch cannot ratify a gray mock in a themed product and cannot skip the critique.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js check`: when `design/tokens.css` exists (walk-up from the mock), a labeled non-canon mock that links any `wire/` stylesheet is a violation `<file>: links the wireframe register (wire/) after THEME — skin it in the picked theme (design/tokens.css)` at `data-status="ratified"` only (sketch's stamp) and a `⚠️` warn at `sketch`; a mock at `data-status="approved"` is **exempt** — `/spec:mocks` sign-off stamps gray wireframes `approved` by design (specs/20260906/02 D5, brief 22a) and its `check --matrix design/mocks` must keep passing after THEME — and `--matrix` alone never binds this rule; with no `design/tokens.css` the check is byte-identical to today (AC-20260906-06-1, AC-20260906-06-2) | "One honest wireframe or the full theme, never a half-styled middle" becomes a script at the one stamp that matters — sketch's, not mocks'; binding at `approved` would refuse every 22a sign-off (amended 2026-09-06, cross-spec check). |
| D2 | `spec/commands/sketch.md` § The run: step 3 (scoped sweep) authors every gap surface at production fidelity in the picked theme — links `../tokens.css` and the shell canon, never `wire/` — and reworks the brief's existing wireframe-register mocks the same way (the only time an existing mock is re-authored: register change, structure and facts kept); when `design/tokens.css` is absent the step prints `⚠️ no theme picked yet (/spec:mocks THEME) — sketching in the wireframe register` and continues; step 5 (the loop) gains **the UX argument**: per surface, three lines written into the brief's `surfaces` block entry (`job:` what the person is doing, `risk:` what goes wrong if the screen is wrong, `choice:` the one UI decision made and the alternative rejected) — the brief is already the write target `[no-ac: prose contract; the register rule it relies on is AC-20260906-06-1]` | JJ's ruling: sketch is the seat where each surface's UI/UX is argued and improved individually; the argument lives in the brief the plan reads. |
| D3 | New step 5b **Critique (fixed)** before the exit: (a) `node {atlas} check --states` over the brief's mocks (specs/20260906/05), (b) `node "$(spec-paths render-gate)" --mocks …` (existing), (c) dispatch `spec/agents/design-critic.md` once with the brief path, the mock paths, and `design/tokens.css` — read-only, fresh context, returns findings `{screen, state, blindspot, finding, severity}`; the session records each finding as a page note via the new CLI verb `mocks-driver.js notes add --scope mock --screen <label> [--state <s>] --by critic --reason <blindspot> --text "<finding>"`; ratification refuses while any critic note is unresolved — mechanically: `design-atlas.js check` (same walk-up as D1) reads `design/mocks/notes.json` and, for a labeled mock at `data-status="ratified"`, emits one violation `<file>: <n> unresolved note(s) on <label> (<ids>) — address them (notes address) or resolve them on the page before ratifying` when any `scope: "mock"` note on that label is not `resolved` (any `by`, critic or human); at `sketch` the same line is a `⚠️` warn; no notes store → no check (AC-20260906-06-3, AC-20260906-06-4, AC-20260906-06-5) | Self-critique shares the author's blind spots (CHI 2026); a fresh reader with the list in hand and no memory of authoring is the cheapest honest substitute for user testing on an AI-first project. Findings become notes so the existing loop, gate and provenance apply — never a second findings file. |
| D4 | `lib/mocks-notes.js` `reason` enum gains `error-prevention \| error-recovery \| help \| efficiency` (the four blind spots); `notes add` CLI accepts `--reason` from the whole enum, `--by` required, and refuses `--kind question`/`--ledger-id` (questions come from `ledger add --screen`); `notes open` prints a critic note's reason as `[critic: <blindspot>]` (AC-20260906-06-3) | One enum, one store; a critic finding and a client message differ only in `by` and `reason`. |
| D5 | `spec/agents/design-critic.md` (CREATE): `model: opus`, `effort: medium`, tools Read/Grep/Glob/Bash (inspection only); prompt = read the brief and every mock (open each state), then for each surface answer the four questions in order — *can the person make a mistake here that the screen does not prevent? · when something fails, does the screen say what happened and how to recover? · is there help where a first-time user needs it? · can a repeat user do this faster?* — one finding per real gap, none invented (an empty list is a valid return), severity `hard` only when the gap blocks the job; returns JSON only; never edits `[no-ac: agent prompt; its wiring is AC-20260906-06-4]` | Judgment seats run Opus (core § Model Placement); read-only so it cannot "fix" its way past the session. |
| D6 | Doctrine: `spec/doctrine/design.md` § Design Canon gains "**Fidelity lives in sketch.** `/spec:mocks` ends gray; `/spec:sketch` authors each brief's surfaces at production fidelity in the picked theme and closes with the fixed critique pass (states check · render rules · one fresh-context critic on the four blind spots) whose findings are page notes"; `spec/doctrine/mocks.md` § Mocks: Authoring Rules's "One honest wireframe or the full theme" bullet points at D1's check; `spec/commands/sketch.md` Rules gains "the critique pass is never skipped and never self-run" `[no-ac: review's citations-check and doctrine legs are the oracle; the mechanism is AC-20260906-06-1 and AC-20260906-06-3]` | One home per rule. |
| D7 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.97.0) with the changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline. |

**Orchestrator duty (outside the File Plan table):** `tests/design-look-handoff.test.js` pins sketch.md literals (serve sentence, `stop open --key sketch:`, the hand-off block) — the rewrite of § The run must keep them; run that file after the doctrine wave.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: register-after-theme rule in `cmdCheck` (warn at sketch, violation at ratified only); D3: unresolved-notes rule at ratified; usage header |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D4: reason enum extended |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3/D4: `notes add` verb (refuses question fields), `notes open` critic reason tag; header |
| spec/agents/design-critic.md | CREATE | doctrine | D5: the critic agent |
| spec/commands/sketch.md | MODIFY | doctrine | D2 (sweep at fidelity, UX argument), D3 (step 5b Critique), D6 Rules line |
| spec/doctrine/design.md | MODIFY | doctrine | D6 "Fidelity lives in sketch" in § Design Canon |
| spec/doctrine/mocks.md | MODIFY | doctrine | D6 pointer from the honest-wireframe bullet |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260906-06-1, AC-20260906-06-2, AC-20260906-06-5 |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | AC-20260906-06-3 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260906-06-4 (agent file shape + sketch.md step presence, executed via the agent frontmatter parser the suite already uses for reviewer.md) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 version bump + changelog entry |

## Contracts

```
design-atlas.js check [--matrix] [--states] <file|dir>…
  violation (ratified) / ⚠️ (sketch): <file>: links the wireframe register (wire/) after THEME — skin it in the picked theme (design/tokens.css)
    (data-status="approved" is exempt; --matrix does not bind this rule)
  violation (ratified) / ⚠️ (sketch): <file>: <n> unresolved note(s) on <label> (<ids>) — address them (notes address) or resolve them on the page before ratifying

mocks-driver.js --root <dir> notes add --scope mock|project [--screen <label>] [--state <s>] --by <name> [--reason <r>] --text "<t>"
  <r> ∈ missing-screen | wrong-direction | wrong-words | other | error-prevention | error-recovery | help | efficiency
  exit 2: --scope mock without --screen · --kind/--ledger-id present ("questions come from ledger add --screen") · unknown reason

design-critic return (JSON only):
  { "findings": [ { "screen": "signin", "state": "error", "blindspot": "error-recovery",
                    "finding": "the wrong-code state offers no way back to the invite", "severity": "hard" | "soft" } ] }
```

## Behavior

Sketch on brief 07 after Hearwell's theme is picked: the sweep authors `report.html` in the theme, reworks the brief's two wireframes into it, writes the three-line UX argument per surface into the brief, runs the loop with JJ on the served page. Before the exit stop: states check green, render rules green, the critic returns two findings; the session writes them as notes by `critic` with reasons `error-recovery` and `efficiency`; the served page shows them beside JJ's own notes; the session addresses one (redraws the error state) and JJ resolves the other on the page. The exit stop opens; `decided approve` ratifies; `check` at `ratified` passes because no mock links `wire/`.

## Acceptance Criteria

- **AC-20260906-06-1**: WHEN `check` runs over a `data-status="ratified"` mock linking `../wire/wire.css` in a root where `design/tokens.css` exists THE SYSTEM SHALL exit 1 with a line `<file>: links the wireframe register (wire/) after THEME`; over the same mock at `data-status="sketch"` it SHALL exit 0 printing that line prefixed `⚠️`; over the same mock at `data-status="approved"`, with and without `--matrix`, it SHALL pass with no line containing `wireframe register`; over a ratified mock linking only `../tokens.css` it SHALL pass → `tests/design-atlas.test.js`
- **AC-20260906-06-2**: WHEN `check` runs over a ratified mock linking `../wire/wire.css` in a root with no `design/tokens.css` THE SYSTEM SHALL CONTINUE TO exit 0 with output byte-identical to today → `tests/design-atlas.test.js`
- **AC-20260906-06-3**: WHEN `notes add --scope mock --screen signin --state error --by critic --reason error-recovery --text "no way back to the invite"` runs THE SYSTEM SHALL exit 0 and append `{scope:"mock", screen:"signin", state:"error", by:"critic", reason:"error-recovery", status:"open"}` to `notes.json`; WHEN `--reason typo` runs it SHALL exit 2 naming the eight reasons; WHEN `--kind question` runs it SHALL exit 2 containing `ledger add --screen`; WHEN `notes open` then runs it SHALL print the note line containing `[critic: error-recovery]`; WHEN `validateNotes` reads `reason:"efficiency"` THE SYSTEM SHALL return no errors → `tests/mocks/mocks-notes.test.js`
- **AC-20260906-06-5**: WHEN `check` runs over a `data-status="ratified"` mock labeled `signin` in a root whose `design/mocks/notes.json` holds one open `scope:"mock"` note on `signin` by `critic` and one resolved note THE SYSTEM SHALL exit 1 with a line `<file>: 1 unresolved note(s) on signin (<id>) — address them`; over the same mock at `data-status="sketch"` it SHALL exit 0 printing that line prefixed `⚠️`; when every note on `signin` is resolved, or the root has no `notes.json`, it SHALL pass → `tests/design-atlas.test.js`
- **AC-20260906-06-4**: WHEN `spec/agents/design-critic.md` is parsed with the suite's agent frontmatter reader THE SYSTEM SHALL yield `model: opus`, `effort: medium`, tools exactly `Read, Grep, Glob, Bash`, and a body containing the four questions in order (`prevent`, `recover`, `help`, `faster`) and the phrase `empty list is a valid return`; WHEN `spec/commands/sketch.md` is read THE SYSTEM SHALL contain, under `## The run`, a step whose heading contains `Critique` naming `check --states`, `render-gate`, `design-critic`, and `notes add`, positioned before the exit step → `tests/consistency/design-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: `cmdCheck` binds severity by `data-status` already (`boundApproved` at :265) and the shell-family finding uses the warn/violation split D1 copies — **verified by reading** design-atlas.js :265-291. **if false:** implement the split inline, same row.
- A2: `resolveShellDir`-style walk-up exists for locating `design/` from a mock path — **verified by reading** (:275-281); `design/tokens.css` is resolved the same way. **if false:** resolve from the `--root`.
- A3: The suite parses agent frontmatter somewhere (reviewer.md has `model`/`effort`/`tools`) — **verified by reading** `spec/agents/reviewer.md` frontmatter; the reader is in tests (search `agents/reviewer.md` in tests/ at build). **if none exists:** parse the YAML block with a 10-line reader inside the test file.
- A4: Agents need no `entrypoints.json` row — **executed 2026-09-06**: `grep agents spec/entrypoints.json` → no match. **if false:** one row, orchestrator duty.
- A5: specs/20260906/03's `reason` enum and `notes` verbs land first (`depends_on`). **if 03 is reordered:** this spec's mocks-notes row carries the whole enum.

## Rationale

**Why the critic writes notes, not a report.** A findings file would be a second store with its own resolve step, its own gate, and no provenance. Notes already have all three, and specs/20260906/03's `ledger counts` will show how many catches the critic produced against the user's own — the same measurement the questions get.

**Why the four questions are fixed.** CHI 2026 ("Looks Good, But Is It Usable?") measured that model-generated interfaces fail on exactly these heuristics while looking finished; a fresh reader told to look for them catches more than one told "review this". The list is short on purpose; a longer checklist becomes a rule-walk, which the render rules retired.

**Why the register check, not a rule in prose.** Today nothing stops a gray mock from being ratified into a themed product; the prose "never a half-styled middle" lives in mocks.md and nobody reads it at sketch exit. One violation line at the stamp is the mechanism.

**Why `ratified` only, never `approved` (amended 2026-09-06).** Under brief 22a every mock `/spec:mocks` signs off is a gray wireframe stamped `approved` while `design/tokens.css` already exists (THEME precedes SIGNOFF). Binding this rule at `approved` or `--matrix` would make specs/20260906/02's `approved` mark — which runs `check --matrix design/mocks` — refuse forever and turn every signed-off wireframe into a standing violation. Sketch's stamp is the only one that promises fidelity. The unresolved-notes rule follows the same split so "ratification refuses on critic notes" is a script, not a sentence: sketch has no driver, so the check at the stamp is its only gate.

**Why sketch stays prose-only.** A sketch driver was rejected (again): the command shells out to three existing scripts and derives state from disk; the critique step adds one agent dispatch and one CLI verb, both of which exist independently.

**Fragile spots for build.** sketch.md's § The run is pinned by three test files (design-look-handoff, design-doctrine); rewrite in place, keep every literal. The critic must be dispatched with paths, never file contents (core: orchestrators pass paths).

## Canonical Delta

`docs/canonical/design.md` § Sketch-tier authorship and the shell canon: append "Fidelity lives in sketch (specs/20260906/06): `/spec:mocks` ends gray; `/spec:sketch` authors each brief's surfaces at production fidelity in the picked theme, reworks the brief's wireframes into it, writes a three-line UX argument per surface into the brief, and closes with the fixed critique pass — `check --states`, `render-gate --mocks`, one fresh-context `design-critic` (Opus, read-only) on error prevention · error recovery · help · efficiency — whose findings are page notes by `critic` resolved through the existing loop. `design-atlas.js check` flags a mock linking `wire/` after `design/tokens.css` exists: warn at `sketch`, violation at `ratified` only — `approved` gray wireframes from mocks sign-off are exempt — and flags a `ratified` mock with unresolved notes on its label (critic or human) the same way."
