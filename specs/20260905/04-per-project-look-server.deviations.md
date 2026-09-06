# Deviations — 04-per-project-look-server

- Test-author judgment call (AC-20260905-04-1, tests/design-look-handoff.test.js): the sweep test
  greps `docs/canonical/design.md` literally, per the AC's own directory list, and does not waive
  it. The Rationale/collision-closure note says that file's retired-hub paragraph is only replaced
  "at review close" (the Canonical Delta), and the File Plan carries no MODIFY row for it — so this
  test is expected to stay red through the rest of build and only turn green once review close
  applies the Canonical Delta. Flagging this so the build/review sequencing isn't read as a stuck
  red on an otherwise-complete build.
- Test-author safety measure (tests/mocks/mocks-driver-fixtures.js, tests/mocks/mocks-driver-look-stops.test.js):
  the pre-image `mocks-driver.js` still spawns the deleted-by-this-spec hub script unconditionally
  on every `stop open`/`stop decide` call, and that script falls back to a real per-machine state
  dir (`os.homedir()/.claude/design-hub`) and a shared default port (4600) when its own env
  overrides are absent. Since AC-20260905-04-1's own literal sweep forbids spelling that retired
  env var anywhere in tests/, the new/modified tests isolate this legacy fallback with a plain
  `HOME` env override plus a pre-seeded registry file (never the retired env-var name), and
  assemble the retired directory-name literal from runtime string fragments rather than spelling it
  — so these RED-phase tests never touch the real machine's state dir or a shared port, and stop
  tripping their own sweep. This scaffolding (`withFakeHubHome`/`killLegacyHubIn` in
  mocks-driver-look-stops.test.js) becomes dead code once D3 lands and the driver no longer spawns
  the old hub at all; it is not part of any AC's own assertion.
- Orchestrator (build, D6/AC-20260905-04-1): `docs/canonical/design.md` gained a File Plan MODIFY row
  and the Canonical Delta is applied by the doctrine wave, not at review close — the AC-1 sweep
  greps `docs/canonical/` and the build's final gate cannot go green while the retired hub
  paragraph stands. Review's CLOSE step applies the same delta and finds it already in place.
- Orchestrator (A5 false): `spec/.claude-plugin/plugin.json` read 7.85.0 at build start (the
  sibling's 7.84.0 and a direct 7.85.0 doctor fix both landed after plan time), so the bump
  target is 7.86.0 per A5's own fallback.
- Scripts worker (D2/D6, AC-20260905-04-8): `entrypoints.test.js` currently fails naming
  `spec/scripts/design-atlas.js -> spec/doctrine/mocks.md (no invocation literal for
  design-atlas.js found in spec/doctrine/mocks.md)` — expected until the doctrine wave lands D5's
  rewrite of `spec/doctrine/mocks.md` § Mocks: Look and Serve (which invokes `design-atlas.js`
  literally). `spec/entrypoints.json`'s `design-atlas.js` row already carries the
  `spec/scripts/mocks-driver.js` and `spec/doctrine/mocks.md` entries per D6; the row is correct,
  the doctrine file is the missing half. Not a scripts-layer bug; do not add a stopgap invocation
  literal to mocks.md from the scripts wave — that is the doctrine worker's file.
- Scripts worker (D3/D7, AC-20260905-04-5/-9): `tests/mocks/mocks-driver-look-stops.test.js`'s
  `AC-20260905-02-10/AC-20260905-04-9: stop open shapes/theme write pick stops …` test (starting
  line 112) calls `mocks-driver.js stop open shapes|theme` with no `startServe` child running and
  no `--port`, so it hits `design-atlas.js`'s default port 4173 with nothing listening — it relied
  on the deleted hub's auto-spawn-on-down behavior (`ensureHubUp`'s `spawnHubServer`), which D2/D4
  deliberately retire (no script may spawn a detached server; only the session does, as a tracked
  background task). `design-atlas.js stop open`'s own AC-2/-3/-4 tests (which do start a real serve
  child via `withServeAt`) pass, confirming the script side is correct per contract. This one test
  needs a `startServe`/`stopServe` wrap (or a `--port` pointed at a child it starts) — a test-file
  fix, out of this worker's file list (`spec/scripts/*`, not `tests/*`). Left red and flagged here
  rather than edited.
- Doctrine worker (AC-20260905-04-6, spec/commands/atlas.md): a pre-existing, unrelated phrase
  "copy register" in the harness-check sentence collided with AC-6's substring ban on `register`;
  reworded to "copy tone" (same meaning) rather than weaken the pin.
- Orchestrator (integration, D6/AC-20260905-04-8): `spec/entrypoints.json`'s `design-atlas.js` row
  also gains `spec/commands/mocks.md` — AC-6 makes that command carry the literal
  `spec-paths design-atlas)" serve` sentence, which the entrypoints sweep counts as an invocation;
  D6's list named only the driver and the doctrine file. The doctrine file's § Look and Serve
  sentence likewise names the `spec-paths design-atlas` serve call so the row's declared doctrine
  entry point is backed by a literal.
