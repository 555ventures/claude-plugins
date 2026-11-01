# Deviations — 01-the-host-names-its-own-test-cases

- AC-20261101-01-9 (tests/ceiling/host-scanner.test.js): the spanless host case is listed with the title
  `AC-20260911-55-1 test_alpha`, not `test_alpha`. Assumption A2 says a spanless case has an empty
  `commentAbove`, so expiry's `citedAcIds` (title + commentAbove) only tags it when the title itself cites the
  AC-ID; with the bare title it is untagged and never reaches `unscannable`. The asserted `unscannable` entry
  therefore carries that tagged title.
- AC-20261101-01-15 (tests/ceiling/host-scanner.test.js): `configCommandStrings` is not exported from
  `lib/invariants.js`, so the test observes it through `deriveInvariants(...).roots` containing `scanner.js`.
- AC-20261101-01-6 (spec/scripts/count-tests.js): the exit-3 stderr line is exactly `count-tests: testCaseScanner <field> — <value>`
  with no remedy suffix, and `--scanner-check` runs the scanner quietly so the `testCaseScanner failed` line is not also written;
  the test pins one stderr line. The remedy lives in the header and in doctor.md's ⚠️ line.
- AC-20261101-01-8 (tests/ceiling/host-scanner.test.js, not mine): the fixture's `testCommand` `node -e "process.exit(0)"` plus the
  appended filter arg makes node exit 9 with `bad option: --name=^test_gamma$`, which names the title, so red-check's selection proof
  passes and the disposition is `observed: red` with no `fallback` — the test expects `unselected`. The scripts resolve the case
  correctly; the stub needs a command that ignores extra args and prints nothing (e.g. `node -e "process.exit(0)" --`).
