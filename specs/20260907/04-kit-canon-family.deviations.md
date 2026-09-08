# Deviations — 04-kit-canon-family

- D12 targeted `spec/.claude-plugin/plugin.json` 7.98.0, but sibling specs in this same batch
  (plan/20260907/05-06, 07-08, and the 09 renumber) already spent 7.98.0 through 7.100.0 before
  this build reached the version bump; per the spec-pipeline Gotcha on stale literal version
  targets, this build bumped to the next free minor, **7.101.0**, instead.
- D4's Decisions-table cell shows each finding's `text` as `'<label>: region <n> carries neither
  data-kit nor data-bespoke — …'` (label-prefixed), but the spec's own Contracts block and every
  AC-20260907-04-4/-5/-12 test print the violation as `<file>: region <n> carries neither
  data-kit nor data-bespoke — …'` with NO label prefix — `diagnoseKitRegions`'s `text` fields
  (unabsorbed/unknown-kit/bespoke-unnamed) omit the label, matching `cmdCheck`'s existing
  `f + ': ' + fnd.text` convention (the same shape `diagnoseMock`'s shell findings already use)
  and the pinned AC tests verbatim.
- AC-20260907-04-1's test advances one root through two `advanceTo*` fixture helpers in sequence;
  the shared chain in `tests/mocks/mocks-driver-fixtures.js` re-ran the SEED/SHAPES stages and
  re-appended ledger rows P1..P13, tripping `parseLedger`'s duplicate-id check. Repaired at the
  fixture (every `advanceTo*` helper now returns early when its mark is already set) — a
  fixture-idempotency fix in a File Plan tests row, no Decision or script changed.
