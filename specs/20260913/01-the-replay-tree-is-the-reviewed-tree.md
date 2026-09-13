---
date: 2026-09-13
status: done
tier: standard
area: replay
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-13
build_base: main
open_markers: 0
diff_base: 7f982694adf93c9919a2e83f69ff79a8ccab111c
---

# The replay tree is the reviewed tree

## Goal

A review records the two commits that bound what it judged, as git refs that survive a
rebasing merge-back and garbage collection, and the replay harness reads those refs instead of
reconstructing the pair from history. Today `--select` identifies the close commit by asking
which commit most recently touched the spec FILE — an answer that drifts to an unrelated commit
as soon as anything else edits that doc — and takes its first parent as the tree to stand up;
`--setup` then prints a success line over whatever that produced. Done means: no history
derivation remains on the selection path, a review row that cannot name its own bounds is a
named refusal rather than a guess, and a scratch tree that fails the target's own coverage
check ends the setup with a diagnosis instead of a success line.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec-review-driver.js` writes two refs per review — `refs/spec-review/<runId>/judged` at the close-row write, pointing at the same sha it stamps as the row's `diff.head`, and `refs/spec-review/<runId>/close` at `--mark closed`, pointing at the close commit that now exists. Both writes are best-effort: a failure prints one warning line and never blocks the close, the mark, or the row (AC-20260913-01-1, AC-20260913-01-2) | The pipeline has been reconstructing, after the fact, a pair of commits it was holding in its hand at the time; a ref is the cheapest way to stop reconstructing, and it also makes a rebase-orphaned commit permanently reachable and gc-safe. |
| D2 | `--select` emits `parent=` from the run's `judged` ref, falling back to the row's `diff.head` when no ref exists, and `commit=` from the run's `close` ref with no fallback; the `git log -1 --format=%H -- <spec>` + `rev-parse <sha>^` derivation is DELETED, not demoted (AC-20260913-01-3, AC-20260913-01-4) | The log question answers "what last touched this file", which is a different question that silently stops matching; the refs answer the real one directly. |
| D3 | A selected row with neither a `judged` ref nor a `diff.head` that `git rev-parse --verify <sha>^{commit}` resolves, or with no `close` ref, is exit 4 naming the row's `runId`, the spec, and the `--backfill-pins` remedy, with nothing on stdout; there is no path on which `--select` emits a partial or placeholder pair (AC-20260913-01-5) | Guessing a commit is the defect this spec removes, and a half-identified range would measure a tree the review never saw. |
| D4 | `replay.js --backfill-pins` writes the two refs for every historical CLEAN review row where they are derivable — `judged` from a resolvable `diff.head`, `close` from the oldest commit reachable from HEAD that is a strict descendant of it and whose copy of the spec matches `^status: done$` — printing one line per row, never overwriting an existing ref, and exiting 0 even when some rows are underivable (AC-20260913-01-6) | The history walk is a legitimate one-time reconstruction for the backlog and an illegitimate hot path; confining it to an auditable run-once mode is what keeps it from becoming a second permanent derivation. |
| D5 | After the worktree stands up and after any `--overlay` commit, `--setup` verifies the tree carries the target's work by running `ac-matrix.js` against `{dir}` — resolved as a `__dirname` sibling, never through `spec-paths`, with its `--manifest` written to an OS temp path outside `{dir}` — and exits 5 with a named diagnosis and no `setup dir=` line on ANY outcome but exit 0, a findings exit 1 and a usage/unreadable-spec exit 2 alike, never a leniency arm; verification runs only when `--spec` was supplied (AC-20260913-01-7, AC-20260913-01-8) | Every CLEAN review recorded `ac-matrix` exit 0, so re-deriving it on the reassembled tree is a free deterministic check that the reassembly held — and refusing is the point: the harness must never print success over a tree missing the spec's work. |
| D6 | `--setup`'s `--overlay` refusal narrows from "not a strict descendant of `--commit`" to "equal to `--commit`, or an ancestor of it"; an unrelated sha is accepted (AC-20260913-01-9, AC-20260913-01-11) | A rebasing merge-back legitimately leaves the close commit off the judged commit's line of descent, and `git diff <a> <b>` is well-defined for any two commits — while the equal/ancestor refusal that stops the overlay reverting the work is kept intact. |
| D7 | `/spec:replay` Phase 1 routes a `--setup` exit 5 to `--teardown --dir {dir}` then `--record --outcome setup-failed --legs pristine-red:ac-matrix`, and Phase 0 routes a `--select` exit 4 by reporting the blockage and running `--backfill-pins` before retrying once [no-ac: doctrine prose routing only; the exit codes it routes on are pinned by AC-20260913-01-5 and AC-20260913-01-7] | The existing non-measurement route already leaves the window due and retires an irreproducible target; exit 5 reaches it at setup rather than after three leg runs and a session judgment. |
| D8 | `.claude/rules/spec-pipeline.md` § Gotchas records the class as a FOURTH trigger on the existing `diff_base`-staleness entry rather than a new bullet [no-ac: doctrine prose, no runtime surface; the section is at its read-load cap and this is the same family — a stamped or derived range that stops describing the build] | A harness that identifies a commit by "newest commit touching this path" is the same defect as a base pin going stale, and the section has no slack for a sixteenth entry. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1: best-effort `judged` ref at the close-row write and `close` ref at `--mark closed`, neither able to block the close |
| spec/scripts/replay.js | MODIFY | scripts | D2, D3, D5, D6: ref-sourced `--select`, the exit-4 refusal, `--setup`'s post-overlay verification and new exit 5, the narrowed overlay refusal; D4's new `--backfill-pins` mode; header `Exit codes:` list gains 5 |
| spec/commands/replay.md | MODIFY | doctrine | D7: Phase 0's exit-4 backfill route, Phase 1's exit-5 route to teardown + `--record --outcome setup-failed --legs pristine-red:ac-matrix` |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | D8: fourth trigger folded into the existing `diff_base`-staleness Gotchas entry |
| spec/.claude-plugin/plugin.json | MODIFY | other | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` — never hand-edited |
| tests/review/review-driver-close-row.test.js | MODIFY | tests | AC-20260913-01-1, AC-20260913-01-2 |
| tests/replay/replay-tree-identity.test.js | CREATE | tests | AC-20260913-01-4, AC-20260913-01-5, AC-20260913-01-6, AC-20260913-01-7, AC-20260913-01-9 |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260913-01-3, AC-20260913-01-8, AC-20260913-01-10, AC-20260913-01-11; plus fixture repair for the three `--setup --spec` tests whose synthetic hosts must now carry a coverable spec |
| tests/review/review-driver-replay-record.test.js | MODIFY | tests | Fixture repair only, no AC: D1's `judged` ref makes the amend-based unresolvable-target trick resolvable, so the "due but no usable CLEAN target" fixture is rebuilt on D3's real missing-pair refusal; assertions unchanged |

## Contracts

Two refs per review, named for the review that wrote them rather than for the harness that
reads them — every closed review has them, so their presence tells a blind reviewer nothing
about being measured:

```
refs/spec-review/<reviewRunId>/judged   -> the sha the review row records as diff.head
refs/spec-review/<reviewRunId>/close    -> the close commit for that review
```

`--select`'s stdout line keeps its exact field set and order; only the derivation changes, and
no field gains a placeholder value:

```
spec=<path> reviewRunId=<id> commit=<sha> parent=<sha> diffBase=<sha> baselineRed=<...> baselineLegs=<...>
```

`--backfill-pins` prints one line per CLEAN review row and appends nothing to the ledger:

```
<reviewRunId> <spec> judged=<sha>|unresolvable close=<sha>|underivable [skipped: ref exists]
```

`--setup`'s success line is unchanged. Its exit alphabet gains one code, documented in the
script header alongside the existing four:

```
5 = the scratch tree does not reproduce the selected spec's own AC coverage — the tree stood up
    is not the tree the review judged (stderr names the spec, the commit, the first ac-matrix
    finding line, and the `git -C <root> worktree remove --force <dir>` remedy)
```

## Behavior

`--select` today answers "which commit closed this spec?" with `git log -1 --format=%H -- <spec>`
and takes that commit's first parent as the tree to stand up. Both halves are wrong in ways that
compound. The log question returns whichever commit most recently touched the spec FILE, so a
later ledger sweep, a sibling's backlink edit, or a post-merge doc sync silently becomes "the
close commit"; and when that answer is a merge commit, its first parent is the main-line commit
carrying none of the spec's work at all.

The replacement stops reconstructing. The review driver already knows both commits at the moments
it needs them — the sha it is stamping into the row as `diff.head`, and, one mark later, the close
commit it has just made — so it writes each as a ref. A ref keeps its commit reachable and
gc-safe even after a rebasing merge-back rewrites the branch it lived on, which is the failure
mode that makes roughly one in seven judged commits unreachable from the main line today. Neither
write may block a close: the ref is a convenience for a later measurement, and a measurement is
never worth failing a review over, so both are wrapped and degrade to a warning.

`--select` then reads the pair and prints it. There is no walk, no parent hop, and no case where
it prints a partial pair — a row missing either ref, with no resolvable `diff.head` to stand in
for `judged`, is refused outright and the next review selects a different target. The refusal
names `--backfill-pins`, which is where the history walk still lives: a run-once mode that
reconstructs both refs for the backlog of already-closed reviews, prints what it derived for
every row, and refuses to overwrite anything. Confining the walk there is the point — it is a
reasonable way to recover history that was never recorded, and an unreasonable thing to do every
time a replay runs.

Because the two commits no longer need to sit on one line of descent, the overlay's own guard
relaxes: it still refuses an `--overlay` equal to or an ancestor of `--commit`, which would
revert the work rather than complete it, but a sha merely unrelated by descent is now accepted.
This matters because four out of five reviews judge a tree with uncommitted changes in it, and
the close commit is what sweeps those into history — so replaying the close commit on top of the
judged commit is not a refinement of the range, it is how the reviewed tree gets reassembled at
all.

Finally, `--setup` stops trusting its own inputs. Once the worktree is standing and any overlay
commit has landed, it runs the target spec's own coverage check against the scratch tree. Every
review replay may select closed CLEAN, and `verdict.js` requires `ac-matrix` in both review
scopes, so a CLEAN row's tree always satisfied that check — which makes the same check on the
reassembled tree a free, deterministic test that the reassembly held. Zero findings means it did.
Anything else means it did not, and the run ends there with a named refusal rather than a success
line and three red legs discovered a session later.

## Acceptance Criteria

- **AC-20260913-01-1**: WHEN the review driver writes a CLEAN review's close row, THE SYSTEM
  SHALL create `refs/spec-review/<runId>/judged` at the same sha it records as that row's
  `diff.head`, and WHEN it later handles `--mark closed`, SHALL create
  `refs/spec-review/<runId>/close` at the close commit (e.g. a review `rv_abc123def456` whose row
  records `"diff":{"head":"<H>"}` and whose close commit is `<C>` → `git rev-parse
  refs/spec-review/rv_abc123def456/judged` prints `<H>` and `.../close` prints `<C>`)
  → writes tests/review/review-driver-close-row.test.js
- **AC-20260913-01-2**: WHEN either ref write fails, THE SYSTEM SHALL print one warning line
  naming the ref and continue, leaving the close row, the close commit and the mark exactly as
  they are when the write succeeds (e.g. a repo whose `refs/spec-review/<runId>/judged` path is
  already occupied by a conflicting non-commit ref → the driver still exits 0 and the row is
  still appended, stderr naming the ref)
  → writes tests/review/review-driver-close-row.test.js
- **AC-20260913-01-3**: WHEN `--select` picks a CLEAN review row whose run has a `judged` ref,
  THE SYSTEM SHALL print that ref's sha as `parent=`, regardless of which commit last touched the
  spec file, and SHALL fall back to a resolvable `diff.head` only when the ref is absent (e.g. a
  selected row whose `judged` ref is `<H>` and whose spec was last touched by an unrelated later
  `<X>` with parent `<Y>` → `parent=<H>`, never `<Y>`)
  → rewrites tests/replay/replay.test.js :: AC-20260819-02-2
- **AC-20260913-01-4**: WHEN `--select` picks a row whose run has a `close` ref, THE SYSTEM SHALL
  print that ref's sha as `commit=`, including when it is not a descendant of `parent` (e.g.
  `judged` at `<H>` orphaned by a rebasing merge-back and `close` at `<C>` on the rewritten main
  line → `commit=<C> parent=<H>`)
  → writes tests/replay/replay-tree-identity.test.js
- **AC-20260913-01-5**: WHEN the selected row's run has no `close` ref, or has neither a `judged`
  ref nor a `diff.head` that `git rev-parse --verify <sha>^{commit}` resolves, THE SYSTEM SHALL
  exit 4, print nothing on stdout, and name on stderr the row's `runId`, the spec path and
  `--backfill-pins` (e.g. a selected row `rv_abc123def456` with a `judged` ref and no `close` ref
  → exit 4, stdout `""`, stderr containing `rv_abc123def456` and `--backfill-pins`)
  → writes tests/replay/replay-tree-identity.test.js
- **AC-20260913-01-6**: WHEN `--backfill-pins` runs, THE SYSTEM SHALL print one line per CLEAN
  review row naming what it derived, create only the refs that are missing, leave every existing
  ref at its current sha, and exit 0 even when some rows are underivable (e.g. three CLEAN rows
  where the first already has both refs, the second derives both, and the third has an
  unresolvable `diff.head` → three lines, two refs created, first row marked `skipped: ref
  exists`, exit 0)
  → writes tests/replay/replay-tree-identity.test.js
- **AC-20260913-01-7**: WHEN `--setup` was given `--spec` and the tree it has stood up (after any
  `--overlay` commit) does not satisfy `ac-matrix.js --spec <spec under dir> --root <dir>`, THE
  SYSTEM SHALL exit 5, print no `setup dir=` line on stdout, and name on stderr the spec path,
  the commit, the first `ac-matrix` finding line and the `worktree remove --force` remedy (e.g. a
  tree stood up one commit before the spec's own work landed, so `ac-matrix` reports
  `uncovered-ac AC-<id>-1` → exit 5, stdout `""`)
  → writes tests/replay/replay-tree-identity.test.js
- **AC-20260913-01-8**: WHEN `--setup` runs with `--dir` and no `--spec`, THE SYSTEM SHALL
  CONTINUE TO create the marker-carrying detached worktree, run no verification, and exit 0
  → reuses tests/replay/replay.test.js :: AC-20260823-05-1:
- **AC-20260913-01-9**: WHEN `--setup` is given an `--overlay` that is neither equal to
  `--commit` nor an ancestor of it, THE SYSTEM SHALL proceed even though it is not a descendant
  of `--commit` (e.g. two commits on sibling branches off one shared base, passed as `--commit`
  and `--overlay` → the worktree is created and the overlay is materialized, exit 0)
  → writes tests/replay/replay-tree-identity.test.js
- **AC-20260913-01-10**: WHEN every row in the `--commit`..`--overlay` range is meta-prefixed,
  THE SYSTEM SHALL CONTINUE TO create no overlay commit, leave the worktree HEAD at `--commit`,
  and print `overlaid=0`
  → reuses tests/replay/replay.test.js :: AC-20260831-01-3:
- **AC-20260913-01-11**: WHEN `--setup` is given an `--overlay` equal to `--commit`, or one that
  is an ancestor of it, THE SYSTEM SHALL CONTINUE TO exit 4 before creating any worktree, naming
  the `--select` remedy
  → reuses tests/replay/replay.test.js :: AC-20260831-01-4:

## Assumptions (escalation triggers)

- A1: A git ref keeps a rebase-orphaned commit reachable and out of garbage collection, and two
  commits with no ancestor relation can be diffed. **Executed 2026-09-13:** `git update-ref
  refs/spec-review/spike/judged 71aee98` (a head orphaned by a rebasing merge-back) made it
  appear in `git rev-list --all` and disappear from `git fsck --unreachable`; `git diff
  --name-status --no-renames 71aee98 83ef32e`, two commits on no shared line of descent, exited 0
  with rows. **If false:** D6's relaxed refusal is withdrawn and an orphaned `close` ref is
  refused by D3 instead; never measure a tree assembled from a range git cannot express.
- A2: Reviews routinely judge a tree with uncommitted changes, so the close commit is what
  reassembles the reviewed tree rather than merely refining the range. **Executed 2026-09-13:**
  111 CLEAN review rows carry a head sha; 89 of them (80%) record `diff.dirty: true`, 12 of the
  last 14. **If false:** nothing changes — the overlay would merely be a refinement, and every
  Decision here still holds.
- A3: Every review row `--select` can reach in a live window carries `diff.head`, so D2's
  fallback covers the whole backlog until `--backfill-pins` runs. **Executed 2026-09-13:** 284
  review rows in `.claude/spec-runs.jsonl`, 173 carry `diff.head`; the newest row without one is
  `2026-08-24T21:38:48Z specs/20260824/01-render-gate.md`, and 20 measurement replay rows have
  landed since, so no row lacking the field can fall inside a window. **If false:** D3's exit 4
  is already the answer — the row is refused and the next review selects a different target;
  never restore a path-log fallback.
- A4: `git worktree add --detach` reproduces the tree of a commit that is unreachable from HEAD
  but still present. **Executed 2026-09-13:** `git worktree add --detach <tmp> 71aee98` printed
  `HEAD is now at 71aee98 feat(20260912/04): softs get a reader, and replay gets a measurement`,
  and `ac-matrix` against that worktree returned exit 0 with `uncovered: 0`. **If false:** D1's
  refs make the question moot for every future review; for the backlog, D3's exit 4 refuses.
- A5: Exactly three tests in `tests/replay/replay.test.js` pass `--spec` to `--setup` and so meet
  D5's new verification; every other `--setup` test uses `--dir` only and is untouched.
  **Executed 2026-09-13:** 38 `--setup` invocations in the file, 4 of them (across 3 tests) also
  passing `--spec`; each of those hosts writes a spec body of
  `---\nstatus: implementing\n---\n# <title>\n` with no `## Acceptance Criteria` section, which
  `ac-matrix.js` exits **2** on — so all three redden under D5 and all three are fixture repairs,
  not behavior changes. None of them uses the shared `setupOverlayHost` fixture (its five callers
  are all `--dir`-only overlay tests), so `tests/replay/replay.fixtures.js` is untouched.
  **If false:** the count is a prediction, not an inventory — repair every synthetic host the
  guard actually reddens by giving its spec an `## Acceptance Criteria` section, a File Plan
  tests row and a matching test file, in the same batch; never weaken the guard, add a leniency
  arm, or make it opt-in.
- A7: A ref write leaves the working tree byte-identical, so D1's new write on the close path
  cannot trip the dirty-tree refusal that `--mark closed` already enforces — the shape that
  reddened 23 tests across six files when close-time expiry started writing to the tree.
  **Executed 2026-09-13:** `git status --porcelain` line count before a `git update-ref
  refs/spec-review/<id>/judged HEAD` and after it were identical (delta 0), and ten test files
  rehearse `--mark closed`. **If false:** STOP and ask the user — a measurement convenience that
  can dirty a close-time tree is not worth shipping under any remedy.
- A6: `tests/replay/replay.test.js` stays inside the host's per-file 45s budget after the
  rewrites, because the new ACs land in sibling files. **Executed 2026-09-13:** the file runs
  24.6s today. **If false:** move AC-20260913-01-3's rewrite into
  `tests/replay/replay-tree-identity.test.js` and leave `replay.test.js` carrying only the
  fixture repairs and the three CONTINUE-TO retags.

## Rationale

The harness has three non-measurement `setup-failed` rows in four days, all with the same
signature: the scratch worktree was standing at a commit that predates the target spec's work.
Executed against the last fourteen CLEAN reviews, the current derivation disagrees with the
review row's own `diff.head` for six of them — and the disagreement is time-dependent, which is
why early replays worked and recent ones do not. `git log -1 -- <spec>` was a reasonable proxy
while a spec's close commit really was the last thing to touch its doc; ledger promotions,
deviation folds, post-merge doc syncs and sibling backlink edits have all since broken that
proxy, and a merge commit's first parent breaks it completely.

The first draft of this spec fixed only the read side — take `diff.head` from the row and derive
the close commit by walking descendants for a `status: done` flip. That version was locked and
then reopened, because the walk reintroduced the exact class it was replacing and left a hole:
when a rebasing merge-back orphans the judged commit, no descendant walk can find the close
commit, and the fallback measured the judged tree alone. Since 80% of reviews judge a tree with
uncommitted changes that the close commit later sweeps up, "the judged tree alone" is a tree
missing the review's own fixes — and the coverage guard does not reliably catch that, because
coverage can be intact while the fixes are absent. Measuring it would have produced a catch-rate
number about a tree nobody reviewed, which is the failure this spec exists to end.

Writing the refs removes the hole rather than handling it. The driver holds both commits at the
moments it needs them and has simply been discarding them; a ref costs one git write, survives
rebases and gc, and turns two derivations into two reads. It also earns the walk its one
legitimate home: reconstructing a backlog that was never recorded, once, with its output printed
for inspection. The refs are named for the review rather than the replay deliberately — every
closed review writes them, so their existence signals nothing to a blind reviewer, and the
harness's own blindness invariant is untouched.

The cost is a git write on the close path, which is why AC-20260913-01-2 exists: a measurement
convenience must never be able to fail a review. Tier stays standard on that basis — the write is
additive, best-effort, and reversible, and getting the rest of this wrong leaves measurement
exactly where it already is.

Four literals-leg hits from the lock-time collision sweep are waived rather than planned, each
verified by reading the hit: `spec/scripts/lib/parse-selection.js` parses `commit=(\S+)` and
`parent=(\S+)`, unchanged by a ref-sourced value, and
`tests/parse-selection/parse-selection.test.js` pins a hardcoded selection line rather than
replay.js's live output; `tests/replay/replay.fixtures.js`'s `pristine-red` hit sits in
`writeRecordFixture`, on the `--record` path this spec does not touch; and
`docs/canonical/review.md` is this spec's own Canonical Delta target, applied by the review stage
at close and never a File Plan row.

Deviations folded at close (2026-09-13), both the same shape — D2's deleted fallback and D1's
new refs each stranded fixtures that predate the ref scheme, in files outside the File Plan.
Eight `tests/replay/replay.test.js` cases hand-built ledger rows without ever writing the refs a
real review now writes, so each hit the new exit-4 refusal; the repair gave every one of them the
same `writeReviewRefs()` call the AC-20260913-01-3 test introduces, so each fixture rehearses what
a real review does. One further case, `tests/review/review-driver-replay-record.test.js`'s
AC-20260821-02-3, manufactured an unresolvable `--select` target by amending the close flip so the
old parent-hop landed nowhere — a trick D1's ref defeats by design, since keeping an orphaned
commit resolvable is the point. Its fixture was rebuilt on D3's real missing-pair refusal with the
assertions untouched, and the file entered the File Plan as a no-AC fixture-repair row at the
review's own direction. Assumption A5's count held exactly; no guard was weakened and no
compatibility shim was added on the script side.

Deliberately NOT in scope: re-auditing past `caught`/`missed` rows. A probe suggested many
historical targets would resolve differently if replayed today, but that measures today's
history, not the history at the time each replay ran, and this spec will not assert a claim it
cannot execute. The catch-rate figure stands as recorded.

## Canonical Delta

In `docs/canonical/review.md`, the replay paragraph that describes the scratch worktree gains: a
review records the two commits bounding what it judged as refs under `refs/spec-review/<runId>/`
— `judged` at the close row's own head sha, `close` at the close commit — written best-effort so
a failed write can never block a close, and named for the review rather than the harness so their
presence signals nothing to a blind reviewer. The replay harness reads that pair and derives
neither: a commit identified by "the newest commit touching the spec file" is a different commit
as soon as anything else touches that file, and a close commit found by walking descendants is
unfindable once a rebasing merge-back has orphaned the judged commit. A row missing either ref is
refused, never partially measured, and `replay.js --backfill-pins` is the one place the history
walk survives — a run-once reconstruction for reviews that closed before the refs existed.
Because the pair need not share a line of descent, `--setup`'s overlay guard refuses only an
`--overlay` equal to or an ancestor of `--commit`. `--setup` re-derives the target's own AC
coverage against the tree it assembled and refuses (exit 5) rather than printing a success line
when the reassembly does not hold; that refusal records `setup-failed` with a
`pristine-red:ac-matrix` claim, so the window stays due and the target leaves the candidate pool.
(specs/20260913/01-the-replay-tree-is-the-reviewed-tree.md)
