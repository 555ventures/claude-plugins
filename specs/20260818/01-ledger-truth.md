---
date: 2026-08-18
status: implementing
diff_base: 6839e10c90edf35ad8293ece19f26631f7e88ff4
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# Ledger truth: verdict.js fails closed on leg findings, ledger rows stay legible

## Goal

Close the four review-accounting defects found by the 2026-08-18 Fable retainer consult on
v7's first full pipeline run. After this spec: `verdict.js` can never derive `CLEAN` while a
findings leg's red row sits undispositioned; ledger leg rows keep their `observed` string so
"CI passed" and "no CI exists" are distinguishable forever; every review ledger row carries a
`runId` so `/spec:escape` can correlate an escape back to the review that missed it; and the
build row's two counts (`deviations`, `diff.loc`) mean what their names say. Done = all four
demonstrated by executed tests and the colliding prior pins updated in place.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `derive()` counts undispositioned **leg findings**: every red non-blocking row present in the manifest contributes findings to the undispositioned pool; while any remain, the word is `HARD_FINDINGS` (leg findings are deterministic contract violations — always hard), never `CLEAN` (AC-20260818-01-1, AC-20260818-01-2) | Spike-demonstrated fail-open: red promise-sweep (2 orphans) + zero-survivor workflow + zero dispositions derived CLEAN exit 0; rejected alternative — "red findings leg blocks CLEAN unconditionally" — breaks the ratified waive path (20260815/03's waived reconcile finding) |
| D2 | Leg-finding **count grammar**, parsed from the pinned `observed` formats and floored at 1 on any red row: `reconcile`→`outOfPlan=N`, `ac-matrix`→`uncovered=N`, `skip-reconcile`→`skipped=N`−`sanctioned=M`, `promise-sweep`→`orphans=O`; any other red non-blocking row (at-risk, drift, patterns) or an unparseable observed counts 1 (AC-20260818-01-3) | Per-finding counts make dispositions honest (2 orphans need 2 waives, not 1); floor-1 fails closed when the format drifts — a red row can never contribute 0 |
| D3 | The disposition-contradiction guard widens: `--waived + --rejected + --fixDispatched` may not exceed **survivors + legFindings** (was: survivors only) (AC-20260818-01-4) | Spike-demonstrated: waiving a leg finding with zero survivors exits 2 today — leg findings are structurally undispositionable, which is why the fail-open never surfaced |
| D4 | Ledger `legs` rows retain `observed` (truncated to 120 chars) in **both** profiles; the review row's `findings` object gains `legFindings: N` (AC-20260818-01-5, AC-20260818-01-6) | The row `{"leg":"ci","exit":0}` is indistinguishable from a real pass; the script's own header already claims the observation "is recorded in the leg row and the ledger" — this makes the claim true instead of deleting it |
| D5 | Review ledger rows always carry `runId`: when `--run-id` is absent, verdict.js generates `rv_` + 12 lowercase hex chars (`crypto.randomBytes`); a passed `--run-id` wins verbatim; release rows unchanged (no runId today, none after) (AC-20260818-01-7, AC-20260818-01-8) | All 5 v7 review rows have `runId: null` because the flag rides choreography review.md never performs — generation in the script is the fail-closed placement; `/spec:escape` step 3 needs the backlink |
| D6 | `build.md` ledger prose: `deviations` = sidecar **entry** count (lines matching `^- `, 0 if absent); `diff.loc` = **insertions + deletions** from shortstat (matching review.md's existing definition) [no-ac: doctrine-text definition; regex-over-prose pins are unsanctioned here (Test Rules) — the reviewer verifies the hunk against this row] | Measured: spec 07's sidecar held 2 entries, the row recorded 39 (line count, ~20× overstated); build recorded loc=882 (insertions only) vs review's 967 (ins+del) for the same spec — the columns aren't comparable |
| D8 | Build-time addendum to D7 (found by the red gate, 2026-08-18): `AC-20260805-02-8`'s exhaustive six-key `findings` assert is a sixth colliding pin — its surviving half (counts nested under `findings`, never flat at top level) continues; its key-set half gains `legFindings: 0` per the Contracts row shape, updated in place and retagged to AC-20260818-01-2. Never weakened, never left red | D4 adds a seventh key to `row.findings`; an exhaustive `deepStrictEqual` on the old six is the colliding-pin Gotcha's exact shape, and D7's own contract ("each pin's surviving half continues, the changed half flips") decides it without a fork |
| D7 | Colliding prior pins are updated **in place and retagged**, never weakened-and-left: AC-20260815-02-7 (red at-risk, zero dispositions → was CLEAN), AC-20260817-07-12 (red promise-sweep, 1 waive covering only the survivor → was CLEAN), AC-20260805-02-3 (red ac-matrix, 1 waive covering only the survivor → was CLEAN), AC-20260805-02-5 (runId key omitted when flag absent), and the `{leg, exit}`-only legs-shape assert (AC-20260818-01-9, AC-20260818-01-10) | The colliding-pin Gotcha's contract: each pin's surviving half (never-GATE_RED, passed-flag-wins, manifest-order mirror) continues under a `SHALL CONTINUE TO` pin; the fail-open half is the defect and flips |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | D1–D5: leg-findings pool + count grammar, widened disposition guard, observed retention, runId generation; header comment updated (Exit codes unchanged) |
| spec/commands/build.md | MODIFY | doctrine | D6: two-count definition fix in the Phase 5 ledger sentence |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version 7.1.0 → 7.2.0; description changelog paragraph (last-3-versions form) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260818-01-1 … -10; colliding pins D7 updated in place and retagged |

## Contracts

Derivation (first match wins, D1/D3 inserted, everything else byte-unchanged):

```
REVIEWER_FAILED  → workflow.verdict === 'REVIEWER_FAILED'
UNVERIFIED       → manifest invalid, or a required leg's row absent
GATE_RED         → a blocking leg (gate/smoke/ci; smoke exit 4 = green-inert) is red
CLEAN            → (release profile)
FINDINGS         → fixDispatched > 0 (non-terminal, unchanged)
legFindings      = Σ over red non-blocking manifest rows of countGrammar(row)   // D2, floor 1 per red row
undispositioned  = (survivors.length + legFindings) − (waived + rejected + fixDispatched)
HARD_FINDINGS    → undispositioned > 0 AND (legFindings > 0 OR any survivor severity 'hard')
FINDINGS         → undispositioned > 0 (all-soft survivors, no leg findings)
CLEAN            → otherwise
```

Guard (exit 2) becomes: `waived + rejected + fixDispatched > survivors.length + legFindings`.
The no-workflow guard is unchanged in text and reach: any word outside
`{UNVERIFIED, GATE_RED}` without `--workflow` stays exit 2 — a red findings leg with no
reviewer return now lands there as `HARD_FINDINGS`-would-be, which is correct (the reviewer
must still run).

Review ledger row deltas (additive; no key removed or renamed):

```
row.runId     : always present on review rows — the --run-id value, else "rv_" + 12 hex
row.legs[i]   : {leg, exit, observed}   // observed = manifest row's string, sliced to 120
row.findings  : {survived, killed, waived, rejected, fixDispatched, reviewerCount, legFindings}
```

Release rows: `legs` gains `observed` identically; `row.ci` and every other release key
byte-unchanged; still no `runId`.

build.md Phase 5 sentence (replaces the current one verbatim):

```
`diff` from `git diff --shortstat {base}..HEAD` — `loc` = insertions + deletions (the same
sum review's {diffLoc} uses); `deviations` = sidecar entry count (lines matching `^- `; 0 if
absent).
```

## Behavior

The review-session flow this changes: a red findings leg (orphan-decision, out-of-plan,
uncovered AC, unsanctioned skip, at-risk failure) now holds the verdict at `HARD_FINDINGS`
until the session either fixes it (fix-delta re-runs the leg; the fresh manifest's green row
zeroes its contribution) or the user waives/rejects it through the same `--waived/--rejected`
counters that already cover reviewer survivors. Nothing about the reviewer, review-legs.js,
or the disposition conversation changes — only the arithmetic that decides when CLEAN is
reachable and what the ledger remembers.

Iteration accounting: each authoritative verdict invocation on a fresh manifest recomputes
`legFindings` from that manifest alone — a leg fixed and re-run green contributes 0, so a
fix-then-CLEAN needs no waive for the now-green leg (`fixDispatched` from the prior
iteration derived `FINDINGS` then; the next iteration starts its counters clean, matching
the existing survivor flow).

## Acceptance Criteria

- **AC-20260818-01-1**: WHEN the manifest's blocking legs are green, a findings leg row is
  red, the workflow return has zero survivors, and no dispositions are passed, THE SYSTEM
  SHALL derive `HARD_FINDINGS` and exit 1, never `CLEAN` (e.g. `{"leg":"promise-sweep",
  "exit":1,"observed":"rows=9 carried=5 sanctioned=2 orphans=2"}` amid otherwise-green legs
  + `--workflow` with `survivors: []` → stdout line 1 `HARD_FINDINGS`, exit 1) → new test in
  tests/review/verdict.test.js
- **AC-20260818-01-2**: WHEN that same manifest's leg findings are fully dispositioned, THE
  SYSTEM SHALL derive `CLEAN` and exit 0 (e.g. the AC-1 fixture + `--waived 2` → `CLEAN`,
  exit 0; the ledger row records `findings.waived: 2`, `findings.legFindings: 2`) → same file
- **AC-20260818-01-3**: WHEN counting a red leg's findings, THE SYSTEM SHALL parse the
  pinned observed format and floor at 1 (e.g. `{"leg":"reconcile","exit":3,"observed":
  "outOfPlan=3"}` → 3; `{"leg":"skip-reconcile","exit":1,"observed":"skipped=3 sanctioned=2"}`
  → 1; `{"leg":"at-risk","exit":1,"observed":"files=2"}` → 1; `{"leg":"promise-sweep",
  "exit":1,"observed":"garbled"}` → 1) → same file
- **AC-20260818-01-4**: WHEN dispositions exceed survivors + legFindings THE SYSTEM SHALL
  exit 2 with the contradiction message naming both pools (e.g. all legs green, zero
  survivors, `--waived 1` → exit 2), and WHEN they exceed survivors alone but not the sum
  THE SYSTEM SHALL proceed (the AC-2 fixture is the literal example) → same file
- **AC-20260818-01-5**: WHEN `--ledger` prints a review or release row THE SYSTEM SHALL
  retain each leg's `observed` string (e.g. the ci leg row prints as
  `{"leg":"ci","exit":0,"observed":"unavailable"}`, byte-distinguishable from
  `"observed":"conclusion=success"`) → same file
- **AC-20260818-01-6**: WHEN `--ledger` prints a review row THE SYSTEM SHALL CONTINUE TO
  mirror the manifest's legs in insertion order with `leg` and `exit` intact (retag of the
  legs-shape pin; the assert widens from `{leg, exit}` equality to per-row
  `{leg, exit, observed}` equality against the manifest) → same file
- **AC-20260818-01-7**: WHEN `--ledger` prints a review row and `--run-id` was not passed
  THE SYSTEM SHALL generate `runId` matching `^rv_[0-9a-f]{12}$`, unique per invocation
  (e.g. two runs of the same fixture → two distinct values, both matching) → same file
- **AC-20260818-01-8**: WHEN `--run-id wf_abc123` is passed THE SYSTEM SHALL CONTINUE TO
  write `"runId":"wf_abc123"` verbatim (retag of AC-20260805-02-5's surviving half; its
  omit-the-key half is superseded by D5 and the old assert is replaced, not kept red) →
  same file
- **AC-20260818-01-9**: WHEN the at-risk leg is red THE SYSTEM SHALL CONTINUE TO never
  derive `GATE_RED` (retag of AC-20260815-02-7's surviving half: red at-risk `files=2` +
  zero survivors now needs `--waived 1` to reach `CLEAN` exit 0, and reaches it) → same file
- **AC-20260818-01-10**: WHEN a red findings leg coexists with reviewer survivors THE
  SYSTEM SHALL require dispositions covering both pools before `CLEAN` (retag of
  AC-20260817-07-12 and AC-20260805-02-3: their fixtures — 1 red-leg finding + 1 survivor,
  `--waived 1` — derive `HARD_FINDINGS`; updated in place to `--waived 2` → `CLEAN`) →
  same file

## Assumptions (escalation triggers)

- A1: The pinned observed formats in review-legs.js's header (byte-compatible row shapes)
  are the only formats findings legs write — **if false:** D2's floor-1 still counts the
  red row as ≥1 finding; nothing fails open. Verified by execution 2026-08-18: spike
  manifest with `orphans=2` + zero-survivor workflow → `CLEAN` exit 0 (the defect);
  `--waived 1` on a leg finding → exit 2 contradiction (the structural gap); `--ledger`
  legs row printed `{"leg":"promise-sweep","exit":1}` with observed stripped and
  `runId` absent; `--run-id rv_test123` → `"runId":"rv_test123"` (plumbing intact).
- A2: No script consumer parses `row.legs` expecting exactly two keys — verified by grep
  2026-08-18: `spec-status.js`/`observation.js` read observe-stage rows and frontmatter,
  never `.legs`; `run-ledger.test.js` pins no legs shape — **if false:** STOP, ask the user.
- A3: Version 7.2.0 is free at build time — **if false:** bump to the next free version and
  log the deviation (standing Gotcha: concurrent sessions race the semver; the literal is a
  target, not a pin).
- A4: `crypto.randomBytes` is available in every supported Node (built-in, no dependency) —
  **if false:** STOP (zero-dependency rule forbids alternatives worth having).

## Rationale

All four defects were found by the 2026-08-18 Fable retainer consult on the first full v7
run and re-demonstrated by execution in this planning session (A1). The root cause is one
shape: v7 moved findings from the reviewer's return (counted) into deterministic legs
(uncounted) without moving the disposition arithmetic with them — so the sole verdict
derivation counts a pool that no longer holds all the findings. D1–D3 move the arithmetic.
The severity call (leg findings are always hard) is deliberate: every findings leg asserts a
contract violation (orphaned Decision, out-of-plan file, uncovered AC, unsanctioned skip,
failing at-risk suite) — a "soft" tier would reintroduce judgment into a deterministic
count. Rejected: making findings legs blocking (breaks the ratified waive path — reconcile
stays red across iterations when a waived out-of-plan file persists); a per-leg disposition
flag vocabulary (pooled counters already model the survivor flow the session runs).
runId generation lives in the script, not review.md choreography, because the defect's own
history is choreography forgetting the flag: v6 workflow rows carried `runId`, all five v7
review rows read `null`. AC-20260805-02-5's omit-the-key contract guarded against
present-but-empty backlinks; a generated real id satisfies that intent — the pin updates
rather than survives. The plan stage's missing ledger row is deliberately NOT here — owned
by brief 14 (reviewer-measurement), which also owns retained reviewer evidence keyed by the
`runId` this spec guarantees. Sidecar shape validation stays with brief 13; D6 only fixes
what the existing count means. Fragile to watch: the three retargeted fixtures in
verdict.test.js encode disposition arithmetic — a worker adjusting `--waived` counts without
reading D7's table will leave a red pin and must not weaken it.

Collision-closure waives (run at lock, 2026-08-18): `tests/scope-reconcile-at-risk.test.js`
(likely-tier hit — uses `spec/scripts/verdict.js` only as a synthetic fixture *path* inside
a tmpdir repo; no behavioral coupling to the derivation); `docs/roadmap/01-claims-registry.md`
("line count" hit — brief superseded by v7); `docs/roadmap/13-deviations-sidecar-mechanization.md`
("line count" hit — its Grounding bullet cites the current build.md definition D6 replaces;
the brief re-derives grounding when planned, and /spec:doctor prunes stale citations).

## Canonical Delta

Append to the verdict paragraph of `docs/canonical/review.md` (the bullet ending "verdict.js
exit 0 is the only door to Phase 3 close"):

> Findings legs are counted, not just colored: every red non-blocking manifest row
> contributes its parsed finding count (pinned observed grammars; floor 1) to the
> undispositioned pool beside reviewer survivors, and `CLEAN` is unreachable until
> dispositions cover the whole pool — leg findings are always hard. Ledger leg rows retain
> their `observed` string in both profiles, so a structurally-absent observation
> (`unavailable`) is permanently distinguishable from a pass. Review rows always carry
> `runId` (orchestrator-passed, else generated `rv_`+12hex by verdict.js) — the backlink
> `/spec:escape` correlates on. Build rows count `deviations` as sidecar entries (`^- `
> lines) and `diff.loc` as insertions+deletions, matching review.
> (specs/20260818/01-ledger-truth.md)
