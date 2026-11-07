---
description: Fix a bug at its root, in this session or as a fanout lane, with a regression test, then commit
argument-hint: "[--root <dir>] [<spec> — <symptom> | symptom in plain words]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Edit, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Take the symptom from `$ARGUMENTS`, or the
conversation; ask only if there is neither. This is the only fix command: a session and a fanout
lane both run it.

- **No `--root`** (a session fix, in the checkout it is in): drive
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js --fix "<symptom>" --in-place`.
- **A leading `--root <dir>`** (a fanout lane; `<dir>` is its worktree): drive
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js [<spec>] --fix "<symptom>" --root <dir>` with no
  `--in-place`, and read `${CLAUDE_PLUGIN_ROOT}/commands/run.md` for the step and lane rules (a rebase
  conflict, `PENDING_QUESTION`, `after --on`); a lane stops and returns on `PENDING_QUESTION`.
- **`<spec> — <symptom>`** binds the fix to that spec in both forms (pass `<spec>` first); it is what
  a queued bound fix already pastes. A fix on a spec with `prototype:` runs in place only, and its
  gate runs the pin tests and it stops at LOOK too. An in-place fix on a spec closes the queued
  `type: fix` item with that spec and symptom when it finishes.

A fix is the same run as a spec, on no spec file: the brief is the symptom, the reproduce-first
recipe and one criterion, the builder writes the cause and the regression test in `evidence.md`,
and the commit is `fix(<id>|<slug>): <symptom>` with that evidence in its body. You dispatch agents;
the driver gates, commits and reports. Every `▶ when done:` line carries the symptom and `--root`;
run it as printed.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief, mark `built`,
  `repaired` or `fixed`, then re-run the driver.
- **REVIEW**: dispatch one `spec:reviewer`, then mark `reviewed --file <findings path>`; a clean
  review commits itself. A gate or review that will not clear stops the fix with it queued again.

If the cause needs an architecture or behaviour change, the builder makes no edit and replies
`needs a plan: <why>`; mark `needs-plan --why "<why>"` and the fix stops with `/spec:plan` queued.
Otherwise the report is `✅ fixed — <symptom>`. The commit holds only what the fix touched; untracked
files that were there before it are warned as `left uncommitted: <paths>`.
