# Deviations — 01-the-mock-contract-and-the-driver

- The Decisions/Contracts leave `design/mocks/seed.md`'s `## Records` entity-list line syntax
  unspecified (only "entities map to `src/records/<entity>.ts`"). The test fixtures
  (`tests/mocks/mock-app-fixtures.js` `writeSeed`) and the AC-5/AC-16/AC-24 tests write one
  bare `- <entity>` line per entity under `## Records`; the seed-done implementation must parse
  that exact shape (or the fixture is amended to match, never the assertion weakened).
- AC-7's ledger-gate assertion ("no ledger gate" on journey-drawn) is proved by appending one
  hand-typed `open`/`invented` row to `design/mocks/ledger.md` directly rather than via `ledger
  add`, to isolate the assertion from the ledger CLI's own exit code — the row's exact column
  shape mirrors D16/AC-16's pinned row format.
- Orchestrator (red-check): the fixture helper's comment named a carried AC by literal ID, which made red-check
  expect the helper file itself red (`unsanctioned-green`); the comment now names the mock-cli test instead.
- Orchestrator (red-check): the AC-18 `rewrites` pointer named the retired pin's old test title, which the
  authoring wave renamed to carry the new AC-ID; the pointer now names the renamed test.
- Orchestrator (A5 falsified): four survivor tests outside the File Plan still drove the retired driver path
  (`client-walk-route`, `exclusions-route` via the deleted fixtures' old `--mark seed-done`; `notes-reanchor` via
  the retired `notes address` verb; `wire-register` via the deleted fixtures module). Deleted per A5's locked
  remedy and added to the File Plan as DELETE rows; none was weakened.
- Orchestrator (whole-suite collisions outside the File Plan): the read-load section-list pin still listed
  § Design Atlas for `/spec:mocks` (updated in place per D14); the genesis-doctrine Authoring Rules pin still
  required two HTML-wireframe literals D12/D13 retire (those two literals retired, heading and shared-mocks
  pins kept); and deleting the retired driver tests orphaned 22 criteria across 13 done specs in the
  ac-drift sweep, each now tagged `[retired: specs/20260914/01-the-mock-contract-and-the-driver.md]`.
- Orchestrator (pre-existing red, user ruling 2026-09-14): the expiry pin over this repository counted any spec
  that merely mentions an AC-ID as its owner, so spec 02's `rewrites … ::` pointer at a done spec's test (landed
  with the plan lock) reddened it. `expire-tests.js` was already right (owners are defining AC bullets only);
  the pin now reads owners the same way via `lib/spec-sections.js`, plus one fixture test pinning that a
  pointer mention never holds a done spec's test open. Spec 02 was left untouched.
