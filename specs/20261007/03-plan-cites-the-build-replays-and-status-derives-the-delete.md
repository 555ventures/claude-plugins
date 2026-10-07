---
date: 2026-10-07
status: implementing
build_base: main
tier: critical
area: prototype
breaking: false
depends_on: [specs/20261007/01-approve-writes-a-behaviour-contract.md, specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md]
depended_on_by: []
brief: 28a
spiked: 2026-10-07
open_markers: 0
diff_base: 96fc7d80174a9676a49781b65b5b97eaf8fcdd34
---

# Plan cites, the build replays, and status derives the delete

## Goal

`/spec:plan` takes a behaviour contract as its feature description, reads the contract, the
pictures and the pins — never the prototype's file tree — and writes ordinary specs stamped
`prototype: <stem>` whose File Plan comes from the production architecture. The build driver's
behaviour lane becomes one state, `REPLAY`: after a green gate the driver copies the contract's
test file into the tree, runs it against the production build through the host's `e2eRun`, and
prints a look stop that puts the production screens beside the prototype's pictures until the
user says `close enough`. Review proves the replay through a `contract` manifest leg the pin
criteria name as their oracle, and the reviewer treats a prototype line in the diff as a hard
finding. When the last spec citing a stem closes, the review driver closes the prototype;
`/spec:status` prints the close paste whenever every citer is done and the worktree is still
there. The harden merge, the structural capture gate, the "refuse while `proto/` exists"
admission and the harden-branch deletion are deleted. Done means: on a fixture host a
`prototype:` spec builds through `REPLAY` to `COMMIT` with the row carrying `replay`, a red replay
stops it, review emits the `contract` leg from the build row, the review close deletes the
prototype only when it is the last citer, and status names the paste.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Plan's contract shape.** `spec/commands/plan.md` § Input's sentence gains `or a behaviour contract (\`design/prototypes/<stem>/contract.json\`)`; § Entry gains one bullet, at most five lines: **Behaviour contract:** read `contract.json`, every picture under `captures/` (view them), the test file under `tests/`, and `pins.json`; then do what the other shapes do — amend the brief the contract's `brief` names (that brief gains a `Prototype: <stem>` header line), amend a draft spec, or mint new specs (`brief: n/a` when no roadmap applies); every spec this session produces carries `prototype: <stem>` in frontmatter; one spec owns the contract's test file — a File Plan row `<e2eFile with {stem}> \| CREATE \| other` (the build driver copies it) — and one AC per behaviour pin, text opening `WHEN pin <id> ("<note>", <screen> / <state>) is exercised against the production build THE SYSTEM SHALL pass its contract test`, each tagged with the `contract` leg as its oracle and ending `→ writes <that file>`; never read `proto/<stem>` or `.claude/worktrees/proto-<stem>` — the File Plan comes from the production tree and the host's rules, and the prototype is a reference only. Read-load stays within `plan`'s budget by condensing the Entry bullets this edit touches, never by raising it. `[no-ac: command prose — read-load and citations-check are the oracles; D3 and D5 are the behaviour the bullet promises]` | Brief 28a scope 3; the oracle tag is how a Playwright file the host's own runner executes covers an AC without an AC id ever being written into it (ac-matrix reads oracle standing from the manifest; executed 2026-10-07, A1). One owner for the test file because one file is run as a whole. |
| D2 | **Frontmatter.** `spec/templates/spec.md`'s commented `# lane: behaviour …` line becomes `# prototype: <stem>  # written by /spec:plan from a behaviour contract; the build driver replays the contract's tests (REPLAY) and the review driver closes the prototype when the last citing spec is done`. `[no-ac: template comment — the build and review ACs read the key]` | The key names the reference; nothing else about the lane is stamped. |
| D3 | **The build driver.** (a) The `proto/<NN>-*` admission refusal is deleted — a spec with any `brief:` is admitted whatever branches exist. (b) `HARDEN_MERGE`, `handleHardenMerged`, `CAPTURE`, `handleCaptured`, `handleCaptureAccepted`, `capture-state.json`, `capture-port.json`, `PROTO_CAPTURE_BIN` and `isBehaviourLane` are deleted; `lane:` is never read. (c) New state `REPLAY`, derived for a spec whose frontmatter carries `prototype: <stem>` when the ordinary derivation reaches `COMMIT` and `<spec>.build/replay-state.json` does not hold `passed: true` and `looked: true`. Its step prints `Read only: design/prototypes/<stem>/contract.json`, `Session: start the app in the background (tracked) so it answers at <url>: <PORT=<n> >bootCommand` (one port per build in `<spec>.build/replay-port.json`, the renamed capture port) and `Then: --mark replayed`. (d) `--mark replayed` (admitted at `REPLAY`): the contract is readable with `tests.file` set, else exit 2 naming `contract.json` and `--mark tests-derived`; `prototype.e2eRun` is declared, else exit 2 naming it; the driver writes `design/prototypes/<stem>/<tests.file>` to `<prototype.e2eFile with {stem}>` (overwriting), runs `bash -c <e2eRun with {file}>` with cwd = the repo root and env `PROTO_URL` = the resolved app address, stdout+stderr to `<spec>.build/replay-<k>.log`; non-zero → exit 2 `contract tests red against the production build (e2eRun exited <n>) — see <log>; fix, then --mark replayed`, state unchanged, no `replay-state.json` written; zero → `replay-state.json` = `{ tests: <contract.tests.pins.length>, passed: true, looked: false, log }`, then the look stop (Contracts) and the state stays `REPLAY`. (e) `--mark looked` (admitted at `REPLAY`): refuses `replay has not passed — run --mark replayed first` unless `replay-state.json.passed`; sets `looked: true`; prints `(REPLAY → COMMIT)`. (f) The build row gains `replay: { tests, passed, looked }` for a `prototype:` spec, absent otherwise. (g) `spec/scripts/proto-capture.js` and `spec/templates/proto-capture-page.js` are deleted with their `entrypoints.json` row. (AC-20261007-03-1, AC-20261007-03-2, AC-20261007-03-3, AC-20261007-03-4, AC-20261007-03-5) | Brief 28a scope 3: the capture gate is the contract's tests against the production build; the look stop shows production beside the pictures and the user judges by eye; no diff anywhere. The copy is driver-executed so no worker ever reads the contract's test as a thing to author. |
| D4 | **Doctrine follows the driver.** `spec/doctrine/stages/stage-build.md` § Behaviour lane is replaced by `## Prototype specs` (≤ 10 lines): `REPLAY`, the copy, `e2eRun` with `PROTO_URL`, the look stop and the literal `close enough`, `--mark looked`, `replay` on the row; no harden merge, no capture diff. `spec/commands/run.md` § Routing: the sentence `A spec stamped with a \`brief:\` is refused by the build driver while that brief's \`proto/\` branch still exists.` is deleted. `spec/doctrine/core.md` § Pipeline Entry: the lanes paragraph is replaced in place, same line count, by the eight lines in Contracts (choosing `/spec:prototype` is choosing the behaviour lane, the brief's `Lane:` is advisory; a `proto/*` branch is the third kind at commit time — it has a branch and never lands, its contract lands through a spec). `spec/agents/reviewer.md` § Checks on every repo gains one bullet (≤ 4 lines): for a spec whose frontmatter carries `prototype: <stem>`, run `git diff <base>...proto/<stem> -- . ':!<contract tests.source>'`; an added line of the review range (trimmed, ≥ 40 characters, outside the contract's test file) that is also an added line of that diff is **hard** (`prototype-line`) — the prototype is a reference, never a source; when `proto/<stem>` no longer exists, say so and skip. `[no-ac: prose — read-load, citations-check and run-ledger's stage-doc pins are the oracles]` | Brief 28a scope 3's two core sentences, placed inside the existing paragraph because every command that reads § Pipeline Entry is budgeted; the reviewer check is the one executable form of "never read the prototype's tree" a reviewer can act on. |
| D5 | **The `contract` manifest leg.** `spec/scripts/review-legs.js`: for a spec whose frontmatter carries `prototype: <stem>`, in the file-reading wave, append one row `{ "leg": "contract", "exit", "observed", "scope" }`: it reads `<root>/.claude/spec-runs.jsonl`, takes the LAST row with `stage: "build"` and `spec` = the spec path, and emits exit 0 with `observed: { tests, passed: true }` when that row's `replay.passed` and `replay.looked` are both `true`; otherwise exit 1 with `observed: { unavailable: "no-replay" }`. No row for any other spec; no app is booted. `verdict.js` is untouched (an extra leg row is tolerated and a red or absent oracle leg is a hard finding through `ac-matrix`'s `oracle-red-or-absent` — executed 2026-10-07, A1/A2). (AC-20261007-03-6) | Core § Runtime Verification: CLEAN must be unreachable without the executed replay; the build row is the executed evidence, recorded in the same tree review judges, and re-booting the app in review would be a second, unlooked-at run. Rejected: a review-time re-run (needs the app up inside a review leg — a second boot contract) and a retag of AC ids into the test file (the host's e2e runner never sees `{testDirs}`, and `{testDirs}` hosts would run a Playwright file under their unit runner). |
| D6 | **The review driver closes the last citer's prototype.** `finishMerge`: the `lane: behaviour` harden-branch block and `stemForHarden` are deleted. For a spec whose frontmatter carries `prototype: <stem>`, after `merge-back.sh verify`: when `design/prototypes/<stem>/status.json` is absent or its `marks.closed` is set → nothing; else read every `specs/**/*.md` under the main root whose frontmatter `prototype` equals the stem and `status` is not `superseded` — when every one is `done` run `node <prototype-driver.js> <stem> --root <main root> --mark closed`; exit 0 → `doneNote` gains `prototype <stem> closed — database, worktree and proto/<stem> gone`; non-zero → `⚠️ prototype <stem> still open: <first stderr line> — run: node <driver abs> <stem> --root <main root> --mark closed`; when some citer is not `done` → `prototype <stem> stays open — <n> citing spec(s) not done`. (AC-20261007-03-7) | Brief 28a open question 4; `--via` is recorded as `loop` unconditionally (lock reading), so the review driver's close is the automatic path and status's paste (D7) is the by-hand path for a refused close. The driver's own mark is the one deletion routine (spec 01 D9). |
| D7 | **Status derives the paste.** `spec-status.js` gains anomaly kind `prototype-open` (audience `hygiene`): for every `design/prototypes/<stem>/status.json` with `marks.testsDerived` set and `marks.closed` unset, when at least one non-superseded spec carries `prototype: <stem>` and every such spec is `done`, push `{ kind: 'prototype-open', detail: 'prototype <stem>: every citing spec is done; its worktree, proto/<stem> and database are still there', paste: 'node "$(spec-paths prototype-driver)" <stem> --root . --mark closed' }`. No new action string; `--next`'s shape and the three action strings are unchanged; `--json` carries the anomaly as every other does. (AC-20261007-03-8) | Brief 28a scope 3: status derives "every spec with `prototype: <stem>` is done" and prints the one delete command. An anomaly with a paste is the existing shape for a hygiene item, so the frozen `--next` API is untouched. |
| D8 | **Records.** This plan session minted `docs/adr/0035-prototype-carries-behaviour-never-code.md` (amending ADR-0030 (d), (h) and the discovery-prototype line) with `Amended by` backlinks on ADR-0030 and the brief's Grounding line; the build touches neither. `docs/canonical/build-integrity.md` § Behaviour lane is rewritten by the Canonical Delta. `[no-ac: records written at plan; citations-check is the oracle]` | The brief says the plan mints the ADR; ADR-0034 is the format. |
| D9 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: bump — plugin-bump.js --check is the oracle]` | Version discipline. |
| D10 | **A printed paste is a call** (build-time user ruling, 2026-10-07). `tests/consistency/entrypoints.test.js`'s forward-invocation check accepts, for a script entry point, the `spec-paths <key>` literal a `.md` entry point already needs, alongside the quoted-basename spawn shape; `spec/entrypoints.json`'s `prototype-driver.js` row declares `spec-build-driver.js` and `spec-status.js`, whose remedy and anomaly text print the `spec-paths prototype-driver` paste. `[no-ac: guard harness — entrypoints.test.js's live-repo pin is the oracle]` | D7's locked paste lives in a script; the reverse half demanded the declaration and the forward half refused it. The user chose teaching the check over rewording the paste. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/plan.md | MODIFY | doctrine | D1 — § Input sentence; § Entry behaviour-contract bullet; condensed within budget |
| spec/templates/spec.md | MODIFY | doctrine | D2 — `# prototype:` comment line replaces `# lane:` |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D3 — admission refusal deleted; HARDEN_MERGE/CAPTURE and their marks deleted; `REPLAY`, `replayed`, `looked`, `replay-port.json`, `replay-state.json`, look-stop print; `replay` on the row; header states/marks/exit codes rewritten |
| spec/scripts/proto-capture.js | DELETE | scripts | D3(g) — the structural capture |
| spec/templates/proto-capture-page.js | DELETE | doctrine | D3(g) — the browser-side walk |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | D4 — § Prototype specs replaces § Behaviour lane |
| spec/commands/run.md | MODIFY | doctrine | D4 — the proto-branch refusal sentence deleted |
| spec/doctrine/core.md | MODIFY | doctrine | D4 — § Pipeline Entry lanes paragraph, same line count |
| spec/agents/reviewer.md | MODIFY | doctrine | D4 — the `prototype-line` check in § Checks on every repo |
| spec/scripts/review-legs.js | MODIFY | scripts | D5 — the `contract` leg |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D6 — `finishMerge`: harden block and `stemForHarden` deleted; last-citer close |
| spec/scripts/spec-status.js | MODIFY | scripts | D7 — `prototype-open` anomaly |
| spec/entrypoints.json | MODIFY | other | D3(g) — `proto-capture.js` row deleted; D10 — `prototype-driver.js` row declares `spec-build-driver.js` and `spec-status.js` |
| spec/.claude-plugin/plugin.json | MODIFY | other | D9 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/build/build-driver-replay.test.js | CREATE | tests | AC-20261007-03-1, AC-20261007-03-2, AC-20261007-03-3, AC-20261007-03-4, AC-20261007-03-5 |
| tests/build/build-driver-lane.test.js | DELETE | tests | its subjects (admission refusal, harden merge, capture gate) are retired |
| tests/build/build-driver.fixtures.js | MODIFY | tests | `makeHost` option `lane` becomes `prototype: <stem>`: writes `design/prototypes/<stem>/{contract.json,captures/*.png,tests/<file>}`, a `prototype` block with `e2eRun` = a stub whose exit is scripted by `E2E_RED`, `runtime.bootCommand`; the capture stub and `PROTO_CAPTURE_*` removed |
| tests/review/contract-leg.test.js | CREATE | tests | AC-20261007-03-6 |
| tests/review/prototype-close.test.js | CREATE | tests | AC-20261007-03-7 (harness recipe from the deleted harden-branch-cleanup test) |
| tests/review/harden-branch-cleanup.test.js | DELETE | tests | its subject (harden deletion at merge) is retired |
| tests/spec-status.test.js | MODIFY | tests | AC-20261007-03-8 |
| tests/consistency/entrypoints.test.js | MODIFY | tests | D10 — forward check accepts a `spec-paths <key>` paste in a script entry point |
| tests/prototype/capture-page.test.js | DELETE | tests | subject deleted (D3g) |
| tests/prototype/proto-capture.test.js | DELETE | tests | subject deleted (D3g) |
| tests/prototype/capture-sign-in.test.js | DELETE | tests | subject deleted (D3g) |
| tests/prototype/capture-port.test.js | DELETE | tests | subject deleted (D3g) |

Note (outside the table): the done specs whose criteria lose their last citing test get
`[retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]` on
each pointer line in the same batch (derive the set as the AC-IDs cited under `tests/` at the
base minus those cited after; at lock the known set is `AC-20260928-02-1`, `-2`, `-3`,
`AC-20260928-03-1` … `-6`, `AC-20261001-01-1` … `-6`, `-19`, `AC-20261005-03-17`, `-18`,
`AC-20261005-05-10` — the last one a CONTINUE-TO pin, so `ac-drift-clean` reddens without the
tag). `read-load.test.js` and `run-ledger`'s stage-doc pins are not edited; `entrypoints.test.js`
is edited only per D10.

## Contracts

The core § Pipeline Entry lanes paragraph (D4), eight lines replacing the current eight:

```
Changes travel one of three lanes, chosen by the shape of the ask. **Direct**: a one-sentence
change with no behaviour or data change (copy, spacing, a token value, a component variant) is
made on main through the host's `gateCommand` — no spec, no branch; the commit-time escape offer
still runs. **Behaviour**: running `/spec:prototype` is choosing this lane (a brief's `Lane:` is
advisory); the prototype's contract lands through a spec, its code never. **Structural**: a
schema or API change is planned first — a spec. At commit time a spec branch lands only through
the review stage's merge-back, a direct change has no branch, and a `proto/*` branch has a branch
and never lands — that is how the three are told apart.
```

The `REPLAY` look stop (D3d), rendered after a green replay:

```
[spec-build-driver] state: REPLAY  spec: specs/20261008/01-women-save.md
## Step: the production screens beside the prototype's pictures
Read only: design/prototypes/28-functional-prototype/contract.json, specs/20261008/01-women-save.md.build/replay-state.json
✅ contract tests green against the production build — 2 tests (specs/20261008/01-women-save.md.build/replay-1.log)
🎨 production screens beside the prototype captures — http://127.0.0.1:4731
route /women (default): http://127.0.0.1:4731/women · design/prototypes/28-functional-prototype/captures/women--default.png
route /women (empty): http://127.0.0.1:4731/women?proto=empty · design/prototypes/28-functional-prototype/captures/women--empty.png
route /women/new (default): http://127.0.0.1:4731/women/new · design/prototypes/28-functional-prototype/captures/women_new--default.png
route /women/new (error): http://127.0.0.1:4731/women/new?proto=error · design/prototypes/28-functional-prototype/captures/women_new--error.png
Reply `close enough` to continue; anything else is a fix for this session, then:
  node <driver> <spec> --mark replayed
Then (only on the literal close enough):
  node <driver> <spec> --mark looked
```

`<spec>.build/replay-state.json` (D3d): `{ "tests": 2, "passed": true, "looked": false, "log": "specs/20261008/01-women-save.md.build/replay-1.log" }`.

Build row addition (D3f): `"replay": { "tests": 2, "passed": true, "looked": true }`.

The `contract` manifest row (D5): `{"leg":"contract","exit":0,"observed":{"tests":2,"passed":true},"scope":"full"}`; without a passed-and-looked build row: `{"leg":"contract","exit":1,"observed":{"unavailable":"no-replay"},"scope":"full"}`.

A pin AC as plan writes it (D1), on the host:

```
- **AC-20261008-01-1** `[oracle: contract]`: WHEN pin p1 ("保存すると行が緑になる", /women / default) is exercised against the production build THE SYSTEM SHALL pass its contract test → writes e2e/proto-28-functional-prototype.spec.ts
```

The status anomaly (D7), `--json`: `{ "kind": "prototype-open", "detail": "prototype 28-functional-prototype: every citing spec is done; its worktree, proto/28-functional-prototype and database are still there", "audience": "hygiene", "paste": "node \"$(spec-paths prototype-driver)\" 28-functional-prototype --root . --mark closed" }`.

## Behavior

`/spec:plan design/prototypes/<stem>/contract.json` reads the contract, looks at the pictures,
and writes specs stamped `prototype: <stem>` from the production tree. `/spec:run <spec>` opens
the worktree as today; the build runs TESTS through GATE unchanged (the contract's test file is
not a `tests` row, so red-check never runs it). After a green gate the session boots the app and
marks `replayed`; the driver copies the contract's test into the tree and runs the host's `e2eRun`
against the production build. Red stops the build with the log; green prints the look stop with
every route's production address beside its prototype picture, and the turn ends. On
`close enough` the session marks `looked` and the build commits as today, its row carrying
`replay`. Review runs unchanged plus the `contract` leg read off the build row, so a pin AC is
covered only by an executed, looked-at replay; the reviewer greps the diff for prototype lines.
At the review close, when this spec was the last one citing the stem, the review driver runs the
prototype's own `--mark closed`; a refusal (a dirty worktree) prints the paste, which
`/spec:status` keeps printing as a hygiene item until the worktree is gone.

The `close enough` reply is the one control: success sentence = `(REPLAY → COMMIT)`; path back =
any other reply is a fix for this session, then `--mark replayed` again, and a build can be
stopped with `incident` at any state; farthest artifact = the build commit on the spec branch,
which review and merge-back still gate. It is rendered by `spec-build-driver.js` and typed into
the terminal.

## Acceptance Criteria

- **AC-20261007-03-1**: WHEN the build driver runs on a hardened spec with `brief: 28` while branch `proto/28-functional-prototype` exists THE SYSTEM SHALL admit it (exit 0, prints `state: TESTS`) with no stderr line containing `is still open for brief`; WHEN a spec carries `lane: behaviour` and no `prototype:` THE SYSTEM SHALL print `state: TESTS` first, and `--mark harden-merged` SHALL exit 2 containing `is unknown` → writes tests/build/build-driver-replay.test.js
- **AC-20261007-03-2**: WHEN a `prototype: 28-functional-prototype` spec reaches a green gate on the fixture host THE SYSTEM SHALL print `state: REPLAY`, `Read only:` naming `design/prototypes/28-functional-prototype/contract.json`, a `Session:` line containing the host's `runtime.bootCommand` and `PORT=`, and `--mark replayed`; WHEN the fixture's `prototype.url` carries `{port}` THE SYSTEM SHALL write `<spec>.build/replay-port.json` as `{ "port": <n> }` and print the same `<n>` on a second bare run → writes tests/build/build-driver-replay.test.js
- **AC-20261007-03-3**: WHEN `--mark replayed` runs with the e2eRun stub green THE SYSTEM SHALL exit 0, write `e2e/proto-28-functional-prototype.spec.ts` in the repo root byte-equal to `design/prototypes/28-functional-prototype/tests/proto-28-functional-prototype.spec.ts`, have run the stub with `{file}` = `e2e/proto-28-functional-prototype.spec.ts` and `PROTO_URL` = `http://127.0.0.1:<port>` (the fixture's `e2e-env.txt`), write `replay-state.json` = `{ tests: 2, passed: true, looked: false, log: "<spec>.build/replay-1.log" }`, print `✅ contract tests green against the production build — 2 tests`, `🎨 production screens beside the prototype captures — http://127.0.0.1:<port>`, four `route ` lines of which the second is `route /women (empty): http://127.0.0.1:<port>/women?proto=empty · design/prototypes/28-functional-prototype/captures/women--empty.png`, the `close enough` reply line and `--mark looked`, and a bare run SHALL still print `state: REPLAY`; WHEN `--mark looked` then runs THE SYSTEM SHALL print `(REPLAY → COMMIT)` and the next bare run SHALL print `state: COMMIT` → writes tests/build/build-driver-replay.test.js
- **AC-20261007-03-4**: WHEN `--mark replayed` runs with `E2E_RED=1` THE SYSTEM SHALL exit 2 with stderr containing `contract tests red against the production build (e2eRun exited 1)` and `replay-1.log`, write that log, write no `replay-state.json`, and leave the state `REPLAY`; WHEN `--mark looked` runs before any green replay THE SYSTEM SHALL exit 2 containing `replay has not passed`; WHEN `contract.json.tests` is `null` THE SYSTEM SHALL exit 2 naming `contract.json` and `--mark tests-derived`; WHEN `prototype.e2eRun` is undeclared THE SYSTEM SHALL exit 2 naming `prototype.e2eRun` → writes tests/build/build-driver-replay.test.js
- **AC-20261007-03-5**: WHEN a `prototype:` build reaches `--mark committed` after AC-3's `looked` THE SYSTEM SHALL append a build row carrying `replay: { tests: 2, passed: true, looked: true }` and no `capture` key; a build of a spec without `prototype:` SHALL append a row with no `replay` key → writes tests/build/build-driver-replay.test.js
- **AC-20261007-03-6**: WHEN `review-legs.js` runs for a spec whose frontmatter carries `prototype: 28-functional-prototype` and the root's `.claude/spec-runs.jsonl` holds a `stage: "build"` row for that spec with `replay: { tests: 2, passed: true, looked: true }` THE SYSTEM SHALL append the manifest row `{"leg":"contract","exit":0,"observed":{"tests":2,"passed":true},"scope":"full"}`; WHEN the only build row for that spec has `replay.looked: false`, or no build row names it, THE SYSTEM SHALL append `{"leg":"contract","exit":1,"observed":{"unavailable":"no-replay"},"scope":"full"}`; WHEN the spec has no `prototype:` THE SYSTEM SHALL append no `contract` row; `ac-matrix.js --spec <that spec> --root . --manifest <that manifest>` over a spec whose one AC is tagged with the `contract` oracle SHALL report `oracle=1` on the green manifest and an `oracle-red-or-absent` hard finding on the red one → writes tests/review/contract-leg.test.js
- **AC-20261007-03-7**: WHEN the review driver's merge concludes for a `prototype: 28-functional-prototype` spec that is the only spec citing the stem, with `design/prototypes/28-functional-prototype/status.json` carrying `marks.testsDerived` and the prototype worktree and branch present THE SYSTEM SHALL have run the prototype driver's `--mark closed` (the fixture's `db-dropped` marker exists, `git branch --list 'proto/*'` is empty, `status.json.marks.closed` is set) and print `prototype 28-functional-prototype closed`; WHEN a second spec citing the stem is `hardened` THE SYSTEM SHALL delete nothing and print `prototype 28-functional-prototype stays open — 1 citing spec(s) not done`; WHEN the prototype worktree is dirty THE SYSTEM SHALL print `⚠️ prototype 28-functional-prototype still open:` and a line containing `--mark closed`, and leave the branch; WHEN the spec has no `prototype:` THE SYSTEM SHALL leave an unrelated `harden/x` branch and an unrelated open prototype in place and print neither line → writes tests/review/prototype-close.test.js
- **AC-20261007-03-8**: WHEN `spec-status.js --root . --json` runs on a tree holding `design/prototypes/28-functional-prototype/status.json` with `marks.testsDerived` set and `marks.closed` unset, and two specs stamped `prototype: 28-functional-prototype` both `done` THE SYSTEM SHALL list one anomaly `{ kind: "prototype-open", audience: "hygiene", paste: "node \"$(spec-paths prototype-driver)\" 28-functional-prototype --root . --mark closed" }` whose `detail` contains `every citing spec is done`; WHEN one of the two is `implementing` THE SYSTEM SHALL list no `prototype-open` anomaly; WHEN `marks.closed` is set, or no spec cites the stem, THE SYSTEM SHALL list none; the `next` array's entries SHALL carry the same keys as before and no `prototype-open` action → writes tests/spec-status.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-10-07, scratch spec with `prototype:` frontmatter, one AC tagged with the `contract` oracle ending `→ writes e2e/proto-collector-flow.spec.ts` on an `other`-layer row): `ac-matrix.js --lint --resolve-root .` prints `0 finding(s)` and `promise-sweep.js` prints `orphans=0`; `lib/frontmatter.js`'s `fmMap` returns the `prototype` key alongside the known ones. — **if false:** the AC grammar in D1 is amended to whatever the lint accepts; the oracle name is the contract.
- A2 (executed 2026-10-07): `verdict.js --manifest <m> --via loop --model x --checkpoint empty` over a manifest holding the ten review legs green plus `{"leg":"contract","exit":0|1,…}` prints `all legs green — the panel must run` in both cases and never `manifest invalid` — an extra leg row is tolerated and is not blocking by itself; `ac-matrix.js` reads oracle standing by leg name from the manifest (`manifestRows.get(b.oracle)`), so a red or absent `contract` row is `oracle-red-or-absent`, hard. — **if false:** `verdict.js`'s `REVIEW_LEGS` gains `contract` (a critical row added at build, recorded as a deviation; never a second leg set).
- A3 (lock reading, 2026-10-07): `spec-review-driver.js` records `marks.via = 'loop'` unconditionally and never reads `--via` from argv, so "only under `--via loop`" (the brief's default) is every run; `finishMerge` runs from the main root after `merge-back.sh cleanup`, so spawning the prototype driver with `--root <main root>` is a plain child process and `merge-back.sh` is untouched. — **if false:** STOP — `merge-back.sh` is critical tier and would need its own row.
- A4 (executed 2026-10-07): `spec-status.js` reads frontmatter through `fmMap` (unknown keys kept) and its anomalies carry `kind`, `detail`, `audience` and an optional `paste`; the three action strings and the `next` entry keys are pinned by `tests/spec-status.test.js:436` and stay byte-identical. — **if false:** the anomaly is still the shape; never a fourth action string.
- A5: `plan.md` fits its budget after spec 02's deletion (two sentences) and D1's additions (one clause plus a bullet of at most five lines) once the Entry bullets this edit touches are condensed; `run.md` loses one sentence; `core.md`'s paragraph keeps its line count, so no `shared-for` consumer's read-load moves. — **if false:** condense further within the same edit; never raise a budget or drop a `shared-for` section.
- A6: `tests/build/build-driver.fixtures.js`'s `makeHost` can carry a `prototype` option in place of `lane` without touching the default-lane pins in `tests/build/*.test.js` (the new state derives only for a `prototype:` spec). — **if false:** the hit is a fix row here, never a weakened pin.
- A7: the done specs whose criteria lose their last citing test are the set the File Plan note lists (a lock-time grep, priced as a prediction). — **if false:** tag the extra hit `[retired: …]` in the same batch; never invent a covering test.
- A8: a host's `gateCommand` does not run the contract's test file (the file is an `other`-layer row and lives at the host's `e2eFile` path, outside `{testDirs}`); salon-os runs Playwright only through `release.e2eCommand`. — **if false:** the host's gate reds on a file its unit runner cannot execute — a host config fix (exclude the e2e directory from the gate), never a plugin fallback.

## Rationale

The build lane shrinks from two inserted states to one because two of its three jobs are gone:
there is no harden branch to merge (nothing leaves the prototype) and no structural capture to
diff (design is judged by eye). What remains is the one executable fact the contract carries —
the tests JJ's pins became — run against the production build, plus a look stop that puts the
production address next to each picture and waits for the literal `close enough`, mirroring
`approve` and `accept` at the other stops. The contract's test file is an `other`-layer row copied
by the driver, never a `tests` row: red-check and a `{testDirs}` gate would otherwise run a
Playwright file under the host's unit runner, and a worker would otherwise be asked to "author" a
file that already exists. Its criteria are covered through an oracle leg rather than AC ids
written into the file, because the file is the contract's own and the pins' names are its titles.
The `contract` leg reads the build row rather than re-running the app: the row is executed
evidence recorded in the reviewed tree, and a review-time boot would need a second runtime
contract for the same observation. `verdict.js` is deliberately untouched — the spike showed an
extra leg row is tolerated, and the hard finding already comes from `ac-matrix`'s oracle
standing; a `--require` would make every non-prototype review fail on a leg it never emits. The
close moves to the review driver's `finishMerge` because `--via` is always `loop` (so the brief's
"only under the loop" default is every run), and status keeps the paste because a refused close
(a dirty worktree) must stay visible until someone acts. The admission refusal is deleted
outright: the worktree now lives through the build by design. The reviewer's `prototype-line`
check is prose because a reviewer runs git; a deterministic leg for it is a guard with zero
recurrences (core § Incident Policy) — reopen when a prototype line reaches a CLEAN diff. This
spec is critical because `spec-status.js` and `review-legs.js` are both named in the host's
§ Risk Tiers; both edits are additive (one anomaly kind, one leg row for one spec shape) and
every pinned output of theirs is asserted unchanged by the existing suites. No `SHALL CONTINUE
TO` pin: the default lane's behaviour is unchanged and already pinned by the build and review
suites, and spec 20261005/05's CONTINUE-TO pin on the harden-delivered test is retired with its
subject.

Collision closure (2026-10-07, literals `HARDEN_MERGE`, `lane: behaviour`, `proto-capture`, `capture-accepted`, `is still open for brief`, `harden/`): every hit outside the File Plan is a prose mention in `docs/adr`, `docs/roadmap`, `docs/canonical` (rewritten by the Canonical Delta), a changelog, or a file spec 01 deletes before this spec builds (`lib/freeze.js`, `prototype-spec.md`, `freeze*.test.js`) — waived; the `executes` hits on `review-legs.js`, `spec-build-driver.js`, `spec-review-driver.js` and `spec-status.js` are the existing suites, whose pinned outputs this spec's additive edits leave byte-identical (A4, A6).

## Canonical Delta

`docs/canonical/build-integrity.md` § Behaviour lane is replaced by **Prototype specs**: a spec
stamped `prototype: <stem>` (written by `/spec:plan` from a behaviour contract) builds as any
other until a green gate, then `REPLAY`: the driver copies `design/prototypes/<stem>/tests/<file>`
to the host's `e2eFile` path, runs the host's `e2eRun` against the booted production build
(`PROTO_URL` = the app address, one port per build in `<spec>.build/replay-port.json`), stops on
red with the log, and on green prints the production address beside each prototype picture
until the user's literal `close enough` (`--mark looked`); the build row records
`replay: { tests, passed, looked }`; review's `contract` leg reads that row and the pin criteria
name it as their oracle; the reviewer treats a prototype line in the diff as hard; when the
closing spec is the last one citing the stem, the review driver runs the prototype's
`--mark closed`, and `/spec:status` prints that paste as a hygiene item while the worktree
remains. No spec is refused for an open `proto/` branch; `/git:merge` refuses `proto/*`.
`docs/canonical/review.md`'s leg list gains `contract` (prototype specs only, read from the build
row, never blocking by itself — a red or absent one is a hard finding through the oracle rule).
