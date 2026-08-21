---
date: 2026-08-21
status: hardened
open_markers: 0
tier: standard           # no critical-trigger file gets a behavioral edit (verdict.js/review-legs.js untouched); worst failure is the driver refusing DONE after a completed merge — resumable, never destructive
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260820/07-review-driver.md"]
depended_on_by: []
brief: 14
---

# Replay as a review-close phase: the driver's REPLAY state

## Goal

The reviewer-replay harness (specs/20260819/02) is the pipeline's only controlled-denominator
measurement of the one-reviewer bet, and it is advisory: review's CLEAN report prints
`reviewer replay due — run /spec:replay` and nothing runs it. Since the harness shipped
(2026-08-19) this repo alone went due at 5 reviews and skipped the reminder through 12+
reviews in ~48 hours — advisory visibility is empirically insufficient. This spec makes the
due replay part of review's own conclusion: the review driver (specs/20260820/07) gains a
REPLAY state between MERGE and DONE that runs the dueness/selection checks itself and refuses
to conclude the review until a replay outcome row exists — while never touching the already-
committed verdict. Done means: a CLEAN close with a due replay cannot reach DONE without a
recorded `stage:"replay"` ledger row, a not-due close passes through untouched, and
`/spec:replay` remains the manual and retry surface.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec-review-driver.js` gains state REPLAY between MERGE's conclusion and DONE, entered on every CLEAN close (merge-back path and merge-skipped path alike; STOPPED and non-CLEAN paths never reach it). At entry the driver itself runs `replay.js --due` then `replay.js --select` (deterministic ledger reads — the session never hand-derives dueness): not due, or due with no eligible CLEAN row in the window, → transition straight to DONE printing the harness's own advisory line; due + selected → print the execution step: follow `spec/commands/replay.md` Phases 1–5 in this session, with the `--select` values (spec, reviewRunId, commit, parent, diffBase) inlined (AC-20260821-02-1, AC-20260821-02-2, AC-20260821-02-3, AC-20260821-02-7) | The verdict word's lesson applied to the measurement: a checklist the state machine owns cannot be scrolled past; the printed-reminder alternative was already tried and measured to fail (12+ skips in 48h) |
| D2 | Mark `replay-recorded`: at REPLAY entry the driver writes `replayTarget: {reviewRunId, rowsAtEntry}` into the sidecar, where `rowsAtEntry` = count of existing `stage:"replay"` rows whose `reviewRunId` equals the `--select` target's; the mark is refused (exit 2, message naming the missing replay row and the `replay.js --record` remedy) unless that count has strictly increased. ANY recorded outcome — caught, missed, leg-caught, unresolved, setup-failed — satisfies the mark and transitions to DONE; non-measurement outcomes leave the harness due (replay.js D5 unchanged) and retry at the next review, never this one (AC-20260821-02-4, AC-20260821-02-5) | Joining on the selected target's reviewRunId (never a bare row count) keeps a concurrent session's replay row from satisfying this review's mark; accepting every outcome keeps a broken scratch setup from parking a finished review |
| D3 | REPLAY never re-derives, re-opens, or gates the review verdict: CLOSE committed and MERGE concluded before it runs; a `missed` outcome changes the replay ledger and nothing else (AC-20260821-02-6) | The verdict measures the diff; replay measures the reviewer — gating one on the other confuses what is being tested (and the close commit is already merged history) |
| D4 | `spec/commands/review.md` (post-07 thin shell): the CLEAN-report advisory warn `🧪 reviewer replay due — run /spec:replay` is deleted; the shell's judgment rules gain the REPLAY step — when the driver prints the execution step, the session executes `spec/commands/replay.md` Phases 1–5 (mutation worker, blind reviewer, score, record, teardown) and returns with `--mark replay-recorded`. `spec/commands/replay.md` gains one note: `/spec:review`'s driver invokes Phases 1–5 automatically when due; the command remains the manual surface (ad-hoc measurement, retry after a non-measurement outcome) and its Phase 0 STOP-on-not-due is unchanged (AC-20260821-02-8) | One executor, two entry points: the phases live in replay.md only — duplicating them into review.md would be the collision class the Gotchas already record twice |
| D5 | `spec/doctrine/core.md` § Feedback Loop's cadence paragraph is amended: cadence remains `replay.js --due` policy, and execution is review's own close — the driver's REPLAY state — rather than a printed reminder, with `/spec:replay` named as the manual/retry surface; the amendment cites the measured failure of the reminder (shipped 2026-08-19, skipped through 12+ reviews in 48h) (AC-20260821-02-9) | Doctrine records who executes, or the next session re-litigates it from memory; the citation is what stops a future "make it advisory again" edit from landing evidence-free |
| D6 | REJECTED — a standing never-red census surface (a doctor line, a REPLAY-state print, or any other advisory flag for legs that have never failed: fleet `patterns` leg 195 runs, `neverRed: true`). No recorded escape or missed replay has ever been attributed to a never-red leg, so Generality and Materiality are unfillable under core § Incident Policy; an advisory line is also exactly the mechanism this spec exists to replace. Reopen condition (ledger-answerable): the first `stage:"escape"` row or `stage:"replay"` row with outcome `missed` whose defect a deterministic leg should have caught while fleet-reader `legRecency` reported that leg `neverRed: true` at the row's timestamp; `node "$(spec-paths fleet-reader)" --json` remains the on-demand census (JJ ruling 2026-08-21) [no-ac: rejection record per core § Incident Policy] | The census exists and is queryable; adding an unforced reminder in the same spec that proves reminders don't work would be self-refuting |
| D7 | Wiring: `spec/entrypoints.json`'s `spec/scripts/replay.js` entry gains the `spec/scripts/spec-review-driver.js` edge and drops `spec/commands/review.md`'s retired `--due` edge (whichever of the two 07 left standing is adjudicated at build); `spec/.claude-plugin/plugin.json` bumps (target 7.15.0 — a target, not a pin, per the semver-race gotcha; 20260820/07 and 20260821/01 both target 7.13.0 ahead of this) with the changelog paragraph (last-3-versions form) [no-ac: both enforced by standing suites — the data-driven entry-point conformance suite and review's version-bump hard check; a vacuous absence pin here would be the class 20260821/01 mechanizes] | A stale entry edge makes the conformance suite lie about who calls the harness; version discipline is the host's own review check — an AC would double-adjudicate both |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1/D2/D3: REPLAY state, entry derivation (--due/--select), sidecar `replayTarget`, mark verification by target-runId row count |
| spec/commands/review.md | MODIFY | doctrine | D4: advisory warn deleted; REPLAY judgment rule added to the shell |
| spec/commands/replay.md | MODIFY | doctrine | D4: driver-invokes-when-due note; manual surface and Phase 0 unchanged |
| spec/doctrine/core.md | MODIFY | doctrine | D5: § Feedback Loop cadence paragraph — executed at close via REPLAY, dated evidence, manual surface named |
| spec/entrypoints.json | MODIFY | other | D7: replay.js entryPoints — driver edge added, review.md's retired --due edge dropped |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version bump + changelog paragraph |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260821-02-1, AC-20260821-02-2, AC-20260821-02-3, AC-20260821-02-4, AC-20260821-02-5, AC-20260821-02-6, AC-20260821-02-7 |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260821-02-8, AC-20260821-02-9 (doctrine sentence pins, added beside the existing review.md pins 07 retags) |

## Contracts

```
# spec-review-driver.js state machine — extends specs/20260820/07's contract
# (unchanged states elided; MERGE no longer transitions to DONE directly)

MERGE    ... cleanup + verify + spec-status --next verbatim, sidecar retained -> REPLAY
         (the merge-skipped one-line-note path also lands in REPLAY)
REPLAY   driver work at entry: replay.js --due; exit 1 -> DONE, printing the harness's
         `not due reviewsSince=N` line verbatim. Exit 0 -> replay.js --select; non-zero
         (no eligible CLEAN row) -> DONE, printing the harness's advisory verbatim.
         Both yes -> sidecar gains
           replayTarget: {"reviewRunId": "<from --select>", "rowsAtEntry": N}
         (N = count of stage:"replay" ledger rows with that reviewRunId), and the driver
         prints ONLY this step: execute spec/commands/replay.md Phases 1–5 with the
         --select values (spec, reviewRunId, commit, parent, diffBase) inlined.
         mark: replay-recorded — refused (exit 2, names the missing stage:"replay" row
         for the target reviewRunId and the `replay.js --record` remedy) unless the
         target's row count > rowsAtEntry. Any outcome satisfies it. -> DONE
DONE     unchanged (terminal; re-prints the next pointer; sidecar deleted here now —
         REPLAY needs it, so deletion moves from MERGE's conclusion to DONE if 07 landed
         it earlier)

# Sidecar (<spec>.review/review-state.json) — additive field
"replayTarget": {"reviewRunId": "rv_...", "rowsAtEntry": 0}
```

## Behavior

- Flow on a CLEAN close: … → CLOSE → MERGE (or the skip note) → REPLAY → DONE. Non-CLEAN
  paths (STOPPED, DISPOSITIONS→FIX loops) never reach REPLAY; the due clock keeps counting
  review rows regardless (replay.js owns the window).
- The session's work inside REPLAY is exactly `/spec:replay`'s Phases 1–5: worktree setup +
  setup gate, mutation-authoring worker, capture/apply, legs, blind reviewer, score, record,
  teardown. Phase 0 is the driver's own entry work and is not repeated. The ambiguous-score
  adjudication (`AskUserQuestion`) happens in this same session — the user is present at a
  review close.
- Interruption parks the review at REPLAY: `--state` says so, the sidecar survives, and
  re-invocation re-prints the execution step. A parked REPLAY is visible unfinished work,
  which is the point — the empirically-skippable form was the warn line.
- Concurrent sessions appending replay rows for other targets cannot satisfy the mark: the
  join is on the selected target's reviewRunId, not a bare count.
- A `setup-failed` or `unresolved` outcome concludes THIS review (mark accepted, DONE) but
  does not reset the dueness window (replay.js D5), so the next review's REPLAY retries.

## Acceptance Criteria

- **AC-20260821-02-1**: WHEN a CLEAN close reaches REPLAY and `replay.js --due` reports not
  due THE SYSTEM SHALL transition to DONE printing the harness's not-due line (e.g. a ledger
  whose last `caught` row is followed by 3 review rows → output contains `not due` and
  `reviewsSince=3`, `--state` prints `DONE`) → tests/review/review-driver.test.js
- **AC-20260821-02-2**: WHEN due and `--select` yields an eligible CLEAN row THE SYSTEM
  SHALL print an execution step naming `spec/commands/replay.md` and the selection's spec
  path and reviewRunId, and `--state` SHALL print `REPLAY` → tests/review/review-driver.test.js
- **AC-20260821-02-3**: WHEN due but no eligible CLEAN row exists in the window THE SYSTEM
  SHALL transition to DONE printing the harness's advisory (a due-but-unmeasurable close is
  never parked) → tests/review/review-driver.test.js
- **AC-20260821-02-4**: WHEN `--mark replay-recorded` is given and the ledger holds no
  `stage:"replay"` row for the sidecar's target reviewRunId beyond `rowsAtEntry` THE SYSTEM
  SHALL refuse with exit 2 naming the missing replay row for that reviewRunId and the
  `replay.js --record` remedy → tests/review/review-driver.test.js
- **AC-20260821-02-5**: WHEN a new `stage:"replay"` row for the target reviewRunId exists
  with outcome `setup-failed` THE SYSTEM SHALL accept `replay-recorded` and transition to
  DONE (e.g. rowsAtEntry 0, one appended setup-failed row → exit 0, `--state` prints `DONE`)
  → tests/review/review-driver.test.js
- **AC-20260821-02-6**: WHEN the recorded outcome is `missed` THE SYSTEM SHALL CONTINUE TO
  leave the reviewed spec at `status: done` and append no review-stage ledger row from the
  mark (the verdict is committed history; replay measures the reviewer) →
  tests/review/review-driver.test.js
- **AC-20260821-02-7**: WHEN review ran on the originating branch (merge-back skipped with
  the one-line note) THE SYSTEM SHALL still enter REPLAY before DONE →
  tests/review/review-driver.test.js
- **AC-20260821-02-8**: WHEN `spec/commands/review.md` is read THE SYSTEM SHALL state that
  the driver's REPLAY state executes the due replay at CLEAN close via
  `spec/commands/replay.md`'s phases, and SHALL NOT carry the retired advisory warn line
  (`reviewer replay due — run /spec:replay` as a report warn) → tests/run-ledger.test.js
- **AC-20260821-02-9**: WHEN `spec/doctrine/core.md` § Feedback Loop is read THE SYSTEM
  SHALL name the driver's REPLAY state as the cadence's executor and `/spec:replay` as the
  manual/retry surface → tests/run-ledger.test.js

## Assumptions (escalation triggers)

- A1 (executed, 2026-08-21, this repo's live ledger): `node "$(spec-paths replay)" --due`
  exits 0 printing `due reviewsSince=12` — the dueness primitive behaves as documented and
  the debt is live right now. **If false:** the driver entry design is wrong — STOP, re-read
  replay.js's window semantics.
- A2: specs/20260820/07 lands its driver with the contracted state machine, sidecar, and
  mark protocol (it is `implementing` in a concurrent session as this locks). **If its
  review changes the contract shape** (state names, sidecar path, mark verbs) → re-open this
  spec's Contracts section before build; `depends_on` gates the ordering either way.
- A3: replay.md Phases 1–5 are executable by the review session (Sonnet orchestration —
  replay.md's own intended model; `AskUserQuestion` reachable for the ambiguous seam).
  **If a host/context cannot execute them in-session** → fallback: the driver's printed step
  becomes "run /spec:replay now and return with the mark"; state machine unchanged.
- A4: `replay.js --record` always carries `--review-run-id` (usage-required), so every
  replay row is joinable to its target. **If a legacy row lacks it** → it simply never
  satisfies a mark; no fallback needed.
- A5: 07 deletes the sidecar at its MERGE conclusion. **If so** → this spec moves deletion
  to DONE (REPLAY reads the sidecar); noted in Contracts, applied by the same worker.

## Rationale

The headline evidence is deliberately the two-day window, not a lifetime ratio: the harness
shipped 2026-08-19 (commit 7e99201), went due at 5 reviews, and was skipped through 12+
reviews in ~48 hours — while `🧪 reviewer replay due` printed on every CLEAN report. The
advisory form was tried and measured to fail; more visibility is not a fix. Meanwhile the
fallback signal cannot substitute: fleet-reader reports 26 escapes of which 22 carry
`killedMatch: null` (unjoinable to what the review claimed it checked) and upwell shows 11
of 102 CLEANs later contradicted — a degraded, biased floor with unbounded lag. Replay is
the only controlled-denominator signal and it has n=2 fleet-wide.

Why a driver state and not a stronger warn or a gating leg: the warn is the measured
failure; gating the verdict would make reviewer-measurement block diff-truth, which
confuses what is being tested (D3) — and the close commit is already merged by the time
REPLAY runs, so "blocking" the verdict is not even mechanically available. The state
machine refusing DONE is teeth without verdict distortion: the review is complete as a
verdict, unfinished as a checklist.

Alternatives rejected: executing replay from review.md prose (pre-07 shape) — dies with
07's thin-shell rewrite and re-creates hand-run choreography; a standing never-red census
surface — D6, JJ ruling 2026-08-21, reopen condition recorded there. Fragile spots: A2 (07
is mid-build; contract drift re-opens Contracts) and the ~88K-token replay cost now landing
inside review sessions (~once per 5 reviews ≈ 2–4% of review spend — accepted when this
approach was chosen).

## Canonical Delta

docs/canonical/review.md — amend the reviewer-catch-rate paragraph: cadence is unchanged
(`replay.js --due`, every 5th review, at least once per major version), and execution is
review's own close — the driver's REPLAY state between MERGE and DONE runs the dueness and
selection checks and refuses to conclude the review until a `stage:"replay"` row for the
selected target exists; any outcome concludes, non-measurement outcomes leave the harness
due. `/spec:replay` is the manual and retry surface. The REPLAY state never re-derives or
gates the review verdict. (specs/20260821/02-replay-review-phase.md)
