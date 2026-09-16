# Deviations — specs/20260915/01-one-derivation-of-ignored-paths.md

## Tests worker: AC-20260915-01-3 and AC-20260915-01-4 are green pre-change, not red

The dispatch prompt's File Plan row lists all of AC-20260915-01-1 .. AC-20260915-01-7 as "new,
red". Empirically running the untouched pre-image `spec/scripts/red-check.js` against each AC's
fixture shows:

- AC-20260915-01-1, -2, -5, -6, -7: FAIL pre-image (for the right reason — no ignored-path prune
  exists yet, and no zero-expansion warning exists yet). Confirmed via `node --test
  tests/red-check/red-check.test.js`.
- AC-20260915-01-3 (an exact-path tests row inside a git-ignored directory still resolves,
  executes, colour-classifies, and still reports `missing-test-file` for an absent exact
  sibling) and AC-20260915-01-4 (`--root` at a repository subdirectory falls back to the
  unfiltered walk, resolving both the tracked and the git-ignored file, with no stderr) both PASS
  pre-image, by direct execution.

This is expected, not a defect in the fixtures: D3 is explicitly a "SHALL CONTINUE TO" invariant
(the AC bullet itself reads "SHALL CONTINUE TO resolve, execute and colour-classify"), and D1's
fail-safe guard degrades a mismatched-prefix `--root` to today's already-unfiltered walk — a
behaviour the pre-image already exhibits by construction (it has no prune of any kind yet). Both
ACs pin that this specific pair of invariants must survive the prune landing, exactly the same
shape as this same test file's pre-existing `AC-20260907-03-9` (SHALL-CONTINUE-TO, green
pre-image because no prune exists yet to misfire) and `AC-20260907-03-3` in
`tests/scope-reconcile-probe.test.js`.

No fixture, assertion, or test was weakened to make this so — both tests were authored straight
from the AC text and independently verified true against HEAD by direct script invocation before
being added. Full scoped run (`node --test tests/red-check/red-check.test.js`): 31 tests, 26 pass
(24 pre-existing + these two), 5 fail (AC-1, AC-2, AC-5, AC-6, AC-7, all genuinely red for the
right reason). Whole-suite run (`node --test 'tests/**/*.test.js'`): 1139 tests, 1134 pass, the
same 5 fail — no other suite regressed.
