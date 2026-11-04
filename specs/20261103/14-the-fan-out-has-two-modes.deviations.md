# Deviations — 14-the-fan-out-has-two-modes

- tests/consistency/policy-readers.test.js: the File Plan row is MODIFY but the file no longer exists (deleted by a
  earlier test-trim commit), and no remaining test carries the two `fanout § Input must name --ask / list
  rejectWithEvidence` assertions. Row is a no-op; nothing recreated.
- AC-14-2 / AC-14-9 worked examples name a red-CI lane `fix/ci-deadbeef`-shaped `F2`; the fixture's `fixes` opt has
  only queued items q107 and q116 (no red-CI row, no ledger seed). The tests pin `F2 = fix/q116` instead; the fix
  group behaviour (queued items first, one lane each) is the same.
- AC-14-16 reuses `AC-20261103-08-22`, but D9 turns its `--include-fixes` setup into a bare run; against the
  pre-image a bare run tables no fix group, so that case is RED before the change, not green. Likewise the many
  standing tests that go through `h.plan` / `h.pick` are red against the pre-image (it refuses `--pick`).
- Pointer-forced titles `AC-20261102-03-7: --include-fixes appends`, `AC-20261103-06-13: --batch all` and
  `AC-20261102-03-21: an explicit --spec list` keep the retired flag names in test titles (red-check resolves by
  title prefix); the review grep for `--include-fixes` will match the first title unless the pointer is retargeted.
- tests/fanout/fanout-gate-cache.test.js (outside this batch) still calls `h.plan(['--spec', S03])`; the fixture's
  `h.plan` ignores the argument and picks the default pair, which is harmless to it (it only uses L1 = 03-x).
- `AC-20261103-06-24`'s tag is kept in the prose-pins `fanout.md` guard title; it is a pre-existing owner id, not a new tag.
- Orchestrator: removed the `tests/consistency/policy-readers.test.js` MODIFY row from the File Plan — the file was
  deleted by commit e0bd4a93 (test trim) before this build, its two fanout `--ask` assertions with it, so D9's
  intent for the row already holds; recreating an empty file would add lines against D10. D9's prose naming the
  file is left as locked.
- Orchestrator: AC-20261103-14-16 amended from `SHALL CONTINUE TO … → reuses` to `SHALL … → rewrites` (same
  test, same measurement). D9 turns the case's `--include-fixes` setup into a bare run, which the pre-image
  answers with no fix group, so red-check reported `broken-reuse`; pipeline rules § Gotchas: fix the verb, never
  the measurement.
- Orchestrator: retitled the pending-question case to `AC-20261103-04-3: stopPolicy (AC-20261103-14-11) …` so
  AC-14-11's `rewrites … :: AC-20261103-04-3: stopPolicy` pointer resolves (the worker had put the new ID before
  `stopPolicy`).
- Test trim (D10 net-negative target): tests/fanout/fanout-driver.test.js and fixture.js shed duplicated setup through
  fixture helpers `closeLane`, `dispatchAll`, `pickPlan`, a shared `briefItems` queue constant, a file-local `redMerge`,
  a table loop over the self-surface/critical/alone pick cases, and joined wrapped assert statements; every AC-14 ID,
  title prefix and third-arg message is kept. The whole-diff shortstat stayed net-positive (+34) — the remainder is
  the four --pick tests and fixture `pick`/`many` that AC-14-4 .. -10 require; a further cut would drop a covered case.
