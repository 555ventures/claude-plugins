# 25 — Commit-time escape coverage: measure the share of host fixes that record a row

Phase: P2 · Depends on: 23 (the owed query is the consumer of every row this brief would add) ·
Primary workspaces: git/commands/commit.md (the existing escape check), spec/scripts (one
derivation), tests · Risk: T2 (read-only derivation; the fix shape, if any, is a prompt-time
offer, never a commit gate) · Design stage: no · Expected specs: 1

<!-- Staged by /spec:plan on 2026-09-03 while locking specs/20260903/01 (brief 23), which
     answered brief 23's second open question. Not queued; JJ ranks it. -->

## Result

The share of host fix commits that pass through `/git:commit`'s escape check is a number a
script prints, per repo and fleet-wide, and the offer fires on the fix-shaped commits it
currently misses.

## Why this brief

Brief 23's planning session measured the question it left open: since v7 (2026-08-17) the
hosts landed 40 fix-shaped commits (prax 9, salon-os 16, upwell 15) and the ledgers hold 2
escape rows stamped `via:"commit"` in that window (both upwell). An upper-bound share of ≈5%
means the commit-time trigger — the mechanism `escape.md` calls "the common case" — almost never
fires. Every other escape row (33 of 38 fleet-wide) was recorded by hand. The owed query brief
23 ships is only as complete as the rows hosts write; this is the leak.

Unknowns the spec must resolve first: how many of the 40 touched spec-landed lines at all (the
check's own gate), whether the offer fired and was declined (no row records a decline), and
whether `git log` fix-shape matching (`fix|hotfix|regression|bug` in the subject) is the right
denominator.

## Scope

1. **The derivation** — one script or fleet-reader question: per repo, fix-shaped commits since a
   cutover, the subset touching files a `done` spec landed, and the escape rows with
   `via:"commit"` whose `ts` falls in that window; render as a share, population first.
2. **The offer's reach** — from the derivation, decide whether `commit.md` step 3's gate
   (fix-shaped subject AND a spec-landed blame hit AND a matching review row) is what drops
   the offer, and widen or re-order it if so. No commit is ever blocked.

## Out of scope

- Any commit hook or gate that refuses a fix commit without a row — core § Incident Policy's
  reopen condition for a shape gate is a recurrence count, not a coverage number.
- Recording declines as ledger rows (a "no" is not evidence of a defect).

## Grounding

- `git/commands/commit.md` step 3 — the existing trigger.
- `specs/20260903/01-owed-query-and-row-handoff.md` A9 — the executed measurement above.
- `spec/doctrine/core.md` § Feedback Loop, § Incident Policy.
