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
  conflict, `PENDING_QUESTION`, `waiting --on`); a lane stops and returns on `PENDING_QUESTION`.
- **`<spec> — <symptom>`** binds the fix to that spec in both forms (pass `<spec>` first); it is what
  a queued bound fix already pastes. A fix on a spec with `prototype:` runs in place only, and it runs
  PIN_TESTS and LOOK too. An in-place fix on a spec closes the queued `type: fix` item with that spec
  and symptom when it finishes.

You dispatch agents; the driver gates, commits and reports. Every `▶ when done:` line carries the
symptom and `--root`; run it as printed. The brief is the symptom and the reproduce-first recipe, the
builder writes `fix.json`, and the commit is `fix(<id>|<slug>): <symptom>`.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief (reproduce, root cause
  in one sentence, a regression test that fails for it, the fix, `fix.json`), mark `built`,
  `repaired` or `fixed`, then re-run the driver for the next step.
- **ESCALATE**: after green, when the fix authored user-facing strings or display or policy choices,
  ask the printed question (keep / revert / plan) and mark `escalate <label>`. An empty list is no
  stop. A red gate or review that will not clear asks its printed options the same way. A file
  that looks like a secret stops the commit: ask the printed question (exclude / stage) and mark
  `escalate <label>`; exclude keeps it on disk and out of history.
- **REVIEW**: dispatch one `spec:reviewer`, then mark `reviewed --file <findings path>`; a clean
  review commits `fix(<slug>): <symptom>` itself.

If the cause needs an architecture or behaviour change, the builder must stop before the first edit and
says so in `fix.json`; the driver ends the fix at `🚫 needs a spec` with `/spec:plan` queued.
Otherwise the report is `✅ fixed — <symptom>` with the root cause and the guarding test. The commit holds
only what the fix touched; untracked files that were there before it are warned as `left uncommitted: <paths>`.
