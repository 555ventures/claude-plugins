# 0044. The queue file holds what was placed; readers derive the rest

- Status: accepted
- Date: 2026-11-06
- Amended by: docs/adr/0045-the-queue-lives-on-trunk.md ("the file" is now one tracked file per item on trunk)
- Deciders: JJ + session (specs/20261105/16-the-queue-fills-itself-again.md)
- Amends: ADR-0041 §1 (what the queue holds) and §6 (the proof), and ADR-0042 (what the file holds).
  ADR-0041 §5 and ADR-0042's single owner, version 3 file and strict read stand.

## Context

v7's queue filled itself and wrote the fill to its file. v8 cut the fill, so `/spec:status` showed
work that `/spec:queue list` did not. Restoring v7's written fill would close that gap but put a
second copy of spec state in the file, and with it the reconcile, re-fill and dedupe work that keeps
a copy true. Agents mainly write the queue, and JJ reads it often to see the tasks and where the
work stands. JJ also asked that every row show its type.

## Options considered

- **Write the fill, as v7 did** — output matches v7, ids are stable and order is stored, but the file
  copies spec state and can go stale without an agent noticing.
- **Keep the file to what was added and show nothing else** — today's behaviour; the two screens disagree.
- **Derive the fill on every read and store only what was placed** (chosen) — one answer, no copy to
  keep true. Order among filled items is not stored, and `add` lands ahead of filled work.

## Decision

1. The queue file holds what was placed, by a user or an agent. `lib/queue.js` derives every other
   open brief and ad-hoc spec on read, and `next`, `list`, `show`, `groom`, `status` and fanout write
   nothing. `move` or `done` on a filled item stores that one item.
2. Bare fanout builds every startable hardened spec, queued or not. `plan.js lock` adds nothing to
   the queue. A spec that must not run stays `draft`.
3. Queue rows on `/spec:queue list` and `/spec:status` show their type (🏃 run, 📝 plan, 🧪 prototype,
   🔧 fix, 📌 decide) and `🔨 in progress`. v7 had neither, so ADR-0041 §6's byte proof compares after
   those marks are removed, and `list` is compared with v7 on identical item sets under a normaliser.

## Consequences

- A reader cannot go stale, and the file never needs a re-fill.
- A filled item has no `qN`; it is named by its brief number or spec path.
- `list` and `next` no longer match v7 byte for byte. `next` has no `seeded` line.
- A status `/spec:run` row no longer pastes as a whole line; `/spec:queue next` stays the bare line.
