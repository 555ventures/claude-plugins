---
date: 2026-11-06
status: draft
area: queue
depends_on: []
brief: n/a
architecture: true
breaking: true
---

# The queue travels with the repo

## Intent
- You asked: Sync the queue across my 3 machines by making placed queue items committed files, one per item, under specs/queue/. Each item has a collision-free id (date + 4 hex) and its own rank, so a move changes one file. Every queue write commits that one path. Done on a placed prompt deletes its file; a ticked filled brief or spec keeps a tiny tombstone. All queue reads and writes go through the main checkout, never a lane branch, so an abandoned lane loses nothing and queue files never enter a lane's diff. Take a lock around those commits so parallel lanes cannot collide on the git index. Remove .git/spec-queue.json with format v4 and one /spec:migrate step that moves open items and drops done prompt rows. Add an ADR that amends the common-dir decision.
- I will build:
  - Format v4: one JSON file per placed item at `specs/queue/YYYYMMDD-xxxx.json`, a rank of its own, no shared sequence, read and written only by the queue owner.
  - Every queue write resolves the main checkout from any worktree, takes one machine-wide lock, and commits only its own path on trunk.
  - The trunk commits this adds cost no gate re-run and break no merge: queue paths leave the gate's tree hash and every build diff, and fanout, `/spec:run` and `/spec:release` treat a queue-only trunk move as no move.
  - `/spec:migrate` moves a repo's old queue file into item files, once per machine, dropping done rows and removing the old file.
  - A real run across two clones proves it end to end.
- I will not touch:
  - Pushing, pulling or fetching: no script does any of these.
  - `spec-fanout.json`, `*.run/`, the gate cache and every other machine-local file.
  - What the queue means: the fill, `after` gates, types, `next`, `list` and `groom` rows, except that ids get longer.
  - This repo's own `.git/spec-queue.json`: the build never runs `--apply` here; the owner migrates after the merge.
- Architecture or behaviour change: yes — the queue moves from an untracked git-dir file to tracked files on trunk, and queue writes refuse in some checkout states, needs your yes
- Client sign-off: breaking change to the queue's home and format — yes, approve; queue writes on a side branch or mid-merge — refuse with instructions; queue text visible to everyone on each repo — accept, block secrets

## Goal

Run `git push` on one machine and `git pull` on another, and `/spec:queue list` shows the same items in the same order on both. Parallel lanes keep merging without an added full-suite gate or a failed fast-forward, and an abandoned lane loses no queue item. No `.git/spec-queue.json` remains after `/spec:migrate`.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | The queue's home is tracked files under `specs/queue/`. This overturns specs/20260823/08 D1 (one file in the git common dir), repeated in ADR-0042's Decision and the file line of `lib/queue.js`. ADR-0045 (`docs/adr/0045-the-queue-lives-on-trunk.md`) records this: it amends ADR-0042 (the `{version: 3, seq, items[]}` file) and ADR-0044 (what "the file" is); no existing ADR records the common-dir choice itself, so it cites the spec. ADR-0042's single owner and strict read, and ADR-0044's "holds what was placed, readers derive the rest", stand. | The common dir never leaves a machine. |
| D2 | An open item is `{version: 4, id, rank, kind, type?, spec?, payload, added?, after?}`; a tombstone is `{version: 4, id, kind, payload, done}`. The id and file stem are `YYYYMMDD-xxxx` (local date, 4 random hex; retried if that file exists locally). `seq` goes. | No shared counter, so two machines cannot hand out one id. A same-day collision across machines is 1 in 65,536 and surfaces as a git add/add conflict. |
| D3 | `rank` is a decimal string of any length, compared numerically; ties break by id. Append is floor(last) + 1, `--top` is ceil(first) - 1, and between two items is their exact midpoint computed with BigInt. A rank never runs out, so no renumbering exists. Two machines appending the same rank both keep it and read in id order everywhere. | A move changes one file. A float runs out after about 50 moves into one gap and would need a renumber path. |
| D4 | Writes refuse (exit 2, naming the state and the remedy, nothing written) when the main checkout is not on trunk, is detached, or is mid-merge, mid-rebase, mid-cherry-pick or mid-revert. Reads never refuse on git state: they read the main checkout's files, and `queue next` and `list` warn on stderr when it is off trunk. [asked: refuse with instructions] | A partial commit is impossible during a merge, and a commit on a feature branch would strand the item there. Loud beats a queue split across branches. |
| D5 | An in-place run on trunk does not block a write: the path-limited commit leaves the builder's uncommitted edits alone, and D9 keeps the moved HEAD out of its diff. The in-place COMMIT step (`commitAll` with `add -A`, run.js:477) holds the D7 lock when the worktree is the main checkout. | Nothing about an in-place run conflicts except the index. |
| D6 | `run.js` FINISH with the main checkout blocked under D4 does not tick: its report warns that the item stays open and names the blocked state. A spec item still closes through `reconcile` once the done spec reaches trunk. Every other write in a run (park, separate, needs-plan: run.js:893, :1040, :1052) refuses, and the same mark succeeds when re-run after the remedy. | FINISH runs after the work has landed on a branch for a PR; failing there would strand a finished run. The other writes are re-runnable marks. |
| D7 | The lock is `<git-common-dir>/spec-queue.lock/`, the gate lock's pid-file directory with dead-pid cleanup (specs/20261105/08 D5, `takeSlot` in `lib/host.js`), generalised to a name, a limit of 1, a 100 ms poll and a 60 s limit that refuses naming the holder. It is held across the D4 check, the file write and the commit. It also wraps every other script write to the main checkout's index: `mergeBack` in fanout and `run.js`, fanout `finalize`'s done commit, and the `plan.js` lock commit. It is never nested. | Locking queue writers alone would still collide with a merge on `index.lock`. The lock stays on the machine, as it only guards one index. |
| D8 | A write is `git add -- <path>` then `git commit -q --no-verify -m "chore(queue): <verb> <id>" -- <path>`, run in the main checkout. A tick that closes several twins (D15) commits those paths together. Host hooks are skipped like fanout's bookkeeping commit (fanout.js:507, `noVerify`); `plan.js` is the path-limited precedent (plan.js:88-89). No write leaves tracked dirt, so run.js:209 stays satisfied. A failed commit is thrown as it is, with no rollback. | One item, one path, one commit. |
| D9 | `git.js` owns `QUEUE_DIR = 'specs/queue'`. `git.diff` and `git.changedFiles` exclude it, and `host.js` adds it to `OVERLAY` so `treeSha` skips it. | A queue commit between gate and merge must not change the gated tree. Without this, fanout.js `moved` re-runs the full suite (the cache key is the tree), and an in-place run's scope check sees queue files as out-of-plan. |
| D10 | Lane base and merge order are not disturbed. Merge order is `s.batch` order (`deriveMerge`) and never reads trunk. A lane's base only matters through D9. `moved` stays true on a queue commit but its gate is now a cache hit. `lane.conflictAt` changing with a queue commit costs at most one more send-back, and it stays. | Read in fanout.js `mergeLane`, `deriveMerge`; no change needed beyond D9 and D11. |
| D11 | `mergeLane` closes the gap between gate and fast-forward: inside the D7 lock, when trunk moved since the rebase and `git.queueOnly(from, to)` is true (every changed path is under `QUEUE_DIR`), it rebases once more, then fast-forwards. Any other trunk move refuses exactly as today (fanout.js `fast-forward … failed`). `run.js` `merge()` does the same before `mergeBack` under `mergeStrategy: ff-only`; merge-commit and squash need nothing. | A lane parking or anyone adding an item during a minutes-long gate would otherwise fail the ff-only merge, a failure queue commits make routine. |
| D12 | `release.js --promote` accepts a record when `rec.sha` equals HEAD or `git.queueOnly(rec.sha, HEAD)`. | release.js:77 refuses any HEAD move, so a tick after staging would force a new staging run for no code change. |
| D13 | `Q.read` and every write resolve the main checkout as `git worktree list`'s first entry (moved from run.js:80 to `git.js`, joined with `rev-parse --show-prefix` so a `--root` subdirectory keeps working). A lane's copy of `specs/queue/` is never read or written. `reconcile` and `fill` keep using the caller's `root` for spec state. `next.js` overlay stops reading the file and calls the owner; it stays off in a linked worktree, as today. | An abandoned lane holds nothing the queue needs. |
| D14 | Reconcile never writes: its `done` stays in memory (the old "written with the next write" goes, since a write commits one path). An item that arrives before its unpushed spec therefore shows as closed on that machine and returns when the spec arrives. | This is the false close that ruled out a custom ref (lib/queue.js:81): here it cannot be stored. |
| D15 | Dedupe across machines is exact-match only, by key: a brief by number, a spec by path, a prompt by type + spec + payload. `fill` keeps the first in rank order and hides the rest, extending today's rule (lib/queue.js:101-104) to prompts. Any write on an item also deletes its open twins in the same commit. | The same item added on two machines reads as one and goes away as one. No fuzzy match, no merge step. |
| D16 | Done on a prompt deletes its file. Done on a brief or spec writes a tombstone only when the fill would otherwise bring the work back (spec not done or superseded, brief not done or superseded, or the spec file missing here); finished work deletes the file. `done` on a filled item is one write, so `place` then `tick` becomes one call. | The owner's rule: prefer delete. A tombstone exists only to hold the "comes back last" ordering at lib/queue.js:113-114. |
| D17 | Strict reader: any `<git-common-dir>/spec-queue.json` refuses with `run /spec:migrate`. Every `specs/queue/*.json` must parse, carry version 4, and match its file name, else refuse naming the file (a conflict marker lands here). Names ending `.tmp` are skipped (`writeJson` is tmp + rename). No directory means no items. | ADR-0042: one migration, no tolerant reads. |
| D18 | Queue text becomes repo history that anyone with repo access can read, in every host repo, with no opt-out. Each new item file goes through `git.js`'s secrets scan before its commit, and a hit refuses naming the rule, not the text. [asked: accept, block secrets] | The queue was private to a machine until now, and `commitAll` is the only commit path that scans. |
| D19 | The scripts never push, pull or fetch. The owner runs `git push` before switching machines. Same item changed on two machines is a normal git conflict, resolved by hand: D17 refuses until it is. | Already decided. Disjoint items are disjoint files, so they merge with no conflict. |
| D20 | No sync over a custom git ref and no fetch on read. | Already decided: an item arriving before its unpushed spec would be falsely closed (lib/queue.js:77-84), plus network on every read and push races. |
| D21 | Run and fanout state stay machine-local. | Already decided. |
| D22 | `/spec:migrate` is the only converter, with no older-plugin support. Any old file (versions 1 to 3) is one `queue` op: existing conversion, then each open item becomes a file with ranks 1, 2, 3 in stored order, every field including `after`, `type`, `spec` and `added` carried unchanged, and a new id dated from `added` (today when absent). Done prompt rows drop. Done brief and spec rows follow D16. An item matching an already committed open item by the D15 key is skipped, so migrating a second machine after a pull merges its local items. The old file is deleted last; `backup()` keeps a copy. | Each machine holds a different local queue, so all three must merge, not overwrite. |
| D23 | Migrate traps, read in code. `v7Pending` (migrate.js) treats any `queue` op except version 2 as a v7 artifact, so a version 3 file would tag `spec-v7-final` and delete `spec-run-cache`: it must exclude every old queue version. `readJson` returns null for bad JSON, so an unparseable old file would plan nothing while the reader refuses forever: plan refuses naming it. Apply refuses unless run in the main checkout, on trunk, and D4-clear. A queue-only migration commits as `chore(spec): migrate queue to v4`. A secrets hit in an item refuses apply naming the old id. After a crash mid-apply the dirty-tree refusal names the files; there is no resume. | Recent history: 6f2858fe fixed this same class of false idempotency. |
| D24 | `genesis.js` drops its `Q.add` loop (genesis.js:146). | ADR-0044's fill already lists every unfinished brief in the same order, and the loop would commit on a repo whose trunk is not yet configured. |
| D25 | No host-config change for `specs/`: the path is fixed in code (plan.js:21, work.js:40), so "specs elsewhere" does not exist. A host that gitignores `specs/` fails at `git add`, loudly. With no git, the reader throws the same `not inside a git repository` error, so `plan.js`'s `no queue outside git` catch (plan.js:91-92), the `next.js` overlay and the CLI behave as today. | Nothing new to configure. |
| D26 | No scanner change: `walkSpecs` and `specsCiting` take only `.md`, `isSpecText` only `.md`, doctor's `walkRuns` only `.run` dirs, migrate's `walk` only sidecars and `.deviations.md`, and `IGNORE` does not cover `specs/queue/`. | Read in work.js:29-38, state.js:260, :373-388, doctor.js:17-27. |
| D27 | The storage half lives in a new `lib/queue-files.js` (paths, item read and write, rank maths, lock and commit), required only by `lib/queue.js`. The AC-20261105-12-6 owner list gains it and `lib/queue.js` stays within its 200-line test cap. `Q.write` and `Q.place` go; `add`, `tick` and new `move`, `done` are the write surface. | The cap is pinned, and the rest of the code must not see storage. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/queue-files.js | CREATE | item files, id, rank maths, D4 check, locked path commit, secrets scan (D2-D4, D7, D8, D17, D18) |
| spec/scripts/lib/queue.js | MODIFY | version 4, read through the main checkout, memory-only reconcile, prompt dedupe, twins, `move`, `done`, tombstone rule (D13-D16, D27) |
| spec/scripts/queue.js | MODIFY | `move` and `done` call the owner; off-trunk warning |
| spec/scripts/lib/next.js | MODIFY | overlay reads through the owner |
| spec/scripts/lib/git.js | MODIFY | `QUEUE_DIR`, `mainRoot`, `queueOnly`, diff exclusions, exported `scanFile` (D9, D11, D13) |
| spec/scripts/lib/host.js | MODIFY | `OVERLAY` gains the queue; the slot lock generalised (D7, D9) |
| spec/scripts/run.js | MODIFY | FINISH off trunk, in-place commit lock, merge lock and ff-only rebase (D5, D6, D7, D11) |
| spec/scripts/fanout.js | MODIFY | `mergeLane` and `finalize` under the lock (D7, D11) |
| spec/scripts/plan.js | MODIFY | lock commit under the lock (D7) |
| spec/scripts/release.js | MODIFY | queue-only HEAD move is no move (D12) |
| spec/scripts/migrate.js | MODIFY | the v4 step and its traps (D22, D23) |
| spec/scripts/genesis.js | MODIFY | drop the `Q.add` loop (D24) |
| spec/doctrine.md | MODIFY | Files section: the queue is in `specs/queue/` |
| spec/commands/queue.md | MODIFY | item files, refusals, push before switching machines |
| spec/commands/migrate.md | MODIFY | the v4 step, run once per machine after a pull |
| docs/v8/interface-contract.md | MODIFY | §3 row and §7 for version 4 |
| docs/v8/architecture.md | MODIFY | queue row and the lock |
| tests/queue-sync.test.js | CREATE | the two-clone and real-lane runs (AC 1 to 4) |
| tests/queue.test.js | MODIFY | new path, ids, ranks, owner list, contract pins |
| tests/migrate.test.js | MODIFY | the v4 step, idempotency, traps |
| tests/fanout.test.js | MODIFY | queue-only trunk moves |
| tests/run.test.js | MODIFY | FINISH off trunk, in-place write, ff-only |
| tests/git.test.js | MODIFY | `queueOnly`, diff exclusion |
| tests/host.test.js | MODIFY | tree hash ignores the queue; lock limit |
| tests/release.test.js | MODIFY | queue-only promote |
| tests/helpers.js | MODIFY | queue seeding through item files |
| tests/status.test.js | MODIFY | seeded queues and longer ids |
| tests/plan.test.js | MODIFY | seeded queues |
| tests/prototype.test.js | MODIFY | seeded queues |
| tests/doctor.test.js | MODIFY | old-file report |
| tests/genesis.test.js | MODIFY | no stored brief items |

## Acceptance Criteria

- **AC-20261106-01-1**: WHEN two real clones of one bare origin each add, move and tick items through `queue.js`, then push and pull with plain git THE SYSTEM SHALL print identical `list --json` output on both, with no conflict and no script having run push, pull or fetch; the commands and output are recorded in `<spec>.run/evidence.md`.
- **AC-20261106-01-2**: WHEN a real lane worktree runs a mark that queues an item THE SYSTEM SHALL commit it on trunk in the main checkout, leave `git status --porcelain` clean there, and leave the lane branch's diff free of `specs/queue/`; WHEN that lane is then abandoned and its worktree removed the item SHALL still be listed.
- **AC-20261106-01-3**: WHEN a fanout lane's gate command itself runs `queue add` on trunk THE SYSTEM SHALL still land the lane by fast-forward, with no refusal and no second full gate run.
- **AC-20261106-01-4**: WHEN a queue-only commit lands between a lane's green gate and its merge THE SYSTEM SHALL return `cached: true` from both the rebased-tree gate and the trunk gate.
- **AC-20261106-01-5**: WHEN an item is added or moved THE SYSTEM SHALL change exactly one path in one commit, with `--top`, append and 200 repeated moves into one gap all keeping the requested order and no other file touched.
- **AC-20261106-01-6**: WHEN two machines append an item at the same rank THE SYSTEM SHALL order them by id on both.
- **AC-20261106-01-7**: WHEN `done` closes a placed prompt THE SYSTEM SHALL delete its file; WHEN it closes unfinished brief or spec work, filled or placed, it SHALL leave one tombstone in one commit and list the work last; WHEN the work is finished it SHALL delete the file.
- **AC-20261106-01-8**: WHEN the same item is added on two clones THE SYSTEM SHALL show it once after the pull, and WHEN it is then moved or ticked both files SHALL be gone or reduced to one in that commit.
- **AC-20261106-01-9**: WHEN a write runs with the main checkout on another branch, detached, mid-merge, mid-rebase, mid-cherry-pick or mid-revert THE SYSTEM SHALL exit 2 naming the state and remedy and change nothing; WHEN `list` runs in that state it SHALL print the items and, off trunk, a warning.
- **AC-20261106-01-10**: WHEN a write runs during an in-place run on trunk with uncommitted tracked edits and staged files THE SYSTEM SHALL commit only the queue path, leave those edits and staged files as they were, and not report the queue path as out of plan at GATE.
- **AC-20261106-01-11**: WHEN `run.js` reaches FINISH with the main checkout off trunk THE SYSTEM SHALL finish, warn that the item stays open, and write nothing; WHEN a park mark is refused under D4 the same mark SHALL succeed after the remedy.
- **AC-20261106-01-12**: WHEN four processes write at once while a merge runs in the main checkout THE SYSTEM SHALL land all writes with no `index.lock` error; WHEN a lock holder's pid is dead it SHALL be cleared; WHEN a live holder exceeds 60 s the writer SHALL refuse naming it.
- **AC-20261106-01-13**: WHEN `mergeStrategy` is `ff-only` and only queue commits moved trunk during a `/spec:run` THE SYSTEM SHALL merge; WHEN a non-queue commit moved trunk during fanout's gate it SHALL refuse as it does today.
- **AC-20261106-01-14**: WHEN HEAD moved since the green staging run by queue commits only THE SYSTEM SHALL promote; WHEN any other path changed it SHALL refuse as today.
- **AC-20261106-01-15**: WHEN `.git/spec-queue.json` exists THE SYSTEM SHALL refuse every queue read through `Q.read` naming `/spec:migrate`, and the status screen SHALL offer it; WHEN an item file is invalid JSON, has another version, or a name that differs from its id, the refusal SHALL name that file.
- **AC-20261106-01-16**: WHEN `/spec:migrate --apply` runs on a version 3 file THE SYSTEM SHALL write one file per open item in stored order with `after`, `type`, `spec` and `added` unchanged, drop done prompt rows and finished done rows, keep tombstones only under D16, delete the old file, keep a backup, and commit once; a real file with 4 open prompts and 39 done rows SHALL give 4 item files plus tombstones for unfinished work only, recorded in `<spec>.run/evidence.md`.
- **AC-20261106-01-17**: WHEN `--apply` runs a second time THE SYSTEM SHALL plan nothing, change nothing and print `nothing to migrate`; WHEN it migrates a version 3 file THE SYSTEM SHALL create no `spec-v7-final` tag and leave `spec-run-cache` and an idle `spec-fanout.json` in place.
- **AC-20261106-01-18**: WHEN a second clone with its own old file pulls the first clone's migration and migrates THE SYSTEM SHALL add only its items that are not already there, after the existing ranks.
- **AC-20261106-01-19**: WHEN `--apply` runs off trunk, in a linked worktree, during a live fan-out, or on an unparseable old file THE SYSTEM SHALL refuse with exit 2 and change nothing.
- **AC-20261106-01-20**: WHEN an item's text matches the secrets scan THE SYSTEM SHALL refuse the write naming the rule without echoing the text, and no file or commit SHALL remain.
- **AC-20261106-01-21**: WHEN the host has no git THE SYSTEM SHALL lock a spec through `plan.js` with no queue and no error, as today.
- **AC-20261106-01-22**: WHEN `specs/queue/` holds items THE SYSTEM SHALL report no spec, sidecar, stale-run or anomaly for them in `readSpecs`, `status` or `doctor`, and `doctor` SHALL stay healthy.
- **AC-20261106-01-23**: WHEN an item's spec file has not arrived on this clone THE SYSTEM SHALL hide the item without storing that, and SHALL list it again once the spec arrives.
- **AC-20261106-01-24**: WHEN genesis finishes its roadmap THE SYSTEM SHALL list every brief through the fill with no item files written.
- **AC-20261106-01-25**: WHEN `spec/doctrine.md`, `queue.md`, `migrate.md`, the contract and architecture are read THE SYSTEM SHALL name `specs/queue/`, version 4 and the push-before-switching rule, and SHALL no longer name `spec-queue.json` as the live store.

## Assumptions

- A1: The partial-commit behaviour D4, D5 and D8 rest on (other staged files untouched; refused mid-merge; a deleted path commits; an unborn branch commits) is standard git. A throwaway check was blocked here, so AC 9, 10 and 12 are its first real proof — if false: change the write to a scratch-index commit plus an index refresh, under the same lock.
- A2: Only scripts write `specs/queue/`. D9 hides a builder's stray edit from the diff and the scope check — if false: refuse at GATE on any lane change under `QUEUE_DIR`.
- A3: A spec item left open by FINISH off trunk stays as a small closed file after the PR lands, counted in `list`'s done figure — if false: a write deletes items whose spec reads done or superseded, never items whose spec is merely missing (D14).
- A4: No host test reads `specs/queue/`, so skipping it in the tree hash cannot hide a real failure — if false: such a host needs the gate re-run; add a config key then.
- A5: The main checkout is never a bare repo (run.js's `mainRoot` already assumes this) — if false: refuse there.
- A6: One commit per queue write is acceptable noise on trunk — if false: batch ticks at the end of a fanout batch.
