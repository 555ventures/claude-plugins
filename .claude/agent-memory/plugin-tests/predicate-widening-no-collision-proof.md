---
name: predicate-widening-no-collision-proof
description: When a spec amendment (D11-style) widens an existing predicate/regex and the dispatch says "retag in place if you find a collision", prove no-collision by hand-tracing the new formula against every existing fixture's exact string, then confirm with a full scoped node --test run — don't just assert it in prose.
metadata:
  type: feedback
  reviewed: 2026-08-24
---

specs/20260823/03-silent-drop-hardening.md D11 widened `lib/spec-sections.js`'s trailing-tag
refusal predicate (added an arrow-suffix-tolerant regex, generalized the null-test to a
said-vs-parsed comparison) mid-spec, and the dispatch instructed: verify the six pre-existing
AC-1/2/4/7/13a/13b pins in `tests/ac-matrix/rejected-trailing-tag.test.js` still pass under the
amended predicate, retag-in-place only if one collides — never weaken.

**Why:** A prose claim ("D11 doesn't affect AC-7's fixture because it has no arrow suffix") is not
proof. The actual collision risk is regex-shaped (does the widened/optional `(?:→[^→]*)?` group
change what matches for a text with no `→` at all?), so it has to be checked against the literal
regex engine, not eyeballed.

**How to apply:** For each existing fixture string, hand-trace both the old and new regex/predicate
by hand (leftmost-match semantics, greedy repetition, anchor behavior) to confirm identical output,
*then* run the full scoped test file (`node --test 'tests/<scope>/*.test.js'`) before writing new
tests — a green pre-existing suite after the trace is the actual proof, and it also confirms the
new AC-ID tests are red for the *right* reason (the field/behavior genuinely isn't implemented yet,
not an unrelated regression). This same trace-then-run discipline is what let this task skip the
deviations sidecar entirely — zero collisions found, so nothing to log — rather than guessing.

See [[regression-pin-prove-against-reconstructed-old-code]] for the sibling discipline (proving a
NEW pin is red by reconstructing old behavior) — this one is its counterpart for proving an
EXISTING pin stays green under an amended predicate.
