- [tests-batch] AC-ID naming convention (host test-rules) required renaming both existing
  `tests/runtime-leg-shutdown.test.js` test names to prefix `AC-20260815-04-5 / ` and
  `AC-20260815-04-6 / ` — this desyncs their exact-name entries in `.claude/suite-baseline.json`
  (outside this batch's File Plan row) from the new names → left as-is (conservative: File
  Plan doesn't list suite-baseline.json for this batch, and the pins are still sanctioned-red,
  not newly green) and logged here for the build/landing batch to re-run
  `spec/scripts/suite-baseline.js --update` alongside its own file-plan-listed baseline touch.
