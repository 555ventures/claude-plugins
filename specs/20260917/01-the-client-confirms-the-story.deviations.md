# Deviations — 01-the-client-confirms-the-story

- AC-20260917-01-18 pins a sha256 of spec/doctrine/mocks.md § Provenance Ledger's POST-change
  body, which does not exist yet at test-authoring time. Computed the expected hash
  (`b4d1d346b0b44ee55c3abee4d9e7585fef50e23fe1654e409939c82adeccdc50`) by reconstructing the
  intended body offline: the pre-image section with its first sentence — "An `exclusion` row is
  derived, never hand-typed — `ledger add --kind exclusion` refuses, naming `ledger derive`." —
  replaced verbatim by D10's own quoted replacement, "An `exclusion` row is written by `--mark
  approved` from each deferred note (`note` = `deferred: <id>`); a hand-typed row passes through
  `ledger add`.", every other byte unchanged. The doctrine-authoring wave must land
  spec/doctrine/mocks.md § Provenance Ledger with exactly that substitution (first sentence
  only, rest of the section untouched) for the hash to match; if the landed wording differs the
  orchestrator reconciles the constant in tests/consistency/mocks-doctrine.test.js rather than
  weakening the assertion.

- tests/mocks/mock-driver-states.test.js's AC-20260917-01-9 test (`--mark approved`) leaves one
  sub-leg red that is a test-fixture gap, not a script defect: it sets `check.json` once via
  `stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' } }))` with `themes`
  left at `checkOk()`'s default `[]`, then later (after `--reopen theme`) calls `--mark
  theme-picked` again expecting it to succeed. D6/AC-20260917-01-8 requires `check --json`'s
  `config.theme` to be listed under `themes` (verified passing on its own dedicated test) — the
  same check this driver already ran pre-image. Since `themes` is never set to include `'warm'`
  anywhere in the AC-9 fixture, the re-pick leg cannot pass under D6 as written; this is a missing
  `themes: ['warm']` override in the test's own stub setup for that leg, not a Decision I can
  satisfy without editing the test file (out of this worker's file list — mocks-driver.js is
  scripts, the test is tests/plugin-tests territory). Left the driver's D6 check unmodified;
  flagging for the orchestrator/tests worker to add `themes: ['warm']` to that `stub.setCheck`
  call.

- Resolved (orchestrator): the AC-20260917-01-9 fixture gap above was fixed in place by the
  tests worker — `stub.setCheck(fx.checkOk({ config: {..., theme: 'warm'}, themes: ['warm'] }))`.
  No assertion weakened, no Decision changed; the driver's D6 check stands as locked.

- `docs/adr/0028-the-mock-is-the-app.md` is edited outside the File Plan: one header line,
  `Amended by: —` → a backlink naming ADR-0029. D10 requires the new ADR to amend ADR-0028 and
  the house convention (ADR-0027) carries amendment backlinks on the amended ADR, so the
  backlink is part of the CREATE row's obligation; scope-reconcile will report the path
  out-of-plan and this bullet is its waive.
