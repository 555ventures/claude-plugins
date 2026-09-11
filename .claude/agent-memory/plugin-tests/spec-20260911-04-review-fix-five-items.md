---
name: spec-20260911-04-review-fix-five-items
description: Five review-fix pins for spec 20260911/04 (tests layer) — vacuous D18 rebuild, missing AC-17 pin, AC-16 retag, shell-quoting fix, arrow-in-prefix fix
metadata:
  type: project
---

Review-fix pass on specs/20260911/04-every-criterion-declares-its-test.md's test layer, no
script edits (two script fixes had already landed).

- **AC-20260911-04-17** (division stays division after D10's widening) had NO real pin — the
  spec's own reused AC-20260911-02-11 case only checks a positive count + ceiling-file absence.
  Added a real `scanCalls` exec pin over `arr[0]/2`, `x++/2`, `(a+b)/2`, `foo(a)/2` each inside
  `if(...)`.
- **AC-20260911-04-18 vacuous-comparison pattern**: a "before/after" test that PATCHES the new
  behavior INTO a copy of the already-new HEAD file is not a comparison — both arms are the same
  file. The fix: build the OLD image by REMOVING the new lines from a HEAD copy (not by adding
  new lines onto a HEAD copy), then prove the two images are genuinely different on a control
  corpus (a value both should disagree on) BEFORE trusting them to agree on the real corpus. Numbers
  proven here: pre-D10 image + a `typeof /a'b/` control source → 1 call (swallowed); HEAD image →
  2 calls. See [[regression-pin-prove-against-reconstructed-old-code]] — same family, this is the
  "before" side of an already-shipped fix rather than reconstructing history from git.
- **AC-ID retag for coverage, zero assertion change**: `tests/ceiling/tests-leg.test.js`'s
  AC-20260911-02-5 BLOCKING-array case needed AC-20260911-04-16 added to its test name + header
  because a spec's `reuses` disposition only satisfies ac-matrix coverage when the AC-ID string
  actually appears in the reused case's own name/header — a header-comment-only mention (as the
  file had before) does not count. Same pattern as [[spec-20260911-02-amendment-ceiling-to-instrument]].
- **Shell-quoting fix pin, red-check.js's runFilteredLeg**: title carrying backtick+`touch <marker>`,
  `$HOME`, single quote, double quote, via a real `node --test` FILTER_CONFIG host (not a stub) —
  asserted no marker file created + clean disposition (no `unselected` fallback). Falsified by
  reverting `shellQuoteSingle` back to `JSON.stringify` in a scratch copy of the real script: the
  marker WAS created and the test failed exactly as expected, confirming this is a real pin, not
  vacuous.
- **Arrow-anchoring fix pin, parseDisposition**: `lastIndexOf('→')` finds no disposition keyword
  after a title's OWN arrow and refuses the whole bullet — fix scans every `→` occurrence and
  takes the first whose tail matches the grammar. Pin: a bullet ending
  `→ reuses tests/a.test.js :: AC-1: maps a → b on read` must parse the arrow-bearing prefix
  intact; a bullet whose tail after EVERY arrow fails the grammar (prose containing `→`) must
  still return null.

All 5 items verified individually + full scoped run (100 tests) + full `npm test` (1081 tests),
zero failures, zero weakened assertions.
