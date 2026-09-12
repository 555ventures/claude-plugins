---
name: spec-20260912-01-card-explains-itself
description: tests-layer authoring for the exclusions card head/provenance/state spec — design-doctrine.test.js recreation and the exclusions-route.test.js class-matching shim gap
metadata:
  type: project
  reviewed: 2026-09-12
---

specs/20260912/01-the-card-explains-itself.md's tests-layer File Plan named
`tests/consistency/design-doctrine.test.js` as MODIFY, but the file was deleted by the 2026-09-11
test-expiry sweep along with every test its closed owning specs had tagged (see
[[spec-20260911-04-review-fix-five-items]]'s sibling note on the same mechanism,
specs/20260911/03-tests-expire-at-close.md). Confirmed via `git log --diff-filter=D` — the AC's
own "→ writes" wording (not "rewrites") already signals this; treated as a stale File Plan action
label, not a fork, and logged as a deviation bullet rather than blocking.

`tests/mocks/exclusions-route.test.js`'s own duplicated flat-DOM shim (parseFlatDom/
matchesCompound) never got the class-selector repair that `tests/mocks/walk-page.test.js`'s
identical shim got under a prior spec's D16 — `.class` tokens silently matched every node. Needed
a real class match here because the new `<p class="wk-excl-state">` line carries no
distinguishing attribute besides its class. Fixed by copying the same classRe block into this
file's local copy (test-harness-only edit, not implementation code) rather than switching to
string-regex extraction, which the flat-DOM/vm click-simulation style can't do anyway.

`buildWalkPageForVm(seed, exclusionRow)` and `runWalkBrowserRouted` were dangling unused helpers
already sitting in exclusions-route.test.js (defined but called by nothing) — leftover from an
expired test. Reused them directly for AC-8/AC-9 instead of writing new harness code.

AC-7 ("SHALL CONTINUE TO ... whatever data-exclusions-open holds") and AC-2 (empty card renders no
heading) are both legitimately green pre-change — no blocking needed, matches [[new-spec-ac-green-
pre-change]].
