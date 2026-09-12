---
date: 2026-09-12
status: done
tier: critical           # review-legs.js is a named critical trigger in .claude/rules/spec-pipeline.md § Risk Tiers — the sole leg deriver, "a bug here silently changes what every review observes"
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
build_base: main
spiked: 2026-09-12
open_markers: 0
diff_base: f0a9d25ad70dd113d1a5f9c6fac4ad2009df068e
---

# Soft findings get a reader, and replay gets a measurement

## Goal

Two independent honesty repairs, both against evidence the pipeline already writes and never
reads back. First: `/spec:escape` learns `softMatch`, derived from the correlated review's
retained artifact exactly as `killedMatch` already is, so a real defect the reviewer saw and
filed as advisory reads as a floor miss rather than as a finding review never saw — the guard
specs/20260909/04-review-soft-floor.md owed when it moved soft findings out of the disposition
pool. Second: the reviewer-catch-rate harness is repaired. Replay's overlay deliberately
withholds `specs/` to keep the reviewer blind, so any spec whose review round amended its own
Decisions table replays against the pre-fix spec and the `promise-sweep` leg is red before the
mutation is even authored; that leg reads nothing but the spec text, so it can never observe a
planted defect and is skipped in a replay tree. Done means: an escape row can carry
`softMatch`, the fleet reader counts the `true` ones, and a replay against a spec amended at
review reaches a measurement instead of burning three leg runs and recording `setup-failed`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `/spec:escape` step 4 gains `softMatch`, derived exactly as `killedMatch` is: from the correlated review artifact's `reviewer.survivors[]` filtered to `severity !== 'hard'` — compare `file` first (an entry whose `file` equals the defect file is the candidate, claim/evidence confirming) → `true`; a `file:null` entry compares by claim/evidence; softs present but nothing matching → `false`; ambiguous with the evidence in hand → `null`; no softs at all (`findings.soft` 0, or the artifact's non-hard survivor list empty) → `null` without asking. No artifact → `null` without asking: there is no memory fallback, because unlike a killed claim nobody recalls an advisory note. It rides the same single confirm call as every other field, derived value first and marked "(Recommended)" `[no-ac: command prose executed by the session; the behavioral halves are the writer's validation and the fleet census, each carried by its own criterion]` | The soft floor's own honesty guard, owed since specs/20260909/04-review-soft-floor.md's Rationale ("a follow-up teaches escape rows to match ignored softs, so a real defect filed as soft shows up as `softMatch` rather than vanishing"). Today such a defect lands `killedMatch: false` — indistinguishable from "review never saw it" — which flatters the floor exactly where it must not. Rejected: a memory-fallback arm mirroring `killedMatch`'s; it would manufacture guesses into the one ledger that makes a CLEAN verdict falsifiable |
| D2 | The same step's artifact paths are corrected: the retained artifact's keys are `reviewer.killed[]` and `reviewer.survivors[]`, never a top-level `killed[]`. escape.md's three current bare `killed[]` spellings (steps 3 and 4) become `reviewer.killed[]` `[no-ac: prose correction; no script executes this path — the session reads it]` | A literal reading of today's prose finds nothing: the artifact's top-level keys are `runId, ts, spec, tier, iteration, scope, verdict, dispositions, diff, legs, reviewer`. Fixed here because this spec rewrites the adjacent sentences (core § Doctrine Authoring: edit at touch-time, never a sweep) |
| D3 | `spec/scripts/lib/escape-row.js`'s `validateEscapeRow` validates `killedMatch` and `softMatch` by one shared tri-state predicate: **absent, `true`, `false` or `null` passes; any other value is a reason** — `killedMatch-out-of-enum` then `softMatch-out-of-enum`, appended after the three existing enum reasons in that order (AC-20260912-04-1) | The writer is the only place a malformed value can be stopped, and `killedMatch` has never been validated at all — the identical one-line predicate covers both, so shipping `softMatch` validated while its twin stays open would be the asymmetry a reviewer files. Absent stays valid because all 15 historical escape rows predate `softMatch` (A4) and `--check` reads them |
| D4 | `fleet-reader.js`'s escapes query gains one counter, `softMatchTrue` — escape rows whose `softMatch === true` — appended to the returned object after `killedMatchNull`; the query-3 human census line gains the clause `, {n} the review filed as advisory` after the existing kill-match clause, printed only when `softMatchTrue > 0` (AC-20260912-04-2) | Without a reader, `softMatch` repeats the exact mistake this spec exists to fix — `findings.soft` was written for three days and read by nothing. One number answers the question the floor opened: how often a defect that escaped had already been seen and downgraded. Appended, never reordered — `--json` consumers read by key. Rejected: a full `softMatch` distribution mirroring `preventedBy`; `false` and `null` carry no signal the total does not already give |
| D5 | `review-legs.js` gains `--replay` (boolean, parsed beside `--fix-delta`): it skips the `promise-sweep` leg and **nothing else** — every other leg runs, and every emitted row's keys, order and `scope` value are unchanged. The flag is additive to `--fix-delta`, never exclusive (AC-20260912-04-3, AC-20260912-04-4) | `promise-sweep.js` reads the spec text and nothing else (its own header: "no --root, no File Plan parsing, no test-file reads"), and replay's overlay deliberately withholds `specs/` to keep the reviewer blind — so in a replay tree the leg re-derives the pre-review-fix result deterministically, on every retry and on the pristine baseline too, and burns three full leg runs before recording `setup-failed`. A leg that cannot observe a code mutation loses no measurement power by being skipped there (A5). Rejected: materializing the close commit's spec into the scratch tree — that file carries the review's own `### Build and review record` fold and `status: done`, so it would tell the reviewer being measured that it has already been reviewed |
| D6 | `spec/commands/replay.md` Phase 1 step 6 passes `--replay` on its `review-legs.js` invocation, and step 7's rung 1 sentence names the reason a skipped leg can never appear as newly red `[no-ac: command prose; the skip itself is carried by the flag criterion]` | The flag is inert unattached, and step 7 needs the reason stated where the next session reads it, not only in the script header |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: plugin-bump.js --check is the oracle]` | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/escape.md | MODIFY | doctrine | D1: `softMatch` derivation in step 4 and the field in step 5's row JSON; D2: `killed[]` → `reviewer.killed[]` at all three spellings |
| spec/scripts/lib/escape-row.js | MODIFY | scripts | D3: shared tri-state predicate validating `killedMatch` and `softMatch`; header comment updated |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D4: `softMatchTrue` counter in `computeEscapes`, appended after `killedMatchNull`; query-3 census clause |
| spec/scripts/review-legs.js | MODIFY | scripts | D5: `--replay` flag skips the promise-sweep leg only; usage line, header comment and exit-code list updated |
| spec/commands/replay.md | MODIFY | doctrine | D6: step 6 passes `--replay`; step 7 rung 1 states why a skipped leg can never read as newly red |
| tests/escape/escape-row.test.js | MODIFY | tests | AC-20260912-04-1 |
| tests/fleet-reader/queries.test.js | MODIFY | tests | AC-20260912-04-2 |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260912-04-3, AC-20260912-04-4 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 bump |

Orchestrator duty outside the table: after the build, `grep -n '[^.]killed\[\]' spec/commands/escape.md` must return nothing — D2's correction is complete only when no bare spelling survives.

## Contracts

```text
escape ledger row (stage:"escape") — one key added, appended after killedMatch:
{"ts":…,"stage":"escape","spec":…,"file":…,"reviewRunId":"rv_…"|null,
 "foundBy":"user|later-spec|production","severity":"hard|soft",
 "killedMatch":true|false|null,"softMatch":true|false|null,
 "class":…,"unclassedReason":…,"preventedBy":…,"via":"commit|manual"}

lib/escape-row.js — validateEscapeRow reason list, in emission order:
  [ …classReasons… , 'preventedBy-out-of-enum', 'foundBy-out-of-enum',
    'severity-out-of-enum', 'killedMatch-out-of-enum', 'softMatch-out-of-enum' ]
  tri-state predicate: v === undefined || v === true || v === false || v === null

fleet-reader --json, escapes object — one key added after killedMatchNull:
  { total, killedMatchNull, softMatchTrue, preventedBy, byClass,
    recurrentUnguarded, byRepo, amendments, incidents, unclassedRows }

fleet-reader human render, query 3 — one clause added, printed only when > 0:
  3. Escapes — 15 total, 4 with no kill match, 1 the review filed as advisory

retained review artifact (.claude/spec-runs/<runId>.jsonl, legacy .json) — read shape
only, unchanged by this spec:
  { runId, ts, spec, tier, iteration, scope, verdict, dispositions, diff, legs,
    reviewer: { verdict, survivors: [{severity, claim|title, file, line, …}],
                killed: [{claim, file, line, evidence}], reviewerCount, tokens } }

review-legs.js usage — one flag added:
  review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path>
    [--skips <file>] [--fix-delta] [--replay] [--out-dir <dir>]
  --replay: skip the promise-sweep leg (its only input is the spec text, which
            replay's overlay withholds); every other leg is unaffected.
```

## Behavior

`/spec:escape` step 3 already resolves the correlated review's retained artifact, trying
`<runId>.jsonl` then the legacy `<runId>.json` stem. D1 adds no new read: the same parsed
object that supplies `reviewer.killed[]` supplies `reviewer.survivors[]`, and the soft set is
that array filtered to `severity !== 'hard'`. A survivor's claim text is `claim` when present,
else `title` (A2), and its `file` may be an absolute build-worktree path rather than a
repo-relative one (A3) — the comparison is by path tail when the recorded value is absolute, so
a soft filed inside a spec's own build worktree still matches the defect file.

In `review-legs.js`, `--replay` guards exactly the wave-3b `await` that runs `promise-sweep.js`
and writes `promise-sweep.txt`. No manifest row is emitted for a skipped leg, which is what
makes the skip observable: `replay.md` step 7 iterates red rows, and an absent row is not a red
row. `verdict.js` is not involved — a replay run never derives a review verdict, so the review
profile's required-leg set is untouched and a real review, which never passes `--replay`, still
cannot reach `CLEAN` without a promise-sweep row.

## Acceptance Criteria

- **AC-20260912-04-1**: WHEN `escape-row.js --append` is handed a row whose `softMatch` or
  `killedMatch` is outside the tri-state THE SYSTEM SHALL refuse with exit 1 naming that
  reason, and SHALL accept the row when the key is absent or is `true`/`false`/`null`
  (e.g. `{"softMatch":"yes",…}` → stdout contains `softMatch-out-of-enum`, exit 1;
  `{"killedMatch":0,…}` → stdout contains `killedMatch-out-of-enum`, exit 1; the same row
  carrying `"softMatch":null` and no `killedMatch` key at all → exit 0)
  → writes tests/escape/escape-row.test.js
- **AC-20260912-04-2**: WHEN `fleet-reader --json` reads a ledger holding three escape rows
  whose `softMatch` values are `true`, `false` and absent THE SYSTEM SHALL report
  `escapes.softMatchTrue` as `1` with `escapes.total` `3`, every other escapes key unchanged,
  and the human render's query-3 line SHALL carry `, 1 the review filed as advisory`
  (e.g. `3. Escapes — 3 total, 0 with no kill match, 1 the review filed as advisory`)
  → writes tests/fleet-reader/queries.test.js
- **AC-20260912-04-3**: WHEN `review-legs.js` runs with `--replay` against a synthetic host
  THE SYSTEM SHALL write no `promise-sweep` row to the manifest and SHALL write every other
  leg's row with its keys, order and `scope` value unchanged (e.g. the manifest's leg names are
  `gate, suite, smoke, reconcile, ac-matrix, skip-reconcile, ci, at-risk, tests`, each row
  review-legs writes through its own writer still ending `"scope":"full"`, and
  `promise-sweep.txt` absent from the out-dir)
  → writes tests/review/review-legs.test.js
- **AC-20260912-04-4**: WHEN `review-legs.js` runs without `--replay` THE SYSTEM SHALL
  CONTINUE TO emit a `promise-sweep` row in full scope and SHALL CONTINUE TO emit one under
  `--fix-delta`, carrying no `scope` key in either mode
  → reuses tests/review/review-legs.test.js :: AC-20260902-05-1: a --fix-delta

## Assumptions (escalation triggers)

- A1 (executed measurement, 2026-09-12): the ledger holds 23 `stage:"review"` rows carrying
  `findings.soft`, declaring 33 softs in total; all 23 retained artifacts resolve (`.jsonl` for
  recent runs, legacy `.json` for older ones) and yield exactly 33 non-hard survivors across 16
  specs — so D1's derivation has a real population to match against rather than an empty set —
  **if false** (a re-count disagrees): only the Goal's framing changes; the derivation is
  unaffected.
- A2 (executed, 2026-09-12): soft survivor records carry five different key shapes — `claim` in
  28 of 33 and `title` in the other 5, with `evidence`, `impact` and `id` each optional — so
  `claim ?? title` covers all 33 — **if false** (a record with neither): that survivor is
  matched by `file` alone, and an ambiguous result is `null`, never a guess.
- A3 (executed, 2026-09-12): 3 of 33 softs record an absolute build-worktree path in `file`
  (e.g. `/Users/…/.claude/worktrees/spec-05-fix-delta-reviewer-pass/tests/review/review-driver-fix-cycle.test.js`),
  30 are repo-relative, none is `null` — so a literal `file ===` comparison would miss those
  three — **if false** (a `null` appears): the `file:null` arm already compares by
  claim/evidence.
- A4 (executed, 2026-09-12): all 15 existing escape rows already carry a tri-state
  `killedMatch`, and none carries `softMatch` — so D3's predicate reddens no historical row and
  the absent-is-valid arm is load-bearing — **if false:** the offending row is repaired by an
  `escape-class` amendment before the validator lands.
- A5 (executed, 2026-09-12): `promise-sweep.js` is a pure function of the spec text. Against
  `specs/20260908/04-duplicate-window-ratchet.md`, the close commit `a62486c1` gives
  `rows=9 carried=6 sanctioned=3 orphans=0` exit 0 while its parent `5efb4a7d` gives
  `orphans=1` exit 1; review row `rv_56255fee8f85` recorded the close numbers, and the replay
  tree — which stands at the parent and withholds `specs/` — can only ever produce the
  parent's. Run `rp_6ff3a4e6718e` recorded `pristine-red:promise-sweep`, `setup-failed` —
  **if false:** the skip is still correct on mechanism; only the Goal's example changes.
- A6 (checked, 2026-09-12): no `--replay` literal exists anywhere under `spec/`, `tests/` or
  `scripts/`, and no test pins `review-legs.js`'s usage banner as a literal string —
  **if false:** rename the flag to `--overlay-blind` and amend D5/D6.

## Rationale

Both halves fix the same failure mode from opposite ends: the pipeline writing evidence that
nothing reads. `findings.soft` and the softs held verbatim in the retained artifact have
exactly one consumer in the whole repo — the test that pins the write. And the replay harness
records `setup-failed` rows that reset nothing and measure nothing, because a check it runs
reads a file the harness deliberately withholds from itself.

The escape half is deliberately small: a sibling clause in prose the command already executes
against an artifact it already opens, plus the one-line validation that stops a malformed value
entering the ledger and the one counter that makes the signal visible. `killedMatch` is
validated alongside it because it never has been — the same predicate, and leaving the twin
open while hardening its sibling is the asymmetry a reviewer would file anyway.

Scope deliberately not taken. An earlier draft also surfaced every recorded soft as an
`open-soft` hygiene anomaly on `/spec:status --all`. It was cut at lock as over-engineering:
29 truncated one-line fragments from reviews weeks old, about files that have since changed,
whose realistic triage outcome is "leave it" — and it would have made the status footer's
hygiene count useless as a tidiness signal while putting the frozen-API status script in scope.
The soft floor owed one follow-up, and it was `softMatch`, not a viewer. If the notes turn out
to be worth reading, that is its own spec with its own evidence.

Build deviation, folded at close (2026-09-12). AC-20260912-04-1's example named **stderr** as
the stream a `--append` refusal's reason lands on. The shipped `escape-row.js` prints every
`validateEscapeRow` reason via `printReasons()` → `console.log` — stdout — for both `--check`
and `--append`, and D3 changes only the reason set inside `lib/escape-row.js`, naming no change
to the CLI's I/O plumbing. The test pinned the shipped behavior, review filed the contradiction
as hard, and the example was corrected to `stdout` in the fix round: the defect was in the
example, never a licence to re-plumb the writer. One-off, not a class — no Gotchas entry.

Fragile, and what to watch. `softMatch` fires rarely by construction — it needs an escape
against a spec whose review recorded a matching soft — so a long run of `null`/`false` is the
expected shape, not a broken derivation; the counter only becomes informative across months.
And the `--replay` skip is correct precisely because `promise-sweep` reads nothing but the spec
text: if a future change gives that leg a second input, the skip silently starts costing
measurement power, so D5's rationale names the property rather than the leg.

Collision sweep at lock (`collision-closure --literal 'killed[]' --literal killedMatchNull`,
tracked paths only — the three `.claude/worktrees/agent-*` copies are stale duplicates).
Literals leg: `spec/commands/escape.md` and `spec/scripts/fleet-reader.js` are already File
Plan rows. `tests/review/reviewer-return-killed.test.js` and
`tests/review/escalate-row.fixtures.js` spell `killed[]` as the **reviewer return's** own
array, which D2 does not touch — recorded waive. `docs/roadmap/19-escape-seeded-replay.md` is a
landed brief, historical record — recorded waive. Executes leg, read for fixture repair: the
four `tests/fleet-reader/*` files assert individual `escapes.*` keys with `strictEqual` and
reserve `deepStrictEqual` for the `byClass`, `corpusGaps` and `registry` sub-objects, so D4's
appended key reddens none of them; the eight files executing `review-legs.js` all build
synthetic hosts and none passes `--replay`; `tests/consistency/entrypoints.test.js` exercises
script-to-script edges, which neither Decision adds or removes.

## Canonical Delta

`docs/canonical/review.md` — in the escape-row paragraph, after the sentence naming
`killedMatch`: a row also carries `softMatch`, derived the same way from the correlated
artifact's non-hard survivors, so a defect the reviewer filed as advisory and that later
escaped is distinguishable from one review never saw; the fleet reader counts them as
`escapes.softMatchTrue`. In the replay paragraph, after the sentence on the overlay's meta
prefixes: because the overlay withholds `specs/`, a leg whose only input is the spec text
re-derives the pre-review-fix result in a replay tree; `review-legs.js --replay` skips
`promise-sweep` for that reason, and no other leg is affected.
