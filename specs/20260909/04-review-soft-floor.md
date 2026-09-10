---
date: 2026-09-09
status: implementing
tier: critical           # verdict.js is a named critical trigger (.claude/rules/spec-pipeline.md § Risk Tiers): this spec changes the CLEAN derivation
area: review
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260909/05-fix-delta-reviewer-pass.md]
brief: n/a
build_base: main
spiked: 2026-09-09
open_markers: 0
diff_base: daf4177e91f6442677b7e3ccba127005f661f9a4
---

# Review convergence floor — soft findings are advisory, never a fix cycle

## Goal

A review pass whose only survivors are `soft` findings derives `CLEAN` today's way for hard
findings: verdict.js's disposition pool holds hard survivors and leg findings only, softs are
recorded in the ledger row (`findings.soft`) and in the retained artifact but never routed to
the disposer, never fix-dispatched, never waived. The driver skips the DISPOSITIONS step when
the hard pool is empty and derives the waived/rejected/fix counts from the disposer's return
file when it is not, so the session never hand-types a count. Done means: a soft-only reviewer
return reaches CLOSE with zero extra marks, a hard survivor still cannot reach CLEAN
undispositioned, and the two-iteration fix cap is untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `verdict.js`'s undispositioned pool is `hardSurvivors + legFindings − waived − rejected − fixDispatched`, where `hardSurvivors` counts survivors with `severity === 'hard'`; a survivor of any other severity is a **soft** and never enters the pool. `derive()` returns `HARD_FINDINGS` when the pool is > 0 and `CLEAN` when it is 0, softs regardless (AC-20260909-04-1, AC-20260909-04-2, AC-20260909-04-3) | 195 ledgered reviews: 91 waives vs 60 fixes; of 21 retained returns with survivors, 17 were soft-only (32 soft vs 6 hard survivors) — the loop was spending rounds legitimising hygiene notes. Rejected: a new `CLEAN-with-softs` verdict word — gate-integrity.md retired qualifier words; the count rides the row instead |
| D2 | The `FINDINGS` word survives with one meaning only: `fixDispatched > 0` (a dispatched fix is non-terminal). The soft-derived `FINDINGS` branch is deleted (AC-20260909-04-1) | One word, one meaning; the retired branch had made `medium`/`soft` indistinguishable from "something is pending" |
| D3 | The review-profile ledger row's `findings` object gains an eighth key, `soft` (count of non-hard survivors), appended last; `survived` stays the total survivor count so every existing `findings.*` reader is unchanged (AC-20260909-04-4) | Additive: no script reads `findings.*` at all (A2), and the ledger is read by key, never by count; the seven-key pin is retagged, not weakened |
| D4 | The contradiction guard (`waived + rejected + fixDispatched > pool`) compares against `hardSurvivors + legFindings`, exit 2 unchanged (AC-20260909-04-5) | A waive that can only be explained by a soft is a bookkeeping error, and the old guard would have let it pass |
| D5 | `spec-review-driver.js`'s `dispositionPools(n)` returns `{survivors: hard-only, softs, legs}`; the DISPOSITIONS step prints softs under a separate `advisory (recorded, not dispositioned)` block and lists only the hard pool as work (AC-20260909-04-6) | The disposer's pool and the step's list stay one derivation (specs/20260901/09 A5); softs are shown once so nothing is hidden, then never asked about |
| D6 | When the hard pool is empty after `--mark reviewer-returned`, the driver itself runs the verdict pass with zero dispositions, records `marks.dispositions = {waived:0, rejected:0, fixDispatched:0, word}` and `deriveState()` proceeds to CLOSE — no `--mark dispositions` is printed or required (AC-20260909-04-7). An explicit `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` on an empty pool SHALL CONTINUE TO be accepted (AC-20260909-04-11) | An empty pool has no judgment in it; the driver executes every deterministic step itself (docs/canonical/review.md § stepped program). The explicit mark stays accepted so the 17 existing fixtures and any host mid-run keep working |
| D7 | `--mark dispositions --file <disposer return>` derives `waived`/`rejected`/`fixDispatched` from the return's effective (`final` else `recommended`) values with the per-leg weights already computed; `--waived/--rejected/--fix-dispatched` become optional and, when present, must equal the derived tally (the existing mismatch refusal, unchanged text) (AC-20260909-04-8, AC-20260909-04-12) | Three round-trips were lost in one run to hand-typed counts that the file already determined. Rejected: retiring the flags now — 17 test files pass them; retirement is queued behind this spec once fixtures migrate |
| D8 | The disposer's `dispositions` array must cover the hard pool only; an entry whose `ref` names a soft survivor is refused with the existing "matches nothing in the survivor or leg-finding pools" text (AC-20260909-04-9) | Softs never enter the pool, so a disposition on one is a stale-pool signal, never a valid waive |
| D9 | Survivor refs `s<i>` index the **hard-only** list the step prints, in printed order (AC-20260909-04-6, AC-20260909-04-9) | The disposer reads refs off the step; numbering the printed list is the only shape it cannot misread |
| D10 | The ESCALATE step's waive/reject exit names `--mark dispositions --file <return.json>` with every entry `waive` or `reject`; at a spent cap a return carrying a `fix` entry is refused naming the cap (AC-20260909-04-10) | The critique's "honest exit unavailable" case: with softs out of the pool the cap is only ever reached on hard findings, and the exit must not demand a count the file already holds |
| D11 | `spec/agents/reviewer.md` § Severity calibration becomes two levels — `hard` (blocks CLEAN until dispositioned) and `soft` (advisory: recorded, never dispositioned) — and the `medium` level is deleted from the prose; verdict.js keeps treating any non-`hard` value as soft, so a stray `medium` in a return is neither refused nor promoted [no-ac: prose contract; the behavioral half is AC-20260909-04-1] | `medium` was already behaviorally identical to `soft` at the one line that reads severity; naming a third level invited the reviewer to split hairs the pipeline never read |
| D12 | `spec/agents/disposer.md` states the pool it receives is hard survivors + leg findings; `spec/commands/review.md` § DISPOSITIONS states softs are advisory, a soft the user wants fixed becomes `spec-queue add`, never a fix dispatch inside the review; the close report lists softs under `warns` as `📎 N advisory finding(s) recorded` [no-ac: doctrine prose — the driver text is AC-20260909-04-6] | The queue is the pipeline's memory; a fix dispatched for a soft would re-enter the very loop this spec closes |
| D13 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | D1–D4: hard-only pool, `FINDINGS` only for pending fix, `findings.soft` eighth key, guard against the hard pool; header comment updated |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D5–D10: `dispositionPools` returns softs separately; auto-dispose on empty hard pool in `handleReviewerReturned`; derived tallies in `handleDispositions` with optional cross-check flags; refs index hard-only; DISPOSITIONS/ESCALATE step text |
| spec/agents/reviewer.md | MODIFY | doctrine | D11: two-level severity calibration; `medium` deleted |
| spec/agents/disposer.md | MODIFY | doctrine | D12: pool is hard survivors + leg findings; softs never appear |
| spec/commands/review.md | MODIFY | doctrine | D12: DISPOSITIONS rule — softs advisory, queue not fix; `warns` slot carries the advisory count; the mark line drops the count flags |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260909-04-1, AC-20260909-04-2, AC-20260909-04-3, AC-20260909-04-4, AC-20260909-04-5; retag AC-20260805-02-4's two severity tests and AC-20260819-01-6's seven-key pin to the new shape |
| tests/review/soft-floor.test.js | CREATE | tests | AC-20260909-04-6, AC-20260909-04-7, AC-20260909-04-9, AC-20260909-04-11 — driver against a synthetic host with a soft-only, a mixed, and an empty return |
| tests/review/disposer-gate.test.js | MODIFY | tests | AC-20260909-04-8 — file-only mark derives the weighted tally |
| tests/review/disposer-gate-refusals.test.js | MODIFY | tests | AC-20260909-04-12 — the two disposition-pool-unit tests keep refusing a mismatching flag and accept file-only |
| tests/review/escalate-row-step.test.js | MODIFY | tests | AC-20260909-04-10 — ESCALATE text names the file exit; a `fix` entry at a spent cap is refused |
| tests/review/review-driver-fix-cycle.test.js | MODIFY | tests | AC-20260909-04-13 — SHALL CONTINUE TO pins on the cap and the FIX→REVIEWER cycle with hard findings |
| spec/.claude-plugin/plugin.json | MODIFY | other | D13 bump |
| tests/review/disposer-gate.fixtures.js | MODIFY | other | Forced collateral of D1/D8: `ONE_SURVIVOR_RETURN`/`TWO_SURVIVOR_RETURN` carried `severity: soft`, which the hard-only pool no longer admits — retagged to `hard`, never weakened |
| tests/review/escalate-row.fixtures.js | MODIFY | other | Forced collateral of D1/D5/D8: `reviewerReturn()`'s survivor severity `soft` → `hard` so its out-of-batch consumers still land FIX |
| tests/review/review-driver.fixtures.js | MODIFY | other | Forced collateral of D1/D5/D8: `SURVIVOR_RETURN`'s severity `soft` → `hard` for the same reason |
| size-baseline.json | MODIFY | other | Ratchet raises for the grown test files, cited to this spec (.claude/rules/spec-pipeline.md § Review Checks) via `node scripts/size-ratchet.js --raise <path> --to <n> --cite specs/20260909/04-review-soft-floor.md` |
| tests/review/review-driver-close-row.test.js | MODIFY | other | Forced collateral of D6: four ACs paired `reviewer-returned` with an explicit `dispositions` mark that the driver now runs itself — collapsed to one call, assertions unchanged |
| tests/review/review-driver.test.js | MODIFY | other | Forced collateral of D6: AC-20260901-02-4 same collapse on both the `--via loop` and no-via hosts |

Orchestrator duty outside the table: after the build, `grep -rn "medium" spec/agents/reviewer.md` must return nothing in § Severity calibration.

## Contracts

```text
verdict.js (review profile) — derive(), first match wins:
  REVIEWER_FAILED | UNVERIFIED | GATE_RED | (release → CLEAN)
  fixDispatched > 0                                → FINDINGS
  hardSurvivors + legFindings − waived − rejected − fixDispatched > 0 → HARD_FINDINGS
  else                                             → CLEAN
  hardSurvivors = survivors.filter(f => f.severity === 'hard').length
  contradiction guard: waived + rejected + fixDispatched > hardSurvivors + legFindings → exit 2

ledger row (review profile) findings object, key order:
  { survived, killed, waived, rejected, fixDispatched, reviewerCount, legFindings, soft }
  survived = survivors.length (unchanged) · soft = survivors.length − hardSurvivors

spec-review-driver.js
  dispositionPools(n) → { survivors: [hard…], softs: [soft…], legs: [red non-blocking rows] }
  --mark reviewer-returned --file <json>
      hard pool empty → runs verdict pass (0/0/0), records marks.dispositions, state → CLOSE
  --mark dispositions --file <disposer return> [--waived N] [--rejected N] [--fix-dispatched N]
      tallies derived from the file (final ?? recommended, leg refs weighted by countLegFinding)
      flags optional; present → must equal the derived tally (exit 2, existing text)
      an entry whose ref is not in the hard pool → exit 2 "matches nothing in the survivor or leg-finding pools"
      cap spent (see handleFixApplied's count) and any effective 'fix' → exit 2 naming "iteration cap 2"
  DISPOSITIONS step text:
      survivors (N):            ← hard only, s0..sN-1 in this order
      advisory (M, recorded, not dispositioned):
        [soft] file:line — claim
      leg findings (…)          ← unchanged
      mark line: --mark dispositions --file <return.json>
  ESCALATE step waive/reject exit:
      node … --mark dispositions --file <return.json>   (every entry waive|reject)
```

## Behavior

- Reviewer returns `{survivors: [{severity:'soft',…}], …}` only → the driver's reviewer-returned
  handler finds an empty hard pool, runs verdict.js with `--waived 0 --rejected 0 --fixDispatched 0`,
  records the word (`CLEAN` when legs are green), prints the CLOSE step on the next invocation.
  The retained artifact carries the soft survivor verbatim (unchanged retention), the ledger row
  carries `findings.soft: 1`.
- Reviewer returns one hard and two softs → DISPOSITIONS step prints `survivors (1)` with `s0` and an
  `advisory (2, …)` block; the disposer return covers `s0` only; a return naming `s1` is refused.
- Session marks `--mark dispositions --file r.json` with no flags → tally derived; the verdict pass
  runs with the derived numbers; `marks.dispositions` records them.
- At a spent cap, a return with `{ref:'s0', recommended:'fix'}` → exit 2, stderr names
  `iteration cap 2`, sidecar byte-identical.

## Acceptance Criteria

- **AC-20260909-04-1**: WHEN verdict.js runs on the review profile with a valid manifest, green
  blocking legs, zero leg findings, zero dispositions and a `--workflow` return whose survivors
  are all non-hard (e.g. `[{severity:'soft'}, {severity:'medium'}]`) THE SYSTEM SHALL print
  `CLEAN` on line 1 and exit 0 (`survivors: [soft, medium]` → `CLEAN`, exit 0) → tests in
  tests/review/verdict.test.js
- **AC-20260909-04-2**: WHEN the same inputs carry survivors `[{severity:'hard'}, {severity:'soft'}]`
  and zero dispositions THE SYSTEM SHALL print `HARD_FINDINGS` and exit 1, and WHEN `--waived 1`
  is added THE SYSTEM SHALL print `CLEAN` and exit 0 (one hard waived, the soft ignored) → tests
  in tests/review/verdict.test.js
- **AC-20260909-04-3**: WHEN survivors are all soft and `--fixDispatched 1` is passed THE SYSTEM
  SHALL exit 2 on the contradiction guard (pool 0 < dispositions 1), never `FINDINGS` → test in
  tests/review/verdict.test.js
- **AC-20260909-04-4**: WHEN verdict.js prints a review-profile `--ledger` row for a return with
  survivors `[hard, soft, soft]` THE SYSTEM SHALL emit `findings` with exactly the eight keys
  `survived, killed, waived, rejected, fixDispatched, reviewerCount, legFindings, soft` in that
  order with `survived: 3` and `soft: 2` → test in tests/review/verdict.test.js
- **AC-20260909-04-5**: WHEN survivors are `[hard, soft]`, leg findings 0, and `--waived 2` is
  passed THE SYSTEM SHALL exit 2 naming both pools in the guard message (`waived 2 > hard pool 1`)
  → test in tests/review/verdict.test.js
- **AC-20260909-04-6**: WHEN the driver prints the DISPOSITIONS step for a reviewer return of
  `[hard@a.js:1, soft@b.js:2, hard@c.js:3]` THE SYSTEM SHALL print `survivors (2):` listing
  a.js:1 then c.js:3, an `advisory (1, recorded, not dispositioned):` block listing b.js:2, and a
  mark line reading `--mark dispositions --file <return.json>` with no `--waived` substring →
  test in tests/review/soft-floor.test.js
- **AC-20260909-04-7**: WHEN `--mark reviewer-returned --file` carries a soft-only return on green
  legs THE SYSTEM SHALL exit 0, write `marks.dispositions = {waived:0, rejected:0, fixDispatched:0,
  word:'CLEAN'}` to review-state.json, and the next bare invocation SHALL print the CLOSE step
  (state `CLOSE`, no DISPOSITIONS step ever printed) → test in tests/review/soft-floor.test.js
- **AC-20260909-04-8**: WHEN the manifest holds a red reconcile row with `outOfPlan: 5` and
  `--mark dispositions --file` holds one `leg:reconcile` waive entry and NO count flags THE SYSTEM
  SHALL exit 0 and record `dispositions: {waived: 5, rejected: 0, fixDispatched: 0, word: 'CLEAN'}`
  → test in tests/review/disposer-gate.test.js
- **AC-20260909-04-9**: WHEN the hard pool is `[s0]` and the return also carries `{ref:'s1'}` for
  the soft THE SYSTEM SHALL exit 2 with stderr containing `matches nothing in the survivor or
  leg-finding pools` and write no `disposer-return-1.json` → test in
  tests/review/soft-floor.test.js
- **AC-20260909-04-10**: WHEN the driver prints the ESCALATE step THE SYSTEM SHALL name the exit
  `--mark dispositions --file <return.json>` and contain no `--waived N` text; and WHEN the cap is
  spent and the return's effective value for any ref is `fix` THE SYSTEM SHALL exit 2 with stderr
  containing `iteration cap 2` and leave review-state.json byte-identical → tests in
  tests/review/escalate-row-step.test.js
- **AC-20260909-04-11**: WHEN the hard pool is empty THE SYSTEM SHALL CONTINUE TO accept
  `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` with exit 0 → test in
  tests/review/soft-floor.test.js
- **AC-20260909-04-12**: WHEN `--mark dispositions --file` is passed with `--waived 1` against a
  return whose derived waive tally is 5 THE SYSTEM SHALL CONTINUE TO exit 2 naming `leg:reconcile=5`
  → tests in tests/review/disposer-gate-refusals.test.js
- **AC-20260909-04-13**: WHEN a hard finding is fix-dispatched twice THE SYSTEM SHALL CONTINUE TO
  refuse the third `fix-applied` with state `ESCALATE` naming the cap of 2, and SHALL CONTINUE TO
  return to `REVIEWER` after each accepted `fix-applied` → tests in
  tests/review/review-driver-fix-cycle.test.js

## Assumptions (escalation triggers)

- A1: verdict.js reads severity at exactly one line (`survivors.some(f => f.severity === 'hard')`)
  and nothing else in the repo derives a verdict word — checked: `grep -rn "severity" spec/scripts`
  hits verdict.js:603 and the driver's DISPOSITIONS print only — **if false:** the second reader is
  a critical-tier finding; STOP and name it before editing.
- A2: no script reads the ledger row's `findings.*` keys — checked: `grep -rn "row\\.findings\\|\\.findings\\.\\(survived\\|killed\\|waived\\|rejected\\|fixDispatched\\|legFindings\\)" spec/scripts` hits verdict.js's own writer only (fleet-reader's `findings` is its feedback-file array; escape-row's `severity` is the escape row's own enum) — **if false:** widen the File Plan by that one reader and its test.
- A3: Retained artifacts already carry the reviewer return verbatim (`artifact.reviewer = workflow`,
  verdict.js:795), so softs survive for later escape correlation without a new store — verified by
  this session's measurement over `.claude/spec-runs/rv_*.json` (32 soft survivors readable) —
  **if false:** add `softs` to the artifact under a Decision amendment.
- A4 (executed measurement, 2026-09-09): a script over `.claude/spec-runs/rv_*.jsonl|json` (110 retained review returns) counted survivors by `reviewer.survivors[].severity`: 21 returns with survivors, 17 soft-only, 32 soft vs 6 hard, and by iteration 7/5/9 — nine of the soft-carrying returns sat at iteration 3, the cap. The ledger (`.claude/spec-runs.jsonl`, 195 review rows with `findings`) summed waived 91, fixDispatched 60, iteration 2 → 56 rows, iteration 3 → 34 rows — **if false** (a re-run of the count disagrees materially): the floor still holds on mechanism; only the Goal's numbers change.

## Rationale

The loop's non-convergence had one mechanism: a soft finding could reach CLEAN only through
`fix`, `waive` (a quoted spec sanction) or `reject` (executed contrary evidence), and a fresh
reviewer produces a new soft every pass. The ledger shows the cost — 56 second passes, 34 cap
hits, 91 waives against 60 fixes — and the retained returns show the cause: 17 of the 21 runs
with survivors were soft-only. Moving softs out of the pool (D1) is the smallest change that
makes the loop converge; every hard path is untouched (AC-13 pins the cap and the cycle).

Rejected alternatives. A `CLEAN-with-softs` word: gate-integrity.md retired qualifier words for
a reason, and every `--json` consumer switches on the word. A one-shot AskUserQuestion to
promote a soft: it reintroduces the attention cost the floor removes; the queue is the promote
path. Retiring the three count flags outright: 17 test files and two fixture modules pass them;
optional-with-cross-check lands the derivation now and the retirement is queued behind this spec.
Refusing `medium` in a return: costs a re-dispatch turn to enforce a distinction the pipeline
never read.

Fragile: the guard that keeps the floor honest is the reviewer's severity call. Two existing
mechanisms watch it — replay's catch rate, and escape rows that correlate to a location. A
follow-up (queued) teaches escape rows to match ignored softs, so a real defect filed as soft
shows up as `softMatch` rather than vanishing.

Collision sweep at lock (`collision-closure --literal medium`): 13 `likely`/`mentions` hits are the
word in its effort/model sense (core.md, wf-*.js, spec-status tests); the one severity-sense pin
is tests/review/verdict.test.js:248–270, already a File Plan row. The `executes` hit,
tests/consistency/entrypoints.test.js, exercises the driver's entrypoint conformance (usage,
header, exit codes), which D5–D10 leave unchanged — recorded waive.

## Canonical Delta

docs/canonical/review.md, the verdict-word paragraph: replace "`CLEAN` is unreachable until
dispositions cover the whole pool — leg findings are always hard" with "the disposition pool is
hard survivors plus leg findings; soft survivors are advisory — counted in the row's
`findings.soft`, retained verbatim in the artifact, never dispositioned, never fix-dispatched.
`CLEAN` is unreachable until dispositions cover the hard pool; `FINDINGS` means exactly one
thing, a dispatched fix that has not landed." Add to the driver paragraph: "an empty hard pool
after `reviewer-returned` is dispositioned by the driver itself (no mark); `--mark dispositions
--file` derives the waived/rejected/fix tallies from the disposer return, the count flags being
an optional cross-check." (specs/20260909/04-review-soft-floor.md)
