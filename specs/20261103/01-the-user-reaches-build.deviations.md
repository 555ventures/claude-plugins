# Deviations — 01-the-user-reaches-build
- spec/scripts/mocks-driver.js: D2 says refusals exit 1 "via die", but driver-core's die exits 2; AC-1/2/3 tests demand exit 1, so the two refusals write the same `mocks-driver: ` stderr line and exit 1 directly (header Exit codes updated).
- specs/20261103/01-the-user-reaches-build.md: diff_base corrected from 61135737 to d6fe8397 — the lane fast-forwarded onto main's renumber of the colliding sibling spec (01 -> 03) mid-build to clear spec-number-check; the true pre-image is that commit, so review does not diff the sibling's rename into this spec.
