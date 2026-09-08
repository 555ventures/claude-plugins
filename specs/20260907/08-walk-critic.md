---
date: 2026-09-07
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260907/07-mocks-retires-theme.md]
depended_on_by: []
brief: 22a
spiked: 2026-09-07
open_markers: 0
---

# `/spec:mocks` gains WALK: one fresh-context critic per journey, flow breaks only, cited to a screen and a state or refused

## Goal

Between `WIREFRAMES` and `SIGNOFF` the driver gains a `WALK` state. Each declared seed journey
is walked once by a fresh-context critic that holds no authoring memory, reads the journey's
screens in declared order with the gray empty/loading/error states entered as branches at the
step where they occur, and may report only **flow breaks** — no path back, no path forward, a
state with no exit, a step needing data no earlier step collected, a control meaning two things
across screens, an error state with no recovery. Naming, hierarchy, density and "consider…" are
refused. Every finding is a note of its own kind, anchored to a screen and one of that screen's
declared states, and no journey can be marked walked while one of its findings is still open.
The same critic replaces the four-heuristic per-screen critique pass at `/spec:sketch`. Done
means the chain reads `SEED → SHAPES → KIT → WIREFRAMES → WALK → SIGNOFF → APPROVED` and the
mocks stage cannot be signed off on a journey nobody walked.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `deriveState()` gains one step between `WIREFRAMES` and `SIGNOFF`: `if (!allJourneysWalked()) return 'WALK'`, placed after the `canonWritten && allJourneysApproved()` line and before the `!status.marks.approved` line. `allJourneysWalked()` mirrors `allJourneysApproved()` byte-for-byte in shape — `false` on an empty seed, `false` while any declared journey lacks `journeys[j].walked`. `ensureJourneyRecord()` gains `walked: null` beside `drawn`/`approved` (AC-20260907-08-1) | One state, one mark-derived condition, monotone: nothing written after sign-off can drag the chain backwards, which a findings-count condition would do the first time `/spec:sketch` recorded a walk finding on an approved root. |
| D2 | `--mark journey-walked --journey <j>` refuses with no `--journey`, refuses a journey the seed does not declare, refuses while `journeys[j].approved` is unset (naming `journey-approved --journey <j>`), and refuses while any **open** walk finding is anchored to one of `<j>`'s declared labels — `walk finding(s) still open on <j>: N003, N004 — record the fix with \`notes address --id <id> --change "<what changed>"\`` — then sets `journeys[j].walked = nowIso()` and saves. It runs no ledger gate and no render gate: walking finds questions, it does not resolve them, the same posture `journey-drawn` and `direction-composed` already have. The unknown-mark literal gains `journey-walked` in chain position, after `journey-approved` (AC-20260907-08-2) | The mark records a judgment nobody can verify happened; what the driver *can* verify is that everything the critic wrote has been dealt with, so that is exactly what it gates on. Rejected: a `--findings <n>` count the session types — the driver can derive that number from the store, and a derived number beaten out of an attested one is this repo's standing rule. |
| D3 | A walk finding is a note carrying `kind: "walk"`. In `lib/mocks-notes.js`: `KINDS` becomes `['note', 'question', 'walk']`; `WALK_REASONS = ['no-path-back', 'no-path-forward', 'dead-end-state', 'missing-data', 'ambiguous-control', 'unrecoverable-error']` is appended to `REASONS`; validation splits by kind — a `walk` note **requires** `scope: "mock"`, a non-empty `screen`, a non-empty `state` and a `reason` drawn from `WALK_REASONS`, and a plain note's optional `reason` may not be a walk reason. The four blind-spot reasons stay in `REASONS` unproduced, so an existing host's `notes.json` keeps validating (AC-20260907-08-4) | `design-atlas.js`'s `POST /__notes/add` already refuses any client body carrying `kind` (specs/20260906/03 D3), so a lane keyed on `kind` cannot be forged from the served page — `by` is free text typed by whoever is looking, and a client who names themselves "walk" would otherwise mint findings the walk gate then blocks on. |
| D4 | `notes add` accepts `--kind walk` and nothing else: the refusal narrows to `notes add: --kind accepts only "walk" — questions come from \`ledger add --screen\``, and `--ledger-id` stays refused outright. A walk add requires `--screen`, `--state` and `--reason`; the screen must have a `design/mocks/<label>.html` on disk and the state must be `default` or a `data-state-btn="<s>"` that mock itself declares, else it is refused naming the states the screen does declare. **The journey is never typed and never stored** — `groupOpen()` already derives it from `seed.md`, and `handleJourneyWalked` counts a journey's findings through its own declared labels (AC-20260907-08-5, AC-20260907-08-6) | This is the ADR's "cites journey, step and state or it is refused", made deterministic: the two halves a machine can check are checked against disk, and the third is derived from the seed rather than asserted by the caller. It also keeps one command working unchanged at `/spec:sketch`, where a brief's surfaces belong to no seed journey. |
| D5 | `noteLine()` renders a walk finding as `<id> [<status>] [walk: <reason>] <by> · <text>` — its own tag beside, never instead of, the status tag, the same shape specs/20260906/06 D4 gave a critic note (AC-20260907-08-7) | `notes open` is where the session reads what it still owes; a finding whose break type is invisible there is a finding the session re-reads the text to classify. |
| D6 | `--reopen walk:<j>` clears `journeys[j].walked`, `marks.approved` and `decider`, leaves `journeys[j].approved` and every other journey untouched, prints `↩ reopened walk:<j> — invalidated: walk:<j>, approved(all)` and pushes the standard `{at, target, invalidated}` row. `--reopen journey:<j>` additionally clears that journey's `walked` and names `walk:<j>` in its invalidated list; `--reopen shapes` clears every journey's `walked` and names `walk(all)`. The refusal literal becomes `--reopen must be journey:<j>, walk:<j>, shapes, or kit` (AC-20260907-08-8) | ADR-0010 names `--reopen walk:<j>` as one of the two targets replacing `--reopen theme`. A redrawn journey is a different journey to walk, so `--reopen journey:<j>` cascading into the walk is the only honest invalidation; nothing on disk is touched, as with every other reopen. |
| D7 | `printWalkStep()` prints, for the first journey with no `walked`, `printStepBlock('WALK', 'walk journey <j> — one fresh critic, flow breaks only', ['design/mocks/seed.md (## Journeys › <j>)', 'design/mocks/<label>.html …the journey's labels in declared order'], 'Mocks: State Machine', 'walked: <n>/<N> · open walk findings on <j>: <k>', [<the dispatch line>, <the notes add line>, <the mark line>])`. `AUTHORING_STATES` is **not** changed and the look-probe precondition gains **no** `WALK` disjunct (AC-20260907-08-9) | WALK dispatches a reader: it draws nothing, opens no look stop and serves no page, so neither the `frontend-design` skill line nor a browser probe belongs on it — a machine with no browser must still be able to walk. Fixing a finding is authoring, and the session reaches it through `--reopen walk:<j>` or `--reopen journey:<j>`, which land back on states that already carry both. |
| D8 | `spec/agents/design-critic.md` is rewritten in place — same file name, same `model: opus`, `effort: medium`, same `tools:` list. The four fixed questions are replaced by: journeys walked in declared order; each screen's declared gray states entered as branches at the step where they occur; the six allowed flow breaks of D3's enum, each named with its key; the forbidden list (naming, hierarchy, density, and any "consider…" suggestion); citation-or-refusal ("if it cannot name the step where the walk breaks, it is not a finding"); the sentence `an empty list is a valid return` kept verbatim; and a return contract of `{ "findings": [ { "screen", "state", "break", "finding", "severity" } ] }` where `break` is exactly one of the six keys (AC-20260907-08-10) | ADR-0010 narrows specs/20260906/06 D5 to exactly this: one critic, one prompt, the walk's allow/forbid list. A second agent file would leave two fresh-context critics whose only difference is a question list, and the four heuristics have no producer left once this lands. |
| D9 | `spec/commands/sketch.md` § The run step 6 becomes the walk: the states check and the render-gate call are unchanged; the dispatch reads the brief's `surfaces` **in declared order** as the journey; every returned finding is recorded with `node {driver} notes add --scope mock --screen <label> --state <s> --kind walk --reason <break> --by walk-critic --text "<finding>"`; an empty list records nothing. `spec/doctrine/design.md`'s one-line summary of the pass drops "one fresh-context critic on the four blind spots" for the journey walk (AC-20260907-08-11) | The pass is fixed and never skipped either way; only what the critic is allowed to say changes. Keeping the `--by walk-critic` value fixed is what lets `notes open` and the review page read one lane at both stages. |
| D10 | Doctrine, one home each: `spec/doctrine/mocks.md` § Mocks: State Machine gains `WALK` in the fixed-order sentence and `journey-walked` in the runs-no-gate sentence beside `journey-drawn`, and its reopen paragraph gains `--reopen walk:<j>`; § Provenance Ledger's step vocabulary gains `WALK`; § Mocks: Page Notes gains one **Walk findings** paragraph (the kind, the six breaks, the screen+state citation, and that the session closes one with `notes address` while only the page resolves it); `spec/commands/mocks.md` gains a `## Walk (WALK state)` section and its Rules line becomes `canon before screens, kit before wireframes, screens walked before sign-off` `[no-ac: prose contract with no runtime surface; review's citations-check and doctrine legs are the oracle, the mechanisms are AC-20260907-08-1, -4 and -9]` | § Doctrine Authoring: the driver and the notes library are the mechanism; prose points at them and never restates a refusal string. |
| D11 | Bump `spec/.claude-plugin/plugin.json` to the next free minor — target **7.106.0** (`spec/.claude-plugin/plugin.json` reads 7.105.0: `04` shipped as 7.103.0, and 7.104.0 and 7.105.0 were spent on 2026-09-08 by sibling work merged into `main`; the hardened-but-unbuilt `05`, `06`, `07` and `09` still name targets at or below 7.105.0 and must each re-resolve at their own build), resolved to whatever is actually free at build time — with the last-3-versions changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline; hardened-but-unbuilt siblings hold the numbers they claim, and a shipped sibling spends them, so the build resolves the minor rather than replaying the pin. |

**Orchestrator duty (outside the File Plan table):** `tests/mocks/mocks-driver-fixtures.js` lands
FIRST. It gains `advanceToJourneyWalked(dir, journeyName = JOURNEY)` — `advanceToJourneyApproved`
then `mark(dir, 'journey-walked', ['--journey', journeyName])` — and `advanceToApproved(dir)` calls
it in place of its current predecessor, so every test that reaches `SIGNOFF` or `APPROVED` walks
first. Run `node --test 'tests/mocks/*.test.js'` after that edit and before touching any other
test file. Per-file 45 s budget (specs/20260903/07) applies: `mocks-driver-2.test.js` and
`mocks-driver.test.js` are already the two largest driver files, so WALK's own arms go in the new
`tests/mocks/mocks-driver-walk.test.js` rather than growing either.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D3: `KINDS` gains `walk`, `WALK_REASONS` appended to `REASONS`, per-kind validation in `validateNotes` and `addNote` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1/D2/D4/D5/D6/D7: `allJourneysWalked`, the `WALK` derivation step, `handleJourneyWalked`, the `journey-walked` mark case + unknown-mark literal, `notes add --kind walk` with the screen/state citation checks, `[walk: …]` render, `--reopen walk:<j>` + the journey/shapes cascade + refusal literal, `printWalkStep` + the `doBareStep` branch |
| spec/agents/design-critic.md | MODIFY | doctrine | D8: rewritten in place as the journey walk — six flow breaks, forbidden list, citation-or-refusal, new return contract |
| spec/commands/sketch.md | MODIFY | doctrine | D9: § The run step 6 becomes the walk over the brief's surfaces in declared order; the `notes add` line gains `--kind walk` |
| spec/doctrine/design.md | MODIFY | doctrine | D9: the one-line critique-pass summary re-pointed from the four blind spots to the journey walk |
| spec/doctrine/mocks.md | MODIFY | doctrine | D10: § Mocks: State Machine order + no-gate + reopen sentences, § Provenance Ledger step vocabulary, § Mocks: Page Notes walk-findings paragraph |
| spec/commands/mocks.md | MODIFY | doctrine | D10: new `## Walk (WALK state)` section; Rules line gains "screens walked before sign-off" |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11: version bump to the next free minor (target 7.106.0, resolved at build time) + changelog entry |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | Orchestrator duty: `advanceToJourneyWalked`, `advanceToApproved` routes through it, export both |
| tests/mocks/mocks-driver-walk.test.js | CREATE | tests | AC-20260907-08-1, AC-20260907-08-2, AC-20260907-08-8, AC-20260907-08-9 |
| tests/mocks/mocks-driver-2.test.js | MODIFY | tests | AC-20260907-08-12; repair the two arms the WALK step reddens |
| tests/mocks/mocks-driver-3.test.js | MODIFY | tests | AC-20260907-08-1; repair the two arms the WALK step reddens |
| tests/mocks/mocks-driver-look-stops-4.test.js | MODIFY | tests | AC-20260907-08-9; repair the three SIGNOFF-block arms the WALK step reddens |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | AC-20260907-08-4, AC-20260907-08-5, AC-20260907-08-6, AC-20260907-08-7 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260907-08-10, AC-20260907-08-11; the four-blind-spot arm is replaced, never inverted |

## Contracts

```js
// lib/mocks-notes.js
const KINDS = ['note', 'question', 'walk']
const WALK_REASONS = ['no-path-back', 'no-path-forward', 'dead-end-state',
                      'missing-data', 'ambiguous-control', 'unrecoverable-error']
// REASONS = [...the existing eight, ...WALK_REASONS]
```

```jsonc
// one walk finding in design/mocks/notes.json
{ "id": "N007", "scope": "mock", "screen": "invite-code", "state": "error",
  "text": "the wrong-code state offers no way back to the invite step",
  "by": "walk-critic", "at": "…", "status": "open",
  "kind": "walk", "reason": "no-path-back",
  "addressed": null, "reply": null, "resolvedBy": null, "resolvedAt": null }
```

```
node {driver} notes add --scope mock --screen <label> --state <state> \
     --kind walk --reason <flow-break> --by walk-critic --text "<finding>"
node {driver} --mark journey-walked --journey <j>
node {driver} --reopen walk:<j>
```

```json
// design-critic return contract (D8)
{ "findings": [ { "screen": "invite-code", "state": "error", "break": "no-path-back",
                  "finding": "…", "severity": "hard" } ] }
```

## Behavior

**Derivation.** `SEED → SHAPES → KIT → WIREFRAMES → WALK → SIGNOFF → APPROVED`. A root that
already carries `marks.approved` from before this lands derives `WALK` on its next invocation
(no journey has `walked`), and its sign-off is re-taken after the walk — the deliberate cost of
inserting a gate before a terminal mark, and the reason `--reopen walk:<j>` clears `approved`
too.

**The loop.** The step block names three things in order: dispatch `Agent {subagent_type:
'design-critic'}` once for this journey with the journey's mock **paths** and the seed path,
never file contents; record each returned finding with one `notes add --kind walk` call; then
`--mark journey-walked --journey <j>`. A finding is closed by the session with `notes address
--id <id> --change "<what changed>"` — which, for anything that changes a screen, means
`--reopen walk:<j>` (or `--reopen journey:<j>` when the redraw invalidates the approval) first.
An empty findings list walks straight to the mark.

**Two gates, different readers.** `journey-walked` refuses on an **open** finding — the session
must have dealt with everything the critic wrote. The terminal `approved` mark refuses on an
**unresolved** one through the existing `unresolvedFor` primitive, which counts `addressed` as
unresolved — so the human still confirms each flow fix on the served page at the sign-off look.
Neither gate is new code on the `approved` side; walk findings are mock-scope notes and the
existing gate already sees them (executed 2026-09-07: `unresolvedFor([walkNote], ['signin'])`
returns 1 against today's library).

## Acceptance Criteria

- **AC-20260907-08-1**: WHEN every declared journey is drawn and approved and `marks.canonWritten`
  is set but no journey carries `walked` THE SYSTEM SHALL derive `WALK`; once every declared
  journey carries `walked` and `marks.approved` is unset it SHALL derive `SIGNOFF`; a seed that
  declares a journey added after the others were walked SHALL derive `WALK` again
  → `tests/mocks/mocks-driver-walk.test.js`, `tests/mocks/mocks-driver-3.test.js`
- **AC-20260907-08-2**: WHEN `--mark journey-walked` runs with no `--journey`, with a journey the
  seed does not declare, with a journey whose `approved` is unset, or while an open `kind: "walk"`
  note is anchored to one of that journey's labels THE SYSTEM SHALL exit 2 naming that cause and
  its remedy (the open-finding refusal naming each id and `notes address --id <id> --change`), and
  otherwise SHALL record `journeys[<j>].walked` and print the checkpoint tail
  → `tests/mocks/mocks-driver-walk.test.js`
- **AC-20260907-08-3**: WHEN `--mark <unknown>` runs THE SYSTEM SHALL name `journey-walked` in the
  known-mark list, in chain position after `journey-approved`
  → `tests/mocks/mocks-driver-walk.test.js`
- **AC-20260907-08-4**: WHEN `validateNotes` reads a note with `kind: "walk"` THE SYSTEM SHALL
  accept it when it carries `scope: "mock"`, a screen, a state and a `reason` from the six flow
  breaks, and SHALL report one error per missing piece otherwise (`{kind:"walk", reason:"wrong-words"}`
  → `reason must be one of no-path-back|no-path-forward|dead-end-state|missing-data|ambiguous-control|unrecoverable-error`);
  a plain note carrying a walk reason SHALL be an error
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-08-5**: WHEN `notes add --kind walk --scope mock --screen <label> --state <s>
  --reason <break> --by walk-critic --text "…"` runs against a screen whose mock declares `<s>`
  THE SYSTEM SHALL append the note with `kind: "walk"` and `status: "open"` and exit 0; WHEN
  `--kind question` or `--ledger-id` is passed THE SYSTEM SHALL exit 2 naming `ledger add --screen`
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-08-6**: WHEN a walk add names a screen with no `design/mocks/<label>.html`, or a
  `--state` that is neither `default` nor a `data-state-btn` that mock declares, or omits
  `--state` or `--reason` THE SYSTEM SHALL exit 2 naming the states that screen does declare
  (`--state hover` on a screen declaring empty/loading/error → a refusal listing
  `default, empty, loading, error`)
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-08-7**: WHEN `notes open` lists a walk finding THE SYSTEM SHALL render it as
  `<id> [<status>] [walk: <reason>] <by> · <text>`, keeping the status tag
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-08-8**: WHEN `--reopen walk:<j>` runs THE SYSTEM SHALL clear that journey's
  `walked`, `marks.approved` and `decider`, leave every `journeys[*].approved` unchanged, and
  print `↩ reopened walk:<j> — invalidated: walk:<j>, approved(all)`; `--reopen journey:<j>`
  SHALL additionally clear that journey's `walked` and name `walk:<j>`; `--reopen shapes` SHALL
  clear every `walked` and name `walk(all)`; an unknown target SHALL exit 2 with
  `--reopen must be journey:<j>, walk:<j>, shapes, or kit`
  → `tests/mocks/mocks-driver-walk.test.js`
- **AC-20260907-08-9**: WHEN the bare driver runs in `WALK` THE SYSTEM SHALL print the
  `## Step: walk journey <j> — one fresh critic, flow breaks only` heading, a `walked: <n>/<N>`
  progress line, and `Then:` lines naming the `design-critic` dispatch, `notes add --kind walk`
  and `--mark journey-walked --journey <j>`; it SHALL print no `frontend-design` skill line and
  SHALL NOT run the look probe (a `WALK` run with a failing `npx` on PATH exits 0)
  → `tests/mocks/mocks-driver-walk.test.js`, `tests/mocks/mocks-driver-look-stops-4.test.js`
- **AC-20260907-08-10**: WHEN `spec/agents/design-critic.md` is read THE SYSTEM SHALL parse as
  `model: opus`, `effort: medium`, `tools: Read, Grep, Glob, Bash`, and its body SHALL contain
  each of the six flow-break keys, the four forbidden words (naming, hierarchy, density,
  consider), and the phrase `an empty list is a valid return`, and SHALL contain none of
  `error-prevention`, `error-recovery`, `blindspot`
  → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-08-11**: WHEN `spec/commands/sketch.md` § The run is read THE SYSTEM SHALL carry a
  critique step before the exit step naming `check --states`, `render-gate`, `design-critic` and
  `--kind walk`, and `spec/doctrine/design.md` SHALL no longer contain `four blind spots`
  → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-08-12**: WHEN `--mark approved` runs THE SYSTEM SHALL CONTINUE TO refuse with no
  decided sign-off stop, on an unresolved mock note anchored to any declared label (a walk finding
  in `addressed` included), and on any journey whose `approved` is unset
  → `tests/mocks/mocks-driver-2.test.js`

## Assumptions (escalation triggers)

- **A1**: specs/20260907/07 lands first, so `deriveState` reads
  `WIREFRAMES → SIGNOFF → APPROVED` when `WALK` is inserted and `--reopen` already accepts
  `journey:<j>, shapes, kit`. — **if false:** insert `WALK` before the `!status.theme` line
  instead and add `walk:<j>` to whatever refusal literal exists; the state machine still reads
  correctly with `THEME` present, only the literals in D6 and D10 change.
- **A2**: A walk finding needs no new gate on the terminal `approved` mark — the existing
  `unresolvedFor` primitive already counts a mock-scope walk note as unresolved. **Executed
  2026-09-07** against today's `lib/mocks-notes.js`: `unresolvedFor([{kind:"walk", scope:"mock",
  screen:"signin", status:"open", …}], ["signin"])` → `1`. — **if false:** add the walk lane
  explicitly to `requireNotesResolved` and give AC-20260907-08-12 its own new arm rather than
  pinning the existing one.
- **A3**: Both notes-library edits are real, not no-ops. **Executed 2026-09-07** against today's
  library: `validateNotes([{…kind:"walk"…}]).errors` → `['note "N001": kind must be one of
  note|question (field "kind")']`, and `addNote(…, {kind:"walk", reason:"no-path-back"})` throws
  `reason must be one of missing-screen|wrong-direction|wrong-words|other|error-prevention|error-recovery|help|efficiency`.
  — **if false:** drop D3's enum edits and keep only the per-kind validation split.
- **A4**: The blast radius of inserting a gate between `WIREFRAMES` and `SIGNOFF` is five
  test-layer files. **Executed 2026-09-07 (redden spike, `git archive HEAD` into a scratch tree,
  `WALK` + `allJourneysWalked` + `handleJourneyWalked` + `printWalkStep` patched in, whole suite
  run, tree discarded):** 1237 tests, 1224 pass, 13 fail — 8 real
  (`mocks-driver-2.test.js` ×2, `mocks-driver-3.test.js` ×2, `mocks-driver-look-stops-4.test.js` ×3,
  `tests/consistency/design-doctrine.test.js` ×1) and 5 the scratch copy's own missing git work
  tree (`git ls-files` / `git check-ignore` / raw-NUL probes). `mocks-driver.test.js`,
  `mocks-notes.test.js`, both other look-stops files, `mocks-picks`, `review-page`,
  `notes-layer-isolation` and `design-atlas` are untouched by the state insertion. — **if false:**
  the extra file takes the row `tests/mocks/mocks-driver-walk.test.js` would have used and WALK's
  own arms move into `mocks-driver-3.test.js`.
- **A5**: Three of those eight reddened arms are arms specs/20260907/07 already deletes
  (`AC-20260906-02-7`, `AC-20260906-02-4`/`AC-20260902-07-7`, and the THEME half of
  `AC-20260906-02-8`), so the post-07 repair set is smaller than the spike's, never larger — the
  spike ran on `HEAD`, which still carries `THEME`. — **if false:** repair whatever is red after
  07 lands; the File Plan's five test-layer rows are a superset either way.

## Rationale

Three judgment calls carry this spec.

**The lane is a `kind`, not a `by`.** The obvious cheap move is to tag walk findings
`--by walk-critic` and derive the lane from that string, reusing the `by === 'critic'` render
that already exists. It was rejected because `by` is free text supplied by whoever is looking at
the served page, while `kind` is refused outright by the notes HTTP endpoint (specs/20260906/03
D3) — so a lane keyed on `kind` is session-authored by construction, and the ninth spec can put
client notes beside walk findings without a naming convention holding the wall. `by` is still set
to `walk-critic`, but nothing gates on it.

**The mark gates on the findings, not on the dispatch.** No driver can verify that a subagent
ran; `/spec:sketch`'s critique pass has always been prose-enforced for the same reason. What is
verifiable is that every finding the critic wrote has been dealt with, so `journey-walked` refuses
on an open one and derives its own count rather than accepting one the session types. A
`--findings <n>` attestation was drafted and cut: the driver can derive that number, and deriving
beats attesting.

**WALK is not an authoring state.** It draws nothing, opens no look stop and serves no page, so
it carries neither the `frontend-design` skill line nor the browser probe — a machine with no
browser must still be able to walk a journey. Fixing what the walk finds *is* authoring, and the
session gets there through `--reopen walk:<j>` or `--reopen journey:<j>`, both of which land on
states that already carry the skill line and the probe. The cost is one extra reopen in the
common case; the benefit is that WALK never blocks on a look mechanism it does not use.

Two further notes for the cold reader. The four blind-spot reasons stay in the `REASONS` enum
after their producer is deleted, purely so an existing host's `notes.json` keeps validating —
they are unreachable, not live. And the sign-off is re-taken on any root that was already
approved when this lands, because a gate inserted before a terminal mark cannot honour a mark
taken before the gate existed; that is stated in Behavior so nobody reads it as a defect.

**Collision closure (executed 2026-09-07).** Four retired stems were swept — `four blind`,
`blindspot`, `four fixed usability`, `error-prevention`. Ten distinct files carry a literals-leg
hit; eight are File Plan rows (`plugin.json`'s changelog blurb, `design-critic.md`,
`sketch.md`, `doctrine/design.md`, `lib/mocks-notes.js`, `mocks-driver.js`'s three header
comments, `design-doctrine.test.js`, `mocks-notes.test.js`). Two are **waived**:
`tests/review/review-driver-fix-cycle.test.js` and `tests/review/review-legs.test.js` match only
on the review pipeline's unrelated "suite blind spot" fixtures, which have nothing to do with the
design critic. The `executes` leg named three further files —
`tests/design-atlas.test.js`, `tests/mocks/mocks-driver.test.js`, `tests/spec-paths.test.js` —
and A4's whole-suite spike shows all three green under the WALK insertion, so no fixture repair
is owed outside the plan. Note that `error-prevention` survives in `lib/mocks-notes.js` on
purpose (D3's data-compatibility keep); its only retirement is inside `design-critic.md`.

## Canonical Delta

`docs/canonical/design.md` — in the mocks-stage description, the chain becomes
`SEED → SHAPES → KIT → WIREFRAMES → WALK → SIGNOFF → APPROVED`, and the fixed critique pass is
described as the journey walk: one fresh-context critic per journey (per brief, at sketch),
read-only, journeys in declared order with the gray states entered as branches, reporting only
the six flow breaks — no path back, no path forward, a state with no exit, a step needing data no
earlier step collected, a control meaning two things across screens, an error state with no
recovery — each cited to a screen and one of that screen's declared states or refused. Findings
are notes of `kind: "walk"`; the session closes one with `notes address`, only the served page
resolves it, and no journey is marked walked while one of its findings is open.
