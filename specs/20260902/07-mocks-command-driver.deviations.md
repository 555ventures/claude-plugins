# Deviations — 07-mocks-command-driver

- Test-author (mocks-driver.test.js, AC-20260902-07-7): D8 names a "theme-directions" and a
  "theme" product ledger row without pinning how the driver identifies them — ledger ids are
  `^[A-Z]+\d+[a-z]?$` (spec 06 lib), so neither row can literally carry the id "theme-directions"
  or "theme". The AC-7 fixture writes said-by-user/confirmed rows whose `claim` cell carries the
  literal text `theme-directions: <kebab>` / `theme: <kebab>`, as the most literal in-bounds
  reading available; the implementer may choose a different row-identification shape (a fixed id
  convention, a dedicated `step` value, etc.) without that being a locked-Decision override — the
  test's assertions are on driver behavior (accept/refuse, the copied tokens file, the recorded
  mark), not on the exact ledger row shape it reads.
- Doctrine (spec/.claude-plugin/plugin.json, D18): D18 names 7.61.0 as the version-bump target,
  but 7.61.0 was already shipped by spec 06 (a concurrent sibling) before this build landed.
  Bumped to the next free minor, 7.62.0, per rules § Gotchas' "a spec Decision naming a literal
  version-bump target can be stale by build time" — the spec's literal number is a target, not
  a pin.
