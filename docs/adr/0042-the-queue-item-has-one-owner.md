# 0042. The queue item has one owner

- Status: accepted
- Date: 2026-11-05
- Amends: ADR-0041 §1 (the item shape)
- Amended by: docs/adr/0044-the-file-holds-what-was-placed.md (the file holds what was placed; readers derive the rest)
- Amended by: docs/adr/0045-the-queue-lives-on-trunk.md (one tracked file per item on trunk, version 4)
- Deciders: JJ + session (specs/20261105/12-the-queue-item-has-one-owner.md)

## Context

A queue item was a raw JSON record that nothing owned. Five scripts built items by hand, and the
command lived in two places: `type` and an optional `/spec:<type> ` prefix in `payload`. Status
trusted `type`; fanout also required the prefix. shop-bltr's q52 (`type: fix`, bare text) showed
as a fix and fanout skipped it silently. Real queue files also carry several shapes under
`version: 1` and `version: 2`.

## Options considered

- **Fix the readers only** — fanout reads `type` like status. Smallest, but items stay hand-built
  and the two carriers stay, so the next writer can recreate the bug.
- **One owner, normalise on read** — no migration, but tolerant parsing stays forever, to serve
  older plugins JJ does not run.
- **One owner, version 3, one migration, strict read** — JJ runs `/spec:migrate` on every repo and
  uses only v8, so no compatibility code is needed.

## Decision

The third. `spec/scripts/lib/queue.js` is the only code that reads, writes, creates or ticks queue
items. The file is `{version: 3, seq, items[]}`. `type` is the only carrier of a prompt's command,
`payload` is bare text, and a spec-bound fix has a real `spec` field. Typed text is parsed once, at
the door (`queue add`, `/spec:migrate`), never on read. `/spec:migrate` is the only converter; any
other version is a refusal naming it.

## Consequences

- A reader trusts what it reads, and status and fanout cannot disagree about what an item is.
- A test fails any script outside the owner, the CLI and the migration that touches items.
- Every repo must run `/spec:migrate` once before queue commands work again.
- A future shape change is a version bump and a migration step, never a tolerant reader.
