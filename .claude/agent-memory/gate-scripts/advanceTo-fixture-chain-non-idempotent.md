---
name: advanceto-fixture-chain-non-idempotent
description: mocks-driver-fixtures.js's advanceTo* helpers are not idempotent — calling one on a dir already advanced past its own prefix re-appends duplicate ledger rows and refuses; this is a test-fixture bug, not fixable from production files
metadata:
  type: feedback
  reviewed: 2026-09-08
---

`tests/mocks/mocks-driver-fixtures.js`'s `advanceTo*` chain (`advanceToSeedDone` ->
`advanceToShapePicked` -> `advanceToKitSigned` -> `advanceToCanonWritten` -> …) always
unconditionally re-runs every earlier stage's setup (`confirmFacts` re-appends ledger rows
`P1..P13` with no dedup). A test that calls two of these helpers on the SAME `dir` where the
second helper's prefix overlaps the first (e.g. `advanceToShapePicked(dir)` then later
`advanceToKitSigned(dir)` on that same dir, to observe a state transition on one evolving
root) blows up: `confirmFacts` re-adds already-present ledger ids, and `parseLedger`'s
duplicate-id detection (itself correctly pinned by AC-20260902-06-2) then refuses the
re-entrant `mark seed-done` call inside the chain.

**Why:** hit on specs/20260907/04-kit-canon-family.md AC-20260907-04-1's test, which
intentionally reuses one `dir` across `advanceToShapePicked` and `advanceToKitSigned` to check
KIT → WIREFRAMES. No production file (mocks-driver.js's `ledger add`, or mocks-ledger.js) can
fix this without either weakening the pinned duplicate-id detection or adding surprising
dedup-on-add semantics not authorized by any Decision — the real fix is an idempotency guard
inside `advanceToKitSigned` (skip re-running `advanceToShapePicked` when
`marks.shapePicked` is already set), which lives in a test file this agent must never edit.

**How to apply:** when a new spec's `advanceTo*` fixture chain grows and a test reuses one
`dir` across two helpers whose prefixes overlap, expect this exact failure mode. Log it as a
deviation naming the specific re-entrant call and the missing guard, return the finding to the
test-authoring/plugin-tests layer (own the file at `tests/mocks/mocks-driver-fixtures.js`)
rather than attempting a production-side workaround.
