---
description: Fix a bug at its root in this session, with a regression test, then commit
argument-hint: "[symptom in plain words]"
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Fix `$ARGUMENTS`, or the symptom under
discussion. Ask only if there is neither.

1. Reproduce it. Before the first edit, state the root cause in one sentence.
2. Write a regression test that fails for that reason.
3. Fix the cause, then run the config's `testCommand` until green.
4. Commit with `/git:commit`.

If the root cause needs an architecture or behaviour change, offer `/spec:plan` with the
diagnosis instead. End with one report rendered by `lib/report.js`:
`✅ fixed — <symptom>`, with the root cause and the guarding test.
