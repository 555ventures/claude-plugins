# Deviations — 20260907/10-client-review

- Test authoring (tests-layer, this session): the tests-layer File Plan edits grew five existing
  test files (and the `tests` tree total) past `scripts/size-ratchet.js`'s tracked baseline —
  `tests/consistency/design-doctrine.test.js`, `tests/genesis/brief-state.test.js`,
  `tests/mocks/mocks-driver-3.test.js`, `tests/mocks/mocks-driver-look-stops-4.test.js`,
  `tests/mocks/mocks-notes.test.js`, and the `tests` tree entry. Raised each via
  `node scripts/size-ratchet.js --root . --raise <path> --to <n> --cite specs/20260907/10-client-review.md`
  per pipeline rules § Worker Rules "a mechanism pays its own size" — no implementation code
  touched.

- Red-check `unsanctioned-green` on `tests/genesis/brief-state.test.js` (this session, orchestrator
  ruling recorded as D15): the genesis `brief-written` refusal echoes whatever `state` string the
  fixture stamps, so the `THEME` → `CLIENT` fixture retag is green against the pre-image by
  construction — it is a currency fix, not a behavioral pin (D13's own rationale calls the fixture
  "stale from two specs back"). Removed the `AC-20260907-10-13` token from that file's test name and
  assert message (restoring `AC-20260902-08-4 / AC-20260906-02-9`), which is the pipeline-rules
  gotcha's sanctioned removal fix — never an invented ID, never a weakened assertion. AC-20260907-10-13's
  coverage is unaffected: `ac-matrix.js` greps the AC-ID across the union of the File Plan's tests
  rows, and the ID occurs in `tests/consistency/design-doctrine.test.js`, which is genuinely red.

- Scripts authoring (scripts-layer, this session): the D1-D11 implementation grew four existing
  files and the `spec/scripts`/`spec/scripts/lib` tree totals past `scripts/size-ratchet.js`'s
  tracked baseline — `spec/scripts/design-atlas.js`, `spec/scripts/lib/mocks-ledger.js`,
  `spec/scripts/lib/mocks-notes.js`, `spec/scripts/mocks-driver.js`, and the `spec/scripts`/
  `spec/scripts/lib` tree entries. Raised each via
  `node scripts/size-ratchet.js --root . --raise <path> --to <n> --cite specs/20260907/10-client-review.md`
  per pipeline rules § Worker Rules "a mechanism pays its own size" — the new
  `spec/scripts/lib/client-capture.js` file itself landed under its own floor with no raise
  needed.
