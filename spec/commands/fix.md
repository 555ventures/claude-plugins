---
description: Fix a bug at its root in this session, with a regression test, then commit
argument-hint: "[symptom in plain words]"
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Fix `$ARGUMENTS`, or the symptom under
discussion; ask only if there is neither.

1. Reproduce it and state the root cause in one sentence before the first edit.
2. Write a regression test that fails for that reason.
3. Fix the cause.
4. Run the config's `testCommand` until green.
5. After green, list every user-facing string you authored and every display or policy choice
   you made (hidden, reordered, defaulted, reformatted). When the list is not empty, ask ONE
   AskUserQuestion of at most four items, recommended answer first; a vetoed item reverts to the
   pre-fix behaviour before the commit. An empty list skips the stop silently.
6. Commit with `/git:commit`.

If the cause needs an architecture or behaviour change, stop before the first edit and offer
`/spec:plan` with the diagnosis instead. Report `✅ fixed — <symptom>` with the root cause and the guarding test.
