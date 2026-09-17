---
name: fixture-gap-vs-driver-defect
description: before patching a shared terminal-state function to satisfy one new assertion, check whether a synthetic test host is just missing a real host's own .gitignore entry
metadata:
  type: feedback
  reviewed: 2026-09-17
---

Chased a `printDoneNow()` (spec-review-driver.js) test failure — a new D6 skip-warning AC asserted
fully clean `git status --porcelain` after a no-commit `--mark closed`, but a shared teardown
(`fs.rmSync` on the `<spec>.review/` sidecar, D8(a)) left a tracked-then-deleted, uncommitted
sidecar whenever a fixture host happened to `git add -A` it. Diagnosed and "fixed" this by adding
an `expirySkipTaken` flag to special-case the driver's terminal DONE teardown for tracked
sidecars — a real, scoped, all-tests-green fix.

The coordinator reverted it: the actual root cause was the test fixture (`makeExpiryHost` in
`tests/review/review-driver-close-expiry.test.js`) building a host with no `.gitignore`, while
every real host (this repo included) gitignores `specs/**/*.review/` and `specs/**/*.build/`. The
fixture was being corrected in parallel to add that `.gitignore`, which makes the tracked-sidecar
case disappear entirely — no driver change needed.

**Why:** the driver's Decisions table (D1–D9) never asked for sidecar-tracking awareness at a
terminal state; inventing a contract there to paper over a fixture gap is exactly the kind of
extra the worker contract forbids, even when it's well-reasoned and the full suite passes.

**How to apply:** when a shared/frozen invariant (prior-spec terminal-state teardown, a
long-standing helper) only breaks under one new test's fixture, check whether the fixture omits
something every REAL caller has (a `.gitignore` line, a config default, an env var) before
patching the shared code. A green full-suite run proves the patch doesn't regress anything — it
does not prove the patch belongs in scope. Grep the Decisions table for the behavior first; if it
isn't there, suspect the fixture, not the driver, and flag it rather than build a workaround.
