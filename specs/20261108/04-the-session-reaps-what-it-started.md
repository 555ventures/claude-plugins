---
date: 2026-11-08
status: hardened
area: host
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md]
brief: n/a
architecture: true
breaking: false
---

# The session reaps what it started

## Intent
- You asked: "You never clean up dev servers and processes after you done.. this causes a lot of orphan processes and dev servers accummulate.. v7 was handling fine, what happened to v8?" — and a user's report of servers 5 to 32 days old, started with `nohup`, left running in deleted worktrees, or leaked by a session that died.
- I will build:
  - `host.release(root, wt, opts)`: stop every process running for or from a worktree, then remove it; all five removal paths call it and `git.worktreeRemove` has no other caller in `spec/scripts`.
  - `spec/scripts/reap.js`, a hook CLI over spec 01's `lib/reap.js`: `session-start` sweeps this repo, `session-end` stops everything this session started.
  - Two hook arms, SessionStart and SessionEnd, in `spec/hooks/hooks.json`.
- I will not touch:
  - `lib/app.js`, `lib/reap.js`'s sweep rule and the `SPEC_APP` tag (spec 01 D3, D10); the existing three hook arms; the gate.
  - Any command-shape guard on Bash: `nohup`, `&` and `setsid` stay allowed, because the sweep catches what they start through `CLAUDE_PID`.
- Users will notice: quitting Claude stops every server the session started; deleting a worktree stops what ran from it; a session that crashed leaves nothing behind after the next session opens in that repo.
- You lose: a server started inside a Claude session no longer survives the session's exit, including one you started with `!`.
- Architecture or behaviour change: yes — the session's life bounds every process it started (ADR-0049's owner bullet), needs your yes
- Client sign-off: whether anything a session starts may outlive it — JJ chose no, on the design Fable reviewed twice (2026-11-08)

## Goal

After `/exit`, no process carrying the session's `CLAUDE_PID` is alive; after a land, a park, a prototype `closed` or a fanout discard, no process tagged with or running from the removed worktree is alive; after a SIGKILLed session, the next SessionStart in the same repo leaves none of its processes under the repo alive. Nothing a live session owns, and nothing outside the repo, is touched by a sweep.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `host.release(root, wt, {deleteBranch, force}) → git.worktreeRemove's result`: `reap.kill` over `reap.tagged(wt)` plus every process carrying any `CLAUDE_PID` whose cwd is under `wt` (`reap.cwdUnder`), minus `process.pid` and its ancestors, then `git.worktreeRemove`. | A removed worktree whose server still runs is the reported leak; one seam is the only way all removal paths keep it. A process without `CLAUDE_PID` (the user's own terminal) is never ours to kill. The driver's own ancestry may sit in the worktree. |
| D2 | `land.js`, `run.js` (setup failure), `prototype.js` (`closed`, replacing spec 01 D4's `app.stop` + remove pair), `fanout.js` (`dismissed --discard`) and `red-check.js` (its throwaway worktree, whose test run may boot servers) call `host.release`; none calls `git.worktreeRemove`. | Five callers of one fact; `red-check`'s worktree runs the host's tests, which may start processes. |
| D3 | `spec/scripts/reap.js session-start`: reads hook stdin JSON, resolves the repo root from its `cwd` (no repo: exit 0), runs `reap.sweep(root)`, and prints `🧹 stopped <n> process(es) a closed session left in this repo` only when n > 0. Always exits 0; any error is swallowed. | The crash path: SessionEnd cannot fire on SIGKILL. One line only when it acted, so a clean start adds nothing to the session's context (the retired session-start queue injection stays retired). A hook must never block a session. |
| D4 | `reap.js session-end`: reads stdin `reason`; for `clear` and `resume` it does nothing (the process lives on). Otherwise the owner is `CLAUDE_PID`, else the nearest ancestor named `claude`; it kills every process carrying that owner, minus itself and its ancestors, TERM then KILL after 1 s. Exits 0 always. | The normal path for "stops when the session ends". `/clear` keeps the same process, and a prototype app must survive it. The 1.5 s default budget needs the short grace. |
| D5 | `spec/hooks/hooks.json` gains `SessionStart` and `SessionEnd` arms: `node "${CLAUDE_PLUGIN_ROOT}/scripts/reap.js" session-start` / `session-end`, `timeout: 5`. | Two arms, one CLI, one reaper module shared with `lib/app.js`. |
| D6 | Docs: `docs/v8/architecture.md` §7 lists both arms and `reap.js`; `docs/v8/interface-contract.md` states that nothing a session starts outlives it and that a `bootCommand` must not clear its env (`env -i`, sudo, a container), or only its process group is stopped. | The docs list what exists; the env limit is the one gap the user must know. |
| D7 | Tests by execution: `tests/hooks.test.js` runs `reap.js` with fixture stdin against stand-in processes (`sleep` owners, `node` children with `CLAUDE_PID`/`SPEC_APP` env and a cwd); `tests/host.test.js` proves `release` on a worktree with a live child; existing removal-path tests keep passing through `release`. | Hooks are critical tier: each arm needs an engage case and a non-trigger control. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/host.js | MODIFY | D1 `release` |
| spec/scripts/lib/land.js + spec/scripts/run.js + spec/scripts/prototype.js + spec/scripts/fanout.js + spec/scripts/red-check.js | MODIFY | D2 |
| spec/scripts/reap.js | CREATE | D3, D4 |
| spec/hooks/hooks.json | MODIFY | D5 |
| docs/v8/architecture.md + docs/v8/interface-contract.md | MODIFY | D6 |
| tests/hooks.test.js + tests/host.test.js | MODIFY | D7 |

## Acceptance Criteria

- **AC-20261108-04-1**: WHEN a worktree has a child process with `SPEC_APP=<wt>`, a second with any `CLAUDE_PID` and cwd inside it, and a third with neither tag but cwd inside it, and `host.release` runs THE SYSTEM SHALL kill the first two, leave the third alive, and remove the worktree.
- **AC-20261108-04-2**: WHEN `spec/scripts` is grepped THE SYSTEM SHALL find `worktreeRemove(` only in `lib/git.js` and `lib/host.js`.
- **AC-20261108-04-3**: WHEN `reap.js session-start` runs with stdin `cwd` inside a repo where a SIGKILLed stand-in owner left one `SPEC_APP` process and one untagged process with cwd under the repo, plus one with cwd outside it and one with a live owner THE SYSTEM SHALL kill the first two, print the `🧹 stopped 2` line and exit 0; AND with nothing to reap it SHALL print nothing and exit 0; AND with `cwd` outside any repo or stdin `not json` it SHALL exit 0.
- **AC-20261108-04-4**: WHEN `reap.js session-end` runs with `reason: "prompt_input_exit"` and `CLAUDE_PID` set to a live stand-in owner THE SYSTEM SHALL kill every process carrying that owner within 2 s and leave a process carrying another owner alive; AND WHEN `reason` is `clear` or `resume` THE SYSTEM SHALL kill nothing; AND it SHALL exit 0 in every case.
- **AC-20261108-04-5**: WHEN `spec/hooks/hooks.json` is read THE SYSTEM SHALL find one `SessionStart` and one `SessionEnd` arm, each calling `scripts/reap.js` with `timeout: 5`, and the three existing arms unchanged.

## Assumptions

- A1: Hook processes inherit `CLAUDE_PID` as Bash-tool children do — if false: D4's ancestor walk finds the `claude` process; AC-4 passes the owner by env, so a separate case pins the walk.
- A2: SessionEnd fires on `/exit`, Ctrl-D and terminal close, and not on SIGKILL (docs list `prompt_input_exit`, `logout`, `other`) — if false on terminal close: D3's sweep at the next start covers it.
- A3: Spec 01 lands first with `lib/reap.js`'s `kill`, `tagged`, `cwdUnder`, `sweep` as D10 names them — if false: rebase onto the names it shipped; the seam does not change.
