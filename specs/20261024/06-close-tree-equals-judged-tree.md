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
diff_base: 2702310b4db7f8363d17661fcaebea720334ea69
---

# The close tree equals the judged tree; softs are debt or ride a fix round

## Goal

Nothing lands after the reviewer's verdict unreviewed. Today that is guarded only when the
session declares it fixed a soft, and then only by a 60-line budget measured against a snapshot
that has needed two structural repairs in ten days. This spec makes the guard exact and
unconditional: `--mark closed` refuses any counted change between the committed close tree and
the judged tree, every time. The post-verdict fix window closes with it: a soft is recorded as
advisory debt when the verdict lands, or it rides a fix round the reviewer re-checks before the
verdict. The line ceiling, the sweep mark and its sweep file are deleted. Done means the close
refuses drift with no soft in play, a cleaned-up build directory the reviewer's legs left behind
is not drift, and no plugin script, doctrine file or canonical doc names a retired identifier.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--mark closed` always measures the committed close tree against the judged tree (`marks.judgedTree`, falling back to the close row's `diff.head`) with the overlay excludes unchanged (spec file, `docs/canonical/`, ledger, retained evidence, sidecar, deviations sidecar, agent memory, pipeline rules). One counted line or one binary change is a refusal, `close tree drifted from the judged tree`, naming the files and the revert command; the check runs after the dirty-tree check and before any mutation (AC-20261024-06-1, AC-20261024-06-2) | The guard today runs only when `softSweep.fixed >= 1`; a session that records every soft as debt, or has no softs, can commit anything before the close and nothing compares. An exact zero needs no tuned number. |
| D2 | The tally stays one library module, renamed `spec/scripts/lib/close-tree-drift.js` exporting `measureDrift(opts)` with the shape of today's `measureSweep`: a path counts only when tracked in the judged commit, in HEAD, or named by a fix-delta list (`alsoTracked`); everything else is reported under `skipped` and the driver prints one `ℹ close check ignored N path(s) tracked in neither the judged commit nor HEAD (reviewer-created, since cleaned)` line (AC-20261024-06-3, AC-20261024-06-4) | The judged tree is a working-tree snapshot and must stay one (an uncommitted hard fix's new file is judged code); the reviewer's own legs leave untracked build output in that same tree, and cleaning it is not a change to reviewed code. The fix-delta lists close the one gap: a fix round's new file is in neither commit and must still count when deleted. |
| D3 | The CLOSE step prints softs under `advisory — recorded as debt, none fixed here:` as `a<i> [soft] file:line — claim` and, when any print, the sentence `A soft worth fixing is a Direct-lane commit through the host gate after merge-back, or rides the next fix round; never a change before --mark closed.` The `0. Soft sweep` block, `--mark soft-swept`, `sweep.json`, `handleSoftSwept`, `SOFT_SWEEP_MAX_LINES` and `refuseOverSweepCeiling` are deleted; `--mark soft-swept` is an unknown mark and the unknown-mark message lists the seven remaining marks (AC-20261024-06-5, AC-20261024-06-6) | Seven close rows ever recorded a sweep, each fixing one to four softs; the whole post-verdict fix path exists for that. The Direct lane already is the sanctioned route for a one-sentence change on main. |
| D4 | The CLOSE verdict (the no-mark driver call that appends the close row and flips `status: done`) writes `### Advisory debt (review <runId>)` under `## Rationale`, one line per soft in the current return, `- a<i> file:line — claim`, through `withAdvisoryDebt` in the same spec-file write as the status flip; zero softs write nothing. `--mark closed` never writes the spec file. The close row carries no `softSweep` key and is never re-stamped; `restampCloseRowSweep` is deleted (AC-20261024-06-7, AC-20261024-06-8) | The debt must be in the tree the close commit carries: a write after `--mark closed` would leave the spec file dirty, `git worktree remove` refuses a dirty worktree and an uncommitted edit never reaches main through merge-back (A6, executed). The spec file is already an overlay exclude, so the write is never drift. The reviewer's claim is the debt line; the hand-written reason per soft was the sweep file's only content and nobody read it. |
| D5 | The DISPOSITIONS step keeps its `advisory (N, recorded, not dispositioned):` block and replaces its closing sentence with `softs may ride this fix round (same workers, same files); the fix-delta pass re-reviews whatever changed — never dispositioned here.`; the FIX step prints the current softs after its dispatch line under the same sentence. The disposer's pool, refs and the verdict arithmetic are unchanged — a soft never enters `dispositions`, and the driver never opens a fix round for softs alone (rejected alternative, Rationale) (AC-20261024-06-9, AC-20261024-06-11) | Fixing a soft is free when a fix round runs anyway and the reviewer re-checks the whole delta. Softs stay out of the pool so 20260909/04 D8/D9 keep holding; `soft-floor.test.js` pins the advisory heading verbatim (A7). |
| D6 | `spec/doctrine/stages/stage-review.md` § Dispositions and § Close replace the sweep wording with D3–D5; no doctrine file names a ceiling, a sweep mark or a sweep file (AC-20261024-06-10) | One binding home per rule (core § Doctrine Authoring); the retired words left standing would send a session to a mark that no longer exists. |
| D7 | `tests/review/soft-sweep.test.js` is deleted; its two incident cases (uncommitted 70-line hard fix accepted; gitignored tracked file kept in the snapshot) and the deviations-sidecar exclusion case are re-expressed in `tests/review/close-tree-drift.test.js` under this spec's AC-IDs; `tests/sweep-ceiling.test.js` is renamed `tests/close-tree-drift-measure.test.js` with the import and names updated, assertions intact; `tests/review/merge-concludes-to-done.test.js`'s mark-list assertion drops `soft-swept` (seven marks) and is co-tagged AC-20261024-06-6; every AC bullet of `specs/20261013/01-review-closes-its-own-softs.md` whose sole citing test is deleted here ends with `[retired: specs/20261024/06-close-tree-equals-judged-tree.md]` (AC-20261024-06-2, AC-20261024-06-3, AC-20261024-06-4, AC-20261024-06-6) | A refactor deletes the tests of what it retires and carries the cases that still bind; an assertion is moved, never weakened. `ac-drift.js` accepts a `[retired:]` tag only when it names a `specs/*.md` path. |
| D9 | Build-time scope additions (auto-picked, gate lines): `spec/agents/reviewer.md`'s severity calibration drops the ceiling wording (AC-20261024-06-10 sweep); `docs/canonical/review.md` takes the Canonical Delta at build, not at CLOSE, because AC-20261024-06-10 sweeps `docs/canonical/` and the build and review gates run before CLOSE; `tests/review/review-driver-close-expiry.test.js` and `tests/review/review-driver-close-refusals.test.js` land their config/script edits before the judged snapshot, since D1's refusal now fires first on drift they committed at close [no-ac: the existing pins in those files stay the oracle] | A refusal added where the old path was permissive strands shared setups (pipeline rules § Gotchas, seventh trigger); the fixtures now do what a real session does. |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; the paragraph names no retired identifier [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline (.claude/rules/spec-pipeline.md § Planning). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1: unconditional drift refusal at `--mark closed`; D3: CLOSE advisory block, `soft-swept` mark/handler/constant/ceiling deleted, seven-mark unknown-mark message; D4: debt written in the CLOSE verdict's spec write, close-row re-stamp deleted; D5: ride-along sentence at DISPOSITIONS and softs printed at FIX |
| spec/scripts/lib/sweep-ceiling.js | DELETE | scripts | D2: renamed |
| spec/scripts/lib/close-tree-drift.js | CREATE | scripts | D2: `measureDrift` — the moved module, header reworded for the exact check, no retired identifier |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D6: § Dispositions ride-along sentence, § Close advisory-debt wording; sweep/ceiling wording removed |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | D8 |
| tests/review/soft-sweep.test.js | DELETE | tests | D7: pins of the retired mark |
| tests/review/close-tree-drift.test.js | CREATE | tests | AC-20261024-06-1, AC-20261024-06-2, AC-20261024-06-5, AC-20261024-06-7, AC-20261024-06-9, AC-20261024-06-11 |
| tests/sweep-ceiling.test.js | DELETE | tests | D7: renamed |
| tests/close-tree-drift-measure.test.js | CREATE | tests | AC-20261024-06-3, AC-20261024-06-4 |
| tests/review/merge-concludes-to-done.test.js | MODIFY | tests | AC-20261024-06-6 (D7: the mark-list regex drops `soft-swept`) |
| tests/consistency/retired-flags.test.js | MODIFY | tests | AC-20261024-06-10 |
| spec/agents/reviewer.md | MODIFY | doctrine | D9: severity calibration drops the ceiling wording |
| docs/canonical/review.md | MODIFY | other | D9: the Canonical Delta applied at build |
| tests/review/review-driver-close-expiry.test.js | MODIFY | tests | D9: config edits land before the judged snapshot |
| tests/review/review-driver-close-refusals.test.js | MODIFY | tests | D9: config/script edits land before the judged snapshot |
| tests/review/review-driver-close-row.test.js | MODIFY | tests | AC-20261024-06-8 tag added to the reused test's title |
| specs/20261013/01-review-closes-its-own-softs.md | MODIFY | other | D7: AC-20261013-01-1 … -7 and -9 bullets end with `[retired: specs/20261024/06-close-tree-equals-judged-tree.md]` (-8 and -10 keep their live tests) |

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
`### Advisory debt (review <runId>)` block is written by the CLOSE verdict, in the same write as
`status: done`, with the line shape `- a<i> file:line — claim`; `--mark closed` writes nothing to
the spec file.

Driver marks: `soft-swept` is removed from the accepted mark list; the unknown-mark message reads
`(skips-extracted | reviewer-returned | dispositions | fix-applied | closed | merge-strategy | conflicts-resolved)`.

Driver refusal (exit 2, side-effect-free): `close tree drifted from the judged tree: <N> changed
line(s)[ plus a binary change] vs judged <sha7> — revert (git checkout <judgedTree> -- <files>),
re-commit, then re-run \`node … --mark closed\``.

## Behavior

- Close with no softs, nothing committed after the verdict: `--mark closed` measures zero drift,
  accepts, re-stamps nothing.
- Close with no softs, the session committed a 3-line edit after the verdict: refused with
  `close tree drifted from the judged tree: 3 changed line(s) vs judged <sha7>` and
  `git checkout <judgedTree> -- <files>`; nothing written. Re-commit and re-mark passes.
- Close after a 70-line hard fix that stayed uncommitted through `fix-applied` and was committed
  only with the close commit: zero drift (the fix is in the snapshot), accepted.
- Close after the reviewer's legs left a build directory of untracked files that the session
  deleted before the close commit: the tally skips them, one `ℹ` line names the count, accepted.
- Close where the session deleted a file a fix round had created: that path is in the fix-delta
  list, counts as drift, refused.
- CLOSE verdict with two softs: the spec file on disk now carries `status: done` and, under
  `## Rationale`, `### Advisory debt (review <runId>)` with two `- a<i> …` lines; the CLOSE step
  then prints the advisory block with `a0`, `a1` and the Direct-lane sentence; it never prints
  `--mark soft-swept`, `sweep.json` or a line count. The close commit carries the debt; an
  accepted `--mark closed` leaves the spec file and the close row untouched.
- DISPOSITIONS and FIX steps with one hard and two softs: the hard pool prints as today; the
  advisory heading prints as today; the two softs print under the ride-along sentence at both
  steps; a disposer return naming `a0` is still refused by the existing pool check.

## Acceptance Criteria

- **AC-20261024-06-1**: WHEN `--mark closed` runs with no soft in the return and the close commit changed 3 lines of a tracked file outside the overlay excludes THE SYSTEM SHALL exit 2 with `close tree drifted from the judged tree: 3 changed line(s)`, name the file and the `git checkout <judgedTree> -- <file>` remedy, and leave the ledger, the spec file and `review-state.json` byte-identical → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-2**: WHEN a 70-line hard fix is left uncommitted through `fix-applied` and committed only with the close commit THE SYSTEM SHALL CONTINUE TO accept `--mark closed` (zero drift against the judged tree snapshot) → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-3**: WHEN the judged tree snapshot holds untracked, non-ignored files absent from the judged commit and from HEAD THE SYSTEM SHALL report them under `skipped` and count zero lines for them, while a tracked file deleted, a tracked file edited and a new file committed since the snapshot are all counted → writes tests/close-tree-drift-measure.test.js
- **AC-20261024-06-4**: WHEN a path in neither commit is named in `alsoTracked` and the close commit deleted it THE SYSTEM SHALL count its lines as drift and never list it under `skipped` → writes tests/close-tree-drift-measure.test.js
- **AC-20261024-06-5**: WHEN the CLOSE step prints for a return of two softs THE SYSTEM SHALL print `advisory — recorded as debt, none fixed here:` followed by `a0` then `a1` and the Direct-lane sentence, and SHALL NOT print `--mark soft-swept`, `sweep.json` or `changed lines` → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-6**: WHEN `--mark soft-swept --file x.json` is invoked THE SYSTEM SHALL exit 2 as an unknown mark whose message lists exactly `(skips-extracted | reviewer-returned | dispositions | fix-applied | closed | merge-strategy | conflicts-resolved)` → rewrites tests/review/merge-concludes-to-done.test.js :: AC-20260913-09-2
- **AC-20261024-06-7**: WHEN the CLOSE verdict flips a spec to `status: done` with two softs in the current return THE SYSTEM SHALL have written, in that same spec-file write, `### Advisory debt (review <runId>)` under `## Rationale` with exactly two lines `- a0 <file>:<line> — <claim>` and `- a1 …`, the following accepted `--mark closed` SHALL leave the spec file byte-identical, and the close row SHALL carry no `softSweep` key → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-8**: WHEN the CLOSE verdict flips a spec to `status: done` with zero softs and the session marks closed THE SYSTEM SHALL CONTINUE TO leave the close row byte-identical to what verdict.js wrote and SHALL CONTINUE TO write no `### Advisory debt` heading → reuses tests/review/review-driver-close-row.test.js :: AC-20260820-07-6
- **AC-20261024-06-9**: WHEN the DISPOSITIONS step and then the FIX step print for one hard and two softs THE SYSTEM SHALL print, at each step, the two softs under `softs may ride this fix round (same workers, same files); the fix-delta pass re-reviews whatever changed`, keep the `advisory (2, recorded, not dispositioned):` heading at DISPOSITIONS, and print `Softs are swept at CLOSE` at neither → writes tests/review/close-tree-drift.test.js
- **AC-20261024-06-10**: WHEN `spec/scripts/`, `spec/doctrine/`, `spec/commands/`, `spec/agents/`, `spec/templates/` and `docs/canonical/` are searched for `SOFT_SWEEP_MAX_LINES`, `soft-swept`, `handleSoftSwept`, `refuseOverSweepCeiling`, `restampCloseRowSweep`, `softSweep`, `measureSweep` and `sweep-ceiling` THE SYSTEM SHALL return zero hits → writes tests/consistency/retired-flags.test.js
- **AC-20261024-06-11**: WHEN a disposer return's entry names `a0` against a return of one hard and two softs THE SYSTEM SHALL CONTINUE TO refuse it as matching nothing in the pools → writes tests/review/close-tree-drift.test.js

## Assumptions (escalation triggers)

- A1 (verified 2026-10-24): the close row is appended and `marks.judgedTree` pinned before the CLOSE verdict's spec-file write (status flip, and now the debt block), and the spec file is an overlay exclude, so the snapshot never reads the overlay as drift — `spec-review-driver.js` pins `marks.judgedTree = snapshotTree()` after `appendLedger` and before `fs.writeFileSync(resolvedSpecPath, …)` — **if false:** the drift check reads non-zero on every close; STOP and re-order the close-row append in a spike before building.
- A2 (verified 2026-10-24): `withAdvisoryDebt` splices out an existing block for the same runId before writing, so a CLOSE verdict re-run writes the block once — **if false:** dedupe on the `a<i>` prefix inside the block.
- A3 (verified 2026-10-24): no host ledger reader consumes `softSweep` — `grep -c softSweep` over `spec/scripts/verdict.js`, `spec/scripts/spec-status.js`, `spec/scripts/fleet-reader.js` = 0, 0, 0 — **if false:** keep the key as `{fixed: 0, debt: N}` for one release and queue its removal.
- A4 (false, applied 2026-10-24): `tests/review/merge-concludes-to-done.test.js` asserts the eight-mark list positively (`/\(skips-extracted \| … \| soft-swept \| closed \| …\)/`), so it is a File Plan MODIFY row and AC-20261024-06-6's `rewrites` target; `tests/review/review-driver-close-row.test.js` mentions `softSweep`/`soft-swept` only in negative assertions that stay green — **if a third test proves to assert the list:** add it as a MODIFY row at build, never weaken it.
- A5: the Canonical Delta names none of the retired identifiers, so AC-20261024-06-10's zero-hit sweep over `docs/canonical/` stays green after the Delta is applied — **if false:** reword the Delta, never widen the sweep's scope.
- A6 (executed 2026-10-24, git 2.54.0): in a fresh repo with a linked worktree, appending one line to a tracked file in the worktree and running `git worktree remove <wt>` → `fatal: '<wt>' contains modified or untracked files, use --force to delete it` (exit 128); merging the worktree's branch into main afterwards → the appended line is absent from main (grep count 0). Debt written after the close commit would therefore be stranded; D4 writes it before — **if false:** D4's timing could stay at the accepted mark; it does not.
- A7 (verified 2026-10-24): `tests/review/soft-floor.test.js` pins the literal `advisory (1, recorded, not dispositioned):` at DISPOSITIONS (AC-20260909-04-6), so D5 keeps that heading and changes only the closing sentence — **if false:** D5 may reword the heading; it does not need to.

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

Where the debt is written moved during planning. The first draft appended it at an accepted
`--mark closed`, after the close commit. That leaves the spec file dirty in a worktree review:
git refuses to remove the worktree and merge-back carries only commits, so the debt would never
reach main (A6, executed). The CLOSE verdict already rewrites the spec file to flip its status;
the debt block rides that same write, lands in the close commit, and the spec file's standing
exclude keeps it out of the drift tally.

Where softs go instead: a soft that rides a fix round costs nothing extra and is re-reviewed by
the fix-delta pass; a soft that does not is recorded and, if worth fixing, is a Direct-lane
commit through the host gate after merge-back. Rejected: a dedicated re-check round for soft
fixes at close (the second opinion's option B) — it keeps every layer the ceiling needed, adds a
driver state, a sidecar mark and a return file, and must run the Fable reviewer seat to keep the
different-family invariant, all for a path used seven times. Rejected: a fix round opened for
softs alone — it spends one of the two capped fix iterations on advisory findings. Rejected:
letting the disposer disposition softs as `fix|debt` — it reopens 20260909/04 D8/D9 and changes
the verdict pool arithmetic for the same gain the ride-along sentence gives for free. Reopen
condition for any of the three: Advisory debt blocks across readable ledgers whose softs were
never fixed exceed 30 in 90 days.

Collision closure (literals leg) waives: `docs/canonical/review.md` — planned for the Canonical
Delta at CLOSE, moved into the build by D9 because AC-20261024-06-10 sweeps it before CLOSE; `tests/review/review-driver-close-row.test.js`
— its `soft-swept`/`softSweep` hits are negative assertions that stay green, and AC-20261024-06-8
reuses its zero-soft close test with the AC-ID tag the build adds. Every other literals hit is a
File Plan row.

Build deviations (one-offs, folded at close): the reused zero-soft close test gained the
AC-20261024-06-8 tag in its title only, no assertion change; the measure test was created as a
copy of the old ceiling test with import and names switched, and the old file deleted with its
module; the AC-20261024-06-2 and -11 cases are CONTINUE-TO pins and passed on the pre-image by
design; the close-expiry and close-refusals fixtures (D9) now land their gate/test command edits
and `always-red.sh` before the verdict call that pins the judged tree, with no path excluded and
no AC tag changed. The running review driver for this spec's own close was the installed
pre-change one, so its three softs were recorded through the retired sweep mark as debt.

### Advisory debt (review rv_e9bcdc40f01d)
- a0 tests/review/review-driver-close-row.test.js:30 — AC-20261024-06-8 promises the zero-soft CLOSE verdict writes no `### Advisory debt` heading, but the reused test asserts nothing about the heading's absence; behavior holds by construction, so the clause is uncovered, not defective. — this spec retires post-verdict fixes; add the absence assertion as a Direct-lane commit after merge-back
- a1 spec/scripts/spec-review-driver.js:1156 — Driver comment still narrates the retired ceiling as prior behavior. — this spec retires post-verdict fixes; drop the prior-behavior comment as a Direct-lane commit after merge-back
- a2 tests/review/review-driver-close-refusals.test.js:205 — In review-driver-close-refusals.test.js the AC-20260830-02-1 case moved the always-red.sh/gateCommand edit above reviewer-returned but left the comment describing the old placement. — this spec retires post-verdict fixes; reword the stale fixture comment as a Direct-lane commit after merge-back

## Canonical Delta

docs/canonical/review.md, the paragraph beginning `Softs do not leave the review by hand`
(cited to specs/20261013/01): replace with "Softs are advisory to the end. At DISPOSITIONS and
FIX they print after the hard pool and may ride the fix round the same workers run; the fix-delta
pass re-reviews whatever changed. The CLOSE verdict writes one `- a<i> file:line — claim` line per
soft under the spec's `## Rationale` as `### Advisory debt (review <runId>)`, in the same write
that flips the status, so the debt rides the close commit; the CLOSE step prints the softs under
an advisory heading. A soft worth fixing after close is a Direct-lane commit through the host
gate. `--mark closed` always measures the committed close tree against the judged tree snapshot
(overlay paths excluded; paths tracked in neither the judged commit nor HEAD nor a fix-delta list
are reviewer-created and skipped) and refuses any counted line or binary change with
`close tree drifted from the judged tree`. The close row is never re-stamped after verdict.js
writes it. (specs/20261024/06-close-tree-equals-judged-tree.md)"
