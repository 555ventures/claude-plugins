---
name: spec-20260914-03-html-atlas-retired
description: A-clause "if false" remedies must be executed literally when they fire; ac-drift-clean flags cross-spec collateral from deleted test files, closed by a lock-time grep + retag, not by a tests-layer worker mid-build.
metadata:
  type: project
  reviewed: 2026-09-15
---

Spec 20260914/03 (retiring the HTML atlas) deleted `tests/design-atlas.test.js` and
`tests/mocks/atlas-card-height.test.js`, the sole citing tests for several ACs owned by
*other, already-done* specs (20260912/05, /06, /12, 20260911/01, /06, 20260913/02) whose own
Decisions explicitly kept those tests as the AC's home. `tests/doctor/ac-drift-clean.test.js`
(a standing test asserting zero AC-pin drift across the whole repo) reddens listing those
foreign ACs as "no test cites it" once such a test file is gone — real collateral from the
deletion, but not a tests-layer worker's fix to make mid-build: it means editing those OTHER
specs' own `.md` files. The correct fix, per `.claude/rules/spec-pipeline.md`'s Gotchas
(Twelfth trigger on the retired-literal entry), is a LOCK-TIME grep of every AC-ID inside each
test file a spec deletes across `specs/`, with each hit tagged `[retired: <this spec>]` on its
pointer line in the same batch — owned by whoever locks the spec (the orchestrator), not
authored reactively by a tests worker mid-build. On this spec the orchestrator did exactly
that: all 18 foreign ACs came out of the batch already tagged `[retired:
specs/20260914/03-the-html-atlas-is-retired]`, so `ac-drift-clean.test.js` stayed green. The
[[banned-literal-loop-dedup-and-blind-spot-sweep]] and
[[spec-collision-sweep-can-miss-same-file-collisions]] memories are the same class of gap
(deletion collateral landing outside the File Plan) one layer further out — this time on a
whole-repo AC-coverage invariant rather than a literal grep.

Separately: this spec's own Assumptions table (A2) named the exact remedy — "if false: remove
`atlas` from its table in the same batch" — for `tests/consistency/read-load.test.js`'s
`SHARED_FOR.atlas` row once the `atlas` spec-paths key was deleted. The assumption fired false
(AC-20260908-06-3 reddened with a fail-open superset diff) and the fix was to literally follow
the stated remedy: delete the `atlas` row from that table, fold `atlas` into the existing
design/build/review fail-open group assertion in `tests/spec-paths.test.js` instead of leaving
it as its own scoped-list assertion. When a Decisions/Assumptions row states its own if-false
remedy, treat it as pre-authorized scope for the batch, not a widening to flag.
