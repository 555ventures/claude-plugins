# Deviations — 01-the-user-reaches-build
- spec/scripts/mocks-driver.js: D2 says refusals exit 1 "via die", but driver-core's die exits 2; AC-1/2/3 tests demand exit 1, so the two refusals write the same `mocks-driver: ` stderr line and exit 1 directly (header Exit codes updated).
