# Deviations — 20260907/04-kit-canon-family

- D11's `spec/doctrine/design.md` § Design Canon `kit/<name>.html` bullet landed as a single
  unwrapped line, and the adjacent `shell/<name>.html` bullet's last two wrapped lines were
  merged into one (text unchanged, only line-break position moved), because the file was
  already at design.md's 160-line cap and `/spec:design`'s read-load budget (`tests/consistency/read-load.test.js`,
  cap 500) was already at exactly 500 with zero slack — any net line growth in design.md redlines
  that budget. Net line count of `spec/doctrine/design.md` is unchanged from its pre-spec state.
