---
name: spec-collision-sweep-can-miss-same-file-collisions
description: A spec's Assumptions can enumerate collisions to retag but miss a third one created by the same Decision, inside the very file being edited — verify empirically against the pre-image script, don't trust the assumption's list as exhaustive.
metadata:
  type: feedback
  reviewed: 2026-09-03
---

specs/20260819/03-replay-first-run-fixes.md's Assumption A4 named exactly two collision classes
in tests/replay/replay.test.js to retag: the `--score --file/--line` shape and a "three-value
outcome-enum" pin (which, on inspection, never actually existed in the file — grepped and
confirmed absent, so AC-20260819-03-11 was authored fresh rather than retagged). Neither A4 nor
A7 mentioned a THIRD collision that the same spec's D7 creates: `--record` drops its `--file`
flag entirely (replaced by a `--patch`-derived `files` array), and the two existing
AC-20260819-02-6 tests still passed `--file lib/x.js` / `--file lib/y.js` and asserted a
`Object.keys(row).sort()` key-set including the singular `file` key. This is a real collision
inside the very file I was editing, not a "pin outside this file" the Assumptions text
anticipated.

**Why:** the Decisions/Assumptions table is authoritative for what to APPLY, but the "collision
sweep at lock" that produces the Assumptions list is itself a mechanical pass over the corpus and
can miss instances — especially ones inside the very file a File Plan row already names for
other reasons, where the retiring flag/shape is easy to overlook because the row is already
"in scope" for a different edit.

**How to apply:** when a spec's Decisions retire or rename a flag/field (e.g. D7's `--file` →
`--patch`-derived `files`), grep the assigned test file for every invocation of that mode
(`--record`, `--score`, etc.), not just the specific pins the Assumptions table names — a
Decision's blast radius on its own file can exceed what the collision sweep enumerated. Fix
in place, keep the original AC-ID when the underlying invariant is unchanged (only the
derivation mechanism is), and flag the discovery explicitly in both the file's header comment
and the return to the dispatcher, since it's exactly the kind of File Plan gap
[[spec-ac-example-vs-shipped-refusal]] and [[stale-dispatch-premise-concurrent-session]] already
warn about trusting on faith.

Separately, confirmed the same task's generalized-third-occurrence vacuous-rejection Gotcha
(spec-pipeline.md § Gotchas) applies broadly: any TDD-red rejection AC where the pre-image has a
GENERIC required-flag or enum fallback that already produces the same exit code, for the wrong
reason, is vacuously green pre-implementation. Verified empirically for AC-20260819-03-10/11/13
(the pre-image script's missing-required-`--file`/`--class` usage error, or its OLD three-value
outcome check, coincidentally produces the same exit-2 as the NEW spec's validation) — kept as
the correct post-implementation assertions per that Gotcha's guidance, documented inline with the
exact commands run to prove the vacuity, rather than reddened artificially.

See also [[regression-pin-prove-against-reconstructed-old-code]] for the complementary discipline
of proving a regression pin fails on record; this is the mirror case — proving a REJECTION pin
passes for the wrong reason before trusting it as a red pin.
