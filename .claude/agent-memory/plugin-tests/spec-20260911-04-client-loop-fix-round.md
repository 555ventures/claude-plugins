---
name: spec-20260911-04-client-loop-fix-round
description: D15/D16/D17 fix round on the-client-loop — flat-DOM shim's matchesCompound needs .class support, and buildClientIndex's ready-Set filter breaks CONTINUE-TO tests that omit it.
metadata:
  type: project
  reviewed: 2026-09-12
---

specs/20260911/04-the-client-loop.md's fix round (D15/D16/D17): the sibling scripts worker landed
all three mid-session (design-atlas.js's `readyJourneys()` derives from disk, walk-page.js retired
`Coming soon`/`data-ready`/the not-ready `<span>`, walk.browser.js added the withdraw handler) —
files change under you in a shared worktree, re-grep before trusting an earlier read.

Two forced test-file repairs, appended to the spec's own deviations.md rather than silently fixed:
- D15 made `buildClientIndex` render ONLY journeys present in its `ready` Set param. Any
  pre-existing test calling it with no `ready` at all (e.g. an older CONTINUE-TO pin like
  AC-20260911-01-10) now renders an empty `<nav>` and fails on an unrelated assertion. Fix: pass
  `ready: new Set([...])`, never touch the assertion.
- tests/mocks/walk-page.test.js's flat-DOM `matchesCompound` shim (used by `parseFlatDom`) only
  ever matched tag + `[attr]` compounds. walk.browser.js's D16 withdraw handler selects its status
  line by class (`.wk-req-status`); the shim's regex found no `[...]`/tag token to check and
  silently matched the FIRST descendant of the scope instead — a real bug in the shared test
  helper, not the implementation. Added real `.class` → `class` attribute-list matching to the
  shim itself, since no earlier test in the file exercised a class selector. Prefer this over
  writing an assertion that accommodates the bug.

See [[stale-dispatch-premise-concurrent-session]] for the general pattern this reconfirms.
