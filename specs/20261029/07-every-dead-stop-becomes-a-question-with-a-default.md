---
date: 2026-10-29
status: draft
tier: critical           # touches spec/scripts/merge-back.sh (destructive git ops) and the review driver
area: pipeline
breaking: false
depends_on: []
brief: n/a
---

# Every dead stop becomes a question with a default

## Goal

Twelve places where the build, review, fix, release or git commands today print an error and end
the turn become one `AskUserQuestion` each, with a recommended default and the consequence of
every option, so the owner answers in ten seconds instead of reconstructing the remedy from a
message. Two contradictions are settled: merge strategy is derived everywhere (the git plugin
stops asking), and `/spec:fix` can no longer waive its own reviewer's findings. Done means no
command in the File Plan ends a turn with a bare "STOP" where a choice exists.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 2.3, 2.4, Part 4 items 3 and 5-equivalent (fix lane).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `/spec:run` Step 0 worktree failure: ONE question — "exit the other worktree and retry (Recommended)" when the failure is `create: run from the main working tree`, else "run in place with `--in-place` (Recommended)" / "abort" (AC-20261029-07-1) | Dead stop today; `--in-place` is named only in prose. |
| D2 | Build ESCALATE (repair cap 3): ONE question — "re-arm one more round (Recommended when the failure count shrank)" / "restart cold" / "park and queue a `/spec:fix`" / "amend the spec", recommendation derived from the gate-run trend; the driver gains `--mark escalate-choice <re-arm|cold|park|amend>` replacing the "delete gate-cap / delete the sidecar" instructions (AC-20261029-07-2) | The owner should not have to know which file to delete. |
| D3 | Build red-check anomalies: `mixed-pin` and `skipped-resume` are diagnosed by the session and printed as `📌` with the fix applied (split the bullet; re-run red); `unsanctioned-green` is auto-diagnosed against § Gotchas' known causes and printed as `📌` on standard tier, asked only on `tier: critical` (AC-20261029-07-3) | Two of the three have one mechanical fix; the third has documented causes. |
| D4 | Build `blocked` returns: when the spec's Assumption already names an `if false` fallback, the session applies it and prints `📌`; otherwise every blocked worker in the same wave is batched into one question (≤4) (AC-20261029-07-4) | The fallback was written for exactly this moment. |
| D5 | Review STOPPED (red blocking leg): the driver prints the failing leg and ONE question — "run a capped in-session repair round (Recommended)" / "queue `/spec:fix` and stop" / "abandon"; the repair round reuses the build driver's repair step contract with cap 1, then re-runs legs (AC-20261029-07-5) | A mechanical red is not a decision; today the user restarts by hand. |
| D6 | Review ESCALATE (fix cap 2): ONE question listing the open findings — "waive all and close" / "reject with evidence" / "abandon and queue `/spec:fix` (Recommended)" / "re-plan" (AC-20261029-07-6) | Accepting known defects is human; the options were spread across prose. |
| D7 | Review "confirm waived findings in the close report" becomes a plain notice (the user approved each waive at DISPOSITIONS) (AC-20261029-07-7) | Redundant confirmation. |
| D8 | Merge strategy: `/git:merge` step 3 derives the strategy with `merge-back.sh inspect`'s RECOMMEND and prints `📌`, matching stage-review; the three commit-count heuristics collapse into `merge-back.sh`'s (0 → nothing, 1 → ff-only, ≤5 → merge-commit, >5 → squash) as the single home (AC-20261029-07-8) | Two commands, two rules, one of them "always ask" — the audit's clearest contradiction. |
| D9 | `/spec:fix` step 5 (dispose its own reviewer findings) adopts the review stage's rule: `fix` dispatches without a question; `waive`/`reject` go to the user in ONE question; the session never declines a finding alone (AC-20261029-07-9) | The two lanes disagreed on who waives. |
| D10 | `/spec:fix` dirty-tree STOP and `/git:merge` dirty-tree STOP become ONE question — "commit the unrelated changes first via `/git:commit` (Recommended)" / "stash them with a tagged entry" / "abort" (AC-20261029-07-10) | Stashing silently is risky; a bare stop costs the owner a lookup. |
| D11 | `/spec:release` red leg or failed journey: the command queues `/spec:fix <symptom>` automatically (`spec-queue add … --lane fix --top`) and prints it under `queued`; a journey that cannot be walked for missing access or seed data asks for it in ONE question instead of a blocking finding (AC-20261029-07-11) | Routing a known defect is not a decision. |
| D12 | `/spec:queue groom`: items whose checker returned hard evidence (a named file that exists, a `done` spec) are ticked with `📌`; only ambiguous `keep` cases are asked (AC-20261029-07-12) | The evidence is already in hand. |
| D13 | `/git:merge` ambiguous source: when exactly one `spec/*` branch is ahead of the target it is the recommended option; the question is kept (AC-20261029-07-13) | Keep the ask, add the default. |
| D14 | `spec/.claude-plugin/plugin.json` and `git/.claude-plugin/plugin.json` are bumped via `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"`. `[no-ac: reviewer-held]` | Two plugin directories. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/run.md | MODIFY | doctrine | Step 0 question (D1) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | ESCALATE step text + `--mark escalate-choice` (D2); red-check anomaly step prints the auto-diagnosis (D3) |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | anomalies (D3), blocked batching (D4), escalate question (D2) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | STOPPED step offers the capped repair (D5); ESCALATE step text (D6); close notice (D7) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D5, D6, D7 |
| git/commands/merge.md | MODIFY | doctrine | strategy derived (D8), dirty-tree question (D10), source default (D13) |
| spec/scripts/merge-back.sh | MODIFY | scripts | `inspect` is the single strategy home; prints RECOMMEND for `/git:merge` too (D8) |
| spec/commands/fix.md | MODIFY | doctrine | step 5 dispositions rule (D9), dirty-tree question (D10) |
| spec/commands/release.md | MODIFY | doctrine | auto-queue on red; access/seed question (D11) |
| spec/commands/queue.md | MODIFY | doctrine | groom tick rule (D12) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump (D14) |
| git/.claude-plugin/plugin.json | MODIFY | other | bump (D14) |
| tests/build/escalate-choice.test.js | CREATE | tests | AC-20261029-07-2, AC-20261029-07-3, AC-20261029-07-4 |
| tests/review/stopped-repair-round.test.js | CREATE | tests | AC-20261029-07-5, AC-20261029-07-6, AC-20261029-07-7 |
| tests/merge-back.test.js | MODIFY | tests | AC-20261029-07-8 |
| tests/consistency/dead-stops.test.js | CREATE | tests | AC-20261029-07-1, AC-20261029-07-9, AC-20261029-07-10, AC-20261029-07-11, AC-20261029-07-12, AC-20261029-07-13 |

## Contracts

Build driver: `--mark escalate-choice <re-arm|cold|park|amend>`; `re-arm` re-arms one round (sets `capEverTripped`), `cold` deletes the sidecar, `park` writes a `spec-queue add` line for the session and parks, `amend` prints the Decisions-table instruction and parks.

Review driver STOPPED step: prints the failing legs and `--mark repair-round` (cap 1) → re-runs legs; a second red is ESCALATE-shaped.

`merge-back.sh inspect <source> <target>`: prints `RECOMMEND: <strategy> (<reason>)` from the single heuristic; `/git:merge` reads it.

## Acceptance Criteria

- **AC-20261029-07-1**: WHEN `spec/commands/run.md` Step 0 is read THE SYSTEM SHALL contain an `AskUserQuestion` whose options include `--in-place` and `exit the other worktree`, and SHALL NOT contain `hard stop` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-2**: WHEN the build driver reaches ESCALATE after 3 red gate runs whose failure counts were 9, 4, 2 THE SYSTEM SHALL print `recommended: re-arm (failures shrank 9 → 4 → 2)` and accept `--mark escalate-choice re-arm`, then print `round 4 (re-armed past the cap of 3)`; with counts 3, 3, 3 it SHALL print `recommended: park` → writes tests/build/escalate-choice.test.js
- **AC-20261029-07-3**: WHEN red-check reports `mixed-pin` on a `tier: standard` spec THE SYSTEM SHALL print `📌 Auto-picked split the bullet` naming the AC; when it reports `unsanctioned-green` on `tier: critical` it SHALL print an `AskUserQuestion` instruction → writes tests/build/escalate-choice.test.js
- **AC-20261029-07-4**: WHEN two workers in one wave return `blocked` and the spec's Assumptions carry an `if false` fallback for one of them THE SYSTEM SHALL print one `📌 Auto-picked <fallback>` line and one `AskUserQuestion` instruction covering the other → writes tests/build/escalate-choice.test.js
- **AC-20261029-07-5**: WHEN the review driver's gate leg is red THE SYSTEM SHALL print `STOPPED` with the three options and accept `--mark repair-round`; after a green re-run it SHALL reach REVIEWER; after a second red it SHALL print the ESCALATE options → writes tests/review/stopped-repair-round.test.js
- **AC-20261029-07-6**: WHEN the review driver reaches ESCALATE with 2 open hard findings THE SYSTEM SHALL print both findings under one `AskUserQuestion` instruction with four options, `abandon and queue` marked `(Recommended)` → writes tests/review/stopped-repair-round.test.js
- **AC-20261029-07-7**: WHEN a review with 1 waived finding reaches CLOSE THE SYSTEM SHALL print `1 finding waived at DISPOSITIONS (recorded)` and SHALL NOT print `confirm in the close report` → writes tests/review/stopped-repair-round.test.js
- **AC-20261029-07-8**: WHEN `merge-back.sh inspect` runs on a source 3 commits ahead THE SYSTEM SHALL print `RECOMMEND: merge-commit`; on 1 commit `RECOMMEND: ff-only`; on 7 `RECOMMEND: squash`; and `git/commands/merge.md` SHALL contain `📌 Auto-picked` and SHALL NOT contain `always ask` → rewrites tests/merge-back.test.js :: inspect
- **AC-20261029-07-9**: WHEN `spec/commands/fix.md` is read THE SYSTEM SHALL contain `only the user waives` and SHALL NOT contain `or state why not` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-10**: WHEN `spec/commands/fix.md` and `git/commands/merge.md` are read THE SYSTEM SHALL each contain an `AskUserQuestion` on the dirty-tree path whose first option names `/git:commit` and `(Recommended)` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-11**: WHEN `spec/commands/release.md` is read THE SYSTEM SHALL contain `spec-queue` with `--lane fix --top` on the red-leg path and an `AskUserQuestion` on the unwalkable-journey path naming `access` or `seed` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-12**: WHEN `spec/commands/queue.md` § Render is read THE SYSTEM SHALL contain `📌 Auto-picked done` for hard-evidence items and keep `never tick without a yes` for `keep` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-13**: WHEN `git/commands/merge.md` step 1 is read THE SYSTEM SHALL contain `exactly one` and `(Recommended)` for the single-ahead-branch case → writes tests/consistency/dead-stops.test.js

## Assumptions (escalation triggers)

- A1: The build driver's repair step contract (`repairStepBody`, cap 3, `gateRuns`) can be reused by the review driver for a one-round repair. — **if false:** the review driver prints the gate output and the `/spec:fix` paste instead of an in-session round; D5's "repair round" option is dropped and recorded.
- A2: `tests/merge-back.test.js` has a test titled starting `inspect`. — **if false:** retarget per `count-tests --titles`.
- A3: `[NEEDS CLARIFICATION: D8 removes a question from /git:merge that JJ may want kept for non-spec branches (feature branches with many WIP commits). Default here: derived everywhere.]`
- A4: `[NEEDS CLARIFICATION: D7 drops the re-confirmation of waived findings; keep it for tier: critical?]`

## Rationale

Anthropic's guidance for autonomous runs says a valid stop is one where nothing can move without
the human; the audit found twelve stops where the next move was known and only the file to delete
or the flag to pass was missing. Each becomes a question whose recommended option is derived from
evidence the driver already holds (a failure trend, a fallback written at plan time, a commit
count). The two contradictions are resolved toward the stricter side: strategy derived (no product
consequence), waivers human (a product consequence).

Rejected: dropping the escalate questions in favour of automatic re-arm. A capped run is the one
place the pipeline has decided it cannot judge; the cap exists to hand over.

## Canonical Delta

docs/canonical/pipeline.md § One command per feature: "Every terminal stop in build and review is a
question with a recommended default derived from the run's own evidence; merge strategy is derived
in every command from `merge-back.sh inspect`; only the user waives, in every lane."
docs/canonical/review-close.md: the waived-findings confirmation sentence is replaced by "recorded
at DISPOSITIONS, listed at CLOSE".
