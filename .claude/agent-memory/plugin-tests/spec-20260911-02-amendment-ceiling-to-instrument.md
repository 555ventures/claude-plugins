---
name: spec-20260911-02-amendment-ceiling-to-instrument
description: Amending a spec that retires a whole mechanism (ceiling->instrument) — retag D-locked green-row literals in place, and give a never-reddens leg an engagement proof instead of a redness proof.
metadata:
  type: feedback
---

specs/20260911/02-tests-have-a-ceiling.md was amended post-lock to strip a limit/gate/hook down
to a pure measurement instrument. Two reusable patterns from that build:

1. When a D-locked "SHALL CONTINUE TO" green-row literal changes shape (here:
   `{"leg":"ceiling","exit":0,"observed":{"count":1,"max":900}}` →
   `{"leg":"tests","exit":0,"observed":{"count":1}}`, dropping the `max` key), grep every file the
   File Plan names for the OLD literal string first — sibling scripts workers may have already
   landed the new leg name in the executable, so the tests-side retag is pure mechanical
   find-and-replace once the new Contracts block is known, not a design decision.

2. red-fixture-coverage.test.js's whole premise is "every leg/hook can actually go red on a
   planted violation" — a leg the spec deliberately gives NO red arm (advisory-only, D3′-style)
   cannot satisfy that literally. Solution: keep the LEG_HANDLERS contract (a function proving
   genuine engagement) but change what it proves — plant an exact, discriminating input (e.g. 3
   real test cases) and assert the row's `observed` field reflects that exact value with exit
   always 0, never asserting redness. This is a legitimate handler shape change, not a weakened
   assertion, when the spec's Decisions state the leg has no red arm by construction.

See also [[banner-literal-loop-dedup-and-blind-spot-sweep]] for the general LEG_HANDLERS/
HOOK_HANDLERS meta-test pattern this repo uses.

## Repair round 1: node --test's default discovery is `**/test-*.js`, not just `*.test.js`

A script literally named `test-count.js` (or a lib file `test-scan.js`) gets picked up by
`node --test`'s bare default-discovery run (no path args) as a TEST FILE, anywhere under the
repo root — not just inside `tests/`. It then "fails" (argv usage error) and reddens the gate.
Renamed `test-count.js` → `count-tests.js` and `lib/test-scan.js` → `lib/scan-test-calls.js`
(verb-noun, matching this repo's `lib/` convention) to get off the `test-*` prefix entirely.
The test file `tests/ceiling/test-count.test.js` was ALSO double-matched (both `test-*.js` and
`*.test.js`) and got the same rename treatment for `count-tests.test.js`.
Lesson: when naming ANY new script or test-directory file in this repo, grep for whether
`node --test` (no args) would pick it up via the bare `test-*` glob before locking the name —
this is now a standing naming trap, not a one-off.
