---
date: 2026-10-24
status: done
build_base: main
tier: standard
area: review
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-24
diff_base: 0a44191f4e57fed0f75d2b29ba6ccfa174ec18ca
---

# Review driver reads recorded facts, never stand-ins

## Goal

The review driver decides from facts it already records, never from file counts, highest
numbers or sticky booleans. Today it infers "a fix round ran" from how many manifest files
exist, so the skip-extraction re-run (which also mints a manifest) prints a fix-delta step
naming files that do not exist and halves the fix budget; a fix round that introduces new
skipped tests never re-enters the skip step; an empty skip file is accepted against a gate
reporting 26 skips; and the skip reconciler maps a skipped test to its file's first cited AC
instead of its own. Done means: each of those decisions reads one recorded fact, with a
regression test per defect, and the existing pins keep passing.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A manifest's number is a storage key only. Its kind is the `scope` value review-legs.js stamps on every row (`full` / `fix-delta`); `isFixDeltaManifest(n)` reads it, `fixRoundsDone()` counts it. The REVIEWER step prints the fix-delta variant only when the live manifest is fix-delta, and `FIX_CAP` counts fix-delta manifests plus uncleared escalations, never `manifests.length - 1` (AC-20261024-01-1, AC-20261024-01-2, AC-20261024-01-3) | The stamp is on disk in the evidence file, so a hand-edited sidecar still cannot reset the cap; a sidecar `iterations[]` list would lose that property. Spiked red→green in scratch 2026-10-24 (A1). |
| D2 | The live iteration is `marks.iteration`, written by every legs run. `deriveState()` and the three handler sites (`skips-extracted`, `reviewer-returned`, `fix-applied`) read it; no site computes `Math.max(...listManifestNumbers())`. An iteration whose manifest has zero rows re-runs legs at that same number (AC-20261024-01-4, AC-20261024-01-5) | Deleting manifest-2 today makes the driver judge stale manifest-1 as live; the recorded iteration says 2 and its evidence is gone, so regenerate 2. |
| D3 | SKIPS is per iteration: it fires when the gate reports skips > 0 and the live iteration's recorded legs mode has no `skipsFile`, or its recorded `skipsGateCount` differs from the gate's current count. `runLegs` records `skipsGateCount` beside `skipsFile`. `fix-applied` re-runs legs with the prior iteration's `skipsFile` (AC-20261024-01-6, AC-20261024-01-7) | The sticky boolean `marks.skipsExtracted` is a stand-in for "this iteration's skips were extracted"; a fix round adding skipped tests ran skip-reconcile against an empty list and reported 0 against a gate showing 3 (spike 2026-10-24). Loop-free: after re-extraction the recorded count equals the current one. |
| D4 | `skips-extracted` after a fix-delta iteration inherits that mode: the re-run passes `--fix-delta`, copies `fix-delta-N.txt` to `fix-delta-(N+1).txt`, and records `marks.fixDeltaFrom[N+1] = marks.fixDeltaFrom[N]`. `fix-applied` records `marks.fixDeltaFrom[n] = curN`; the REVIEWER fix-delta variant names `reviewer-return-<fixDeltaFrom[n]>.json` and `disposer-return-<fixDeltaFrom[n]>.json` from that record, never `n - 1` (AC-20261024-01-8) | A skip re-run inside a fix round must still be a fix-delta pass for the reviewer; `n - 1` arithmetic is the same stand-in class. |
| D5 | `--mark skips-extracted` refuses (exit 2, nothing written) a file with zero non-blank lines while the live manifest's gate row reports skips > 0; when the non-blank line count differs from the gate's count it prints one `⚠ skip file lists N names, gate reported M skips` line and proceeds (AC-20261024-01-9, AC-20261024-01-10) | An empty file against 26 skips let a review reach CLEAN (zubu-connect 20261017/03). A count mismatch is a warning, not a refusal: the plugin declares only the skip-count format; runners group identical skips into one line. |
| D6 | ac-matrix.js step-6 routes 2 and 3 are position-aware: locate the test's name in the file (route 2: the whole line; route 3: the part after `::`, cut at the first `[`), take the first AC-ID cited at or after that position, and fall back to today's file-level mapping only when none follows (AC-20261024-01-11, AC-20261024-01-12, AC-20261024-01-13) | File-level citations hand a skipped test the module docstring's first AC; the sanction decision then reads the wrong `[env:]`. Position is language-neutral; the plugin still owns no test-name grammar. |
| D7 | The `--iteration` passed to every verdict.js pass is `fixRoundsDone()`, not the manifest number (AC-20261024-01-14) | Ledger rows overstated the fix iteration after a skips round; verdict.js is the only reader, so the shape is unchanged. |
| D8 | Build-time scope widening (gate lines: `tests/review/escalate-row.test.js` AC-20260822-01-5, `tests/review/review-driver-fix-cycle.test.js` AC-20260902-05-6): both pins asserted the ledger `iteration` equals the manifest number; under D7 they assert the fix-round count (2 after two fix cycles; 1 for the first fix-delta hard-stop), updated in place and retagged AC-20261024-01-14, never weakened (AC-20261024-01-14) | Auto-picked add to scope; D7 retires the manifest-number reading these pins spelled. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1–D5, D7: `isFixDeltaManifest`/`fixRoundsDone`; `marks.iteration` as the live iteration at all four sites; per-iteration SKIPS on `legsMode[n].skipsFile`/`skipsGateCount`; `fixDeltaFrom` record; skips-extracted empty-file refusal and mismatch warning; `--iteration` from `fixRoundsDone()` |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D6: position-aware routes 2/3 with file-level fallback |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/review/iteration-identity.test.js | CREATE | tests | AC-20261024-01-1, AC-20261024-01-2, AC-20261024-01-4, AC-20261024-01-5, AC-20261024-01-8, AC-20261024-01-14 |
| tests/review/skips-per-iteration.test.js | CREATE | tests | AC-20261024-01-6, AC-20261024-01-7, AC-20261024-01-9, AC-20261024-01-10 |
| tests/ac-matrix/skip-position.test.js | CREATE | tests | AC-20261024-01-11, AC-20261024-01-12 |
| tests/review/review-driver.fixtures.js | MODIFY | tests | A3 remedy: additive shared-setup exports for the two new review test files |
| tests/review/escalate-row.test.js | MODIFY | tests | D8: escalate-row iteration pin reads the fix-round count |
| tests/review/review-driver-fix-cycle.test.js | MODIFY | tests | D8: first fix-delta GATE_RED row pins iteration 1 |

## Contracts

Sidecar (`<spec>.review/review-state.json`) additions, all written by the driver only:

```jsonc
{
  "iteration": 2,                       // existing: the live iteration (D2)
  "legsMode": {                         // existing map, two new keys per entry
    "2": { "skipsFile": "/abs/skips.txt", "fixDelta": false, "skipsGateCount": 3 }
  },
  "fixDeltaFrom": { "3": 2 }            // D4: manifest-3 is the fix-delta pass over the return of iteration 2
}
```

Driver helpers (internal, same file):

```js
function isFixDeltaManifest(n)   // true when any row of manifest-n.jsonl carries scope === 'fix-delta'
function fixRoundsDone()         // count of manifest numbers for which isFixDeltaManifest(n) is true
```

ac-matrix route rule (D6), per skip line `L` with no embedded AC-ID:

```
route 2: f = first test file whose content includes L; i = content.indexOf(L)
route 3: f = file before '::' (inside --root, exists); name = text after '::' up to the first '['; i = content.indexOf(name)
mapped  = AC-IDs in content.slice(i) in order (dedup)  →  if empty: AC-IDs in the whole content (today's behaviour)
```

## Behavior

- A spec whose gate reports skips: LEGS writes manifest-1 (`full`, no skipsFile) → SKIPS →
  `skips-extracted --file f` writes manifest-2 (`full`, skipsFile f, skipsGateCount 26) → REVIEWER
  prints the **plain** dispatch step (manifest-2 is not fix-delta) → … → `fix-applied` writes
  manifest-3 (`fix-delta`, skipsFile f carried, `fixDeltaFrom[3]=2`) → REVIEWER prints the fix-delta
  step naming `fix-delta-3.txt`, `reviewer-return-2.json`, `disposer-return-2.json` → a second
  `fix-applied` is accepted (one fix round done); a third is refused at the cap.
- A fix round whose gate now reports 3 skips against a recorded `skipsGateCount` of 1 lands SKIPS;
  `skips-extracted` writes manifest-4 as a fix-delta pass (D4) and the REVIEWER step is the fix-delta
  variant naming `fix-delta-4.txt`.
- Deleting `manifest-2.jsonl` while `marks.iteration` is 2 re-runs legs writing manifest-2 again; the
  STOPPED remedy text is unchanged.
- `skips-extracted` with an empty file: exit 2, message names the gate's count and asks for a real
  extraction; no sidecar change, no manifest.

## Acceptance Criteria

- **AC-20261024-01-1**: WHEN the gate reports skips and `--mark skips-extracted` has written manifest-2 THE SYSTEM SHALL print the plain `## Step: dispatch the reviewer` text and never the string `fix-delta pass` (manifest-2 rows carry `scope: "full"`) → writes tests/review/iteration-identity.test.js
- **AC-20261024-01-2**: WHEN a skips re-run has produced manifest-2 and one `fix-applied` round has produced manifest-3 THE SYSTEM SHALL accept a second `fix-applied` (exit 0, manifest-4 written) and refuse the third with the `iteration cap 2 reached` message → writes tests/review/iteration-identity.test.js
- **AC-20261024-01-3**: WHEN the sidecar's stored iteration count is hand-edited THE SYSTEM SHALL CONTINUE TO derive the fix cap from manifest files actually present on disk → reuses tests/review/review-driver-fix-cycle.test.js :: AC-20260820-07-8 (manifest-provable
- **AC-20261024-01-4**: WHEN `manifest-2.jsonl` is deleted while `marks.iteration` is 2 and `manifest-1.jsonl` still exists THE SYSTEM SHALL re-run legs writing `manifest-2.jsonl` again and never judge manifest-1 as the live manifest → writes tests/review/iteration-identity.test.js
- **AC-20261024-01-5**: WHEN the gate row reports skips > 0 and no skips file is marked THE SYSTEM SHALL CONTINUE TO print the SKIPS step, and after `skips-extracted --file <f>` re-run legs with `--skips <f>` on a fresh `manifest-2.jsonl` → reuses tests/review/review-driver.test.js :: AC-20260820-07-10
- **AC-20261024-01-6**: WHEN a `fix-applied` round's gate reports 3 skips and the live iteration's recorded `skipsGateCount` is 1 THE SYSTEM SHALL land state SKIPS and print the extraction step → writes tests/review/skips-per-iteration.test.js
- **AC-20261024-01-7**: WHEN `fix-applied` re-runs legs after a skips re-run THE SYSTEM SHALL pass the prior iteration's skips file to review-legs.js (`legsMode[<n>].skipsFile` equals the earlier file) → writes tests/review/skips-per-iteration.test.js
- **AC-20261024-01-8**: WHEN `skips-extracted` follows a fix-delta iteration N THE SYSTEM SHALL write manifest-(N+1) with `scope: "fix-delta"` rows, create `fix-delta-(N+1).txt` byte-identical to `fix-delta-N.txt`, record `fixDeltaFrom[N+1] = fixDeltaFrom[N]`, and the REVIEWER step SHALL name `reviewer-return-<fixDeltaFrom[N+1]>.json` → writes tests/review/iteration-identity.test.js
- **AC-20261024-01-9**: WHEN `--mark skips-extracted --file <f>` is given a file with zero non-blank lines while the live gate row reports skips > 0 THE SYSTEM SHALL exit 2 naming the gate's skip count, write no manifest and leave `review-state.json` byte-identical → writes tests/review/skips-per-iteration.test.js
- **AC-20261024-01-10**: WHEN the skips file holds 2 non-blank lines and the gate reports 3 skips THE SYSTEM SHALL exit 0, print exactly one line matching `⚠ skip file lists 2 names, gate reported 3 skips`, and run legs with that file → writes tests/review/skips-per-iteration.test.js
- **AC-20261024-01-11**: WHEN a skip line `tests/unit/test_x.py::test_round_trip` names a file whose module docstring cites `AC-20261024-01-1` and whose `def test_round_trip` docstring cites `AC-20261024-01-8` THE SYSTEM SHALL map the skip to `AC-20261024-01-8` (the finding's `ac` field), never `-01-1` → writes tests/ac-matrix/skip-position.test.js
- **AC-20261024-01-12**: WHEN a bare-name skip line is found inside a test file and the first AC-ID after that position is `AC-20261024-01-8` THE SYSTEM SHALL map the skip to `AC-20261024-01-8`; WHEN no AC-ID follows the position THE SYSTEM SHALL fall back to the file's first cited AC-ID → writes tests/ac-matrix/skip-position.test.js
- **AC-20261024-01-13**: WHEN a skip is mapped to an AC-ID whose owning spec date directory is absent THE SYSTEM SHALL CONTINUE TO fail closed as `unsanctioned-skip` naming the missing directory → reuses tests/ac-matrix/owning-spec-env.test.js :: AC-20260815-03-3
- **AC-20261024-01-14**: WHEN a review with one skips re-run and one fix round reaches its close verdict THE SYSTEM SHALL write `"iteration": 1` on the review ledger row (one fix round, three manifests) → writes tests/review/iteration-identity.test.js

## Assumptions (escalation triggers)

- A1: review-legs.js stamps `scope` on every manifest row it writes (`full` by default, `fix-delta` under `--fix-delta`) — verified 2026-10-24: scratch copy of the driver switched REVIEWER wording and the cap to the stamp; `tests/review/review-driver.test.js` + `fix-delta-pass.test.js` 16/16, with a two-case repro 18/18, whole review folder 276/279 (the 3 failures read the real repo root's `.gitignore` and are unrelated). Patch at `scratchpad/spike/spec/scripts/spec-review-driver.js` — **if false:** record the kind in `legsMode[n].fixDelta` instead (already written) and note the lost hand-edit property in Rationale.
- A2: `marks.iteration` is written by every legs run before any state is derived (`runLegs` line ~852) — **if false:** write it there first; the tests above go red if it is missing.
- A3: `tests/review/review-driver.fixtures.js` exposes `specBody`, `run`, `stateOf`, `returnFileWith`, `oneFixReturnFile`, `SURVIVOR_RETURN` as the spike's repro test imports them — **if false:** the worker adds the missing export to the fixtures file (tests layer).
- A4: no host declares a skip-name grammar; only `capabilities.skipReportPattern` (count) exists in the grounding contract — **if false:** STOP, ask the user whether D5's mismatch becomes a refusal.

## Rationale

Four agents audited 90 days of fixes on 2026-10-24: 31% of fix commits were decisions
taken from a stand-in (counts, highest N, presence, HEAD) while the recorded fact went
unread; this driver alone took 21 of them. The two spikes that found D3 and D2's
delete-manifest case took under an hour. The rule this spec applies is one recorded fact
per decision; the sibling 20261024/02 adds the consistency test that bans the stand-in
calls from every driver's `deriveState()`.

D1 keeps manifest numbering exactly as AC-20260820-07-10 pins it (skips-extracted mints
a fresh manifest) because mixing pre- and post-attribution evidence in one manifest was
the original defect that pin guards. The scope stamp was preferred over a sidecar list
because the cap's "hand-edit cannot reset it" property (AC-20260820-07-8) rests on the
evidence files, not the sidecar. D5's warning-not-refusal follows the plugin's own
disclaimer in ac-matrix.js: no universal skip-name format exists, only the count format is
host-declared; pytest's grouped `SKIPPED [3]` lines are the concrete case a strict equality
would block. D6 stops short of parsing any language's test syntax; position after the
name is the most that holds across runners. The REVIEWER step's prior-return files (D4)
were the last `n - 1` arithmetic in the file.

Rejected: a thin hooks-based redesign (spike section 4) — a third the size, but any version
that counts files reproduces this class; the fix is the rule, not the rewrite.

Build departures (folded from the deviations sidecar at review close, 2026-10-24):
- `liveIteration()` trusts `marks.iteration` only when `legsMode[<n>]` records a legs run at
  that number; otherwise it falls back to the highest manifest on disk. D2 read literally
  breaks AC-20260820-07-8 (a hand-edited `iteration: 99` must not move the cap), which
  AC-20261024-01-3 reuses. The fallback fires only for an unrecorded counter.
- D7 reddened two pins outside the File Plan that equated the ledger iteration with the
  manifest number; D8 added them to scope and retagged them.
- `tests/review/review-driver.fixtures.js` gained additive shared-setup exports (A3's remedy);
  its count host's AC bullet carries a bare env tag so skip-reconcile stays green.
- AC-20261024-01-5 stays on its reused pin, not in the new file, so red-check never expects it red.

### Advisory debt (review rv_ff0ab35d94b3)
- a0 /Users/jj/Projects/claude-plugins/.claude/worktrees/spec-01-review-driver-reads-recorded-facts/spec/scripts/spec-review-driver.js:103 — liveIteration() falls back to the highest manifest number on disk when marks.iteration has no legsMode entry — a recorded deviation from D2. It still reads a file-count stand-in on the hand-edited-counter path; sanctioned only by the deviations sidecar and AC-20260820-07-8, not by a Decision. — Removing the highest-manifest fallback in liveIteration() means amending locked D2 against AC-20260820-07-8 (a hand-edited iteration must not move the cap), which AC-20261024-01-3 reuses; that trade is the user's decision. The fallback fires only when marks.iteration has no recorded legs run.

## Canonical Delta

docs/canonical/review.md, section on the review driver's iteration model: replace any
sentence deriving the fix iteration from the manifest count with: "A manifest's number is
a storage key. Its kind is the `scope` stamp on its rows; the fix cap counts fix-delta
manifests. The live iteration is the sidecar's recorded `iteration`; SKIPS re-fires per
iteration when the gate's skip count differs from the count recorded at extraction.
`skips-extracted` refuses an empty file against a gate reporting skips and warns on a count
mismatch." Add under skip reconciliation: "Routes 2 and 3 map a skip to the first AC cited
at or after the test's own name, falling back to the file's citations."
