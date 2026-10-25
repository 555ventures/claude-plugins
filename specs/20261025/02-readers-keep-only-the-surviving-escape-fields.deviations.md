# Deviations — 02-readers-keep-only-the-surviving-escape-fields

- tests/commit-coverage/commit-coverage.test.js did not exist (stat: only the fixtures file), so the CREATE row stood; its fixture helpers are inlined because the fixtures file is deleted by this spec.
- AC-11 (rewrites) and AC-15 (reuses) point at the same existing build-driver case; a case cannot be red and green. The case was split into two sharing the pointer prefix: one carrying AC-11 (red, missing/malformed class refusal) and the original body carrying AC-15 (green).
