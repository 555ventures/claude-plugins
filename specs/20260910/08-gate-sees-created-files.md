---
date: 2026-09-10
status: hardened
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-10
open_markers: 0
---

# The build gate sees the files the build created

## Goal

A host check whose inventory is the git index cannot see a file the build just created,
because a newly created file is untracked until the checkpoint commit. The build's gate
therefore runs green over an inventory that is missing the build's own new files, and the same
check reds at review — after the commit made them tracked — where it is argued instead of
fixed. This spec makes the build driver add every untracked, non-ignored File Plan path to the
index with intent-to-add immediately before it spawns the gate child, so the one gate run each
round already sees what the build created. Done means: a build that creates a file gets that
file's bytes counted by index-reading checks at build time, the gate still runs exactly one
child per round, and nothing about the checkpoint commit changes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Inside `runGate()`, after `resolveGate()` succeeds and **before** the gate child is spawned, the driver runs `git ls-files -o --exclude-standard -z -- <File Plan paths>` and, on a non-empty result, `git add -N -- <those paths>`. Intent-to-add puts the path in the index with no content, so `git ls-files` lists it and a `statSync`-based inventory reads its real on-disk bytes. (AC-20260910-08-1) | The gate child is the one place every round already passes through; putting the visibility fix there covers the first gate and every repair round with no second invocation point. Rejected: a second gate run at `--mark committed` (amends specs/20260910/07 D1, doubles wall-clock, and leaves an open question about a red gate after the commit already exists). |
| D2 | The pathspec is the spec's own File Plan paths and nothing else — an untracked file the build created outside the File Plan is not staged and stays untracked. (AC-20260910-08-2) | The File Plan is the driver's standing authority on what this build may touch, and a wider pathspec would sweep scratch files, editor leftovers, and out-of-plan creations into the index that the session then commits. Out-of-plan creations remain `scope-reconcile`'s finding at COMMIT, unchanged. |
| D3 | The index entries are never reverted by the driver — they persist through a red gate, every repair round, and the checkpoint commit that consumes them. The driver prints one stderr line naming the staged paths and the `git reset --` command that undoes them. (AC-20260910-08-3) | A repair round's fix is frequently the host's own reconcile/raise tool, whose inventory is the same index — reverting after each gate would hide the very files the repair must measure. Rejected: revert in a `finally` around the gate child. |
| D4 | A File Plan path that exists on disk as a regular file but is neither tracked nor listed as untracked is ignored by the host's `.gitignore`: the driver prints one `⚠️` stderr line naming those paths and continues to the gate. It never refuses, and a File Plan path that is a directory never triggers the warning. (AC-20260910-08-4) | Such a path never reaches the checkpoint commit and no index-reading check ever counts it, and today nothing says so; a refusal would block a host that ignores a planned path deliberately, which is far harder to undo than a warning. |
| D5 | A non-zero exit from either git invocation is `die()` — exit 2, stderr naming the failing command and the remedy, **no gate child spawned and no `gateRuns` entry recorded**. (AC-20260910-08-5) | A gate that runs after the staging failed is exactly the blind green this spec exists to remove; fail-closed matches the driver's existing refusal discipline, and the state is unchanged so the mark can simply be re-issued. |
| D6 | specs/20260910/07 D1 is preserved verbatim, not amended: the staging happens outside the gate child, so a round still spawns exactly ONE `bash -c` child, with the post-gate chained inside it, and `marks.gateRuns` still gains exactly one entry per round. (AC-20260910-08-6) | The whole reason this shape was chosen over a second post-gate run; the repair-round bookkeeping (`REPAIR_CAP`, `isAtRepairNow()`) reads `gateRuns` and must not start counting two runs per round. |
| D7 | `--mark committed`'s D3 refusal is unchanged and keeps refusing while a File Plan path is uncommitted: `git status --porcelain` reports an intent-to-add path as ` A <path>`, which `gitStatusPaths()`'s `slice(3)` already parses. (AC-20260910-08-7) | The one way this change could silently break the pipeline is by making an uncommitted new file look clean to the commit gate; executed spike A2 confirms it does not. |
| D8 | The host-integration step body gains one sentence naming that new File Plan files are staged into the index when the gate runs, so index-reading host checks see them. (AC-20260910-08-8) | Without it a host whose baseline needs reconciling spends a repair round discovering that; with it the session can reconcile as part of integration and the common case costs no round. |
| D9 | The driver's absence contract narrows, so it narrows by an accepted record, never a silent edit: `docs/adr/0015-*.md` (Applies to: specs/20260901/01-build-driver.md D12 — only its "never runs a git write (its git calls are `rev-parse`, `diff --shortstat`, `status --porcelain`)" clause, which becomes "its only index write is the intent-to-add of untracked File Plan paths immediately before the gate child"; every other clause of D12 stands), plus one `Amended by: ADR-0015` line in specs/20260901/01-build-driver.md and the matching narrowing of `spec/commands/build.md` § Rules' "or runs a git write" clause. The driver's own header `does NOT` list is corrected in the same edit. `[no-ac: planning-seat prose and a backlink; review's citations-check and the doctrine leg are their oracle]` | ADR-0011/ADR-0014 precedent: a contract a landed spec locked is narrowed by an accepted record. |
| D10 | The spec plugin's semver bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; no Decision here names a version literal. `[no-ac: `plugin-bump.js --check` in the gate is the oracle]` | Host § Planning version-bump discipline; concurrent sessions race the number, so the literal is never pinned. |
| D11 | `size-baseline.json` is a File Plan row satisfied by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/08-gate-sees-created-files.md` after every other row has landed — the driver and the new test file both grow past their ceilings. `[no-ac: `size-ratchet.js --root .` exiting 0 is the oracle, pinned by AC-20260908-01-9]` | specs/20260909/05 D10 precedent; and this build is the first whose gate can actually see the new test file's bytes, which is the point. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D1–D8: `stageCreatedFilePlanPaths()` + its call at the top of `runGate()`, the ignored-path warning, the staged-paths notice, the integration step sentence, and the header `does NOT` correction |
| tests/build/build-driver-gate-stage.test.js | CREATE | tests | AC-20260910-08-1, AC-20260910-08-2, AC-20260910-08-3, AC-20260910-08-4, AC-20260910-08-5, AC-20260910-08-8 |
| tests/build/build-driver-post-gate.test.js | MODIFY | tests | AC-20260910-08-6 — retag the existing one-child-per-round coverage with this pin's ID; no assertion changes |
| tests/build/build-driver-commit.test.js | MODIFY | tests | AC-20260910-08-7 — add the intent-to-add case to the existing dirty-File-Plan refusal test; no assertion weakened |
| docs/adr/0015-the-build-gate-sees-created-files.md | CREATE | doctrine | D9: amendment ADR — Applies to specs/20260901/01-build-driver.md D12's git-write clause; Amended by: — |
| specs/20260901/01-build-driver.md | MODIFY | doctrine | D9: one `Amended by: ADR-0015` line only |
| spec/commands/build.md | MODIFY | doctrine | D9: § Rules' driver clause narrowed to exclude the intent-to-add; the Worker Contract git ban above it is untouched |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`, never by hand |
| size-baseline.json | MODIFY | other | D11: `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/08-gate-sees-created-files.md`, last step before the final gate |

## Contracts

```js
// spec/scripts/spec-build-driver.js — new module-private function, called from runGate()
// immediately after the resolveGate() {gate:null} refusal and before the gate child spawns.
function stageCreatedFilePlanPaths() // -> void; die()s on a non-zero git exit
```

Exact child invocations, in order (both through `runChild`, both `-C repoRoot`):

```
git ls-files -o --exclude-standard -z -- <every File Plan path, de-duplicated>
git ls-files -z -- <every File Plan path, de-duplicated>          # tracked set, for D4 only
git add -N -- <the paths the first call listed>                   # skipped when that list is empty
```

Sentinel substrings the tests assert (stderr; the surrounding wording is free):

| Situation | Substring |
|---|---|
| D3 staged notice | `staged` and `git add -N` and each staged path |
| D4 ignored warning | `⚠️` and `ignored` and each ignored path |
| D5 refusal | `git add -N` (or `git ls-files`) and the failing exit code |

Exit codes are unchanged: `0` step printed / mark accepted, `2` precondition failure — D5's
refusal is a new member of the existing `2` alphabet, and the driver header's `Exit codes:` list
names it.

## Behavior

`runGate()` gains one step at its head. After the gate string resolves, the driver asks git
which File Plan paths are untracked and not ignored, adds exactly those to the index with
intent-to-add, and only then opens the gate log and spawns the single `bash -c` child. Nothing
else about the gate changes: the same resolved gate string, the same post-gate chaining, the
same one `marks.gateRuns` entry, the same fd-not-pipe log capture.

Every repair round re-enters `runGate()`, so a file created by a repair worker is staged on the
next round for free, and a path staged on round 1 simply drops out of the untracked list on
round 2.

The entries survive until the checkpoint commit consumes them. Two working-tree behaviors change
while a build is in flight, both observed in spike A3 and neither on the driver's own path:
`git stash` refuses outright (`Entry '<path>' not uptodate. Cannot merge.`, tree left untouched),
and an unstaged diff shows an intent-to-add file's full content instead of omitting it as
untracked. A plain `git commit` does **not** sweep an intent-to-add entry in as an empty file
(spike A2) — it commits only what was explicitly staged, and the entry survives to the next
commit.

For this repo specifically, the first consequence is that a build creating a new file under the
three ratcheted trees now reds its own gate on `tree-over` instead of passing that argument to
review. The sanctioned repair is the existing `size-ratchet.js --reconcile --cite <spec>`, which
sees the file for the same reason the gate did.

## Acceptance Criteria

- **AC-20260910-08-1**: WHEN `--mark integrated` runs the gate on a host whose File Plan names a
  path that exists on disk but is untracked THE SYSTEM SHALL have that path in the git index
  before the gate child starts, observable in the gate's own log (e.g. a File Plan row
  `src/created.js` whose file is untracked, with `gateCommand` `git ls-files -- src/created.js`
  → `gate-1.log` contains `src/created.js`) → test in
  tests/build/build-driver-gate-stage.test.js
- **AC-20260910-08-2**: WHEN the build has also created an untracked file that no File Plan row
  names THE SYSTEM SHALL leave that file untracked (e.g. `src/stray.js` on disk, absent from the
  File Plan → after `--mark integrated`, `git status --porcelain --untracked-files=all` still
  reports `?? src/stray.js` and `git ls-files -- src/stray.js` prints nothing) → test in
  tests/build/build-driver-gate-stage.test.js
- **AC-20260910-08-3**: WHEN the gate exits non-zero and the run lands REPAIR THE SYSTEM SHALL
  leave the staged File Plan path in the index for the repair round (e.g. after a red gate,
  `git ls-files -- src/created.js` prints `src/created.js`) and SHALL have named the staged path
  and its undo command on stderr (e.g. stderr contains `src/created.js` and `git add -N`) → test
  in tests/build/build-driver-gate-stage.test.js
- **AC-20260910-08-4**: WHEN a File Plan path exists on disk as a regular file and the host's
  `.gitignore` ignores it THE SYSTEM SHALL print one `⚠️` stderr line naming that path, leave it
  out of the index, and still run the gate (e.g. `.gitignore` containing `src/hidden.js` and a
  File Plan row `src/hidden.js` → stderr contains `src/hidden.js`, `git ls-files -- src/hidden.js`
  prints nothing, `gate-1.log` exists) → test in tests/build/build-driver-gate-stage.test.js
- **AC-20260910-08-5**: WHEN the intent-to-add cannot be performed THE SYSTEM SHALL exit 2 naming
  the failing git command, record no `gateRuns` entry, and spawn no gate child (e.g. with an
  untracked File Plan path and a pre-existing `.git/index.lock` file, `--mark integrated` exits 2
  and no `gate-1.log` is written) → test in tests/build/build-driver-gate-stage.test.js
- **AC-20260910-08-6**: WHEN a host declares a `postGateCommand` and a round's gate runs THE
  SYSTEM SHALL CONTINUE TO spawn exactly one gate child for that round with the post-gate chained
  inside it, and SHALL CONTINUE TO record exactly one `marks.gateRuns` entry per round (e.g. one
  green `--mark integrated` followed by one `--mark repair-applied` → `gateRuns.length === 2`,
  never 3 or 4) → tests in tests/build/build-driver-post-gate.test.js
- **AC-20260910-08-7**: WHEN `--mark committed` is issued while a File Plan path is present in the
  index as intent-to-add and not yet committed THE SYSTEM SHALL CONTINUE TO refuse the mark naming
  that path (e.g. `src/created.js` staged with `git add -N` and never committed → exit 2 with
  `src/created.js` in stderr) → test in tests/build/build-driver-commit.test.js
- **AC-20260910-08-8**: WHEN the driver prints the host-integration step THE SYSTEM SHALL state
  that new File Plan files are staged into the index when the gate runs (e.g. the INTEGRATION step
  body contains the literal `git add -N`) → test in tests/build/build-driver-gate-stage.test.js

## Assumptions (escalation triggers)

- **A1 (executed)**: `git add -N` on an untracked file makes `git ls-files` list it and a
  `statSync`-based inventory read its real on-disk bytes, not the empty staged blob. Executed
  2026-09-10 in a detached worktree at HEAD: a 3600-byte new file under `scripts/` left untracked
  → `node scripts/size-ratchet.js --root .` printed `size-ratchet: 281 files, 4 trees, all tight`,
  exit 0; the same file after `git add -N` → `size-ratchet: tree-over scripts 65478 > 61878 — cut
  3600 bytes under scripts/, or: … --raise scripts --to 65478 --cite <spec>`, exit 1. The 3600 is
  the real file size. **If false:** STOP — the whole shape rests on it.
- **A2 (executed)**: an intent-to-add entry is reported by `git status --porcelain
  --untracked-files=all` as ` A <path>` (so `gitStatusPaths()`'s `slice(3)` still yields the
  path), appears in `git diff --name-only HEAD`, and is **not** swept into a plain `git commit` as
  an empty file. Executed 2026-09-10 in a throwaway repo: after `git add -N scripts/new.js
  tests/new.test.js`, status printed ` A scripts/new.js` / ` A tests/new.test.js`; `git commit -m
  try` with only `scripts/old.js` explicitly staged committed 1 file and left both ` A` entries in
  status. **If false:** the commit gate or the ledger's diff counts are affected — STOP and ask.
- **A3 (executed)**: `git stash` refuses in a tree holding intent-to-add entries and leaves the
  tree untouched. Executed 2026-09-10: `error: Entry 'scripts/new.js' not uptodate. Cannot merge.
  / Cannot save the current worktree state`, status unchanged afterwards. Nothing on the build or
  review path runs `git stash` (`/git:merge` names it only as remedy prose to a human, and it
  already refuses on a dirty tree). **If false:** if a host hook is found to stash mid-build, D3
  is revisited — the driver would revert after the final green gate only.
- **A4 (executed)**: a pre-existing `.git/index.lock` fails `git add -N` with exit 128 and leaves
  `git ls-files`, `git status`, `git diff` and `git rev-parse` all at exit 0 — a clean isolated
  trigger for AC-20260910-08-5. Executed 2026-09-10. **If false:** use any other deterministic way
  to make one `git add` fail; the AC is about the refusal, not about the trigger.
- **A5 (executed)**: `git ls-files -o --exclude-standard -- <pathspecs>` lists untracked
  non-ignored files, resolves a directory pathspec to the files under it, and omits ignored files
  — so one call gives D1's add set and, against `git ls-files -- <pathspecs>`, D4's ignored set.
  Executed 2026-09-10: with `.gitignore` naming `scripts/ign.js`, the call over `scripts` and
  `tests/new.test.js` printed exactly `scripts/new.js` and `tests/new.test.js`. **If false:** fall
  back to `git check-ignore -v` for the D4 set; D1's set is unaffected.
- **A6 (prediction, not an inventory)**: no test in this repo asserts the driver's git-call set or
  `spec/commands/build.md`'s "runs a git write" clause — grepped at lock across `tests/`, zero
  hits. **If false:** the pin is updated in place and retagged with this spec's AC-ID in the same
  build, never weakened.
- **A7 (prediction, not an inventory)**: the existing build-driver fixtures already carry two
  untracked File Plan CREATE rows (`src/bar.js`, `tests/foo.test.js`), so every existing driver
  test that reaches `--mark integrated` will exercise the new staging — and none of them asserts
  on git index or working-tree state. Grepped at lock across `tests/build/` for
  `porcelain`/`ls-files`/`untracked`/`status`/`diff`: the single hit is a
  `git diff --shortstat <base> HEAD` over committed history, which index entries cannot move. No
  fixture repair is planned. **If false:** repair the fixture in the same batch — add the
  commit/reset the test needs, never weaken an assertion and never narrow the staging to dodge a
  fixture.

## Rationale

The originally queued shape was a second post-gate run at `--mark committed`, after the
checkpoint commit made the new files tracked. That is a symptom fix: it amends
specs/20260910/07 D1's locked "exactly one gate run per round", doubles the wall-clock of every
build, and opens a question nobody has answered — what a red gate means once the commit already
exists. Moving the visibility one step earlier, into the gate child's own preamble, makes the
question disappear. It was rejected in favour of D1 and should not be re-litigated.

Two further alternatives were rejected and are recorded so a cold reader does not reopen them.
Moving the checkpoint commit earlier, before the gate, changes repair semantics for every host
(a repair round would then be amending a commit rather than the working tree). Making
`size-ratchet.js` read the working tree instead of the index contradicts its own tested rule —
`git ls-files` is its inventory by design, "untracked files never count" is AC-20260908-01-8 —
and would fix exactly one host's one check while every other host's index-reading post-gate
stayed blind.

The scope call in D2 is the load-bearing one. A wider pathspec would catch out-of-plan creations
too, which sounds like a bonus until the session's checkpoint commit sweeps a scratch file into
the branch because the driver put it in the index. Bounding the staging to the File Plan means
the driver only ever stages files the spec already says will be committed, and leaves out-of-plan
detection where it already lives, in `scope-reconcile` at COMMIT.

Collision closure ran at lock over the one literal this spec narrows, `git write`
(`rev-parse` was swept too and dropped: this spec adds a call to D12's allowed set, it retires
nothing by that name, so the stem was pure noise). Ten literals-leg hits, two of them already
File Plan rows. Eight waived: seven are inside
`.claude/worktrees/spec-03-client-journey-player/`, a stale sibling checkout rather than live
surface in this tree, and the eighth is `spec/scripts/spec-review-driver.js`, whose only match
is the unrelated phrase `git write-tree` in its scratch-index snapshot. The paths leg's
`likely`/`mentions` rows owe nothing.

What to watch during execution: the driver's `changedSinceBase()` collects untracked paths from
`git status`'s `??` lines and tracked ones from `git diff --name-only <base>`. After the staging
a path moves from the first list to the second (spike A2), so the union is unchanged — but any
worker touching that function should be told, because the `??` branch alone no longer sees a
staged File Plan path. Expect one repair round on this build itself: the new test file will red
the ratchet on `tree-over`, which is D11's reconcile, and the round is the feature working.

## Canonical Delta

`docs/canonical/build-integrity.md`, in the section describing the build driver's gate:

> Before the gate child is spawned, the driver adds every File Plan path that is untracked and
> not git-ignored to the index with intent-to-add (`git add -N`). A host check whose inventory is
> the git index — a size or duplication baseline, a file manifest — therefore counts the files
> the build just created, at build time, instead of first seeing them at review after the
> checkpoint commit. The staging is bounded to the File Plan: a creation outside it stays
> untracked and remains a scope-reconcile finding. The entries are never reverted by the driver;
> they persist through repair rounds, whose fix tooling reads the same index, and are consumed by
> the checkpoint commit. A File Plan path that git ignores is warned about and skipped, and a
> failed staging refuses the mark rather than letting the gate run blind. This is the driver's
> only index write; every other git call it makes is still a read.
