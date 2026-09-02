# Deviations — 04-shell-composed-mocks

- `tests/genesis/design-state.test.js`'s `shellSyncedMock()` (added for AC-20260901-04-14,
  backing `acceptTokensLanded()` which AC-20260827-03-3/03-4 also share) is NOT byte-synced
  against `SHELL_CANON_APP` despite its own header comment's claim ("byte-synced by
  construction"): its wrapper's children are hand-indented 4/6 spaces
  (`'    <nav ...'`, `'      <a ...'`) while the canon literal (and
  `tests/design-shell.test.js`'s equivalent, correctly byte-exact, `mockDeclaring()`/
  `syncedRegion()` helpers) use 2/4 spaces. D3 is byte equality with whitespace tolerance
  explicitly rejected in the spec's own Rationale ("tolerating whitespace in the compare (a
  tolerance table is a second parser)"), and D1-D6 are locked verbatim — so
  `design-atlas.js check --matrix design/mocks` correctly reports `shell region differs from
  canon (nav slot)` against this fixture, which is genuine drift by the letter of D3, not a
  defect in `spec/scripts/lib/shell-region.js` or `design-atlas.js`. Confirmed by direct
  byte-diff of the two literals (see this spec's build session) and by
  `tests/design-shell.test.js`'s 6/6 and `tests/design-atlas.test.js`'s shell-family 8/8 tests
  passing against the same implementation using byte-exact fixtures.
  - Effect: `AC-20260901-04-14`, `AC-20260827-03-3`, and `AC-20260827-03-4` fail in
    `tests/genesis/design-state.test.js` — all three go through the shared
    `acceptTokensLanded()`/"ok" fixture path that now calls `shellSyncedMock()`.
  - Not fixed here: `tests/genesis/design-state.test.js` is outside this worker's assigned
    file list (spec/scripts/lib/shell-region.js, spec/scripts/design-atlas.js,
    spec/scripts/genesis-driver.js only) and the worker contract forbids editing tests.
  - Remedy for whoever owns `tests/`: re-indent `shellSyncedMock()`'s wrapper body to match
    `SHELL_CANON_APP`'s literal 2/4-space nesting exactly (mirroring
    `tests/design-shell.test.js`'s `mockDeclaring()`/`syncedRegion()` pattern), so the fixture
    is byte-identical to `expectedRegion(SHELL_CANON_APP, 'app', <content>, 'home')` as its own
    comment already claims. No script or Decision change is implicated.
  - Placement note (not itself a deviation, recorded for whoever next touches
    `handleTokensLanded()`): `genesis-driver.js` checks `design/shell/app.html`'s existence and
    `design-atlas.js check design/shell` right after the tokens.css checks and BEFORE
    `hasApprovedMock()`/`check --matrix design/mocks`, since the shell canon and tokens.css are
    both CANON files (Rationale: "the shell is the navigation decision's mock-side artifact
    exactly as tokens.css is the token canon's"), while the approved-mock/matrix checks validate
    the MOCKS. This ordering was measured against the alternative (shell check last, right
    before the `components.json` check): both orderings yield the identical 885/888 total, but
    this one keeps `AC-20260901-04-14`'s own `noShell` and `badCanon` sub-scenarios passing
    (only its `ok` sub-case fails, on the whitespace bug above) — the alternative instead makes
    `badCanon` fail for the wrong reason (`check --matrix design/mocks` trips on the same
    whitespace bug before the canon's own broken-content-slot violation is ever reached), while
    only trading up two sub-scenarios (`noMock`/`failMatrix`) inside the pre-existing
    `AC-20260827-03-3` test that was already going to fail at its own `ok` sub-case regardless.
- Repair round 1 (plugin-tests, tests/genesis/design-state.test.js): closed the whitespace-drift
  finding above. `shellSyncedMock()` now builds its region by splicing `SHELL_CANON_APP` itself
  (`expectedInner()`/`syncedRegion()`, mirroring `tests/design-shell.test.js`'s
  `mockDeclaring()`/`syncedRegion()`) instead of re-typing the wrapper markup, so it is
  byte-consistent by construction and cannot drift again. Confirmed the ordering note above by
  keeping it: `AC-20260827-03-3`'s `noMock`/`failMatrix` sub-cases were given a passing
  `design/shell/app.html` (via `writeShellDir()`) in place, since the shell-canon check now runs
  before `hasApprovedMock()`/`check --matrix design/mocks` — no assert weakened, no script edited.
  `node --test tests/genesis/design-state.test.js tests/design-shell.test.js
  tests/design-atlas.test.js` is 33/33 green.
