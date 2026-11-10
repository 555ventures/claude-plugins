# 0051. A later review checks the fix

- Status: accepted
- Date: 2026-11-10
- Deciders: JJ + session (specs/20261109/02-a-later-review-checks-the-fix.md)
- Applies to: `/spec:run` REVIEW after FIX and after a landing rebase; `spec/agents/reviewer.md`; the findings file and its severities.

## Context

v8 implements specs slower than v7 (research 2026-11-09). Every review after a fix round re-read the
whole diff with no memory of the earlier round, so each round found new blockers in code the fix never
touched, and new tests written by the fix seeded more. Runs stopped at the fix cap. Test-style findings
(a test that pins a private name, a call count or wording) were blocking, and every other remark became
an advisory that opened a fix lane after merge. A rebase during landing threw the review away and paid
for a fresh whole-diff review. v7 scoped its second round to the fix delta.

## Options considered

- **Keep whole-diff re-review, raise the cap** — a third round seeds blockers the same way; runs stop one round later.
- **Review the fix delta only, carry the earlier review, add a non-blocking `note` severity** (chosen) — on five replayed builds, 4 of 5 merged against 1 of 5, and 7 of 7 fix-introduced defects were found against 2 of 7.

## Decision

A review after a fix round, or after a landing rebase, checks the fix: each finding the fix was sent to
close is decided closed or not closed, and every file the delta touches is read in full; a defect the
fix introduced or exposed may block. The rest of the diff is not re-reviewed and cannot block. The run
records the reviewed tree and base, and carries earlier advisories and notes into the next round. A
fourth severity, `note`, holds test style, wording and naming: printed in the report and the build
commit, never blocking, never queued. A test pinning a private name, a call count or prose is a `note`,
not a blocker (ADR-0037 still holds: such a pin is not a test). The findings file has no `verdict`; the
driver derives it from severities.

## Consequences

- Runs whose fix closes its findings merge after one short review; a rebase costs a short review.
- A problem round one missed is found later only if a reviewer happens on it, and it cannot block.
- Style remarks reach no one who must act on them; they are visible in the build commit only.
