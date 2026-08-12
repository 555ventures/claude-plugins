# Deviations — specs/20260812/02-hotspot-audit.md

- AC-6 says "WHEN the no-arg usage error prints" — stale assumption: `spec-paths` with no
  args prints the plugin root and exits 0 (pre-existing behavior); the usage line fires only
  on an unknown key (exit 1). The test triggers it via an unknown key, exactly like the cited
  components-check precedent (`tests/components-check.test.js` AC-20260810-01-3). The pinned
  behavior (usage line lists `hotspot`) is unchanged.
