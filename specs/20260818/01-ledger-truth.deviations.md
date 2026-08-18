- D4 implemented verbatim (`row.findings` gains `legFindings: N` unconditionally, per the
  Contracts block's `{survived, killed, waived, rejected, fixDispatched, reviewerCount,
  legFindings}` shape) reddens the pre-existing, untouched test
  `AC-20260805-02-8: the review ledger row nests survived/killed/waived/rejected/fixDispatched/reviewerCount under findings and carries none of them flat at the top level`
  (tests/review/verdict.test.js:411). That test's own name and assert message ("exactly the six
  disposition counts") predate D4's seventh field and were not updated in the spec's test-authoring
  pass, unlike the five pins D7 explicitly retags. Its fixture (SIX_GREEN, zero red legs) derives
  `legFindings: 0`, which the test's exhaustive `deepStrictEqual` rejects as an unexpected key. Per
  the worker instruction that Decisions/Contracts win over a stale test on disagreement, verdict.js
  was implemented to the spec's literal Contract; this one assertion was left red rather than edited
  (test files are out of this worker's assigned scope). Remedy: add `legFindings: 0` to that test's
  expected object (a one-line fixture update, not a design change).
  RESOLVED at build Phase 4 by the orchestrator: recorded as Decision D8 (build-time addendum to
  D7 — sixth colliding pin), the test author retagged it in place to
  `AC-20260818-01-2 (retag of AC-20260805-02-8)` with `legFindings: 0` added to the still-exhaustive
  expected object and the flat-key negative loop widened to cover it. Not weakened, not left red.
