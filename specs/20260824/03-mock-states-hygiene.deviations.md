# Deviations — specs/20260824/03-mock-states-hygiene.md

- D6 named `7.33.0` as the plugin.json bump target. Both `7.33.0` and `7.33.1` (the HEAD
  version at build time) were already taken, so the doctrine worker bumped to `7.33.2`
  carrying D6's changelog paragraph under the new number — the host's known
  stale-literal-version class (spec-pipeline.md § Gotchas: "the spec's literal number is a
  target, not a pin").
