---
date: 2026-10-07
status: hardened
tier: standard
area: prototype
breaking: false
depends_on: [specs/20261007/01-approve-writes-a-behaviour-contract.md]
depended_on_by: [specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
brief: 28a
spiked: 2026-10-07
open_markers: 0
---

# The prototype opens from words, a brief or a stem

## Goal

`/spec:prototype` takes the same three input shapes as `/spec:plan`: a feature description in
plain words, a roadmap brief path, or a prototype stem to re-open. The driver derives the stem
(from words: a slug it prints as an auto-pick the user may rename once; from a brief: the
brief's stem; from a stem: itself), writes the spoken idea into `status.json` at OPEN, and never
reads a brief's `Lane:` header — choosing the command is choosing the behaviour lane. Rounds run
with no gate. A host with no `prototype` block is refused by a sentence that says what the block
is for. Done means: on a fixture host the driver opens from each shape, persists the idea and
the input kind, stamps `brief: n/a` for a words prototype, substitutes `{stem}` into the test
file path, and admits a brief marked `Lane: structural`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Three input shapes, derived in order from `argv[0]`** (`check` stays brief-less): (a) **brief** — the argument resolves (against `--root`) to an existing `.md` file: stem = basename without extension, `brief` = the leading `NN[a]`, `idea` = `null`; (b) **stem** — `design/prototypes/<argv[0]>/status.json` exists: stem = the argument, `brief` and `idea` read from that file; (c) **words** — anything else: the argument text is the idea; the stem is the slug `text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+\|-+$/g, '')` cut to 48 characters at a `-` boundary, `brief` = `n/a`; an empty slug (whitespace or no ASCII letter or digit) is exit 2 `usage: give the idea in a few words, a brief path, or a prototype stem`. `--stem <name>` (words shape only, before `--mark opened`) replaces the derived slug; a value not matching `^[a-z0-9][a-z0-9-]{0,47}$` is exit 2 naming `--stem`; `--stem` after `opened` is exit 2 `the stem is fixed once opened — re-open with <stem>`. In the words shape the bare `OPEN` run prints, before the step, `📌 Auto-picked stem <slug> — from your words (veto: re-run with --stem <name>)`; with `--stem` it prints nothing extra. Every printed `node <driver> <arg> …` line echoes the stem once the prototype is opened, whatever shape opened it. (AC-20261007-02-1, AC-20261007-02-2) | Brief 28a scope 1 and open question 1 (default taken: derived and printed as an auto-pick). A stem is the one name every later invocation, the contract and the specs share; words give it a slug, a brief gives it the brief's own. |
| D2 | **`--mark opened` persists the input.** `status.json` gains `input: { kind: "brief" \| "words" \| "stem", brief: <path or null>, idea: <text or null> }` and `brief` = `"n/a"` for words; `stem`, `branch`, `worktree`, `base`, `pinsPort`, `marks`, `rounds` as today. For the words shape, `idea` holds the argument text verbatim. `contract.json.idea` (spec 01 D4) is `status.input.idea`. The `brief` field of the ledger row (spec 01 D8) is `status.brief`. The `check` subcommand, the OPEN step's `states.json` template, the overlay copy, `dbCreate` and the round loop are unchanged. (AC-20261007-02-2, AC-20261007-02-4) | Core § On-Disk Handoff: the spoken idea is on disk before any round; a later session re-opens by stem and reads it from the file, never from chat. |
| D3 | **`{stem}` in `e2eFile`.** Every substitution of `prototype.e2eFile` (the TESTS step, `tests-derived`, the contract's `tests.source`) replaces `{stem}` with the stem; `{brief}` is not substituted. (AC-20261007-02-4) | Spec 01 D1 named the placeholder; this spec is the first that can have no brief number. |
| D4 | **The missing-block refusal says what the block is for**: `no "prototype" config block in .claude/spec.config.json — the block declares how a throwaway build of this app runs: where it answers (url), where the pin overlay goes (overlay), how its pictures and contract tests are made (picture, e2eFile, e2eList, e2eRun); remedy: declare it (spec/templates/grounding-contract.md § Prototype), then run /spec:doctor`. (AC-20261007-02-3) | Brief 28a scope 1: the refusal stays and explains itself in one sentence. |
| D5 | **No lane gate, anywhere.** `spec/commands/prototype.md`: `argument-hint` becomes `<idea in plain words \| docs/roadmap/NN-*.md \| prototype stem>`; § Input lists the three shapes and the stem rule; § OPEN adds the auto-pick line and `--stem`; the `Lane: behaviour` sentence is deleted; one sentence says a prototype on an empty `main` builds whatever the idea needs in its first round, like any round; the Rules gain `rounds run with no gate: the driver never invokes gateCommand on the prototype tree — gates protect what lands, and the prototype never lands`. `spec/templates/roadmap-brief.md`: the header keeps `Lane: { behaviour \| structural }` and its comment becomes `Lane is advisory — a hint at mint time that the ask is behaviour-shaped. /spec:prototype is the behaviour lane by choice: running it on any brief, or on no brief, is choosing that lane (spec/doctrine/core.md § Pipeline Entry); nothing reads the field.` `spec/commands/plan.md` § Entry: the two sentences `A \`Lane: behaviour\` brief (absent = structural) STOPs: run \`/spec:prototype <brief>\` instead — it carries no plan document, the freeze writes its spec.` and, in the Tier bullet, `a behaviour change names its lane and stops;` are deleted (read-load drops; spec 03 spends the room). `[no-ac: prose — read-load and citations-check are the oracles; D1's admit case is the behaviour]` | Brief 28a: the lane label is advisory and the command never refuses on it. Today no script reads `Lane:` (lock grep), so the gate was prose only — the deletion is the whole fix. |
| D6 | **Fixture currency.** `tests/fixtures/prototype/host/docs/roadmap/28-functional-prototype.md` reads `Lane: structural` (the admit case's pre-image is the same file with `behaviour`; the retag is fixture currency, not coverage). (AC-20261007-02-3) | A fixture that still says `behaviour` would let a re-introduced lane gate pass the suite. |
| D7 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: bump — plugin-bump.js --check is the oracle]` | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/prototype-driver.js | MODIFY | scripts | D1 input shapes, slug, `--stem`, auto-pick line; D2 `status.input`; D3 `{stem}`; D4 refusal text; header usage lines |
| spec/commands/prototype.md | MODIFY | doctrine | D5 — argument-hint, § Input, § OPEN, the no-gate rule, the empty-main sentence; `Lane:` sentence deleted |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D5 — the `Lane:` comment |
| spec/commands/plan.md | MODIFY | doctrine | D5 — the two lane sentences deleted |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/prototype/entry.test.js | CREATE | tests | AC-20261007-02-1, AC-20261007-02-2, AC-20261007-02-4 |
| tests/prototype/prototype-driver.test.js | MODIFY | tests | AC-20261007-02-3 (the missing-block refusal case rewritten in place; the `Lane: structural` admit case) |
| tests/fixtures/prototype/host/docs/roadmap/28-functional-prototype.md | MODIFY | tests | D6 — `Lane: structural` |

## Contracts

`status.json` after `--mark opened` from words (D2):

```json
{ "schemaVersion": 1, "brief": "n/a", "stem": "collector-flow",
  "input": { "kind": "words", "brief": null, "idea": "A collector flow: women save → row turns green!" },
  "branch": "proto/collector-flow", "worktree": ".claude/worktrees/proto-collector-flow",
  "base": "main", "pinsPort": 4711, "appPort": 4713,
  "marks": { "opened": "2026-10-07T09:00:00.000Z", "approved": null }, "rounds": [] }
```

From a brief: `"brief": "28", "stem": "28-functional-prototype", "input": { "kind": "brief", "brief": "docs/roadmap/28-functional-prototype.md", "idea": null }`.

The words-shape `OPEN` run (D1), rendered:

```
📌 Auto-picked stem a-collector-flow-women-save-row-turns-green — from your words (veto: re-run with --stem <name>)
[prototype-driver] state: OPEN  prototype: a-collector-flow-women-save-row-turns-green
## Step: author states.json, then --mark opened
Author design/prototypes/a-collector-flow-women-save-row-turns-green/states.json with at least one route carrying at least one state:
{ … }
The overlay import is wired in the ROUND step, once the worktree exists.
Then:
  node <driver> "A collector flow: women save → row turns green!" --mark opened
```

Slug examples (D1, executed): `A collector flow: women save → row turns green!` →
`a-collector-flow-women-save-row-turns-green`; `  ` → refused; `28-functional-prototype` as words
(no such brief file, no such stem) → `28-functional-prototype`.

## Behavior

A session runs `/spec:prototype` with the idea in a few words (or nothing — the command tells
the session to pass the idea from the conversation as the argument), a brief path, or a stem. The
driver prints the derived stem as an auto-pick when it came from words; the session may re-run
with `--stem` once, before `--mark opened`. From `opened` on, the stem is fixed, the idea is in
`status.json`, and every printed command names the stem. A brief marked `Lane: structural` or
carrying no `Lane:` opens exactly like one marked `behaviour`. Nothing else in the loop changes:
states, overlay, rounds, approve, the contract (spec 01).

## Acceptance Criteria

- **AC-20261007-02-1**: WHEN the driver runs with the argument `A collector flow: women save → row turns green!` on the fixture host with no `design/prototypes/` THE SYSTEM SHALL exit 0 and print `📌 Auto-picked stem a-collector-flow-women-save-row-turns-green — from your words (veto: re-run with --stem <name>)` before `state: OPEN`, and a `--mark opened` line carrying the quoted argument; WHEN it runs with `--stem collector-flow` THE SYSTEM SHALL print `prototype: collector-flow`, no `📌` line, and name `design/prototypes/collector-flow/states.json`; WHEN `--stem "Bad Name"` is given THE SYSTEM SHALL exit 2 naming `--stem`; WHEN the argument is `   ` THE SYSTEM SHALL exit 2 with stderr containing `usage: give the idea in a few words` → writes tests/prototype/entry.test.js
- **AC-20261007-02-2**: WHEN `--mark opened` runs for the words argument with `--stem collector-flow` and a valid `states.json` THE SYSTEM SHALL exit 0, create `proto/collector-flow` and `.claude/worktrees/proto-collector-flow`, and write `status.json` with `brief: "n/a"`, `stem: "collector-flow"` and `input` = `{ kind: "words", brief: null, idea: "A collector flow: women save → row turns green!" }`; a following bare run with the argument `collector-flow` SHALL print `state: ROUND` and `prototype: collector-flow`; a following run with `--stem other` SHALL exit 2 containing `the stem is fixed once opened`; WHEN `--mark opened` runs for `docs/roadmap/28-functional-prototype.md` THE SYSTEM SHALL write `brief: "28"`, `stem: "28-functional-prototype"` and `input` = `{ kind: "brief", brief: "docs/roadmap/28-functional-prototype.md", idea: null }` → writes tests/prototype/entry.test.js
- **AC-20261007-02-3**: WHEN the driver runs against a host whose config has no `prototype` block THE SYSTEM SHALL exit 2 with stderr containing `no "prototype" config block`, `declares how a throwaway build of this app runs` and `/spec:doctor`; WHEN the bare run executes for `docs/roadmap/28-functional-prototype.md` whose header reads `Lane: structural` THE SYSTEM SHALL exit 0 and print `state: OPEN` with no stderr line containing `Lane` → rewrites tests/prototype/prototype-driver.test.js :: AC-20260928-01-1: the driver exits 2 naming prototype and
- **AC-20261007-02-4**: WHEN a words prototype (`--stem collector-flow`) reaches `TESTS` THE SYSTEM SHALL print a `File:` line containing `e2e/proto-collector-flow.spec.ts` and no `{stem}` or `{brief}`; WHEN `--mark contracted` then runs THE SYSTEM SHALL write `contract.json` with `stem: "collector-flow"`, `brief: "n/a"` and `idea: "A collector flow: women save → row turns green!"`; WHEN `--mark tests-derived` completes THE SYSTEM SHALL set `contract.json.tests.source` to `e2e/proto-collector-flow.spec.ts` and append a ledger row with `brief: "n/a"` and `stem: "collector-flow"` → writes tests/prototype/entry.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-10-07): the slug expression in D1 yields `a-collector-flow-women-save-row-turns-green` for the example, `` for whitespace and `28-functional-prototype` for a stem-shaped string. — **if false:** fix the expression to the recorded outputs; the examples in D1 and AC-1 are the contract.
- A2 (lock grep, 2026-10-07): no script reads a brief's `Lane:` header — the gate lived in `plan.md`, `roadmap-brief.md`, `prototype.md`, `design.md` and `docs/canonical/design.md` only — so AC-3's admit case is green against the pre-image; it is kept as the pin that no lane refusal is ever added, and the AC's red half is the refusal text. — **if false:** the reading code is deleted in `prototype-driver.js`'s row.
- A3: `tests/prototype/fixture.js`'s driver wrappers accept an arbitrary first argument (today they pass the brief path) — the new test file calls the driver with words and a stem through the same wrappers. — **if false:** the wrappers gain an `arg` option in `fixture.js` (a `tests` row added at build, recorded as a deviation).
- A4: `plan.md` loses two sentences and `run`/`plan` read-load budgets are untouched (plan.md at 328/328 before this spec, lower after). — **if false:** never raise a budget; the edit only deletes.

## Rationale

Brief 28 required a brief path and a `Lane: behaviour` header because "the shape of the ask is
known when the brief is minted" — and on 2026-10-07 that gate refused a host's first-light brief
whose own text named an observable surface. JJ's ruling: the prototype is a sketchpad; a
conversation's words are enough to open one, and choosing the command is choosing the lane. The
three shapes mirror plan's so the two entry commands read the same; the stem is the only name that
must be stable (branch, worktree, contract directory, `prototype:` frontmatter on the specs), so
words get a derived slug printed as an auto-pick and renamable exactly once, before the branch
exists. The idea text is persisted at `opened` rather than at the bare run because a bare run
never writes `status.json` (the one exception, the app port, is a resource allocation), and
`opened` is still before any round. `brief: n/a` is the spelling `spec-status.js` already treats
as "no roadmap", so the ledger and the contract agree with the specs plan writes later. The lane
gate was prose in five files and code in none; deleting the prose is the whole fix, and the
fixture's `Lane: structural` keeps the admit case honest. Rejected: asking the user for the stem
(a question the driver can answer, core § Question Style); substituting `{brief}` with the stem
for compatibility (a token that lies about what it holds). No `SHALL CONTINUE TO` pin: the brief
shape keeps its own citing tests in `prototype-driver.test.js`.

Collision closure (2026-10-07, literals `Lane: behaviour`, `{brief}`): every hit outside the File Plan is a prose mention, a file spec 01 deletes before this spec builds, or an unrelated meaning (`{brief}` in `tests/queue/queue-overlay.test.js`, `tests/build/build-driver.fixtures.js`) — waived.

## Canonical Delta

`docs/canonical/design.md` § Prototypes: the first sentence becomes `/spec:prototype <idea in
words | brief path | stem>` runs a functional prototype on `proto/<stem>` (the stem is the brief's
stem, a slug of the words printed as an auto-pick and renamable once with `--stem` before
`opened`, or the re-opened stem; the idea and the input kind are written into `status.json` at
`opened`); the sentence `A brief whose header says Lane: behaviour goes to this command instead of
/spec:plan.` is replaced by `A brief's Lane: field is advisory; running this command is choosing
the behaviour lane, and no gate runs on the prototype tree.`
