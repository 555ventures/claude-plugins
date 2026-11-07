# 0045. The queue lives on trunk

- Status: accepted
- Date: 2026-11-06
- Deciders: JJ + session (specs/20261106/01-the-queue-travels-with-the-repo.md)
- Amends: ADR-0042 (the `{version: 3, seq, items[]}` file) and ADR-0044 (what "the file" is), and
  overturns specs/20260823/08 D1 (one file in the git common dir). ADR-0042's single owner and strict
  read, and ADR-0044's "the file holds what was placed; readers derive the rest", stand.

## Context

specs/20260823/08 D1 put the queue in `<git-common-dir>/spec-queue.json`: shared by every worktree,
invisible to `git status`. The common dir never leaves a machine, and JJ works on three, so each holds
a different queue. No ADR recorded the location itself; ADR-0042 and ADR-0044 only repeat it.

## Options considered

- **Keep the common-dir file** — no sync, the three queues stay apart.
- **Sync over a custom git ref, fetching on read** — keeps the working tree clean, but `reconcile`
  closes a spec item whose file is missing (`lib/queue.js:77-84`), so an item arriving before its
  unpushed spec would be falsely closed; it also puts the network on every read and adds push races.
- **Committed files on trunk, one per item** (chosen) — plain `git push` and `git pull` carry the
  queue, disjoint items merge with no conflict, and the item and its spec travel the same way.

## Decision

1. A placed item is a tracked file, `specs/queue/YYYYMMDD-xxxx.json`, format version 4, with its own
   rank, so a move changes one file. There is no shared sequence.
2. Every queue read and write goes through the main checkout, never a lane branch. Every write takes
   one machine-wide lock and commits only its own path on trunk. A write refuses when the main
   checkout is off trunk or mid-merge, mid-rebase, mid-cherry-pick or mid-revert.
3. Queue paths are not part of the gated tree or any build diff, and a trunk move that touches only
   them counts as no move for merges and release.
4. Done on a prompt deletes its file; ticked unfinished brief or spec work keeps a tombstone.
5. The scripts never push, pull or fetch. Run and fanout state stay machine-local.
6. `/spec:migrate` is the only converter, run once per machine; `.git/spec-queue.json` is removed and
   any such file is a refusal naming it.

## Consequences

- The queue follows the repo, and an abandoned lane loses nothing.
- Queue text is repo history, readable by anyone with repo access, with no opt-out; item files pass
  the secrets scan before commit.
- Trunk gains one small commit per queue write, and JJ must push before switching machines.
- `/spec:queue` writes stop while the main checkout is on a side branch.
- The same item changed on two machines is an ordinary git conflict, resolved by hand.
