---
date: 2026-08-22
status: hardened
open_markers: 0
spiked: 2026-08-22
tier: critical           # edits verdict.js derive()/arg surface — named on Risk Tiers ("sole derivation of the review/release verdict word; never a second place that computes or asserts CLEAN"). The driver edit alone would be standard (spec 04 precedent), but the verdict edit governs.
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260821/04-stopped-row-durability.md", "specs/20260821/03-cross-spec-skip-mapping.md"]
depended_on_by: []
brief: n/a
---

# Escalate ledger row — a capped review is never invisible

## Goal

A review that burns its fix loop to the cap (2 iterations) and is then abandoned currently
writes **zero** ledger rows — three leg iterations and three reviewer dispatches leave no
trace, because the driver's only two append points are the hard-stop (`GATE_RED`) and the
CLEAN close, and the ESCALATE refusal reaches neither. The gap is self-concealing: it cannot
be counted from the ledger because it writes nothing. Done means: the cap refusal itself
appends one honest, durable ledger row (reusing spec 04's stopped-ledger path in worktrees),
the escalation fact rides as a typed row field minted by `verdict.js` — never a new verdict
word — and the ESCALATE step text finally names its exits. The doctrine invariant this
closes: "a stopped attempt is never invisible" (core doctrine), extended to capped attempts.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | No new verdict word. The escalate row's `verdict` is whatever `verdict.js` honestly derives from the final iteration's evidence (in practice `HARD_FINDINGS`/`FINDINGS`; `UNVERIFIED` in degenerate edges); the escalation fact is a typed row field `"escalated": true`, minted by `verdict.js` behind a new mechanical flag `--escalated` (AC-20260822-01-1) | An `ESCALATED` word would be the first word not derivable from evidence — the driver would decide, verdict.js would merely print: the exact "second derivation" § Risk Tiers forbids. Rejected: driver-mutates-the-row (worse violation), new word (touches alphabet pin + every consumer). |
| D2 | Escalate invocation shape: final manifest, final reviewer return (`marks.reviewerReturnFile`), the recorded dispositions' `--waived W --rejected R`, **`--fixDispatched 0`** (forced — the dispatched fix never landed), plus `--escalated --ledger --spec <specRel> --tier <tier> --diff-loc N --iteration <final n> --run-id <run's runId> --retain <repoRoot>/.claude/spec-runs` (AC-20260822-01-1, AC-20260822-01-2) | Counting a fix that never applied would fabricate disposition coverage and derive `FINDINGS` via the non-terminal branch; with F=0 the undispositioned remainder stays ≥1 whenever pools are stable. `--retain` is mandatory here by the existing requiredness matrix — a feature: the capped run's survivors are retained full-fidelity under the run's `rv_` id. |
| D3 | `verdict.js` refuses `--escalated` combined with `--fixDispatched > 0` and with `--profile release` — exit 2, before file I/O, each message naming the rule and remedy (AC-20260822-01-2, AC-20260822-01-3) | Same flag-presence-checked-first pattern as the `--retain` matrix. Tests must assert on the **stderr message**, never exit code alone — the pre-image already exits 2 on `--escalated` via the unknown-flag usage fallback (executed spike S3; vacuous-rejection gotcha, 6 occurrences on record). |
| D4 | **Load-bearing guard:** `--escalated` with a derived word of `CLEAN` → exit 2; no verdict word printed, no ledger line printed (AC-20260822-01-4) | Spike S1 Case B **falsified** "CLEAN is arithmetically unreachable at F=0": a red non-blocking leg going green between the dispositions pass and the escalate pass shrinks the recomputed pool, waives cover it, and the pre-image prints `CLEAN` exit 0. A self-contradictory `CLEAN`+`escalated:true` row in the one file that must never wrongly say CLEAN is the worst possible output; the guard is a correctness requirement, not belt-and-braces. |
| D5 | Write point: one helper `writeEscalateRow()` called from `handleFixApplied()`'s cap-refusal branch, **before** `die()`; idempotency via a new sidecar mark `marks.escalateRunId` (set only after a successful append); self-heal in the ESCALATE state's step arm — a bare re-invocation with `marks.escalated` set but no `escalateRunId` appends then (AC-20260822-01-5, AC-20260822-01-6, AC-20260822-01-8) | The session that hits the cap and walks away never re-invokes — the refusal is the last guaranteed execution moment, mirroring spec 04's "at the moment of the stop". The set-and-save-inside-a-refusal precedent already exists at this exact spot (`marks.escalated = true`). Rejected: write-on-next-invocation-only (leaves the dominant abandonment path open). |
| D6 | Durability reuses spec 04's path **verbatim**: `repoRoot !== mainRoot && ensureStoppedLedgerIgnored(mainRoot)` → append to `<mainRoot>/.claude/spec-runs.stopped.jsonl`; else `appendLedger()` fallback; record `marks.escalateLedgerPath` + `marks.escalateFallback` (same semantics as the stopped pair). Never a new filename (AC-20260822-01-7) | Spike S2: `spec-runs.escalated.jsonl` sorts **before** `spec-runs.jsonl` in `readLedgerRows()`'s filename sort, inverting the last-row-wins position property `qualifyingObservation()` depends on. The coupling is right: an escalated run *is* a stopped attempt under the doctrine invariant. |
| D7 | The escalate row is **permanent evidence** — `drainStoppedRows()` relocates it into the tracked ledger at close/promotion (it partitions purely by `spec`, zero changes needed), never deletes it. On the waive-to-CLEAN exit both rows share the run's `runId`; the close row lands after, so observation joins key on the close row (AC-20260822-01-11) | Deleting would re-open the invisibility this spec closes. `replay --select` filters `verdict === 'CLEAN'` and ignores it; `/spec:escape` correlates the last review row — close row when one exists, escalate row when abandoned; both correct with no reader changes. |
| D8 | Any exit-2 from the escalate verdict pass (D4's CLEAN guard, the disposition-contradiction guard on a shrunk pool) is **loud, row-less, and retryable**: the refusal message embeds the verdict error verbatim, `marks.escalateRunId` stays unset, the cap refusal still stands (`marks.escalated = true`), and the next bare invocation retries the append via D5's self-heal (AC-20260822-01-9) | Crashing the refusal would lose the cap record too; clamping W/R to the shrunk pool would fabricate. Honest evidence drift gets named and retried once the evidence is repaired. |
| D9 | The ESCALATE step text gains a remedy block: (a) the waive/reject route — a fresh `--mark dispositions --fix-dispatched 0` covering the pool closes normally; (b) the abandon route — delete the `<spec>.review/` sidecar and manifests to restart cold; plus the absolute path the escalate row landed in (or the loud drift note when D8 withheld it) (AC-20260822-01-12) | ESCALATE is the only step today that names no exit path; the waive route already exists (verified: fresh dispositions reset `pendingFix`, derive CLEAN, close normally) but is undiscoverable. |
| D10 | Silent-loss detector: on driver entry, when the sidecar records a durable ledger path (`stoppedLedgerPath` or `escalateLedgerPath` pointing outside `spec-runs.jsonl`), verify a row for this spec+runId is still readable there; missing → one loud stderr warning naming the spec, runId, and path — never blocks, never exits (AC-20260822-01-13) | Spec 04's assumption A6 escalates "on an observed loss", but the loss is silent by construction — the trigger is a dead letter. This arms it. Partial by design (a dead worktree's sidecar never speaks); rides here because escalate rows roughly double the durable file's writers. |
| D11 | `spec/commands/review.md`: the ledger sentence "appended by the driver at STOPPED and CLOSE" widens to name ESCALATE; the ESCALATE paragraph in the re-entrancy prose names the row and both exits. `spec/.claude-plugin/plugin.json` bumps to 7.17.0 (target, not pin) with the changelog paragraph [no-ac: prose/changelog surfaces — review's version-bump check and the doctrine reviewer are the oracles; the step-text observable is pinned by AC-20260822-01-12] | Version bump discipline (§ Planning); the literal "STOPPED and CLOSE" appears only in review.md (collision sweep executed at lock — no test asserts it). |
| D12 | Regression pins: the cap refusal continues to exit 2 with the refusal message (AC-20260822-01-10, retag the existing cap pin); the drain continues to relocate every row for the spec regardless of verdict word (AC-20260822-01-11, extend the existing drain test — expected green) | New behavior is additive at the refusal moment; the refusal contract (AC-20260820-07-8) and the drain contract (spec 04) must survive byte-for-byte in spirit. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | `--escalated` flag: `escalated: true` row field on the review-profile ledger row; refusal matrix (with `--fixDispatched > 0`, with `--profile release`, with derived `CLEAN`); usage line + header comment (new exit-2 causes documented) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `writeEscalateRow()` (durable-path branch mirroring `runHardStopVerdict()`), call in `handleFixApplied()`'s cap branch before `die()`, self-heal in the ESCALATE step arm, D9 step text, D10 detector on entry, header comment update |
| spec/commands/review.md | MODIFY | doctrine | Widen the ledger-append sentence to STOPPED/ESCALATE/CLOSE; ESCALATE re-entrancy sentence names the row and both exits |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | 7.17.0 + changelog paragraph (last-3 form) |
| tests/review/escalate-row.test.js | CREATE | tests | AC-20260822-01-1, -2, -3, -4, -5, -6, -7, -8, -9, -12, -13 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260822-01-10 — retag/extend the existing cap-refusal pin (never weaken) |
| tests/review/stopped-row-durability.test.js | MODIFY | tests | AC-20260822-01-11 — extend the drain test with an `escalated: true` row (expected green: drain partitions by spec only) |

## Contracts

New `verdict.js` flag (review profile only):

```
--escalated        marks this pass as a fix-cap escalation. Effects:
                   - review-profile --ledger row gains "escalated": true
                   - refused (exit 2, before file I/O) with --fixDispatched > 0:
                     "…a capped run's dispatched fix never landed — pass --fixDispatched 0"
                   - refused (exit 2, before file I/O) with --profile release:
                     "…escalation is a review-profile fact; drop --escalated"
                   - refused (exit 2, after derivation, no word/row printed) when the
                     derived word is CLEAN:
                     "…derived CLEAN under --escalated — evidence drifted since the
                     dispositions pass; re-run dispositions against the current evidence"
```

Escalate ledger row (identical to a close row plus one field; emitted on stdout line 2 by
`verdict.js`, appended by the driver):

```json
{"ts":"…","spec":"specs/…","stage":"review","tier":"…","runId":"rv_…","verdict":"HARD_FINDINGS",
 "escalated":true,"scope":"fix-delta","iteration":3,"diff":{"loc":N},"smoke":"…",
 "testsSkipped":{…},"legs":[…],"tokens":{…},"findings":{…},"verify":…}
```

New sidecar marks (`<spec>.review/review-state.json`), mirroring the stopped pair:

```
escalateRunId: "rv_…"        set only after a successful append — the idempotency guard
escalateLedgerPath: "/abs…"  where the row actually landed
escalateFallback: bool       true only when durable was attempted and lost (D3 of spec 04)
```

Driver refusal output at the cap (shape, not verbatim): the existing refusal sentence, plus
either `An escalate ledger line has been appended to <path>.` or the D8 drift note embedding
the verdict error, plus D9's two-exit remedy block.

## Behavior

At the third `--mark fix-applied`, `handleFixApplied()` refuses today by setting
`marks.escalated = true`, saving the sidecar, and dying. This spec inserts one step between
the mark and the die: `writeEscalateRow()` runs the escalate verdict pass (D2), and on
success appends stdout line 2 to the durable target (D6), records the three marks, then the
refusal proceeds with the enriched message. On any verdict exit 2, D8 applies. A bare
re-invocation in the ESCALATE state first self-heals a missing append (D5), then prints the
D9 step text. Driver entry runs the D10 detector once per invocation, stderr-only. The
waive/reject exit is untouched: a fresh dispositions mark with F=0 covering the pool still
derives CLEAN and closes through `doCloseWork()` exactly as today — the escalate row simply
precedes the close row in read order (both drained/positioned by the existing machinery).

## Acceptance Criteria

- **AC-20260822-01-1**: WHEN `verdict.js` runs with `--escalated --fixDispatched 0 --ledger
  --workflow <return> --retain <dir>` and the final evidence leaves ≥1 undispositioned
  finding THE SYSTEM SHALL print the honestly-derived word and a ledger row carrying
  `"escalated": true` (literal: 1 hard survivor + 1 red `at-risk` leg, `--waived 1
  --rejected 0` → word `HARD_FINDINGS`, exit 1, row has `escalated:true` and
  `findings.fixDispatched: 0`) → tests/review/escalate-row.test.js
- **AC-20260822-01-2**: WHEN `--escalated` is passed with `--fixDispatched 1` THE SYSTEM
  SHALL exit 2 with a stderr message containing `dispatched fix never landed` (message
  asserted, not exit code alone — pre-image exits 2 via usage fallback) →
  tests/review/escalate-row.test.js
- **AC-20260822-01-3**: WHEN `--escalated` is passed with `--profile release` THE SYSTEM
  SHALL exit 2 with a stderr message containing `drop --escalated` →
  tests/review/escalate-row.test.js
- **AC-20260822-01-4**: WHEN `--escalated` derivation reaches `CLEAN` THE SYSTEM SHALL exit
  2, print **no** verdict word and **no** ledger line, and name evidence drift on stderr
  (literal: spike S1 Case B inputs — 6 green fix-delta legs + green `at-risk`, 1 hard
  survivor, `--waived 1 --rejected 0 --fixDispatched 0` — pre-image prints `CLEAN` exit 0;
  post-image exit 2, empty stdout) → tests/review/escalate-row.test.js
- **AC-20260822-01-5**: WHEN the third `fix-applied` mark is refused in an in-place review
  THE SYSTEM SHALL have appended exactly one row with `escalated:true` to
  `.claude/spec-runs.jsonl` whose `runId` equals the sidecar's `runId` and whose
  `iteration` equals the final manifest number, and the sidecar SHALL record
  `escalateRunId` → tests/review/escalate-row.test.js
- **AC-20260822-01-6**: WHEN the refused mark is repeated THE SYSTEM SHALL still have
  exactly one `escalated:true` row for the spec (count === 1 after two refusals; pre-image
  count is 0, so this pins both presence and idempotency) →
  tests/review/escalate-row.test.js
- **AC-20260822-01-7**: WHEN the cap is hit in a worktree review whose main root ignores the
  stopped ledger THE SYSTEM SHALL append the row to
  `<mainRoot>/.claude/spec-runs.stopped.jsonl` and record that absolute path as
  `marks.escalateLedgerPath` with `escalateFallback: false` →
  tests/review/escalate-row.test.js
- **AC-20260822-01-8**: WHEN the driver is invoked bare with `marks.escalated` set and no
  `escalateRunId` THE SYSTEM SHALL append the row then (self-heal) and print the ESCALATE
  step → tests/review/escalate-row.test.js
- **AC-20260822-01-9**: WHEN the escalate verdict pass exits 2 (drift) THE SYSTEM SHALL
  embed the verdict error in the refusal output, append no row, leave `escalateRunId`
  unset, and keep `marks.escalated = true` (so the refusal stands and the self-heal can
  retry) → tests/review/escalate-row.test.js
- **AC-20260822-01-10**: WHEN a third `fix-applied` is marked THE SYSTEM SHALL CONTINUE TO
  refuse it with exit 2 and the iteration-cap message →
  tests/review/review-driver.test.js (retag the existing cap pin)
- **AC-20260822-01-11**: WHEN a spec with an `escalated:true` row in the stopped ledger
  later closes THE SYSTEM SHALL CONTINUE TO drain that row into the tracked ledger
  positioned before the close row (drain partitions by `spec` only; expected green) →
  tests/review/stopped-row-durability.test.js
- **AC-20260822-01-12**: WHEN the driver prints the ESCALATE step THE SYSTEM SHALL name the
  waive/reject close route, the abandon route, and the ledger path the row landed in →
  tests/review/escalate-row.test.js
- **AC-20260822-01-13**: WHEN the sidecar records a durable ledger path but no row for this
  spec+runId is readable there THE SYSTEM SHALL print one stderr warning naming the spec,
  runId, and path, and proceed unchanged (exit status and printed step identical to the
  no-warning run) → tests/review/escalate-row.test.js

## Assumptions (escalation triggers)

- A1: "CLEAN is arithmetically unreachable at `--fixDispatched 0`" is **false** under
  evidence drift — executed spike S1: Case A (stable pool: 1 survivor + 1 red `at-risk`
  leg, `--waived 1 --fixDispatched 0`) printed `HARD_FINDINGS` exit 1; Case B (same but
  `at-risk` green — pool shrunk to 1, waive covers it) printed `CLEAN` exit 0 on the
  pre-image. D4's guard is therefore load-bearing. — **if the guard itself proves
  unimplementable before the ledger print:** STOP, ask the user (never print-then-retract).
- A2: `spec-runs.escalated.jsonl` would sort before `spec-runs.jsonl` — executed spike S2:
  `['spec-runs.jsonl','spec-runs.stopped.jsonl','spec-runs.escalated.jsonl'].sort()` →
  `escalated < jsonl < stopped`. Locks D6's reuse; never introduce a `spec-runs.*` filename
  sorting before `spec-runs.jsonl`.
- A3: The pre-image rejects `--escalated` as an unknown flag (usage, exit 2) — executed
  spike S3. Every refusal AC asserts the specific stderr message (vacuous-rejection gotcha).
- A4: `drainStoppedRows()` partitions purely by `JSON.parse(line).spec === specRel` (read,
  spec-review-driver.js) — escalate rows drain with zero drain changes. — **if false:**
  blocked; STOP, the File Plan widens.
- A5: At the refusal moment, `marks.reviewerReturnFile` / `marks.reviewerReturnIteration` /
  `marks.dispositions` reference the **final** iteration's artifacts (verified against the
  state machine: dispositions precede FIX, which precedes the refused mark). — **if false:**
  blocked; STOP.
- A6: Stopped-file write concurrency stays lock-free even with escalate rows (~doubling
  single-digit-per-month traffic). Pre-registered escalation — replacing spec 04 A6's
  unobservable tombstone trigger: **per-spec sharding** (`spec-runs.stopped.<spec-hash>.jsonl`
  — matches the reader glob, sorts after `spec-runs.jsonl`, makes the drain a whole-file
  read+unlink so the foreign-spec race ceases to exist), **never** a tombstone (needs reader
  changes; an undrained copy recreates position poisoning). Flip condition: D10's detector
  fires once, OR sustained write traffic exceeds ~1 row/day.
- A7: On the waive-to-close exit, `doCloseWork()`'s `--retain` overwrites the escalate-moment
  artifact at `<runId>.json` — accepted: the run closed CLEAN under user authority, the
  ledger row keeps the count signal, and a second runId would break the one-runId-per-run
  join model. Never mint a second runId.

## Rationale

The design came out of a Fable 5 consult (2026-08-22) and survived three corrections to the
problem statement: the verdict alphabet is 6 words (`SURVIVORS` is a pre-v7 fossil);
ESCALATE is not fully terminal (the waive/reject exit closes normally and writes a normal
close row — the 5 iteration-3 rows in this repo's ledger are plausibly exactly these); and
the driver never writes `FINDINGS`/`HARD_FINDINGS` rows today, so consumers already tolerate
non-CLEAN review rows — load-bearing for D1. The genuinely invisible case is: capped, then
resolved by anything other than waive-to-CLEAN (abandon, rebuild, rescope, neglect). That
count is unknowable from the ledger today — the defining property of the defect.

Rejected alternatives, beyond the per-Decision notes: a new verdict word `ESCALATED`
(process outcome smuggled into an evidence alphabet; touches the alphabet regex pin and
every consumer); driver-side mutation of verdict.js's printed row (the driver rewriting the
sole derivation's output — a worse tier violation dressed as tier-dodging; breaks the
byte-verbatim append contract both existing append points share); write-on-next-invocation
(the abandonment path never re-invokes); a separate durable file (A2); re-passing the
recorded `--fixDispatched N` (derives `FINDINGS` via the non-terminal branch on a terminal
run — a fabricated coverage claim).

Collision-closure adjudication (lock, 2026-08-22): literals hit "STOPPED and CLOSE" →
spec/commands/review.md, already a File Plan row (fix). Waived as lexical proxies:
tests/scope-reconcile-at-risk.test.js (uses `spec/scripts/verdict.js` only as a synthetic
fixture path string, line 37/41 — pins scope-reconcile, not verdict behavior) and
tests/consistency/entrypoints.test.js (uses review.md only as synthetic fixture content,
lines 666/1028 — pins the entry-point sweep, not review.md's prose).

Fragile to watch at build: D8's interplay with the contradiction guard — the escalate pass
re-submits recorded W/R against recomputed pools, so a shrunk pool can trip either the
contradiction guard or D4's CLEAN guard; both must land in D8's loud-row-less-retryable
handling, never a crash that loses the cap record. Tier is critical because
`spec/scripts/verdict.js` is edited (§ Risk Tiers); spec 04 only read it and was standard.

## Canonical Delta

`docs/canonical/review.md`, ledger/observation section: after the sentence describing the
two append points, add — "A third `fix-applied` (the iteration cap) appends an **escalate
row** at the moment of the refusal: an honestly-derived non-CLEAN verdict carrying
`escalated: true`, minted by `verdict.js` behind `--escalated` with `--fixDispatched 0`
(the dispatched fix never landed; a derived CLEAN under `--escalated` is refused as
evidence drift — never printed). In a worktree it lands durably in the main root's
gitignored `spec-runs.stopped.jsonl` exactly like a hard-stop row, drains into the tracked
ledger at close/promotion, and is permanent evidence — a capped attempt is never invisible.
The waive/reject exit still closes normally; its close row lands after the escalate row and
remains the observation join's key."
