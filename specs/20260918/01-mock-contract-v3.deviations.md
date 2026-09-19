# Deviations — 01-mock-contract-v3

- D5's shared-fixture bump (tests/mocks/mock-app-fixtures.js: `contractOk()`, `defaultApproval()`,
  `defaultNotes()` all now report `contractVersion: 3`) collaterally reddens tests that only use
  those fixtures incidentally, not the two files this row names. Confirmed still red-not-crashed,
  no assertion weakened:
  - tests/mocks/mock-cli.test.js's own AC-20260914-01-2 tests (ENOENT/app-bin lookup, node-shebang
    resolution) — they hit `contractOrDie`'s mismatch refusal before reaching the behavior they
    pin, same as the rest of mock-cli.test.js.
  - tests/mocks/mock-driver-states.test.js's AC-20260914-01-4/5/6/12/15/23 and AC-20260917-01-*
    cases not owned by this spec — already documented in that file's own header comment as
    expected to ripple ahead of the rest of this build's File Plan rows.
  - tests/mocks/mock-driver-ledger.test.js and tests/genesis/genesis-mock-app.test.js — outside
    this spec's File Plan and outside this dispatch's assigned batch, so left untouched; both use
    `fx.contractOk()`/`mockApp.contractOk()` with no hardcoded version literal of their own, so
    they self-heal once spec/templates/mock/contract.json's own bump to contractVersion 3 (D1,
    a sibling File Plan row owned by the scripts layer) lands in the same wave.
  All of the above are expected to return to green the moment the full wave lands together; none
  required an assertion change to "pass" now.
