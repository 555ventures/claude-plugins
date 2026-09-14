---
date: 2026-09-13
status: hardened
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md]
depended_on_by: [specs/20260913/04-only-a-person-starts-a-note.md]
brief: n/a
open_markers: 0
---

# The critic stops filing notes

## Goal

The page-notes loop exists so a person can point at what they do not like on a mock. One
producer writes into it with no person involved: at the WALK state the driver dispatches a
fresh critic agent per journey, and every finding it returns is recorded as a `kind: "walk"`
note in the same queue the owner reads, which the journey cannot pass until the session closes
it. This spec deletes that producer end to end — the agent file, the WALK state it gates, the
mark and the reopen target that exist only for it, the `walk` note kind and its six reasons,
and the two command steps that dispatch it. The client's own journey walk is a different
feature that shares the word and is not touched. Done means the mocks chain runs
WIREFRAMES → THEME with nothing between, and no code path in the repo writes a note that a
person did not type.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **WALK leaves the state chain.** `deriveState` becomes SEED → SHAPES → KIT → WIREFRAMES → THEME → CLIENT → APPROVED: the `if (!allJourneysWalked()) return 'WALK'` disjunct, `allJourneysWalked`, `walkedCount`, `printWalkStep` and the `'WALK'` arm of the step dispatcher are deleted, and `journeys[<j>].walked` stops being written or read. A host whose `mocks.status.json` already carries `walked` keeps the key as inert data. (AC-20260913-03-1, AC-20260913-03-8) | The state existed only to hold the critic's dispatch; with no critic there is nothing for it to gate, and leaving an ungated state in the chain would let every journey pass it silently while still printing a step nobody can act on. Rejected: keeping WALK as a no-op pass-through — a state that always advances is a line of prose in the step block and nothing else. |
| D2 | **`--mark journey-walked` and its gate are deleted.** The `case 'journey-walked'` arm, `handleJourneyWalked` and `openWalkFindingsFor` go; `doMark`'s unknown-mark message enumerates exactly `seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, theme-picked, approved`. (AC-20260913-03-2) | The mark's only refusal was "a walk finding is still open", which cannot occur once nothing files one. The enumeration is the user-facing list of what the driver accepts and must not name a mark that no longer exists. |
| D3 | **`--reopen walk:<j>` is deleted and `--reopen journey:<j>` keeps the client's half.** The `walk:` branch goes and the refusal enumerates `journey:<j>, shapes, kit, or theme`. In the `journey:` branch the `st.walked = null` line and the `'walk:' + j` entry in `invalidated` are deleted; the `walkLib.unconfirmJourney` call on `walk.json` — the client taking back their own confirmation of a redrawn journey — stays exactly as it is. (AC-20260913-03-3, AC-20260913-03-4, AC-20260913-03-5) | This is the one handler where the design-critic walk and the client walk touch. They are unrelated records that a redraw happens to invalidate together; deleting the wrong line here silently lets a client's approval of a journey survive that journey being redrawn. |
| D4 | **The critic agent and both dispatch sites are deleted.** `spec/agents/design-critic.md` is deleted. `spec/commands/mocks.md`'s `## Walk (WALK state)` section is deleted and its Rules line becomes `canon before screens, kit before wireframes`. `spec/commands/sketch.md`'s step 7 `Critique (fixed)` loses its `design-critic` dispatch and its `notes add --kind walk` recording line; the step's other two checks (`check --states`, `render-gate --mocks`) stay and the step keeps its position before the exit step. (AC-20260913-03-6, AC-20260913-03-7) | Two commands dispatch the same agent, so deleting one leaves the producer alive in the other. `/spec:sketch`'s deterministic checks are not the critic and are not in scope. |
| D5 | **`kind: "walk"` stops being producible and stays readable.** `notes add`'s `kindArg === 'walk'` branch and the `--kind` flag itself are deleted (the flag accepted no other value); `WALK_REASONS` and its export are deleted; `KINDS` and `ORIGINS` keep `'walk'` as values `validateNotes` still accepts and nothing produces, each carrying a one-line legacy comment. (AC-20260913-03-9, AC-20260913-03-10) | Narrowing the accepted value set would make an older host's `notes.json` invalid on read for a note nobody can create any more — a migration cost with no reader to pay it. Measured (A1): the only real host carries zero notes of either walk kind or walk origin, so nothing renders differently. |
| D6 | **`noteLine`'s walk and critic tags go.** The `[walk: <reason>]` and `[critic: <reason>]` segments are deleted from the driver's per-note print line; the id, status tag, author and text are unchanged. `[no-ac: covered by D5's zero-hit sweep, AC-20260913-03-10 — the tags are unreachable the moment no note carries `kind: "walk"` or `by: "critic"`]` | Two branches that can never be taken, on the one line the AI sweep prints most often. |
| D7 | **One amendment ADR records the retirement.** `docs/adr/0023-the-critic-stops-filing-notes.md` (CREATE) applies to `specs/20260907/08-walk-critic.md` (the whole spec, superseded — the WALK state, the mark, the reopen target, the six flow-break reasons and the rewritten agent), `specs/20260906/06-sketch-high-fidelity-and-critique.md` D3/D5 (the critic agent and the sketch critique dispatch; the step's two deterministic checks survive), and `docs/adr/0010-kit-walk-and-client-review.md`'s WALK clause. (AC-20260913-03-11) | A locked promise with its own AC is retired by an amendment, never by a silent deletion; three separate documents ratified this producer and a reader of any one of them must find the retirement from it. |
| D8 | **The test fixture chain skips the mark.** `advanceToJourneyWalked` is deleted from `tests/mocks/mocks-driver-fixtures.js`; `advanceToThemePicked` calls `advanceToJourneyApproved` directly. Its two dead references — the unused import in `tests/mocks/wire-register.test.js` and the unused local helper's call in `tests/mocks/mocks-driver-exclusions.test.js` — are deleted with it. `[no-ac: test-harness plumbing; every AC below runs through the repaired chain and goes red if it is wrong]` | The helper runs the real `--mark journey-walked` binary, so it is the one place the deletion reddens tests that are otherwise about theme and exclusions. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1: `deriveState`'s WALK disjunct, `allJourneysWalked`, `walkedCount`, `printWalkStep` and the WALK step-dispatch arm deleted. D2: the `journey-walked` mark arm, `handleJourneyWalked`, `openWalkFindingsFor` and the mark enumeration. D3: the `walk:` reopen branch, the reopen refusal enumeration, and the `walked`/`walk:<j>` lines inside the `journey:` branch (the `unconfirmJourney` call stays). D5: `notes add`'s walk branch and the `--kind` flag. D6: `noteLine`'s two reason tags |
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D5: `WALK_REASONS` and its export deleted, `REASONS` collapses to `PLAIN_REASONS`, `addNote`'s `isWalk` branch deleted; `KINDS` and `ORIGINS` keep `'walk'` with a legacy comment and `validateNotes` still accepts it |
| spec/agents/design-critic.md | DELETE | doctrine | D4: the critic agent |
| spec/commands/mocks.md | MODIFY | doctrine | D4: the `## Walk (WALK state)` section deleted; the THEME paragraph's "Once every journey is walked" opener re-anchored to journey approval; the Rules line loses `screens walked before sign-off` |
| spec/commands/sketch.md | MODIFY | doctrine | D4: step 7 `Critique (fixed)` loses the `design-critic` dispatch line and the `notes add --kind walk` recording line, keeps `check --states` and `render-gate --mocks` and its position before the exit step |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1-D6: the `**Walk findings.**` paragraph deleted; § Mocks: State Machine's chain line and the `journey-drawn`/`journey-walked` sentence; the reopen paragraph's `walk:<j>` and `walked` clauses (the client-walk sentences at §§ "Walk mode is a query token" and the CLIENT paragraph are NOT touched) |
| docs/adr/0023-the-critic-stops-filing-notes.md | CREATE | doctrine | D7: the amendment ADR — Applies to specs/20260907/08 (superseded), specs/20260906/06 D3/D5, docs/adr/0010's WALK clause |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D8: `advanceToJourneyWalked` deleted, `advanceToThemePicked` chains from `advanceToJourneyApproved` |
| tests/mocks/wire-register.test.js | MODIFY | tests | D8: the dead `advanceToJourneyWalked` import deleted |
| tests/mocks/mocks-driver-exclusions.test.js | MODIFY | tests | D8: the unused local helper's `advanceToJourneyWalked` call deleted |
| tests/mocks/walk-state-retired.test.js | CREATE | tests | AC-20260913-03-1, AC-20260913-03-2, AC-20260913-03-3, AC-20260913-03-4, AC-20260913-03-5, AC-20260913-03-6, AC-20260913-03-7, AC-20260913-03-9, AC-20260913-03-10, AC-20260913-03-11 |
| tests/mocks/mocks-driver-notes-gate.test.js | MODIFY | tests | AC-20260913-03-8 — the existing project-note refusal test's fixture chain no longer passes through `journey-walked` |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

**Orchestrator duty (outside the table).** Per this repo's amendment convention (ADR-0018's own
account: the amended document "gains a single `Amended by:` line and is not otherwise
rewritten"), append one `- Amended by: ADR-0023 — <one line>` header line to each of
`docs/adr/0010-kit-walk-and-client-review.md` (which already carries an ADR-0012 line; append,
never replace), `specs/20260907/08-walk-critic.md`,
`specs/20260906/06-sketch-high-fidelity-and-critique.md` and
`docs/roadmap/22a-mocks-is-wireframes.md` (whose file list names the deleted agent). No other
text in those four files changes. These are the orchestrator's own edits, not a worker's — a worker's file contract must
not reach into a sibling spec's text.

## Contracts

The mocks state machine after this spec (`deriveState`, `spec/scripts/mocks-driver.js`):

```
SEED -> SHAPES -> KIT -> WIREFRAMES -> THEME -> CLIENT -> APPROVED
```

`doMark`'s accepted marks, verbatim, in the order the refusal prints them:

```
seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, theme-picked, approved
```

`doReopen`'s accepted targets, verbatim:

```
--reopen must be journey:<j>, shapes, kit, or theme
```

`lib/mocks-notes.js` enums after this spec:

```js
const ORIGINS = ['walk', 'client', 'session']   // 'walk' is legacy-accept only; nothing produces it
const KINDS = ['note', 'question', 'walk']      // 'walk' is legacy-accept only; nothing produces it
const REASONS = PLAIN_REASONS                   // WALK_REASONS retired
```

## Data Model

`design/mocks/notes.json` is unchanged in shape. No note is rewritten, moved or deleted by this
spec. A note already carrying `kind: "walk"`, `origin: "walk"` or one of the six retired walk
reasons still validates and still renders — as an ordinary note, without the `[walk: …]` tag
D6 removes. Measured (A1): the only host with a real store carries none of them.

`.claude/mocks.status.json`: `journeys[<j>].walked` stops being written and stops being read.
An existing key is left in place as inert data; no migration runs.

## Behavior

A session in WIREFRAMES that marks its last journey approved now derives THEME directly and the
bare step command prints the THEME step. There is no intermediate step block, no agent dispatch
and no `notes add` instruction between the two.

`--mark journey-walked` and `--reopen walk:<j>` become unknown inputs, each refused by the
existing enumeration message with the retired name absent from the list. Both refusals already
exist; only the enumerated set changes.

A redraw still invalidates both records that a redraw should invalidate: `--reopen journey:<j>`
clears that journey's approval and the product sign-off, and takes back the client's own
confirmation on `walk.json`. It no longer clears a `walked` stamp, and its printed `invalidated`
list no longer names `walk:<j>`.

## Acceptance Criteria

- **AC-20260913-03-1**: WHEN every declared journey on a host is marked `journey-approved` THE
  SYSTEM SHALL derive the next state as `THEME` and print the THEME step block, never a WALK
  step block (the bare step command's output contains `THEME` and contains neither the literal
  `WALK` as a step label nor the string `design-critic`)
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-2**: WHEN `--mark journey-walked --journey j1` runs on any host THE SYSTEM
  SHALL exit 2 and print `unknown mark "journey-walked" — one of: seed-done, shape-picked,
  canon-written, kit-signed, journey-drawn, journey-approved, theme-picked, approved`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-3**: WHEN `--reopen walk:j1` runs THE SYSTEM SHALL exit 2 and print
  `--reopen must be journey:<j>, shapes, kit, or theme`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-4**: WHEN `--reopen journey:j1` runs on a host whose `walk.json` records
  journey `j1` as confirmed by the client THE SYSTEM SHALL CONTINUE TO clear that journey's own
  approval, SHALL CONTINUE TO clear the product `approved` mark, and SHALL CONTINUE TO write
  `walk.json` with `j1`'s client confirmation taken back (`confirmedAt` null after the run)
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-5**: WHEN `--reopen journey:j1` runs THE SYSTEM SHALL print an invalidated
  list containing `approved` and `approved(all)` and containing no entry beginning `walk:`
  (`↩ reopened journey:j1 — invalidated: approved, approved(all)`)
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-6**: WHEN the repository is walked THE SYSTEM SHALL contain no file at
  `spec/agents/design-critic.md`, and `spec/commands/mocks.md` SHALL contain no heading whose
  text contains `Walk (WALK state)`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-7**: WHEN `spec/commands/sketch.md` is read THE SYSTEM SHALL contain a step
  whose heading contains `Critique`, positioned before the step whose heading contains `Exit`,
  naming both `check --states` and `render-gate`, and naming neither `design-critic` nor
  `--kind walk`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-8**: WHEN `--mark approved` runs on a host carrying one open project note
  THE SYSTEM SHALL CONTINUE TO exit 2 with the project-note-open message, printed before any
  unresolved screen-scoped note it would also find
  → rewrites tests/mocks/mocks-driver-notes-gate.test.js :: AC-20260912-07-4:
- **AC-20260913-03-9**: WHEN `notes add --scope mock --screen a --state error --kind walk
  --reason dead-end-state --by walk-critic --text "x"` runs THE SYSTEM SHALL exit 2 and print a
  refusal naming `--kind` as an unknown flag, and SHALL NOT append a note to
  `design/mocks/notes.json`
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-10**: WHEN every tracked file under `spec/`, `tests/`, `scripts/` and
  `design/` is searched THE SYSTEM SHALL yield zero occurrences of each of
  `journey-walked`, `WALK_REASONS`, `openWalkFindingsFor`, `allJourneysWalked`, `walkedCount`,
  `printWalkStep`, `design-critic` and `walk-critic`, each matched with a word boundary that
  treats `-` as part of the word (so `walk.json`, `walkLib`, `/client/walk/` and `--reopen
  journey:` are untouched)
  → writes tests/mocks/walk-state-retired.test.js
- **AC-20260913-03-11**: WHEN `docs/adr/0023-the-critic-stops-filing-notes.md` is read THE
  SYSTEM SHALL parse with `Status: accepted`, a non-empty `## Dissents` section, and an
  `## Applies to` section naming `specs/20260907/08-walk-critic.md`,
  `specs/20260906/06-sketch-high-fidelity-and-critique.md` and
  `docs/adr/0010-kit-walk-and-client-review.md`
  → writes tests/mocks/walk-state-retired.test.js

## Assumptions (escalation triggers)

- A1: **No real host carries a walk-produced note, so D5's legacy-accept path never renders.**
  Executed 2026-09-13 over both stores in the only host with real data
  (`/Users/jj/Projects/hearwell/design/mocks/notes.json`, 34 notes, and its round-4 archive, 1
  note), grouping every note by `origin`/`kind`: `{"session/question":13,"session/-":21}` and
  `{"-/-":1}` — zero notes of `kind:"walk"` or `origin:"walk"` have ever existed. — **if false:**
  the legacy note renders as an ordinary note carrying an unfamiliar `reason`, which
  `REASON_LABELS` already skips; no code change, record the sighting in the build log.
- A2: **`tests/consistency/design-doctrine.test.js` — the file that pinned the critic agent's
  frontmatter and the sketch critique step (AC-20260906-06-4, AC-20260907-08-10) — no longer
  exists on `main`.** Executed 2026-09-13: `ls tests/consistency/` lists eleven files and not
  that one; `grep -rn "critic" tests/` outside `.claude/worktrees` returns only the unrelated
  word `critical` plus two orphaned fixture helpers in `tests/design-atlas.test.js`
  (`labeledMock`, `noteOn`) that no test calls. — **if false:** the pin is a predecessor
  CONTINUE-TO assertion whose whole subject this spec deletes; retire it as a deletion row in
  the same batch, never weaken it into passing.
- A3: **`0023` is the next free ADR number.** Executed 2026-09-13: `ls docs/adr/` tops out at
  `0022-a-mock-may-not-invent.md` (with a known duplicate pair at `0020`). — **if false:** a
  sibling claimed it first; take the next free number and amend D7, the File Plan row,
  AC-20260913-03-11 and every `Amended by`/`superseded by` backlink in the same build.
- A4: **`printWalkStep` has no look-probe or authoring-state coupling to unpick.** Its own
  header comment states WALK is deliberately absent from `AUTHORING_STATES` and adds no
  disjunct to `doBareStep`'s look-probe precondition. — **if false:** STOP, ask the user — an
  unexpected coupling means the state carried something besides the critic.

## Rationale

The design-critic walk was ratified three times (specs/20260906/06 D3/D5 created the agent,
specs/20260907/08 rewrote it into a journey walk and built the WALK state around it, ADR-0010
blessed the arrangement) and it is the more defensible of the two producers this series
deletes: a fresh reader with no memory of authoring is a real substitute for user testing. It
is deleted anyway because the owner's rule is about authorship, not quality — the annotation
queue is for a person to point at what they do not like, and a producer that files into it
before any person has spoken makes the queue something the owner must clear rather than
something they wrote. The critic's judgement is not lost so much as re-homed: under
specs/20260913/05 the AI's voice in this system is a reply on a note a person started.

D3 is the one place to be careful. Two unrelated features are spelled `walk` and they meet in
exactly one handler, where a redrawn journey invalidates both the critic's pass and the
client's confirmation. Deleting the wrong line there would let a client's approval of a journey
survive that journey being redrawn — a silent wrong result with no error, which is why
AC-20260913-03-4 is a pin and asserts on `walk.json`'s own contents rather than on the printed
line. Everything under `lib/mocks-walk.js`, `lib/walk-page.js`, `lib/walk.browser.js`,
`walk-mode.browser.js`, `walk.json`, `/client/walk/<j>.html` and `/__walk/*` belongs to the
client player and is out of scope entirely.

D5 keeps the retired values readable rather than narrowing the enums. Narrowing would invalidate
an older store on read for a note nobody can create any more, which is a migration with no
reader to pay for it; A1 measured that no such note has ever existed anyway, so the
legacy-accept arm is cheap insurance, not a compromise.

Adversarial check, rejected: a reviewer could argue WALK should become a no-op state so the
chain's shape survives for hosts mid-run. Rejected — a state that always advances prints a step
block instructing work nobody can do, and the chain is derived fresh on every invocation, so a
host mid-WALK simply derives THEME on its next run.

The zero-hit sweep (AC-20260913-03-10) covers `spec/`, `tests/`, `scripts/` and `design/` — the
executable and test surface this spec's File Plan owns. `docs/canonical/design.md` also carries
the retired names today; it is corrected by the Canonical Delta below, which the review stage
applies at close, and putting it inside the build-time sweep would redden the gate against text
the build is not allowed to write.

## Canonical Delta

`docs/canonical/design.md` § the mocks state machine: replace the WALK paragraph
(`specs/20260907/08`) with — "The chain runs SEED → SHAPES → KIT → WIREFRAMES → THEME → CLIENT →
APPROVED. There is no critic pass between wireframes and theme: the design-review queue carries
only what a person wrote, and the marks the driver accepts are `seed-done`, `shape-picked`,
`canon-written`, `kit-signed`, `journey-drawn`, `journey-approved`, `theme-picked` and
`approved`. `--reopen` takes `journey:<j>`, `shapes`, `kit` or `theme`; a redrawn journey still
clears that journey's approval, the product sign-off, and the client's own confirmation of it on
`walk.json`." Delete the clause "and no journey is marked walked while one of its findings is
still open" from the § page-notes gate sentence, and the `notes add --kind walk` stamp from the
origin sentence, leaving `/client/__notes/*` and `/__notes/*` as the two origins the server
stamps.
