---
name: review-finding-pins-no-ac
description: Pinning already-shipped review findings (no AC-ID) as regression tests — naming convention, and the two mechanical traps that make such pins vacuous
metadata:
  type: feedback
  reviewed: 2026-08-24
---

When a dispatch asks for regression pins on defects found and fixed during a spec's `/spec:review`
pass (not the spec's own Acceptance Criteria), the fixes are already applied — the new tests are
GREEN from the start, unlike the TDD-red pipeline convention used for unshipped ACs elsewhere in
this repo. Name each test `review finding N: ...` (or "review fix <date>: ..." in the header
comment) and never fabricate an `AC-YYYYMMDD-NN-N` token for it — this repo has a recorded
incident where a worker invented an AC-ID placeholder for a test with no underlying AC, producing
coverage-shaped output that proved nothing.

Two traps worth checking before shipping this kind of pin, both hit while pinning
specs/20260820/05-fleet-evidence-reader.md's six post-build review fixes in
tests/fleet-reader/review-fixes.test.js (2026-08-21):

1. **A byte-length threshold assert needs a fixture proven to cross it, empirically.** For a
   ">64KB survives a pipe" pin, don't eyeball a fixture size — generate it and print
   `Buffer.byteLength(stdout,'utf8')` before writing the final test. 20 repos x 30 rows x a
   *shared* pool of 40 leg names (not unique-per-row leg names, which blow up legRecency
   combinatorially) produced ~149KB in ~53ms script runtime — comfortably over 65536 and fast.
   Assert the byte length explicitly with a message noting the assert exists to keep the test
   from being vacuous at the boundary.

2. **A source pin on `process.exit(0)` (or any literal that legitimately appears in a comment
   explaining what the code no longer does) must strip `//` line comments before matching** —
   `src.includes('process.exit(0)')` fails against the CORRECT fixed file when the fix's own
   explanatory comment names the literal it removed. Strip comments (`line.slice(0,
   line.indexOf('//'))` per line) and match code-shaped occurrences only. Verify both directions
   before trusting it: false against the real fixed file, true against a reconstructed
   `process.stdout.write(x); process.exit(0)` snippet standing in for the pre-fix code (you
   cannot run the actual old file once the fix has landed, so reconstruct the smallest snippet
   that captures the broken shape and prove the pin fires against it).

See also [[regression-pin-prove-against-reconstructed-old-code]] — same empirical-proof discipline,
generalized: when the old broken code no longer exists to run, reconstruct the smallest snippet
that reproduces its shape and prove the new assert fires against that snippet before trusting it
as a real regression trap.
