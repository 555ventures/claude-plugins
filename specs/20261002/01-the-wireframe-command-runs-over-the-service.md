---
date: 2026-10-02
status: done
tier: critical
area: design
breaking: true
depends_on: [specs/20260929/01-the-walkthrough-contract-and-the-client.md]
depended_on_by: []
brief: 29
spiked: 2026-10-02
open_markers: 0
build_base: design-retool
diff_base: fee109970d48f8c96952beaa9516855604515de2
---

# The wireframe command runs over the service

## Goal

`/spec:mocks` stops driving a React mock app through an npm reviewer package and becomes the
wireframe command over the walkthrough service: the session writes the client's stories, draws
each screen as one gray json-render file, sends rounds through the plugin's own client, reads
notes and confirmations back as files, and finishes when every story is confirmed and no note
waits for an answer. A project with no `walkthrough` config block draws nothing and confirms each
story in the terminal. The reviewer package, its contract file, the mock-app templates and every
script, doctrine line and test that named them are deleted. Done means: the driver runs the whole
loop against a stub service, genesis reads the story count from the seed and the open-note count
from the latest round, and no shipped file names the retired package.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Three states.** `mocks-driver.js` derives `SEED → SCREENS → APPROVED` from `design/mocks/status.json` (`schemaVersion: 3`, Contracts) plus the seed. `SEED` while `marks.seedDone` is null, **or** the seed now declares no journey, or any journey has zero beats or a malformed line (the mark is demanded again). `SCREENS` while any seed journey is not approved against the seed's current story hash, or `marks.approved` is null, or `marks.approved` is older than any seed journey's `approved` time. Else `APPROVED`. `SHELL` and `THEME` do not exist. A cold root creates the status file, the ledger and the seed from their templates and spawns nothing. (AC-20261002-01-1, AC-20261002-01-4) | JJ ruled 2026-10-02: drop the shell and theme steps — gray wireframes have neither; colours and the shared layout are the design stage's (ADR-0030 g). The freshness rule stops a journey re-confirmed after the final mark from skipping the final checks; a mark is never trusted over the artifact it closed. |
| D2 | **Service mode is the config block's presence.** A host whose config (read through `lib/host-config.js` `readConfig`) carries a `walkthrough` key holding a non-null, non-array object is in service mode; any other host — no config, no key, or a key holding anything else — is in terminal mode. Terminal mode draws nothing: `--mark journey-drawn`, `round push` and `round pull` refuse (exit 2) naming `no walkthrough block`; the SCREENS step prints the journey's persona and numbered sentences and tells the session to show them and wait for the user's literal `approve`; `--mark journey-approved --journey <j>` then records `by: "terminal"`. Terminal mode never creates `design/rounds/` or `design/mocks/screens/` and sends nothing. An approval recorded in one mode stays valid in the other: the story hash is the only test. (AC-20261002-01-3) | JJ ruled 2026-10-02: stories only — the plugin has no viewer, so a screen nobody can see is not drawn. The block's validity is the client's own check at call time, never re-derived here. |
| D3 | **One file per screen, one library for the round.** A screen is `design/mocks/screens/<screen>.json` or `<screen>@<state>.json`: the json-render spec itself (`root`, `elements`, optional `state`), named exactly as the seed's beats name it. New `spec/scripts/lib/mocks-round.js` is the one reader (functions in Contracts). `readScreens` skips every name starting with `.`. A round is a full snapshot: every journey asked for, in seed order, and **every** screen file on disk sorted by name, then the file without a state, then states in ascending order. A journey's `title` is its kebab id with every `-` replaced by a space and the first letter upper-cased; `persona` is the seed's persona line; a beat without a state sends no `state` key. `roundFindings` is `lib/walkthrough-client.js` `checkRoundFile` plus three checks of its own: `bad-screen-file` (a file name outside `^[\w][\w-]*(@[\w][\w-]*)?\.json$`, or content that is not a JSON object), `bad-journey` (each assembled journey, with its `beats` hash added, validated against the contract's `journey` shape by `lib/json-shape.js`), and `no-control` (for every seed edge `a → b` of a journey in the round, some file of screen `a`, any state, holds an element whose `on.press` navigates to `b`). "The latest round" everywhere in this spec is `latestRound(root)`: the highest all-digit folder under `design/rounds/` that holds a `round.json`. (AC-20261002-01-5, AC-20261002-01-6, AC-20261002-01-7) | The service refuses a partial round (A3), so a round always carries everything. The client's offline check passes a 301-character persona and an empty title (executed, A2), so the driver checks the journey shape itself. `no-control` keeps the seed template's rule that a move between two screens is a real control. A stray `.DS_Store` must never refuse a mark. |
| D4 | **`--mark seed-done`** accepts when the seed declares at least one journey, every journey has at least one beat and no malformed line, and the ledger gate is open. It reads no `## Records` section, no app directory and no config, and spawns nothing. (AC-20261002-01-2) | The mock app and its typed record files are gone (ADR-0030 j). Sample values are typed into each screen file from the seed's own sentences. |
| D5 | **`--mark journey-drawn --journey <j>`** (service mode only): refuses a journey the seed does not declare; refuses naming the first missing file when a beat's screen file is absent (`design/mocks/screens/<screen>[@<state>].json`); assembles the round of every drawn journey the seed still declares plus `<j>`, runs `roundFindings`, prints one stderr line per finding and refuses when any exist; else records `journeys[j].drawn`. Marking an already-drawn journey re-checks and re-stamps it. It sends no request and runs no ledger gate. (AC-20261002-01-5, AC-20261002-01-6) | Checking the whole would-be round offline means a typo costs no request and the first push cannot be refused for a reason the mark could have seen. |
| D6 | **`round push`** (service mode): refuses when no journey the seed declares is drawn. Assembles the round of every drawn journey the seed still declares; runs `roundFindings` and refuses exactly as D5 does when any exist (a screen may have been edited since the mark). When `roundDigest` equals `status.pushed.digest` it prints the already-sent line and sends nothing. Otherwise it writes the round to a file in a fresh directory under `os.tmpdir()`, runs `walkthrough.js push --round-file <tmp> --root <root> --json` as a child process, and on exit 0 with a JSON answer holding an integer `round` records `status.pushed = { round, digest }` and prints the pushed line. A non-zero child, or an answer without `round`, prints the child's stderr unchanged, plus one line per entry of the child's stdout `findings` when it has any, and exits 2 with `status.pushed` untouched. The temporary directory is removed in every case. The round number is the client's (one past the highest all-digit folder); the driver never picks it. The token is never printed or written. (AC-20261002-01-7, AC-20261002-01-12) | `walkthrough.js` stays the one script behind which the network sits (ADR-0031). The digest stops an idle re-run from stacking identical rounds on the client's page. A child that refuses on findings writes them to stdout only, so the driver must relay them or the refusal is silent. |
| D7 | **`round pull`** (service mode): refuses when there is no latest round. Runs `walkthrough.js pull-notes --round <latest>` then `pull-approvals --round <latest>` (`--json`), then prints the worklist: a count line, one line per waiting item, and one line per seed journey (Contracts). A waiting item is a note or a journey thread whose `status` is `open`; its text is the **last** thread entry's. A journey is confirmed when **any** pulled approval for it carries the seed's current hash; confirmed-older when approvals exist and none matches; else not confirmed. (AC-20261002-01-8) | The session's worklist is derived from the same two files the marks read, so the list and the gates cannot disagree. A client who reopens a note by replying is waiting on their last words, not their first. |
| D8 | **`--mark journey-approved --journey <j>`.** Refuses a journey the seed does not declare. Terminal mode: `--waive` is refused; else the ledger gate, then record `{ approved, beats, by: "terminal" }`. Service mode, in order: the journey is drawn; then, without `--waive`: something was pushed (`status.pushed` is not null); the latest `round.json` lists `<j>` with the seed's current hash (else: the service does not show the current story, remedy `round push`); `pull-approvals --round <latest>` runs (build auto-pick: the local round check runs before the pull, so a stale story never costs a request — the refusals and their order are unchanged); some approval exists for `<j>` (else: not confirmed); one of them carries the current hash (else: confirmed on an older story); then the ledger gate; then record `{ approved, beats, by: <that approval's by> }`. `--waive --reason <r>` (service mode, reason non-empty after trimming) skips the pushed, pull and approval checks, sends nothing, runs the ledger gate and records `by: "waived"` with `reason`. An open note never blocks this mark. (AC-20261002-01-9, AC-20261002-01-10, AC-20261002-01-14) | The client's confirm against the story hash stays the one human gate (ADR-0029); the plugin only reads it. The waiver keeps today's escape for an absent client; the service has no owner-side confirm yet. |
| D9 | **`--mark approved`.** In order: refuses naming the first seed journey not approved against the current hash. Service mode with a latest round: runs `pull-notes --round <latest>`, then refuses naming the first waiting item (D7's definition, notes before journey threads) — an `answered` note does **not** block. Then the ledger gate. Then, for every note or journey thread whose status is `deferred`, appends one ledger exclusion row — id the next free `X<n>`, step `APPROVED`, kind `exclusion`, claim the **first** thread entry's text, tag `said-by-user`, status `confirmed <today>`, note `deferred: <id>` — never a second row for a `deferred: <id>` already present. Then, service mode with a latest round, `walkthrough.js mark --round <latest> --status closed`; a failed mark refuses with `marks.approved` unset. Then records `marks.approved`. Service mode with no latest round (every journey waived) skips the pull and the close. (AC-20261002-01-11) | JJ ruled 2026-10-02: the stage finishes when every story is confirmed and nothing waits for our answer — a client who stops visiting cannot block it, and a client who disagrees reopens the note by replying. Closing the round stops stray notes on a finished wireframe (executed, A1). The exclusion row's layout is today's, unchanged. |
| D10 | **Reopen, retired verbs, unknown commands, old status files.** `--reopen journey:<j>` clears that journey's `approved`, `marks.approved` and `pushed.digest`, appends a `reopens` row, deletes nothing. Refused at exit 2 before any file is read or written, each with its one-line replacement (Contracts): `--mark shell-drawn`, `--mark theme-picked`, `--reopen shell`, `--reopen theme`, `client open`, `client waive`. Every other retired-verb refusal the driver carries today is deleted; a first argument the driver does not know (`notes`, `look`, `stop`, `theme`, anything else) refuses at exit 2 with the unknown-command line. A status file whose `schemaVersion` is not 3 (1, 2, or absent): `--state` and a bare run on one whose `state` is `APPROVED` print that state and exit 0, writing nothing; every other command except `ledger` refuses naming the version and `rm design/mocks/status.json`. (AC-20261002-01-12) | Clearing the digest lets the next push open a fresh round after the old one was closed. One local host is APPROVED on the old shape and genesis still reads it (A4); deleting its record would be data loss, so it stays readable and nothing else does. An unknown word must never fall through to a silent bare run. |
| D11 | **Step blocks.** A bare run prints exactly one block. `SEED` — write the seed, `--mark seed-done`, with no scaffold, install or copy line. `SCREENS`, service mode — the first seed journey that is neither drawn nor approved on the current hash: `draw journey <j>` with the `Skill: mock-authoring — load it before the first edit` line and `--mark journey-drawn`; when none is left, the first unapproved: `confirm journey <j>` with `round push`, `round pull`, `--mark journey-approved`. `SCREENS`, terminal mode — the first unapproved: `confirm journey <j> in the terminal` (D2). `SCREENS` with every journey approved: `close the wireframe` with `round pull` (service mode only) and `--mark approved`. `APPROVED` — the state line and the approved line of Contracts. Every block's `Doctrine:` line names a `## ` heading that exists in `spec/doctrine/mocks.md`. Every accepted mark keeps the two-line tail (counts line, checkpoint line) unchanged. (AC-20261002-01-1, AC-20261002-01-3, AC-20261002-01-13) | One step at a time is what makes the loop `/clear`-safe; the tail is the checkpoint contract and does not change. |
| D12 | **Deletions.** `spec/scripts/lib/mock-cli.js` and the five files under `spec/templates/mock/` are deleted; `spec-paths` loses the `mock-contract` key and its usage mention. No file in the repository names `mock-review` or `mock-cli`, outside the waive list of Contracts. `tests/helpers.js` gains `sweepRetiredLiteral` (moved, body unchanged, out of `tests/consistency/genesis-doctrine.test.js`, which imports it), because the sweep now has a second file calling it. (AC-20261002-01-15, AC-20261002-01-16) | A refactor deletes the code and tests it retires; a zero-hit sweep is the only proof nothing still points at the package. |
| D13 | **Genesis reads the seed and the latest round.** In `genesis-driver.js` the BRIEF step's `seed journeys` count is the number of journeys in `design/mocks/seed.md` and `notes open` is `lib/mocks-round.js` `openNoteCount(root)` — the waiting items of the latest round's `notes.json`, `0` when there is no round or no file. `mockAppDir`, `designApprovalPath`, `designNotesPath` and their readers are deleted; nothing in genesis reads `<app>/design/approval.json` or `<app>/design/notes.json`. The DESIGN_BRIEF step's `Read only:` line names `design/mocks/screens/ (the confirmed wireframes)` when that directory exists and never names `design/approval.json`. The HANDOFF step's `app` line is unchanged. Comments in the file that describe the mock app's own files as live are reworded. (AC-20261002-01-17, AC-20261002-01-18) | The printed line keeps its shape, so nothing downstream changes. A host approved under the old flow gets the same numbers: its story count is its seed's, and an approved set has nothing waiting. The design brief's author should see the picture the client confirmed. |
| D14 | **Doctrine, command, skill, templates.** `spec/doctrine/mocks.md`: `## Provenance Ledger` stays byte-identical, a blank line still before the heading that follows it; `## Mocks: State Machine`, `## Mocks: Seed` and `## Mocks: Checkpoint contract` are rewritten to D1–D4 and D10; `## Mocks: Authoring Rules` keeps its heading and carries D3, D5 and the five drawing rules of Behavior; `## Mocks: Look and Serve`, `## Mocks: Page Notes` and `## Mocks: Client Player` are replaced by `## Mocks: Rounds and Notes` (D6, D7, the answer loop of Behavior) and `## Mocks: Confirmation` (D8, D9, the three-way statement of Behavior); `## Product-Stage Exemption` stays. `spec/doctrine/design.md`: the `## Design Canon` heading keeps that prefix and its body is rewritten — the wireframe is gray screen files rendered by the service, there is no mock app and no screen-approval record, a look prints the service link. `spec/doctrine/genesis.md`: the six passages that name the mock app's files (Brief State's derivation sources and its `notes.json` count, the two "mock app is not…" paragraphs, the design stage's "last read", the artifact list) state D13 instead. `spec/commands/mocks.md` is rewritten to the three states, keeps a `## SCREENS` heading whose text says beats are copied verbatim, and is the **only** doctrine or template file that spells `spec-paths walkthrough` (for `reply`); every other file names the verb as `walkthrough reply`. `spec/skills/mock-authoring/SKILL.md` keeps its name and carries the five drawing rules. `spec/templates/mocks-seed.md` loses every mention of the app and its files and keeps the literal `spec-paths mocks-driver` whole on one line; `spec/templates/roadmap-overview.md` and `spec/templates/roadmap-brief.md` lose every mention of the app, its files and the package; new `spec/templates/walkthrough/screen.example.json` is one valid screen file. `spec/scripts/lib/surfaces.js`'s header comment names the round check and the waiver flag in place of the retired verbs — comment only. [no-ac: prose — `citations-check`, the read-load budget pin, the entry-points manifest and AC-20261002-01-13's heading check are the oracles] | Prose that describes a retired artifact sends the next session to a command that does not exist. The ledger section is hash-pinned by a predecessor and its rules do not change; one older pin needs the Authoring Rules heading; the manifest's reverse check treats a `spec-paths <key>` literal as a call site. |
| D15 | `spec/entrypoints.json`: `spec/scripts/walkthrough.js` gains the entry points `spec/commands/mocks.md` and `spec/scripts/mocks-driver.js`. The driver names the script as the quoted literal `'walkthrough.js'` in a `path.join`. [no-ac: `tests/consistency/entrypoints.test.js` is the oracle] | The manifest's forward check needs the declared caller to really call. |
| D16 | A new amendment ADR (next free number, `0032` at lock; take the next free number at build and amend every mention) records the three rulings of 2026-10-02: three states; a project without the service confirms stories in the terminal and draws nothing; the stage finishes on confirmed stories and no waiting note. `Applies to:` ADR-0029 (the confirm gate has a terminal form and a waiver) and ADR-0030 (f). Both gain the `Amended by` backlink. [no-ac: prose record; `citations-check` is the oracle] | ADR-0029 says the client's confirm is the one gate; a terminal confirm amends that in the open. |
| D17 | **Predecessor pins.** Every test file and test case this spec deletes is named in the File Plan. For each AC-ID of a done spec that no surviving test cites afterwards, that spec's own AC bullet gains `[retired: specs/20261002/01-the-wireframe-command-runs-over-the-service.md]` on its pointer line; nothing else in those specs changes. Three predecessor pins lose one clause and keep the rest: `tests/consistency/design-stage-doctrine.test.js`'s design-doctrine pin drops its four-literal loop (`design/approval.json`, `src/records`, `examples`, `@/components/ui`) and keeps the `## Design Canon` prefix check; its retired-phrase pin drops the deleted config template from its file list, title and constants, and its message no longer spells the package's name; `tests/consistency/atlas-retired.test.js`'s survivor list and that case's title drop `spec/templates/mock/contract.json`. [no-ac: `tests/doctor/ac-drift-clean.test.js` is the oracle] | A pin whose subject is deleted is retired, never weakened into passing (pipeline rules § Gotchas, twelfth trigger). Naming the dropped clauses here is what makes them a ruling and not a weakening. |
| D18 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-round.js | CREATE | scripts | D3 — the round library; header with owner citation |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1, D2, D4–D11 — three states, both modes, `round push`/`round pull`, the child-process calls to `'walkthrough.js'`; header rewritten; no require of the deleted library |
| spec/scripts/lib/mock-cli.js | DELETE | scripts | D12 |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D13 — the two counts, the DESIGN_BRIEF line, the deleted readers; comments naming the retired package or the mock app's files reworded |
| spec/scripts/lib/surfaces.js | MODIFY | scripts | D14 — header comment only; no behaviour change |
| spec/bin/spec-paths | MODIFY | scripts | D12 — the `mock-contract` key and its usage mention removed |
| spec/commands/mocks.md | MODIFY | doctrine | D14 |
| spec/doctrine/mocks.md | MODIFY | doctrine | D14 — `## Provenance Ledger` byte-identical |
| spec/doctrine/design.md | MODIFY | doctrine | D14 — § Design Canon |
| spec/doctrine/genesis.md | MODIFY | doctrine | D14 — the six passages |
| spec/skills/mock-authoring/SKILL.md | MODIFY | doctrine | D14 — the five drawing rules |
| spec/templates/mocks-seed.md | MODIFY | doctrine | D14 — keeps `spec-paths mocks-driver` on one line |
| spec/templates/roadmap-overview.md | MODIFY | doctrine | D14 — the Journey map section |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D14 — the sentence about the mock app owning pixels |
| spec/templates/walkthrough/screen.example.json | CREATE | doctrine | D14 — one valid screen file |
| spec/templates/mock/contract.json | DELETE | doctrine | D12 |
| spec/templates/mock/journeys.ts | DELETE | doctrine | D12 |
| spec/templates/mock/mock.config.ts | DELETE | doctrine | D12 |
| spec/templates/mock/records.example.ts | DELETE | doctrine | D12 |
| spec/templates/mock/screen.example.tsx | DELETE | doctrine | D12 |
| spec/entrypoints.json | MODIFY | other | D15 |
| docs/adr/0032-the-wireframe-command-over-the-service.md | CREATE | other | D16 (next free number at build) |
| docs/adr/0029-the-client-confirms-the-story.md | MODIFY | other | D16 — `Amended by` backlink |
| docs/adr/0030-the-kit-is-the-contract.md | MODIFY | other | D16 — `Amended by` backlink |
| docs/canonical/design.md | MODIFY | other | the Canonical Delta's sections, landed in the build so D12's sweep is green before close |
| docs/canonical/genesis.md | MODIFY | other | the Canonical Delta's genesis lines |
| docs/canonical/scripts.md | MODIFY | other | the Canonical Delta's scripts line |
| specs/20260914/01-the-mock-contract-and-the-driver.md | MODIFY | other | D17 — retire tags only |
| specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md | MODIFY | other | D17 — retire tags only |
| specs/20260917/01-the-client-confirms-the-story.md | MODIFY | other | D17 — retire tags only |
| specs/20260918/01-mock-contract-v3.md | MODIFY | other | D17 — retire tags only |
| specs/20260926/04-the-design-brief.md | MODIFY | other | D17 — retire tags only |
| spec/.claude-plugin/plugin.json | MODIFY | other | D18 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/helpers.js | MODIFY | tests | D12 — exports `sweepRetiredLiteral`, body moved unchanged; no AC |
| tests/mocks/wireframe-fixtures.js | CREATE | tests | shared setup (not a `*.test.js` file): a tmp host with or without the block, the two-journey seed of Contracts, the four screen files copied out of the hearwell round fixture, a status writer, a round-folder writer, a driver runner that sets the token variable and `TMPDIR` |
| tests/mocks/wireframe-states.test.js | CREATE | tests | AC-20261002-01-1, AC-20261002-01-2, AC-20261002-01-3, AC-20261002-01-4, AC-20261002-01-12, AC-20261002-01-13 |
| tests/mocks/wireframe-drawn.test.js | CREATE | tests | AC-20261002-01-5, AC-20261002-01-6 |
| tests/mocks/wireframe-rounds.test.js | CREATE | tests | AC-20261002-01-7, AC-20261002-01-8, AC-20261002-01-9, AC-20261002-01-10, AC-20261002-01-11 |
| tests/mocks/wireframe-ledger.test.js | CREATE | tests | AC-20261002-01-14 |
| tests/mocks/ledger-verbs.test.js | CREATE | tests | AC-20261002-01-19 — self-contained (helpers only, no shared fixture, a cold root), so it runs unchanged against the tree before this spec |
| tests/consistency/reviewer-retired.test.js | CREATE | tests | AC-20261002-01-16 |
| tests/genesis/brief-counts.test.js | CREATE | tests | AC-20261002-01-17 |
| tests/genesis/design-stage-brief.test.js | MODIFY | tests | AC-20261002-01-18; the three cases built on a host with a mock app (the MENUS case, the skeleton-landed case, the banned-literal case), the import of the deleted fixture and the header comments citing those three cases are removed |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261002-01-15 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D12 — imports the moved helper; D17 — the whole Brief State approval-file case and its comment block are deleted (its two absence clauses are covered by the new sweep); the Authoring Rules heading case stays untouched; no AC |
| tests/consistency/mocks-doctrine.test.js | MODIFY | tests | D17 — the five-state chain case and the Authoring Rules literals case are deleted; the ledger-hash, command, seed and skill cases stay untouched; no AC |
| tests/consistency/design-stage-doctrine.test.js | MODIFY | tests | D17 — the dropped clauses, constant, read and message wording; no AC |
| tests/consistency/atlas-retired.test.js | MODIFY | tests | D17 — the survivor list and that case's title; no AC |
| tests/red-check/red-check.test.js | MODIFY | tests | D12 — one comment reworded without the package's name; no AC |
| tests/mocks/mock-app-fixtures.js | DELETE | tests | D12 |
| tests/mocks/mock-cli.test.js | DELETE | tests | D12, D17 |
| tests/mocks/mock-contract.test.js | DELETE | tests | D12, D17 |
| tests/mocks/mock-driver-states.test.js | DELETE | tests | D12, D17 |
| tests/mocks/mock-driver-ledger.test.js | DELETE | tests | D12, D17 |
| tests/genesis/genesis-mock-app.test.js | DELETE | tests | D13, D17 |

Notes (outside the table). Source-layer rows: fifteen that carry work (three of them prose-only
or comment-only), plus six one-line deletions of one retired directory and one library; the
landing unit cannot be cut smaller, because the driver, the genesis read and the doctrine all
describe the same files and must switch together. Tests whose subject talks to the service start
`tests/walkthrough/stub-service.js` as a child process through `tests/walkthrough/fixture.js`
`startStub`; the driver itself may be run with `runNode`, because the stub lives in its own
process. `tests/consistency/entrypoints.test.js`, `tests/consistency/read-load.test.js` and
`tests/genesis/design-stage-approval.test.js` are not edited. `spec/templates/grounding-contract.md`
is not edited: its optional `design.app` key is still what an old host carries. New prose and
tests never use the literals `design_source`, `designed:`, `stage-design`, `spec:sketch`,
`inverts to built` or `run-design` (an existing sweep bans them).

Collision closure (lock, 2026-10-02; literals `mock-review`, `mock-cli`, `mock-contract`,
`shell-drawn`, `theme-picked`, `client open`, `client waive` and the three removed headings): 44
hit paths; 27 are rows above; 17 are waived — 12 dated records under `specs/`, `docs/adr/`,
`docs/roadmap/` and `docs/handoff/`, three that only cite an older spec's file name
(`.claude/rules/spec-pipeline.md`, `tests/consistency/read-load.test.js`,
`tests/expiry/test-expiry.test.js`), and `spec/scripts/citations-check.js` with
`tests/consistency/citations-check.test.js`, which use a removed heading's name inside a
self-contained example that reads no live doctrine. The `executes` hits were read: the genesis
suites build their own fixtures and assert nothing about the two counts or the approval file
outside the cases the File Plan names.

## Contracts

The seed block every example below uses (`design/mocks/seed.md`, under `## Journeys`):

```
### owner-onboarding
Mika (clinic owner) is invited, confirms her roster, and ends at the brief.
1. "I open the invitation" -> owner-intro
2. "I check who is on my team" -> roster-confirm
3. "I see nobody is listed yet" -> roster-confirm@empty
4. "I read what happens next" -> reciprocity-brief

### team-invite
Ben (front desk) accepts an invite and sees the team.
1. "I open my invite" -> owner-intro
2. "I see my team" -> roster-confirm
```

Story hashes (executed, A2): `owner-onboarding` `08363cd98ef8`; with beat 2 edited to
`"I check who is on my clinic team"`, `48a07781b5ed`; `team-invite` `2e74ae02ca58`.

`design/mocks/status.json` (D1), two-space JSON with a trailing newline:

```json
{ "schemaVersion": 3, "state": "SCREENS",
  "marks": { "seedDone": "2026-10-02T03:00:00.000Z", "approved": null },
  "journeys": {
    "owner-onboarding": { "drawn": "2026-10-02T03:10:00.000Z", "approved": "2026-10-02T04:00:00.000Z", "beats": "08363cd98ef8", "by": "client" },
    "team-invite": { "drawn": "2026-10-02T03:20:00.000Z", "approved": "2026-10-02T04:05:00.000Z", "beats": "2e74ae02ca58", "by": "waived", "reason": "client on leave" } },
  "pushed": { "round": 2, "digest": "<64 hex>" },
  "reopens": [], "lastUpdated": "2026-10-02T04:05:00.000Z" }
```

`by` is `client` or `owner` (copied from the pulled approval), `waived`, or `terminal`; in
terminal mode `drawn` stays `null`. `pushed` is `null` until the first push; `digest` is `null`
after a reopen. There is no `app` key.

A screen file (D3) is the spec alone — the name and state come from the file name:

```json
{ "root": "page", "elements": {
    "page": { "type": "Stack", "props": { "gap": 16, "padding": 24 }, "children": ["title", "start"] },
    "title": { "type": "Heading", "props": { "text": "You are invited to Hearwell", "level": 1 }, "children": [] },
    "start": { "type": "Button", "props": { "label": "Check my team" }, "children": [],
               "on": { "press": { "action": "navigate", "params": { "to": "roster-confirm" } } } } } }
```

`spec/scripts/lib/mocks-round.js` (D3):

```js
readScreens(root)            // -> { screens: [{ name, state|null, spec, file }], findings: [...] }  dotfiles skipped
assembleRound(seedJourneys, ids, screens)
                             // -> { kind: 'wireframe', journeys: [{ id, title, persona, steps }], screens: [{ name, state?, spec }] }
                             //    ids not in seedJourneys are ignored; journeys come out in seed order
roundFindings(contract, catalog, round, seedJourneys)
                             // -> [{ screen, state, element, code, detail }]  checkRoundFile + bad-journey + no-control
roundDigest(round)           // -> lowercase hex sha256 of JSON.stringify(round)
latestRound(root)            // -> highest all-digit folder under design/rounds/ holding round.json, else 0
readRound(root, n) / readNotes(root, n) / readApprovals(root, n)   // -> parsed file, or null when absent
waitingItems(notes)          // -> [{ id, where, text, picked }]  notes, then journey threads, whose status is "open"
openNoteCount(root)          // -> waitingItems(readNotes(root, latestRound(root))).length, 0 when there is no round or no file
```

`where` is the note's `screen` (`screen@state` when the note carries a state), `project` when
`screen` is null, and `story` for a journey thread. `text` is the last thread entry's text (the
note's own `text` when the thread is empty). `readScreens`'s own findings are the
`bad-screen-file` ones; `roundFindings` returns them together with the rest.

The driver's command line:

```
mocks-driver.js [--root <dir>] [--state]
mocks-driver.js --root <dir> --mark seed-done|journey-drawn|journey-approved|approved [--journey <j>] [--waive --reason <r>]
mocks-driver.js --root <dir> round push | round pull
mocks-driver.js --root <dir> --reopen journey:<j>
mocks-driver.js --root <dir> ledger (add|set|catch|check|counts) [flags]
```

Exit codes are unchanged: `0` done, `1` `ledger check` found a blocked gate, `2` every refusal.
Printed lines, verbatim (`<link>` = `<baseUrl>` without a trailing slash + `/p/<project>`):

```
pushed round 1 — open at http://127.0.0.1:4791/p/hearwell
round 1 already carries this content — nothing sent (http://127.0.0.1:4791/p/hearwell)
✅ journey-approved recorded for owner-onboarding (confirmed by the client)
✅ journey-approved recorded for owner-onboarding (confirmed by the owner)
✅ journey-approved recorded for owner-onboarding (confirmed in the terminal)
✅ journey-approved recorded for team-invite (waived: client on leave)
the wireframe is approved — nothing further to do.
```

`round pull`'s worklist (`1 note` in the singular; with nothing waiting the count line reads
`round 2 — 0 notes waiting for an answer` and `journeys:` follows it directly):

```
round 2 — 2 notes waiting for an answer
  n1 [roster-confirm] "Make this button bigger." (on: "Yes, that is my team")
  n2 [project] "A step is missing: I also pick my clinic."
journeys:
  owner-onboarding — confirmed by Mika (story 08363cd98ef8)
  team-invite — not confirmed
```

A waiting journey thread prints `team-invite [story] "Where do I pick my clinic?"` after the
notes and counts as one of the notes. A journey confirmed only on an older story prints
`owner-onboarding — confirmed an older story (aaaaaaaaaaaa, now 08363cd98ef8)`, naming the first
approval's hash. The confirmer is the matching approval's `who` when it is a non-empty string,
else `the owner` when `by` is `owner`, else `the client`. The `(on: "…")` tail appears only when
`pickedText` is a non-empty string.

Refusals (each prefixed `mocks-driver: `, exit 2):

```
this project has no walkthrough block, so nothing is drawn or sent — remedy: confirm the story in the terminal with --mark journey-approved --journey <j>
--journey nope is not declared in design/mocks/seed.md — remedy: use one of the seed journeys: owner-onboarding, team-invite
journey owner-onboarding beat 3 needs design/mocks/screens/roster-confirm@empty.json — remedy: write that screen file (spec-paths walkthrough-catalog lists the components)
the round has 2 finding(s) — remedy: fix the screen files, then re-run --mark journey-drawn --journey owner-onboarding
the round has 1 finding(s) — remedy: fix the screen files, re-run --mark journey-drawn for the journey they belong to, then round push
no journey is drawn yet — remedy: --mark journey-drawn --journey <j>
design/rounds/ holds no pushed round — remedy: round push
journey "owner-onboarding" is not drawn yet — remedy: --mark journey-drawn --journey owner-onboarding
nothing has been sent to the service yet — remedy: round push
the service does not show the current story for "owner-onboarding" yet (the seed is now 48a07781b5ed) — remedy: round push
journey "owner-onboarding" is not confirmed yet — remedy: the client opens <link> and confirms, or --mark journey-approved --journey owner-onboarding --waive --reason <r>
journey "owner-onboarding" was confirmed on an older story (aaaaaaaaaaaa, now 08363cd98ef8) — remedy: the client confirms again on <link>, or --mark journey-approved --journey owner-onboarding --waive --reason <r>
--waive needs --reason <r> — remedy: --mark journey-approved --journey <j> --waive --reason <r>
--waive is for a project that uses the service — remedy: --mark journey-approved --journey <j>
journey "team-invite" is not confirmed — remedy: --mark journey-approved --journey team-invite
n2 [project] is waiting for an answer — remedy: answer it (walkthrough reply --note n2 --text-file <file>), then re-run --mark approved
--mark shell-drawn is retired — the wireframe has no shell step (ADR-0030)
--mark theme-picked is retired — the wireframe has no theme step (ADR-0030)
--reopen shell is retired — the wireframe has no shell step (ADR-0030)
--reopen theme is retired — the wireframe has no theme step (ADR-0030)
client open is retired — remedy: round push (it prints the link)
client waive is retired — remedy: --mark journey-approved --journey <j> --waive --reason <r>
unknown command "notes" — remedy: run with no argument to print the current step
design/mocks/status.json carries schemaVersion 2 (the retired mock-app flow) — remedy: rm design/mocks/status.json and re-run; seed.md and ledger.md are kept
```

A finding line (stderr, before the count refusal) is `<code> — <screen>[@<state>] [<element>]:
<detail>`, the place reading `round` for a finding with no screen and the file's name for
`bad-screen-file`. `no-control`'s detail is
`journey owner-onboarding: no control on owner-intro leads to roster-confirm`; `bad-journey`'s
detail starts `journey owner-onboarding` and names the failing field's path (`.persona`).

A bare run on an old-shape status file whose state is `APPROVED` prints
`[mocks-driver] state: APPROVED  root: <root>` and
`approved under the retired mock-app flow — nothing further to do (to redraw as wireframes: rm design/mocks/status.json)`.

The retired-name sweep's waive list (D12): prefixes `specs/`, `docs/roadmap/`, `docs/adr/`,
`docs/audit/`, `docs/spikes/`, `docs/handoff/`, `.claude/spec-runs/`, `.claude/agent-memory/`;
paths `spec/.claude-plugin/plugin.json` (the changelog), `.claude/spec-runs.jsonl` (the run
ledger), `tests/consistency/reviewer-retired.test.js` (spells the literals under test). The
sweep's own skip of `.git`, `node_modules` and `.claude/worktrees` is unchanged.
`docs/canonical/` is **not** waived.

## Behavior

**Service mode, one journey.** The driver prints `draw journey owner-onboarding`. The session
loads the skill, reads the journey's beats and the catalog, and writes one file per `screen` and
`screen@state` the beats name. `--mark journey-drawn` checks the files and the whole would-be
round offline. Once every journey is drawn the driver prints `confirm journey owner-onboarding`:
`round push` sends everything drawn and prints the link; the session prints
`🎨 ready for review — <link>` and ends the turn. Readers are admitted by the service itself; the
plugin never mints a reader link. Later, `round pull` prints what waits. For each waiting note the
session edits the screen file (a design or field note) or the seed's beats (a missing or wrong
step, usually a `[project]` note — the hash changes and the journey reopens by itself), answers
with `node "$(spec-paths walkthrough)" reply --note <id> --text-file <file>`, and pushes again.
When `round pull` shows the journey confirmed on the current story, `--mark journey-approved`
records it. After the last journey, `--mark approved` pulls once more, refuses while anything
waits, closes the round and records the end.

**Terminal mode.** The driver prints the journey's persona and sentences. The session shows them
exactly and ends the turn; on the user's literal `approve` it runs `--mark journey-approved`.
Nothing is drawn or sent.

**The confirmation, three ways.** The client's confirm control is rendered and posted by the
walkthrough service (its repository owns the page and its own success sentence). On this side:
SUCCESS — `✅ journey-approved recorded for <j> (confirmed by the client)`, or `(confirmed in the
terminal)`, or `(waived: <reason>)`. PATH BACK — a seed edit changes the story hash and reopens
the journey with nobody retyping anything; `--reopen journey:<j>` does the same by hand. ARTIFACT
— `design/rounds/<n>/approvals.json` (pulled) and `design/mocks/status.json` (recorded); nothing
dated or contractual lies beyond them.

**The five drawing rules** (the skill): one file per screen and state, named exactly as the beat
names it; only the catalog's 19 components and their props, checked by `--mark journey-drawn`;
every move between two screens of a journey is a real control that navigates there; sample values
are invented from the seed, awkward cases included, and one person or record reads the same on
every screen; an element's key is its stable name — a note is pinned to it, so a key is never
renamed while the element lives.

**Edges of the state machine.** A journey deleted from the seed drops out of every check and
every round; its status entry is left as a record. A screen file no journey names is still sent
(a control may lead to it). Adding the config block mid-flow keeps every terminal approval; only
journeys not yet approved are drawn. Removing it leaves `design/rounds/` on disk and unread.

**Old hosts.** A host approved under the retired flow keeps its record; a host stopped halfway
through it starts over from its seed, which is kept.

## Acceptance Criteria

- **AC-20261002-01-1**: WHEN the driver runs bare on a root with no `design/mocks/` THE SYSTEM SHALL exit 0, create `design/mocks/status.json` holding `schemaVersion: 3`, `state: "SEED"`, `marks: {"seedDone":null,"approved":null}`, `journeys: {}`, `pushed: null` and no `app` key, create `seed.md` and `ledger.md` from their templates, and print a block whose first line starts `[mocks-driver] state: SEED`, which names `design/mocks/seed.md` and `--mark seed-done` and contains none of `npx`, `npm i`, `cp ` or `mock.config`; and `--state` SHALL print `SEED` → writes tests/mocks/wireframe-states.test.js
- **AC-20261002-01-2**: WHEN `--mark seed-done` runs on a host with no app directory, no config file and a seed that has no `## Records` section and holds the two journey blocks of Contracts THE SYSTEM SHALL exit 0, print `✅ seed-done recorded`, then the ledger counts line, then a last line containing `(SEED → SCREENS)`; WHEN the seed declares no journey THE SYSTEM SHALL exit 2 naming `declares no journeys`; WHEN `owner-onboarding`'s second line is the unquoted `2. I check who is on my team -> roster-confirm` THE SYSTEM SHALL exit 2 naming `owner-onboarding` and `malformed`; WHEN `team-invite` holds its persona line and no beat THE SYSTEM SHALL exit 2 naming `team-invite` and `declares zero beats`; WHEN the ledger holds the row `A1 | SEED | product | x | invented | open` THE SYSTEM SHALL exit 2 naming `A1` and leave `marks.seedDone` null → writes tests/mocks/wireframe-states.test.js
- **AC-20261002-01-3**: WHEN the driver runs bare in SCREENS on a host whose config has no `walkthrough` key, or whose `walkthrough` value is the string `"yes"`, THE SYSTEM SHALL print a block containing `confirm journey owner-onboarding in the terminal`, the persona line `Mika (clinic owner) is invited, confirms her roster, and ends at the brief.`, the four lines `1. "I open the invitation"`, `2. "I check who is on my team"`, `3. "I see nobody is listed yet"`, `4. "I read what happens next"` and `--mark journey-approved --journey owner-onboarding`, and no `Skill:` line; WHEN `--mark journey-drawn --journey owner-onboarding`, `round push` or `round pull` runs there THE SYSTEM SHALL exit 2 naming `no walkthrough block`; WHEN `--mark journey-approved --journey owner-onboarding --waive --reason x` runs there THE SYSTEM SHALL exit 2 naming `--waive is for a project that uses the service`; WHEN `--mark journey-approved --journey owner-onboarding` runs there THE SYSTEM SHALL exit 0, print `✅ journey-approved recorded for owner-onboarding (confirmed in the terminal)`, and store `journeys["owner-onboarding"]` with `drawn: null`, `beats: "08363cd98ef8"` and `by: "terminal"`; WHEN `team-invite` is approved the same way and `--mark approved` runs THE SYSTEM SHALL exit 0, `--state` SHALL print `APPROVED`, and a bare run SHALL print `the wireframe is approved — nothing further to do.`; and across the whole sequence neither `design/rounds` nor `design/mocks/screens` SHALL exist → writes tests/mocks/wireframe-states.test.js
- **AC-20261002-01-4**: WHEN `owner-onboarding` is recorded approved with `beats: "08363cd98ef8"`, every journey is approved and `marks.approved` is set, and the seed's beat 2 is then edited to `"I check who is on my clinic team"` (story hash `48a07781b5ed`) THE SYSTEM SHALL print `SCREENS` for `--state` and a bare run SHALL ask to confirm `owner-onboarding` again; WHEN that journey is approved again (terminal mode) THE SYSTEM SHALL still print `SCREENS` and a bare run SHALL print `close the wireframe`, because `marks.approved` is older than the journey's `approved` time; WHEN `--mark approved` then runs THE SYSTEM SHALL print `APPROVED` for `--state`; WHEN both journey blocks are then removed from the seed THE SYSTEM SHALL print `SEED` for `--state` → writes tests/mocks/wireframe-states.test.js
- **AC-20261002-01-5**: WHEN `--mark journey-drawn --journey owner-onboarding` runs in service mode with the four screen files `owner-intro.json`, `roster-confirm.json`, `roster-confirm@empty.json` and `reciprocity-brief.json` (the specs of `tests/fixtures/walkthrough/hearwell-round.json`), a `.DS_Store` file beside them, and a ledger holding the blocking row `A1 | SCREENS | product | x | invented | open` THE SYSTEM SHALL exit 0, print `✅ journey-drawn recorded for owner-onboarding`, store a `drawn` time, and send no request (the stub's log stays empty); WHEN `roster-confirm@empty.json` is absent THE SYSTEM SHALL exit 2 naming `beat 3` and `design/mocks/screens/roster-confirm@empty.json` and store no `drawn`; WHEN that file's element `add` has props `{"lable":"Add a person"}` THE SYSTEM SHALL exit 2 with a stderr line containing `unknown-prop`, `roster-confirm@empty` and `lable` and a line containing `the round has`; WHEN a file `Roster Confirm.json` exists beside them THE SYSTEM SHALL exit 2 with a line containing `bad-screen-file` and `Roster Confirm.json`; WHEN `owner-intro.json` holds the text `{"root":` THE SYSTEM SHALL exit 2 with a line containing `bad-screen-file` and `owner-intro.json`; WHEN `owner-onboarding` is drawn, `roster-confirm@empty.json` is then deleted and `--mark journey-drawn --journey team-invite` runs THE SYSTEM SHALL exit 2 with a line containing `unknown-step-screen` and `roster-confirm@empty`, because the round carries every drawn journey; WHEN `--journey nope` is given THE SYSTEM SHALL exit 2 naming `owner-onboarding, team-invite` → writes tests/mocks/wireframe-drawn.test.js
- **AC-20261002-01-6**: WHEN `owner-intro.json`'s element `start` has no `on` key and `--mark journey-drawn --journey owner-onboarding` runs THE SYSTEM SHALL exit 2 with a stderr line containing `no-control`, `owner-intro` and `roster-confirm`; WHEN the seed's persona line for `owner-onboarding` is 301 characters long THE SYSTEM SHALL exit 2 with a line containing `bad-journey`, `owner-onboarding` and `persona`; WHEN the persona is 300 characters long THE SYSTEM SHALL exit 0 → writes tests/mocks/wireframe-drawn.test.js
- **AC-20261002-01-7**: WHEN `round push` runs in service mode (project `hearwell`, the stub at `http://127.0.0.1:<port>`, `TMPDIR` pointing at an empty directory) with only `owner-onboarding` drawn and the stub answers `GET /v1` then `201` THE SYSTEM SHALL send `POST /v1/projects/hearwell/rounds` whose body has `round: 1`, `kind: "wireframe"`, exactly one journey with `id: "owner-onboarding"`, `title: "Owner onboarding"`, the seed's persona, `beats: "08363cd98ef8"`, `steps[0]` without a `state` key and `steps[2].state: "empty"`, and four `screens` in the order `owner-intro`, `reciprocity-brief`, `roster-confirm`, `roster-confirm` + `state: "empty"`; it SHALL exit 0, print `pushed round 1 — open at http://127.0.0.1:<port>/p/hearwell`, and store `pushed.round: 1` and a 64-hex `pushed.digest`; WHEN it runs again with nothing changed THE SYSTEM SHALL exit 0, print a line starting `round 1 already carries this content — nothing sent`, and send no `POST`; WHEN the `title` element's text in `owner-intro.json` is then changed THE SYSTEM SHALL send `round: 2`; WHEN `owner-intro.json`'s `title` element is given props `{"txet":"x"}` after the mark THE SYSTEM SHALL exit 2 with a stderr line containing `unknown-prop` and `txet` and send no request; WHEN the stub answers the push `401 {"error":"bad-token","detail":"revoked","apiVersion":1}` THE SYSTEM SHALL exit 2 with stderr containing `walkthrough: bad-token` and leave `pushed` unchanged; WHEN no journey is drawn THE SYSTEM SHALL exit 2 naming `no journey is drawn yet`; and in every case the `TMPDIR` directory SHALL be empty afterwards and neither stdout, stderr nor any file under the host SHALL contain the token `tok_0123456789abcdef0123456789abcdef` → writes tests/mocks/wireframe-rounds.test.js
- **AC-20261002-01-8**: WHEN `round pull` runs with `design/rounds/2/round.json` present and the stub answers notes `n1` (`open`, screen `roster-confirm`, `pickedText: "Yes, that is my team"`, one thread entry `Make this button bigger.`), `n2` (`open`, `screen: null`, `pickedText: null`, `A step is missing: I also pick my clinic.`) and `n3` (`answered`), and one approval `{journey:"owner-onboarding", by:"client", who:"Mika", round:2, beats:"08363cd98ef8"}` THE SYSTEM SHALL have requested `/v1/projects/hearwell/notes` and `/v1/projects/hearwell/approvals`, exit 0, write `design/rounds/2/notes.json` and `approvals.json`, and print exactly the six worklist lines of Contracts (`round 2 — 2 notes waiting for an answer` through `team-invite — not confirmed`); WHEN `n1`'s thread holds three entries ending `Still too small.` and `n2` is `answered` THE SYSTEM SHALL print `round 2 — 1 note waiting for an answer` and `n1 [roster-confirm] "Still too small." (on: "Yes, that is my team")`; WHEN no note is open and the journey thread `team-invite` is `open` with the last entry `Where do I pick my clinic?` THE SYSTEM SHALL print `round 2 — 1 note waiting for an answer` and `team-invite [story] "Where do I pick my clinic?"`; WHEN nothing is open THE SYSTEM SHALL print `round 2 — 0 notes waiting for an answer` followed directly by `journeys:`; WHEN `n1` carries `state: "empty"` THE SYSTEM SHALL print `n1 [roster-confirm@empty]`; WHEN the approval has no `who` THE SYSTEM SHALL print `owner-onboarding — confirmed by the client (story 08363cd98ef8)`; WHEN the stub answers two approvals for `owner-onboarding`, the first with `beats: "aaaaaaaaaaaa"` and the second with `beats: "08363cd98ef8"` THE SYSTEM SHALL print the journey as confirmed; WHEN the only approval's `beats` is `aaaaaaaaaaaa` THE SYSTEM SHALL print `owner-onboarding — confirmed an older story (aaaaaaaaaaaa, now 08363cd98ef8)`; WHEN `design/rounds/` holds no round THE SYSTEM SHALL exit 2 naming `round push` → writes tests/mocks/wireframe-rounds.test.js
- **AC-20261002-01-9**: WHEN `--mark journey-approved --journey owner-onboarding` runs in service mode THE SYSTEM SHALL refuse at exit 2, in this order as each earlier condition is satisfied: naming `is not drawn yet` when `drawn` is null; `nothing has been sent` when `pushed` is null; `does not show the current story` and `round push` when `design/rounds/2/round.json` lists the journey with `beats: "aaaaaaaaaaaa"`; `is not confirmed yet`, the link `http://127.0.0.1:<port>/p/hearwell` and `--waive --reason` when the stub answers no approval; `was confirmed on an older story (aaaaaaaaaaaa, now 08363cd98ef8)` when the only approval's `beats` is `aaaaaaaaaaaa`; and WHEN the stub answers the approval with `beats: "08363cd98ef8"` and `by: "client"` it SHALL have sent `GET /v1/projects/hearwell/approvals`, exit 0, print `✅ journey-approved recorded for owner-onboarding (confirmed by the client)` and store `by: "client"` and `beats: "08363cd98ef8"`; an `open` note `n1` in `design/rounds/2/notes.json` SHALL not change that outcome; WHEN the approval's `by` is `owner` THE SYSTEM SHALL print `(confirmed by the owner)` and store `by: "owner"` → writes tests/mocks/wireframe-rounds.test.js
- **AC-20261002-01-10**: WHEN `--mark journey-approved --journey team-invite --waive --reason "client on leave"` runs in service mode with `team-invite` drawn, nothing pushed and no approval THE SYSTEM SHALL exit 0, print `✅ journey-approved recorded for team-invite (waived: client on leave)`, store `by: "waived"`, `reason: "client on leave"` and `beats: "2e74ae02ca58"`, and send no request; WHEN `--waive` is given without `--reason`, or with `--reason "  "`, THE SYSTEM SHALL exit 2 naming `--waive needs --reason`; WHEN `team-invite` is not drawn THE SYSTEM SHALL exit 2 naming `is not drawn yet` → writes tests/mocks/wireframe-rounds.test.js
- **AC-20261002-01-11**: WHEN `--mark approved` runs in service mode with both journeys approved on the current story and `design/rounds/2/round.json` present, and the stub answers notes `n1` (`answered`) and `n2` (`open`, `screen: null`) THE SYSTEM SHALL exit 2 naming `n2 [project] is waiting for an answer`, send no `mark` request and leave `marks.approved` null; WHEN no note is open and the journey thread `team-invite` is `open` THE SYSTEM SHALL exit 2 naming `team-invite [story] is waiting for an answer`; WHEN nothing waits and the ledger holds the blocking row `A1 | SCREENS | product | x | invented | open` THE SYSTEM SHALL exit 2 naming `A1`, send no `mark` request and add no ledger row; WHEN the stub answers `n1` (`answered`), `n2` (`approved`), `n4` (`deferred`, thread entries `Add a dark mode later.` then `Noted for later.`) and a journey thread `team-invite` (`deferred`, first entry `Staff invites can wait.`) THE SYSTEM SHALL send `POST /v1/projects/hearwell/rounds/2/mark` with body `{"status":"closed"}`, exit 0, print `✅ approved recorded`, print `APPROVED` for `--state`, and leave exactly two exclusion rows: one with id `X1`, step `APPROVED`, claim `Add a dark mode later.`, tag `said-by-user`, a status starting `confirmed ` and note `deferred: n4`, and one with note `deferred: team-invite`; WHEN `--reopen journey:owner-onboarding`, then `--mark journey-approved --journey owner-onboarding` (the stub still answering its approval), then `--mark approved` run with the same notes THE SYSTEM SHALL exit 0 for each, have sent a second `mark` request, and still hold exactly one `deferred: n4` row; WHEN the stub answers the `mark` request `500` THE SYSTEM SHALL exit 2 and leave `marks.approved` null; WHEN `team-invite` is not approved THE SYSTEM SHALL exit 2 naming `journey "team-invite" is not confirmed` and send no request; WHEN both journeys were waived and `design/rounds/` does not exist THE SYSTEM SHALL exit 0 and send no request → writes tests/mocks/wireframe-rounds.test.js
- **AC-20261002-01-12**: WHEN `--reopen journey:owner-onboarding` runs on an APPROVED service-mode root with `pushed: {round: 2, digest: <hex>}` and the folders `design/rounds/1/` and `design/rounds/2/` each holding a `round.json` THE SYSTEM SHALL exit 0, print a line starting `↩ reopened journey:owner-onboarding`, set that journey's `approved` to null, `marks.approved` to null and `pushed.digest` to null, keep `pushed.round: 2`, append one `reopens` row, and delete no file; and the next `round push` with unchanged screen files SHALL send `round: 3`; WHEN any of `--mark shell-drawn`, `--mark theme-picked`, `--reopen shell`, `--reopen theme`, `client open`, `client waive --journey x --reason y` runs THE SYSTEM SHALL exit 2 with that verb's line of Contracts and leave `status.json` byte-identical; WHEN the first argument is `notes` or `look` THE SYSTEM SHALL exit 2 with a line containing `unknown command "notes"` (or `"look"`) and print no step block; WHEN `status.json` carries `schemaVersion: 2` and `state: "SCREENS"`, or `schemaVersion: 1` and `state: "WIREFRAMES"`, THE SYSTEM SHALL exit 2 for a bare run, `--state` and `--mark seed-done`, each naming `schemaVersion 2` (or `1`) and `rm design/mocks/status.json`, and exit 0 for `ledger counts`; WHEN it carries `schemaVersion: 2` and `state: "APPROVED"` THE SYSTEM SHALL print `APPROVED` for `--state`, exit 0 for a bare run printing `approved under the retired mock-app flow`, exit 2 for `--mark approved`, and leave the file byte-identical in all three → writes tests/mocks/wireframe-states.test.js
- **AC-20261002-01-13**: WHEN the driver's bare run is captured in each of the five situations — SEED; SCREENS service mode with an undrawn journey; SCREENS service mode with every journey drawn; SCREENS terminal mode; SCREENS with every journey approved — THE SYSTEM SHALL print in each a `Doctrine: spec/doctrine/mocks.md § Mocks: <name>` line for which the output of `spec-paths shared-mocks --section "<name>"` contains the line `## Mocks: <name>`; the undrawn-journey block SHALL carry the line `Skill: mock-authoring — load it before the first edit` and name `--mark journey-drawn --journey owner-onboarding`; the all-drawn block SHALL name `round push`, `round pull` and `--mark journey-approved --journey owner-onboarding` and carry no `Skill:` line; the all-approved block SHALL contain `close the wireframe` and `--mark approved`; and WHEN `owner-onboarding` is already approved on the current story with `drawn: null` and `team-invite` is neither drawn nor approved THE SYSTEM SHALL print `draw journey team-invite`, never `draw journey owner-onboarding` → writes tests/mocks/wireframe-states.test.js
- **AC-20261002-01-14**: WHEN `--mark journey-approved --journey owner-onboarding` runs in terminal mode with the ledger holding the row `A1 | SCREENS | product | invented claim | invented | open` THE SYSTEM SHALL exit 2 naming `A1` and the remedy `ledger set --id A1 --status confirmed --tag said-by-user`, and leave the journey's `approved` unset; WHEN `ledger set --id A1 --status overridden` then runs and the mark is repeated THE SYSTEM SHALL exit 0; WHEN the same blocking row is present in service mode and `--mark journey-approved --journey team-invite --waive --reason "client on leave"` runs with `team-invite` drawn THE SYSTEM SHALL exit 2 naming `A1` and leave the journey's `approved` unset → writes tests/mocks/wireframe-ledger.test.js
- **AC-20261002-01-15**: WHEN `spec-paths mock-contract` runs THE SYSTEM SHALL exit non-zero and print a usage line that does not contain `mock-contract` → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every
- **AC-20261002-01-16**: WHEN the repository is swept THE SYSTEM SHALL hold no file containing `mock-review` and no file containing `mock-cli` outside the waive list of Contracts (`docs/canonical/` is swept); and none of `spec/scripts/lib/mock-cli.js`, `spec/templates/mock`, `tests/mocks/mock-app-fixtures.js` SHALL exist → writes tests/consistency/reviewer-retired.test.js
- **AC-20261002-01-17**: WHEN `genesis-driver.js` runs bare at BRIEF on a visual-archetype host whose `design/mocks/status.json` is `schemaVersion: 3`, `state: "APPROVED"` with two journeys, whose seed holds the two journey blocks of Contracts, whose `design/rounds/1/` holds a `round.json` and a `notes.json` with five `open` notes, and whose `design/rounds/2/` holds a `round.json` and a `notes.json` with two `open` notes and one `answered` THE SYSTEM SHALL print `seed journeys: 2 · notes open: 2`; WHEN `design/rounds/` is absent THE SYSTEM SHALL print `seed journeys: 2 · notes open: 0`; WHEN the host instead carries the old shape — `schemaVersion: 2`, `app: "app"`, `app/design/approval.json` with three journey keys and `app/design/notes.json` with four `open` notes — THE SYSTEM SHALL still print `seed journeys: 2 · notes open: 0` → writes tests/genesis/brief-counts.test.js
- **AC-20261002-01-18**: WHEN the DESIGN_BRIEF step prints on a host where `design/mocks/screens/` exists THE SYSTEM SHALL print a `Read only:` line containing `design/mocks/screens/ (the confirmed wireframes)` and not containing `design/approval.json`; WHEN that directory is absent THE SYSTEM SHALL print a `Read only:` line containing neither → rewrites tests/genesis/design-stage-brief.test.js :: AC-20260926-04-4:
- **AC-20261002-01-19**: WHEN `ledger add --id A1 --step SCREENS --kind product --claim x --tag invented --status open` and then `ledger counts` run on a cold root (no `design/mocks/` before the first command) THE SYSTEM SHALL CONTINUE TO exit 0 for both, append the row `| A1 | SCREENS | product | x | invented | open | - | - | - |`, print a counts line containing `1 invented (1 open)`, and leave `status.json` byte-identical between the two commands → writes tests/mocks/ledger-verbs.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-10-02 against the walkthrough service at commit `de04bf8`, a throwaway database, port 3987): with the shipped client and `tests/fixtures/walkthrough/hearwell-round.json`, `hello` answered `apiVersion 1, revision 2`; `push` stored round 1 `open`; the same push repeated with `--round 1` answered `already on the service`; `pull-notes` and `pull-approvals` wrote contract-valid files; `reply --note owner-onboarding` created the story thread with status `answered`; `mark --round 1 --status answered` and a second push (round 2) succeeded. A reader then left a screen note and a project note (`screen: null`) and confirmed the story: the pulled approval read `{journey:"owner-onboarding", by:"client", who:"Mika", round:2, beats:"08363cd98ef8"}`, both notes pulled `open`, `reply --note n1` turned `n1` to `answered`, and after `mark --round 2 --status closed` a reader's note was refused `round-closed`. `GET /p/hearwell` answered 200. No file under the host held the token. — **if false at build or later:** the stub-based tests still stand; a service that drifts is refused by the client's own contract check (`contract-mismatch`), and the contract is amended by an additive revision in its own spec, never worked around in the driver.
- A2 (executed 2026-10-02): `parseSeedJourneys` over the `owner-onboarding` block of Contracts plus the derived title `Owner onboarding` and the fixture's four screens gives zero `checkRoundFile` findings and the hash `08363cd98ef8`; removing the `roster-confirm@empty` screen gives one `unknown-step-screen`; a 301-character persona together with an empty title gives **zero** findings; a `state` key inside a screen's spec gives zero findings; the fixture's navigations are `owner-intro → roster-confirm`, `roster-confirm → reciprocity-brief`, `roster-confirm@empty → reciprocity-brief`; the hashes of the edited story and of `team-invite` are `48a07781b5ed` and `2e74ae02ca58`. — **if false:** STOP; the story hash is ADR-0029's and is never re-derived here.
- A3 (read in the service's source, not executed): a round is refused unless it carries every screen its journeys name; a new push leaves earlier rounds untouched and the reader sees the newest; `answered` and `open` rounds behave alike for the reader; a note's statuses in use are `open`, `answered`, `approved` — `deferred` is in the contract but nothing sets it; a story thread is written only by the plugin's reply; `pull-approvals` returns one row per story today. — **if false:** D7's waiting rule, D7's any-approval rule and D9's deferred rows already read the files' fields alone, so a service that starts sending `deferred`, opening a story thread or returning several approvals needs no change here.
- A4 (executed 2026-10-02, scan of `~/Projects/*/design/mocks/status.json`): three local hosts carry a status file — one `schemaVersion: 2` at `APPROVED`, two `schemaVersion: 1` — and none is part-way through the retired flow on version 2. — **if false:** D10's refusal names the remedy; the seed and ledger survive it.
- A5 (read, and executed by an independent reader 2026-10-02): `walkthrough.js push --json` prints `{round, kind, status, already}` on success, and on round findings prints `{ok:false, findings:[…]}` on stdout with exit 1 and an empty stderr; `pull-notes` and `pull-approvals` refuse (exit 2, `no-round`) a round with no `round.json`; the client numbers a push one past the highest all-digit folder whether or not it holds a `round.json`; `spec-paths shared-mocks --section "<unknown>"` prints its header comment only and exits 0. — **if false:** the driver follows the script's real output; the script is not changed by this spec.
- A6: `tests/walkthrough/stub-service.js` answers each request from a scripted list per method and path, repeats the last answer when a list is used up, and logs every request (specs/20260929/01 build record). — **if false:** the missing behaviour is added to the stub in this spec's tests batch, never to the driver.
- A7 (a prediction, not an inventory — an independent sweep on 2026-10-02 found no further file): the tests that break outside `tests/mocks/` are the ones the File Plan names. — **if false:** a further test whose subject this spec deletes is deleted and its predecessor AC tagged per D17; a further test that only spells a deleted path or the package's name is edited in place; no assertion about surviving behaviour is weakened.
- A8 (measured 2026-10-02: the command loads 261 of 325 lines today; `spec/doctrine/design.md` is 89 of 160): the rewritten command plus its doctrine slices stay inside `tests/consistency/read-load.test.js`'s `mocks: 325` budget, and the design doctrine stays at or under 160 lines. — **if false:** condense the new prose; the budgets are never raised by this spec.
- A9 (executed 2026-10-02): on a cold root the current driver exits 0 for `ledger add` and `ledger counts`, writes the row of AC-19 and prints `1 invented (1 open)`; a pre-written `schemaVersion: 3` status makes the current driver refuse. — **if false:** AC-19's test is the one to fix, on a cold root, never the pin's wording.

## Rationale

The service's first slice is built and was exercised end to end with the plugin's own client
(A1), so the condition ADR-0030 (f) set for retiring the package is met. Three points were JJ's
to rule, and he ruled them on 2026-10-02: the shell and theme steps go (a gray wireframe has no
shared component and no colours; both belong to the design stage); a project without the service
confirms stories in the terminal and draws nothing (the plugin has no viewer, and an unseen screen
is an unreviewed one); the stage finishes on confirmed stories and no waiting note (the service
gives the owner no way to close a note for an absent client, and a client who disagrees reopens
the note by replying).

The driver calls `walkthrough.js` as a child process instead of requiring the client library:
ADR-0031 makes that script the one door to the network, the driver stays synchronous, and tests
can script the service with the existing stub. The assembled round goes to a temporary file
because it is derived from the seed and the screen files; committing it would be a second copy to
keep in step. A round is always a full snapshot because the service refuses anything less. The
driver passes the round number to every pull and to the close, because the client's own default
counts any numbered folder and the driver's "latest round" means one that was really pushed.

Rejected: a shared navigation frame merged into every screen (no project has needed it; JJ chose
whole screens); shared sample-data files merged at send time (the service renders a screen's own
`state`, and a merge rule is machinery with no measured need); marking the previous round
`answered` on each push (the reader sees no difference); keeping a compatibility read of the old
approval and notes files in genesis (an approved set has its story count in the seed and nothing
waiting, so the old files add nothing); a second spec for the genesis read (the read, the driver
and the prose describe the same files and cannot land apart without a wrong number in between).

Tier is critical because `spec/bin/spec-paths` loses a key. No hook is edited:
`question-style-gate.js` reads only the status file's `state`, which keeps its meaning.
`spec/templates/grounding-contract.md` is deliberately untouched — its optional `design.app` key
is what the one old approved host still carries, and a wording edit would re-stamp every host.

One regression pin (AC-19): the ledger verbs are untouched and must outlive this spec. Every other
predecessor pin on the driver is retired with its subject (D17). An adversarial read and an
independent collision inventory ran on the draft on 2026-10-02; their findings are folded into
the Decisions and criteria above, and none was rejected.

Fragile, watch at build: the sweep is not waived for `docs/canonical/`, so the canonical rows land
in the build and the Canonical Delta below is written without the package's name; the ledger
section of `spec/doctrine/mocks.md` is hash-pinned and must not be reflowed; the seed template's
`spec-paths mocks-driver` literal must stay on one line; `spec-paths walkthrough` may appear in
the command file only; the secrecy assertion must search every file under the host;
`--mark approved` must close the round before it records, or a failed close leaves a finished
stage with an open round.

Picture rounds (the brief's third scope item) are not planned here: the service does not accept
them yet and the plugin has nothing that produces a picture.

Build and review record (2026-10-02, folded from the deviations sidecar):
- The File Plan's "whole Brief State case" in `tests/consistency/genesis-doctrine.test.js` also
  carried a ban on four retired second-artifact literals in the genesis doctrine that no other
  test pins; the ban outlives the case's subject, so it was kept as its own case with no AC-ID
  (citing specs/20260926/04 D9) rather than deleted.
- Each AC that bundles several independent WHEN-clauses (ACs 3, 8, 9, 11, 12) is split into
  several flat test cases carrying the same AC-ID, so a failure names its clause.
- `tests/walkthrough/stub-service.js` needed no change (A6 held).
- D8: the local `round.json` story check runs before `pull-approvals` (build auto-pick, recorded
  in D8); the refusals and their order are unchanged.
- D3: `roundFindings` takes an optional fifth argument, `readScreens`'s own `bad-screen-file`
  findings, and returns them first — the four-argument signature had no other way to return
  "them together with the rest".
- D17 took two fix rounds at review: the build tagged only the three criteria its oracle
  (`ac-drift-clean`) flagged, but that oracle demands tags on CONTINUE-TO pins only, so 32
  further criteria orphaned by the deleted tests were invisible to it. The complete set came
  from a base-versus-head diff of the AC-IDs cited under `tests/`.

## Canonical Delta

`docs/canonical/design.md` — the three sections **Design Canon: one artifact**, **The mock
stage's actors and chain** and **Genesis and the mock app** are replaced by the two sections
below, and the later sentence that calls `design.app` "optional … for the mock app" reads
"optional — carried only by a host approved under the retired mock-app flow".

**The wireframe (specs/20261002/01).** The wireframe is a picture, not the product: gray screens
drawn by the walkthrough service from one json-render file per screen and state under
`design/mocks/screens/`, named as the seed's beats name them and checked offline against the
catalog before anything is sent. There is no mock app and no screen-approval record. The chain is
`SEED → SCREENS → APPROVED`. A seed journey is a numbered list of the client's own sentences; a
journey is approved by the client's confirm on the service against the hash of those sentences,
so editing a beat voids the confirmation and reopens the journey. A project with no `walkthrough`
config block draws nothing and confirms each story in the terminal; with the block, a journey
may also be waived with a written reason. Rounds, notes and confirmations land under
`design/rounds/<n>/`; a round is always a full snapshot. The stage finishes when every story is
confirmed and no note waits for an answer — an answered note does not block — and the last round
is then closed. A look prints the service's project page and ends the turn.

**Genesis and the wireframe (specs/20261002/01).** Genesis always picks the stack and scaffolds
the real app; the wireframe never pre-empts either. BRIEF prints
`seed journeys: N · notes open: N` from the seed's journey count and the latest round's waiting
notes. The design brief's step lists `design/mocks/screens/` among its reads when it exists.

`docs/canonical/genesis.md` — the bullet that describes skeleton-landed's former review check is
reworded to "refuses unless the wireframe's own review check passed"; every bullet that says
BRIEF reads the wireframe's approval file reads "BRIEF derives its counts from the seed and the
latest round" instead; and one bullet is added: "Since specs/20261002/01 no genesis step reads a
file under a mock app."

`docs/canonical/scripts.md` — the bullet about the library that called the reviewer package is
replaced by: "`spec/scripts/lib/mocks-round.js` is the one reader of a wireframe round: the screen
files, the assembled round, its offline findings, its digest, and the latest round's notes and
approvals; the mocks driver and genesis both read through it, and the driver reaches the service
only by running `walkthrough.js` as a child process."
