---
name: spec-20260914-02-review-fix-retag-and-menus-done-fix-already-landed
description: Retag idiom for a reused AC (AC-OLD / AC-NEW), its ac-matrix oracle, and the genesis brief fixture ordering for driver-written picks
reviewed: 2026-09-15
metadata:
  type: project
---

1. Reused-AC retag idiom (repo-wide, grep `^test('AC-[0-9-]* / AC-`): rename the reused test to
   `AC-OLD / AC-NEW: <original name unchanged>` and never touch its assertions. The oracle is
   `node spec/scripts/ac-matrix.js --spec <path> --root . --manifest <tmp> --json` reporting
   `uncovered: 0`.

2. Genesis brief fixtures: `writeBrief()` regenerates brief.md wholesale, so pre-resolve any open
   dimension (menu file + `menu-written` mark + its pick in `writeBrief()`) BEFORE the first bare
   driver run. Driver-written `## Picks` lines (the mock-app auto-picks) land only after the
   fixture's last `writeBrief()`.

3. A red-first check can come back green when a named, parallel scripts worker has already landed
   the implementation (here: `appendDerivedPicksToBrief` plus the skipped-tournament guard in
   `handleMenusDone`). Report that fact and name the landed code. The orchestrator then proves
   red against the pre-fix file itself.
