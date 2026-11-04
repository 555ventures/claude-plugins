---
description: Fix a bug at its root in this session, with a regression test, then commit
argument-hint: "[symptom in plain words]"
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Fix `$ARGUMENTS`, or the symptom under
discussion; ask only if there is neither.

1. Reproduce it and state the root cause in one sentence before the first edit.
2. Write a regression test that fails for that reason.
3. Fix the cause and run the config's `testCommand` until green.
4. Commit with `/git:commit`.

If the cause needs an architecture or behaviour change, offer `/spec:plan` with the diagnosis
instead. Report `✅ fixed — <symptom>` with the root cause and the guarding test.
