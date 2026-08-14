---
name: stale-dispatch-premise-concurrent-session
description: A dispatching agent's framing of "this is RED today" can go stale mid-task if a concurrent session lands the fix while this task is running — verify against current git log, not the conversation-start git status snapshot or the prompt's own framing
metadata:
  type: feedback
---

This repo's spec pipeline runs autonomously and concurrently — other sessions (or background
workflow runs) can commit and merge specs while a dispatched sub-task is still executing. The
git status/log shown at conversation start is an explicit snapshot ("will not update during
the conversation" per the system reminder) and can be stale by the time a task actually reads
the repo.

**Why:** Dispatched to author two INTAKE red pins (JJ-20260814-01, JJ-20260814-02) on
2026-08-14. The second pin's corroborating sub-assertion — "six wf-*.body.js sources still
echo `args.runId`, assert zero, RED today (23 echoes), goes green when spec 06a builds" — was
already false by the time I checked: spec 06a had been built, reviewed CLEAN, and merged
(commits `ecf520b`/`a4aeb97`/`6a1cb1e`, version bump 6.67.0) *during this same conversation*,
after the dispatching agent's own git-status snapshot (which still showed `06a-*.md` as `??`
untracked). Grepping the six body sources for `runId` returned zero matches — the echo was
already deleted, and `tests/report/return-slots.test.js` already pinned its absence. Writing
the requested assertion verbatim would have produced a test that passes today, misrepresented
as an open backlog pin.

**How to apply:** Before authoring an INTAKE red pin from a dispatch prompt's incident
narrative, re-derive the current state independently: `git log --oneline -10` and grep the
actual files the incident describes, rather than trusting the prompt's "this is RED today"
framing or the conversation-start git status block. If part of a multi-part ask has already
been fixed by the time you check, do not write the stale assertion — drop that sub-part,
state plainly in the test file's header comment *why* it was dropped (cite the commits that
closed it) and what remains genuinely open, and say so in the final report rather than
silently complying or silently substituting. This is the same "return blocked on a stale
spec assumption" discipline the worker contract states for spec-pipeline dispatches, applied
here to an ad hoc dispatch outside that pipeline. See also
[[doctrine-regex-linewrap]] for the companion lesson of always executing a new pin once
before reporting it, rather than trusting it by inspection.
