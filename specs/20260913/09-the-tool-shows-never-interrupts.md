---
date: 2026-09-13
status: hardened
tier: critical
area: review-status
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# The tool shows, never interrupts

## Goal

The review driver parks a CLEAN close at `REPLAY` every fifth review and refuses to conclude
until a reviewer replay is recorded. The owner's finding: a block is bypassed anyway, and the
surprise interrupt mid-delivery is the actual cost. The other finding from two failed products:
nobody could see how long it had been since anything was observed in production. This spec
removes the `REPLAY` state and its mark from the driver, moves the dueness derivation into the
shared ledger library, and gives the dashboard footer two ignorable clauses: how many specs have
closed since the last release, and whether a replay is due. Done means a review that has merged
prints `DONE`, `/spec:replay` is the only executor, and `/spec:status` shows the two counts every
time without ever blocking anything.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **`REPLAY` leaves the review driver.** `spec-review-driver.js`'s state chain is `CLOSE -> MERGE/CONFLICTS -> DONE (terminal)`. Deleted: `replayEntry`, `replayStepBody`, `countReplayRowsFor`, `handleReplayRecorded`, the `REPLAY` arm of the step map, `marks.replayTarget`/`marks.replayRecorded`, the `replay-recorded` case and its name in the unknown-mark refusal (which now enumerates `skips-extracted | reviewer-returned | dispositions | fix-applied | closed | merge-strategy | conflicts-resolved`), `replayBin`, and the `parseSelection` require. `finishMerge` and MERGE's merge-skipped arm call `printDoneNow(<their existing note>)` directly; `deriveState`'s `mergeConcluded` branch calls `printDoneNow('')` unconditionally. `relocateSidecar` and the main-root spec path it computes stay (DONE prints that path and deletes the sidecar there); its comment and the D8 comment above `printDoneNow` are brought current. `spec/scripts/lib/parse-selection.js` and `tests/parse-selection/parse-selection.test.js` are deleted — the driver was the module's only consumer. (AC-20260913-09-1, AC-20260913-09-2, AC-20260913-09-3) | A state whose only content was a block the owner will bypass is an interrupt with no upside. The parser's remaining caller is a human reading `--select` in `/spec:replay`. |
| D2 | **Dueness moves to the shared ledger library.** `spec/scripts/lib/observation.js` exports `REPLAY_EVERY = 5`, `isMeasurementReplay(row)` (moved verbatim from `replay.js` with `MEASUREMENT_OUTCOMES`), and `replayDueness(rows) → { reviewsSince, due }` — `reviewsSince` = count of `stage:"review"` rows after the last measurement replay row in read order, `due = reviewsSince >= REPLAY_EVERY`. `replay.js`'s `cmdDue` and `--select`'s window both call it; printed lines and exit codes are byte-identical. (AC-20260913-09-4, AC-20260913-09-5) | Two readers of one window (harness and dashboard) must share one derivation — the repo's own hard finding. |
| D3 | **Specs done since the last release.** `lib/observation.js` exports `sinceLastRelease(rows) → { done, released }`: `released` is true when any `stage:"release"` row with `verdict:"CLEAN"` exists; `done` is the number of distinct `spec` values among `stage:"review"` rows with `verdict:"CLEAN"` positioned after the last such release row (after none when `released` is false). (AC-20260913-09-6) | Distinct paths, not rows: a spec that needed a fix round has two review rows and closed once. A non-CLEAN release row released nothing. |
| D4 | **Two footer clauses, nothing else.** `spec-status.js`'s footer appends, after the hygiene clause and in this order: `· {N} done since last release` when `released` and `N ≥ 1`, or `· {N} done, never released` when not `released` and `N ≥ 1`; then `· replay due ({r}/5) — /spec:replay` when `due`. Zero `N` and not-due print nothing. Identical under `--all`. `--json` and `--next` are unchanged (the four frozen top-level keys stay). No new block: the default screen is still exactly four. (AC-20260913-09-7, AC-20260913-09-8, AC-20260913-09-9) | The owner asked for a line they can ignore. A fifth block would change the four-block contract `status.md` and its pins fix; a clause rides on a line that already exists. |
| D5 | **Doctrine says show, not park.** `core.md` § Feedback Loop's replay-cadence paragraph is rewritten: cadence stays `replay.js --due` policy; execution is `/spec:replay`, run on demand — the review driver never parks a close; the dashboard footer's `replay due` clause is where dueness is seen; one sentence records that the blocking form (specs/20260821/02 D5) was retired by ADR because a block on a finished review is bypassed and its interrupt is the cost, and that the earlier printed-reminder measurement (12+ skipped) stands as the reason the count now lives on the dashboard rather than in a report. `stage-review.md` loses its "parks at `REPLAY`" sentence and its "The due replay (the REPLAY step)" Rules bullet. `replay.md`'s "Two entry points, one executor" paragraph becomes "One entry point": this command is the executor; Phase 0's not-due STOP is unchanged. `status.md`'s footer clause list names the two new clauses. (AC-20260913-09-10) | Doctrine that still names a state the driver no longer has sends the next session to look for a step that never prints. |
| D6 | **One amendment ADR.** `docs/adr/0024-replay-runs-on-demand.md` (CREATE; the next free number at build if 0024 is taken — amend every mention here in the same build) applies to specs/20260821/02-replay-review-phase.md D1/D2/D5 (the REPLAY state, its mark, and the "state instead of a print" ruling — all retired) and to `core.md` § Feedback Loop. `[no-ac: durable record; AC-20260913-09-10 pins the doctrine it explains]` | A measured ruling is being reversed on the owner's stated grounds; the reversal must be findable from the spec that made the ruling. |
| D7 | **Tests follow the surfaces.** `tests/review/review-driver-replay-entry.test.js` and `tests/review/review-driver-replay-record.test.js` are deleted (every pin's subject is the deleted state); `fiveSeedReviews` leaves `tests/review/review-driver.fixtures.js`'s exports (its two users are gone) while `seedReplayRow`/`seedReviewRow`/`makeReplayHost` stay for the new test. `tests/run-ledger.test.js :: AC-20260821-02-8` and `:: AC-20260821-02-9` are rewritten to pin the D5 text. `[no-ac: test-harness plumbing; the ACs below run through the repaired chain]` | A pin whose subject is gone is retired, never weakened. |
| D8 | **Plugin bump.** `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` after the last edit. `[no-ac: scripts/plugin-bump.js --check in the gate is the oracle]` | Repo rule. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1: REPLAY state, entry, step body, mark handler, `replayTarget`, `replayBin`, `parseSelection` require all deleted; MERGE concludes into `printDoneNow`; contract/state comments and the unknown-mark enumeration brought current |
| spec/scripts/lib/parse-selection.js | DELETE | scripts | D1: sole consumer deleted |
| spec/scripts/lib/observation.js | MODIFY | scripts | D2: `REPLAY_EVERY`, `isMeasurementReplay`, `replayDueness`; D3: `sinceLastRelease`; header brought current |
| spec/scripts/replay.js | MODIFY | scripts | D2: `cmdDue` and `--select`'s window call `replayDueness`/`isMeasurementReplay` from the lib; `MEASUREMENT_OUTCOMES` local copy deleted |
| spec/scripts/spec-status.js | MODIFY | scripts | D4: two footer clauses from `sinceLastRelease`/`replayDueness` over the rows already read; header footer comment brought current |
| spec/doctrine/core.md | MODIFY | doctrine | D5: § Feedback Loop replay paragraph rewritten |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D5: "parks at REPLAY" sentence and the due-replay Rules bullet deleted |
| spec/commands/replay.md | MODIFY | doctrine | D5: "One entry point" paragraph |
| spec/commands/status.md | MODIFY | doctrine | D5: footer clause list gains the two clauses |
| docs/adr/0024-replay-runs-on-demand.md | CREATE | other | D6 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/review/review-driver-replay-entry.test.js | DELETE | tests | D7 |
| tests/review/review-driver-replay-record.test.js | DELETE | tests | D7 |
| tests/parse-selection/parse-selection.test.js | DELETE | tests | D1 |
| tests/review/review-driver.fixtures.js | MODIFY | tests | D7: `fiveSeedReviews` removed from the module and its exports |
| tests/review/merge-concludes-to-done.test.js | CREATE | tests | AC-20260913-09-1, AC-20260913-09-2, AC-20260913-09-3 |
| tests/status/since-release.test.js | CREATE | tests | AC-20260913-09-5, AC-20260913-09-6, AC-20260913-09-7, AC-20260913-09-8 |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260913-09-4 tag on the existing `--due` pin (reuse, unchanged assertions) |
| tests/spec-status.test.js | MODIFY | tests | AC-20260913-09-9 tag on the existing frozen-keys pin (reuse, unchanged assertions) |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260913-09-10 (rewrites the two REPLAY doctrine pins) |

## Contracts

```js
// spec/scripts/lib/observation.js (additions)
const REPLAY_EVERY = 5
function isMeasurementReplay(row)          // stage:"replay" && outcome ∈ {caught, missed, leg-caught}
function replayDueness(rows)               // -> { reviewsSince: number, due: boolean }
function sinceLastRelease(rows)            // -> { done: number, released: boolean }
module.exports = { readLedgerRows, qualifyingObservation, REPLAY_EVERY, isMeasurementReplay, replayDueness, sinceLastRelease }
```

Worked examples (read order):

```
rows: review(CLEAN, specs/a) · review(FINDINGS, specs/b) · review(CLEAN, specs/b) · release(CLEAN) · review(CLEAN, specs/c) · review(CLEAN, specs/c) · review(CLEAN, specs/d)
sinceLastRelease -> { done: 2, released: true }        // c and d, distinct; a and b are before the release
rows: review(CLEAN, specs/a) · release(UNVERIFIED) · review(CLEAN, specs/b)
sinceLastRelease -> { done: 2, released: false }       // an UNVERIFIED release released nothing
rows: replay(caught) · review ×3
replayDueness -> { reviewsSince: 3, due: false }
rows: replay(setup-failed) · review ×5
replayDueness -> { reviewsSince: 5, due: true }        // setup-failed is not a measurement
```

Footer lines (D4), default render:

```
🟢 next is ready · nothing else open · 2 done since last release
🟢 next is ready · 3 more open · 181 done, never released · replay due (6/5) — /spec:replay
⬜ nothing waits                                          // N = 0, not due: no new clause
```

Driver, unknown mark (exit 2):
```
unknown mark "replay-recorded" (skips-extracted | reviewer-returned | dispositions | fix-applied | closed | merge-strategy | conflicts-resolved)
```

## Behavior

A CLEAN close: CLOSE → MERGE (or the merge-skipped arm) → `DONE` printed with the spec-status
`--next` line, sidecar deleted. Nothing between. The ledger is untouched by this spec: review
rows, replay rows and release rows keep their shapes; only two readers of them are added.

`/spec:status` computes both clauses from the rows it already reads for the observation
sub-state; no second ledger read.

`/spec:replay` is unchanged in what it does; its Phase 0 still STOPs when not due.

## Acceptance Criteria

- **AC-20260913-09-1**: WHEN a review host seeded with five prior `stage:"review"` rows (the
  pre-image's due condition) is driven through CLOSE and MERGE on the originating branch THE
  SYSTEM SHALL print `state: DONE` (never `REPLAY`), `--state` SHALL print `DONE`, and the
  sidecar directory SHALL not exist afterwards → writes tests/review/merge-concludes-to-done.test.js
- **AC-20260913-09-2**: WHEN `spec-review-driver.js <spec> --mark replay-recorded` runs THE
  SYSTEM SHALL exit 2 with the D1 unknown-mark refusal enumerating exactly the seven marks in
  Contracts → writes tests/review/merge-concludes-to-done.test.js
- **AC-20260913-09-3**: WHEN the driver is re-invoked bare after DONE was printed THE SYSTEM
  SHALL print `DONE` again and exit 0 (no state re-derivation from deleted manifests) → writes tests/review/merge-concludes-to-done.test.js
- **AC-20260913-09-4**: WHEN `replay.js --due` runs over a ledger with a `caught` replay row
  followed by five review rows THE SYSTEM SHALL CONTINUE TO print `due reviewsSince=5` and exit
  0, and over three review rows SHALL CONTINUE TO print `not due reviewsSince=3` and exit 1 → reuses tests/replay/replay.test.js :: AC-20260819-02-1: --due
- **AC-20260913-09-5**: WHEN `replayDueness` is called with the two replay examples in Contracts
  THE SYSTEM SHALL return `{ reviewsSince: 3, due: false }` and `{ reviewsSince: 5, due: true }`
  respectively → writes tests/status/since-release.test.js
- **AC-20260913-09-6**: WHEN `sinceLastRelease` is called with the two release examples in
  Contracts THE SYSTEM SHALL return `{ done: 2, released: true }` and `{ done: 2, released: false }`
  respectively, and with an empty array SHALL return `{ done: 0, released: false }` → writes tests/status/since-release.test.js
- **AC-20260913-09-7**: WHEN `spec-status.js` renders a root whose ledger holds `review(CLEAN,
  specs/20260701/01-x.md)` after a `release(CLEAN)` row and whose only spec is that done spec THE
  SYSTEM SHALL end its footer with `· 1 done since last release`; with no release row the footer
  SHALL end with `· 1 done, never released`; with no CLEAN review rows after the release the
  footer SHALL carry neither clause → writes tests/status/since-release.test.js
- **AC-20260913-09-8**: WHEN the same root's ledger also holds a `caught` replay row followed by
  six review rows THE SYSTEM SHALL append `· replay due (6/5) — /spec:replay` as the footer's last
  clause, and with four review rows SHALL print no `replay` clause → writes tests/status/since-release.test.js
- **AC-20260913-09-9**: WHEN `spec-status.js --json` and `--next --json` run THE SYSTEM SHALL
  CONTINUE TO emit exactly the top-level keys `anomalies, briefs, specs, superseded` and `next` → reuses tests/spec-status.test.js :: AC-20260902-11-7 / AC-20260903-05-9 / AC-20260909-08-8
- **AC-20260913-09-10**: WHEN `spec/doctrine/core.md` § Feedback Loop, `stage-review.md` and
  `replay.md` are read (whitespace squashed) THE SYSTEM SHALL find `replay.js --due`, `/spec:replay`
  and `replay due` in § Feedback Loop, `docs/adr/0024` in § Feedback Loop, no `REPLAY` token and no
  `replay-recorded` in `stage-review.md`, and `One entry point` in `replay.md` → rewrites tests/run-ledger.test.js :: AC-20260821-02-8

## Assumptions (escalation triggers)

- A1 (executed by reading): `parseSelection` is required by `spec-review-driver.js` only; no
  `spec-paths` key, `entrypoints` row, or hooks entry names `lib/parse-selection.js` (grep
  2026-09-13: driver require + comments + its own test). **if false:** delete that reference in
  the same batch; never keep a consumer-less module.
- A2 (executed by reading): `tests/status/status-diet.test.js`'s exact-footer pins run on
  fixtures with no `.claude/spec-runs*.jsonl` rows, so `done = 0` and `due = false` print no
  clause and none of them redden. **if false:** rewrite the reddened pin to include the clause
  its fixture now earns; never make the clause conditional on a flag.
- A3: `tests/review/merge-reentry.test.js` reaches DONE through a real merge and asserts nothing
  about REPLAY (line 103 is a comment). **if false:** retag its assertion to DONE in the same batch.
- A4 (executed): this repo's own ledger has no `stage:"release"` row and 181 distinct CLEAN
  review specs — the dashboard here will read `· 181 done, never released`; `replay.js --due`
  prints `not due reviewsSince=3`. **if false:** nothing changes; the numbers are illustrative.
- A5: `docs/adr/0024` is free at build time. **if false:** take the next free number and amend
  D6, the File Plan row and AC-10's literal in the same build (host Gotchas, ADR race).

## Rationale

specs/20260821/02 D5 replaced a printed replay reminder with a blocking state after measuring
that the reminder was skipped through 12+ reviews. The owner has now stated two things: forcing
does not work on them because a block on a finished review is bypassed, and the surprise of the
block arriving mid-delivery is the real cost. This spec takes that decision as final and records
it in an ADR rather than arguing it. What survives is the measurement's lesson in a different
place: a count that is on the dashboard every time cannot be "not noticed" the way a line on one
report can — it does not need to be acted on to have been seen.

**Why the footer and not a block.** `status.md` and its pins fix the default screen at four
blocks; the footer already carries clauses that print only when non-zero. Two more clauses cost
one line of prose in `status.md` and no structural change.

**Why distinct specs.** A fix round writes two review rows for one close; counting rows would
inflate the number the owner uses to decide when to run `/spec:release`.

**Why the ADR.** The ruling being reversed cites its own evidence. A reader of that spec must be
able to find the reversal and its grounds without this session's transcript.

**Rejected.** A `--json` field for the two counts: the key set is frozen by pin and no consumer
asked. Keeping `parse-selection.js` for "future" use: a module with no caller is exactly the
dead-facade class the decomposition rule forbids. Deleting `relocateSidecar`: DONE still prints
the main-root path and deletes the sidecar there, and `git worktree remove` still refuses on
the untracked sidecar, so the relocation is needed for reasons that predate REPLAY.

**Collision closure (lock, 2026-09-13).** Literals `replay-recorded`, `REPLAY`, `parse-selection`,
`fiveSeedReviews`: every live hit outside stale `.claude/worktrees/` is a File Plan row above,
except `tests/mocks/kit-layers.test.js` (a header comment naming the parse-selection test as a
pattern — waived, no assertion). `executes` hits on `lib/observation.js` (`tests/replay/replay.test.js`,
`tests/review/stopped-row-durability.test.js`, `tests/spec-status.test.js`) run scripts whose
existing exports are unchanged; no fixture repair is planned.

**Fragile.** A2 is a fixture-shape assumption with its remedy written. A5 is the ADR-number race
the host Gotchas record three times.

## Canonical Delta

None — `core.md`, `stage-review.md`, `replay.md` and `status.md` are the canonical surfaces and
are edited in place by D5.
