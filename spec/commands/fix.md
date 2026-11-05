---
description: Fix a bug at its root in this session, with a regression test, then commit
argument-hint: "[symptom in plain words]"
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Take the symptom from `$ARGUMENTS`, or the
conversation; ask only if there is neither. Then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js --fix "<symptom>" --in-place` (a session fix works in
the checkout it is in). You dispatch agents; the driver gates, commits and reports. Every
`▶ when done:` line carries the symptom and `--root`; run it as printed.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief (reproduce, root cause
  in one sentence, a regression test that fails for it, the fix, `fix.json`), mark `built`,
  `repaired` or `fixed`, then re-run the driver for the next step.
- **ESCALATE**: after green, when the fix authored user-facing strings or display or policy choices,
  ask the printed question (keep / revert / plan) and mark `escalate <label>`. An empty list is no
  stop. A red gate or review that will not clear asks its printed options the same way.
- **REVIEW**: dispatch one `spec:reviewer`, then mark `reviewed --file <findings path>`; a clean
  review commits `fix(<slug>): <symptom>` itself.

If the cause needs an architecture or behaviour change, the builder must stop before the first edit and
says so in `fix.json`; the driver ends the fix at `🚫 needs a spec` with `/spec:plan` queued.
Otherwise the report is `✅ fixed — <symptom>` with the root cause and the guarding test.
