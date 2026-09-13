# Deviations — 15-the-close-stops-deleting-tests

- A5's lock-time verification read all 7 tests in `tests/review/review-driver-close-expiry.test.js`
  for close-time-deletion assertions, but `tests/review/review-driver.test.js`'s
  `AC-20260820-07-12` fixture (line ~373) also asserts
  `!fs.existsSync(path.join(wt, 'tests/foo.test.js'))` with a message naming
  "expire-tests.js --apply deletes AC-tagged tests for the closing spec at CLOSE" — a live pin on
  the exact close-time deletion this spec's D1/D2 remove. Neither file is this spec's File Plan
  (the row is in `tests/review/review-driver.test.js`, outside my scripts-layer file list and
  outside the spec's own File Plan entirely), so I did not edit it. It now fails against the
  corrected `spec-review-driver.js` and needs its own fix/deletion row before the gate goes green.
- Resolved by user ruling 2026-09-13, recorded as D14 and a new File Plan row: the
  `tests/review/review-driver.test.js` pin above was added to this spec's scope and its
  close-time deletion assertion rewritten in place (the AC-tagged test now must survive the
  close, and the close must add no commit). The file's remaining merge/cleanup/verify coverage
  is untouched.
- The spec was renumbered from `14-` to `15-` before the build, and its 28 AC-IDs rewritten from
  the `AC-20260912-14-` prefix to `AC-20260912-15-`: another spec locked the same day already
  held number 14, so both minted colliding AC-IDs — a fatal ambiguity for a spec whose whole
  subject is AC-ID-keyed test ownership.
