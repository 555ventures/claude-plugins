# 0050. Only your queue commands commit

- Status: accepted
- Date: 2026-11-08
- Deciders: JJ + session (specs/20261108/06-the-queue-syncs-through-your-own-commands.md)
- Supersedes: ADR-0045 (the queue lives on trunk)
- Amends: ADR-0042 (the `{version: 3, seq, items[]}` file) and ADR-0044 (what "the file" is). ADR-0042's
  single owner and strict read, and ADR-0044's "the file holds what was placed; readers derive the rest", stand.

## Context

JJ works on three machines, and the queue file in the git common dir never leaves the one it is on. ADR-0045
moved every placed item to a tracked file on trunk, written by whichever script placed it. The build of
specs/20261106/01 showed what that costs: drivers write in the middle of runs (a park during an in-place run on a
side branch, the advisories fix, a landing's ticks, a fanout hold), so every driver write needed a warn-and-carry-on
refusal, a lock, `index.lock` retries in `git.raw`, a staged-path retry in `mergeBack`, and reports that read each
write's outcome. Its review still found a report printing `Next: /spec:plan null`, a squash merge committing a
staged queue file, and a GATE rule that could never fire behind the nothing-changed check. JJ approved a split by
who places the item (2026-11-08).

## Options considered

- **Keep ADR-0045: every item on trunk** — the superseded build; every driver write needs a refusal path and every
  landing shares the index with queue commits.
- **A custom sync ref fetched on read** — rejected by ADR-0045: the network on every read, and an item arriving
  before its unpushed spec reads closed.
- **Split by who places the item** (chosen) — the user's own `/spec:queue add|move|done` commits tracked files;
  drivers write only the machine-local file; every driver close is read from trunk.

## Decision

1. Two stores, one owner (`lib/queue.js`). An item the user places is `specs/queue/YYYYMMDD-xxxx.json`, tracked
   in the main checkout. An item a driver places stays in `<git-common-dir>/spec-queue.json`, now
   `{version: 4, items[], holds{}}`. Both read as one list ordered by a decimal-string rank, then id. There is no
   shared sequence.
2. Only `/spec:queue add`, `move` and `done` write the tracked store: one commit of their own paths on trunk,
   refused with its remedy while the main checkout is off trunk, detached, or mid-merge, mid-rebase,
   mid-cherry-pick or mid-revert. The same commit deletes the tracked files trunk already reads as done.
3. No driver writes a tracked path or ticks an item. Every close is worked out on read from trunk: a spec's status,
   a brief that is finished with no open step, and a `Queue: <id>` trailer on the commit that finished a prompt item
   (a fix commit, a lock commit). A fanout hold on a tracked item is a machine-local overlay keyed by id.
4. `specs/queue/` is outside every run's tree: the gate cache, a run's diff, scope and commit, and release's promote
   check ignore it. `land()` needs no queue rule.
5. The scripts never push, pull or fetch. `/spec:migrate` converts each machine's file once, moving its open rows
   to tracked files with new ids.

## Consequences

- The items JJ places follow the repo. Items a run, fanout or prototype queues stay on the machine that made them,
  and that is accepted.
- No driver path can fail on git state, so the refusal-and-warn layer, the queue lock and the `index.lock` retries
  of the superseded build never exist.
- Text JJ places is repo history, readable by anyone with repo access; item files pass the secrets scan first, as a
  last line of defence.
- A queued brief whose specs are all done with no open step closes on read, as v7's did, and the decide line asking
  to close it goes.
- A fix finished on a side branch closes its item only once that branch reaches trunk.
- Trunk gains one small commit per queue write, JJ pushes before switching machines, and `/spec:queue` writes stop
  while the main checkout is on a side branch.
