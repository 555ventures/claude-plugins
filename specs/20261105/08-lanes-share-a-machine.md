---
date: 2026-11-05
status: implementing
area: fanout
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: 37
architecture: false
---

# Lanes share a machine

## Intent
- You asked: plan roadmap 37 — four lanes on one laptop should behave like four developers who know they share it: a load flake is not a repair, gates take turns, doctor knows the box, lanes get their env files, and the reports count the waste.
- I will build:
  - `run.js` GATE re-runs the gate once when every failing test it can name is outside the lane's diff, before a repair is counted; `--mark repaired` with no tree change since the last gate is refused with its remedy.
  - The REPAIR brief tells the builder that a flake or timeout in a test the diff does not touch is not theirs to fix and that a host timeout is never raised to pass; `builder.md` says the same.
  - A host-wide gate lock under the git common dir so at most `gateConcurrency` (config, default 2) gates run at once across the root and every worktree; a waiting lane says so and the wait is recorded.
  - `doctor.js` prints cores, the measured gate time, free space on `TMPDIR` and on the worktrees' filesystem, and warns on `lanes` > cores / 2, a gate over two minutes, or under 2 GB free; `fanout.md` tells the orchestrator to point `TMPDIR` off a tmpfs.
  - `laneFiles` (config): untracked files copied from the root into every fresh lane worktree before `setupCommand`; doctor warns when the root has `.env` or `.env.local` that `laneFiles` does not name.
  - The lane and batch reports print gate reruns and lock waits; `docs/v8/architecture.md` § 3 and `docs/v8/interface-contract.md` list the two new keys.
- I will not touch:
  - Merge order by File Plan overlap (specs/20261103/15 D1 stands), the batch loop and the merge path (brief 36), anything that asks the user (brief 35).
  - `REPAIR_CAP` and `FIX_CAP` values, the gate cache by tree hash, the seats table, the fan-out lane count or its default.
  - Host test configuration: the plugin never edits a vitest, jest or turbo config, and never sets `TMPDIR` itself.
- Architecture or behaviour change: no — the gate step gains a retry rule and a lock, doctor gains checks, config gains two optional keys; no ADR is added or overturned (ADR-0039 D5 on test lifecycle is untouched).

## Goal

On a shared laptop a fan-out batch stops paying for load twice: a red gate caused by an untouched slow test is re-run instead of handed to a builder, so no lane "repairs" a host timeout and no two lanes collide on the same config edit at merge; gates queue behind a lock so four builders never run four full suites at once; doctor says up front when the box is too small for the configured lanes, when temp space is short, and when lanes would start without the env file the suite needs; and the reports show how many reruns and how long the lock waits cost. On shop-bltr's batch 2 this would have turned four red gates into four reruns, avoided both rebase conflicts and the escalation, and named the `/tmp` and `.env` problems before dispatch.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `host.gate()` returns `tree` (the `treeSha` it keyed on) and `failing` (the repo-relative paths of files named in the red tail: every token matching `(^\|[\s'"(])((?:[\w.@-]+/)+[\w.@-]+\.[a-z]{1,5})(?=[\s:'")(]\|$)` that exists under `root`, deduplicated). `state.gate` stores both plus `reruns` (count, starts at 0) and `lockWaitMs`. | The rerun rule needs to know which tests failed and whether the tree moved; the gate already hashes the tree. Parsing the tail is the only host-neutral signal (vitest, node:test, jest, pytest, go and cargo all print the file). |
| D2 | A rerun is not a repair. At GATE, when the result is red, `gate.failing` is non-empty, every entry is absent from `git diff --name-only <base>` in the worktree, and `gate.reruns` is 0 for this tree, run.js re-runs the gate at once (`reruns = 1`) and acts on the second result: green → REVIEW as today; red again → REPAIR or ESCALATE by the existing cap. A red tail that names no file, or names a file the diff touched, goes to REPAIR as today. The rerun's wait and time are added, not replaced, in `gate.ms`. | shop-bltr batch 2: all four lanes went red on an untouched jsdom test under load and passed on rerun; two builders "repaired" it by editing host timeouts, which caused every rebase conflict of the batch. One rerun is cheap; two identical failures are a real signal. |
| D3 | `--mark repaired` (and `fixed`) is refused with exit 2 and `nothing changed since the last gate — re-run the gate (mark repaired after a builder round) or dispatch a builder` when `treeSha(wt)` equals `state.gate.tree`. The REPAIR step body prints the current `gate.tree` short sha so the orchestrator can see it. | A lane orchestrator spent the repair budget with builder-less `repaired` marks and escalated on a flake (shop-bltr lane 08). The budget counts builder rounds. |
| D4 | The REPAIR brief (run.js `builderBrief` kind `repair`) adds, after the failure tail: `A failing test the diff does not touch, a timeout, or a flake under load is not yours to fix: say so in your reply and stop; the driver re-runs the gate. Never raise a host test timeout, retry count or worker limit to pass.` `builder.md` gains the same rule in one sentence. When the builder replies without changing the tree, D3 applies and the orchestrator re-runs the gate by marking nothing: the REPAIR body offers `node run.js <spec> --mark regate` which re-runs the gate without counting a repair, allowed only when the tree is unchanged, at most once per tree. | The builder must have a sanctioned way to decline a flake, and the orchestrator a sanctioned way to re-run; otherwise both invent one (editing timeouts; marking repaired). |
| D5 | Gates take turns. `host.gate()` takes a slot in `<git common dir>/spec-gate.lock/` (a directory; one file per holder named `<pid>` containing `<pid> <iso time> <cwd>`), before running the command and only when the cache missed. A slot is free when fewer than `config.gateConcurrency` (default 2, minimum 1) holder files name a live pid (`process.kill(pid, 0)`); dead holders are deleted on sight. While no slot is free, `gate()` polls every 2 s and prints `gate: waiting for a slot (N running) …` once to stderr; the wait is returned as `lockWaitMs`. The holder file is removed in `finally`. The common dir is shared by every worktree of the host, so the lock spans the root and all lanes. | Four full suites at once drove load to 9–19 and made unrelated tests time out in both trial repos. A pid file in the common dir needs no daemon and no dependency, survives a killed process (dead pids are stale), and is invisible to git. |
| D6 | `gateConcurrency` is read through `readConfig` defaults (`gateConcurrency: 2`), documented in architecture.md § 3 and the interface contract. `fanout.md` says builders still run in parallel; only gates queue. | One knob, one default that halves the trial's load without serialising builders. |
| D7 | Doctor knows the box. `doctor.js` adds, as `info` lines: `box: <cores> cores · gate <s>s (<cached\|measured>) · TMPDIR <path> <free> free · worktrees on <fs> <free> free`, where free space comes from `df -Pk <path>` (unavailable → `?`). It adds `⚠️` info lines, not findings, for: `lanes <n> > cores/2 (<c>) — set "lanes": <floor(c/2)> or "gateConcurrency": 1 in .claude/spec.config.json`; `gate took <s>s (over 2 min) — set "gateConcurrency": 1, or lower lanes`; `TMPDIR has <free> free (under 2 GB) — export TMPDIR=<path on the worktrees' filesystem> before /spec:fanout`. The gate time is the probe's own duration when the probe ran, else the newest cached run's `ms` when the cache stores one, else omitted. | These are facts about the machine, not defects in the repo: doctor's exit code stays a hygiene signal and a laptop host stays "healthy" with advice printed. The remedies are the exact config lines. |
| D8 | `laneFiles` (config, array of repo-relative paths, default `[]`): after a fresh worktree is created at OPEN (`run.js`, both the in-session path and a lane under `--root`), and before `setupCommand`, each named file that exists in the main checkout and is not tracked (`git ls-files --error-unmatch` fails) is copied byte for byte into the same path in the worktree; a tracked or missing entry is skipped with a `laneFiles: skipped <p> (<tracked\|missing>)` stderr line. `fanout.js prepare()` does the same for the worktrees it creates. Copied files are never added to git: they are gitignored in the host by definition and `commitAll`/`commitWip` stage through git, which honours `.gitignore`. | shop-bltr lane builders had no `.env` and could not run the DB-backed checks the specs' ACs name, so page-weight, parity and admin e2e went unverified. A worktree starts from the tree, never from the root's untracked files. |
| D9 | Doctor warns (a finding, with the remedy) when the root has `.env` or `.env.local` untracked and `laneFiles` does not name it: `laneFiles: the root has .env that lanes will not see — add "laneFiles": [".env"] to .claude/spec.config.json`. A tracked `.env` is not reported. | The missing env is a defect the next fan-out will hit; it has one exact remedy. |
| D10 | Reports count the waste. `run.js` afterMark's gate line gains ` · rerun` when `gate.reruns` is 1 and ` · waited <s>s for a gate slot` when `lockWaitMs` ≥ 1000; `readyReport` and the DONE report add a bullet `load: <n> gate rerun(s), <s>s waiting for a slot` when either is non-zero; fanout's `returned` copies the lane run's `gate.reruns` and `gate.lockWaitMs` onto the lane, and the REPORT `merged` bullet ends with ` (<n> rerun(s), <s>s slot wait)` when non-zero, with one summary warn line `load: <total> rerun(s), <total>s of slot waits across the batch` when any lane paid. | The cost of load was invisible in the trial until a pilot added it by hand; a number next to the result is what makes `lanes` and `gateConcurrency` worth tuning. |
| D11 | `fanout.md` adds under Long marks: `Temp space: suites that write temp data fill a tmpfs with four lanes; export TMPDIR to a directory on a real disk before /spec:fanout (doctor prints the free space).` `doctor.md` is unchanged (it shows doctor's output). | The orchestrator, not the plugin, owns the environment variable; doctor supplies the number. |
| D12 | Tests by execution: `tests/host.test.js` (D1 `failing`/`tree`, D5 lock with a fake dead pid and a `gateConcurrency: 1` contention using a sleeping test command in two worktrees), `tests/run.test.js` (D2 rerun then REVIEW; rerun then REPAIR; a diff-touched failure goes straight to REPAIR; D3 refusal; D4 `regate` once per tree; D10 lines), `tests/doctor.test.js` (D7 info lines with a fake `df` via PATH, D9 finding and its absence when tracked or named), `tests/fanout.test.js` (D8 copy before setup in a lane worktree, `git status` clean; D10 REPORT lines), plus a contract grep for `gateConcurrency` and `laneFiles` in both docs. | Every criterion is a behaviour the trial observed failing; each gets a test that fails on main today. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/host.js | MODIFY | `gate()` returns `tree`, `failing`, `lockWaitMs`; `failing` parser; gate slot lock under the common dir with dead-pid cleanup and `gateConcurrency` |
| spec/scripts/lib/state.js | MODIFY | config defaults `gateConcurrency: 2`, `laneFiles: []` |
| spec/scripts/run.js | MODIFY | GATE rerun rule (D2); `repaired`/`fixed` refusal on an unchanged tree and the new `regate` mark (D3, D4); REPAIR brief text (D4); `laneFiles` copy at OPEN before `setupCommand` (D8); gate line and report bullets (D10) |
| spec/scripts/fanout.js | MODIFY | `prepare()` copies `laneFiles` (D8); `returned` carries `reruns`/`lockWaitMs` onto the lane; REPORT bullets and the batch load line (D10) |
| spec/scripts/doctor.js | MODIFY | box info line, the three `⚠️` advice lines (D7), the `laneFiles` finding (D9) |
| spec/agents/builder.md | MODIFY | one sentence: a flake or timeout outside the diff is not yours; never raise a host timeout to pass |
| spec/commands/fanout.md | MODIFY | gates queue behind `gateConcurrency`; `TMPDIR` advice under Long marks (D6, D11) |
| spec/commands/run.md | MODIFY | the `regate` mark in the step list |
| docs/v8/architecture.md | MODIFY | § 3 config keys gain `gateConcurrency` and `laneFiles`; the GATE row names the rerun rule and the lock |
| docs/v8/interface-contract.md | MODIFY | run marks gain `regate`; the config row names `gateConcurrency` and `laneFiles` |
| tests/host.test.js | MODIFY | D1, D5 tests |
| tests/run.test.js | MODIFY | D2, D3, D4, D10 tests |
| tests/doctor.test.js | MODIFY | D7, D9 tests |
| tests/fanout.test.js | MODIFY | D8, D10 tests and the contract grep |

## Acceptance Criteria

- **AC-20261105-08-1**: WHEN the gate is red and every file named in its tail is outside `git diff --name-only <base>` of the worktree THE SYSTEM SHALL re-run the gate once before moving to REPAIR, and WHEN the rerun is green it SHALL go to REVIEW with `attempts.repair` unchanged and `gate.reruns` = 1.
- **AC-20261105-08-2**: WHEN the rerun is red again THE SYSTEM SHALL go to REPAIR (or ESCALATE at the cap) exactly as a first red gate does today, and SHALL not re-run again for the same tree.
- **AC-20261105-08-3**: WHEN the red tail names a file the diff touched, or names no file at all, THE SYSTEM SHALL go to REPAIR without a rerun.
- **AC-20261105-08-4**: WHEN `--mark repaired` or `--mark fixed` is run and the worktree tree sha equals the sha the last gate ran on THE SYSTEM SHALL refuse with exit 2 and the line `nothing changed since the last gate — re-run the gate (mark regate) or dispatch a builder`, leaving `attempts` unchanged.
- **AC-20261105-08-5**: WHEN `--mark regate` is run at REPAIR with the tree unchanged THE SYSTEM SHALL re-run the gate without incrementing `attempts.repair`; a second `regate` on the same tree SHALL be refused with exit 2; `regate` at any other step SHALL be refused.
- **AC-20261105-08-6**: WHEN the REPAIR brief is printed THE SYSTEM SHALL include the sentence that a failing test the diff does not touch, a timeout or a flake under load is not the builder's to fix and that a host timeout is never raised to pass; `spec/agents/builder.md` SHALL contain the same rule.
- **AC-20261105-08-7**: WHEN two gates start in two worktrees of one host with `gateConcurrency: 1` and a cache miss THE SYSTEM SHALL start the second only after the first's holder file is gone, and the second's `lockWaitMs` SHALL be at least the first's run time.
- **AC-20261105-08-8**: WHEN a holder file names a pid that is not running THE SYSTEM SHALL delete it and take the slot without waiting.
- **AC-20261105-08-9**: WHEN `gateConcurrency` is absent THE SYSTEM SHALL use 2; WHEN it is 0 or negative THE SYSTEM SHALL use 1.
- **AC-20261105-08-10**: WHEN doctor runs THE SYSTEM SHALL print an info line starting `box:` with the core count, the gate time when known, and the free space of `TMPDIR` and of the worktrees' filesystem.
- **AC-20261105-08-11**: WHEN `lanes` exceeds `floor(cores / 2)` THE SYSTEM SHALL print a `⚠️` info line naming the `"lanes"` or `"gateConcurrency"` config remedy and SHALL still exit 0 when no finding exists; WHEN `lanes` ≤ `floor(cores / 2)` no such line SHALL print.
- **AC-20261105-08-12**: WHEN the measured gate exceeds 120 s, or `TMPDIR` has under 2 GB free, THE SYSTEM SHALL print the matching `⚠️` info line with its remedy.
- **AC-20261105-08-13**: WHEN the root has an untracked `.env` or `.env.local` and `laneFiles` does not name it THE SYSTEM SHALL report a finding with the `"laneFiles"` remedy; WHEN the file is tracked, or named in `laneFiles`, no finding SHALL be reported.
- **AC-20261105-08-14**: WHEN a fresh lane worktree is created (by `run.js` OPEN or `fanout.js` prepare) and `laneFiles` names an untracked root file THE SYSTEM SHALL copy it into the worktree before `setupCommand` runs, byte-identical, and `git status --porcelain` in the worktree SHALL not list it.
- **AC-20261105-08-15**: WHEN a `laneFiles` entry is tracked or missing THE SYSTEM SHALL skip it with a stderr line naming the reason and continue.
- **AC-20261105-08-16**: WHEN a lane paid a rerun or a slot wait THE SYSTEM SHALL print it on the gate line after the mark, in the lane's merge-ready report, and in fanout's REPORT `merged` bullet plus one batch `load:` summary line; WHEN neither happened no such text SHALL print.
- **AC-20261105-08-17**: WHEN `fanout.md`, `run.md`, `docs/v8/architecture.md` § 3 and `docs/v8/interface-contract.md` are read THE SYSTEM SHALL name `gateConcurrency`, `laneFiles`, the `regate` mark and the `TMPDIR` advice where this spec puts them.

## Assumptions

- A1: Failing-file attribution from the gate tail is reliable enough for the rerun rule across vitest, node:test, jest, pytest, go and cargo — if false: the rerun rule narrows to "the tail names at least one file and none is in the diff" stays, but a host may set `gateRerun: false` (not added now) to disable it.
- A2: One rerun per tree is the right budget — if false: a counter in config; not added now.
- A3: The three box warnings are `⚠️` info lines, not findings, so a laptop host with the default `lanes: 4` stays "healthy" with advice printed — if false: they become findings and `lanes` defaults drop to `floor(cores / 2)`.
- A4: `gateConcurrency` defaults to 2 rather than 1 — if false: default 1 serialises gates completely at the cost of wall-clock on big machines.
- A5: A pid-file directory in the git common dir is an acceptable lock (no cross-machine use, no daemon) — if false: `proper-lockfile` or flock; neither is a dependency today.
- A6: `laneFiles` copies only untracked files and only at worktree creation, never on reuse — if false: copy on every OPEN when the file is absent in the worktree.
- A7: The `regate` mark is the orchestrator's sanctioned rerun; the builder's "not mine" reply is prose the orchestrator acts on, not a parsed signal — if false: a `--mark declined` from the lane; brief 35 may route it as a question.
- A8: The gate time doctor prints comes from its own probe, else the newest cached green run; the cache gains an `ms` field only if it does not already store one — if false: the probe is the only source and the line omits it when the probe is skipped.
- A9: No ADR: these are driver and doctor behaviours inside the existing shape — if false: re-lock with `architecture: true --confirmed` and write the ADR.
