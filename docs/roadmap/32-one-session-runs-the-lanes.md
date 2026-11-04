# 32 — One session runs the lanes

Phase: P3 · Depends on: — · Primary workspaces: spec/scripts/spec-review-driver.js,
spec/scripts/spec-build-driver.js, spec/scripts/question-style-gate.js, spec/scripts/lib,
spec/scripts/spec-status.js, spec/scripts/fanout-driver.js (new), spec/commands/{run,fix,fanout}.md,
spec/doctrine/core.md, tests · Risk: T2 (a hook surface and spec-status's frozen API are touched —
critical tier at plan; every new behaviour is gated on a child-session marker or a new flag, and a
session that never delegates is byte-for-byte unchanged) · Design stage: no · Expected specs: 2

<!-- Minted 2026-11-02 from the niko-hub session that ran four lanes by hand: /spec:run for three
     specs through sub-agents plus a serial fixes lane, with a manually enforced rule — never call
     AskUserQuestion, write the question down, stop, and let the parent relay it. The plugin did not
     enforce that rule, and the Claude Code harness removes AskUserQuestion from every sub-agent, so
     a driver that prints "Ask ONE AskUserQuestion" inside a sub-agent is instructing a tool that
     does not exist. Two landing units: the drivers learn to stop on disk when delegated (02), then
     one command dispatches, relays, merges and reports the queue's lanes (03). -->

## Result

A driver that runs inside a sub-agent never asks the user; it writes the question to disk and stops.
One command in the main session reads the queue's startable lanes, asks the predictable questions
up front, dispatches one worktree-isolated sub-agent per lane, relays every question the lanes
write (batched, answered by the user or by the up-front sheet, never by the worker), merges the
finished lanes into main one at a time with the gate re-run after each, and renders one report.

- **Delegated stop** — every AskUserQuestion site in the build and review drivers, in `/spec:run`'s
  Step 0 and in `/spec:fix`'s decisions stop has a second form: when the process is a child session,
  the driver writes `.claude/pending-question.json` at the lane's repo root (question, options with
  consequences, recommended pick, resume command) and prints a `PENDING_QUESTION` stop; a bare re-run
  with the file answered prints the resume step, dismissed prints STOP, unanswered waits.
- **Merge-ready stop** — a delegated review stops at MERGE with `MERGE_READY` instead of printing the
  merge-strategy mark; the orchestrator runs that mark from the main root, one lane at a time.
- **Lane dispatch** — `/spec:fanout [--pick]` reads a new
  `spec-status --lanes --json` surface, excludes lanes parked in a linked worktree, harvests the
  standing answers in one question round, prints one `Agent {…, isolation: "worktree"}` dispatch per
  lane with the lane's branch and the run command, and keeps the dispatch table in the git common
  dir so the run survives `/clear`.
- **Serialized merge-back** — merge-ready lanes land in queue order: the review driver's merge mark,
  then the host's gate on main; a red gate stops the queue with the `/spec:fix` paste.
- **One report** through `report-render.js`: per-lane verdict, merge status, open questions, and
  `spec-status --next` verbatim.

## Current state

- `spec-review-driver.js` prints `Ask ONE AskUserQuestion` at STOPPED, DISPOSITIONS, ESCALATE and the
  prototype arm of MERGE; `spec-build-driver.js` at RED_FINDINGS (critical tier) and ESCALATE;
  `run.md` Step 0 and `fix.md` steps 1, 4 and 6 ask in prose. None has a delegated form.
- A Claude Code sub-agent has no AskUserQuestion tool (executed probe 2026-11-02, with and without
  worktree isolation); `CLAUDE_CODE_CHILD_SESSION` is set in both; a worktree-isolated sub-agent's
  cwd is `.claude/worktrees/agent-<id>` on branch `worktree-agent-<id>` and resets to that directory
  on every tool call.
- The review driver already parks at MERGE after `--mark closed` until `--mark merge-strategy` runs
  from the main root; `merge-back.sh verify` runs no gate. Ledger rows are promoted into main's
  ledger at merge, so the ledger file itself does not collide between lanes.
- `spec-status.js`'s `laneAdmission` exists only in the dashboard render; `--next --json` carries
  `parallel`/`parallel_reason` but no lanes block and no paste commands.
- `lib/host-config.js` has three policy seats (`workers`, `reviewer`, `disposer`) and one `agentCall`
  builder; `tests/consistency/dispatch-seat.test.js` refuses a hand-typed `Agent {` in any script.

## Out of scope

Delegating `/spec:plan` (the planner seat and the critical lock confirmation need the user in
session). Automatic answers to any decision stop — the up-front sheet records the user's own answers
to the three policy-shaped stops and nothing else. Agent teams, `claude -p` workers and the Agent SDK
(subscription billing and the OAuth terms rule them out; the Agent tool is the one dispatch
surface). A hook that denies writes to the pending-question file (the worker has no AskUserQuestion to
bypass and the orchestrator is the only writer of the answer; a Bash write evades any Write/Edit hook
anyway). Cross-lane conflict prediction beyond today's File Plan overlap warning. A second
orchestrator session (one fanout table per repo).
