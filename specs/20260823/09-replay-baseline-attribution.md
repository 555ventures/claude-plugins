---
date: 2026-08-23
status: done
diff_base: 6cf9ce162902be2faffc0e3aa1f035e9cb3e2fc5
open_markers: 0
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Replay Baseline Attribution — red legs the mutation didn't cause

## Goal

The mutation-replay harness treats any red review leg as evidence about the planted defect,
but ~1 in 4 selectable CLEAN reviews closes with a leg legitimately red for pre-existing,
sanctioned reasons (measured 2026-08-23: 17 of 63 CLEAN rows; reconcile 14, ac-matrix 4).
On those targets the harness burns a guaranteed-futile authoring retry, then forces the
session to falsify a record field either way — `leg-caught` censors the reviewer measurement
and falsely resets the 5-review due window; `--legs green` lies about the leg state (the
live 2026-08-23 incident, row `rp_1b176ebff5c7`). Done means: the harness attributes each
red leg to its cause using the baseline the original review already recorded, only
*newly*-red legs trigger the retry/leg-caught path, and the permanent record can state the
truth with a new honest `baseline-red` value.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `replay.js --select` derives the baseline from the selected review row's own `legs` array — red = `exit !== 0`, except `smoke` with exit 4 (review-legs' red definition) — and appends two tokens to its selection line, **after** the existing five: `baselineRed=<comma-list>\|none` and `baselineLegs=<comma-list>`; a row with no (or empty) `legs` array emits `unknown` for both (AC-20260823-09-1, AC-20260823-09-2, AC-20260823-09-3) | Zero extra I/O — the row is already in hand at selection; a second leg run on the unmutated worktree would re-derive retained evidence at ~400 gate tests per replay, rejected |
| D2 | `--record` gains one `--legs` value: `baseline-red:<leg>[,<leg>]`, valid for `caught`/`missed`/`unresolved` alongside `green`; `red:<leg>` stays reserved for a *newly*-red leg; `none` stays `setup-failed`-only (AC-20260823-09-4, AC-20260823-09-5) | User-picked 2026-08-23 over redefining `green` as "nothing newly red" — every ledger row stays literally true; a future audit reads the truth off the row without cross-referencing the review |
| D3 | `unresolved` becomes two-armed, keyed on the `--legs` shape: `green`/`baseline-red:*` requires `--patch` + `--workflow` (Phase 3 dismissal — the reviewer ran); `red:<leg>` requires `--patch` and **refuses** `--workflow` (step-7 dismissal — the reviewer never ran) (AC-20260823-09-6) | Without the second arm a step-7 dismissal has no recordable outcome and the session is again forced to falsify; refusing `--workflow` there keeps the D7 principle that a field implying "reviewer ran" can't ride a run where it didn't |
| D4 | replay.md Phase 1 step 7 re-keys the retry/leg-caught path to **newly-red** legs only: a red leg is *explained* — and the run proceeds to Phase 2 with it noted — when it is listed in `baselineRed`, or it is `reconcile` (deterministic exemption: the mutation is File-Plan-confined by step 4's worker contract, and reconcile redness is definitionally about out-of-File-Plan paths, so it can never be mutation-caused; a canonical patch naming an out-of-plan file is a failed authoring attempt under step 4's existing rule and the exemption never applies) (AC-20260823-09-9) | The reconcile exemption alone deterministically covers 14 of the 17 measured baseline-red rows, including targets whose fix-delta baseline never recorded a reconcile leg |
| D5 | A red leg that is neither newly-red-attributable nor explained (not in `baselineRed`, not `reconcile`, and its leg absent from `baselineLegs` or baseline `unknown`) routes to one `AskUserQuestion` in step 7 — the same judgment-seam pattern as Phase 3's ambiguous score: "pre-existing" → proceed to Phase 2; "mutation-caused" → the existing retry-then-leg-caught path; dismissed → outcome `unresolved` recorded via D3's `red:<leg>` arm, teardown still runs (AC-20260823-09-9) [no-ac: the question flow itself is doctrine prose exercised by the AC-9 prose pin; the recordable dismissal arm is AC-20260823-09-6] | Fix-delta closes retain no reconcile/at-risk/patterns/promise-sweep legs (measured: 17 of 24 recent fix-delta rows) and 3 legacy rows retain none, so an unattributable red leg is reachable; a forced auto-pick either censors the measurement or fabricates leg-caught — exactly the defect being fixed |
| D6 | `spec-review-driver.js` `parseSelection` captures the two new tokens when present (absent → `null`, never a parse failure) and `replayStepBody` inlines them into the printed REPLAY step (AC-20260823-09-7, AC-20260823-09-8) | The driver is the scheduled entry point; a session that never sees the baseline can't apply D4 — but an old sidecar resumed mid-flight must not die on a missing token |
| D7 | Historical rows are never rewritten: the 4 existing `stage:"replay"` rows (including `rp_1b176ebff5c7`'s `legs:"green"` misrecord) stand as-is; `--stats` is untouched — it never reads `legs`, and catch-rate math is unchanged (AC-20260823-09-10) | The ledger is append-only evidence; the misrecord is documented here, in Rationale, as the motivating incident |
| D8 | `spec/.claude-plugin/plugin.json` bumps to 7.29.0 (target, not pin — next free version at build time per Gotchas) with the description changelog updated [no-ac: version-bump discipline is review's own hard check, not a test surface] | Behavior change in a shipped script + command doctrine |

**Amended 2026-08-31** (specs/20260831/01-replay-range-materialization.md D8): D4's step-7
ladder gains one more rung between rung 3's failed retry and its `leg-caught` record. A leg
still red after the retry is no longer sufficient on its own — `--overlay`'s baseline
(specs/20260831/01 D1) is *reproducible*, not *identical*, so a still-red leg can also mean
environment drift rather than the mutation. Rung 3 now runs a pristine-baseline verification
first: `git -C {dir} reset --hard HEAD^` (drops exactly the mutation commit), a fresh manifest,
and a fresh legs run. Green on the pristine tree → `leg-caught` records exactly as this spec
defines. Still red on the pristine tree → not mutation-caused: falls through to rung 4's
`AskUserQuestion` seam (this spec's D5) instead of recording `leg-caught`, with both manifests
presented as evidence. D4's newly-red keying and reconcile exemption, and D5's unattributable-
leg question seam, are otherwise unchanged.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | MODIFY | scripts | D1 `--select` baseline tokens; D2/D3 `--record` grammar (`baseline-red:` value, two-armed `unresolved`); header usage line + D7-matrix comment updated |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D6 `parseSelection` optional capture of `baselineRed`/`baselineLegs`; `replayStepBody` prints them; the `replay-recorded` mark's remedy message widens its printed `--legs` enum to include `baseline-red:<legs>` (collision-closure hit, 2026-08-23) |
| spec/commands/replay.md | MODIFY | doctrine | D4/D5 step 7 re-key to newly-red legs, reconcile exemption, unattributable-leg question seam; Phase 4 record matrix restated with D2/D3 grammar |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 version 7.29.0 + description changelog |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260823-09-1, AC-20260823-09-2, AC-20260823-09-3, AC-20260823-09-4, AC-20260823-09-5, AC-20260823-09-6, AC-20260823-09-9, AC-20260823-09-10, AC-20260823-09-11 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260823-09-7, AC-20260823-09-8 |

## Contracts

`--select` stdout, one line (five existing tokens first — order is load-bearing for the
driver's regex — new tokens appended):

```
spec=<path> reviewRunId=<rv_id> commit=<sha> parent=<sha> diffBase=<sha> baselineRed=<v> baselineLegs=<v>
```

- `baselineRed`: comma-joined leg names red in the selected review row (`exit !== 0`,
  `smoke`-exit-4 exempt), `none` when the row's `legs` array has no red leg, `unknown` when
  the array is absent or empty.
- `baselineLegs`: comma-joined names of every leg present in the row's `legs` array;
  `unknown` exactly when `baselineRed` is `unknown`. Leg-name order follows the row's array
  order verbatim.

`--record` validation matrix (D7 successor — full restatement):

| `--outcome` | `--legs` accepted | `--patch` | `--workflow` |
|---|---|---|---|
| caught / missed | `green` \| `baseline-red:<leg>[,<leg>]` | required | required |
| unresolved | `green` \| `baseline-red:<leg>[,<leg>]` | required | required |
| unresolved | `red:<leg>` | required | **refused** |
| leg-caught | `red:<leg>` (newly-red only — doctrine-enforced) | required | not required (unchanged) |
| setup-failed | `none` | refused | refused |

The global `--legs` shape check widens to: `green` | `none` | `red:<leg>` |
`baseline-red:<leg>[,<leg>]`. Ledger row shape is unchanged — `legs` stays a single string,
no new keys (the row key set is pinned by AC-20260819-03-5's deep-equal).

## Behavior

Step 7 attribution, per red leg `L` in the replay legs manifest:

1. `L == reconcile` → explained (D4 exemption). 2. `L ∈ baselineRed` → explained.
3. Otherwise, if `L ∈ baselineLegs` → newly red: the existing retry-once-then-`leg-caught`
   path, unchanged in mechanics, now records `--legs red:<L>` with the *newly*-red meaning.
4. Otherwise (`L ∉ baselineLegs`, or baseline `unknown`) → D5's question seam.

A run whose red legs are all explained proceeds to Phase 2 exactly as an all-green run does;
its Phase 4 record carries `--legs baseline-red:<explained list>`. A run with zero red legs
is byte-identical to today (`--legs green`).

## Acceptance Criteria

- **AC-20260823-09-1**: WHEN `--select` picks a CLEAN review row whose `legs` array carries
  `{"leg":"reconcile","exit":3}` among green legs THE SYSTEM SHALL append
  ` baselineRed=reconcile baselineLegs=<all leg names in array order>` to the selection line
  (e.g. legs `[ci:0, gate:0, reconcile:3]` → `baselineRed=reconcile baselineLegs=ci,gate,reconcile`)
  → tests/replay/replay.test.js
- **AC-20260823-09-2**: WHEN the selected row's `legs` array exists with no red leg — a
  `smoke` leg with exit 4 present — THE SYSTEM SHALL emit `baselineRed=none` with `smoke`
  still listed in `baselineLegs` (exit-4 smoke is not red; presence is not redness) →
  tests/replay/replay.test.js
- **AC-20260823-09-3**: WHEN the selected row has no `legs` array THE SYSTEM SHALL emit
  `baselineRed=unknown baselineLegs=unknown` → tests/replay/replay.test.js
- **AC-20260823-09-4**: WHEN `--record --outcome caught --legs baseline-red:reconcile` rides
  with `--patch` + `--workflow` THE SYSTEM SHALL append a row whose `legs` field is the
  literal string `baseline-red:reconcile` and write the evidence artifact as for `green` →
  tests/replay/replay.test.js
- **AC-20260823-09-5**: WHEN `--record --outcome caught --legs red:gate` is invoked THE
  SYSTEM SHALL refuse with exit 2 naming the accepted values (`red:` stays evidence of a
  newly-red leg, incompatible with a caught outcome) → tests/replay/replay.test.js
- **AC-20260823-09-6**: WHEN `--record --outcome unresolved --legs red:reconcile --patch <p>`
  is invoked without `--workflow` THE SYSTEM SHALL append the row; WHEN the same invocation
  adds `--workflow` THE SYSTEM SHALL refuse with exit 2 (the reviewer never ran on a step-7
  dismissal) → tests/replay/replay.test.js
- **AC-20260823-09-7**: WHEN the driver parses a selection line carrying the two new tokens
  THE SYSTEM SHALL print `baselineRed:` and `baselineLegs:` lines in the REPLAY step body →
  tests/review/review-driver.test.js
- **AC-20260823-09-8**: WHEN the driver parses a five-token selection line with no baseline
  tokens THE SYSTEM SHALL CONTINUE TO enter the REPLAY state and print the step (fields
  absent, never a parse `die`) `[pre-green: absence-invariant]` → tests/parse-selection/parse-selection.test.js
- **AC-20260823-09-9**: WHEN replay.md Phase 1 step 7 is read THE SYSTEM SHALL state, in
  step 7's own text: the newly-red keying, the reconcile exemption with its File-Plan ground,
  and the unattributable-leg `AskUserQuestion` with dismissed → `unresolved` via the
  `red:<leg>` record arm (prose pin, AC-20260820-02-6 pattern — section-scoped grep, never
  whole-file) → tests/replay/replay.test.js
- **AC-20260823-09-10**: WHEN `--stats` runs over a ledger containing a
  `legs:"baseline-red:reconcile"` caught row THE SYSTEM SHALL CONTINUE TO count it in the
  `caught` bucket and the catch-rate numerator and denominator exactly as a `legs:"green"`
  caught row `[pre-green: absence-invariant]` → tests/replay/replay.test.js
- **AC-20260823-09-11**: WHEN `--record` is invoked with the pre-existing matrix values —
  `green` for caught/missed, `red:<leg>` for leg-caught, `none` for setup-failed, and a
  malformed `--legs` value — THE SYSTEM SHALL CONTINUE TO validate each exactly as before
  `[pre-green: predicate-in-test]` (existing tests AC-20260819-03-4/-5/-6 retagged, never
  duplicated) → tests/replay/replay.test.js

## Assumptions (escalation triggers)

- A1: CLEAN review rows retain per-leg exits in a `legs` array sufficient to derive the
  baseline. **Verified 2026-08-23** — `jq` over `.claude/spec-runs.jsonl`: 63 CLEAN rows;
  17 carry ≥1 red non-blocking leg (reconcile 14, ac-matrix 4, one row both); recent
  fix-delta rows retain only ci/gate/smoke/ac-matrix/skip-reconcile(/promise-sweep); 3
  legacy rows retain no legs array — **if false** (a future row shape drops `legs`): D1's
  `unknown` arm already absorbs it; the seam asks.
- A2: The driver's `parseSelection` regex tolerates appended tokens. **Executed spike
  2026-08-23**: `node -e` against the extended line → `parses: true`, `diffBase` captured
  clean — **if false:** anchor the new tokens' capture group order instead; STOP if the five
  originals ever move.
- A3: The mutation is File-Plan-confined (Phase 1 step 4's worker contract; replay.js does
  not itself enforce plan membership), grounding D4's reconcile exemption — **if false**
  (a canonical patch names an out-of-plan file): step 4's existing failed-authoring rule
  applies and the exemption is void for that attempt; the doctrine text states this
  explicitly per D4.
- A4: No consumer reads a replay row's `legs` string beyond replay.js itself (`--stats`
  ignores it; verified by grep). **if false:** the consumer gains the one new literal value,
  escalate before widening further.

## Rationale

The motivating incident (2026-08-23, `rp_1b176ebff5c7`): the scheduled replay targeted a
spec whose CLEAN close carried a sanctioned red reconcile leg (exit 3, an out-of-plan test
file its own Decisions sanctioned). The mutation was File-Plan-confined, so the reconcile
red was structurally pre-existing — yet the D7 matrix offered only `leg-caught` (false: the
reviewer ran and caught the defect) or `--legs green` (false: a leg was red). The session
recorded `green` — the least-damaging falsification, in a pipeline whose identity is
evidence-truth. Base rate re-measured this session: 17/63 selectable rows (~27%), so this
is the normal case, not a tail. An earlier same-day measurement over a broader row set
(including non-selectable rows) read 26/79 with at-risk/skip-reconcile/suite reds; the
narrower selectable-population figure is the honest denominator and is the one recorded here.

Rejected: a baseline leg re-run on the unmutated worktree (re-derives evidence the review
row retains, ~400 gate tests per replay forever); a per-class leg-reach map (drifting prose;
only its reconcile kernel is deterministic — that kernel is D4); redefining `green` as
"nothing newly red" (user-rejected 2026-08-23: the ledger's word would stop matching
reality). `leg-caught` keeps `red:<leg>` rather than gaining a baseline variant: a run whose
only red legs are explained dispatches the reviewer, so explained-red and leg-caught can
never legally meet on one row. Catch-rate math never changes — `leg-caught` was already
excluded from the denominator; the damage being fixed is censoring (the reviewer never
measured), the false due-window reset (`leg-caught` is a measurement outcome), and poisoned
corpus feedback (doctrine reads `leg-caught` as "class not leg-invisible").

Collision-closure (2026-08-23, literals `legs green` / `red:leg` / `leg-caught`): the one
real hit — `spec-review-driver.js`'s `replay-recorded` remedy message printing the old
`--legs` enum — entered the File Plan row. Waived: `verdict.js` and its tests ("all legs
green" is verdict's own review-leg phrase, a coincidental stem on a different surface);
`spec/doctrine/replay-corpus.md` (`leg-caught`-as-corpus-feedback semantics are unchanged —
only the attribution of pre-existing reds changes); `docs/canonical/review.md` (updated by
this spec's own Canonical Delta at review close, never edited at build);
`tests/run-ledger.test.js` (its pins assert review.md/core.md *point at* replay.md, not
step-7 prose — closed pins, unaffected).

Build deviations (folded at review close 2026-08-24; both are single occurrences of classes
the host rules § Gotchas already records, so neither earns a new entry):

- D8's literal version target `7.29.0` was already at HEAD; the build bumped to `7.30.0`
  per the version-race gotcha (a Decision's literal semver is a target, not a pin).
- `diff_base` was corrected at build close from `71dad74` to `6cf9ce1`. A concurrent session
  committed `6cf9ce1` (`fix(merge-back): cleanup deletes a squash-merged branch instead of
  dying on it`) between this build's Phase 0 base capture and its own commit, making the
  recorded sha a stale pre-image that would have diffed an unrelated sibling commit into this
  spec's review panel. Corrected to the true pre-image per the specs/20260816/03 precedent;
  review inherited the corrected value with no special handling.

Review disposition (2026-08-24, run `rv_ce866ce15dc3`): one hard finding, fixed. The test
cited by AC-20260823-09-8 as proof of the five-token (baseline-tokens-absent) parse path
could never exercise it — its fixture drives the real `replay.js`, whose `--select` appends
both tokens unconditionally (`unknown` is a value, never an omission), so the fixture can
only ever emit a seven-token line and the test's assertions passed vacuously. `parseSelection`
was extracted byte-identically to `spec/scripts/lib/parse-selection.js` (the established
`file-plan.js`/`frontmatter.js`/`observation.js` precedent) and proved directly by
`tests/parse-selection/parse-selection.test.js` against all three shapes; the old exec test
was retargeted to what it actually proves and stripped of the AC-ID it could not honour.
Falsification confirmed at review: making the two capture groups non-optional turns the new
AC-8 test red. No code behavior changed.

## Canonical Delta

docs/canonical/review.md, replay-harness section: append — "Replay attributes red legs
against the originating review's own recorded baseline (`--select` emits `baselineRed`/
`baselineLegs` from the selected row; zero extra leg runs). Only newly-red legs trigger the
authoring retry and `leg-caught`; reconcile is deterministically exempt (mutations are
File-Plan-confined; reconcile redness is definitionally out-of-plan). The record grammar
carries the truth: `baseline-red:<leg>[,<leg>]` on caught/missed/unresolved rows whose
target closed with sanctioned red legs; an unattributable red leg is a user question, and
its dismissal records `unresolved` via the workflow-refusing `red:<leg>` arm.
(specs/20260823/09-replay-baseline-attribution.md)"
