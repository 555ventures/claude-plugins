# Deviations — specs/20260821/01-red-check.md

- D11 named 7.13.0 as the plugin.json version-bump target, but that is a target, not a pin
  (semver-race gotcha, `.claude/rules/spec-pipeline.md` Gotchas): HEAD's installed version at
  build time was already 7.16.0. Bumped to 7.17.0 (the next free version) with the same
  changelog-paragraph convention (last-3-versions form), per the established remedy for this
  class (specs/20260810/02 D11).
