---
description: Mocks-stage supplement to the spec pipeline's shared invariants — the mocks state machine, seed grammar, confirmation and product-stage exemption, read by the mocks driver and question-style-gate.js, not a workflow entry point
---

# Spec Pipeline: Mocks-Stage Supplement

## Mocks: State Machine

`mocks-driver.js` derives the state on every run from `design/mocks/status.json`
(`schemaVersion: 3`) plus the seed — a recorded mark is never trusted over the artifact it
closed. The order is fixed:

**SEED → SCREENS → APPROVED**

`SEED` while `marks.seedDone` is null, the seed declares no journey, or any journey has zero
beats or a malformed line. `SCREENS` while any seed journey is not approved against the seed's
current story hash, or `marks.approved` is null or older than any journey's `approved` time.
Else `APPROVED`, terminal. There is no shell step and no theme step: a gray wireframe has
neither; colours and the shared layout belong to the design stage (ADR-0030).

**Two modes.** A host whose config carries a `walkthrough` key holding a non-null, non-array
object is in **service mode**; any other host is in **terminal mode**. Terminal mode draws and
sends nothing: `--mark journey-drawn`, `round push` and `round pull` refuse naming `no
walkthrough block`, the SCREENS step prints each journey's persona and sentences, and the
user's literal `approve` is recorded with `--mark journey-approved` as `by: "terminal"`. The terminal SCREENS step lists every pending journey in one block under `approve all, or name the ones to change`, with one `--mark journey-approved --journey <j>` line per journey; a named change edits the seed, which reopens that journey by hash. It
never creates `design/rounds/` or `design/mocks/screens/`. An approval made in one mode stays
valid in the other — the story hash is the only test.

**Marks.** Each `--mark` verifies its own artifacts and refuses naming the remedy — act on the
printed refusal, never pre-check it in prose. `--mark seed-done`, `journey-drawn`,
`journey-approved` and `approved` are the whole alphabet.

**Reopening never deletes.** `--reopen journey:<j>` clears that journey's `approved`,
`marks.approved` and `pushed.digest` (the next push opens a fresh round) and appends a
`reopens` row. Any first word that is not a command is an
unknown command, never a silent bare run.

## Mocks: Seed

`design/mocks/seed.md` (template `spec/templates/mocks-seed.md`) names the product in three
sentences and holds one `### <journey-kebab>` block per journey — a persona line followed by
numbered **beats**, one per line: `N. "client sentence" -> screen[@state]`. Quotes are
mandatory, `N` runs contiguously from 1, `screen` and `state` match `^[\w][\w-]*$`, and
`@state` is optional; alternates ("if X then Y") are separate journey blocks, and the same
sentence or screen may appear in any number of journeys. `lib/surfaces.js`'s
`parseSeedJourneys` returns `beats` in seed order plus `malformed` (every non-blank body line
that is not a beat, and one `numbering: expected <k>, got <n>` entry per gap) and, derived
from the beats, `labels` and `edges` (every consecutive beat pair whose screens differ).
`beatHash(beats)` is the one hash of a journey's story — the first 12 hex of sha256 over its
canonical `<beat> -> <screen>[@<state>]` lines — shared by the driver and the walkthrough
service's confirm (§ Mocks: Confirmation).

SEED reads the idea from `.claude/genesis/brief.md`'s `## What I think you're building` when that file has it (the step prints `idea (from genesis brief): …`) and asks the user for it only when it does not.

`--mark seed-done` accepts when the seed declares at least one journey, every journey has a
beat and no malformed line. It reads no
record file, no app and no config, and never asks the user a question: sample values are
invented from the seed's own sentences, awkward cases included, and typed into each screen.

## Mocks: Checkpoint contract

Printed by `mocks-driver.js` at every state; never restated here. An accepted `--mark` prints,
as its last non-blank line:

```
✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks
```

`--state` is a read-only peek: it prints only the derived state name and never writes
`status.json` beyond first-run creation.

## Mocks: Authoring Rules

**One file per screen.** A screen is `design/mocks/screens/<screen>.json` or
`<screen>@<state>.json` — the json-render spec itself (`root`, `elements`, optional `state`),
named exactly as the seed's beats name it; `lib/mocks-round.js` is the one reader, and it skips
every name starting with `.`. `--mark journey-drawn --journey <j>` (service mode) refuses a
beat whose file is absent, then checks the whole would-be round offline — the client's own
catalog check plus `bad-screen-file`, `bad-journey` and `no-control` — and refuses on any
finding; a typo costs no request. It sends nothing.

**The five drawing rules** (skill `mock-authoring`):

1. One file per screen and state, named exactly as the beat names it.
2. Only the catalog's components and their props (`walkthrough-catalog` key); `journey-drawn`
   checks it.
3. Every move between two screens of a journey is a real control that navigates there.
4. Sample values are invented from the seed, awkward cases included, and one person or record
   reads the same on every screen.
5. An element's key is its stable name — a note is pinned to it, so a key is never renamed
   while the element lives.

## Mocks: Rounds and Notes

A round is a full snapshot — every drawn journey in seed order and every screen file on disk —
because the service refuses a partial one. `round push` (service mode) assembles it, repeats the
offline checks, and sends it through `walkthrough.js push` as a child process; the client
numbers the round, the driver never does, and an unchanged round is not re-sent. It prints the
link; the session prints `🎨 ready for review — <link>` and **ends the turn**. Readers are
admitted by the service itself — the plugin never mints a reader link and never prints a token.

`round pull` fetches the latest round's notes and approvals and prints the worklist: a count
line, one line per waiting item (a note or a journey thread whose `status` is `open`, shown by
its **last** entry), then one line per seed journey — confirmed, confirmed on an older story,
or not confirmed. A journey is confirmed when any pulled approval for it carries the seed's
current hash.

**The answer loop.** For each waiting item: a design or field note edits the screen file; a
missing or wrong step (usually a `[project]` note) edits the seed's beats — the hash changes
and the journey reopens by itself. Answer with `walkthrough reply --note <id> --text-file <file>` (a
story thread: `--note <journey>`), push again, and the item turns `answered`. Only the client's words reopen it.

## Mocks: Confirmation

The client's confirm control is rendered and posted by the walkthrough service; this side only
reads it. SUCCESS: `✅ journey-approved recorded for <j> (confirmed by the client)`, or `(confirmed
in the terminal)`, or `(waived: <reason>)`. PATH BACK: a seed edit changes the story hash and
reopens the journey with nobody retyping anything; `--reopen journey:<j>` does it by hand.
ARTIFACT: `design/rounds/<n>/approvals.json` (pulled) and `design/mocks/status.json`
(recorded); nothing dated or contractual lies beyond them.

**`--mark journey-approved --journey <j>`.** Terminal mode: record
`by: "terminal"`. Service mode, in order: the journey is drawn; something was pushed; the latest
round shows the seed's current hash; an approval exists for it and one carries the current
hash; then record `by` as the approval's. `--waive --reason <r>` (service mode
only) skips the pushed and approval checks and records `by: "waived"`
with the reason. An open note never blocks this mark.

**`--mark approved`.** Refuses the first journey not approved on the current hash; in service
mode with a round, pulls notes and refuses the first waiting item (an `answered` note does
not block — a client who disagrees reopens it by replying); closes the round with `walkthrough.js
mark --status closed` — a failed close refuses before `marks.approved` is set — then records
`marks.approved`. The stage finishes when every story is confirmed and nothing waits for an
answer.

## Product-Stage Exemption (question-style-gate.js)

Enforced by `question-style-gate.js` — its header comment is the contract. While a mocks run is live (`design/mocks/status.json` exists with `state` other than
`APPROVED`) or a genesis run is live (`.claude/genesis/status.json` exists with `handoff`
null), the question-style gate's tier-2 `derive` verdict is treated as `pass` only when some question names a product-fact key (the coverage keys, `success-metric`) or `assumption(s)` — which is why discovery questions name their key in parentheses; every other `derive` is advised as outside the stage.
