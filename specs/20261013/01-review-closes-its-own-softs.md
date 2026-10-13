---
date: 2026-10-13
status: done
build_base: main
tier: standard
area: review
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-13
open_markers: 0
diff_base: c796f0324cf57dd219abc1ae7e10d420dc978bf6
---

# Review closes its own soft findings

## Goal

A soft (advisory) reviewer finding is fixed inside the review that found it, or recorded as debt
in the spec it belongs to — never pasted into the session queue by hand. The review driver's
CLOSE step gains a soft sweep: every soft from the last reviewer return is either fixed in the
close tree under a line ceiling the driver enforces, or written into the spec's Rationale as
advisory debt. The DISPOSITIONS step and the stage doctrine stop telling the session to
`spec-queue add` a soft. Done means: a spec whose review produced softs cannot be marked closed
until each soft has a recorded fate, the close commit's source change is measured against the
ceiling, and the close row carries the sweep tally. This decides q319 (the fix lane) as yes in
its smallest form — the fix lane is the soft sweep at close, not a separate `--fix` entry point.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The CLOSE step prints a `0. Soft sweep` block when the current iteration's reviewer return carries ≥1 non-hard survivor: each soft as `a<i> [soft] <file>:<line> — <claim>` (0-based, printed order of `dispositionPools(n).softs`), the worker instruction, and the mark line `--mark soft-swept --file <sweep.json>`; zero softs prints no block and no mention of a sweep (AC-20261013-01-1) | The sweep lives inside CLOSE, after the authoritative verdict, so no reviewer re-pass follows it — specs/20260909/04 measured the soft re-review loop as the non-convergence mechanism. Rejected: a new SWEEP state before CLOSE (fixes would land in the judged tree unreviewed by legs) |
| D2 | `--mark soft-swept --file <sweep.json>` accepts `{"sweep":[{"ref":"a<i>","outcome":"fixed"\|"debt","reason":"…"}]}` covering every printed soft exactly once; `reason` must be non-blank for `debt`. On accept the driver writes `marks.softSweep = {fixed, debt, entries:[{ref,outcome,reason}]}` to review-state.json and appends a `### Advisory debt (review <runId>)` block under the spec's `## Rationale` listing each debt soft as `- a<i> <file>:<line> — <claim> — <reason>` (a spec with no `## Rationale` heading gets one appended at the end) (AC-20261013-01-2) | Mirrors the disposer-return contract so the session has one shape to learn; the spec file is the durable home for a soft the review did not fix — the queue is for decisions and spec-sized work only. Rejected: writing debt to the deviations sidecar (it is deleted at close) |
| D3 | A sweep file that is missing, unreadable, not valid JSON, has a non-array `sweep`, covers a printed ref zero times or more than once, names an unknown ref, carries an `outcome` outside `fixed\|debt`, or a `debt` with a blank `reason` is refused at exit 2 naming the defect, with review-state.json and the spec file left byte-identical (AC-20261013-01-3) | Same refusal discipline as `--mark dispositions --file`: every exit names its own fix, a refused mark is side-effect-free |
| D4 | `--mark closed` is refused at exit 2 naming `--mark soft-swept --file <sweep.json>` as the remedy when the current return carries ≥1 soft and no accepted sweep mark exists; the check runs before the deviations, gotchas-ratchet and dirty-tree refusals (AC-20261013-01-4) | A close with an unswept soft is the exact hole the hand-queuing filled; refusing early keeps the mark side-effect-free |
| D5 | `SOFT_SWEEP_MAX_LINES = 60` is a plugin constant in `spec-review-driver.js`. When an accepted sweep has `fixed ≥ 1`, `--mark closed` measures `git diff --numstat --no-renames <judged sha> HEAD` excluding the spec file, `docs/canonical/`, the host's `pipelineRules` file, `.claude/spec-runs.jsonl`, `.claude/spec-runs/` and the sidecar; the sum of added+deleted lines above the ceiling, or any binary row (`-\t-`), is refused at exit 2 with the literal phrase `soft sweep over ceiling`, the measured count, the ceiling, and the revert remedy (`git checkout <judged sha> -- <files>`, re-record those softs as `debt`, re-commit, re-mark). `fixed = 0` or zero softs runs no measurement (AC-20261013-01-5) | The ceiling is what keeps an unreviewed close-commit change small; it is a driver constant, not a grounding-contract field, so the contract hash and every host stamp stay unchanged (memory: q319 design). The overlay exclusions are exactly the files CLOSE already writes. Rejected: per-soft attribution (a diff cannot be attributed to a finding) |
| D6 | An accepted `--mark closed` after a sweep re-stamps this run's close row in place (the ledger row whose `runId === marks.closeRunId`) with `softSweep: {fixed: N, debt: N}` appended as a top-level key — one row, never a second row; a close with zero softs writes no `softSweep` key and the row stays byte-identical to today (AC-20261013-01-6, AC-20261013-01-8) | The close row is written by verdict.js before the sweep happens, and q242 already established in-place re-stamp as the one way to correct a close-time count. Rejected: new keys inside `findings` (its eight-key order is pinned by AC-20260909-04-4) |
| D7 | The DISPOSITIONS step's advisory block keeps its `advisory (N, recorded, not dispositioned):` heading and its sentence `A soft finding the user wants fixed goes to spec-queue add, never a fix dispatched here.` becomes `Softs are swept at CLOSE (fixed under the ceiling or recorded as debt), never dispositioned here.` (AC-20261013-01-7) | The printed step is the instruction the session follows; this sentence was the mechanism that filled the queue |
| D8 | `spec/doctrine/stages/stage-review.md` § Dispositions replaces `one worth fixing becomes \`spec-queue add\`` with the sweep rule, § Close gains the sweep as step 0 and narrows its queue sentence to follow-ups that need their own spec or the user's decision — file stays ≤ 93 lines; `spec/agents/reviewer.md` § Severity calibration's `never fix-dispatched inside review` becomes `swept at CLOSE under the driver's ceiling` (AC-20261013-01-9) | Doctrine must state the enforced rule, not the retired one; the doctrine budget test forbids growth, so the edits are replacements |
| D9 | Regression pins: a soft-only return on green legs SHALL CONTINUE TO auto-disposition and reach CLOSE with no DISPOSITIONS step; a zero-soft close SHALL CONTINUE TO accept `--mark closed` without a sweep mark (AC-20261013-01-8, AC-20261013-01-10) | The sweep is additive to the soft floor; in-flight hosts with zero softs must not notice this spec |
| D10 | `docs/canonical/review.md` § findings paragraph gains the sweep sentence (Canonical Delta, applied at close) [no-ac: canonical prose applied by the review stage on CLEAN] | Canonical docs are the cold-start truth for the next planner |
| D11 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1 CLOSE step sweep block; D2/D3 `--mark soft-swept --file` handler + Rationale debt append; D4 unswept-softs refusal; D5 `SOFT_SWEEP_MAX_LINES` + numstat ceiling at `--mark closed`; D6 close-row re-stamp; D7 DISPOSITIONS sentence |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D8 § Dispositions + § Close sweep wording, replacements only (≤ 93 lines) |
| spec/agents/reviewer.md | MODIFY | doctrine | D8 § Severity calibration soft sentence |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11 bump via plugin-bump.js |
| tests/review/soft-sweep.test.js | CREATE | tests | AC-20261013-01-1, AC-20261013-01-2, AC-20261013-01-3, AC-20261013-01-4, AC-20261013-01-5, AC-20261013-01-6, AC-20261013-01-7, AC-20261013-01-9 |
| tests/review/soft-floor.test.js | MODIFY | tests | AC-20261013-01-10 retag on the existing AC-20260909-04-7 test |
| tests/review/review-driver-close-row.test.js | MODIFY | tests | AC-20261013-01-8 retag on the existing AC-20260820-07-6 close-row test (asserts no `softSweep` key) |

## Contracts

```jsonc
// <sweep.json> — written by the session after the sweep workers return; read by --mark soft-swept
{
  "sweep": [
    { "ref": "a0", "outcome": "fixed" },
    { "ref": "a1", "outcome": "debt", "reason": "needs the user to pick the overlay file location" }
  ]
}

// review-state.json (sidecar) — new key on accept
"softSweep": { "fixed": 1, "debt": 1, "entries": [ { "ref": "a0", "outcome": "fixed", "reason": "" },
                                                     { "ref": "a1", "outcome": "debt", "reason": "…" } ] }

// close row (.claude/spec-runs.jsonl, stage:"review", runId === closeRunId) — re-stamped in place at --mark closed
"softSweep": { "fixed": 1, "debt": 1 }

// spec file, appended under ## Rationale on --mark soft-swept accept (one block per review run)
### Advisory debt (review rv_0123456789ab)
- a1 spec/scripts/prototype-driver.js:412 — re-entry by words opens a second prototype — needs the user to pick the overlay file location
```

```js
// spec-review-driver.js
const SOFT_SWEEP_MAX_LINES = 60   // added + deleted lines of the close tree vs the judged sha, overlay paths excluded
// exit 2 text (D5): `soft sweep over ceiling: <N> changed line(s) vs judged <sha7>, ceiling <60> — revert the oversized fix
//   (git checkout <sha> -- <file…>), re-record those softs as debt, re-commit, then re-run --mark closed`
```

## Behavior

**Order inside CLOSE.** The driver has already run the authoritative verdict and flipped the spec
to `done` (unchanged). The printed step now reads: `0. Soft sweep` (only when softs ≥ 1) → `1.
Canonical Delta` → `2. deviations fold` → `3. hygiene listing` → `4. close commit` → `--mark
closed`. The sweep instruction: dispatch fix workers via the host's `agentMap` exactly as the FIX
step does, one worker per soft, each returning `fixed` or `debt <reason>`; a soft the worker
cannot fix without a decision only the user can make is `debt`, never an `AskUserQuestion`. The
session writes `sweep.json`, marks `soft-swept`, then continues with step 1.

**`--mark soft-swept`** is accepted once per iteration; a second accepted mark replaces the first
(the Rationale block for the same `runId` is rewritten, not duplicated). It is refused when the
current return carries zero softs (`nothing to sweep`).

**`--mark closed`** refusal order: status not done → unswept softs (D4) → deviations → gotchas
ratchet → dirty tree → ceiling (D5, after the dirty-tree check so it measures the committed close
tree) → close-time gate → suite re-run (existing). The judged sha is `marks.closeRunId`'s close
row `diff.head`, read from the ledger exactly as `writeReviewRef(..., 'judged', ...)` wrote it.

**Edge: worktree review.** The sweep file lives in the sidecar directory (never committed, dies
with the worktree); the Rationale append rides the close commit like the status flip does; the
close-row re-stamp writes the ledger under `repoRoot`, promoted by `finishMerge()` unchanged.

**Edge: in-flight host at CLOSE with softs.** The next `--mark closed` is refused naming the
sweep mark; the remedy is one sweep pass. Hosts at any other state are untouched.

**Not changed.** Hard survivors, the disposer, the fix/fix-delta cycle, the iteration cap,
verdict.js, `findings.*`, the grounding contract and its hash.

## Acceptance Criteria

- **AC-20261013-01-1**: WHEN the driver prints the CLOSE step for a run whose current reviewer return carries survivors `[soft@src/foo.js:1 "x", soft@src/bar.js:7 "y"]` THE SYSTEM SHALL print a `0. Soft sweep` block before `1.` listing `a0 [soft] src/foo.js:1 — x` then `a1 [soft] src/bar.js:7 — y` and the line `--mark soft-swept --file <sweep.json>`; for a return with zero softs the printed step SHALL contain neither `Soft sweep` nor `soft-swept` → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-2**: WHEN `--mark soft-swept --file` carries `{"sweep":[{"ref":"a0","outcome":"fixed"},{"ref":"a1","outcome":"debt","reason":"needs a decision"}]}` against that two-soft return THE SYSTEM SHALL exit 0, write `marks.softSweep = {fixed:1, debt:1, entries:[…]}` to review-state.json, and append under the spec's `## Rationale` a block whose first line is `### Advisory debt (review <closeRunId>)` and whose next line is `- a1 src/bar.js:7 — y — needs a decision`, with no line for `a0` → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-3**: WHEN `--mark soft-swept --file` carries, against that two-soft return, each of: no `--file`; a file that is not JSON; `{"sweep":[{"ref":"a0","outcome":"fixed"}]}` (a1 uncovered); `{"sweep":[{"ref":"a0","outcome":"fixed"},{"ref":"a0","outcome":"debt","reason":"r"},{"ref":"a1","outcome":"fixed"}]}` (a0 twice); `[…{"ref":"a2",…}]` (unknown ref); `{"ref":"a1","outcome":"waive"}` (outcome outside the enum); `{"ref":"a1","outcome":"debt","reason":"  "}` (blank reason) THE SYSTEM SHALL exit 2 with stderr naming the defect (`--file`, `not valid JSON`, `uncovered a1`, `duplicate a0`, `unknown ref a2`, `outcome`, `blank reason` respectively) and leave review-state.json and the spec file byte-identical → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-4**: WHEN `--mark closed` runs on a run whose current return carries ≥1 soft and no `marks.softSweep` exists THE SYSTEM SHALL exit 2 with stderr naming `--mark soft-swept --file <sweep.json>`, before any deviations, gotchas or dirty-tree message, leaving review-state.json byte-identical → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-5**: WHEN `--mark closed` runs after an accepted sweep with `fixed ≥ 1` and the committed close tree differs from the judged sha by 61 added+deleted lines in `src/foo.js` (the spec file's own status-flip edit excluded) THE SYSTEM SHALL exit 2 with stderr containing `soft sweep over ceiling`, `61`, `60`, and `git checkout <judged sha> -- src/foo.js`; the same close with 60 lines SHALL exit 0; a close whose diff carries a binary row (`-\t-`) SHALL exit 2 with `soft sweep over ceiling`; a sweep with `fixed = 0` and a 61-line source change SHALL NOT be refused by this check → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-6**: WHEN `--mark closed` is accepted after a sweep of `{fixed:1, debt:1}` THE SYSTEM SHALL re-stamp the close row whose `runId` equals the sidecar's `closeRunId` with `softSweep: {"fixed":1,"debt":1}` in place — the ledger's review-row count is unchanged and every other key of that row is byte-identical → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-7**: WHEN the driver prints the DISPOSITIONS step for a return of `[hard@a.js:1, soft@b.js:2]` THE SYSTEM SHALL print the `advisory (1, recorded, not dispositioned):` heading followed by the sentence `Softs are swept at CLOSE (fixed under the ceiling or recorded as debt), never dispositioned here.` and SHALL NOT contain the substring `spec-queue add` → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-8**: WHEN a clean run's return carries zero softs and the session marks closed with no sweep mark THE SYSTEM SHALL CONTINUE TO accept `--mark closed` and SHALL CONTINUE TO write a close row with no `softSweep` key → reuses tests/review/review-driver-close-row.test.js :: AC-20260820-07-6 / AC-20260901-03-5
- **AC-20261013-01-9**: WHEN the three doctrine files are read THE SYSTEM SHALL have zero hits for `one worth fixing` and `wants fixed` in `spec/doctrine/stages/stage-review.md`, zero hits for `never fix-dispatched inside review` in `spec/agents/reviewer.md`, at least one hit for `soft-swept` in `spec/doctrine/stages/stage-review.md`, and `stage-review.md` SHALL be ≤ 93 lines → writes tests/review/soft-sweep.test.js
- **AC-20261013-01-10**: WHEN `--mark reviewer-returned --file` carries a soft-only return on green legs THE SYSTEM SHALL CONTINUE TO exit 0, auto-disposition, and reach CLOSE with no DISPOSITIONS step printed → reuses tests/review/soft-floor.test.js :: AC-20260909-04-7

## Assumptions (escalation triggers)

- A1: `git diff --numstat --no-renames <sha> HEAD -- . ':!<path>'…` prints `<added>\t<deleted>\t<path>` per text file and `-\t-\t<path>` for a binary, and the pathspec exclude form drops the excluded file — **spiked 2026-10-13** (scratch `numstat-spike.js`, git 2.54.0): a text edit printed `0 2 a.txt` / `3 0 c.txt`, the binary printed `- - b.bin`, `':!new.txt'` removed `new.txt` from the listing. **if false:** STOP, ask the user — the ceiling cannot be measured.
- A2: the close row's `diff.head` is the judged sha and `refs/spec-review/<runId>/judged` points at it (specs/20260913/01 D1, observed in the driver's `doCloseWork`). **if false:** read the ref instead of the row; both are written from the same value.
- A3: `dispositionPools(n).softs` is stable in printed order between the DISPOSITIONS print and CLOSE (it re-reads the same `reviewerReturnFile`). **if false:** persist the printed soft list into `marks` at CLOSE print time and index that.
- A4: the doctrine budget test holds `stage-review.md` at 93 lines (observed: 92 today). **if false:** the lower ceiling binds; replacements only.
- A5: `tests/review/review-driver.fixtures.js`'s `makeHost`/`toReviewer`/`commitClose` reach CLOSE and commit a close with a `SOFT_ONLY_RETURN`-shaped return exactly as soft-floor.test.js does today. **if false:** add the soft-return host to the fixtures module (one exported helper), never a second fixture family.

## Rationale

The queue in this repo holds 11 pending items, all free text; kaigai holds 51, 24 free text.
Two hand consolidations (2026-09-12, 2026-09-13) found items that were dead, not done. Reading
the items showed the source: the DISPOSITIONS step and the stage doctrine instruct the session to
`spec-queue add` any soft worth fixing, so every review with advisories leaks one or more prompt
items into a file nothing re-checks. q316 and q317 here are two such advisories from the
prototype spec's review. The fix is upstream of the queue: the review that found a soft either
fixes it or records it where the spec lives.

**Why at CLOSE and not as a disposition.** specs/20260909/04 took softs out of the disposition
pool because a fresh reviewer produced a new soft every fix-delta pass and the loop never
converged. Putting softs back as `fix` dispositions would reopen that loop. The sweep runs after
the authoritative verdict, inside the close commit, where the close-time gate re-run and the
whole-suite re-run already judge every file CLOSE writes. The reviewer never sees the sweep; the
ceiling is what keeps that acceptable.

**Why a ceiling in lines and not per finding.** A diff cannot be attributed to one soft. The
close tree against the judged sha, minus the files CLOSE already writes, is a single honest
number. Sixty lines is the plugin constant; it is not a grounding-contract field on purpose, so
no host owes a re-stamp. Tune it by evidence: if sweeps are refused more than twice in ten
closes, raise it in one direct commit.

**Why debt goes to the spec's Rationale.** The spec is the durable record of its own review; a
soft the review did not fix is a known limitation of that spec. The deviations sidecar is deleted
at close, and the queue is for decisions and spec-sized work only — after this spec, nothing in
the review stage writes to it.

**q319.** The 2026-10-08 measurement (2 soft, 0 hard over ten direct fixes) fired the fix-lane
trigger. The drafted `--fix "<sentence>"` entry point with a stub spec is not built; the sweep is
the lane in its smallest form. Direct fixes on main stay as they are. Tick q319 at close.

**In-flight hosts.** A host sitting at CLOSE with softs when the plugin updates gets one refusal
naming the sweep mark; the remedy is one sweep pass. No other state changes.

**Collision closure (lock).** Literals leg: `wants fixed` (driver), `one worth fixing` (stage-review), `never fix-dispatched inside review` (reviewer.md) — all in-plan rows; `not dispositioned` hits soft-floor.test.js, which pins the `advisory (N, recorded, not dispositioned):` heading D7 keeps byte-identical — waived. Paths leg: 13 `executes` hits run the driver on zero-soft or pre-CLOSE paths, which D9 pins unchanged; no test with a soft return reaches `--mark closed` today (grepped at lock), so D4's new refusal strands no fixture — waived.

**Build deviations (folded at close, 2026-10-13).** (1) The driver's startup deviations
observation no longer persists the review sidecar when the mark is `closed`; `handleClosed()`
saves it right after D4's unswept-soft refusal — forced by AC-4's byte-identical
`review-state.json` requirement when a deviations sidecar exists. (2) The build left `soft-swept`
out of the unknown-mark list because a test pins that list verbatim; review raised it as a soft
and this spec's own CLOSE sweep handled it (see the sweep outcome below).

**Review fix (iteration 1, 2026-10-13).** D5's "and the sidecar" was built as the never-committed
`.review/` state dir; the ceiling then counted the deviations sidecar's close-time deletion as fix
lines, and a large sidecar made `--mark closed` unreachable (ceiling refusal → restore → lingering
sidecar refusal). The exclusions now carry the deviations sidecar and `.claude/agent-memory/`,
exactly the files CLOSE writes, pinned by an AC-5 case.

## Canonical Delta

`docs/canonical/review.md`, in the findings paragraph that ends `(specs/20260909/04-review-soft-floor.md, done 2026-09-09)`, append after that citation:

> Softs do not leave the review by hand: at CLOSE the driver prints each soft as `a<i>`, the
> session dispatches fix workers, and `--mark soft-swept --file <sweep.json>` records one
> outcome per soft — `fixed`, or `debt` with a reason that the driver appends under the spec's
> `## Rationale` as `### Advisory debt (review <runId>)`. `--mark closed` refuses an unswept
> soft, and when any soft was fixed it measures the committed close tree against the judged sha
> (overlay paths excluded) and refuses more than `SOFT_SWEEP_MAX_LINES` (60) changed lines or any
> binary change with `soft sweep over ceiling`; an accepted close re-stamps the close row with
> `softSweep: {fixed, debt}`. The queue receives only follow-ups that need their own spec or the
> user's decision. (specs/20261013/01-review-closes-its-own-softs.md)
