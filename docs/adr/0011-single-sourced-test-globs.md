# 0011. The default test-glob set is single-sourced; the two-copy equality pin is retired

- Status: accepted
- Date: 2026-09-08
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ
- Applies to: specs/20260906/01-ac-drift-doctor-check.md D4 — its "scope-reconcile.js keeps its
  local copy untouched this spec ... the fold-in is queued for the next spec that touches it"
  clause is discharged by this record, and the SECOND clause of AC-20260906-01-8 (the
  source-read equality assertion between `lib/host-config.js`'s `DEFAULT_TEST_GLOBS` and
  `scope-reconcile.js`'s own `defaultTestGlobs` literal) is retired by it. The AC's first
  clause — a host-declared `testGlobs` array fully REPLACES the default classification — is
  unchanged and still covered by the same test.
- Amended by: —

## Context

`['tests/**', 'test/**', '**/*.test.*', '**/*.spec.*', '**/*_test.*']` — the set that decides
what the pipeline calls a test file — was declared THREE times: `lib/host-config.js` (exported),
`scope-reconcile.js` (private `defaultTestGlobs`), and `init-gen.js` (a private
`DEFAULT_TEST_GLOBS` of its own). Only the first two were known: specs/20260906/01 D4 created the
second-to-first duplication deliberately, judging a one-line import into `scope-reconcile.js` —
a critical-tier surface — not worth raising that spec's tier for, and covered the gap with an
equality pin (AC-20260906-01-8) reading the literal out of source.

`init-gen.js`'s third copy was found on 2026-09-08 and had never been inside that pin. It is the
concrete demonstration of the equality form's structural limit: a pin that compares two named
copies cannot see a third. The set is consumed by the at-risk leg (both the main derivation and
`--probe-at-risk`), by `ac-drift.js`, and by `init-gen.js`'s at-risk-applicability probe; a drift
between copies would change what each independently classifies as a test file, and the at-risk
leg is itself the mechanism that catches unreviewed changes — a blind spot there is invisible by
construction.

## Options considered

- **A. Leave all three copies, keep the equality pin** — the status quo. Preserves a pin that is
  provably blind to the copy that actually drifted, and leaves the third copy unguarded.
- **B. Fold inside a future spec that already touches `scope-reconcile.js`** — D4's stated plan.
  Verified 2026-09-08: no pending spec touches that file, so this defers indefinitely with no
  named host.
- **C. Fold now, under a decision record, with the pin inverted to single-sourcing.**

## Decision

**Option C.** `lib/host-config.js` holds the single declaration and every consumer imports it.
The constant is `Object.freeze`d: it is now shared by reference across three modules, no consumer
mutates it (all read sites are membership tests, verified 2026-09-08), and the freeze keeps that
true by construction rather than by convention.

AC-20260906-01-8's test is rewritten from *"the two copies are equal"* to *"only one declaration
exists under `spec/scripts/`"*, asserted by walking real source. The replacement is strictly
stronger: it subsumes equality (one copy cannot disagree with itself) and additionally catches
any NEW copy, which is the failure the retired form missed for two days.

Executed as a direct commit rather than a spec. The edit substitutes constants that were verified
byte-identical and read-only; it touches none of `scope-reconcile.js`'s comparison logic, git
plumbing, or finding derivation, so D4's tier rationale — which was about the cost of changing
that file's BEHAVIOUR — does not attach to a substitution that provably changes none.

## Consequences

- One authority for test classification. A change to the glob set is now a one-line change with
  one blast radius, instead of three edits that must be kept in agreement by hand.
- A fourth copy anywhere under `spec/scripts/` reddens `tests/doctor/ac-drift.test.js`.
  Verified by injection 2026-09-08: re-declaring the literal in `scope-reconcile.js` fails the
  pin with its own remedy; removing it returns the file to green.
- AC-20260906-01-8 remains CITED by its test, so `ac-drift.js` reports no drift finding for it;
  this record, not a `[retired:]` tag, is where the superseded clause is accounted for. A tag
  would wrongly retire the bullet's still-live first clause.
- D4's deferral is closed. Any future spec touching `scope-reconcile.js` inherits no debt here.
