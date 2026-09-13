# 0021. The close stops deleting tests

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/15-the-close-stops-deleting-tests.md)
- Applies to: specs/20260911/03-tests-expire-at-close.md D5's `--apply` clause and D6 in full,
  and specs/20260912/13-expired-tests-leave-in-their-own-commit.md D3–D7 in full — every
  mechanism either spec built to make a close-time deletion safe (the `--apply` invocation
  inside `doCloseWork()`, the CLOSE step's "part of the close commit" / "deleted in their own
  commit when you mark closed" line, `--mark closed`'s own `chore(tests): expire` commit, the
  restore-and-re-run arm that tells a broken deletion apart from a broken close tree, and the
  `⚠ expiry skipped` hint that rides it) is removed. Classification stays: `doCloseWork()`'s
  dry-run `expire-tests.js --root <repoRoot> --spec <specRel> --json` call and the review row's
  `tests:{born,kept,retired}` are unchanged in shape, only `retired` now means *retirable*, not
  *deleted*.
- Amended by: —

## Context

specs/20260912/13 (ADR-0020) moved the expiry deletion out of the close commit and into
`--mark closed`'s own commit, on the reasoning that a deletion the gate re-run cannot see is an
unverified write. That fixed the provenance bug but not the hazard underneath it: in salon-os
`specs/20260912/09` (run `rv_eebf17f207bd`), a guard test the reviewer found missing, the disposer
ordered and the builder added — all inside one `/spec:run` — carried that same spec's own AC-IDs
and was deleted by that same review's close, silently restoring the hole review had just closed.
Three tests were restored by hand. The direct cause is structural: `allCitedDone()` treats the
closing spec as done before its status flip, and no keep clause knows *when* a test was authored,
so a test born and tagged inside the same run that closes its spec is indistinguishable from a
year-old test whose spec closed long ago.

A fourth keep clause — protect anything authored between the reviewer's first return and the
close, keyed on a new `marks.reviewerReturnSha` — was drafted and rejected. Fable 5.1's Q2
argument carried the ruling: "a spec's tests die when the spec does" conflates the spec
*document*, a planning artifact that ends, with the *requirement*, which persists as product
behaviour once accepted. Once a spec is done, its acceptance criteria are exactly the regressions
worth pinning; the AC tag on a test is provenance, not an expiry date. A keyed fourth clause would
also only ever close the one timing hole it was built for, leaving the sweep's real hazard
untouched: it proposes hundreds of deletions under one approval.

## Options considered

- **A. Add the fourth keep clause on `marks.reviewerReturnSha`, keep close-time deletion.**
  Rejected — see Context; fixes one timing window, not the class of hazard, and keeps the
  restore/re-run/commit machinery ADR-0020 only just finished making safe.
- **B. Narrow the keep-clause window further (e.g. protect anything committed after the build's
  own start) rather than after the reviewer's return.** Rejected for the same reason as A, plus a
  narrower window is easier to miss by construction.
- **C. Remove close-time deletion entirely. `doCloseWork()` keeps its classification-only dry run
  and the row it produces; `runCloseTimeGate()` narrows to the resolved host gate plus the
  unconditional whole-suite re-run, in that order, with no expiry call, no commit, no restore arm.
  The deliberate `/spec:doctor` check 20 sweep (`--all-done --apply`, one human question naming
  the count and the files) becomes the only path that deletes a test.** Adopted.

## Decision

**Option C.** A close makes no commit and removes no file, ever, regardless of what
`expire-tests.js` classifies as retirable. `doCloseWork()`'s classification call, its
`tests:{born,kept,retired}` row, and `marks.testsExpiry` are untouched — the count is the useful
half of specs/20260911/03 D5, and it survives. Everything specs/20260912/13 built to make the
*other* half (the deletion) safe is deleted along with it: the `--apply` invocation, `commitExpiry()`,
`restoreExpiryPaths()`, `expiryPathsFrom()`, `expirySkipWarning()`, and the restore-on-red arm.
`runCloseTimeGate()` returns to exactly two steps — the resolved gate, then the host's whole-suite
`testCommand` — unconditional and in that order, exactly as before specs/20260911/03 D5 first
folded a deletion into it. The CLOSE step's 🧹 line is rewritten to say nothing is deleted at
close and to name the sweep command by which a test does die.

specs/20260911/03 D5's `--apply` clause and D6, and specs/20260912/13 D3–D7, are not rewritten in
place — each gains only the one `Amended by: docs/adr/0021-the-close-stops-deleting-tests.md`
backlink, and this record is the durable account of what changed and why.

AC-20260912-13-7 pins `⚠ expiry skipped` warning behaviour with three clauses; its test is kept
byte-identical, assertions included. The warning's own literal (`⚠ expiry skipped`) is now
unreachable — the restore-on-red arm that printed it is gone — so the test's third clause
(asserting the literal is *absent* when nothing retired) becomes vacuously true: there is no run
of the driver, retiring or not, in which that literal can appear. The clause is not deleted or
loosened to match; a pin is never weakened to track a change in the system it pins. Its first two
clauses (`gate red at close` still refuses, driver state still left at `CLOSE`) still discriminate
real behaviour and continue to do so under this record.

No permanent brake on the sweep's real hazard is added here. Removing close-time deletion closes
the salon-os incident's silent path by construction, but a deliberate sweep proposing hundreds of
deletions under one human approval remains a hazard this spec does not fix; that is named, not
solved, in specs/20260912/15's Rationale.

## Consequences

- A close that retires 40 tests and a close that retires none now behave identically with respect
  to the tree and to `git rev-parse HEAD`: no commit either way. `runCloseTimeGate()` has no
  branch conditioned on `retired > 0`.
- `--mark closed` can no longer deadlock or silently skip an expiry against a disagreeing host
  check, because it no longer deletes anything — the restore-and-re-run arm ADR-0020 built to tell
  those two cases apart has no work left to do and is deleted with the rest of the apply path.
- The one path that deletes a test anywhere in this plugin is `/spec:doctor` check 20's remedy,
  `node "$(spec-paths test-expiry)" --root . --all-done --apply`, run only after one question
  naming the count and the files.
- `spec/templates/grounding-contract.md` § Test expiry, `spec/commands/doctor.md` check 20, and
  `spec/scripts/coverage-scope.js`'s WHY header are rebased off the close deadlock story this
  record retires; this repo's `.claude/spec.config.json` `contractHash` is re-stamped in the same
  landing.
- A future reader of specs/20260911/03 D5/D6 or specs/20260912/13 D3–D7 who wants to know what the
  close actually does today finds the `Amended by` line and follows it here, rather than trusting
  either spec's now-superseded description of a commit `--mark closed` no longer makes.
