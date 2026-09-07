---
name: spec-20260906-03-questions-gate-order-collision
description: A pinned question's ledger row necessarily collides with the pre-existing generic ledger gate (requireGateOpen), which runs before the note gate on every advancing mark — pin the AC literally and deviations-note the ordering, don't rewrite the test.
metadata:
  type: project
---

specs/20260906/03-questions-on-the-wireframe.md D2/D4: a question is pinned only onto an
open `inferred`/`invented` product ledger row (`ledger add --screen` / `ledger ask`). But
mocks-driver.js's `requireGateOpen()` (called before `requireNotesResolved` on every advancing
mark, e.g. journey-approved) already blocks unconditionally on ANY open inferred/invented
product row, with its own message ("provenance ledger is blocked: ..."). D4's AC-5 worked
example presupposes the question-gate message wins as "the first stderr line" in exactly this
scenario — which only happens if build reorders/merges the two checks. This is not a test
authoring error: write the AC's literal exec test against the real driver (it will be red for
the *right* reason — either the wording is missing, or the generic gate fires first) and record
the ordering ambiguity in `<spec>.deviations.md` rather than softening the assertion.

**How to apply:** when a new spec pins a note/ledger-gate message that has to win over an
existing unconditional gate check firing earlier in the same function, don't guess the
reordering — pin the literal AC text and flag the collision in the deviations file so the build
worker (who owns the fix) sees it named explicitly.

See [[stale-dispatch-premise-concurrent-session]] for the general "verify current repo state,
don't trust the incident narrative" discipline this same instinct comes from.
