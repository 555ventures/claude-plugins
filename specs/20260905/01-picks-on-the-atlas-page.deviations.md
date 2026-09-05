# Deviations — 01-picks-on-the-atlas-page

- D6/AC-20260905-01-12 originally required `spec/entrypoints.json` to gain a row for
  `spec/scripts/lib/mocks-picks.js`. Adding it collided with
  `tests/consistency/entrypoints.test.js`'s `AC-20260820-04-1` live-repo pin, which asserts
  `manifest.length === scannedExecutables.length` where `scanExecutables` deliberately excludes
  every `spec/scripts/lib/*` file (lib/ holds shared modules, not entry points, per that test's
  own D1 comment) — so any lib/ manifest row, correct or not, makes that count assertion red (46
  keys vs 45 scanned executables) by construction, the `spec-pipeline.md` § Gotchas class "a spec
  that ADDS a member to an exhaustive live-file pin". Resolved by D8 — row withdrawn: the spec was
  amended to drop the entrypoints.json File Plan row entirely (lib/ stays excluded from the
  manifest by design), `spec/entrypoints.json` is byte-identical to HEAD, and
  `design-atlas.js`'s `require('./lib/mocks-picks.js')` keeps the `.js` extension only because
  it reads cleanly, not for any entrypoints-checker literal.
