---
date: 2026-11-02
status: done
tier: critical
area: fanout
breaking: false
depends_on: [specs/20261102/02-a-delegated-driver-stops-on-disk.md]
brief: 32
spiked: 2026-11-02
open_markers: 0
diff_base: e4dd870f43257bd6e88d86b525ca7ea01c22768b
---

# One session runs the lanes

## Goal

`/spec:status` already names the queue's startable lanes, but running them means one terminal per
lane and a human relaying every stop by hand. After this spec one command in the main session reads
the lanes from a new machine surface, asks the three predictable questions once up front, dispatches
one worktree-isolated sub-agent per lane through the Agent tool, relays every question the lanes
write (batched four at a time; answered by the user or by the up-front sheet, never by a worker),
merges each finished lane into main one at a time with the host gate re-run after every merge, and
renders one report. The dispatch table lives in the git common dir, so `/clear` loses nothing. Done
means a four-lane day is one session: dispatch, supervise, resume, merge, report — with every
decision still the user's.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/spec-status.js` gains `--lanes --json` (a new mode beside `--next`/`--all`; every existing shape is byte-for-byte unchanged): `{"lanes":[…],"serialized":[…],"fixes":[…]}` where `lanes` = `laneAdmission`'s admitted entries whose `action` is `/spec:run`, each `{action, path, brief, status, note, branch, worktree}` (`branch` = `spec/<stem>` as `merge-back.sh branch-for` derives it; `worktree` = the linked worktree path holding that branch per `git worktree list --porcelain`, else `null`); `serialized` = the admitted-later `/spec:run` entries plus every `laneClash` entry, each `{path, brief, reason}` (`reason` = the clash or parallel reason, `queued behind the top pick` when neither); `fixes` = the red-CI `/spec:fix` escapes plus queue prompt items whose action starts `/spec:fix `, each `{action, path, note, queue_id}` (`queue_id` null for a CI escape). The mode is refused with exit 2 `run from the main worktree` when cwd's toplevel is not the first `git worktree list` entry. (AC-20261102-03-1, AC-20261102-03-2, AC-20261102-03-3, AC-20261102-03-19) | The one derivation of lanes stays in `spec-status.js` (pipeline rules § Risk Tiers: never a second derivation); the fan-out reads it instead of re-implementing pairwise admission over a JSON that carries no roadmap graph. Rejected: widening `--next --json` (a frozen shape external readers pin). |
| D2 | `spec/scripts/lib/host-config.js`: `POLICY_SEATS` gains `lanes` with default `seat('opus', 'medium')` (`POLICY_DEFAULTS.models.lanes`, `validatePolicy` admits it like the others); `agentCall(root, seatName, subagentType, extra)` takes an optional fourth argument `{isolation, background}` rendered after effort as `, isolation: "worktree"` and `, run_in_background: true` when set, so a lane line reads `Agent {subagent_type: "general-purpose", model: opus, effort: medium, isolation: "worktree", run_in_background: true}`. (AC-20261102-03-4, AC-20261102-03-20) | Every printed `Agent {` comes from one builder (tests/consistency/dispatch-seat.test.js); a lane worker is an orchestrator-shaped seat (core § Model Placement: build/review orchestrator — opus recommended) and the host may override it like any seat. |
| D3 | `spec/scripts/fanout-driver.js` — driver-stepped, `/clear`-safe: `fanout-driver [--root <dir>] [--spec <path>]… [--lanes N] [--include-fixes] [--override-serial] [--mark <m> …] [--state]`. State file `<git-common-dir>/spec-fanout.json` (Contracts), the single orchestrator state per repo; a second `fanout-driver` bare run while one exists resumes it. Refuses (exit 2) when cwd's toplevel is not the main worktree. States derived from the file and disk, in this order: **PLAN** (no file) → **PREFLIGHT** (`standing` absent) → **DISPATCH** (any lane `planned`) → **RELAY** (any lane `pending`) → **MERGE** (no lane `pending`, any lane `merge-ready`; `gate` red on the last merge → **MERGE_RED** first) → **WAIT** (any lane `dispatched`) → **REPORT** (no lane `planned`, `dispatched`, `pending` or `merge-ready`; `waiting` lanes left over are reported as not started, D4a). (AC-20261102-03-5, AC-20261102-03-6) | The same derive-from-disk frame as every driver here (`lib/driver-core.js`); the common-dir file is the `spec-queue.json` precedent — private, never committed, shared by every worktree of the repo. |
| D4 | **PLAN**: runs `spec-status --lanes --json` (D1); with one or more `--spec <path>` the candidate set is the listed specs in the order given — each must appear in `lanes` (or in `serialized` with a `shared brief` reason under `--override-serial`), a listed spec that is in `serialized`, or absent from both because a `Depends on` spec or brief is not yet done, enters the table as `waiting` with its reason and is admitted later (D4a); a listed spec that is parked, superseded, done, or unknown to `spec-status` is printed as `⛔ <path> — <reason from spec-status>` and excluded, never forced; without `--spec` the candidates are `lanes` only (one wave; nothing waits); lanes = the candidates capped at `--lanes N` (default 4) in order, plus, with `--override-serial`, the `serialized` entries whose reason starts `shared brief` (never a `depends on` reason) up to the cap; a lane whose `worktree` is non-null is excluded and printed as `⏸ <path> parked in <worktree> — finish it there in-session`; with `--include-fixes`, `fixes` become one serial lane group (`kind: "fix"`, branch `fix/<queue_id>` or `fix/ci-<sha7>`), dispatched one at a time after the run lanes. Writes the file with every lane `planned`, prints the table and `Then: node <driver> --root <root> --mark planned`; `--mark planned` is the only admission (to change the set, delete the file). (AC-20261102-03-7, AC-20261102-03-8, AC-20261102-03-21) | Admission is `spec-status`'s (an explicit list only narrows it, never widens it), cap and overrides are the user's flags, a parked branch cannot be taken by a fresh worktree (A3 of spec 02); one mark keeps the table a deliberate act. |
| D4a | **Rolling admission**: after every `--mark merged` and every `--mark returned` that lands a lane in a terminal state, the driver re-runs `spec-status --lanes --json`; each `waiting` lane that now appears in `lanes` (or in `serialized` with a `shared brief` reason under `--override-serial`) flips to `planned` in table order, so the next bare run prints DISPATCH for it — up to the `--lanes` cap counting lanes in `dispatched`/`pending`/`merge-ready`; a `waiting` lane whose named dependency is `stopped` stays `waiting` and is reported `not started — waited on <dep>, which stopped`. REPORT is reached when no lane is `planned`, `dispatched`, `pending` or `merge-ready`. (AC-20261102-03-22) | Dependency order is the queue's own order; the fan-out follows it instead of asking the user to re-run after each merge; the cap bounds concurrency, not the list. |
| D5 | **PREFLIGHT** prints ONE AskUserQuestion block with three questions, headers `Repair round`, `Build cap`, `Prototype` — kinds `repair-round`, `build-escalate`, `prototype-close` — each offering the stop's own options (labels and descriptions byte-equal to the driver's) plus `ask me when it happens (Recommended)` whose description says the lane stops and the question is relayed; `Then: node <driver> --root <root> --mark standing --repair-round <label\|ask> --build-escalate <label\|ask> --prototype-close <label\|ask>` writes `standing`. (AC-20261102-03-9) | The user's own answers, given once, to the three stops whose options do not depend on what the lane found (brief 32 § Out of scope: nothing else is pre-answered); core § Question Style's "derive before asking" turned into a sheet. |
| D6 | **DISPATCH** prints, for every `planned` run lane, one block: `D2`'s `agentCall(root, 'lanes', 'general-purpose', {isolation: 'worktree', background: true})` followed by the worker prompt (Contracts; it names the lane id, the branch, the spec, the first command `git switch <branch> 2>/dev/null \|\| git switch -c <branch>`, then `/spec:run <spec>`, the four driver lines that end a turn, and the rule that a pending question is never answered by the worker); fix lanes are dispatched one at a time with `/spec:fix <queue id or CI note>` and the same ending rule. `Then:` one `node <driver> --root <root> --mark dispatched --lane <id> --agent <name>` per lane; the mark records `agent` and flips `dispatched`. All run lanes go out in one message (core § Session Execution: batch independent calls). (AC-20261102-03-10) | A worktree-isolated sub-agent lands in its own worktree with cwd pinned there and resumes into it later (A1); the branch switch makes it the lane's branch so the review's merge path finds it; the worker never asks because it cannot (spec 02 § Delegated Stops). |
| D7 | `--mark returned --lane <id> [--stopped "<reason>"]` inspects the lane's worktree (the entry of `git worktree list --porcelain` whose branch is the lane's; `--stopped` or no such worktree → `stopped` with the reason or `worktree not found`): `.claude/pending-question.json` present → `pending`; `<spec>.review/review-state.json` with `marks.closed === true` and no `mergeConcluded` → `merge-ready`; the spec's `status: done` with `mergeConcluded` → `done`; a build or review sidecar with `marks.dismissedStop` → `stopped` (`question dismissed`); anything else → `stopped` (`returned without a recognised stop — resume by hand: cd <worktree> && /spec:run <spec>`). A fix lane returns `merge-ready` when its branch is ahead of main and the worktree is clean, else `stopped`. (AC-20261102-03-11) | The lane's state is read from the lane's disk, never from the worker's prose (core § On-Disk Handoff); every stop has a hand-resume line so no lane is lost. |
| D8 | **RELAY**: for each `pending` lane the driver runs `question-style-gate.js --file <pending path>` (exit 2 → the lane is `stopped`, reason `malformed question: <first finding>`); for each question whose `kind` has a standing answer other than `ask` it runs `pending-question.js answer --by standing` and prints `📌 Auto-picked <label> — standing answer from preflight (veto anytime)`; the remaining questions print as ONE AskUserQuestion block, at most four per block, headers prefixed by the lane id, the lane's spec named in each question text, options and descriptions verbatim from the file; `Then:` one `--mark answered --lane <id> --id <qid> --label <label>` per question (runs `answer --by user`) and `--mark dismissed --lane <id>` (runs `dismiss`). When every question of a lane is answered or it is dismissed, the driver prints `SendMessage {to: "<agent>", message: "Lane <id>: the answer is recorded in <path> — re-run the driver and continue to the next stop"}` and `Then: --mark resumed --lane <id>` (flips `dispatched`); an agent that no longer answers is `--mark returned --lane <id> --stopped "worker gone — finish in-session: cd <worktree> && /spec:run <spec>"`. (AC-20261102-03-12, AC-20261102-03-13, AC-20261102-03-14) | The parent is the only writer of answers (spec 02 D6); batching is the real multiplier when decision throughput, not terminals, is the ceiling; a vanished worker is a hand-resume, never a silent re-dispatch into a second worktree. |
| D9 | **MERGE** takes the first `merge-ready` lane in table order. Run lane: prints `git worktree unlock <worktree>` (the harness keeps a lock named `claude agent <id>` on a worker's worktree after its return, and `merge-back.sh cleanup` refuses a locked tree — A1), then `run from <mainRoot>: node "$(spec-paths review-driver)" <worktree>/<spec> — follow its MERGE step (strategy derived; a prototype question is answered from the standing sheet when it is not "ask"), then: node <driver> --root <root> --mark merged --lane <id>`. Fix lane: prints `/git:merge <branch>` then the same mark. `--mark merged` verifies the branch no longer exists or is contained in `HEAD` (`git merge-base --is-ancestor`), else exit 2 `lane <id> is not merged`; when the branch is contained but the worktree or branch still exists (the review driver died at cleanup after the merge landed) it runs `git worktree unlock` then `merge-back.sh cleanup --root <root> --source <branch> --worktree <worktree>` itself and prints the cleanup output; then runs the gate on main — a run lane through `lib/gate-resolve.js`'s `resolveGate` for that spec (the review's own gate leg form), a fix lane through `config.testCommand` — records `gate: green\|red` with the log at `<git-common-dir>/spec-fanout/<id>.gate.log`, flips `merged`; red → **MERGE_RED**: prints the log path and `node "$(spec-paths spec-queue)" add "main gate red after merging <lane>: <log>" --lane fix --top`, and refuses every further `--mark merged` until `--mark gate-repaired` (which re-runs the same gate; green clears it). One merge at a time: a second `merge-ready` lane waits. (AC-20261102-03-15, AC-20261102-03-16, AC-20261102-03-17) | Bors-style: workers never land on main; the parent merges in order from the main root (the review driver's relocation guard already demands that CWD) and gates after each; a red main stops the queue so the next merge never lands on a broken base. |
| D10 | **REPORT** (every lane terminal) assembles slots — `outcome` ✅ `fan-out complete — N merged` when every lane is `merged`/`done`, else ⚠️ `fan-out finished with stops — N merged, M stopped`; `bullets` one per lane `<spec>: merged (gate green)` / `stopped — <reason>` / `done` / `not started — waited on <dep>, which stopped`; `warns` one per standing auto-pick applied; `queued` the queue lines D9 printed; `next` = `spec-status --next` verbatim — writes them to `<git-common-dir>/spec-fanout/report.json` and prints `node "$(spec-paths report-render)" --slots <that file>` then `Then: --mark reported`, which deletes the state file and the directory. (AC-20261102-03-18, AC-20261102-03-25) | One report through the sole render authority (core § Console Output Style); the state file is a transient of one run. |
| D11 | `spec/commands/fanout.md` (frontmatter `description`, `argument-hint: "[<spec path>…] [--lanes N] [--include-fixes] [--override-serial]"`; positional spec paths become `--spec` flags on the driver line): intended model opus or fable; `spec-paths shared-for fanout` (sections `Host Grounding\|Pipeline Entry\|State Machine\|Model Placement\|Decisions\|Delegated Stops\|Question Style\|Console Output Style\|On-Disk Handoff\|Session Execution`, added to `spec/bin/spec-paths`); the loop: run `node "$(spec-paths fanout-driver)" --root . <flags>`, do exactly the one step it prints (ask, dispatch, relay, merge), mark, repeat; on a task notification for a lane run `--mark returned`; never answer a lane's question yourself; never run a lane's driver except the MERGE step from the main root; the report is the driver's slots rendered verbatim. Non-goals stated: no `/spec:plan` lane, no automatic answers. `[no-ac: command prose; tests/consistency/prose-pins pins the key, the flags and the two never-lines]` | The command is the thin judgment layer over a deterministic driver (brief 32); every rule a worker could break is restated where the session reads it. |
| D12 | `spec/bin/spec-paths` gains `fanout-driver`; `spec/entrypoints.json` gains `"spec/scripts/fanout-driver.js": {"entryPoints": ["spec/commands/fanout.md"]}`; `tests/spec-paths.test.js`'s in-place key list gains the key. `[no-ac: tests/consistency/entrypoints.test.js and tests/spec-paths.test.js are the oracles]` | New-surface checklist (pipeline rules § Planning). |
| D13 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-status.js | MODIFY | scripts | `--lanes --json` mode: lanes with branch and worktree, serialized with reasons, fixes with queue ids; main-worktree refusal (D1); `no dependency change` |
| spec/scripts/lib/host-config.js | MODIFY | scripts | `lanes` policy seat; `agentCall` fourth argument for isolation and background (D2) |
| spec/scripts/fanout-driver.js | CREATE | scripts | the orchestrator driver: PLAN → PREFLIGHT → DISPATCH → RELAY → MERGE/MERGE_RED → WAIT → REPORT over `<git-common-dir>/spec-fanout.json` (D3–D10) |
| spec/bin/spec-paths | MODIFY | scripts | `fanout-driver` key; `fanout` section list (D11, D12) |
| spec/commands/fanout.md | CREATE | doctrine | the `/spec:fanout` command (D11) |
| spec/entrypoints.json | MODIFY | other | the new script's entry point (D12) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D13) |
| docs/canonical/status.md | MODIFY | other | the `--lanes --json` surface (Canonical Delta) |
| tests/spec-status.test.js | MODIFY | tests | AC-20261102-03-1, AC-20261102-03-2, AC-20261102-03-3, AC-20261102-03-19 |
| tests/host-config/policy-block.test.js | MODIFY | tests | AC-20261102-03-4, AC-20261102-03-20 |
| tests/fanout/fixture.js | CREATE | tests | synthetic host with a roadmap, two hardened specs, a parked worktree, a fake review sidecar and a fake pending question |
| tests/fanout/fanout-driver.test.js | CREATE | tests | AC-20261102-03-5 … AC-20261102-03-18, AC-20261102-03-21, AC-20261102-03-22 |
| tests/spec-paths.test.js | MODIFY | tests | the `fanout-driver` key in the in-place list (D12) |
| tests/consistency/prose-pins.test.js | MODIFY | tests | reference pins for D11 |

## Contracts

`spec-status --lanes --json` (D1):

```json
{"lanes":[{"action":"/spec:run","path":"specs/20261102/03-x.md","brief":"32","status":"hardened","note":null,"branch":"spec/03-x","worktree":null}],
 "serialized":[{"path":"specs/20261102/06-y.md","brief":"32","reason":"shared brief 32"}],
 "fixes":[{"action":"/spec:fix q107","path":null,"note":"queue item q107","queue_id":"q107"}]}
```

`<git-common-dir>/spec-fanout.json` (D3):

```jsonc
{
  "version": 1,
  "startedAt": "2026-11-02T10:00:00Z",
  "options": { "lanes": 4, "includeFixes": false, "overrideSerial": false, "specs": [] },  // specs = the --spec list as given
  "standing": null,                       // after PREFLIGHT: {"repair-round": "<label>"|"ask", "build-escalate": …, "prototype-close": …}
  "lanes": [{
    "id": "L1",                           // L1… in table order; fix lanes F1…
    "kind": "run",                        // run | fix
    "spec": "specs/20261102/03-x.md",     // fix lanes: "queueId": "q107" or "ci": "<sha7>"
    "brief": "32",
    "branch": "spec/03-x",
    "state": "planned",                   // waiting | planned | dispatched | pending | merge-ready | merged | stopped | done
    "waitingOn": null,                    // the spec-status reason while waiting (e.g. "brief 32 depends on 31")
    "agent": null,                        // the name the session gave the worker at --mark dispatched
    "worktree": null,                     // resolved at --mark returned from git worktree list
    "question": null,                     // pending file path while pending
    "stoppedReason": null,
    "gate": null,                         // green | red after --mark merged
    "standingApplied": []                 // [{kind, label, at}]
  }],
  "lastGate": null                        // {"lane": "L1", "result": "red", "log": "<path>"} drives MERGE_RED
}
```

Worker prompt (D6), printed verbatim with the values filled:

```
Lane L1 — run specs/20261102/03-x.md to its next stop. You are in your own worktree; first run
`git switch spec/03-x 2>/dev/null || git switch -c spec/03-x`, then `/spec:run specs/20261102/03-x.md`.
Stop and report as soon as the driver prints one of: PENDING_QUESTION, MERGE_READY, STOPPED, DONE —
your final line is that driver line verbatim. Never write an answer into .claude/pending-question.json
and never guess an answer (core § Delegated Stops); the parent session relays it and resumes you.
A mark prints the next step — act on that print, never re-run the driver bare to see it again. Write
files with the Write tool and run each driver line as one plain command (the worktree guard refuses
a heredoc combined with a driver call).
```

Driver step headers (D3–D10), the first line of each printed step:

```
[fanout-driver] state: <STATE>  root: <root>
## Step: plan the lanes            ## Step: standing answers            ## Step: dispatch <n> lanes
## Step: relay <n> questions       ## Step: merge <id>                   ## MERGE_RED — main gate red after <id>
## WAIT — <n> lanes running        ## Step: report
```

Marks: `planned` · `standing --repair-round … --build-escalate … --prototype-close …` ·
`dispatched --lane --agent` · `returned --lane [--stopped]` · `answered --lane --id --label` ·
`dismissed --lane` · `resumed --lane` · `merged --lane` · `gate-repaired` · `reported`.
Exit codes: 0 step/mark/state · 2 refused (wrong root, unknown mark, mark outside its state, lane
not merged, a lane id that is not in the table) — stderr names the remedy.

## Behavior

- **One run per repo:** PLAN refuses with `a fan-out is already running — delete <file> to start over`
  when the file exists and `--mark` is absent and the state is not PLAN; a bare run otherwise resumes.
- **Parked lanes:** a `/spec:run` entry whose branch lives in a linked worktree is never dispatched; the
  table prints the ⏸ line with the hand command.
- **Choosing lanes:** `/spec:fanout` alone takes the queue's startable lanes in one wave; `/spec:fanout <spec>…`
  runs exactly those, in the order given — a member blocked by a dependency or held back for a shared brief waits
  and is dispatched as soon as the lane it waits on has merged (D4a); `--lanes N` caps concurrency in either form.
- **Standing answers:** applied only at RELAY and only for the three kinds; every application is one
  `📌 Auto-picked` line and one `standingApplied` entry; the report's `warns` lists them.
- **Dismissal:** `--mark dismissed` runs `pending-question.js dismiss`; the lane's next bare driver run
  (spec 02 D5) prints STOPPED; `--mark returned` then records `stopped — question dismissed`.
- **Merge order:** table order, one at a time, never while a lane is `pending` (a pending question may
  change that lane's outcome, and the user is mid-answer); MERGE_RED blocks every merge until
  `gate-repaired` is green.
- **Fix lanes:** run one after another after the run lanes (`F1` dispatched when no run lane is
  `planned`; `F2` when `F1` is terminal); merged through `/git:merge` in session.
- **/clear:** every step re-derives from the file and disk; agent names are in the file, so
  `SendMessage` resumes work after a `/clear`; a worker the harness has forgotten is a hand-resume stop.
- **Concurrency:** the Agent tool caps concurrent sub-agents (A2); `--lanes` defaults to 4 and the
  driver never dispatches more than the cap in one message.

## Acceptance Criteria

- **AC-20261102-03-1**: WHEN `spec-status --root <main> --lanes --json` runs on a host with brief 32
  carrying two hardened specs (`03-x`, `06-y`) and brief 33 (independent) carrying one hardened spec
  `04-z`, with `spec/06-y` checked out in a linked worktree THE SYSTEM SHALL print
  `lanes` = `[03-x (brief 32, branch spec/03-x, worktree null), 04-z (brief 33, …)]`, `serialized` =
  `[{path: 06-y, brief: "32", reason: "shared brief 32"}]`, and the `worktree` of `06-y`'s entry, had it
  been admitted, resolved — i.e. a second run with `06-y` top-ranked prints its `worktree` as the linked
  path → writes tests/spec-status.test.js
- **AC-20261102-03-2**: WHEN the host's queue holds a `--lane fix` item `q107` and the ledger carries a
  red-CI row THE SYSTEM SHALL print `fixes` with two entries, `{action: "/spec:fix q107", queue_id:
  "q107"}` and `{action: "/spec:fix", path: <spec>, queue_id: null}` → writes tests/spec-status.test.js
- **AC-20261102-03-19**: WHEN `--next --json`, `--json` and the bare dashboard run on the AC-2 host THE
  SYSTEM SHALL CONTINUE TO print the shapes they print today (e.g. `--next --json`'s first entry carries
  exactly the keys `action, path, status, brief, blockers, note, parallel, parallel_reason` and no
  `branch`/`worktree` key) → writes tests/spec-status.test.js
- **AC-20261102-03-3**: WHEN `--lanes --json` runs with cwd inside a linked worktree THE SYSTEM SHALL
  exit 2 with stderr `spec-status: --lanes runs from the main worktree — cd <main root>`
  → writes tests/spec-status.test.js
- **AC-20261102-03-4**: WHEN `agentCall(root, 'lanes', 'general-purpose', {isolation: 'worktree',
  background: true})` runs on a host with no policy block THE SYSTEM SHALL return `Agent {subagent_type:
  "general-purpose", model: opus, effort: medium, isolation: "worktree", run_in_background: true}`;
  with `policy.models.lanes: {model: "sonnet"}` → `model: sonnet, effort: medium`;
  `validatePolicy({models: {lanes: {model: "gpt"}}})` SHALL report one finding naming `lanes`
  → writes tests/host-config/policy-block.test.js
- **AC-20261102-03-20**: WHEN `agentCall(root, 'reviewer', 'spec:reviewer')` runs with no fourth argument
  THE SYSTEM SHALL CONTINUE TO return `Agent {subagent_type: "spec:reviewer", model: fable, effort: low}`
  (no trailing `isolation` or `run_in_background` text) → writes tests/host-config/policy-block.test.js
- **AC-20261102-03-5**: WHEN `fanout-driver --root <main>` runs with no state file THE SYSTEM SHALL
  print `[fanout-driver] state: PLAN` then `## Step: plan the lanes`, a table with one row per lane
  (`L1  specs/…/03-x.md  brief 32  spec/03-x`), the ⏸ line for the parked lane, and `Then: node … --mark
  planned`, writing the file with every lane `planned` and `standing: null`; `--state` SHALL print `PLAN`
  before the file exists and `PREFLIGHT` after `--mark planned` → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-6**: WHEN the driver runs from inside a linked worktree, or with an unknown mark, or
  with `--mark merged --lane L9` THE SYSTEM SHALL exit 2 with stderr `fanout-driver: run from the main
  worktree — cd <root>`, `fanout-driver: unknown mark "x"`, `fanout-driver: no lane L9 in the table`
  respectively, and leave the file unchanged → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-7**: WHEN PLAN runs with `--lanes 1` on the AC-1 host THE SYSTEM SHALL admit only
  `03-x`; with `--override-serial --lanes 4` SHALL admit `03-x`, `04-z` and `06-y`'s sibling with reason
  `shared brief 32` but never an entry whose reason starts `brief 32 depends on`; with `--include-fixes`
  SHALL append lanes `F1` (`fix/q107`) and `F2` (`fix/ci-<sha7>`) with `kind: "fix"`
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-21**: WHEN PLAN runs with `--spec specs/…/04-z.md --spec specs/…/03-x.md --spec specs/…/06-y.md --spec specs/…/nope.md` on the AC-1 host THE SYSTEM SHALL admit exactly `L1 = 04-z`, `L2 = 03-x` in that order, table `06-y` `waiting` with `waitingOn: "shared brief 32"` (D4), print `⛔ specs/…/nope.md — not a startable lane`, record `options.specs` as the four paths given, and with `--spec specs/…/06-y.md --override-serial` SHALL admit `06-y`
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-22**: WHEN PLAN runs with `--spec specs/…/03-x.md --spec specs/…/06-y.md` (same brief) THE SYSTEM SHALL table `L1 = 03-x` `planned` and `L2 = 06-y` `waiting` with `waitingOn: "shared brief 32"`; after `L1` reaches `merged` (fixture merge, gate green) `--mark merged --lane L1` SHALL flip `L2` to `planned` and the next bare run SHALL print `## Step: dispatch 1 lanes` naming `06-y`; and when instead `L1` is marked `returned --stopped "worker gone"` the next bare run SHALL print `## Step: report` with the bullet `specs/…/06-y.md: not started — waited on specs/…/03-x.md, which stopped`
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-8**: WHEN a bare run finds an existing file in state DISPATCH THE SYSTEM SHALL print
  the DISPATCH step (resume), and a bare run with no `--mark` whose file is in PLAN with lanes already
  `planned` SHALL re-print the plan table unchanged → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-9**: WHEN PREFLIGHT prints THE SYSTEM SHALL print one AskUserQuestion block whose three
  headers are `Repair round`, `Build cap`, `Prototype`, whose first option in each is `ask me when it
  happens (Recommended)`, whose other labels equal the review driver's STOPPED labels, the build driver's
  ESCALATE labels and the MERGE prototype labels respectively, and `question-style-gate.js --file` over
  the block written as a document SHALL exit 0; `--mark standing --repair-round "run one in-session
  repair round (Recommended)" --build-escalate ask --prototype-close ask` SHALL write exactly that
  `standing` object; `--build-escalate coffee` SHALL exit 2 naming the labels
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-10**: WHEN DISPATCH prints for two planned run lanes THE SYSTEM SHALL print exactly
  two `Agent {subagent_type: "general-purpose", model: opus, effort: medium, isolation: "worktree",
  run_in_background: true}` lines, each followed by the worker prompt carrying the lane id, `git switch
  spec/03-x 2>/dev/null || git switch -c spec/03-x`, `/spec:run specs/…/03-x.md`, and the sentence
  `Never write an answer into .claude/pending-question.json`, then two `--mark dispatched --lane L<n>
  --agent <name>` lines; `--mark dispatched --lane L1 --agent lane-one` SHALL set `L1.agent = "lane-one"`,
  `state: "dispatched"` → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-11**: WHEN `--mark returned --lane L1` runs with `L1`'s branch in a linked worktree
  holding `.claude/pending-question.json` THE SYSTEM SHALL set `state: "pending"`, `worktree`, and
  `question` to that path; with a `review-state.json` whose marks are `{closed: true}` and no pending
  file → `merge-ready`; with `marks.dismissedStop` in the build sidecar → `stopped`, reason `question
  dismissed`; with no worktree holding the branch → `stopped`, reason `worktree not found`; with
  `--stopped "worker gone"` → that reason → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-12**: WHEN RELAY runs with `L1` pending a `repair-round` question and `standing["repair-round"]`
  = `run one in-session repair round (Recommended)` THE SYSTEM SHALL run `pending-question.js answer --by
  standing` (the file's `answers.q1.by` reads `standing`), print `📌 Auto-picked run one in-session repair
  round (Recommended) — standing answer from preflight (veto anytime)`, print the `SendMessage {to:
  "lane-one", …}` line and `--mark resumed --lane L1`, and ask nothing
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-13**: WHEN RELAY runs with `L1` pending a `dispositions` file of five questions and
  `L2` pending a `red-findings` file of one, with no standing answers THE SYSTEM SHALL print one
  AskUserQuestion block of four questions (headers `L1 · s0` … `L1 · s3`), then a second block (`L1 · s4`,
  `L2 · q1`), each question text naming the lane's spec, and `--mark answered --lane L1 --id s0 --label
  "accept waive (Recommended)"` SHALL write `answers.s0 = {label, by: "user", at}` into `L1`'s file;
  after the five `L1` answers the next bare run SHALL print `L1`'s SendMessage line and no question for
  `L1` → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-14**: WHEN RELAY runs with `L1` pending a file whose option description is `"ok"` THE
  SYSTEM SHALL set `L1` `stopped` with reason starting `malformed question:` and relay nothing for it;
  `--mark dismissed --lane L2` SHALL set `L2`'s file `dismissed.at` and print `L2`'s SendMessage line
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-15**: WHEN MERGE prints for `L1` merge-ready in a worktree at `<wt>` THE SYSTEM SHALL
  print `run from <root>: node "$(spec-paths review-driver)" <wt>/specs/…/03-x.md` and `--mark merged
  --lane L1`, and with `L2` also merge-ready SHALL name only `L1`; with `L2` pending SHALL print RELAY,
  not MERGE → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-16**: WHEN `--mark merged --lane L1` runs while `spec/03-x` still exists and is not
  contained in `HEAD` THE SYSTEM SHALL exit 2 `fanout-driver: lane L1 is not merged — run the MERGE step
  first`; when the branch is contained (a fixture merge commit) and the host gate is `bash ./gate.sh`
  exiting 0 THE SYSTEM SHALL run it with cwd `<root>`, write `<git-common-dir>/spec-fanout/L1.gate.log`,
  set `gate: "green"`, `state: "merged"` → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-17**: WHEN `--mark merged --lane L1` runs the gate and it exits 1 THE SYSTEM SHALL set
  `gate: "red"`, `lastGate: {lane: "L1", result: "red", log}`, print `## MERGE_RED — main gate red after
  L1` with the log path and the line `node "$(spec-paths spec-queue)" add "main gate red after merging
  L1: <log>" --lane fix --top`; a following `--mark merged --lane L2` SHALL exit 2 naming `gate-repaired`;
  `--mark gate-repaired` with the gate now exiting 0 SHALL clear `lastGate` and the next bare run SHALL
  print `## Step: merge L2` → writes tests/fanout/fanout-driver.test.js
- **AC-20261102-03-18**: WHEN every lane is terminal (`L1` merged green, `L2` stopped `question dismissed`,
  one standing auto-pick applied) THE SYSTEM SHALL write `<git-common-dir>/spec-fanout/report.json` with
  `outcome: {anchor: "⚠️", text: "fan-out finished with stops — 1 merged, 1 stopped"}`, `bullets`
  `["specs/…/03-x.md: merged (gate green)", "specs/…/04-z.md: stopped — question dismissed"]`, `warns`
  one line starting `standing answer applied`, `next: {kind: "status-verbatim", text: <spec-status --next
  output>}`, print the `report-render --slots` line and `--mark reported`; the mark SHALL delete the state
  file and the directory, and `report-render --slots` over that file SHALL exit 0
  → writes tests/fanout/fanout-driver.test.js

## Assumptions (escalation triggers)

- A1: A worktree-isolated sub-agent (`Agent {isolation: "worktree"}`) runs with cwd pinned to
  `<root>/.claude/worktrees/agent-<id>` on a branch `worktree-agent-<id>` cut from the default branch;
  its cwd resets to that worktree on every tool call; `git switch -c spec/<stem>` there succeeds; a
  worktree that changed survives the worker's return unlocked and still listed; and a `SendMessage`
  resume lands the same worker back in that worktree on that branch with its commit intact —
  **executed 2026-11-02** in this repo with two haiku probes (first return: cwd
  `…/agent-a7789f28f773ab50f`, `Switched to a new branch 'spec/probe-fanout'`, commit `066d4ca6`;
  `git worktree list --porcelain` from main listed it on `refs/heads/spec/probe-fanout`; after resume:
  same cwd, same branch, `probe-fanout.txt` present). An *unchanged* worktree is removed at return and a
  resume then lands in the main root (observed on the first probe). A worktree can stay **locked** after
  the worker's return (`lock reason: claude agent agent-<id> (pid …)`, observed 2026-11-02 on the spec 02
  lane after a resume): `merge-back.sh cleanup` refuses it, so D9 unlocks first. — **if false:** D6's prompt makes the
  worker print `pwd` as its first line and D7 reads the worktree from that line via `--worktree <path>`;
  the branch switch stays.
- A2: The Agent tool refuses a 21st concurrent sub-agent (`Concurrent subagent limit reached`,
  docs code.claude.com/docs/en/sub-agents, read 2026-11-02; env `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
  raises it) — not executed. — **if false:** `--lanes` still caps; nothing else depends on it.
- A3: `git merge-base --is-ancestor <branch> HEAD` exits 0 when the branch is contained and 1 when not,
  and `git branch --list <name>` prints nothing for a deleted branch — standard git (2.47.3 here), the
  same calls `spec-review-driver.js` makes at re-entry (`rev-list target..source`). — **if false:** D9
  uses `rev-list --count HEAD..<branch>` equal to 0 instead.
- A4: `lib/gate-resolve.js`'s `resolveGate(config, specPath, root)` returns `{gate}` for a spec with tests
  rows (its header, lines 13–18) and `config.testCommand` with no file argument runs the host's whole
  suite (this repo's `node --test …` discovers `**/*.test.js`; `init-gen.js` probes `testCommand` that
  way). — **if false:** a fix lane's post-merge check runs `postGateCommand` when declared, else prints
  `gate unavailable for a fix lane — run it by hand` and records `gate: null`.
- A5: `spec-status.js`'s `laneAdmission` and `briefSerialReason` are callable before the `--next`/`--json`
  exits once the new mode is dispatched ahead of them (they are plain functions at 536 and 749); no test
  pins the argv dispatch order. — **if false:** the mode hoists the two functions, unchanged.
- A6: `tests/consistency/dispatch-seat.test.js` accepts an `Agent {` literal that comes from `agentCall`
  with a fourth argument (its scan refuses the literal in scripts other than `lib/host-config.js`) —
  the new driver never types one. — **if false:** the driver imports the builder exactly as the review
  driver does; the test is never weakened.

## Rationale

Every tool surveyed in 2026 converged on worktree-per-agent plus a serialized merge queue (Gas
Town's Refinery, mergetrain, Conductor); none ships a contract for a worker that has to ask a human
mid-task. Spec 02 built that contract; this spec is the queue on top of it. Three choices were
deliberate. **Harness worktrees, not the plugin's own:** a sub-agent's cwd is per-call and only
`isolation: worktree` pins it inside a worktree, which the write-isolation hook needs; the probes
showed the worktree survives and resume lands back in it, and one `git switch` makes it the lane's
branch so the review's existing merge path finds it. The plugin's `.claude/worktrees/spec-<stem>`
stays the in-session path. **Standing answers in the orchestrator, not the drivers:** the drivers
keep one stop shape; the parent answers the three policy-shaped kinds from a sheet the user filled,
printing the derived line each time, so "no automatic answers" still holds — the user answered, just
earlier. **Merge in the parent through the review driver's own MERGE step:** the driver already parks
there, demands the main-root CWD and promotes the ledger; the fan-out adds only ordering and the gate
on main. The ledger file never collided in the plugin's design (rows are promoted, not committed on
the branch), so the brief's collision concern reduces to host files such as a migration journal,
which serial merge plus the review driver's CONFLICTS stop already cover.

Rejected: fork agents (every lane carries the parent's whole context); agent teams, `claude -p`
workers and the Agent SDK (subscription billing and the OAuth terms); re-dispatching a vanished
worker into a fresh worktree (the old worktree still holds the branch — a hand-resume is the only
honest exit); a hook denying answer writes (spec 02 Rationale). Fragile: the Agent tool's background
and resume semantics are documented but young — the file-based table is the insulation, so a harness
change rewrites the thin command, never the lanes.

Collision closure (literals `POLICY_SEATS`, `agentCall`, `laneAdmission`, `SECTIONS=`), two hits
waived: `tests/consistency/dispatch-seat.test.js` names the three seats only in a comment and scans
scripts for hand-typed `Agent {` literals, which D2's builder extension never adds; the
`tests/consistency/prose-pins.test.js` pin on `SECTIONS=` reads the `run` and `fix` rows, which D11's
new `fanout` row leaves untouched. The `executes` hits on `spec-status.js`, `host-config.js` and
`spec-paths` are the suites D1, D2 and D12 extend in place; their shapes are pinned as CONTINUE-TO
criteria (AC-19, AC-20).

### Build deviations (folded at close, review rv_bdccc6a67b0a — one-offs; Gotchas held at cap)
- AC-20261102-03-21 vs D4/D4a: the AC text says a listed shared-brief spec prints `⛔ <path> — shared brief 32` and is excluded; D4 (authoritative) tables it as `waiting` and AC-22 pins that for the same input. The test follows D4: it asserts the two startable specs are the only `planned` lanes and that 06-y is `waiting` or absent, and pins the `⛔` line only for the unknown spec.
- The spec fixes no print format for an AskUserQuestion block, so the tests parse every balanced JSON object carrying a `questions` array out of the step's stdout (`askBlocks` in tests/fanout/fixture.js); the driver may print it as `AskUserQuestion {…}` or a bare document.
- AC-20261102-03-9 compares PREFLIGHT's non-ask labels to the labels the review and build drivers print, read from their source text; the build driver's re-arm label is compared without its `(Recommended …)` suffix because the driver adds that suffix per run.
- AC-20261102-03-5: `--state` is pinned as read-only (it must not create the state file), a reading of "print `PLAN` before the file exists".
- The AC-1 host is exercised in tests/spec-status.test.js with a queue file seeded directly in `.git/spec-queue.json` (`seq` 107) so the queued fix item has the id `q107` the AC names.
- Contracts `resolveGate(config, specPath, root)` vs the library: lib/gate-resolve.js exports `resolveGate(specText, config)`; fanout-driver.js reads the merged spec text from the main root and calls the real signature.
- D1 main-worktree refusal: the tests run `--lanes --json --root <main>` from an unrelated cwd (AC-1) and from inside a linked worktree of that repo (AC-3), so spec-status refuses only when cwd's toplevel is a LINKED worktree of the repo `--root` names (a cwd outside that repo passes), not "toplevel is not the first worktree-list entry". fanout-driver.js applies the same rule and additionally refuses a `--root` that is not the main worktree.
- State file contract gains three keys beyond Contracts: `admitted` (false until `--mark planned`; AC-8 needs a file that is still in PLAN after a bare run), `notes` (the ⏸/⛔ lines, so a re-printed plan table is byte-identical) and `queued` (the D9 queue lines the report's `queued` slot carries); a fix lane also carries `note` (the CI evidence line).
- D4/D3 gap: with `--spec`, every startable listed spec enters the table `planned` (not cap-trimmed); `--lanes N` bounds concurrency at DISPATCH (capacity = N minus lanes in dispatched/pending/merge-ready), which D4a states ("the cap bounds concurrency, not the list"). Without `--spec` the candidates are trimmed to N at PLAN as D4 says.
- D4 reasons for a listed spec absent from `lanes` and `serialized`: the driver reads `spec-status --next --json` — blocked `/spec:run` entry → `waiting` with its blockers as `waitingOn`; a non-`/spec:run` entry → `⛔ … next step is <action>, not /spec:run`; no entry → `⛔ … not a startable lane`.
- Fix-lane order: F1 is the queued fix, F2 the CI escape (AC-7 pins it), the reverse of `fixes`' own order.
- D9 prototype standing answer: MERGE prints the standing label for the session to apply; the driver cannot observe that application, so it is not written to `standingApplied` and the report's `warns` counts only RELAY auto-picks.
- A mark prints the next step without RELAY side effects (no standing auto-pick, no style gate); only a bare run applies them. AC-12 asserts the `📌 Auto-picked` line on the bare run after `--mark returned`, which the mark would otherwise consume.
- tests/spec-paths.test.js `shared-for … scoped roster has exactly 13 members` collides with D11's new `fanout` section row (roster becomes 14); the test is outside this worker's remit and was left red for the orchestrator.
- spec/entrypoints.json (D12) is not in this worker's file list; tests/consistency/entrypoints.test.js stays red until that row lands.
- spec/entrypoints.json: besides D12's own key, added `spec/scripts/fanout-driver.js` to the entryPoints of spec-status.js, spec-review-driver.js, spec-queue.js, report-render.js and merge-back.sh, because tests/consistency/entrypoints.test.js requires each callee's entry to declare its invoker.
- MERGE_RED placement: D3 puts it inside MERGE ("gate red on the last merge → MERGE_RED first") and D9 only refuses further `--mark merged`, leaving the state with no merge-ready lane unsettled. The driver reaches MERGE_RED after DISPATCH and RELAY and ahead of MERGE, WAIT and REPORT whenever the last gate is red, so a red main stays visible even with no lane merge-ready and the run cannot report past it; `--mark merged` is refused while red.

### Advisory debt (review rv_bdccc6a67b0a)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/agent-adc2734e7a4ab8e43/spec/scripts/fanout-driver.js:147 — MERGE_RED is reached ahead of WAIT and REPORT whenever lastGate is red even with no lane merge-ready (recorded deviation): D3 places MERGE_RED only as the sub-case of MERGE ("no lane pending, any lane merge-ready; gate red on the last merge → MERGE_RED first"), so strict D3 would print WAIT or REPORT in that state.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/agent-adc2734e7a4ab8e43/spec/scripts/spec-status.js:736 — D1's main-worktree refusal is narrowed (recorded deviation): `--lanes --json` refuses only when cwd's toplevel is a LINKED worktree of the repo `--root` names. (Carried from iteration 1, outside this fix-delta's files; unchanged.)
- a2 /home/jj/projects/claude-plugins/.claude/worktrees/agent-adc2734e7a4ab8e43/spec/scripts/fanout-driver.js:212 — With `--spec`, PLAN tables every startable listed spec as `planned` without trimming to `--lanes N` (recorded deviation); the cap is applied only at DISPATCH. (Carried from iteration 1; the fix did not touch this path.)
- a3 /home/jj/projects/claude-plugins/.claude/worktrees/agent-adc2734e7a4ab8e43/spec/scripts/fanout-driver.js:154 — Printed command lines splice root, worktree and spec paths into shell text unquoted; a path containing a space ends the pasted command early. (Carried from iteration 1; unchanged; advisory because AC-15 prescribes this form.)

## Canonical Delta

`docs/canonical/status.md` gains a `--lanes --json` paragraph: "A third machine mode beside
`--next --json` and `--json`: `{lanes, serialized, fixes}` — the admitted `/spec:run` lanes with their
`spec/<stem>` branch and the linked worktree holding it (or null), the entries held back with their
reason, and the `/spec:fix` escapes and queued fixes with their queue id. Refused outside the main
worktree. Consumed by `/spec:fanout`'s driver; the two older shapes are unchanged."
`docs/canonical/pipeline.md` gains one line under lanes: "`/spec:fanout` runs the lanes from one
session: `fanout-driver.js` over `<git-common-dir>/spec-fanout.json`, worktree-isolated sub-agents on
the `lanes` seat, standing answers for `repair-round`/`build-escalate`/`prototype-close`, serialized
merge through the review driver's MERGE step with the gate re-run on main after each."
