---
description: Take one hardened spec through build, review and merge in its own worktree
argument-hint: <spec path> [--in-place]
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Edit, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js $ARGUMENTS`. You dispatch agents; the driver opens
the worktree, gates, commits and merges. Every `▶ when done:` line carries `--root`, the
checkout the driver works in (a lane's worktree under fanout); run it as printed.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief, mark `built`,
  `repaired` or `fixed`, then re-run the driver for the next step.
- **REVIEW**: dispatch one `spec:reviewer`, then mark `reviewed --file <findings path>`;
  a clean review runs through to DONE itself. Relay advisories in the final report; never act
  on them.
- **ESCALATE**: ask the printed question and mark `escalate <choice>`.
- **CONFLICTS**: ask; on `resolve`, fix each file by both sides' intent in the main checkout
  and mark `conflicts-resolved`. A lane at **MERGE_READY** with a rebase in progress edits the
  conflicted files to both sides' intent, re-runs the driver, then stops.

`--fix "<symptom>"` is lane-only (fanout runs a queued `/spec:fix` item this way): the brief is the
symptom, the commit is `fix(<id>): <symptom>`; outside a lane it refuses, use `/spec:fix`.

As a lane, stop and return on `PENDING_QUESTION`. A lane never edits its spec's Decisions or any
other spec. A build that needs another spec done first marks `waiting --on <spec>` (BUILD, REPAIR,
FIX or REVIEW) and stops; a Decision it cannot honour is marked `unmet --decision <id> --why <text>`,
which asks instead of editing. A lane with a rebase in progress resolves it at any step: edit the
files, re-run the driver; it continues the rebase and prints the next step.
