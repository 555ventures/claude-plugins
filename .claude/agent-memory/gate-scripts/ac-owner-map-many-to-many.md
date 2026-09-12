---
name: ac-owner-map-many-to-many
description: expire-tests.js's AC-ID ownership map must be many-to-many (array per id), not first-writer-wins, whenever a fail-safe "done" check reads it
metadata:
  type: feedback
---

Fixing a first-writer-wins `Map<acId, singleOwner>` for a collision-prone key (here, AC-IDs
across specs) means changing the value to an array and updating every read site: the
"all owners done" check (`.every`), the `--spec` in-scope check (`.some`), and any per-id
scan like a pin-bullet check (loop over the array, don't grab `.get(id)` as a scalar).

**Why:** specs/20260911/03-tests-expire-at-close.md D3's fail-safe rule ("a test survives on
any doubt") breaks under first-writer-wins: closing spec A silently retired spec B's still-open
test when both defined the same AC-ID, and `--spec <B>` couldn't even see its own test
(`tagged:0`) because the map only remembered A as owner. The dedicated collision check
(`spec-number-check.js`) is a *separate* gate that refuses live collisions; this script's job
is to stay correct in that check's absence (host repos may not enforce it, or run `--apply` at
scale before the gate catches it) — never add a collision refusal here.

**How to apply:** when a fix report says "the closing spec counts as done" for a --spec-mode
scoped id, remember that applies per-owner, not per-id: if TWO specs both define the id and
you're closing the one that's currently non-done, closing it makes ITS OWNER-ROW done while a
sibling owner-row's own status is checked independently — a test only retires when EVERY
owner-row is done. Don't assume "closing X" means "the whole id is now done" when the id has
multiple defining specs.
