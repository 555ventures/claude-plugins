---
date: 2026-09-12
status: implementing
tier: standard
area: review-close
design: false
breaking: false
depends_on: [specs/20260911/03-tests-expire-at-close.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: 87049cf31dfa9aecb6a8782da8c90fc2040e3f61
---

# Expired tests leave in their own commit

## Goal

A spec's close currently deletes that spec's expired tests *into the close commit itself*, so the
commit git records as "the tree the review judged" is that tree minus coverage the review's own
`ac-matrix` leg just passed on. The replay harness rebuilds its scratch tree from exactly that
commit and gets a coverage leg that can never go green, burning a full cycle and recording
`setup-failed` on every attempt. This spec moves the deletion out of the close commit: the close
commit is the judged tree, and the deletions land immediately afterwards in a commit of their own
that never touches the spec file. Done means: `--mark closed` deletes and commits the expired
tests itself after the close gate passes, the replay target selector still resolves the close
commit, and a deletion that turns the suite red is reverted and reported rather than blocking the
close.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `expire-tests.js` classifies `emptied` on every run, not only under `--apply`: the per-file span removal and blank-run collapse move into an in-memory pass that always runs and always pushes a file whose post-removal source has zero `scanCalls` hits onto `emptied`; the `fs.writeFileSync` / `fs.unlinkSync` / empty-directory climb stay gated behind `apply`. A dry run therefore reports the same `emptied` array an apply would and still writes nothing (AC-20260912-13-1). | The close now reads the count before it applies, so a dry run that always reports `emptied: []` would make the CLOSE step lie about how many files the mark is about to remove. |
| D2 | `doCloseWork()` drops `--apply` from its `expire-tests.js` invocation — it becomes `--root <repoRoot> --spec <specRel> --json`. Every other behaviour of that step is unchanged: the same non-zero-exit and unparseable-output refusals, the same `row.tests = {born, kept, retired}` on the review row before `appendLedger`, the same `marks.testsExpiry = {born, kept, retired, filesRemoved}` (AC-20260912-13-2). | The row must still record what dies at this close; classification alone answers that, and leaving the tree untouched is what keeps the close commit identical to the tree the review judged. |
| D3 | The CLOSE step's line, printed only when `retired > 0`, becomes exactly `🧹 <retired> tests expire with this spec (<filesRemoved> files removed) — deleted in their own commit when you mark closed`, replacing `🧹 expired <retired> tests (<filesRemoved> files removed) — part of the close commit` (AC-20260912-13-2). | The session is told what to expect *after* its commit, not what is already inside it; the retired literal is enumerated by this spec's collision sweep. |
| D4 | `--mark closed` runs, in order: the resolved host gate over the committed close tree (unchanged, and it now observes a tree that still holds the expired tests); then, only when `marks.testsExpiry.retired > 0`, `expire-tests.js --root <repoRoot> --spec <specRel> --apply --json`; then the host `testCommand` whole-suite re-run, which is now the run that observes the post-expiry tree. No third run is added on the green path (AC-20260912-13-3). | The existing whole-suite re-run already exists to cover what CLOSE writes; running it after the deletion covers both concerns in the same run, so the split costs no extra gate time. |
| D5 | On a green whole-suite re-run with an expiry applied, the driver commits the deletion itself: `git -C <repoRoot> add -- <paths>` over the deduplicated union of `retired[].file` and `emptied[]`, then `git -C <repoRoot> commit -m "chore(tests): expire <retired> tests closed with <specRel>"`. Never `git add -A` and never `--no-verify`; `git add`'s `warning: could not open directory` on a path whose directory the sweep removed is not a failure (exit status is the only signal). A non-zero `git add`/`git commit` restores per D6 and refuses the mark naming the failed command. This is the review driver's first direct commit; ADR-0020 records the narrowing of specs/20260911/03 D5/D6 (AC-20260912-13-3, AC-20260912-13-6). | Path-scoped staging is what keeps a linked worktree's deliberately-uncommitted ledger and retained evidence out of this commit; `-A` would sweep them in and leave `finishMerge` deleting tracked files. |
| D6 | On a red whole-suite re-run with an expiry applied, the driver restores with `git -C <repoRoot> checkout HEAD -- <the same paths>` and re-runs the host `testCommand` once over the restored tree. Green now ⇒ the deletion is the cause: print the D7 warning on stdout, make no commit, and let `--mark closed` succeed. Still red ⇒ the close tree itself is broken: refuse with the existing `suite red at close` message and no expiry note. A red whole-suite re-run with nothing retired refuses exactly as today (AC-20260912-13-4, AC-20260912-13-5). | Closing must never deadlock on a host whose own checks disagree with test expiry — the field failure this fixes — but a genuinely broken close tree must still refuse, and only the restored re-run can tell the two apart. |
| D7 | `expiryHint()` no longer rides the gate-red or suite-red refusals — the gate now runs before any deletion and the suite-red arm that keeps a deletion is the broken-close-tree arm, where the hint would misdirect. Its text becomes the body of D6's skip warning, printed as: `⚠ expiry skipped — deleting the <retired> test(s) this close retired turns the suite red, and the same suite is green with them restored, so the deletions were reverted and this close carries none.` followed by the hint body (which names `§ Test expiry`, forecloses relabelling criteria, and names a leftover empty suite or newly-unused import as the other cause) and the sweep remedy `node "$(spec-paths test-expiry)" --root . --all-done --apply` (AC-20260912-13-4, AC-20260912-13-7). | One derived explanation, attached to the one arm whose facts actually imply it: expiry ran, its deletion is provably the cause, and the close went ahead without it. |
| D8 | `docs/adr/0020-expired-tests-leave-in-their-own-commit.md` records the amendment (Applies to: specs/20260911/03-tests-expire-at-close.md D5's `--apply` clause and D6 in full), and specs/20260911/03 gains the `Amended by: ADR-0020` backlink line. `spec/templates/grounding-contract.md` is NOT edited: its § Test expiry host obligation is unchanged, and re-stamping every host's `contractHash` to reword one explanatory sentence is a worse trade than the residual staleness (recorded in Rationale) `[no-ac: an accepted-record file and a one-line backlink carry no runtime surface — the ADR's own existence is the deliverable]`. | A locked contract a later spec needs to change is narrowed by an accepted record, never by a silent edit — the precedent ADR-0011, ADR-0014 and ADR-0015 set. |
| D9 | The spec plugin's version bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; no version literal appears anywhere in this spec (AC-20260912-13-8 `[oracle: gate]`). | Same manifest and version discipline as every behaviour change; `plugin-bump.js --check` is the oracle. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/expire-tests.js | MODIFY | scripts | D1 — classify `emptied` on every run; keep all disk writes behind `--apply` |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D2–D7 — dry-run classification in `doCloseWork()`; CLOSE's 🧹 line; apply/verify/commit-or-restore inside `runCloseTimeGate()`; `expiryHint()` moves to the skip warning |
| tests/expiry/test-expiry.test.js | MODIFY | tests | AC-20260912-13-1 |
| tests/review/review-driver-close-expiry.test.js | MODIFY | tests | AC-20260912-13-2, AC-20260912-13-3, AC-20260912-13-4, AC-20260912-13-5, AC-20260912-13-6, AC-20260912-13-7 |
| docs/adr/0020-expired-tests-leave-in-their-own-commit.md | CREATE | other | D8 — amendment record for specs/20260911/03 D5/D6 |
| specs/20260911/03-tests-expire-at-close.md | MODIFY | other | D8 — add the `Amended by: ADR-0020` backlink line |
| spec/.claude-plugin/plugin.json | MODIFY | other | D9 — bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

## Contracts

`expire-tests.js` JSON shape is unchanged; only `emptied`'s fill condition widens.

```
# dry run, before                          # dry run, after (D1)
{ …, "emptied": [], "applied": false }     { …, "emptied": ["tests/old/gone.test.js"], "applied": false }
# --apply is byte-identical in both
```

The close sequence, in full:

```
doCloseWork()                                       # D2 — classification only, nothing written
  expire-tests.js --root <repoRoot> --spec <specRel> --json
  row.tests        = { born, kept, retired }        # unchanged shape, unchanged position
  marks.testsExpiry = { born, kept, retired, filesRemoved: emptied.length }

CLOSE step text, when retired > 0                   # D3
  🧹 <retired> tests expire with this spec (<filesRemoved> files removed) — deleted in their own commit when you mark closed

--mark closed                                       # D4–D7, after the deviations / gotchas / dirty-tree refusals
  1. host gateCommand over the committed close tree
       red  -> die (existing `gate red at close` message, no expiry note)
  2. retired > 0 ?  expire-tests.js --root <repoRoot> --spec <specRel> --apply --json
  3. host testCommand (whole suite) over the resulting tree
  4. green, expiry applied -> git -C <repoRoot> add    -- <paths>
                              git -C <repoRoot> commit -m "chore(tests): expire <retired> tests closed with <specRel>"
     green, nothing applied -> proceed (today's behaviour, unchanged)
     red,   nothing applied -> die (existing `suite red at close` message, no expiry note)
     red,   expiry applied  -> git -C <repoRoot> checkout HEAD -- <paths>
                               re-run host testCommand once
                                 green -> print the D7 ⚠ warning, no commit, mark succeeds
                                 red   -> die (existing `suite red at close` message, no expiry note)

<paths> = dedup( retired[].file ∪ emptied[] ), repo-relative, always tracked (the dirty-tree
          refusal immediately above this sequence guarantees it)
```

The resulting history, and why replay recovers (spike S3, executed):

```
<parent>        build commit      — the pre-review tree, tests present
<close>         close commit      — status: done, canonical delta, gotchas fold; tests STILL present
<close+1>       expiry commit     — deletions only; touches no path under specs/

replay --select : git log -1 --format=%H -- <specPath>   ->  <close>      (not <close+1>)
replay --setup  : worktree at <close>^ = <parent>        ->  tests present
replay overlay  : git diff --name-status <close>^ <close> ->  M <specPath> only, no D rows
```

## Behavior

`doCloseWork()` keeps every refusal it has: a non-zero exit or unparseable output from
`expire-tests.js` still dies with `status` unchanged and no ledger append, naming
`node "$(spec-paths test-expiry)" --root . --spec <spec>` as the remedy. Dropping `--apply`
changes what the run does to disk, never what the driver does with its answer.

Inside `--mark closed`, the three existing refusals (deviations sidecar, gotchas ratchet,
dirty tree) run first and unchanged, so by the time step 1 begins the working tree is clean and
every path the sweep will touch is tracked and committed. Step 2's apply is the only thing that
dirties it, and every exit from steps 3–4 either commits that dirt or restores it — a refused
mark is still side-effect-free, and an interrupted one leaves deletions the next run's dirty-tree
refusal names in full.

When `retired` is `0` the sequence collapses to exactly today's two runs and makes no commit at
all, so a close that retires nothing leaves `git rev-parse HEAD` untouched across the mark.

In a linked worktree the expiry commit lands on the same working branch as the close commit and
merges back with it; because staging is path-scoped, the ledger and retained evidence that
`finishMerge()` promotes later stay uncommitted exactly as the CLOSE step told the session to
leave them.

## Acceptance Criteria

- **AC-20260912-13-1**: WHEN `expire-tests.js --root <r> --spec <done spec> --json` runs without
  `--apply` over a host whose `tests/old/gone.test.js` holds only one retirable tagged test THE
  SYSTEM SHALL report `emptied: ["tests/old/gone.test.js"]` and `applied: false` while leaving
  that file byte-identical on disk
  → rewrites tests/expiry/test-expiry.test.js :: AC-20260911-03-3:
- **AC-20260912-13-2**: WHEN the review driver reaches CLOSE for a spec whose two tagged tests
  are one `SHALL CONTINUE TO` pin and one plain test THE SYSTEM SHALL leave both tests on disk,
  still record `tests:{born:2,kept:1,retired:1}` on the review row, still flip the spec to
  `status: done`, and print exactly
  `🧹 1 tests expire with this spec (0 files removed) — deleted in their own commit when you mark closed`
  → rewrites tests/review/review-driver-close-expiry.test.js :: AC-20260911-03-7: WHEN the
- **AC-20260912-13-3**: WHEN `--mark closed` runs over that host with a green gate and a green
  suite THE SYSTEM SHALL delete the retired test, create exactly one new commit whose message is
  `chore(tests): expire 1 tests closed with specs/20260911/88-drv-expiry.md` and whose only
  changed path is the retired test file, and leave `git log -1 --format=%H -- specs/20260911/88-drv-expiry.md`
  resolving to the close commit rather than to that new commit
  → writes tests/review/review-driver-close-expiry.test.js
- **AC-20260912-13-4**: WHEN the host's `testCommand` is red with the retired test deleted and
  green once it is restored THE SYSTEM SHALL restore that file, create no commit, exit `0` from
  `--mark closed`, and print on stdout a warning carrying `⚠ expiry skipped`, the retired count
  `1`, the literal `§ Test expiry`, and the remedy `--all-done --apply`
  → rewrites tests/review/review-driver-close-expiry.test.js :: a close-time gate that goes red right
- **AC-20260912-13-5**: WHEN the host's `testCommand` is red both with the retired test deleted
  and with it restored THE SYSTEM SHALL restore that file, create no commit, refuse `--mark closed`
  with exit `2` and `suite red at close`, print no `⚠ expiry skipped` line, and leave the driver
  state at `CLOSE`
  → writes tests/review/review-driver-close-expiry.test.js
- **AC-20260912-13-6**: WHEN `--mark closed` runs over a host whose close retired nothing THE
  SYSTEM SHALL leave `git rev-parse HEAD` byte-identical before and after the mark
  → writes tests/review/review-driver-close-expiry.test.js
- **AC-20260912-13-7**: WHEN the resolved host gate exits non-zero over the committed close tree
  THE SYSTEM SHALL CONTINUE TO refuse `--mark closed` with exit `2` and `gate red at close`, SHALL
  CONTINUE TO leave the driver state at `CLOSE`, and SHALL CONTINUE TO print no expiry note when
  the close retired nothing
  → reuses tests/review/review-driver-close-expiry.test.js :: a close-time gate that goes red when
- **AC-20260912-13-8** `[oracle: gate]`: WHEN this spec's changes land THE SYSTEM SHALL carry a
  `spec` plugin version bump written by `node scripts/plugin-bump.js --bump --plugin spec
  --changelog "<paragraph>"`, with `node scripts/plugin-bump.js --check` green against the merge
  base → writes spec/.claude-plugin/plugin.json

## Assumptions (escalation triggers)

- **A1**: The added commit is invisible to the other close rehearsals. Grepped at lock
  (2026-09-12): 30 `--mark closed` call sites across 10 files under `tests/review/`; every
  `rev-parse HEAD` / `rev-list` / `status --porcelain` capture in them is taken at setup or at a
  hard-stop state *before* the close, and none asserts on git state after the mark. This is a
  prediction, not an inventory. — **if false:** enter that file as a File Plan fix row and make
  its setup do what a real session does at that step; never neuter the fixture so the new commit
  cannot reach it.
- **A2**: Fixture hosts carry a git identity, so the driver's own commit succeeds under
  `node --test` — verified: `tests/helpers.js`'s `seedGitRepo` sets `user.email` and `user.name`
  on both templates. — **if false:** D5's commit-failure arm (restore, then refuse naming the
  failed git command) already covers it; add the config to the template in the same batch.
- **A3**: Every path in `<paths>` is tracked at `--mark closed`, because the dirty-tree refusal
  immediately above the sequence rejects any uncommitted path outside the sidecar and retained
  evidence. — **if false:** drop untracked paths from the restore list (a `git checkout HEAD --`
  on one errors) and record the deviation.
- **A4**: `tests/review/review-driver-close-expiry.test.js` survives close-time expiry because its
  own text names `expire-tests.js`, a script in the derived invariants set (keep clause (b)) —
  verified at lock: `node spec/scripts/expire-tests.js --root . --all-done --json` reports
  `retired: []` with `kept.invariant: 778`. — **if false:** the new criteria lose their carrier at
  this spec's own close; add a `SHALL CONTINUE TO` pin AC over the commit-separation behaviour.
- **A5**: `red-check.js` tolerates AC-20260912-13-7's `SHALL CONTINUE TO` pin sharing
  `tests/review/review-driver-close-expiry.test.js` with six red-expected criteria. — **if false:**
  move the pin into its own test file and repoint the AC's `reuses` disposition in the same batch.

Executed micro-spikes (2026-09-12, throwaway repos, deleted):

- **S1** — `git checkout HEAD -- tests/old/gone.test.js` after removing both the file and its now
  empty parent directory: file restored, directory recreated, `git status --porcelain` empty.
- **S2** — with `.claude/spec-runs.jsonl` separately modified, `git add -- tests/old/gone.test.js`
  then `git commit`: the commit's `--name-only` output is `tests/old/gone.test.js` alone and
  porcelain afterwards is ` M .claude/spec-runs.jsonl`. Also observed: `git add` on a removed file
  whose directory is gone prints `warning: could not open directory 'tests/old/'` on stderr and
  still stages the deletion at exit 0 — D5's "exit status is the only signal" clause exists for
  this.
- **S3** — three commits (build → close, status flip only → expiry, deletion only):
  `git log -1 --format=%H -- specs/20260913/01-x.md` equals the close commit;
  `git diff --name-status --no-renames <close>^ <close>` prints `M specs/20260913/01-x.md` alone
  with no `D` row; `git ls-tree -r --name-only <close>^` still lists `tests/gone.test.js`. This is
  the whole root-cause claim, executed.

## Rationale

The incident is a provenance bug, not a replay bug. `ac-matrix` is right to report the AC
uncovered — the tree it was handed genuinely lacks the test. What is wrong is the tree: the close
commit is supposed to be the artefact the review judged, and the expiry sweep quietly edits it
after the verdict. Every fix aimed at the replay side was rejected for the same reason. Teaching
`ac-matrix` to tolerate a red coverage leg on expired specs, or attributing the uncovered AC as
"explained" (the two shapes queue item q223 proposed), quiets the symptom, leaves the historical
record wrong forever, and blinds the one leg that catches genuinely missing coverage. The
already-shipped `--select` skip for `pristine-red` rows is complementary, not superseded: it keeps
the harness off the targets whose close commits *already* carry the deletions, which no fix can
retroactively repair.

D6's arms were the session's one real fork and went to the user. Refusing the close on a red
post-expiry suite is the strict reading and is what specs/20260911/03 D6 assumed; it is also
exactly the deadlock that blocked closes in prax, where a host check demanding a test carrier per
criterion reported every criterion of the just-closed spec uncovered and had no path forward. The
user chose the never-deadlock reading. The restored re-run is what makes that safe: the close only
proceeds without its expiry when the suite is demonstrably green with the tests back, so a close
tree that is broken for any other reason still refuses with the message it always had. The cost is
that a host with a bad check silently never expires anything — `/spec:doctor` check 20 is the
standing report for exactly that, and the warning names its sweep command.

D5's path-scoped staging is not a stylistic preference. In a linked worktree the CLOSE step
deliberately tells the session to leave the ledger and retained evidence uncommitted until
`finishMerge()` promotes them; a `git add -A` here would commit them and leave that promotion
deleting tracked files out from under a clean-tree assumption, which is the failure
`merge-back.sh cleanup` exits 2 on. Spike S2 pins the narrow behaviour the driver relies on.

D8 declines the grounding-contract edit deliberately. That file's § Test expiry bullet states a
host *obligation* — scope per-criterion carrier checks to specs that are not `done` — and that
obligation is unchanged and, if anything, more load-bearing now that a host violating it loses its
expiry silently rather than loudly. Only the bullet's explanatory sentence about *when* the
deletion happens goes slightly stale. Editing it would re-stamp `contractHash` and flag every
host's grounding as out of date, and the pipeline rules make any edit to that file a critical-tier
trigger; the trade is not worth one sentence. The staleness is recorded here so a later contract
change folds it in.

Queue item q222 (expiry leaving an empty suite or an orphaned import behind) is deliberately not
absorbed. It stays its own spec, but D6's restored re-run turns its failure mode from a red close
into a reported skip for free, and D7's warning body names it as a candidate cause, so the two do
not collide beyond `expiryHint()`'s text — which q222's spec will widen on top of this one.

The lock-time collision sweep over the three literals D3 and D7 retire (`part of the close
commit`, `🧹 expired`, `CLOSE deleted`) returns three live paths, all already in the File Plan:
`spec/scripts/spec-review-driver.js`, `tests/review/review-driver-close-expiry.test.js` and
`specs/20260911/03-tests-expire-at-close.md`. Copies of the same literals under
`.claude/worktrees/spec-11-a-note-can-mark-an-area/` are waived: that is a sibling spec's live
worktree on its own branch, not a surface this spec may edit, and the two branches reconcile at
merge like any other overlap. The sweep's `executes` leg was read rather than waived — the union
of its eleven driver-spawning files and the ten files that actually reach `--mark closed` is the
set A1 grepped, and the seven that spawn the driver without ever marking closed cannot observe the
added commit at all.

The watch item during execution is the fixture blast radius in A1: this is the same class the host
Gotchas file records as "a Decision that makes an existing step WRITE something strands every
shared setup that rehearses that step", which cost 23 tests across six files the last time it bit,
and it bit on this exact step.

## Canonical Delta

In `docs/canonical/review-close.md`, the **Tests expire at close** bullet keeps its first half
verbatim through "Untagged tests are never touched." Replace everything after that sentence with:

The driver's close work runs the classification as a **dry run** — it reports what will be
retired and which files that will empty, and writes nothing. The review row records
`tests:{born,kept,retired}` from it and the CLOSE step prints one 🧹 line when anything was
retired, naming the separate commit the deletions will arrive in. A failing or unparseable
classification refuses the close. The deletion itself happens inside `--mark closed`, after the
host gate has certified the committed close tree with the tests still present: the driver applies
the sweep, re-runs the host's whole suite over the result, and on green stages exactly the retired
and emptied paths and commits them as `chore(tests): expire <n> tests closed with <spec>`. That
second commit touches nothing under `specs/`, so `git log -1 -- <spec>` still resolves the close
commit and the replay harness rebuilds the tree the review actually judged. On red the driver
restores the deleted paths and re-runs the suite once more: green with them restored means the
deletion was the cause, so the close completes without its expiry and prints a warning naming the
count, the grounding contract's § Test expiry obligation and the `--all-done --apply` sweep; still
red means the close tree itself is broken and the mark refuses as before. A close that retires
nothing makes no commit. `/spec:doctor` check 20 runs the same rule as a dry run over every done
spec and applies it only after one question naming what it will delete.
