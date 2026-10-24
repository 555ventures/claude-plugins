---
date: 2026-10-24
status: done
build_base: main
tier: critical
area: feedback-loop
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 0a44191f4e57fed0f75d2b29ba6ccfa174ec18ca
---

# Replay retired

## Goal

Mutation replay measured the reviewer's catch-rate by injecting a known defect into a
reviewed tree. It ran 38 times, last on 2026-09-14; 335 reviews have landed since the
harness was built and none in the last 40 days used it. It holds 6,755 lines across a
script, a corpus library, a command, a doctrine file and five test files, plus a dueness
footer and fleet queries. This spec removes it as one unit, leaves the escape ledger as the
pipeline's one ground-truth signal, and records the decision in an ADR. The prototype
REPLAY step of the build stage is a different feature and is untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete `spec/scripts/replay.js`, `spec/scripts/lib/replay-corpus.js`, `spec/commands/replay.md`, `spec/doctrine/replay-corpus.md`, every file under `tests/replay/`, and `tests/fleet-reader/corpus-gaps.test.js`; remove the `replay`, `replay-corpus` and `shared-for replay` entries from `spec/bin/spec-paths` and the `replay.js` entry (and every `spec/commands/replay.md` entry point) from `spec/entrypoints.json` (AC-20261024-05-1, AC-20261024-05-3, AC-20261024-05-10) | The unit, enumerated; the entrypoints and spec-paths tests are the oracles that nothing dangles. [asked: retire replay] |
| D2 | `lib/observation.js` drops `replayDueness`, `REPLAY_EVERY`, `isMeasurementReplay`, `lastMeasurementReplayIdx`; `spec-status.js` drops the `replay due` footer clause; `fleet-reader.js` drops the `replayDebt` and `corpusGaps` queries and the corpus require (AC-20261024-05-1, AC-20261024-05-2, AC-20261024-05-5) | The cadence had one consumer left (the footer); the fleet queries read rows nothing writes any more. |
| D3 | `review-legs.js` drops the `--replay` flag; `promise-sweep` runs on every legs invocation (AC-20261024-05-4) | The flag existed only to keep a replay tree blind; no caller remains. |
| D4 | `spec/doctrine/core.md` § Feedback Loop: the sentence naming two ground-truth signals becomes "The **escape ledger** is the pipeline's one ground-truth signal." and the "Replay cadence" paragraph is removed; `spec/commands/doctor.md` drops check 21 ("Replay baseline-red honesty") and renumbers the following checks contiguously; `spec/commands/escape.md` drops its two replay-corpus authoring lines; `spec/agents/reviewer.md` drops its `replay-corpus.md` parenthetical; `README.md` drops the `/spec:replay` row; `spec/.claude-plugin/plugin.json`'s description drops `/spec:replay` (AC-20261024-05-7, AC-20261024-05-8) | Doctrine must not name a command that no longer exists; the escape ledger was already the signal every report read. [asked: retire replay] |
| D5 | `docs/adr/0036-replay-retired.md` records the decision (status accepted, amends ADR-0025 and the replay specs' Applies-to); `docs/adr/0025-replay-runs-on-demand.md` gains `Amended by: ADR-0036` (AC-20261024-05-11) | Roadmap-amendment ADRs carry the backlink both ways. |
| D6 | This repo's `.claude/spec.config.json` drops its `replay` block; the grounding contract is not edited (it never enumerated the block) [no-ac: host config, read by nothing after D2] | One fewer unknown key; no contract hash change, no host re-stamp. |
| D7 | Every AC a deleted or rewritten test was the sole citer of gets `[retired: specs/20261024/05-replay-retired.md]` in its owning done spec; `ac-drift --all-done` exit 0 is the completeness oracle (AC-20261024-05-9) | Same mechanism as 20261024/04 D4; the worker tags what ac-drift reports. |
| D8 | `block-cross-worktree-writes.sh` keeps its replay scratch-worktree exception's logic untouched; only its header comment is rewritten so it no longer names `/spec:replay` (AC-20261024-05-1 forces the comment edit) [no-ac: logic unchanged — the exception is reachable only by a marker `replay.js --setup` planted; with the script gone it is dead and harmless] | A hook surface is critical-tier; deleting dead code there buys nothing this spec needs and risks every session's write gate. Reopen at the next edit to that hook. |
| D9 | The build stage's prototype REPLAY step (`--mark replayed`, `replay-port.json`, `replay-state.json`, the `contract` leg's `no-replay`) is out of scope and unchanged (AC-20261024-05-6) | Same word, different feature (specs/20261007/03). |
| D10 | Build amendment: AC-20261024-05-6 pins `replay-state.json` in the driver only, and AC-20261024-05-9 runs `ac-drift.js --root .` without `--all-done`; D7's oracle reads the same way (AC-20261024-05-6, AC-20261024-05-9) | Both locked texts described the pre-image wrongly (worker-reported, session-verified); the intent is unchanged. |
| D11 | Build scope widening, gate round 1: `tests/consistency/read-load.test.js` (roster count and the replay budget/ceiling/shared-for rows), `tests/consistency/entrypoints.test.js` (two comments naming the corpus key) and `spec/scripts/prototype-driver.js` (four comments citing doctor check 23) join the File Plan; `fleet-reader.js` keeps `escapes.registry` as `{class, count}` without the corpus flag, because /spec:escape and the build driver's `--mark incident --class` read it [no-ac: test-table and comment edits; registry shape is pinned by its readers] | [asked: fix out-of-plan files here] Removing a command and a doctor check strands exact-roster pins and number citations no File Plan row named. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | DELETE | scripts | D1 |
| spec/scripts/lib/replay-corpus.js | DELETE | scripts | D1 |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D2: drop corpus require, `replayDebt`, `corpusGaps` |
| spec/scripts/spec-status.js | MODIFY | scripts | D2: drop the `replay due` footer clause and its import |
| spec/scripts/lib/observation.js | MODIFY | scripts | D2: drop the four replay exports; keep `sinceLastRelease`, `readLedgerRows`, `qualifyingObservation` |
| spec/scripts/review-legs.js | MODIFY | scripts | D3: drop `--replay`; promise-sweep unconditional |
| spec/bin/spec-paths | MODIFY | scripts | D1: drop `replay`, `replay-corpus`, the `shared-for replay` case and the usage-line names |
| spec/entrypoints.json | MODIFY | scripts | D1: drop the `replay.js` entry and every `spec/commands/replay.md` entry point |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | D4 description; `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| spec/scripts/ac-matrix.js | MODIFY | scripts | comment-only: two comment lines naming `/spec:replay` reworded (AC-20261024-05-1) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | comment-only: three comment lines naming `/spec:replay` reworded (AC-20261024-05-1) |
| spec/scripts/block-cross-worktree-writes.sh | MODIFY | scripts | D8: header comment only; no logic change |
| spec/commands/replay.md | DELETE | doctrine | D1 |
| spec/doctrine/replay-corpus.md | DELETE | doctrine | D1 |
| spec/doctrine/core.md | MODIFY | doctrine | D4 § Feedback Loop |
| spec/commands/doctor.md | MODIFY | doctrine | D4: drop check 21, renumber |
| spec/commands/escape.md | MODIFY | doctrine | D4: drop the corpus-authoring lines |
| spec/agents/reviewer.md | MODIFY | doctrine | D4 |
| README.md | MODIFY | doctrine | D4: drop the `/spec:replay` row |
| .claude/spec.config.json | MODIFY | other | D6 |
| .claude/agents/doctrine-author.md | MODIFY | other | drop `replay-corpus.md` from the doctrine file list (AC-20261024-05-1) |
| docs/adr/0036-replay-retired.md | CREATE | other | D5 |
| docs/adr/0025-replay-runs-on-demand.md | MODIFY | other | D5 backlink |
| specs/20260819/02-mutation-replay.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260819/03-replay-first-run-fixes.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260820/02-replay-scratch-write-access.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260821/02-replay-review-phase.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260823/05-replay-unattended-hardening.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260823/09-replay-baseline-attribution.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260826/01-replay-scratch-path-blindness.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260831/01-replay-range-materialization.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260901/08-corpus-derivation-and-kill-match.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260903/01-owed-query-and-row-handoff.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260903/02-whole-suite-review-leg.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260904/02-worktree-include-shared-owner.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260909/01-replay-build-shaped-mutation.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260909/02-replay-base-and-label-honesty.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260913/01-the-replay-tree-is-the-reviewed-tree.md | MODIFY | other | D7 `[retired:]` tags |
| specs/20260913/09-the-tool-shows-never-interrupts.md | MODIFY | other | D7 `[retired:]` tags |
| tests/replay/replay.test.js | DELETE | tests | D1 |
| tests/replay/replay-corpus.test.js | DELETE | tests | D1 |
| tests/replay/record-via.test.js | DELETE | tests | D1 |
| tests/replay/replay-tree-identity.test.js | DELETE | tests | D1 |
| tests/replay/*.js | DELETE | tests | D1: any remaining file under tests/replay |
| tests/fleet-reader/corpus-gaps.test.js | DELETE | tests | D1 |
| tests/fleet-reader/queries.test.js | MODIFY | tests | D2: drop `replayDebt` from the query list |
| tests/fleet-reader/review-fixes.test.js | MODIFY | tests | D2: drop `replayDebt` from the expected keys |
| tests/status/since-release.test.js | MODIFY | tests | AC-20261024-05-2 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261024-05-3 |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20261024-05-4 |
| tests/run-ledger.test.js | MODIFY | tests | AC-20261024-05-12 |
| tests/frontmatter/frontmatter.test.js | MODIFY | tests | drop `scripts/replay.js` from the consumers list (AC-20261024-05-1 forces it) |
| tests/consistency/base-derivation.test.js | MODIFY | tests | drop `replay.js` from the consumers list (AC-20261024-05-1 forces it) |
| tests/review/review-driver.fixtures.js | MODIFY | tests | comment-only: two comment lines naming `/spec:replay` (AC-20261024-05-1) |
| tests/worktree-hook.test.js | MODIFY | tests | comment-only: one comment line naming `/spec:replay` (AC-20261024-05-1) |
| tests/consistency/read-load.test.js | MODIFY | tests | D11: roster 15 → 14; `replay` leaves COMMAND_CEILING, BUDGET and SHARED_FOR |
| tests/consistency/entrypoints.test.js | MODIFY | tests | D11: comment-only — the live doctrine-key list drops the corpus key |
| spec/scripts/prototype-driver.js | MODIFY | scripts | D11: comment-only — doctor check 23 → 22 after D4's renumber |
| tests/consistency/replay-retired.test.js | CREATE | tests | AC-20261024-05-1, AC-20261024-05-5, AC-20261024-05-6, AC-20261024-05-7, AC-20261024-05-8, AC-20261024-05-9, AC-20261024-05-11 |

## Contracts

Identifiers that must have zero hits under `spec/`, `tests/`, `scripts/`, `README.md` and `.claude/spec.config.json` after this lands (the retired-feature vocabulary; the plain word `replay` is **not** in the list because the build stage's prototype REPLAY step uses it):

```
scripts/replay.js   replay-corpus   spec:replay   replayDueness   replayDebt   REPLAY_EVERY
isMeasurementReplay   lastMeasurementReplayIdx   corpusGaps   --audit-claims   inapplicableClasses   --replay
```

core.md § Feedback Loop, the replaced sentence, verbatim:

```
The **escape ledger** is the pipeline's one ground-truth signal.
```

ADR-0036 header shape (mirrors ADR-0035):

```
# 0036. Replay retired
- Status: accepted
- Date: 2026-10-24
- Deciders: JJ + session (specs/20261024/05-replay-retired.md)
- Applies to: ADR-0025 — superseded in full; specs/20260819/02, 20260819/03, 20260820/02, 20260821/02, 20260823/05, 20260823/09, 20260826/01, 20260831/01, 20260901/08, 20260909/02, 20260913/01 — their replay surfaces retired
- Amended by: —
```

## Behavior

- `/spec:status` footer prints `last released …` clauses as today and never a `replay due` clause.
- `spec-paths replay` prints the usage line to stderr and exits non-zero, like any unknown key.
- `review-legs.js … --replay` exits 2 naming the unknown argument.
- `fleet-reader --json` output keeps `population`, `escapes`, `cleanContradicted`, `legRecency`, `gate08`
  and has no `replayDebt` or `corpusGaps` key.
- `/spec:doctor` runs the same checks minus the replay audit; numbering is contiguous.
- The ledger's 38 historical `stage:"replay"` rows stay in `.claude/spec-runs.jsonl`; no reader
  interprets them, none deletes them.

## Acceptance Criteria

- **AC-20261024-05-1**: WHEN the test greps `spec/`, `tests/`, `scripts/`, `README.md` and `.claude/spec.config.json` for each identifier in Contracts THE SYSTEM SHALL find zero hits, and `spec/scripts/replay.js`, `spec/scripts/lib/replay-corpus.js`, `spec/commands/replay.md`, `spec/doctrine/replay-corpus.md`, `tests/replay/` and `tests/fleet-reader/corpus-gaps.test.js` SHALL not exist → writes tests/consistency/replay-retired.test.js
- **AC-20261024-05-2**: WHEN `lib/observation.js` is required THE SYSTEM SHALL export no `replayDueness`, and WHEN `spec-status.js` runs over a ledger with six review rows and no release row THE SYSTEM SHALL print a footer with no `replay due` clause → rewrites tests/status/since-release.test.js :: AC-20260913-09-5
- **AC-20261024-05-3**: WHEN `spec-paths replay` or `spec-paths replay-corpus` runs THE SYSTEM SHALL exit non-zero with the usage line, which SHALL not name either key → rewrites tests/spec-paths.test.js :: AC-20260819-02-10
- **AC-20261024-05-4**: WHEN `review-legs.js` runs with `--replay` THE SYSTEM SHALL exit 2 naming it as an unknown argument, and a normal run against the synthetic host SHALL write a `promise-sweep` manifest row → rewrites tests/review/review-legs.test.js :: AC-20260912-04-3
- **AC-20261024-05-5**: WHEN `fleet-reader.js --json` runs at this repo's root THE SYSTEM SHALL return an object with `escapes` and `population` keys and no `replayDebt` or `corpusGaps` key → writes tests/consistency/replay-retired.test.js
- **AC-20261024-05-6**: WHEN `spec-build-driver.js` and `spec/doctrine/stages/stage-build.md` are read THE SYSTEM SHALL still contain `--mark replayed` in both and `replay-state.json` in the driver (the prototype REPLAY step is untouched) → writes tests/consistency/replay-retired.test.js
  - build amendment (D10): the locked text required `replay-state.json` in stage-build.md too, which the pre-image never carried.
- **AC-20261024-05-7**: WHEN `spec/commands/doctor.md` is read THE SYSTEM SHALL contain no `Replay baseline-red honesty` check and its numbered checks SHALL be contiguous from 1 → writes tests/consistency/replay-retired.test.js
- **AC-20261024-05-8**: WHEN `spec/doctrine/core.md` § Feedback Loop is read THE SYSTEM SHALL contain the sentence `The **escape ledger** is the pipeline's one ground-truth signal.` and no `replay` token (case-insensitive) → writes tests/consistency/replay-retired.test.js
- **AC-20261024-05-9**: WHEN `node spec/scripts/ac-drift.js --root .` runs after the deletions THE SYSTEM SHALL exit 0 → writes tests/consistency/replay-retired.test.js
  - build amendment (D10): the locked text passed `--all-done`, a flag ac-drift.js does not take (it exits 2); ac-drift already scans every done spec.
- **AC-20261024-05-10**: WHEN every executable under `spec/scripts` and `spec/workflows` is listed THE SYSTEM SHALL CONTINUE TO find an `entrypoints.json` entry for each, and no entry for a file that does not exist → reuses tests/consistency/entrypoints.test.js :: AC-20260820-04-1: every executable
- **AC-20261024-05-11**: WHEN `docs/adr/0036-replay-retired.md` and `docs/adr/0025-replay-runs-on-demand.md` are read THE SYSTEM SHALL find the first with `Status: accepted` naming ADR-0025 in `Applies to`, and the second with `Amended by: ADR-0036` → writes tests/consistency/replay-retired.test.js
- **AC-20261024-05-12**: WHEN `spec/doctrine/stages/stage-review.md` is read THE SYSTEM SHALL CONTINUE TO carry no `REPLAY` token and no `replay-recorded` mention → reuses tests/run-ledger.test.js :: AC-20260821-02-8
  - build amendment (D10): the locked pointer verb was `rewrites`, which contradicts this criterion's CONTINUE TO and hard-stops red-check at gutted-rewrite.

## Assumptions (escalation triggers)

- A1: `lib/observation.js`'s `sinceLastRelease` and `readLedgerRows` have no dependency on the replay helpers (header lines 12–22 describe them as siblings) — **if false:** keep the minimal private helper the release derivation needs, unexported.
- A2: the `promise-sweep` leg runs cleanly in every non-replay legs invocation today (it was skipped only under `--replay`) — **if false:** nothing changes; the flag's removal only deletes the skip.
- A3: `tests/consistency/entrypoints.test.js` fails on an `entrypoints.json` entry whose file is absent, so a forgotten entry is caught — **if false:** AC-20261024-05-1's grep for `scripts/replay.js` catches the same omission.
- A4: `ac-drift.js` accepts `[retired: specs/20261024/05-replay-retired.md]` as a sanctioned orphan (header lines 12–20) — **if false:** STOP, ask whether to delete the orphaned bullets instead.
- A5: no host outside this repo runs `/spec:replay` or reads `fleet-reader`'s `replayDebt` — the user confirmed at lock; **if false:** the ADR names the version that removed it and the host upgrades past it knowingly.

## Rationale

The 2026-10-24 audit priced replay at 1,783 script lines, 4,550 test lines and about 29 KB
of doctrine, dormant for 40 days while 250 specs shipped. Core doctrine named its catch-rate
one of two ground-truth signals; in practice every status, report and audit read the escape
ledger. The user chose to retire it rather than carry it. ADR-0025 already moved replay from
a review state to an on-demand command; ADR-0036 is the second and final step of that line.

This spec is one landing unit of 22 source rows (six of them comment-only), over the ~12 guideline, because a feature
cannot be deleted half-green: removing the script alone leaves a command and two
`spec-paths` keys pointing at nothing, which the entrypoints and spec-paths tests catch
immediately. The hook exception (D8) is the one piece of dead code left in place: the hook
is a critical surface in every host's write path and the exception is unreachable without a
marker only the deleted script could plant.

Critical tier because `spec/bin/spec-paths` loses keys (Risk Tiers: a wrong key breaks
commands silently) and core doctrine changes; the user confirms the lock. The `[retired:]`
tags follow the mechanism `ac-drift` already honours so historical specs keep their ACs
with provenance rather than losing bullets.

Collision closure (literals `spec:replay`, `replay-corpus`, `replayDueness`, `replayDebt`,
`corpusGaps`, `audit-claims`): every live hit is a File Plan row above. Waived as historical
provenance, never edited: `docs/roadmap/19-escape-seeded-replay.md`,
`docs/roadmap/23-closed-feedback-loop.md`, `docs/adr/0025` beyond its backlink line, and every
`specs/**` file (their ACs receive `[retired:]` tags under D7, nothing else changes).
`docs/canonical/*` hits land through the Canonical Delta at review close.

Build departures (folded from the deviations sidecar, 2026-10-24): AC-6 and AC-9 described the
pre-image wrongly and AC-12's pointer verb contradicted its CONTINUE TO — all three corrected
under D10. The tests wave dropped the core Feedback Loop cadence case and the replay command's
entry-point assertion from `run-ledger.test.js`, and the `lastMeasurementReplayIdx` and footer
cases from `since-release.test.js`; their criteria carry `[retired:]` tags. The scripts worker
made `review-legs.js` name an unknown argument on stderr (AC-4 needed it), reworded the write
hook's BLOCKED hint line and two inline comments besides its header (text only; D8's logic
untouched), and dropped `escapes.registry` with the corpus crossing — restored by the session
as `{class, count}` under D11. Gate round 1 widened scope to `read-load.test.js`,
`entrypoints.test.js` and `prototype-driver.js` (D11, user-approved). Both doctrine and scripts
workers ran `git rm` on their own deletions (a Worker Git Ban breach with no harm: it only
staged the deletions this spec makes). Review: CLEAN, two softs (a garbled comment, a bare
block) fixed at close.

## Canonical Delta

docs/canonical/review.md: delete the "Replay" subsections (corpus regions, cadence,
scratch tree, `--select` pins, `--backfill-pins`, the `review-legs.js --replay` sentence) and
replace the signals sentence with "The escape ledger is the pipeline's one ground-truth
signal." docs/canonical/pipeline.md: drop the `replay.js` mentions in the base-derivation
consumers list and the `by-via` paragraph. docs/canonical/gate-integrity.md: delete the
"post-apply hook for replay" bullet. docs/canonical/scripts.md: drop `replay` from the
shared-helper consumer list.
