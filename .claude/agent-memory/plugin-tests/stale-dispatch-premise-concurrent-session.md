---
name: stale-dispatch-premise-concurrent-session
description: A dispatching agent's framing of "this is RED today" can go stale mid-task if a concurrent session lands the fix while this task is running — verify against current git log, not the conversation-start git status snapshot or the prompt's own framing
metadata:
  type: feedback
  reviewed: 2026-08-29
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

**2026-08-22 recurrence, uncommitted-worktree variant:** dispatched alongside a `gate-scripts`
sibling worker fixing `spec/scripts/red-check.js` (`isSanctioned`) and
`spec/scripts/lib/spec-sections.js` (`extractTag`) in the SAME working tree — no commit
involved at all, just two agents editing different files concurrently. Read both functions
pre-fix (confirmed unanchored `/SHALL CONTINUE TO/.test(b.raw)` and a backtick-optional
`TAG_ITEM_SRC` used for the trailing position too — both bugs live), wrote six pins against
that reading, then ran the suite: all passed immediately, because the sibling worker's edits
had landed on disk between my `Read`/`grep` and my `node --test` run. Diffing the file again
afterward showed the actual fix (`normalizeForPinCheck`, a new `BARE_TAG_ITEM_SRC`). Do not
treat "I already confirmed the bug by reading the source" as proof a pin is red — a same-tree
concurrent editor can land between the read and the test run, not just between conversation
turns. Report the true state honestly (pins passing, fix already landed) rather than asserting
they were proven red, and re-diff the source at report time if the claim "this is the fix"
matters to the write-up.

**Correction applied at review close (2026-08-24).** Every claim in this note names and cites
the concurrent editor (commits `ecf520b`/`a4aeb97`/`6a1cb1e`; the same-tree `gate-scripts`
sibling) — an unnamed "concurrent process" is never an acceptable attribution, and finding
that work already landed never licenses standing down from an assignment. Re-derive, report
the true state, and let the orchestrator adjudicate. See
[[concurrent-worker-file-collision-select-tiebreak]] for the corrected sibling case.
