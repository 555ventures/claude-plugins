---
date: 2026-10-05
status: done
build_base: design-retool
tier: critical
area: design
breaking: false
depends_on: []
brief: 29
spiked: 2026-10-05
open_markers: 0
diff_base: c159a7a89dc9721b7fb150936fb8285ad906bab7
---

# A project sends pictures of its screens

<!-- Reworked on 2026-10-05, the day it was first locked. The first lock put a browser driver and
     a component-showcase tool inside a plugin script; core § Host Grounding and § Rule Enforcement
     forbid that. The file keeps its first name so the ledger row and the queue gate still point
     at it. -->

## Goal

A project that reviews its stories on the hosted service can send one round of pictures of its
real screens, so the client walks the same stories with real screens in place of gray wireframes
and can leave a note on a spot. The plugin names no browser, framework or showcase tool: the
project's config declares the one command that makes its pictures, the plugin tells that command
which pictures the stories need, checks the folder it filled, writes the round and hands it to
the existing sender. Done means: a web, mobile or terminal project sends a round through the same
command, a folder with a missing or stray picture is refused by name, and no stage waits for any
of it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **New optional host config block `pictures` = `{ "command", "dir", "widths"? }`**, added to `spec/templates/grounding-contract.md` (the optional list and a `## Pictures` section, text in Contracts). `command` is a non-empty shell string; `dir` is a non-empty repo-relative folder with no `..` segment, not `.`, not absolute; `widths` is 1 to 4 distinct integers, each 240 to 3840, default `[390, 1280]`. Absent block = the project has never declared how its pictures are made. This repository's own `.claude/spec.config.json` is re-stamped with the new `contractHash` and gains no `pictures` block. `[no-ac: contract prose and the stamp; the restamp pin in tests/consistency/contract-stamp.test.js is the oracle, and D3's refusals are the behaviour]` | Core § Host Grounding: project differences live in the project's config, never as forks inside the plugin. Phone and desktop is JJ's ruling of 2026-10-05, kept as the default. |
| D2 | **One new script, `spec/scripts/pictures.js`, reached as `spec-paths pictures`.** Usage: `pictures.js [--root <dir>] [--no-send]`. Every refusal is one stderr line `pictures: <code> — <sentence> — remedy: <what to do>` and exit 2; success is exit 0. No plugin file names a browser, a test runner or a showcase tool for it. (AC-20261005-06-18, AC-20261005-06-1) | A session finds it by key months later; core § Rule Enforcement keeps tool names out of the plugin. |
| D3 | **Preconditions run in this order and all before the project's command:** (1) arguments, else `usage`; (2) the config's `pictures` value is an object, else `no-command`; its three keys pass D1's rules, else `bad-config` naming the key; (3) the seed (`design/mocks/seed.md` through `lib/surfaces.js`) holds at least one journey, else `no-stories`; (4) unless `--no-send`, the config's `walkthrough` value is an object, else `not-connected`; (5) distinct screen-and-state pairs × widths is at most the contract's `limits.screens`, else `too-many`. (AC-20261005-06-7, AC-20261005-06-8, AC-20261005-06-9, AC-20261005-06-10) | Every check reads files only; a refusal after a slow picture run wastes the run. |
| D4 | **The wanted list.** The plugin walks every seed journey in seed order and its beats in order; the first beat that shows a screen-and-state pair fixes its place. For each pair, for each width ascending, one entry `{ "screen", "state", "width", "file" }` with `state` null when the beat has none and `file` = `<screen>--<width>.png` or `<screen>--<state>--<width>.png`. The list is written to `<dir>/wanted.json` as `{ "schemaVersion": 1, "pictures": [...] }` before the command runs. (AC-20261005-06-1, AC-20261005-06-2) | The plugin is the one party that knows the stories; the project's command should not re-derive them. |
| D5 | **Cleaning the folder.** Before writing `wanted.json` the plugin creates `<dir>` when absent and removes, at its top level only, every regular file whose name ends `.png` plus `wanted.json` and `round.json`. It never removes a subfolder, a file inside one, or any other file. (AC-20261005-06-11) | A stale picture must not pass the check; a mistyped `dir` must not cost the project its files. |
| D6 | **Running the command.** `bash -c <command>` with cwd = the root, the inherited environment plus `SPEC_PICTURES_DIR` (the absolute folder) and `SPEC_PICTURES_WANTED` (the absolute path of `wanted.json`); the command's stdout and stderr both go to this script's stderr. A non-zero exit or a signal is `command-failed` naming the exit code or signal. No timeout. (AC-20261005-06-1, AC-20261005-06-6) | The same shape as the project's test and boot commands; only exit 0 makes outputs count. |
| D7 | **Checking the folder, in this order, first failing class wins:** `missing-picture` — a wanted file that is absent, not a regular file, or zero bytes; `bad-picture` — a wanted file whose first eight bytes are not the PNG signature; `extra-picture` — a top-level `.png` file not in the wanted list. Each refusal says `<k> of <n>` and names up to ten files. Nothing is written or sent after a refusal. (AC-20261005-06-3, AC-20261005-06-4, AC-20261005-06-5) | Every story step needs its screen on the service; a stray file is a misnamed picture. |
| D8 | **The round file.** After the check, `<dir>/round.json` = `{ "kind": "screenshots", "journeys": […], "screens": [{ "name", "state"?, "width", "file" }] }`, screens in wanted order, `file` the bare name. Journeys are the seed's, built by `lib/mocks-round.js` `assembleRound(seedJourneys, ids, [])` with `ids` every seed journey, taking its `journeys`. (AC-20261005-06-1, AC-20261005-06-12) | It is the format the sender already reads; the same builder gives the same story fingerprint as the wireframe round, so earlier confirmations still match. |
| D9 | **Sending.** Unless `--no-send`, the script runs `walkthrough.js push --round-file <round.json> --root <root> --json` as a child process and requires exit 0 with an integer `round`. It never requires the client as a library and has no other way to put a picture anywhere. Success prints three stdout lines: `took <k> pictures — <s> screens at <widths joined by " and "> wide — <round.json relative to root>`, `sent round <n> — open at <baseUrl>/p/<project>`, `notes come back with: node <abs mocks-driver.js> --root <root> round pull`. With `--no-send` only the first line prints. A failed child is `send-failed`: the child's stderr is relayed first, then the refusal line, whose remedy names the kept `round.json` and `walkthrough.js push --round-file <file> --resume <n>` when `design/rounds/<n>/round.json` exists for the highest `<n>` with status `uploading`, else `walkthrough.js push --round-file <file>`. (AC-20261005-06-12, AC-20261005-06-13) | ADR-0031 keeps one door to the network; a failed send must stop, never find another host for the pictures. |
| D10 | **Genesis prints, never gates.** The `ROADMAP` step prints one extra line, directly before its `Write docs/roadmap/…` line, only when `docs/design/approval.json` exists and the config's `pictures` and `walkthrough` values are both objects: `Optional — show the client the designed screens: node <abs pictures.js> --root <root>`. No mark and no state reads the block or waits for a round. (AC-20261005-06-14) | ADR-0030 (g): a picture round is optional and there is no client gate at the design stage. |
| D11 | **The worklist names the spot.** `lib/mocks-round.js` `waitingItems` adds `spot: { x, y, width }` when a note's anchor carries three finite numbers under those keys, else `spot: null`. `mocks-driver.js round pull` appends ` (spot: <X>% across, <Y>% down the <width>-wide picture)` to that note's line, `<X>` and `<Y>` being `Math.round(value * 100)`. A note without a spot prints exactly as before. (AC-20261005-06-15, AC-20261005-06-16) | The session answering a note must know where on the picture it sits; no second worklist is built. |
| D12 | **The client and the service contract do not change.** `lib/walkthrough-client.js`, `walkthrough.js`, `contract.json` and `catalog.json` are not edited. (AC-20261005-06-17) | The live trial of 2026-10-05 sent, repeated and pulled a picture round through them from exactly this folder format. |
| D13 | **Scope.** A round is always every story of the project. The prototype driver, the freeze and the build are not edited, and no picture note becomes a prototype pin. `[no-ac: a scope ruling by JJ on 2026-10-05; the brief's corrections of that date carry it]` | The service shows one round as the whole product. |
| D14 | **Records.** `spec/doctrine/genesis.md` § Genesis: Design Stage: the paragraph opening `**No PNG round is pushed from this stop.**` is replaced in place by one of no more lines saying a picture round is optional and never a gate, that the project's `pictures` block (the contract's § Pictures) says how pictures are made, and naming `node "$(spec-paths pictures)" --root .`; no other paragraph is reflowed. `genesis-driver.js`'s header lines saying no screenshot round is pushed are rewritten to say the driver only prints the command. `spec/entrypoints.json` gains the script's row (entry points: `spec/scripts/genesis-driver.js`, `spec/doctrine/genesis.md`) and names `spec/scripts/pictures.js` as an entry point of `spec/scripts/walkthrough.js` and `spec/scripts/mocks-driver.js`. An amendment ADR (next free number at build) records D1, D4 and D13 and that the review service's own terminal tool takes over the upload when it exists, with the `Amended by` backlink on ADR-0030. `[no-ac: prose and registry rows; the standing entrypoints and citations tests in the gate are their oracle]` | One binding home per rule; the registry test fails closed on an unregistered script. |
| D15 | **Version.** `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; the paragraph says the contract hash changed and projects owe a re-stamp. `[no-ac: plugin-bump --check in the gate is the oracle]` | Pipeline rules § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/pictures.js | CREATE | scripts | D2–D9 — the whole command; header per pipeline rules § Worker Rules |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D10 — the ROADMAP line; D14 — the header lines |
| spec/scripts/lib/mocks-round.js | MODIFY | scripts | D11 — `waitingItems` returns `spot` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D11 — the `round pull` line's spot suffix |
| spec/bin/spec-paths | MODIFY | scripts | D2 — the `pictures` key and its mention in the usage line |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1 — `pictures` in the optional list and the `## Pictures` section (this spec's one contract edit) |
| spec/doctrine/genesis.md | MODIFY | doctrine | D14 — one paragraph replaced in place |
| spec/entrypoints.json | MODIFY | other | D14 |
| .claude/spec.config.json | MODIFY | other | D1 — `contractHash` re-stamped (`spec-paths contract-hash`) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D15 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| docs/adr/0034-a-project-makes-its-own-pictures.md | CREATE | other | D14 (next free number at build) |
| docs/adr/0030-the-kit-is-the-contract.md | MODIFY | other | D14 — `Amended by` backlink |
| tests/pictures/pictures.test.js | CREATE | tests | AC-20261005-06-1, AC-20261005-06-2, AC-20261005-06-3, AC-20261005-06-4, AC-20261005-06-5, AC-20261005-06-6, AC-20261005-06-7, AC-20261005-06-8, AC-20261005-06-9, AC-20261005-06-10, AC-20261005-06-11, AC-20261005-06-12, AC-20261005-06-13 |
| tests/genesis/pictures-step.test.js | CREATE | tests | AC-20261005-06-14 |
| tests/mocks/worklist-spot.test.js | CREATE | tests | AC-20261005-06-15, AC-20261005-06-16 |
| tests/walkthrough/picture-notes.test.js | CREATE | tests | AC-20261005-06-17 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261005-06-18 |

Notes outside the table. `tests/pictures/pictures.test.js` builds its own project in `tmpdir()`
and keeps its helpers inside the file. Its picture command is a real one: a small Node script the
test writes into the project, which reads `SPEC_PICTURES_WANTED`, writes one valid PNG per entry
into `SPEC_PICTURES_DIR`, and appends its cwd and both variables to a log the test reads; the
refusal cases change that script, never the script under test. The two sending cases use the stub
service of `tests/walkthrough/fixture.js` (`startStub`, a separate process). The script under test
is spawned with `runNode`. The exhaustive pins this spec touches by adding a member are
`tests/spec-paths.test.js` (a row above) and `tests/consistency/entrypoints.test.js`, which reads
`spec/entrypoints.json` and needs no edit. The script's name matches none of node's default test
patterns. Plugin directories touched: `spec/` only.

## Contracts

The config block and the grounding-contract section (D1):

```json
"pictures": { "command": "node tools/pictures.mjs", "dir": "design/pictures", "widths": [390, 1280] }
```

```markdown
## Pictures (optional — present when the project can make pictures of its real screens)

`pictures` — `command` (a shell string the project owns: it makes one PNG per entry of the wanted
list, however this stack makes a picture of a screen; run with cwd = the repo root and the
variables `SPEC_PICTURES_DIR`, the folder to fill, and `SPEC_PICTURES_WANTED`, the path of the
wanted list), `dir` (a repo-relative folder the plugin cleans of pictures and refills on every
run), optional `widths` (1 to 4 widths, each 240 to 3840; default 390 and 1280). The wanted list
names every picture by screen, state and width; a missing, empty or stray picture is refused.
Absent block = the project has never declared how its pictures are made: `spec-paths pictures`
refuses naming this block.
```

`<dir>/wanted.json` for the fixture the criteria use (D4):

```json
{ "schemaVersion": 1, "pictures": [
  { "screen": "landing", "state": null,     "width": 390,  "file": "landing--390.png" },
  { "screen": "landing", "state": null,     "width": 1280, "file": "landing--1280.png" },
  { "screen": "form",    "state": "empty",  "width": 390,  "file": "form--empty--390.png" },
  { "screen": "form",    "state": "empty",  "width": 1280, "file": "form--empty--1280.png" },
  { "screen": "form",    "state": "filled", "width": 390,  "file": "form--filled--390.png" },
  { "screen": "form",    "state": "filled", "width": 1280, "file": "form--filled--1280.png" },
  { "screen": "status",  "state": null,     "width": 390,  "file": "status--390.png" },
  { "screen": "status",  "state": null,     "width": 1280, "file": "status--1280.png" } ] }
```

`<dir>/round.json` for the same fixture (D8):

```json
{
  "kind": "screenshots",
  "journeys": [
    { "id": "order", "title": "Order", "persona": "<the seed's persona>",
      "steps": [
        { "beat": "I open the landing page", "screen": "landing" },
        { "beat": "I see an empty form", "screen": "form", "state": "empty" },
        { "beat": "I see my details filled in", "screen": "form", "state": "filled" } ] },
    { "id": "track", "title": "Track", "persona": "<the seed's persona>",
      "steps": [
        { "beat": "I see my details again", "screen": "form", "state": "filled" },
        { "beat": "I see the status", "screen": "status" } ] }
  ],
  "screens": [
    { "name": "landing", "width": 390, "file": "landing--390.png" },
    { "name": "landing", "width": 1280, "file": "landing--1280.png" },
    { "name": "form", "state": "empty", "width": 390, "file": "form--empty--390.png" },
    { "name": "form", "state": "empty", "width": 1280, "file": "form--empty--1280.png" },
    { "name": "form", "state": "filled", "width": 390, "file": "form--filled--390.png" },
    { "name": "form", "state": "filled", "width": 1280, "file": "form--filled--1280.png" },
    { "name": "status", "width": 390, "file": "status--390.png" },
    { "name": "status", "width": 1280, "file": "status--1280.png" }
  ]
}
```

Refusal codes of `pictures.js`, all exit 2: `usage`, `no-command`, `bad-config`, `no-stories`,
`not-connected`, `too-many`, `command-failed`, `missing-picture`, `bad-picture`, `extra-picture`,
`send-failed`. Remedies: `no-command` names the `pictures` block and `spec-paths contract`;
`bad-config` names the key and its rule; `no-stories` names `design/mocks/seed.md` and
`/spec:mocks`; `not-connected` names `/spec:connect` and `--no-send`; `too-many` names
`pictures.widths` with fewer widths; `command-failed` names `pictures.command`; the three folder
codes name `pictures.command` and `<dir>/wanted.json`.

`waitingItems` item after D11: `{ id, where, text, picked, spot }`.

## Behavior

The run, in order: preconditions (D3), clean the folder (D5), write the wanted list (D4), run the
project's command (D6), check the folder (D7), write the round file (D8), print the first line,
send (D9).

Whether the folder is tracked by git is the project's choice; the plugin writes no ignore file.

A picture over the service's 8,000,000-byte limit is refused by the sender before any request
(`too-large`), which reaches the user as `send-failed` with the sender's own line first. The
plugin does not compare a picture's pixel width with its declared width: a phone picture at
double density is a correct picture.

A second run sends a new round under the next number; readers see the newest round. Pushing a
wireframe round later makes that round the newest again; pictures return with the next run.

Notes: the client's notes on a picture arrive through the existing `mocks-driver.js round pull`
(which pulls notes and approvals for the latest local round, whatever its kind) and are answered
with the existing `walkthrough.js reply`. Genesis's own "notes open" count already reads the
latest round.

## Acceptance Criteria

The fixture named "the two-story project" below: a seed with journey `order` (beats 1 `landing`,
2 `form` state `empty`, 3 `form` state `filled`) and journey `track` (beats 1 `form` state
`filled`, 2 `status`), sentences as in Contracts; a config whose `pictures` is
`{ "command": "node make-pictures.js", "dir": "design/pictures" }`; and `make-pictures.js` as the
File Plan note describes, appending to `command.log`.

- **AC-20261005-06-1**: WHEN `pictures.js --root <project> --no-send` runs on the two-story
  project THE SYSTEM SHALL exit 0; `design/pictures/wanted.json` SHALL deep-equal the Contracts
  example; `command.log` SHALL hold exactly one entry whose cwd is the project root, whose
  `SPEC_PICTURES_DIR` is the absolute `design/pictures` and whose `SPEC_PICTURES_WANTED` is the
  absolute `design/pictures/wanted.json`; `design/pictures/round.json` SHALL deep-equal the
  Contracts example with the seed's personas filled in; and stdout SHALL be the one line
  `took 8 pictures — 4 screens at 390 and 1280 wide — design/pictures/round.json`
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-2**: WHEN the two-story project's block adds `"widths": [768]` and the script
  runs with `--no-send` THE SYSTEM SHALL write a wanted list of exactly four entries with files
  `landing--768.png`, `form--empty--768.png`, `form--filled--768.png`, `status--768.png` in that
  order, and print `took 4 pictures — 4 screens at 768 wide — design/pictures/round.json`
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-3**: WHEN the project's command writes every wanted picture except
  `form--empty--1280.png` and writes `status--390.png` with zero bytes THE SYSTEM SHALL exit 2
  with a stderr line starting `pictures: missing-picture — ` that contains `2 of 8`,
  `form--empty--1280.png` and `status--390.png`, and SHALL leave no `round.json` in the folder
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-4**: WHEN the project's command writes `landing--390.png` holding the six
  bytes `GIF89a` followed by filler THE SYSTEM SHALL exit 2 with `pictures: bad-picture — `
  containing `1 of 8` and `landing--390.png`, and SHALL leave no `round.json`
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-5**: WHEN the project's command writes all eight wanted pictures and also
  `oops--390.png` THE SYSTEM SHALL exit 2 with `pictures: extra-picture — ` containing
  `oops--390.png`, and SHALL leave no `round.json` → writes tests/pictures/pictures.test.js
- **AC-20261005-06-6**: WHEN `pictures.command` is `echo boom >&2; exit 3` THE SYSTEM SHALL exit 2
  with stderr containing the line `boom` and then a line starting `pictures: command-failed — `
  that contains `3` and `pictures.command`, with no `round.json` written
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-7**: WHEN the config has no `pictures` key THE SYSTEM SHALL exit 2 with
  `pictures: no-command — ` containing `pictures` and `spec-paths contract`; WHEN `pictures.dir`
  is `../out`, or `/tmp/out`, or `.` it SHALL exit 2 with `pictures: bad-config — ` containing
  `pictures.dir`; WHEN `pictures.widths` is `[100]` it SHALL exit 2 with
  `pictures: bad-config — ` containing `pictures.widths`, `240` and `3840`; in every case
  `command.log` SHALL not exist → writes tests/pictures/pictures.test.js
- **AC-20261005-06-8**: WHEN `design/mocks/seed.md` is absent THE SYSTEM SHALL exit 2 with
  `pictures: no-stories — ` containing `design/mocks/seed.md` and `/spec:mocks`, and
  `command.log` SHALL not exist → writes tests/pictures/pictures.test.js
- **AC-20261005-06-9**: WHEN the two-story project's config has no `walkthrough` key and the
  script runs without `--no-send` THE SYSTEM SHALL exit 2 with `pictures: not-connected — `
  containing `/spec:connect` and `--no-send`, and `command.log` SHALL not exist
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-10**: WHEN the seed holds 151 distinct screens across three journeys and the
  default widths apply THE SYSTEM SHALL exit 2 with `pictures: too-many — ` containing `302` and
  `300`, and `command.log` SHALL not exist → writes tests/pictures/pictures.test.js
- **AC-20261005-06-11**: WHEN `design/pictures/` holds `old--390.png`, a stale `round.json`,
  `notes.txt` and `keep/a.png` before a `--no-send` run on the two-story project THE SYSTEM SHALL
  remove `old--390.png` and replace `round.json`, and SHALL leave `notes.txt` and `keep/a.png`
  byte-identical; and WHEN `design/pictures/` does not exist it SHALL create it
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-12**: WHEN the two-story project carries
  `walkthrough: { baseUrl: <stub url>, project: "acme-shop", tokenEnv: "WALKTHROUGH_TOKEN" }`, a
  token, and a stub service answering `pushRound` with status `uploading` and each `putImage`
  with success, and `pictures.js --root <project>` runs THE SYSTEM SHALL exit 0; the stub log
  SHALL hold one `POST /v1/projects/acme-shop/rounds` whose body has `kind: "screenshots"`,
  `round: 1`, eight screens and two journeys whose `beats` equal `beatHash` of the seed's beats
  for `order` and `track`, then eight `PUT` requests; `design/rounds/1/round.json` SHALL have
  `status: "open"`; and stdout SHALL be the `took 8 pictures — …` line, then
  `sent round 1 — open at <stub url>/p/acme-shop`, then a line starting
  `notes come back with: node ` and ending `mocks-driver.js --root <project> round pull`
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-13**: WHEN the stub service answers the third `putImage` with status 500 THE
  SYSTEM SHALL exit 2, relay the sender's own refusal line on stderr first, then print
  `pictures: send-failed — ` whose remedy contains `--resume 1` and
  `design/pictures/round.json`, and SHALL leave all eight PNG files in place
  → writes tests/pictures/pictures.test.js
- **AC-20261005-06-14**: WHEN `genesis-driver.js --root <project>` prints the `ROADMAP` step for
  a project that has `docs/design/approval.json` and a config whose `pictures` and `walkthrough`
  are both objects THE SYSTEM SHALL print, on the line directly before the one starting
  `Write docs/roadmap/`, the line
  `Optional — show the client the designed screens: node <abs path>/pictures.js --root <project>`;
  and WHEN the config lacks `pictures`, or lacks `walkthrough`, or the approval record is absent,
  the step SHALL contain no line with `pictures.js`
  → writes tests/genesis/pictures-step.test.js
- **AC-20261005-06-15**: WHEN `mocks-driver.js --root <project> round pull` runs against a stub
  service whose `pullNotes` answer holds note `n1` on screen `dashboard`, state `just-paid`,
  anchor `{ "x": 0.25, "y": 0.5, "width": 390 }`, text `Is this total in dollars?`, status `open`
  THE SYSTEM SHALL print the line
  `  n1 [dashboard@just-paid] "Is this total in dollars?" (spot: 25% across, 50% down the 390-wide picture)`
  → writes tests/mocks/worklist-spot.test.js
- **AC-20261005-06-16**: WHEN the same answer holds note `n2` on screen `welcome`, anchor
  `{ "node": "start", "index": 0 }`, picked text `Start`, text `Too small`, status `open` THE
  SYSTEM SHALL CONTINUE TO print the line `  n2 [welcome] "Too small" (on: "Start")` with nothing
  after it → writes tests/mocks/worklist-spot.test.js
- **AC-20261005-06-17**: WHEN `walkthrough.js pull-notes --root <project>` receives a `pullNotes`
  answer holding a note whose anchor is `{ "x": 0.25, "y": 0.5, "width": 390 }` and whose
  `pickedText` is null THE SYSTEM SHALL CONTINUE TO exit 0 and write that note, anchor unchanged,
  into `design/rounds/<n>/notes.json` → writes tests/walkthrough/picture-notes.test.js
- **AC-20261005-06-18**: WHEN `spec-paths pictures` runs THE SYSTEM SHALL print a path ending
  `scripts/pictures.js` that exists, and the usage line printed for an unknown key SHALL name
  `pictures` → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every

## Assumptions (escalation triggers)

- A1: The real service accepts a picture round from the unchanged sender, fed by exactly this
  folder format (PNG files beside a `round.json` naming them). Executed 2026-10-05: service run
  from its build against a scratch database; `validate` → `round ok: 4 screens, 1 journey`; `push`
  → `{"round":1,"kind":"screenshots","status":"open","already":false,"pictures":{"total":4,"uploaded":4}}`;
  the same push repeated → `"already":true`; a reader's note with anchor
  `{"x":0.25,"y":0.5,"width":390}` then came back through `pull-notes` and printed in
  `mocks-driver.js round pull`. **if false:** the build stops at its first real send; the sender
  fix is planned as its own change, never patched in here (D12).
- A2: Real pictures are far under the 8,000,000-byte limit. Executed 2026-10-05: four full-page
  pictures of a real project's screens were 161,388 to 481,892 bytes. **if false:** the sender's
  `too-large` refusal names the file; the project lowers its widths.
- A3: The seed's journeys, built by `assembleRound`, validate as a picture round's journeys.
  Executed 2026-10-05 on a real project's seed: eight journeys assembled, and the trial round's
  journey passed `validate`. **if false:** STOP, ask the user.
- A4: The contract's limit on pictures per round is `limits.screens` = 300, and a picture width
  must be 240 to 3840. Executed 2026-10-05: read from `spec/templates/walkthrough/contract.json`
  by script. **if false:** read the bound from wherever the contract now holds it.
- A5: `lib/host-config.js` `readConfig` returns `{}` for an absent config. Read from source.
  **if false:** treat a throw as no block.
- A6: `spec/doctrine/genesis.md` may be declared an entry point in `spec/entrypoints.json` the
  way `spec/doctrine/stages/*.md` files are. Not executed. **if false:** the driver is the sole
  entry point and the doctrine paragraph names "the command the ROADMAP step prints" with no
  `spec-paths` call.
- A7: No existing test spells the `ROADMAP` step as a whole block. Executed 2026-10-05:
  `grep -rn "decompose the roadmap" tests/` → no hit. **if false:** update the pin in place in
  the same batch and add its row.
- A8: `/spec:init` regeneration treats `pictures` as it treats `prototype`: a block the project
  declares, re-declared by the session that regenerates. Not executed. **if false:** carry the
  block the way `init-gen.js` carries `walkthrough`, as its own change.

## Rationale

The first lock of this spec, earlier the same day, put a browser driver and a component-showcase
tool inside a plugin script. JJ rejected it against core § Host Grounding ("repo differences live
in these two files, never as forks inside the plugin's own") and § Rule Enforcement ("no plugin
file ever names a specific tool"). The rework follows JJ's own proposal: the plugin's part ends
at a folder; the project owns how a picture is made.

Research the same day (four parallel sweeps; most sources are current vendor documentation with
no publish date) found this to be the common shape. Visual review services with a plain-folder
path let the project capture however it likes and have the service's own tool upload the folder;
the one framework-bound product has no such path. Stack-neutral task runners express a producer
as a declared command plus a declared output location, and count outputs only after a clean
exit. Every stack sampled (web, both mobile platforms, a cross-platform framework, terminal
apps) has a producer whose output path can be set or renamed.

What the plugin adds is the one thing only it knows: the wanted list derived from the stories,
and the check that the folder matches it (D4, D7). A naming convention alone was considered and
kept as the file names; the wanted list is written out so a project's command need not parse the
seed.

Upload stays with the existing sender (D9, D12): it already reads this folder format, checks
checksums and resumes, and was proven live. The review service's roadmap holds its own terminal
tool; when that exists the upload and the shared contract file should move there, which is a
later ruling and outside this spec. A failed send stops (D9): a write-up of 2026-09-29 describes
agents that could not attach images one way and pushed thousands of screenshots to public
repositories another way.

Costs accepted. Each project writes and keeps its own picture command, and pictures from
different projects will differ in fonts and window size; that is the price of naming no tool.
The plugin cannot know a picture shows the right screen, only that the right file exists. Spikes
run during the first lock (a hook that reports each story step, hiding review-only chrome, full
page) are a measured recipe for one web stack and belong to that project's own command; the
queue carries them, this spec does not.

A service-owned capture worker was rejected: it works for web only. Comparing pixel width with
declared width was rejected: high-density phone pictures would fail. Tests use a real picture
command and never a stand-in browser, so the suite proves the whole chain except the network,
which A1 covers. This spec adds no control a client can press, so the three-ways rule has nothing
to specify. Regression pins: AC-16 and AC-17 hold the two existing behaviours this spec builds on.

Collision closure at lock (literals `No PNG round`, `screenshot round`): six files. Fixed:
`spec/doctrine/genesis.md` and `spec/scripts/genesis-driver.js` (File Plan rows) and
`docs/canonical/genesis.md` (Canonical Delta). Waived as dated records that stay true:
`docs/roadmap/00-overview.md`, `docs/roadmap/29-walkthrough-integration.md` (its corrections of
2026-10-05 carry the ruling) and `docs/spikes/20260929-walkthrough/run.js`.

Build deviation (2026-10-05, one-off): the `pictures.js` row in `spec/entrypoints.json` also
lists `spec/templates/grounding-contract.md` beyond D14's two names, because the contract's new
§ Pictures text says `spec-paths pictures` and the entrypoints test flags an undeclared caller.
Review (2026-10-05, CLEAN, two advisories): the catch-all `script-error` refusal word is now
named in the script's header; D1's widths and dir edge rules are enforced but pinned only by
AC-7's four literals — left advisory.

## Canonical Delta

`docs/canonical/design.md`, section "The walkthrough client": append the paragraph —

A project can send pictures of its real screens (specs/20261005/06). Its config's `pictures`
block names the command that makes them, the folder they land in and the widths; the plugin
names no tool for it. `spec-paths pictures` derives the wanted list from the seed's stories (one
picture per screen, state and width, named `<screen>[--<state>]--<width>.png`), cleans the
folder of pictures, runs the project's command with `SPEC_PICTURES_DIR` and
`SPEC_PICTURES_WANTED`, refuses a missing, empty, non-PNG or stray picture by name, writes the
round file with the seed's journeys, and sends it through `walkthrough.js` as a child process. A
round is always every story of the project. The worklist of `mocks-driver.js round pull` names
the spot of a note left on a picture.

`docs/canonical/genesis.md`: replace the sentence "No PNG round is pushed from genesis until
brief 29's client exists." with — "A picture round is optional and never a gate: when the
project declares a `pictures` block and is connected to the review service, ROADMAP prints the
`pictures` command (specs/20261005/06)."

`docs/canonical/scripts.md`: add the entry — "**`spec/scripts/pictures.js` runs the project's
own picture command and never makes a picture itself; it reaches the service only by running
`walkthrough.js` as a child process.** (specs/20261005/06-the-design-stage-sends-pictures.md)"
