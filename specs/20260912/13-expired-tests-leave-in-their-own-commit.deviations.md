# Deviations — 13-expired-tests-leave-in-their-own-commit

- AC-20260912-13-6's test (`tests/review/review-driver-close-expiry.test.js`) is a sanctioned
  green-pre-change pin, not a stale-assumption block: `--mark closed` makes no git commit at all
  under current code (grepped — no `'commit'` invocation anywhere in `handleClosed()`), so "HEAD
  byte-identical across a close that retires nothing" already holds today. The AC pins the absence
  of D5's not-yet-built commit mechanism on the collapsed (nothing-retired) path; it will stay
  green through the build and only becomes a live regression guard once D5 lands.
