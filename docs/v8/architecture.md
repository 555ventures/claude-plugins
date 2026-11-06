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
- Size caps: driver ≤ 400 LOC, lib file ≤ 250 LOC, command md ≤ 60 lines, agent md ≤ 40
  lines. If you are over, cut features, not line breaks.
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
  templates/spec.md, roadmap-brief.md, roadmap-overview.md, adr.md, proto-overlay.js
  hooks/hooks.json
  scripts/
    lib/state.js  lib/driver.js  lib/host.js  lib/git.js  lib/report.js  lib/pending.js  lib/work.js  lib/next.js
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
  "testFileCommand": "npx vitest {file}", // optional: single-file run used by red-check
  "setupCommand": "npm ci",               // run once in a fresh worktree
  "trunk": "main",
  "lanes": 4,                             // fanout parallelism
  "gateConcurrency": 2,                   // gates running at once on the host (min 1), all worktrees
  "laneFiles": [".env"],                  // default []: untracked root files copied into each fresh lane worktree before setupCommand
  "seats": { "builder": {"model":"sonnet","effort":"high"},
             "reviewer": {"model":"opus","effort":"low"},
             "orchestrator": {"model":"opus","effort":"medium"} },
  "worktreePerSpec": true,
  "mergeStrategy": "merge-commit",        // or ff-only | squash
  "walkthrough": { "baseUrl": "", "project": "", "tokenEnv": "WALKTHROUGH_TOKEN" },
  "prototype": { "url": "http://localhost:3000", "bootCommand": "npm run dev", "overlay": "src/main.tsx" },
  "release": { "deployCommand": "", "stagingUrl": "", "e2eCommand": "", "promoteCommand": "" }
}
```

## 4. Run state (`<spec>.run/state.json`) and the run driver

```json
{ "step": "BUILD", "spec": "specs/20261104/01-x.md", "worktree": ".claude/worktrees/spec-01-x",
  "branch": "spec/01-x", "base": "<sha>", "attempts": {"build": 1, "fix": 0},
  "gate": {"status": "red", "runId": "...", "output_tail": "..."},
  "review": {"findings": [], "verdict": "clean|fix|escalate"}, "history": [...] }
```

`run.js` steps, in order. The session does only the printed step, replies with the printed
`--mark`, re-runs the driver. Each accepted mark prints
`✅ checkpoint — <prev> → <next>; safe to /clear and re-run /spec:run <spec>`.

| Step | Driver does | Session does | `--mark` |
|---|---|---|---|
| OPEN | creates worktree+branch from trunk (or in place with `--in-place`), copies `laneFiles`, runs setupCommand, writes state; the main checkout's spec is not touched | nothing | (auto) |
| BUILD | prints the builder brief: spec path, Intent block, File Plan, test command, "write failing tests first, then code, run `testCommand` until green" | dispatches ONE `builder` agent (seat from config; Opus on attempt 2) in the worktree | `built` |
| GATE | runs `testCommand` in the worktree itself; green-run cache by tree hash (`lib/host.js`); takes a slot in `<git common dir>/spec-gate.lock/` (at most `gateConcurrency` gates at once, pid files, dead pids cleaned); a red whose failing test files are all outside the diff is re-run once before a repair is counted (`gate.reruns`) | nothing | (auto) → REVIEW or REPAIR |
| REPAIR | prints failure tail; cap 2, then ESCALATE; `repaired` on an unchanged tree is refused | dispatches builder with the failure | `repaired` → GATE; `regate` → GATE (same tree, no repair counted, once per tree) |
| REVIEW | prints reviewer brief: diff vs base, spec Intent + ACs; seat = reviewer, or Fable when `architecture: true` | dispatches ONE `reviewer` agent; writes findings JSON | `reviewed --file <json>` |
| FIX | only for `blocking` findings; cap 1, then ESCALATE; `fixed` on an unchanged tree is refused | dispatches builder with findings | `fixed` → GATE |
| ESCALATE | prints the options: retry on opus / park (queue a fix) / amend spec | asks the user (one question) | `escalate <retry\|park\|amend>` |
| COMMIT | driver commits in the worktree (`lib/git.js`), message from the spec title | nothing | (auto) |
| MERGE | merge-back to trunk per `mergeStrategy`, re-run gate on trunk tree (cache hit when unchanged) | conflicts only: asked | (auto) / `conflicts-resolved` |
| DONE | `status: done`, sidecar cleared, worktree removed, prints the report | nothing | — |

A lane (sub-agent run under fanout) never asks: at ESCALATE or any question it writes
`pending-question.json`, prints `PENDING_QUESTION`, exits 0.

Builder agent brief must include the Intent block verbatim and the line
"Do not touch files outside the File Plan without listing them in your final summary."

## 5. Fanout (`fanout.js`)

PLAN → DISPATCH → WAIT → RELAY → MERGE → REPORT, then back to PLAN until the queue is
empty. PLAN, bare (AUTO): the first `lanes` (default 4) runnable queue specs in queue order —
runnable = `hardened`, its lane did not end PARKED/AMENDED, not already in a lane, and every
`depends_on` entry (plus the lane's run-state `waitingOn`) done on trunk — File Plan
overlap regardless; a spec with an unmet entry is printed under Waiting with the reason (`lane N this batch`,
`draft — it cannot land in this fan-out`, or `<status>, not done`); prints a 📌 Auto-picked batch line, mark `planned`. `--pick` (SELF-PICK): the
runnable specs as checkbox questions (≤ 4 boxes × ≤ 4 questions, labels = titles), mark `picked
--label <title>` (repeatable; same validity checks, ≤ `lanes`). DISPATCH prints one Agent
call per lane: subagent `claude`, model = orchestrator seat, prompt = `/spec:run <spec> --root
.claude/worktrees/spec-<stem>` (absolute; the Agent tool has no cwd). WAIT: lanes return; the driver reads each lane's
run state. RELAY: all `pending-question.json` batched into one message; `answered --lane`.
Landing, per done lane: WAIT lands the first `done` lane as it returns whenever the trunk gate is not red
(a `sent-back` lane or a lane mid-rebase does not hold it); MERGE lands whatever is left in batch
order. `git.rebaseOnto(<worktree>, trunk)` (run state still MERGE_READY), then status done + commit in
the lane, `mergeBack` ff-only (`lane.landed` = trunk sha), gate on trunk (`MERGE_RED` → `gate-repaired` on
red). A rebase conflict leaves the rebase in progress, sets the lane `sent-back` with its conflict files,
and prints the re-dispatch Agent line (the bare `/spec:run`); mark `resent`. The lane's own `run.js`
resolves it in that one dispatch: it continues the rebase, moves `base`, gates and reviews (rebase guard,
below); `returned` then lands the lane (it refuses while the rebase is in progress). `block-worker-git.sh`
allows `git add` and `git rebase --continue` in a lane. A second conflict against the same trunk sha → lane
`stopped`, reason "second rebase conflict", relayed at RELAY. A stopped, waiting or dismissed lane is
committed first (`wip(spec): <stem>`, `git.commitWip`, the pending file excluded). `waiting --lane N --on
<spec>` (or a `returned` lane whose run state carries `waitingOn`) takes a lane out of the batch with a
wip commit and `waitingOn` in its run state; PLAN re-picks it once that spec is done. A reused worktree
(PLAN picks a lane whose worktree or branch exists) is wip-committed and rebased onto trunk by the
driver at DISPATCH (`lane.reused`, `lane.rebased` / `lane.conflicts`); its run state's `base` moves and
`waitingOn` goes. REPORT: one report, queue items ticked `done`, `merged <stem> as <sha>`.

## 6. Plan (`plan.js` + `templates/spec.md`)

`/spec:plan` is driven by the session (Fable). The script only: numbers the spec
(`specs/YYYYMMDD/NN-slug.md`), validates the template sections exist, counts
`[NEEDS CLARIFICATION:` markers, and locks (`status: hardened`) when zero. The template
adds one block at the top of the body:

```
## Intent
- You asked: <one sentence in the user's words>
- I will build: <3–6 bullets>
- I will not touch: <bullets>
- Architecture or behaviour change: no | yes — <what>, needs your yes
```

Frontmatter stays v7-compatible: `date, status (draft|hardened|implementing|done),
area, depends_on, brief, architecture: true|false`. Sections kept: Intent, Goal, Decisions,
File Plan, Acceptance Criteria (`AC-YYYYMMDD-NN-k`, WHEN/SHALL), Assumptions. Dropped:
tier, Users, Contracts, UI, Data Model, Rationale, Canonical Delta, oracle/pre-green tags.

## 7. Hooks (`hooks/hooks.json`)

| Event | Script | Rule |
|---|---|---|
| UserPromptSubmit | `state-gate.sh` | `/spec:run <spec>` on a `draft` spec or one with `[NEEDS CLARIFICATION:` markers → exit 2 with the remedy. |
| PreToolUse Bash | `block-worker-git.sh` | inside a lane worktree, builder/reviewer agents may not run `git commit/push/merge/rebase/reset/checkout` (`git add` and `git rebase --continue` stay allowed). Marker: `<git-dir>/spec-lane-open`. |
| PreToolUse Write\|Edit | `block-cross-worktree-writes.sh` | copy-trim from v7. |

## 8. Report (`lib/report.js`)

`render({outcome: '✅ …', bullets, pins, warns, blocks, artifacts, queued, next})` prints
the v7 fixed order. `next` is a command or `nothing needs you — <reason>`. ≤ 60 LOC.

## 9. Other drivers

- `queue.js`: `next|list|add|move|done|show`, the CLI over `lib/queue.js` (the queue's one owner: file, version, item shape, `parse`, `add`, `tick`, `reconcile`, `paste`; ≤ 200 LOC; no script outside it, the CLI and `migrate.js` touches items — `tests/queue.test.js` walks `spec/scripts/`). Duplicate refused. `add --type/--after`; `next` and `list` honour the `after` gate (`⏳ after`); `reconcile` ticks done specs, never a brief (only `done` closes one): `next` skips a finished brief, `list` tags it `✔ specs done`.
- `status.js` (≤ 400 LOC): the dashboard, v7's screen drawn from `lib/next.js`. Roadmap (collapsed
  ranges with phase and `n/m` bar, ✅/🔨/⬜/⛔), 🎯 Next (`qNN` prompt rows, then
  `⚡ N parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):` with `🔶`
  overlap pairs, a lone pick with `🚦 solo`, or a blocked pick with `⏳ after …` branches), up to three `⚠️` decide lines (`skipped-brief`, `out-of-order`, `brief-done-queued`), footer
  (`🟢`/`🟠`/`⬜`, `· N more open`, `· N more to decide (--all)`, `· H hygiene findings (/spec:doctor)`);
  `--all` adds 🕓 after that, ⛔ blocked, all decide lines and 🧹 hygiene (the derivation's own
  anomalies: `queue-unparseable`, `queue-orphan`, `unknown-status`, `orphan-stamp`,
  `unparsed-dependency`, `unknown-dependency`, `skipped-spec`, `hand-tracked-status`); `NN` reports one
  brief's dependency readiness. `--json` is `{briefs, specs, superseded, anomalies, next}`. No ledger
  lines, no run-in-flight or fan-out footer, no `doctor.check`.
- `lib/next.js` (≤ 250 LOC): v7's derivation on v8's state, no CLI. `derive(root)` reads `lib/work.js`
  (`readSpecs`, `readBriefs`, `gateWhy`) and the queue file (read-only overlay, off in a linked
  worktree; `reconcile` applied in memory) and returns entries with blockers (`depends_on`, brief
  dependencies, `after` gates), the anomaly catalogue (`decide` or `hygiene`), `laneAdmission`
  (pairwise, no cap) and `nothingNextLine`. Fanout keeps its own cap and admission.
- `init.js`: detect test command (package.json scripts.test, pytest, go test, cargo test),
  trunk, write config; ask only what cannot be detected (one AskUserQuestion). ≤ 150 LOC.
- `doctor.js`: config valid, testCommand runs (exit 0 or 1, never "command not found"),
  worktrees gitignored, pending sidecars listed. ≤ 100 LOC.
- `red-check.js`: new test files vs base must fail on base and pass on HEAD; vacuous green
  reported. ≤ 80 LOC. Called by GATE when `testFileCommand` exists.
- `genesis.js`: DISCOVERY → MENUS → DECIDE → SCAFFOLD → ROADMAP → HANDOFF → GROUNDED.
  Research menus = parallel Sonnet web agents (one per open dimension). DECIDE writes
  `.claude/genesis/stack-descriptor.json` + ADRs. ROADMAP writes briefs + queue entries.
  HANDOFF runs init. ≤ 400 LOC.
- `mocks.js`: SEED → SCREENS → APPROVED, walkthrough service or terminal mode. ≤ 250 LOC.
- `prototype.js`: OPEN → ROUND → APPROVED → CONTRACTED → CLOSED, plus `serve`. Pins via
  `templates/proto-overlay.js` POSTing to the serve endpoint. CONTRACTED writes
  `contract.json` (every pin as a sentence) and queues `/spec:plan <contract>`. ≤ 400 LOC.
- `connect.js`: copy-trim of v7 walkthrough-connect + client. ≤ 350 LOC total.
- `release.js`: deploy → e2e → promote (asked) → report. ≤ 120 LOC.
- `migrate.js`: v7 host → v8, see `host-footprint.md`. Idempotent, prints a plan first,
  `--apply` writes. Archives v7-only files under `docs/archive/v7/`.
- `enforce`: command md only; says init now writes lint/typecheck into `testCommand`.

## 10. Doctrine (`spec/doctrine.md`, ≤ 1 page)

Headings: What this plugin does · Files it reads · Lifecycle · Seats · How to drive a driver
· When to ask (irreversible, architecture: yes, lane questions) · Glossary (lane, mark, pin,
seat, checkpoint). Maintainer rules live in this repo's CLAUDE.md, not in the plugin.

## 11. Foundation APIs as built (`spec/scripts/lib/`)

Later builders: use these, do not re-derive them.

- `state.js`: everything in §2 plus `writeConfig(root, cfg)`, `DEFAULTS`, `gitCommonDir(root)`,
  `writeJson/writeText/readJson/readText` (atomic tmp+rename). `readConfig` merges defaults key by
  key, objects one level deep. `intent` = `{asked, build[], notTouch[], architecture: false | true |
  '<what>'}`; `filePlan` rows `{path, action (upper-case), summary}` found by header name;
  `acs` = `[{id, text}]`; `markers` = count of `[NEEDS CLARIFICATION:` in the body. The queue file is not
  here: `lib/queue.js` owns it (an absent file reads `{version: 3, seq: 0, items: []}`); `readFanout`/`readRun`/`readGenesis` → `null`.
  `readProto(root, stem)` → `{status, pins, contract}` (each `null` when absent); `writeProto` and
  `writeMocks(root, {status?, seed?})` write only the keys given.
- `lib/queue.js`: the one owner of the queue (≤ 200 LOC, no CLI): `VERSION`, `TYPES`, `CMD_TYPES`, `queuePath`, `kindOf`, `briefNo`, `parse(text, type)` (the only reader of typed text), `read` (strict: version 3 or a refusal naming `/spec:migrate`), `write`, `open`, `reconcile`, `add(root, fields, {top})` (the door; dedupe), `tick(root, pred)`, `text`, `paste`. `/spec:migrate` is the only converter of older files (ADR-0042).
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
  `{merged, conflicts[], sha?, reason?}` (ff-only divergence → `merged: false` + `reason`; conflicts
  are left in the root tree for `conflicts-resolved`); a root with tracked uncommitted changes or an
  unknown strategy throws `{exit: 2}`. `rebaseOnto(worktree, trunk)` → `{ok, conflicts[]}`; a conflict
  leaves the rebase in progress in the worktree (`rebasing(wt)` tells). `diff(base, cwd)` / `changedFiles(base, cwd)` compare the
  WORKING TREE (incl. untracked) with base via a scratch index, because REVIEW runs before COMMIT.
- `report.js`: `render(...)` per §8; empty sections omitted; a trailing `?` on `next` is stripped;
  missing `next` → `nothing needs you — all done`. The interface contract's `✨ found` line is not in
  the v8 API.
- `pending.js`: `writePending(root, {lane, question, options})` → `{path, written, doc}` and never
  overwrites a pending question; `readPending`, `answerPending(root, label)` (unknown label → exit 2),
  `consumePending` (returns the doc), `stopLine(root)` starts with `PENDING_QUESTION`. No CLI.
- Tests: `tests/helpers.js` exports `ROOT, SPEC, RUN_ROOT, tmpdir, gitRepo, runNode, runBash,
  freePort`; `runNode(script)` resolves `script` against `spec/` (or takes an absolute path).
  `npm test` = `node --test --test-timeout=45000 'tests/**/*.test.js'` (no stdout preload).

### fanout.js notes

Lane-mode contract fanout needs from `run.js` (a lane = a worktree fanout created and marked with
`lib/pending.markLane`; `run.js` detects it with `lib/pending.isLane(cwd)`):

- **In lane mode run.js stops at MERGE_READY after COMMIT; fanout merges.** It writes run state
  `step: 'MERGE_READY'` (readable by fanout as `readRun(<worktree>/<spec>).step`) with the branch
  committed, and does not merge, remove the worktree, delete the branch, clear the sidecar or write
  `status: done` — fanout does all of that (rebase onto trunk in the lane, status done + sidecar
  clear + commit in the lane, `mergeBack` ff-only into trunk, `gate` on root, `worktreeRemove` with the branch, queue tick).
- OPEN in lane mode creates no second worktree: it runs in place in the lane worktree
  (`.claude/worktrees/spec-<stem>`, branch `spec/<stem>`, both made by fanout from trunk) and still
  runs `setupCommand`.
- Any question or ESCALATE in lane mode: `writePending(<worktree>, {lane: <stem>, question,
  options})`, print `stopLine`, exit 0, run state left at its step. Re-dispatched with the same
  `/spec:run <spec>` after fanout records the answer, run.js reads `readPending(<worktree>).answer`,
  `consumePending`s it, and continues. fanout treats a pending doc with `answer: null` as "stopped".
- run.js must not refuse a re-run in a lane whose state is already MERGE_READY (no-op exit 0).
- **Rebase guard.** At the top of `derive`, a lane (`state.lane`) whose worktree is mid-rebase is resolved
  at any step except ESCALATE/PARKED/AMENDED: while a conflicted file carries markers the step keeps its
  name and prints the resolve text naming the live trunk head; once none does, `add -A` and
  `rebase --continue`; when the rebase completes `base` = `merge-base(trunk, HEAD)`, `commit` follows
  HEAD, and a MERGE_READY lane goes to GATE (`review: null`, fresh attempts), so REVIEW prints in the same
  invocation. fanout writes no `resolving`.
- **WIP folding.** COMMIT runs `reset --soft` to `merge-base(trunk, HEAD)` when a commit above it has a
  `wip(spec):` subject, so a branch carries exactly one `build(...)` commit and trunk never sees WIP.
- **`waitingOn`.** `run.js --mark waiting --on <spec>` (lane only; BUILD, REPAIR, FIX, REVIEW) writes
  `waitingOn` into the run state; fanout's `returned` then sets the lane `waiting` and PLAN holds it until
  `<spec>` is done.
- **The turn ends at REPORT.** `reported` clears the state and the driver stops at its checkpoint; REPORT's
  next line counts the runnable specs and fixes left and says `/clear`, then `/spec:fanout`. The next bare
  run plans.
- **Fix lanes.** Every pending queue item of type `fix` is a lane, picked
  after the runnable specs (spec-bound fixes first). Bound to a `spec` (pasted `/spec:fix <spec> — <symptom>`) the
  lane is `fix-<stem>`, `.claude/worktrees/fix-<stem>`, branch `fix/<stem>`, picked once the spec is out of
  any live lane, prompt `/spec:run <spec> --root <wt> --fix <symptom>`. Spec-less it is `fix-<slug>` (the
  first six words of the symptom plus six hex of its sha1), branch `fix/<slug>`, prompt
  `/spec:run --fix <symptom> --root <wt>`, and its run state lives under `<git-common-dir>/spec-fix/<slug>.run/`
  (shared by every worktree, never tracked, so no gitignore line). `run.js` accepts `--fix` as a lane or
  `--in-place`, opens a `done` or `hardened` spec (or none) without writing status, briefs the symptom and the
  reproduce-first recipe instead of the Intent and File Plan, reads `fix.json` at `built` (cause, test,
  authored strings and choices, or `needsPlan`), and commits `fix(<id>|<slug>): <symptom>` with the cause and
  test in the body. `needsPlan` discards the edits, queues `/spec:plan` and ends the run at `NEEDS_PLAN`
  (fanout dismisses the lane and reports `needs a spec`; the item stays pending). Authored strings or
  choices stop once after the green gate (`fix-choices`, kind `decision`: keep / revert / plan). fanout
  lands it like any lane, ticks the prompt item by id, flips no spec status and makes no done commit.
- **Pre-fast-forward gate.** `mergeLane` reads `merge-base(trunk, HEAD)` before the rebase; when it differs
  from trunk's head, the clean rebase is gated in the lane worktree before the bookkeeping commit. Red:
  the lane is `sent-back` with `lane.red`, its run state is rewritten to `GATE` (new base, no review, fresh
  attempts) and its own `/spec:run` repairs and reviews. MERGE_RED still means trunk itself is red.
- **Discard, applied marks, lost state.** `dismissed --lane N --discard` commits the wip, removes the
  worktree and branch and prints the sha. `lib/driver.js` takes an `applied` hook: a mark the step refuses
  (or whose handler refuses) but whose effect is already in the state prints `mark <verb> was already
  applied` and exits 0. With `spec-fanout.json` missing while fanout lane markers are open, `load` refuses
  and names the newest `spec-v7-backup` copy to restore.
- **Evidence.** `run.js` COMMIT appends `<spec>.run/evidence.md` to the build commit body.
- **Landing rule.** `deriveWait` lands the first `done` lane (batch order) whenever the trunk gate is not red
  (`s.red`); a `sent-back` lane or a `dispatched` lane mid-rebase no longer holds it. The sent-back lane
  keeps resolving onto the trunk it was rebased onto; when it returns, `mergeLane` rebases it again and gates
  the rebased tree before the fast-forward, and a new conflict is a fresh `conflictAt`.
- **What a mark did.** Lane-touching marks (`returned`, `resent`, `dismissed`, `waiting`, `answered`, `resumed`,
  `gate-repaired`) bump `s.seq`; `mergeLane` stamps the lane it worked on with `lane.last = {seq, outcome,
  detail}` (`landed` + sha, `conflict` + files, `red` + first failing line). `held` is stamped by `holdDone`
  in two places: `gateAfter`'s red branch (a landing that turns the trunk red stamps every other `done` lane
  inside the same settle) and the wrapper of a mark run while the trunk is already red; the lane whose landing
  turned it red keeps its `landed` stamp, and MERGE_RED accepts `returned` so a lane that comes back there is
  held and lands at `gate-repaired`. The `after` hook prints one line per lane with `last.seq === s.seq`, in
  batch order, with the Agent call after `sent back` and `gate red`; `--json` prints nothing extra. WAIT's
  lane list shows `resolving rebase (<n> files)` or `gate red after rebase` instead of a stale run step; the
  sent-back WAIT body is the dispatch body, a blank line, then that lane list.

### run.js notes

- **Where things live.** State, `diff.patch` and `findings.json` sit in `<spec>.run/` next to the
  spec under `--root` (the main checkout, or the lane worktree in a lane). `load` refuses (exit 2)
  unless `git check-ignore` says that sidecar is ignored.
- **In place** when `--in-place` is given, when `worktreePerSpec: false`, when the root is already on
  `spec/<stem>`, or when `isLane(root)` (fanout lane). Each case prints a `📌 Auto-picked in place —`
  line in the BUILD brief. Otherwise OPEN makes `.claude/worktrees/spec-<stem>` on `spec/<stem>` from
  trunk. `setupCommand` runs in a new worktree and in a lane.
- **Spec status.** A worktree run never writes to the main checkout: the run sidecar is the
  in-flight state, and `status.js` shows 🔨 implementing when a spec has a sidecar or a
  `.claude/worktrees/spec-<stem>` worktree (frontmatter only says `done`). The branch copy is
  synced from root and set to `done` at OPEN, so the gated tree is the tree that merges and the
  trunk gate after an unchanged merge is a cache hit; spec text edited in the branch (a FIX
  round's AC correction) merges with it. In place, OPEN writes `implementing` in the single
  checkout and (not a lane) COMMIT writes `done` into the build commit, so MERGE never meets a
  dirty tree. The REVIEW brief's `Files changed outside the File Plan` lists
  `<spec> (spec text edited)` when the spec differs from base beyond its status line.
- **Lane mode** follows the fanout notes above. `lane` is read once at OPEN and kept in the run
  state. A non-lane run marks its own worktree (or the root, in place) for `block-worker-git.sh`
  only while a builder or reviewer is out (BUILD, REPAIR, FIX, REVIEW); every save syncs it. The
  marker's content names its owner (`fanout` | `run`) and only a `fanout` marker makes a lane, so
  a stale run marker never turns the next run into one. MERGE, TRUNK_GATE and FINISH are separate
  saved auto steps. `reviewed` refuses a severity other than blocking/advisory and a `fix` verdict
  with nothing blocking; any blocking finding means FIX. A fanout lane that returns PARKED or
  AMENDED is dismissed (`ended` kept) and PLAN skips it while its worktree stays. A lane's park/amend keeps its sidecar at `PARKED`/`AMENDED`. A lane at ESCALATE with an
  answered pending doc applies the answer as an auto step.
- **Attempts.** `attempts = {repair, fix}`. The builder attempt is `1 + repair + fix`, plus 1 for
  REPAIR/FIX briefs. Attempt 2 and up, or `escalate retry`, uses opus. Retry clears both counters
  and returns to REPAIR (gate escalation) or FIX (review escalation).
- **Spec edits and unmet Decisions.** After a green gate `specEdits` lists every changed `specs/**/*.md`
  except the own spec, plus the own spec when its Decisions section differs from base; non-empty →
  ESCALATE `why: 'spec-edit'` with `revert` (checkout from base, own status line kept, back to GATE) and
  `amend`. `--mark unmet --decision <id> --why <text>` (BUILD, REPAIR, FIX, REVIEW, or a rebase being
  resolved) goes to ESCALATE `why: 'decision'` with `retry` (back to the step it came from, on opus,
  fresh attempts), `park` and `amend`; a lane writes it as a pending question.
- **Extra terminal names** beyond §4: `PARKED`, `AMENDED`, and `MERGE_READY` (lane only). A
  trunk gate that goes red after the merge still ends at DONE, with a 🚫 block and
  `Next: /spec:fix …`. A ff-only divergence is a refusal.
- **CLI shim.** `--mark escalate <choice>` is rewritten to `--choice <choice>` before
  `makeDriver` parses argv. `--in-place` is taken out of argv so it never swallows the spec path.
  `conflicts-resolved` refuses while a file the merge reported still holds `<<<<<<<`/`>>>>>>>`
  lines, then commits the merge in the main checkout.

- **As built.** The builder writes departures to `<spec>.run/as-built.md`; COMMIT (before `commitAll`) appends them, the review's advisories and the files outside the File Plan as bullets under `## As built` in the spec (a spec-bound fix lane's plan is the spec's File Plan plus its regression test, `fixTestFile`, and it prefixes `(fix: <symptom>) `; a spec-less fix has no spec, so no plan and no section; bullets already there are not repeated). `specEdits` compares Decisions only and `outsidePlan` runs at REVIEW, so neither sees the section. Table rows are split by `lib/state.js` `splitCells`, which keeps a pipe inside a backtick span.

### integration notes

- The Agent tool takes no working directory: every agent runs from the main checkout. Lanes get
  `/spec:run <spec> --root <worktree>`; builders are told to `cd <worktree> && …`.
  `block-cross-worktree-writes.sh` allows writes from a checkout into its own `.claude/worktrees/*`;
  `block-worker-git.sh` also checks `cd <dir>` / `git -C <dir>` targets for the lane marker.
- `plan.js lock` commits the spec (`chore(spec): lock YYYYMMDD/NN`) so lane worktrees branch with it.
- `lib/driver.js`: when a mark settles on a terminal step (no mark), its body is printed after the
  checkpoint (the run sidecar is already cleared, so a re-run would refuse).
- `queue.js` reconciles: a spec item whose spec is `done` counts as done (written on the next
  write; a brief item is never ticked by the driver — the `brief-done-queued` decide anomaly asks the user to close it); `run.js` DONE also ticks it and sets Next to the queue head. The REVIEW brief lists
  `Files changed outside the File Plan`.
- Removed as unused by any prose: fanout `--batch` (and `--include-fixes`, `--override-serial`, `--ask`), queue `--at`, status `--all`, plan `check`/`--date`,
  pending.js CLI, prototype `check`, mocks `reply`, walkthrough `reply`/`mark`, the `scratch-worktree` sink.
