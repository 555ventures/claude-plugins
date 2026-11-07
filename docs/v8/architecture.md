# spec v8 — architecture (contract between builder agents)

Read `design.md` first. This file fixes module boundaries, file formats and shared APIs so
that parallel builders produce one coherent plugin. If something here is wrong, fix it here
first, then build.

## 0. Rules for every builder

- Node ≥ 22, CommonJS, built-ins only. No npm dependencies.
- Every script: `node spec/scripts/<name>.js <subcommand|flags>`; exit 0 ok, 1 error,
  2 refusal (stderr names the remedy). `--root <dir>` on every driver; `--json` where output
  is consumed by code.
- One module owns each on-disk file (see §2). Nobody else parses it.
- Size caps count bytes (ADR-0047): driver ≤ 40,000, lib file ≤ 16,000, `spec/scripts/` total
  ≤ 400,000, command md ≤ 6,000, agent md ≤ 4,000, doctrine ≤ 8,000 (`tests/size.json`). A new
  or changed line in `spec/scripts/**/*.js` is at most 120 characters; a long line the file held
  at the merge-base with main is wrapped when its code is touched. `npm test` runs
  `tests/size-check.js` first. A file or total past its cap is green only on a `tests/size.json`
  `over` entry (`bytes` at or above its size, `by` a non-draft spec's Decision row that names
  the path). A builder past a cap stops and says so: the raise is a Decision the planner writes
  and the user locks. Never join lines or cut tests to fit. A test file over 500 lines prints a
  warning (split it by behaviour) and is never a reason to delete a test; a test may not read
  more command, agent, doctrine or design prose than it did at the merge-base.
- Tests: `tests/<name>.test.js` with `node:test`, behavioural only (run the script on a tmp
  tree, assert exit code / files / JSON). Never assert on prose wording. Use
  `tests/helpers.js` (`tmpdir`, `gitRepo`, `runNode`, `runBash`, `freePort`).
- Don't add flags, modes, policies or fallbacks that no listed step needs.
- Prose shipped to hosts (commands, doctrine, agents, templates) is written in plain English
  for a model that already knows how to code. State intent and the hard rules; do not
  enumerate behaviour.

## 1. Layout

```
spec/
  .claude-plugin/plugin.json      name, version 8.0.0, description (one sentence)
  commands/*.md                   one per command, ≤ 60 lines
  doctrine.md                     the one page every command loads
  agents/builder.md               sonnet, effort high
  agents/reviewer.md              opus, effort low (fable when architecture: true)
  templates/spec.md, roadmap-brief.md, roadmap-overview.md, adr.md
  hooks/hooks.json
  scripts/
    lib/state.js  lib/driver.js  lib/host.js  lib/git.js  lib/report.js  lib/pending.js  lib/work.js  lib/next.js  lib/queue.js  lib/queue-rows.js  lib/criteria.js
    run.js fanout.js queue.js status.js plan.js init.js doctor.js migrate.js
    genesis.js mocks.js prototype.js connect.js release.js red-check.js
    state-gate.sh block-worker-git.sh block-cross-worktree-writes.sh merge-back.sh
tests/helpers.js, tests/*.test.js
```

## 2. Files on disk and their single owner (`lib/state.js`)

All paths relative to host root unless noted. `state.js` exports one `read*`/`write*` pair
per file; writes are atomic (tmp + rename).

| File | API | Notes |
|---|---|---|
| `.claude/spec.config.json` | `readConfig(root)` | Keys in §3. Missing file → `{}` with defaults applied. |
| `specs/YYYYMMDD/NN-slug.md` | `readSpec(path)` → `{frontmatter, body, title, sections, intent, filePlan, acs, markers}`; `writeStatus(path, status)` | Frontmatter parse is the only markdown parse in the plugin. |
| `<spec>.run/state.json` | `readRun(spec)`, `writeRun(spec, state)`, `clearRun(spec)` | `<spec>` = spec path minus `.md`. One sidecar per in-flight spec. Gitignored (`specs/**/*.run/`). Shape in §4. |
| `<git-common-dir>/spec-queue.json` | `lib/queue.js`: `read(root)`, `write(root, q)`, `add`, `tick`, `reconcile`, `paste` — the only owner; `state.js` holds no queue code | `{version: 3, seq, items[]}`; item `{id, kind: spec|brief|prompt, payload, added, done?, type?, spec?, after?}` (`type` plan\|prototype\|fix\|decide, prompt only, the only carrier of the command; `spec?` only on `type: fix`, the bound spec; `payload` bare text; `after` `{brief: "NN"}` or `{spec: "specs/…md"}`). Strict read: another version is refused, naming `/spec:migrate`. |
| `<git-common-dir>/spec-fanout.json` | `readFanout`, `writeFanout` | `{step, batch: [{spec, worktree, branch, status, question?}], started}` |
| `<git-common-dir>/spec-release.json` | `readRelease`, `writeRelease` (`null` clears) | `{sha, note}`: the green staging run `/spec:release` promotes from. `release.js` is its only caller; every staging run clears it first, `--promote` needs `sha` = HEAD and clears it before it runs. |
| `.claude/pending-question.json` | in `lib/pending.js` | Lane question relay. Doc `{lane, question, options: [{label, description?}], writtenAt, answer: {label, by, at} \| null}`. |
| `<git-dir>/spec-lane-open` | `isLane`, `markLane`, `unmarkLane` in `lib/pending.js` | Lane marker (private git dir of the lane worktree); read by `block-worker-git.sh`. |
| `design/prototypes/<stem>/{status,pins,contract}.json` | `readProto`, `writeProto` | Owner: prototype.js via state.js. |
| `design/mocks/{status.json,seed.md}` | `readMocks`, `writeMocks` | |
| `.claude/genesis/status.json` | `readGenesis`, `writeGenesis` | |

`spec.config.json` keeps the v7 path so migration is a key trim, not a move.

## 3. Config keys (all optional except `testCommand`)

```json
{
  "testCommand": "npm test",              // whole suite; the gate
  "testCountPattern": "",                 // optional, one capture group: a gate that exits 0 counting 0 or nothing is red
  "testFileCommand": "npx vitest {file}", // optional: single-file run used by red-check
  "testGlobs": ["tests/**"],              // optional: a file matching one is a test file (lib/criteria.js, red-check)
  "setupCommand": "npm ci",               // run once in a fresh worktree
  "trunk": "main",
  "lanes": 4,                             // fanout parallelism
  "gateConcurrency": 2,                   // gates running at once on the host (min 1), all worktrees
  "seats": { "builder": {"model":"sonnet","effort":"high"},
             "reviewer": {"model":"opus","effort":"low"},
             "orchestrator": {"model":"opus","effort":"medium"} },
  "worktreePerSpec": true,
  "mergeStrategy": "merge-commit",        // or ff-only | squash
  "walkthrough": { "baseUrl": "", "project": "", "tokenEnv": "WALKTHROUGH_TOKEN" },
  "prototype": { "url": "http://localhost:{port}" },   // bootCommand has no default: the plugin assumes no language
  "release": { "deployCommand": "", "stagingUrl": "", "e2eCommand": "", "promoteCommand": "",
               "productionUrl": "",      // --promote needs it: production must answer after the promote
               "healthPath": "",         // appended to stagingUrl and productionUrl for the ready check
               "testCountPattern": "",   // optional, one capture group; set: an e2e that counts 0 or matches nothing stops
               "migrationsCheck": "" }   // optional command run after ready; `none` or absent: nothing runs
}
```

## 4. Run state (`<spec>.run/state.json`) and the run driver

```json
{ "step": "BUILD", "spec": "specs/20261104/01-x.md", "worktree": ".claude/worktrees/spec-01-x",
  "branch": "spec/01-x", "base": "<sha>", "attempts": {"repair": 0, "fix": 0},
  "gate": {"status": "red", "runId": "...", "output_tail": "..."},
  "review": {"findings": [], "verdict": "clean|fix|decision|stopped"}, "decided": [], "history": [...] }
```

`run.js` steps: twelve, in order. The session does only the printed step, replies with the printed
`--mark`, re-runs the driver. Each accepted mark prints
`✅ checkpoint — <prev> → <next>; safe to /clear and re-run /spec:run <spec>`. A fix (`--fix`) is the
same machine on `lib/spec.js` `fixDoc`: no spec file, one reproduce-first criterion, no File Plan.

| Step | Driver does | Session does | `--mark` |
|---|---|---|---|
| OPEN | admits only `hardened` or `implementing`; creates worktree+branch from trunk (off trunk only `--in-place` builds, in that checkout); a fresh worktree gets the `.worktreeinclude` matches (`lib/host.js` `copyIncluded`) and runs setupCommand (a failure removes the worktree it made); the worktree copy of the spec says `done`, the main checkout's is not touched | nothing | (auto) |
| BUILD | prints the builder brief (`lib/briefs.js`): spec path, Intent, Decisions, the run's rulings, File Plan, criteria, Assumptions, test command | dispatches ONE `builder` (seat from config; Opus from attempt 2) | `built` |
| GATE | intent-to-add for planned files (ADR-0015); `testCommand` in the worktree (green-run cache by tree, at most `gateConcurrency` at once, a red outside the diff re-run once); a build that changed nothing or a File Plan row not true on disk is red; a `prototype:` spec's pin tests run here against the app the driver boots (ADR-0043 amended); red-check once per tree; spec text the build edited is reverted and gated again (📌); after a green `testCommand`, the criteria check (`lib/criteria.js`, ADR-0048) reads the AC-IDs test files cite (a test-shaped basename or a `testGlobs` match) at the base and on disk: a criterion a spec defines that the base cites and nothing cites now is red, and so is a criterion of the spec being built with no citing test where the base cites any (a 📌 note where it cites none); the spec's `## Retired criteria`, as locked at the base, clears either; the red tail names each ID and its exits (restore a test, or mark `unmet`; a fix: `needs-plan`) | nothing | (auto) → REVIEW or REPAIR |
| REPAIR | prints the failure tail; past cap 2 the run is STOPPED with a fix item queued (📌) | dispatches builder | `repaired`; `regate` (same tree, once) |
| REVIEW | prints the reviewer brief; seat = reviewer, or Fable when `architecture: true` | dispatches ONE `reviewer` | `reviewed --file <json>` |
| FIX | `blocking` findings; past cap 1 STOPPED with a fix item queued (📌) | dispatches builder | `fixed` |
| ESCALATE | one of three questions, in the agent's own words: `assumption` (an `ask` arm proved false), `decision` (a `needs-decision` finding), `unmet` (a Decision the build cannot keep); a lane writes it to `pending-question.json` | asks the user | `escalate <label>` / `dismissed` |
| LOOK | prototype specs only: the boot line, `👀 look — <publicUrl or url>`, the look pins and pictures | prints them, ends the turn | `looked` / `look-failed --why <reply>` |
| COMMIT | one build commit in the worktree; its message carries the rulings, the `as-built.md` lines and `evidence.md`; a secret-looking file stays out (📌); advisories become one `type: fix` item bound to the spec (📌); in place a spec commits only its File Plan, a fix only what it touched; a lane ends DONE here | nothing | (auto) |
| MERGE | `lib/land.js`: status done + commit, `rebaseOnto` trunk, gate the worktree, `mergeBack` per `mergeStrategy` (`reset --merge` on any failure), worktree removed, queue ticked; a conflict leaves the rebase in the worktree and the rebase guard prints it; a red rebased tree goes back to GATE | resolves a conflict in the worktree | (auto) |
| DONE | prints the report: 📌 `Users will notice:` and every decided line | nothing | — |
| STOPPED `{why}` | a rule's ending: a cap, `amend` (spec to draft), a dismissed question (a `decide` item), `needs-plan` (a fix; a plan item), `after` (waits for another spec, goes on by itself once trunk has it done) | nothing | — |

A lane (sub-agent run under fanout) never asks: it writes `pending-question.json`, prints
`PENDING_QUESTION`, exits 0. The driver never writes the spec beyond its status line.

Builder agent brief must include the Intent block verbatim and the line
"Do not touch files outside the File Plan without listing them in your final summary."

## 5. Fanout (`fanout.js`)

PLAN → DISPATCH → WAIT → RELAY → MERGE → REPORT; the turn ends there and the next bare run plans
again. One lane shape: `{spec | symptom, worktree, prompt}`. PLAN, bare (AUTO): the first `lanes` (default 4)
runnable specs, queued or not, in the order `lib/next.js` derives (ADR-0044) — runnable = `hardened`, not in a
lane, its lane did not stop by a rule, every `depends_on` entry done on trunk, no unmet queue `after` gate, and not
serial with the derivation's top pick (a shared brief waits; a brief dependency waits and ends the batch) — then
every open `type: fix` item as a lane (`fix-<stem>` bound, `fix-<slug>` spec-less). PLAN prints the 📌 batch line,
the waiting reasons and the queue rows (`lib/queue-rows.js` `list`). `--pick` asks checkboxes, `picked --label`.
DISPATCH makes or attaches each worktree, marks it a lane and prints one Agent call per lane (`/spec:run <spec>
--root <wt>`, a fix lane `/spec:fix --root <wt> …`). WAIT: `returned` reads the lane's run state — DONE lands at
once through `lib/land.js` (the solo path: rebase, gate and merge in the worktree); a conflict sends it back
(`sent-back`, the rebase left for its own run; a second one on the same trunk stops it); a red rebased tree sends
it back to its own GATE; STOPPED `after` holds it on its queue item (`Q.hold`) for a later PLAN on its kept
worktree; any other STOPPED ends it. RELAY: the three question kinds, verbatim; `answered --lane --label`, or
`dismissed --lane` (the lane's own run parks with a `decide` item; no label is recorded). REPORT: what merged (a lane's reruns and slot
waits, summed in one `load:` line), each answered question's text, every lane's 📌 decided lines, and each lane
that stopped, was held or was dismissed (a dismissed spec lane says what trunk holds).

## 6. Plan (`plan.js` + `templates/spec.md`)

`/spec:plan` is driven by the session (Fable). The script only: numbers the spec
(`specs/YYYYMMDD/NN-slug.md`), validates the template sections exist, counts
`[NEEDS CLARIFICATION:` markers, refuses a File Plan that lists another spec file (a build may never edit
one, see `specEdits`), refuses an optional `## Retired criteria` line that is neither
`- AC-… — retired by Dn: …` (Dn a row of its Decisions) nor `- AC-… — checked at review: …` (an AC of this
spec), and locks (`status: hardened`) when clean. That section, after the Acceptance Criteria, is the only way
a build may leave a criterion with no citing test (GATE, §4); both briefs print it. The template
adds one block at the top of the body:

```
## Intent
- You asked: <one sentence in the user's words>
- I will build: <3–6 bullets>
- I will not touch: <bullets>
- Users will notice: <what changes for the people who use it>
- You lose: <what goes away, or nothing>
- Architecture or behaviour change: no | yes — <what>, needs your yes
```

Frontmatter stays v7-compatible: `date, status (draft|hardened|implementing|done),
area, depends_on, brief, architecture: true|false`. Sections kept: Intent, Goal, Decisions,
File Plan, Acceptance Criteria (`AC-YYYYMMDD-NN-k`, WHEN/SHALL), Retired criteria (optional), Assumptions. Dropped:
tier, Users, Contracts, UI, Data Model, Rationale, Canonical Delta, oracle/pre-green tags.

## 7. Hooks (`hooks/hooks.json`)

| Event | Script | Rule |
|---|---|---|
| UserPromptSubmit | `state-gate.sh` | `/spec:run <spec>` on a `draft` spec or one with `[NEEDS CLARIFICATION:` markers → exit 2 with the remedy. |
| PreToolUse Bash | `block-worker-git.sh` | inside a lane worktree, builder/reviewer agents run only v7's read-only allowlist (`status diff log show rev-parse ls-files ls-tree blame grep describe cat-file name-rev shortlog rev-list merge-base show-ref diff-tree version help`), `git add` and `git rebase --continue`; every other verb exits 2. In any checkout of the repo while a lane is open, `reset checkout restore clean stash switch branch worktree` stay blocked (harmless list forms pass); a `git fetch` there is free. Marker: `<git-dir>/spec-lane-open`. |
| PreToolUse Write\|Edit | `block-cross-worktree-writes.sh` | copy-trim from v7. |

## 8. Report (`lib/report.js`)

`render({outcome: '✅ …', bullets, pins, warns, blocks, artifacts, queued, next})` prints
the v7 fixed order. `next` is a command or `nothing needs you — <reason>`. ≤ 60 LOC.

## 9. Other drivers

- `queue.js`: `next|list|groom|add|move|done|show`, the CLI over `lib/queue.js` (the queue's one owner: file, version, item shape, `parse`, `add`, `tick`, `reconcile`, `fill`, `place`, `paste`; ≤ 200 LOC; no script outside it, the CLI and `migrate.js` touches items — `tests/queue.test.js` walks `spec/scripts/`) and `lib/queue-rows.js` (≤ 250 LOC, writes nothing: the `list`, `show` and `groom` renders, the type table and the in-progress rule). The queue a reader sees is the file plus the fill, worked out on every read and never stored (ADR-0044). Unknown flags are refused on every subcommand. `next` prints a prompt's paste line, else `lib/next.js`'s `topLines` (v7's `--next` render); `reconcile` ticks done specs and retires a spec item whose file is gone (main checkout only), never a brief (`done` closes one, or `lib/land.js` at its last merge with no step open): `next` skips a finished brief, `list` tags it `✔ specs done`. `list` rows are v7's columns plus a type column and a `🔨 in progress` marker, proven against `spec-v7-final` under a normaliser. `groom` is v7's read-only report (duplicates, cites done, gate met, stale), ported and proven byte-identical against `spec-v7-final`.
- `status.js` (≤ 400 LOC): the dashboard, v7's screen drawn from `lib/next.js`. Roadmap (collapsed
  ranges with phase and `n/m` bar, ✅/🔨/⬜/⛔), 🎯 Next (`qNN` prompt rows led by their type mark 🏃/📝/🧪/🔧 and ended by `🔨 in progress`, then
  `⚡ N parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):` with `🔶`
  overlap pairs, a lone pick with `🚦 solo`, or a blocked pick with `⏳ after …` branches), up to three `⚠️` decide lines (`skipped-brief`, `out-of-order`, `brief-done-queued`), footer
  (`🟢`/`🟠`/`⬜`, `· N more open`, `· N more to decide (--all)`, `· H hygiene findings (/spec:doctor)`);
  `--all` adds 🕓 after that, ⛔ blocked, all decide lines and 🧹 hygiene (the derivation's own
  anomalies: `queue-unparseable`, `queue-orphan`, `unknown-status`, `orphan-stamp`,
  `unparsed-dependency`, `unknown-dependency`, `skipped-spec`, `hand-tracked-status`); `NN` reports one
  brief's dependency readiness. `--json` is `{briefs, specs, superseded, anomalies, next}`. No ledger
  lines, no run-in-flight or fan-out footer, no `doctor.check`.
- `lib/next.js` (≤ 250 LOC): v7's derivation on v8's state, no CLI. `derive(root)` reads `lib/work.js`
  (`readSpecs`, `readBriefs`, `gateWhy`) and the queue file plus the fill (read-only view, off in a linked
  worktree; `reconcile` and `fill` applied in memory; a done row gives no position and no gate; an old-version
  file is a decide line naming `/spec:migrate`) and returns entries with blockers (`depends_on`, brief
  dependencies, `after` gates), the anomaly catalogue (`decide` or `hygiene`), `laneAdmission`
  (pairwise, no cap) and `nothingNextLine`; `topLines(d)` is the `queue next` render and entries carry `working` (the in-progress marker). Fanout keeps its own cap and admission.
- `init.js`: detect test command (package.json scripts.test, pytest, go test, cargo test),
  trunk, write config; lint and typecheck from real commands (package.json `lint`/`lint:ci` and
  `typecheck`/`type-check`, Makefile targets, pyproject, `ruff.toml`, `mypy.ini`) are chained in front of
  `testCommand` unless it already runs them, on a hand answer and on a re-run too; ask only what cannot be
  detected (one AskUserQuestion). `gate verified` only when `testCommand` exits 0. ≤ 150 LOC.
- `doctor.js`: config valid, testCommand runs green (exit 0), worktrees gitignored (a missing entry names
  `/spec:migrate` or `/spec:init`), pending sidecars listed, roadmap hygiene (the anomalies `status` counts, from
  `lib/next.js`). `.env` files lanes would not see are findings unless `.worktreeinclude` names them. One info
  line says how many test files cite an AC (the criteria check's mode, ADR-0048).
- `red-check.js`: test files ADDED since base (named `*.test.*`, `*.spec.*`, `*_test.*`, `*_spec.*` or
  `test_*`, or matching a `testGlobs` glob: `lib/criteria.js` `isTest`) must fail on base and pass on HEAD; a vacuous green is reported. It is information, never a
  block: GATE runs it once per tree after a GREEN gate when `testFileCommand` exists, and the REVIEW brief
  prints its line (`state.redCheck`); a new test that passes without the production change is a blocking
  reviewer finding unless it covers a `SHALL CONTINUE TO` criterion. ≤ 80 LOC.
- `genesis.js`: DISCOVERY → MENUS → DECIDE → SCAFFOLD → ROADMAP → HANDOFF → GROUNDED.
  Research menus = parallel Sonnet web agents (one per open dimension). DECIDE writes
  `.claude/genesis/stack-descriptor.json` + ADRs. ROADMAP writes briefs + queue entries.
  HANDOFF runs init. ≤ 400 LOC.
- `mocks.js`: SEED → SCREENS → APPROVED, walkthrough service or terminal mode. ≤ 250 LOC.
- `prototype.js`: OPEN → ROUND → APPROVED → CONTRACTED → CLOSED. OPEN makes the worktree, runs
  `setupCommand` and allocates one free app port; the session records each ruling with
  `prototype.js <stem> pin …` (`drop pN --why …` amends). `contracted --confirmed` needs the
  user's yes on the printed sentences, writes `contract.json` (every pin as a sentence), commits
  it before the mark is durable and queues `/spec:plan <contract>`. No entry file and no browser
  hook. ≤ 400 LOC.
- `connect.js`: copy-trim of v7 walkthrough-connect + client. ≤ 350 LOC total.
- `release.js`: deploy → ready (curl `stagingUrl`+`healthPath`, 3 tries) → `migrationsCheck` → e2e
  (`BASE_URL`, `STAGING_URL`, `RELEASE_NOTE`; `testCountPattern` set: a count of 0 stops) → green run
  recorded in `spec-release.json` → promote (asked; only on a record whose sha is HEAD) → production
  ready check → report. Argv is read up to `--`; the note after it is never a flag. ≤ 130 LOC.
- `migrate.js`: v7 host → v8, see `host-footprint.md`. Idempotent, prints a plan first,
  `--apply` writes. Archives v7-only files under `docs/archive/v7/`.
- `enforce`: retired; command md only. Says init writes lint/typecheck into `testCommand`.

## 10. Doctrine (`spec/doctrine.md`, ≤ 1 page)

Headings: What this plugin does · Files it reads · Lifecycle · Seats · How to drive a driver
· When to ask (irreversible, architecture: yes, lane questions) · Glossary (lane, mark, pin,
seat, checkpoint). Maintainer rules live in this repo's CLAUDE.md, not in the plugin.

## 11. Foundation APIs as built (`spec/scripts/lib/`)

Later builders: use these, do not re-derive them.

- `spec.js`: the spec grammar, text in and objects out: `parse` (what `readSpec` returns), `section`, `splitCells`,
  `planRows`, `inPlan`, `decisionRows`, `parseAssumptions`, `globToRe`, `isSpecText`, and `fixDoc(symptom, spec?)`.
- `briefs.js`: the text run.js prints — builder, reviewer, question, look and rebase briefs, the report, the commit message.
- `land.js`: `land(main, {wt, branch, spec?, id, config, message, inPlace?, tick?})` → `{landed}` | `{conflicts}` | `{red, base}`.
- `state.js`: everything in §2 (`readSpec` reads the file, `spec.js` parses it) plus `writeConfig(root, cfg)`, `DEFAULTS`, `gitCommonDir(root)`,
  `writeJson/writeText/readJson/readText` (atomic tmp+rename). `readConfig` merges defaults key by
  key, objects one level deep. `intent` = `{asked, build[], notTouch[], notice, lose, architecture: false | true |
  '<what>'}`; `filePlan` rows `{path, action (upper-case), summary}` found by header name;
  `acs` = `[{id, text}]`; `markers` = count of `[NEEDS CLARIFICATION:` in the body. The queue file is not
  here: `lib/queue.js` owns it (an absent file reads `{version: 3, seq: 0, items: []}`); `readFanout`/`readRun`/`readGenesis` → `null`.
  `readProto(root, stem)` → `{status, pins, contract}` (each `null` when absent); `writeProto` and
  `writeMocks(root, {status?, seed?})` write only the keys given.
- `lib/queue.js`: the one owner of the queue (≤ 200 LOC, no CLI): `VERSION`, `TYPES`, `CMD_TYPES`, `queuePath`, `kindOf`, `briefNo`, `parse(text, type)` (the only reader of typed text), `read` (strict: version 3 with an `items` list, or a refusal naming `/spec:migrate`), `write`, `open`, `reconcile`, `fill(root, q)` and `pending(root)` (the in-memory fill), `place(root, q, item, at)` (stores one filled item), `add(root, fields, {top})` (the door; dedupe), `tick(root, pred)`, `text`, `paste`, and the brief helpers `isSupersededBriefText`, `v7Briefs`; groom's v7 row helpers (`promptTokens` … `citesDoneSpec`) live in `lib/queue-rows.js`. `/spec:migrate` is the only converter of older files (ADR-0042).
- `lib/criteria.js`: the one owner of "what is a test file" and of the criteria tests cite (≤ 250 LOC, no CLI): `isTest(rel, cfg)`, `cited(root, ref?, cfg?)` (AC-ID → test files, at a commit or on disk), `testFiles`, `retiredLines`/`retired`/`retiredRefusal(doc)` (the `## Retired criteria` section), `check({wt, base, cfg, doc})` → `{red, warn}` (GATE, ADR-0048).
- `lib/work.js`: the one reader of specs and roadmap briefs (≤ 250 LOC, no CLI): `normBrief`, `briefOrd`, `readSpecs(root)`, `readBriefs(root, specs)` (brief status `unplanned|in-flight|done|superseded`, a brief is done when its live specs are done), `gateWhy`. `state.js` adds `liveRun`/`specState`: a run sidecar in the root or the lane worktree makes a spec `implementing`.
- `driver.js`: `makeDriver({name, specArg, load, save, derive, steps, script?})` returns
  `main(argv) → exit code` (script does `process.exitCode = main()`). `derive(state, ctx)` returns
  `{name, body?, mark?, accepts?, auto?}`: `mark` is the verb line the session replies with
  (`'reviewed --file <json>'`); its first word plus `accepts[]` are the verbs allowed at that step;
  `auto(state, ctx) → state` is a driver-only step (OPEN, GATE, COMMIT, MERGE…) run, saved and
  re-derived without the session — after a mark too, so the checkpoint names the next session step.
  `ctx = {root, arg, json, flags, script}`. Printed block: `▶ <STEP>`, body, `▶ when done: node
  <script> <arg> --root <root> --mark <mark>`. `--json` → `{step, body, mark}`. Refuse with
  `refuse(msg)` (or throw `{exit: 2, message}`); stderr is `<name>: <msg>`. Also `die`, `writeOut`.
- `host.js`: `run(cmd, {cwd, env, timeoutMs})` runs under bash, timeout → status 124, `tail` = last
  40 lines of stdout+stderr. `gate(root, config)` → `{status, cached, runId, tail}`; throws
  `{exit: 2}` without `testCommand`. Cache key = sha256(cmd, working-tree git tree sha); the tree
  comes from a HEAD-seeded scratch index with `add -A`, minus `**/*.run/**` and
  `.claude/pending-question.json`; only green runs are recorded; cache dir
  `<git-common-dir>/spec-run-cache/` is shared by every worktree, so the trunk gate after an
  unchanged merge is a hit. `detectTestCommand(root)` → `npm|pnpm|yarn test`, `bun run test`,
  `pytest`, `go test ./...`, `cargo test`, or `null`.
- `git.js`: `sh(args, cwd)` throws on non-zero. `worktreeAdd` is idempotent and attaches an
  existing branch. `worktreeRemove(root, path, {deleteBranch})`. `commitAll` → sha or `null` when
  clean. `mergeBack(root, branch, strategy, {message})` merges into the branch checked out at root →
  `{merged, sha?, reason?}`; any failure is backed out with `reset --merge`, so root is never left
  mid-merge; a root with tracked uncommitted changes or an unknown strategy throws `{exit: 2}`. `rebaseOnto(worktree, trunk)` → `{ok, conflicts[]}`; a conflict
  leaves the rebase in progress in the worktree (`rebasing(wt)` tells). `diff(base, cwd)` / `changedFiles(base, cwd)` compare the
  WORKING TREE (incl. untracked) with base via a scratch index, because REVIEW runs before COMMIT.
- `report.js`: `render(...)` per §8; empty sections omitted; a trailing `?` on `next` is stripped;
  missing `next` → `nothing needs you — all done`. The interface contract's `✨ found` line is not in
  the v8 API.
- `pending.js`: `writePending(root, {lane, question, options, kind})` (`kind` one of `KINDS`: assumption, decision, unmet) → `{path, written, doc}` and never
  overwrites a pending question; `readPending`, `answerPending(root, label)` (unknown label → exit 2),
  `consumePending` (returns the doc), `stopLine(root)` starts with `PENDING_QUESTION`. No CLI.
- Tests: `tests/helpers.js` exports `ROOT, SPEC, RUN_ROOT, tmpdir, gitRepo, runNode, runBash,
  freePort`; `runNode(script)` resolves `script` against `spec/` (or takes an absolute path).
  `npm test` = `node --test --test-timeout=45000 'tests/**/*.test.js'` (no stdout preload).

### fanout.js notes

- **A lane ends DONE in its worktree.** Its run state (`<wt>/<spec>.run/state.json`, a spec-less fix's in the
  worktree's own git dir) says DONE with the branch committed; fanout lands it with `lib/land.js`, the solo path,
  so there is one landing and trunk gets the tree its last gate passed. The lane's run dir goes with its worktree.
- **Rebase guard.** At the top of `derive`, every worktree run whose worktree is mid-rebase (any step but
  STOPPED and ESCALATE) prints the resolve step while a conflicted file carries markers; once none does, `add -A`
  and `rebase --continue`, `base` = `merge-base(trunk, HEAD)`, and the run goes to GATE (no review, fresh
  attempts), so it is gated and reviewed again in the same dispatch.
- **`after`.** `run.js --mark after --on <spec>` commits the work (`wip(spec):`, folded into the build commit
  later) and ends STOPPED `{why: 'after', on, from}`; fanout's `returned` holds the queue item behind `on`
  (`Q.hold`), and once trunk has `on` done the lane's run rebases onto trunk and goes back to `from` by itself.
- **The turn ends at REPORT.** `reported` clears the state; the next bare run plans.
- **Discard, applied marks, lost state.** `dismissed --lane N --discard` removes the worktree and branch and prints
  the wip commit. A mark whose effect is already in the state exits 0 (`applied`). With `spec-fanout.json` missing while
  lane markers are open, `load` refuses and names the newest backup.

### run.js notes

- **Where things live.** State, briefs, `diff.patch` and `findings.json` sit in `<spec>.run/` next to the spec
  under `--root` (the main checkout, or the lane worktree in a lane); a spec-less fix's under the checkout's git dir.
- **Where it builds.** A worktree `.claude/worktrees/spec-<stem>` on `spec/<stem>` from trunk; a lane's own
  worktree; or, with `--in-place` only, the checkout it is in (off trunk the run refuses naming `--in-place`).
- **Rules, not questions.** Every rule calls `decide(state, line)`; the line is a 📌 in the report and in
  fanout's REPORT. `parkRun(state, ctx, why, item)` is the one stop: it queues the item and ends STOPPED.
- **The spec is not written.** Rulings and `as-built.md` lines go into the commit message and the next brief.

### integration notes

- The Agent tool takes no working directory: every agent runs from the main checkout. Lanes get
  `/spec:run <spec> --root <worktree>`; builders are told to `cd <worktree> && …`.
  `block-cross-worktree-writes.sh` allows writes from a checkout into its own `.claude/worktrees/*`;
  `block-worker-git.sh` also checks `cd <dir>` / `git -C <dir>` targets for the lane marker.
- `plan.js lock` commits the spec (`chore(spec): lock YYYYMMDD/NN`) so lane worktrees branch with it.
- `lib/driver.js`: when a mark settles on a terminal step (no mark), its body is printed after the
  checkpoint (the run sidecar is already cleared, so a re-run would refuse).
- `queue.js` reconciles: a spec item whose spec is `done` or whose file is gone counts as done (written on the next
  write; reconcile never ticks a brief item); `run.js` DONE also ticks it and sets Next to the queue head. `lib/land.js` ticks a
  finished brief whose `## Steps outside specs` lists no open box when its last spec merges, and the run or fanout report says
  `📌 auto-closed brief NN (<name>) — … (veto anytime)`; otherwise the `brief-done-queued` decide anomaly asks the user to close it. The REVIEW brief lists
  `Files changed outside the File Plan`.
- Removed as unused by any prose: fanout `--batch` (and `--include-fixes`, `--override-serial`, `--ask`), queue `--at`, status `--all`, plan `check`/`--date`,
  pending.js CLI, prototype `check`, mocks `reply`, walkthrough `reply`/`mark`, the `scratch-worktree` sink.
