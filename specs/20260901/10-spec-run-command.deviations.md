# Deviations — 10-spec-run-command

- D7 enumerated no `spec-status.js` edge for `build.md`; `build.md`'s Report now carries the
  `spec-paths spec-status` invocation literal (D2, mirroring `review.md`'s existing edge), and
  `tests/consistency/entrypoints.test.js` refuses an undeclared live invocation, so `build.md`
  was added to `spec-status.js`'s `entryPoints`.
- AC-20260901-10-6's fixture describes one host carrying a hardened spec, an implementing
  spec, an unplanned dependency-met brief, and an open escape, but `spec-status.js`'s existing
  `/spec:plan` fallback rule only adds that entry when no other entry is already unblocked, and
  `/spec:run`/`/spec:escape` entries are always unblocked — so that single host can never
  surface all three action strings at once. The AC-20260901-10-6 test asserts the same
  action-set invariant over two hosts instead (hardened + implementing + escape; all-done +
  unplanned brief), with the forbidden-set check repeated on both.
