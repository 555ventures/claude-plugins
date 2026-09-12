# Deviations — 20260912/01-the-card-explains-itself

- `tests/consistency/design-doctrine.test.js` was created fresh rather than modified: the File
  Plan row lists it as MODIFY, but the file does not exist at the pre-image — it was removed by
  the 2026-09-11 test-expiry sweep (`d6f994a retire the self-policing size tooling and expire
  closed specs' tests`) along with every test its now-`done` owning specs had tagged. AC-20260912-
  01-11 itself says "writes", not "rewrites", so this is a stale action label rather than a scope
  fork — the test was authored to the AC as if the file were new, consistent with the design-
  doctrine.test.js precedent already recorded against the same expiry mechanism
  (specs/20260911/03-tests-expire-at-close.md).
