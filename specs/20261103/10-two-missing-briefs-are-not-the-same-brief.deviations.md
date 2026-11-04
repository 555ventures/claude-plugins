# Deviations — 10-two-missing-briefs-are-not-the-same-brief

- tests/fanout/fanout-driver.test.js: beyond the calls D8 names (brief literal, `dependent`, `--override-serial`), four existing `fanoutHost(` calls went red on the ad-hoc default flip for another reason (the batch/pin order follows path order for ad-hoc specs instead of brief order) and were given `briefed: true` unrewritten: AC-20261103-06-9 (selfSurface), AC-20261103-06-13 (`--batch all` call), AC-20261103-08-21 (planItem), AC-20261103-08-22 (fixFiles).
- tests/host-run/real-specs-smoke.test.js: D9 says the `--lanes --json` top-level keys are exactly `fixes, lanes, serialized`; the live output (and the existing spec-status pin) also carries `born`, so the smoke pins `born, fixes, lanes, serialized`.
- variant-lint.js `files=` counts scanned files PLUS the present foreign (skipped) files, excluding only the helper. D5 and AC-13 prose say the foreign file is "not counted", but AC-13's own fixture (b.js, lib/brief.js, genesis-driver.js) demands `files=2`, which is only reachable by counting the skipped file; AC-12 (`files=1`, no foreign file) agrees. The tests are the oracle.
- Reuse retags moved to the title suffix: the authoring wave inserted the new AC-IDs before the title colon in
  tests/consistency/entrypoints.test.js, tests/queue/spec-queue.test.js and tests/spec-status.test.js, which broke the
  prefix-matched `reuses` pointers of done specs (20260914/03 AC 8, 20261024/05 AC 10) and of AC-10/AC-16 here; the IDs
  now sit at the end of each title. AC-4's own pointer named the pre-image title without its existing spec-08 ID
  (`AC-20261102-03-1: --lanes`) and never resolved; corrected to `AC-20261102-03-1 / AC-20261103-08-8: --lanes`.
- Gate repair round 1, out of plan (D12): ac-drift reported spec 20261102/01 AC 13 uncovered — its reused ci-query
  `--branch` test was deleted by the mechanical trim on main (commit 2b4735a9, no spec) along with `--branch` mode itself.
  Tagged `[retired:]` citing this spec, the first build to run the gate after that trim; red on main before this branch.
