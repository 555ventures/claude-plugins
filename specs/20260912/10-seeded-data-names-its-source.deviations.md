# Deviations — 20260912/10 seeded data names its source

- AC-20260912-10-5's target mark and pointer verb were corrected at build time per D7: the two
  tests/mocks/mocks-driver-seed-records.test.js cases now exercise `--mark journey-drawn` (the
  mark the journey-level record-hit check actually runs on) rather than `journey-approved`, and
  one carries the AC's `reuses` title verbatim (`journey-drawn refuses a journey whose every
  screen carries no seed record`) — both pin pre-existing, unchanged behaviour and are green
  against the current tree.
- ADR number taken at build: the File Plan's `docs/adr/0018-seeded-data-names-its-source.md` was
  claimed by a sibling (`0018-the-review-page-departs-from-its-spec.md`), so this build creates
  `docs/adr/0023-seeded-data-names-its-source.md` — the next free number — and the spec's File Plan
  row and assumption A5 were amended to it in the same build (A5's own remedy).
