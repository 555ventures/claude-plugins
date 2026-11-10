---
date: 2026-11-09
status: hardened
area: run
depends_on: []
brief: n/a
architecture: true
breaking: false
---

# A later review checks the fix

## Intent
- You asked: "what would be the architecturally sound, structural fix" for v8 being slower than v7 at implementing specs; then "Use Opus/High to spec:plan".
- I will build:
  - A review after a fix round checks the fix: it decides, for each finding the fix was sent to close, closed or not closed, and it reviews the fix delta, reading every file the delta touches in full. The rest of the diff is not reviewed again and cannot block.
  - The run keeps its review: the reviewed tree and base are recorded, earlier advisories and notes carry into the next round, and a rebase no longer throws the review away.
  - A fourth finding severity, `note`, for test style, wording and naming: printed in the report and the build commit, never queued, never blocking.
  - The reviewer is told the gate already ran the test command green on its tree.
  - The findings file loses its `verdict` key; the driver already derives the verdict.
- I will not touch:
  - `FIX_CAP` (stays 2) and `REPAIR_CAP`; the cap stop (20261108/05); the advisories item and its chain rule (`fromAdvisories`, fix q358); the first review's brief; the reviewer seats.
  - The size check (20261109/03); `connect.js` and the probe network rule (fix q361); the builder's test command.
- Users will notice: runs that stopped after a fix round now merge; the second review is short and names what it closed; style and wording findings no longer stop a build or open a fix lane, they appear under `Review notes:` in the build commit; a rebase during landing costs a short review, not a full one.
- You lose: a second whole-diff review. A problem round one missed is found later only if a reviewer happens on it, and then it cannot block. You also lose test-style findings that block, and fix items for style notes.
- Architecture or behaviour change: yes — a later review round may not block on anything outside the fix; you said yes 2026-11-10 (ADR-0051)
- Client sign-off: a later review checks only the fix; a `note` severity that never blocks or queues; test-style findings stop blocking — all three yes (2026-11-10)

## Goal

A run whose first review blocks and whose fix closes those findings merges after one short second review, unless the fix itself broke something. Measured on five replayed builds, this design let 4 of 5 merge against 1 of 5 today and found 7 of 7 defects the fixes introduced against 2 of 7. `spec/scripts/run.js` ends smaller than it starts.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `lib/briefs.js` `reviewer()`: when `b.review` (the run's last review, already passed in by `run.js brief()`) has a `tree`, the brief is a later round. It adds: the delta command `git -C <worktree> diff <review.tree> <gate.tree>`; when `review.base` differs from `b.base`, one line that the base moved (a rebase onto trunk), so the delta also holds trunk's changes and only files the run's diff touches are reviewed; the last review's `blocking` and `needs-decision` findings, each to be decided closed or not closed; and that earlier advisories and notes are kept by the driver. A review with no `tree` (a run state from before this) gives a first-round brief. `spec/agents/reviewer.md` gains "A later round": a finding not closed is written again with its own severity; every delta file is read in full and a defect the fix introduced or exposed, there or in a caller, may block; the rest of the diff is not re-reviewed, and a problem noticed there is `advisory` or `note` with a summary starting `outside the fix:`, never `blocking`. [asked: a later review checks only the fix] | The replay's rules A, B and C. The delta is a git command, not a written file: `git diff` is a verb the lane hook allows, so run.js writes nothing new. v7 scoped its round 2 the same way (`spec-review-driver.js` fix-delta pass). |
| D2 | `run.js` `steps.reviewed`: `state.review` also records `tree: state.gate.tree` and `base: state.base`, and its `findings` are the earlier review's `advisory` and `note` findings followed by this round's. | `state.review` already survives FIX; these two facts are all the delta needs. Without the carry, a later round would drop round one's advisories, because it no longer reads the whole diff. No new state key: both live inside `review`. |
| D3 | `run.js`: `merge()`'s red-after-rebase and `finishRebase()` stop setting `review: null` (counts still reset), so the review after them is a later round over the repair or the conflict resolution. `resume()` on an amended spec still clears it: the spec changed, so round one starts again. Dies: the two `review: null`. | A rebase that did not change the run's own work threw away its review (the second size stop of 20261108/01 then met a fresh whole-diff review). A rebuild from a hand-made wip tag stays a first round: 20261108/05 makes those tags unneeded. |
| D4 | Severity `note` joins `SEVERITIES` (run.js). `note` = test style (a test that pins wording, a private name or a call count), wording, naming, docs polish; `advisory` = wrong behaviour that does not block (outside a later round's fix, or minor). In every round. `commit()` still queues only `advisory` findings as one fix item; notes print as warn lines (`B.report`, unchanged) and `B.commitMessage` adds a `Review notes:` block. [asked: add `note`, never queued or blocking] | Severity is the one field the driver routes a finding on; a second key would be a second router. Fix lanes ran after 6 of 7 merged specs and 0 of 8 sampled fixed a user-visible bug. |
| D5 | `reviewer.md`: "so is a test that asserts a private name, a call count or prose" leaves the blocking rule; such a test is a `note`. "Anything else is `advisory`" becomes "anything else is `note`". ADR-0037 stands (a wording pin is not a test); `builder.md` keeps its rule; the size check's prose rule stays the mechanical guard. Reverses 32c9962f's reviewer clause. [asked: test-style findings stop blocking] | The historical reviews blocked on these in 3 of 5 replayed builds; one build was stopped by nothing else while a serious defect passed. |
| D6 | The findings file loses `verdict`: `steps.reviewed` ignores the key (an old reviewer's file still parses). Dies: the two `verdict` refusals in `steps.reviewed`, the key in its "expected" message and in `reviewer.md`'s example and closing sentence, and the `{findings: [], verdict: 'fix'}` case in `tests/run.test.js`'s malformed-findings loop. | The driver derives the verdict from severities; the key is a second copy that can only disagree. Deleting it pays for D2 in run.js. |
| D7 | `FIX_CAP` stays 2. (The plural branch on it already went in fix q360, 5fba11f1.) | A fix-scoped round finds the defects a fix introduced (7 of 7 in the replay); they block and need one more round, so cap 1 would stop each such run. A third review reads only the second fix's delta. b4b76897's cause (new tests seeding new blockers) is closed by D1 and D5, not by the cap. |
| D8 | `reviewer()` prints `Gate: green on this tree (run <runId>). Do not run the test command again; run one test file or a probe when you need output.` | Reviewers re-ran the full suite on an unchanged tree, about 4 minutes per lane in this repo. |
| D9 | `spec/commands/run.md` (REVIEW), `docs/v8/interface-contract.md` (run row, severities line), `docs/v8/architecture.md` (state shape, REVIEW, FIX, COMMIT rows) say so; ADR-0051 (accepted 2026-11-10). | The contract docs are what builders read (ADR-0037). |
| D10 | Bytes: `run.js` ends at least 150 bytes smaller than at its base (expected about −260: +8 `note`, +170 D2, −28 D3, −400 D6, −10 a comment); `lib/briefs.js` about +750 (stays under 16,000); `reviewer.md` about +450 (under 4,000). | run.js is at its cap and three in-flight specs edit it. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/run.js | MODIFY | D2, D3, D4 `SEVERITIES`, D6; findings.json is still removed before each review (a mark must read this round's file) |
| spec/scripts/lib/briefs.js | MODIFY | D1, D4 `Review notes:`, D8 |
| spec/agents/reviewer.md | MODIFY | D1 "A later round", D4, D5, D6 |
| spec/commands/run.md + docs/v8/interface-contract.md + docs/v8/architecture.md | MODIFY | D9 |
| tests/run.test.js | MODIFY | AC-1 to AC-5; D6 deletes the verdict case from the malformed-findings loop |

## Acceptance Criteria

- **AC-20261109-02-1**: WHEN a review writes a blocking finding, the fix round is marked `fixed` and the gate is green THE SYSTEM SHALL print a REVIEW brief that names `git -C <worktree> diff <reviewed tree> <gate tree>` with both tree shas, lists that blocking finding's summary, and prints no "base moved" line; AND a run's first REVIEW brief SHALL CONTINUE TO name no delta.
- **AC-20261109-02-2**: WHEN round one writes an advisory and a blocking finding and round two writes none THE SYSTEM SHALL reach COMMIT, queue one fix item whose payload holds round one's advisory, and print it in the report.
- **AC-20261109-02-3**: WHEN a review's only findings have severity `note` THE SYSTEM SHALL reach COMMIT, queue no item, print each as a warn line and list each under `Review notes:` in the build commit message; AND a finding of severity `nit` SHALL CONTINUE TO be refused.
- **AC-20261109-02-4**: WHEN landing's rebase leaves the gate red and the repair goes green, and WHEN a conflicted rebase is resolved, THE SYSTEM SHALL print a later-round REVIEW brief with the "base moved" line; AND WHEN an amended spec resumes THE SYSTEM SHALL print a first-round brief.
- **AC-20261109-02-5**: WHEN a findings file carries `"verdict": "fix"` and no blocking finding THE SYSTEM SHALL accept it as clean; AND every REVIEW brief SHALL name the gate's run id and say not to run the test command again.
- **AC-20261109-02-6**: `spec/agents/reviewer.md` states the later-round rules of D1 and D5, and `grep -n "private name, a call count\|\"verdict\"" spec/agents/reviewer.md` prints nothing.
- **AC-20261109-02-7**: `<spec>.run/evidence.md` records `wc -c spec/scripts/run.js` at the base and on the build tree, the build's at least 150 bytes smaller.

## Retired criteria

- AC-20261109-02-6 — checked at review: prose and a grep in the diff.
- AC-20261109-02-7 — checked at review: a count recorded in evidence.md.

## Assumptions

- A1: The tree objects `host.treeSha` writes stay in the object store while a run lives (git prunes unreachable objects after two weeks) — if false: the reviewer says the delta command failed and reviews as a first round.
- A2: this lands before 20261108/05, which rebases its cap ending onto the `steps.reviewed` D2 and D6 leave (you chose this order 2026-11-10: 05 kept stopping at the fix cap this spec removes) — if false: 05 resolves the conflict at its landing.
- A3: Fix q358 (one matcher for `fromAdvisories` and `merge`'s tick) may land first; it does not change what D2 to D6 change — if false: the rebase conflict is resolved to both sides.
