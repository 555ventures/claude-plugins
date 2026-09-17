---
date: 2026-09-17
status: implementing
tier: standard
area: mocks
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-17
open_markers: 0
build_base: main
diff_base: 5c2a20f055a35a620693b52f729f09631985df36
---

# The client confirms the story

## Goal

`/spec:mocks` today turns a seed journey into a navigation graph: the seed grammar is "names and
arrows only", the parser keeps one persona line, and so the client's own discovery sentences never
reach the app — the agent draws screens joined by arrows, and there is no story for a client to
confirm. After this spec a seed journey is a numbered list of the client's own sentences, each
bound to one screen; SCREENS copies those sentences verbatim into the app; the driver verifies the
copy mechanically; and the one human gate in the whole mock stage is the client confirming a
journey, once, through the client link, against a hash of the exact sentences they read. Every
other mark is derived from files. Done means: a seed written in the beat grammar drives a run
SEED → SHELL → SCREENS → THEME → APPROVED with no page control outside the client role, a changed
beat silently voids the confirmation it invalidates, and a client's "not now" survives into the
roadmap's parking lot without a human re-typing it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The seed's `### <journey-kebab>` block is a persona line followed by **beats**: `N. "client sentence" -> screen[@state]`, one per line. Quotes are mandatory; `N` runs contiguously from 1; `screen` and `state` match `^[\w][\w-]*$`; `@state` is optional. Alternates ("if X then Y") are separate journey blocks. The ```` ```surfaces ```` block is deleted from the seed grammar and from `spec/templates/mocks-seed.md`, whose header comment also drops "Every journey label must be declared in exactly one journey" — the same sentence may appear in two journeys, and the same screen in any number (AC-20260917-01-1, AC-20260917-01-2, AC-20260917-01-19) | The client's sentence is the unit the client can confirm; an arrow is not. Quotes let a sentence carry `->`; contiguous numbering makes a deleted line a parse error instead of a silent gap. The shared-label refusal an old cached driver once had is never reintroduced |
| D2 | `lib/surfaces.js`'s `parseSeedJourneys(text)` keeps its `Map<kebab, {…}>` shape and gains `beats: [{n, beat, screen, state}]` (`state` is `null` when absent) and `malformed: [string]` (every non-blank body line after the persona that is not a beat, plus one `numbering: expected <k>, got <n>` entry per gap). `labels` and `edges` are **kept**, now derived from the beats: `labels` = screen targets deduplicated in beat order; `edges` = every consecutive beat pair whose screens differ, as `[from, to]`. A new pure export `beatHash(beats)` returns the first 12 hex of sha256 over the canonical lines `` `${beat} -> ${screen}` + (state ? `@${state}` : '') `` joined by `\n`. `parseSurfaces` (the retired atlas's fold, no caller since the atlas retired) is deleted from the module and its exports; `parseSurfaceLines` and `parseSurfacesPlacement` are untouched (AC-20260917-01-1, AC-20260917-01-2, AC-20260917-01-3, AC-20260917-01-12) | `genesis-driver.js` consumes `labels` in `briefJourneysCheck` and `journeyPlacementCheck`; dropping them would make both pass vacuously. The hash lives in the library so the driver, `client waive` and the test all compute it one way |
| D3 | `--mark seed-done` additionally refuses (exit 2) any seed journey with a non-empty `malformed` list — naming the journey and the first offending line — or with zero beats, remedy `rewrite the block as numbered "sentence" -> screen[@state] lines (spec/doctrine/mocks.md § Mocks: Seed)`. A seed still carrying a ```` ```surfaces ```` block fails this way, since its lines match no beat (AC-20260917-01-4) | The old grammar must fail loudly at the first mark rather than parse into a journey with no beats and no story |
| D4 | `--mark journey-drawn --journey <j>` additionally requires `check --json`'s `journeys[<j>].steps` to equal the seed's beats: same length, and at every index the same `beat`, `screen` and `state` (`undefined`/`null` state are equal). The refusal names the first differing index and both sides, e.g. `beat 2: seed "I tap Sign in" -> login@empty, journeys.ts "I sign in" -> login — remedy: copy the seed's beats verbatim into src/journeys.ts`. The existing unknown-id, out-of-seed and unresolved-edge refusals stay in front of it (AC-20260917-01-5) | SCREENS copies, never paraphrases; the driver is the only thing that can prove it. The driver may not read `src/journeys.ts` itself, so the beats travel through `check --json` |
| D5 | `--mark journey-approved --journey <j>` is exactly: `<j>` declared in the seed; `check --json` lists it with `resolved: true`; the D4 beats equality; `notes.journeys[<j>].status !== "open"`; `approval.journeys[<j>].client` is `"ok"` or `"waived"` with `approval.journeys[<j>].beats === beatHash(seed beats)`; then the ledger gate. A missing verdict refuses naming `remedy: client open (send the link; the client confirms the journey) or client waive --journey <j> --reason <r>`; a stale hash refuses naming both hashes and `remedy: the client re-confirms the journey on the link, or client waive`. The mark stores `status.journeys[<j>].beats = <hash>`, and `deriveState()` treats a journey whose stored hash differs from the current seed's as not approved (SCREENS again, "approve journey <j>"). The driver no longer reads `approval.journeys[].approvedAt`, `approval.screens`, or `notes.notes` anywhere in this mark; an open screen note on a step screen does not block it (AC-20260917-01-6, AC-20260917-01-7) | One gate, one human: the client's ok against the sentences they read. A seed edit changes the hash and reopens the journey mechanically — the "workflow note answered by editing the seed" path needs no command. Screen approvals were a second human step the mock stage does not have |
| D6 | `--mark theme-picked` reads no `approval.json`: it records once `check --json`'s `config.theme` is a non-empty string listed under `themes`. A null theme refuses `remedy: set theme: "<k>" in mock.config.ts, naming an authored src/themes/<k>.css`; a theme not under `themes` keeps its existing refusal (AC-20260917-01-8) | The page pick existed only for a page role the stage no longer has; the person running the stage edits the config line from the back |
| D7 | `--mark approved` refuses any note in `notes.notes` whose status is `open` **or** `answered` (naming the note and `remedy: the client approves or defers it on the link`), and any `project: true` note whose status is neither `approved` nor `deferred`; the existing per-journey client-verdict refusal stays. Before recording, for every note (in `notes.notes`) and journey conversation (in `notes.journeys`) with status `deferred` that has no ledger row yet, it appends one exclusion row through `appendAssumption`: `id` = next free `X<n>`, `step` `APPROVED`, `kind` `exclusion`, `claim` = the item's first thread text, `tag` `said-by-user`, `status` `confirmed <today>`, `note` = `deferred: <note id | journey id>`. A row whose `note` already names that id is never written twice. `ledger add --kind exclusion` keeps accepting (it does today; the doctrine sentence claiming it refuses is corrected, D10) (AC-20260917-01-9) | `deferred` is the fourth note status: a valid point, not now. It blocks nothing and is never lost — genesis already fences every `confirmed`/`open` exclusion row's claim into the roadmap's Parking lot, and exclusion rows lost their only writer when `ledger derive` retired |
| D8 | The CLIENT state is removed: the chain is **SEED → SHELL → SCREENS → THEME → APPROVED**. THEME prints two blocks: while `marks.themePicked` is null, the existing "pick a theme" block (with the Skill line, `Read only: mock.config.ts`); once picked and `marks.approved` null, a "close the mock" block — `Read only: design/notes.json, design/approval.json`, `Doctrine: spec/doctrine/mocks.md § Mocks: Client Player`, then `client open` and `--mark approved`, **no** Skill line. `client open`'s guard becomes "at least one `status.journeys[*].drawn` is set" (refusal names `remedy: --mark journey-drawn --journey <j>`); the serve-URL refusal stays. `client waive --journey <j> --reason <r>` writes `{client: "waived", reason, at, beats: beatHash(seed beats)}`. `--reopen` targets and cascades are unchanged (AC-20260917-01-10, AC-20260917-01-11) | The client walks the app while SCREENS is still drawing, so a state whose only content was "walk the client role" no longer exists; the final mark is bookkeeping and lives where the theme did |
| D9 | `spec/templates/mock/contract.json` goes to `contractVersion: 2`. `shapes.check["journeys[]"]` is unchanged; `shapes.approval["journeys{}"]` becomes `["client", "beats"]` and `shapes.approval.theme` is removed. A new **top-level** `fields` key (never under `shapes`, so `validateShape` never walks it) documents the full accepted key sets: `"check.journeys[]": ["id","title","persona?","steps","edges","resolved","unresolved"]`, `"check.journeys[].steps[]": ["screen","beat","state?"]`, `"check.journeys[].edges[]": ["from","to","label?","say?"]`, `"notes.status": "open|answered|approved|deferred"`, `"approval.journeys{}": ["client","beats","at?","reason?"]`. `spec/templates/mock/journeys.ts`'s `Step` gains required `beat: string`; its comment stops claiming the optional fields are safe for the reviewer to ignore and names contract v2 instead (AC-20260917-01-15, AC-20260917-01-16) | `contractOrDie` is exact equality, so a reviewer build that predates beats refuses loudly instead of crashing on an unknown key. Spike: today's build rejects `state`, `say`, `beat` and `persona` at the strict parse (Assumptions A2) |
| D10 | Prose: `spec/doctrine/mocks.md` § Mocks: State Machine names the five-state chain and the D5–D8 marks; § Mocks: Seed documents the beat grammar; § Mocks: Page Notes names four statuses (`open` red · `answered` yellow · `approved` blue · `deferred`) and states that the journey conversation is **workflow** (order, a missing or wrong step — answered by editing the seed's beats, which changes the hash and reopens the journey) while screen notes are **design and fields** and never touch the seed; § Mocks: Client Player states the actor model (client and session on the page, the operator from files and CLI; the client ends their own notes) and the confirm control's three-way spec; § Provenance Ledger's exclusion sentence becomes "written by `--mark approved` from each deferred note (`note` = `deferred: <id>`); a hand-typed row passes through `ledger add`"; § Mocks: Look and Serve drops "in CLIENT". `spec/commands/mocks.md` drops its CLIENT section, rewrites SCREENS ("copy the beats verbatim; assign only edge labels and `data-to` wiring; never invent or paraphrase a step"), THEME and the Skill-line sentence. `spec/templates/genesis-brief.md`'s Journeys comment and `genesis-driver.js`'s `missing-journey` remedy string say "one `label -> label` line per beat edge" instead of "the seed's surfaces block verbatim". A new ADR (next free number, 0029 at lock) records the actor model and the CLIENT collapse, amending ADR-0028 (AC-20260917-01-14, AC-20260917-01-17; genesis prose `[no-ac: remedy-string wording, no behavior]`) | Doctrine that describes a state the driver no longer derives is the class the doctrine-truth queue hunts; the actor model is the ruling every later mock spec must inherit |
| D11 | Version bump: the next free minor of the `spec` plugin via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: version discipline is a review check, not a behavioural AC]` | § Gotchas, concurrent-session version race: a literal number is a target, never a pin |
| D12 | Test currency: `tests/mocks/mock-app-fixtures.js`'s `writeSeed`/`appendSeedJourney` emit the beat grammar (`1. "A fixture persona opens the app" -> home`), `contractOk` returns `contractVersion: 2`, `defaultApproval` drops `theme`; `tests/mocks/mock-driver-ledger.test.js`'s AC-24 fixture satisfies D5 (client ok + hash, no `approvedAt`/screens); `tests/mocks/mock-cli.test.js`'s AC-1 stub pair becomes 3-vs-2 (currency only, no retag). New `tests/mocks/surfaces.test.js` is the parser's first unit test (AC-20260917-01-1, AC-20260917-01-2, AC-20260917-01-3, AC-20260917-01-12) | The fixtures spell the retired grammar and version; every driver test runs over them |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/mocks-seed.md | MODIFY | doctrine | D1: beat grammar in the Journeys comment and example block; drop the surfaces block and the "exactly one journey" sentence |
| spec/scripts/lib/surfaces.js | MODIFY | scripts | D2: beats/malformed on `parseSeedJourneys`, labels/edges derived from beats, `beatHash` export, `parseSurfaces` deleted; header comment re-derived |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3–D8: seed-done beats refusal, journey-drawn beats equality, journey-approved chain + stored hash + deriveState hash check, theme-picked from config, approved answered/deferred rules + exclusion rows, CLIENT removed, THEME close block, client open guard, client waive hash; header comment re-derived |
| spec/templates/mock/journeys.ts | MODIFY | doctrine | D9: `Step.beat: string` required; comment names contract v2 |
| spec/templates/mock/contract.json | MODIFY | doctrine | D9: contractVersion 2, approval journeys{} keys, theme removed, top-level `fields` |
| spec/commands/mocks.md | MODIFY | doctrine | D10: CLIENT section removed, SCREENS copy-verbatim rule, THEME close step, Skill-line sentence, frontmatter description |
| spec/doctrine/mocks.md | MODIFY | doctrine | D10: State Machine, Seed, Page Notes, Client Player, Provenance Ledger (one sentence), Look and Serve |
| spec/templates/genesis-brief.md | MODIFY | doctrine | D10: Journeys comment — one `label -> label` line per beat edge |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D10: the `missing-journey` remedy string only; no logic change |
| spec/scripts/lib/mocks-ledger.js | MODIFY | scripts | D10: header comment only — exclusion rows are written by `--mark approved` from deferred notes, not by the retired `ledger derive`; no code change |
| spec/templates/mocks-ledger.md | MODIFY | doctrine | D10: the header comment's "run `ledger derive`" sentence becomes "written by `--mark approved` from each deferred note" |
| docs/adr/0029-the-client-confirms-the-story.md | CREATE | other | D10: actor model, CLIENT collapse, beat hash; amends ADR-0028 (take the next free number at build) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/mocks/surfaces.test.js | CREATE | tests | AC-20260917-01-1, AC-20260917-01-2, AC-20260917-01-3, AC-20260917-01-12 |
| tests/mocks/mock-app-fixtures.js | MODIFY | tests | D12: beat-grammar seed writer, contractVersion 2, approval without theme (fixture currency, no AC) |
| tests/mocks/mock-driver-states.test.js | MODIFY | tests | AC-20260917-01-4, AC-20260917-01-5, AC-20260917-01-6, AC-20260917-01-7, AC-20260917-01-8, AC-20260917-01-9, AC-20260917-01-10, AC-20260917-01-11, AC-20260917-01-19 |
| tests/mocks/mock-driver-ledger.test.js | MODIFY | tests | D12: spec 20260914/01 AC 24 fixture made D5-current (client ok + hash); no retag |
| tests/mocks/mock-contract.test.js | MODIFY | tests | AC-20260917-01-15, AC-20260917-01-16 |
| tests/mocks/mock-cli.test.js | MODIFY | tests | D12: spec 20260914/01 AC 1 stub pair 3-vs-2 (currency only, no retag) |
| tests/consistency/mocks-doctrine.test.js | MODIFY | tests | AC-20260917-01-14, AC-20260917-01-17, AC-20260917-01-18 |

Orchestrator duty outside the table: after the build, run `node scripts/plugin-bump.js --check` and confirm the new ADR's number is the next free one under `docs/adr/`.

## Contracts

**Seed journey block (D1)** — `design/mocks/seed.md`:

```markdown
### first-visit
Ann (a new patient's daughter) is invited by email, signs in, and lands on her mother's care plan.
1. "I open the app" -> home
2. "I tap Sign in" -> login@empty
3. "I see Mum's care plan" -> care-plan
```

Beat line regex, the one parser: `/^(\d+)\.\s+"(.+)"\s*->\s*([\w][\w-]*)(?:@([\w][\w-]*))?\s*$/`.

**`parseSeedJourneys` value (D2)**:

```js
{
  persona: 'Ann (a new patient\'s daughter) is invited by email, …',
  beats: [
    { n: 1, beat: 'I open the app', screen: 'home', state: null },
    { n: 2, beat: 'I tap Sign in', screen: 'login', state: 'empty' },
    { n: 3, beat: "I see Mum's care plan", screen: 'care-plan', state: null },
  ],
  malformed: [],
  labels: ['home', 'login', 'care-plan'],
  edges: [['home', 'login'], ['login', 'care-plan']],
}
```

**`beatHash(beats)` (D2)** — sha256 over `I open the app -> home\nI tap Sign in -> login@empty`, first 12 hex → `7c0be20327a0` (executed, A1).

**`app/src/journeys.ts` template (D9)**:

```ts
export type Step = { screen: string; beat: string; state?: string }
export type Edge = { from: number; to: number; label?: string; say?: string }
export type Journey = { id: string; title: string; persona?: string; steps: Step[]; edges: Edge[] }
```

**`contract.json` (D9)** — changed keys only:

```json
{
  "contractVersion": 2,
  "shapes": { "approval": { "required": ["contractVersion", "screens", "journeys"],
                            "screens{}": ["hash", "approvedAt", "states", "viewports", "schemes", "screenshots"],
                            "journeys{}": ["client", "beats"] } },
  "fields": {
    "check.journeys[]": ["id", "title", "persona?", "steps", "edges", "resolved", "unresolved"],
    "check.journeys[].steps[]": ["screen", "beat", "state?"],
    "check.journeys[].edges[]": ["from", "to", "label?", "say?"],
    "notes.status": "open|answered|approved|deferred",
    "approval.journeys{}": ["client", "beats", "at?", "reason?"]
  }
}
```

**`status.json` journey entry (D5)**: `{ drawn: <iso|null>, approved: <iso|null>, beats: <12hex|null> }`.

**Exclusion row written at `--mark approved` (D7)**:

```
| X1 | APPROVED | exclusion | Export the care plan as PDF | said-by-user | confirmed 2026-09-17 | - | - | deferred: n7 |
```

**Obligations on the reviewer package (`@555-ventures/mock-review`, sibling repo, its own spec)** — this spec ships first and states them here so the sibling spec can cite them: (1) `check --json` accepts and echoes `step.beat`, `step.state`, `edge.say` and `journey.persona`, and reports `contractVersion: 2`; (2) the client role lists every drawn journey from `journey-drawn` on, renders each beat sentence verbatim, and its confirm control writes `approval.journeys[j] = {client: "ok", beats: <hash over the beats it displayed>, at}` — SUCCESS sentence: `Confirmed — story <hash>` on the journey; PATH BACK: a workflow note on the journey (the session edits the seed, the hash changes, the confirmation is void, the journey reopens); farthest ARTIFACT: `design/approval.json`; (3) the client ends their own notes — approve, and the new `deferred` status — and the note enum gains `deferred`; (4) the journey box is labelled workflow, the screen box design; (5) no mark in this spec reads a key that only a non-client control writes, so the screen-approve, journey-approve and theme-pick controls are not needed by the mock stage (the design stage's screen approval, `stage-design.md`, is untouched by this spec and remains the reviewer's concern).

## Behavior

**SCREENS loop, per journey.** Read the seed block; copy each beat into `src/journeys.ts` as `{screen, beat, state?}` in order; wire each consecutive pair as an edge whose real control carries `data-to`; run `check`; `--mark journey-drawn`. The client link is then usable (`client open`). Once the client confirms — or `client waive` — and the journey conversation is not open, `--mark journey-approved`. A workflow note on the journey is answered by editing the seed's beats; the next bare run lands on "approve journey <j>" again because the stored hash no longer matches, and the client re-confirms.

**THEME.** Author `src/themes/<k>.css` candidates, set `theme: "<k>"` in `mock.config.ts`, `--mark theme-picked`. The next bare run prints the close block: `client open` (for any journey still unconfirmed) and `--mark approved`.

**`--mark approved`** walks: every seed journey has a client verdict → no `open`/`answered` note → every project note `approved`/`deferred` → ledger gate → write one exclusion row per newly deferred item → record. A second run after a `--reopen` writes no duplicate rows.

**Edge: a seed journey removed after approval** — unchanged: `deriveState` iterates the seed, so the removed journey simply stops counting. **Edge: the same beat sentence in two journeys** — parses, draws and approves; never a refusal (AC-19 pin).

## Acceptance Criteria

- **AC-20260917-01-1**: WHEN `parseSeedJourneys` reads the Contracts seed block THE SYSTEM SHALL return exactly the Contracts value — `beats` in order with `state: null` where `@state` is absent, `malformed: []`, `labels: ['home','login','care-plan']`, `edges: [['home','login'],['login','care-plan']]` — and for a block whose beats 2 and 3 share screen `login` SHALL return one edge fewer (`[['home','login']]`) → writes tests/mocks/surfaces.test.js
- **AC-20260917-01-2**: WHEN a journey body carries a non-beat line after the persona (an unquoted `1. I open the app -> home`, a ```` ```surfaces ```` fence line, or numbering `1., 3.`) THE SYSTEM SHALL list each in `malformed` (the gap as `numbering: expected 2, got 3`) while still returning the beats that parsed; and WHEN two journeys carry the identical sentence `"I open the app" -> home` THE SYSTEM SHALL return both with `malformed: []` → writes tests/mocks/surfaces.test.js
- **AC-20260917-01-3**: WHEN `lib/surfaces.js` is required THE SYSTEM SHALL export `parseSurfaceLines`, `parseSeedJourneys`, `parseSurfacesPlacement` and `beatHash`, and SHALL NOT export `parseSurfaces` → writes tests/mocks/surfaces.test.js
- **AC-20260917-01-4**: WHEN `--mark seed-done` runs over a seed whose journey `first-visit` carries a ```` ```surfaces ```` block (and so zero beats) THE SYSTEM SHALL exit 2 naming `first-visit`, the first offending line, and a `remedy:` naming § Mocks: Seed, leaving `marks.seedDone` null; and over the Contracts seed block SHALL record the mark → writes tests/mocks/mock-driver-states.test.js
- **AC-20260917-01-5**: WHEN `--mark journey-drawn --journey first-visit` runs and `check --json` reports the journey resolved but with `steps[1].beat` = `I sign in` where the seed says `I tap Sign in` THE SYSTEM SHALL exit 2 with stderr containing `beat 2:`, both sentences, and `remedy: copy the seed's beats verbatim into src/journeys.ts`; WHEN the steps equal the seed's beats (same `beat`, `screen`, `state`; a step without `state` equals a beat with `state: null`) SHALL record `drawn`; the pre-existing unknown-id, out-of-seed and unresolved-edge refusals SHALL still fire first → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260914-01-7
- **AC-20260917-01-6**: WHEN `--mark journey-approved --journey first-visit` runs THE SYSTEM SHALL refuse, in this order, on: `resolved: false`; a beats mismatch (D4 wording); `notes.journeys['first-visit'].status === 'open'`; `approval.journeys['first-visit'].client` absent (stderr names `client open` and `client waive --journey first-visit`); `client: 'ok'` with `beats: 'deadbeef0000'` against a seed hashing to `7c0be20327a0` (stderr names both hashes) — and SHALL record once `client: 'ok', beats: '7c0be20327a0'`, writing `status.journeys['first-visit'].beats === '7c0be20327a0'`, with `approval.json` carrying no `approvedAt` and no `screens` entry and `notes.notes` holding an `open` note on screen `home` → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260914-01-8
- **AC-20260917-01-7**: WHEN a journey is recorded approved with `beats: '7c0be20327a0'` and the seed's beat 2 is then edited to `"I tap Log in" -> login@empty` THE SYSTEM SHALL derive `SCREENS` (`--state`) and the bare run SHALL print `## Step: approve journey first-visit`; with the seed unchanged it SHALL derive `THEME` → writes tests/mocks/mock-driver-states.test.js
- **AC-20260917-01-8**: WHEN `--mark theme-picked` runs with `config.theme: null` THE SYSTEM SHALL exit 2 with a `remedy:` naming `mock.config.ts` and `src/themes/`; with `config.theme: 'warm'` and `themes: []` SHALL exit 2 naming `warm`; with `config.theme: 'warm'`, `themes: ['warm']` and an `approval.json` carrying no `theme` key SHALL record the mark, and the next bare run SHALL print a `THEME` block containing `client open` and `--mark approved` and no `Skill:` line → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260914-01-9
- **AC-20260917-01-9**: WHEN `--mark approved` runs with every journey `client: 'ok'` THE SYSTEM SHALL exit 2 naming note `n1` while it is `open`, again while it is `answered` (remedy names the link), and a `project: true` note `n2` while it is `answered`; WHEN `n1` is `deferred` (first thread text `Export the care plan as PDF`) and `n2` is `approved` SHALL record the mark, append exactly one Assumptions row `| X1 | APPROVED | exclusion | Export the care plan as PDF | said-by-user | confirmed <today> | - | - | deferred: n1 |`, and `--state` SHALL print `APPROVED`; a second `--mark approved` after `--reopen theme` + `--mark theme-picked` SHALL leave exactly one row whose note is `deferred: n1` → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260914-01-10
- **AC-20260917-01-10**: WHEN every journey is approved and `marks.themePicked` is null THE SYSTEM SHALL derive `THEME`, and after `--mark theme-picked` with `marks.approved` null SHALL still derive `THEME` (never `CLIENT`); the SHELL block, both SCREENS blocks and THEME's pick block SHALL carry `Skill: mock-authoring`, and the SEED block, THEME's close block and the APPROVED line SHALL NOT → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260914-01-13
- **AC-20260917-01-11**: WHEN `client open` runs with no journey `drawn` THE SYSTEM SHALL exit 2 with a `remedy:` naming `--mark journey-drawn`; with one journey drawn while `--state` is `SCREENS` and `serve.url` `http://localhost:5180` SHALL print `http://localhost:5180/?client=k9`; with `serve.url: null` SHALL exit 2 naming `npx mock-review serve`; and `client waive --journey first-visit --reason "no client"` over the Contracts seed SHALL write `approval.journeys['first-visit']` = `{client: 'waived', reason: 'no client', at: <iso>, beats: '7c0be20327a0'}` and nothing else in the file → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260914-01-14
- **AC-20260917-01-12**: WHEN `beatHash` is given `[{beat:'I open the app',screen:'home',state:null},{beat:'I tap Sign in',screen:'login',state:'empty'}]` THE SYSTEM SHALL return `7c0be20327a0`, and a different string for the same beats with `state: null` on the second → writes tests/mocks/surfaces.test.js
- **AC-20260917-01-14**: WHEN `spec/doctrine/mocks.md` § Mocks: State Machine is read THE SYSTEM SHALL match `/SEED\s*→\s*SHELL\s*→\s*SCREENS\s*→\s*THEME\s*→\s*APPROVED/` and contain no `\bCLIENT\b`, and § Mocks: Page Notes SHALL contain the four literals `open`, `answered`, `approved`, `deferred` → rewrites tests/consistency/mocks-doctrine.test.js :: AC-20260914-01-19: mocks.md § Mocks: State
- **AC-20260917-01-15**: WHEN `spec-paths mock-contract` is read THE SYSTEM SHALL carry `contractVersion: 2`, a top-level `fields` object whose `"check.journeys[].steps[]"` equals `["screen","beat","state?"]`, `shapes.approval["journeys{}"]` equal to `["client","beats"]` and no `shapes.approval.theme`; and `--mark seed-done` against a stub reporting `contractVersion: 1` SHALL exit 2 naming `1 ≠ 2` → rewrites tests/mocks/mock-contract.test.js :: AC-20260914-01-3
- **AC-20260917-01-16**: WHEN `spec/templates/mock/journeys.ts` is read THE SYSTEM SHALL declare `beat: string` inside `Step` with no `?`, and SHALL NOT contain the phrase `the plugin itself never reads them` → writes tests/mocks/mock-contract.test.js
- **AC-20260917-01-17**: WHEN `spec/commands/mocks.md` and `spec/templates/mocks-seed.md` are read THE SYSTEM SHALL contain no `## CLIENT` heading, no `names and arrows only`, no `approval.theme`, and no ```` ```surfaces ```` fence, and `spec/commands/mocks.md` SHALL contain `verbatim` inside its `## SCREENS` section → writes tests/consistency/mocks-doctrine.test.js
- **AC-20260917-01-18**: WHEN `spec/doctrine/mocks.md` § Provenance Ledger is read THE SYSTEM SHALL hash to the post-change body pinned in the test (re-computed at build from the landed section) and SHALL contain `deferred: <id>` and no `ledger derive` → rewrites tests/consistency/mocks-doctrine.test.js :: AC-20260914-01-19: mocks.md § Provenance
- **AC-20260917-01-19**: WHEN two seed journeys both carry `1. "I open the app" -> home` and both are listed resolved by `check --json` with matching beats THE SYSTEM SHALL CONTINUE TO record `--mark seed-done` and `--mark journey-drawn` for each, never refusing a shared sentence or a shared screen → writes tests/mocks/mock-driver-states.test.js

## Assumptions (escalation triggers)

- A1: `crypto.createHash('sha256').update('I open the app -> home\nI tap Sign in -> login@empty').digest('hex').slice(0,12)` → `7c0be20327a0` (executed 2026-09-17, Node builtin). — **if false:** the AC literals are wrong, not the design; recompute and amend AC-6/-7/-11/-12 in the same build.
- A2: The installed reviewer build's `JourneySchema.safeParse` (from `/home/jj/projects/mock-review/dist/schemas/check.js`) returns `REJECT Unrecognized key: "state" @steps.0`, `… "beat" @steps.0`, `… "say" @edges.0`, `… "persona" @` and `OK` for a plain journey (executed 2026-09-17, scratch `spike-strict.mjs`, deleted). So no host can run a real reviewer against this spec's `journeys.ts` until the sibling spec lands; every test here runs over the stub. — **if false (a newer build accepts them):** nothing changes in this spec; the contract bump still stands because the plugin's template shape changed.
- A3: `node mocks-driver.js --root <tmp> ledger add … --kind exclusion …` exits 0 and writes the row today (executed 2026-09-17); `ledger derive` exits 2 `retired (ADR-0028)`. The doctrine sentence "`ledger add --kind exclusion` refuses, naming `ledger derive`" is stale, and D7/D10 correct it rather than build the refusal. — **if false:** D7's writer path still works (it calls `appendAssumption` directly), only the doctrine sentence changes wording.
- A4: `genesis-driver.js` reads `parseSeedJourneys` output only through `.labels` (`briefJourneysCheck`, `journeyPlacementCheck`) and never `.edges`, and no test under `tests/genesis/` writes a `design/mocks/seed.md` (grep 2026-09-17: zero hits). — **if false:** add the beat-grammar seed to that test's fixture in the same batch; never weaken the check.
- A5: `validateShape` walks only `contract.shapes[verb]`, so a top-level `fields` key is never validated against a response. — **if false:** move `fields` under a key `validateShape` provably skips and amend D9.
- A6: `tests/consistency/mocks-doctrine.test.js`'s Provenance-Ledger hash constant is the only byte-identity pin on `spec/doctrine/mocks.md`. — **if false:** every further pin enters the File Plan as a fix row, retagged with AC-18, never weakened.
- A7: Genesis's `approvalJourneyCount` counts `approval.journeys` keys, which `client ok`/`client waive` still create, so the genesis precondition is unaffected by dropping `approvedAt`. — **if false:** STOP, ask the user — genesis would need its own journey-count source.

## Rationale

The whole spec follows from one actor model the user fixed after ten rounds: on the served page there are only the client and the AI session; the person running `/spec:mocks` works from files and the CLI. Every control that existed only for a third page role — screen approve, journey approve, theme pick, the component page — is therefore not a gate here, and the driver stops reading what they wrote. The one gate left is the client's confirm, and it is only meaningful if it binds to the exact sentences the client read, hence the hash. Beats live on `Step`, not `Edge`: a journey with N steps has N beats but N−1 edges, and the opening beat would have nowhere to live. The driver may not read `src/journeys.ts` (the reviewer is the one structural reader), so the beats must travel through `check --json`, which forces the contract bump — and the spike showed the current reviewer build would reject them at its strict parse anyway, so a version-1 reviewer must refuse loudly rather than crash. `labels`/`edges` survive because genesis consumes them; a Fable consult first proposed dropping them and was disproved by reading genesis. `deferred` lands on the ledger's exclusion kind because that kind already has the exact downstream (the parking-lot check) and had lost its only writer; the doctrine claim that hand-typed exclusion rows are refused turned out false when executed, so the spec corrects the sentence instead of building the refusal. The CLIENT state collapses because the client's walk now happens during SCREENS; keeping a state whose only step was "walk the client role" would print a step with nothing to do. Refusing `answered` notes at the final mark is deliberate: an answer the client never looked at is the class spec 20260912/02 forbade closing silently; the escape for an absent client stays `client waive` at journey level, and a stranded note is a question to the client, not a silent close. Only one CONTINUE-TO pin (AC-19): every other pre-image behaviour this spec touches is a shape it retires. Rejected: keeping a `surfaces` block as "build scope" (a second grammar with no reader); a driver-side note status write (the page owns note lifecycle); refusing a shared beat sentence (the user's explicit veto). Fragile: the reviewer's half is a separate spec in the sibling repo; until it lands, a real run stops at `contractOrDie` with the install remedy, which is the intended loud failure.

Collision-closure waives (literals leg, run at lock over `CLIENT`, `approval.theme`, `approvedAt`, `parseSurfaces`, `names and arrows`, `ledger derive`): every `CLIENT` hit outside the File Plan is the lowercase word `client` or an unrelated genesis/replay/release token, not the mocks state; `approvedAt` in `docs/canonical/design.md`, `spec/commands/sketch.md`, `spec/doctrine/design.md`, `spec/doctrine/stages/stage-design.md` and `tests/consistency/design-stage-doctrine.test.js` is the design stage's screen approval, explicitly out of scope (Contracts, obligation 5); `tests/genesis/genesis-mock-app.test.js` spells `approvedAt` in a fixture genesis never reads (A7); `names and arrows` in `spec/doctrine/genesis.md` and `spec/templates/roadmap-brief.md` describes the roadmap grammar, which is unchanged; `parseSurfaces` in `genesis-driver.js` is a historical comment about the retired atlas and `docs/canonical/scripts.md` is covered by the Canonical Delta; `ledger derive` in `tests/review/*` is the unrelated phrase "--ledger derives"; the `ledger derive is retired` refusal text in `mocks-driver.js` stays (spec 20260914/01 AC 15 pins it).

## Canonical Delta

`docs/canonical/scripts.md` — the `lib/surfaces.js` bullet becomes: **`spec/scripts/lib/surfaces.js` is the one parser of the roadmap ```` ```surfaces ```` grammar and of the seed's beat grammar** (`N. "sentence" -> screen[@state]`); `parseSeedJourneys` returns `beats`, `malformed`, and the genesis-consumed `labels`/`edges` derived from the beats; `beatHash` is the one hash of a journey's story, shared by the driver and the client page; `parseSurfaces` is gone with the atlas.

`docs/canonical/design.md` — add under the mocks stage: the mock stage's actors are the client and the session on the served page; the operator works from files and CLI. The chain is SEED → SHELL → SCREENS → THEME → APPROVED. A journey is approved by the client's confirm against the beat hash; a seed edit reopens it. Note statuses are `open`, `answered`, `approved`, `deferred`; deferred items become ledger exclusion rows at `approved` and surface in genesis's parking lot.

`docs/canonical/genesis.md` — the brief's Journeys block carries one `label -> label` line per seed beat edge (derived), not the seed's surfaces block.
