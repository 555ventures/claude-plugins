---
date: 2026-10-24
status: draft
tier: standard
area: review
breaking: false
depends_on: []
brief: n/a
---

# The close tree equals the judged tree; softs are debt or ride a fix round

## Goal

Nothing lands after the reviewer's verdict unreviewed. Today that is guarded only when the
session declares it fixed a soft, and then only by a 60-line budget measured against a snapshot
that has needed two structural repairs in ten days. This spec makes the guard exact and
unconditional: `--mark closed` refuses any counted change between the committed close tree and
the judged tree, every time. The post-verdict fix window closes with it: a soft is recorded as
advisory debt at close, or it rides a fix round the reviewer re-checks before the verdict. The
line ceiling, the sweep mark and its sweep file are deleted. Done means the close refuses drift
with no soft in play, a cleaned-up build directory the reviewer's legs left behind is not drift,
and no plugin file names a ceiling or a sweep.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--mark closed` always measures the committed close tree against the judged tree (`marks.judgedTree`, falling back to the close row's `diff.head`) with the overlay excludes unchanged (spec file, `docs/canonical/`, ledger, retained evidence, sidecar, deviations sidecar, agent memory, pipeline rules). One counted line or one binary change is a refusal, `close tree drifted from the judged tree`, naming the files and the revert command; the check runs after the dirty-tree check and before any mutation (AC-20261024-06-1, AC-20261024-06-2) | The guard today runs only when `softSweep.fixed >= 1`; a session that records every soft as debt, or has no softs, can commit anything before the close and nothing compares. An exact zero needs no tuned number. |
| D2 | The tally stays one library module, renamed `spec/scripts/lib/close-tree-drift.js` exporting `measureDrift(opts)` with the shape of today's `measureSweep`: a path counts only when tracked in the judged commit, in HEAD, or named by a fix-delta list (`alsoTracked`); everything else is reported under `skipped` and the driver prints one `ℹ close check ignored N path(s) tracked in neither the judged commit nor HEAD (reviewer-created, since cleaned)` line (AC-20261024-06-3, AC-20261024-06-4) | The judged tree is a working-tree snapshot and must stay one (an uncommitted hard fix's new file is judged code); the reviewer's own legs leave untracked build output in that same tree, and cleaning it is not a change to reviewed code. The fix-delta lists close the one gap: a fix round's new file is in neither commit and must still count when deleted. |
| D3 | The CLOSE step prints softs under `advisory — recorded as debt, none fixed here:` as `a<i> [soft] file:line — claim` and, when any print, the sentence `A soft worth fixing is a Direct-lane commit through the host gate after merge-back, or rides the next fix round; never a change before --mark closed.` The `0. Soft sweep` block, `--mark soft-swept`, `sweep.json`, `handleSoftSwept`, `SOFT_SWEEP_MAX_LINES` and `refuseOverSweepCeiling` are deleted; `--mark soft-swept` is an unknown mark (AC-20261024-06-5, AC-20261024-06-6) | Seven close rows ever recorded a sweep, each fixing one to four softs; the whole post-verdict fix path exists for that. The Direct lane already is the sanctioned route for a one-sentence change on main. |
| D4 | At an accepted `--mark closed` the driver appends `### Advisory debt (review <runId>)` under `## Rationale` with one line per soft in the current return, `- a<i> file:line — claim`, reusing `withAdvisoryDebt`; a return with zero softs appends nothing. The close row carries no `softSweep` key and is never re-stamped; `restampCloseRowSweep` is deleted (AC-20261024-06-7, AC-20261024-06-8) | The reviewer's claim is the debt line; a hand-written reason per soft was the sweep file's only content and nobody read it. The ledger row stays byte-identical to what verdict.js wrote, which `review-driver-close-row.test.js` already pins for the zero-soft case. |
| D5 | The DISPOSITIONS step and the FIX step print the current softs after the hard pool under `softs may ride this fix round (same workers, same files); the fix-delta pass re-reviews whatever changed:`; the disposer's pool, refs and the verdict arithmetic are unchanged — a soft never enters `dispositions` (AC-20261024-06-9) | Fixing a soft is free when a fix round runs anyway and the reviewer re-checks the whole delta; a soft-only fix round is not offered (it would spend one of two fix iterations on advisory findings). Softs stay out of the pool so 20260909/04 D8/D9 keep holding. |
| D6 | `spec/doctrine/stages/stage-review.md` § Dispositions and § Close, and the disposer step text, replace the sweep wording with D3–D5; no doctrine file names a ceiling, a sweep mark or a sweep file (AC-20261024-06-10) | One binding home per rule (core § Doctrine Authoring); the retired words left standing would send a session to a mark that no longer exists. |
| D7 | `tests/review/soft-sweep.test.js` is deleted; its two incident cases (uncommitted 70-line hard fix accepted; gitignored tracked file kept in the snapshot) and the deviations-sidecar exclusion case are re-expressed in `tests/review/close-tree-drift.test.js` under this spec's AC-IDs; `tests/sweep-ceiling.test.js` is renamed `tests/close-tree-drift-measure.test.js` with the import and names updated, assertions intact (AC-20261024-06-2, AC-20261024-06-3, AC-20261024-06-4) | A refactor deletes the tests of what it retires and carries the cases that still bind; an assertion is moved, never weakened. |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline (.claude/rules/spec-pipeline.md § Planning). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1: unconditional drift refusal at `--mark closed`; D3: CLOSE advisory block, `soft-swept` mark/handler/constant/ceiling deleted; D4: debt appended at accepted close, close-row re-stamp deleted; D5: ride-along sentence at DISPOSITIONS and FIX |
| spec/scripts/lib/sweep-ceiling.js | DELETE | scripts | D2: renamed |
| spec/scripts/lib/close-tree-drift.js | CREATE | scripts | D2: `measureDrift` — the moved module, header reworded for the exact check |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D6: § Dispositions ride-along sentence, § Close advisory-debt wording; sweep/ceiling wording removed |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | D8 |
| tests/review/soft-sweep.test.js | DELETE | tests | D7: pins of the retired mark |
| tests/review/close-tree-drift.test.js | CREATE | tests | AC-20261024-06-1, AC-20261024-06-2, AC-20261024-06-5, AC-20261024-06-6, AC-20261024-06-7, AC-20261024-06-8, AC-20261024-06-9 |
| tests/sweep-ceiling.test.js | DELETE | tests | D7: renamed |
| tests/close-tree-drift-measure.test.js | CREATE | tests | AC-20261024-06-3, AC-20261024-06-4 |
| tests/consistency/retired-flags.test.js | MODIFY | tests | AC-20261024-06-10 |
| specs/20261013/01-review-closes-its-own-softs.md | MODIFY | other | D7: every AC pointer whose sole citing test is deleted here gets `[retired: specs/20261024/06]` at the end of its bullet |

## Contracts

`spec/scripts/lib/close-tree-drift.js`:

```js
// measureDrift({ repoRoot, judgedTree, judgedCommit, alsoTracked, excludes, run })
//   → { total: number, binary: boolean, files: string[], skipped: string[] }
// judgedTree: 40-hex tree sha (the working-tree snapshot pinned at the close-row append)
// judgedCommit: 40-hex commit sha or null (the close row's diff.head)
// alsoTracked: repo-relative paths that count even when in neither commit (fix-delta lists)
// excludes: repo-relative paths/prefixes → `:(exclude)` pathspecs
// run: the caller's runChild
// throws Error on a failing `git diff`
```

Sidecar (`<spec>.review/review-state.json`): `marks.judgedTree` unchanged; `marks.softSweep` is
never written. Ledger: the review close row has no `softSweep` key. Spec file: the
`### Advisory debt (review <runId>)` block's line shape becomes `- a<i> file:line — claim`.

Driver marks: `soft-swept` is removed from the accepted mark list; the unknown-mark message lists
`fix-applied | closed | merge-strategy | conflicts-resolved` in its place.

## Behavior

- Close with no softs, nothing committed after the verdict: `--mark closed` measures zero drift,
  accepts, appends no debt, re-stamps nothing.
- Close with no softs, the session committed a 3-line edit after the verdict: refused with
  `close tree drifted from the judged tree: 3 changed line(s) vs judged <sha7>` and
  `git checkout <judgedTree> -- <files>`; nothing written. Re-commit and re-mark passes.
- Close after a 70-line hard fix that stayed uncommitted through `fix-applied` and was committed
  only with the close commit: zero drift (the fix is in the snapshot), accepted.
- Close after the reviewer's legs left a build directory of untracked files that the session
  deleted before the close commit: the tally skips them, one `ℹ` line names the count, accepted.
- Close where the session deleted a file a fix round had created: that path is in the fix-delta
  list, counts as drift, refused.
- CLOSE step with two softs: prints the advisory block with `a0`, `a1` and the Direct-lane
  sentence; never prints `--mark soft-swept`, `sweep.json` or a line count. An accepted
  `--mark closed` then appends two debt lines under `## Rationale`.
- DISPOSITIONS and FIX steps with one hard and two softs: the hard pool prints as today; the two
  softs print after it under the ride-along sentence; a disposer return naming `a0` is still
  refused by the existing pool check.

## Acceptance Criteria

- **AC-20261024-06-1**: WHEN `--mark closed` runs with no soft in the return and the close commit changed 3 lines of a tracked file outside the overlay excludes THE SYSTEM SHALL exit 2 with `close tree drifted from the judged tree: 3 changed line(s)`, name the file and the `git checkout <judgedTree> -- <file>` remedy, and leave the ledger, the spec file and `review-state.json` byte-identical → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-2**: WHEN a 70-line hard fix is left uncommitted through `fix-applied` and committed only with the close commit THE SYSTEM SHALL CONTINUE TO accept `--mark closed` (zero drift against the judged tree snapshot) → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-3**: WHEN the judged tree snapshot holds untracked, non-ignored files absent from the judged commit and from HEAD THE SYSTEM SHALL report them under `skipped` and count zero lines for them, while a tracked file deleted, a tracked file edited and a new file committed since the snapshot are all counted → writes tests/close-tree-drift-measure.test.js
- **AC-20261024-06-4**: WHEN a path in neither commit is named in `alsoTracked` and the close commit deleted it THE SYSTEM SHALL count its lines as drift and never list it under `skipped` → writes tests/close-tree-drift-measure.test.js
- **AC-20261024-06-5**: WHEN the CLOSE step prints for a return of two softs THE SYSTEM SHALL print `advisory — recorded as debt, none fixed here:` followed by `a0` then `a1` and the Direct-lane sentence, and SHALL NOT print `--mark soft-swept`, `sweep.json` or `changed lines` → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-6**: WHEN `--mark soft-swept --file x.json` is invoked THE SYSTEM SHALL exit 2 as an unknown mark whose message lists the accepted marks without `soft-swept` → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-7**: WHEN `--mark closed` is accepted with two softs in the return THE SYSTEM SHALL have appended `### Advisory debt (review <runId>)` under `## Rationale` with exactly two lines `- a0 <file>:<line> — <claim>` and `- a1 …`, and the close row SHALL carry no `softSweep` key → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-8**: WHEN `--mark closed` is accepted with zero softs THE SYSTEM SHALL CONTINUE TO leave the close row byte-identical to what verdict.js wrote and append no debt heading → reuses tests/review/review-driver-close-row.test.js
- **AC-20261024-06-9**: WHEN the DISPOSITIONS step prints for one hard and two softs THE SYSTEM SHALL print the hard pool as `s0` and then the two softs under `softs may ride this fix round`, and a disposer return whose entry names `a0` SHALL CONTINUE TO be refused as matching nothing in the pools → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-10**: WHEN `spec/` and `docs/canonical/` are searched for `SOFT_SWEEP_MAX_LINES`, `soft-swept`, `handleSoftSwept`, `refuseOverSweepCeiling`, `restampCloseRowSweep`, `softSweep` and `sweep-ceiling` THE SYSTEM SHALL return zero hits → writes tests/consistency/retired-flags.test.js

## Assumptions (escalation triggers)

- A1: the close row is appended and `marks.judgedTree` pinned before the session's close commit, so the snapshot never contains the Canonical Delta or the status flip and the excludes list is the only overlay — **if false:** the drift check reads non-zero on every close; STOP and re-order the close-row append in a spike before locking.
- A2: `withAdvisoryDebt` rewrites the block for the same runId idempotently, so a refused-then-accepted close appends once — **if false:** dedupe on the `a<i>` prefix inside the block.
- A3: no host ledger reader consumes `softSweep` (fleet-reader, spec-status, verdict.js grep zero at plan time) — **if false:** keep the key as `{fixed: 0, debt: N}` for one release and queue its removal.
- A5: the Canonical Delta names none of the retired identifiers, so AC-20261024-06-10's zero-hit sweep over `docs/canonical/` stays green after the Delta is applied — **if false:** reword the Delta, never widen the sweep's waived prefixes.
- A4: `tests/review/merge-concludes-to-done.test.js` mentions `softSweep` only in a comment or a negative assertion — **if false:** add it to the File Plan as MODIFY, tests layer.

## Rationale

Two incidents in ten days hit the same guard from opposite sides. On 2026-10-14 the ceiling
measured the judged commit instead of the judged working tree and counted an uncommitted hard fix
as sweep lines. On 2026-10-24 the snapshot that fixed that captured 319 files of build output
the reviewer's own legs had created in a host that never gitignored them; cleaning them before
the close read as 111,348 deleted lines and a correct close was refused. The repair for the
second (count only paths tracked on a committed side) shipped the same day under the Incident
Policy. A second-opinion read of the driver then found the larger defect: the ceiling runs only
when the session itself says it fixed a soft. With every soft recorded as debt, or with no softs
at all, nothing compares the close commit to the judged tree. The post-verdict window was open by
default and the 60-line budget guarded the one path that opted in.

The industry rule is simpler and this spec adopts it: any change after approval dismisses the
approval. Here that is one exact check, zero drift, always. The snapshot and the tracked-path
filter stay because both are exact; only the tuned number and the opt-in go. The sweep machinery
built on 2026-10-13 (20261013/01) goes with them because its usage never justified it: seven close
rows ever, one to four softs each, and the debt reasons it collected were never read back.

Where softs go instead: a soft that rides a fix round costs nothing extra and is re-reviewed by
the fix-delta pass; a soft that does not is recorded and, if worth fixing, is a Direct-lane
commit through the host gate after merge-back. Rejected: a dedicated re-check round for soft
fixes at close (the second opinion's option B) — it keeps every layer the ceiling needed, adds a
driver state, a sidecar mark and a return file, and must run the Fable reviewer seat to keep the
different-family invariant, all for a path used seven times. Rejected: letting the disposer
disposition softs as `fix|debt` — it reopens 20260909/04 D8/D9 and changes the verdict pool
arithmetic for the same gain the ride-along sentence gives for free. Reopen condition for either:
Advisory debt blocks across readable ledgers whose softs were never fixed exceed 30 in 90 days.

## Canonical Delta

docs/canonical/review.md, the paragraph beginning `Softs do not leave the review by hand`
(cited to specs/20261013/01): replace with "Softs are advisory to the end. At DISPOSITIONS and
FIX they print after the hard pool and may ride the fix round the same workers run; the fix-delta
pass re-reviews whatever changed. At CLOSE they print under an advisory heading and an accepted
`--mark closed` appends one `- a<i> file:line — claim` line per soft under the spec's
`## Rationale` as `### Advisory debt (review <runId>)`. A soft worth fixing after close is a
Direct-lane commit through the host gate. `--mark closed` always measures the committed close tree
against the judged tree snapshot (overlay paths excluded; paths tracked in neither the judged
commit nor HEAD nor a fix-delta list are reviewer-created and skipped) and refuses any counted
line or binary change with `close tree drifted from the judged tree`. The close row is never
re-stamped after verdict.js writes it. (specs/20261024/06-close-tree-equals-judged-tree.md)"
